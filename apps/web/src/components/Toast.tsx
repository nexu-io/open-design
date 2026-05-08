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

import { useEffect } from 'react';

export interface ToastProps {
  message: string;
  details?: string | null;
  // Optional code/preformatted body. When present the toast pins
  // itself open (no auto-dismiss) so the user has time to manually
  // copy the content. Used for the clipboard-failure recovery path
  // in Continue in CLI: when copyToClipboard returns false the
  // prepared prompt is rendered here so the user can select-and-copy
  // it manually.
  code?: string | null;
  ttlMs?: number;
  onDismiss?: () => void;
}

const DEFAULT_TTL = 4000;

export function Toast({ message, details, code, ttlMs = DEFAULT_TTL, onDismiss }: ToastProps) {
  // When code is present the toast is a manual-action surface; never
  // auto-dismiss it out from under the user mid-copy.
  const effectiveTtl = code ? 0 : ttlMs;

  useEffect(() => {
    if (!onDismiss || !Number.isFinite(effectiveTtl) || effectiveTtl <= 0) return;
    const id = window.setTimeout(() => {
      onDismiss();
    }, effectiveTtl);
    return () => window.clearTimeout(id);
  }, [message, details, code, effectiveTtl, onDismiss]);

  return (
    <div className="od-toast" role="status" aria-live="polite">
      <div className="od-toast-message">{message}</div>
      {details ? <div className="od-toast-details">{details}</div> : null}
      {code ? (
        <pre className="od-toast-code">{code}</pre>
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
