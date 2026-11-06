// @vitest-environment jsdom

/**
 * OPEND-2947, product acceptance updated 2026-09-14T07:47:05Z:
 * an ordinary user reply retires the unanswered question immediately. Its
 * title/status/disclosure remain; opening it browses one read-only question
 * at a time, including already-saved drafts, without required/submit UI.
 *
 * These tests use the real ChatPane -> AssistantMessage -> FormBlock path.
 * Messages represent the host's persisted transcript, not hand-set form props.
 * No test calls onSubmit to manufacture an answer for an abandoned form.
 */
import { cleanup, fireEvent, render, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatPane } from '../../src/components/ChatPane';
import { I18nProvider } from '../../src/i18n';
import type { ChatMessage } from '../../src/types';

const FORM_ID = 'clarify-audience';
const FORM_TITLE = '确认页面需求';
const FIRST_QUESTION = '页面面向哪些人？';
const SECOND_QUESTION = '希望传达什么？';
const FORM = [
  `<question-form id="${FORM_ID}" title="${FORM_TITLE}">`,
  JSON.stringify({
    submitLabel: '提交这些回答',
    questions: [
      { id: 'audience', label: FIRST_QUESTION, type: 'text', required: true },
      { id: 'message', label: SECOND_QUESTION, type: 'text', required: true },
    ],
  }),
  '</question-form>',
].join('\n');

