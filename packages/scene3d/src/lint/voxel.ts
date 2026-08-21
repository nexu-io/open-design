import { Census, CensusMesh, CensusObject, Issue } from "../types.js";
import { ISSUE_CODES } from "../errors.js";
import { NormalizedContract } from "../contract.js";
import type { SolvedScene } from "../solve/types.js";

/**
 * Voxel / Minecraft format discipline.
 *
 * A modeller building for the vanilla model formats is not fighting art — they
 * are fighting a format that silently mangles or refuses anything it cannot
 * represent. These rules catch, deterministically and before the game does,
 * the specific ways a voxel model is *wrong*:
 *
 *  - **Off-grid vertices** (W-970). A vertex not on the pixel grid looks
 *    perfect in Blender and shimmers in-game — the most common MC-model bug.
 *  - **Not a single cuboid** (W-971). A vanilla Java element is a cuboid.
 *  - **Illegal rotation** (W-972). Java permits one rotation axis at a fixed
 *    angle set; Bedrock allows free per-cube angles (dialect-scoped).
 *  - **Out of element bounds** (W-973). Positioned outside the element space
 *    (vanilla Java: −1..2 blocks) the game refuses to load it — but only a
 *    thing that IS an element. A mesh larger than the whole element space is
 *    not an element at all; it is multi-block **structure** (I-970), and the
 *    element-format rules (cuboid/rotation/bounds) do not apply to it.
 *
 * Two emergent properties (fable-5 Mechanism 4):
 *  - **Family aggregation.** A repeat/scatter grid of N instances shares one
 *    identity (the base part's `from`), so it is judged and reported ONCE,
 *    carrying the instance count — never N warnings for one authored choice.
 *  - **Representability classes.** The element-space extent (a contract datum,
 *    `maxBlocks − minBlocks`) classifies every family: element-scale meshes get
 *    the format rules; a larger mesh is structure and is exempt from them.
 *
 * Inert unless the contract opts in (`target:"minecraft"` or a `minecraft`
 * block). It never opines on what to build — only on whether the game can load
 * and render it faithfully.
 */

/** Java's permitted element rotation angles (degrees) — a format constant. */
const JAVA_LEGAL_ANGLES = [-45, -22.5, 0, 22.5, 45];
/** Forgiven drift (deg) from a legal angle — float noise, not a real rotation. */
const ANGLE_TOLERANCE = 0.05;

