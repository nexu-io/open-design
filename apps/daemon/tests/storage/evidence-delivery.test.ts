import { writeAppConfig } from '../../src/app-config.js';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import { enqueueObjectEvidence, evidenceStore, inheritFrozenAttachments, drainEvidence, reconcileTaskObjectReasons } from '../../src/services/evidence-delivery.js';
import type { ReportContext } from '../../src/langfuse-trace.js';

const context = (runId: string, projectId = 'project', conversationId = 'conversation'): ReportContext => ({
  projectId, conversationId, installationId: null, prefs: { metrics: true, content: true, artifactManifest: true },
  run: { runId, status: 'succeeded', startedAt: 1, endedAt: 2 },
  message: { messageId: runId, prompt: '', output: '' }, artifacts: [], eventsSummary: { toolCalls: 0, errors: 0, durationMs: 1 },
});
it('inherits frozen attachments only within the exact conversation and refuses ambiguous revisions', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'od-inherited-evidence-'));
  const entry = { identity: 'origin-message-identity', originMessageId: 'u1', source: 'user_upload' as const, source_path_hash: 'path-hash' };
  const target = { projectId: 'project', conversationId: 'conversation', runId: 'later-run' };
  const first = { objectClass: 'attachment' as const, id: 'att-first', filename: 'brief.txt', mime: 'text/plain', source: 'user_attachment', sourcePathHash: 'path-hash', body: Buffer.from('original bytes') };
  try {
    expect(await enqueueObjectEvidence(dir, context('empty'), [], 'strategy-task:empty')).toBe('not_required');
    expect((await evidenceStore(dir)).stats().jobs).toBe(0);
    await enqueueObjectEvidence(dir, context('first'), [first], 'strategy-task:first');
    first.body.fill(0);
    const inherited = await inheritFrozenAttachments(dir, target, [entry], []);
    expect(inherited[0]?.body?.toString()).toBe('original bytes');
    expect(inherited[0]?.id).not.toBe('att-first');
    expect(await inheritFrozenAttachments(dir, { ...target, conversationId: 'other' }, [entry], [])).toEqual([]);
    expect(await inheritFrozenAttachments(dir, { ...target, projectId: 'other' }, [entry], [])).toEqual([]);
    await enqueueObjectEvidence(dir, context('conflicting'), [{ ...first, body: Buffer.from('different revision') }], 'strategy-task:conflicting');
    expect(await inheritFrozenAttachments(dir, target, [entry], [])).toEqual([]);
  } finally { (await evidenceStore(dir)).close(); await rm(dir, { recursive: true, force: true }); }
});

it('publishes late object receipts and Task summary together across every stage', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'od-late-task-receipts-'));
  vi.stubEnv('OPEN_DESIGN_TELEMETRY_RELAY_URL', 'https://telemetry.example.test/api/langfuse');
  vi.stubEnv('OPEN_DESIGN_VELA_TELEMETRY', 'off');
  vi.stubEnv('OPEN_DESIGN_OBJECT_OUTBOX_MODE', 'send');
  try {
    await writeAppConfig(dir, { telemetry: { metrics: true, content: true, artifactManifest: true } });
    const store = await evidenceStore(dir);
    for (const runId of ['request', 'production']) {
      await enqueueObjectEvidence(dir, { ...context(runId), traceObjectSummary: { new_file_count: 1, modified_file_count: 0, recovered_file_count: 0, candidate_file_count: 1, uploaded_file_count: 0, skipped_file_count: 1, skip_reasons: { unavailable: 1 } } }, [{ objectClass: 'artifact', id: runId, filename: 'index.html', mime: 'text/html', source: 'run_artifact', body: Buffer.from(runId) }], 'strategy-task:late');
      store.checkpointReceipt('object', `run:${runId}`, { completeness: 'complete', artifactManifest: [{ artifact_id: runId, object_class: 'artifact', status: 'ok', stored_in_open_design: true, storage_ref: `synthetic:${runId}` }] });
    }
    // A root trace may publish a failure before the outbox ever publishes anything.
    reconcileTaskObjectReasons(store, 'strategy-task:late', { trace_object_summary: { skip_reasons: { authorization_failed: 1 } } });
    const sent: Array<{ batch: Array<{ body: { metadata: Record<string, unknown> } }> }> = [];
    await drainEvidence(dir, (async (_url, init) => {
      sent.push(JSON.parse(String(init?.body)));
      return new Response('{}', { status: 202 });
    }) as typeof fetch);
    expect(sent).toHaveLength(2);
    for (const request of sent) expect(request.batch[0]?.body.metadata).toMatchObject({
      manifest_completeness: 'complete', artifact_manifest: expect.arrayContaining([{ artifact_id: 'production', object_class: 'artifact', status: 'ok', stored_in_open_design: true, storage_ref: 'synthetic:production' }, { artifact_id: 'request', object_class: 'artifact', status: 'ok', stored_in_open_design: true, storage_ref: 'synthetic:request' }]),
      trace_object_summary: { candidate_file_count: 2, new_file_count: 2, uploaded_file_count: 2, skipped_file_count: 0, skip_reasons: { authorization_failed: 0 } },
    });
    expect(store.inspect('object', 'run:request')?.status).toBe('uploaded');
  } finally { vi.unstubAllEnvs(); (await evidenceStore(dir)).close(); await rm(dir, { recursive: true, force: true }); }
});

it('clears historical skip reasons after recovery for receivers that deep-merge metadata', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'od-task-reason-recovery-'));
  vi.stubEnv('OPEN_DESIGN_TELEMETRY_RELAY_URL', 'https://telemetry.example.test/api/langfuse');
  vi.stubEnv('OPEN_DESIGN_VELA_TELEMETRY', 'off');
  vi.stubEnv('OPEN_DESIGN_OBJECT_OUTBOX_MODE', 'send');
  try {
    await writeAppConfig(dir, { telemetry: { metrics: true, content: true, artifactManifest: true } });
    const store = await evidenceStore(dir);
    for (const runId of ['first', 'second']) await enqueueObjectEvidence(dir, context(runId), [{ objectClass: 'artifact', id: runId, filename: 'index.html', mime: 'text/html', source: 'produced_file', body: Buffer.from(runId) }], 'strategy-task:recovery');
    const receipt = (runId: string) => ({ completeness: 'complete', artifactManifest: [{ artifact_id: runId, object_class: 'artifact', status: 'ok', stored_in_open_design: true, storage_ref: `synthetic:${runId}` }] });
    store.checkpointReceipt('object', 'run:first', receipt('first'));
    const published: Array<Record<string, unknown>> = [];
    const fetchImpl = (async (_url, init) => {
      published.push(JSON.parse(String(init?.body)).batch[0].body.metadata.trace_object_summary);
      return new Response('{}', { status: 202 });
    }) as typeof fetch;
    await drainEvidence(dir, fetchImpl);
    expect(published.at(-1)?.skip_reasons).toEqual({ unavailable: 1 });
    store.checkpointReceipt('object', 'run:second', receipt('second'));
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 60_000);
    await drainEvidence(dir, fetchImpl);
    expect(published.at(-1)).toMatchObject({ uploaded_file_count: 2, skipped_file_count: 0, skip_reasons: { unavailable: 0 } });
  } finally { vi.restoreAllMocks(); vi.unstubAllEnvs(); (await evidenceStore(dir)).close(); await rm(dir, { recursive: true, force: true }); }
});
