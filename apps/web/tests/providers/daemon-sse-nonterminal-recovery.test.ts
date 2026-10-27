import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DAEMON_STREAM_RECONNECT_LIMIT,
  reattachDaemonRun,
  type DaemonReconnectState,
} from '../../src/providers/daemon';
import {
  nextChatReconnectView,
  type ChatReconnectView,
} from '../../src/runtime/chat/reconnect-state';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function frame(id: number, event: string, data: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

describe('S29 recovery while the resumed run stream remains open', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it.each([
    { type: 'thinking_delta', kind: 'thinking' },
    { type: 'text_delta', kind: 'text' },
  ])('clears transport recovery on resumed $kind before a terminal event', async ({ type, kind }) => {
    const reconnectObserved = deferred();
    const outputObserved = deferred();
    const states: DaemonReconnectState[] = [];
    let view: ChatReconnectView | null = null;
    let streamSettled = false;
    let liveController!: ReadableStreamDefaultController<Uint8Array>;
    const liveBody = new ReadableStream<Uint8Array>({
      start(controller) { liveController = controller; },
    });
    const disconnectedBody = new ReadableStream<Uint8Array>({
      start(controller) { controller.close(); },
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(disconnectedBody))
      .mockResolvedValueOnce(new Response(liveBody));
    vi.stubGlobal('fetch', fetchMock);
    const onDone = vi.fn();
    const onError = vi.fn();
    const onAgentEvent = vi.fn((event: { kind: string; text?: string }) => {
      if (event.kind === kind && event.text === 'resumed output') outputObserved.resolve();
    });
    const running = reattachDaemonRun({
      runId: 's29-open-stream',
      signal: new AbortController().signal,
      handlers: {
        onDelta: vi.fn(),
        onDone,
        onError,
        onAgentEvent,
        onReconnect(state) {
          states.push(state);
          view = nextChatReconnectView(view, {
            kind: 'transport',
            runId: 's29-open-stream',
            conversationId: 's29-conversation',
            ...state,
          });
          if (state.phase === 'reconnecting') reconnectObserved.resolve();
        },
      },
    }).finally(() => { streamSettled = true; });

    try {
      await reconnectObserved.promise;
      expect(view).toMatchObject({ reason: 'transport', attempt: 1, exhausted: false });
      // First backoff is at most 700 ms. Advancing just this interval does
      // not fire the live stream's idle deadline or exhaust the retry budget.
      await vi.advanceTimersByTimeAsync(700);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      liveController.enqueue(new TextEncoder().encode(': keepalive\n\n'));
      await vi.advanceTimersByTimeAsync(0);
      expect(states.map((state) => state.phase)).toEqual(['reconnecting']);
      expect(view).not.toBeNull();

      liveController.enqueue(frame(1, 'agent', { type, delta: 'resumed output' }));
      // Wait for the real provider to translate and dispatch business output,
      // not for EOF, a terminal status, or a guessed wall-clock delay.
      await outputObserved.promise;
      expect(onAgentEvent).toHaveBeenCalledWith({ kind, text: 'resumed output' });
      expect(streamSettled).toBe(false);
      expect(onDone).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(states.at(-1)).toEqual({
        attempt: 0,
        max: DAEMON_STREAM_RECONNECT_LIMIT,
        phase: 'cleared',
      });
      expect(view).toBeNull();
    } finally {
      // Terminal cleanup is deliberately after the decisive assertions. It
      // must never be the event that makes the recovery assertion pass.
      liveController.enqueue(frame(2, 'end', { status: 'succeeded', code: 0 }));
      liveController.close();
      await running;
    }
  });
});
