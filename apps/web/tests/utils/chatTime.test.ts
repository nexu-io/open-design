import { describe, expect, it } from 'vitest';

import type { ChatMessage } from '../../src/types';
import { messageTime } from '../../src/utils/chatTime';

describe('messageTime', () => {
  it('uses assistant startedAt before persisted createdAt', () => {
    const message: ChatMessage = {
      id: 'assistant-1',
      role: 'assistant',
      content: 'Done',
      startedAt: 100,
      createdAt: 200,
      endedAt: 300,
    };

    expect(messageTime(message)).toBe(100);
  });

  it('keeps user createdAt as the primary timestamp', () => {
    const message: ChatMessage = {
      id: 'user-1',
      role: 'user',
      content: 'Build this',
      startedAt: 100,
      createdAt: 200,
    };

    expect(messageTime(message)).toBe(200);
  });
});