export function lintVoxel(
  contract: NormalizedContract,
  census: Census | undefined,
  issues: Issue[],
  /** The solved scene, when authored from a spec — its `from` links let a
   *  repeat/scatter grid be judged once per family. Absent for imported meshes,
   *  where each mesh is its own family. */
  solved?: SolvedScene,
): void {
  const vx = contract.voxel;
  const mc = contract.minecraft;
  // Off-grid (W-970) is a GENERIC voxel concern (any engine). The cuboid /
  // rotation / element-bounds / structure rules below are Minecraft FORMAT
  // rules and fire only when the minecraft layer is on.
  if (!vx.enabled || !census) return;

  const grid = vx.gridSize > 0 ? vx.gridSize : 1 / 16;
  const worldByName = new Map(census.objects.map((o) => [o.name, o]));
  const elementExtent = mc.elementMaxBlocks - mc.elementMinBlocks;

  // A clone (repeat/scatter instance) is judged under its base part's identity.
  const familyOf = new Map<string, string>();
  if (solved) for (const p of solved.parts) familyOf.set(p.id, p.from ?? p.id);
  const familyId = (name: string) => familyOf.get(name) ?? name;

  const families = new Map<string, CensusMesh[]>();
  for (const mesh of census.meshes) {
    if (!mesh.voxel) continue;
    const fid = familyId(mesh.object);
    const list = families.get(fid);
    if (list) list.push(mesh);
    else families.set(fid, [mesh]);
  }

  for (const [fid, members] of families) {
    const n = members.length;

    /* ---- off-grid vertices (W-970): GENERIC voxel, worst across family - */
    let worstDev: { dev: number; object: string } | null = null;
    let offGridCount = 0;
    for (const m of members) {
      const dev = m.voxel!.gridDeviation;
      if (dev > vx.gridTolerance) offGridCount++;
      if (!worstDev || dev > worstDev.dev) worstDev = { dev, object: m.object };
    }
    if (worstDev && worstDev.dev > vx.gridTolerance) {
      const px = worstDev.dev / grid;
      const across = n > 1 ? ` (worst of ${offGridCount}/${n} instances)` : "";
      issues.push({
        code: ISSUE_CODES.VOXEL_OFF_GRID,
        severity: "warning",
        message: `'${fid}' has a vertex ${fmtPx(px)} off the ${fmtGrid(grid)} grid (${fmtMm(worstDev.dev)})${across} — it will shimmer in-engine`,
        hint: `snap vertices to the ${fmtGrid(grid)} grid, or widen conventions.voxel.grid.tolerance if this drift is intended`,
        target: fid,
        detail: { gridDeviation: worstDev.dev, tolerance: vx.gridTolerance, offGridPx: round(px, 3), instanceCount: n, offGridCount },
      });
    }

    // The remaining rules are Minecraft FORMAT concerns (element cuboid /
    // rotation / bounds). A generic voxel scene (target:"voxel") stops here —
    // it gets grid discipline, not Minecraft's element model.
    if (!mc.enabled) continue;

    /* ---- structure vs element (I-970) ----------------------------- */
    // A mesh larger than the entire element space cannot be an element by
    // translation OR by any placement — it is multi-block structure. The
    // element-format rules below do not apply; only grid alignment (above) did.
    const spanBlocks = familyMaxExtent(members, worldByName);
    if (spanBlocks !== null && spanBlocks > elementExtent + 1e-6) {
      issues.push({
        code: ISSUE_CODES.VOXEL_STRUCTURE_SCALE,
        severity: "info",
        message: `'${fid}' spans ${round(spanBlocks, 2)} blocks — beyond a single block-model element (the element space is ${elementExtent} blocks); treat it as a multi-block structure`,
        hint: "structure/terrain is fine as-is; split it into block-sized elements only if it must ship as one block model",
        target: fid,
        detail: { spanBlocks: round(spanBlocks, 3), elementExtent, instanceCount: n },
      });
      continue; // not an element — the element-format rules do not apply
    }

    /* ---- cuboid representability (W-971): any non-box member ------ */
    const notBox = members.find((m) => !m.voxel!.isBox);
    if (notBox) {
      issues.push({
        code: ISSUE_CODES.VOXEL_NOT_CUBOID,
        severity: "warning",
        message: `'${fid}' is not a single cuboid (${notBox.verts} verts, ${notBox.faces} faces) — a Java block-model element cannot express it`,
        hint:
          mc.dialect === "bedrock"
            ? "a Bedrock cube must still be a box; split this into cuboids, or opt into poly_mesh for this part"
            : "build the part from box elements, switch to conventions.minecraft.dialect \"bedrock\", or keep it as a mesh-loader asset",
        target: fid,
        detail: { isBox: false, verts: notBox.verts, faces: notBox.faces, dialect: mc.dialect, instanceCount: n },
      });
      continue; // a non-box has no meaningful rotation to judge
    }

    /* ---- rotation legality (W-972), Java only: worst across family - */
    if (mc.dialect === "java") {
      let worstRot: { deg: number; axis: string; nearest: number; off: number } | null = null;
      let multiAxis = false;
      for (const m of members) {
        const v = m.voxel!;
        if (v.rotationAxis !== null && v.rotationDeg !== null) {
          const nearest = nearestLegalAngle(v.rotationDeg);
          const off = Math.abs(v.rotationDeg - nearest);
          if (off > ANGLE_TOLERANCE && (!worstRot || off > worstRot.off)) {
            worstRot = { deg: v.rotationDeg, axis: v.rotationAxis, nearest, off };
          }
        } else if (!v.axisAligned) {
          multiAxis = true;
        }
      }
      if (worstRot) {
        issues.push({
          code: ISSUE_CODES.VOXEL_ILLEGAL_ROTATION,
          severity: "warning",
          message: `'${fid}' is rotated ${fmtDeg(worstRot.deg)} about ${worstRot.axis.toUpperCase()} — Java elements allow only ${fmtDeg(worstRot.nearest)} (nearest legal)`,
          hint: `rotate to ${fmtDeg(worstRot.nearest)}, or move to conventions.minecraft.dialect \"bedrock\" which permits free angles`,
          target: fid,
          detail: { rotationDeg: worstRot.deg, axis: worstRot.axis, nearestLegal: worstRot.nearest, instanceCount: n },
        });
      } else if (multiAxis) {
        issues.push({
          code: ISSUE_CODES.VOXEL_ILLEGAL_ROTATION,
          severity: "warning",
          message: `'${fid}' is rotated about more than one axis — a Java block-model element allows only one`,
          hint: "align the box to a single-axis rotation, or use conventions.minecraft.dialect \"bedrock\"",
          target: fid,
          detail: { multiAxis: true, instanceCount: n },
        });
      }
    }

    /* ---- element bounds (W-973): worst across family -------------- */
    let worstBound: { axis: string; value: number; over: number } | null = null;
    for (const m of members) {
      const world = worldByName.get(m.object);
      if (!world?.worldMin || !world?.worldMax) continue;
      const w = worstBoundExcursion(world.worldMin, world.worldMax, mc.elementMinBlocks, mc.elementMaxBlocks);
      if (w && (!worstBound || w.over > worstBound.over)) worstBound = w;
    }
    if (worstBound) {
      issues.push({
        code: ISSUE_CODES.VOXEL_OUT_OF_BOUNDS,
        severity: "warning",
        message: `'${fid}' reaches ${round(worstBound.value, 3)} blocks on ${worstBound.axis.toUpperCase()}, past the ${mc.elementMinBlocks}..${mc.elementMaxBlocks}-block element space — the game will refuse the model`,
        hint: `move it into the ${mc.elementMinBlocks}..${mc.elementMaxBlocks}-block element space`,
        target: fid,
        detail: { axis: worstBound.axis, value: worstBound.value, minBlocks: mc.elementMinBlocks, maxBlocks: mc.elementMaxBlocks, instanceCount: n },
      });
    }
  }
}

