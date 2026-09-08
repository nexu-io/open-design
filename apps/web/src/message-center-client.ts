export type MessageCenterFilter = 'all' | 'unread' | 'read';

export interface MessageCenterMessage {
  id: string;
  /** Optional stable selector for client-owned special behavior. Ordinary
   *  messages do not need one and continue through the inbox unchanged. */
  messageKey?: string | null;
  audienceType: 'global' | 'targeted';
  typeName: string;
  title: string;
  body: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
  publishedAt: string;
  readAt: string | null;
}

/** One-off, client-owned announcement selector. The message center remains a
 * generic inbox: only slugs with this prefix opt into the preset strong dialog. */
export const GO_PLAN_SUNSET_MESSAGE_KEY_PREFIX = 'go-plan-sunset-2026-08';

export function findGoPlanSunsetMessage(
  messages: readonly MessageCenterMessage[],
): MessageCenterMessage | null {
  return messages.find((message) => (
    message.audienceType === 'targeted'
    && message.readAt == null
    && message.messageKey?.startsWith(GO_PLAN_SUNSET_MESSAGE_KEY_PREFIX)
  )) ?? null;
}

interface MessageCenterPage {
  messages: MessageCenterMessage[];
  nextCursor: string | null;
  unreadCount: number;
}

const ACCOUNT_PROXY = '/api/integrations/vela/message-center';
const ANONYMOUS_PROXY = '/api/integrations/vela/message-center-public';
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

/**
 * Whether an AMR account is signed in, from the Message Center's point of view.
 *
 * This deliberately does NOT join the shared AMR-status read that App and
 * ChatPane sit on (`readVelaLoginStatus`), even though it is the same URL and
 * the requests overlap on a cold open. `MessageCenter` calls this from two
 * places, and one of them is `resolveLoggedInForWrite` — the check it makes
 * immediately before POSTing a read-receipt. That is an AUTHORITY question
 * ("am I signed in right now?"), not a display read, and joining an ambient
 * request issued moments earlier answers it with the state from before the
 * user signed in: the receipt then takes the anonymous path and is written to
 * localStorage instead of the account. `tests/components/MessageCenter.test.tsx`
 * ("re-checks auth on write after an anonymous mount") pins exactly that.
 *
 * Splitting the Message Center's display read from its write-authority read is
 * the way to reclaim the mount duplicates, but it belongs in `MessageCenter.tsx`
 * — this module cannot tell the two callers apart.
 *
 * The failure mapping is its own too: `fetchVelaLoginStatus` collapses every
 * failure into `null`, while `sync()` needs the throw to show its retry state
 * instead of silently rendering the anonymous inbox to a signed-in user. A 503
 * naming `amr-runtime-unavailable` is the one non-ok answer that IS
 * authoritative: there is no runtime, so there is no account.
 */
export async function isAmrLoggedIn(): Promise<boolean> {
  const response = await fetch('/api/integrations/vela/status', { cache: 'no-store' });
  if (response.status === 503) {
    const payload = (await response.clone().json().catch(() => null)) as { error?: string } | null;
    if (payload?.error === 'amr-runtime-unavailable') return false;
  }
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
