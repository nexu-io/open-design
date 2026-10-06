// @vitest-environment jsdom
/**
 * 壳头那颗秒表要**自己走**。
 *
 * 之前它只在有新事件落下来的时候才前进(耗时是「最后一次结束时间 − 第一次开始时间」),
 * 于是一次长工具调用能让它冻在那儿几十秒 —— 页面上看着像卡死了。设计稿里这颗秒表是一直在走的。
 *
 * 这条测的是接线:`AssistantMessage` 在流式期间要把「现在」按秒喂给 `buildTurnBlocks`。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import type { ChatMessage, PersistedAgentEvent } from '@open-design/contracts';
import { I18nProvider } from '../../../src/i18n';
import { AssistantMessage } from '../../../src/components/AssistantMessage';

const T0 = 1_800_000_000_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0 + 3_000);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** 一次**还没回来**的工具调用:只有 startedAt,没有 tool_result */
const events: PersistedAgentEvent[] = [
  { kind: 'tool_use', id: 't1', name: 'Bash', input: { command: 'pnpm build' }, startedAt: T0 },
];

const message = {
  id: 'm1', role: 'assistant', content: '', createdAt: T0, runStatus: 'running', events,
} as ChatMessage;

const head = (root: HTMLElement): string =>
  root.querySelector('details > summary')?.textContent ?? '';

describe('执行记录的活计时器', () => {
  it('没有新事件也照走 —— 长工具调用期间秒数不许冻住', () => {
    const { container } = render(
      <I18nProvider initial="zh-CN"><AssistantMessage message={message} streaming /></I18nProvider>,
    );
    expect(head(container)).toContain('3.0s');

    // 假时钟推进时 Date.now() 会跟着走,所以只推时钟就够了(再 setSystemTime 会推两次)
    act(() => { vi.advanceTimersByTime(6_000); });
    expect(head(container)).toContain('9.0s');
  });

  it('轮次结束后停住 —— 不再挂定时器,秒数锁在最后一次结束时间上', () => {
    const done: PersistedAgentEvent[] = [
      { kind: 'tool_use', id: 't1', name: 'Bash', input: { command: 'pnpm build' }, startedAt: T0 },
      { kind: 'tool_result', toolUseId: 't1', content: 'ok', isError: false, completedAt: T0 + 4_000 },
    ];
    const { container } = render(
      <I18nProvider initial="zh-CN">
        <AssistantMessage message={{ ...message, runStatus: 'succeeded', events: done } as ChatMessage} streaming={false} />
      </I18nProvider>,
    );
    expect(head(container)).toContain('4.0s');

    act(() => { vi.advanceTimersByTime(56_000); });
    expect(head(container)).toContain('4.0s');
  });
});
