// @vitest-environment jsdom

/*
 * 一条**成功**的澄清回合,在用户答完表单之后,页脚改口说它「已停止」。
 *
 * 真机证据(打包版 beta 0.21.1-beta.7,诊断包 2026-09-06T12-40-12Z):
 * run `441ff961-bd66-4c4a-91e7-812f1d489668`,20:22:58 起、20:23:54 止,
 * 末帧逐字是
 *   {"code":0,"signal":null,"status":"succeeded","terminalAt":1788697434968,
 *    "resumable":false,"endedWithUnfinishedWork":true,...}
 * 再往上一帧 `{"type":"runtime_close","rpc_close_reason":"exit_0",...}`。
 * 这一轮的最后一段正文以 `</question-form>` 收尾 —— 它是**问完就交棒**的那一档,
 * 没有任何东西停过它。
 *
 * 屏幕上却同时有两句话:壳头「已完成 56s」(对的,56.264s),
 * 页脚「已停止,仍有未完成任务」(错的,没停过)。
 *
 * 为什么偏偏在答完之后才冒出来:`hideRunStatus` 挂着 `hasPendingQuestionForm`,
 * 表单还悬着的时候整行不出;用户一提交,`nextUserContent` 落地、
 * `parseSubmittedAnswers` 认了,这个闸就开了 —— 开出来的不是「已完成」,
 * 是「已停止」。那道闸当初防的是**假的成功**,没人看过它另一头掉出来什么。
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AssistantMessage } from '../../src/components/AssistantMessage';
import type { AgentEvent, ChatMessage } from '../../src/types';

/** 真机那一轮的形状:4 条 todo,1 条 in_progress + 3 条 pending,0 条 completed。 */
const TODO_SNAPSHOT: AgentEvent = {
  kind: 'tool_use',
  id: 'todo-1',
  name: 'TodoWrite',
  input: {
    todos: [
      { content: 'Collect the brand brief', status: 'in_progress', priority: 'high' },
      { content: 'Decide the imagery strategy', status: 'pending', priority: 'high' },
      { content: 'Fill inputs.json', status: 'pending', priority: 'high' },
      { content: 'Render the landing page', status: 'pending', priority: 'medium' },
    ],
  },
};

const FORM_ID = 'brand-brief';

const QUESTION_FORM = [
  'Before I start, a few things about the brand.',
  `<question-form id="${FORM_ID}" title="Brand brief">`,
  JSON.stringify({
    questions: [
      { id: 'brand_name', label: 'Brand name', type: 'text', required: true },
      { id: 'hero_headline', label: 'Hero headline', type: 'text', required: true },
    ],
  }),
  '</question-form>',
].join('\n');

/** `formatFormAnswers` 发回去的那一条用户消息,逐字同格式。 */
const SUBMITTED_ANSWERS = [
  `[form answers — ${FORM_ID}]`,
  '- Brand name: Northwind',
  '- Hero headline: Archives for the curious',
].join('\n');

/** 一条**跑成功了**的澄清回合:exit 0,以 `</question-form>` 收尾。 */
function clarificationTurn(): ChatMessage {
  return {
    id: 'assistant-clarification',
    role: 'assistant',
    content: QUESTION_FORM,
    events: [TODO_SNAPSHOT, { kind: 'text', text: QUESTION_FORM }],
    runStatus: 'succeeded',
    startedAt: 1_788_697_378_704,
    endedAt: 1_788_697_434_968,
  };
}

describe('a successful clarification turn, after its form is answered', () => {
  afterEach(() => cleanup());

  it('keeps the row hidden while the form is still waiting for an answer', () => {
    // 这一半是**现状,也是对的** —— 钉住它,免得修的时候把闸整个拆了。
    render(
      <AssistantMessage
        message={clarificationTurn()}
        streaming={false}
        projectId="project-1"
        conversationId="conv-1"
        isLast
      />,
    );

    expect(document.querySelector('[data-testid="assistant-label"]')).toBeNull();
  });

  it('does not claim the turn was stopped once the user answers', () => {
    render(
      <AssistantMessage
        message={clarificationTurn()}
        nextUserContent={SUBMITTED_ANSWERS}
        streaming={false}
        projectId="project-1"
        conversationId="conv-1"
        isLast
      />,
    );

    // run 的末帧是 status:"succeeded" / code:0 / signal:null。屏幕不许说它停过。
    expect(screen.queryByText('Stopped with unfinished work')).toBeNull();

    const label = document.querySelector('[data-testid="assistant-label"]')?.textContent ?? '';
    expect(label).not.toMatch(/stopped/i);
  });
});

/*
 * 反向那一半:**真的被停掉**的一轮,不许因为它路过时问了个问题就被吞掉。
 *
 * 「问完就交棒」的豁免说的是 run 自己跑到了干净的终点(succeeded / exit 0)。
 * 用户按下停止的那一轮不是这一档 —— 它就是被停的,页脚必须继续这么说。
 * 没有这一条,上面那条修法可以退化成「见到表单就报已完成」,而那种退化在
 * 只看正向用例的套件里是全绿的。
 */
function canceledClarificationTurn(): ChatMessage {
  return {
    id: 'assistant-canceled-clarification',
    role: 'assistant',
    content: QUESTION_FORM,
    events: [TODO_SNAPSHOT, { kind: 'text', text: QUESTION_FORM }],
    runStatus: 'canceled',
    startedAt: 1_788_697_378_704,
    endedAt: 1_788_697_400_000,
  };
}

describe('a clarification turn the user stopped', () => {
  afterEach(() => cleanup());

  it('still reports that it was stopped, and still offers the remaining work', () => {
    render(
      <AssistantMessage
        message={canceledClarificationTurn()}
        nextUserContent={SUBMITTED_ANSWERS}
        streaming={false}
        projectId="project-1"
        conversationId="conv-1"
        onContinueRemainingTasks={() => {}}
        isLast
      />,
    );

    const label = document.querySelector('[data-testid="assistant-label"]')?.textContent ?? '';
    expect(label).toContain('Stopped manually');
    expect(screen.queryByText('Completed')).toBeNull();
    // 这四条活是真的没做,出口必须还在 —— 豁免只针对跑到干净终点的那一轮。
    expect(document.querySelector('[data-testid="assistant-continue-remaining"]')).not.toBeNull();
  });
});
