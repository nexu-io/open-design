// @vitest-environment jsdom
/**
 * 在途那一行要**一边写一边长**:行数实时增加,秒数实时增加。
 *
 * W115 让路径一收尾就有文件名,但那条只发一次 —— 之后一百多秒里那一行是静止的。
 * 产品 2026-09-03:「写入的行数能否动态增加,外加一个增长的计时?」
 *
 * daemon 那半边(增量计数 + 节流 + `tool_input_progress`)的红绿在
 * `apps/daemon/tests/runtimes/w120-inflight-write-line-count.test.ts`,那边用的是
 * 真 CLI 2.1.259 录音的外壳。本文件守 web 这半边四件事:
 *
 *  1. 计数帧一到,行上就有 `+N −0`,而且会**长**;
 *  2. 秒数在**客户端** tick —— daemon 不再推任何东西,行上的秒数照样在走;
 *  3. **在途最后一个行数 == 落定后 `diffStat` 的 `+N`**(拿真的 `diffStat` 对照,
 *     不复述规则),否则 `tool_use` 落地那一刻数字会跳;
 *  4. 原始入参一个字节都没进事件流。
 *
 * ⚠️ **不新增任何文案**:`+N` / `−M` 那一格本来就没有 i18n key(纯数字,
 * `ToolRow` 直接写 `+{added}` / `−{removed}`),耗时走已有的 `formatElapsed`。
 * 在途那一行长得就是最终那一行 —— 只是数字还在长,而且多留着耗时那一格。
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import type { ReactElement } from 'react';

import { AssistantMessage } from '../../../src/components/AssistantMessage';
import { I18nProvider } from '../../../src/i18n';
import { reattachDaemonRun } from '../../../src/providers/daemon';
import { __resetUpstreamActivity } from '../../../src/runtime/chat/upstream-activity';
import { IN_FLIGHT_TOOL_INPUT_MARKER } from '../../../src/runtime/tool-events';
import { diffStat } from '../../../src/runtime/chat/format';
import { deriveFileOps } from '../../../src/runtime/file-ops';
import type { AgentEvent, ChatMessage } from '../../../src/types';

const RUN_ID = 'w120-0000-0000-0000-000000000001';
const T0 = 1_787_809_851_233;
const TOOL_ID = 'toolu_01TCNVTdkEMcTY46oBndnpKA';
const FILE_PATH = '/repo/scratchpad/dashboard.html';

/** 只会出现在文件正文里的字符串 —— 泄漏探针 */
const CONTENT_MARKER = 'W120_CONTENT_LEAKED';
/** 12 行(`split('\n').length` 的口径:11 个换行 + 1) */
const FILE_CONTENT = `<!doctype html>\n<html>\n<head>\n<title>${CONTENT_MARKER}</title>\n</head>\n<body>\n<h1>a</h1>\n<h2>b</h2>\n<h3>c</h3>\n</body>\n</html>\n`;

/* ── SSE 录音夹(照抄 w115-inflight-write-file-name.test.tsx)──────────── */

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

