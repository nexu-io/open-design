import { Issue } from "../types.js";
import { ISSUE_CODES } from "../errors.js";
import { LintContext } from "./naming.js";

/**
 * Scene integrity: can this scene actually be rendered and seen? A missing
 * camera is a hard error (the proof stage would auto-frame, but the agent
 * should own the shot); missing lights and off-camera objects are warnings.
 */
export function lintIntegrity(ctx: LintContext, issues: Issue[]): void {
  const census = ctx.census;
  if (!census) return;

  // Degraded imports: the runner detected a gap while loading a real
  // asset (missing .mtl, geometry-free file) and named it with the fix.
  for (const note of census.importNotes ?? []) {
    issues.push({
      code: ISSUE_CODES.IMPORT_DEGRADED,
      severity: "warning",
      message: note,
      hint: "repair the source file or its companions; the import itself was not modified",
    });
  }

  if (!census.camera.present) {
    issues.push({
      code: ISSUE_CODES.MISSING_CAMERA,
      severity: "error",
      message: "scene has no camera",
      hint: "add a camera and set it as the active scene camera",
    });
  }
  if (census.lightCount === 0) {
    issues.push({
      code: ISSUE_CODES.MISSING_LIGHTS,
      severity: "warning",
      message: "scene has no lights",
      hint: "add at least one light so materials are visible",
    });
  }
  for (const name of census.offCameraObjects) {
    issues.push({
      code: ISSUE_CODES.OFF_CAMERA,
      severity: "warning",
      message: `object '${name}' is outside the camera frustum`,
      hint: "move it into frame or hide it",
      target: name,
    });
  }
}