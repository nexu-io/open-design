import type { TimelineElement } from "../store/playerStore";
import { classifyZone } from "./timelineZones";
import { isLaneFree, timeRangesOverlap } from "./timelineCollision";
import { authoredTrackForLane, sameSourceFile } from "./timelineAuthoredTrack";
import { samePaintScope } from "./timelineStackingSync";
import { timelineTrackOrder } from "./timelineTrackDisplay";

/**
 * Mirror a canvas z-order action (Bring to Front / Bring Forward / Send Backward /
 * Send to Back) into a timeline LANE move — the pure resolver, no UI wiring.
 *
 * ── The model ────────────────────────────────────────────────────────────────
 * Track order is the DEFAULT paint order; authored z is the ADVANCED override.
 * Render truth stays z — the renderer never reads track index — and the studio
 * maintains z ↔ track consistency at EDIT time: a deliberate vertical lane move
 * syncs z (timelineStackingSync), and a z-order menu action calls THIS resolver
 * to compute the accompanying lane move. When the user authors z that diverges
 * from track order, the mirror never fights the authored override — it only
 * keeps the default in step.
 *
 * ── Locked rules (agreed design — do not re-litigate here) ───────────────────
 * - The mirror computes a lane move to ACCOMPANY a z action on a timeline clip;
 *   it never replaces the z patch.
 * - ONE-ELEMENT STEP (bring-forward / send-backward): the z action stepped past
 *   exactly ONE element — the reference neighbor — so the lane move must too.
 *   Target = the free lane (whole-span, file-agnostic occupancy, same zone)
 *   closest to the reference, searched STRICTLY BETWEEN the reference's lane
 *   and the next temporally-overlapping same-file visual element's lane in the
 *   direction (exclusive bound). No free lane in that open interval (the common
 *   back-to-back case) → CREATE one at the boundary immediately beyond the
 *   reference neighbor (commitTrackInsert semantics) — never scan past the
 *   second element to a farther free lane, which would overshoot the paint
 *   order. With no second overlapping element
 *   beyond the reference, the bound is the zone edge: closest free lane beyond
 *   the neighbor, else insert immediately beyond it.
 * - bring-to-front / send-to-back move past the WHOLE overlap set: closest free
 *   lane beyond the extreme overlap in the direction, else insert adjacent to
 *   the extreme.
 * - Direction: bring-forward/front = toward LOWER display lanes (up = above);
 *   send-backward/back = toward HIGHER lanes, but only within the visual zone —
 *   the audio zone is untouched and never crossed (a bottom-of-zone insert lands
 *   AT the visual/audio boundary, i.e. still a visual lane).
 * - Reference scope: same source file AND same stacking context (see
 *   samePaintScope — a file can contain several stacking contexts, and leaf z
 *   is only comparable within one). Lane FREENESS stays file-agnostic (any
 *   clip in the zone occupies its lane for everyone).
 * - Non-clip decorations (no timeline presence) are out of scope — callers keep
 *   z-only behavior for them. Audio elements never mirror (z on audio is
 *   meaningless); the resolver returns null.
 *
 * ── OPEN product question ────────────────────────────────────────────────────
 * send-to-back / bring-to-front scope: below/above EVERYTHING visual, or only
 * the clips that temporally overlap the moved clip? The default implemented
 * here is TEMPORAL-OVERLAP scope (the extreme is computed over same-file clips
 * that overlap the moved clip in time), pending M/Bin sign-off. A clip with no
 * temporal overlaps in the direction is "already at the extreme" → null.
 *
 * Deterministic: a pure function of its inputs — no Date, no randomness, no DOM.
 */

export type ZMirrorAction = "bring-to-front" | "bring-forward" | "send-backward" | "send-to-back";

export interface ZMirrorInput {
  action: ZMirrorAction;
  /** The clip acted on — store/display space (post-normalizeToZones lanes),
   *  carrying `authoredTrack` when the display lane diverges from the file. */
  element: TimelineElement;
  /** The expanded display element set (same set the drag commit reasons on). */
  elements: TimelineElement[];
  /** Timeline key of the neighbor the z action stepped over (forward/backward),
   *  when known — see resolveCrossedNeighbor in canvasContextMenuZOrder. */
  crossedKey?: string | null;
}

