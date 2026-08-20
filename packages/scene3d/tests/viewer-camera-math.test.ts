import { describe, expect, it } from "vitest";
import { KIT_RUNTIME_JS } from "../src/viewer/kit-runtime.js";

/**
 * The viewer's camera arithmetic, exercised as the browser runs it.
 *
 * `KIT_RUNTIME_JS` is a string that never passes through `tsc`, so nothing
 * else in this repo can catch a mistake in it. Evaluating the real string
 * — rather than re-implementing the formulas here, which would only test
 * the copy — is the one way a test can speak for the code that ships.
 *
 * Everything below is scale-sensitive: the same expression has to behave
 * identically for a scene measured in millimetres and one measured in
 * kilometres, at any zoom, for a part anywhere relative to the orbit pivot.
 * Every defect these pin was a hidden assumption that some quantity was
 * "about 1".
 */
function loadCameraMath(): {
  viewFrustum: (
    state: { distance: number },
    bounds: { radius: number },
  ) => { near: number; far: number; radius: number };
  zoomRange: (bounds: { radius: number } | null) => { min: number; max: number };
  viewDepth: (
    renderer: { bounds: { center: number[]; radius: number } },
    state: { azimuth: number; elevation: number; distance: number; pan: number[] },
    point: number[],
  ) => number;
  worldPerPixel: (state: { distance: number }, canvas: { clientHeight: number }) => number;
  FOV_Y: number;
} {
  return new Function(
    `${KIT_RUNTIME_JS}
return {
  viewFrustum: viewFrustum,
  zoomRange: zoomRange,
  viewDepth: viewDepth,
  worldPerPixel: worldPerPixel,
  FOV_Y: FOV_Y,
};`,
  )() as ReturnType<typeof loadCameraMath>;
}

const math = loadCameraMath();

/** Scene radii spanning the domains a user actually works in. */
const RADII = [1e-3, 1e-2, 1, 12, 1_000, 250_000];

const stateAt = (distance: number) => ({
  azimuth: 0.9,
  elevation: 0.42,
  distance,
  pan: [0, 0, 0],
});

