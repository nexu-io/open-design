// @vitest-environment jsdom
/**
 * ACP 的工具行要**一开始就在**,不是跑完才出现。
 *
 * daemon 那半边(第一帧就发 `tool_in_flight`、节流、目录不当路径)的红绿在
 * `apps/daemon/tests/acp-inflight-tool-rows.test.ts`,那边喂的是 12 个真实 AMR
 * session 导出的 911 帧。本文件守 web 这半边:
 *
 *  1. `tool_in_flight` 到了,行就在了 —— 工具名 + 秒表,**没有**文件名按钮;
 *  2. 后一帧带来真命令,**原地覆盖**,不是再画一行;
 *  3. 终态到了,还是**一行**,而且带上结果;
 *  4. 中间输出会出现在终端框里,而行**仍然是未完成态**(秒表还在走);
 *  5. 内部记号一个字符都不许出现在界面上。
 *
 * ⚠️ 记号和摘除逻辑复用 W115/W120 那一套(`IN_FLIGHT_TOOL_INPUT_MARKER` +
 * `dropSupersededInFlightToolUses`),没有第二套。第 2 条守的正是那个函数
 * 「按 id 留最后一条」的语义:留第一条的话,行会永远停在没有命令的那一版。
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import type { ReactElement } from 'react';

import { AssistantMessage } from '../../../src/components/AssistantMessage';
import { I18nProvider } from '../../../src/i18n';
import { reattachDaemonRun } from '../../../src/providers/daemon';
import { __resetUpstreamActivity } from '../../../src/runtime/chat/upstream-activity';
import {
  IN_FLIGHT_TOOL_INPUT_MARKER,
  IN_FLIGHT_TOOL_OUTPUT_KEY,
  dedupeToolUsesById,
  dropSupersededInFlightToolUses,
} from '../../../src/runtime/tool-events';
import { buildTurnBlocks } from '../../../src/runtime/chat/build-turn-blocks';
import type { ToolRow } from '../../../src/runtime/chat/contract';
import type { AgentEvent, ChatMessage } from '../../../src/types';

const RUN_ID = 'w123-0000-0000-0000-000000000001';
const T0 = 1_787_820_000_000;
const TOOL_ID = 'acp-7f3c91ed2b405610';
/**
 * 一条会跑很久的命令。
 *
 * ⚠️ 故意**不用**真语料里那条 `od media generate` —— 生图命令有自己的渲染分支
 * (`readImageCall` → `ImageRow`),整行不再是工具行。拿它当夹具的话,下面
 * 「只有一行工具行」会一直是空的,断言全部真空通过。
 */
const COMMAND = 'pnpm --filter @open-design/web build';

/* ── SSE 录音夹(照抄 w120-inflight-write-line-count.test.tsx)────────── */

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

/** 早期形态:一次已经开始、还没结束的 ACP 调用。 */
function inFlight(input: Record<string, unknown>, output?: string): AgentEvent {
  return {
    kind: 'tool_use',
    id: TOOL_ID,
    name: 'Bash',
    input: {
      ...input,
      ...(output ? { [IN_FLIGHT_TOOL_OUTPUT_KEY]: output } : {}),
      [IN_FLIGHT_TOOL_INPUT_MARKER]: true,
    },
    startedAt: T0,
  } as AgentEvent;
}

/**
 * 屏幕上的工具行 —— 有几行就是几个。
 *
 * ⚠️ 一行可能是两种形状之一,这个文件断言的「**仍然一行**」与形状无关:
 *  · `div.tool`     —— 还没有命令的第一帧、能认出语义动词的、失败的;
 *  · `details.fold` —— 命令行(产品 2026-09-03 把有标题 / 没标题两支统一成折叠块,
 *    见 `w132-raw-command-fold.test.tsx`)。这里的 `inFlight({ command })` 入参
 *    只有 `command`、没有 `description`,正是被统一的那一支。
 *
 * `:not([class*="_flat_"])` 排掉壳自己那层 flat fold —— 它不是工具行。
 */