beforeEach(() => {
  window.sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

function formMessage(id = 'question-owner'): ChatMessage {
  return {
    id,
    role: 'assistant',
    content: FORM,
    events: [{ kind: 'text', text: FORM }],
    runStatus: 'succeeded',
    createdAt: 1_788_000_000_000,
    startedAt: 1_788_000_000_000,
    endedAt: 1_788_000_001_000,
  };
}

function ordinaryReply(): ChatMessage {
  return {
    id: 'ordinary-reply',
    role: 'user',
    content: '先继续做页面，不回复这张表。',
    createdAt: 1_788_000_002_000,
  };
}

function laterAssistant(): ChatMessage {
  return {
    id: 'later-assistant',
    role: 'assistant',
    content: '继续处理页面。',
    events: [{ kind: 'text', text: '继续处理页面。' }],
    runStatus: 'succeeded',
    createdAt: 1_788_000_003_000,
    endedAt: 1_788_000_004_000,
  };
}

function showConversation(initialMessages: ChatMessage[]) {
  const onSubmitQuestionForm = vi.fn();
  const props = {
    messages: initialMessages,
    streaming: false,
    error: null,
    projectId: 'unanswered-question-project',
    projectFiles: [],
    onEnsureProject: async () => 'unanswered-question-project',
    onSend: vi.fn(),
    onStop: vi.fn(),
    conversations: [],
    activeConversationId: 'unanswered-question-conversation',
    onSelectConversation: vi.fn(),
    onDeleteConversation: vi.fn(),
    onSubmitQuestionForm,
  } satisfies ComponentProps<typeof ChatPane>;
  const element = (messages: ChatMessage[]) => (
    <I18nProvider initial="zh-CN"><ChatPane {...props} messages={messages} /></I18nProvider>
  );
  const rendered = render(element(initialMessages));
  const owner = (id = 'question-owner') => {
    const row = rendered.container.querySelector<HTMLElement>(`#assistant-message-${id}`);
    if (!row) throw new Error(`Expected the actual assistant row ${id}`);
    return row;
  };
  return {
    ...rendered,
    owner,
    onSubmitQuestionForm,
    showMessages: (messages: ChatMessage[]) => rendered.rerender(element(messages)),
  };
}

/** Accept either existing native details/summary or an accessible button. */
function disclosure(row: HTMLElement): HTMLElement {
  const title = within(row).getByText(FORM_TITLE, { exact: true });
  const control = title.closest<HTMLElement>('summary, button[aria-expanded]');
  expect(control, 'The retained question title must offer expand/collapse').not.toBeNull();
  return control!;
}

function expectClosed(row: HTMLElement): void {
  const control = disclosure(row);
  const details = control.closest('details');
  if (details) expect(details.open).toBe(false);
  else expect(control.getAttribute('aria-expanded')).toBe('false');
}

function openQuestion(row: HTMLElement): void {
  expectClosed(row);
  fireEvent.click(disclosure(row));
}

describe('OPEND-2947: a question the user left unanswered', () => {
  it('retires immediately when an ordinary reply arrives, even before another assistant exists', () => {
    const view = showConversation([formMessage()]);
    const input = within(view.owner()).getByRole('textbox') as HTMLInputElement;
    expect(input.disabled).toBe(false);

    view.showMessages([formMessage(), ordinaryReply()]);

    expect(within(view.owner()).getByText('未回答', { exact: true })).toBeTruthy();
    expectClosed(view.owner());
    expect(within(view.owner()).queryByText('已回答', { exact: true })).toBeNull();
    expect(view.onSubmitQuestionForm).not.toHaveBeenCalled();
  });

  it('loads an unanswered historical question collapsed without needing a prior mount', () => {
    const view = showConversation([formMessage(), ordinaryReply(), laterAssistant()]);

    expectClosed(view.owner());
    expect(within(view.owner()).getByText('未回答', { exact: true })).toBeTruthy();
    expect(view.onSubmitQuestionForm).not.toHaveBeenCalled();
  });

  it('keeps saved input across leaving the conversation, with read-only one-question browsing', () => {
    const view = showConversation([formMessage()]);
    fireEvent.change(within(view.owner()).getByRole('textbox'), {
      target: { value: '只填了一半的受众草稿' },
    });
    expect(view.onSubmitQuestionForm).not.toHaveBeenCalled();
    const history = [formMessage(), ordinaryReply(), laterAssistant()];
    view.showMessages(history);
    view.unmount();

    const restored = showConversation(history);
    openQuestion(restored.owner());
    const row = within(restored.owner());
    const savedInput = row.getByDisplayValue('只填了一半的受众草稿') as HTMLInputElement;
    expect(savedInput.disabled || savedInput.readOnly).toBe(true);
    expect(row.getByText(FIRST_QUESTION, { exact: true })).toBeTruthy();
    expect(row.queryByText(SECOND_QUESTION, { exact: true })).toBeNull();
    expect(row.getByText('1/2', { exact: true })).toBeTruthy();
    expect(row.queryByText('必填', { exact: true })).toBeNull();
    expect(row.queryByRole('button', { name: '提交这些回答' })).toBeNull();
    expect(row.getByText('此问题未回复，对话已继续。', { exact: true })).toBeTruthy();
    fireEvent.click(row.getByRole('button', { name: '下一步' }));
    expect(row.getByText(SECOND_QUESTION, { exact: true })).toBeTruthy();
    expect(row.queryByText(FIRST_QUESTION, { exact: true })).toBeNull();
    expect(row.getByText('2/2', { exact: true })).toBeTruthy();
    expect(row.queryByRole('button', { name: '提交这些回答' })).toBeNull();
    expect(restored.onSubmitQuestionForm).not.toHaveBeenCalled();
  });

  it('allows browsing past an unanswered required field without submitting it', () => {
    const view = showConversation([formMessage(), ordinaryReply(), laterAssistant()]);
    openQuestion(view.owner());
    const row = within(view.owner());
    expect(row.queryByText('必填', { exact: true })).toBeNull();
    const next = row.getByRole('button', { name: '下一步' }) as HTMLButtonElement;
    expect(next.disabled).toBe(false);
    fireEvent.click(next);
    expect(row.getByText(SECOND_QUESTION, { exact: true })).toBeTruthy();
    expect(row.queryByRole('button', { name: '提交这些回答' })).toBeNull();
    expect(view.onSubmitQuestionForm).not.toHaveBeenCalled();
  });

  it('does not mistake ordinary history for a submitted answer', () => {
    const view = showConversation([formMessage(), ordinaryReply(), laterAssistant()]);
    const row = within(view.owner());
    expect(row.queryByText('已回答', { exact: true })).toBeNull();
    expect(row.queryByText('已确认', { exact: true })).toBeNull();
    expect(view.onSubmitQuestionForm).not.toHaveBeenCalled();
  });

  it('preserves the existing confirmed summary when answers were actually submitted', () => {
    const submitted: ChatMessage = {
      ...ordinaryReply(),
      content: `[form answers — ${FORM_ID}]\n- ${FIRST_QUESTION}: 设计师\n- ${SECOND_QUESTION}: 易用性`,
    };
    const view = showConversation([formMessage(), submitted, laterAssistant()]);
    const row = within(view.owner());
    expect(row.getByText('已确认', { exact: true })).toBeTruthy();
    expect(row.getByText('设计师', { exact: true })).toBeTruthy();
    expect(row.queryByText('未回答', { exact: true })).toBeNull();
    expect(row.queryByRole('textbox')).toBeNull();
  });

  it('keeps a new occurrence with the same form id editable after an older one was abandoned', () => {
    const view = showConversation([formMessage(), ordinaryReply(), formMessage('new-question-owner')]);
    const row = within(view.owner('new-question-owner'));
    const input = row.getByRole('textbox') as HTMLInputElement;
    expect(input.disabled).toBe(false);
    expect(row.queryByText('未回答', { exact: true })).toBeNull();
    expect(row.getByText('必填', { exact: true })).toBeTruthy();
  });
});