/** 在途那一档:同一次调用的早期形态,带路径 + 已经数出来的行数。 */
function inFlightWrite(lines: number, startedAt = T0): AgentEvent {
  return {
    kind: 'tool_use',
    id: TOOL_ID,
    name: 'Write',
    input: {
      file_path: FILE_PATH,
      od_diff_stat: { added: lines, removed: 0 },
      [IN_FLIGHT_TOOL_INPUT_MARKER]: true,
    },
    startedAt,
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
 * 这一次写文件的那**一行**(不是外面那只执行记录壳)。
 *
 * ⚠️ 必须先定位到行再取格子:壳头自己也有一格耗时(`formatShellElapsed`,粗一档),
 * 在整个 container 上找 `[class*="meta"]` 会先撞到它 —— 于是「行上没有秒数」这条
 * 会被壳头的秒数假冒成绿。
 */
function toolRow(container: HTMLElement): HTMLElement | null {
  // CSS Module 类名带哈希(`_file_09d9ab`),而且没有打开回调时文件名是 span 不是
  // button —— 下划线是必须的:`[class*="file"]` 会撞上全局的 `file-ops-cards-only`。
  const file = container.querySelector('[class*="_file_"]');
  const row = file?.closest('[class*="_tool_"]');
  return row instanceof HTMLElement ? row : null;
}

/** 行上那一格改动量的文字(`+128−0`);找不到就返回 null,不许真空通过。 */
function deltaText(container: HTMLElement): string | null {
  const node = toolRow(container)?.querySelector('[class*="delta"]');
  return node ? (node.textContent ?? '') : null;
}

/** 行上耗时那一格的文字;找不到或是空槽返回 null。 */
function elapsedText(container: HTMLElement): string | null {
  const nodes = Array.from(toolRow(container)?.querySelectorAll('[class*="meta"]') ?? []);
  const withText = nodes.map((n) => n.textContent ?? '').filter((t) => t.trim().length > 0);
  return withText.length > 0 ? withText.join('|') : null;
}

describe('W120 · 在途写文件行的行数与计时(web)', () => {
  describe('传输层', () => {
    let live: ReturnType<typeof makeLiveStream>;
    let abort: AbortController;
    let frameId = 4000;
    let agentEvents: AgentEvent[];
    let deltas: string[];

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
      frameId = 4000;
      agentEvents = [];
      deltas = [];
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
          onDelta: (text: string) => { deltas.push(text); },
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

    it('计数帧变成同一次调用的早期形态,带 od_diff_stat 和不动的起点', async () => {
      await frame({ type: 'tool_input_target', id: TOOL_ID, name: 'Write', path: FILE_PATH });
      await frame({
        type: 'tool_input_progress',
        id: TOOL_ID,
        name: 'Write',
        path: FILE_PATH,
        lines: 128,
        startedAt: T0,
      });

      const calls = agentEvents.filter((e) => e.kind === 'tool_use');
      expect(calls.length, '计数帧被丢掉了 —— 行上永远长不出行数').toBe(2);
      const latest = calls[calls.length - 1] as {
        input: Record<string, unknown>;
        startedAt?: number;
      };
      expect(latest.input).toEqual({
        file_path: FILE_PATH,
        od_diff_stat: { added: 128, removed: 0 },
        [IN_FLIGHT_TOOL_INPUT_MARKER]: true,
      });
      expect(latest.startedAt, '计数帧没把起点带过来 —— 秒数无从算起').toBe(T0);
    });

    it('反向:计数帧不会把正文带进事件流', async () => {
      await frame({
        type: 'tool_input_progress',
        id: TOOL_ID,
        name: 'Write',
        path: FILE_PATH,
        lines: 12,
        startedAt: T0,
      });
      const serialized = JSON.stringify(agentEvents);
      expect(serialized, '文件正文漏进事件流了').not.toContain(CONTENT_MARKER);
      expect(deltas.join(''), '半截 JSON 被当正文喂进去了').toBe('');
    });

    it('反向:行数不是非负整数的帧直接丢掉', async () => {
      for (const lines of [-1, 1.5, Number.NaN, '12']) {
        await frame({
          type: 'tool_input_progress',
          id: `${TOOL_ID}-${String(lines)}`,
          name: 'Write',
          path: FILE_PATH,
          lines,
          startedAt: T0,
        });
      }
      expect(agentEvents.filter((e) => e.kind === 'tool_use'), '脏数字被当成行数收下了').toHaveLength(0);
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

    it('在途的行上同时有行数和秒数', () => {
      const { container } = renderTurn(
        <AssistantMessage message={turn([inFlightWrite(128)])} streaming projectId="p1" />,
      );
      const text = container.textContent ?? '';
      expect(text).toContain('dashboard.html');
      expect(deltaText(container), '在途的行上没有行数 —— 这就是 W120 要修的').toBe('+128−0');
      expect(elapsedText(container), '在途的行上没有秒数 —— 行数顶掉了计时').toBe('12.0s');
      expect(text, '内部记号漏到界面上了').not.toContain(IN_FLIGHT_TOOL_INPUT_MARKER);
    });

    it('新的计数帧一到,行上的数字就长了(仍然只有一行)', () => {
      const { container, rerender } = renderTurn(
        <AssistantMessage message={turn([inFlightWrite(12)])} streaming projectId="p1" />,
      );
      expect(deltaText(container)).toBe('+12−0');

      rerender(
        <I18nProvider initial="zh-CN">
          <AssistantMessage
            message={turn([inFlightWrite(12), inFlightWrite(340)])}
            streaming
            projectId="p1"
          />
        </I18nProvider>,
      );
      /*
       * ⚠️ 这里踩的是 `dedupeToolUsesById` 的坑:它按 id 留**第一条**。
       * 在途形态一条接一条到,不先把旧的摘掉,留下来的永远是第一条 ——
       * 行上的数字会**永远停在 12**,文件名还在,光看名字发现不了。
       */
      expect(deltaText(container), '数字停在第一条计数上了 —— 旧的在途形态没被摘掉').toBe('+340−0');
      expect(
        (container.textContent ?? '').split('dashboard.html').length - 1,
        '同一次写文件画了两行',
      ).toBe(1);
    });

    /**
     * 秒数在**客户端**走:这一整段里 daemon 一条事件都没再推,`events` 数组
     * 一个字节都没变,行上的秒数照样从 12.0s 走到 17.0s。
     */
    it('计时在客户端 tick,不靠 daemon 每秒推事件', async () => {
      const events = [inFlightWrite(128)];
      const frozen = JSON.stringify(events);
      const { container } = renderTurn(
        <AssistantMessage message={turn(events)} streaming projectId="p1" />,
      );
      expect(elapsedText(container)).toBe('12.0s');

      await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });

      expect(JSON.stringify(events), '事件数组变了 —— 这条测的就不是客户端 tick').toBe(frozen);
      expect(elapsedText(container), '秒数不走 —— 行上还是个静止的数字').toBe('17.0s');
    });

    /**
     * ⚠️ 最关键的一条:**结尾不许跳数字**。在途报的最后一个行数,必须等于落定后
     * 真的 `diffStat` 从 `tool_use.input.content` 算出来的 `+N`。
     * 这里不复述口径,直接调 `diffStat` —— 复述就会和它分叉。
     */
    it('在途最后一个行数 == 落定后 diffStat 的 +N', () => {
      const settledInput = { file_path: FILE_PATH, content: FILE_CONTENT };
      const expected = diffStat('Write', settledInput);
      expect(expected, 'diffStat 算不出来 —— 这条测不了').not.toBeNull();

      const lastInFlight = expected!.added;
      const { container, rerender } = renderTurn(
        <AssistantMessage message={turn([inFlightWrite(lastInFlight)])} streaming projectId="p1" />,
      );
      const inFlightText = deltaText(container);
      expect(inFlightText).toBe(`+${lastInFlight}−0`);

      rerender(
        <I18nProvider initial="zh-CN">
          <AssistantMessage
            message={turn([
              inFlightWrite(lastInFlight),
              { kind: 'tool_use', id: TOOL_ID, name: 'Write', input: settledInput },
              { kind: 'tool_result', toolUseId: TOOL_ID, content: `File created at ${FILE_PATH}`, isError: false },
            ])}
            streaming={false}
            projectId="p1"
          />
        </I18nProvider>,
      );
      expect(deltaText(container), '落定那一刻数字跳了').toBe(inFlightText);
      expect(container.textContent ?? '', '文件正文漏到界面上了').not.toContain(CONTENT_MARKER);
    });

    /**
     * 落定那一帧**计时不许倒退**。
     *
     * 早期形态带的起点是 daemon 第一次看见入参的时刻;真的 `tool_use` 拿到的却是
     * 入参**传完**那一刻(出口盖的)。写一个 27.6KB 的页面,两者差一百多秒 ——
     * 不把起点搬过去,行上的秒数会从「2m 21s」被按回「1.0s」,像计时器坏了。
     * 这一帧 `tool_result` 还没到,行仍然在跑,所以秒数照旧要显示。
     */
    it('落定那一帧计时不倒退 —— 真货沿用早期形态的起点', () => {
      vi.setSystemTime(T0 + 141_000);
      const { container } = renderTurn(
        <AssistantMessage
          message={turn([
            inFlightWrite(734, T0),
            {
              kind: 'tool_use',
              id: TOOL_ID,
              name: 'Write',
              input: { file_path: FILE_PATH, content: FILE_CONTENT },
              // 入参传完那一刻才盖的戳 —— 比行出现的时候晚了 140 秒
              startedAt: T0 + 140_000,
            } as AgentEvent,
          ])}
          streaming
          projectId="p1"
        />,
      );
      expect(elapsedText(container), '秒数被按回去了 —— 起点没跟着搬').toBe('2m 21s');
    });

    /** 反向:在途的计数形态照旧不算一次文件操作 —— 写还没发生。 */
    it('反向:带了行数也不算一次文件操作', () => {
      expect(deriveFileOps([inFlightWrite(128)])).toHaveLength(0);
      expect(
        deriveFileOps([
          inFlightWrite(128),
          { kind: 'tool_use', id: TOOL_ID, name: 'Write', input: { file_path: FILE_PATH, content: FILE_CONTENT } },
        ]),
      ).toHaveLength(1);
    });

    /**
     * 反向:跑完的行照旧只显示改动量,**不带秒数** —— 秒数那一格是「还在跑」的
     * 标志(稿子 `.tool` 每一行 `.dst` 和 `.ms` 二选一,从来没有同时出现过)。
     */
    it('反向:跑完的写文件行只有改动量,没有秒数', () => {
      const { container } = renderTurn(
        <AssistantMessage
          message={turn([
            { kind: 'tool_use', id: TOOL_ID, name: 'Write', input: { file_path: FILE_PATH, content: FILE_CONTENT }, startedAt: T0 } as AgentEvent,
            { kind: 'tool_result', toolUseId: TOOL_ID, content: 'ok', isError: false, completedAt: T0 + 4_000 } as AgentEvent,
          ])}
          streaming={false}
          projectId="p1"
        />,
      );
      expect(deltaText(container)).toBe(`+${FILE_CONTENT.split('\n').length}−0`);
      expect(elapsedText(container), '跑完的行也挂上秒数了').toBeNull();
    });
  });
});
