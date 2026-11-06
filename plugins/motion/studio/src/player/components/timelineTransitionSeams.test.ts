import { describe, expect, it } from "vitest";
import {
  deriveTimelineTransitionSeams,
  deriveTimelineTransitionSeamsByTrack,
} from "./timelineTransitionSeams";
import type { TimelineElement } from "../store/playerStore";

const clip = (
  id: string,
  start: number,
  duration: number,
  track = 0,
  transitionLabel?: string,
): TimelineElement => ({
  id,
  tag: "video",
  start,
  duration,
  track,
  transitionLabel,
});

describe("deriveTimelineTransitionSeams", () => {
  it("finds a labelled transition and centers the seam in the shared time", () => {
    const label = "hf:transition:out:in:crossfade";
    const [seam] = deriveTimelineTransitionSeams([
      clip("in", 1.8, 2, 0, label),
      clip("out", 0, 2, 0, label),
    ]);
    expect(seam?.outgoing).toEqual(clip("out", 0, 2, 0, label));
    expect(seam?.incoming).toEqual(clip("in", 1.8, 2, 0, label));
    expect(seam?.centerTime).toBeCloseTo(1.9);
    expect(seam?.duration).toBeCloseTo(0.2);
  });

  it("does not badge an unlabelled overlap", () => {
    expect(deriveTimelineTransitionSeams([clip("out", 0, 2), clip("in", 1.8, 2)])).toEqual([]);
  });

  it("does not badge a cross-track overlap", () => {
    const label = "hf:transition:out:in:crossfade";
    expect(
      deriveTimelineTransitionSeams([clip("out", 0, 2, 0, label), clip("in", 1.8, 2, 1, label)]),
    ).toEqual([]);
  });

  it("rejects crisp gaps and touching edges", () => {
    expect(deriveTimelineTransitionSeams([clip("a", 0, 2), clip("b", 2.04, 1)])).toEqual([]);
    expect(deriveTimelineTransitionSeams([clip("a", 0, 2), clip("b", 2, 1)])).toEqual([]);
  });
});

describe("deriveTimelineTransitionSeamsByTrack", () => {
  it("finds each track's transitions even when another track's clip starts between them", () => {
    const label = "hf:transition:out:in:crossfade";
    const other = "hf:transition:a:b:wipe";
    const byTrack = deriveTimelineTransitionSeamsByTrack([
      clip("out", 0, 2, 0, label),
      clip("in", 1.8, 2, 0, label),
      clip("a", 5, 2, 2, other),
      clip("b", 6.5, 2, 2, other),
      clip("alone", 0, 3, 1),
    ]);
    expect(byTrack.get(0)?.map((seam) => seam.incoming.id)).toEqual(["in"]);
    expect(byTrack.get(2)?.map((seam) => seam.incoming.id)).toEqual(["b"]);
    expect(byTrack.has(1)).toBe(false);
  });
});
