// @vitest-environment jsdom
/**
 * 早期那一行要**带着自己的计时起点**上屏 —— 光有文件名不算数,秒表必须在走。
 *
 * 产品红线(2026-09-04):「调用前(流式传输时)就要显示在界面上**并开始计时**,
 * 绝对不能调用完了才出现在界面上」。
 *
 * daemon 那半边的红绿在 `apps/daemon/tests/runtimes/w136-early-row-clock-origin.test.ts`。
 * 本文件守 web 这半边两件事:
 *
 *  1. **传输层不许把起点吃掉。** `tool_input_target` 现在带 `startedAt`
 *     (契约 `packages/contracts/src/sse/chat.ts`),`providers/daemon.ts` 那条
 *     分支原来只读 `id` / `name` / `path` —— 起点在客户端门口就被丢了。
 *  2. **`Edit` 那一档的行必须在走秒。** `Edit` / `MultiEdit` / `NotebookEdit` /
 *     `replace` 在途算不出 `−M`,所以 `tool_input_progress` 一条都不发 ——
 *     `tool_input_target` 是它们**唯一**的早期事件。起点没带过来,
 *     `build-turn-blocks` 的 `spanElapsed(undefined, liveEndMs)` 返回 null,
 *     行上那一格秒数是空的:文件名在,秒表不走。
 *
 * ── 为什么落定之后那一行的秒数也归这一条管 ──────────────────────────
 *
 * `dropSupersededInFlightToolUses` 把早期形态的 `startedAt` **搬**给结算行。
 * 没有可搬的,结算行就退回 `emitAgentEvent` 出口盖的时刻 —— 那是**入参传完**的
 * 一刻,整段流式传输被排除在外。真机 2026-09-04 实测(claude 2.1.260,27458
 * 字节入参)那一段是 94.1 秒,行上却只剩落盘的零点几秒。用户报的正是这个:
 * 「跑了 59.5s 屏幕上什么都没有,结束后蹦出一行 0.1s」。
 *
 * ⚠️ **不新增任何文案**:耗时走已有的 `formatElapsed`,行本身就是最终那一行
 * 减去 `+N −M`(那一格要入参传完才算得出来)。
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import type { ReactElement } from 'react';

import { AssistantMessage } from '../../../src/components/AssistantMessage';
import { I18nProvider } from '../../../src/i18n';
import { reattachDaemonRun } from '../../../src/providers/daemon';
import { __resetUpstreamActivity } from '../../../src/runtime/chat/upstream-activity';
import { IN_FLIGHT_TOOL_INPUT_MARKER } from '../../../src/runtime/tool-events';
import type { AgentEvent, ChatMessage } from '../../../src/types';

const RUN_ID = 'w136-0000-0000-0000-000000000001';
const T0 = 1_788_000_000_000;
const TOOL_ID = 'toolu_01W136EarlyRowClockOrigin';
const FILE_PATH = '/repo/scratchpad/parchment-typography.html';

/* ── SSE 录音夹(照抄 w120-inflight-write-line-count.test.tsx)──────────── */