export type ZMirrorLaneMove =
  | {
      /** Land on an existing display lane. */
      kind: "move";
      /** Display lane to move to (store space). */
      displayTrack: number;
      /** Authored-space value to write (authoredTrackForLane translation). */
      persistTrack: number;
    }
  | {
      /** Create a new lane: boundary row compatible with commitTrackInsert's
       *  insertRow (index into the ascending display trackOrder; 0 = above the
       *  top lane, length = below the bottom). */
      kind: "insert";
      insertRow: number;
    }
  | null;

const keyOf = (el: TimelineElement): string => el.key ?? el.id;

/**
 * Lane candidates for an EXPANDED sub-comp child: only its own siblings' lanes
 * (same file). An expanded child's display row is synthetic host-space — landing
 * it on an arbitrary host lane has no same-file occupant to translate the
 * authored track from, and a track INSERT would renumber host space from a
 * child origin. Ordinary top-level clips return null (no restriction).
 */
function expandedChildAllowedLanes(
  element: TimelineElement,
  elements: TimelineElement[],
): ReadonlySet<number> | null {
  if (element.expandedHostKey == null) return null;
  const selfKey = keyOf(element);
  return new Set(
    elements
      .filter((el) => keyOf(el) !== selfKey && sameSourceFile(el, element))
      .map((el) => el.track),
  );
}

/**
 * Resolve the timeline lane move that mirrors a z-order action on `element`.
 * Returns null when no timeline mirror applies: audio / zero-length clips, no
 * reference neighbor in the action's direction (the menu action was likely
 * disabled or a no-op), or the clip is already laned where the action puts it.
 */
export function resolveZMirrorLaneMove(input: ZMirrorInput): ZMirrorLaneMove {
  const { action, element, elements } = input;
  if (classifyZone(element) === "audio") return null;
  if (!(element.duration > 0)) return null;

  const selfKey = keyOf(element);
  const start = element.start;
  const end = element.start + element.duration;
  const up = action === "bring-forward" || action === "bring-to-front";

  // Same paint scope (source file + stacking context), visual, temporally overlapping.
  const overlapSet = elements.filter(
    (el) =>
      keyOf(el) !== selfKey &&
      classifyZone(el) === "visual" &&
      samePaintScope(el, element) &&
      timeRangesOverlap(start, end, el.start, el.start + el.duration),
  );

  const referenceLane = resolveReferenceLane(input, overlapSet, up);
  if (referenceLane == null) return null;

  const order = timelineTrackOrder(elements);
  const visualLanes = timelineTrackOrder(elements.filter((el) => classifyZone(el) === "visual"));
  const refIdx = visualLanes.indexOf(referenceLane);
  if (refIdx === -1) return null; // reference is not a visual lane — no mirror

  const boundLane = stepBoundLane(action, overlapSet, referenceLane, up);
  const allowedLanes = expandedChildAllowedLanes(element, elements);
  const lane = closestFreeLane({
    elements,
    visualLanes,
    refIdx,
    up,
    boundLane,
    start,
    end,
    selfKey,
    allowedLanes,
  });
  if (lane != null) {
    // The closest free lane is the clip's OWN lane (possible only when z and
    // track had diverged): the clip already sits where the action puts it.
    if (lane === element.track) return null;
    return {
      kind: "move",
      displayTrack: lane,
      persistTrack: authoredTrackForLane(lane, elements, element),
    };
  }

  // Expanded children never INSERT: a new lane is a host-lane-space renumber,
  // meaningless in the child's own file (buildTrackInsertEdits refuses too).
  if (allowedLanes) return null;
  // No free lane before the bound (or the zone edge) → create one adjacent to
  // the reference: the boundary between its lane and the next in direction.
  return { kind: "insert", insertRow: order.indexOf(referenceLane) + (up ? 0 : 1) };
}

export interface ZRepositionInput {
  /** The clip the Layers-panel drag moved — store/display space. */
  element: TimelineElement;
  /** The expanded display element set (same set the drag commit reasons on). */
  elements: TimelineElement[];
  /**
   * Timeline keys of the reordered sibling set in DESIRED render order,
   * bottom→top, the moved element's own key included at its new slot. Siblings
   * with no timeline presence carry null — they are skipped when resolving the
   * nearest clip neighbors.
   */
  desiredOrderKeys: ReadonlyArray<string | null>;
}

