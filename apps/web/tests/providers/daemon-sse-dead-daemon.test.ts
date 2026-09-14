/**
 * 红测(S29):**daemon 真的死了**的时候,组件 22 · 重连那一行必须长出来。
 *
 * 为什么已有的测试全绿而真机一次都没出过那一行 —— 它们只演了两种断法:
 *
 *   · `sse.test.ts`  用 `sseResponse('')`:200 + 空 body,即「连上了但什么也没来」
 *   · `daemon-sse-reconnect-backoff.test.ts`  用 `throw new TypeError('Failed to fetch')`
 *
 * 两种都能走到 `noteReconnectAttempt()`。可真机上浏览器和 daemon 之间**永远隔着一层代理**
 * (dev 是 `next.config.ts` 的 rewrite,打包版是 `apps/web/sidecar/server.ts` 的
 * `proxyHttpRequest`),于是 `kill -9` 之后客户端看到的根本不是那两种形状。
 * 本机实测(2026-08-27,Next 16 dev rewrite + 一个可杀的上游):
 *
 *   A. **流中途上游死掉 → 代理把客户端那条响应一直挂着。** curl 只在自己 `-m 30`
 *      超时才退出(exit 28),上游死后 27 秒里没有 EOF、没有错误。也就是说
 *      `await reader.read()` 既不 resolve 也不 reject —— 消费循环**停在那一行**,
 *      后面所有重连代码一句都跑不到。这正是「壳头还写着 Working、既没重连行也没报错」。
 *
 *   B. **上游死透之后再发请求 → 代理回 500 `Internal Server Error`(text/plain)。**
 *      打包版那条代理回的是 502(`server.ts:562`)。两者都落进
 *      `if (!resp.ok) { clearReconnect(); onError(...); return; }` —— 直接收摊,
 *      一次 `onReconnect` 都不发。
 *
 * 所以这个文件测的是**传输层到状态机那一段接线**,不是 reducer:信号一律从
 * `reattachDaemonRun` 的 `onReconnect` 出来,再喂进 `nextChatReconnectView`,
 * 断言屏幕上那一行的读数。reducer 自己的边界在 `runtime/chat/reconnect-state.test.ts`。
 *
 * 第三条是**反向对照**:一条安静但活着的流(只有 25s 一次的 keepalive)推进两分钟,
 * 一次重连都不许报。没有它,「无条件显示」也能把前两条弄绿。
 */
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

const RUN_ID = 'dead-daemon-run';
const CONV_ID = 'conv-dead';

/** daemon 的运行状态兜底:这一轮还在跑,所以重连不该被判成终局。 */
function runningStatusResponse(): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({ status: 'running', exitCode: null, signal: null }),
    text: () => Promise.resolve('{"status":"running"}'),
  } as unknown as Response;
}

/**
 * 代理在上游死掉之后回的那一份。**没有 daemon 的 JSON 错误信封** —— 这正是
 * 「没人替 daemon 答话」的证据(daemon 自己报错永远走 `sendApiError` 的
 * `{error:{code,...}}`,见 `apps/daemon/src/http/api-errors.ts`)。
 */
function deadProxyResponse(status: number): Response {
  return {
    ok: false,
    status,
    headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? 'text/plain; charset=utf-8' : null) },
    json: () => Promise.reject(new Error('not json')),
    text: () => Promise.resolve('Internal Server Error'),
  } as unknown as Response;
}

/** 一条正常吐了一个运行事件、然后干净关掉的流。 */
function sseResponseOnce(text: string): Response {
  const encoder = new TextEncoder();
  return {
    ok: true,
    status: 200,
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(text));
        controller.close();
      },
    }),
    text: () => Promise.resolve(text),
  } as unknown as Response;
}

/**
 * 代理挂住的那种流:吐一个运行事件之后**永远不再有动静,也永远不关**。
 * 这就是 A 那条实测 —— `reader.read()` 挂在那里,不 resolve 也不 reject。
 */
function sseResponseThatHangs(text: string): Response {
  const encoder = new TextEncoder();
  return {
    ok: true,
    status: 200,
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(text));
        // 刻意不 close()、不 error() —— 代理正是这样把响应一直挂着的。
      },
    }),
    text: () => Promise.resolve(text),
  } as unknown as Response;
}

/**
 * 一条**活着但安静**的流:按 daemon 的心跳约定(`SSE_KEEPALIVE_INTERVAL_MS = 25s`)
 * 每 25 秒吐一个注释帧,永远不关。反向对照用。
 */
function sseResponseWithHeartbeat(intervalMs: number): Response {
  const encoder = new TextEncoder();
  return {
    ok: true,
    status: 200,
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('id: 1\nevent: stdout\ndata: {"chunk":"hi"}\n\n'));
        setInterval(() => {
          controller.enqueue(encoder.encode(': keepalive\n\n'));
        }, intervalMs);
      },
    }),
    text: () => Promise.resolve(''),
  } as unknown as Response;
}

const FIRST_EVENT = 'id: 1\nevent: stdout\ndata: {"chunk":"hello"}\n\n';

interface Harness {
  states: DaemonReconnectState[];
  /** 传输层的信号一路推到屏幕上那一行的读数。 */
  view: () => ChatReconnectView | null;
  abort: () => void;
  settled: Promise<void>;
}

