import { describe, expect, it } from "vitest";
import type { TimelineElement } from "../store/playerStore";
import type { StackingTimelineLayer } from "./timelineTrackOrder";
import {
  resolveTimelineLayerStackingMove,
  resolveTimelineLayerZIndexChanges,
} from "./timelineLayerDrag";

function element(input: {
  id: string;
  zIndex: number;
  tag?: string;
  start?: number;
  duration?: number;
}): TimelineElement {
  return {
    id: input.id,
    tag: input.tag ?? "div",
    start: input.start ?? 0,
    duration: input.duration ?? 1,
    track: 0,
    zIndex: input.zIndex,
    hasExplicitZIndex: true,
    stackingContextId: "root",
    parentCompositionId: null,
    compositionAncestors: ["root"],
  };
}

function layer(
  id: string,
  zIndex: number,
  elements: TimelineElement[] = [element({ id, zIndex })],
): StackingTimelineLayer {
  return {
    id,
    kind: "visual",
    contextKey: "root",
    zIndex,
    placementTrack: 0,
    elements,
  };
}

describe("resolveTimelineLayerZIndexChanges", () => {
  it("joins an existing lane by assigning the dragged clip that lane's z-index", () => {
    const dragged = element({ id: "dragged", zIndex: 1, start: 2, duration: 1 });
    const front = element({ id: "front", zIndex: 10, start: 0, duration: 1 });

    expect(
      resolveTimelineLayerZIndexChanges({
        element: dragged,
        layers: [layer("front", 10, [front]), layer("back", 1)],
        placement: { type: "onto", layerId: "front" },
      })?.zIndexChanges,
    ).toEqual([{ key: "dragged", zIndex: 10 }]);
  });

  it("rejects an onto-lane join when the dragged clip would overlap that lane", () => {
    const dragged = element({ id: "dragged", zIndex: 1, start: 0.5, duration: 1 });
    const front = element({ id: "front", zIndex: 10, start: 0, duration: 1 });

    expect(
      resolveTimelineLayerZIndexChanges({
        element: dragged,
        layers: [layer("front", 10, [front]), layer("back", 1)],
        placement: { type: "onto", layerId: "front" },
      }),
    ).toBeNull();
  });

  it("interpolates a new integer z-index strictly between neighboring layers", () => {
    const dragged = element({ id: "dragged", zIndex: 1 });

    expect(
      resolveTimelineLayerZIndexChanges({
        element: dragged,
        layers: [layer("front", 10), layer("back", 4)],
        placement: { type: "between", beforeLayerId: "front", afterLayerId: "back" },
      })?.zIndexChanges,
    ).toEqual([{ key: "dragged", zIndex: 7 }]);
  });

  it("renumbers the minimum sibling set when adjacent layers leave no integer gap", () => {
    const dragged = element({ id: "dragged", zIndex: 0 });

    expect(
      resolveTimelineLayerZIndexChanges({
        element: dragged,
        layers: [layer("front", 2), layer("back", 1), layer("lower", 0)],
        placement: { type: "between", beforeLayerId: "front", afterLayerId: "back" },
      })?.zIndexChanges,
    ).toEqual([
      { key: "dragged", zIndex: 2 },
      { key: "front", zIndex: 3 },
    ]);
  });

  it("assigns new extreme z-index values above the top and below the bottom layer", () => {
    const dragged = element({ id: "dragged", zIndex: 0 });
    const layers = [layer("front", 10), layer("back", -2)];

    expect(
      resolveTimelineLayerZIndexChanges({
        element: dragged,
        layers,
        placement: { type: "above", layerId: "front" },
      })?.zIndexChanges,
    ).toEqual([{ key: "dragged", zIndex: 11 }]);

    expect(
      resolveTimelineLayerZIndexChanges({
        element: dragged,
        layers,
        placement: { type: "below", layerId: "back" },
      })?.zIndexChanges,
    ).toEqual([{ key: "dragged", zIndex: -3 }]);
  });

  it("does not resolve stacking z-index changes for audio clips", () => {
    expect(
      resolveTimelineLayerZIndexChanges({
        element: element({ id: "music", zIndex: 0, tag: "audio" }),
        layers: [layer("front", 10)],
        placement: { type: "onto", layerId: "front" },
      }),
    ).toBeNull();
  });
});

describe("resolveTimelineLayerStackingMove", () => {
  it("places an upward onto-lane drop above the overlapping target lane", () => {
    const front = element({ id: "front", zIndex: 10, start: 0, duration: 2 });
    const dragged = element({ id: "dragged", zIndex: 1, start: 0.5, duration: 1 });
    const layers = [layer("front", 10, [front]), layer("dragged", 1, [dragged])];

    expect(
      resolveTimelineLayerStackingMove({
        element: dragged,
        layers,
        layerOrder: layers.map((item) => item.id),
        trackDeltaRaw: -0.8,
      }),
    ).toEqual({
      previewLayerId: "preview:dragged:above:front",
      previewLayerIndex: 0,
      stackingReorder: {
        contextKey: "root",
        placement: { type: "above", layerId: "front" },
        zIndexChanges: [{ key: "dragged", zIndex: 11 }],
      },
    });
  });

  it("places a downward onto-lane drop below the overlapping target lane", () => {
    const dragged = element({ id: "dragged", zIndex: 10, start: 0.5, duration: 1 });
    const back = element({ id: "back", zIndex: 1, start: 0, duration: 2 });
    const layers = [layer("dragged", 10, [dragged]), layer("back", 1, [back])];

    expect(
      resolveTimelineLayerStackingMove({
        element: dragged,
        layers,
        layerOrder: layers.map((item) => item.id),
        trackDeltaRaw: 0.8,
      }),
    ).toEqual({
      previewLayerId: "preview:dragged:below:back",
      previewLayerIndex: 2,
      stackingReorder: {
        contextKey: "root",
        placement: { type: "below", layerId: "back" },
        zIndexChanges: [{ key: "dragged", zIndex: 0 }],
      },
    });
  });

  it("keeps a non-overlapping onto-lane drop joined to the target lane", () => {
    const front = element({ id: "front", zIndex: 10, start: 0, duration: 1 });
    const dragged = element({ id: "dragged", zIndex: 1, start: 2, duration: 1 });
    const layers = [layer("front", 10, [front]), layer("dragged", 1, [dragged])];

    expect(
      resolveTimelineLayerStackingMove({
        element: dragged,
        layers,
        layerOrder: layers.map((item) => item.id),
        trackDeltaRaw: -0.8,
      }),
    ).toEqual({
      previewLayerId: "front",
      previewLayerIndex: 0,
      stackingReorder: {
        contextKey: "root",
        placement: { type: "onto", layerId: "front" },
        zIndexChanges: [{ key: "dragged", zIndex: 10 }],
      },
    });
  });
});
