// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { forwardRef, useImperativeHandle } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatPane } from '../../src/components/ChatPane';
import type { ChatMessage, Conversation, ProjectMetadata } from '../../src/types';

const composerMocks = vi.hoisted(() => ({
  focus: vi.fn(),
  restoreDraft: vi.fn(),
  setDraft: vi.fn(),
}));

vi.mock('../../src/i18n', () => ({
  useI18n: () => ({ locale: 'en', setLocale: () => undefined, t: (key: string) => key }),
  useT: () => (key: string) => key,
}));

vi.mock('../../src/components/ChatComposer', () => ({
  ChatComposer: forwardRef((_props, ref) => {
    useImperativeHandle(ref, () => ({
      focus: composerMocks.focus,
      restoreDraft: composerMocks.restoreDraft,
      setDraft: composerMocks.setDraft,
    }));
    return <output data-testid="composer" />;
  }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const conversations: Conversation[] = [
  { id: 'conv-1', projectId: 'project-1', title: 'Conversation 1', createdAt: 1, updatedAt: 1 },
];

const projectMetadata: ProjectMetadata = { kind: 'prototype' };

// Mirrors the raw payload class from #3907: an opencode session error whose
// JSON body (headers + HTML response) lands in the card unclassified.
const LONG_RAW_ERROR =
  'json-rpc id 4: opencode event stream: opencode session error: '
  + JSON.stringify({
    sessionID: 'ses_16a0d242cffe0',
    name: 'APIError',
    data: {
      message: 'Bad Request',
      statusCode: 400,
      isRetryable: false,
      responseHeaders: { 'alt-svc': 'h3=":443"', 'content-type': 'text/html' },
      responseBody: '<html><head><title>400 Bad Request</title></head><body><center>400 Bad Request</center></body></html>',
    },
  });

const SHORT_ERROR = 'Conversation failed to load.';

function paneElement(extra: Partial<React.ComponentProps<typeof ChatPane>>) {
  return (
    <ChatPane
      projectKindForTracking="prototype"
      messages={[]}
      streaming={false}
      error={null}
      projectId="project-1"
      projectFiles={[]}
      onEnsureProject={async () => 'project-1'}
      onSend={vi.fn()}
      onStop={vi.fn()}
      conversations={conversations}
      activeConversationId="conv-1"
      onSelectConversation={vi.fn()}
      onDeleteConversation={vi.fn()}
      projectMetadata={projectMetadata}
      {...extra}
    />
  );
}

function renderPane(extra: Partial<React.ComponentProps<typeof ChatPane>>) {
  return render(paneElement(extra));
}

describe('ChatPane error card payload discipline (#3907)', () => {
  it('collapses an oversized raw payload to a summary and offers a details toggle', () => {
    const { container } = renderPane({ error: LONG_RAW_ERROR });

    const text = container.querySelector('.chat-error-text');
    expect(text).not.toBeNull();
    // Collapsed cards must NOT carry the raw blob in the DOM (#4028 design
    // review): only a short summary, so assistive tech / selection / copy don't
    // trip over a multi-KB payload before the user opens details.
    expect(text!.textContent).not.toBe(LONG_RAW_ERROR);
    expect(text!.textContent).not.toContain('<html>');
    expect(text!.textContent).not.toContain('responseBody');
    expect(text!.textContent!.endsWith('…')).toBe(true);
    // Collapsed text is not a scroll container, so it is not focusable.
    expect(text!.hasAttribute('tabindex')).toBe(false);

    const toggle = screen.getByRole('button', { name: 'chat.errorShowDetails' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    // Disclosure pattern: the toggle points at the details region by id.
    expect(text!.id).not.toBe('');
    expect(toggle.getAttribute('aria-controls')).toBe(text!.id);
  });

  it('expands to a focusable scrollable details view and collapses back', () => {
    const { container } = renderPane({ error: LONG_RAW_ERROR });

    fireEvent.click(screen.getByRole('button', { name: 'chat.errorShowDetails' }));

    const card = container.querySelector('.msg.error');
    const text = container.querySelector('.chat-error-text');
    expect(card!.getAttribute('data-error-expanded')).toBe('true');
    // Expanded: the full payload is now in the DOM, inside the bounded scroll area.
    expect(text!.textContent).toBe(LONG_RAW_ERROR);
    // The scroll region owns scrolling, so it is keyboard-focusable and named.
    expect(text!.getAttribute('tabindex')).toBe('0');
    expect(text!.getAttribute('aria-label')).toBe('chat.errorDetailsLabel');

    const hideToggle = screen.getByRole('button', { name: 'chat.errorHideDetails' });
    expect(hideToggle.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(hideToggle);
    expect(container.querySelector('.msg.error')!.getAttribute('data-error-expanded')).toBe('false');
    const collapsedText = container.querySelector('.chat-error-text');
    expect(collapsedText!.textContent).not.toBe(LONG_RAW_ERROR);
    expect(collapsedText!.hasAttribute('tabindex')).toBe(false);
  });

  it('renders short errors as-is without a toggle', () => {
    const { container } = renderPane({ error: SHORT_ERROR });

    const text = container.querySelector('.chat-error-text');
    expect(text!.textContent).toBe(SHORT_ERROR);
    expect(text!.hasAttribute('tabindex')).toBe(false);
    expect(screen.queryByRole('button', { name: 'chat.errorShowDetails' })).toBeNull();
  });

  it('collapses the expanded view when a different error arrives', () => {
    const { container, rerender } = renderPane({ error: LONG_RAW_ERROR });

    fireEvent.click(screen.getByRole('button', { name: 'chat.errorShowDetails' }));
    expect(container.querySelector('.msg.error')!.getAttribute('data-error-expanded')).toBe('true');

    rerender(paneElement({ error: `${LONG_RAW_ERROR} (second attempt)` }));

    expect(container.querySelector('.msg.error')!.getAttribute('data-error-expanded')).toBe('false');
    expect(container.querySelector('.chat-error-text')!.textContent).not.toContain('<html>');
  });

  it('collapses the expanded view when a new failed run repeats the same payload', () => {
    // Distinct failed runs frequently render the identical string (same
    // upstream 400 on retry, or a shared runFailureUi translation), so the
    // reset must key off the failure identity, not the display text.
    const failedRunMessage = (id: string, runId: string): ChatMessage => ({
      id,
      role: 'assistant',
      content: '',
      runId,
      runStatus: 'failed',
      events: [{ kind: 'status', label: 'error', detail: LONG_RAW_ERROR }],
    });
    const { container, rerender } = renderPane({ messages: [failedRunMessage('a1', 'run-1')] });

    fireEvent.click(screen.getByRole('button', { name: 'chat.errorShowDetails' }));
    expect(container.querySelector('.msg.error')!.getAttribute('data-error-expanded')).toBe('true');

    rerender(paneElement({ messages: [failedRunMessage('a2', 'run-2')] }));

    expect(container.querySelector('.msg.error')!.getAttribute('data-error-expanded')).toBe('false');
    expect(container.querySelector('.chat-error-text')!.textContent).not.toBe(LONG_RAW_ERROR);
  });

  it('summarizes a short multiline payload to its first line', () => {
    const { container } = renderPane({ error: 'line one\nline two\nline three' });

    const text = container.querySelector('.chat-error-text');
    // Collapsed multiline shows only the first line, not the later lines.
    expect(text!.textContent).toBe('line one');
    expect(text!.textContent).not.toContain('line two');
    expect(screen.getByRole('button', { name: 'chat.errorShowDetails' })).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'chat.errorShowDetails' }));
    expect(container.querySelector('.chat-error-text')!.textContent).toBe('line one\nline two\nline three');
  });

  it('summarizes the first non-blank line when the payload leads with blank lines', () => {
    const { container } = renderPane({ error: '   \n\nActual failure detail' });

    expect(container.querySelector('.chat-error-text')!.textContent).toBe('Actual failure detail');
    expect(screen.getByRole('button', { name: 'chat.errorShowDetails' })).not.toBeNull();
  });
});
