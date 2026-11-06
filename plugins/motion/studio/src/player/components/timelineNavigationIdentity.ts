import type { PropertyGroupName } from "@hyperframes/core/gsap-parser";
import {
  timelineKeyframeSelectionKey,
  type TimelineKeyframeTarget,
} from "./timelineKeyframeIdentity";

function stableId(kind: string, ...parts: Array<string | number>): string {
  // Attribute-safe by construction; callers embedding it in CSS selectors must use CSS.escape.
  return JSON.stringify(["timeline", kind, ...parts]);
}

export function timelineTrackRowId(track: number): string {
  return stableId("track", track);
}

export function timelineGroupRowId(groupId: string): string {
  return stableId("group", groupId);
}

export function timelinePropertyRowId(elementId: string, group: PropertyGroupName): string {
  return stableId("property", elementId, group);
}

export function timelineLogicalRowCellId(
  lanesId: string,
  rowId: string,
  cell: "header" | "content",
): string {
  return `${lanesId}-${stableId("cell", rowId, cell)}`;
}

export function timelineClipFocusId(elementId: string): string {
  return stableId("clip", elementId);
}

export function timelineKeyframeFocusId(elementId: string, target: TimelineKeyframeTarget): string {
  return stableId("keyframe", timelineKeyframeSelectionKey(elementId, target));
}

export function timelineEaseFocusId(elementId: string, target: TimelineKeyframeTarget): string {
  return stableId("ease", timelineKeyframeSelectionKey(elementId, target));
}
