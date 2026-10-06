// @vitest-environment jsdom
/**
 * 等首个 token 的那一分钟里,壳里那一行说的是**「思考中」**。
 *
 * ── 文案撤回(产品裁决 2026-09-07,只撤文案,不撤探测)──────────────────
 *
 * 这一行曾经在等首个输出时把词换成「等待首批输出中」。产品看着实物撤了它,原话:
 * 「为啥我看到思考中还有个文案是:「等待首批输出中」,这个文案让 subagent 撤掉,
 * **依旧显示「思考中」**」。
 *
 * 这是**同一份稿子第 3 条原则**(`error-ux-design.md:21`「等待要有回音」)在这块屏幕上
 * 第二次被撤回:第一次是 S12「上游响应慢,已等 N 秒」(2026-08-27,壳头,判据在
 * `s12-copy-revert.test.tsx`)。两次撤的都只是**取值那一行**,探测一行没删。
 *
 * ⚠️ 所以这条测试分两半,**两半都必须在**:
 *
 *  · **撤回**:等到天荒地老,那一行也只读「思考中」,再也不说「等待首批输出中」。
 *  · **保留**:门槛(`WAITING_FIRST_OUTPUT_AFTER_MS`)和 `waitingForFirstOutput` 照旧算 ——
 *    ACP 那一轮壳里**一个事件都没有**、模型也没在想,那一行「思考中」**只可能**由它
 *    补出来(`groupThinking` 的 `live` 入参)。谁把这个判据「顺手清干净」,下面第一条
 *    和最后一条会当场红:屏幕会退回 2026-09-03 之前那个**全空**的样子。
 *
 * ── 真机报告(打包版 beta,2026-09-03)─────────────────────────────────
 *
 * 用户第一轮盯着执行记录看了一分多钟,原话「运行 claude 为啥思考中是空的, 空了半分钟了」
 * 「一分多钟了」。第二轮正常。**空本身没有错** —— 模型确实一个 token 都还没吐出来;
 * 错的是这一分钟里屏幕**整个是空的**。补的是那一行的**存在**,不是它的措辞。
 *
 * ── 这条测试守的是哪一半(另一半已经有人管了)────────────────────────
 *
 * 「等了多久」**不归这里**:壳头那句「进行中 1m 7s」一直都在,而产品 2026-09-04 刚
 * 明确禁止在头一格思考上再写一个数(「不然跟上面一行的进行中的计时有点重复」,判据在
 * `first-thoughts-no-elapsed.test.tsx`)。所以下面每一条都**顺带钉住这一行不带数字** ——
 * 把秒表补到这里就是那条裁决的复读。
 *
 * **那一行在不在**才是这条测试的正题。分两种 agent 看:
 *
 *  · **claude**(`claude-stream-json`):每 1.4 秒一帧空 `thinking_delta`,壳里那行
 *    「思考中」照常亮(W102)—— 这一条不动它,它本来就在。
 *  · **ACP 那一家**(`vela` / `devin` / `hermes` / `kilo` / `kimi` / `kiro` / `vibe`):
 *    首个 token 之前一条会落行的事件都没有,壳身子是**全空的**,那一行「思考中」
 *    只能靠 `waitingForFirstOutput` 补出来。daemon 这一刻正逐字发着
 *    `{"type":"status","label":"waiting_for_first_output","elapsedMs":27217}`
 *    (`apps/daemon/src/agent-protocol/acp/session.ts:849`),但**屏幕不转述它** ——
 *    见下面「不读 daemon 那个 label」。
 *
 * ── 依据 ─────────────────────────────────────────────────────────────
 *
 *  · **产品裁决 2026-09-07**(原话在顶上):这一行只说「思考中」。稿子
 *    `docs/design/run-errors/error-ux-design.md:21` 那句「转圈旁边要说『在等什么、
 *    等了多久』」在这块屏幕上**已被产品撤回两次**(S12 一次、这次一次);谁想再把
 *    「在等什么」写回这一行,先去拿产品的话,别照着稿子直接改。
 *  · `assistant.waitingFirstOutput` 因此**退回死键**,19 个 locale 里的值都留着不删
 *    (`tests/i18n/locales.test.ts` 仍钉着它的质量),等产品换一种展现形式时接回来。
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

describe('等首个 token:壳里那一行读「思考中」(文案撤回,判据保留)', () => {
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

  it('ACP 那一轮等了一分多钟:那一行在,而且读的是「思考中」', async () => {
    await frame({ ...WAITING_FOR_FIRST_OUTPUT });
    expect(captured.length, '传输层把这一帧整个丢了 —— 后面的断言就无从谈起').toBeGreaterThan(0);

    show(<AssistantMessage message={turnOf('m-acp', captured)} streaming projectId="p1" />);
    await idle(67_000);

    /*
     * **保留那一半**:壳里一个事件都没有、模型也没在想,这一行「思考中」只可能由
     * `waitingForFirstOutput` 经 `groupThinking` 补出来。删掉那个判据 = 这条当场红,
     * 屏幕退回 2026-09-03 之前的全空。
     */
    expect(screen.getByText('思考中'), '壳身子整个是空的 —— 那一行被清掉了').toBeTruthy();
    /* **撤回那一半**(产品 2026-09-07) */
    expect(screen.queryByText('等待首批输出中'), '产品撤掉的文案被换个名字请回来了').toBeNull();
  });

  it('⚠️ 但那一行不许再写一个秒数 —— 壳头那个就是同一个数(产品 2026-09-04)', async () => {
    await frame({ ...WAITING_FOR_FIRST_OUTPUT });
    show(<AssistantMessage message={turnOf('m-acp-noms', captured)} streaming projectId="p1" />);
    await idle(67_000);

    // 壳头照旧报总耗时 —— 这一条同时证明「等了多久」本来就在屏幕上
    expect(screen.getByText('1m 7s'), '壳头的总耗时不许被这次改动带走').toBeTruthy();
    // 那一行自己不带数,连空槽都不留(拿不到数和被压住在 DOM 上分得开)
    expect(waitingRowElapsed(), '把秒表补到这一行 = 2026-09-04 那条裁决的复读').toBeNull();
  });

  it('门槛之内一行都不多出 —— 快的那些轮次不许被打扰', async () => {
    await frame({ ...WAITING_FOR_FIRST_OUTPUT });
    show(<AssistantMessage message={turnOf('m-acp-fast', captured)} streaming projectId="p1" />);
    await idle(WAITING_FIRST_OUTPUT_AFTER_MS - 1_000);

    /* 门槛照旧管用 —— 这是「保留」那一半:判据没了的话这一行会提前冒出来 */
    expect(screen.queryByText('思考中'), '不到门槛就补那一行 = 每一轮都在念叨').toBeNull();
    expect(screen.queryByText('等待首批输出中'), '撤掉的文案不许在任何时刻出现').toBeNull();
  });

  it('第一个 token 一落地就干净地收走,不留一行陈的', async () => {
    await frame({ ...WAITING_FOR_FIRST_OUTPUT });
    const answered = turnOf('m-acp-answered', [...captured, { kind: 'text', text: '好的,' }], '好的,');

    show(<AssistantMessage message={answered} streaming projectId="p1" />);
    await idle(67_000);

    /* 壳里落了正文 → `items` 不再为空 → 判据翻回 false,那一行整个收走 */
    expect(screen.queryByText('思考中'), '答案都开始流了还挂着那一行').toBeNull();
    expect(screen.queryByText('等待首批输出中'), '撤掉的文案不许在任何时刻出现').toBeNull();
  });

  it('claude 那一轮不受影响:那一行本来就在,不许再叠一行', async () => {
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

    /* `getByText` 一次只许命中一个 —— 这一条同时钉住「不叠第二行」 */
    expect(screen.getByText('思考中'), '这一行本来就在,别把它测没了').toBeTruthy();
    expect(screen.queryByText('等待首批输出中'), '撤掉的文案不许在任何时刻出现').toBeNull();
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

    expect(screen.queryByText('思考中'), '越界接管了 S12').toBeNull();
    expect(screen.queryByText('等待首批输出中'), '撤掉的文案不许在任何时刻出现').toBeNull();
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
    expect(screen.queryByText('思考中'), '第一轮已经答完,不该挂着').toBeNull();

    view.rerender(
      <I18nProvider initial="zh-CN">
        <AssistantMessage message={second} streaming projectId="p1" />
      </I18nProvider>,
    );
    await idle(67_000);
    /* 「保留」那一半的第二只钉子:判据是每轮各算各的,删了它这里也会红 */
    expect(screen.getByText('思考中'), '第二轮又等了一分钟,那一行照样得在').toBeTruthy();
    expect(screen.queryByText('等待首批输出中'), '撤掉的文案不许在任何时刻出现').toBeNull();
  });
});
