import { useEffect, useState } from 'react';
import { Button } from '@open-design/components';
import { advanceShareGuideClock, startShareGuideClock, type ShareGuideClock } from './after-export-share-guide';
import { Icon } from '../Icon';
import { ShareButton } from './ShareButton';
import { ShareErrorRow } from './ShareErrorRow';
import styles from './AfterExportShareGuide.module.css';

const TOTAL_MS = 10_000;

/**
 * Anchored guide card, restored 1:1 from `phase-owner-intro` in
 * "交互状态 - Owner - 分享评论1.0.html" (Owner-P1 final design review):
 * dark comment-bubble hero, close (X) over the hero, title/description body,
 * and a dismiss/try-share action row (space-between, ghost + dark buttons).
 * The auto-dismiss countdown (hover/focus pauses it, matching the prior
 * wave's product behavior) has no visual bar in the design — kept as an
 * invisible timer instead of reintroducing the old minibar UI.
 */
export function AfterExportShareGuide({ onOpenShare, onDismiss, onNeverShow, labels }: {
  onOpenShare: () => void;
  onDismiss: () => void;
  /** Return false when the permanent preference could not be persisted. */
  onNeverShow: () => boolean;
  labels: { title: string; description: string; openShare: string; neverShow: string; close: string; saveFailed: string };
}) {
  const [clock, setClock] = useState(() => startShareGuideClock(performance.now()));
  const [interaction, setInteraction] = useState({ hovered: false, focused: false });
  const [saveFailed, setSaveFailed] = useState(false);
  useEffect(() => {
    if (clock.paused) return;
    const delay = Math.max(0, clock.remainingMs - (performance.now() - clock.checkedAt));
    const timer = window.setTimeout(onDismiss, delay);
    return () => window.clearTimeout(timer);
  }, [clock, onDismiss]);

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
      <div className={styles.hero} aria-hidden="true">
        <div className={styles.cover}>
          <div className={styles.artwork}>
            {/* Decorative sample comment bubbles from the design mockup — not
                real comment content, so left untranslated like the source. */}
            <span className={`${styles.bubble} ${styles.bubblePurple}`}>Remove button</span>
            <span className={`${styles.bubble} ${styles.bubbleGreen}`}>Let’s refine</span>
            <span className={`${styles.bubble} ${styles.bubblePink}`}>Love this!</span>
          </div>
        </div>
      </div>
      <Button type="button" className={styles.close} aria-label={labels.close} onClick={onDismiss}>
        <Icon name="share-close-fill" size={15} />
      </Button>
      <div className={styles.body}>
        <h2 className={styles.title}>{labels.title}</h2>
        <p className={styles.desc}>{labels.description}</p>
        <div className={styles.actions}>
          <Button className={styles.dismiss} type="button" onClick={() => {
            if (onNeverShow()) onDismiss();
            else setSaveFailed(true);
          }}>{labels.neverShow}</Button>
          <ShareButton variant="dark-sm" onClick={() => { onDismiss(); onOpenShare(); }}>{labels.openShare}</ShareButton>
        </div>
        {saveFailed ? (
          <div className={styles.error}>
            <ShareErrorRow message={labels.saveFailed} role="alert" />
          </div>
        ) : null}
      </div>
    </section>
  );
}
