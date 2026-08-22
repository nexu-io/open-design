import { encodePng } from "../sheet/png.js";
import { CensusMaterial, CensusTexture } from "../types.js";

/**
 * Shared lowerings for the Minecraft exporters (Java block models and Bedrock
 * geometry). Both formats measure the same scene in pixels (one block = one
 * metre = 16 px) and need the same texture handling, so the frame map and the
 * texture synthesis live here once.
 */

/** Pixels per block — the Minecraft model unit. */
export const PX = 16;

export interface TextureDirective {
  /** The texture's key (file basename and, for Java, its `#var`). */
  key: string;
  /** Census filepath of a bound image to copy, when the material is textured. */
  copyFrom?: string;
  /** A synthesized solid-colour PNG, when the material is a flat colour. */
  png?: Uint8Array;
}

/** MC resource names are `[a-z0-9/._-]`; fold anything else to `_`. */
export function sanitizeKey(name: string): string {
  const k = name.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  return k.length >= 1 ? k : "tex";
}

/** Linear [0,1] → sRGB byte [0,255]. Minecraft textures are sRGB. */
export function srgb8(c: number): number {
  const x = Math.min(1, Math.max(0, c));
  const s = x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
  return Math.round(s * 255);
}

/** A 16×16 solid RGBA tile (row-major, opaque) from a LINEAR base colour,
 *  sRGB-encoded — the raw pixels, for composing an atlas or encoding alone. */
export function solidTile(linear: [number, number, number]): Uint8Array {
  const r = srgb8(linear[0]);
  const g = srgb8(linear[1]);
  const b = srgb8(linear[2]);
  const data = new Uint8Array(PX * PX * 4);
  for (let i = 0; i < PX * PX; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  return data;
}

/** A 16×16 solid PNG from a LINEAR base colour, sRGB-encoded, fully opaque.
 *  Deterministic bytes via encodePng. */
export function solidTexture(linear: [number, number, number]): Uint8Array {
  return encodePng({ width: PX, height: PX, data: solidTile(linear) });
}

/** A material's texture directive: copy its bound image if it has one, else
 *  synthesize a flat-colour tile so every face renders. */
export function textureDirective(
  key: string,
  mat: CensusMaterial | undefined,
  textureByName: Map<string, CensusTexture>,
): TextureDirective {
  const texName = mat?.textureNames?.[0];
  const tex = texName ? textureByName.get(texName) : undefined;
  // A texture the census could not find on disk is not a texture. Returning
  // its path anyway made the exporter emit a model.json referencing a file it
  // then declined to copy — a resource pack whose block renders as the game's
  // purple "missing texture". The flat-colour fallback already exists for
  // untextured materials; a broken reference is a worse answer than a colour.
  if (tex?.filepath && tex.fileMissing !== true) return { key, copyFrom: tex.filepath };
  const base = mat?.principled.baseColor ?? [0.8, 0.8, 0.8];
  return { key, png: solidTexture(base) };
}

/**
 * Metres → model pixels (1 block = 1 m = 16 px).
 *
 * Rounds to 4 decimal places, which is float-noise cleanup, NOT grid snapping:
 * it is ~600x finer than the 1/16-pixel resolution the formats accept. A
 * grid-aligned box lands on integer pixels here because it was already
 * grid-aligned, not because this made it so — the comment used to claim the
 * credit, which would mislead anyone reaching for this to fix an off-grid box.
 * That is W-970's job, and the author's.
 */
export function px(metres: number): number {
  return Number((metres * PX).toFixed(4));
}

/** A Blender world point in MC model space — the same frame map as
 *  {@link boxToMc}, for the single points (rotation origins, pivots) that are
 *  not corners of a box. */
export function pointToMc(p: readonly number[]): [number, number, number] {
  return [px(p[0]!), px(p[2]!), px(-p[1]!)];
}

/**
 * The MC rotation equivalent to a single-axis Blender rotation.
 *
 * Not a guess and not per-exporter folklore: the frame map (x,y,z)→(x,z,−y) is
 * a proper rotation, and conjugating a rotation by a rotation preserves the
 * angle while mapping the axis. That gives Blender X → MC X (+θ), Blender Z →
 * MC Y (+θ), Blender Y → MC Z (−θ). Both exporters read it from here so the
 * sign convention cannot drift between them.
 */
export function rotationToMc(
  axis: "x" | "y" | "z",
  deg: number,
): { axis: "x" | "y" | "z"; angle: number } {
  const angle = Number(deg.toFixed(4));
  if (axis === "x") return { axis: "x", angle };
  if (axis === "z") return { axis: "y", angle };
  return { axis: "z", angle: -angle };
}

/** Java's permitted element rotation angles (degrees) — a format constant. */
export const JAVA_LEGAL_ANGLES = [-45, -22.5, 0, 22.5, 45] as const;
/** Forgiven drift (deg) from a legal angle — float noise, not a real rotation. */
export const JAVA_ANGLE_TOLERANCE = 0.05;

/** The legal Java angle closest to `deg`. */
export function nearestLegalAngle(deg: number): number {
  let best: number = JAVA_LEGAL_ANGLES[0];
  for (const a of JAVA_LEGAL_ANGLES) {
    if (Math.abs(deg - a) < Math.abs(deg - best)) best = a;
  }
  return best;
}

/** The un-rotated element box of a recovered oriented box, in Blender world
 *  space. This is the frame the block-model format authors `from`/`to` in. */
export function elementBounds(
  center: readonly number[],
  localSize: readonly number[],
): [[number, number, number], [number, number, number]] {
  return [
    [center[0]! - localSize[0]! / 2, center[1]! - localSize[1]! / 2, center[2]! - localSize[2]! / 2],
    [center[0]! + localSize[0]! / 2, center[1]! + localSize[1]! / 2, center[2]! + localSize[2]! / 2],
  ];
}

/**
 * Map a Blender-space AABB to Minecraft from/to in pixels — the frame both
 * exporters share. Blender is Z-up right-handed; Minecraft is Y-up with
 * `(x, y, z) → (x, z, −y)`. The axis remap + sign flip reorders extents, so
 * min/max are recomputed after mapping; the result satisfies from ≤ to
 * componentwise, as both formats require (from = origin, to − from = size).
 */
export function boxToMc(
  min: [number, number, number],
  max: [number, number, number],
): [[number, number, number], [number, number, number]] {
  const xs = [min[0], max[0]];
  const ys = [min[2], max[2]]; // MC y from Blender z
  const zs = [-max[1], -min[1]]; // MC z from −Blender y (flip swaps ends)
  const from: [number, number, number] = [px(Math.min(...xs)), px(Math.min(...ys)), px(Math.min(...zs))];
  const to: [number, number, number] = [px(Math.max(...xs)), px(Math.max(...ys)), px(Math.max(...zs))];
  return [from, to];
}

/** The pixel dimensions of a material's bound texture, or the 16×16 default a
 *  synthesized flat-colour tile uses. */
export function textureSizePx(
  mat: CensusMaterial | undefined,
  textureByName: Map<string, CensusTexture>,
): { width: number; height: number } {
  const texName = mat?.textureNames?.[0];
  const tex = texName ? textureByName.get(texName) : undefined;
  if (tex && tex.width > 0 && tex.height > 0) return { width: tex.width, height: tex.height };
  return { width: PX, height: PX };
}
