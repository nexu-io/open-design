import { Button } from '@open-design/components';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useI18n, type Locale } from '../i18n';
import {
  clearAnonymousState,
  isAmrLoggedIn,
  markAccountMessageRead,
  markAllAccountMessagesRead,
  pullMessageCenter,
  readAnonymousMessages,
  readAnonymousReadIds,
  type MessageCenterFilter,
  type MessageCenterMessage,
  writeAnonymousState,
} from '../message-center-client';
import { Icon } from './Icon';
import styles from './MessageCenter.module.css';

const FILTERS: Array<{ id: MessageCenterFilter; label: 'messageCenter.filterAll' | 'messageCenter.filterUnread' | 'messageCenter.filterRead' }> = [
  { id: 'all', label: 'messageCenter.filterAll' },
  { id: 'unread', label: 'messageCenter.filterUnread' },
  { id: 'read', label: 'messageCenter.filterRead' },
];

function unreadBadgeLabel(count: number): string {
  return count > 9 ? '9+' : String(count);
}

function formatPublishedDate(value: string, locale: Locale): string | null {
  const publishedAt = new Date(value);
  if (Number.isNaN(publishedAt.getTime())) return null;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(publishedAt);
}

interface Props {
  onOpenNotificationSettings?: () => void;
}

type SyncState = 'loading' | 'ready' | 'error';

