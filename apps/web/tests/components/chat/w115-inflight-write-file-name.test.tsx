// @vitest-environment jsdom
/**
 * 在途的写文件行,**在 `content` 还在传的时候**就要带上文件名。
 *
 * 模型把一个 20KB 的 HTML 塞进 `Write` 的入参里,`file_path` 是那串 JSON 的第一个
 * 字段 —— 头几十字节就够拿到它。可 `tool_use` 要等最后一个字节才发,所以在真机上
 * 那一整段时间里,执行记录只有一颗转圈的球和一个秒数,没有「在写哪个文件」。
 *
 * daemon 那半边(增量解析 + `tool_input_target`)的红绿在
 * `apps/daemon/tests/runtimes/w115-tool-input-target-path.test.ts`,那边用的是
 * 真 CLI 2.1.259 的逐字节录音。本文件守 web 这半边的三件事:
 *
 *  1. 帧一到,行上就有文件名(而且是**在** `tool_use` 之前);
 *  2. `tool_use` 落地之后,一次调用还是**一行**,名字不变;
 *  3. 原始入参一个字节都没进事件流 —— 这条和
 *     `tool-input-delta-dead-wiring.test.tsx` 守的是同一件事,这里是它的
 *     「新增了一条通道之后」版本。
 *
 * ⚠️ 这里**不新增任何文案**。行上的动词(新建 / 改写)、图标、文件名按钮全部走
 * 已有的 `buildToolRow` / `ToolRow` —— 提前那一行长得就是最终那一行**减去**
 * 需要 `content` 才能算出来的 `+N −M`。
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import type { ReactElement } from 'react';

import { AssistantMessage } from '../../../src/components/AssistantMessage';
import { I18nProvider } from '../../../src/i18n';
import { reattachDaemonRun } from '../../../src/providers/daemon';
import { __resetUpstreamActivity } from '../../../src/runtime/chat/upstream-activity';
import { IN_FLIGHT_TOOL_INPUT_MARKER } from '../../../src/runtime/tool-events';
import { deriveFileOps } from '../../../src/runtime/file-ops';
import type { AgentEvent, ChatMessage } from '../../../src/types';

const RUN_ID = 'w115-0000-0000-0000-000000000001';
const T0 = 1_787_809_851_233;
const TOOL_ID = 'toolu_01TCNVTdkEMcTY46oBndnpKA';
const FILE_PATH = '/repo/scratchpad/alpha.html';

/** 只会出现在文件正文里的字符串 —— 泄漏探针 */
const CONTENT_MARKER = 'W115_CONTENT_LEAKED';
const FILE_CONTENT = `<!doctype html><html><body><h1>${CONTENT_MARKER}</h1></body></html>`;

/* ── SSE 录音夹(照抄 tool-input-delta-dead-wiring.test.tsx)────────────── */

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

