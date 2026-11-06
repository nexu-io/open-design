/**
 * Opening the Audio FX section for a lane's reveal request.
 *
 * Split out of `PropertyPanelFlat.tsx` to keep it under the studio's 600-line
 * cap. All three of the request's hazards live here rather than being restated
 * at the call site: it must be current, it is consumed by NONCE, and it is
 * retired when the panel goes away.
 */

import { useEffect, useState } from "react";
import { usePlayerStore } from "../../player";
import { isRevealedAudioFxRequestCurrent } from "../../player/store/keyframeSlice";

export interface AudioFxRevealSectionInput {
  /** The element the panel is showing, or null. */
  elementId: string | null | undefined;
  /** False when the panel does not render an Audio FX section at all. */
  hasAudioFxSection: boolean;
}

/**
 * The nonce this panel should act on, or null.
 *
 * Consumption is keyed on the NONCE, not the request object: clicking a lane
 * selects the clip first, which REMOUNTS this panel, so a `!==` against the
 * previous value would initialise to the already-set request and never fire.
 * The nonce also makes a second click on the same lane a new request.
 */
export function useAudioFxRevealSection(input: AudioFxRevealSectionInput): {
  /** Non-null exactly once per request: open the section on this commit. */
  revealNonce: number | null;
  consume: (nonce: number) => void;
} {
  const revealedAudioFxTarget = usePlayerStore((s) => s.revealedAudioFxTarget);
  const timelineProjectId = usePlayerStore((s) => s.timelineProjectId);
  const timelineSessionEpoch = usePlayerStore((s) => s.timelineSessionEpoch);
  const clearRevealedAudioFxTarget = usePlayerStore((s) => s.clearRevealedAudioFxTarget);
  const [consumed, setConsumed] = useState<number | null>(null);

  // Retire the request once this panel is gone. Consumption is nonce-guarded so
  // a stale request was already harmless — but it sat in the store until the
  // next click, and a request nobody will ever consume is state every reader
  // then has to reason about.
  useEffect(() => {
    if (consumed === null) return;
    return () => clearRevealedAudioFxTarget(consumed);
  }, [consumed, clearRevealedAudioFxTarget]);

  const forThisPanel =
    revealedAudioFxTarget !== null &&
    revealedAudioFxTarget.elementKey === input.elementId &&
    isRevealedAudioFxRequestCurrent(revealedAudioFxTarget, {
      timelineProjectId,
      timelineSessionEpoch,
    }) &&
    input.hasAudioFxSection
      ? revealedAudioFxTarget.nonce
      : null;

  return {
    revealNonce: forThisPanel !== null && forThisPanel !== consumed ? forThisPanel : null,
    consume: setConsumed,
  };
}