function startReattach(): Harness {
  const states: DaemonReconnectState[] = [];
  let view: ChatReconnectView | null = null;
  const controller = new AbortController();

  const settled = reattachDaemonRun({
    runId: RUN_ID,
    signal: controller.signal,
    handlers: {
      onDelta: () => {},
      onDone: () => {},
      onError: () => {},
      onAgentEvent: () => {},
      onReconnect: (state) => {
        states.push(state);
        // 接线的另一半:传输层的原话原样喂给状态机,读数由它说了算。
        view = nextChatReconnectView(view, {
          kind: 'transport',
          runId: RUN_ID,
          conversationId: CONV_ID,
          attempt: state.attempt,
          max: state.max,
          phase: state.phase,
        });
      },
    },
    onRunStatus: () => {},
  }).catch(() => {});

  return { states, view: () => view, abort: () => controller.abort(), settled };
}

describe('daemon 死了的时候,重连那一行必须出得来', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
  });

  it('代理在上游死后回 500,要当成掉线重连,不是 daemon 的终局报错', async () => {
    let eventsCalls = 0;
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      const u = typeof url === 'string' ? url : url.toString();
      if (u.includes('/events')) {
        eventsCalls += 1;
        // 第一次是活的:吐一个运行事件然后连接断开。之后 daemon 已经死透,
        // 代理替它回 500 —— 真机实测的形状。
        if (eventsCalls === 1) return sseResponseOnce(FIRST_EVENT);
        return deadProxyResponse(500);
      }
      return runningStatusResponse();
    }) as unknown as typeof globalThis.fetch;

    const h = startReattach();
    await vi.advanceTimersByTimeAsync(120_000);
    await h.settled;

    const reconnecting = h.states.filter((s) => s.phase === 'reconnecting').map((s) => s.attempt);
    expect(reconnecting, '500 被当成终局报错 = 那一行一次都不出').toEqual([1, 2, 3, 4, 5]);
    expect(h.states.at(-1)).toEqual({
      attempt: DAEMON_STREAM_RECONNECT_LIMIT,
      max: DAEMON_STREAM_RECONNECT_LIMIT,
      phase: 'exhausted',
    });
    // 22-3:预算用尽换成〔重新连接〕交回给人。
    expect(h.view()).toMatchObject({ reason: 'transport', exhausted: true, max: DAEMON_STREAM_RECONNECT_LIMIT });
  });

  it('打包版代理回的 502 同样是掉线,不是终局报错', async () => {
    let eventsCalls = 0;
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      const u = typeof url === 'string' ? url : url.toString();
      if (u.includes('/events')) {
        eventsCalls += 1;
        if (eventsCalls === 1) return sseResponseOnce(FIRST_EVENT);
        return deadProxyResponse(502);
      }
      return runningStatusResponse();
    }) as unknown as typeof globalThis.fetch;

    const h = startReattach();
    await vi.advanceTimersByTimeAsync(120_000);
    await h.settled;

    expect(h.states.filter((s) => s.phase === 'reconnecting').length).toBeGreaterThan(0);
    expect(h.view()).not.toBeNull();
  });

  it('代理把响应挂住(不给 EOF 也不报错)时,不能就这么停在 read() 上', async () => {
    /*
     * 这一条**单独**验「读超时」这一个机制,所以后续的重连一律用**已经支持的**
     * 那种失败形状(fetch 抛错)。这样它只会因为缺读超时而红,不会顺带把
     * 「非 2xx 要不要算断线」也搅进来 —— 两个机制各红各的,才照得出是哪一个在起作用。
     */
    let eventsCalls = 0;
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      const u = typeof url === 'string' ? url : url.toString();
      if (u.includes('/events')) {
        eventsCalls += 1;
        // 第一条流吐一个事件之后永远挂着 —— 上游死了,代理不肯收尾。
        if (eventsCalls === 1) return sseResponseThatHangs(FIRST_EVENT);
        throw new TypeError('Failed to fetch');
      }
      return runningStatusResponse();
    }) as unknown as typeof globalThis.fetch;

    const h = startReattach();
    // 推两分钟。daemon 的心跳是 25 秒一次,两分钟里一个字都没来 = 这条连接已经死了。
    await vi.advanceTimersByTimeAsync(120_000);

    expect(
      h.states.filter((s) => s.phase === 'reconnecting').length,
      '挂住的连接没有任何超时兜底 = 消费循环停在 read(),重连永远不会开始',
    ).toBeGreaterThan(0);
    expect(h.view()).not.toBeNull();

    // 只收工,不等它落地:这条流永远不关,而假时钟停了之后退避的 setTimeout
    // 也不会再走 —— 等下去只会把测试拖到超时。
    h.abort();
  });

  /*
   * 反向对照。没有这一条,「无条件报一次重连」也能把上面三条弄绿。
   */
  it('一条安静但活着的流(只有 keepalive)推进两分钟,一次重连都不许报', async () => {
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      const u = typeof url === 'string' ? url : url.toString();
      if (u.includes('/events')) return sseResponseWithHeartbeat(25_000);
      return runningStatusResponse();
    }) as unknown as typeof globalThis.fetch;

    const h = startReattach();
    await vi.advanceTimersByTimeAsync(120_000);

    expect(h.states, '健康的流报了重连 = 误报,比不显示更糟').toEqual([]);
    expect(h.view()).toBeNull();

    h.abort();
  });
});
