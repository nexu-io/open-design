/**
 * timelineStackingSync — lane ↔ stacking unification (pure).
 *
 * A row move restacks the moved clip only: moved up, it rises above every clip
 * it overlaps in time on the rows now below it; moved down, it sinks below every
 * such clip on the rows now above it. Neighbours never change, so a clip nobody
 * moved never goes behind anything (a full-frame scene on the top row stays put).
 *
 * Lane → screen mapping (see Timeline.tsx trackOrder / TimelineCanvas rows):
 * tracks are sorted ASCENDING and rendered top → bottom, so a LOWER `track`
 * value renders HIGHER on screen. Standard NLE convention = the top row wins,
 * therefore **lower track ⇒ higher z-index**. We express this with a single
 * comparator so callers never have to remember the polarity.
 *
 * This module is DOM-free and store-free. Callers project their world onto
 * `StackingElement` (supplying the live z-index they read from the DOM/inline
 * style) and apply the returned `StackingPatch[]` however they persist styles.
 */

import { spansOverlap } from "@hyperframes/core/clip-facts";

/** Minimal element view this module reasons over. */
export interface StackingElement {
  /** Stable identity (TimelineElement.key ?? id). */
  key: string;
  /** Absolute start time (seconds). */
  start: number;
  /** Duration (seconds). */
  duration: number;
  /**
   * Display lane (the normalized timeline `track`). Lower = higher on screen =
   * should stack on top. This is the post-edit lane for edited clips.
   */
  track: number;
  /**
   * Current z-index (parsed from inline style / computed; "auto" ⇒ 0), or a
   * NON-FINITE value (NaN) when the caller could NOT resolve the clip's live node
   * (e.g. an unmounted / nested sub-comp element, or one outside the active file).
   * A non-finite-z clip is EXCLUDED from the computation — it is neither a stacking
   * neighbour nor resolvable as an edit — so an unresolved node never fabricates a
   * z=0 neighbour. The reader signals a
   * miss with NaN rather than null so the value stays assignable to the existing
   * `(el) => number` reader contract the drag hook / commit deps declare.
   */
  zIndex: number;
  /** Audio clips have no visual stacking and are excluded from the computation. */
  isAudio: boolean;
  /** Source document. Leaf z-indexes are comparable only inside this file. */
  sourceFile?: string;
  /**
   * CSS stacking context the clip's node lives in (TimelineElement.stackingContextId).
   * Leaf z-indexes are only comparable WITHIN one context — across contexts the
   * ancestors' z decides paint order — so the sync partitions by this key and
   * never patches across contexts. Null/undefined ⇒ the root context.
   */
  stackingContextId?: string | null;
  /**
   * Discovery / DOM document position (optional). Two clips with EQUAL z paint by
   * DOM order — the one LATER in the DOM paints ON TOP. When supplied, "is A above
   * B" uses (zIndex, domIndex); without it equal z counts as "not above", so the
   * move writes a z. Callers pass the index of the element in the discovery order
   * array.
   */
  domIndex?: number;
}

/** A minimal z-index change for one clip. */
export interface StackingPatch {
  key: string;
  zIndex: number;
}

/**
 * Canonical paint-scope key: leaf z-indexes are comparable only within the same
 * source document and CSS stacking context. The ONLY place this normalization
 * lives; samePaintScope compares with it.
 */
const paintScopeKey = (el: { sourceFile?: string; stackingContextId?: string | null }): string =>
  JSON.stringify([el.sourceFile ?? null, el.stackingContextId ?? null]);

/** Canonical paint-scope equality for stacking sync and its inverse mirror. */
export function samePaintScope(
  a: { sourceFile?: string; stackingContextId?: string | null },
  b: { sourceFile?: string; stackingContextId?: string | null },
): boolean {
  return paintScopeKey(a) === paintScopeKey(b);
}

/**
 * Two clips overlap in time when their half-open [start, end) intervals intersect.
 *
 * NOTE the float slack: this DELIBERATELY diverges from `timeRangesOverlap`'s exact
 * strict-`<` (timelineCollision.ts). A boolean collision decision is idempotent, so
 * exact `<` is fine there; here the result drives a VISIBLE stacking re-lane, so the
 * epsilon guards against float fuzz (e.g. 19.8 + 6.4 vs 26.2) spuriously overlapping two
 * abutting clips and shuffling lanes. The two are intended to differ, not align.
 */
