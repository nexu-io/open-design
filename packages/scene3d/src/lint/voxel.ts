import { Census, Issue } from "../types.js";
import { ISSUE_CODES } from "../errors.js";
import { NormalizedContract } from "../contract.js";

/**
 * Voxel / Minecraft format discipline.
 *
 * A modeller building for the vanilla model formats is not fighting art — they
 * are fighting a format that silently mangles or refuses anything it cannot
 * represent. These rules catch, deterministically and before the game does,
 * the specific ways a voxel model is *wrong*:
 *
 *  - **Off-grid vertices** (W-970). A vertex that does not land on the pixel
 *    grid looks perfect in Blender and shimmers in-game. The single most
 *    common real-world Minecraft-model bug.
 *  - **Not a single cuboid** (W-971). A vanilla Java block model is built from
 *    `element` cuboids; a subdivided, bevelled, or arbitrary mesh cannot be
 *    expressed as one. (The exporter hard-refuses the same condition — the
 *    linter only warns so iteration is not blocked.)
 *  - **Illegal rotation** (W-972). Java permits exactly one rotation axis at
 *    one of {−45, −22.5, 0, 22.5, 45}°; anything else the game clamps or drops.
 *    Bedrock allows free per-cube angles, so the rule is dialect-scoped.
 *  - **Out of element bounds** (W-973). A model reaching past the format's
 *    element space (vanilla Java: −1..2 blocks) the game refuses to load.
 *
 * Every threshold is contract data (grid size, tolerance, legal angles are a
 * format constant, element bounds), every fact is measured in Blender (census
 * `voxel`), and the whole module is inert unless the contract opts in
 * (`target:"minecraft"` or a `minecraft` block). It never opines on what to
 * build — only on whether the game can load and render it faithfully.
 */

/** Java's permitted element rotation angles (degrees). A format constant, not
 *  a tunable: these are the only values the vanilla loader accepts. */
const JAVA_LEGAL_ANGLES = [-45, -22.5, 0, 22.5, 45];
/** Forgiven drift (deg) from a legal angle — float noise from the round-trip,
 *  not a real illegal rotation. */
const ANGLE_TOLERANCE = 0.05;

