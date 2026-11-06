/**
 * Low-level GSAP runtime property readers shared by gsapRuntimeBridge and gsapDragCommit.
 */
import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import { classifyPropertyGroup, type PropertyGroupName } from "@hyperframes/core/gsap-parser";
import {
  COLOR_GRADING_SOURCE_HIDDEN_ATTR,
  HF_COLOR_GRADING_CANVAS_ID_PREFIX,
} from "@hyperframes/core/color-grading";
import { getIframeGsap, queryIframeElement, type IframeGsap } from "./gsapShared";
import { gsapWritesChannels } from "./gsapRuntimeKeyframes";
import { roundTo3 } from "../utils/rounding";

/**
 * The element's live value for `prop` as GSAP drives it. Opacity on a
 * color-grading-hidden source needs a detour: the runtime hides the source
 * with inline `opacity: 0 !important`, so computed opacity is the hide, not
 * the animated value. The grading canvas mirrors the source's effective
 * opacity every frame, so it is the truth for that one property — reading the
 * raw 0 here is what bakes `opacity: 0` into committed keyframes.
 */
function readLiveGsapValue(gsap: IframeGsap, el: Element, prop: string): number {
  if (prop === "opacity" && el.getAttribute(COLOR_GRADING_SOURCE_HIDDEN_ATTR) != null && el.id) {
    const canvas = el.ownerDocument.getElementById(HF_COLOR_GRADING_CANVAS_ID_PREFIX + el.id);
    const win = el.ownerDocument.defaultView;
    if (canvas && win) {
      const val = Number(win.getComputedStyle(canvas).opacity);
      if (Number.isFinite(val)) return val;
    }
  }
  return Number(gsap.getProperty(el, prop));
}

export function readGsapProperty(
  iframe: HTMLIFrameElement | null,
  selector: string | null,
  prop: string,
): number | null {
  if (!selector) return null;
  const gsap = getIframeGsap(iframe);
  if (!gsap) return null;
  const el = queryIframeElement(iframe, selector);
  if (!el) return null;
  try {
    const val = readLiveGsapValue(gsap, el, prop);
    if (!Number.isFinite(val)) return null;
    return POSITION_PROPS.has(prop) ? Math.round(val) : roundTo3(val);
  } catch {
    return null;
  }
}

export const POSITION_PROPS = new Set(["x", "y", "xPercent", "yPercent"]);
export function readAllAnimatedProperties(
  iframe: HTMLIFrameElement | null,
  selector: string,
  anim: GsapAnimation,
  group?: PropertyGroupName,
): Record<string, number> {
  const result: Record<string, number> = {};
  if (!iframe) return result;
  const gsap = getIframeGsap(iframe);
  if (!gsap) return result;
  const el = queryIframeElement(iframe, selector);
  if (!el) return result;
  let doc: Document | null = null;
  try {
    doc = iframe?.contentDocument ?? null;
  } catch {
    /* cross-origin guard — doc stays null */
  }

  const propKeys = new Set<string>();
  if (anim.keyframes) {
    for (const kf of anim.keyframes.keyframes) {
      for (const p of Object.keys(kf.properties)) {
        if (typeof kf.properties[p] === "number") propKeys.add(p);
      }
    }
  } else {
    for (const p of Object.keys(anim.properties)) propKeys.add(p);
  }

  // When a group filter is specified, only properties belonging to that group
  // may enter the result — including the baseline passes below. The whole
  // point of property-group tweens is that a rotation commit never carries
  // opacity/rotationX/etc. captured from unrelated tweens on the element.
  const inGroup = (p: string) => !group || classifyPropertyGroup(p) === group;
  const groupedPropKeys = new Set([...propKeys].filter(inGroup));

  for (const prop of groupedPropKeys) {
    const val = readLiveGsapValue(gsap, el, prop);
    if (Number.isFinite(val)) {
      result[prop] = POSITION_PROPS.has(prop) ? Math.round(val) : roundTo3(val);
    }
  }

  // Element-dependent properties — their "default" depends on the
  // stylesheet, so we compare GSAP's runtime value against the element's
  // computed CSS value. Only capture if GSAP has actively changed it.
  const COMPUTED_BASELINE = [
    "borderRadius",
    "borderTopLeftRadius",
    "borderTopRightRadius",
    "borderBottomLeftRadius",
    "borderBottomRightRadius",
    "letterSpacing",
    "wordSpacing",
    "lineHeight",
    "fontSize",
    "outlineOffset",
    "outlineWidth",
    "strokeDashoffset",
    "strokeWidth",
    "backgroundPositionX",
    "backgroundPositionY",
  ];
  let computedStyle: CSSStyleDeclaration | null = null;
  try {
    computedStyle = doc?.defaultView?.getComputedStyle(el) ?? null;
  } catch {}
  for (const prop of COMPUTED_BASELINE) {
    if (prop in result) continue;
    if (!inGroup(prop)) continue;
    if (gsapWritesChannels(el, [prop])) continue;
    const gsapVal = Number(gsap.getProperty(el, prop));
    if (!Number.isFinite(gsapVal)) continue;
    let cssVal = NaN;
    if (computedStyle) {
      const raw = computedStyle.getPropertyValue(
        prop.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`),
      );
      cssVal = parseFloat(raw);
    }
    if (Number.isFinite(cssVal) && Math.round(gsapVal * 1000) === Math.round(cssVal * 1000))
      continue;
    result[prop] = roundTo3(gsapVal);
  }

  return result;
}
