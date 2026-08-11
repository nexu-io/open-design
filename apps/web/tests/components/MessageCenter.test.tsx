// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MessageCenter } from '../../src/components/MessageCenter';
import { I18nProvider, useI18n } from '../../src/i18n';
import type { MessageCenterMessage } from '../../src/message-center-client';

const defaultMessages: MessageCenterMessage[] = [
  { id: 'release', audienceType: 'global', typeName: 'Product update', title: 'Open Design 0.14 is available', body: 'The new release is ready.', ctaLabel: 'View update', ctaUrl: 'https://open-design.ai/update', publishedAt: '2026-07-16T12:00:00.000Z', readAt: null },
  { id: 'benefit', audienceType: 'targeted', typeName: 'Benefit', title: 'Credits added', body: 'Your credits are ready.', ctaLabel: null, ctaUrl: null, publishedAt: '2026-07-15T12:00:00.000Z', readAt: '2026-07-16T01:00:00.000Z' },
];

function mockFetch(
  options: {
    loggedIn?: boolean;
    messages?: MessageCenterMessage[];
    onStatus?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
    onMessages?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
    onRead?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  } = {},
) {
  const { loggedIn = false, messages = defaultMessages, onStatus, onMessages, onRead } = options;
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/status')) return onStatus ? onStatus(input, init) : Response.json({ loggedIn });
    if (url.includes('/messages?')) return onMessages ? onMessages(input, init) : Response.json({ messages, nextCursor: null, unreadCount: 1 });
    if (url.includes('/read')) return onRead ? onRead(input, init) : Response.json({ read: true, markedCount: 1 });
    return new Response(null, { status: 404 });
  }));
}

function renderMessageCenter(locale: 'en' | 'zh-CN' = 'en') {
  const onOpenNotificationSettings = vi.fn();
  const result = render(<I18nProvider initial={locale}><MessageCenter onOpenNotificationSettings={onOpenNotificationSettings}/></I18nProvider>);
  return { ...result, onOpenNotificationSettings };
}

function LocaleSwitcher() {
  const { setLocale } = useI18n();
  return (
    <button type="button" onClick={() => setLocale('fr')}>
      Switch locale
    </button>
  );
}

async function openCenter(unreadCount = 1) {
  await waitFor(() => expect(screen.getByLabelText(new RegExp(`Open message center \\(${unreadCount} unread\\)`))).toBeTruthy());
  fireEvent.click(screen.getByTestId('message-center-trigger'));
  return screen.getByTestId('message-center-dialog');
}

