/**
 * 组件 22 · 重连 · S29 —— **发送那一路**(`streamViaDaemon`)的重连梯子。
 *
 * 为什么单独一条:已有的重连测试(`daemon-sse-dead-daemon.test.ts`、
 * `daemon-sse-reconnect-backoff.test.ts`)全部走 `reattachDaemonRun`。可用户
 * 在输入框敲一句然后回车,走的是 `streamViaDaemon`(先 `POST /api/runs`,
 * 再消费那条流)。那一路的 `onReconnect` 从来没有被端到端量过 —— 而排查
 * 2026-09-03 那次「断网了屏幕上一个字都没有」时,**第一件要排除的就是它**。
 *
 * 结论是它没坏:socket 真的被网络掐断时,这一路如实数到 5/5 再交回给人。
 * 所以那次真机上没出那一行,不是因为这条梯子断了,而是因为**它压根没上膛** ——
 * daemon 在本机回环上,页签断网没有掐断那条流。另一半探测(浏览器自己报的
 * `offline`)在 `tests/components/ProjectView.offline-reconnect.test.tsx`。
 *
 * 这条留着当**回归钉**:发送那一路的读数一旦哑掉,断网时连兜底都没有了。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DAEMON_STREAM_RECONNECT_LIMIT,
  streamViaDaemon,
  type DaemonReconnectState,
} from '../../src/providers/daemon';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const FIRST_EVENT = 'id: 1\nevent: stdout\ndata: {"chunk":"hello"}\n\n';

/**
 * 那条流被网络掐断时的真实形状:第一帧正常到达,之后 `reader.read()` **拒绝**。
 * 不用 `ReadableStream.error()` 造 —— 那条路会往流自己的内部 promise 上再抛一次,
 * 在测里表现成一条与被测代码无关的 unhandled rejection。
 */
function sseThenNetworkDrop(): Response {
  const encoder = new TextEncoder();
  let sentFirstFrame = false;
  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: async () => {
          if (!sentFirstFrame) {
            sentFirstFrame = true;
            return { value: encoder.encode(FIRST_EVENT), done: false };
          }
          throw new TypeError('Failed to fetch');
        },
        cancel: () => {},
      }),
    },
    text: async () => FIRST_EVENT,
  } as unknown as Response;
}

function createdRunResponse(): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ runId: 'run-1' }),
    text: async () => '{"runId":"run-1"}',
  } as unknown as Response;
}

describe('streamViaDaemon · 流被网络掐断时的重连读数', () => {
  it('counts every attempt and then hands the row back to the user', async () => {
    vi.useFakeTimers();
    const states: DaemonReconnectState[] = [];
    let eventsCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/runs') return createdRunResponse();
      if (url.includes('/events')) {
        eventsCalls += 1;
        // 第一次是活的:吐一个运行事件,然后网断了。
        if (eventsCalls === 1) return sseThenNetworkDrop();
        // 之后每一次请求都出不了这个页签。
        throw new TypeError('Failed to fetch');
      }
      // 运行状态兜底也一样出不去 —— 所以「这一轮到底怎么样了」谁也答不上来,
      // 只能按掉线走完预算再交回给人。
      throw new TypeError('Failed to fetch');
    });
    vi.stubGlobal('fetch', fetchMock);

    const settled = streamViaDaemon({
      agentId: 'mock',
      userMessageId: '1',
      history: [{ id: '1', role: 'user', content: 'hello' }],
      signal: new AbortController().signal,
      handlers: {
        onDelta: () => {},
        onDone: () => {},
        onError: () => {},
        onAgentEvent: () => {},
        onReconnect: (state) => { states.push(state); },
      },
    }).catch(() => {});

    await vi.advanceTimersByTimeAsync(180_000);
    await settled;

    expect(
      states.filter((s) => s.phase === 'reconnecting').map((s) => s.attempt),
      '发送那一路的读数哑掉 = 断网时屏幕上一个字都没有',
    ).toEqual([1, 2, 3, 4, 5]);
    // 22-3:预算用尽,停止自动重连,把事交回给人。
    expect(states.at(-1)).toEqual({
      attempt: DAEMON_STREAM_RECONNECT_LIMIT,
      max: DAEMON_STREAM_RECONNECT_LIMIT,
      phase: 'exhausted',
    });
  });
});
