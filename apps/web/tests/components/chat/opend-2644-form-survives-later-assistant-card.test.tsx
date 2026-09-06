// @vitest-environment jsdom
/**
 * OPEND-2644 主症状:问卷还没提交,后面追加一条**独立的助手消息**(真机那次是
 * 宿主补发的 memory-applied 记忆卡),原问卷立刻失去交互。
 *
 * ── 真机形状(工单 定位结果,Beta 0.21.1-beta.7,会话 7f04b326)──────────
 * messages 表 position=3 是带 question-form 的 assistant 消息,position=4 直接是
 * memory-applied assistant 消息,**两者之间没有任何 user 消息**。那条记忆卡是
 * `ProjectView` 收到 `useMemoryWrittenCard` 的批次后自己 `appendConversationMessage`
 * 出来的,所以它没有 run_id / run_status / 耗时。
 *
 * ── 病灶是两处,缺一不可 ────────────────────────────────────────────
 *  1. `ChatPane` 的 `nextUserContentByAssistantId` 只配对**紧挨着**的下一条消息:
 *     `if (m.role === 'assistant' && next.role === 'user')`。记忆卡插在中间,
 *     配对就断了 —— 于是用户答完之后,问卷那条消息**看不见**自己的答案。
 *  2. `AssistantMessage` 的 `interactive={isLastAssistant}` 拿「是不是最后一条
 *     助手消息」当「用户有没有从这张表走过去」的判据。记忆卡一来,问卷就不是
 *     最后一条了,于是被锁住。
 *
 * **只改第 2 处会把「答不了」换成「答完了看不出来」**:用户确实能答了,但答案
 * 落在记忆卡后面,第 1 处仍然配不上,`parseSubmittedAnswers` 认不出来,表单永远
 * 收不成「已确认」摘要。本文件第二节就是钉这一条的——它是第 1 处没白改的证据。
 *
 * ── 为什么整条走真的 `ChatPane` ─────────────────────────────────────
 * 这两处一个在列表层、一个在消息层,分开各测各的会让「配对表改了但没接上」
 * 这类接线事故整块漏掉。所以这份文件从 `ChatPane` 进,喂真实形状的消息序列。
 */

// jsdom 没有 HTMLElement.prototype.scrollTo —— ChatPane 的滚动逻辑会碰它。
// 同 `ChatPane.jump-button-question-form.test.tsx` 的处置。
if (typeof HTMLElement.prototype.scrollTo !== 'function') {
  HTMLElement.prototype.scrollTo = function (options?: ScrollToOptions | number) {
    if (typeof options === 'object' && options !== null) {
      if (options.top !== undefined) this.scrollTop = options.top;
      if (options.left !== undefined) this.scrollLeft = options.left;
    }
  };
}

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ChatPane } from '../../../src/components/ChatPane';
import { memoryWrittenCardContent } from '../../../src/runtime/useMemoryWrittenCard';
import { formatFormAnswers, type QuestionForm } from '../../../src/artifacts/question-form';
import { en } from '../../../src/i18n/locales/en';
import type { ChatMessage } from '../../../src/types';

afterEach(() => cleanup());

const FORM_ID = 'defense-artifact';

const FORM_QUESTIONS = [
  {
    id: 'deliverable',
    label: 'What should I deliver',
    type: 'radio',
    options: ['Overview plus one runnable prototype', 'Overview only'],
    required: true,
  },
  { id: 'assets', label: 'Materials to work from', type: 'text', required: true },
];

const FORM_MARKUP = [
  'Two things before I start.',
  `<question-form id="${FORM_ID}" title="Defense brief">`,
  JSON.stringify({ questions: FORM_QUESTIONS }),
  '</question-form>',
].join('\n');

/** 用户答完之后真正发出去的那条文本 —— 走产线那支 `formatFormAnswers`,不手搓。 */
const SUBMITTED = formatFormAnswers(
  { id: FORM_ID, title: 'Defense brief', questions: FORM_QUESTIONS } as QuestionForm,
  { deliverable: 'Overview only', assets: 'the slide deck' },
);

function formTurn(): ChatMessage {
  return {
    id: 'assistant-question-form',
    role: 'assistant',
    content: FORM_MARKUP,
    createdAt: 1_700_000_000_000,
    startedAt: 1_700_000_000_000,
    endedAt: 1_700_000_003_000,
    runStatus: 'succeeded',
  };
}

/**
 * 宿主补发的记忆卡。正文用**产线那支**生成器(`memoryWrittenCardContent`),
 * 消息本身照 `ProjectView` 的写法:没有 runId / runStatus / startedAt。
 */
function memoryCardMessage(): ChatMessage {
  const content = memoryWrittenCardContent(
    {
      key: 'extraction-1',
      count: 2,
      entries: [
        { id: 'mem-1', name: 'Work profile', type: 'profile' },
        { id: 'mem-2', name: 'Prefers compact decks', type: 'rule' },
      ],
    },
    'Remembered 2 preferences',
  );
  return {
    id: 'assistant-memory-applied',
    role: 'assistant',
    content,
    createdAt: 1_700_000_004_000,
  };
}

