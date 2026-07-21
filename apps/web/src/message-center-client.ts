export type MessageCenterFilter = 'all' | 'unread' | 'read';

export interface MessageCenterMessage {
  id: string;
  audienceType: 'global' | 'targeted';
  typeName: string;
  title: string;
  body: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
  publishedAt: string;
  readAt: string | null;
}

interface MessageCenterPage {
  messages: MessageCenterMessage[];
  nextCursor: string | null;
  unreadCount: number;
}

const ACCOUNT_PROXY = '/api/integrations/vela/message-center';
const ANONYMOUS_PROXY = '/api/integrations/vela/api-proxy/api/v1/message-center';
const LEGACY_WINDOW_KEY = 'open-design.message-center.anonymous-started-at.v1';
const MESSAGES_KEY = 'open-design.message-center.anonymous-messages.v1';
const READ_KEY = 'open-design.message-center.anonymous-read-ids.v1';
const MAX_MESSAGE_CENTER_PAGES = 20;

export function readAnonymousMessages(storage: Storage): MessageCenterMessage[] {
  return parseArray<MessageCenterMessage>(storage.getItem(MESSAGES_KEY));
}

export function readAnonymousReadIds(storage: Storage): Set<string> {
  return new Set(parseArray<string>(storage.getItem(READ_KEY)));
}

export function writeAnonymousState(
  storage: Storage,
  messages: MessageCenterMessage[],
  readIds: Set<string>,
): void {
  storage.setItem(MESSAGES_KEY, JSON.stringify(messages));
  storage.setItem(READ_KEY, JSON.stringify([...readIds]));
}

export function clearAnonymousState(storage: Storage): void {
  storage.removeItem(MESSAGES_KEY);
  storage.removeItem(READ_KEY);
  storage.removeItem(LEGACY_WINDOW_KEY);
}

export async function isAmrLoggedIn(): Promise<boolean> {
  const response = await fetch('/api/integrations/vela/status', { cache: 'no-store' });
  if (!response.ok) throw new Error(`AMR status failed: ${response.status}`);
  const payload = (await response.json()) as { loggedIn?: boolean };
  return payload.loggedIn === true;
}

export async function pullMessageCenter(input: {
  locale: string;
  loggedIn: boolean;
  filter?: MessageCenterFilter;
}): Promise<MessageCenterMessage[]> {
  const messages: MessageCenterMessage[] = [];
  let cursor: string | null = null;
  let pages = 0;
  do {
    pages += 1;
    if (pages > MAX_MESSAGE_CENTER_PAGES) {
      throw new Error('Message Center pagination exceeded max pages');
    }
    const query = new URLSearchParams({
      locale: apiLocale(input.locale),
      filter: input.filter ?? 'all',
      limit: '100',
    });
    if (cursor) query.set('cursor', cursor);
    const proxy = input.loggedIn ? ACCOUNT_PROXY : ANONYMOUS_PROXY;
    const response = await fetch(`${proxy}/messages?${query}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Message Center sync failed: ${response.status}`);
    const page = (await response.json()) as MessageCenterPage;
    if (!Array.isArray(page.messages)) {
      throw new Error('Message Center page missing messages[]');
    }
    if (page.nextCursor && page.nextCursor === cursor) {
      throw new Error('Message Center pagination cursor did not advance');
    }
    messages.push(...page.messages);
    cursor = page.nextCursor;
  } while (cursor);
  return messages;
}

export async function markAccountMessageRead(messageId: string): Promise<void> {
  const response = await fetch(`${ACCOUNT_PROXY}/messages/${encodeURIComponent(messageId)}/read`, { method: 'POST' });
  if (!response.ok) throw new Error(`Mark message read failed: ${response.status}`);
}

export async function markAllAccountMessagesRead(): Promise<void> {
  const response = await fetch(`${ACCOUNT_PROXY}/read-all`, { method: 'POST' });
  if (!response.ok) throw new Error(`Mark all messages read failed: ${response.status}`);
}

function apiLocale(locale: string): string {
  const mapping: Record<string, string> = { en: 'en-US', 'es-ES': 'es', 'pt-BR': 'pt' };
  return mapping[locale] ?? locale;
}

function parseArray<T>(value: string | null): T[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}
