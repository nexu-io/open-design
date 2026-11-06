import type { TimelineLayerDropPlacement } from "./timelineStacking";
import type { TimelineLayerId } from "./timelineTrackOrder";

export type TimelineDropIndicator = { kind: "onto" } | { kind: "line"; edge: "top" | "bottom" };

interface ResolveTimelineDropIndicatorInput {
  placement: TimelineLayerDropPlacement | null;
  layerId: TimelineLayerId;
  layerOrder: readonly TimelineLayerId[];
}

export function resolveTimelineDropIndicator({
  placement,
  layerId,
  layerOrder,
}: ResolveTimelineDropIndicatorInput): TimelineDropIndicator | null {
  if (!placement || !layerOrder.includes(layerId)) return null;

  switch (placement.type) {
    case "onto":
      return placement.layerId === layerId ? { kind: "onto" } : null;
    case "between":
      if (placement.beforeLayerId === layerId) return { kind: "line", edge: "bottom" };
      if (!layerOrder.includes(placement.beforeLayerId) && placement.afterLayerId === layerId) {
        return { kind: "line", edge: "top" };
      }
      return null;
    case "above":
      return placement.layerId === layerId ? { kind: "line", edge: "top" } : null;
    case "below":
      return placement.layerId === layerId ? { kind: "line", edge: "bottom" } : null;
  }
}
