// fallow-ignore-file code-duplication
import { describe, test, expect } from "vitest";
import {
  extractSnapTargets,
  buildCompositionSnapTarget,
  buildGridSnapEdges,
  resolveSnapAdjustment,
  resolveEquidistanceGuides,
  resolveGuideLineRect,
  SNAP_THRESHOLD_PX,
  type SnapTarget,
} from "./snapEngine";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rect(left: number, top: number, width: number, height: number) {
  return { left, top, width, height };
}

function target(id: string, left: number, top: number, width: number, height: number): SnapTarget {
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    centerX: left + width / 2,
    centerY: top + height / 2,
    id,
  };
}

// ---------------------------------------------------------------------------
// extractSnapTargets
// ---------------------------------------------------------------------------

describe("extractSnapTargets", () => {
  test("computes right, bottom, centerX, centerY", () => {
    const [t] = extractSnapTargets([{ rect: rect(10, 20, 100, 50), id: "a" }]);
    expect(t.left).toBe(10);
    expect(t.top).toBe(20);
    expect(t.right).toBe(110);
    expect(t.bottom).toBe(70);
    expect(t.centerX).toBe(60);
    expect(t.centerY).toBe(45);
    expect(t.id).toBe("a");
  });

  test("handles multiple rects", () => {
    const targets = extractSnapTargets([
      { rect: rect(0, 0, 10, 10), id: "x" },
      { rect: rect(50, 50, 20, 30), id: "y" },
    ]);
    expect(targets).toHaveLength(2);
    expect(targets[1].right).toBe(70);
    expect(targets[1].bottom).toBe(80);
  });
});

// ---------------------------------------------------------------------------
// buildCompositionSnapTarget
// ---------------------------------------------------------------------------

describe("buildCompositionSnapTarget", () => {
  test("has id 'composition' and correct edges", () => {
    const t = buildCompositionSnapTarget(rect(0, 0, 1920, 1080));
    expect(t.id).toBe("composition");
    expect(t.left).toBe(0);
    expect(t.right).toBe(1920);
    expect(t.centerX).toBe(960);
    expect(t.centerY).toBe(540);
  });
});

// ---------------------------------------------------------------------------
// buildGridSnapEdges
// ---------------------------------------------------------------------------

