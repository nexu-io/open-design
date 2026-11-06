import { roundTo3 } from "../utils/rounding";
import { STUDIO_EDIT_MOMENT_ATTR, type EditMoment } from "../components/editor/manualEditsTypes";

/**
 * Drag → GSAP position math, shared by the commit path
 * (`gsapDragCommit.commitGsapPositionFromDrag` / `commitStaticGsapPosition`) and
 * the live preview (`manualOffsetDrag.applyManualOffsetDrag*`). Kept in its own
 * leaf module — no store/runtime/core imports — so the live-preview file can use
 * it without pulling the GSAP commit graph into its module scope.
 */

const cssValue = (style: CSSStyleDeclaration, prop: string) => {
  const value = style.getPropertyValue(prop).trim();
  return value === "none" ? "" : value;
};

// Without GSAP, the rotation GSAP will parse from the CSS `rotate`, `scale` and `transform`; with
// `withRotate` false, only the part `scale` and `transform` draw. GSAP folds them into one transform,
// and a list the browser rejects (e.g. `rotate: x 30deg`) leaves it only the plain transform.
export function readCssRotation(element: HTMLElement, withRotate = true): number {
  const view = element.ownerDocument.defaultView;
  if (!view) return 0;
  const style = view.getComputedStyle(element);
  const rotate = withRotate ? cssValue(style, "rotate") : "";
  const scale = cssValue(style, "scale");
  const transform = cssValue(style, "transform");
  const angle = (list: string) => {
    if (!list) return 0;
    const m = new view.DOMMatrix(list);
    return (Math.atan2(m.b, m.a) * 180) / Math.PI;
  };
  const folded = [rotate && `rotate(${rotate})`, scale && `scale(${scale.split(/\s+/).join(",")})`];
  try {
    return angle([...folded, transform].join(" ").trim());
  } catch {
    return angle(transform);
  }
}

export interface DragStamp {
  origX: number;
  origY: number;
  baseX: number;
  baseY: number;
  at?: EditMoment;
  frozen?: boolean;
}

/** The drag-start attributes as they are now; NaN for an absent base. */
export function readDragStamp(element: HTMLElement): DragStamp {
  const read = (name: string) => Number.parseFloat(element.getAttribute(name) ?? "");
  return {
    origX: read("data-hf-drag-initial-offset-x") || 0,
    origY: read("data-hf-drag-initial-offset-y") || 0,
    baseX: read("data-hf-drag-gsap-base-x"),
    baseY: read("data-hf-drag-gsap-base-y"),
    at: readEditMoment(element),
  };
}

function readEditMoment(element: HTMLElement): EditMoment | undefined {
  const raw = element.getAttribute(STUDIO_EDIT_MOMENT_ATTR);
  return raw ? (JSON.parse(raw) as EditMoment) : undefined;
}

/** A gesture's stamp read at its release, for commits that finish after the next gesture re-stamps the element. */
export const freezeDragStamp = (element: HTMLElement): DragStamp => ({
  ...readDragStamp(element),
  frozen: true,
});

/**
 * Translate a studio drag offset into absolute GSAP x/y, accounting for the
 * element's rotation and its drag-start base pose. Reads the drag-start
 * stamp (`readDragStamp` by default) set by `createManualOffsetDragMember`
 * (`data-hf-drag-initial-offset-*`, `data-hf-drag-gsap-base-*`); `fallbackBase`
 * is used when the base attributes are absent (e.g. a static element that GSAP
 * hasn't given an x/y yet).
 *
 * Used by both the tweened commit and the static `set` commit / live preview, so
 * the preview and the committed value agree by construction.
 */
// fallow-ignore-next-line complexity
export function computeDraggedGsapPosition(
  element: HTMLElement,
  studioOffset: { x: number; y: number },
  fallbackBase: { x: number; y: number },
  stamp: DragStamp = readDragStamp(element),
): { newX: number; newY: number; baseGsapX: number; baseGsapY: number } {
  const rotStyle = element.style.getPropertyValue("--hf-studio-rotation");
  const rotDeg = Number.parseFloat(rotStyle) || 0;
  const rad = (-rotDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const deltaX = studioOffset.x - stamp.origX;
  const deltaY = studioOffset.y - stamp.origY;
  const adjX = deltaX * cos - deltaY * sin;
  const adjY = deltaX * sin + deltaY * cos;
  const baseGsapX = Number.isFinite(stamp.baseX) ? stamp.baseX : fallbackBase.x;
  const baseGsapY = Number.isFinite(stamp.baseY) ? stamp.baseY : fallbackBase.y;
  return {
    newX: roundTo3(baseGsapX + adjX),
    newY: roundTo3(baseGsapY + adjY),
    baseGsapX,
    baseGsapY,
  };
}

/** Puts the drag's preview offset back once the written position renders instead. A frozen stamp's
 *  gesture is over: the attributes belong to the one after it. */
export function restoreDragOffset(
  element: HTMLElement,
  stamp: DragStamp = readDragStamp(element),
): void {
  if (stamp.frozen) return;
  element.style.setProperty("--hf-studio-offset-x", `${stamp.origX}px`);
  element.style.setProperty("--hf-studio-offset-y", `${stamp.origY}px`);
  element.removeAttribute("data-hf-drag-initial-offset-x");
  element.removeAttribute("data-hf-drag-initial-offset-y");
}
