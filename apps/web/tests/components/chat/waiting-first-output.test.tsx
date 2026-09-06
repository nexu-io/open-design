// @vitest-environment jsdom
/**
 * 等首个 token 的那一分钟里,壳里必须有一行说清**在等什么**。
 *
 * ── 真机报告(打包版 beta,2026-09-03)─────────────────────────────────
 *
 * 用户第一轮盯着执行记录看了一分多钟,原话「运行 claude 为啥思考中是空的, 空了半分钟了」
 * 「一分多钟了」。第二轮正常。**空本身没有错** —— 模型确实一个 token 都还没吐出来;
 * 错的是这一分钟里屏幕对此说了什么。
 *
 * ── 这条测试守的是哪一半(另一半已经有人管了)────────────────────────
 *
 * 「等了多久」**不归这里**:壳头那句「进行中 1m 7s」一直都在,而产品 2026-09-04 刚
 * 明确禁止在头一格思考上再写一个数(「不然跟上面一行的进行中的计时有点重复」,判据在
 * `first-thoughts-no-elapsed.test.tsx`)。所以下面每一条都**顺带钉住这一行不带数字** ——
 * 把秒表补到这里就是那条裁决的复读。
 *
 * 「在等什么」才是真的没人说。分两种 agent 看:
 *
 *  · **claude**(`claude-stream-json`):每 1.4 秒一帧空 `thinking_delta`,壳里那行
 *    「思考中」照常亮(W102),它**已经**回答了「在等什么」—— 这一条不动它。
 *  · **ACP 那一家**(`vela` / `devin` / `hermes` / `kilo` / `kimi` / `kiro` / `vibe`):
 *    首个 token 之前一条会落行的事件都没有,壳身子是**全空的**。而 daemon 这一刻正
 *    逐字发着 `{"type":"status","label":"waiting_for_first_output","elapsedMs":27217}`
 *    (`apps/daemon/src/agent-protocol/acp/session.ts:849`)—— 它知道在等什么,屏幕不说。
 *
 * ── 依据 ─────────────────────────────────────────────────────────────
 *
 *  · `docs/design/run-errors/error-ux-design.md:21`:「超过 60 秒没动静,**转圈旁边**要说
 *    『在等什么、等了多久』;**不到超时不报错**」。所以这是一行**状态**,不许长得像报错,
 *    也不许在门槛之内出现(同一份稿子第 44 行把失败门槛定在 10 分钟静默)。
 *  · `docs/design/run-errors/implementation-audit.md` 已经把它记成 S12 的缺口:
 *    「`assistant.waitingFirstOutput` / `assistant.slowHint` 是死键…零代码读取」。
 *  · 落在**壳里那一行**而不是壳头:壳头上一次挂这种句子被产品当场撤回
 *    (2026-08-27「上游响应慢，已等 411 秒  13m 7s」,原文在 `ExecutionShell.tsx` 的
 *    `head` 注释里),两条撤回理由是「读起来像故障」和「右边的总耗时在说同一段时间」。
 *    这一行两条都不重犯:句子不带秒数,壳头一个字不动。
 *
 * ── ⚠️ 这条测试为什么不自己捏 `label: 'running'` ───────────────────────
 *
 * `providers/daemon.ts` 的 `normalizeAgentStatusLabel` 会把 `waiting_for_first_output`
 * 压平成 `running`。**喂一条已经压平的状态等于什么都没证**,所以下面全部走**真传输层**
 * (`reattachDaemonRun`),喂 daemon 逐字那一帧,传输层吐出来什么就拿什么当 UI 的输入。
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import type { ChatMessage } from '@open-design/contracts';

import { AssistantMessage } from '../../../src/components/AssistantMessage';
import { WAITING_FIRST_OUTPUT_AFTER_MS } from '../../../src/components/chat/ExecutionShell';
import { I18nProvider } from '../../../src/i18n';
import { reattachDaemonRun } from '../../../src/providers/daemon';
import { __resetUpstreamActivity } from '../../../src/runtime/chat/upstream-activity';
import type { AgentEvent } from '../../../src/types';

const RUN_ID = 'b1f0d7c4-2a91-4f0e-9d33-8c5a6e2b7f10';
const T0 = 1_800_000_000_000;

/* ── daemon 逐字的两种首帧 ───────────────────────────────────────────── */

