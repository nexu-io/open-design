// Global share-result toast (Owner S6-OK / S6-ERR / S14-ERR).
//
// Deliberately separate from the generic `Toast`: the share design is a dark
// pill with a SOLID status badge (green check / red "!"), the message, an
// optional plain underlined text action (never a capsule button), and a close
// cross. Restyling the shared Toast for this would leak into every other
// feature that uses it.

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useT } from '../../i18n';
import { Icon } from '../Icon';
import styles from './ShareFeedbackToast.module.css';

export type ShareFeedbackTone = 'success' | 'error' | 'loading';

export interface ShareFeedbackToastProps {
  tone: ShareFeedbackTone;
  message: string;
  /** Secondary line, e.g. why a manual retry did not confirm. */
  details?: string | null;
  actionLabel?: string | null;
  onAction?: () => void;
  onDismiss: () => void;
  /** Auto-dismiss after this many ms; 0 keeps the toast until dismissed. */
  ttlMs?: number;
}

// Matches the `.leaving` exit animation in the CSS Module.
const EXIT_MS = 140;

export function ShareFeedbackToast({
  tone,
  message,
  details,
  actionLabel,
  onAction,
  onDismiss,
  ttlMs = 0,
}: ShareFeedbackToastProps) {
  const t = useT();
  // Portal only after mount so SSR and the first hydration render agree.
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  useEffect(() => setPortalTarget(document.body), []);
  const [leaving, setLeaving] = useState(false);

  // Callers pass a fresh `onDismiss` closure every render; keep the timer keyed
  // only on what should re-arm it so parent churn cannot postpone the deadline.
  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    setLeaving(false);
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) return;
    const fadeId = window.setTimeout(() => setLeaving(true), Math.max(0, ttlMs - EXIT_MS));
    const dismissId = window.setTimeout(() => onDismissRef.current(), ttlMs);
    return () => {
      window.clearTimeout(fadeId);
      window.clearTimeout(dismissId);
    };
  }, [message, details, ttlMs]);

  const role = tone === 'error' ? 'alert' : 'status';
  const toast = (
    <div
      className={`${styles.toast}${leaving ? ` ${styles.leaving}` : ''}`}
      role={role}
      aria-live={role === 'alert' ? 'assertive' : 'polite'}
      data-tone={tone}
    >
      <span className={`${styles.badge} ${styles[tone]}`} aria-hidden>
        {tone === 'success' ? (
          <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="m3 8 3 3 7-7" />
          </svg>
        ) : tone === 'error' ? '!' : <Icon name="spinner" size={11} />}
      </span>
      <span className={styles.text}>
        <span className={styles.message}>{message}</span>
        {details ? <span className={styles.details}>{details}</span> : null}
      </span>
      {actionLabel && onAction ? (
        <button type="button" className={styles.action} onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
      <button type="button" className={styles.close} onClick={onDismiss} aria-label={t('common.dismiss')}>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m6 6 12 12M18 6 6 18" />
        </svg>
      </button>
    </div>
  );
  return portalTarget ? createPortal(toast, portalTarget) : null;
}
