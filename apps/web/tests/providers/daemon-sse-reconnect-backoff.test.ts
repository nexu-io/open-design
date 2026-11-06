/**
 * 红测(S29 后续):掉线重连必须**等**,不能把 5 次预算在同一个 tick 里烧光。
 *
 * 交付稿第 82 格画的是一行「正在重新连接 N/5」——那是给人看的读数。可
 * `consumeDaemonRun` 的重连循环里 `catch { reconnects += 1; continue; }` 一句
 * 退避都没有:连接被拒的 fetch 大约 1ms 就 reject,于是五次尝试在几毫秒内跑完,
 * 用户永远看不到那一行,只会看到终局的「连接失败」。
 *
 * 两个后果,都不是审美问题:
 *  · 合了盖子、切了 Wi-Fi 这种几秒钟就自愈的抖动,会被判成不可恢复;
 *  · 那一行等于白画。
 *
 * 同一个仓库里 `providers/project-events.ts` 和 `state/projects.ts` 都用
 * `lib/backoff.ts` 的 `BackoffController` 退避过了,这条流只是漏了。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { reattachDaemonRun } from '../../src/providers/daemon';

function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as unknown as Response;
}

describe('掉线重连要退避,不许一个 tick 烧完预算', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
  });

  it('第一次失败之后要等,不会立刻发第二次', async () => {
    const eventsCalls: string[] = [];
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      const u = typeof url === 'string' ? url : url.toString();
      if (u.includes('/events')) {
        eventsCalls.push(u);
        throw new TypeError('Failed to fetch');
      }
      // 还在跑 —— 状态兜底不许替重连做终局判断
      return jsonResponse({ status: 'running', exitCode: null, signal: null });
    }) as unknown as typeof globalThis.fetch;

    const attempts: number[] = [];
    const controller = new AbortController();
    const settled = reattachDaemonRun({
      runId: 'backoff-run',
      signal: controller.signal,
      handlers: {
        onDelta: () => {},
        onDone: () => {},
        onError: () => {},
        onAgentEvent: () => {},
        onReconnect: (state) => {
          if (state.phase === 'reconnecting') attempts.push(state.attempt);
        },
      },
      onRunStatus: () => {},
    });

    // 让所有已就绪的微任务跑完,但**不推进时钟**。
    await vi.advanceTimersByTimeAsync(0);

    expect(eventsCalls.length, '不等就重连 = 预算白给').toBe(1);
    expect(attempts).toEqual([1]);

    // 推进时钟之后才允许有第二次。
    await vi.advanceTimersByTimeAsync(5_000);
    expect(eventsCalls.length).toBeGreaterThan(1);

    controller.abort();
    await settled.catch(() => {});
  });

  it('五次预算跨越的时间要够人看见那一行(> 1s)', async () => {
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      const u = typeof url === 'string' ? url : url.toString();
      if (u.includes('/events')) throw new TypeError('Failed to fetch');
      return jsonResponse({ status: 'running', exitCode: null, signal: null });
    }) as unknown as typeof globalThis.fetch;

    let exhausted = false;
    const controller = new AbortController();
    const settled = reattachDaemonRun({
      runId: 'backoff-run-2',
      signal: controller.signal,
      handlers: {
        onDelta: () => {},
        onDone: () => {},
        onError: () => {},
        onAgentEvent: () => {},
        onReconnect: (state) => {
          if (state.phase === 'exhausted') exhausted = true;
        },
      },
      onRunStatus: () => {},
    });

    await vi.advanceTimersByTimeAsync(1_000);
    expect(exhausted, '1 秒内就放弃 = 那一行没人读得到').toBe(false);

    await vi.advanceTimersByTimeAsync(120_000);
    expect(exhausted).toBe(true);

    controller.abort();
    await settled.catch(() => {});
  });
});
