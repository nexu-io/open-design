import { describe, expect, it } from "vitest";
import { projectAxes, projectCubeFaces, rotate, wrapDeg } from "./transform3dProjection";

const OPTS = { cx: 50, cy: 50, r: 30, persp: 4 };

describe("projectCubeFaces", () => {
  it("shows the front face (and only front-facing faces) at identity", () => {
    const faces = projectCubeFaces(0, 0, 0, OPTS);
    const ids = faces.map((f) => f.id);
    expect(ids).toContain("front");
    // Head-on: side/top/bottom normals are edge-on (n.z ≈ 0) → culled.
    expect(ids).not.toContain("back");
    expect(faces.length).toBeGreaterThanOrEqual(1);
    expect(faces.length).toBeLessThanOrEqual(3);
  });

  it("reveals the top face when tilted forward on X", () => {
    const ids = projectCubeFaces(45, 0, 0, OPTS).map((f) => f.id);
    expect(ids).toContain("front");
    expect(ids).toContain("top");
    expect(ids).not.toContain("bottom");
  });

  it("reveals a side face when rotated on Y (CSS rotateY convention)", () => {
    const ids = projectCubeFaces(0, 45, 0, OPTS).map((f) => f.id);
    expect(ids).toContain("front");
    expect(ids).toContain("left");
    expect(ids).not.toContain("right");
  });

  it("never returns more than 3 faces (a cube shows at most 3 at once)", () => {
    for (const [rx, ry, rz] of [
      [30, 30, 0],
      [60, 60, 45],
      [135, 20, 90],
    ]) {
      expect(projectCubeFaces(rx, ry, rz, OPTS).length).toBeLessThanOrEqual(3);
    }
  });

  it("rotationZ rolls the silhouette without changing which faces are visible", () => {
    const a = projectCubeFaces(0, 0, 0, OPTS)
      .map((f) => f.id)
      .sort();
    const b = projectCubeFaces(0, 0, 90, OPTS)
      .map((f) => f.id)
      .sort();
    expect(b).toEqual(a);
    // …but the projected coordinates differ (it rolled).
    expect(projectCubeFaces(0, 0, 90, OPTS)[0]?.points).not.toEqual(
      projectCubeFaces(0, 0, 0, OPTS)[0]?.points,
    );
  });

  it("paints far faces before near faces (painter's order)", () => {
    const faces = projectCubeFaces(35, 35, 0, OPTS);
    for (let i = 1; i < faces.length; i++) {
      expect(faces[i]!.depth).toBeGreaterThanOrEqual(faces[i - 1]!.depth);
    }
  });
});

describe("projectAxes", () => {
  it("returns the three X/Y/Z axes with standard colors", () => {
    const axes = projectAxes(0, 0, 0, OPTS);
    expect(axes.map((a) => a.id).sort()).toEqual(["x", "y", "z"]);
    const z = axes.find((a) => a.id === "z")!;
    expect(z.color).toMatch(/#/);
  });

  it("flags the toward-viewer axis as front at identity (Z points at the camera)", () => {
    const z = projectAxes(0, 0, 0, OPTS).find((a) => a.id === "z")!;
    expect(z.front).toBe(true);
  });

  it("rotating 180° on Y flips the Z axis away from the viewer", () => {
    const z = projectAxes(0, 180, 0, OPTS).find((a) => a.id === "z")!;
    expect(z.front).toBe(false);
  });
});

describe("rotate", () => {
  it("90° on Y maps +x to -z (right edge swings to the back)", () => {
    const v = rotate({ x: 1, y: 0, z: 0 }, 0, 90, 0);
    expect(v.x).toBeCloseTo(0, 5);
    expect(v.z).toBeCloseTo(-1, 5);
  });
});

describe("wrapDeg", () => {
  it("wraps into (-180, 180]", () => {
    expect(wrapDeg(0)).toBe(0);
    expect(wrapDeg(180)).toBe(180);
    expect(wrapDeg(190)).toBe(-170);
    expect(wrapDeg(-190)).toBe(170);
    expect(wrapDeg(360)).toBe(0);
    expect(wrapDeg(540)).toBe(180);
  });
});
