// @vitest-environment jsdom
/**
 * OPEND-2642(回归):颜色题提交之后,聊天里那条「已确认」摘要只剩 Hex 文本,
 * 色块没了。
 *
 * ── 为什么 OPEND-2579 修了一遍还会回来 ──────────────────────────────
 * 「已确认」这块**有两份实现**:
 *   1. `QuestionForm.tsx` 的 `AnsweredSummary` —— 走 `<AnsweredValue>`,画色块;
 *   2. `AssistantMessage.tsx` 里 `FormBlock` 的历史回放块 —— 自己写 `<b>{value}</b>`。
 * 2579 只改了第 1 份,它的用例也只渲染 `QuestionFormView` 并直接喂
 * `submittedAnswers`(`question-form-color-picker.test.tsx:275`)。
 *
 * 而 `submittedAnswers` 这个 prop **产线上没有任何调用点**(仓库里搜得到的传参方
 * 全是测试)。用户在会话里看到的那块「已确认」永远是第 2 份:
 * 用户答完 → 下一条 user 消息落库 → `parseSubmittedAnswers` 认出来 →
 * `FormBlock` 走 `if (submittedFromHistory)` 那一支。所以 2579 的修复
 * 一次都没有出现在用户屏幕上,它的用例也照不见这条回归。
 *
 * 这条用例因此**从 `AssistantMessage` 进**,走产线那条回放路径。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { AssistantMessage } from '../../../src/components/AssistantMessage';
import { formatFormAnswers, type QuestionForm } from '../../../src/artifacts/question-form';
import type { ChatMessage } from '../../../src/types';

afterEach(() => cleanup());

const FORM_ID = 'brand-brief';

/** 表单原文(模型发出来的形态)与解析后的结构必须是同一份,所以两边都由它推出来。 */
const FORM_BODY = {
  questions: [
    { id: 'accent', label: 'Accent color', type: 'color' },
    { id: 'density', label: 'Layout density', type: 'range', min: 1, max: 3 },
  ],
};

const FORM_MARKUP = [
  'One thing before I start.',
  `<question-form id="${FORM_ID}" title="Brand brief">`,
  JSON.stringify(FORM_BODY),
  '</question-form>',
].join('\n');

/** 用户答完之后真正发出去的那条文本 —— 用产线那支 `formatFormAnswers` 生成,不手搓。 */
const SUBMITTED = formatFormAnswers(
  { id: FORM_ID, title: 'Brand brief', questions: FORM_BODY.questions } as QuestionForm,
  { accent: '#1b4cde', density: '2' },
);

function clarificationTurn(): ChatMessage {
  return {
    id: 'assistant-color-form',
    role: 'assistant',
    content: FORM_MARKUP,
    events: [{ kind: 'text', text: FORM_MARKUP }],
    runStatus: 'succeeded',
    startedAt: 1_788_697_378_704,
    endedAt: 1_788_697_434_968,
  };
}

function renderAnsweredTurn(): void {
  render(
    <AssistantMessage
      message={clarificationTurn()}
      nextUserContent={SUBMITTED}
      streaming={false}
      projectId="project-1"
      conversationId="conv-1"
      isLast
    />,
  );
}

describe('OPEND-2642 会话里的「已确认」摘要', () => {
  it('事实基线:发出去的那条文本里颜色就是规范化后的 Hex', () => {
    expect(SUBMITTED).toContain(`[form answers — ${FORM_ID}]`);
    expect(SUBMITTED).toContain('- Accent color: #1b4cde');
  });

  it('颜色那一行带色块,色块的颜色和 Hex 文本是同一个值', () => {
    renderAnsweredTurn();
    const summary = document.querySelector<HTMLElement>('[data-testid="question-form-summary"]');
    expect(summary, '没渲染出历史回放的已确认摘要 —— 夹具或回放路径变了,先修这里').not.toBeNull();

    const swatch = summary!.querySelector<HTMLElement>('.color-answer');
    expect(swatch, '已确认摘要里的颜色答案没有色块(OPEND-2642)').not.toBeNull();
    expect(swatch!.style.getPropertyValue('--answer-color')).toBe('#1b4cde');
    expect(swatch!.querySelector('i'), '色块那颗 <i> 不在').not.toBeNull();
    expect(swatch!.querySelector('b')?.textContent).toBe('#1b4cde');
  });

  it('颜色和数值这类短答案走 `.ab.mod-value` / `.al li`,和另一份实现同款', () => {
    renderAnsweredTurn();
    const summary = document.querySelector<HTMLElement>('[data-testid="question-form-summary"]')!;
    // 两道题 → 走列表那一支,颜色仍旧挂在自己那一行上
    const row = summary.querySelector('.color-answer')?.closest('li, .ab');
    expect(row?.textContent).toContain('Accent color');
    expect(row?.textContent).toContain('#1b4cde');
  });

  it('规范不出来的历史值照原样念,不给它编一块颜色', () => {
    render(
      <AssistantMessage
        message={clarificationTurn()}
        nextUserContent={[
          `[form answers — ${FORM_ID}]`,
          '- Accent color: whatever the brand book says',
        ].join('\n')}
        streaming={false}
        projectId="project-1"
        conversationId="conv-1"
        isLast
      />,
    );
    const summary = document.querySelector<HTMLElement>('[data-testid="question-form-summary"]')!;
    expect(summary.textContent).toContain('whatever the brand book says');
    expect(summary.querySelector('.color-answer'), '给不成颜色的值编了一块色').toBeNull();
  });
});
