import { useEffect, useState } from 'react';
import { Excalidraw } from '@excalidraw/excalidraw';
import styles from './SketchEnginePrewarm.module.css';

/**
 * Warms up the Excalidraw engine during idle time so the first sketch a user
 * opens shows the canvas instantly instead of Excalidraw's built-in
 * "Loading scene…" message.
 *
 * The "Loading scene…" delay is owned by Excalidraw itself, not by our scene
 * data fetch (a freshly created sketch already mounts with `loaded: true` and a
 * synchronous empty scene). On its first mount in a session Excalidraw performs
 * a one-time initialization — loading and registering its fonts on the document
 * and spinning up the canvas/renderer. Those costs are cached process-wide
 * afterwards, so mounting a single hidden, inert instance ahead of demand pays
 * them off-screen and makes the real "新建草图 → 秒开" path instant.
 *
 * Lifecycle: wait for an idle slot, mount a hidden read-only Excalidraw with an
 * empty scene, let the document finish loading the fonts it registered, then
 * unmount. Fonts stay registered on `document.fonts` after unmount, so the warm
 * footprint is gone but the benefit persists for the rest of the session.
 */
export function SketchEnginePrewarm() {
  const [phase, setPhase] = useState<'idle' | 'warming' | 'done'>('idle');

  // Schedule the warm-up for an idle slot so it never competes with the initial
  // workspace render. requestIdleCallback isn't universal (Safari historically
  // lacked it); fall back to a short timeout.
  useEffect(() => {
    if (phase !== 'idle') return;
    let cancelled = false;
    const start = () => {
      if (!cancelled) setPhase('warming');
    };
    const win = window as typeof window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    if (typeof win.requestIdleCallback === 'function') {
      const handle = win.requestIdleCallback(start, { timeout: 2000 });
      return () => {
        cancelled = true;
        win.cancelIdleCallback?.(handle);
      };
    }
    const handle = window.setTimeout(start, 600);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [phase]);

  // Once mounted, retire the hidden instance after its fonts have loaded. Cap
  // the lifetime with a fallback timeout so a stalled font fetch can't leave the
  // warm instance mounted for the whole session.
  useEffect(() => {
    if (phase !== 'warming') return;
    let cancelled = false;
    const retire = () => {
      if (!cancelled) setPhase('done');
    };
    const fallback = window.setTimeout(retire, 8000);
    void document.fonts?.ready?.then(() => {
      // Give the renderer a frame to settle before tearing the instance down.
      window.requestAnimationFrame(retire);
    });
    return () => {
      cancelled = true;
      window.clearTimeout(fallback);
    };
  }, [phase]);

  if (phase !== 'warming') return null;

  return (
    <div className={styles.prewarm} aria-hidden="true" data-testid="sketch-engine-prewarm">
      <Excalidraw
        viewModeEnabled
        handleKeyboardGlobally={false}
        detectScroll={false}
        UIOptions={{ tools: { image: false } }}
      />
    </div>
  );
}
