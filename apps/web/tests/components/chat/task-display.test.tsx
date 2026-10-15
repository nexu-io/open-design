// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AssistantMessage } from '../../../src/components/AssistantMessage';
import { foldStrategyTaskTurns } from '../../../src/components/ChatPane';
import { I18nProvider } from '../../../src/i18n';
import type { ChatMessage } from '../../../src/types';

afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); });

it('shows one task state and one record across planning and production, preserving manual folding', () => {
  const display = { id: 'task', revision: 4, currentRunId: 'production', runIds: ['plan', 'production'],
    state: 'running' as const, elapsedMs: 26_000, observedAt: Date.now(), ticking: false };
  const rows: ChatMessage[] = [
    { id: 'plan-message', role: 'assistant', runId: 'plan', runStatus: 'succeeded',
      strategyTaskExecutionId: 'task', strategyTaskRunIndex: 0, taskDisplay: display,
      content: '<od-done key="aaaaaaaaaaaaaaaa"/>The plan is ready.',
      events: [{ kind: 'done_key', key: 'aaaaaaaaaaaaaaaa' }, { kind: 'thinking', text: 'Plan thinking' },
        { kind: 'text', text: '<od-done key="aaaaaaaaaaaaaaaa"/>The plan is ready.' }] },
    { id: 'production-message', role: 'assistant', runId: 'production', runStatus: 'running',
      strategyTaskExecutionId: 'task', strategyTaskRunIndex: 1, taskDisplay: display,
      content: '', events: [{ kind: 'done_key', key: 'bbbbbbbbbbbbbbbb' },
        { kind: 'tool_use', id: 'write', name: 'Write', input: { file_path: 'index.html', content: '<title>Site</title>' } }] },
  ];
  const message = foldStrategyTaskTurns(rows)[0]!;
  const view = render(<I18nProvider initial="en"><AssistantMessage message={message} streaming projectId="project" conversationId="conversation" /></I18nProvider>);
  expect(screen.getAllByTestId('task-display-status')).toHaveLength(1);
  const status = screen.getByTestId('task-display-status');
  expect(status).toHaveTextContent('Working');
  expect(status).not.toHaveTextContent('Task execution');
  expect(status.querySelector('[data-orb="connecting"]')).not.toBeNull();
  expect(screen.getAllByText('Execution record')).toHaveLength(1);
  expect(status).toHaveTextContent('26s');
  const summary = screen.getByText('Execution record').closest('summary')!;
  fireEvent.click(summary);
  fireEvent(summary.closest('details')!, new Event('toggle'));
  view.unmount();
  render(<I18nProvider initial="en"><AssistantMessage message={{...message, taskDisplay:{...display,elapsedMs:27_000}}} streaming projectId="project" conversationId="conversation" /></I18nProvider>);
  expect(screen.getByText('Execution record').closest('details')).not.toHaveAttribute('open');
  expect(screen.queryByTestId('assistant-label')).toBeNull();
});
