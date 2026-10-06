// @vitest-environment jsdom

import { cleanup, fireEvent, render, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatPane } from '../../src/components/ChatPane';
import { I18nProvider } from '../../src/i18n';
import { memoryWrittenCardContent } from '../../src/runtime/useMemoryWrittenCard';
import type { AgentEvent, ChatMessage } from '../../src/types';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const startedAt = 1_789_025_782_537;
const remainingTodo = { content: 'Write the lesson page', status: 'pending' };
const inProgressTodo = { content: 'Prepare the lesson illustrations', status: 'in_progress' };

function todoSnapshot(completed = false): AgentEvent {
  return {
    kind: 'tool_use',
    id: 'production-plan',
    name: 'TodoWrite',
    startedAt,
    input: {
      todos: [inProgressTodo, remainingTodo].map((todo) => completed
        ? { ...todo, status: 'completed' }
        : { ...todo }),
    },
  };
}

function production(status: NonNullable<ChatMessage['runStatus']>, completedTodos = false): ChatMessage {
  const content = 'Preparing the lesson page.';
  return {
    id: 'production', role: 'assistant', content,
    runId: 'production-run', runStatus: status,
    createdAt: startedAt, startedAt,
    ...(status === 'running' || status === 'queued' ? {} : { endedAt: startedAt + 90_000 }),
    events: [
      todoSnapshot(completedTodos),
      { kind: 'tool_result', toolUseId: 'production-plan', content: 'Todos updated', isError: false, completedAt: startedAt + 1 },
      { kind: 'text', text: content },
    ],
  };
}

function memory(): ChatMessage {
  // Same writer and absence of run fields as ProjectView's host-authored card.
  // This is not a fake stopped run or an AssistantMessage previousTodos prop.
  const content = memoryWrittenCardContent({
    key: 'memory-extraction', count: 1,
    entries: [{ id: 'work-profile', type: 'user', name: 'Work profile' }],
  }, 'Remembered 1 preference');
  return {
    id: 'memory-notice', role: 'assistant', content,
    createdAt: startedAt + 72_334,
    events: [{ kind: 'text', text: content }],
  };
}

function conversation(...assistants: ChatMessage[]): ChatMessage[] {
  return [
    { id: 'user-request', role: 'user', content: 'Prepare the lesson page', createdAt: startedAt - 1_000 },
    ...assistants,
  ];
}

function show(messages: ChatMessage[], streaming = false) {
  const onContinueRemainingTasks = vi.fn();
  const onSubmitQuestionForm = vi.fn();
  const props = {
    messages, streaming, error: null,
    projectId: 'continue-owner-project', projectFiles: [],
    onEnsureProject: async () => 'continue-owner-project',
    onSend: vi.fn(), onStop: vi.fn(),
    conversations: [], activeConversationId: null,
    onSelectConversation: vi.fn(), onDeleteConversation: vi.fn(),
    onContinueRemainingTasks, onSubmitQuestionForm,
  } satisfies ComponentProps<typeof ChatPane>;
  const rendered = render(<I18nProvider initial="en"><ChatPane {...props} /></I18nProvider>);
  const message = (id: string) => {
    const element = rendered.container.querySelector<HTMLElement>(`#assistant-message-${id}`);
    if (!element) throw new Error(`Expected the real ChatPane to render ${id}`);
    return element;
  };
  return { ...rendered, message, onContinueRemainingTasks, onSubmitQuestionForm };
}

function openMemory(element: HTMLElement) {
  const summary = within(element).getByText('Remembered 1 preference').closest('summary');
  if (!summary || !(summary.parentElement instanceof HTMLDetailsElement)) {
    throw new Error('Expected the real memory disclosure');
  }
  fireEvent.click(summary);
  expect(summary.parentElement.open).toBe(true);
  expect(element.textContent).toContain('Work profile');
}

const unfinished = [
  { ...inProgressTodo, activeForm: undefined },
  { ...remainingTodo, activeForm: undefined },
];

function expectContinueFor(view: ReturnType<typeof show>, owner: ChatMessage) {
  // Exactly one action, and the callback must retain the actual owning message
  // and todos. Hiding every recovery action cannot satisfy these controls.
  const button = within(view.container).getByTestId('assistant-continue-remaining');
  expect(view.message(owner.id).contains(button)).toBe(true);
  fireEvent.click(button);
  expect(view.onContinueRemainingTasks).toHaveBeenCalledTimes(1);
  expect(view.onContinueRemainingTasks).toHaveBeenCalledWith(owner, unfinished);
}

function laterReply(content: string, status: 'succeeded' | 'canceled'): ChatMessage {
  return {
    id: 'later-reply', role: 'assistant', content,
    createdAt: startedAt + 100_000, startedAt: startedAt + 100_000,
    endedAt: startedAt + 110_000, runStatus: status,
    events: [{ kind: 'text', text: content }],
  };
}

