import { describe, expect, it } from "vitest";
import { KIT_RUNTIME_JS } from "../src/viewer/kit-runtime.js";

/**
 * Viewport picking: the ray must select the surface under the cursor.
 *
 * Picking used to be a world-space AABB test, and the reported symptom was
 * that clicking one part selected another beside it. Three properties of an
 * axis-aligned box make that inevitable rather than occasional: a rotated
 * part's box is up to sqrt(3) times its own volume, a sphere's box is 91%
 * empty at the corners, and neighbouring boxes overlap freely. The winner was
 * the nearest box ENTRY, so a part the ray merely passed near beat the part
 * the user aimed at.
 *
 * These pin the geometry directly rather than through a GL context: the
 * runtime is dependency-free and its picking functions are pure, so the maths
 * can be tested without a canvas. What cannot be tested here is the screen ->
 * NDC step (it needs a laid-out DOM); that half was verified correct by
 * inspection against the render path, which shares FOV_Y and the aspect.
 */

interface Draw {
  pickPositions: Float32Array | null;
  pickIndices: Uint16Array | null;
  model: number[];
  min: number[];
  max: number[];
  name?: string;
}

function loadPicking(): {
  rayBoxSpan: (o: number[], d: number[], min: number[], max: number[]) => number | null;
  rayMeshDistance: (o: number[], d: number[], draw: Draw) => number | null;
} {
  const factory = new Function(
    `${KIT_RUNTIME_JS}\nreturn { rayBoxSpan: rayBoxSpan, rayMeshDistance: rayMeshDistance };`,
  );
  return factory() as ReturnType<typeof loadPicking>;
}

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** A unit quad in the z = `z` plane, spanning -h..h in x and y. */
function quad(z: number, h = 0.5): Float32Array {
  return new Float32Array([
    -h, -h, z, h, -h, z, h, h, z,
    -h, -h, z, h, h, z, -h, h, z,
  ]);
}

/** A draw whose AABB is deliberately far larger than its geometry — what a
 *  rotated part looks like to an axis-aligned test. */
function sliverWithFatBox(): Draw {
  return {
    pickPositions: quad(0, 0.05),
    pickIndices: null,
    model: IDENTITY,
    // The box a 45-degree rotation would produce: an order of magnitude
    // wider than the geometry inside it.
    min: [-1, -1, -0.01],
    max: [1, 1, 0.01],
    name: "sliver",
  };
}

describe("viewport picking", () => {
  const { rayBoxSpan, rayMeshDistance } = loadPicking();
  const forward = [0, 0, -1];

  it("hits the surface, at the surface's distance", () => {
    const draw: Draw = { pickPositions: quad(0.5), pickIndices: null, model: IDENTITY, min: [-0.5, -0.5, 0.5], max: [0.5, 0.5, 0.5] };
    // Eye at z=5, face at z=0.5 — the hit is 4.5 away, not the box's entry.
    expect(rayMeshDistance([0, 0, 5], forward, draw)).toBeCloseTo(4.5, 6);
  });

  it("misses geometry the ray passes beside, even when its box is hit", () => {
    const draw = sliverWithFatBox();
    // Inside the fat box, outside the 0.05 quad: the exact case that used to
    // select a part the cursor was nowhere near.
    expect(rayBoxSpan([0.5, 0.5, 5], forward, draw.min, draw.max)).not.toBeNull();
    expect(rayMeshDistance([0.5, 0.5, 5], forward, draw)).toBeNull();
  });

  it("prefers the nearer SURFACE when a farther part has a nearer box", () => {
    // The offender: a big thin part whose box starts closer to the camera,
    // and a small part actually under the cursor behind it.
    const fatBoxFarSurface: Draw = {
      pickPositions: quad(-2, 0.05),
      pickIndices: null,
      model: IDENTITY,
      min: [-1, -1, -2],
      max: [1, 1, 1],
      name: "wrapper",
    };
    const realTarget: Draw = {
      pickPositions: quad(0),
      pickIndices: null,
      model: IDENTITY,
      min: [-0.5, -0.5, 0],
      max: [0.5, 0.5, 0],
      name: "target",
    };
    const eye = [0.2, 0.2, 5];
    // The wrapper's BOX is entered first...
    expect(rayBoxSpan(eye, forward, fatBoxFarSurface.min, fatBoxFarSurface.max)!).toBeLessThan(
      rayBoxSpan(eye, forward, realTarget.min, realTarget.max)!,
    );
    // ...but its surface is farther, and only the surface decides.
    const wrapperHit = rayMeshDistance(eye, forward, fatBoxFarSurface);
    const targetHit = rayMeshDistance(eye, forward, realTarget)!;
    expect(wrapperHit === null || targetHit < wrapperHit).toBe(true);
  });

  it("respects the model matrix, so a moved part is picked where it now is", () => {
    const moved: Draw = {
      pickPositions: quad(0),
      pickIndices: null,
      // Translated +3 along z: column-major, translation in 12/13/14.
      model: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 3, 1],
      min: [-0.5, -0.5, 3],
      max: [0.5, 0.5, 3],
    };
    // Geometry authored at z=0 now sits at z=3, so the hit is 2 away, not 5.
    expect(rayMeshDistance([0, 0, 5], forward, moved)).toBeCloseTo(2, 6);
  });

  it("picks an indexed mesh the same as an unindexed one", () => {
    const shared = new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]);
    const indexed: Draw = {
      pickPositions: shared,
      pickIndices: Uint16Array.from([0, 1, 2, 0, 2, 3]),
      model: IDENTITY,
      min: [-0.5, -0.5, 0],
      max: [0.5, 0.5, 0],
    };
    expect(rayMeshDistance([0, 0, 4], forward, indexed)).toBeCloseTo(4, 6);
    expect(rayMeshDistance([0.9, 0, 4], forward, indexed)).toBeNull();
  });

  it("falls back to the box only when no geometry was retained", () => {
    // Not a silent degradation: without positions there is nothing to test,
    // and returning the box distance is the honest answer rather than a miss.
    const boxOnly: Draw = { pickPositions: null, pickIndices: null, model: IDENTITY, min: [-1, -1, -1], max: [1, 1, 1] };
    expect(rayMeshDistance([0, 0, 5], forward, boxOnly)).toBeCloseTo(4, 6);
  });

  it("reports zero when the camera is inside a part's box", () => {
    expect(rayBoxSpan([0, 0, 0], forward, [-1, -1, -1], [1, 1, 1])).toBe(0);
  });

  it("hits a back-facing triangle, because it is still visible and clickable", () => {
    // Reversed winding relative to the first case; a part whose normals the
    // author got backwards must not become unselectable.
    const flipped: Draw = {
      pickPositions: new Float32Array([
        -0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0,
        -0.5, -0.5, 0, 0.5, 0.5, 0, 0.5, -0.5, 0,
      ]),
      pickIndices: null,
      model: IDENTITY,
      min: [-0.5, -0.5, 0],
      max: [0.5, 0.5, 0],
    };
    expect(rayMeshDistance([0, 0, 3], forward, flipped)).toBeCloseTo(3, 6);
  });
});
