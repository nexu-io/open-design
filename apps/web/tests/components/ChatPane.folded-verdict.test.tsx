// @vitest-environment jsdom
//
// OPEND-3740 (via #8804): a folded OD Next turn takes its delivery verdict from
// the FINAL physical Run, never from the planning Run before it.
//
// P0-24 removed the footer status row and the 继续剩余任务 button that the
// original spec (`ChatPane.folded-done-completeness.test.tsx`) observed, so the
// invariant is pinned at the fold and through the one footer line P0-24 keeps:
// 「本次任务仍有 N 项内容未完成。」 (PRD Must todo 2).

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AssistantMessage } from '../../src/components/AssistantMessage';
import { foldStrategyTaskTurns } from '../../src/components/ChatPane';
import { I18nProvider } from '../../src/i18n';
import type { ChatMessage } from '../../src/types';

function taskRuns(): ChatMessage[] {
  return [
    {
      id: 'planning-message', role: 'assistant', content: 'The page plan is ready.',
      runId: 'planning-run', runStatus: 'succeeded', createdAt: 1000, endedAt: 2000,
      strategyTaskExecutionId: 'folded-task', strategyTaskRunIndex: 0, strategyTaskDelivered: true,
      events: [
        { kind: 'done_key', key: 'aaaaaaaaaaaaaaaa' },
        { kind: 'text', text: 'The page plan is ready.' },
      ],
    },
    {
      id: 'production-message', role: 'assistant', content: 'The page still needs work.',
      runId: 'production-run', runStatus: 'succeeded', createdAt: 3000, endedAt: 4000,
      strategyTaskExecutionId: 'folded-task', strategyTaskRunIndex: 1,
      events: [
        { kind: 'done_key', key: 'bbbbbbbbbbbbbbbb' },
        { kind: 'tool_use', id: 'production-todo', name: 'TodoWrite', input: { todos: [{ content: 'Finish the page', status: 'pending' }] } },
        { kind: 'text', text: 'The page still needs work.' },
      ],
    },
  ];
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<!doctype html><html><body>Page</body></html>')));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('OPEND-3740 completion belongs to the final physical Run', () => {
  it.each([false, undefined])('does not inherit a planning verdict when the final verdict is %s', (verdict) => {
    const rows = taskRuns();
    rows[1] = { ...rows[1]!, strategyTaskDelivered: verdict };
    const message = foldStrategyTaskTurns(rows).filter((m) => m.role === 'assistant').at(-1)!;
    expect(message.strategyTaskDelivered).toBe(verdict);
    render(
      <I18nProvider initial="en">
        <AssistantMessage message={message} streaming={false} isLast
          projectId="folded-project" conversationId="folded-conversation" />
      </I18nProvider>,
    );
    expect(screen.getByTestId('assistant-footer')).toHaveAttribute('data-unfinished', 'true');
    expect(screen.getByTestId('assistant-label-detail')).toBeInTheDocument();
  });
});
