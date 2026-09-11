// @vitest-environment jsdom
/**
 * Approved memory cards must render both before and after authenticated done.
 * D2 originally reproduced this lane gap with a task-brief. OPEND-2971 removes
 * task-brief/rule-proposal presentation, so memory-applied now keeps the same
 * live-shell, neighboring-prose, and outer-conclusion regression anchors.
 */
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { AssistantMessage } from '../../../src/components/AssistantMessage';
import type { ChatMessage } from '../../../src/types';

afterEach(() => cleanup());

const KEY = 'a7f3c91ed2b40561';

/** Keep a multiline, valid payload to cover protocol parsing inside the shell. */
const MEMORY_CARD = [
  '<od-card type="memory-applied">',
  '{ "summary": "已记住插画偏好",',
  '  "used": [ {"type": "project", "name": "狐假虎威插画"} ] }',
  '</od-card>',
].join('\n');

/**
 * 一次**真运行**,停在截图那一刻:卡片和过程叙述都发了,`<od-done>` **还没到**。
 * D43 于是把两段都收进执行壳,而壳这时是摊开的(还在跑、还没有结论)——
 * 截图里那张卡就是这么和「思考过程 / 执行计划」并排躺在壳里的。
 *
 * ⚠️ 不能拿「跑完的一轮」当夹具:跑完 + 有结论 = 壳自动收起,
 * `deferCollapsedBodies` 连 body 都不渲染,断言会因为**整块没上屏**而假绿。
 */
function turnWithCardBeforeDone(): ChatMessage {
  return {
    id: 'assistant-card-in-shell',
    role: 'assistant',
    content: `${MEMORY_CARD}\n我先对齐一下需求。\n`,
    events: [
      { kind: 'done_key', key: KEY },
      { kind: 'text', text: `${MEMORY_CARD}\n我先对齐一下需求。\n` },
      {
        kind: 'tool_use',
        id: 'todo-1',
        name: 'TodoWrite',
        input: { todos: [{ content: '生成插画', status: 'in_progress' }] },
      },
    ],
    agentId: 'claude',
    agentName: 'Claude',
    runId: 'run-card-in-shell',
    runStatus: 'running',
    createdAt: 1_700_000_000_000,
    startedAt: 1_700_000_000_000,
  } as ChatMessage;
}

function renderTurn(message: ChatMessage, streaming = true) {
  return render(
    <AssistantMessage
      message={message}
      streaming={streaming}
      projectId="project-1"
      conversationId="conv-1"
      isLast
    />,
  );
}

describe('od-card 出现在执行壳内', () => {
  it('不把 <od-card> 标签原文摊给用户看', () => {
    const { container } = renderTurn(turnWithCardBeforeDone());

    // 正向锚点:壳的 body **确实**上屏了。少了它,下面那条可以因为
    // 「壳收起来了、整块压根没渲染」而假绿。
    expect(
      container.textContent ?? '',
      '夹具坏了 —— 壳 body 没上屏,断言看不到任何东西',
    ).toContain('我先对齐一下需求。');

    expect(
      container.textContent ?? '',
      'od-card 标签原文被摊给用户看了(壳内那条通道不解析 od-card)',
    ).not.toContain('<od-card');
  });

  it('渲染成 memory-applied 那张卡,而不是删掉', () => {
    const { container } = renderTurn(turnWithCardBeforeDone());

    expect(
      container.querySelector('[data-od-card="memory-applied"]'),
      '卡片没渲染出来 —— 修复不许把 od-card 当噪音删掉',
    ).not.toBeNull();
    expect(container.textContent ?? '').toContain('狐假虎威');
  });

  it('卡片之外的过程叙述照旧留在壳里', () => {
    const { container } = renderTurn(turnWithCardBeforeDone());

    expect(
      container.textContent ?? '',
      '同一段文字里卡片以外的散文被一起吞了',
    ).toContain('我先对齐一下需求。');
    expect(
      container.querySelector('[data-testid="assistant-flow"]'),
      '夹具坏了 —— 执行壳那一块压根没渲染',
    ).not.toBeNull();
  });
});

/**
 * ⚠️ **对照锚点 —— 壳外那条原有通道**。
 *
 * `<od-done>` 之后发的卡片走的是 `AssistantMessage` 的 `prose-block`,那条通道
 * 的保留卡片显示也必须继续正常。
 */
describe('壳外那条原有通道不变', () => {
  it('done 之后的 od-card 照旧渲染成卡片', () => {
    const { container } = renderTurn({
      id: 'assistant-card-after-done',
      role: 'assistant',
      content: `完成。<od-done key="${KEY}"/>${MEMORY_CARD}`,
      events: [
        { kind: 'done_key', key: KEY },
        { kind: 'text', text: `完成。<od-done key="${KEY}"/>${MEMORY_CARD}` },
      ],
      agentId: 'claude',
      agentName: 'Claude',
      runId: 'run-card-after-done',
      runStatus: 'succeeded',
      createdAt: 1_700_000_000_000,
      startedAt: 1_700_000_000_000,
      endedAt: 1_700_000_009_000,
    } as ChatMessage);

    expect(container.querySelector('[data-od-card="memory-applied"]')).not.toBeNull();
    expect(container.textContent ?? '').not.toContain('<od-card');
  });
});
