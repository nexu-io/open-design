// @vitest-environment jsdom

/*
 * 【不变量】填完 question-form 开出去的那一轮,**发送失败也必须留在流水里**。
 *
 * QA(AMR)报的形状:答完表单 → 屏幕上确实新开了一轮 → 过一会儿那一轮整个
 * 没了,既没有报错也没有可以重来的入口。
 *
 * 因果链(三段都在代码里对得上):
 *
 *   1. `ProjectView.handleSend` 先把 `user + assistant(running)` 画上屏,再去
 *      `POST /api/runs`。用户看见的「新开的那一轮」就是这一对乐观行。
 *   2. `POST /api/runs` 没能给回 runId 时,流的 `onError` 走
 *      `config.mode === 'daemon' && !currentRunId` 那一支:**删掉 assistant 那一行**
 *      (从没有过 agent 进程,留着它等于伪造一轮),把用户那一行盖成
 *      `sendFailed: true`,并且显式 `setError(null)` —— 不出全局横幅。
 *      于是「这一轮为什么没了」的**唯一凭据**就只剩那条用户消息,以及它上面
 *      常驻的那颗「重试」。
 *   3. `buildChatRenderItems` 无条件跳过所有 `^[form answers` 开头的用户消息
 *      (#5496:答案已经以摘要形式长在上一条助手消息上,再画一遍是把机器载荷
 *      摆到用户脸上)。这条规则把第 2 步留下的**那唯一一份凭据也一起收走了**。
 *
 * 净效果:普通输入框发失败 → 气泡还在、重试还在;表单答案发失败 → 屏幕上
 * 一个字都不剩,而表单自己已经落成「已作答」并锁死(`handleSend` 在建流那一刻
 * 就返回了 `true`,`FormBlock` 据此 `acceptSubmission()`)。用户既看不到原因,
 * 也回不去重来。
 *
 * 这里钉的是「失败的那一轮必须留下」,不是钉现状。反向锚点(第 3、4 条)钉的是
 * **该收走的仍然要收走**:成功交付的表单答案照旧不画用户气泡,并且被放出来的
 * 那一条也不许把 `[form answers — <id>]` 这种机器载荷摆到用户脸上。
 */

// Polyfill scrollTo for jsdom (not available in jsdom's HTMLElement).
if (typeof HTMLElement.prototype.scrollTo !== 'function') {
  HTMLElement.prototype.scrollTo = function (
    options?: ScrollToOptions | number,
    _y?: number,
  ) {
    if (typeof options === 'object' && options !== null) {
      if (options.top !== undefined) this.scrollTop = options.top;
      if (options.left !== undefined) this.scrollLeft = options.left;
    }
  };
}

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ChatPane } from '../../src/components/ChatPane';
import type { ChatMessage } from '../../src/types';

const FORM_ID = 'discovery';
const ANSWER_BODY = '- What are we building? A pricing page';
const ANSWER_CONTENT = `[form answers — ${FORM_ID}]\n${ANSWER_BODY}`;

function questionFormAssistant(): ChatMessage {
  const formContent = [
    `<question-form id="${FORM_ID}" title="Quick check">`,
    JSON.stringify({
      questions: [{ id: 'a', label: 'What are we building?', type: 'text' }],
    }),
    '</question-form>',
  ].join('\n');
  return {
    id: 'assistant-1',
    role: 'assistant',
    content: formContent,
    createdAt: 1_700_000_000_000,
    startedAt: 1_700_000_000_000,
    endedAt: 1_700_000_003_000,
    runStatus: 'succeeded',
  };
}

function formAnswerUser(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'user-form-answer',
    role: 'user',
    content: ANSWER_CONTENT,
    createdAt: 1_700_000_004_000,
    ...overrides,
  };
}

function chatPaneEl(messages: ChatMessage[]) {
  return (
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
      onResendUserMessage={() => {}}
    />
  );
}

afterEach(() => {
  cleanup();
});

describe('a question-form answer whose send died before a run existed', () => {
  /*
   * 判据自检:同一套夹具、同一颗按钮,换成普通用户消息**今天就是绿的**。
   * 没有这一条,下面那条红说明不了是「表单答案被藏了」还是「这个测试压根
   * 量不到重试按钮」。
   */
  it('control — an ordinary failed send keeps its bubble and its Retry', () => {
    render(
      chatPaneEl([
        questionFormAssistant(),
        formAnswerUser({
          id: 'user-plain',
          content: 'Make the hero bigger',
          sendFailed: true,
        }),
      ]),
    );

    expect(screen.getByText('Make the hero bigger')).toBeTruthy();
    expect(screen.getByTestId('user-send-failed')).toBeTruthy();
  });

  it('keeps the failed turn on screen with a way to send it again', () => {
    render(chatPaneEl([questionFormAssistant(), formAnswerUser({ sendFailed: true })]));

    // 这一轮必须还在:用户看得见自己答了什么。
    expect(screen.getByText(new RegExp(ANSWER_BODY.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeTruthy();
    // 并且回得去:失败那一行上常驻的「重试」是唯一的复原入口。
    expect(screen.getByTestId('user-send-failed')).toBeTruthy();
  });

  it('does not put the machine payload header in front of the user', () => {
    render(chatPaneEl([questionFormAssistant(), formAnswerUser({ sendFailed: true })]));

    expect(screen.queryByText(new RegExp(`\\[form answers — ${FORM_ID}\\]`))).toBeNull();
  });

  /*
   * 反向锚点:**该收走的仍然要收走**。答案送到了的那一轮,用户气泡照旧不画
   * (#5496 —— 摘要已经长在上一条助手消息上)。修复不许退化成「什么都不藏了」。
   */
  it('reverse anchor — a delivered answer still draws no user bubble', () => {
    render(chatPaneEl([questionFormAssistant(), formAnswerUser()]));

    expect(screen.queryByTestId('user-send-failed')).toBeNull();
    expect(screen.queryByText(new RegExp(ANSWER_BODY.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeNull();
    expect(screen.queryByText(new RegExp(`\\[form answers — ${FORM_ID}\\]`))).toBeNull();
  });
});