/**
 * Mirror an ARBITRARY z repositioning (a Layers-panel drag, which can jump
 * several siblings in one drop) into a timeline lane move — the "equal jump"
 * generalization of {@link resolveZMirrorLaneMove}'s one-step rule: the clip
 * lands between its NEW paint neighbors' lanes.
 *
 * The reference lanes are the nearest siblings in the desired render order
 * that are visual, same-file timeline clips: `above` = the first such sibling
 * that now paints above the moved clip, `below` = the first that paints below.
 * Target lane = the free lane (whole-span, same zone) strictly between the
 * above-neighbor's lane and the below-neighbor's lane, closest to the above
 * neighbor; when only one neighbor exists the zone edge bounds the search on
 * the open side. No free lane in the interval → INSERT a new lane immediately
 * beyond the above neighbor (below it), or immediately above the below
 * neighbor when dropped on top — commitTrackInsert semantics, exactly like the
 * menu mirror's insert fallback.
 *
 * Null when no mirror applies: audio / zero-length clips, no clip neighbor in
 * the set (a z-only decoration shuffle), or the clip already sits where the
 * drop puts it.
 */
// fallow-ignore-next-line complexity
export function resolveRepositionLaneMove(input: ZRepositionInput): ZMirrorLaneMove {
  const { element, elements, desiredOrderKeys } = input;
  if (classifyZone(element) === "audio") return null;
  if (!(element.duration > 0)) return null;

  const selfKey = keyOf(element);
  const selfIdx = desiredOrderKeys.indexOf(selfKey);
  if (selfIdx === -1) return null;

  const clipLaneForKey = (key: string | null): number | null => {
    if (key == null) return null;
    const el = elements.find((candidate) => keyOf(candidate) === key);
    return el &&
      classifyZone(el) === "visual" &&
      el.duration > 0 &&
      samePaintScope(el, element) &&
      keyOf(el) !== selfKey
      ? el.track
      : null;
  };

  // Nearest clip neighbor painting ABOVE (later in bottom→top order) / BELOW.
  let aboveLane: number | null = null;
  for (let i = selfIdx + 1; i < desiredOrderKeys.length && aboveLane == null; i++) {
    aboveLane = clipLaneForKey(desiredOrderKeys[i]);
  }
  let belowLane: number | null = null;
  for (let i = selfIdx - 1; i >= 0 && belowLane == null; i--) {
    belowLane = clipLaneForKey(desiredOrderKeys[i]);
  }
  if (aboveLane == null && belowLane == null) return null;

  const order = timelineTrackOrder(elements);
  const visualLanes = timelineTrackOrder(elements.filter((el) => classifyZone(el) === "visual"));
  const allowedLanes = expandedChildAllowedLanes(element, elements);
  const args = {
    elements,
    visualLanes,
    start: element.start,
    end: element.start + element.duration,
    selfKey,
    allowedLanes,
  };

  let lane: number | null;
  let insertRow: number;
  if (aboveLane != null) {
    // Paints above = LOWER display lane: search DOWNWARD from the above
    // neighbor (closest lane under it first), bounded by the below neighbor
    // (exclusive) when one exists, else by the zone edge.
    const refIdx = visualLanes.indexOf(aboveLane);
    if (refIdx === -1) return null;
    lane = closestFreeLane({ ...args, refIdx, up: false, boundLane: belowLane });
    insertRow = order.indexOf(aboveLane) + 1;
  } else {
    // Dropped above everything that remains: search UPWARD from the below
    // neighbor toward the zone top.
    const refIdx = visualLanes.indexOf(belowLane!);
    if (refIdx === -1) return null;
    lane = closestFreeLane({ ...args, refIdx, up: true, boundLane: null });
    insertRow = order.indexOf(belowLane!);
  }

  if (lane != null) {
    if (lane === element.track) return null;
    return {
      kind: "move",
      displayTrack: lane,
      persistTrack: authoredTrackForLane(lane, elements, element),
    };
  }
  // Expanded children never INSERT (host-lane-space renumber from a child
  // origin) — see expandedChildAllowedLanes.
  if (allowedLanes) return null;
  return { kind: "insert", insertRow };
}

