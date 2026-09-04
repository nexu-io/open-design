import { Button } from '@open-design/components';
import { useCallback, useEffect, useId, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';

import { useI18n, type Locale } from '../i18n';
import {
  clearAnonymousState,
  findGoPlanSunsetMessage,
  isAmrLoggedIn,
  markAccountMessageRead,
  pullMessageCenter,
  readAnonymousMessages,
  readAnonymousReadIds,
  type MessageCenterMessage,
  writeAnonymousState,
} from '../message-center-client';
import { GoPlanSunsetDialog } from './GoPlanSunsetDialog';
import { Icon } from './Icon';
import styles from './MessageCenter.module.css';

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
  /** Hide the built-in bell trigger — the host renders its own entry point
   *  (e.g. an account-menu row) and drives the panel via `open`/`onOpenChange`. */
  hideTrigger?: boolean;
  /** The still-mounted host control focus returns to when the panel closes.
   *  Required alongside `hideTrigger`: the built-in bell is what focus would
   *  otherwise return to, and a host that hides it owns that duty instead. */
  returnFocusRef?: RefObject<HTMLElement | null>;
  /** Controlled open state; pair with `onOpenChange` when `hideTrigger` is set. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Streams the unread count so hosts can render their own badge (e.g. the
   *  rail avatar's red dot). */
  onUnreadCountChange?: (count: number) => void;
  /** Whether the Home shell currently grants the targeted announcement its
   *  modal slot. Detection still runs while false, so the notice can wait
   *  behind higher-priority business dialogs or a non-Home route. */
  priorityAnnouncementActive?: boolean;
  onPriorityAnnouncementPendingChange?: (pending: boolean) => void;
  priorityAnnouncementCurrentPlanId?: string | null;
  priorityAnnouncementMetricsConsent?: boolean;
}

type SyncState = 'loading' | 'ready' | 'error';

