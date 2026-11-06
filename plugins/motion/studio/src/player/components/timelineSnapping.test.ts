import { describe, expect, it } from "vitest";
import {
  TIMELINE_SNAP_PX,
  collectTimelineSnapTargets,
  snapMoveToTargets,
  snapTimelineTime,
  resolveSnapGuide,
} from "./timelineSnapping";

describe("collectTimelineSnapTargets", () => {
  const elements = [
    { start: 2, duration: 3, key: "a", id: "a" },
    { start: 10, duration: 1.5, key: "b", id: "b" },
  ];

  it("collects clip starts and ends, playhead, and beats with types", () => {
    const targets = collectTimelineSnapTargets({
      elements,
      playheadTime: 7.25,
      beatTimes: [0.5, 1.0],
    });
    expect(targets).toContainEqual({ time: 2, type: "clip-edge" });
    expect(targets).toContainEqual({ time: 5, type: "clip-edge" });
    expect(targets).toContainEqual({ time: 10, type: "clip-edge" });
    expect(targets).toContainEqual({ time: 11.5, type: "clip-edge" });
    expect(targets).toContainEqual({ time: 7.25, type: "playhead" });
    expect(targets).toContainEqual({ time: 0.5, type: "beat" });
  });

  it("excludes the dragged element's own edges", () => {
    const targets = collectTimelineSnapTargets({
      elements,
      playheadTime: null,
      beatTimes: [],
      excludeElementKey: "a",
    });
    expect(targets.some((t) => t.time === 2)).toBe(false);
    expect(targets.some((t) => t.time === 5)).toBe(false);
    expect(targets).toContainEqual({ time: 10, type: "clip-edge" });
  });

  it("omits playhead when null and dedupes identical times preferring playhead > clip-edge > beat", () => {
    const targets = collectTimelineSnapTargets({
      elements: [{ start: 1, duration: 1, key: "x", id: "x" }],
      playheadTime: 2,
      beatTimes: [2],
    });
    const atTwo = targets.filter((t) => t.time === 2);
    expect(atTwo).toEqual([{ time: 2, type: "playhead" }]);
  });

  it("dedupes a coincident clip-edge and beat preferring clip-edge (no playhead)", () => {
    // A beat and a clip edge land on the same time (2). clip-edge has higher
    // priority than beat, so the deduped target is clip-edge — not beat.
    const targets = collectTimelineSnapTargets({
      elements: [{ start: 2, duration: 3, key: "x", id: "x" }],
      playheadTime: null,
      beatTimes: [2],
    });
    const atTwo = targets.filter((t) => t.time === 2);
    expect(atTwo).toEqual([{ time: 2, type: "clip-edge" }]);
  });
});

describe("snapTimelineTime", () => {
  const targets = [
    { time: 5, type: "clip-edge" as const },
    { time: 5.3, type: "playhead" as const },
  ];

  it("snaps to the nearest target within threshold", () => {
    expect(snapTimelineTime(5.05, targets, 0.1)).toEqual({
      time: 5,
      target: { time: 5, type: "clip-edge" },
    });
  });

  it("returns input unchanged when nothing is within threshold", () => {
    expect(snapTimelineTime(6, targets, 0.1)).toEqual({ time: 6, target: null });
  });

  it("snaps to the nearest ruler line when no target is in range", () => {
    expect(snapTimelineTime(6.27, targets, 0.08, 0.25)).toEqual({
      time: 6.25,
      target: { time: 6.25, type: "grid" },
    });
    expect(snapTimelineTime(6.37, targets, 0.08, 0.25)).toEqual({ time: 6.37, target: null });
  });

  it("prefers a target in range over a nearer ruler line", () => {
    expect(snapTimelineTime(5.24, targets, 0.08, 0.25).target).toEqual({
      time: 5.3,
      type: "playhead",
    });
  });

  it("snaps a line at its saved centisecond, and not at all when that is a pixel or more off", () => {
    // 187.5 px/s: 4.625s saves as 4.63s, under a pixel away, so the guide sits where the clip lands.
    expect(snapTimelineTime(4.627, [], 8 / 187.5, 0.125).target).toEqual({
      time: 4.63,
      type: "grid",
    });
    // 1440 px/s: 1.025s would save 7px off its line, so the line does not snap.
    expect(snapTimelineTime(1.026, [], 8 / 1440, 0.025)).toEqual({ time: 1.026, target: null });
  });

  it("lands on whole frames for a frame-spaced grid", () => {
    expect(snapTimelineTime(1.01, [], 0.08, 1 / 30).time).toBe(1);
  });
});

