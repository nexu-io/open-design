// @vitest-environment jsdom

/**
 * The per-message gray "error" status pill is suppressed ONLY for the failed
 * run that ChatPane renders its top-level error card for (errorCardOwnerId).
 * Other failed turns — older history, or once a follow-up makes this no longer
 * the last assistant message — must keep their pill so the error detail still
 * survives reload / history review (regression: #3083 review).
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AssistantMessage } from '../../src/components/AssistantMessage';
import type { ChatMessage } from '../../src/types';

beforeAll(() => {
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      clear: () => store.clear(),
      getItem: (k: string) => store.get(k) ?? null,
      removeItem: (k: string) => store.delete(k),
      setItem: (k: string, v: string) => store.set(k, v),
    },
  });
});

afterEach(cleanup);

function failedMessage(): ChatMessage {
  return {
    id: 'msg-failed',
    role: 'assistant',
    content: '',
    runStatus: 'failed',
    startedAt: 1700000000,
    endedAt: 1700000005,
    events: [
      { kind: 'status', label: 'error', detail: 'boom-401' },
    ] as ChatMessage['events'],
    producedFiles: [],
  } as ChatMessage;
}

describe('AssistantMessage error-pill suppression', () => {
  it('keeps the error pill when this message does NOT own the top-level card', () => {
    render(
      <AssistantMessage
        message={failedMessage()}
        streaming={false}
        projectId="p1"
        errorCardOwnerId={null}
        onFeedback={vi.fn()}
      />,
    );
    expect(screen.getByText('boom-401')).toBeTruthy();
  });

  it('keeps the pill for a non-last failed run even when another message owns the card', () => {
    render(
      <AssistantMessage
        message={failedMessage()}
        streaming={false}
        projectId="p1"
        errorCardOwnerId="some-other-message"
        onFeedback={vi.fn()}
      />,
    );
    expect(screen.getByText('boom-401')).toBeTruthy();
  });

  it('suppresses the pill only for the message that owns the top-level card', () => {
    render(
      <AssistantMessage
        message={failedMessage()}
        streaming={false}
        projectId="p1"
        errorCardOwnerId="msg-failed"
        onFeedback={vi.fn()}
      />,
    );
    expect(screen.queryByText('boom-401')).toBeNull();
  });
});
