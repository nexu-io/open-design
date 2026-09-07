import { Issue } from "../types.js";
import { ISSUE_CODES } from "../errors.js";
import { LintContext } from "./naming.js";
import { AUTOFIT_DISTANCE } from "../solve/types.js";

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

  // Material channels this Blender had no socket for. The author wrote a
  // capability, the compiler knew it, and the runtime that ran did not carry
  // it — so the material shipped without it. Reported per channel because
  // "some materials degraded" is not something anyone can act on.
  const unbound = census.unboundChannels ?? [];
  if (unbound.length > 0) {
    issues.push({
      code: ISSUE_CODES.MASTER_MATERIAL_CAPABILITY,
      severity: "warning",
      message: `this Blender has no socket for ${unbound.join(", ")} — those channels were authored and did not reach the build`,
      hint: "the socket was renamed or removed in this Blender version; upgrade the runtime, or drop the channel",
      detail: { unbound },
    });
  }

  /* A clip longer than the project's declared budget. Measured against the
     built frame range, not the request: the author is not the authority on
     how long the animation turned out. */
  const anim = census.animation;
  const maxFrames = ctx.contract.maxFrames;
  if (anim && maxFrames > 0) {
    const built = anim.frameEnd - anim.frameStart + 1;
    if (built > maxFrames) {
      /* Duration is the SPAN, not the frame count: the range ends one past the
         last pose so a loop does not repeat it, which is the same convention
         the clip's own duration uses everywhere else. Dividing the inclusive
         count by fps reports a clip one frame longer than the compiler
         elsewhere says it is. */
      const seconds = anim.fps > 0 ? (anim.frameEnd - anim.frameStart) / anim.fps : null;
      issues.push({
        code: ISSUE_CODES.ANIMATION_TOO_LONG,
        severity: "warning",
        message:
          `the built animation is ${built} frames${seconds !== null ? ` (${Math.round(seconds * 100) / 100}s at ${anim.fps}fps)` : ""},` +
          ` past the ${maxFrames} this project allows`,
        hint: "shorten the motion, or raise conventions.animation.maxFrames",
        detail: { frames: built, maxFrames, fps: anim.fps },
      });
    }
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
  /* A scene with no light OBJECT is not necessarily a dark scene: an emissive
     surface is a lamp, and lighting a piece by its own lanterns, signage or
     fire is a deliberate shot — the one this rule used to call a mistake while
     the frames came back lit. So the rule asks what actually emits, not what
     was placed. A scene with neither is still the real finding. */
  const emitters = (census.materials ?? []).filter((m) => {
    const p = m.principled;
    // Bound to something, or it lights nothing: an emissive material sitting
    // in the file with no object wearing it is not a lamp, and counting it
    // would let a genuinely dark scene pass as lit.
    if ((m.usedByObjectCount ?? 0) <= 0) return false;
    return (p?.emissionStrength ?? 0) > 0 && (p?.emission ?? []).some((c) => c > 0);
  });
  if (census.lightCount === 0 && emitters.length === 0) {
    issues.push({
      code: ISSUE_CODES.MISSING_LIGHTS,
      severity: "warning",
      message: "scene has no lights and no emissive materials",
      hint: "add a light, or give a material emission — an emissive surface lights what is near it once the key is down (light.key)",
    });
  }
  for (const fact of census.offCameraObjects) {
    issues.push({
      code: ISSUE_CODES.OFF_CAMERA,
      severity: "warning",
      message: `object '${fact.name}' is entirely ${fact.beyond} — every corner of its box projects ${fmtNdcSpan(fact)}`,
      // The reflex fix ("move the part") is often wrong: the part may be
      // exactly where the author wants it and the FRAMING is what lost it —
      // a wider subject needs the camera pulled back or the lens widened,
      // not geometry dragged toward a shot. Name both levers, WITH the
      // number: distance is in bounding radii, so the fit-everything value
      // is the same constant for every scene, and "pull it back" without
      // it cost a field agent five compiles of guessing how far.
      hint: `move it into frame, or widen the framing: raise camera.distance toward ${AUTOFIT_DISTANCE.toFixed(2)} (scene.json camera.distance is a MULTIPLE of the scene's bounding radius, not metres; ${AUTOFIT_DISTANCE.toFixed(2)} radii fits everything, and omitting the field uses it) or reduce the lens`,
      target: fact.name,
      detail: { beyond: fact.beyond, ndcMin: fact.ndcMin, ndcMax: fact.ndcMax },
    });
  }
}

/** The measured evidence line for an off-camera verdict: where the box's
 *  projection sits relative to the 0..1 frame. */
function fmtNdcSpan(fact: { ndcMin: [number, number]; ndcMax: [number, number] }): string {
  const r = (v: number) => Number(v.toFixed(3));
  return (
    `to x ${r(fact.ndcMin[0])}..${r(fact.ndcMax[0])}, y ${r(fact.ndcMin[1])}..${r(fact.ndcMax[1])} ` +
    `(the frame is 0..1)`
  );
}