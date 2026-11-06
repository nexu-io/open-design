/**
 * The forward playback loop for the timeline player.
 *
 * Owns the three requestAnimationFrame lifecycle callbacks that drive (and stop)
 * playback:
 *  - startRAFLoop     — the forward tick: advance liveTime, honour in/out loop
 *                       points + loopEnabled, and pause + sync the store at the end.
 *  - stopRAFLoop      — cancel the forward tick.
 *  - stopReverseLoop  — cancel the reverse-shuttle tick (owned by the parent hook).
 *
 * Called unconditionally at the top level of useTimelinePlayer so its useCallback
 * hooks run in a stable order; every dependency is passed in as an argument.
 */

import { useCallback } from "react";
import { liveTime, usePlayerStore } from "../store/playerStore";
import type { PlaybackAdapter } from "../lib/playbackTypes";

interface UseTimelinePlayerLoopParams {
  rafRef: React.MutableRefObject<number>;
  reverseRafRef: React.MutableRefObject<number>;
  getAdapter: () => PlaybackAdapter | null;
  setCurrentTime: (v: number) => void;
  setIsPlaying: (v: boolean) => void;
  setLoopStart: (seconds: number | null) => void;
}

interface UseTimelinePlayerLoopResult {
  startRAFLoop: () => void;
  stopRAFLoop: () => void;
  stopReverseLoop: () => void;
}

export function useTimelinePlayerLoop({
  rafRef,
  reverseRafRef,
  getAdapter,
  setCurrentTime,
  setIsPlaying,
  setLoopStart,
}: UseTimelinePlayerLoopParams): UseTimelinePlayerLoopResult {
  const stopReverseLoop = useCallback(() => {
    cancelAnimationFrame(reverseRafRef.current);
  }, [reverseRafRef]);

  const startRAFLoop = useCallback(() => {
    // fallow-ignore-next-line complexity
    const tick = () => {
      const adapter = getAdapter();
      if (adapter) {
        const rawTime = adapter.getTime();
        const dur = adapter.getDuration();
        const time = dur > 0 ? Math.min(rawTime, dur) : rawTime;
        liveTime.notify(time); // direct DOM updates, no React re-render
        const { inPoint, outPoint } = usePlayerStore.getState();
        const rawLoopEnd = outPoint !== null ? Math.min(outPoint, dur) : dur;
        const rawLoopStart = inPoint !== null ? inPoint : 0;
        const loopEnd = rawLoopStart < rawLoopEnd ? rawLoopEnd : dur;
        const loopStart = rawLoopStart < rawLoopEnd ? rawLoopStart : 0;
        const looping = usePlayerStore.getState().loopEnabled && dur > 0;
        setLoopStart(looping ? loopStart : null);
        if (time >= loopEnd) {
          if (looping && !usePlayerStore.getState().playLocked) {
            // keepPlaying skips the adapter's implicit pause; play() below is then a no-op.
            adapter.seek(loopStart, { keepPlaying: true });
            liveTime.notify(loopStart);
            adapter.play();
            setIsPlaying(true);
            rafRef.current = requestAnimationFrame(tick);
            return;
          }
          if (adapter.isPlaying()) adapter.pause();
          setCurrentTime(time); // sync Zustand once at end
          setIsPlaying(false);
          cancelAnimationFrame(rafRef.current);
          return;
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [rafRef, getAdapter, setCurrentTime, setIsPlaying, setLoopStart]);

  const stopRAFLoop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
  }, [rafRef]);

  return { startRAFLoop, stopRAFLoop, stopReverseLoop };
}
