import { describe, it, expect } from "vitest";
import { buildMotionPathGeometry, nearestPointOnPath, nodeCentre } from "./motionPathGeometry";
import type { ReadTween } from "../../hooks/gsapRuntimeKeyframes";

const kf = (percentage: number, x: number, y: number) => ({ percentage, properties: { x, y } });

describe("buildMotionPathGeometry", () => {
  it("builds a linear path with keyframe-ref nodes from an x/y tween", () => {
    const read: ReadTween = { keyframes: [kf(0, 10, 20), kf(100, 200, 80)] };
    const geo = buildMotionPathGeometry(read);
    expect(geo).not.toBeNull();
    expect(geo!.kind).toBe("linear");
    expect(geo!.points).toBe("10,20 200,80");
    expect(geo!.nodes).toEqual([
      { x: 10, y: 20, ref: { type: "keyframe", pct: 0 } },
      { x: 200, y: 80, ref: { type: "keyframe", pct: 100 } },
    ]);
  });

  it("puts an axis the tween does not animate where GSAP renders it, a folded CSS translate", () => {
    const read: ReadTween = {
      keyframes: [
        { percentage: 66.667, properties: { x: 60 } },
        { percentage: 100, properties: { x: 120 } },
      ],
    };
    expect(buildMotionPathGeometry(read, { x: 40, y: 30 })!.points).toBe("60,30 120,30");
  });

  it("preserves order and percentages for intermediate keyframes", () => {
    const read: ReadTween = { keyframes: [kf(0, 0, 0), kf(50, 50, 90), kf(100, 100, 0)] };
    const geo = buildMotionPathGeometry(read);
    expect(geo!.nodes.map((n) => n.ref)).toEqual([
      { type: "keyframe", pct: 0 },
      { type: "keyframe", pct: 50 },
      { type: "keyframe", pct: 100 },
    ]);
  });

  it("builds an arc path with waypoint-index refs when arcPath is present", () => {
    const read: ReadTween = {
      keyframes: [kf(0, 0, 0), kf(50, 60, 40), kf(100, 120, 10)],
      arcPath: { enabled: true, autoRotate: false, segments: [{ curviness: 1 }, { curviness: 1 }] },
    };
    const geo = buildMotionPathGeometry(read);
    expect(geo!.kind).toBe("arc");
    expect(geo!.nodes.map((n) => n.ref)).toEqual([
      { type: "waypoint", index: 0 },
      { type: "waypoint", index: 1 },
      { type: "waypoint", index: 2 },
    ]);
  });

  it("returns null for a tween with no positional keyframes", () => {
    const read: ReadTween = {
      keyframes: [
        { percentage: 0, properties: { opacity: 0 } },
        { percentage: 100, properties: { opacity: 1 } },
      ],
    };
    expect(buildMotionPathGeometry(read)).toBeNull();
  });

  it("draws a single-axis (x-only) tween, defaulting the missing axis to 0", () => {
    // Regression: an `x`-only tween (e.g. `to({ x: -260 })`) carries no `y`, so the
    // builder used to skip every node → no path until the user added the 2nd axis.
    const read: ReadTween = {
      keyframes: [
        { percentage: 0, properties: { x: 0 } },
        { percentage: 100, properties: { x: -260 } },
      ],
    };
    const geo = buildMotionPathGeometry(read);
    expect(geo).not.toBeNull();
    expect(geo!.points).toBe("0,0 -260,0"); // y defaults to 0 → horizontal path
  });

  it("draws a y-only tween too (x defaults to 0)", () => {
    const read: ReadTween = {
      keyframes: [
        { percentage: 0, properties: { y: 0 } },
        { percentage: 100, properties: { y: 500 } },
      ],
    };
    expect(buildMotionPathGeometry(read)!.points).toBe("0,0 0,500");
  });

  it("excludes keyframes missing a coordinate without throwing", () => {
    const read: ReadTween = {
      keyframes: [kf(0, 10, 20), { percentage: 50, properties: { x: 100 } }, kf(100, 200, 80)],
    };
    const geo = buildMotionPathGeometry(read);
    expect(geo!.nodes).toHaveLength(2);
    expect(geo!.points).toBe("10,20 200,80");
  });

  it("returns null when fewer than two valid nodes remain", () => {
    const read: ReadTween = { keyframes: [kf(0, 10, 20)] };
    expect(buildMotionPathGeometry(read)).toBeNull();
  });

  it("returns null for null input", () => {
    expect(buildMotionPathGeometry(null)).toBeNull();
  });
});

