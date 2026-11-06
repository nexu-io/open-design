import { readCssRotation } from "../../hooks/draggedGsapPosition";
import { roundTo3 } from "../../utils/rounding";
import type { PatchOperation } from "../../utils/sourcePatcher";
import {
  readStudioRotation,
  restoreStudioRotation,
  type StudioRotationSnapshot,
} from "./manualEdits";
import { getOffsetDragGsap } from "./manualOffsetDrag";
import { splitTopLevelWhitespace } from "./manualEditsStyleHelpers";

function lastRuleTransform(element: HTMLElement): string {
  let value = "";
  for (const sheet of Array.from(element.ownerDocument.styleSheets)) {
    let rules: CSSStyleRule[] = [];
    try {
      rules = Array.from(sheet.cssRules) as CSSStyleRule[];
    } catch {
      // a cross-origin sheet
    }
    for (const rule of rules) {
      const declared = rule.style?.getPropertyValue("transform");
      if (declared && element.matches(rule.selectorText)) value = declared;
    }
  }
  return value;
}

// ponytail: the authored transform if it moves the box, from the last matching rule in sheet order;
// specificity, !important and @media are not weighed. Weigh them when a film's rule is missed.
function translatingTransform(element: HTMLElement): string {
  const view = element.ownerDocument.defaultView;
  const computed = view?.getComputedStyle(element).transform ?? "none";
  const m = computed === "none" ? null : new view!.DOMMatrix(computed);
  if (!m || (m.m41 === 0 && m.m42 === 0)) return "";
  const value = element.style.getPropertyValue("transform") || lastRuleTransform(element);
  return value === "none" ? "" : value;
}

/** Where a plain rotate draws its turn, read once at press: the element's own `rotate`, or, when its
 *  transform translates it (often the translate(-50%, -50%) centring), a rotate() right after that
 *  translate, so the box turns in place in screen space. `share` is what the rest already turns. */
export interface CssRotationTarget {
  property: "rotate" | "transform";
  before: string;
  after: string;
  share: number;
  /** -1 when a mirroring `scale` property flips a turn made inside the transform. */
  sign: number;
  /** An inline box does not transform, so the turn makes it inline-block. */
  inline: boolean;
}

export type PressChoseGsap = null;
export type RotationCommit = { angle: number; plain?: CssRotationTarget | PressChoseGsap };

const TRANSLATE = /^translate(?:3d|X|Y|Z)?\(/i;
const OWN_TURN = /^rotate\(\s*-?[\d.]+(?:e[+-]?\d+)?deg\s*\)$/i;

export function readCssRotationTarget(element: HTMLElement): CssRotationTarget {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  const inline = style?.display === "inline";
  const transform = translatingTransform(element);
  if (!transform) {
    const share = readCssRotation(element, false);
    return { property: "rotate", before: "", after: "", share, sign: 1, inline };
  }
  const parts = splitTopLevelWhitespace(transform);
  const lead = parts.findIndex((part) => !TRANSLATE.test(part));
  const split = lead < 0 ? parts.length : lead;
  const rest = parts.slice(split);
  if (OWN_TURN.test(rest[0] ?? "")) rest.shift();
  const [before, after] = [parts.slice(0, split).join(" "), rest.join(" ")];
  const [sx = 1, sy = sx] = splitTopLevelWhitespace(style?.getPropertyValue("scale") ?? "").map(
    Number.parseFloat,
  );
  const inlineStyle = element.style;
  const saved = [
    inlineStyle.getPropertyValue("transform"),
    inlineStyle.getPropertyPriority("transform"),
  ];
  inlineStyle.setProperty("transform", `${before} ${after}`.trim() || "none");
  const share = readCssRotation(element);
  inlineStyle.setProperty("transform", saved[0] ?? "", saved[1] ?? "");
  return { property: "transform", before, after, share, sign: sx * sy < 0 ? -1 : 1, inline };
}

/** Draws `angle` where `target` says, and returns the source patches that save it as drawn. */
export function applyCssRotation(
  element: HTMLElement,
  angle: number,
  target = readCssRotationTarget(element),
): Array<PatchOperation & { value: string }> {
  const turn = `${roundTo3(target.sign * (angle - target.share))}deg`;
  const value =
    target.property === "rotate"
      ? turn
      : [target.before, `rotate(${turn})`, target.after].filter(Boolean).join(" ");
  const patches: Array<PatchOperation & { value: string }> = [
    { type: "inline-style", property: target.property, value },
  ];
  if (target.inline) {
    patches.unshift({ type: "inline-style", property: "display", value: "inline-block" });
  }
  for (const patch of patches) element.style.setProperty(patch.property, patch.value);
  return patches;
}

/** Back to the press: the rotation snapshot and, for a plain rotate, the inline transform it drew in. */
export function restorePlainRotation(element: HTMLElement, snapshot: StudioRotationSnapshot): void {
  restoreStudioRotation(element, snapshot);
  element.style.setProperty("transform", snapshot.transform);
  element.style.setProperty("display", snapshot.display);
}

// `plain`, read at press: where a turn GSAP does not own draws; null for GSAP's rotation.
export function applyRotationDraft(
  element: HTMLElement,
  angle: number,
  plain: CssRotationTarget | null,
): void {
  if (plain) return void applyCssRotation(element, angle, plain);
  element.style.setProperty("rotate", "none");
  getOffsetDragGsap(element)?.set(element, { rotation: angle });
}

/** Back to the gesture start: the CSS snapshot, and GSAP's rotation without the legacy var. */
export function restoreRotationDraft(
  element: HTMLElement,
  angle: number,
  snapshot: StudioRotationSnapshot,
  plain: boolean,
): void {
  if (plain) return restorePlainRotation(element, snapshot);
  getOffsetDragGsap(element)?.set(element, {
    rotation: angle - (Number.parseFloat(snapshot.studioRotation) || 0),
  });
  restoreStudioRotation(element, snapshot);
}

/** The angle a rotate gesture starts from, as the element shows it. */
export function readRotationBase(element: HTMLElement, plain: boolean): number {
  if (plain) return readCssRotation(element);
  const gsapRotation = Number(getOffsetDragGsap(element)?.getProperty(element, "rotation") ?? 0);
  return gsapRotation + readStudioRotation(element).angle;
}
