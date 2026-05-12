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
