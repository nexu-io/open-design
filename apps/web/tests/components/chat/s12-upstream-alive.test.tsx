// @vitest-environment jsdom
/**
 * S12 的静默探测**在上游一直吐帧的时候也照报静默**(真机复现的 bug)。
 *
 * ⚠️ **2026-08-27 断言换了落点,场景一条没动。** 这个文件原来问的是壳头那句
 * 「上游响应慢，已等 N 秒」说得对不对;那句文案当天被产品撤回了(裁决原文在
 * `components/chat/ExecutionShell.tsx` 的 `head` 注释里,**只撤展现、探测全留**)。
 * 撤的是界面,不是这个文件要守的东西 —— 这里守的一直是**探测本身**:传输层记没记下
 * 「上游给过我们东西」,以及那个时刻有没有正确变成 `shell.quietMs`。
 * 所以每条用例的场景、真机数据、节奏全部保留,只把断言从「壳头写了什么」
 * 换成「`quietMs` 算成了什么」(见下面的 `quietMs()`),另外顺手钉住壳头
 * 现在**一直**是「进行中」。
 *
 * 这份文件是那条探测链的**结构性钉子**:壳头不再读 `quietMs` 之后,界面上再也看不出
 * 探测在不在,只有这里和 `s12-copy-revert.test.tsx` 会因为它被删掉而红。
 *
 * 真机证据 —— run `7ed15c2f-8ea0-4e55-b7e3-e463037dd868`(2026-08-27,claude,
 * 落盘 1357 行 `events.jsonl`)。壳头写着「上游响应慢，已等 156 秒」的那一刻,
 * 事件流里带时刻的事件确实停了 161.6 秒(最后一条 `tool_result` 在 +676.1s,
 * 下一条 `tool_use` 在 +837.7s),可**这 161.6 秒里落了 126 条帧**:
 * 124 条 `tool_input_delta` + 2 条 `tool_use`,平均 0.7 秒一条。用户当场问:
 * 「这个是真的上游响应慢吗 还是我们的什么解析 bug 啊?」
 *
 * 同一份 run 里这样的窗口有四个:305.2s / 87.6s / 161.6s / 70.9s,
 * 四个窗口里的真实最大静默分别只有 2.3s / 2.2s / 73.6s / 2.1s。
 *
 * 为什么现有那条到达时刻(`lastEventAtMs`,以 `displayEvents.length` 为钥匙)救不了:
 *  · `tool_input_delta` 在 `providers/daemon.ts` 记完心跳就被丢掉,
 *    **根本不会变成 `AgentEvent`**,更不会进 `message.events` —— 而它正是这个
 *    窗口里 124/126 的帧;
 *  · claude 的 `thinking_delta` 一律是空串(这条 run 里 414/414 条 `delta: ""`),
 *    `appendBufferedAgentDeltas` 的 `if (thinkingDelta)` 把空串挡掉,
 *    事件数组连**引用都不换**;
 *  · 就算 thinking 带了字,连续的 thinking / text 会被 `appendCoalescedAgentEvent`
 *    合进**最后一条**,长度同样不涨。
 * 三条合起来:那把钥匙在整段流式期间纹丝不动。
 *
 * 所以这条测试**不自己捏 `lastEventAtMs`**,而是从真实传输层灌真实形状的帧,
 * 一路走到真实的 `AssistantMessage`,再从传输层那张表里把到达时刻**读回来**
 * (`quietMs()` 照抄 `useTickingNow` 的接法),问静默算成了什么。
 *
 * 正负成对(否则「不报」可以靠把 S12 关掉来通过):
 *  · 帧一直在落 → 静默必须一直贴近零;
 *  · 同一份 run 里那个真的 73.6 秒空档 → 静默必须真的涨过门槛;
 *  · 空档过去帧又回来 → 静默必须自己掉回零。
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';

import { AssistantMessage } from '../../../src/components/AssistantMessage';
import { SLOW_UPSTREAM_AFTER_MS } from '../../../src/components/chat/ExecutionShell';
import { I18nProvider } from '../../../src/i18n';
import { reattachDaemonRun } from '../../../src/providers/daemon';
import { buildTurnBlocks } from '../../../src/runtime/chat/build-turn-blocks';
import type { ExecutionShell as ShellData } from '../../../src/runtime/chat/contract';
import { __resetUpstreamActivity, upstreamActivityAt } from '../../../src/runtime/chat/upstream-activity';
import type { ChatMessage } from '../../../src/types';

const RUN_ID = '7ed15c2f-8ea0-4e55-b7e3-e463037dd868';
/** 假时钟起点。真机那一刻的绝对值不重要,重要的是窗口的长度。 */
const T0 = 1_787_809_851_233;

/* ── 真机帧形状(逐字抄自落盘 events.jsonl)──────────────────────────── */

