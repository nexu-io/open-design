import { describe, expect, it, vi } from "vitest";
import {
  type GsapAnimationEditCallbacks,
  withTrackedGsapAnimationCallbacks,
} from "./gsapAnimationCallbacks";

function requiredCallbacks(): GsapAnimationEditCallbacks {
  return {
    onUpdateProperty: vi.fn(),
    onUpdateMeta: vi.fn(),
    onDeleteAnimation: vi.fn(),
    onAddProperty: vi.fn(),
    onRemoveProperty: vi.fn(),
  };
}

function requireCallback<T>(callback: T | undefined): T {
  if (callback === undefined) throw new Error("expected callback to be present");
  return callback;
}

describe("withTrackedGsapAnimationCallbacks", () => {
  it("keeps absent optional callbacks absent and passes preview callbacks through unchanged", () => {
    const callbacks = requiredCallbacks();
    const onLivePreview = vi.fn();
    const onLivePreviewEnd = vi.fn();
    callbacks.onLivePreview = onLivePreview;
    callbacks.onLivePreviewEnd = onLivePreviewEnd;
    const tracked = withTrackedGsapAnimationCallbacks(callbacks, vi.fn());

    expect(tracked.onUpdateFromProperty).toBeUndefined();
    expect(tracked.onAddFromProperty).toBeUndefined();
    expect(tracked.onRemoveFromProperty).toBeUndefined();
    expect(tracked.onSetArcPath).toBeUndefined();
    expect(tracked.onUpdateArcSegment).toBeUndefined();
    expect(tracked.onUpdateKeyframeEase).toBeUndefined();
    expect(tracked.onSetAllKeyframeEases).toBeUndefined();
    expect(tracked.onUnroll).toBeUndefined();
    expect(tracked.onUpdateSegmentEase).toBeUndefined();
    expect(tracked.onLivePreview).toBe(onLivePreview);
    expect(tracked.onLivePreviewEnd).toBe(onLivePreviewEnd);
  });

  it("tracks each edit once before invoking its mutation callback", () => {
    const events: string[] = [];
    const mutation = (name: string) => () => events.push(`mutate:${name}`);
    const callbacks: GsapAnimationEditCallbacks = {
      onUpdateProperty: mutation("update-property"),
      onUpdateMeta: mutation("update-meta"),
      onDeleteAnimation: mutation("delete"),
      onAddProperty: mutation("add-property"),
      onRemoveProperty: mutation("remove-property"),
      onUpdateFromProperty: mutation("update-from"),
      onAddFromProperty: mutation("add-from"),
      onRemoveFromProperty: mutation("remove-from"),
      onSetArcPath: mutation("arc-path"),
      onUpdateArcSegment: mutation("arc-segment"),
      onUpdateKeyframeEase: mutation("keyframe-ease"),
      onSetAllKeyframeEases: mutation("all-eases"),
      onUpdateSegmentEase: mutation("segment-ease"),
      onUnroll: mutation("unroll"),
    };
    const tracked = withTrackedGsapAnimationCallbacks(callbacks, (control, name) => {
      events.push(`track:${control}:${name}`);
    });

    tracked.onUpdateProperty("a1", "visibility", 1);
    tracked.onUpdateProperty("a1", "filter", "blur(2px)");
    tracked.onUpdateProperty("a1", "opacity", 0.5);
    tracked.onUpdateMeta("a1", { duration: 2, ease: "none", position: 1 });
    tracked.onDeleteAnimation("a1");
    tracked.onAddProperty("a1", "scale");
    tracked.onRemoveProperty("a1", "scale");
    requireCallback(tracked.onUpdateFromProperty)("a1", "clipPath", "none");
    requireCallback(tracked.onAddFromProperty)("a1", "x");
    requireCallback(tracked.onRemoveFromProperty)("a1", "x");
    requireCallback(tracked.onSetArcPath)("a1", { enabled: true });
    requireCallback(tracked.onSetArcPath)("a1", { enabled: true, autoRotate: true });
    requireCallback(tracked.onUpdateArcSegment)("a1", 1, {});
    requireCallback(tracked.onUpdateArcSegment)("a1", 1, { curviness: 0.5 });
    requireCallback(tracked.onUpdateKeyframeEase)("a1", 50, "power2.out");
    requireCallback(tracked.onSetAllKeyframeEases)("a1", "none");
    requireCallback(tracked.onUpdateSegmentEase)(
      [{ animationId: "a1", tweenPercentage: 50 }],
      "none",
    );
    requireCallback(tracked.onUnroll)("a1");

    expect(events).toEqual([
      "track:toggle:visibility",
      "mutate:update-property",
      "track:text:filter",
      "mutate:update-property",
      "track:metric:opacity",
      "mutate:update-property",
      "track:metric:Length",
      "track:select:Speed",
      "track:metric:Starts at",
      "mutate:update-meta",
      "track:button:Remove animation",
      "mutate:delete",
      "track:select:Add effect property",
      "mutate:add-property",
      "track:button:Remove scale",
      "mutate:remove-property",
      "track:text:clipPath",
      "mutate:update-from",
      "track:select:Add from property",
      "mutate:add-from",
      "track:button:Remove from x",
      "mutate:remove-from",
      "track:toggle:Arc motion",
      "mutate:arc-path",
      "track:toggle:Auto rotate",
      "mutate:arc-path",
      "track:button:Reset arc segment 2",
      "mutate:arc-segment",
      "mutate:arc-segment",
      "track:select:Keyframe ease",
      "mutate:keyframe-ease",
      "track:select:All keyframe eases",
      "mutate:all-eases",
      "track:select:Segment ease",
      "mutate:segment-ease",
      "track:button:Unroll animation",
      "mutate:unroll",
    ]);
  });
});