describe("snapMoveToTargets", () => {
  // pps=100 → threshold = TIMELINE_SNAP_PX/100 = 0.08s
  const targets = [{ time: 5, type: "playhead" as const }];

  it("snaps the start edge when it is the closer edge", () => {
    const r = snapMoveToTargets(5.05, 2, targets, 100, 60);
    expect(r).toEqual({ start: 5, snapTime: 5, snapType: "playhead" });
  });

  it("snaps the end edge, shifting start so the end lands on the target", () => {
    const r = snapMoveToTargets(3.03, 2, targets, 100, 60);
    expect(r.start).toBeCloseTo(3, 5);
    expect(r.snapTime).toBe(5);
    expect(r.snapType).toBe("playhead");
  });

  it("drops the snap when clamping to timeline bounds pulls it off target", () => {
    // duration 2, timeline 6 → maxStart 4; target at 5.05 wants start 5.05 → clamped to 4
    const r = snapMoveToTargets(5.0, 2, [{ time: 5.05, type: "beat" }], 100, 6);
    expect(r.snapTime).toBeNull();
  });

  it("threshold scales with pixels-per-second", () => {
    // pps=10 → threshold 0.8s: 5.5 snaps; pps=1000 → threshold 0.008s: it does not
    expect(snapMoveToTargets(5.5, 2, targets, 10, 60).snapTime).toBe(5);
    expect(snapMoveToTargets(5.5, 2, targets, 1000, 60).snapTime).toBeNull();
  });

  it("snaps a clip edge to the ruler grid when no target is near", () => {
    expect(snapMoveToTargets(1.02, 2, [], 100, 60, 0.25)).toEqual({
      start: 1,
      snapTime: 1,
      snapType: "grid",
    });
  });

  it("prefers the edge on a real target over the other edge nearer a ruler line", () => {
    // start 2.99 is 1px from the 3s line; the end 4.94 is 6px from the playhead at 5
    const r = snapMoveToTargets(2.99, 1.95, targets, 100, 60, 0.25);
    expect(r).toEqual({ start: 3.05, snapTime: 5, snapType: "playhead" });
  });

  it("TIMELINE_SNAP_PX matches the historical beat-snap threshold", () => {
    expect(TIMELINE_SNAP_PX).toBe(8);
  });

  it("keeps the snap indicator for a frame-quantized duration (ms-rounding residue, no clamp)", () => {
    // duration 10/3 ≈ 3.3333…; end-snap onto a clip-edge at 5 gives a candidate
    // start of 5 - 10/3 = 1.6666…, whose ms-rounding residue (~3.3e-4) exceeds the
    // old 1e-6 tolerance. With a huge timeline (no bounds clamp), the snap must
    // survive — the clip snaps AND the indicator shows.
    const duration = 10 / 3;
    const edge = [{ time: 5, type: "clip-edge" as const }];
    const r = snapMoveToTargets(5 - duration + 0.001, duration, edge, 100, 1000);
    expect(r.snapTime).toBe(5);
    expect(r.snapType).toBe("clip-edge");
  });

  it("still drops the snap when the bounds clamp genuinely moves a frame-quantized clip off target", () => {
    // Same 10/3 duration, but the timeline is short enough that clamping to maxStart
    // pulls the clip off the target — the indicator must still vanish (the residue
    // widening must not mask a real clamp).
    const duration = 10 / 3;
    const r = snapMoveToTargets(5.0, duration, [{ time: 5.05, type: "beat" }], 100, 6);
    expect(r.snapTime).toBeNull();
  });
});

describe("resolveSnapGuide", () => {
  it("prefers a started move, falls back to a trim, and is null when neither snapped", () => {
    const move = { started: true, snapTime: 2, snapType: "playhead" as const };
    const trim = { snapTime: 5, snapType: "clip-edge" as const };
    expect(resolveSnapGuide(move, trim)).toEqual({ time: 2, type: "playhead" });
    expect(resolveSnapGuide({ ...move, started: false }, trim)).toEqual({
      time: 5,
      type: "clip-edge",
    });
    expect(resolveSnapGuide(null, { snapTime: null, snapType: null })).toBeNull();
    expect(resolveSnapGuide(null, null)).toBeNull();
  });
});