export function MessageCenter({ onOpenNotificationSettings }: Props) {
  const { locale, t } = useI18n();
  const titleId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<MessageCenterFilter>('all');
  const [messages, setMessages] = useState<MessageCenterMessage[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [loggedIn, setLoggedIn] = useState(false);
  const [syncState, setSyncState] = useState<SyncState>('loading');
  const loggedInRef = useRef(false);
  const messagesRef = useRef<MessageCenterMessage[]>([]);
  const readIdsRef = useRef<Set<string>>(new Set());
  const pendingReadIdsRef = useRef<Set<string>>(new Set());
  const syncRequestIdRef = useRef(0);

  const commitState = useCallback(
    (nextMessages: MessageCenterMessage[], nextReadIds: Set<string>, options?: { persistAnonymous?: boolean }) => {
      messagesRef.current = nextMessages;
      readIdsRef.current = nextReadIds;
      setMessages(nextMessages);
      setReadIds(nextReadIds);
      if (options?.persistAnonymous) writeAnonymousState(window.localStorage, nextMessages, nextReadIds);
    },
    [],
  );

  const sync = useCallback(async () => {
    const requestId = syncRequestIdRef.current + 1;
    syncRequestIdRef.current = requestId;
    if (messagesRef.current.length === 0) setSyncState('loading');
    const account = await isAmrLoggedIn();
    const wasAccount = loggedInRef.current;
    loggedInRef.current = account;
    setLoggedIn(account);
    if (wasAccount && !account) {
      readIdsRef.current = new Set();
      pendingReadIdsRef.current = new Set();
    }
    const pulled = await pullMessageCenter({ locale, loggedIn: account });
    if (requestId !== syncRequestIdRef.current) return;
    const serverReadIds = new Set(pulled.filter((message) => Boolean(message.readAt)).map((message) => message.id));
    if (account) {
      pendingReadIdsRef.current = new Set(
        [...pendingReadIdsRef.current].filter((messageId) => !serverReadIds.has(messageId)),
      );
    }
    const overlayReadIds = new Set([
      ...serverReadIds,
      ...(account ? pendingReadIdsRef.current : []),
      ...(!account ? readIdsRef.current : []),
    ]);
    const merged = pulled.map((message) => ({
      ...message,
      readAt: message.readAt ?? (overlayReadIds.has(message.id) ? new Date().toISOString() : null),
    }));
    if (account) clearAnonymousState(window.localStorage);
    commitState(merged, overlayReadIds, { persistAnonymous: !account });
    setSyncState('ready');
  }, [commitState, locale]);

  const resolveLoggedInForWrite = useCallback(async () => {
    const account = await isAmrLoggedIn();
    loggedInRef.current = account;
    setLoggedIn(account);
    return account;
  }, []);

  const retrySync = useCallback(() => {
    void sync().catch(() => setSyncState('error'));
  }, [sync]);

  const invalidateSyncResponses = useCallback(() => {
    syncRequestIdRef.current += 1;
  }, []);

  useEffect(() => {
    commitState(
      readAnonymousMessages(window.localStorage),
      readAnonymousReadIds(window.localStorage),
    );
  }, [commitState]);

  useEffect(() => {
    retrySync();
    const interval = window.setInterval(retrySync, 60_000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') retrySync();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [retrySync]);

  useEffect(() => {
    if (open) retrySync();
  }, [open, retrySync]);

  const unreadCount = messages.filter((message) => !message.readAt).length;
  const visibleMessages = useMemo(
    () => messages.filter((message) => filter === 'all' || (filter === 'read' ? Boolean(message.readAt) : !message.readAt)),
    [filter, messages],
  );

  const closePanel = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !triggerRef.current?.contains(target)) closePanel();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePanel();
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const markRead = async (messageId: string) => {
    const message = messagesRef.current.find((item) => item.id === messageId);
    if (!message || message.readAt) return;
    const account = await resolveLoggedInForWrite();
    const readAt = new Date().toISOString();
    if (account) await markAccountMessageRead(messageId);
    const nextIds = new Set(readIdsRef.current).add(messageId);
    const nextMessages = messagesRef.current.map((item) => (item.id === messageId ? { ...item, readAt } : item));
    if (account) {
      pendingReadIdsRef.current = new Set(pendingReadIdsRef.current).add(messageId);
      clearAnonymousState(window.localStorage);
    }
    invalidateSyncResponses();
    commitState(nextMessages, nextIds, { persistAnonymous: !account });
  };

  const markAllRead = async () => {
    const account = await resolveLoggedInForWrite();
    if (account) await markAllAccountMessagesRead();
    const readAt = new Date().toISOString();
    const nextIds = new Set(messagesRef.current.map((message) => message.id));
    const nextMessages = messagesRef.current.map((message) => ({ ...message, readAt: message.readAt ?? readAt }));
    if (account) {
      pendingReadIdsRef.current = new Set(nextIds);
      clearAnonymousState(window.localStorage);
    }
    invalidateSyncResponses();
    commitState(nextMessages, nextIds, { persistAnonymous: !account });
  };

  const openLabel = unreadCount > 0 ? `${t('messageCenter.openAria')} (${t('messageCenter.unreadCount', { count: unreadCount })})` : t('messageCenter.openAria');
  const emptyTitle = filter === 'unread' ? t('messageCenter.emptyUnreadTitle') : filter === 'read' ? t('messageCenter.emptyReadTitle') : t('messageCenter.emptyAllTitle');

  return <div className={styles.root}>
    <button ref={triggerRef} type="button" className={`settings-icon-btn od-tooltip ${styles.trigger}`} onClick={() => setOpen((value) => !value)} title={t('messageCenter.openAria')} data-tooltip={t('messageCenter.openAria')} data-tooltip-placement="bottom" aria-label={openLabel} aria-haspopup="dialog" aria-expanded={open} data-testid="message-center-trigger">
      <Icon name="bell" size={17} />{unreadCount > 0 ? <span className={styles.badge} aria-hidden>{unreadBadgeLabel(unreadCount)}</span> : null}
    </button>
    {open ? createPortal(<div className={styles.backdrop} data-testid="message-center-backdrop"><aside ref={panelRef} className={styles.panel} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} data-testid="message-center-dialog">
      <header className={styles.header}><div className={styles.headerCopy}><h2 id={titleId}>{t('messageCenter.title')}</h2><p>{t('messageCenter.subtitle')}</p></div><button type="button" className={styles.close} onClick={closePanel} aria-label={t('messageCenter.close')}><Icon name="close" size={18} strokeWidth={2}/></button></header>
      <div className={styles.controls}><div className={styles.filters} role="group" aria-label={t('messageCenter.title')}>{FILTERS.map((item) => <button key={item.id} type="button" className={`${styles.filter}${filter === item.id ? ` ${styles.filterActive}` : ''}`} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{t(item.label)}{item.id === 'unread' && unreadCount > 0 ? <span className={styles.filterBadge} aria-hidden>{unreadBadgeLabel(unreadCount)}</span> : null}</button>)}</div><button type="button" className={styles.markAll} onClick={() => void markAllRead().catch(() => setSyncState('error'))} disabled={unreadCount === 0}>{t('messageCenter.markAllRead')}</button></div>
      <div className={styles.list} aria-live="polite">
        {syncState === 'error' && messages.length > 0 ? (
          <div className={styles.syncStatus} role="status">
            <span>{t('settings.updateStatusFailed')}</span>
            <button type="button" onClick={retrySync}>
              {t('settings.updateRetry')}
            </button>
          </div>
        ) : null}
        {syncState === 'loading' && messages.length === 0 ? (
          <div className={styles.empty} role="status">
            <Icon name="spinner" size={20} className="icon-spin" />
            <strong>{t('settings.updateStatusChecking')}</strong>
          </div>
        ) : syncState === 'error' && messages.length === 0 ? (
          <div className={styles.empty}>
            <Icon name="bell" size={20}/>
            <div className={styles.emptyError} role="status">
              <span>{t('settings.updateStatusFailed')}</span>
              <button type="button" onClick={retrySync}>
                {t('settings.updateRetry')}
              </button>
            </div>
          </div>
        ) : visibleMessages.length === 0 ? <div className={styles.empty}><Icon name="bell" size={20}/><strong>{emptyTitle}</strong><p>{t('messageCenter.emptyBody')}</p></div> : visibleMessages.map((message) => <MessageItem key={message.id} locale={locale} message={message} onRead={markRead} onError={() => setSyncState('error')}/>)}
      </div>
      <footer className={styles.footer}><p>{t('messageCenter.desktopSettingsHint')}</p>{onOpenNotificationSettings ? <Button variant="ghost" onClick={() => { closePanel(); onOpenNotificationSettings(); }}>{t('messageCenter.desktopSettings')}</Button> : null}</footer>
    </aside></div>, document.body) : null}
  </div>;
}

function MessageItem({
  locale,
  message,
  onRead,
  onError,
}: {
  locale: Locale;
  message: MessageCenterMessage;
  onRead: (id: string) => Promise<void>;
  onError: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const formatted = formatPublishedDate(message.publishedAt, locale);
  const ctaUrl = safeExternalUrl(message.ctaUrl);
  return <article className={`${styles.item}${message.readAt ? '' : ` ${styles.itemUnread}`}${expanded ? ` ${styles.itemExpanded}` : ''}`}>
    <button type="button" className={styles.itemSummary} aria-expanded={expanded} onClick={() => { setExpanded((value) => !value); void onRead(message.id).catch(onError); }}><span className={styles.itemMeta}><span>{message.typeName}</span>{formatted ? <time dateTime={message.publishedAt}>{formatted}</time> : null}</span><strong>{message.title}</strong><span className={styles.bodyPreview}>{message.body}</span></button>
    {expanded && message.ctaLabel && ctaUrl ? <div className={styles.itemActions}><button type="button" className={styles.primaryAction} onClick={() => window.open(ctaUrl, '_blank', 'noopener,noreferrer')}>{message.ctaLabel}</button></div> : null}
  </article>;
}

function safeExternalUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value, window.location.href);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}
