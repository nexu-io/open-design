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

  // Viewer edits that did not survive the replay. Same code as an unreadable
  // tweaks.json (S3D-W-208): from the author's side both are "the edit I made
  // is not in the build", and the message says which half failed.
  for (const note of census.tweakNotes ?? []) {
    issues.push({
      code: ISSUE_CODES.TWEAKS_IGNORED,
      severity: "warning",
      message: `tweaks.json: ${note}`,
      hint: "re-apply the edit in the viewer, or delete tweaks.json to compile the authored scene",
      file: "tweaks.json",
    });
  }

  // What the GPU oracle could NOT see on the machine that baked. E-804
  // promises a kernel producing non-finite pixels is caught, and that promise
  // is only as good as the readback — some drivers flush NaN to zero on write,
  // and the scan then sees a clean image. A guarantee that silently varies by
  // machine is worse than one that admits its reach.
  for (const note of census.shaderNotes ?? []) {
    issues.push({
      code: ISSUE_CODES.SHADER_ORACLE_UNCHECKED,
      severity: "warning",
      message: note,
      hint: "bake on a machine whose driver preserves non-finite floats to get the full guarantee",
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