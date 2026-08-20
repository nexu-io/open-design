import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearAnonymousState, pullMessageCenter } from '../src/message-center-client';

describe('message center client', () => {
  beforeEach(() => vi.restoreAllMocks());

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
