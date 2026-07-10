import { Button } from '@open-design/components';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { Dict } from '../i18n/types';
import { useT } from '../i18n';
import { Icon } from './Icon';
import styles from './MessageCenterDemo.module.css';

type MessageFilter = 'all' | 'unread' | 'read';

interface DemoMessage {
  id: string;
  typeKey: keyof Dict;
  titleKey: keyof Dict;
  summaryKey: keyof Dict;
  bodyKey: keyof Dict;
  actionKey: keyof Dict;
  timeKey: keyof Dict;
  unread: boolean;
}

interface DemoMessageState {
  read: boolean;
  expanded: boolean;
}

const FILTERS: Array<{ id: MessageFilter; labelKey: keyof Dict }> = [
  { id: 'all', labelKey: 'messageCenter.filterAll' },
  { id: 'unread', labelKey: 'messageCenter.filterUnread' },
  { id: 'read', labelKey: 'messageCenter.filterRead' },
];

const DEMO_MESSAGES: DemoMessage[] = [
  {
    id: 'release-0130',
    typeKey: 'messageCenter.type.product',
    titleKey: 'messageCenter.demo.release.title',
    summaryKey: 'messageCenter.demo.release.summary',
    bodyKey: 'messageCenter.demo.release.body',
    actionKey: 'messageCenter.demo.release.action',
    timeKey: 'messageCenter.time.today',
    unread: true,
  },
  {
    id: 'teams-preview',
    typeKey: 'messageCenter.type.announcement',
    titleKey: 'messageCenter.demo.teams.title',
    summaryKey: 'messageCenter.demo.teams.summary',
    bodyKey: 'messageCenter.demo.teams.body',
    actionKey: 'messageCenter.demo.teams.action',
    timeKey: 'messageCenter.time.yesterday',
    unread: true,
  },
  {
    id: 'credits-pack',
    typeKey: 'messageCenter.type.benefit',
    titleKey: 'messageCenter.demo.credits.title',
    summaryKey: 'messageCenter.demo.credits.summary',
    bodyKey: 'messageCenter.demo.credits.body',
    actionKey: 'messageCenter.demo.credits.action',
    timeKey: 'messageCenter.time.jun30',
    unread: false,
  },
  {
    id: 'maintenance',
    typeKey: 'messageCenter.type.maintenance',
    titleKey: 'messageCenter.demo.maintenance.title',
    summaryKey: 'messageCenter.demo.maintenance.summary',
    bodyKey: 'messageCenter.demo.maintenance.body',
    actionKey: 'messageCenter.demo.maintenance.action',
    timeKey: 'messageCenter.time.jun29',
    unread: true,
  },
  {
    id: 'templates',
    typeKey: 'messageCenter.type.template',
    titleKey: 'messageCenter.demo.templates.title',
    summaryKey: 'messageCenter.demo.templates.summary',
    bodyKey: 'messageCenter.demo.templates.body',
    actionKey: 'messageCenter.demo.templates.action',
    timeKey: 'messageCenter.time.jun27',
    unread: false,
  },
];

function createInitialState(): Record<string, DemoMessageState> {
  return Object.fromEntries(
    DEMO_MESSAGES.map((message) => [
      message.id,
      { read: !message.unread, expanded: false },
    ]),
  );
}

function unreadBadgeLabel(count: number): string {
  return count > 9 ? '9+' : String(count);
}

interface Props {
  onOpenNotificationSettings?: () => void;
}

