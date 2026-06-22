// @vitest-environment jsdom

/**
 * ChatPane renders the latest failed run's actionable top-level error card.
 * Historical failed turns render the same neutral .run-error panel in the
 * message body so chat history does not fall back to the legacy error pill.
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
      { kind: 'status', label: 'error', detail: 'boom-401', code: 'AGENT_AUTH_REQUIRED' },
    ] as ChatMessage['events'],
    producedFiles: [],
  } as ChatMessage;
}

describe('AssistantMessage run-error rendering', () => {
  it('renders the unified error card when this message does NOT own the top-level card', () => {
    const { container } = render(
      <AssistantMessage
        message={failedMessage()}
        streaming={false}
        projectId="p1"
        errorCardOwnerId={null}
        onFeedback={vi.fn()}
      />,
    );
    expect(container.querySelector('.run-error')).toBeTruthy();
    expect(container.querySelector('.status-pill')).toBeNull();
    expect(screen.getAllByText('boom-401').length).toBeGreaterThan(0);
  });

  it('renders the unified error card for a non-last failed run when another message owns the card', () => {
    const { container } = render(
      <AssistantMessage
        message={failedMessage()}
        streaming={false}
        projectId="p1"
        errorCardOwnerId="some-other-message"
        onFeedback={vi.fn()}
      />,
    );
    expect(container.querySelector('.run-error')).toBeTruthy();
    expect(container.querySelector('.status-pill')).toBeNull();
    expect(screen.getAllByText('boom-401').length).toBeGreaterThan(0);
  });

  it('suppresses the in-message card for the message that owns the top-level card', () => {
    const { container } = render(
      <AssistantMessage
        message={failedMessage()}
        streaming={false}
        projectId="p1"
        errorCardOwnerId="msg-failed"
        onFeedback={vi.fn()}
      />,
    );
    expect(container.querySelector('.run-error')).toBeNull();
    expect(container.querySelector('.status-pill')).toBeNull();
    expect(screen.queryByText('boom-401')).toBeNull();
  });
});
