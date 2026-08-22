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
import { triangleTotals } from "./triangles.js";
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
  /** Worst triangle aspect ratio measured for each part's mesh. */
  aspectRatioByPart: Map<string, number>;
  /** Mean texel density (px/m) of each textured part's mesh. */
  texelDensityByPart: Map<string, number>;
  /** Robust z-score of each part's SIZE within the scene's own size
   *  distribution (log-scale, median + MAD). A part many robust deviations out
   *  is a likely unit slip — a distribution-relative outlier, no fixed ratio. */
  sizeOutlierZByPart: Map<string, number>;
  /** Robust z-score of each part's TRIANGLE DENSITY (tris/m²) within the
   *  scene's distribution — the same statistic over a different scalar. */
  triDensityOutlierZByPart: Map<string, number>;
}

/**
 * Robust z-score of each value within its own distribution, computed on a LOG
 * scale (sizes and densities are multiplicative, so a log makes "10× out" and
 * "1/10× out" symmetric). Uses the median and the Median Absolute Deviation —
 * `|log v − median| / (1.4826·MAD)` — which, unlike mean/stddev, does not let
 * the very outlier we are hunting inflate the spread and hide itself.
 *
 * Degenerates honestly: fewer than three measurable values ⇒ no distribution,
 * empty map (a two-part scene has no "outlier"). When the MAD is zero — a
 * majority of parts share an identical size (repeat clones), which would make
 * every non-identical part read as Infinity — Iglewicz–Hoaglin's own fallback
 * kicks in: the MEAN absolute deviation (scale 1.2533) measures the spread the
 * degenerate median cannot, so a merely-different part scores modestly and only
 * a true outlier crosses the cutoff. All values identical ⇒ every z is 0.
 */
function robustZ(values: Map<string, number>): Map<string, number> {
  const out = new Map<string, number>();
  const logs: number[] = [];
  for (const v of values.values()) if (v > 0 && Number.isFinite(v)) logs.push(Math.log(v));
  if (logs.length < 3) return out;
  const med = median(logs);
  const devs = logs.map((l) => Math.abs(l - med));
  const mad = median(devs);
  const meanAd = devs.reduce((a, b) => a + b, 0) / devs.length;
  // 1/0.6745 for MAD, sqrt(pi/2) for meanAD — the standard σ-consistent scales.
  const scale = mad > 0 ? 1.4826 * mad : meanAd > 0 ? 1.253314 * meanAd : 0;
  if (scale === 0) return out; // every value identical: no outliers
  for (const [key, v] of values) {
    if (!(v > 0) || !Number.isFinite(v)) continue;
    out.set(key, Math.abs(Math.log(v) - med) / scale);
  }
  return out;
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
  // Shared with the budget rule and the claims adjudicator (lint/triangles.ts):
  // three copies of this had drifted into three different postures about a
  // missing count.
  const triangles = triangleTotals(census);
  const trisByFamily = new Map<string, number>();
  const sceneTris = triangles.total;
  for (const mesh of census.meshes) {
    const t = triangles.byObject.get(mesh.object) ?? 0;
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

  // ---- sliver / aspect ratio + texel density (indexed from the census) ----
  const aspectRatioByPart = new Map<string, number>();
  const texelDensityByPart = new Map<string, number>();
  const triDensityByPart = new Map<string, number>();
  for (const m of census.meshes) {
    if (typeof m.worstAspectRatio === "number") aspectRatioByPart.set(m.object, m.worstAspectRatio);
    const mean = m.uv?.texelDensity?.mean;
    if (typeof mean === "number") texelDensityByPart.set(m.object, mean);
    if (typeof m.triDensity === "number" && m.triDensity > 0) triDensityByPart.set(m.object, m.triDensity);
  }

  // ---- distribution-relative outliers (unit slips, LOD absurdity) ----
  const sizeOutlierZByPart = robustZ(dimByPart);
  const triDensityOutlierZByPart = robustZ(triDensityByPart);

  return {
    sceneTris,
    trisByFamily,
    triShareByFamily,
    rankByFamily,
    medianMaxDim,
    sizeRatioByPart,
    textureBytesByPart,
    totalTextureBytes,
    aspectRatioByPart,
    texelDensityByPart,
    sizeOutlierZByPart,
    triDensityOutlierZByPart,
  };
}
