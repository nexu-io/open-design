import { editabilityForProvenance, type GsapAnimation } from "@hyperframes/core/gsap-parser";

export type GsapEditBlockReason =
  | "no-selector"
  | "unroll-required"
  | "source-uneditable"
  | "keyframes-uneditable"
  | "mixed-files";

/**
 * Which of the nine situations produced a block. The user-facing `reason` stays
 * coarse — three messages — but "source-uneditable" alone covers nine distinct
 * causes, and `edit_blocked` telemetry could not tell them apart. That matters
 * because the copy ("This animation is computed at runtime") is only literally
 * true for `provenance-runtime-dynamic`; the others are parser or source-match
 * limits, where the animation may well be plain authored source.
 *
 * Telemetry, plus the sharper message a few details get (GSAP_EDIT_DETAIL_COPY).
 */
export type GsapEditBlockDetail =
  | "provenance-runtime-dynamic"
  | "unresolved-keyframes"
  | "unresolved-selector"
  | "geometry-unresolved-source"
  | "live-position-no-source-tween"
  | "no-position-tween"
  | "live-rotation-no-source-tween"
  | "live-resize-no-source-tween"
  | "zero-duration-tween"
  | PlayheadEditRefusal;

/** Why an edit at the playhead could not be written as keyframes of the file's tween. */
export type PlayheadEditRefusal =
  | "eased-keyframes"
  | "simple-array-keyframes"
  | "array-step-delay"
  | "array-step-callback"
  | "array-step-config"
  | "array-step-computed"
  | "array-step-relative"
  | "array-step-random"
  | "unknown-ease"
  | "implicit-end-unknown"
  | "not-a-tween"
  | "no-timing"
  | "shared-tween";

export type GsapEditOutcome =
  | {
      status: "persisted";
      /**
       * Whether this edit already accounted for where the gesture left the
       * element, so the caller must not persist the drag offset on top.
       *
       * The scale route needs it: a committed scale renders around the element
       * centre rather than the dragged corner, so it measures the difference
       * and writes the position itself. Every other route moves nothing the
       * caller has not already been told about, and the caller owns the offset.
       *
       * It has to be reported rather than inferred. The caller used to guess
       * from "does this element have a scale-group tween", which is true for an
       * element whose scale is an instant hold — but that resize commits
       * width/height, not scale, so the guess withheld an offset nobody wrote
       * and the element snapped back to its authored position on every drag.
       */
      ownsDragOffset?: boolean;
    }
  | { status: "blocked"; reason: GsapEditBlockReason; detail?: GsapEditBlockDetail }
  | { status: "element-offset" }
  | { status: "element-size" };

export const GSAP_EDIT_BLOCK_COPY: Record<GsapEditBlockReason, string> = {
  "no-selector": "This layer needs a stable selector before Studio can save the edit.",
  "unroll-required":
    "This motion comes from a helper or loop. Choose Unroll to edit it explicitly.",
  "source-uneditable": "This animation is computed at runtime. Edit the animation in the Code tab.",
  "keyframes-uneditable":
    "Studio can't add this edit to the animation's keyframes. Edit this animation in the Code tab.",
  "mixed-files":
    "These layers are animated in different files. Move each file's layers separately.",
};

const STEP_LIST = "This animation's keyframes have a step";
const IN_CODE = "Edit them in the Code tab.";
/** A refusal a person can act on more precisely than its reason's message: what blocks it, then what to do. */
const GSAP_EDIT_DETAIL_COPY: Partial<Record<GsapEditBlockDetail, string>> = {
  "array-step-delay": `${STEP_LIST} with its own delay, which Studio can't keep while it edits them. ${IN_CODE}`,
  "array-step-callback": `${STEP_LIST} that runs code as it plays (like onComplete), which an edit would run again. ${IN_CODE}`,
  "array-step-config": `${STEP_LIST} with its own tween setting (like repeat or stagger), which Studio can't keep while it edits them. ${IN_CODE}`,
  "array-step-computed": `${STEP_LIST} whose value comes from code, which Studio can't keep while it edits them. ${IN_CODE}`,
  "array-step-relative": `${STEP_LIST} with a relative value (like "+=40"), which an edit would apply again. ${IN_CODE}`,
  "array-step-random": `${STEP_LIST} with a random() value, which an edit would roll again. ${IN_CODE}`,
};

export function gsapEditBlockMessage(
  reason: GsapEditBlockReason,
  detail?: GsapEditBlockDetail,
): string {
  return (detail && GSAP_EDIT_DETAIL_COPY[detail]) ?? GSAP_EDIT_BLOCK_COPY[reason];
}

export class GsapEditBlockedError extends Error {
  constructor(
    readonly reason: GsapEditBlockReason,
    readonly detail?: GsapEditBlockDetail,
  ) {
    super(gsapEditBlockMessage(reason, detail));
    this.name = "GsapEditBlockedError";
  }
}

export function assertGsapEditPersisted(outcome: GsapEditOutcome): void {
  if (outcome.status === "blocked") throw new GsapEditBlockedError(outcome.reason, outcome.detail);
}

/** A move only a shared tween positions is saved on the element itself; a blocked one throws. */
export async function saveMove(outcome: GsapEditOutcome, saveOnElement: () => Promise<void>) {
  if (outcome.status === "element-offset") return saveOnElement();
  assertGsapEditPersisted(outcome);
}

function assertGsapAnimationDirectlyEditable(animation: GsapAnimation): void {
  const editability = editabilityForProvenance(animation.provenance);
  if (editability === "unroll") throw new GsapEditBlockedError("unroll-required");
  // Same message for all three, but they are different problems: only the first
  // is genuinely a runtime-computed value.
  if (editability === "source") {
    throw new GsapEditBlockedError("source-uneditable", "provenance-runtime-dynamic");
  }
  if (animation.hasUnresolvedKeyframes) {
    throw new GsapEditBlockedError("source-uneditable", "unresolved-keyframes");
  }
  if (animation.hasUnresolvedSelector) {
    throw new GsapEditBlockedError("source-uneditable", "unresolved-selector");
  }
}

export function isGsapEditBlockedError(error: unknown): error is GsapEditBlockedError {
  return error instanceof GsapEditBlockedError;
}

export function animationWritesAnyProperty(
  animation: GsapAnimation,
  properties: ReadonlySet<string>,
): boolean {
  return (
    Object.keys(animation.properties ?? {}).some((property) => properties.has(property)) ||
    Object.keys(animation.fromProperties ?? {}).some((property) => properties.has(property)) ||
    !!animation.keyframes?.keyframes.some((keyframe) =>
      Object.keys(keyframe.properties).some((property) => properties.has(property)),
    )
  );
}

/** Fail-closed ownership check shared by drag, resize, rotate, and inspector edits. */
export function directEditOutcomeForProperties(
  animations: GsapAnimation[],
  properties: ReadonlySet<string>,
): GsapEditOutcome {
  try {
    for (const animation of animations) {
      if (animationWritesAnyProperty(animation, properties)) {
        assertGsapAnimationDirectlyEditable(animation);
      }
    }
    return { status: "persisted" };
  } catch (error) {
    if (isGsapEditBlockedError(error))
      return { status: "blocked", reason: error.reason, detail: error.detail };
    throw error;
  }
}