describe("nearestPointOnPath", () => {
  const nodes = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
  ];

  it("projects onto the nearest segment and reports its index + fraction", () => {
    const p = nearestPointOnPath(50, 20, nodes);
    expect(p).toEqual({ x: 50, y: 0, segIndex: 0, t: 0.5, dist: 20 });
  });

  it("reports t at the segment endpoints (0 at start, clamps to 1 past the end)", () => {
    expect(nearestPointOnPath(0, 5, nodes)).toMatchObject({ segIndex: 0, t: 0 });
    expect(nearestPointOnPath(110, 0, nodes)).toMatchObject({ segIndex: 0, t: 1 });
  });

  it("picks the second segment when closer to it", () => {
    const p = nearestPointOnPath(120, 50, nodes);
    expect(p).toMatchObject({ x: 100, y: 50, segIndex: 1 });
  });

  it("clamps to an endpoint when the projection falls past the segment", () => {
    const p = nearestPointOnPath(-40, -10, nodes);
    expect(p).toMatchObject({ x: 0, y: 0, segIndex: 0 });
  });

  it("returns null for fewer than two nodes", () => {
    expect(nearestPointOnPath(0, 0, [{ x: 0, y: 0 }])).toBeNull();
  });
});

describe("nodeCentre", () => {
  // The edit bench's `keys` layer at 1 s: left 560, 260 wide now, GSAP x 50; it reaches x 60 and
  // width 280 at 2 s, x 120 and width 320 at 3 s, so its centre is then at 760 and 840.
  const home = { x: 690, y: 380, w: 260, h: 160, ax: 0.5, ay: 0.5 };
  const read: ReadTween = {
    keyframes: [
      { percentage: 66.667, properties: { x: 60, width: 280 } },
      { percentage: 100, properties: { x: 120, width: 320 } },
    ],
  };

  it("draws a keyframe that also sets the size where the layer's centre is at that keyframe", () => {
    const geo = buildMotionPathGeometry(read, { x: 50, y: 30 })!;
    expect(geo.nodes.map((n) => nodeCentre(n, home, 1))).toEqual([
      { x: 760, y: 410 },
      { x: 840, y: 410 },
    ]);
  });

  it("keeps a layer centred by xPercent/yPercent -50 on its centre as a keyframe resizes it", () => {
    const geo = buildMotionPathGeometry(read, { x: 50, y: 30 })!;
    const centred = { ...home, ax: 0, ay: 0 };
    expect(geo.nodes.map((n) => nodeCentre(n, centred, 1).x)).toEqual([750, 810]);
  });

  it("keeps a keyframe that sets no size at home plus its offset", () => {
    const geo = buildMotionPathGeometry({ keyframes: [kf(0, 10, 20), kf(100, 200, 80)] })!;
    expect(nodeCentre(geo.nodes[1]!, home, 1)).toEqual({ x: 890, y: 460 });
  });
});

describe("start", () => {
  it("keeps where GSAP started a tween whose first keyframe comes later, with the size it had", () => {
    const read: ReadTween = {
      keyframes: [kf(66.667, 60, 30), kf(100, 120, 30)],
      start: { x: 40, y: 30, width: 260 },
    };
    expect(buildMotionPathGeometry(read)?.start).toEqual({ x: 40, y: 30, w: 260 });
  });

  it("draws no start when GSAP has not read one", () => {
    expect(buildMotionPathGeometry({ keyframes: [kf(50, 60, 30), kf(100, 120, 30)] })?.start).toBe(
      undefined,
    );
  });
});

it("an array step's node carries its step, so a drop finds that keyframe whatever its time", () => {
  const read = {
    keyframes: [
      { percentage: 0, properties: { x: 60 }, step: 0 },
      { percentage: 100, properties: { x: 120 }, step: 1 },
    ],
  };
  expect(buildMotionPathGeometry(read)!.nodes.map((n) => n.ref)).toEqual([
    { type: "keyframe", pct: 0, step: 0 },
    { type: "keyframe", pct: 100, step: 1 },
  ]);
});
