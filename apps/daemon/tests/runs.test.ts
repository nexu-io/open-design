import { describe, expect, it, vi } from 'vitest';

import { createChatRunService } from '../src/runs.js';

function createRunsService() {
  return createChatRunService({
    createSseResponse: () => ({
      send: () => undefined,
      end: () => undefined,
      cleanup: () => undefined,
    }),
    createSseErrorPayload: (code: string, message: string, init?: unknown) => ({
      code,
      message,
      init,
    }),
    ttlMs: 5,
  });
}

describe('runs queueing + cancel semantics', () => {
  it('keeps the second run queued while the first is starting', async () => {
    const runs = createRunsService();
    const conversationId = 'conv_1';

    const started: string[] = [];
    let releaseRun1: (() => void) | undefined;
    const run1 = runs.create({ conversationId });
    const run2 = runs.create({ conversationId });

    runs.enqueue(run1, async (run: any) => {
      run.status = 'running';
      started.push(run.id);
      await new Promise<void>((resolve) => {
        releaseRun1 = resolve;
      });
      runs.finish(run, 'succeeded', null, null);
    });
    runs.enqueue(run2, async (run: any) => {
      run.status = 'running';
      started.push(run.id);
      runs.finish(run, 'succeeded', null, null);
    });

    // Run 1 should start immediately; run 2 must stay queued until the queue is drained.
    await vi.waitFor(() => {
      expect(started).toEqual([run1.id]);
    });
    expect(run1.status).toBe('running');
    expect(run2.status).toBe('queued');

    // Finishing run 1 does not automatically drain the queue anymore.
    if (releaseRun1) releaseRun1();
    await vi.waitFor(() => {
      expect(run1.status).toBe('succeeded');
    });
    expect(started).toEqual([run1.id]);
    expect(run2.status).toBe('queued');

    // The queue drains only when an external trigger calls maybeStartNext.
    runs.maybeStartNext(conversationId);
    await vi.waitFor(() => {
      expect(started).toEqual([run1.id, run2.id]);
    });
    expect(run2.status).toBe('succeeded');
  });

  it('cancel() transitions a preflight run to canceled (no child/acpSession)', async () => {
    const runs = createRunsService();
    const run = runs.create({ conversationId: 'conv_3' }) as any;

    // Simulate the enqueue preflight window where _isStarting is true but
    // child/acpSession are not wired yet.
    run._isStarting = true;
    run.status = 'running';
    run.child = null;
    run.acpSession = null;

    runs.cancel(run);
    await vi.waitFor(() => {
      expect(run.status).toBe('canceled');
    });
    expect(run._isStarting).toBe(false);
  });
});

