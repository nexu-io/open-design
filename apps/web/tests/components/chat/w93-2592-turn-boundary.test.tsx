// @vitest-environment jsdom
/**
 * W93 验证用红测 —— OPEND-2592
 * 「多轮会话未展示第二轮用户记录,两个已完成状态连续堆叠」
 *
 * 票名里是**两件事**,下面分开钉:
 *   半 A  第二轮的用户记录没出现在轮次交界处 —— 用户在两个 run 中间答的那张表单,
 *         收口(「已确认」)被甩到了最底下;
 *   半 B  两个「已完成」的壳头直接贴在一起,中间什么都没有。
 *
 * 夹具照抄票上的截图(使用 AtelierZero 视觉语言):一次「先问后做」的策略任务,
 * run 0 跑发现、末尾抛 `<question-form>`;用户当场回答;run 1 拿答案继续干。
 * `foldStrategyTaskTurns` 把两个 run 折进同一条助手消息,所以屏幕上两张壳。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import type { ChatMessage, PersistedAgentEvent } from '@open-design/contracts';
import { I18nProvider } from '../../../src/i18n';
import { AssistantMessage } from '../../../src/components/AssistantMessage';
import { foldStrategyTaskTurns } from '../../../src/components/ChatPane';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const FORM_ID = 'collage-strategy';
const FORM = `<question-form>${JSON.stringify({
  id: FORM_ID,
  title: '还有两件事要确认',
  questions: [
    {
      id: 'q1',
      label: '16 张拼贴素材采用哪种策略?',
      type: 'radio',
      options: [{ label: 'gpt-image-2 生成(约 6 分钟,需要本机配置 FAL 密钥)', value: 'gen' }],
    },
    {
      id: 'q2',
      label: '页面文案语言?',
      type: 'radio',
      options: [{ label: '中文(默认,随当前 locale)', value: 'zh' }],
    },
  ],
})}</question-form>`;

/** 用户在**两个 run 中间**提交的那条答案(`formatFormAnswers` 的形状) */
const ANSWERS = [
  `[form answers — ${FORM_ID}]`,
  '- 16 张拼贴素材采用哪种策略?: gpt-image-2 生成(约 6 分钟,需要本机配置 FAL 密钥) [value: gen]',
  '- 页面文案语言?: 中文(默认,随当前 locale) [value: zh]',
].join('\n');

/** run 0 —— 截图里那张「已完成 5m 26s」 */
const RUN0: PersistedAgentEvent[] = [
  { kind: 'tool_use', id: 'r0t1', name: 'Read', input: { file_path: 'inputs.json' }, startedAt: 0 },
  { kind: 'tool_result', toolUseId: 'r0t1', content: 'ok', isError: false, completedAt: 400 },
  { kind: 'text', text: `我先看了品牌简报 inputs.json。\n\n${FORM}` },
] as PersistedAgentEvent[];

/** run 1 —— 截图里那张「已完成 25m 37s」 */
const RUN1: PersistedAgentEvent[] = [
  {
    kind: 'tool_use',
    id: 'r1t0',
    name: 'TodoWrite',
    input: { todos: [{ content: '铺单页编辑落地页版式', status: 'in_progress' }] },
    startedAt: 1_000,
  },
  { kind: 'tool_use', id: 'r1t1', name: 'Write', input: { file_path: 'index.html' }, startedAt: 1_200 },
  { kind: 'tool_result', toolUseId: 'r1t1', content: 'ok', isError: false, completedAt: 1_600 },
  {
    kind: 'tool_use',
    id: 'r1t2',
    name: 'TodoWrite',
    input: { todos: [{ content: '铺单页编辑落地页版式', status: 'completed' }] },
    startedAt: 1_700,
  },
  { kind: 'text', text: '目标:以 Atelier Zero 语言产出中文单页编辑落地页,单一 index.html 入口。' },
] as PersistedAgentEvent[];

