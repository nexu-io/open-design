/**
 * Resolving the selected element and the animation whose path is editable.
 * Shared by the overlay and its diagnostics (kept here to avoid a circular
 * import between the two).
 */
import type { GsapAnimation } from "@hyperframes/parsers/gsap-parser";
import type { DomEditSelection } from "./domEditing";
import { tweenTargetsElement, writeTargetSelector } from "../../hooks/gsapShared";

/**
 * The selector the overlay both MEASURES the element by and authors a new
 * motion path against.
 *
 * Both halves need exactly one element. The selection's own selector is a bare
 * class for an id-less element, so a `.group` sibling read its home position off
 * the FIRST sibling (skewing the destination the click computes) and then wrote
 * `add-motion-path` onto all five. `writeTargetSelector` is the same one-element
 * narrowing every other new-tween writer goes through; null means no such form
 * exists, and the overlay hides "set destination" rather than write a wrong one.
 */
export function selectorFor(sel: DomEditSelection | null): string | null {
  return sel ? writeTargetSelector(sel) : null;
}

/** The animation whose path is editable on-canvas: literal, statically resolved,
 *  and matching the rendered geometry kind. Returns null when the path can only
 *  be displayed (dynamic/helper tweens, or a tween that also moves other
 *  elements) — those nodes stay read-only and a press drags the element itself. */
export function editableAnimationId(
  animations: GsapAnimation[],
  kind: "linear" | "arc",
  sel: DomEditSelection | null,
): string | null {
  const own = selectorFor(sel);
  const ok = (a: GsapAnimation) =>
    !a.hasUnresolvedKeyframes &&
    !a.hasUnresolvedSelector &&
    !a.provenance &&
    !!own &&
    tweenTargetsElement(a.targetSelector, own, sel?.element);
  if (kind === "arc") return animations.find((a) => a.arcPath?.enabled && ok(a))?.id ?? null;
  const a = animations.find(
    (anim) =>
      anim.keyframes &&
      ok(anim) &&
      (anim.propertyGroup === "position" ||
        anim.keyframes.keyframes.some((k) => "x" in k.properties || "y" in k.properties)),
  );
  return a?.id ?? null;
}
