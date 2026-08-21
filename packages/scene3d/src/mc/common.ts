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
  if (tex?.filepath) return { key, copyFrom: tex.filepath };
  const base = mat?.principled.baseColor ?? [0.8, 0.8, 0.8];
  return { key, png: solidTexture(base) };
}

/** Metres → model pixels, rounded to the 1/16-pixel Minecraft allows so a
 *  grid-aligned box lands on integer pixels exactly. */
export function px(metres: number): number {
  return Number((metres * PX).toFixed(4));
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
