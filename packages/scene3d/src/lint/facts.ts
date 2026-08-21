/**
 * Derived facts — pure, deterministic statistics over the census.
 *
 * This is still MEASUREMENT, not judgment: a median, a share, a ratio is a
 * fact, computed in TS because it is arithmetic over what Blender already
 * measured. It exists because the SMART checks are RELATIVE — "this part owns
 * 40% of the scene's triangles", "this part is 30× the median size", "the
 * background is more detailed than the hero" — and no per-part threshold can
 * express a comparison across parts. The judge reads these; it never
 * recomputes them.
 */

import { Census } from "../types.js";
import type { ResolvedPartBudget } from "./budgets.js";

export interface DerivedFacts {
  /** Total scene triangles (tris where measured, else faces). */
  sceneTris: number;
  /** Triangles summed per prototype family (repeat clones aggregated). */
  trisByFamily: Map<string, number>;
  /** Each family's share of sceneTris, 0..1. */
  triShareByFamily: Map<string, number>;
  /** Each family's detail rank, when its role has one. */
  rankByFamily: Map<string, number>;
  /** Median of parts' max dimension (m). NaN when no measurable part. */
  medianMaxDim: number;
  /** Each part's max dimension as a ratio of the median. */
  sizeRatioByPart: Map<string, number>;
  /** Decoded VRAM (bytes) of the distinct textures each part's maps bind. */
  textureBytesByPart: Map<string, number>;
  /** Distinct textures across the whole scene (bytes) — each counted once. */
  totalTextureBytes: number;
}

/** RGBA8 decoded size of one texture. */
function textureBytes(width: number, height: number): number {
  return Math.max(0, width) * Math.max(0, height) * 4;
}

/** Max world-space dimension of a mesh, or undefined when unmeasured. */
function maxDimOf(mesh: Census["meshes"][number]): number | undefined {
  const size = mesh.spatial?.size;
  if (size && size.every((v) => Number.isFinite(v))) return Math.max(...size);
  return undefined;
}

function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

export function deriveFacts(
  census: Census,
  budgets: Map<string, ResolvedPartBudget>,
): DerivedFacts {
  const familyOf = (object: string): string => budgets.get(object)?.familyId ?? object;

  // ---- triangles per family + scene total ----
  const trisByFamily = new Map<string, number>();
  let sceneTris = 0;
  for (const mesh of census.meshes) {
    const t = mesh.tris ?? mesh.faces;
    sceneTris += t;
    const fam = familyOf(mesh.object);
    trisByFamily.set(fam, (trisByFamily.get(fam) ?? 0) + t);
  }
  const triShareByFamily = new Map<string, number>();
  for (const [fam, t] of trisByFamily) {
    triShareByFamily.set(fam, sceneTris > 0 ? t / sceneTris : 0);
  }

  // ---- rank per family (from the resolved budgets) ----
  const rankByFamily = new Map<string, number>();
  for (const b of budgets.values()) {
    if (b.rank !== undefined && !rankByFamily.has(b.familyId)) rankByFamily.set(b.familyId, b.rank);
  }

  // ---- size coherence ----
  const dims: number[] = [];
  const dimByPart = new Map<string, number>();
  for (const mesh of census.meshes) {
    const d = maxDimOf(mesh);
    if (d !== undefined && d > 0) {
      dims.push(d);
      dimByPart.set(mesh.object, d);
    }
  }
  const medianMaxDim = median(dims);
  const sizeRatioByPart = new Map<string, number>();
  if (Number.isFinite(medianMaxDim) && medianMaxDim > 0) {
    for (const [object, d] of dimByPart) sizeRatioByPart.set(object, d / medianMaxDim);
  }

  // ---- texture VRAM ----
  const bytesByTexture = new Map<string, number>();
  for (const tex of census.textures) bytesByTexture.set(tex.name, textureBytes(tex.width, tex.height));
  const texturesOfMaterial = new Map<string, string[]>();
  for (const mat of census.materials) texturesOfMaterial.set(mat.name, mat.textureNames ?? []);

  const textureBytesByPart = new Map<string, number>();
  const sceneTextures = new Set<string>();
  for (const mesh of census.meshes) {
    const bound = new Set<string>();
    for (const matName of mesh.materials ?? []) {
      for (const texName of texturesOfMaterial.get(matName) ?? []) {
        bound.add(texName);
        sceneTextures.add(texName);
      }
    }
    let sum = 0;
    for (const texName of bound) sum += bytesByTexture.get(texName) ?? 0;
    textureBytesByPart.set(mesh.object, sum);
  }
  let totalTextureBytes = 0;
  for (const texName of sceneTextures) totalTextureBytes += bytesByTexture.get(texName) ?? 0;

  return {
    sceneTris,
    trisByFamily,
    triShareByFamily,
    rankByFamily,
    medianMaxDim,
    sizeRatioByPart,
    textureBytesByPart,
    totalTextureBytes,
  };
}
