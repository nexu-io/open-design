import { describe, expect, it } from "vitest";
import {
  resizeRemainderShift,
  resolveCenterResizeScale,
  resolveCenterResizeSize,
  resolveRotatedResizeCursor,
} from "./domEditResizeLocal";

const DEG = Math.PI / 180;

describe("resolveCenterResizeScale — radial distance from the center", () => {
  it("scale is the ratio of pointer-to-center distances", () => {
    // start 100px from center, now 150px from center → 1.5x.
    expect(
      resolveCenterResizeScale({
        centerStart: { x: 100, y: 100 },
        pointerStart: { x: 200, y: 100 },
        pointer: { x: 250, y: 100 },
      }),
    ).toBeCloseTo(1.5, 9);
  });

  it("shrinks as the pointer moves toward the center", () => {
    expect(
      resolveCenterResizeScale({
        centerStart: { x: 0, y: 0 },
        pointerStart: { x: 0, y: 200 },
        pointer: { x: 0, y: 50 },
      }),
    ).toBeCloseTo(0.25, 9);
  });

  it("bails to 1 when the gesture starts at (or ~at) the center (degenerate)", () => {
    expect(
      resolveCenterResizeScale({
        centerStart: { x: 100, y: 100 },
        pointerStart: { x: 100.2, y: 100 },
        pointer: { x: 400, y: 400 },
      }),
    ).toBe(1);
  });

  it("scales a 4x4 pick whose grabbed corner sits under 3px from its center", () => {
    expect(
      resolveCenterResizeScale({
        centerStart: { x: 100, y: 100 },
        pointerStart: { x: 102, y: 102 },
        pointer: { x: 104, y: 104 },
      }),
    ).toBeCloseTo(2, 9);
  });
});

describe("resolveCenterResizeSize — rotation is a non-event (radial distance)", () => {
  // The pure function takes no rotation argument: rotating the WHOLE gesture
  // (center, pointer-down, pointer-now) about the center by any angle preserves
  // every radial distance, so the returned size is identical at 0/37/90deg.
  const base = { baseWidth: 240, baseHeight: 120 };
  const centerStart = { x: 320, y: 180 };
  // A pointer-down 100px right of center, dragged to 160px right of center (1.6x).
  const p0 = { x: 100, y: 0 };
  const p1 = { x: 160, y: 0 };
  const rot = (v: { x: number; y: number }, t: number) => ({
    x: centerStart.x + (Math.cos(t) * v.x - Math.sin(t) * v.y),
    y: centerStart.y + (Math.sin(t) * v.x + Math.cos(t) * v.y),
  });

  for (const deg of [0, 37, 90]) {
    it(`@${deg}deg: proportional 1.6x scale, same result as unrotated`, () => {
      const t = deg * DEG;
      const out = resolveCenterResizeSize({
        ...base,
        centerStart,
        pointerStart: rot(p0, t),
        pointer: rot(p1, t),
      });
      expect(out.width).toBeCloseTo(240 * 1.6, 6);
      expect(out.height).toBeCloseTo(120 * 1.6, 6);
      expect(out.width / out.height).toBeCloseTo(2, 9);
    });
  }

  it("shrink toward center keeps the aspect ratio", () => {
    const out = resolveCenterResizeSize({
      baseWidth: 300,
      baseHeight: 180,
      centerStart: { x: 0, y: 0 },
      pointerStart: { x: 0, y: 200 },
      pointer: { x: 0, y: 120 },
    });
    expect(out.width).toBeCloseTo(300 * 0.6, 6);
    expect(out.height).toBeCloseTo(180 * 0.6, 6);
    expect(out.width / out.height).toBeCloseTo(300 / 180, 9);
  });

  it("clamps at the local minimum, never mirroring through zero (drag past center)", () => {
    // Pointer dragged to the exact center → raw scale 0; the smaller edge is
    // clamped to MIN_RESIZE_LOCAL_PX and the aspect ratio holds at the clamp.
    const out = resolveCenterResizeSize({
      baseWidth: 200,
      baseHeight: 100,
      centerStart: { x: 100, y: 100 },
      pointerStart: { x: 200, y: 100 },
      pointer: { x: 100, y: 100 },
    });
    expect(out.width).toBeGreaterThan(0);
    expect(out.height).toBeGreaterThan(0);
    expect(Math.min(out.width, out.height)).toBeCloseTo(1, 9);
    expect(out.width / out.height).toBeCloseTo(2, 9);
  });

  it("degenerate start-at-center returns the base size unchanged (scale 1)", () => {
    const out = resolveCenterResizeSize({
      baseWidth: 200,
      baseHeight: 100,
      centerStart: { x: 100, y: 100 },
      pointerStart: { x: 100, y: 100 },
      pointer: { x: 400, y: 400 },
    });
    expect(out).toEqual({ width: 200, height: 100 });
  });
});

