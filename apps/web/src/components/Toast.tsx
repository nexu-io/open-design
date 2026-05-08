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
  ttlMs?: number;
  onDismiss?: () => void;
}

const DEFAULT_TTL = 4000;

export function Toast({ message, details, ttlMs = DEFAULT_TTL, onDismiss }: ToastProps) {
  useEffect(() => {
    if (!onDismiss || !Number.isFinite(ttlMs) || ttlMs <= 0) return;
    const id = window.setTimeout(() => {
      onDismiss();
    }, ttlMs);
    return () => window.clearTimeout(id);
  }, [message, details, ttlMs, onDismiss]);

  return (
    <div className="od-toast" role="status" aria-live="polite">
      <div className="od-toast-message">{message}</div>
      {details ? <div className="od-toast-details">{details}</div> : null}
    </div>
  );
}