function foldedTurn(): ChatMessage {
  const folded = foldStrategyTaskTurns([
    { id: 'u1', role: 'user', content: '使用 Atelier Zero 视觉语言生成单页编辑落地页' } as ChatMessage,
    {
      id: 'a-discovery',
      role: 'assistant',
      content: `我先看了品牌简报 inputs.json。\n\n${FORM}`,
      createdAt: 1_756_000_000_000,
      runId: 'run-0',
      runStatus: 'succeeded',
      events: RUN0,
      strategyTaskExecutionId: 'odnext_2592',
      strategyTaskRunIndex: 0,
    } as ChatMessage,
    { id: 'u2', role: 'user', content: ANSWERS } as ChatMessage,
    {
      id: 'a-production',
      role: 'assistant',
      content: '目标:以 Atelier Zero 语言产出中文单页编辑落地页,单一 index.html 入口。',
      createdAt: 1_756_000_326_000,
      endedAt: 1_756_001_863_000,
      runId: 'run-1',
      runStatus: 'succeeded',
      events: RUN1,
      strategyTaskExecutionId: 'odnext_2592',
      strategyTaskRunIndex: 1,
    } as ChatMessage,
  ]);
  const turn = folded.find((m) => m.role === 'assistant' && m.id === 'a-discovery');
  if (!turn) throw new Error('两个 run 没有折进同一条助手消息');
  return turn;
}

/**
 * 屏幕上从上到下的锚点。
 *
 * 壳按 `.assistant-flow` 的**直接子节点**取(壳里还嵌着别的 `details`);
 * 每张壳先掀开,好按内容认出它是哪一个 run —— 掀开不改变文档序。
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
      if (el.tagName !== 'DETAILS') return '第二轮用户记录';
      const text = el.textContent ?? '';
      if (text.includes('inputs.json')) return '壳:第一轮';
      if (text.includes('铺单页编辑落地页版式')) return '壳:第二轮';
      return '壳:?';
    });
}

function renderTurn() {
  return render(
    <I18nProvider initial="zh-CN">
      <AssistantMessage message={foldedTurn()} streaming={false} nextUserContent={ANSWERS} />
    </I18nProvider>,
  );
}

describe('OPEND-2592 · 多轮会话的轮次交界', () => {
  it('先证量法看得见:两张壳、一条用户记录都在,且都认得出来', () => {
    const order = flowOrder(renderTurn().container);
    expect(order).toContain('壳:第一轮');
    expect(order).toContain('壳:第二轮');
    expect(order).toContain('第二轮用户记录');
    // 认不出的壳会让下面两条断言空转
    expect(order).not.toContain('壳:?');
  });

  it('半 A:第二轮的用户记录出现在两张壳中间,不在最底下', () => {
    const order = flowOrder(renderTurn().container);
    const answered = order.indexOf('第二轮用户记录');
    expect(answered).toBeGreaterThan(order.indexOf('壳:第一轮'));
    expect(answered).toBeLessThan(order.indexOf('壳:第二轮'));
  });

  it('半 B:两个「已完成」不许连续堆叠 —— 中间隔着那条用户记录', () => {
    const { container } = renderTurn();
    // 先证真有两个「已完成」壳头,否则「不相邻」是一句空话
    const heads = [...container.querySelectorAll('.assistant-flow > details > summary')]
      .map((el) => el.textContent ?? '')
      .filter((tx) => tx.includes('已完成'));
    expect(heads).toHaveLength(2);

    const order = flowOrder(container);
    const adjacentShells = order.some(
      (kind, i) => kind.startsWith('壳:') && (order[i + 1] ?? '').startsWith('壳:'),
    );
    expect(adjacentShells).toBe(false);
  });

  it('合起来就是屏幕上从上到下的那一串', () => {
    expect(flowOrder(renderTurn().container))
      .toEqual(['壳:第一轮', '第二轮用户记录', '壳:第二轮']);
  });
});