function toolRows(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll('[class*="_tool_"], details[class*="_fold_"]:not([class*="_flat_"])'),
  ).filter((n): n is HTMLElement => n instanceof HTMLElement);
}

/**
 * 这一轮**唯一**那一行的数据契约(`ToolRow` 读到的东西)。
 *
 * 终端输出躺在折叠体里,默认不挂载(`Foldable` 的 `deferBody`),所以「输出到没到
 * 行上」不能靠 `textContent` 断 —— 那样会把「渲染时收起来了」误读成「数据没送到」。
 * 顺带守住「只有一行」:多于一行直接抛,不给真空通过的机会。
 */
function onlyToolRow(events: AgentEvent[]): ToolRow {
  // 和 `AssistantMessage` 同一条流水线、同一个顺序(见那边的 `visibleEvents`):
  // 先摘早期形态,再按 id 去重。顺序反了的话真货会被早期形态顶掉。
  const visible = dedupeToolUsesById(dropSupersededInFlightToolUses(events));
  const rows = buildTurnBlocks({ events: visible as never, runStatus: 'running', nowMs: T0 })
    .flatMap((block) =>
      block.kind === 'shell'
        ? [...block.items, ...block.segments.flatMap((segment) => segment.items)]
        : [],
    )
    .filter((item): item is ToolRow => item.kind === 'tool');
  expect(rows, '一次调用只能画一行').toHaveLength(1);
  return rows[0]!;
}

