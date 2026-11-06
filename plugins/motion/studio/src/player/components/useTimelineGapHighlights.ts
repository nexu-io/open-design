import { useMemo } from "react";
import type { TimelineElement } from "../store/playerStore";
import { laneGapFloor, resolveLaneEmptyIntervals, type TrackGapInterval } from "./timelineGaps";
import type { TrackGapHighlight } from "./useTrackGapMenu";

/**
 * One lane's gap strips for the TimelineCanvas overlay.
 *
 * kind "hover"    — the gap(s) a hovered "Close gap" / "Close all gaps" menu
 *                   row would collapse: the loud affordance.
 * kind "selected" — every empty interval on a click-selected clip's lane: the
 *                   quiet always-on hint (single click-selection only — a
 *                   marquee multi-select spans lanes and would paint noise).
 */
export interface TimelineLaneGapStrips {
  track: number;
  intervals: TrackGapInterval[];
  kind: "hover" | "selected";
}

/**
 * Derive the gap strips TimelineCanvas paints. The menu-hover highlight wins
 * on its lane (painting both would just double the same strips); the
 * selected-clip hint renders on the selection's lane otherwise. Suppressed
 * entirely during a live drag — the drop placeholder / insert line own that
 * moment, and the lane set is in flux.
 */
interface GapHighlightInput {
  gapHighlight: TrackGapHighlight | null;
  tracks: [number, TimelineElement[]][];
  selectedElementId: string | null;
  selectedElementIds: ReadonlySet<string>;
  expandedElements: TimelineElement[];
  dragActive: boolean;
  /** Rendered timeline extent (seconds) — the selected-lane highlight spans the
   *  WHOLE lane minus its clips, trailing open space included. */
  displayDuration: number;
}

/**
 * Single selection only: the store mirrors a plain click into a one-member
 * selectedElementIds set (setSelectedElementId collapses the multi-select),
 * so "single" means empty OR exactly the selected clip itself. A marquee
 * multi-select spans lanes and stays hint-free.
 */
function isSingleSelection(selectedElementId: string, ids: ReadonlySet<string>): boolean {
  return ids.size === 0 || (ids.size === 1 && ids.has(selectedElementId));
}

/** The subtle strips for a single click-selected clip's lane, or null. */
function selectedLaneStrips(input: GapHighlightInput): TimelineLaneGapStrips | null {
  const { selectedElementId, selectedElementIds, expandedElements, tracks, gapHighlight } = input;
  if (!selectedElementId || !isSingleSelection(selectedElementId, selectedElementIds)) return null;
  const selected = expandedElements.find((el) => (el.key ?? el.id) === selectedElementId);
  if (!selected || selected.track === gapHighlight?.track) return null;
  const laneElements = tracks.find(([t]) => t === selected.track)?.[1] ?? [];
  const intervals = resolveLaneEmptyIntervals(
    laneElements,
    input.displayDuration,
    undefined,
    laneGapFloor(laneElements),
  );
  return intervals.length > 0 ? { track: selected.track, intervals, kind: "selected" } : null;
}

/** Pure strip derivation — exported for direct unit testing. */
export function buildTimelineGapStrips(input: GapHighlightInput): TimelineLaneGapStrips[] {
  if (input.dragActive) return [];
  const strips: TimelineLaneGapStrips[] = [];
  if (input.gapHighlight && input.gapHighlight.intervals.length > 0) {
    strips.push({ ...input.gapHighlight, kind: "hover" });
  }
  // Single click-selection → subtle gap hint on that clip's lane.
  const selected = selectedLaneStrips(input);
  if (selected) strips.push(selected);
  return strips;
}

export function useTimelineGapHighlights(input: GapHighlightInput): TimelineLaneGapStrips[] {
  const {
    gapHighlight,
    tracks,
    selectedElementId,
    selectedElementIds,
    expandedElements,
    dragActive,
    displayDuration,
  } = input;
  return useMemo(
    () =>
      buildTimelineGapStrips({
        gapHighlight,
        tracks,
        selectedElementId,
        selectedElementIds,
        expandedElements,
        dragActive,
        displayDuration,
      }),
    [
      gapHighlight,
      tracks,
      selectedElementId,
      selectedElementIds,
      expandedElements,
      dragActive,
      displayDuration,
    ],
  );
}
