import type { AmrSessionState } from '@open-design/contracts';

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

/**
 * Advances whenever anonymous state is WRITTEN. The obligation to clear that
 * cache on a successful account read belongs to the cache, not to snapshot
 * publication: gating the clear on the publication token meant an unrelated
 * sync could move that token, both the read and the sync would then decline to
 * clear, and a signed-out session's rows survived the sign-in. The only thing
 * that should stop an account run from clearing is a newer ANONYMOUS write
 * actually landing.
 */
let anonymousWriteSeq = 0;

export function currentAnonymousWriteSeq(): number {
  return anonymousWriteSeq;
}

/** Test hook — module counters must not leak between cases. */
export function resetAnonymousWriteSeq(): void {
  anonymousWriteSeq = 0;
}

export function writeAnonymousState(
  storage: Storage,
  messages: MessageCenterMessage[],
  readIds: Set<string>,
): void {
  anonymousWriteSeq += 1;
  storage.setItem(MESSAGES_KEY, JSON.stringify(messages));
  storage.setItem(READ_KEY, JSON.stringify([...readIds]));
}

/**
 * Record ONE anonymous read against whatever is already persisted.
 *
 * `writeAnonymousState` replaces both keys with a host's whole view, which is
 * correct for a settled sync but wrong for a read: a `markRead` continuation
 * can pause across its awaits, its host can unmount, and a successor can
 * persist a read of its own in the meantime. Writing the full array on resume
 * dropped that read from the durable cache — the in-memory snapshot delta hid
 * it until the snapshot expired or the page reloaded, at which point the badge
 * came back.
 *
 * Re-reads storage at write time so it composes with whatever landed while the
 * caller was awaiting.
 */
export function recordAnonymousRead(
  storage: Storage,
  messageId: string,
  readAt: string,
): void {
  const messages = readAnonymousMessages(storage).map((message) => (
    message.id === messageId ? { ...message, readAt: message.readAt ?? readAt } : message
  ));
  const readIds = readAnonymousReadIds(storage);
  readIds.add(messageId);
  writeAnonymousState(storage, messages, readIds);
}

export function clearAnonymousState(storage: Storage): void {
  storage.removeItem(MESSAGES_KEY);
  storage.removeItem(READ_KEY);
  storage.removeItem(LEGACY_WINDOW_KEY);
}

/**
 * Three answers, not two. A 503 `amr-runtime-unavailable` means the daemon
 * could not ASK — it is not a statement about the user — and collapsing it into
 * "signed out" is only safe for a caller that is about to act once. A caller
 * that caches its result must be able to tell the difference, or it will serve
 * the public feed to a signed-in reader for as long as the cache lives.
 */
export type AmrAuthMode = 'signed-in' | 'signed-out' | 'unavailable';

export async function readAmrAuthMode(): Promise<AmrAuthMode> {
  const response = await fetch('/api/integrations/vela/status', { cache: 'no-store' });
  if (response.status === 503) {
    const payload = (await response.clone().json().catch(() => null)) as { error?: string } | null;
    if (payload?.error === 'amr-runtime-unavailable') return 'unavailable';
  }
  if (!response.ok) throw new Error(`AMR status failed: ${response.status}`);
  const payload = (await response.json()) as {
    loggedIn?: boolean;
    sessionState?: AmrSessionState;
  };
  // `loggedIn` answers "is a credential present", not "can it be used" — the
  // daemon keeps it true for an expired one and puts the verdict in
  // `sessionState`. This reader publishes what it finds as the shared
  // authority, and `App.isAmrSessionAuthenticated` reads the same status the
  // same way; disagreeing with it would let a reauth-required answer take the
  // authority back to signed-in and admit account pulls under a session that
  // cannot be used.
  const usable = payload.loggedIn === true && payload.sessionState !== 'reauth_required';
  return usable ? 'signed-in' : 'signed-out';
}

export async function isAmrLoggedIn(): Promise<boolean> {
  return (await readAmrAuthMode()) === 'signed-in';
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
