import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button } from '@open-design/components';
import { advanceShareGuideClock, startShareGuideClock, type ShareGuideClock } from './after-export-share-guide';
import styles from './AfterExportShareGuide.module.css';

const TOTAL_MS = 10_000;

/** Anchored guide borrowing the shared canvas prompt/tool visual language. */
export function AfterExportShareGuide({ onOpenShare, onDismiss, onNeverShow, labels }: {
  onOpenShare: () => void;
  onDismiss: () => void;
  /** Return false when the permanent preference could not be persisted. */
  onNeverShow: () => boolean;
  labels: { title: string; description: string; openShare: string; neverShow: string; saveFailed: string };
}) {
  const [clock, setClock] = useState(() => startShareGuideClock(performance.now()));
  const [interaction, setInteraction] = useState({ hovered: false, focused: false });
  const [saveFailed, setSaveFailed] = useState(false);
  const fillRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (clock.paused) return;
    const delay = Math.max(0, clock.remainingMs - (performance.now() - clock.checkedAt));
    const timer = window.setTimeout(onDismiss, delay);
    return () => window.clearTimeout(timer);
  }, [clock, onDismiss]);

  // No per-frame timer: the countdown bar is a single CSS width transition per
  // clock transition (mount, hover/focus change), not a rAF or interval loop.
  useLayoutEffect(() => {
    const fill = fillRef.current;
    if (!fill) return;
    const startPercent = (clock.remainingMs / TOTAL_MS) * 100;
    fill.style.transition = 'none';
    fill.style.width = `${startPercent}%`;
    if (clock.paused) return;
    // Force layout so the reverted (transition: none) width above is
    // committed before re-enabling the transition below.
    void fill.offsetWidth;
    fill.style.transition = `width ${clock.remainingMs}ms linear`;
    fill.style.width = '0%';
  }, [clock]);

  function updateInteraction(next: typeof interaction) {
    setClock((previous: ShareGuideClock) => advanceShareGuideClock(previous, performance.now(), next));
    setInteraction(next);
  }
  return (
    <section
      className={styles.guide}
      role="status"
      aria-label={labels.title}
      onMouseEnter={() => updateInteraction({ ...interaction, hovered: true })}
      onMouseLeave={() => updateInteraction({ ...interaction, hovered: false })}
      onFocusCapture={() => updateInteraction({ ...interaction, focused: true })}
      onBlurCapture={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) updateInteraction({ ...interaction, focused: false });
      }}
    >
      <strong className={styles.header}>
        <span className={styles.pcheck} aria-hidden="true">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" focusable="false">
            <path d="m3 8 3 3 7-7" />
          </svg>
        </span>
        <span>{labels.title}</span>
      </strong>
      <p className={styles.desc}>{labels.description}</p>
      <div className={styles.pfoot}>
        <Button className={styles.pghost} type="button" onClick={() => {
          if (onNeverShow()) onDismiss();
          else setSaveFailed(true);
        }}>{labels.neverShow}</Button>
        <Button className={styles.paction} type="button" onClick={() => { onDismiss(); onOpenShare(); }}>{labels.openShare}</Button>
      </div>
      <div className={styles.minibar} aria-hidden="true">
        <div ref={fillRef} className={styles.minibarFill} />
      </div>
      {saveFailed ? <p className={styles.error} role="alert">{labels.saveFailed}</p> : null}
    </section>
  );
}