export function MessageCenter({
  onOpenNotificationSettings,
  hideTrigger = false,
  returnFocusRef,
  open: controlledOpen,
  onOpenChange,
  onUnreadCountChange,
  priorityAnnouncementActive = false,
  onPriorityAnnouncementPendingChange,
  priorityAnnouncementCurrentPlanId,
  priorityAnnouncementMetricsConsent = false,
}: Props) {
  const { locale, t } = useI18n();
  const titleId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const [openInternal, setOpenInternal] = useState(false);
  const open = controlledOpen ?? openInternal;
  const setOpen = useCallback(
    (next: boolean) => {
      setOpenInternal(next);
      onOpenChange?.(next);
    },
    [onOpenChange],
  );
  const [messages, setMessages] = useState<MessageCenterMessage[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [loggedIn, setLoggedIn] = useState(false);
  const [syncState, setSyncState] = useState<SyncState>('loading');
  const [priorityMessage, setPriorityMessage] = useState<MessageCenterMessage | null>(null);
  const loggedInRef = useRef(false);
  const messagesRef = useRef<MessageCenterMessage[]>([]);
  const readIdsRef = useRef<Set<string>>(new Set());
  const pendingReadIdsRef = useRef<Set<string>>(new Set());
  const syncRequestIdRef = useRef(0);
  const priorityPendingCallbackRef = useRef(onPriorityAnnouncementPendingChange);
  priorityPendingCallbackRef.current = onPriorityAnnouncementPendingChange;

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
      setPriorityMessage(null);
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
    setPriorityMessage(account ? findGoPlanSunsetMessage(merged) : null);
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

  useEffect(() => {
    onUnreadCountChange?.(unreadCount);
  }, [unreadCount, onUnreadCountChange]);

  useEffect(() => {
    onPriorityAnnouncementPendingChange?.(priorityMessage != null);
  }, [onPriorityAnnouncementPendingChange, priorityMessage]);

  useEffect(() => () => {
    priorityPendingCallbackRef.current?.(false);
  }, []);

  /** The control keyboard focus must land on after the panel closes. Opening
   *  focuses the portaled dialog, so closing always unmounts the focused node —
   *  without a target here focus falls to the document and the user loses their
   *  place in the rail. The built-in bell owns it by default; under
   *  `hideTrigger` that button does not exist and the host's opener does. */
  const returnFocusTarget = (): HTMLElement | null =>
    triggerRef.current ?? returnFocusRef?.current ?? null;

  const closePanel = () => {
    setOpen(false);
    returnFocusTarget()?.focus();
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

  useEffect(() => {
    if (priorityAnnouncementActive && priorityMessage != null && open) {
      setOpen(false);
    }
  }, [open, priorityAnnouncementActive, priorityMessage, setOpen]);

  const markRead = async (messageId: string, options?: { requireAccount?: boolean }) => {
    const message = messagesRef.current.find((item) => item.id === messageId);
    if (!message) {
      if (options?.requireAccount) throw new Error('Announcement message is no longer available');
      return;
    }
    if (message.readAt) {
      if (priorityMessage?.id === messageId) setPriorityMessage(null);
      return;
    }
    const account = await resolveLoggedInForWrite();
    if (options?.requireAccount && !account) {
      throw new Error('A signed-in account is required to acknowledge this announcement');
    }
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
    if (priorityMessage?.id === messageId) setPriorityMessage(null);
  };

  const openLabel = unreadCount > 0 ? `${t('messageCenter.openAria')} (${t('messageCenter.unreadCount', { count: unreadCount })})` : t('messageCenter.openAria');

  return <div className={styles.root}>
    {hideTrigger ? null : <button ref={triggerRef} type="button" className={`settings-icon-btn od-tooltip ${styles.trigger}`} onClick={() => setOpen(!open)} title={t('messageCenter.openAria')} data-tooltip={t('messageCenter.openAria')} data-tooltip-placement="bottom" aria-label={openLabel} aria-haspopup="dialog" aria-expanded={open} data-testid="message-center-trigger">
      <Icon name="bell" size={17} />{unreadCount > 0 ? <span className={styles.badge} aria-hidden>{unreadBadgeLabel(unreadCount)}</span> : null}
    </button>}
    {open ? createPortal(<div className={styles.backdrop} data-testid="message-center-backdrop"><aside ref={panelRef} className={styles.panel} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} data-testid="message-center-dialog">
      <header className={styles.header}><div className={styles.headerCopy}><h2 id={titleId}>{t('messageCenter.title')}</h2><p>{t('messageCenter.subtitle')}</p></div><Button size="icon" className={styles.close} onClick={closePanel} aria-label={t('messageCenter.close')}><Icon name="close" size={18} strokeWidth={2}/></Button></header>
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
        ) : messages.length === 0 ? <div className={styles.empty}><Icon name="bell" size={20}/><strong>{t('messageCenter.emptyAllTitle')}</strong><p>{t('messageCenter.emptyBody')}</p></div> : messages.map((message) => <MessageItem key={message.id} locale={locale} message={message} onRead={markRead} onError={() => setSyncState('error')}/>)}
      </div>
      <footer className={styles.footer}><p>{t('messageCenter.desktopSettingsHint')}</p>{onOpenNotificationSettings ? <Button variant="ghost" onClick={() => { closePanel(); onOpenNotificationSettings(); }}>{t('messageCenter.desktopSettings')}</Button> : null}</footer>
    </aside></div>, document.body) : null}
    {priorityMessage != null ? (
      <GoPlanSunsetDialog
        active={priorityAnnouncementActive}
        currentPlanId={priorityAnnouncementCurrentPlanId ?? 'unknown'}
        metricsConsent={priorityAnnouncementMetricsConsent}
        onDismiss={async () => {
          await markRead(priorityMessage.id, { requireAccount: true });
        }}
      />
    ) : null}
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
