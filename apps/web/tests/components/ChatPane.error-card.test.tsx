// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { forwardRef, useImperativeHandle } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatPane } from '../../src/components/ChatPane';
import type { Conversation, ProjectMetadata } from '../../src/types';

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
  it('clamps an oversized raw payload and offers a details toggle', () => {
    const { container } = renderPane({ error: LONG_RAW_ERROR });

    const text = container.querySelector('.chat-error-text');
    expect(text).not.toBeNull();
    // Full payload stays in the DOM (clamp is visual), so copy/inspect still works.
    expect(text!.textContent).toBe(LONG_RAW_ERROR);
    expect(text!.getAttribute('data-clamped')).toBe('true');

    const toggle = screen.getByRole('button', { name: 'chat.errorShowDetails' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('expands to a scrollable details view and collapses back', () => {
    const { container } = renderPane({ error: LONG_RAW_ERROR });

    fireEvent.click(screen.getByRole('button', { name: 'chat.errorShowDetails' }));

    const card = container.querySelector('.msg.error');
    const text = container.querySelector('.chat-error-text');
    expect(card!.getAttribute('data-error-expanded')).toBe('true');
    expect(text!.getAttribute('data-clamped')).toBe('false');
    expect(text!.textContent).toBe(LONG_RAW_ERROR);

    const hideToggle = screen.getByRole('button', { name: 'chat.errorHideDetails' });
    expect(hideToggle.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(hideToggle);
    expect(container.querySelector('.msg.error')!.getAttribute('data-error-expanded')).toBe('false');
    expect(container.querySelector('.chat-error-text')!.getAttribute('data-clamped')).toBe('true');
  });

  it('renders short errors as-is without a toggle', () => {
    const { container } = renderPane({ error: SHORT_ERROR });

    const text = container.querySelector('.chat-error-text');
    expect(text!.textContent).toBe(SHORT_ERROR);
    expect(text!.getAttribute('data-clamped')).toBe('false');
    expect(screen.queryByRole('button', { name: 'chat.errorShowDetails' })).toBeNull();
  });

  it('collapses the expanded view when a different error arrives', () => {
    const { container, rerender } = renderPane({ error: LONG_RAW_ERROR });

    fireEvent.click(screen.getByRole('button', { name: 'chat.errorShowDetails' }));
    expect(container.querySelector('.msg.error')!.getAttribute('data-error-expanded')).toBe('true');

    rerender(paneElement({ error: `${LONG_RAW_ERROR} (second attempt)` }));

    expect(container.querySelector('.msg.error')!.getAttribute('data-error-expanded')).toBe('false');
    expect(container.querySelector('.chat-error-text')!.getAttribute('data-clamped')).toBe('true');
  });

  it('treats short multiline payloads as clampable', () => {
    const { container } = renderPane({ error: 'line one\nline two\nline three' });

    expect(container.querySelector('.chat-error-text')!.getAttribute('data-clamped')).toBe('true');
    expect(screen.getByRole('button', { name: 'chat.errorShowDetails' })).not.toBeNull();
  });
});