function userMessage(id: string, content: string): ChatMessage {
  return { id, role: 'user', content, createdAt: 1_700_000_005_000 };
}

function renderChat(messages: ChatMessage[]) {
  return render(
    <ChatPane
      messages={messages}
      streaming={false}
      error={null}
      projectId="project-1"
      projectFiles={[]}
      onEnsureProject={async () => 'project-1'}
      onSend={() => {}}
      onStop={() => {}}
      conversations={[]}
      activeConversationId={null}
      onSelectConversation={() => {}}
      onDeleteConversation={() => {}}
      onSubmitQuestionForm={() => {}}
    />,
  );
}

function formCard(): HTMLElement {
  const form = document.querySelector<HTMLElement>(`[data-form-id="${FORM_ID}"]`);
  if (!form) throw new Error('夹具里没有问卷卡 —— 先修夹具,别改断言');
  return form;
}

/**
 * 这张表**还能不能填**。
 *
 * 两半:卡片自己的 `question-form-locked`(它就是 `locked` 的直接投影),
 * 加上答题控件确实还点得动。
 *
 * ⚠️ **不能**拿「卡片上所有 button 都没 disabled」当判据 —— 底栏那颗「下一步」
 * 在必填项填完之前本来就是灰的(`ready` 为假),那是另一件事。混进来会把一张
 * 完全可填的表读成「锁住了」(这份文件第一版就是这么误判的,dump 出来的 DOM 是
 * `class="question-form"` + 只有 `Next step` disabled)。所以底栏排除在外。
 */
function formIsAnswerable(): boolean {
  const form = formCard();
  if (form.classList.contains('question-form-locked')) return false;
  const answerControls = [
    ...form.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, textarea, button'),
  ].filter((el) => !el.closest('.question-form-foot'));
  if (answerControls.length === 0) throw new Error('问卷卡上一个答题控件都没有 —— 夹具变了');
  return answerControls.every((el) => !el.disabled);
}

describe('OPEND-2644 记忆卡插在问卷后面', () => {
  it('问卷还没提交,后面来了一条独立助手消息 —— 它仍然可以填', () => {
    renderChat([formTurn(), memoryCardMessage()]);

    // 记忆卡确实在(不是夹具没渲染出来,那样下面的断言会假绿)
    expect(document.querySelector('[data-od-card="memory-applied"]')).not.toBeNull();

    expect(formIsAnswerable(), '问卷被后来的助手消息锁住了(OPEND-2644)').toBe(true);
    expect(screen.queryByText(en['qf.answered'])).toBeNull();
    expect(
      screen.queryByText(en['qf.lockedPrev']),
      '它不是「此前回合的表单」—— 用户根本还没从这张表走过去',
    ).toBeNull();
  });

  it('答完之后,答案跨过记忆卡也要收成「已确认」摘要', () => {
    /*
     * 这一条**只有第 1 处(ChatPane 的配对)修了才会绿**。
     * 少了它,问卷永远停在「还能填」的样子,用户看不出自己已经答过 ——
     * 那正是「只改第 2 处」会掉进去的坑。
     */
    renderChat([formTurn(), memoryCardMessage(), userMessage('user-answers', SUBMITTED)]);

    const summary = document.querySelector('[data-testid="question-form-summary"]');
    expect(summary, '答案落在记忆卡后面,问卷就认不出它了(OPEND-2644)').not.toBeNull();
    expect(summary!.textContent).toContain('Overview only');
    expect(summary!.textContent).toContain('the slide deck');
  });

  it('没有中间卡的老路照旧:答案紧跟在问卷后面,一样收成摘要', () => {
    // 第 1 处的改动不许把原来就好使的那条路弄坏
    renderChat([formTurn(), userMessage('user-answers', SUBMITTED)]);

    const summary = document.querySelector('[data-testid="question-form-summary"]');
    expect(summary).not.toBeNull();
    expect(summary!.textContent).toContain('Overview only');
  });

  it('用户真的走过去了(答了别的话)—— 那张没答的表仍旧锁住,并说明它来自此前的回合', () => {
    /*
     * 反向那一半。没有这条,第 2 处可以退化成「永远可交互」,把历史里所有没答完的
     * 问卷都重新打开 —— 而那种退化在只看正向用例的套件里是全绿的。
     * 判据是「用户有没有从这张表走过去」,不是「后面有没有别的消息」。
     */
    renderChat([
      formTurn(),
      memoryCardMessage(),
      userMessage('user-other', 'never mind, just start with the overview'),
    ]);

    expect(formIsAnswerable(), '用户已经走过去了,这张表不该还能填').toBe(false);
    expect(screen.getByText(en['qf.lockedPrev'])).toBeTruthy();
    expect(screen.queryByText(en['qf.answered']), '没提交过就不许说「已回答」').toBeNull();
  });
});