describe("resolveRotatedResizeCursor", () => {
  it("returns the static diagonal cursors at rotation 0", () => {
    expect(resolveRotatedResizeCursor("nw", 0)).toBe("nwse-resize");
    expect(resolveRotatedResizeCursor("se", 0)).toBe("nwse-resize");
    expect(resolveRotatedResizeCursor("ne", 0)).toBe("nesw-resize");
    expect(resolveRotatedResizeCursor("sw", 0)).toBe("nesw-resize");
  });

  it("rotates the cursor with the element (90deg swaps the diagonals)", () => {
    // NW base 315° + 90° = 45° → nesw-resize
    expect(resolveRotatedResizeCursor("nw", 90)).toBe("nesw-resize");
    // NW base 315° + 45° = 360°→0° → ns-resize
    expect(resolveRotatedResizeCursor("nw", 45)).toBe("ns-resize");
  });

  it("wraps negative rotations", () => {
    expect(resolveRotatedResizeCursor("se", -90)).toBe("nesw-resize");
  });
});

describe("resizeRemainderShift", () => {
  const written = { width: 301, height: 150 };
  const wanted = { width: 300.6, height: 150.3 };
  const centre = { x: 400, y: 300 };
  // Local (u, v) px map to overlay px through a 1.5x scale, a rotation and an optional x mirror.
  const box = (angle: number, mirror: 1 | -1) => {
    const at = (u: number, v: number) => ({
      x: centre.x + 1.5 * (mirror * u * Math.cos(angle) - v * Math.sin(angle)),
      y: centre.y + 1.5 * (mirror * u * Math.sin(angle) + v * Math.cos(angle)),
    });
    const [w, h] = [written.width / 2, written.height / 2];
    return { at, corners: { nw: at(-w, -h), ne: at(w, -h), sw: at(-w, h), se: at(w, h) } };
  };

  // A rotated parent composes into the same map, and a mirror moves each handle onto another local corner.
  it.each([
    [30, 1, -1, -1],
    [30, 1, 1, -1],
    [30, 1, -1, 1],
    [30, 1, 1, 1],
    [-120, 1, 1, 1],
    [90, 1, 1, -1],
    [0, -1, -1, 1],
    [150, -1, 1, 1],
    [180, -1, -1, -1],
  ] as const)("at %i deg, mirror %i, lands local corner (%i, %i)", (deg, mirror, su, sv) => {
    const { at, corners } = box((deg * Math.PI) / 180, mirror);
    const grabbed = at((su * written.width) / 2, (sv * written.height) / 2);
    const grab = { x: grabbed.x - centre.x, y: grabbed.y - centre.y };
    const shift = resizeRemainderShift(corners, grab, { wanted, written });
    const target = at((su * wanted.width) / 2, (sv * wanted.height) / 2);
    expect(grabbed.x + shift.x).toBeCloseTo(target.x, 9);
    expect(grabbed.y + shift.y).toBeCloseTo(target.y, 9);
  });
});

describe("resizeRemainderShift on a skewed box", () => {
  // A 30 deg child of a parent scaled 2 x 1 renders as a parallelogram; a 10 x 200 bar flips a projected sign.
  const angle = Math.PI / 6;
  const at = (u: number, v: number) => ({
    x: 400 + 2 * (u * Math.cos(angle) - v * Math.sin(angle)),
    y: 300 + (u * Math.sin(angle) + v * Math.cos(angle)),
  });
  const written = { width: 10, height: 200 };
  const wanted = { width: 10.4, height: 199.7 };
  const corners = { nw: at(-5, -100), ne: at(5, -100), sw: at(-5, 100), se: at(5, 100) };

  it.each([
    [1, 1],
    [-1, -1],
    [1, -1],
    [-1, 1],
  ] as const)("lands local corner (%i, %i) on the wanted size", (su, sv) => {
    const grabbed = at((su * written.width) / 2, (sv * written.height) / 2);
    const grab = { x: grabbed.x - 400, y: grabbed.y - 300 };
    const shift = resizeRemainderShift(corners, grab, { wanted, written });
    const target = at((su * wanted.width) / 2, (sv * wanted.height) / 2);
    expect(grabbed.x + shift.x).toBeCloseTo(target.x, 9);
    expect(grabbed.y + shift.y).toBeCloseTo(target.y, 9);
  });
});

it("shifts nothing for a box that renders with no area", () => {
  const p = { x: 400, y: 300 };
  const corners = { nw: p, ne: p, sw: p, se: p };
  const sizes = { wanted: { width: 300.6, height: 150.3 }, written: { width: 301, height: 150 } };
  expect(resizeRemainderShift(corners, { x: 1, y: 1 }, sizes)).toEqual({ x: 0, y: 0 });
});
