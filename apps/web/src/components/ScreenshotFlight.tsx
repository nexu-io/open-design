import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { RectLike } from '../runtime/edit-screenshot';
import styles from './ScreenshotFlight.module.css';

export interface ScreenshotFlightProps {
  dataUrl: string;
  /** Capture source rect (the edit workspace), viewport CSS px. */
  from: RectLike;
  /** Landing rect (the chat composer), viewport CSS px. */
  to: RectLike;
  /** Skip the shutter flash (a CaptureFlash already played at gesture time). */
  showFlash?: boolean;
  onDone: () => void;
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Instant capture acknowledgment: the shutter flash alone, mounted the moment
 * the gesture fires — the capture pipeline (guides restore, rasterize, upload)
 * takes long enough that waiting for its result reads as "nothing happened".
 * Web-path only: the DOM compositor never sees host overlays, but the desktop
 * compositor capture would record the flash into the screenshot itself.
 */
export function CaptureFlash({ rect, onDone }: { rect: RectLike; onDone: () => void }) {
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const reduced = useRef(prefersReducedMotion());

  useEffect(() => {
    if (reduced.current) {
      doneRef.current();
      return;
    }
    // Failsafe: reduced-motion media flips or animationend is swallowed —
    // the overlay must never linger.
    const failsafe = window.setTimeout(() => doneRef.current(), 400);
    return () => window.clearTimeout(failsafe);
  }, []);

  if (reduced.current) return null;

  return createPortal(
    <div className={styles.root} aria-hidden="true">
      <div
        className={styles.flash}
        style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
        onAnimationEnd={() => doneRef.current()}
      />
    </div>,
    document.body,
  );
}

/**
 * One-shot capture feedback: a shutter flash over the captured workspace and
 * a clone of the captured bitmap that flies (FLIP) into the chat composer,
 * where the staged attachment chip takes over. Portaled to <body> so the
 * workspace's transform/overflow containment cannot clip the flight path.
 */
export function ScreenshotFlight({ dataUrl, from, to, showFlash = true, onDone }: ScreenshotFlightProps) {
  const [landing, setLanding] = useState(false);
  const reduced = useRef(prefersReducedMotion());
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    if (reduced.current) {
      doneRef.current();
      return;
    }
    // Double rAF: the clone must paint at its source rect before the
    // transition target styles land, or the browser skips the animation.
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setLanding(true));
    });
    // Fallback in case transitionend never fires (display: none ancestors,
    // tab hidden): the overlay must never linger.
    const failsafe = window.setTimeout(() => doneRef.current(), 900);
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      window.clearTimeout(failsafe);
    };
  }, []);

  if (reduced.current) return null;

  const scale = to.width / Math.max(1, from.width);
  const flightStyle = landing
    ? {
        transform: `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${scale})`,
        opacity: 0.15,
      }
    : undefined;

  return createPortal(
    <div className={styles.root} aria-hidden="true">
      {showFlash ? (
        <div
          className={styles.flash}
          style={{ left: from.left, top: from.top, width: from.width, height: from.height }}
        />
      ) : null}
      <img
        src={dataUrl}
        alt=""
        className={`${styles.clone}${landing ? ` ${styles.landing}` : ''}`}
        style={{
          left: from.left,
          top: from.top,
          width: from.width,
          height: from.height,
          ...flightStyle,
        }}
        onTransitionEnd={(ev) => {
          if (ev.propertyName === 'transform') doneRef.current();
        }}
      />
    </div>,
    document.body,
  );
}
