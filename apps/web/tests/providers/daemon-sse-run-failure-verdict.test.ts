/**
 * SSE `end` 帧要把 daemon 的裁决(`retryable` / `failureAction`)带出来。
 *
 * 报错卡读的是那条持久化的 `status:error` 事件,而那条事件的字段全部来自
 * `onError` 收到的错误对象 —— 也就是 `markErrorRunFailure` 盖上去的那几个。
 * 今天它只盖 `failureCategory` / `failureDetail`,于是
 * `amr-guidance.ts` 里那条「后端说重试没用就降档」的分支恒不成立。
 *
 * 三档:带且不可重试 / 带且可重试 / 老 daemon 完全不带(必须**一个字段都不长出来**,
 * 否则 `daemonFailureVerdictFrom` 会把「我们问了,答案是没有」误读成一个裁决)。
 */
import { describe, expect, it, afterEach, beforeEach, vi } from 'vitest';

import { reattachDaemonRun } from '../../src/providers/daemon';

type ReadResult = { value: Uint8Array; done: false } | { value: undefined; done: true };

function enc(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function sseEvent(id: number, event: string, data: Record<string, unknown>): string {
  return `id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

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

function streamResponse(reader: {
  read: () => Promise<unknown>;
  cancel: () => Promise<void>;
}): Response {
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

type SurfacedError = Error & {
  code?: string;
  failureCategory?: string;
  failureDetail?: string;
  retryable?: boolean;
  failureAction?: string;
};

/** Drive one failed run whose terminal `end` frame carries `endPayload`. */
async function failedRunEndingWith(
  endPayload: Record<string, unknown>,
): Promise<SurfacedError | null> {
  const reader = makeFiniteReader([
    enc(sseEvent(1, 'start', { bin: 'claude' })),
    enc(
      sseEvent(2, 'end', {
        code: 1,
        signal: null,
        status: 'failed',
        ...endPayload,
      }),
    ),
  ]);
  const fetchMock = vi.fn(async (url: string | URL | Request) => {
    const u = typeof url === 'string' ? url : url.toString();
    if (u.includes('/events')) return streamResponse(reader);
    return jsonResponse({}, 404);
  });
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

  let surfaced: SurfacedError | null = null;
  const controller = new AbortController();
  await reattachDaemonRun({
    runId: 'run-verdict',
    signal: controller.signal,
    handlers: {
      onDelta: () => {},
      onDone: () => {},
      onError: (err) => {
        surfaced = err as SurfacedError;
      },
      onAgentEvent: () => {},
    },
    onRunStatus: () => {},
  });
  return surfaced;
}

describe('SSE end frame carries the daemon failure verdict', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('档 1 · 后端命名且不可重试 → retryable:false / failureAction:"none" 到达 onError', async () => {
    const err = await failedRunEndingWith({
      failureCategory: 'process_exit',
      failureDetail: 'spawn_enoexec',
      retryable: false,
      failureAction: 'none',
    });
    expect(err).not.toBeNull();
    expect(err!.failureDetail).toBe('spawn_enoexec');
    // `false` 是假值:任何 `if (fields.x)` 形状的守卫都会在这里把它吃掉。
    expect(err!.retryable).toBe(false);
    expect(err!.failureAction).toBe('none');
  });

  it('档 2 · 后端命名但可重试 → retryable:true / failureAction:"retry" 到达 onError', async () => {
    const err = await failedRunEndingWith({
      failureCategory: 'upstream_unavailable',
      failureDetail: 'upstream_5xx',
      retryable: true,
      failureAction: 'retry',
    });
    expect(err).not.toBeNull();
    expect(err!.retryable).toBe(true);
    expect(err!.failureAction).toBe('retry');
  });

  it('档 3 · 老 daemon 不带这两个字段 → 错误对象上一个都不长出来', async () => {
    const err = await failedRunEndingWith({
      failureCategory: 'process_exit',
      failureDetail: 'spawn_enoexec',
    });
    expect(err).not.toBeNull();
    expect(err!.failureDetail).toBe('spawn_enoexec');
    // 用 `in` 精确钉住「属性不存在」,不用 `toBeUndefined()`:
    // 一个被显式赋成 undefined 的属性也能通过后者。
    expect('retryable' in err!).toBe(false);
    expect('failureAction' in err!).toBe(false);
  });
});
