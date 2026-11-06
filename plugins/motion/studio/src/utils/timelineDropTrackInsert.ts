import type { TimelineElement } from "../player";
import { layoutAfterTrackInsert } from "../player/components/timelineDragLanding";
import { canMoveTimelineElement } from "../player/components/timelineAuthoredMoveTarget";
import { resolveNearestFreeStart } from "../player/components/timelineCollision";
import { authoredTrackForLane } from "../player/components/timelineAuthoredTrack";
import { isAudioTimelineElement } from "./timelineInspector";
import type { TimelineDropPlacement } from "../player/components/timelineCallbacks";
import { applyPatchByTarget, readAttributeByTarget } from "./sourcePatcher";
import { buildPatchTarget } from "../hooks/timelineEditingHelpers";
import { formatTimelineAttributeNumber } from "../player/components/timelineEditing";

export interface DropTrackInsertPlan {
  /** Lane the dropped clip is written on. */
  track: number;
  /** Existing clips whose lane changes to make room. */
  renumbers: Array<{ element: TimelineElement; track: number }>;
}

/** Plan a new lane at boundary `insertRow` with the renumber a clip drag into a gutter uses.
 *  Null when a locked clip would have to move. */
export function planDropTrackInsert(input: {
  elements: TimelineElement[];
  /** The row order the timeline shows (anchor rows included), which `insertRow` indexes. */
  trackOrder: readonly number[];
  insertRow: number;
  dropped: Pick<TimelineElement, "id" | "tag" | "start" | "duration">;
}): DropTrackInsertPlan | null {
  const { elements, trackOrder, insertRow, dropped } = input;
  const newElement: TimelineElement = {
    ...dropped,
    key: dropped.id,
    // Parked on an existing lane so it adds no lane of its own to the topology.
    track: elements[0]?.track ?? 0,
    // sameSourceFile compares this raw field: borrow the peers' value, not the resolved path.
    sourceFile: elements[0]?.sourceFile,
  };
  const layout = layoutAfterTrackInsert(newElement, dropped.start, insertRow, null, {
    elements: [...elements, newElement],
    trackOrder: [...trackOrder],
  });
  if (!layout) return null;
  const byKey = new Map(elements.map((e) => [e.key ?? e.id, e]));
  const renumbers: DropTrackInsertPlan["renumbers"] = [];
  for (const norm of layout.normalized) {
    const key = norm.key ?? norm.id;
    if (key === dropped.id) continue;
    const src = byKey.get(key);
    if (!src || norm.track === (src.authoredTrack ?? src.track)) continue;
    if (!canMoveTimelineElement(src)) return null;
    renumbers.push({ element: src, track: norm.track });
  }
  const track = layout.normalized.find((n) => (n.key ?? n.id) === dropped.id)?.track;
  return track == null ? null : { track, renumbers };
}

/** Rewrite `data-track-index` on each renumbered clip's opening tag, via the shared source patcher. */
export function applyTrackRenumbers(source: string, plan: DropTrackInsertPlan): string {
  let out = source;
  for (const { element, track } of plan.renumbers) {
    const target = buildPatchTarget(element);
    if (!target || readAttributeByTarget(out, target, "track-index") === undefined) {
      throw new Error(`Cannot renumber the track of "${element.id}" in the source`);
    }
    out = applyPatchByTarget(out, target, {
      type: "attribute",
      property: "track-index",
      value: formatTimelineAttributeNumber(track),
    });
  }
  return out;
}

type DroppedClip = Pick<TimelineElement, "id" | "tag" | "start" | "duration">;

/** The file track a drop on display row `lane` is written to, and its nearest free start there.
 *  The timeline's own clips decide the track; `placed` clips only block, like same-kind clips there. */
function resolveRowDrop(
  elements: TimelineElement[],
  placed: readonly TimelineElement[],
  lane: number,
  dropped: DroppedClip,
): { track: number; start: number } {
  const audio = isAudioTimelineElement(dropped);
  const row = elements.filter((e) => e.track === lane);
  const otherKindRow = row.length > 0 && !row.some((e) => isAudioTimelineElement(e) === audio);
  const asClip = { ...dropped, key: dropped.id, track: lane, sourceFile: elements[0]?.sourceFile };
  const track = otherKindRow ? lane : authoredTrackForLane(lane, elements, asClip);
  const onTrack = [...elements, ...placed]
    .filter((e) => isAudioTimelineElement(e) === audio && (e.authoredTrack ?? e.track) === track)
    .map((e) => ({ ...e, track }));
  return {
    track,
    start: resolveNearestFreeStart(onTrack, track, dropped.start, dropped.duration, null),
  };
}

/** Where a dropped clip is written: the aimed row's file track at its nearest free time, or a new track. */
export function resolveDropTrack(input: {
  source: string;
  elements: TimelineElement[];
  /** Clips this drop gesture already wrote, which `elements` does not hold yet. */
  placed?: readonly TimelineElement[];
  placement: TimelineDropPlacement;
  dropped: DroppedClip;
}): { source: string; track: number; start: number } {
  const { source, elements, placement, dropped } = input;
  if (placement.insertRow == null) {
    return { source, ...resolveRowDrop(elements, input.placed ?? [], placement.track, dropped) };
  }
  const { insertRow, trackOrder } = placement;
  const plan = planDropTrackInsert({ elements, trackOrder, insertRow, dropped });
  if (!plan) throw new Error("Cannot open a new track here: a locked clip would have to move.");
  return { source: applyTrackRenumbers(source, plan), track: plan.track, start: dropped.start };
}
