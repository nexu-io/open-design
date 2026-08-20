import { Issue } from "../types.js";
import { ISSUE_CODES } from "../errors.js";
import { LintContext } from "./naming.js";

/**
 * Units and transform discipline. The stage metadata (metersPerUnit,
 * upAxis) is read from the parsed USDA tree; Blender objects are always
 * internally 1:1 meters, so a mismatch between the contract and the stage
 * header means the scene will land wrong in a shared USD stage.
 */
export function lintUnits(ctx: LintContext, issues: Issue[]): void {
  const stage = ctx.primTree?.stage;
  if (stage) {
    if (stage.metersPerUnit !== undefined && stage.metersPerUnit !== ctx.contract.metersPerUnit) {
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
  }

  const census = ctx.census;
  if (!census) return;
  const geo = ctx.contract.geometry;
  for (const obj of census.objects) {
    const [x, y, z] = obj.scale;
    if (Math.abs(x - y) > 1e-6 || Math.abs(y - z) > 1e-6 || Math.abs(x - z) > 1e-6) {
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