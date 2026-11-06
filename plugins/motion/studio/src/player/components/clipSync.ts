import {
  moveIntoSyncStart,
  slipIntoSyncMediaStart,
  syncOffsetFrames,
  type SyncTiming,
} from "@hyperframes/core/media-link";
import { sameCompositionScope, type TimelineElement } from "../store/timelineElement";

type SyncElement = Pick<
  TimelineElement,
  "id" | "key" | "tag" | "start" | "duration" | "playbackStart" | "playbackRate" | "syncOrigin"
> &
  Pick<TimelineElement, "sourceFile" | "compositionScope">;

const keyOf = (el: Pick<TimelineElement, "id" | "key">) => el.key ?? el.id;
const kindOf = (el: Pick<TimelineElement, "tag">) => el.tag.trim().toLowerCase();

function syncTimingOf(el: SyncElement): SyncTiming {
  return { start: el.start, mediaStart: el.playbackStart ?? 0, playbackRate: el.playbackRate ?? 1 };
}

function overlap(a: SyncElement, b: SyncElement): number {
  return Math.min(a.start + a.duration, b.start + b.duration) - Math.max(a.start, b.start);
}

/**
 * The other half of `el`'s source pair: a video for an audio and the reverse,
 * sharing its sync origin. After splits several may qualify; the one sharing the
 * most timeline wins, then the nearest start.
 */
export function syncPartnerOf<T extends SyncElement>(el: T, elements: readonly T[]): T | null {
  const kind = kindOf(el);
  if (!el.syncOrigin || (kind !== "video" && kind !== "audio")) return null;
  const partnerKind = kind === "video" ? "audio" : "video";
  const candidates = elements.filter(
    (other) =>
      keyOf(other) !== keyOf(el) &&
      other.syncOrigin === el.syncOrigin &&
      sameCompositionScope(other, el) &&
      kindOf(other) === partnerKind,
  );
  const rank = (other: T) => [overlap(el, other), -Math.abs(other.start - el.start)] as const;
  let best: T | null = null;
  for (const candidate of candidates) {
    if (!best) best = candidate;
    else {
      const [o1, d1] = rank(candidate);
      const [o2, d2] = rank(best);
      if (o1 > o2 || (o1 === o2 && d1 > d2)) best = candidate;
    }
  }
  return best;
}

export interface ClipSyncState<T> {
  partner: T;
  frames: number;
  moveStart: number | null;
  slipMediaStart: number | null;
}

/** `el`'s drift from its source partner, or null when in sync, unpaired or at a different rate. */
export function clipSyncState<T extends SyncElement>(
  el: T,
  elements: readonly T[],
  fps: number,
): ClipSyncState<T> | null {
  const partner = syncPartnerOf(el, elements);
  if (!partner) return null;
  const self = syncTimingOf(el);
  const other = syncTimingOf(partner);
  const frames = syncOffsetFrames(self, other, fps);
  if (frames === null || frames === 0) return null;
  return {
    partner,
    frames,
    moveStart: moveIntoSyncStart(self, other),
    slipMediaStart: slipIntoSyncMediaStart(self, other),
  };
}
