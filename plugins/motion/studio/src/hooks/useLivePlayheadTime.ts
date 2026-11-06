/**
 * The playhead in composition seconds, live while the transport runs.
 *
 * The RAF loop deliberately does not push every frame through the store — it
 * notifies `liveTime` instead, so the playhead can move without re-rendering the
 * app. A panel that wants to follow it therefore has to subscribe itself, and
 * throttle: 30 Hz reads as continuous and costs an order of magnitude less than a
 * render per frame.
 *
 * Paused, the store is the truth — a seek or a scrub lands there — so this returns
 * that instead, which is what lets a readout follow the playhead while it is being
 * dragged as well as while it is playing.
 */
import { useEffect, useRef, useState } from "react";
// The store's own module, not the `player` barrel: the barrel pulls the whole
// timeline in, and a timeline component importing this hook closes a cycle.
import { liveTime, usePlayerStore } from "../player/store/playerStore";

/** Long enough to be much cheaper than a frame, short enough to read as motion. */
const THROTTLE_MS = 33;

export function useLivePlayheadTime(): number {
  const storeTime = usePlayerStore((s) => s.currentTime);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const liveRef = useRef(storeTime);
  const [, forceRender] = useState(0);

  // Paused, the ref tracks the store so the first frame of playback is never a
  // stale value from the last time the transport ran.
  if (!isPlaying) liveRef.current = storeTime;

  useEffect(() => {
    if (!isPlaying) return;
    let timerId: ReturnType<typeof setTimeout> | 0 = 0;
    const unsubscribe = liveTime.subscribe((t) => {
      liveRef.current = t;
      if (!timerId) {
        timerId = setTimeout(() => {
          timerId = 0;
          forceRender((v) => v + 1);
        }, THROTTLE_MS);
      }
    });
    return () => {
      unsubscribe();
      if (timerId) clearTimeout(timerId);
    };
  }, [isPlaying]);

  return isPlaying ? liveRef.current : storeTime;
}
