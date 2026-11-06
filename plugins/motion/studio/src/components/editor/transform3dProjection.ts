/**
 * Pure cube projection for the 3D-transform widget. Given an element's
 * rotationX/Y/Z (degrees), project a unit cube to 2D SVG polygons with
 * back-face culling and painter's-order sorting — no DOM, no React, so it
 * unit-tests in isolation. Used by Transform3DCube to draw a live preview of
 * the element's orientation.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface ProjectedFace {
  /** Stable face id (front/back/left/right/top/bottom) for keying + theming. */
  id: string;
  /** SVG polygon points: "x,y x,y x,y x,y". */
  points: string;
  /** 0..1 brightness from how front-facing the rotated normal is (lighting cue). */
  shade: number;
  /** Mean depth of the face's corners; larger = nearer the viewer. */
  depth: number;
}

const DEG = Math.PI / 180;

/** Rotate a point intrinsically by X, then Y, then Z (degrees). */
export function rotate(v: Vec3, rx: number, ry: number, rz: number): Vec3 {
  let { x, y, z } = v;
  const cx = Math.cos(rx * DEG);
  const sx = Math.sin(rx * DEG);
  [y, z] = [y * cx - z * sx, y * sx + z * cx];
  const cy = Math.cos(ry * DEG);
  const sy = Math.sin(ry * DEG);
  [x, z] = [x * cy + z * sy, -x * sy + z * cy];
  const cz = Math.cos(rz * DEG);
  const sz = Math.sin(rz * DEG);
  [x, y] = [x * cz - y * sz, x * sz + y * cz];
  return { x, y, z };
}

// Unit-cube corners (±1) — 0-3 back face (z=-1), 4-7 front face (z=1).
const CORNERS: Vec3[] = [
  { x: -1, y: -1, z: -1 },
  { x: 1, y: -1, z: -1 },
  { x: 1, y: 1, z: -1 },
  { x: -1, y: 1, z: -1 },
  { x: -1, y: -1, z: 1 },
  { x: 1, y: -1, z: 1 },
  { x: 1, y: 1, z: 1 },
  { x: -1, y: 1, z: 1 },
];

const FACES: { id: string; idx: [number, number, number, number]; normal: Vec3 }[] = [
  { id: "front", idx: [4, 5, 6, 7], normal: { x: 0, y: 0, z: 1 } },
  { id: "back", idx: [1, 0, 3, 2], normal: { x: 0, y: 0, z: -1 } },
  { id: "left", idx: [0, 4, 7, 3], normal: { x: -1, y: 0, z: 0 } },
  { id: "right", idx: [5, 1, 2, 6], normal: { x: 1, y: 0, z: 0 } },
  // y=+1 corners project to screen-top (SVG y is flipped), so that face is "top".
  { id: "top", idx: [7, 6, 2, 3], normal: { x: 0, y: 1, z: 0 } },
  { id: "bottom", idx: [4, 5, 1, 0], normal: { x: 0, y: -1, z: 0 } },
];

export interface ProjectOpts {
  /** Center of the SVG viewport. */
  cx: number;
  cy: number;
  /** Half-extent of the cube in SVG units (drawn cube ≈ 2·r before perspective). */
  r: number;
  /** Weak-perspective strength in units of `r` (larger = flatter; ~3-6 reads as 3D). */
  persp?: number;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

// Directional light (upper-front-right), normalized — drives per-face shading so
// top/front/side read as distinct planes instead of one flat fill.
const LIGHT = (() => {
  const v = { x: 0.32, y: 0.56, z: 0.76 };
  const m = Math.hypot(v.x, v.y, v.z);
  return { x: v.x / m, y: v.y / m, z: v.z / m };
})();

/**
 * Project the cube at the given orientation. Returns only the front-facing
 * faces (≤3), painter-sorted far→near so the SVG draws nearer faces on top.
 * Screen Y is flipped (SVG y grows downward). `shade` is a 0..1 lambert term
 * from {@link LIGHT} for clean directional face tones.
 */
export function projectCubeFaces(
  rx: number,
  ry: number,
  rz: number,
  opts: ProjectOpts,
): ProjectedFace[] {
  const { cx, cy, r } = opts;
  const persp = opts.persp ?? 4;
  const view = (v: Vec3) => rotate(v, rx, ry, rz);
  const rotated = CORNERS.map(view);
  const faces: ProjectedFace[] = [];
  for (const f of FACES) {
    const n = view(f.normal);
    if (n.z <= 1e-6) continue; // back-face cull: normal must point toward viewer
    const corners = f.idx.map((i) => rotated[i]!);
    const depth = corners.reduce((s, p) => s + p.z, 0) / 4;
    const points = corners
      .map((p) => {
        // Weak perspective: nearer corners (higher z) project slightly larger.
        const s = persp / (persp - p.z);
        return `${round(cx + p.x * r * s)},${round(cy - p.y * r * s)}`;
      })
      .join(" ");
    const lum = Math.max(0, n.x * LIGHT.x + n.y * LIGHT.y + n.z * LIGHT.z);
    faces.push({ id: f.id, points, shade: 0.3 + lum * 0.7, depth });
  }
  faces.sort((a, b) => a.depth - b.depth);
  return faces;
}

export interface ProjectedAxis {
  id: "x" | "y" | "z";
  /** Axis color (standard X=red, Y=green, Z=blue). */
  color: string;
  /** Tip position in SVG coords. */
  x2: number;
  y2: number;
  /** Whether the tip points toward the viewer (drawn in front of the cube). */
  front: boolean;
}

const AXES: { id: "x" | "y" | "z"; dir: Vec3; color: string }[] = [
  { id: "x", dir: { x: 1, y: 0, z: 0 }, color: "#ff6b81" },
  { id: "y", dir: { x: 0, y: 1, z: 0 }, color: "#5ff08a" },
  { id: "z", dir: { x: 0, y: 0, z: 1 }, color: "#62b6ff" },
];

/**
 * Project the 3 orientation axes (from the cube center) for an X/Y/Z gizmo.
 * Orthographic — thin lines don't need perspective. `front` lets the caller draw
 * away-facing axes behind the cube and toward-facing axes on top.
 */
export function projectAxes(
  rx: number,
  ry: number,
  rz: number,
  opts: ProjectOpts,
): ProjectedAxis[] {
  const { cx, cy, r } = opts;
  const len = r * 1.5;
  const view = (v: Vec3) => rotate(v, rx, ry, rz);
  return AXES.map((a) => {
    const p = view(a.dir);
    return {
      id: a.id,
      color: a.color,
      x2: round(cx + p.x * len),
      y2: round(cy - p.y * len),
      front: p.z >= -1e-6,
    };
  });
}

/** Wrap an angle to (-180, 180] so drag accumulation never runs away. */
export function wrapDeg(deg: number): number {
  let d = deg % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}
