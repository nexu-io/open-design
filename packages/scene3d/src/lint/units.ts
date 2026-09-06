import { Issue } from "../types.js";
import { ISSUE_CODES } from "../errors.js";
import { LintContext } from "./naming.js";

/**
 * Units and transform discipline. The stage metadata (metersPerUnit,
 * upAxis) is read from the parsed USDA tree; Blender objects are always
 * internally 1:1 meters, so a mismatch between the contract and the stage
 * header means the scene will land wrong in a shared USD stage.
 */
/**
 * metersPerUnit is a ratio the USD importer round-trips through float32, so a
 * `0.01` contract meets a `0.009999999776...` stage. A strict `!==` reported
 * that float noise as a units mismatch. Relative epsilon with an absolute
 * floor: far tighter than any real unit change (1 vs 0.01 vs 0.0254), far
 * looser than float32 drift.
 */
function unitsClose(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-9 + 1e-6 * Math.abs(b);
}

export function lintUnits(ctx: LintContext, issues: Issue[]): void {
  const stage = ctx.primTree?.stage;
  if (stage) {
    if (
      stage.metersPerUnit !== undefined &&
      !unitsClose(stage.metersPerUnit, ctx.contract.metersPerUnit)
    ) {
      issues.push({
        code: ISSUE_CODES.UNITS_MISMATCH,
        severity: "error",
        message: `stage metersPerUnit ${stage.metersPerUnit} != contract ${ctx.contract.metersPerUnit}`,
        hint: "align the stage header with the project contract",
        detail: { actual: stage.metersPerUnit, expected: ctx.contract.metersPerUnit },
      });
    }
    if (stage.upAxis !== undefined && stage.upAxis !== ctx.contract.upAxis) {
      issues.push({
        code: ISSUE_CODES.UP_AXIS_MISMATCH,
        severity: "error",
        message: `stage upAxis ${stage.upAxis} != contract ${ctx.contract.upAxis}`,
        hint: "align the stage header with the project contract",
        detail: { actual: stage.upAxis, expected: ctx.contract.upAxis },
      });
    }
    /* UNAUTHORED metadata is not neutral: USD's spec fallbacks are
       metersPerUnit 0.01 (centimetres) and upAxis Y, and a consumer opens
       the stage with those regardless of what this project's contract
       says. A stage that authors neither used to pass this linter clean
       and then land 100x wrong in the consuming DCC — the mismatch was
       real, just written in silence instead of a number. Warning, not
       error: the stage is legal USD; the landing is what differs. */
    if (stage.metersPerUnit === undefined && !unitsClose(0.01, ctx.contract.metersPerUnit)) {
      issues.push({
        code: ISSUE_CODES.UNITS_UNDECLARED,
        severity: "warning",
        message: `the stage does not author metersPerUnit — USD consumers will assume 0.01 (centimetres), but the contract says ${ctx.contract.metersPerUnit}`,
        hint: "author metersPerUnit in the stage header so consumers agree with the contract",
        detail: { actual: 0.01, expected: ctx.contract.metersPerUnit, unauthored: true },
      });
    }
    if (stage.upAxis === undefined && ctx.contract.upAxis !== "Y") {
      issues.push({
        code: ISSUE_CODES.UP_AXIS_UNDECLARED,
        severity: "warning",
        message: `the stage does not author upAxis — USD consumers will assume Y, but the contract says ${ctx.contract.upAxis}`,
        hint: "author upAxis in the stage header so consumers agree with the contract",
        detail: { actual: "Y", expected: ctx.contract.upAxis, unauthored: true },
      });
    }
  }

  const census = ctx.census;
  if (!census) return;
  const geo = ctx.contract.geometry;
  for (const obj of census.objects) {
    const [x, y, z] = obj.scale;
    // Both branches below describe ONE defect — scale left unapplied on the
    // object — with one remedy, and they only differ in whether the factors
    // match. Applied scale reads as (1, 1, 1), so neither can fire on a mesh
    // whose transform IS applied. They therefore answer to the same knob: an
    // author who set `requireAppliedScale: false` has accepted the source's
    // transforms, and gating only the uniform branch meant a squashed rock in
    // an imported kit still demanded "apply scale before export" 104 times in
    // a project that had explicitly said not to ask.
    //
    // Negative scale keeps its own gate (`allowNegativeScale`) and its own
    // severity below: flipped winding is a different, worse problem than an
    // un-baked factor.
    if (geo.requireAppliedScale && (Math.abs(x - y) > 1e-6 || Math.abs(y - z) > 1e-6 || Math.abs(x - z) > 1e-6)) {
      issues.push({
        code: ISSUE_CODES.NON_UNIFORM_SCALE,
        severity: "warning",
        message: `object '${obj.name}' has non-uniform scale (${x}, ${y}, ${z})`,
        hint: "apply scale before export",
        target: obj.name,
        detail: { scale: obj.scale },
      });
    }
    // Negative scale is an error unless the contract says mirroring by
    // transform is deliberate: it flips face winding on import, so the
    // object lights inside-out in-engine while looking fine in Blender.
    if (!geo.allowNegativeScale && (x < 0 || y < 0 || z < 0)) {
      issues.push({
        code: ISSUE_CODES.NEGATIVE_SCALE,
        severity: "error",
        message: `object '${obj.name}' has negative scale (${x}, ${y}, ${z}) — normals flip on engine import`,
        hint: "apply the mirror to the mesh data instead of the transform, or set conventions.geometry.allowNegativeScale",
        target: obj.name,
        detail: { scale: obj.scale },
      });
    } else if (
      geo.requireAppliedScale &&
      obj.hasMeshData &&
      (Math.abs(x - 1) > 1e-4 || Math.abs(y - 1) > 1e-4 || Math.abs(z - 1) > 1e-4)
    ) {
      issues.push({
        code: ISSUE_CODES.UNAPPLIED_SCALE,
        severity: "warning",
        message: `object '${obj.name}' carries unapplied scale (${x}, ${y}, ${z})`,
        hint: "apply object scale before export — importers disagree about baking it",
        target: obj.name,
        detail: { scale: obj.scale },
      });
    }
  }
}