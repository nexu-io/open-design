/**
 * Authored-opacity contract, studio side. The runtime stamps every graded
 * element's authored inline opacity at document parse time (see
 * installAuthoredOpacityCapture in @hyperframes/core); studio code that makes
 * GSAP re-initialize tweens (soft reload, in-place patches) restores it so
 * re-captures never bake a runtime transient in as a tween bound.
 */
import { COLOR_GRADING_AUTHORED_OPACITY_ATTR } from "@hyperframes/core/color-grading";

interface AttributeReader {
  getAttribute(name: string): string | null;
}

/**
 * The stamped authored inline opacity. Three-state:
 *   "0.98" — the authored value; "" — captured, authored none;
 *   null — never captured (unknown).
 * Duck-typed so iframe-realm elements (no shared HTMLElement) work.
 */
export function readStampedAuthoredOpacity(element: AttributeReader): string | null {
  return element.getAttribute(COLOR_GRADING_AUTHORED_OPACITY_ATTR);
}

/**
 * Write an authored inline opacity back: "" removes the property, a value sets
 * it. Priority-lossy by design: the capture reads `style.opacity` (value only)
 * and the write sets no priority, so an authored `opacity: X !important`
 * round-trips as `opacity: X`. The only `!important` opacity in the pipeline
 * is the color-grading runtime hide — a transient this contract exists to
 * discard — and authored compositions don't `!important` their opacity.
 */
export function applyAuthoredInlineOpacity(style: CSSStyleDeclaration, authored: string): void {
  if (authored === "") style.removeProperty("opacity");
  else style.setProperty("opacity", authored);
}