/** The largest world-space AABB extent (in blocks = metres) across a family's
 *  members, or null when no member has bounds. This is what decides whether a
 *  thing is an element (≤ element space) or structure (larger). */
function familyMaxExtent(members: CensusMesh[], worldByName: Map<string, CensusObject>): number | null {
  let max: number | null = null;
  for (const m of members) {
    const world = worldByName.get(m.object);
    if (!world?.worldMin || !world?.worldMax) continue;
    for (let i = 0; i < 3; i++) {
      const extent = world.worldMax[i]! - world.worldMin[i]!;
      if (max === null || extent > max) max = extent;
    }
  }
  return max;
}

/** The legal Java angle closest to `deg`. */
function nearestLegalAngle(deg: number): number {
  let best = JAVA_LEGAL_ANGLES[0]!;
  for (const a of JAVA_LEGAL_ANGLES) {
    if (Math.abs(deg - a) < Math.abs(deg - best)) best = a;
  }
  return best;
}

/** The single worst axis excursion past the element bounds (blocks), carrying
 *  its overrun for family-worst comparison, or null when the whole AABB fits. */
function worstBoundExcursion(
  min: number[],
  max: number[],
  minBlocks: number,
  maxBlocks: number,
): { axis: "x" | "y" | "z"; value: number; over: number } | null {
  const axes: Array<"x" | "y" | "z"> = ["x", "y", "z"];
  let worst: { axis: "x" | "y" | "z"; value: number; over: number } | null = null;
  for (let i = 0; i < 3; i++) {
    const lo = min[i]!;
    const hi = max[i]!;
    const underBy = minBlocks - lo;
    const overBy = hi - maxBlocks;
    if (underBy > 1e-6 && (worst === null || underBy > worst.over)) {
      worst = { axis: axes[i]!, value: round(lo, 4), over: underBy };
    }
    if (overBy > 1e-6 && (worst === null || overBy > worst.over)) {
      worst = { axis: axes[i]!, value: round(hi, 4), over: overBy };
    }
  }
  return worst;
}

function round(v: number, dp: number): number {
  return Number(v.toFixed(dp));
}
function fmtPx(px: number): string {
  return `${round(px, 2)}px`;
}
function fmtMm(m: number): string {
  return `${round(m * 1000, 2)}mm`;
}
function fmtDeg(deg: number): string {
  return `${round(deg, 2)}°`;
}
/** Describe the grid pitch the way a modeller thinks of it: "1/16-block". */
function fmtGrid(size: number): string {
  const inv = 1 / size;
  if (Number.isFinite(inv) && Math.abs(inv - Math.round(inv)) < 1e-6) {
    return `1/${Math.round(inv)}-block`;
  }
  return `${round(size, 5)}m`;
}