/**
 * ONE-ELEMENT-STEP bound (bring-forward / send-backward only): the lane of the
 * NEXT temporally-overlapping same-file visual element strictly beyond the
 * reference in the direction — the free-lane search may not reach it
 * (exclusive). Front/back have no bound (they step past the whole overlap
 * set), and neither does a step with no second overlapping element beyond the
 * reference (the zone edge bounds instead).
 */
function stepBoundLane(
  action: ZMirrorAction,
  overlapSet: TimelineElement[],
  referenceLane: number,
  up: boolean,
): number | null {
  if (action !== "bring-forward" && action !== "send-backward") return null;
  const beyond = overlapSet
    .map((el) => el.track)
    .filter((lane) => (up ? lane < referenceLane : lane > referenceLane));
  if (beyond.length === 0) return null;
  return (up ? Math.max : Math.min)(...beyond);
}

/**
 * Closest free lane strictly beyond the reference, lane-by-lane in direction,
 * whole-span freeness, same zone (visual lanes only — never into audio),
 * stopping at the exclusive bound when one applies. Null → no free lane in
 * the open interval.
 */
function closestFreeLane(args: {
  elements: TimelineElement[];
  visualLanes: number[];
  refIdx: number;
  up: boolean;
  boundLane: number | null;
  start: number;
  end: number;
  selfKey: string;
  /** When set, only these lanes are candidates (expanded-child scoping). */
  allowedLanes?: ReadonlySet<number> | null;
}): number | null {
  const { elements, visualLanes, refIdx, up, boundLane, start, end, selfKey, allowedLanes } = args;
  const step = up ? -1 : 1;
  for (let i = refIdx + step; i >= 0 && i < visualLanes.length; i += step) {
    const lane = visualLanes[i];
    if (pastSearchBound(lane, boundLane, up)) break;
    if (allowedLanes && !allowedLanes.has(lane)) continue;
    if (isLaneFree(elements, lane, start, end, selfKey)) return lane;
  }
  return null;
}

/** The exclusive one-element-step bound: stop at (never on/past) `boundLane`. */
function pastSearchBound(lane: number, boundLane: number | null, up: boolean): boolean {
  if (boundLane == null) return false;
  return up ? lane <= boundLane : lane >= boundLane;
}

/**
 * The lane the search starts from (the "reference neighbor"):
 * - forward/backward: the crossed neighbor when provided and valid (a visual
 *   clip in the set); otherwise the closest temporally-overlapping same-file
 *   clip in the direction. None → null (the menu was probably disabled).
 * - front/back: the extreme of the temporal-overlap set — topmost (lowest lane)
 *   for front, bottommost (highest lane) for back — restricted to overlaps
 *   strictly beyond the clip's own lane. None → already at the extreme → null.
 */
function resolveReferenceLane(
  input: ZMirrorInput,
  overlapSet: TimelineElement[],
  up: boolean,
): number | null {
  const stepAction = input.action === "bring-forward" || input.action === "send-backward";
  if (stepAction) {
    const crossedLane = crossedNeighborLane(input);
    // Unknown / absent / non-visual crossed key → the temporal neighbor below.
    if (crossedLane != null) return crossedLane;
  }

  // Overlapping same-file lanes strictly beyond the moved clip's lane, in direction.
  const lanes = overlapSet
    .map((el) => el.track)
    .filter((lane) => (up ? lane < input.element.track : lane > input.element.track));
  if (lanes.length === 0) return null;

  // Step actions want the CLOSEST lane in direction (max when up, min when
  // down); front/back want the EXTREME of the set (min when up, max when down).
  return (stepAction === up ? Math.max : Math.min)(...lanes);
}

/** The crossed neighbor's display lane, when the key names a visual clip in the set. */
function crossedNeighborLane({ elements, crossedKey }: ZMirrorInput): number | null {
  if (crossedKey == null) return null;
  const crossed = elements.find((el) => keyOf(el) === crossedKey);
  return crossed && classifyZone(crossed) === "visual" ? crossed.track : null;
}