export function MessageCenterDemo({ onOpenNotificationSettings }: Props) {
  const t = useT();
  const titleId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Map<string, HTMLElement>>(new Map());
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<MessageFilter>('all');
  const [messages, setMessages] = useState(createInitialState);
  const [toast, setToast] = useState<string | null>(null);

  const unreadCount = useMemo(
    () =>
      DEMO_MESSAGES.filter((message) => {
        const state = messages[message.id];
        return state && !state.read;
      }).length,
    [messages],
  );

  const visibleMessages = useMemo(
    () =>
      DEMO_MESSAGES.filter((message) => {
        const state = messages[message.id];
        if (!state) return false;
        if (filter === 'unread') return !state.read;
        if (filter === 'read') return state.read;
        return true;
      }),
    [filter, messages],
  );

  const expandedMessageId = useMemo(
    () => visibleMessages.find((message) => messages[message.id]?.expanded)?.id ?? null,
    [messages, visibleMessages],
  );

  const openLabel =
    unreadCount > 0
      ? `${t('messageCenter.openAria')} (${t('messageCenter.unreadCount', { count: unreadCount })})`
      : t('messageCenter.openAria');

  const closePanel = () => {
    setOpen(false);
    setToast(null);
    triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      closePanel();
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
    if (!open || !expandedMessageId) return;

    const timer = window.setTimeout(() => {
      const list = listRef.current;
      const item = itemRefs.current.get(expandedMessageId);
      if (!list || !item) return;

      const listRect = list.getBoundingClientRect();
      const itemRect = item.getBoundingClientRect();
      const topInset = 12;
      const bottomInset = 24;

      if (itemRect.bottom > listRect.bottom - bottomInset) {
        list.scrollTop += itemRect.bottom - listRect.bottom + bottomInset;
      } else if (itemRect.top < listRect.top + topInset) {
        list.scrollTop -= listRect.top + topInset - itemRect.top;
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [expandedMessageId, open]);

  const toggleExpanded = (id: string) => {
    setMessages((current) =>
      Object.fromEntries(
        Object.entries(current).map(([messageId, state]) => [
          messageId,
          messageId === id
            ? { ...state, read: true, expanded: !state.expanded }
            : { ...state, expanded: false },
        ]),
      ),
    );
  };

  const markAllRead = () => {
    setMessages((current) =>
      Object.fromEntries(
        Object.entries(current).map(([id, state]) => [id, { ...state, read: true }]),
      ),
    );
  };

  const emptyTitle =
    filter === 'unread'
      ? t('messageCenter.emptyUnreadTitle')
      : filter === 'read'
        ? t('messageCenter.emptyReadTitle')
        : t('messageCenter.emptyAllTitle');

  return (
    <div className={styles.root}>
      <button
        ref={triggerRef}
        type="button"
        className={`settings-icon-btn od-tooltip ${styles.trigger}`}
        onClick={() => setOpen((value) => !value)}
        title={t('messageCenter.openAria')}
        data-tooltip={t('messageCenter.openAria')}
        data-tooltip-placement="bottom"
        aria-label={openLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-testid="message-center-trigger"
      >
        <Icon name="bell" size={17} />
        {unreadCount > 0 ? (
          <span className={styles.badge} aria-hidden>
            {unreadBadgeLabel(unreadCount)}
          </span>
        ) : null}
      </button>

      {open
        ? createPortal(
            <div className={styles.backdrop} data-testid="message-center-backdrop">
              <aside
                ref={panelRef}
                className={styles.panel}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                tabIndex={-1}
                data-testid="message-center-dialog"
              >
                <header className={styles.header}>
                  <div className={styles.headerCopy}>
                    <h2 id={titleId}>{t('messageCenter.title')}</h2>
                    <p>{t('messageCenter.subtitle')}</p>
                  </div>
                  <button
                    type="button"
                    className={styles.close}
                    onClick={closePanel}
                    aria-label={t('messageCenter.close')}
                  >
                    <Icon name="close" size={15} />
                  </button>
                </header>

                <div className={styles.controls}>
                  <div
                    className={styles.filters}
                    role="group"
                    aria-label={t('messageCenter.title')}
                  >
                    {FILTERS.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`${styles.filter}${filter === item.id ? ` ${styles.filterActive}` : ''}`}
                        aria-pressed={filter === item.id}
                        onClick={() => setFilter(item.id)}
                      >
                        {t(item.labelKey)}
                        {item.id === 'unread' && unreadCount > 0 ? (
                          <span className={styles.filterBadge} aria-hidden>
                            {unreadBadgeLabel(unreadCount)}
                          </span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className={styles.markAll}
                    onClick={markAllRead}
                    disabled={unreadCount === 0}
                  >
                    {t('messageCenter.markAllRead')}
                  </button>
                </div>

                <div ref={listRef} className={styles.list} aria-live="polite">
                  {visibleMessages.length === 0 ? (
                    <div className={styles.empty}>
                      <Icon name="bell" size={20} />
                      <strong>{emptyTitle}</strong>
                      <p>{t('messageCenter.emptyBody')}</p>
                    </div>
                  ) : (
                    visibleMessages.map((message) => {
                      const state = messages[message.id];
                      if (!state) return null;
                      return (
                        <article
                          key={message.id}
                          ref={(node) => {
                            if (node) itemRefs.current.set(message.id, node);
                            else itemRefs.current.delete(message.id);
                          }}
                          className={`${styles.item}${state.read ? '' : ` ${styles.itemUnread}`}${state.expanded ? ` ${styles.itemExpanded}` : ''}`}
                        >
                          <button
                            type="button"
                            className={styles.itemSummary}
                            aria-expanded={state.expanded}
                            onClick={() => toggleExpanded(message.id)}
                          >
                            <span className={styles.itemMeta}>
                              <span>{t(message.typeKey)}</span>
                              <time>{t(message.timeKey)}</time>
                            </span>
                            <strong>{t(message.titleKey)}</strong>
                            <span className={styles.bodyPreview}>{t(message.bodyKey)}</span>
                          </button>

                          {state.expanded ? (
                            <div className={styles.itemActions}>
                              <button
                                type="button"
                                className={styles.primaryAction}
                                onClick={() =>
                                  setToast(
                                    t('messageCenter.actionToast', {
                                      title: t(message.titleKey),
                                    }),
                                  )
                                }
                              >
                                {t(message.actionKey)}
                              </button>
                            </div>
                          ) : null}
                        </article>
                      );
                    })
                  )}
                </div>

                <footer className={styles.footer}>
                  <p>{t('messageCenter.desktopSettingsHint')}</p>
                  {onOpenNotificationSettings ? (
                    <Button
                      variant="ghost"
                      onClick={() => {
                        closePanel();
                        onOpenNotificationSettings();
                      }}
                    >
                      {t('messageCenter.desktopSettings')}
                    </Button>
                  ) : null}
                </footer>

                {toast ? (
                  <div className={styles.toast} role="status">
                    <span>{toast}</span>
                    <button type="button" onClick={() => setToast(null)}>
                      {t('messageCenter.toastDismiss')}
                    </button>
                  </div>
                ) : null}
              </aside>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
