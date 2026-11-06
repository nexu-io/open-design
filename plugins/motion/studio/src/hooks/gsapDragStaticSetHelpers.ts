import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import type { RuntimeTweenChange, SetPatchProps } from "./gsapRuntimePatch";
import { isInstantHold, tweenTargetsElement } from "./gsapShared";

/** The shape of an `update-property` mutation a static-set nudge POSTs. */
interface UpdatePropertyMutation {
  type: "update-property";
  animationId: string;
  property: string;
  value: number;
}

/**
 * Build the `instantPatch` for a value-only `tl.set` from the SAME
 * `update-property` mutation(s) that are POSTed — so the patch can never carry a
 * value the source write didn't (one source of truth). Each mutation contributes
 * its `{property: value}` channel to the patch's props.
 */
export function setPatchFromUpdateProperty(
  selector: string,
  mutation: UpdatePropertyMutation,
  global = false,
): { selector: string; change: RuntimeTweenChange } {
  const props: SetPatchProps = { [mutation.property as keyof SetPatchProps]: mutation.value };
  // An off-timeline `gsap.set` has no runtime tween to patch — apply it to the
  // element directly. An on-timeline `tl.set` mutates its tween (so a re-seek keeps it).
  return { selector, change: { kind: global ? "global-set" : "set", props } };
}

/**
 * Find the studio position-hold `set` for a selector — a `tl.set("#el",{x,y})`
 * with no duration. This is what a static-element nudge writes/updates.
 */
function findPositionSetAnimation(
  animations: GsapAnimation[],
  selector: string,
  element?: Element | null,
): GsapAnimation | null {
  return (
    animations.find(
      (a) =>
        a.method === "set" &&
        tweenTargetsElement(a.targetSelector, selector, element) &&
        ("x" in a.properties || "y" in a.properties),
    ) ?? null
  );
}

/**
 * Find the EXISTING static position HOLD to update for a static-hold drag. Not
 * just a `set`: a degenerate `tl.to("#el",{duration:0,x,y})` (what
 * remove-all-keyframes leaves behind) is a held position too, and the next drag
 * must UPDATE it in place rather than append a second `gsap.set` that fights it
 * (the duplicate-position-write bug). Only zero-duration holds qualify — a
 * live-duration tween and a duration-zero `from` are NOT static holds (and in
 * the static path they're a
 * stale/phantom parse: re-committing it would resurrect a just-deleted tween).
 * A keyframed zero-duration `to` is ALSO a static hold (a drag-path corruption
 * artifact) and must be recognized so the static commit normalizes it.
 * Prefers a `set` (the canonical static channel) when both forms exist.
 */
export function findExistingPositionWrite(
  animations: GsapAnimation[],
  selector: string,
  element?: Element | null,
): GsapAnimation | null {
  const set = findPositionSetAnimation(animations, selector, element);
  if (set) return set;
  return (
    animations.find(
      (a) =>
        tweenTargetsElement(a.targetSelector, selector, element) &&
        a.propertyGroup === "position" &&
        isInstantHold(a),
    ) ?? null
  );
}

export function findRotationSetAnimation(
  animations: GsapAnimation[],
  selector: string,
  element?: Element | null,
): GsapAnimation | null {
  return (
    animations.find(
      (a) =>
        isInstantHold(a) &&
        tweenTargetsElement(a.targetSelector, selector, element) &&
        "rotation" in a.properties,
    ) ?? null
  );
}

export function findSizeSetAnimation(
  animations: GsapAnimation[],
  selector: string,
  element?: Element | null,
): GsapAnimation | null {
  return (
    animations.find(
      (a) =>
        isInstantHold(a) &&
        tweenTargetsElement(a.targetSelector, selector, element) &&
        ("width" in a.properties || "height" in a.properties),
    ) ?? null
  );
}
