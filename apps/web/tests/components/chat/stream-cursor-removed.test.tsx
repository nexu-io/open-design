// @vitest-environment jsdom
/**
 * 流式光标整个不存在了(用户裁决 2026-08-27)。
 *
 * 原话:「这个 question-form 还没完全输出完整时,还在这个 loading 时,好像会出现
 * 这个光标, 不要这个光标, 感觉很业余.. 把这个光标干掉,**什么地方都不准出现**」。
 * 指认的画面:表单骨架还在加载,骨架左下角杵着一枚闪烁的深色方块。
 *
 * 这条**不是新规矩,是补上设计稿早就做过的决定**。稿子 21:02 版把 `.caret` 整个
 * 删掉了,理由是逐字浮现本身就在说「还在写」,再挂一枚光标是同一件事说两遍。
 * 这处分歧在 `mirror-gallery.test.tsx` 里已经以「⚠️ 能看见一处差异」记了很久,
 * 只是一直没人拍板要不要跟。现在拍了。
 *
 * 判据挂在**属性和样式表**上,不挂类名 —— 光标是一枚 `::after` 伪元素,
 * jsdom 里量不到伪元素,所以正向那一半只能查 `data-stream-cursor` 这个开关
 * 还在不在,反向那一半查样式表里那条规则和它的 `@keyframes` 是不是也一起走了。
 * 少了后者,把属性改个名就能让前者绿,而页面上那枚光标原样还在。
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { AssistantMessage } from '../../../src/components/AssistantMessage';
import type { AgentEvent, ChatMessage } from '../../../src/types';

function streamingMessage(events: AgentEvent[]): ChatMessage {
  return {
    id: 'assistant-1',
    role: 'assistant',
    content: '',
    events,
    startedAt: 1_000,
    endedAt: undefined,
    runStatus: 'running',
  };
}

const renderStreaming = (events: AgentEvent[]) =>
  render(
    <AssistantMessage
      projectKind="prototype"
      conversationId="conv-1"
      message={streamingMessage(events)}
      streaming
      projectId="project-1"
    />,
  );

const CODE_CSS = readFileSync(
  join(__dirname, '../../../src/styles/viewer/code.css'),
  'utf8',
);

afterEach(cleanup);

describe('流式光标', () => {
  it('正文还在流式输出时也不挂光标开关', () => {
    const { container } = renderStreaming([
      { kind: 'text', text: '<done/>The answer is still streaming.' },
    ]);

    /*
     * 正向对照:正文这一块**确实渲染出来了**。少了这一条,下面那句
     * `toBe(0)` 在「整条消息压根没画」时也会绿 —— 那正是空洞断言的形状。
     */
    const prose = [...container.querySelectorAll('.prose-block')];
    expect(prose.length).toBeGreaterThan(0);
    expect(prose.map((n) => n.textContent ?? '').join(' '))
      .toContain('The answer is still streaming.');

    expect(container.querySelectorAll('[data-stream-cursor]').length).toBe(0);
  });

  it('表单还在加载时也不挂 —— 用户指认的就是这一格', () => {
    const { container } = renderStreaming([
      { kind: 'text', text: 'The parchment signature is locked.' },
      { kind: 'text', text: '<question-form' },
    ]);

    // 正向对照:这一轮确实画出了东西(否则「没有光标」不成立)
    expect(container.textContent ?? '').toContain('The parchment signature is locked.');
    expect(container.querySelectorAll('[data-stream-cursor]').length).toBe(0);
  });

  it('样式表里那条闪烁规则和它的 keyframes 一起走了', () => {
    /*
     * 反向对照:同一份样式表**照旧有** `.prose-block` 的基础规则。
     * 少了这一条,把整个 code.css 删空也能让下面三句绿。
     */
    expect(CODE_CSS).toContain('.prose-block {');

    expect(CODE_CSS).not.toContain('data-stream-cursor');
    expect(CODE_CSS).not.toContain('stream-caret-blink');
  });
});
