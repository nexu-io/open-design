/**
 * Start playback for an audition, and put the playhead back on the way out.
 *
 * An audition writes the hovered preset to the running graph, which is silent
 * while the transport is paused — so a paused author hovering a preset heard
 * nothing at all and the affordance only worked mid-playback. Extracted from
 * `useFxLevelling`, where the property panel's rack owned it privately, because
 * the timeline's FX popover must render the preset shelf "exactly as FxSection
 * renders it — same props" (runbook C1 §2) and was passing no transport at all.
 */

import { useRef } from "react";
// The store's own module, not the `player` barrel: the barrel pulls the whole
// timeline in, and the timeline's FX button imports this hook — a cycle.
import { usePlayerStore } from "../../player/store/playerStore";

/** A clip the audition is meant to be heard through. */
export interface AuditionSpan {
  start: number;
  duration: number;
}

/**
 * Where to start playing so the audition is actually audible, or null to stay.
 *
 * Playing "from the playhead" only works when the thing being auditioned is
 * sounding there. A group whose members start at 0:02, hovered with the
 * playhead at 0:00, plays the rest of the mix unchanged — the transport runs,
 * the chain is in the graph, and the author hears nothing of the preset. So:
 * inside a span, stay; otherwise jump to the next one, wrapping to the first
 * when the playhead is past them all.
 *
 * Shared rather than the popover's own, which is where it went wrong the first
 * time: the property panel's rack has the identical hole, and giving the two
 * surfaces different audition behaviour is exactly what runbook C1 §2 forbids
 * when it says the shelf renders "exactly as FxSection renders it".
 */
export function auditionStart(
  spans: readonly AuditionSpan[] | undefined,
  at: number,
): number | null {
  if (!spans || spans.length === 0) return null;
  if (spans.some((span) => at >= span.start && at < span.start + span.duration)) return null;
  const starts = spans.map((span) => span.start).sort((a, b) => a - b);
  return starts.find((start) => start > at) ?? starts[0] ?? null;
}

export function useAuditionTransport(): (on: boolean, spans?: readonly AuditionSpan[]) => void {
  /**
   * Where the playhead was when an audition started the transport, so leaving
   * can put it back. Null means this audition did not start playback — the
   * transport was already running and must be left alone.
   */
  const auditionReturn = useRef<number | null>(null);

  /**
   * Already playing, this does nothing in either direction. The author started
   * that, and stopping their transport because they passed over a preset would
   * be the UI taking a decision that was not offered to it.
   */
  return (on: boolean, spans?: readonly AuditionSpan[]): void => {
    const store = usePlayerStore.getState();
    if (on) {
      if (store.isPlaying || auditionReturn.current !== null) return;
      // Recorded BEFORE the seek, so leaving returns the author to where they
      // actually were rather than to the clip this jumped to.
      auditionReturn.current = store.currentTime;
      const from = auditionStart(spans, store.currentTime);
      if (from !== null) store.requestSeek(from);
      store.requestPlayback(true);
      return;
    }
    const returnTo = auditionReturn.current;
    if (returnTo === null) return;
    auditionReturn.current = null;
    store.requestPlayback(false, returnTo);
  };
}