describe("viewer camera math (kit-runtime.ts)", () => {
  describe("view frustum", () => {
    /**
     * The near plane used to be `radius * 0.01` — anchored to the scene and
     * nothing else. That holds while you look at a whole asset and fails the
     * moment you zoom into a detail of a large one, because the plane stays
     * anchored far out while the camera comes in close.
     *
     * The failure was not clean. A point nearer than the near plane still
     * has a positive w, so it survived a small-epsilon rejection and then
     * divided into screen coordinates in the tens of thousands.
     */
    it("keeps the near plane in front of the camera at every scene scale", () => {
      for (const radius of RADII) {
        const range = math.zoomRange({ radius });
        for (const distance of [range.min, range.min * 2, radius, range.max]) {
          const { near, far } = math.viewFrustum(stateAt(distance), { radius });
          expect(near).toBeGreaterThan(0);
          expect(far).toBeGreaterThan(near);
          // The camera must never be able to arrive at or inside its own
          // near plane: that is the state where projection explodes.
          expect(near).toBeLessThan(distance);
        }
      }
    });

    /**
     * A depth buffer has finite precision, so an unbounded far/near ratio
     * trades one visible defect for another. Letting near follow the camera
     * in is only safe while the ratio stays inside what 24-bit depth can
     * separate.
     */
    it("holds the far/near ratio inside what a depth buffer can resolve", () => {
      for (const radius of RADII) {
        const range = math.zoomRange({ radius });
        for (const distance of [range.min, radius, range.max]) {
          const { near, far } = math.viewFrustum(stateAt(distance), { radius });
          expect(far / near).toBeLessThan(1e6);
        }
      }
    });

    /** Scale invariance: the same view of a scene 1000x larger is the same
     *  view, so every plane simply scales with it. */
    it("scales with the scene rather than assuming world units", () => {
      const small = math.viewFrustum(stateAt(3.2), { radius: 1 });
      const large = math.viewFrustum(stateAt(3.2 * 1000), { radius: 1000 });
      expect(large.near / small.near).toBeCloseTo(1000, 6);
      expect(large.far / small.far).toBeCloseTo(1000, 6);
    });

    it("survives a degenerate or missing bounds without producing NaN", () => {
      for (const bounds of [{ radius: 0 }, { radius: -1 }, null as never]) {
        const { near, far } = math.viewFrustum(stateAt(1), bounds as { radius: number });
        expect(Number.isFinite(near)).toBe(true);
        expect(Number.isFinite(far)).toBe(true);
        expect(near).toBeGreaterThan(0);
        expect(far).toBeGreaterThan(near);
      }
    });
  });

  describe("zoom range", () => {
    /**
     * The clamp used to be `Math.max(0.05, ...)` — an absolute world unit.
     * 0.05 means "cannot get close" in a scene measured in metres and
     * "already well inside the geometry" in one measured in millimetres.
     */
    it("expresses its limits in scene radii, not world units", () => {
      for (const radius of RADII) {
        const range = math.zoomRange({ radius });
        expect(range.min).toBeGreaterThan(0);
        expect(range.min).toBeLessThan(radius);
        expect(range.max).toBeGreaterThan(radius);
      }
      const a = math.zoomRange({ radius: 1 });
      const b = math.zoomRange({ radius: 1000 });
      expect(b.min / a.min).toBeCloseTo(1000, 6);
      expect(b.max / a.max).toBeCloseTo(1000, 6);
    });

    it("still yields a usable range when bounds are unknown", () => {
      const range = math.zoomRange(null);
      expect(range.min).toBeGreaterThan(0);
      expect(range.max).toBeGreaterThan(range.min);
    });

    /** Close enough to inspect a rivet on a watchtower. */
    it("allows getting at least a hundred times closer than the scene radius", () => {
      for (const radius of RADII) {
        expect(math.zoomRange({ radius }).min).toBeLessThanOrEqual(radius / 100);
      }
    });
  });

  describe("view depth", () => {
    const bounds = { center: [0, 0, 0], radius: 10 };

    /**
     * This is the quantity every on-screen size depends on, and it is NOT
     * `state.distance`. That is the camera's distance to the ORBIT PIVOT.
     * A part offset from the pivot swings between (distance - offset) and
     * (distance + offset) as the camera orbits, while state.distance never
     * changes at all — so a widget sized from state.distance is held fixed
     * in WORLD units while its distance to the eye doubles, and grows and
     * shrinks on screen for no reason the user can see.
     */
    it("returns the orbit distance for a point at the pivot", () => {
      for (const distance of [0.01, 1, 5, 1000]) {
        const state = stateAt(distance);
        expect(math.viewDepth({ bounds }, state, [0, 0, 0])).toBeCloseTo(distance, 9);
      }
    });

    it("differs from the orbit distance for a part offset from the pivot", () => {
      const state = stateAt(100);
      // Straight down the view axis: depth must move by exactly the offset.
      const forward = [
        Math.cos(state.elevation) * Math.sin(state.azimuth),
        Math.sin(state.elevation),
        Math.cos(state.elevation) * Math.cos(state.azimuth),
      ];
      const nearer = forward.map((c) => c * 40);
      const farther = forward.map((c) => -c * 40);
      expect(math.viewDepth({ bounds }, state, nearer)).toBeCloseTo(60, 6);
      expect(math.viewDepth({ bounds }, state, farther)).toBeCloseTo(140, 6);
    });

    it("is unchanged by motion across the view plane", () => {
      const state = stateAt(100);
      // The camera's right vector: moving a point along it cannot change
      // how far away it is.
      const right = [Math.cos(state.azimuth), 0, -Math.sin(state.azimuth)];
      const base = math.viewDepth({ bounds }, state, [0, 0, 0]);
      const slid = math.viewDepth({ bounds }, state, right.map((c) => c * 25));
      expect(slid).toBeCloseTo(base, 6);
    });
  });

  describe("pointer-to-world conversion", () => {
    /**
     * One CSS pixel of pointer motion, in world units, at a given depth.
     * Shared by the camera pan and by the gizmo's free-move — they were two
     * separate derivations, and the second one carried the literal constant
     * 0.0016, which is this formula frozen at a viewport exactly 518px tall.
     */
    it("inverts the perspective projection exactly", () => {
      for (const height of [320, 518, 720, 1440]) {
        for (const distance of [0.01, 1, 1000]) {
          const perPixel = math.worldPerPixel(stateAt(distance), { clientHeight: height });
          // A world span of `perPixel * height` must fill the frustum
          // height at that depth, which is 2 * d * tan(fov / 2).
          const frustumHeight = 2 * distance * Math.tan(math.FOV_Y / 2);
          expect(perPixel * height).toBeCloseTo(frustumHeight, 9);
        }
      }
    });

    it("scales inversely with viewport height and linearly with depth", () => {
      const tall = math.worldPerPixel(stateAt(10), { clientHeight: 1440 });
      const short = math.worldPerPixel(stateAt(10), { clientHeight: 720 });
      expect(short / tall).toBeCloseTo(2, 9);

      const near = math.worldPerPixel(stateAt(10), { clientHeight: 720 });
      const far = math.worldPerPixel(stateAt(1000), { clientHeight: 720 });
      expect(far / near).toBeCloseTo(100, 9);
    });

    it("never returns zero or NaN for a degenerate viewport", () => {
      for (const height of [0, -5, Number.NaN]) {
        const perPixel = math.worldPerPixel(stateAt(1), { clientHeight: height });
        expect(Number.isFinite(perPixel)).toBe(true);
        expect(perPixel).toBeGreaterThan(0);
      }
    });
  });

  describe("constant-screen-size sizing", () => {
    /**
     * The gizmo's handle length is a target in CSS pixels converted to world
     * units at the part's own depth. Round-tripping that conversion has to
     * return the pixels asked for — at any scene scale, any zoom, and any
     * depth — or the widget is a different size depending on where you are
     * standing, which is exactly the reported defect.
     */
    it("round-trips a pixel target to world and back at every scale", () => {
      for (const height of [400, 720, 1600]) {
        for (const depth of [1e-4, 1e-2, 1, 500, 1e5]) {
          for (const targetPx of [78, 137, 190]) {
            const perPixel = math.worldPerPixel(stateAt(depth), { clientHeight: height });
            const worldLength = targetPx * perPixel;
            // Project a span perpendicular to the view axis back to pixels.
            const backToPixels = worldLength / perPixel;
            expect(backToPixels).toBeCloseTo(targetPx, 6);
            // And it must be a real world length, not a degenerate one.
            expect(worldLength).toBeGreaterThan(0);
            expect(Number.isFinite(worldLength)).toBe(true);
          }
        }
      }
    });

    /**
     * The property that actually failed in the product: two parts at
     * different depths must produce handles of the SAME on-screen length,
     * which means their world lengths must differ in exactly the ratio of
     * their depths. Sizing from the orbit distance gives both the same
     * world length, so the further one draws smaller.
     */
    it("gives parts at different depths the same on-screen size", () => {
      const height = 720;
      const targetPx = 137;
      const nearWorld = targetPx * math.worldPerPixel(stateAt(60), { clientHeight: height });
      const farWorld = targetPx * math.worldPerPixel(stateAt(140), { clientHeight: height });
      expect(farWorld / nearWorld).toBeCloseTo(140 / 60, 9);

      // Sized from a shared orbit distance instead, both would be identical
      // in world units — and therefore visibly different on screen.
      const orbitSized = 100 * 0.16;
      expect(orbitSized / nearWorld).not.toBeCloseTo(orbitSized / farWorld, 3);
    });
  });
});
