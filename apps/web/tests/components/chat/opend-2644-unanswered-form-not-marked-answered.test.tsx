// @vitest-environment jsdom
/**
 * OPEND-2644:问卷一个字都没答,卡头却挂着「已回答」。
 *
 * ── 真机形状(工单 定位结果,Beta 0.21.1-beta.7,会话 7f04b326)──────────
 * messages 表 position=3 是带 question-form 的 assistant 消息,position=4 直接是
 * 一条 memory-applied 的 assistant 消息 —— **两者之间没有任何 user 消息**。
 * 那条记忆卡是宿主自己补发的(`ProjectView` 收到 `useMemoryWrittenCard` 的批次后
 * `appendConversationMessage` 一条新的 assistant 消息),不是模型说的话。
 *
 * 于是问卷那条消息不再是「最后一条助手消息」,`FormBlock` 的
 * `interactive={isLastAssistant}` 变假 → `QuestionForm` 的
 * `locked = !interactive || …` 为真 → 卡头照 `locked` 直接挂 `qf.answered`。
 *
 * ── 这份文件守的是哪一半 ────────────────────────────────────────────
 * 「已回答」是一句**关于用户做过什么**的陈述,只能由真实提交答案兑现;
 * 「这张表单锁住了」是另一回事(用户已经从这里走过去了、宿主不收提交)。
 * 两者过去共用一个 `locked`,所以一把锁上去就替用户宣布他答过了 ——
 * 连默认选中的那个选项都被当成「他确认过的答案」。
 *
 * 主症状那一半(**没提交就不该锁住**)按消息序列整条走真的 `ChatPane`,在
 * `opend-2644-form-survives-later-assistant-card.test.tsx`。这份文件是它的
 * 消息层补充:只喂 `AssistantMessage` 的 props,把「锁住」和「答过」这两档
 * 逐个钉死。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { AssistantMessage } from '../../../src/components/AssistantMessage';
import { QuestionFormView } from '../../../src/components/QuestionForm';
import { formatFormAnswers, type QuestionForm } from '../../../src/artifacts/question-form';
import { en } from '../../../src/i18n/locales/en';
import type { ChatMessage } from '../../../src/types';

afterEach(() => cleanup());

const FORM_ID = 'defense-artifact';

const FORM_BODY = {
  questions: [
    {
      id: 'deliverable',
      label: 'What should I deliver',
      type: 'radio',
      // 真机那张表的默认项就是这么被显示成「已选中」的
      options: ['Overview plus one runnable prototype', 'Overview only'],
      required: true,
    },
    { id: 'assets', label: 'Materials to work from', type: 'text', required: true },
  ],
};

const FORM_MARKUP = [
  'Two things before I start.',
  `<question-form id="${FORM_ID}" title="Defense brief">`,
  JSON.stringify(FORM_BODY),
  '</question-form>',
].join('\n');

function clarificationTurn(): ChatMessage {
  return {
    id: 'assistant-question-form',
    role: 'assistant',
    content: FORM_MARKUP,
    events: [{ kind: 'text', text: FORM_MARKUP }],
    runStatus: 'succeeded',
    startedAt: 1_788_697_378_704,
    endedAt: 1_788_697_434_968,
  };
}

/**
 * 记忆卡落在后面之后,问卷那条消息的处境:不再是最后一条助手消息
 * (`isLast={false}`),而它和记忆卡之间没有 user 消息,所以 `nextUserContent`
 * 也是空的。
 */
function renderFormDemotedByLaterAssistantCard(): void {
  render(
    <AssistantMessage
      message={clarificationTurn()}
      streaming={false}
      projectId="project-1"
      conversationId="conv-1"
      isLast={false}
      onSubmitQuestionForm={() => true}
    />,
  );
}

