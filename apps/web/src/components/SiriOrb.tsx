/**
 * Siri Orb — a rotating neon sphere used as a "this is working" indicator.
 *
 * Adapted from SmoothUI's Siri Orb, © Edu Calvo (educlopez), MIT licence.
 * https://github.com/educlopez/smoothui
 *
 * All the drawing lives in SiriOrb.module.css; this file only computes the
 * size-derived quantities the stylesheet cannot (contrast is unitless, so it
 * cannot be derived from a length in CSS).
 */
import type { CSSProperties } from 'react';
import styles from './SiriOrb.module.css';

/** Speed presets. The palette is deliberately NOT part of the state. */
export type SiriOrbState = 'idle' | 'thinking' | 'streaming';

interface Props {
  /** Rendered edge length in px. */
  size?: number;
  state?: SiriOrbState;
  /**
   * Palette overrides. Only `c1` (and `c2`, the bloom) are meant to change —
   * see the constraints documented in the stylesheet before touching the rest.
   */
  colors?: { c1?: string; c2?: string };
  className?: string;
  /** Announced to assistive tech; omit to keep the orb decorative. */
  label?: string;
}

/** Mirrors the original component's responsive math. */
function metrics(size: number) {
  const small = size < 50;
  const tiny = size < 30;
  const blur = small ? Math.max(size * 0.008, 1) : Math.max(size * 0.015, 4);
  const contrastBase = small ? Math.max(size * 0.004, 1.2) : Math.max(size * 0.008, 1.5);
  return {
    blur: `${blur}px`,
    contrast: tiny ? 1.1 : small ? Math.max(contrastBase * 1.2, 1.3) : contrastBase,
    dot: `${small ? Math.max(size * 0.004, 0.05) : Math.max(size * 0.008, 0.1)}px`,
    shadow: `${small ? Math.max(size * 0.004, 0.5) : Math.max(size * 0.008, 2)}px`,
    rim: `${Math.max(size * 0.06, 1.5)}px`,
    mask: tiny ? '0%' : small ? '5%' : size < 100 ? '15%' : '25%',
    tiny,
  };
}

const STATE_CLASS: Record<SiriOrbState, string | undefined> = {
  idle: styles.isIdle,
  thinking: styles.isThinking,
  streaming: styles.isStreaming,
};

export function SiriOrb({
  size = 24,
  state = 'thinking',
  colors,
  className,
  label,
}: Props) {
  const m = metrics(size);
  const style = {
    '--size': `${size}px`,
    '--blur': m.blur,
    '--contrast': m.contrast,
    '--dot': m.dot,
    '--shadow': m.shadow,
    '--rim': m.rim,
    '--mask': m.mask,
    ...(colors?.c1 ? { '--c1': colors.c1 } : {}),
    ...(colors?.c2 ? { '--c2': colors.c2 } : {}),
  } as CSSProperties;

  return (
    <span
      className={[styles.orb, STATE_CLASS[state], m.tiny ? styles.isTiny : '', className]
        .filter(Boolean)
        .join(' ')}
      style={style}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      <span className={styles.glow} aria-hidden />
      <span className={styles.disc}>
        <span className={`${styles.layer} ${styles.sheen}`} aria-hidden />
        <span className={`${styles.layer} ${styles.rim}`} aria-hidden />
      </span>
    </span>
  );
}
