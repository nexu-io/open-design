import { useEffect } from 'react';
import { useT } from '../../i18n';

interface Props {
  /** True while the kill request is in flight (button reads "Interrupting…"). */
  pending?: boolean;
  /** True after the run has been interrupted (button hides). */
  done?: boolean;
  /** Fires when the user clicks or presses Esc. */
  onInterrupt: () => void;
}

/**
 * Escape hatch for an in-flight critique run. Renders a button and
 * binds the platform `Escape` key so the user can bail without
 * reaching for the mouse. The handler is suppressed while `pending`
 * (the daemon is already processing the interrupt) and `done` (the
 * run has already terminated), so a frustrated double-tap on Esc
 * never queues a second kill.
 */
export function InterruptButton({ pending = false, done = false, onInterrupt }: Props) {
  const t = useT();

  useEffect(() => {
    if (done) return;
    const handler = (evt: KeyboardEvent) => {
      if (evt.key !== 'Escape') return;
      if (pending) return;
      // Lefarcen P2 on PR #1315: the previous revision fired the
      // interrupt regardless of focus, so pressing Escape inside the
      // prompt textarea, a search box, a select, or any
      // contenteditable would cancel an in-flight critique by
      // accident.
      const target = evt.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (target.isContentEditable) return;
        if (
          typeof target.closest === 'function'
          && target.closest('input, textarea, select, [contenteditable="true"]')
        ) {
          return;
        }
      }
      // PerishCode P3 on PR #1315: the window-scope listener still
      // collided with the very common "Esc to dismiss" pattern on
      // modals, popovers, and dropdowns. If a `[role="dialog"]` (or
      // any element with `aria-modal="true"`) is open elsewhere on
      // the page, defer to that surface's own Esc handler instead of
      // synthesizing an interrupt. The dialog can claim Esc by
      // calling `event.stopPropagation()` (the more common path) or
      // simply by being present when Esc fires (the safety net here).
      // Events that originate inside `.theater-stage` always fire, so
      // a Theater-internal Esc still works even when a transient
      // surface is open elsewhere.
      const insideTheater
        = target
        && typeof target.closest === 'function'
        && !!target.closest('.theater-stage');
      if (!insideTheater) {
        const openModal = document.querySelector(
          '[role="dialog"]:not([aria-hidden="true"]), [aria-modal="true"]:not([aria-hidden="true"])',
        );
        if (openModal) return;
      }
      onInterrupt();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [pending, done, onInterrupt]);

  if (done) return null;

  return (
    <button
      type="button"
      className="theater-interrupt"
      onClick={onInterrupt}
      disabled={pending}
      data-pending={pending ? 'true' : 'false'}
      aria-label={t('critiqueTheater.interrupt')}
      title={t('critiqueTheater.interrupt')}
    >
      {pending ? t('critiqueTheater.interrupting') : t('critiqueTheater.interrupt')}
    </button>
  );
}
