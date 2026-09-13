import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';

/**
 * How the label's box opens and closes.
 *
 * A tween, not a spring: the wrapper CLIPS text, and a spring overshoots — the
 * last glyph gets uncovered, covered again and uncovered as the width settles,
 * which reads as the character shaking. A monotonic width has nothing to
 * shake. Durations and easing are the house ones (enter 200ms, exit 140ms,
 * ease-out): the exit is quicker because the user has already chosen to leave.
 */
const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];
const OPEN = { duration: 0.2, ease: EASE_OUT };
const CLOSE = { duration: 0.14, ease: EASE_OUT };

/**
 * A tab's label, present only while its tab is active.
 *
 * The WIDTH is the only thing that animates — the tab is an inline-flex row,
 * so opening the label's box IS what moves the neighbouring tabs, and the text
 * simply slides out from behind the clip edge.
 *
 * Nothing fades. An opacity (or filter) animation puts the label on its own
 * compositing layer for the length of the tween, and Chrome renders text on a
 * composited layer with grayscale antialiasing instead of subpixel — so the
 * glyphs change weight and position when the layer is promoted and snap back
 * when it is dropped. That promote/demote pair at the two ends of the tween is
 * the shudder you see on the selected tab, and no amount of easing removes it.
 *
 * Everything inside is laid out at its final size and merely clipped (see
 * `.ws-tab-anim > *` in the workspace drawer styles) — a child that re-flowed
 * to the animating width would run its own ellipsis every frame, which is the
 * last character flickering.
 *
 * `AnimatePresence initial={false}` keeps the tab that is ALREADY active on
 * first paint from animating open: nothing switched, so nothing should move.
 */
export function TabLabel({ show, children }: { show: boolean; children: ReactNode }) {
  const reduced = useReducedMotion();
  return (
    <AnimatePresence initial={false}>
      {show ? (
        <motion.span
          className="ws-tab-anim"
          initial={{ width: 0 }}
          animate={{ width: 'auto' }}
          exit={{ width: 0, transition: reduced ? { duration: 0 } : CLOSE }}
          transition={reduced ? { duration: 0 } : OPEN}
        >
          {children}
        </motion.span>
      ) : null}
    </AnimatePresence>
  );
}