/** ACP:`session/prompt` 发出去那一刻。27 秒是发 prompt 之前烧掉的启动 + 建会话时间 */
const WAITING_FOR_FIRST_OUTPUT = {
  type: 'status',
  label: 'waiting_for_first_output',
  elapsedMs: 27_217,
} as const;

/** claude:`--include-partial-messages` 的推理心跳,真机 1786/1786 帧 delta 全是空串 */
const EMPTY_THINKING_DELTA = { type: 'thinking_delta', delta: '' } as const;

/* ── 一条「还开着」的 SSE 连接(接法照抄 `s12-upstream-alive.test.tsx`)──── */

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
          // 队列空 = 上游此刻没东西给我们,连接没断 —— 正是「在等首个 token」
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

const sseEvent = (id: number, event: string, data: Record<string, unknown>): string =>
  `id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

const show = (ui: ReactElement) => render(<I18nProvider initial="zh-CN">{ui}</I18nProvider>);

/**
 * 壳**内**那一行的耗时槽 —— 不是壳头那个。
 * 两者必须分开读:壳头的总耗时一直都在(用户当时也看得见),
 * 这一行**不许**再写一个(产品 2026-09-04)。
 */
function waitingRowElapsed(): string | null {
  const row = document.querySelector<HTMLElement>('details[class*="thoughts"]');
  if (!row) return null;
  return row.querySelector('[data-testid="chat-foldable-elapsed"]')?.textContent ?? null;
}

describe('等首个 token:壳里那一行要说在等什么', () => {
  let live: ReturnType<typeof makeLiveStream>;
  let abort: AbortController;
  let frameId = 2000;
  let captured: AgentEvent[];

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
    // 到达时刻表是进程级的,每条用例都把假时钟拨回 T0 —— 不抹掉上一条会读到「来自未来」的时刻
    __resetUpstreamActivity();
    live = makeLiveStream();
    abort = new AbortController();
    frameId = 2000;
    captured = [];
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
        // 传输层吐出来什么就收什么 —— 下面几条拿它当 UI 的输入,不自己捏状态帧
        onAgentEvent: (ev) => captured.push(ev),
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

  const frame = async (data: Record<string, unknown>, ms = 0): Promise<void> => {
    live.push(sseEvent((frameId += 1), 'agent', data));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  };
  const idle = async (ms: number): Promise<void> => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  };

  const turnOf = (id: string, events: AgentEvent[], content = ''): ChatMessage => ({
    id,
    role: 'assistant',
    content,
    runId: RUN_ID,
    runStatus: 'running',
    createdAt: T0,
    events,
  } as ChatMessage);

  it('ACP 那一轮:daemon 说了 `waiting_for_first_output`,屏幕上一个字都没有', async () => {
    await frame({ ...WAITING_FOR_FIRST_OUTPUT });
    expect(captured.length, '传输层把这一帧整个丢了 —— 后面的断言就无从谈起').toBeGreaterThan(0);

    show(<AssistantMessage message={turnOf('m-acp', captured)} streaming projectId="p1" />);
    await idle(67_000);

    expect(screen.getByText('等待首批输出中'), '在等什么 —— 壳身子整个是空的').toBeTruthy();
  });

  it('⚠️ 但它不许再写一个秒数 —— 壳头那个就是同一个数(产品 2026-09-04)', async () => {
    await frame({ ...WAITING_FOR_FIRST_OUTPUT });
    show(<AssistantMessage message={turnOf('m-acp-noms', captured)} streaming projectId="p1" />);
    await idle(67_000);

    // 壳头照旧报总耗时 —— 这一条同时证明「等了多久」本来就在屏幕上
    expect(screen.getByText('1m 7s'), '壳头的总耗时不许被这次改动带走').toBeTruthy();
    // 那一行自己不带数,连空槽都不留(拿不到数和被压住在 DOM 上分得开)
    expect(waitingRowElapsed(), '把秒表补到这一行 = 2026-09-04 那条裁决的复读').toBeNull();
  });

  it('门槛之内一个字都不多说 —— 快的那些轮次不许被打扰', async () => {
    await frame({ ...WAITING_FOR_FIRST_OUTPUT });
    show(<AssistantMessage message={turnOf('m-acp-fast', captured)} streaming projectId="p1" />);
    await idle(WAITING_FIRST_OUTPUT_AFTER_MS - 1_000);

    expect(screen.queryByText('等待首批输出中'), '不到门槛就说话 = 每一轮都在念叨').toBeNull();
  });

  it('第一个 token 一落地就干净地收走,不留一行陈的', async () => {
    await frame({ ...WAITING_FOR_FIRST_OUTPUT });
    const answered = turnOf('m-acp-answered', [...captured, { kind: 'text', text: '好的,' }], '好的,');

    show(<AssistantMessage message={answered} streaming projectId="p1" />);
    await idle(67_000);

    expect(screen.queryByText('等待首批输出中'), '答案都开始流了还挂着「在等」').toBeNull();
  });

  it('claude 那一轮不受影响:「思考中」已经回答了在等什么,不许再叠一行', async () => {
    /*
     * claude 走 `claude-stream-json`,**从不发** `waiting_for_first_output`
     * (全仓只有 ACP 那一处发)。它发的是空推理心跳,`ProjectView` 的 W102 规则据此
     * 补一条 `{ kind:'thinking', text:'' }` —— 壳里那行「思考中」就是这么亮的。
     */
    for (let i = 0; i < 48; i += 1) await frame({ ...EMPTY_THINKING_DELTA }, 1_400);
    show(
      <AssistantMessage
        message={turnOf('m-claude', [{ kind: 'thinking', text: '' }] as AgentEvent[])}
        streaming
        projectId="p1"
      />,
    );
    await idle(0);

    expect(screen.getByText('思考中'), '这一行本来就在,别把它测没了').toBeTruthy();
    expect(screen.queryByText('等待首批输出中'), '两行说同一件事 = 同一句话说两遍').toBeNull();
    // 顺带:这一行照旧不带数(产品 2026-09-04),别顺手补回来
    expect(waitingRowElapsed()).toBeNull();
  });

  it('壳里已经落过东西的那一轮不算「在等首个输出」—— 那是 S12,已被撤回', async () => {
    /*
     * 工具跑完之后再静默五分钟,是 S12「等太久没动静」,产品 2026-08-27 把它的展现
     * **撤了**(探测保留)。这一行只管**首个输出之前**,越界就是替产品把撤回的东西
     * 换个名字请回来。
     */
    await frame({ ...WAITING_FOR_FIRST_OUTPUT });
    const withTool = turnOf('m-acp-tool', [
      ...captured,
      { kind: 'tool_use', id: 't1', name: 'Read', input: { file_path: '/a.ts' }, startedAt: T0 + 1_000 },
      { kind: 'tool_result', toolUseId: 't1', content: 'ok', isError: false, completedAt: T0 + 2_000 },
    ] as AgentEvent[]);

    show(<AssistantMessage message={withTool} streaming projectId="p1" />);
    await idle(300_000);

    expect(screen.queryByText('等待首批输出中'), '越界接管了 S12').toBeNull();
  });

  it('下一轮照样会说 —— 这不是「一个会话只提醒一次」', async () => {
    /*
     * 用户报的是第一轮,但「第二轮也等了一分钟」并不会因此变得好懂。
     * 判据挂在**这一轮的壳**上,所以天然是每轮各算各的 —— 这条把它钉住。
     */
    await frame({ ...WAITING_FOR_FIRST_OUTPUT });
    const first = turnOf('m-turn-1', [...captured, { kind: 'text', text: '第一轮答完了' }], '第一轮答完了');
    const second = turnOf('m-turn-2', captured);

    const view = show(<AssistantMessage message={first} streaming projectId="p1" />);
    await idle(67_000);
    expect(screen.queryByText('等待首批输出中'), '第一轮已经答完,不该挂着').toBeNull();

    view.rerender(
      <I18nProvider initial="zh-CN">
        <AssistantMessage message={second} streaming projectId="p1" />
      </I18nProvider>,
    );
    await idle(67_000);
    expect(screen.getByText('等待首批输出中'), '第二轮又等了一分钟,照样得说').toBeTruthy();
  });
});
