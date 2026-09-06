import { useEffect, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

import styles from './RotatingTitleWord.module.css';

/**
 * The headline's rotating noun: 「我们来设计点 __？」 cycles 文档 → 幻灯片 →
 * 原型 → 幻灯片 → 文档.
 *
 * This is 21st.dev's `@satoriui/typewriter-loop`, ported rather than copied:
 * the original is a shadcn/Tailwind component (`@/components/ui`, `cn()` from
 * `@/lib/utils`, gradient utility classes off the default palette) and apps/web
 * has none of that — Tailwind's PostCSS plugin is wired but nothing imports it, so no
 * utility class is ever generated. Its motion contract is kept exactly: the
 * word reveals by animating `width: 0 → auto` with opacity (there is no
 * character-by-character typing in it, despite the name), a gradient plate sits
 * behind the word, the ink is a gradient, a bar cursor blinks beside it, and
 * the hue advances one step per word once the outgoing one has left.
 *
 * ONE deviation from the port (per product): the six-hue rotation is gone. The
 * word takes the headline's own ink like the words either side of it, and the
 * only colour left is #00FF08 — the plate fades out from it and the caret is
 * it. With the ink no longer a gradient and every hue collapsed to that one
 * value, the palette array and the hue-advance step it fed had nothing left to
 * vary, so both were removed rather than left rotating between six copies of
 * the same colour.
 */
const ACCENT = '#00FF08';
/* Its own knob even though it currently resolves to the accent: the plate has
   been asked to diverge before (it spent a turn as a neutral #DBDBDB), and
   keeping the name means changing it back is one line rather than a re-split. */
const PLATE = ACCENT;

/* 10s between words (per product). The reveal itself is 0.8s, so a word stands
   still for ~9s — still a sentence that occasionally changes rather than a
   ticker, just turning over twice as often. */
const INTERVAL_MS = 10000;

export function RotatingTitleWord({
  words,
  pinned,
}: {
  words: string[];
  /**
   * The type the composer is currently set to, localized (「文档」/「幻灯片」/…).
   * When present the headline stops rotating and names THAT type instead: the
   * sentence and the picked pill below it should never disagree about what is
   * being designed. Null while no type is picked, which is when the rotation is
   * the point.
   */
  pinned?: string | null;
}) {
  const [index, setIndex] = useState(0);
  // Reduced motion holds the first word: the reveal IS the component, and a
  // headline that re-animates on a timer is what the preference asks us to
  // drop.
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    // A pinned type is a statement, not a carousel — no timer while it stands.
    if (pinned || reduceMotion || words.length < 2) return;
    const timer = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % words.length);
    }, INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [pinned, reduceMotion, words.length]);

  // `key={word}` drives the reveal, so picking a type animates the swap in with
  // the same wipe a rotation uses rather than snapping the headline.
  const word = pinned || words[index] || words[0] || '';
  const hueStyle = {
    '--rotating-title-plate': PLATE,
    '--rotating-title-cursor': ACCENT,
  } as CSSProperties;

  return (
    /* Decorative: a screen reader that re-announced the headline every four
       seconds would be unusable, so the slot is hidden from the a11y tree and
       the headline names itself through `aria-label` (see HomeHero). */
    <span className={styles.slot} style={hueStyle} aria-hidden>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={word}
          className={styles.reveal}
          initial={reduceMotion ? false : { width: 0, opacity: 0 }}
          animate={{ width: 'auto', opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.8, ease: 'easeInOut' }}
        >
          <span className={styles.plate} />
          <span className={styles.ink}>{word}</span>
        </motion.span>
      </AnimatePresence>
      <span className={styles.caret} />
    </span>
  );
}
