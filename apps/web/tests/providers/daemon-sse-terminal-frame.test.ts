import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StrategyTaskProjectionV2 } from '@open-design/contracts';

import { reattachDaemonRun } from '../../src/providers/daemon';

function frame(event: string, data: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

describe('daemon terminal SSE frames without transport EOF', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it.each(['succeeded', 'failed', 'canceled'] as const)(
    'settles a %s run as soon as end arrives, even if stream cancellation stalls',
    async (status) => {
      let controller!: ReadableStreamDefaultController<Uint8Array>;
      // A proxy can deliver the terminal frame but leave its response open.
      // Cancellation of that transport must not delay the authoritative verdict.
      const cancel = vi.fn(() => new Promise<void>(() => {}));
      const body = new ReadableStream<Uint8Array>({
        start(value) { controller = value; },
        cancel,
      });
      const fetchMock = vi.fn().mockResolvedValue(new Response(body));
      vi.stubGlobal('fetch', fetchMock);
      const onDone = vi.fn();
      const onError = vi.fn();
      const onRunStatus = vi.fn();
      const onArtifactPaths = vi.fn();
      let settled = false;
      const running = reattachDaemonRun({
        runId: 'terminal-frame-run',
        signal: new AbortController().signal,
        onRunStatus,
        onArtifactPaths,
        handlers: { onDelta: vi.fn(), onAgentEvent: vi.fn(), onDone, onError },
      }).finally(() => { settled = true; });

      try {
        controller.enqueue(frame('stdout', { chunk: 'The animation is ready.' }));
        controller.enqueue(frame('end', {
          status, code: status === 'failed' ? 1 : 0,
          artifactCount: 1, artifactPaths: ['animation.mp4'],
        }));
        controller.enqueue(new TextEncoder().encode(': keepalive\n\n'));
        // Flush processing without waiting for the idle deadline or closing
        // the response: neither is part of the run-completion protocol.
        await vi.advanceTimersByTimeAsync(0);

        expect(settled).toBe(true);
        expect(onRunStatus).toHaveBeenCalledExactlyOnceWith(status);
        expect(onArtifactPaths).toHaveBeenCalledExactlyOnceWith(['animation.mp4']);
        if (status === 'failed') {
          expect(onError).toHaveBeenCalledExactlyOnceWith(expect.any(Error));
          expect(onDone).not.toHaveBeenCalled();
        } else {
          expect(onDone).toHaveBeenCalledExactlyOnceWith('The animation is ready.');
          expect(onError).not.toHaveBeenCalled();
        }
        expect(cancel).toHaveBeenCalledOnce();
        // Closing the response is not a server-side cancel or a reconnect.
        expect(fetchMock).toHaveBeenCalledOnce();
      } finally {
        if (!cancel.mock.calls.length) controller.close();
        await running;
      }
    },
  );

  it('follows the next physical run before the previous transport closes', async () => {
    const nextTask: StrategyTaskProjectionV2 = {
      taskExecutionId: 'animation-task',
      strategy: {
        id: 'od-next-strategy', version: '2.0.6',
        packageHash: 'a'.repeat(64), snapshotId: 'animation-snapshot',
      },
      inputStage: 'request', outcome: 'running', route: 'full_plan',
      executionMode: null, activeRunId: 'production-run', terminal: false,
    };
    const completedTask: StrategyTaskProjectionV2 = {
      ...nextTask, outcome: 'completed', terminal: true,
    };
    const controllers: ReadableStreamDefaultController<Uint8Array>[] = [];
    const cancellations = [
      vi.fn(() => new Promise<void>(() => {})),
      vi.fn(() => Promise.reject(new Error('transport cleanup failed'))),
    ];
    const responses = cancellations.map(cancel => new Response(new ReadableStream<Uint8Array>({
      start(controller) { controllers.push(controller); }, cancel,
    })));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(responses[0])
      .mockResolvedValueOnce(responses[1]);
    vi.stubGlobal('fetch', fetchMock);
    const onDone = vi.fn();
    const onError = vi.fn();
    const onRunCreated = vi.fn();
    const onStrategyTaskSettled = vi.fn();
    const running = reattachDaemonRun({
      runId: 'planning-run', signal: new AbortController().signal,
      onRunCreated, onStrategyTaskSettled,
      handlers: { onDelta: vi.fn(), onAgentEvent: vi.fn(), onDone, onError },
    });

    try {
      controllers[0]!.enqueue(frame('stdout', { chunk: 'Plan ready. ' }));
      controllers[0]!.enqueue(frame('end', { status: 'succeeded', code: 0, strategyTask: nextTask }));
      await vi.advanceTimersByTimeAsync(0);
      expect(onRunCreated).toHaveBeenCalledExactlyOnceWith('production-run', nextTask);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(onDone).not.toHaveBeenCalled();
      expect(onStrategyTaskSettled).not.toHaveBeenCalled();

      controllers[1]!.enqueue(frame('stdout', { chunk: 'Animation ready.' }));
      controllers[1]!.enqueue(frame('end', { status: 'succeeded', code: 0, strategyTask: completedTask }));
      await vi.advanceTimersByTimeAsync(0);
      expect(onDone).toHaveBeenCalledExactlyOnceWith('Plan ready. Animation ready.');
      expect(onStrategyTaskSettled).toHaveBeenCalledExactlyOnceWith(completedTask);
      expect(onError).not.toHaveBeenCalled();
      expect(cancellations[0]).toHaveBeenCalledOnce();
      expect(cancellations[1]).toHaveBeenCalledOnce();
    } finally {
      controllers.forEach((controller, index) => {
        if (!cancellations[index]!.mock.calls.length) {
          // Let the baseline also finish cleanup if handoff never happened.
          if (index === 1) controller.enqueue(frame('end', {
            status: 'succeeded', code: 0, strategyTask: completedTask,
          }));
          controller.close();
        }
      });
      await running;
    }
  });
});
