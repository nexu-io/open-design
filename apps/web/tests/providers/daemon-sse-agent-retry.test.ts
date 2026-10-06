/**
 * 红测:`run_retry_attempted` 已经到浏览器了,只是没人接。
 *
 * daemon 的 `emit`(`apps/daemon/src/runtimes/runs.ts`)对**每一条**记录都做
 * `for (const sse of run.clients) sse.send(event, data, id)` —— 分析事件和
 * start/agent/error/end 走的是同一条流。所以这条帧不需要 daemon 改任何东西,
 * 传输层这边加一个接口就够。
 *
 * 帧的形状逐字取自真机 `.od/runs/0e40b819-…/events.jsonl` 的第 12 条,
 * 只保留 UI 读的三个字段(其余是分析口径的字段,UI 不看)。
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import {
  reattachDaemonRun,
  type DaemonAgentReconnectState,
  type DaemonAgentRetryState,
} from '../../src/providers/daemon';

function enc(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function sseEvent(id: number, event: string, data: Record<string, unknown>): string {
  return `id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

type ReadResult = { value: Uint8Array; done: false } | { value: undefined; done: true };

function makeFiniteReader(chunks: Uint8Array[]) {
  let i = 0;
  return {
    read: (): Promise<ReadResult> => {
      if (i < chunks.length) {
        return Promise.resolve({ value: chunks[i++], done: false }) as Promise<ReadResult>;
      }
      return Promise.resolve({ value: undefined, done: true }) as Promise<ReadResult>;
    },
    cancel: () => Promise.resolve(),
  };
}

function streamResponse(reader: { read: () => Promise<unknown>; cancel: () => Promise<void> }): Response {
  return {
    ok: true,
    status: 200,
    body: { getReader: () => reader } as unknown as ReadableStream<Uint8Array>,
    text: () => Promise.resolve(''),
  } as unknown as Response;
}

function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as unknown as Response;
}

/** 真机第 12 条帧的 UI 相关字段。 */
const REAL_RETRY_FRAME = {
  retry_attempt_index: 1,
  retry_max_attempts: 1,
  retry_strategy: 'same_run_transient',
  retry_reason: 'transient_failure',
  retry_delay_ms: 368,
  failure_category: 'process_exit',
  failure_detail: 'fatal_rpc_error',
  agent_provider_id: 'amr',
};

describe('传输层把 run_retry_attempted 转成 UI 读数', () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = originalFetch; });

  async function runStream(frames: string[]): Promise<DaemonAgentRetryState[]> {
    const reader = makeFiniteReader(frames.map(enc));
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      const u = typeof url === 'string' ? url : url.toString();
      if (u.includes('/events')) return streamResponse(reader);
      return jsonResponse({ status: 'succeeded', exitCode: 0, signal: null });
    }) as unknown as typeof globalThis.fetch;

    const seen: DaemonAgentRetryState[] = [];
    await reattachDaemonRun({
      runId: 'retry-run',
      signal: new AbortController().signal,
      handlers: {
        onDelta: () => {},
        onDone: () => {},
        onError: () => {},
        onAgentEvent: () => {},
        onAgentRetry: (state) => { seen.push(state); },
      },
    });
    return seen;
  }

  it('这一帧变成一条 retrying 读数,带上第几次 / 共几次', async () => {
    const seen = await runStream([
      sseEvent(1, 'start', { bin: 'amr' }),
      sseEvent(2, 'error', { code: 'AGENT_EXIT_130', message: 'json-rpc id 2: …' }),
      sseEvent(3, 'run_retry_attempted', REAL_RETRY_FRAME),
      sseEvent(4, 'end', { status: 'succeeded', code: 0 }),
    ]);
    expect(seen[0]).toEqual({ attempt: 1, max: 1, phase: 'retrying' });
  });

  // 重跑真的接上了 = 第二次尝试吐出了第一段可见输出。撤那一行的正当时机就是这里,
  // 不是 `start`(3 秒后就到了,而真机上第一个 token 还要再等 30 秒)。
  it('第二次尝试吐出第一段文字时把那一行撤掉', async () => {
    const seen = await runStream([
      sseEvent(1, 'run_retry_attempted', REAL_RETRY_FRAME),
      sseEvent(2, 'start', { bin: 'amr' }),
      sseEvent(3, 'stdout', { chunk: 'hello' }),
      sseEvent(4, 'end', { status: 'succeeded', code: 0 }),
    ]);
    expect(seen.map((s) => s.phase)).toEqual(['retrying', 'cleared']);
  });

  it('重跑之后只有 start、还没有输出时,那一行留着', async () => {
    const seen = await runStream([
      sseEvent(1, 'run_retry_attempted', REAL_RETRY_FRAME),
      sseEvent(2, 'start', { bin: 'amr' }),
      sseEvent(3, 'end', { status: 'failed', code: 1 }),
    ]);
    expect(seen.map((s) => s.phase)).toEqual(['retrying']);
  });

  it('一条重试帧都没有的普通流不发任何读数', async () => {
    const seen = await runStream([
      sseEvent(1, 'start', { bin: 'amr' }),
      sseEvent(2, 'stdout', { chunk: 'hi' }),
      sseEvent(3, 'end', { status: 'succeeded', code: 0 }),
    ]);
    expect(seen).toEqual([]);
  });
});

describe('agent upstream reconnect becomes one ephemeral UI reading', () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('reports progress, suppresses the status row, then clears on visible output', async () => {
    const reader = makeFiniteReader([
      enc(sseEvent(1, 'agent', { type: 'status', label: 'agent_reconnecting', detail: '2/5' })),
      enc(sseEvent(2, 'stdout', { chunk: 'back' })),
      enc(sseEvent(3, 'end', { status: 'succeeded', code: 0 })),
    ]);
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      const u = typeof url === 'string' ? url : url.toString();
      if (u.includes('/events')) return streamResponse(reader);
      return jsonResponse({ status: 'succeeded', exitCode: 0, signal: null });
    }) as unknown as typeof globalThis.fetch;

    const reconnects: DaemonAgentReconnectState[] = [];
    const agentEvents: unknown[] = [];
    await reattachDaemonRun({
      runId: 'reconnect-run',
      signal: new AbortController().signal,
      handlers: {
        onDelta: () => {},
        onDone: () => {},
        onError: () => {},
        onAgentEvent: (event) => { agentEvents.push(event); },
        onAgentReconnect: (state) => { reconnects.push(state); },
      },
    });

    expect(reconnects).toEqual([
      { attempt: 2, max: 5, phase: 'reconnecting' },
      { attempt: 0, max: 0, phase: 'cleared' },
    ]);
    expect(agentEvents).not.toContainEqual({
      kind: 'status',
      label: 'agent_reconnecting',
      detail: '2/5',
    });
  });
});