/** +695.5s ~ +697.6s 那一串:模型正在把 Bash 的 heredoc 一段段吐出来 */
const TOOL_INPUT_DELTA = {
  type: 'tool_input_delta',
  id: 'toolu_01DFQiMMmGxH47qYFwRveeQ7',
  name: 'Bash',
  delta: ' { display: grid; place-items: center; padding: 48px 32px; }\n  ',
} as const;

/** claude 的推理增量:真机 414 条,**每一条**的 delta 都是空串 */
const EMPTY_THINKING_DELTA = { type: 'thinking_delta', delta: '' } as const;

/** SSE 帧:`id: N\nevent: E\ndata: {…}\n\n` */
function sseEvent(id: number, event: string, data: Record<string, unknown>): string {
  return `id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/* ── 一条「还开着」的 SSE 连接:测试自己决定什么时候放帧下来 ──────────── */

type ReadResult = { value: Uint8Array; done: false } | { value: undefined; done: true };

function makeLiveStream() {
  const queued: Uint8Array[] = [];
  let parked: ((r: ReadResult) => void) | null = null;
  return {
    push(text: string): void {
      const bytes = new TextEncoder().encode(text);
      if (parked) {
        const resolve = parked;
        parked = null;
        resolve({ value: bytes, done: false });
        return;
      }
      queued.push(bytes);
    },
    reader: {
      read: (): Promise<ReadResult> =>
        new Promise<ReadResult>((resolve) => {
          const next = queued.shift();
          if (next) {
            resolve({ value: next, done: false });
            return;
          }
          // 队列空 = 上游此刻没东西给我们。连接**没断**,就这么挂着 ——
          // 这正是「上游响应慢」要描述的那个状态。
          parked = resolve;
        }),
      cancel: () => Promise.resolve(),
    },
  };
}

function streamResponse(reader: { read: () => Promise<ReadResult>; cancel: () => Promise<void> }): Response {
  return {
    ok: true,
    status: 200,
    body: { getReader: () => reader } as unknown as ReadableStream<Uint8Array>,
    text: () => Promise.resolve(''),
  } as unknown as Response;
}

/* ── 被测消息:真机那一轮在 +676.1s 之后的样子 ─────────────────────── */

/**
 * 事件流里最后一条**带时刻**的事就是 +676.1s 那条 `tool_result`。
 * 之后 161.6 秒里落下来的全是不进 `message.events` 的帧,
 * 所以这个对象在整段窗口里**一次都不会变**(真机就是如此)。
 */
function streamingTurn(): ChatMessage {
  return {
    id: 'm-1',
    role: 'assistant',
    content: '',
    runId: RUN_ID,
    runStatus: 'running',
    createdAt: T0,
    events: [
      { kind: 'tool_use', id: 'toolu_01prev', name: 'Bash', input: { command: 'ls' }, startedAt: T0 },
      { kind: 'tool_result', toolUseId: 'toolu_01prev', content: 'ok', isError: false, completedAt: T0 },
    ],
  } as ChatMessage;
}

const renderTurn = (ui: ReactElement) => render(<I18nProvider initial="zh-CN">{ui}</I18nProvider>);

/* ── 探测链末端的读数 ───────────────────────────────────────────────── */

/**
 * 此刻这一轮的 `shell.quietMs` —— 也就是「上游多久没给过我们东西了」。
 *
 * 接线**逐字照抄** `AssistantMessage` 的 `useTickingNow` → `buildTurnBlocks`
 * 那一段(到达时刻取自传输层那张表,取不到就**不传**,让 `shellQuiet` 退回轮次开头),
 * 只是把结果拿出来断言,而不是画到界面上 —— 壳头 2026-08-27 起不再读它了。
 *
 * 走真函数而不是自己算差值:这样 `shellQuiet` 被删或被改坏时这里会红。
 */
function quietMs(message: ChatMessage): number | null {
  const lastEventAtMs = upstreamActivityAt(message.runId);
  const shell = buildTurnBlocks({
    events: message.events ?? [],
    runStatus: 'running',
    nowMs: Date.now(),
    ...(message.createdAt != null ? { startedAtMs: message.createdAt } : {}),
    ...(lastEventAtMs != null ? { lastEventAtMs } : {}),
  }).find((b): b is ShellData => b.kind === 'shell');
  return shell?.quietMs ?? null;
}

/* ── 测试 ─────────────────────────────────────────────────────────── */

describe('S12 · 上游一直在吐帧时不许说它慢', () => {
  let live: ReturnType<typeof makeLiveStream>;
  let abort: AbortController;
  let frameId = 1000;

  beforeAll(() => {
    const store = new Map<string, string>();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        clear: () => store.clear(),
        getItem: (k: string) => store.get(k) ?? null,
        removeItem: (k: string) => store.delete(k),
        setItem: (k: string, v: string) => store.set(k, v),
      },
    });
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    // 传输层那张表是进程级的,而每条用例都把假时钟拨回 T0 —— 不抹掉上一条留下的
    // 时刻,这一条会看到一个「来自未来」的到达时刻,静默算出负数,S12 被悄悄关掉。
    __resetUpstreamActivity();
    live = makeLiveStream();
    abort = new AbortController();
    frameId = 1000;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith(`/api/runs/${RUN_ID}/events`)) return streamResponse(live.reader);
        throw new Error(`unexpected fetch ${url}`);
      }),
    );
    // 真实传输层。handlers 照 ProjectView 的接法给 —— 就这四格。
    // `tool_input_delta` 没有任何 handler 槽位可接(那个死槽位已删,见
    // `tool-input-delta-dead-wiring.test.tsx`),它只在传输层记一笔心跳。
    void reattachDaemonRun({
      runId: RUN_ID,
      signal: abort.signal,
      handlers: {
        onDelta: () => {},
        onAgentEvent: () => {},
        onDone: () => {},
        onError: () => {},
      },
    }).catch(() => {});
  });

  afterEach(() => {
    abort.abort();
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  /** 放一帧下去,再让假时钟往前走 `ms`。 */
  async function frame(data: Record<string, unknown>, ms: number): Promise<void> {
    live.push(sseEvent((frameId += 1), 'agent', data));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  }

  async function idle(ms: number): Promise<void> {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  }

  it('161 秒里 124 条 tool_input_delta:静默必须贴着零,不许涨到门槛', async () => {
    const turn = streamingTurn();
    renderTurn(<AssistantMessage message={turn} streaming projectId="p1" />);
    await idle(0);

    // 真机节奏:平均 0.7 秒一条,124 条铺满 161.6 秒的窗口
    for (let i = 0; i < 124; i += 1) {
      await frame({ ...TOOL_INPUT_DELTA }, 1_300);
      // 60 秒门槛一过就该翻脸的正是这里,所以每一帧之后都问一次
      expect(quietMs(turn) ?? 0).toBeLessThan(SLOW_UPSTREAM_AFTER_MS);
    }

    // 「贴着零」不能靠把探测删成 `null` 来满足 —— 先钉住它真的算出来了
    expect(quietMs(turn), '`quietMs` 不见了 —— 探测被撤了,而裁决只让撤文案').not.toBeNull();
    // 撤回之后壳头只剩这一种样子 —— 无论静默多久
    expect(screen.getByText('进行中')).toBeTruthy();
    expect(screen.queryByText(/上游响应慢/)).toBeNull();
  });

  it('claude 的空推理增量同样算数 —— 它们是这条 run 里 414 条中的全部形态', async () => {
    const turn = streamingTurn();
    renderTurn(<AssistantMessage message={turn} streaming projectId="p1" />);
    await idle(0);

    // 真机 +100.5s → +405.7s 那个窗口:203 条空 thinking_delta,真实最大静默 2.3 秒
    for (let i = 0; i < 100; i += 1) {
      await frame({ ...EMPTY_THINKING_DELTA }, 1_500);
    }

    expect(quietMs(turn)).not.toBeNull();
    expect(quietMs(turn) ?? 0).toBeLessThan(SLOW_UPSTREAM_AFTER_MS);
    expect(screen.getByText('进行中')).toBeTruthy();
  });

  it('真的空了 73.6 秒(同一份 run 的 +697.6s → +771.2s)探测就照报', async () => {
    const turn = streamingTurn();
    renderTurn(<AssistantMessage message={turn} streaming projectId="p1" />);
    await idle(0);

    // 先让它活着 20 秒,证明报出来的不是「从轮次开头算」
    for (let i = 0; i < 15; i += 1) await frame({ ...TOOL_INPUT_DELTA }, 1_300);
    expect(quietMs(turn)).not.toBeNull();
    expect(quietMs(turn) ?? 0).toBeLessThan(SLOW_UPSTREAM_AFTER_MS);

    await idle(73_600);
    // 73.6 秒的空档必须原样出现在读数里,而不是被整轮耗时(此时已 93 秒)顶掉
    const quiet = quietMs(turn) ?? 0;
    expect(quiet).toBeGreaterThanOrEqual(SLOW_UPSTREAM_AFTER_MS);
    expect(quiet).toBeGreaterThan(73_000);
    expect(quiet).toBeLessThan(80_000);
    // 探测报了,界面照旧不说 —— 这正是「只撤展现」的意思
    expect(screen.getByText('进行中')).toBeTruthy();
    expect(screen.queryByText(/上游响应慢/)).toBeNull();
  });

  it('空档过去帧又回来:静默自己掉回零', async () => {
    const turn = streamingTurn();
    renderTurn(<AssistantMessage message={turn} streaming projectId="p1" />);
    await idle(0);

    await idle(73_600);
    expect(quietMs(turn) ?? 0).toBeGreaterThanOrEqual(SLOW_UPSTREAM_AFTER_MS);

    // +771.2s 那条:同一轮里换了个 tool id 重新开始吐
    await frame({ ...TOOL_INPUT_DELTA, id: 'toolu_01R3Qxj2r9HqQ8mTgFsoY6RQ', delta: '' }, 1_500);
    expect(quietMs(turn)).not.toBeNull();
    expect(quietMs(turn) ?? 0).toBeLessThan(SLOW_UPSTREAM_AFTER_MS);
    expect(screen.getByText('进行中')).toBeTruthy();
  });

  it('只有 daemon 的 keepalive 心跳时照报 —— 它证的是连接活着,不是上游在干活', async () => {
    const turn = streamingTurn();
    renderTurn(<AssistantMessage message={turn} streaming projectId="p1" />);
    await idle(0);

    const before = upstreamActivityAt(RUN_ID);

    // `apps/daemon/src/server.ts:2521` 逐字:`res.write(': keepalive\n\n')`
    for (let i = 0; i < 6; i += 1) {
      live.push(': keepalive\n\n');
      await idle(15_000);
    }

    // 心跳不许动那张表 —— 它一动,静默就被悄悄清零,S12 等于关掉了
    expect(upstreamActivityAt(RUN_ID)).toBe(before);
    expect(quietMs(turn) ?? 0).toBeGreaterThanOrEqual(SLOW_UPSTREAM_AFTER_MS);
  });

  it('一帧都没来过的那一轮照旧从轮次开头算(卡在首个 token,每月 5,547 次)', async () => {
    const turn = streamingTurn();
    renderTurn(<AssistantMessage message={turn} streaming projectId="p1" />);
    await idle(95_000);

    // 一帧都没来过 = 说不出到达时刻,静默只能退回轮次开头
    expect(upstreamActivityAt(RUN_ID)).toBeNull();
    expect(quietMs(turn) ?? 0).toBeGreaterThan(90_000);
  });

  /**
   * 规格 §2.2 点名的那批 agent —— `qwen` / `deepseek` / `grok-build` / `aider` /
   * `antigravity` / `atomcode`(plain-stream)与 `qoder` —— 整轮 `tool_use` 为 0,
   * 事件流里**一个带时刻的事件都没有**。它们只往 stdout 写字。
   *
   * 这条同时钉死「按事件条数算」为什么对它们也不成立:连续的 stdout 会被
   * `appendCoalescedAgentEvent` 合进**同一条** `text` 事件,所以第一块之后
   * 数组长度就再也不涨了 —— 下面顺手把这件事也断言出来。
   */
  it('不发工具事件的那批 agent(plain-stream)也认:stdout 一直在写就不许说它慢', async () => {
    const events: NonNullable<ChatMessage['events']> = [];
    /** `ProjectView.appendCoalescedAgentEvent` 对 text 的规则,逐条照抄 */
    const appendCoalescedText = (text: string): void => {
      const last = events[events.length - 1];
      if (last && last.kind === 'text') events[events.length - 1] = { ...last, text: last.text + text };
      else events.push({ kind: 'text', text });
    };

    const turn = (): ChatMessage => ({
      id: 'm-plain',
      role: 'assistant',
      content: events.map((e) => (e.kind === 'text' ? e.text : '')).join(''),
      runId: RUN_ID,
      runStatus: 'running',
      createdAt: T0,
      // 带时刻的事件一条都没有 —— 这正是这批 agent 的真相
      events: [...events],
    } as ChatMessage);

    const view = renderTurn(<AssistantMessage message={turn()} streaming projectId="p1" />);
    await idle(0);

    for (let i = 0; i < 90; i += 1) {
      live.push(sseEvent((frameId += 1), 'stdout', { chunk: `第 ${i} 段。` }));
      appendCoalescedText(`第 ${i} 段。`);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_500);
      });
      view.rerender(
        <I18nProvider initial="zh-CN">
          <AssistantMessage message={turn()} streaming projectId="p1" />
        </I18nProvider>,
      );
    }

    // 135 秒过去了,而「事件条数」这把钥匙从第一块之后就没再动过
    expect(events).toHaveLength(1);
    // 帧却一直在到 —— 探测认的是这个,所以静默贴着零
    expect(quietMs(turn())).not.toBeNull();
    expect(quietMs(turn()) ?? 0).toBeLessThan(SLOW_UPSTREAM_AFTER_MS);
    expect(screen.getByText('进行中')).toBeTruthy();
  });
});