beforeEach(() => {
  localStorage.clear();
  mockFetch();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('MessageCenter', () => {
  it('formats published dates using the selected locale', async () => {
    const publishedAt = new Date(defaultMessages[0]!.publishedAt);
    const zhDate = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(publishedAt);
    const enDate = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(publishedAt);
    renderMessageCenter('zh-CN');
    fireEvent.click(screen.getByTestId('message-center-trigger'));

    await waitFor(() => {
      expect(screen.getByText(zhDate)).toBeTruthy();
    });
    expect(zhDate).not.toBe(enDate);
    expect(screen.queryByText(enDate)).toBeNull();
  });

  it('renders API messages for anonymous clients without a local window', async () => {
    renderMessageCenter();
    const dialog = await openCenter();
    expect(within(dialog).getByText('Open Design 0.14 is available')).toBeTruthy();
    expect(localStorage.getItem('open-design.message-center.anonymous-started-at.v1')).toBeNull();
    const anonymousPull = vi.mocked(fetch).mock.calls.find(([url]) => String(url).includes('/api-proxy/') && String(url).includes('/messages?'));
    expect(String(anonymousPull?.[0])).not.toContain('startedAt=');
  });

  it('keeps anonymous read state locally and restores it', async () => {
    renderMessageCenter();
    await openCenter();
    fireEvent.click(screen.getByRole('button', { name: /Open Design 0\.14 is available/ }));
    await waitFor(() => expect(screen.queryByLabelText(/unread/)).toBeNull());
    expect(localStorage.getItem('open-design.message-center.anonymous-read-ids.v1')).toContain('release');
  });

  it('uses account read endpoints when logged in', async () => {
    mockFetch({ loggedIn: true });
    renderMessageCenter();
    await openCenter();
    fireEvent.click(screen.getByRole('button', { name: /Open Design 0\.14 is available/ }));
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([url, init]) => String(url).includes('/release/read') && init?.method === 'POST')).toBe(true));
  });

  it('filters messages and marks all read', async () => {
    renderMessageCenter();
    await openCenter();
    fireEvent.click(screen.getByRole('button', { name: 'Unread' }));
    expect(screen.getByText('Open Design 0.14 is available')).toBeTruthy();
    expect(screen.queryByText('Credits added')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }));
    await waitFor(() => expect(screen.getByText('All caught up')).toBeTruthy());
  });

  it('opens CTA URLs with the existing external-link behavior', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    renderMessageCenter();
    await openCenter();
    fireEvent.click(screen.getByRole('button', { name: /Open Design 0\.14 is available/ }));
    fireEvent.click(screen.getByRole('button', { name: 'View update' }));
    expect(open).toHaveBeenCalledWith('https://open-design.ai/update', '_blank', 'noopener,noreferrer');
  });

  it('keeps both anonymous reads when two expands resolve out of order', async () => {
    const concurrentMessages = [
      { ...defaultMessages[0]!, id: 'release', title: 'Release update', readAt: null, ctaLabel: null, ctaUrl: null },
      { ...defaultMessages[0]!, id: 'security', title: 'Security notice', readAt: null, ctaLabel: null, ctaUrl: null },
    ] satisfies MessageCenterMessage[];
    let resolveFirst: (() => void) | undefined;
    let resolveSecond: (() => void) | undefined;
    const readRequests: string[] = [];
    mockFetch({
      loggedIn: true,
      messages: concurrentMessages,
      onRead: (input) =>
        new Promise<Response>((resolve) => {
          readRequests.push(String(input));
          if (!resolveFirst) {
            resolveFirst = () => resolve(Response.json({ read: true, markedCount: 1 }));
            return;
          }
          resolveSecond = () => resolve(Response.json({ read: true, markedCount: 1 }));
        }),
    });
    renderMessageCenter();
    await openCenter(2);

    fireEvent.click(screen.getByRole('button', { name: /Release update/ }));
    fireEvent.click(screen.getByRole('button', { name: /Security notice/ }));
    await waitFor(() => expect(readRequests).toEqual(expect.arrayContaining([
      expect.stringContaining('/messages/release/read'),
      expect.stringContaining('/messages/security/read'),
    ])));
    resolveSecond?.();
    await waitFor(() => expect(screen.queryByLabelText(/2 unread/)).toBeNull());
    resolveFirst?.();
    await waitFor(() => {
      expect(screen.queryByLabelText(/unread/)).toBeNull();
      expect(localStorage.getItem('open-design.message-center.anonymous-read-ids.v1')).toBeNull();
    });
  });

  it('uses account mark-read before the first delayed message sync resolves', async () => {
    const cachedMessages = [
      { ...defaultMessages[0]!, id: 'release', title: 'Release update', readAt: null, ctaLabel: null, ctaUrl: null },
    ] satisfies MessageCenterMessage[];
    let releaseMessages: (() => void) | undefined;
    localStorage.setItem('open-design.message-center.anonymous-started-at.v1', '2026-07-16T00:00:00.000Z');
    localStorage.setItem('open-design.message-center.anonymous-messages.v1', JSON.stringify(cachedMessages));
    localStorage.setItem('open-design.message-center.anonymous-read-ids.v1', JSON.stringify([]));
    mockFetch({
      loggedIn: true,
      onMessages: () =>
        new Promise<Response>((resolve) => {
          releaseMessages = () => resolve(Response.json({ messages: cachedMessages, nextCursor: null, unreadCount: 1 }));
        }),
    });

    renderMessageCenter();
    await openCenter(1);
    fireEvent.click(screen.getByRole('button', { name: /Release update/ }));

    await waitFor(() =>
      expect(
        vi.mocked(fetch).mock.calls.some(
          ([url, init]) => String(url).includes('/messages/release/read') && init?.method === 'POST',
        ),
      ).toBe(true),
    );
    expect(localStorage.getItem('open-design.message-center.anonymous-read-ids.v1')).toBeNull();

    releaseMessages?.();
    await waitFor(() => expect(screen.queryByLabelText(/unread/)).toBeNull());
  });

  it('re-checks auth on write after an anonymous mount so mid-session login uses account reads', async () => {
    const cachedMessages = [
      { ...defaultMessages[0]!, id: 'release', title: 'Release update', readAt: null, ctaLabel: null, ctaUrl: null },
    ] satisfies MessageCenterMessage[];
    let loggedIn = false;
    let statusCalls = 0;
    localStorage.setItem('open-design.message-center.anonymous-started-at.v1', '2026-07-16T00:00:00.000Z');
    localStorage.setItem('open-design.message-center.anonymous-messages.v1', JSON.stringify(cachedMessages));
    localStorage.setItem('open-design.message-center.anonymous-read-ids.v1', JSON.stringify([]));
    mockFetch({
      onStatus: async () => {
        statusCalls += 1;
        return Response.json({ loggedIn });
      },
      onMessages: async () => Response.json({ messages: cachedMessages, nextCursor: null, unreadCount: 1 }),
    });

    renderMessageCenter();
    await openCenter(1);
    expect(statusCalls).toBeGreaterThanOrEqual(2);

    loggedIn = true;
    fireEvent.click(screen.getByRole('button', { name: /Release update/ }));

    await waitFor(() =>
      expect(
        vi.mocked(fetch).mock.calls.some(
          ([url, init]) => String(url).includes('/messages/release/read') && init?.method === 'POST',
        ),
      ).toBe(true),
    );
    expect(localStorage.getItem('open-design.message-center.anonymous-read-ids.v1')).toBeNull();
  });

  it('keeps visible account messages when locale changes and the follow-up sync fails', async () => {
    let messageRequests = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/status')) return Response.json({ loggedIn: true });
      if (url.includes('/messages?')) {
        messageRequests += 1;
        if (messageRequests === 1) {
          return Response.json({ messages: defaultMessages, nextCursor: null, unreadCount: 1 });
        }
        return new Response(null, { status: 500 });
      }
      if (url.includes('/read')) return Response.json({ read: true, markedCount: 1 });
      return new Response(null, { status: 404 });
    }));

    render(
      <I18nProvider initial="en">
        <LocaleSwitcher />
        <MessageCenter />
      </I18nProvider>,
    );

    await openCenter();
    await waitFor(() => expect(screen.getByText('Open Design 0.14 is available')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Switch locale' }));

    await waitFor(() => expect(messageRequests).toBeGreaterThanOrEqual(2));
    expect(screen.getByText('Open Design 0.14 is available')).toBeTruthy();
    expect(screen.getByRole('status')).toBeTruthy();
    expect(within(screen.getByRole('status')).getByRole('button')).toBeTruthy();
  });

  it('shows a loading state instead of the empty copy during the first empty sync', async () => {
    let messageRequests = 0;
    let releaseFirstRequest: (() => void) | undefined;
    mockFetch({
      messages: [],
      onMessages: () =>
        new Promise<Response>((resolve) => {
          messageRequests += 1;
          if (messageRequests === 1) {
            releaseFirstRequest = () => resolve(Response.json({ messages: [], nextCursor: null, unreadCount: 0 }));
            return;
          }
          resolve(Response.json({ messages: [], nextCursor: null, unreadCount: 0 }));
        }),
    });

    renderMessageCenter();
    fireEvent.click(screen.getByTestId('message-center-trigger'));

    expect(screen.getByRole('status')).toHaveTextContent('Checking for updates...');
    expect(screen.queryByText('No messages yet')).toBeNull();

    releaseFirstRequest?.();
    await waitFor(() => expect(screen.getByText('No messages yet')).toBeTruthy());
  });

  it('shows retry controls instead of the empty copy when the first empty sync fails', async () => {
    let messageRequests = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/status')) return Response.json({ loggedIn: false });
      if (url.includes('/messages?')) {
        messageRequests += 1;
        if (messageRequests <= 2) return new Response(null, { status: 500 });
        return Response.json({ messages: [], nextCursor: null, unreadCount: 0 });
      }
      if (url.includes('/read')) return Response.json({ read: true, markedCount: 1 });
      return new Response(null, { status: 404 });
    }));

    renderMessageCenter();
    fireEvent.click(screen.getByTestId('message-center-trigger'));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Check failed. Please retry.'));
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
    expect(screen.queryByText('No messages yet')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.getByText('No messages yet')).toBeTruthy());
    expect(messageRequests).toBeGreaterThanOrEqual(2);
  });

  it('renders cached messages when a published date is invalid', async () => {
    const cachedMessages = [
      {
        ...defaultMessages[0]!,
        id: 'invalid-date',
        title: 'Cached update',
        body: 'Cached body remains visible.',
        publishedAt: 'not-a-date',
        readAt: null,
        ctaLabel: null,
        ctaUrl: null,
      },
    ] satisfies MessageCenterMessage[];
    localStorage.setItem('open-design.message-center.anonymous-started-at.v1', '2026-07-16T00:00:00.000Z');
    localStorage.setItem('open-design.message-center.anonymous-messages.v1', JSON.stringify(cachedMessages));
    localStorage.setItem('open-design.message-center.anonymous-read-ids.v1', JSON.stringify([]));
    mockFetch({
      onMessages: async () => new Response(null, { status: 500 }),
    });

    renderMessageCenter();
    const dialog = await openCenter(1);

    expect(within(dialog).getByText('Cached update')).toBeTruthy();
    expect(within(dialog).getByText('Cached body remains visible.')).toBeTruthy();
    expect(dialog.querySelector('time')).toBeNull();
  });

  it('hydrates cached anonymous state through the ref-backed source of truth', async () => {
    const cachedMessages = [
      { ...defaultMessages[0]!, id: 'release', title: 'Release update', readAt: null, ctaLabel: null, ctaUrl: null },
      { ...defaultMessages[0]!, id: 'security', title: 'Security notice', readAt: null, ctaLabel: null, ctaUrl: null },
    ] satisfies MessageCenterMessage[];
    localStorage.setItem('open-design.message-center.anonymous-started-at.v1', '2026-07-16T00:00:00.000Z');
    localStorage.setItem('open-design.message-center.anonymous-messages.v1', JSON.stringify(cachedMessages));
    localStorage.setItem('open-design.message-center.anonymous-read-ids.v1', JSON.stringify([]));
    mockFetch({
      onMessages: async () => new Response(null, { status: 500 }),
    });

    renderMessageCenter();
    await openCenter(2);
    expect(screen.getByText('Release update')).toBeTruthy();
    expect(screen.getByRole('status')).toHaveTextContent('Check failed. Please retry.');

    fireEvent.click(screen.getByRole('button', { name: /Release update/ }));
    await waitFor(() =>
      expect(localStorage.getItem('open-design.message-center.anonymous-read-ids.v1')).toContain('release'),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }));
    await waitFor(() =>
      expect(localStorage.getItem('open-design.message-center.anonymous-read-ids.v1')).toContain('security'),
    );
    expect(localStorage.getItem('open-design.message-center.anonymous-read-ids.v1')).toContain('release');
    expect(localStorage.getItem('open-design.message-center.anonymous-read-ids.v1')).toContain('security');
    expect(localStorage.getItem('open-design.message-center.anonymous-messages.v1')).toContain('Release update');
  });

  it('drops account read ids when a mounted session falls back to anonymous', async () => {
    let loggedIn = true;
    mockFetch({
      onStatus: async () => Response.json({ loggedIn }),
      messages: [{ ...defaultMessages[0]!, id: 'release', title: 'Release update', readAt: null }],
    });

    renderMessageCenter();
    await openCenter(1);
    fireEvent.click(screen.getByRole('button', { name: /Release update/ }));
    await waitFor(() =>
      expect(
        vi.mocked(fetch).mock.calls.some(
          ([url, init]) => String(url).includes('/messages/release/read') && init?.method === 'POST',
        ),
      ).toBe(true),
    );
    await waitFor(() => expect(screen.queryByLabelText(/unread/)).toBeNull());

    loggedIn = false;
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    fireEvent(document, new Event('visibilitychange'));

    await waitFor(() =>
      expect(screen.getByLabelText(/Open message center \(1 unread\)/)).toBeTruthy(),
    );
    expect(localStorage.getItem('open-design.message-center.anonymous-read-ids.v1')).not.toContain('release');
  });

  it('reports mark-read failures without throwing an unhandled rejection', async () => {
    const rejection = new Error('mark-read failed');
    mockFetch({
      loggedIn: true,
      onRead: async () => {
        throw rejection;
      },
    });
    const unhandled = vi.fn();
    window.addEventListener('unhandledrejection', unhandled);
    renderMessageCenter();
    await openCenter();

    fireEvent.click(screen.getByRole('button', { name: /Open Design 0\.14 is available/ }));
    await waitFor(() => expect(screen.getByText('Open Design 0.14 is available')).toBeTruthy());
    expect(unhandled).not.toHaveBeenCalled();
    window.removeEventListener('unhandledrejection', unhandled);
  });

  it('shows an inline sync error banner when mark-read fails with visible messages', async () => {
    let readAttempts = 0;
    mockFetch({
      loggedIn: true,
      onRead: async () => {
        readAttempts += 1;
        throw new Error('mark-read failed');
      },
    });
    renderMessageCenter();
    await openCenter();
    await waitFor(() =>
      expect(
        vi.mocked(fetch).mock.calls.filter(([url]) => String(url).includes('/messages?')).length,
      ).toBeGreaterThanOrEqual(2),
    );

    fireEvent.click(screen.getByRole('button', { name: /Open Design 0\.14 is available/ }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Check failed. Please retry.'));
    expect(screen.getByText('Open Design 0.14 is available')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    expect(readAttempts).toBe(1);
  });

  it('hides CTA actions for non-http URLs', async () => {
    mockFetch({
      messages: [{ ...defaultMessages[0]!, ctaUrl: 'javascript:alert(1)' }],
    });
    renderMessageCenter();
    await openCenter();
    fireEvent.click(screen.getByRole('button', { name: /Open Design 0\.14 is available/ }));
    expect(screen.queryByRole('button', { name: 'View update' })).toBeNull();
  });

  it('closes with Escape and restores trigger focus', async () => {
    renderMessageCenter();
    const trigger = screen.getByTestId('message-center-trigger');
    await openCenter();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('message-center-dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
