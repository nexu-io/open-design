import { spansOverlap } from "@hyperframes/core/clip-facts";
import type { TimelineElement } from "../store/playerStore";
import { isAudioTimelineElement } from "../../utils/timelineInspector";
import { isTransitionPair } from "./timelineTransitionSeams";

/**
 * Free-form vertical zones, top → bottom: visual, audio. Canvas layering is
 * CSS z-index (the renderer ignores track index), so a track's only structural
 * job is to keep visual clips grouped above audio clips.
 */
export type TrackZone = "visual" | "audio";

/** Which zone a clip belongs to: audio elements sink to the bottom, everything
 *  else (video / image / text / sub-comp) is a visual lane on top. */
export function classifyZone(el: TimelineElement): TrackZone {
  return isAudioTimelineElement(el) ? "audio" : "visual";
}

/** The "main track" is a convention, not a schema field: the first
 *  visual-zone display lane, matched only when it actually holds a visual clip. */
export function isMainTrackElement(el: TimelineElement): boolean {
  return el.track === 0 && classifyZone(el) === "visual";
}

const keyOf = (el: TimelineElement) => el.key ?? el.id;

/** Two clips overlap when their half-open [start, end) intervals intersect. */
function overlaps(a: TimelineElement, b: TimelineElement): boolean {
  return spansOverlap(a.start, a.start + a.duration, b.start, b.start + b.duration);
}

/** Deterministic order on the stable clip id (never the mutated lane/track). */
function byStableId(a: TimelineElement, b: TimelineElement): number {
  const ka = keyOf(a);
  const kb = keyOf(b);
  return ka < kb ? -1 : ka > kb ? 1 : 0;
}

/**
 * Pack ONE authored track's clips onto sub-lanes so no two time-overlapping clips
 * share a lane. Clips are ordered by their STABLE id (a function of the input, not
 * of the lane being computed — the historical oscillation bug tie-broke on the
 * mutated track) and placed first-fit, so sequential (non-overlapping) clips
 * collapse onto a single lane and only genuine time overlaps spill onto adjacent
 * sub-lanes. Writes each clip's absolute display lane into `laneOf`; returns the
 * number of lanes used (≥ 1 when non-empty).
 *
 * The editor enforces no per-track time overlap, so the spill only fires on legacy
 * files. It is DISPLAY-ONLY — a drag commit persists just the dragged clip, never
 * this re-lane — so it never rewrites the source.
 *
 * Spill sub-lanes ARE legal drop targets (Timeline's trackOrder lists every
 * display lane). Because every occupant of a sub-lane shares the base lane's
 * authored track by construction, dropping a clip onto one persists that shared
 * authored track — a legitimate same-track join. On the next normalize the
 * joined track re-packs (stable-id first-fit), so the clip may display on a
 * DIFFERENT sub-lane than it was dropped on; the packing is deterministic, and
 * the persisted source value is correct either way.
 */
function packTrackLanes(
  clips: TimelineElement[],
  base: number,
  laneOf: Map<string, number>,
): number {
  const ordered = [...clips].sort(byStableId);
  const lanes: TimelineElement[][] = [];
  for (const el of ordered) {
    let sub = lanes.findIndex((occ) =>
      occ.every((o) => !overlaps(o, el) || isTransitionPair(o, el)),
    );
    if (sub === -1) {
      sub = lanes.length;
      lanes.push([]);
    }
    lanes[sub].push(el);
    laneOf.set(keyOf(el), base + sub);
  }
  return Math.max(1, lanes.length);
}

/**
 * Pack a whole zone's clips onto contiguous display lanes, CapCut-stable: lanes
 * follow the authored `data-track-index` (ASCENDING; ties by stable id) — NEVER a
 * z-rank. Each distinct authored track owns its own lane (in ascending order);
 * sequential same-track clips share it; time-overlapping same-track clips spill to
 * adjacent sub-lanes (packTrackLanes). Returns the number of lanes used.
 *
 * This REPLACES the old global-z-rank interval pack. That pack ordered visual
 * lanes by z-index and interval-packed overlaps, so editing one clip's z (or the
 * whole-set re-pack a lane drag triggered) silently re-laned OTHER clips. The
 * product decision is the opposite: a clip's lane is its track, period — z is
 * canvas paint order only, and lane assignment must ignore it.
 */
function packZoneLanes(
  clips: TimelineElement[],
  base: number,
  laneOf: Map<string, number>,
): number {
  const byTrack = new Map<number, TimelineElement[]>();
  for (const el of clips) {
    const list = byTrack.get(el.track);
    if (list) list.push(el);
    else byTrack.set(el.track, [el]);
  }
  let used = 0;
  for (const track of [...byTrack.keys()].sort((a, b) => a - b)) {
    used += packTrackLanes(byTrack.get(track)!, base + used, laneOf);
  }
  return used;
}

/**
 * Assign display lanes for the timeline: visual lanes on top, audio lanes below.
 *
 * Both zones are packed the SAME way — by authored track-index, ascending (see
 * packZoneLanes) — so the timeline's vertical order follows each clip's track and
 * nothing else. z-index does not participate in lane assignment (it is canvas
 * paint order only; the lane ↔ z stacking sync in timelineStackingSync runs the
 * other direction, only on a deliberate vertical edit). Time-overlapping same-track
 * clips still split onto separate sub-lanes (legacy files only — the editor forbids
 * per-track overlap), and that split is display-only, never persisted.
 *
 * Pure — returns a new array; unchanged clips keep their identity. Display-only
 * (runs on discovery); it does not rewrite the source. Idempotent (running it on
 * its own output is a fixed point): the lanes it emits are contiguous integers in
 * ascending track order, and re-running groups by those same integers unchanged.
 */
export function normalizeToZones(elements: TimelineElement[]): TimelineElement[] {
  if (elements.length === 0) return elements;

  const laneOf = new Map<string, number>();
  const visual: TimelineElement[] = [];
  const audio: TimelineElement[] = [];
  for (const el of elements) {
    (classifyZone(el) === "audio" ? audio : visual).push(el);
  }

  let nextLane = 0;
  nextLane += packZoneLanes(visual, nextLane, laneOf);
  packZoneLanes(audio, nextLane, laneOf);

  let changed = false;
  const remapped = elements.map((el) => {
    const lane = laneOf.get(keyOf(el));
    if (lane == null || lane === el.track) return el;
    changed = true;
    // Record the source-file track the first time a clip is remapped so lane
    // edits can persist in AUTHORED space (see TimelineElement.authoredTrack).
    // Re-normalizing already-remapped elements must keep the original value.
    return { ...el, track: lane, authoredTrack: el.authoredTrack ?? el.track };
  });
  return changed ? remapped : elements;
}
