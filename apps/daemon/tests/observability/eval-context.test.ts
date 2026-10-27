import { createHash } from 'node:crypto';
import type { AttachmentManifestEntry } from '../../src/langfuse-trace.js';
import { describe, expect, it } from 'vitest';
import { attachmentContext, buildEvalContext, evidenceMode } from '../../src/observability/eval-context.js';
import { buildTracePayload, type ReportContext } from '../../src/langfuse-trace.js';

describe('eval-context/v2', () => {
  it('A-01 keeps product succeeded and reports structured delivery failure', () => {
    const context = buildEvalContext({ runStatus: 'succeeded', resultDeliveryState: 'no_result', toolErrorCount: 1, attachmentManifest: [], artifactManifest: [] });
    expect(context.productOutcome.runStatus).toBe('succeeded');
    expect(context.evaluationOutcome).toBe('failed');
  });
  it('keeps user cancellation distinct from failure and preserves unknown usage', () => {
    const context = buildEvalContext({ runStatus: 'canceled', resultDeliveryState: 'no_result', toolErrorCount: 0, attachmentManifest: [], artifactManifest: [], agentId: 'codex' });
    expect(context.productOutcome.runStatus).toBe('canceled');
    expect(context.evaluationOutcome).toBe('canceled');
    expect(context.usage.status).toBe('unavailable');
    expect(context.usage).not.toHaveProperty('turn');
  });
  it('A-03 has stable attachment identity across Runs and separates current increment', () => {
    const messages = [
      { id: 'u1', role: 'user', attachments: [{ path: 'image.png', sha256: 'a'.repeat(64), size: 12 }] },
      { id: 'a1', role: 'assistant' },
      { id: 'u2', role: 'user', attachments: [{ path: 'image.png', sha256: 'a'.repeat(64), size: 12 }, { path: 'image2.png' }] },
      { id: 'a2', role: 'assistant' },
    ];
    const first = attachmentContext(messages, 1, 'project');
    const second = attachmentContext(messages, 3, 'project');
    expect(first.turnDelta.entries).toHaveLength(1);
    expect(second.turnDelta.entries).toHaveLength(1);
    expect(second.effectiveContext.entries).toHaveLength(2);
    expect(second.effectiveContext.entries[0]).toEqual(first.effectiveContext.entries[0]);
    expect(JSON.stringify(second)).not.toContain('image.png');
  });
  it('A-08 cumulative Codex usage is never turn usage', () => {
    const context = buildEvalContext({ runStatus: 'succeeded', toolErrorCount: 0, attachmentManifest: [], artifactManifest: [], agentId: 'codex', usage: { inputTokens: 10000 } });
    expect(context.usage.status).toBe('unavailable');
    expect(context.usage.sessionCumulative).toEqual({ inputTokens: 10000 });
    expect(context.usage).not.toHaveProperty('turn');
  });
  it('A-11 off remains default; the exporter adds v2 only when explicitly provided', () => {
    expect(evidenceMode(undefined)).toBe('off');
    const base: ReportContext = {
      installationId: 'synthetic', projectId: 'synthetic', conversationId: 'synthetic',
      run: { runId: 'synthetic-run', status: 'succeeded', startedAt: 1000, endedAt: 2000 },
      message: { messageId: 'synthetic-message', prompt: 'synthetic request', output: 'synthetic answer' },
      artifacts: [], eventsSummary: { toolCalls: 0, errors: 0, durationMs: 1000 },
      prefs: { metrics: true, content: true },
    };
    const legacy = JSON.stringify(buildTracePayload(base));
    expect(legacy).not.toContain('eval_context_v2');
    const evalContextV2 = buildEvalContext({ runStatus: 'succeeded', resultDeliveryState: 'no_result', toolErrorCount: 0, attachmentManifest: [], artifactManifest: [] });
    expect(JSON.stringify(buildTracePayload({ ...base, evalContextV2 }))).toContain('eval_context_v2');
  });
});

it('binds attachment context to verified snapshot provenance, refusing ambiguous or conflicting objects', () => {
  const attachments = attachmentContext([{ id: 'u', role: 'user', attachments: [{ path: 'brief.txt', sha256: 'a'.repeat(64) }] }, { id: 'a', role: 'assistant' }], 1, 'project');
  const object = { source_path_hash: createHash('sha256').update('brief.txt').digest('hex'), sha256: 'sha256:' + 'a'.repeat(64), storage_ref: 'od://objects/exact', size_bytes: 12 } as AttachmentManifestEntry;
  const build = (attachmentManifest: AttachmentManifestEntry[]) => buildEvalContext({ runStatus: 'succeeded', resultDeliveryState: 'delivered', toolErrorCount: 0, attachments, attachmentManifest, artifactManifest: [] });
  expect(build([object]).attachments.effectiveContext.entries[0]).toMatchObject({ storage_ref: object.storage_ref, sha256: 'a'.repeat(64), size_bytes: 12 });
  expect(build([{ ...object, sha256: 'b'.repeat(64) }]).attachments.effectiveContext.entries[0]).not.toHaveProperty('storage_ref');
  expect(build([object, { ...object, storage_ref: 'od://objects/ambiguous' }]).attachments.effectiveContext.entries[0]).not.toHaveProperty('storage_ref');
});