/** 入参还在传的那一档:同一次调用的早期形态,只带路径。 */
function inFlightWrite(): AgentEvent {
  return {
    kind: 'tool_use',
    id: TOOL_ID,
    name: 'Write',
    input: { file_path: FILE_PATH, [IN_FLIGHT_TOOL_INPUT_MARKER]: true },
  };
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

/** 执行记录壳里画出来的工具行文本 */
function recordText(container: HTMLElement): string {
  return container.textContent ?? '';
}

describe('W115 · 在途写文件行的文件名(web)', () => {
  describe('传输层', () => {
    let live: ReturnType<typeof makeLiveStream>;
    let abort: AbortController;
    let frameId = 3000;
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
      frameId = 3000;
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

    /** 真机的到达顺序:先几条半截 JSON,然后 target,最后 tool_use。 */
    async function playInFlightWrite(): Promise<void> {
      await frame({ type: 'tool_input_delta', id: TOOL_ID, name: 'Write', delta: '{"file_path": "/repo/scr' });
      await frame({ type: 'tool_input_delta', id: TOOL_ID, name: 'Write', delta: 'atchpad/alpha.html", "content": "<!doctype' });
      await frame({ type: 'tool_input_target', id: TOOL_ID, name: 'Write', path: FILE_PATH });
      await frame({ type: 'tool_input_delta', id: TOOL_ID, name: 'Write', delta: ` html><html><body><h1>${CONTENT_MARKER}` });
    }

    it('target 帧变成一条只带路径的调用,tool_input_delta 照旧不变', async () => {
      await playInFlightWrite();
      const calls = agentEvents.filter((e) => e.kind === 'tool_use');
      expect(calls, 'target 帧被丢掉了 —— 行上永远拿不到文件名').toHaveLength(1);
      expect(calls[0]).toMatchObject({ id: TOOL_ID, name: 'Write' });
      expect((calls[0] as { input: Record<string, unknown> }).input).toEqual({
        file_path: FILE_PATH,
        [IN_FLIGHT_TOOL_INPUT_MARKER]: true,
      });
      // 半截 JSON 一条都不许变成事件(dead-wiring 那条守的同一件事)
      expect(agentEvents.filter((e) => e.kind === ('tool_input_delta' as never))).toHaveLength(0);
    });

    /**
     * ⚠️ 最重要的一条反向对照:**原始 JSON 没有进事件流。**
     *
     * 整条连接跑完之后,事件数组序列化出来不许含有文件正文的任何一个字节,
     * 也不许含有半截 JSON 的语法噪音。target 事件只有 4 个字段。
     */
    it('反向:整条事件流里没有一个字节的原始入参', async () => {
      await playInFlightWrite();
      const serialized = JSON.stringify(agentEvents);
      expect(serialized, '文件正文漏进事件流了').not.toContain(CONTENT_MARKER);
      expect(serialized, '半截 JSON 漏进事件流了').not.toContain('{\\"file_path');
      expect(deltas.join(''), '半截 JSON 被当正文喂进去了').toBe('');

      const call = agentEvents.find((e) => e.kind === 'tool_use') as
        | { input: Record<string, unknown> }
        | undefined;
      expect(Object.keys(call?.input ?? {}).sort()).toEqual(
        ['file_path', IN_FLIGHT_TOOL_INPUT_MARKER].sort(),
      );
    });

    it('反向:非文件类工具的 delta 不会凭空多出 target', async () => {
      await frame({ type: 'tool_input_delta', id: 'toolu_bash', name: 'Bash', delta: '{"command": "cat > x' });
      await frame({ type: 'tool_input_delta', id: 'toolu_bash', name: 'Bash', delta: '.html <<ODEOF"}' });
      expect(agentEvents.filter((e) => e.kind === 'tool_use')).toHaveLength(0);
      expect(JSON.stringify(agentEvents)).not.toContain('ODEOF');
    });
  });

  describe('渲染层', () => {
    afterEach(() => { cleanup(); });

    /** 正向:入参只到了一半,行上已经有文件名。 */
    it('只有 target 时,行上已经是「新建 alpha.html」', () => {
      const { container } = renderTurn(
        <AssistantMessage
          message={turn([inFlightWrite()])}
          streaming
          projectId="p1"
        />,
      );
      const text = recordText(container);
      expect(text, '在途的写文件行没有文件名 —— 这就是 W115 要修的').toContain('alpha.html');
      // 动词走已有文案(chat.record.verb.write),不新增任何 key
      expect(text).toContain('新建');
      expect(text, '文件正文漏到界面上了').not.toContain(CONTENT_MARKER);
      expect(text, '内部记号漏到界面上了').not.toContain(IN_FLIGHT_TOOL_INPUT_MARKER);
    });

    /**
     * 反向:写还没发生,不许当成一次文件操作。
     *
     * 提前那一行只说明模型**打算**写这个文件。拿它去开文件卡片 / 工作区 tab
     * 是谎报一次落盘 —— 真的 `tool_use` 到了才算数。
     */
    it('反向:入参还在传时不算一次文件操作', () => {
      expect(deriveFileOps([inFlightWrite()])).toHaveLength(0);
      expect(
        deriveFileOps([
          inFlightWrite(),
          { kind: 'tool_use', id: TOOL_ID, name: 'Write', input: { file_path: FILE_PATH, content: FILE_CONTENT } },
        ]),
      ).toHaveLength(1);
    });

    /**
     * 入参传完之后,名字不变、行数不变 —— 不会先显示一个、后变成另一个,
     * 也不会一次调用画两行。
     */
    it('tool_use 落地后仍然只有一行,名字没变', () => {
      const events: AgentEvent[] = [
        inFlightWrite(),
        {
          kind: 'tool_use',
          id: TOOL_ID,
          name: 'Write',
          input: { file_path: FILE_PATH, content: FILE_CONTENT },
        },
        { kind: 'tool_result', toolUseId: TOOL_ID, content: `File created at ${FILE_PATH}`, isError: false },
      ];
      const { container } = renderTurn(
        <AssistantMessage message={turn(events)} streaming={false} projectId="p1" />,
      );
      const text = recordText(container);
      expect(text).toContain('alpha.html');
      expect(text).not.toContain(CONTENT_MARKER);
      expect(text).not.toContain(IN_FLIGHT_TOOL_INPUT_MARKER);
      // 一次调用一行:文件名只出现一次
      expect(text.split('alpha.html').length - 1, '同一次写文件画了两行').toBe(1);
      /*
       * ⚠️ 这一条是「早期形态必须被摘掉」的红证据,不是锦上添花。
       *
       * `dedupeToolUsesById` 按 id 留**第一条** —— 早期形态排在前面。不先摘掉,
       * 留下来的就是那份没有 `content` 的入参,于是 `diffStat` 永远算不出改动量:
       * 行上该显示 `+1 −0` 的位置会变成耗时,而且所有读 `input.content` 的下游
       * 也永远只看得到半截。文件名照样在,所以光看名字发现不了。
       */
      expect(container.querySelector('[class*="delta"]')?.textContent ?? '', '早期形态顶掉了真货 —— 改动量没了').toBe(
        `+${FILE_CONTENT.split('\n').length}−0`,
      );
    });

    /**
     * 反向:target 到了、tool_use 还没到时,如果这一轮里**另一个**工具已经跑完,
     * 两行互不干扰 —— 提前的那一行不会顶掉别人。
     */
    it('反向:提前的行不影响同一轮里已经跑完的行', () => {
      const events: AgentEvent[] = [
        { kind: 'tool_use', id: 'toolu_prev', name: 'Grep', input: { pattern: 'foo', path: '/repo/docs' } },
        { kind: 'tool_result', toolUseId: 'toolu_prev', content: 'a\nb', isError: false },
        inFlightWrite(),
      ];
      const { container } = renderTurn(
        <AssistantMessage message={turn(events)} streaming projectId="p1" />,
      );
      const text = recordText(container);
      expect(text).toContain('alpha.html');
      expect(text).toContain('foo');
    });
  });
});
