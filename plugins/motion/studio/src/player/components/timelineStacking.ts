import { getTimelineElementIdentity } from "../lib/timelineElementHelpers";

export interface TimelineStackingElement {
  id: string;
  key?: string;
  tag?: string;
  start: number;
  duration: number;
  track: number;
  zIndex?: number;
  stackingContextId?: string | null;
  parentCompositionId?: string | null;
  compositionAncestors?: string[];
  // Locator for resolving the live element at commit time (sub-comp children
  // aren't in the top-level element list, so the reorder intent must be
  // self-contained rather than re-looked-up by identity).
  domId?: string;
  selector?: string;
  selectorIndex?: number;
  sourceFile?: string;
}

export interface TimelineStackingOrderItem {
  key: string;
  track: number;
  zIndex: number;
  stackingContextId: string | null;
  parentCompositionId: string | null;
  compositionAncestors: readonly string[];
}

export type TimelineLayerDropPlacement =
  | { type: "onto"; layerId: string }
  | { type: "between"; beforeLayerId: string; afterLayerId: string }
  | { type: "above"; layerId: string }
  | { type: "below"; layerId: string };

export interface TimelineStackingZIndexChange {
  key: string;
  zIndex: number;
  domId?: string;
  selector?: string;
  selectorIndex?: number;
  sourceFile?: string;
}

export interface TimelineStackingReorderIntent {
  contextKey: string;
  placement: TimelineLayerDropPlacement;
  zIndexChanges: TimelineStackingZIndexChange[];
}

export function toStackingOrderItem(element: TimelineStackingElement): TimelineStackingOrderItem {
  return {
    key: getTimelineElementIdentity(element),
    track: element.track,
    zIndex: element.zIndex ?? 0,
    stackingContextId: element.stackingContextId ?? null,
    parentCompositionId: element.parentCompositionId ?? null,
    compositionAncestors: element.compositionAncestors ?? [],
  };
}