describe('W123 · ACP 在途工具行(web)', () => {
  describe('传输层', () => {
    let live: ReturnType<typeof makeLiveStream>;
    let abort: AbortController;
    let frameId = 7000;
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
      frameId = 7000;
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
      vi.useRealTimers();
      vi.unstubAllGlobals();
    });

    const frame = async (data: Record<string, unknown>): Promise<void> => {
      frameId += 1;
      live.push(sseEvent(frameId, 'agent', data));
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    };

    it('tool_in_flight 变成同一次调用的早期形态,带记号', async () => {
      await frame({
        type: 'tool_in_flight',
        id: TOOL_ID,
        name: 'Bash',
        input: { title: 'bash' },
        startedAt: T0,
      });

      const tools = agentEvents.filter((e) => e.kind === 'tool_use');
      expect(tools).toHaveLength(1);
      expect(tools[0]).toMatchObject({ kind: 'tool_use', id: TOOL_ID, name: 'Bash', startedAt: T0 });
      const input = (tools[0] as { input: Record<string, unknown> }).input;
      expect(input[IN_FLIGHT_TOOL_INPUT_MARKER]).toBe(true);
      expect(input.title).toBe('bash');
      // 第一帧没有路径 —— ACP 的 pending 帧 rawInput 是空的(真语料 202/202)。
      expect('file_path' in input).toBe(false);
    });

    it('中间输出跟着事件过来,而且不是一条 tool_result', async () => {
      await frame({
        type: 'tool_in_flight',
        id: TOOL_ID,
        name: 'Bash',
        input: { command: COMMAND },
        startedAt: T0,
        output: 'building…',
      });

      const input = (agentEvents[0] as { input: Record<string, unknown> }).input;
      expect(input[IN_FLIGHT_TOOL_OUTPUT_KEY]).toBe('building…');
      expect(
        agentEvents.some((e) => e.kind === 'tool_result'),
        '给还在跑的调用配结果,行会立刻不再是 pending',
      ).toBe(false);
    });

    it('缺 startedAt 的畸形事件不认', async () => {
      await frame({ type: 'tool_in_flight', id: TOOL_ID, name: 'Bash', input: {} });
      expect(agentEvents.filter((e) => e.kind === 'tool_use')).toHaveLength(0);
    });
  });

  describe('渲染', () => {
    afterEach(cleanup);

    it('第一条早期形态一到,行就在了,而且没有文件名按钮', () => {
      const { container } = renderTurn(
        <AssistantMessage streaming={false} message={turn([inFlight({ title: 'bash' })])} />,
      );
      expect(toolRows(container)).toHaveLength(1);
      expect(container.textContent ?? '').toContain('Bash');
      expect(
        container.querySelector('[class*="_file_"]'),
        '第一帧没有真路径,不许凭空造一个可点的文件',
      ).toBeNull();
    });

    it('后一帧带来真命令 → 原地覆盖,仍然一行', () => {
      const events = [inFlight({ title: 'bash' }), inFlight({ command: COMMAND })];
      // 摘除逻辑必须留**最后一条**,否则行永远停在没有命令的那一版。
      const kept = dropSupersededInFlightToolUses(events);
      expect(kept).toHaveLength(1);
      expect((kept[0] as { input: Record<string, unknown> }).input.command).toBe(COMMAND);

      const { container } = renderTurn(<AssistantMessage streaming={false} message={turn(events)} />);
      expect(toolRows(container)).toHaveLength(1);
      expect(container.textContent ?? '').toContain(COMMAND);
    });

    it('终态到了还是一行,而且带上结果', () => {
      const settled = {
        kind: 'tool_use',
        id: TOOL_ID,
        name: 'Bash',
        input: { command: COMMAND },
        startedAt: T0,
      } as AgentEvent;
      const result = {
        kind: 'tool_result',
        toolUseId: TOOL_ID,
        content: 'W123_SETTLED_OUTPUT',
        isError: false,
        completedAt: T0 + 57_024,
      } as AgentEvent;
      const events = [inFlight({ title: 'bash' }), inFlight({ command: COMMAND }), settled, result];
      const { container } = renderTurn(<AssistantMessage streaming={false} message={turn(events)} />);
      expect(toolRows(container)).toHaveLength(1);

      // 结果本身在折叠体里,默认收着(`Foldable` 的 `deferBody`),所以断言落在
      // 行的数据契约上而不是可见文字上 —— 那才是 `ToolRow` 真正读到的东西。
      const row = onlyToolRow(events);
      expect(row.terminal).toBe('W123_SETTLED_OUTPUT');
      expect(row.pending).toBe(false);
      expect(row.elapsedMs).toBe(57_024);
    });

    it('中间输出进到行里,但行仍然是未完成态', () => {
      const events = [inFlight({ command: COMMAND }, 'W123_PARTIAL_STDOUT')];
      const row = onlyToolRow(events);
      expect(row.terminal, '还在跑的那一段 stdout 要能上行').toBe('W123_PARTIAL_STDOUT');
      expect(row.pending, '有输出不等于跑完了 —— 秒表必须还在走').toBe(true);
      expect(renderTurn(<AssistantMessage streaming={false} message={turn(events)} />).container).toBeTruthy();
    });

    it('结算的结果压过在途那一段,不会两份都留着', () => {
      const settled = {
        kind: 'tool_use', id: TOOL_ID, name: 'Bash',
        input: { command: COMMAND }, startedAt: T0,
      } as AgentEvent;
      const result = {
        kind: 'tool_result', toolUseId: TOOL_ID, content: 'W123_FINAL', isError: false,
        completedAt: T0 + 1_000,
      } as AgentEvent;
      const row = onlyToolRow([inFlight({ command: COMMAND }, 'W123_PARTIAL_STDOUT'), settled, result]);
      expect(row.terminal).toBe('W123_FINAL');
    });

    it('内部记号不许漏到界面上', () => {
      const { container } = renderTurn(
        <AssistantMessage
          streaming={false}
          message={turn([inFlight({ command: COMMAND }, 'W123_PARTIAL_STDOUT')])}
        />,
      );
      const text = container.textContent ?? '';
      expect(text).not.toContain(IN_FLIGHT_TOOL_INPUT_MARKER);
      expect(text).not.toContain(IN_FLIGHT_TOOL_OUTPUT_KEY);
    });
  });
});
