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
import { useTopToastStackIndex, TOP_TOAST_STACK_OFFSET_PX } from './toast-stack';

export type ShareFeedbackTone = 'success' | 'error' | 'loading';

// OD-1/item 5: every ShareFeedbackToast mounts fixed at the same `top: 64px`
// (see the module CSS). That was fine for one toast at a time, but the
// update-link toast, the deploy-result toasts, the workspace-share-guide
// toast (all now the same component — see FileViewer's routing), AND the
// generic top-placement `Toast` (export/version-restore toasts) can be
// simultaneously true, and previously two toasts drew on top of each other.
// `useTopToastStackIndex` is a shared external-store hook (./toast-stack)
// that gives each mounted instance — of EITHER toast component — a stacking
// index by registration order, so a second (or third) toast offsets downward
// instead of overlapping. The first toast keeps `top: 64px` unchanged (no
// inline style) so the common single-toast screenshots are byte-identical to
// before this existed.
const STACK_OFFSET_PX = TOP_TOAST_STACK_OFFSET_PX;

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

  const stackIndex = useTopToastStackIndex();
  const role = tone === 'error' ? 'alert' : 'status';
  const toast = (
    <div
      className={`${styles.toast}${leaving ? ` ${styles.leaving}` : ''}`}
      role={role}
      aria-live={role === 'alert' ? 'assertive' : 'polite'}
      data-tone={tone}
      style={stackIndex > 0 ? { top: `calc(64px + ${stackIndex * STACK_OFFSET_PX}px)` } : undefined}
    >
      <span className={`${styles.badge} ${styles[tone]}`} aria-hidden>
        {tone === 'success' ? (
          <Icon name="share-check" size={11} strokeWidth={1.8} />
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
        <Icon name="share-close-thick" size={14} strokeWidth={1.6} />
      </button>
    </div>
  );
  return portalTarget ? createPortal(toast, portalTarget) : null;
}
