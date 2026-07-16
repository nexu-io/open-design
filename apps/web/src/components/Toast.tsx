// Lightweight transient toast for the new project-actions toolbar
// (Continue in CLI / Finalize design package — #451). Mirrors the
// canonical state-based pattern from PromptTemplatePreviewModal:
// transient state cleared on a setTimeout, no portal, no DOM
// imperative work. Single-toast queue; multi-toast support is
// deliberately deferred to a follow-up.
//
// Renders an optional secondary `details` line beneath the primary
// message so daemon error envelopes that carry an upstream
// explanation (e.g. Anthropic account-usage-cap reasons) can surface
// the real upstream message alongside the daemon's category label.

import { useEffect, useRef, useState } from 'react';

import { Icon } from './Icon';

export interface ToastProps {
  message: string;
  className?: string;
  details?: string | null;
  actionLabel?: string | null;
  actionAriaLabel?: string;
  onAction?: () => void;
  // Optional code/preformatted body. When present the toast pins
  // itself open (no auto-dismiss) so the user has time to manually
  // copy the content. Used for the clipboard-failure recovery path
  // in Continue in CLI: when copyToClipboard returns false the
  // prepared prompt is rendered here so the user can select-and-copy
  // it manually.
  code?: string | null;
  ttlMs?: number;
  onDismiss?: () => void;
  /** ARIA role. Use "alert" for error messages (announced immediately),
   *  "status" (default) for non-urgent confirmations. */
  role?: 'status' | 'alert';
  tone?: 'default' | 'success' | 'error' | 'loading';
  placement?: 'bottom' | 'top';
}

const DEFAULT_TTL = 4000;
// Exit fade duration — kept in sync with the .od-toast.leaving CSS animation.
// The fade plays inside the TTL window (it begins at ttlMs - EXIT_MS) so the
// toast unmounts at exactly ttlMs. Auto-dismiss timing therefore matches the
// pre-fade contract: callers that rely on the toast being gone by ttlMs keep
// working, and the exit animation no longer extends the toast's lifetime.
const EXIT_MS = 160;

// A leading status glyph makes the toast's outcome readable at a glance:
// a check for confirmations (e.g. "Screenshot copied to clipboard"), a
// spinner while an action is in flight, and an alert for failures.
const TONE_ICON: Record<
  NonNullable<ToastProps['tone']>,
  'alert-triangle' | 'check' | 'spinner' | null
> = {
  default: null,
  success: 'check',
  error: 'alert-triangle',
  loading: 'spinner',
};

export function Toast({
  message,
  className,
  details,
  actionLabel,
  actionAriaLabel,
  onAction,
  code,
  ttlMs = DEFAULT_TTL,
  onDismiss,
  role = 'status',
  tone = 'default',
  placement = 'bottom',
}: ToastProps) {
  // When code is present the toast is a manual-action surface; never
  // auto-dismiss it out from under the user mid-copy.
  const effectiveTtl = code ? 0 : ttlMs;
  const [leaving, setLeaving] = useState(false);

  // Callers pass `onDismiss={() => setToast(null)}` — a fresh closure on every
  // parent render. If that closure sits in the auto-dismiss effect's dependency
  // array, any parent re-render (e.g. a ticking "running 8.6s" elapsed counter
  // during extraction) clears and re-arms the timers, so the deadline is pushed
  // forward forever and the toast NEVER auto-dismisses. Hold the latest callback
  // in a ref and key the timer effect only on the values that should actually
  // re-arm it (message/details/code/ttl), keeping a stable identity for the
  // timer so it counts down uninterrupted regardless of parent render churn.
  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  // `hasDismiss` is a stable boolean: re-arm only when the callback appears or
  // disappears, not when its identity changes while staying defined.
  const hasDismiss = !!onDismiss;

  useEffect(() => {
    // Re-entrant: a new message reuses the same mounted toast, so clear any
    // prior leaving state before re-arming the timers.
    setLeaving(false);
    if (!hasDismiss || !Number.isFinite(effectiveTtl) || effectiveTtl <= 0) return;
    // Begin the fade-out EXIT_MS before the deadline so the exit animation
    // plays within the TTL window and onDismiss (which unmounts us) lands at
    // exactly effectiveTtl. Clamp the fade start to 0 for very short TTLs.
    const fadeAt = Math.max(0, effectiveTtl - EXIT_MS);
    const fadeId = window.setTimeout(() => setLeaving(true), fadeAt);
    const dismissId = window.setTimeout(() => onDismissRef.current?.(), effectiveTtl);
    return () => {
      window.clearTimeout(fadeId);
      window.clearTimeout(dismissId);
    };
  }, [message, details, code, effectiveTtl, hasDismiss]);

  const iconName = TONE_ICON[tone];

  // Animation is owned entirely by CSS (`.od-toast` `od-toast-in` on mount,
  // `.leaving` `od-toast-out` on exit). A previous motion/react `<motion.div>`
  // ran a SECOND entrance (opacity + scale 0.95→1) on top of the CSS keyframe,
  // which read as a "flash then grow" pop-in; worse, motion writes an inline
  // `transform`, clobbering the `translateX(-50%)` centering and leaving the
  // toast off-centre. Keep this a plain div so the CSS keyframes are the single
  // source of truth for both motion and centering.
  return (
    <div
      className={`od-toast tone-${tone} placement-${placement}${className ? ` ${className}` : ''}${leaving ? ' leaving' : ''}`}
      role={role}
      aria-live={role === 'alert' ? 'assertive' : 'polite'}
    >
      <div className="od-toast-body">
        {iconName ? (
          <span className="od-toast-icon" aria-hidden>
            <Icon name={iconName} size={14} />
          </span>
        ) : null}
        <div className="od-toast-message">{message}</div>
      </div>
      {details ? <div className="od-toast-details">{details}</div> : null}
      {code ? (
        <pre className="od-toast-code">{code}</pre>
      ) : null}
      {actionLabel && onAction ? (
        <button
          type="button"
          className="od-toast-action"
          onClick={onAction}
          aria-label={actionAriaLabel ?? actionLabel}
        >
          {actionLabel}
        </button>
      ) : null}
      {!code && onDismiss ? (
        <button
          type="button"
          className="od-toast-close"
          onClick={onDismiss}
          aria-label="Dismiss"
        >
          <Icon name="close" size={13} />
        </button>
      ) : null}
      {code && onDismiss ? (
        <button
          type="button"
          className="od-toast-dismiss"
          onClick={onDismiss}
          aria-label="Dismiss"
        >
          Dismiss
        </button>
      ) : null}
    </div>
  );
}
