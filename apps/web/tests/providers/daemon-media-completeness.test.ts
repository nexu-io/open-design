import { afterEach, describe, expect, it, vi } from 'vitest';
import { reattachDaemonRun } from '../../src/providers/daemon';

afterEach(() => vi.unstubAllGlobals());
describe('daemon terminal completeness reaches the message before completion', () => {
  it.each([true, false])('forwards unfinished=%s from SSE', async (endedWithUnfinishedWork) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      `event: end\ndata: ${JSON.stringify({ status: 'succeeded', code: 0, endedWithUnfinishedWork })}\n\n`,
    )));
    const onRunCompleteness = vi.fn();
    const onError = vi.fn();
    await reattachDaemonRun({
      runId: 'run', signal: new AbortController().signal, onRunCompleteness,
      handlers: { onAgentEvent: vi.fn(), onDelta: vi.fn(), onError, onDone: () => {
        expect(onRunCompleteness).toHaveBeenCalledWith(endedWithUnfinishedWork);
      } },
    });
    expect(onRunCompleteness).toHaveBeenCalledWith(endedWithUnfinishedWork);
    expect(onError).not.toHaveBeenCalled();
  });
});
