// @vitest-environment jsdom

/**
 * OPEND-2542: settled turns keep their action row in the DOM so history can
 * reveal it on message hover/focus without changing the transcript's layout.
 * The latest turn is marked separately for the always-visible CSS state.
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

function finishedTurn(id: string): ChatMessage {
  return {
    id,
    role: 'assistant',
    content: '两页都好了。',
    runStatus: 'succeeded',
    startedAt: 1700000000,
    endedAt: 1700000042,
    events: [] as ChatMessage['events'],
    producedFiles: [],
  } as ChatMessage;
}

const footerOf = (container: HTMLElement) => container.querySelector('.assistant-footer');

describe('settled assistant action row visibility markers', () => {
  it('marks the final turn for the always-visible state', () => {
    const { container } = render(
      <AssistantMessage
        message={finishedTurn('m-last')}
        streaming={false}
        isLast
        projectId="p1"
        errorCardOwnerId={null}
        onFeedback={vi.fn()}
      />,
    );
    expect(footerOf(container)?.getAttribute('data-last')).toBe('true');
  });

  it('keeps a historical turn rendered for hover and keyboard focus reveal', () => {
    const { container } = render(
      <AssistantMessage
        message={finishedTurn('m-old')}
        streaming={false}
        projectId="p1"
        errorCardOwnerId={null}
        onFeedback={vi.fn()}
        onForkFromMessage={vi.fn()}
      />,
    );
    expect(footerOf(container)?.getAttribute('data-last')).toBe('false');
    expect(screen.getByTestId('assistant-label')).toBeTruthy();
    expect(screen.getByTestId('assistant-fork-button')).toBeTruthy();
  });

  it('最后一轮但还在跑:仍然不出(壳头已经在报状态)', () => {
    const { container } = render(
      <AssistantMessage
        message={{ ...finishedTurn('m-live'), runStatus: 'running', endedAt: undefined } as ChatMessage}
        streaming
        isLast
        projectId="p1"
        errorCardOwnerId={null}
        onFeedback={vi.fn()}
      />,
    );
    expect(footerOf(container)).toBeNull();
  });
});
