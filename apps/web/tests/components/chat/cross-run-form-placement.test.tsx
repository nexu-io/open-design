// @vitest-environment jsdom
/**
 * 跨轮策略任务里,「已确认」要落在**它实际发生的位置**(OPEND-2592)。
 *
 * 一次「先问后做」的会话是两个物理 run:run 0 跑发现、末尾抛一张 `<question-form>`;
 * 用户当场回答;run 1 拿着答案继续干活。`foldStrategyTaskTurns` 把两个 run 折进
 * **同一条**助手消息 —— 事件流首尾相接,所以屏幕上会出现两张执行壳。
 *
 * 用户裁决(2026-09-02):
 *   「如果是我中间时回答的,那就得放中间呢,不能放最底下」
 *
 * 也就是屏幕上从上到下必须是:
 *   run 0 的壳 → 已确认 → run 1 的壳
 *
 * 这一条只能用**真实 DOM 顺序**钉:三个东西同时存在正是出 bug 时的状态,
 * 断言「都在」会当场假绿。下面按 `querySelectorAll` 的文档序取出这三个锚点。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import type { ChatMessage, PersistedAgentEvent } from '@open-design/contracts';
import { I18nProvider } from '../../../src/i18n';
import { AssistantMessage } from '../../../src/components/AssistantMessage';
import { foldStrategyTaskTurns } from '../../../src/components/ChatPane';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const FORM_ID = 'collage';
const FORM = `<question-form>${JSON.stringify({
  id: FORM_ID,
  title: '还有两件事要确认',
  questions: [
    {
      id: 'q1',
      label: '16 张拼贴素材采用哪种策略?',
      type: 'radio',
      options: [{ label: 'gpt-image-2 生成', value: 'gen' }],
    },
    { id: 'q2', label: '页面文案语言?', type: 'radio', options: [{ label: '中文', value: 'zh' }] },
  ],
})}</question-form>`;

/** 用户在**两个 run 中间**提交的那条答案(`formatFormAnswers` 的形状) */
const ANSWERS = [
  `[form answers — ${FORM_ID}]`,
  '- 16 张拼贴素材采用哪种策略?: gpt-image-2 生成 [value: gen]',
  '- 页面文案语言?: 中文 [value: zh]',
].join('\n');

/** run 0:发现 —— 读一个文件,末尾抛表单 */
const RUN0: PersistedAgentEvent[] = [
  { kind: 'tool_use', id: 'r0t1', name: 'Read', input: { file_path: 'brand-atelier.md' }, startedAt: 0 },
  { kind: 'tool_result', toolUseId: 'r0t1', content: 'ok', isError: false, completedAt: 400 },
  { kind: 'text', text: `我先看了品牌资料。\n\n${FORM}` },
] as PersistedAgentEvent[];

/** run 1:拿到答案之后开清单继续干,清单关掉后收尾 */
const RUN1: PersistedAgentEvent[] = [
  {
    kind: 'tool_use',
    id: 'r1t0',
    name: 'TodoWrite',
    input: { todos: [{ content: '铺首页版式', status: 'in_progress' }] },
    startedAt: 1_000,
  },
  { kind: 'tool_result', toolUseId: 'r1t0', content: 'ok', isError: false, completedAt: 1_100 },
  { kind: 'tool_use', id: 'r1t1', name: 'Write', input: { file_path: 'homepage-hero.html' }, startedAt: 1_200 },
  { kind: 'tool_result', toolUseId: 'r1t1', content: 'ok', isError: false, completedAt: 1_600 },
  {
    kind: 'tool_use',
    id: 'r1t2',
    name: 'TodoWrite',
    input: { todos: [{ content: '铺首页版式', status: 'completed' }] },
    startedAt: 1_700,
  },
  { kind: 'tool_result', toolUseId: 'r1t2', content: 'ok', isError: false, completedAt: 1_800 },
  { kind: 'text', text: '目标:以 Atelier Zero 语言重做首页。' },
] as PersistedAgentEvent[];

function foldedTurn(): ChatMessage {
  const folded = foldStrategyTaskTurns([
    { id: 'u1', role: 'user', content: '使用 Atelier Zero 视觉语言重做首页' } as ChatMessage,
    {
      id: 'a-discovery',
      role: 'assistant',
      content: `我先看了品牌资料。\n\n${FORM}`,
      createdAt: 1_756_000_000_000,
      runId: 'run-0',
      runStatus: 'succeeded',
      events: RUN0,
      strategyTaskExecutionId: 'odnext_1',
      strategyTaskRunIndex: 0,
    } as ChatMessage,
    { id: 'u2', role: 'user', content: ANSWERS } as ChatMessage,
    {
      id: 'a-production',
      role: 'assistant',
      content: '目标:以 Atelier Zero 语言重做首页。',
      createdAt: 1_756_000_100_000,
      endedAt: 1_756_000_200_000,
      runId: 'run-1',
      runStatus: 'succeeded',
      events: RUN1,
      strategyTaskExecutionId: 'odnext_1',
      strategyTaskRunIndex: 1,
    } as ChatMessage,
  ]);
  const turn = folded.find((m) => m.role === 'assistant' && m.id === 'a-discovery');
  if (!turn) throw new Error('两个 run 没有折进同一条助手消息');
  return turn;
}

/**
 * 屏幕上从上到下的锚点序列。
 *
 * 壳按 `.assistant-flow` 的**直接子节点**取(壳内还有嵌套的 `details`);
 * 每张壳先掀开,好按内容认出它是哪一个 run 的 —— 掀开不改变文档序。
 */
function flowOrder(container: HTMLElement): string[] {
  const flow = container.querySelector<HTMLElement>('.assistant-flow');
  if (!flow) throw new Error('没有渲染出 assistant-flow');
  for (const shell of flow.querySelectorAll<HTMLDetailsElement>(':scope > details')) {
    const summary = shell.querySelector<HTMLElement>(':scope > summary');
    if (summary) fireEvent.click(summary);
  }
  return [...flow.querySelectorAll('details, [data-testid="question-form-summary"]')]
    .filter((el) => el.tagName !== 'DETAILS' || el.parentElement === flow)
    .map((el) => {
      if (el.tagName !== 'DETAILS') return 'answered';
      const text = el.textContent ?? '';
      if (text.includes('brand-atelier.md')) return 'shell:discovery';
      if (text.includes('铺首页版式')) return 'shell:production';
      return 'shell:?';
    });
}

describe('跨轮策略任务 · 「已确认」的落点', () => {
  it('run 0 的壳 → 已确认 → run 1 的壳', () => {
    const { container } = render(
      <I18nProvider initial="zh-CN">
        <AssistantMessage message={foldedTurn()} streaming={false} nextUserContent={ANSWERS} />
      </I18nProvider>,
    );
    const order = flowOrder(container);
    // 先证锚点都认出来了 —— 认不出的话下面那条顺序断言会因为标签错位而空转
    expect(order).toContain('shell:discovery');
    expect(order).toContain('shell:production');
    expect(order).toContain('answered');
    expect(order).not.toContain('shell:?');
    // 真正的判据:文档序
    expect(order).toEqual(['shell:discovery', 'answered', 'shell:production']);
  });
});
