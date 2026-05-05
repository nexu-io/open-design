import { describe, expect, it } from 'vitest';
import { shouldShowRetryButton } from '../../src/components/ChatPane';
import type { ChatMessage } from '../../src/types';

function user(id: string): ChatMessage {
  return { id, role: 'user', content: '' };
}
function assistant(id: string, runStatus?: ChatMessage['runStatus']): ChatMessage {
  return { id, role: 'assistant', content: '', runStatus };
}

describe('shouldShowRetryButton — issue #475', () => {
  it('shows when the last message is the failed assistant', () => {
    const messages = [user('u1'), assistant('a1', 'failed')];
    expect(shouldShowRetryButton(messages, 'a1')).toBe(true);
  });

  it('hides when there is no last assistant id', () => {
    expect(shouldShowRetryButton([user('u1')], null)).toBe(false);
  });

  it('hides when the last message is not the referenced assistant', () => {
    const messages = [user('u1'), assistant('a1', 'failed'), user('u2')];
    expect(shouldShowRetryButton(messages, 'a1')).toBe(false);
  });

  it('hides when the assistant run is not failed', () => {
    const messages = [user('u1'), assistant('a1', 'succeeded')];
    expect(shouldShowRetryButton(messages, 'a1')).toBe(false);
  });

  it('hides on an empty message list', () => {
    expect(shouldShowRetryButton([], 'a1')).toBe(false);
  });
});