describe("buildGridSnapEdges", () => {
  test("generates correct grid lines", () => {
    const { x, y } = buildGridSnapEdges(rect(0, 0, 300, 200), 100, 1);
    // At scale=1, step=100: x lines at 100, 200 (not 0 or 300)
    expect(x.map((e) => e.position)).toEqual([100, 200]);
    expect(y.map((e) => e.position)).toEqual([100]);
    expect(x[0].source).toBe("grid");
  });

  test("applies scale to grid spacing", () => {
    const { x } = buildGridSnapEdges(rect(0, 0, 600, 100), 100, 2);
    // step = 200, lines at 200, 400
    expect(x.map((e) => e.position)).toEqual([200, 400]);
  });

  test("handles offset composition rect", () => {
    const { x } = buildGridSnapEdges(rect(50, 0, 300, 100), 100, 1);
    // Lines at 150, 250 (offset + step, offset + 2*step)
    expect(x.map((e) => e.position)).toEqual([150, 250]);
  });

  test("returns empty for zero gridSpacing", () => {
    const { x, y } = buildGridSnapEdges(rect(0, 0, 300, 200), 0, 1);
    expect(x).toHaveLength(0);
    expect(y).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// resolveSnapAdjustment — edge alignment
// ---------------------------------------------------------------------------

describe("resolveSnapAdjustment", () => {
  const compositionTarget = target("composition", 0, 0, 1000, 800);

  test("left-to-right alignment: moving left snaps to target right", () => {
    // Target at x=200, width=100 => right edge at 300
    // Moving rect at x=0, width=50. Propose dx=297 => proposed left=297
    // Should snap left=300 (delta +3)
    const t = target("a", 200, 100, 100, 100);
    const result = resolveSnapAdjustment({
      movingRect: rect(0, 100, 50, 50),
      proposedDx: 297,
      proposedDy: 0,
      targets: [t],
      threshold: SNAP_THRESHOLD_PX,
      disabled: false,
    });
    expect(result.dx).toBe(300);
    expect(result.guides.length).toBeGreaterThanOrEqual(1);
    expect(result.guides[0].axis).toBe("x");
    expect(result.guides[0].position).toBe(300);
  });

  test("right-to-left alignment: moving right snaps to target left", () => {
    // Target at x=200. Moving rect width=50, at x=0.
    // Proposed dx=146 => proposed right = 196. Target left=200. diff=4 within threshold.
    const t = target("a", 200, 100, 100, 100);
    const result = resolveSnapAdjustment({
      movingRect: rect(0, 100, 50, 50),
      proposedDx: 146,
      proposedDy: 0,
      targets: [t],
      threshold: SNAP_THRESHOLD_PX,
      disabled: false,
    });
    // Proposed right = 196, target left = 200, adjustment = +4
    expect(result.dx).toBe(150);
  });

  test("center-to-center alignment on X axis", () => {
    // Target center at x=250. Moving rect width=100 at x=0 => center at 50.
    // Propose dx=198 => proposed center=248, target center=250, diff=2
    const t = target("a", 200, 100, 100, 100);
    const result = resolveSnapAdjustment({
      movingRect: rect(0, 100, 100, 50),
      proposedDx: 198,
      proposedDy: 0,
      targets: [t],
      threshold: SNAP_THRESHOLD_PX,
      disabled: false,
    });
    expect(result.dx).toBe(200);
  });

  test("top-to-bottom alignment", () => {
    // Target bottom at 200. Moving top proposed at 197. Should snap to 200.
    const t = target("a", 100, 100, 100, 100);
    const result = resolveSnapAdjustment({
      movingRect: rect(100, 0, 50, 50),
      proposedDx: 0,
      proposedDy: 197,
      targets: [t],
      threshold: SNAP_THRESHOLD_PX,
      disabled: false,
    });
    expect(result.dy).toBe(200);
  });

  test("center-to-center alignment on Y axis", () => {
    // Target centerY = 150. Moving height=100 at y=0 => center=50.
    // Propose dy=98 => proposed center=148, target center=150, diff=2
    const t = target("a", 100, 100, 100, 100);
    const result = resolveSnapAdjustment({
      movingRect: rect(100, 0, 100, 100),
      proposedDx: 0,
      proposedDy: 98,
      targets: [t],
      threshold: SNAP_THRESHOLD_PX,
      disabled: false,
    });
    expect(result.dy).toBe(100);
  });

  test("composition center snap", () => {
    // Composition center at 500, 400. Moving rect 100x100 at 0,0 => center 50,50.
    // Propose dx=447, dy=347 => proposed center 497,397. Should snap to 500,400.
    const result = resolveSnapAdjustment({
      movingRect: rect(0, 0, 100, 100),
      proposedDx: 447,
      proposedDy: 347,
      targets: [compositionTarget],
      threshold: SNAP_THRESHOLD_PX,
      disabled: false,
    });
    expect(result.dx).toBe(450);
    expect(result.dy).toBe(350);
  });

  test("no snap when outside threshold", () => {
    const t = target("a", 200, 200, 100, 100);
    const result = resolveSnapAdjustment({
      movingRect: rect(0, 0, 50, 50),
      proposedDx: 10,
      proposedDy: 10,
      targets: [t],
      threshold: SNAP_THRESHOLD_PX,
      disabled: false,
    });
    // Moving rect edges: left=10, center=35, right=60
    // Target edges: left=200, center=250, right=300
    // All distances > 6
    expect(result.dx).toBe(10);
    expect(result.dy).toBe(10);
    expect(result.guides).toHaveLength(0);
  });

  test("multiple matching guides at same distance", () => {
    // Two targets with left edges at 100 — both should produce guides
    const t1 = target("a", 100, 0, 50, 50);
    const t2 = target("b", 100, 200, 50, 50);
    const result = resolveSnapAdjustment({
      movingRect: rect(0, 100, 50, 50),
      proposedDx: 97,
      proposedDy: 0,
      targets: [t1, t2],
      threshold: SNAP_THRESHOLD_PX,
      disabled: false,
    });
    expect(result.dx).toBe(100);
    // Should have a guide at x=100
    const xGuides = result.guides.filter((g) => g.axis === "x");
    expect(xGuides.length).toBeGreaterThanOrEqual(1);
    expect(xGuides[0].position).toBe(100);
    // The guide extent should cover both targets and the moving rect
    expect(xGuides[0].from).toBe(0); // t1 top
    expect(xGuides[0].to).toBe(250); // t2 bottom
  });

  test("disabled=true returns passthrough", () => {
    const t = target("a", 100, 100, 50, 50);
    const result = resolveSnapAdjustment({
      movingRect: rect(0, 0, 50, 50),
      proposedDx: 98,
      proposedDy: 98,
      targets: [t],
      threshold: SNAP_THRESHOLD_PX,
      disabled: true,
    });
    expect(result.dx).toBe(98);
    expect(result.dy).toBe(98);
    expect(result.guides).toHaveLength(0);
  });

  test("threshold=0 means no snap", () => {
    const t = target("a", 100, 100, 50, 50);
    const result = resolveSnapAdjustment({
      movingRect: rect(0, 0, 50, 50),
      proposedDx: 99,
      proposedDy: 99,
      targets: [t],
      threshold: 0,
      disabled: false,
    });
    expect(result.dx).toBe(99);
    expect(result.dy).toBe(99);
    expect(result.guides).toHaveLength(0);
  });

  test("element snap takes priority over grid snap", () => {
    // Element left edge at 100. Grid line at 97.
    // Moving rect proposed left at 98 => dist to element=2, dist to grid=1.
    // Grid is closer but element should win (priority).
    // Actually the spec says element takes priority when both match within threshold.
    // Let's set up: element at 103, grid at 97. Moving proposed left=100.
    // Dist to element=3, dist to grid=3. Element should win.
    const t = target("a", 103, 100, 50, 50);
    const gridEdges = {
      x: [{ position: 97, source: "grid" as const, id: "grid-x-0" }],
      y: [],
    };
    const result = resolveSnapAdjustment({
      movingRect: rect(0, 100, 50, 50),
      proposedDx: 100,
      proposedDy: 0,
      targets: [t],
      gridEdges,
      threshold: SNAP_THRESHOLD_PX,
      disabled: false,
    });
    // Element at 103 wins over grid at 97 (both within threshold, same distance)
    expect(result.dx).toBe(103);
  });

  test("grid snap used when no element matches", () => {
    const gridEdges = {
      x: [{ position: 100, source: "grid" as const, id: "grid-x-0" }],
      y: [],
    };
    const result = resolveSnapAdjustment({
      movingRect: rect(0, 0, 50, 50),
      proposedDx: 97,
      proposedDy: 10,
      targets: [],
      gridEdges,
      threshold: SNAP_THRESHOLD_PX,
      disabled: false,
    });
    expect(result.dx).toBe(100);
  });

  test("snaps X and Y independently", () => {
    const t = target("a", 200, 300, 100, 100);
    const result = resolveSnapAdjustment({
      movingRect: rect(0, 0, 100, 100),
      proposedDx: 198,
      proposedDy: 500,
      targets: [t],
      threshold: SNAP_THRESHOLD_PX,
      disabled: false,
    });
    // X should snap (left-to-left, diff=2), Y should not snap (too far)
    expect(result.dx).toBe(200);
    expect(result.dy).toBe(500);
  });

  test("works correctly with many targets (80)", () => {
    const targets: SnapTarget[] = [];
    for (let i = 0; i < 80; i++) {
      targets.push(target(`el-${i}`, i * 50, i * 30, 40, 20));
    }
    // Moving rect near target el-40: left=2000, top=1200
    const result = resolveSnapAdjustment({
      movingRect: rect(0, 0, 40, 20),
      proposedDx: 1998,
      proposedDy: 1198,
      targets,
      threshold: SNAP_THRESHOLD_PX,
      disabled: false,
    });
    expect(result.dx).toBe(2000);
    expect(result.dy).toBe(1200);
    expect(result.guides.length).toBeGreaterThanOrEqual(1);
  });

  test("opposite-direction tie produces no snap (ambiguous midpoint)", () => {
    const tA = target("a", 100, 100, 10, 10);
    const tB = target("b", 120, 100, 10, 10);
    // Moving rect at x=110, width=10 → left=110, right=120
    // tA.right=110, distance=0; tB.left=120, distance=0 — both exact, opposite pull
    const result = resolveSnapAdjustment({
      movingRect: rect(110, 100, 10, 10),
      proposedDx: 0,
      proposedDy: 0,
      targets: [tA, tB],
      threshold: SNAP_THRESHOLD_PX,
      disabled: false,
    });
    expect(result.dx).toBe(0);
    expect(result.dy).toBe(0);
  });

  test("handles subpixel positions from non-100% zoom", () => {
    const t = target("a", 200.5, 100.3, 100, 100);
    const result = resolveSnapAdjustment({
      movingRect: rect(0, 0, 50, 50),
      proposedDx: 197.8,
      proposedDy: 0,
      targets: [t],
      threshold: SNAP_THRESHOLD_PX,
      disabled: false,
    });
    // left edge at 197.8, target left at 200.5, diff=2.7 within threshold
    expect(result.dx).toBe(200.5);
  });
});

// ---------------------------------------------------------------------------
// resolveGuideLineRect
// ---------------------------------------------------------------------------

describe("resolveGuideLineRect", () => {
  const composition = rect(120, 80, 640, 360); // letterboxed inside the overlay

  test("vertical guide (axis x) spans the composition's height at the snap x", () => {
    expect(resolveGuideLineRect({ axis: "x", position: 440, from: 0, to: 0 }, composition)).toEqual(
      { left: 440, top: 80, width: 1, height: 360 },
    );
  });

  test("horizontal guide (axis y) spans the composition's width at the snap y", () => {
    expect(resolveGuideLineRect({ axis: "y", position: 260, from: 0, to: 0 }, composition)).toEqual(
      { left: 120, top: 260, width: 640, height: 1 },
    );
  });
});

// ---------------------------------------------------------------------------
// resolveEquidistanceGuides
// ---------------------------------------------------------------------------

describe("resolveEquidistanceGuides", () => {
  test("detects equal horizontal spacing", () => {
    // Three elements in a row: A(0..40), moving(70..110), B(140..180)
    // Gap A-moving = 70 - 40 = 30, gap moving-B = 140 - 110 = 30 => equal
    const targets = [target("a", 0, 0, 40, 40), target("b", 140, 0, 40, 40)];
    const guides = resolveEquidistanceGuides({
      movingRect: rect(70, 0, 40, 40),
      targets,
      threshold: SNAP_THRESHOLD_PX,
    });
    const xGuides = guides.filter((g) => g.axis === "x");
    expect(xGuides.length).toBe(2);
    expect(xGuides[0].size).toBe(30);
    expect(xGuides[1].size).toBe(30);
  });

  test("detects equal vertical spacing", () => {
    // A(y=0..40), moving(y=60..100), B(y=120..160)
    // Gap = 20 each
    const targets = [target("a", 0, 0, 40, 40), target("b", 0, 120, 40, 40)];
    const guides = resolveEquidistanceGuides({
      movingRect: rect(0, 60, 40, 40),
      targets,
      threshold: SNAP_THRESHOLD_PX,
    });
    const yGuides = guides.filter((g) => g.axis === "y");
    expect(yGuides.length).toBe(2);
    expect(yGuides[0].size).toBe(20);
  });

  test("no equidistance when gaps differ", () => {
    // A(0..40), moving(80..120), B(200..240)
    // Gap A-moving = 40, gap moving-B = 80 => not equal
    const targets = [target("a", 0, 0, 40, 40), target("b", 200, 0, 40, 40)];
    const guides = resolveEquidistanceGuides({
      movingRect: rect(80, 0, 40, 40),
      targets,
      threshold: SNAP_THRESHOLD_PX,
    });
    const xGuides = guides.filter((g) => g.axis === "x");
    expect(xGuides.length).toBe(0);
  });

  test("handles tolerance of 1px", () => {
    // A(0..40), moving(70..110), B(139..179)
    // Gap A-moving = 30, gap moving-B = 29 => difference = 1 => within tolerance
    const targets = [target("a", 0, 0, 40, 40), target("b", 139, 0, 40, 40)];
    const guides = resolveEquidistanceGuides({
      movingRect: rect(70, 0, 40, 40),
      targets,
      threshold: SNAP_THRESHOLD_PX,
    });
    const xGuides = guides.filter((g) => g.axis === "x");
    expect(xGuides.length).toBe(2);
  });

  test("ignores overlapping elements", () => {
    // A(0..100), moving(50..150), B(200..300) — A and moving overlap
    const targets = [target("a", 0, 0, 100, 40), target("b", 200, 0, 100, 40)];
    const guides = resolveEquidistanceGuides({
      movingRect: rect(50, 0, 100, 40),
      targets,
      threshold: SNAP_THRESHOLD_PX,
    });
    const xGuides = guides.filter((g) => g.axis === "x");
    // Gap A-moving = 50 - 100 = -50 (overlap), should be skipped
    expect(xGuides.length).toBe(0);
  });

  test("only reports triplets involving the moving rect", () => {
    // A(0..40), B(60..100), C(120..160) — all gaps = 20 but none involves moving
    // Moving rect is far away at (500..540)
    const targets = [
      target("a", 0, 0, 40, 40),
      target("b", 60, 0, 40, 40),
      target("c", 120, 0, 40, 40),
    ];
    const guides = resolveEquidistanceGuides({
      movingRect: rect(500, 0, 40, 40),
      targets,
      threshold: SNAP_THRESHOLD_PX,
    });
    // The A-B-C triplet doesn't involve moving, so no guides from it
    // Any triplet involving moving would have huge gaps that don't match
    const xGuides = guides.filter((g) => g.axis === "x");
    expect(xGuides.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("edge cases", () => {
  test("empty targets returns passthrough", () => {
    const result = resolveSnapAdjustment({
      movingRect: rect(0, 0, 50, 50),
      proposedDx: 10,
      proposedDy: 20,
      targets: [],
      threshold: SNAP_THRESHOLD_PX,
      disabled: false,
    });
    expect(result.dx).toBe(10);
    expect(result.dy).toBe(20);
    expect(result.guides).toHaveLength(0);
  });

  test("exact match (zero distance) produces snap", () => {
    const t = target("a", 100, 100, 50, 50);
    const result = resolveSnapAdjustment({
      movingRect: rect(0, 0, 50, 50),
      proposedDx: 100,
      proposedDy: 100,
      targets: [t],
      threshold: SNAP_THRESHOLD_PX,
      disabled: false,
    });
    expect(result.dx).toBe(100);
    expect(result.dy).toBe(100);
    expect(result.guides.length).toBeGreaterThanOrEqual(1);
  });

  test("negative proposed delta works", () => {
    const t = target("a", 50, 50, 100, 100);
    // Moving rect at (200, 200), propose dx=-148 => proposed left=52, target left=50, diff=2
    const result = resolveSnapAdjustment({
      movingRect: rect(200, 200, 50, 50),
      proposedDx: -148,
      proposedDy: -148,
      targets: [t],
      threshold: SNAP_THRESHOLD_PX,
      disabled: false,
    });
    expect(result.dx).toBe(-150);
    expect(result.dy).toBe(-150);
  });

  test("left-to-left alignment", () => {
    const t = target("a", 100, 0, 200, 200);
    const result = resolveSnapAdjustment({
      movingRect: rect(0, 300, 80, 80),
      proposedDx: 97,
      proposedDy: 0,
      targets: [t],
      threshold: SNAP_THRESHOLD_PX,
      disabled: false,
    });
    expect(result.dx).toBe(100);
  });

  test("right-to-right alignment", () => {
    // Target right = 300. Moving rect width=80 at x=0, right=80.
    // Propose dx=217 => proposed right=297, target right=300, diff=3.
    const t = target("a", 100, 0, 200, 200);
    const result = resolveSnapAdjustment({
      movingRect: rect(0, 300, 80, 80),
      proposedDx: 217,
      proposedDy: 0,
      targets: [t],
      threshold: SNAP_THRESHOLD_PX,
      disabled: false,
    });
    expect(result.dx).toBe(220); // proposed left=220, proposed right=300
  });

  test("bottom-to-bottom alignment", () => {
    // Target bottom = 200. Moving rect height=50 at y=0, bottom=50.
    // Propose dy=147 => proposed bottom=197, target bottom=200, diff=3.
    const t = target("a", 0, 0, 200, 200);
    const result = resolveSnapAdjustment({
      movingRect: rect(0, 0, 50, 50),
      proposedDx: 0,
      proposedDy: 147,
      targets: [t],
      threshold: SNAP_THRESHOLD_PX,
      disabled: false,
    });
    expect(result.dy).toBe(150);
  });
});