function inheritedConversation(reply: ChatMessage): ChatMessage[] {
  return [
    ...conversation(production('canceled')),
    { id: 'user-followup', role: 'user', content: 'Before continuing, ask about the audience.', createdAt: startedAt + 95_000 },
    reply,
  ];
}

describe('OPEND-3012: continuing work belongs to a run, not a host memory notice', () => {
  it('does not offer Continue on a trailing host memory card while production still runs', () => {
    // The recorded sequence has an active production message, unfinished
    // TodoWrite, then a host card with no run/time/status fields. ChatPane must
    // calculate previousTodos itself and still render both messages normally.
    const view = show(conversation(production('running'), memory()), true);
    expect(within(view.message('production')).getAllByText('Working').length).toBeGreaterThan(0);
    openMemory(view.message('memory-notice'));
    expect(within(view.container).queryByTestId('assistant-continue-remaining')).toBeNull();
    expect(view.onContinueRemainingTasks).not.toHaveBeenCalled();
  });

  it('does not offer Continue when todos completed but the same run is still finishing', () => {
    const view = show(conversation(production('running', true), memory()), true);
    expect(within(view.message('production')).getAllByText('Working').length).toBeGreaterThan(0);
    openMemory(view.message('memory-notice'));
    expect(within(view.container).queryByTestId('assistant-continue-remaining')).toBeNull();
    expect(view.onContinueRemainingTasks).not.toHaveBeenCalled();
  });

  it('keeps the memory card without Continue after the run and all todos completed', () => {
    const view = show(conversation(production('succeeded', true), memory()));
    openMemory(view.message('memory-notice'));
    expect(within(view.container).queryByTestId('assistant-continue-remaining')).toBeNull();
    expect(view.onContinueRemainingTasks).not.toHaveBeenCalled();
  });

  it.each(['failed', 'canceled'] as const)('preserves the actual %s run recovery and its unfinished todo callback', (status) => {
    const owner = production(status);
    expectContinueFor(show(conversation(owner)), owner);
  });

  it.each(['failed', 'canceled'] as const)('keeps recovery on the real %s run when a host memory card follows it', (status) => {
    const owner = production(status);
    const view = show(conversation(owner, memory()));
    openMemory(view.message('memory-notice'));
    // The host notification must not steal the action or make it disappear.
    expectContinueFor(view, owner);
    expect(within(view.message('memory-notice')).queryByTestId('assistant-continue-remaining')).toBeNull();
  });

  it('preserves the existing succeeded reply recovery when stale todos have no authenticated completion', () => {
    // Physical success alone never proved those declared tasks completed. This
    // guards the existing user escape hatch; OPEND-3012 cannot redefine it.
    const owner = production('succeeded');
    expectContinueFor(show(conversation(owner)), owner);
  });

  it('preserves canceled API/BYOK recovery with a start time but no daemon run id', () => {
    const owner = production('canceled');
    delete owner.runId;
    expect(owner.startedAt).toBeDefined();
    expectContinueFor(show(conversation(owner)), owner);
  });

  it('preserves the real canceled reply ability to continue earlier unfinished todos', () => {
    const owner = laterReply('I started checking the audience.', 'canceled');
    expectContinueFor(show(inheritedConversation(owner)), owner);
  });

  it('keeps a complete pending clarification answerable and does not offer inherited Continue', () => {
    const form = '<question-form id="audience" title="Audience brief">\n'
      + JSON.stringify({ questions: [{ id: 'audience', label: 'Who is this page for?', type: 'text', required: true }] })
      + '\n</question-form>';
    // Existing ask-and-yield behavior: the physical run succeeded, but no
    // authenticated done conclusion replaces the unanswered form.
    const owner = laterReply(form, 'succeeded');
    const view = show(inheritedConversation(owner));
    const textbox = within(view.message(owner.id)).getByRole('textbox') as HTMLInputElement;
    expect(textbox.disabled).toBe(false);
    fireEvent.change(textbox, { target: { value: 'Local families' } });
    expect(textbox.value).toBe('Local families');
    expect(within(view.container).queryByTestId('assistant-continue-remaining')).toBeNull();
    expect(view.onSubmitQuestionForm).not.toHaveBeenCalled();
    expect(view.onContinueRemainingTasks).not.toHaveBeenCalled();
  });

  it('preserves inherited recovery after cancellation leaves only an unanswerable truncated form', () => {
    const owner = laterReply('<question-form id="audience" title="Audience brief">\n'
      + '{"questions":[{"id":"audience","label":"Who is this page for?","type":"text"', 'canceled');
    const view = show(inheritedConversation(owner));
    expect(within(view.message(owner.id)).queryByRole('textbox')).toBeNull();
    expectContinueFor(view, owner);
    expect(view.onSubmitQuestionForm).not.toHaveBeenCalled();
  });
});