function overlapsInTime(
  a: Pick<StackingElement, "start" | "duration">,
  b: Pick<StackingElement, "start" | "duration">,
): boolean {
  return spansOverlap(a.start, a.start + a.duration, b.start, b.start + b.duration);
}

/**
 * Is `a` visually ABOVE `b` (should stack on top)? Lower track renders higher on
 * screen, so a lower track number means "above". Exposed for tests / callers.
 */
export function laneIsAbove(
  a: Pick<StackingElement, "track">,
  b: Pick<StackingElement, "track">,
): boolean {
  return a.track < b.track;
}

/** Which way the edited clips moved between rows. */
export type StackingDirection = "up" | "down";

/**
 * Does `a` currently paint ON TOP of `b`? Higher z wins; equal z breaks by DOM
 * order (later in DOM paints on top). Without both domIndex values equal z is
 * ambiguous and counts as "not above", so the move still writes a z.
 */
function paintsAbove(
  a: Pick<StackingElement, "zIndex" | "domIndex">,
  b: Pick<StackingElement, "zIndex" | "domIndex">,
): boolean {
  if (a.zIndex !== b.zIndex) return a.zIndex > b.zIndex;
  if (a.domIndex != null && b.domIndex != null) return a.domIndex > b.domIndex;
  return false;
}

/** Moved up: one above the highest clip it now sits above, or null when it already paints above them all. */
function raisedZ(clip: StackingElement, overlapping: StackingElement[]): number | null {
  const below = overlapping.filter((o) => laneIsAbove(clip, o));
  if (below.every((o) => paintsAbove(clip, o))) return null;
  return Math.max(...below.map((o) => o.zIndex)) + 1;
}

/** Moved down: one below the lowest clip it now sits under, but never under z 0 (a negative z can paint behind the
 * composition's own background) and never under a clip on a lower row it paints over now, so the move cannot hide it.
 * Null when it already paints under them all or cannot go lower. */
function loweredZ(clip: StackingElement, overlapping: StackingElement[]): number | null {
  const above = overlapping.filter((o) => laneIsAbove(o, clip));
  if (above.every((o) => paintsAbove(o, clip))) return null;
  const keepOver = overlapping.filter((o) => laneIsAbove(clip, o) && paintsAbove(clip, o));
  const floor = Math.max(
    0,
    ...keepOver.map((o) =>
      paintsAbove({ ...clip, zIndex: o.zIndex }, o) ? o.zIndex : o.zIndex + 1,
    ),
  );
  const z = Math.max(floor, Math.min(...above.map((o) => o.zIndex)) - 1);
  return z < clip.zIndex ? z : null;
}

/**
 * The z-index patches for a row move: each edited clip, and only it, is raised (`up`) or lowered (`down`) against the
 * clips it overlaps in time in its own paint scope. Clips whose live z is unresolved (non-finite) and audio clips take
 * no part. Several edited clips resolve against each other's new z: the bottom one first when moving up, the top one
 * first when moving down.
 */
export function computeStackingPatches(
  elements: StackingElement[],
  editedKeys: Iterable<string>,
  direction: StackingDirection,
): StackingPatch[] {
  const editedSet = new Set(editedKeys);
  const live = elements
    .filter((e) => Number.isFinite(e.zIndex) && !e.isAudio)
    .map((e) => ({ ...e }));
  const edited = live
    .filter((e) => editedSet.has(e.key))
    .sort((a, b) => (direction === "up" ? b.track - a.track : a.track - b.track));

  const patches: StackingPatch[] = [];
  for (const clip of edited) {
    const overlapping = live.filter(
      (o) => o.key !== clip.key && overlapsInTime(clip, o) && samePaintScope(clip, o),
    );
    const zIndex = direction === "up" ? raisedZ(clip, overlapping) : loweredZ(clip, overlapping);
    if (zIndex === null) continue;
    clip.zIndex = zIndex;
    patches.push({ key: clip.key, zIndex });
  }
  return patches;
}
