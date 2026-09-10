// @vitest-environment jsdom

import { cleanup, fireEvent, render, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatPane } from '../../src/components/ChatPane';
import { I18nProvider } from '../../src/i18n';
import type { AgentEvent, ChatMessage } from '../../src/types';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const remainingTodo = { content: 'Build the FAQ', status: 'pending' };

function todoSnapshot(): AgentEvent {
  return {
    kind: 'tool_use',
    id: 'plan-todo',
    name: 'TodoWrite',
    input: {
      todos: [
        { content: 'Build the header', status: 'completed' },
        remainingTodo,
      ],
    },
  };
}

function assistant(
  id: string,
  content: string,
  runStatus: 'succeeded' | 'canceled',
  events: AgentEvent[] = [{ kind: 'text', text: content }],
): ChatMessage {
  return {
    id,
    role: 'assistant',
    content,
    createdAt: 1_788_000_003_000,
    startedAt: 1_788_000_003_000,
    endedAt: 1_788_000_004_000,
    runStatus,
    events,
  };
}

function conversationWithEarlierTodo(latest: ChatMessage): ChatMessage[] {
  return [
    { id: 'user-plan', role: 'user', content: 'Build the page', createdAt: 1_788_000_000_000 },
    {
      ...assistant('assistant-plan', 'The header is ready.', 'canceled', [
        todoSnapshot(),
        { kind: 'text', text: 'The header is ready.' },
      ]),
      createdAt: 1_788_000_001_000,
      startedAt: 1_788_000_001_000,
      endedAt: 1_788_000_001_500,
    },
    { id: 'user-followup', role: 'user', content: 'Before continuing, ask about the audience.', createdAt: 1_788_000_002_000 },
    latest,
  ];
}

function showConversation(messages: ChatMessage[]) {
  const onContinueRemainingTasks = vi.fn();
  const onSubmitQuestionForm = vi.fn();
  const props = {
    messages,
    streaming: false,
    error: null,
    projectId: 'project-pending-question',
    projectFiles: [],
    onEnsureProject: async () => 'project-pending-question',
    onSend: vi.fn(),
    onStop: vi.fn(),
    conversations: [],
    activeConversationId: null,
    onSelectConversation: vi.fn(),
    onDeleteConversation: vi.fn(),
    onContinueRemainingTasks,
    onSubmitQuestionForm,
  } satisfies ComponentProps<typeof ChatPane>;
  const rendered = render(<I18nProvider initial="en"><ChatPane {...props} /></I18nProvider>);
  const latest = rendered.container.querySelector<HTMLElement>('#assistant-message-assistant-latest');
  if (!latest) throw new Error('The latest assistant message was not rendered');
  return { latest, onContinueRemainingTasks, onSubmitQuestionForm };
}

const questionForm = [
  '<question-form id="audience-brief" title="Audience brief">',
  JSON.stringify({
    questions: [{ id: 'audience', label: 'Who is this page for?', type: 'text', required: true }],
  }),
  '</question-form>',
].join('\n');

describe('OPEND-2709: inherited unfinished work while a question is pending', () => {
  it('does not offer continuing earlier todos while the latest successful clarification is awaiting an answer', () => {
    // Supported ask-and-yield history: exit succeeded, a complete form, and no
    // authenticated od-done conclusion. See the recorded shape in
    // AssistantMessage.question-form-answered-status.test.tsx. No failed status
    // is injected, and the current turn emits no new TodoWrite snapshot.
    const { latest, onContinueRemainingTasks, onSubmitQuestionForm } = showConversation(
      conversationWithEarlierTodo(assistant('assistant-latest', questionForm, 'succeeded')),
    );
    const textbox = within(latest).getByRole('textbox') as HTMLInputElement;
    expect(textbox.disabled).toBe(false);
    fireEvent.change(textbox, { target: { value: 'Local families' } });
    expect(textbox.value).toBe('Local families');
    expect(onSubmitQuestionForm).not.toHaveBeenCalled();
    expect(within(latest).queryByTestId('assistant-continue-remaining')).toBeNull();
    expect(onContinueRemainingTasks).not.toHaveBeenCalled();
  });

  it('still continues the inherited unfinished work after an ordinary canceled reply without a form', () => {
    const latestMessage = assistant('assistant-latest', 'I started checking the audience.', 'canceled');
    const { latest, onContinueRemainingTasks } = showConversation(conversationWithEarlierTodo(latestMessage));
    fireEvent.click(within(latest).getByTestId('assistant-continue-remaining'));
    expect(onContinueRemainingTasks).toHaveBeenCalledTimes(1);
    expect(onContinueRemainingTasks).toHaveBeenCalledWith(latestMessage, [
      { ...remainingTodo, activeForm: undefined },
    ]);
  });

  it('still continues the current canceled turn own unfinished snapshot without a form', () => {
    const latestMessage = assistant('assistant-latest', 'The header is ready.', 'canceled', [
      todoSnapshot(),
      { kind: 'text', text: 'The header is ready.' },
    ]);
    const { latest, onContinueRemainingTasks } = showConversation([
      { id: 'user-current', role: 'user', content: 'Build the page' },
      latestMessage,
    ]);
    fireEvent.click(within(latest).getByTestId('assistant-continue-remaining'));
    expect(onContinueRemainingTasks).toHaveBeenCalledTimes(1);
    expect(onContinueRemainingTasks).toHaveBeenCalledWith(latestMessage, [
      { ...remainingTodo, activeForm: undefined },
    ]);
  });

  it('keeps the existing authenticated completion guard for inherited todos', () => {
    const key = 'a7f3c91ed2b40561';
    const content = `<od-done key="${key}"/>The requested page is complete.`;
    const { latest, onContinueRemainingTasks } = showConversation(conversationWithEarlierTodo(
      assistant('assistant-latest', content, 'succeeded', [
        { kind: 'done_key', key },
        { kind: 'text', text: content },
      ]),
    ));
    expect(within(latest).queryByTestId('assistant-continue-remaining')).toBeNull();
    expect(onContinueRemainingTasks).not.toHaveBeenCalled();
  });
});

it('keeps canceled unfinished work recoverable when a truncated question form has no answerable control', () => {
  const truncatedForm = '<question-form id="audience-brief" title="Audience brief">\n'
    + '{"questions":[{"id":"audience","label":"Who is this page for?","type":"text"';
  const latestMessage = assistant('assistant-latest', truncatedForm, 'canceled');
  const { latest, onContinueRemainingTasks, onSubmitQuestionForm } = showConversation(
    conversationWithEarlierTodo(latestMessage),
  );

  // The user stopped before a complete form arrived. The terminal prose has
  // no form to submit, so it must not remove the existing recovery action.
  expect(within(latest).queryByRole('textbox')).toBeNull();
  fireEvent.click(within(latest).getByTestId('assistant-continue-remaining'));
  expect(onContinueRemainingTasks).toHaveBeenCalledTimes(1);
  expect(onContinueRemainingTasks).toHaveBeenCalledWith(latestMessage, [
    { ...remainingTodo, activeForm: undefined },
  ]);
  expect(onSubmitQuestionForm).not.toHaveBeenCalled();
});
