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
      // accident. Scope the handler to events that originate outside
      // text-entry surfaces so the keybind only fires from the
      // Theater area (or generic body focus).
      const target = evt.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (target.isContentEditable) return;
        if (typeof target.closest === 'function') {
          if (target.closest('input, textarea, select, [contenteditable="true"]')) {
            return;
          }
        }
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