function sseEvent(id: number, event: string, data: Record<string, unknown>): string {
  return `id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

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

const renderTurn = (ui: ReactElement) => render(<I18nProvider initial="zh-CN">{ui}</I18nProvider>);

/**
 * `Edit` 那一档的早期形态:只有路径和起点,**没有** `od_diff_stat`
 * (在途算不出 `−M`)。这就是 `tool_input_target` 落到 web 之后的形状。
 */
function inFlightEdit(startedAt: number | undefined): AgentEvent {
  return {
    kind: 'tool_use',
    id: TOOL_ID,
    name: 'Edit',
    input: { file_path: FILE_PATH, [IN_FLIGHT_TOOL_INPUT_MARKER]: true },
    ...(startedAt === undefined ? {} : { startedAt }),
  } as AgentEvent;
}

function turn(events: AgentEvent[]): ChatMessage {
  return {
    id: 'm-1',
    role: 'assistant',
    content: '',
    runId: RUN_ID,
    runStatus: 'running',
    createdAt: T0,
    events,
  } as ChatMessage;
}

/**
 * 这一次调用的那**一行**(不是外面那只执行记录壳)。
 *
 * ⚠️ 必须先定位到行再取格子:壳头自己也有一格耗时(`formatShellElapsed`,粗一档),
 * 在整个 container 上找 `[class*="meta"]` 会先撞到它 —— 于是「行上没有秒数」这条
 * 会被壳头的秒数假冒成绿。
 */
function toolRow(container: HTMLElement): HTMLElement | null {
  const file = container.querySelector('[class*="_file_"]');
  const row = file?.closest('[class*="_tool_"]');
  return row instanceof HTMLElement ? row : null;
}

/** 行上耗时那一格的文字;找不到或是空槽返回 null。 */
function elapsedText(container: HTMLElement): string | null {
  const nodes = Array.from(toolRow(container)?.querySelectorAll('[class*="meta"]') ?? []);
  const withText = nodes.map((n) => n.textContent ?? '').filter((t) => t.trim().length > 0);
  return withText.length > 0 ? withText.join('|') : null;
}

describe('W136 · 早期那一行的计时起点(web)', () => {
  describe('传输层', () => {
    let live: ReturnType<typeof makeLiveStream>;
    let abort: AbortController;
    let frameId = 6000;
    let agentEvents: AgentEvent[];

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
      __resetUpstreamActivity();
      live = makeLiveStream();
      abort = new AbortController();
      frameId = 6000;
      agentEvents = [];
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL) => {
          const url = String(input);
          if (url.startsWith(`/api/runs/${RUN_ID}/events`)) return streamResponse(live.reader);
          throw new Error(`unexpected fetch ${url}`);
        }),
      );
      void reattachDaemonRun({
        runId: RUN_ID,
        signal: abort.signal,
        handlers: {
          onDelta: () => {},
          onAgentEvent: (ev: AgentEvent) => { agentEvents.push(ev); },
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

    async function frame(data: Record<string, unknown>, ms = 200): Promise<void> {
      live.push(sseEvent((frameId += 1), 'agent', data));
      await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
    }

    it('tool_input_target 把起点带过门口', async () => {
      await frame({
        type: 'tool_input_target',
        id: TOOL_ID,
        name: 'Edit',
        path: FILE_PATH,
        startedAt: T0,
      });

      const calls = agentEvents.filter((e) => e.kind === 'tool_use');
      expect(calls, '早期那一行根本没进来').toHaveLength(1);
      const early = calls[0] as { input: Record<string, unknown>; startedAt?: number };
      expect(early.input).toEqual({
        file_path: FILE_PATH,
        [IN_FLIGHT_TOOL_INPUT_MARKER]: true,
      });
      expect(
        early.startedAt,
        '起点在客户端门口被丢了 —— Edit 那一档没有别的事件能补,秒表永远不走',
      ).toBe(T0);
    });

    it('反向:起点不是数字的帧,行照样上屏(只是没有秒表)', async () => {
      await frame({
        type: 'tool_input_target',
        id: TOOL_ID,
        name: 'Edit',
        path: FILE_PATH,
        startedAt: 'soon',
      });
      const calls = agentEvents.filter((e) => e.kind === 'tool_use');
      expect(calls, '脏起点把整行连坐掉了 —— 宁可没有秒表,也不能没有行').toHaveLength(1);
      expect(
        (calls[0] as { startedAt?: unknown }).startedAt,
        '脏起点被原样收下了',
      ).toBeUndefined();
    });

    /**
     * ⚠️ 整条链上最关键的一条 —— 用户划的红线,和他真机报的那个 59.5s。
     *
     * 事件全部走**真的传输层**进来,不手搭形状 —— 手搭就绕过了「起点在门口被丢掉」
     * 这个缺陷本身,这一条会假绿。
     *
     * 量的是**调用还在跑的那一刻**:入参已经流了 59.5 秒,`tool_use` 还没落地。
     * 屏幕上必须已经有这一行,而且秒表读到 59.5s。今天这里是空的 ——
     * 「跑了 59.5s 屏幕上什么都没有」。
     *
     * ⚠️ 不去断言**落定之后**那一行读多少秒:写文件的结算行「改动量和耗时二选一」
     * 是既有的设计稿规则(`ToolRow.tsx` 的 `verb && row.file` 那一支),挂的是
     * `+N −M` 不是秒数。那条规则不归这一单改。
     */
    it('整条链:入参流到 59.5 秒时,行已经在屏幕上而且秒表读 59.5s', async () => {
      await frame({
        type: 'tool_input_target',
        id: TOOL_ID,
        name: 'Edit',
        path: FILE_PATH,
        startedAt: T0,
      });

      // 入参还在流:`tool_use` 一条都还没到,这正是用户盯着空屏幕的那 59.5 秒。
      expect(
        agentEvents.some((e) => e.kind === 'tool_use' && !((e as { input?: Record<string, unknown> }).input?.[IN_FLIGHT_TOOL_INPUT_MARKER])),
        '结算行已经到了 —— 这一条量的就不是「调用进行中」那一段了',
      ).toBe(false);

      vi.setSystemTime(T0 + 59_500);
      const { container } = renderTurn(
        <AssistantMessage message={turn(agentEvents)} streaming projectId="p1" />,
      );

      expect(
        container.textContent ?? '',
        '调用跑了 59.5 秒,屏幕上还没有这一行 —— 这就是红线本身',
      ).toContain('parchment-typography.html');
      expect(
        elapsedText(container),
        '行在了但秒表不走 —— 起点在门口被丢了',
      ).toBe('59.5s');
    });
  });

  describe('渲染层', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(T0 + 12_000);
      __resetUpstreamActivity();
    });
    afterEach(() => {
      cleanup();
      vi.useRealTimers();
    });

    it('Edit 的在途行上有文件名,也有秒数', () => {
      const { container } = renderTurn(
        <AssistantMessage message={turn([inFlightEdit(T0)])} streaming projectId="p1" />,
      );
      expect(container.textContent ?? '').toContain('parchment-typography.html');
      expect(
        elapsedText(container),
        '在途的行上没有秒数 —— 文件名在,秒表不走',
      ).toBe('12.0s');
    });

    it('秒数在客户端 tick,daemon 一条事件都没再推', async () => {
      const events = [inFlightEdit(T0)];
      const frozen = JSON.stringify(events);
      const { container } = renderTurn(
        <AssistantMessage message={turn(events)} streaming projectId="p1" />,
      );
      expect(elapsedText(container)).toBe('12.0s');

      await act(async () => { await vi.advanceTimersByTimeAsync(48_000); });

      expect(JSON.stringify(events), '事件数组变了 —— 这条测的就不是客户端 tick').toBe(frozen);
      expect(elapsedText(container), '秒数不走 —— 行上还是个静止的数字').toBe('1m 0s');
    });

    /**
     * 起点缺席时的样子 —— 这一条钉住「没有起点 = 没有秒表」这个因果,
     * 免得后人以为行上那格空是别的原因。
     */
    it('反证:起点缺席时行还在,但秒数那一格是空的', () => {
      const { container } = renderTurn(
        <AssistantMessage message={turn([inFlightEdit(undefined)])} streaming projectId="p1" />,
      );
      expect(container.textContent ?? '').toContain('parchment-typography.html');
      expect(
        elapsedText(container),
        '没有起点却算出了秒数 —— 那这一单的因果链就不成立',
      ).toBeNull();
    });
  });
});
