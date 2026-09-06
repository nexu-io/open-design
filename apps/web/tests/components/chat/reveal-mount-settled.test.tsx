// @vitest-environment jsdom
/**
 * 【不变式 · 2026-09-04】**逐字化开只属于「本次挂载中正在到达的字」。**
 * 一只 host 挂上来时**已经在里头**的文字是历史 —— 首帧就是落定态,一个字符都不排队,
 * 一只定时器都不排。
 *
 * 用户原话:「然后这个**已经输出过的**,**刷新页面**或者**从设置页面返回**,还是会有
 * 流式的效果」。指的是一张已经答完的问题表单摘要卡(绿色「已确认」+ 三行「问题 / 答案」),
 * 重挂之后又从头化开了一遍。
 *
 * ## 为什么钉「首帧」而不是「最终会显示完整」
 *
 * 「最终会显示完整」这条在**修之前就是绿的** —— 化开本来就只是入场动画,2 秒后一样落定。
 * 钉不住任何东西。真正的判据只有两条,和同日 token 读数那条(`thinking-token-count-up`
 * 的「挂载即落定」)是同一族:
 *
 *   ① 挂载那一帧 `.rv` 就是 0 个(不是「后来变成 0」);
 *   ② 挂载那一帧**一个 tick 都不排** —— 化开的收尾定时器根本没被创建。
 *
 * ## 真实触发路径(不是「能造出来」,是从入口追到出错那一行)
 *
 * 化开只在 `isLastAssistant && streaming` 时开工,所以「已答的卡又化开一遍」要成立,
 * 那张卡必须待在一条**此刻还在流**的助手消息里。这不是边角:它正是「先问后做」
 * 那条默认流程的形状 ——
 *
 *   `foldStrategyTaskTurns`(OPEND-2592)把两个物理 run 折进**同一条**助手消息:
 *   run 0 跑发现、末尾抛 `<question-form>`;用户当场回答;run 1 拿着答案接着干活。
 *   屏幕上是「run 0 的壳 → 已确认 → run 1 的壳」,判据见 `cross-run-form-placement.test.tsx`。
 *
 * 于是 run 1 还在跑的整段时间里:
 *   ① 消息的 `runStatus` 是 `running`(daemon 落库、GET 原样返回,`db.ts` 的 `runStatus` 列);
 *   ② `isAssistantMessageStreaming` 一看 `isActiveRunStatus` 就提前 `return true`(ChatPane);
 *   ③ `ProseBlock` 拿到 `streaming` + `isLast`,`useCharReveal(proseRef, true)`;
 *   ④ 这一刻只要重挂一次,`.prose-block` 就带着 run 0 的**全部**历史正文重新进场 ——
 *      连同那张「已确认」摘要卡一起,从头化开一遍。
 *
 * ## 两条路径分别钉
 *
 *  · **刷新页面** —— 整个应用重新挂载,历史从 GET 拉回来后一次性渲染。
 *    对应用例:`AssistantMessage` 带着完整历史正文首次挂载(`runStatus: 'running'`)。
 *  · **从设置页返回** —— 应用没重载,但聊天面板重新挂载(`ChatPane` 的 React `key`
 *    含 `chatSeed`,清它就是强制重挂)。对应用例:同一段文字换一只 `key` 重挂。
 *
 * 两条路径在 DOM 上是同一件事(host 带着完整文字进场),但触发它们的用户动作不同,
 * 所以各钉一条 —— 只修其中一条不算完。
 *
 * ## 反向对照必须在
 *
 * 「一个 span 都没有」这种断言最容易空过(组件根本没渲染时它也成立)。所以每条正面
 * 断言都配一条:同一只 host **挂载之后**再长出来的字,照旧化开。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { useRef, type ReactElement } from 'react';
import { AssistantMessage } from '../../../src/components/AssistantMessage';
import { planReveal, useCharReveal } from '../../../src/components/chat/useCharReveal';
import type { ChatMessage } from '../../../src/types';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function Prose({ text }: { text: string }): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  useCharReveal(ref, true);
  return <div ref={ref} data-testid="prose"><p>{text}</p></div>;
}

const spans = (root: ParentNode = document): number => root.querySelectorAll('.rv').length;
const visible = (): string => document.querySelector('[data-testid="prose"]')?.textContent ?? '';

/**
 * 化开排的那一只收尾定时器,延时是 `planReveal(n).totalMs + 16`(见 `useCharReveal`)。
 * 按**延时**认,不按调用次数 —— React / testing-library 自己也会排别的 timer,
 * 数总次数会把无关的算进来,反而钉不住。
 */
function revealTimerDelays(
  spy: { mock: { calls: unknown[][] } },
  chars: number,
): number[] {
  const want = planReveal(chars).totalMs + 16;
  return spy.mock.calls
    .map((call): number => Number(call[1]))
    .filter((delay): boolean => delay === want);
}

const HISTORY = '已确认要制作哪种文档单页文档推荐这份文档给谁看希望达成什么目标都行正文内容从哪里来我现在提供内容';

/* ── ① hook 层:挂载即落定 ──────────────────────────────────────── */

