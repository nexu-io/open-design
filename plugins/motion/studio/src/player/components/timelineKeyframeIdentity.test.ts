import { describe, expect, it } from "vitest";
import {
  timelineKeyframeSelectionKey,
  timelineKeyframeTargetFromSelectionKey,
} from "./timelineKeyframeIdentity";

describe("timeline keyframe selection identity", () => {
  it("round-trips an expanded lane with colon-bearing identities", () => {
    const key = timelineKeyframeSelectionKey("comp#a:child", {
      percentage: 75,
      tweenPercentage: 40,
      propertyGroup: "position",
      animationId: "child:position",
    });

    expect(timelineKeyframeTargetFromSelectionKey("comp#a:child", key)).toEqual({
      percentage: 75,
      tweenPercentage: 40,
      propertyGroup: "position",
      animationId: "child:position",
    });
  });

  it("does not confuse an expanded lane whose element id extends the active id", () => {
    const key = timelineKeyframeSelectionKey("comp#a:child", {
      percentage: 75,
      tweenPercentage: 40,
      propertyGroup: "position",
      animationId: "child-position",
    });

    expect(timelineKeyframeTargetFromSelectionKey("comp#a", key)).toBeNull();
  });

  // Timeline.tsx still writes the collapsed form for clip-lane shift-clicks, and
  // an element id can itself contain a colon — the split has to be the LAST one.
  it("splits the collapsed key at the last colon so a colon-bearing id survives", () => {
    expect(timelineKeyframeTargetFromSelectionKey("a:b", "a:b:40")).toEqual({ percentage: 40 });
    expect(timelineKeyframeTargetFromSelectionKey("a", "a:b:40")).toBeNull();
  });

  it("retains the collapsed key fallback and rejects malformed percentages", () => {
    expect(timelineKeyframeTargetFromSelectionKey("comp#a", "comp#a:30")).toEqual({
      percentage: 30,
    });
    expect(timelineKeyframeTargetFromSelectionKey("comp#a", "comp#a:NaN")).toBeNull();
    expect(timelineKeyframeTargetFromSelectionKey("comp#a", "comp#b:30")).toBeNull();
  });
});
