import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { enqueueObjectEvidence, evidenceStore, inheritFrozenAttachments } from '../../src/services/evidence-delivery.js';
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
