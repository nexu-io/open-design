import { usePlayerStore, type KeyframeCacheEntry } from "../store/playerStore";
import type { GsapAnimation } from "@hyperframes/core/gsap-parser";

const HIDDEN = {
  gsapAnimations: new Map<string, GsapAnimation[]>(),
  keyframeCache: new Map<string, KeyframeCacheEntry>(),
};

/** The keyframe data the timeline draws, or none when the host hides keyframes. */
export function useTimelineKeyframeData(showKeyframes: boolean) {
  const gsapAnimations = usePlayerStore((s) => s.gsapAnimations);
  const keyframeCache = usePlayerStore((s) => s.keyframeCache);
  return showKeyframes ? { gsapAnimations, keyframeCache } : HIDDEN;
}