describe('OPEND-2644 未提交的问卷', () => {
  it('后面追加一条记忆卡之后,卡头不再宣布「已回答」', () => {
    renderFormDemotedByLaterAssistantCard();
    // 表单确实还在(不是整块没渲染出来,那样断言会假绿)
    expect(document.querySelector('[data-form-id]')).not.toBeNull();
    expect(
      screen.queryByText(en['qf.answered']),
      '一个答案都没提交,却挂着「已回答」(OPEND-2644)',
    ).toBeNull();
  });

  it('也没有那句「此前回合的表单」—— 用户还没从这张表走过去', () => {
    // 后面排着一条助手消息 ≠ 用户走过去了。那句说明的触发条件在下一节。
    renderFormDemotedByLaterAssistantCard();
    expect(screen.queryByText(en['qf.lockedPrev'])).toBeNull();
    expect(screen.queryByText(en['qf.lockedSubmitted'])).toBeNull();
  });

  it('用户答了别的话之后,它才收成「此前回合的表单」—— 锁住和答过仍是两档', () => {
    /*
     * 「锁住」的正确触发条件:这条消息之后用户**确实说过话**了
     * (`nextUserContent` 有值,且不是这张表的答案)。
     * 没有这一条,`interactive` 可以退化成「永远为真」,把历史里所有没答完的
     * 问卷重新打开 —— 那种退化在只看正向用例的套件里是全绿的。
     */
    render(
      <AssistantMessage
        message={clarificationTurn()}
        nextUserContent="never mind, just start with the overview"
        streaming={false}
        projectId="project-1"
        conversationId="conv-1"
        isLast={false}
        onSubmitQuestionForm={() => true}
      />,
    );
    expect(screen.getByText(en['qf.lockedPrev'])).toBeTruthy();
    expect(screen.queryByText(en['qf.lockedSubmitted'])).toBeNull();
    // 锁住了,但仍旧不许说「已回答」—— 这正是本文件第一节那条判据的另一面
    expect(screen.queryByText(en['qf.answered'])).toBeNull();
  });

  it('真的答过的那一档照旧收成「已确认」摘要,且同样不挂「已回答」', () => {
    const submitted = formatFormAnswers(
      { id: FORM_ID, title: 'Defense brief', questions: FORM_BODY.questions } as QuestionForm,
      { deliverable: 'Overview only', assets: 'the slide deck' },
    );
    render(
      <AssistantMessage
        message={clarificationTurn()}
        nextUserContent={submitted}
        streaming={false}
        projectId="project-1"
        conversationId="conv-1"
        isLast
        onSubmitQuestionForm={() => true}
      />,
    );
    const summary = document.querySelector('[data-testid="question-form-summary"]');
    expect(summary, '答过的表单没有收成摘要').not.toBeNull();
    expect(summary!.textContent).toContain('Overview only');
    expect(screen.queryByText(en['qf.answered'])).toBeNull();
  });
});

/*
 * 反向那一半:**回填进可编辑表单**的历史答案仍旧要挂「已回答」。
 *
 * 这一档是 `submittedAnswers` 给了、但 `interactive` 为真 —— 表单回填之后还能改
 * (老用例「renders restored legacy visual tone answers on their matching cards」
 * 就在这条路上)。没有这一条,上面的修法可以退化成「把这枚 pill 删掉」,
 * 而那种退化在只看正向用例的套件里是全绿的。
 */
describe('回填了历史答案、但仍可编辑的表单', () => {
  it('照旧挂「已回答」—— 它确实有真实提交过的答案', () => {
    render(
      <QuestionFormView
        form={{ id: FORM_ID, title: 'Defense brief', questions: FORM_BODY.questions } as QuestionForm}
        interactive
        submittedAnswers={{ deliverable: 'Overview only' }}
        onSubmit={() => undefined}
      />,
    );
    expect(screen.getByText(en['qf.answered'])).toBeTruthy();
    expect(screen.getByText(en['qf.lockedSubmitted'])).toBeTruthy();
  });
});
