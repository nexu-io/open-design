import type { GsapAnimation, PropertyGroupName } from "@hyperframes/core/gsap-parser";
import type { DomEditSelection } from "../components/editor/domEditingTypes";
import { hasNonHoldTweenForElement } from "./gsapRuntimeKeyframes";
import { selectorFromSelection } from "./gsapShared";
import {
  animationWritesAnyProperty,
  directEditOutcomeForProperties,
  type GsapEditOutcome,
} from "./gsapEditOutcome";

export function resizeRoute(animations: GsapAnimation[], fetchedAnimations: GsapAnimation[]) {
  const allKnownAnimations = [...animations, ...fetchedAnimations];
  // If the element already has a scale-group tween, resize should modify scale
  // (the user is resizing something whose visual size is driven by scale).
  // Otherwise, use the size group (width/height).
  const hasScaleGroup = allKnownAnimations.some((a) => a.propertyGroup === "scale");
  const resizeGroup: PropertyGroupName = hasScaleGroup ? "scale" : "size";
  const resizeProperties =
    resizeGroup === "scale" ? new Set(["scale", "scaleX", "scaleY"]) : new Set(["width", "height"]);
  const workingAnimations = animations.length > 0 ? animations : fetchedAnimations;
  return { allKnownAnimations, resizeGroup, resizeProperties, workingAnimations };
}

/** The resize commit's refusal rule, also run ahead of time to hide the resize handles. */
export function preflightGsapResizeIntercept(
  selection: DomEditSelection,
  animations: GsapAnimation[],
  iframe: HTMLIFrameElement | null,
  fetchedAnimations: GsapAnimation[] = [],
): GsapEditOutcome {
  const { allKnownAnimations, resizeGroup, resizeProperties, workingAnimations } = resizeRoute(
    animations,
    fetchedAnimations,
  );
  const editability = directEditOutcomeForProperties(allKnownAnimations, resizeProperties);
  if (editability.status === "blocked") return editability;
  const hasSourceTween = workingAnimations.some(
    (a) =>
      (a.propertyGroup === resizeGroup || !a.propertyGroup) &&
      animationWritesAnyProperty(a, resizeProperties),
  );
  const liveSelector = selectorFromSelection(selection);
  if (
    !hasSourceTween &&
    liveSelector &&
    hasNonHoldTweenForElement(iframe, liveSelector, undefined, [...resizeProperties])
  ) {
    // Third twin of the position/rotation cases: a live tween with no source match.
    return {
      status: "blocked",
      reason: "source-uneditable",
      detail: "live-resize-no-source-tween",
    };
  }
  return { status: "persisted" };
}
