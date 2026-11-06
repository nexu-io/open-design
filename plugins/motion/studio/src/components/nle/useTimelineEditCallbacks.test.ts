import { describe, expect, it } from "vitest";
import { resolveTimelineKeyframeTarget } from "./useTimelineEditCallbacks";

const FLAT_ANIMATION = {
  id: "#title-fromTo-2900",
  propertyGroup: null,
};

describe("resolveTimelineKeyframeTarget", () => {
  it("resolves a synthesized diamond when one mixed flat tween is selected", () => {
    expect(
      resolveTimelineKeyframeTarget(
        8.75,
        [{ percentage: 8.75, tweenPercentage: 100 }],
        [FLAT_ANIMATION],
      ),
    ).toEqual({ animId: "#title-fromTo-2900", tweenPct: 100 });
  });

  it("keeps multiple ungrouped flat tweens unresolved instead of guessing", () => {
    expect(
      resolveTimelineKeyframeTarget(
        8.75,
        [{ percentage: 8.75, tweenPercentage: 100 }],
        [FLAT_ANIMATION, { id: "#title-to-2900", propertyGroup: null }],
      ),
    ).toBeNull();
  });

  it("keeps multiple flat tweens in the same property group unresolved", () => {
    expect(
      resolveTimelineKeyframeTarget(
        50,
        [{ percentage: 50, tweenPercentage: 100, propertyGroup: "position" }],
        [
          { id: "position-a", propertyGroup: "position" },
          { id: "position-b", propertyGroup: "position" },
        ],
      ),
    ).toBeNull();
  });

  it("uses the rendered animation identity to resolve a same-group collision", () => {
    expect(
      resolveTimelineKeyframeTarget(
        50,
        [
          {
            percentage: 50,
            tweenPercentage: 25,
            propertyGroup: "position",
            animationId: "position-b",
          },
        ],
        [
          { id: "position-a", propertyGroup: "position" },
          { id: "position-b", propertyGroup: "position" },
        ],
      ),
    ).toEqual({ animId: "position-b", tweenPct: 25 });
  });

  it("rejects a rendered animation identity absent from the element", () => {
    expect(
      resolveTimelineKeyframeTarget(
        50,
        [{ percentage: 50, animationId: "stale-position" }],
        [{ id: "position", propertyGroup: "position" }],
      ),
    ).toBeNull();
  });

  it("keeps a keyframed and flat tween in the same property group unresolved", () => {
    expect(
      resolveTimelineKeyframeTarget(
        50,
        [{ percentage: 50, tweenPercentage: 25, propertyGroup: "position" }],
        [
          { id: "position-keyframed", propertyGroup: "position", keyframes: {} },
          { id: "position-flat", propertyGroup: "position" },
        ],
      ),
    ).toBeNull();
  });

  it("keeps multiple ungrouped keyframed tweens unresolved", () => {
    expect(
      resolveTimelineKeyframeTarget(
        50,
        [{ percentage: 50, tweenPercentage: 25 }],
        [
          { id: "ungrouped-a", keyframes: {} },
          { id: "ungrouped-b", keyframes: {} },
        ],
      ),
    ).toBeNull();
  });

  it("does not infer an animation when the rendered diamond misses the cache", () => {
    expect(resolveTimelineKeyframeTarget(60, [], [FLAT_ANIMATION])).toBeNull();
  });

  it("resolves the sole candidate in an explicit property group", () => {
    expect(
      resolveTimelineKeyframeTarget(
        50,
        [{ percentage: 50, tweenPercentage: 25, propertyGroup: "position" }],
        [
          { id: "opacity", propertyGroup: "opacity" },
          { id: "position", propertyGroup: "position" },
        ],
      ),
    ).toEqual({ animId: "position", tweenPct: 25 });
  });
});
