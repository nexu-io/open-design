import { describe, expect, it } from "vitest";
import type { TimelineLayerDropPlacement } from "./timelineStacking";
import { resolveTimelineDropIndicator } from "./timelineDropIndicator";

const layerOrder = ["front", "middle", "back"];

describe("resolveTimelineDropIndicator", () => {
  it("highlights only the row targeted by an onto placement", () => {
    const placement: TimelineLayerDropPlacement = { type: "onto", layerId: "middle" };

    expect(resolveTimelineDropIndicator({ placement, layerId: "front", layerOrder })).toBeNull();
    expect(resolveTimelineDropIndicator({ placement, layerId: "middle", layerOrder })).toEqual({
      kind: "onto",
    });
  });

  it("renders a single insertion line at the bottom edge of the before row", () => {
    const placement: TimelineLayerDropPlacement = {
      type: "between",
      beforeLayerId: "front",
      afterLayerId: "middle",
    };

    expect(resolveTimelineDropIndicator({ placement, layerId: "front", layerOrder })).toEqual({
      kind: "line",
      edge: "bottom",
    });
    expect(resolveTimelineDropIndicator({ placement, layerId: "middle", layerOrder })).toBeNull();
  });

  it("renders above placements on the target row top edge", () => {
    const placement: TimelineLayerDropPlacement = { type: "above", layerId: "front" };

    expect(resolveTimelineDropIndicator({ placement, layerId: "front", layerOrder })).toEqual({
      kind: "line",
      edge: "top",
    });
  });

  it("renders below placements on the target row bottom edge", () => {
    const placement: TimelineLayerDropPlacement = { type: "below", layerId: "back" };

    expect(resolveTimelineDropIndicator({ placement, layerId: "back", layerOrder })).toEqual({
      kind: "line",
      edge: "bottom",
    });
  });
});
