import { describe, expect, it } from "vitest";
import { deriveTimelineClipJoins } from "./TimelineClipJoins";
import type { TimelineElement } from "../store/playerStore";

const clip = (id: string, start: number, duration: number): TimelineElement => ({
  id,
  tag: "video",
  start,
  duration,
  track: 0,
});

describe("deriveTimelineClipJoins", () => {
  it("finds joins in time order, whatever order the clips arrive in", () => {
    expect(
      deriveTimelineClipJoins([clip("c", 3, 1), clip("a", 0, 1.5), clip("b", 1.5, 1.5)]),
    ).toEqual([1.5, 3]);
  });

  it("treats float noise as a join and a one-frame gap or an overlap as none", () => {
    expect(deriveTimelineClipJoins([clip("a", 0, 0.1 + 0.2), clip("b", 0.3, 1)])).toEqual([
      0.1 + 0.2,
    ]);
    expect(deriveTimelineClipJoins([clip("a", 0, 1), clip("b", 1 + 1 / 60, 1)])).toEqual([]);
    expect(deriveTimelineClipJoins([clip("a", 0, 1), clip("b", 0.8, 1)])).toEqual([]);
  });
});