export function lintVoxel(
  contract: NormalizedContract,
  census: Census | undefined,
  issues: Issue[],
): void {
  const mc = contract.minecraft;
  if (!mc.enabled || !census) return;

  const grid = mc.gridSize > 0 ? mc.gridSize : 1 / 16;
  const worldByName = new Map(census.objects.map((o) => [o.name, o]));

  for (const mesh of census.meshes) {
    const v = mesh.voxel;
    if (!v) continue;

    /* ---- off-grid vertices (W-970) -------------------------------- */
    if (v.gridDeviation > mc.gridTolerance) {
      const px = v.gridDeviation / grid;
      issues.push({
        code: ISSUE_CODES.VOXEL_OFF_GRID,
        severity: "warning",
        message: `'${mesh.object}' has a vertex ${fmtPx(px)} off the ${fmtGrid(grid)} grid (${fmtMm(v.gridDeviation)}) — it will shimmer in-game`,
        hint: `snap vertices to the ${fmtGrid(grid)} grid, or widen conventions.minecraft.grid.tolerance if this drift is intended`,
        target: mesh.object,
        detail: { gridDeviation: v.gridDeviation, tolerance: mc.gridTolerance, offGridPx: round(px, 3) },
      });
    }

    /* ---- cuboid representability (W-971) -------------------------- */
    if (!v.isBox) {
      issues.push({
        code: ISSUE_CODES.VOXEL_NOT_CUBOID,
        severity: "warning",
        message: `'${mesh.object}' is not a single cuboid (${mesh.verts} verts, ${mesh.faces} faces) — a Java block-model element cannot express it`,
        hint:
          mc.dialect === "bedrock"
            ? "a Bedrock cube must still be a box; split this into cuboids, or opt into poly_mesh for this part"
            : "build the part from box elements, switch to conventions.minecraft.dialect \"bedrock\", or keep it as a mesh-loader asset",
        target: mesh.object,
        detail: { isBox: false, verts: mesh.verts, faces: mesh.faces, dialect: mc.dialect },
      });
      continue; // a non-box has no meaningful rotation to judge
    }

    /* ---- rotation legality (W-972), Java only --------------------- */
    if (mc.dialect === "java") {
      if (v.rotationAxis !== null && v.rotationDeg !== null) {
        // A recovered single-axis rotation: legal only at a fixed set of angles.
        const nearest = nearestLegalAngle(v.rotationDeg);
        if (Math.abs(v.rotationDeg - nearest) > ANGLE_TOLERANCE) {
          issues.push({
            code: ISSUE_CODES.VOXEL_ILLEGAL_ROTATION,
            severity: "warning",
            message: `'${mesh.object}' is rotated ${fmtDeg(v.rotationDeg)} about ${v.rotationAxis.toUpperCase()} — Java elements allow only ${fmtDeg(nearest)} (nearest legal)`,
            hint: `rotate to ${fmtDeg(nearest)}, or move to conventions.minecraft.dialect \"bedrock\" which permits free angles`,
            target: mesh.object,
            detail: { rotationDeg: v.rotationDeg, axis: v.rotationAxis, nearestLegal: nearest },
          });
        }
      } else if (!v.axisAligned) {
        // A box that is neither axis-aligned nor single-axis rotated is spun
        // about more than one axis — a Java element has one rotation, period.
        issues.push({
          code: ISSUE_CODES.VOXEL_ILLEGAL_ROTATION,
          severity: "warning",
          message: `'${mesh.object}' is rotated about more than one axis — a Java block-model element allows only one`,
          hint: `align the box to a single-axis rotation, or use conventions.minecraft.dialect \"bedrock\"`,
          target: mesh.object,
          detail: { multiAxis: true },
        });
      }
    }

    /* ---- element bounds (W-973) ----------------------------------- */
    const world = worldByName.get(mesh.object);
    if (world?.worldMin && world?.worldMax) {
      const worst = worstBoundExcursion(world.worldMin, world.worldMax, mc.elementMinBlocks, mc.elementMaxBlocks);
      if (worst) {
        issues.push({
          code: ISSUE_CODES.VOXEL_OUT_OF_BOUNDS,
          severity: "warning",
          message: `'${mesh.object}' reaches ${round(worst.value, 3)} blocks on ${worst.axis.toUpperCase()}, past the ${mc.elementMinBlocks}..${mc.elementMaxBlocks}-block element space — the game will refuse the model`,
          hint: `keep every element within ${mc.elementMinBlocks}..${mc.elementMaxBlocks} blocks, or split the model across multiple parts`,
          target: mesh.object,
          detail: { axis: worst.axis, value: worst.value, minBlocks: mc.elementMinBlocks, maxBlocks: mc.elementMaxBlocks },
        });
      }
    }
  }
}

/** The legal Java angle closest to `deg`. */
function nearestLegalAngle(deg: number): number {
  let best = JAVA_LEGAL_ANGLES[0]!;
  for (const a of JAVA_LEGAL_ANGLES) {
    if (Math.abs(deg - a) < Math.abs(deg - best)) best = a;
  }
  return best;
}

/** The single worst axis excursion past the element bounds (blocks), or null
 *  when the whole AABB fits. Both min/max sides are checked on all three axes;
 *  `min`/`max` are Blender-space AABB corners but the ±block bound is symmetric
 *  across axes, so the up-axis convention does not matter here. */
function worstBoundExcursion(
  min: number[],
  max: number[],
  minBlocks: number,
  maxBlocks: number,
): { axis: "x" | "y" | "z"; value: number } | null {
  const axes: Array<"x" | "y" | "z"> = ["x", "y", "z"];
  let worst: { axis: "x" | "y" | "z"; value: number; over: number } | null = null;
  for (let i = 0; i < 3; i++) {
    const lo = min[i]!;
    const hi = max[i]!;
    const underBy = minBlocks - lo; // >0 when the low corner sinks past the floor
    const overBy = hi - maxBlocks; // >0 when the high corner reaches past the cap
    if (underBy > 1e-6 && (worst === null || underBy > worst.over)) {
      worst = { axis: axes[i]!, value: round(lo, 4), over: underBy };
    }
    if (overBy > 1e-6 && (worst === null || overBy > worst.over)) {
      worst = { axis: axes[i]!, value: round(hi, 4), over: overBy };
    }
  }
  return worst ? { axis: worst.axis, value: worst.value } : null;
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