describe('挂载即落定 —— 已经在 host 里的字不是「新到的字」', () => {
  it('首帧 0 个 span、文字完整', () => {
    render(<Prose text={HISTORY} />);
    expect(visible(), '文字没渲染出来的话下面那条会空过').toBe(HISTORY);
    expect(spans()).toBe(0);
  });

  it('挂载那一帧一个 tick 都不排 —— 收尾定时器根本没被创建', () => {
    const timeout = vi.spyOn(globalThis, 'setTimeout');
    render(<Prose text={HISTORY} />);
    expect(revealTimerDelays(timeout, HISTORY.length), '排了化开的收尾定时器 = 这一批字在化开')
      .toEqual([]);
  });

  it('反向对照:挂载之后长出来的字照旧化开,并且照旧排它的收尾定时器', () => {
    const timeout = vi.spyOn(globalThis, 'setTimeout');
    const { rerender } = render(<Prose text={HISTORY} />);
    rerender(<Prose text={`${HISTORY}这是模型此刻正在吐的字`} />);
    expect(spans(), '新字一个都没化开 = 这条不变式修过头了').toBeGreaterThan(0);
    expect(revealTimerDelays(timeout, '这是模型此刻正在吐的字'.length)).toHaveLength(1);
  });

  it('反向对照:空着挂上来再长,第一批字也照旧化开(直播开头那一帧)', () => {
    const { rerender } = render(<Prose text="" />);
    rerender(<Prose text="想好了,开始做" />);
    expect(spans()).toBeGreaterThan(0);
  });
});

/* ── ② 从设置页返回:同一段文字换一只 key 重挂 ─────────────────────── */

describe('从设置页返回 —— 聊天面板被强制重挂', () => {
  it('重挂之后 0 个 span,文字仍然完整', () => {
    // 先在屏幕上正常流一段,让它化开、落定
    const { rerender } = render(<Prose key="seed-a" text="" />);
    rerender(<Prose key="seed-a" text={HISTORY} />);
    expect(spans(), '正向对照:这段字确实是化开进场的').toBeGreaterThan(0);

    // `ChatPane` 的 key 变了 = 整棵子树重挂;历史原样带过来
    rerender(<Prose key="seed-b" text={HISTORY} />);
    expect(visible()).toBe(HISTORY);
    expect(spans(), '重挂之后又化开了一遍 —— 就是用户看到的那一下').toBe(0);
  });

  it('重挂之后再来的新字仍然化开(重挂不能把这只 host 判死)', () => {
    const { rerender } = render(<Prose key="seed-b" text={HISTORY} />);
    rerender(<Prose key="seed-b" text={`${HISTORY}接着写`} />);
    expect(spans()).toBeGreaterThan(0);
  });
});

/* ── ③ 刷新页面:用户那张「已确认」摘要卡 ───────────────────────── */

const FORM = [
  '<question-form id="kami-doc-brief" title="确认一下这份文档">',
  JSON.stringify({
    questions: [
      { id: 'kind', label: '要制作哪种文档？', type: 'text' },
      { id: 'goal', label: '这份文档给谁看、希望达成什么目标？', type: 'text' },
      { id: 'source', label: '正文内容从哪里来？', type: 'text' },
    ],
  }),
  '</question-form>',
].join('\n');

const ANSWERS = [
  '[form answers — kami-doc-brief]',
  '- 要制作哪种文档？: 单页文档（推荐）',
  '- 这份文档给谁看、希望达成什么目标？: 都行',
  '- 正文内容从哪里来？: 我现在提供内容（推荐）',
].join('\n');

function historyMessage(text: string): ChatMessage {
  return {
    id: 'msg-answered',
    role: 'assistant',
    content: text,
    // 刷新页面时 run 还活着 —— `isAssistantMessageStreaming` 于是给这条消息
    // `streaming: true`,而正文早已经是完整的历史(见 ChatPane 的判据)。
    runStatus: 'running',
    startedAt: 1700000000,
    events: [{ kind: 'text', text } as NonNullable<ChatMessage['events']>[number]],
    producedFiles: [],
  } as unknown as ChatMessage;
}

function showAnswered(text: string, key?: string): ReturnType<typeof render> {
  return render(
    <AssistantMessage
      key={key}
      message={historyMessage(text)}
      streaming
      isLast
      projectId="proj-1"
      nextUserContent={ANSWERS}
    />,
  );
}

describe('刷新页面 —— 已答表单的「已确认」摘要卡', () => {
  it('首帧就是落定的卡:0 个 span,「已确认」和三行问答都在', () => {
    showAnswered(FORM);
    const card = screen.getByTestId('question-form-summary');
    // 正向对照:卡真的渲染出来了,不是「组件没渲染所以没有 span」
    expect(card.textContent).toContain('Confirmed');
    expect(card.textContent).toContain('单页文档（推荐）');
    expect(card.textContent).toContain('我现在提供内容（推荐）');
    expect(spans(card), '这张卡又走了一遍逐字化开 —— 用户报的就是这一下').toBe(0);
  });

  it('整条消息(含卡外的正文)首帧一个 span 都没有', () => {
    const { container } = showAnswered(`${FORM}\n\n这段正文在刷新之前就已经写完了。`);
    expect(container.textContent).toContain('这段正文在刷新之前就已经写完了');
    expect(spans(container)).toBe(0);
  });

  it('反向对照:挂载之后 agent 接着写的字照旧化开', () => {
    const { rerender, container } = showAnswered(`${FORM}\n\n开头。`);
    rerender(
      <AssistantMessage
        message={historyMessage(`${FORM}\n\n开头。接着这一句是此刻正在吐的。`)}
        streaming
        isLast
        projectId="proj-1"
        nextUserContent={ANSWERS}
      />,
    );
    expect(container.textContent).toContain('此刻正在吐的');
    expect(spans(container), '新字一个都不化开 = 修过头了,流式效果整个没了').toBeGreaterThan(0);
  });
});
