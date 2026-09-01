import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearAnonymousState,
  findGoPlanSunsetMessage,
  GO_PLAN_SUNSET_MESSAGE_KEY_PREFIX,
  pullMessageCenter,
  type MessageCenterMessage,
} from '../src/message-center-client';

describe('message center client', () => {
  beforeEach(() => vi.restoreAllMocks());

  const message = (
    overrides: Partial<MessageCenterMessage> = {},
  ): MessageCenterMessage => ({
    id: 'message-1',
    audienceType: 'targeted',
    typeName: 'Announcement',
    title: 'Title',
    body: 'Body',
    ctaLabel: null,
    ctaUrl: null,
    publishedAt: '2026-08-26T00:00:00.000Z',
    readAt: null,
    ...overrides,
  });

  it.each([
    GO_PLAN_SUNSET_MESSAGE_KEY_PREFIX,
    `${GO_PLAN_SUNSET_MESSAGE_KEY_PREFIX}-test`,
    `${GO_PLAN_SUNSET_MESSAGE_KEY_PREFIX}-v2`,
  ])('selects an unread targeted message with the allowlisted prefix: %s', (messageKey) => {
    const expected = message({ messageKey });
    expect(findGoPlanSunsetMessage([
      message({ id: 'missing-key' }),
      message({ id: 'unknown-key', messageKey: 'another-announcement' }),
      message({ id: 'global', audienceType: 'global', messageKey }),
      message({ id: 'read', messageKey, readAt: '2026-08-26T01:00:00.000Z' }),
      expected,
    ])).toBe(expected);
  });

  it('leaves ordinary messages without a message key untouched', () => {
    expect(findGoPlanSunsetMessage([message({ messageKey: null })])).toBeNull();
  });

  it('clears legacy anonymous window keys with anonymous state', () => {
    const storage = new Map<string, string>();
    const adapter = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, value),
      removeItem: (key: string) => void storage.delete(key),
    } as Storage;
    storage.set('open-design.message-center.anonymous-started-at.v1', '2026-07-16T00:00:00.000Z');
    storage.set('open-design.message-center.anonymous-messages.v1', '[]');
    storage.set('open-design.message-center.anonymous-read-ids.v1', '[]');
    clearAnonymousState(adapter);
    expect(storage.has('open-design.message-center.anonymous-started-at.v1')).toBe(false);
    expect(storage.has('open-design.message-center.anonymous-messages.v1')).toBe(false);
    expect(storage.has('open-design.message-center.anonymous-read-ids.v1')).toBe(false);
  });

  it('follows pagination until the server cursor is exhausted', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(Response.json({ messages: [{ id: 'new' }], nextCursor: 'next', unreadCount: 1 }))
      .mockResolvedValueOnce(Response.json({ messages: [{ id: 'old' }], nextCursor: null, unreadCount: 1 })));
    const result = await pullMessageCenter({ locale: 'en', loggedIn: false });
    expect(result.map((message) => message.id)).toEqual(['new', 'old']);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
    const firstUrl = String(vi.mocked(fetch).mock.calls[0]?.[0]);
    expect(firstUrl).toContain('/api/integrations/vela/message-center-public/messages?');
    expect(firstUrl).not.toContain('startedAt=');
  });

  it('fails fast when pagination cursors stop advancing', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(Response.json({ messages: [{ id: 'new' }], nextCursor: 'stuck', unreadCount: 1 }))
      .mockResolvedValueOnce(Response.json({ messages: [{ id: 'old' }], nextCursor: 'stuck', unreadCount: 1 })));
    await expect(
      pullMessageCenter({ locale: 'en', loggedIn: false }),
    ).rejects.toThrow('Message Center pagination cursor did not advance');
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
  });

  it('uses the credential-scoped daemon route for logged-in pulls', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      Response.json({ messages: [], nextCursor: null, unreadCount: 0 }),
    ));
    await pullMessageCenter({ locale: 'en', loggedIn: true });
    expect(String(vi.mocked(fetch).mock.calls[0]?.[0])).toContain(
      '/api/integrations/vela/message-center/messages?',
    );
  });
});
