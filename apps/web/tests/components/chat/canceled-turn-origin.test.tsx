// @vitest-environment jsdom
/**
 * The canceled turn's status word says who stopped it. "Stopped manually" is
 * the design's wording for the user pressing Stop; a turn the daemon cut
 * short while shutting down or restarting must not claim that. The daemon
 * reports the origin on the run and the message keeps it across reloads
 * (`ChatMessage.cancelOrigin`), so the footer reads it and only it.
 */
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AssistantMessage, canceledLabelKey } from '../../../src/components/AssistantMessage';
import { en } from '../../../src/i18n/locales/en';
import type { ChatMessage } from '../../../src/types';

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

function canceledTurn(over: Partial<ChatMessage>): ChatMessage {
  return {
    id: 'm-1',
    role: 'assistant',
    content: '规划写到一半。',
    runStatus: 'canceled',
    startedAt: 1700000000,
    endedAt: 1700000042,
    createdAt: 1700000042,
    events: [] as ChatMessage['events'],
    producedFiles: [],
    ...over,
  } as ChatMessage;
}

function footerLabel(message: ChatMessage): string | null {
  const view = render(
    <AssistantMessage
      message={message}
      streaming={false}
      isLast
      projectId="p1"
      errorCardOwnerId={null}
      onFeedback={vi.fn()}
      onForkFromMessage={vi.fn()}
    />,
  );
  return view.container.querySelector('[data-testid="assistant-label"]')?.textContent ?? null;
}

describe('canceled turn status word by cancel origin', () => {
  it('maps the daemon-reported origin to the wording', () => {
    expect(canceledLabelKey('user_stop')).toBe('assistant.canceledLabel');
    expect(canceledLabelKey('daemon_shutdown')).toBe('assistant.canceledByRestartLabel');
    expect(canceledLabelKey('project_cleanup')).toBe('assistant.canceledNeutralLabel');
    expect(canceledLabelKey('unknown')).toBe('assistant.canceledNeutralLabel');
    // Rows persisted before the daemon reported an origin, and the moment
    // between the terminal frame and the stop response, keep the manual word:
    // the only cancel a live page produces itself is the user's Stop.
    expect(canceledLabelKey(undefined)).toBe('assistant.canceledLabel');
    expect(canceledLabelKey(null)).toBe('assistant.canceledLabel');
  });

  it('says the app restarted when the daemon shut the turn down', () => {
    expect(footerLabel(canceledTurn({ cancelOrigin: 'daemon_shutdown' })))
      .toBe(en['assistant.canceledByRestartLabel']);
    expect(en['assistant.canceledByRestartLabel']).toBe('Stopped by an app restart');
  });

  it('keeps "Stopped manually" for the user\'s own Stop', () => {
    expect(footerLabel(canceledTurn({ cancelOrigin: 'user_stop' })))
      .toBe(en['assistant.canceledLabel']);
    expect(footerLabel(canceledTurn({}))).toBe(en['assistant.canceledLabel']);
  });
});
