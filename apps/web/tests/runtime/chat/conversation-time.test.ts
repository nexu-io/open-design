import { describe, expect, it } from 'vitest';

import { en } from '../../../src/i18n/locales/en';
import { zhCN } from '../../../src/i18n/locales/zh-CN';
import type { Dict } from '../../../src/i18n/types';
import { conversationMetaLabel } from '../../../src/runtime/chat/conversation-time';
import type { Conversation } from '../../../src/types';

const now = Date.parse('2026-09-09T12:00:00Z');

function translate(dict: Dict) {
  return (key: keyof Dict, vars?: Record<string, string | number>) =>
    dict[key].replace(/\{(\w+)\}/g, (match, name: string) => String(vars?.[name] ?? match));
}

const english = translate(en);
const chinese = translate(zhCN);

describe('conversation history time', () => {
  it.each([
    { age: 0, en: 'now', zh: '刚刚' },
    { age: 59_999, en: 'now', zh: '刚刚' },
    { age: 60_000, en: '1m', zh: '1分' },
    { age: 3_599_999, en: '59m', zh: '59分' },
    { age: 3_600_000, en: '1h 0m', zh: '1时 0分' },
    { age: 5_459_999, en: '1h 30m', zh: '1时 30分' },
    { age: 86_399_999, en: '23h 59m', zh: '23时 59分' },
    { age: 86_400_000, en: '1d', zh: '1天' },
    { age: 172_799_999, en: '1d', zh: '1天' },
    { age: 172_800_000, en: '2d', zh: '2天' },
    { age: 604_800_000, en: '7d', zh: '7天' },
    { age: 2_592_000_000, en: '30d', zh: '30天' },
  ])('formats an age of $age ms without seconds in both locales', ({ age, en: expectedEn, zh }) => {
    const conversation = { updatedAt: now - age };

    expect(conversationMetaLabel(conversation, english, now)).toBe(expectedEn);
    expect(conversationMetaLabel(conversation, chinese, now)).toBe(zh);
  });

  it('treats a future update as just now', () => {
    const conversation = { updatedAt: now + 60_000 };

    expect(conversationMetaLabel(conversation, english, now)).toBe('now');
    expect(conversationMetaLabel(conversation, chinese, now)).toBe('刚刚');
  });

  it.each([NaN, Infinity, -Infinity])('omits a label for invalid time %s', (invalidTime) => {
    expect(conversationMetaLabel({ updatedAt: invalidTime }, english, now)).toBe('');
    expect(conversationMetaLabel({ updatedAt: now }, english, invalidTime)).toBe('');
  });

  it.each(['succeeded', 'failed', 'canceled'] as const)(
    'uses recency regardless of %s run duration metadata',
    (status) => {
      const conversation: Conversation = {
        id: 'conversation-1',
        projectId: 'project-1',
        title: 'Finished conversation',
        createdAt: now - 86_400_000,
        updatedAt: now - 5_400_000,
        totalDurationMs: 85_000,
        latestRun: {
          status,
          startedAt: now - 5_415_000,
          endedAt: now - 5_400_000,
          durationMs: 15_000,
        },
      };

      expect(conversationMetaLabel(conversation, english, now)).toBe('1h 30m');
      const withoutCumulativeDuration = { ...conversation, totalDurationMs: undefined };
      expect(conversationMetaLabel(withoutCumulativeDuration, english, now)).toBe('1h 30m');
    },
  );
});
