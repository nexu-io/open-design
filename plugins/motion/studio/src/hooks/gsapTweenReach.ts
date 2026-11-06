import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import type { DomEditSelection } from "../components/editor/domEditingTypes";

type TweenReach = "own" | "shared" | "elsewhere" | "unknown";

/** Which elements a tween's target resolves to in the live preview, relative to `el`. */
export function tweenReach(animation: GsapAnimation, el: Element | null | undefined): TweenReach {
  const doc = el?.ownerDocument;
  if (!el?.isConnected || !doc || animation.hasUnresolvedSelector) return "unknown";
  let hits: Element[];
  try {
    hits = [...doc.querySelectorAll(animation.targetSelector)];
  } catch {
    return "unknown";
  }
  if (!hits.includes(el)) return "elsewhere";
  return hits.length === 1 ? "own" : "shared";
}

/** The tweens a one-element edit may rewrite: not one shared with siblings, nor one
 *  that never reaches the element. */
export function tweensForThisElement(
  selection: DomEditSelection,
  animations: GsapAnimation[],
): GsapAnimation[] {
  return animations.filter((a) => {
    const reach = tweenReach(a, selection.element);
    return reach === "own" || reach === "unknown";
  });
}
