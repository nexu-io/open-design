import { useLayoutEffect, useMemo, useRef } from 'react';

import { useT } from '../../i18n';
import type { RunProgressStep } from '../../runtime/run-progress';
import { stepLabel } from './run-step-label';
import styles from './RunStepFeed.module.css';

interface Props {
  /** True while the chat agent is generating. */
  running: boolean;
  /** The running turn's tool calls, NEWEST FIRST (see `runtime/run-progress`). */
  steps: readonly RunProgressStep[];
  className?: string;
}

/**
 * The agent's tool calls as a log: oldest at the top, the current step on the
 * bottom line, the container following the tail.
 *
 * Reading order is the point. The old rendering put the newest line first and
 * clipped the rest behind a fade, which read as a truncated list rather than as
 * progress; a log grows the way the work does.
 *
 * It renders nothing at all when no run is in flight.
 *
 * It scrolls itself and is never scrollable by hand — `overflow: hidden` still
 * accepts a programmatic `scrollTop`, so the whole surface can stay
 * `pointer-events: none` and leave the pane's drag-to-upload target intact.
 */
export function RunStepFeed({ running, steps, className }: Props) {
  const t = useT();
  const listRef = useRef<HTMLUListElement | null>(null);
  // `runProgressSteps` is newest-first — the honest shape for a reducer whose
  // head is "what is happening now". Presentation order belongs here.
  const ordered = useMemo(() => (running ? [...steps].reverse() : []), [running, steps]);
  const newestId = ordered.length > 0 ? ordered[ordered.length - 1]!.id : null;

  // Before paint, so a landing line never shows at the wrong offset first.
  // The same pass records whether anything is actually scrolling out of the
  // top, which is the only case the fade above the list is for.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    list.scrollTop = list.scrollHeight;
    // Measured from the items' own laid-out box, not `scrollHeight`: the line
    // that just landed is still mid `df-feed-enter`, translated 6px down, and
    // a transform counts toward scrollable overflow — so EVERY new line read
    // as an overflow, and the flag (set once, re-checked only on the next
    // step) stayed on for the rest of the run. That put the 24px fade over a
    // feed of one or two lines and washed the status line out. `offsetTop`
    // ignores transforms, so this is the height the lines actually occupy.
    const first = list.firstElementChild as HTMLElement | null;
    const last = list.lastElementChild as HTMLElement | null;
    const contentHeight = first && last ? last.offsetTop + last.offsetHeight - first.offsetTop : 0;
    if (contentHeight > list.clientHeight + 1) {
      list.setAttribute('data-overflowing', 'true');
    } else {
      list.removeAttribute('data-overflowing');
    }
  }, [newestId, running]);

  // Nothing to log between runs: the surface this feed sits on (the build
  // preview's dock) is there to report work in flight, and a resting line of
  // copy in it reads as a caption on the page underneath.
  if (!running) return null;

  return (
    <ul
      className={`${styles.feed} ${className ?? ''}`}
      ref={listRef}
      data-testid="run-step-feed"
    >
      {ordered.length === 0 ? (
        // The turn really is just thinking — nothing has been called yet.
        <li className={styles.item} data-current="true">
          {t('assistant.thinking')}
        </li>
      ) : (
        ordered.map((step) => (
          <li
            key={step.id}
            className={styles.item}
            data-current={step.id === newestId ? 'true' : undefined}
          >
            {stepLabel(step, t)}
          </li>
        ))
      )}
    </ul>
  );
}
