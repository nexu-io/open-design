import {
  STUDIO_OFFSET_X_PROP,
  STUDIO_OFFSET_Y_PROP,
  STUDIO_WIDTH_PROP,
  STUDIO_HEIGHT_PROP,
  STUDIO_ROTATION_PROP,
  STUDIO_PATH_OFFSET_ATTR,
  STUDIO_MANUAL_EDIT_GESTURE_ATTR,
  STUDIO_EDIT_MOMENT_ATTR,
  type EditMoment,
  STUDIO_BOX_SIZE_ATTR,
  STUDIO_ROTATION_ATTR,
  STUDIO_ORIGINAL_TRANSLATE_ATTR,
  STUDIO_ORIGINAL_INLINE_TRANSLATE_ATTR,
  STUDIO_ORIGINAL_WIDTH_ATTR,
  STUDIO_ORIGINAL_HEIGHT_ATTR,
  STUDIO_ORIGINAL_BOX_WIDTH_ATTR,
  STUDIO_ORIGINAL_BOX_HEIGHT_ATTR,
  STUDIO_ORIGINAL_MIN_WIDTH_ATTR,
  STUDIO_ORIGINAL_MIN_HEIGHT_ATTR,
  STUDIO_ORIGINAL_MAX_WIDTH_ATTR,
  STUDIO_ORIGINAL_MAX_HEIGHT_ATTR,
  STUDIO_ORIGINAL_FLEX_BASIS_ATTR,
  STUDIO_ORIGINAL_FLEX_GROW_ATTR,
  STUDIO_ORIGINAL_FLEX_SHRINK_ATTR,
  STUDIO_ORIGINAL_BOX_SIZING_ATTR,
  STUDIO_ORIGINAL_SCALE_ATTR,
  STUDIO_ORIGINAL_TRANSFORM_ORIGIN_ATTR,
  STUDIO_ORIGINAL_DISPLAY_ATTR,
  STUDIO_ORIGINAL_ROTATE_ATTR,
  STUDIO_ORIGINAL_INLINE_ROTATE_ATTR,
  STUDIO_ORIGINAL_ROTATION_TRANSFORM_ORIGIN_ATTR,
  STUDIO_ROTATION_DRAFT_ATTR,
  STUDIO_ORIGINAL_TRANSFORM_DISPLAY_ATTR,
  STUDIO_ROTATION_TRANSFORM_ORIGIN,
} from "./manualEditsTypes";
import { gsapWritesChannels } from "../../hooks/gsapRuntimeKeyframes";
import { splitTopLevelWhitespace } from "./manualEditsStyleHelpers";
import { roundTo3, roundToLayoutSize } from "../../utils/rounding";
import { BOX_SIZE_STYLE_PROPS } from "./manualEditsDomPatches";

/* ── Gesture tracking ─────────────────────────────────────────────── */
let studioManualEditGestureId = 0;

export type StudioGestureDraws = "move" | "resize" | "rotate" | "edit";
const MOVE_DRAWS = ["translate", STUDIO_OFFSET_X_PROP, STUDIO_OFFSET_Y_PROP];
const GESTURE_DRAWS: Record<StudioGestureDraws, readonly string[]> = {
  move: MOVE_DRAWS,
  resize: [...MOVE_DRAWS, STUDIO_WIDTH_PROP, STUDIO_HEIGHT_PROP, ...BOX_SIZE_STYLE_PROPS],
  rotate: ["rotate", "transform", "transform-origin", "display", STUDIO_ROTATION_PROP],
  edit: [],
};

export function beginStudioManualEditGesture(
  element: HTMLElement,
  draws: StudioGestureDraws,
  at?: EditMoment,
): string {
  studioManualEditGestureId += 1;
  const token = `gesture-${studioManualEditGestureId}:${draws}`;
  element.setAttribute(STUDIO_MANUAL_EDIT_GESTURE_ATTR, token);
  if (at) element.setAttribute(STUDIO_EDIT_MOMENT_ATTR, JSON.stringify(at));
  else element.removeAttribute(STUDIO_EDIT_MOMENT_ATTR);
  return token;
}

const GESTURE_ENDED = "hf-manual-edit-gesture-ended";

export function endStudioManualEditGesture(element: HTMLElement, token?: string): void {
  if (token && element.getAttribute(STUDIO_MANUAL_EDIT_GESTURE_ATTR) !== token) return;
  if (!element.hasAttribute(STUDIO_MANUAL_EDIT_GESTURE_ATTR)) return;
  element.removeAttribute(STUDIO_MANUAL_EDIT_GESTURE_ATTR);
  element.removeAttribute(STUDIO_EDIT_MOMENT_ATTR);
  const doc = element.ownerDocument;
  doc.dispatchEvent(new (doc.defaultView?.Event ?? Event)(GESTURE_ENDED));
}

export function isStudioManualEditGestureLiveIn(doc: Document): boolean {
  return doc.querySelector(`[${STUDIO_MANUAL_EDIT_GESTURE_ATTR}]`) !== null;
}

/** Runs `run` once the last gesture in `doc` ends; the returned function stops waiting. */
export function afterStudioManualEditGestures(doc: Document, run: () => void): () => void {
  const onEnded = () => {
    if (isStudioManualEditGestureLiveIn(doc)) return;
    stop();
    run();
  };
  const stop = () => doc.removeEventListener(GESTURE_ENDED, onEnded);
  doc.addEventListener(GESTURE_ENDED, onEnded);
  return stop;
}

const gestureSaves = new WeakMap<Document, number>();

export function studioManualEditSavesIn(doc: Document): number {
  return gestureSaves.get(doc) ?? 0;
}

export function countStudioPreviewChange(doc: Document): void {
  gestureSaves.set(doc, studioManualEditSavesIn(doc) + 1);
}

/** Runs a gesture's save, counted as it starts and as it settles: a reload requested before shows the old file. */
export function countStudioManualEditSave<R>(element: HTMLElement, save: () => R): R {
  const doc = element.ownerDocument;
  const count = () => countStudioPreviewChange(doc);
  count();
  const result = save();
  void Promise.resolve(result).then(count, count);
  return result;
}

export function studioGestureDraws(element: Element): readonly string[] | null {
  const token = element.getAttribute(STUDIO_MANUAL_EDIT_GESTURE_ATTR);
  if (token === null) return null;
  return GESTURE_DRAWS[token.split(":")[1] as StudioGestureDraws] ?? [];
}

function isStudioManualEditGestureActive(element: HTMLElement): boolean {
  return element.hasAttribute(STUDIO_MANUAL_EDIT_GESTURE_ATTR);
}

export function isStudioManualEditGestureCurrent(element: HTMLElement, token: string): boolean {
  return element.getAttribute(STUDIO_MANUAL_EDIT_GESTURE_ATTR) === token;
}

/* ── CSS custom-property readers ──────────────────────────────────── */
function readPxCustomProperty(element: HTMLElement, property: string): number {
  const value = Number.parseFloat(element.style.getPropertyValue(property));
  return Number.isFinite(value) ? value : 0;
}

export function readStudioPathOffset(element: HTMLElement): { x: number; y: number } {
  return {
    x: readPxCustomProperty(element, STUDIO_OFFSET_X_PROP),
    y: readPxCustomProperty(element, STUDIO_OFFSET_Y_PROP),
  };
}

// GSAP can leave dormant offset vars behind; only the live var-translate counts.
export function readAppliedStudioPathOffset(element: HTMLElement): { x: number; y: number } {
  return (element.style.translate || "").includes(STUDIO_OFFSET_X_PROP)
    ? readStudioPathOffset(element)
    : { x: 0, y: 0 };
}

export function readStudioBoxSize(element: HTMLElement): { width: number; height: number } {
  return {
    width: readPxCustomProperty(element, STUDIO_WIDTH_PROP),
    height: readPxCustomProperty(element, STUDIO_HEIGHT_PROP),
  };
}

export function readStudioRotation(element: HTMLElement): { angle: number } {
  const value = Number.parseFloat(element.style.getPropertyValue(STUDIO_ROTATION_PROP));
  return { angle: Number.isFinite(value) ? value : 0 };
}

/* ── Internal style helpers ───────────────────────────────────────── */
function safeComputedStyleProperty(element: HTMLElement, property: string): string {
  try {
    return (
      element.ownerDocument.defaultView?.getComputedStyle(element).getPropertyValue(property) ?? ""
    );
  } catch {
    return "";
  }
}

function readStyleOrComputed(element: HTMLElement, property: string): string {
  return element.style.getPropertyValue(property) || safeComputedStyleProperty(element, property);
}

function readTransformLonghandBase(element: HTMLElement, property: "translate" | "rotate"): string {
  const value = readStyleOrComputed(element, property).trim();
  return value === "none" ? "" : value;
}

export function styleUsesStudioOffset(value: string): boolean {
  return value.includes(STUDIO_OFFSET_X_PROP) || value.includes(STUDIO_OFFSET_Y_PROP);
}

export function styleUsesStudioSize(value: string): boolean {
  return value.includes(STUDIO_WIDTH_PROP) || value.includes(STUDIO_HEIGHT_PROP);
}

export function styleUsesStudioRotation(value: string): boolean {
  return value.includes(STUDIO_ROTATION_PROP);
}

function compactStyleValue(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

function styleMatchesStudioRotationDraft(element: HTMLElement, value: string): boolean {
  if (!element.hasAttribute(STUDIO_ROTATION_DRAFT_ATTR)) return false;
  const rotation = element.style.getPropertyValue(STUDIO_ROTATION_PROP).trim();
  if (!rotation || !value.trim()) return false;
  return (
    compactStyleValue(value) === compactStyleValue(composeStudioRotationValue(element, rotation))
  );
}

/* ── Inline promotion ─────────────────────────────────────────────── */
function promoteInlineForTransform(element: HTMLElement): void {
  const computedDisplay = safeComputedStyleProperty(element, "display");
  if (computedDisplay !== "inline") return;
  if (!element.hasAttribute(STUDIO_ORIGINAL_TRANSFORM_DISPLAY_ATTR)) {
    element.setAttribute(
      STUDIO_ORIGINAL_TRANSFORM_DISPLAY_ATTR,
      element.style.getPropertyValue("display"),
    );
  }
  element.style.setProperty("display", "inline-block");
}

export function restoreInlineDisplay(element: HTMLElement): void {
  const original = element.getAttribute(STUDIO_ORIGINAL_TRANSFORM_DISPLAY_ATTR);
  if (original == null) return;
  if (original === "") element.style.removeProperty("display");
  else element.style.setProperty("display", original);
  element.removeAttribute(STUDIO_ORIGINAL_TRANSFORM_DISPLAY_ATTR);
}

/* ── Translate helpers ────────────────────────────────────────────── */
function composeTranslateValue(element: HTMLElement, x: string, y: string): string {
  const original = element.getAttribute(STUDIO_ORIGINAL_TRANSLATE_ATTR)?.trim();
  if (!original || original === "none") return `${x} ${y}`;

  const parts = splitTopLevelWhitespace(original);
  if (parts.length === 1) return `calc(${parts[0]} + ${x}) ${y}`;
  if (parts.length === 2) return `calc(${parts[0]} + ${x}) calc(${parts[1]} + ${y})`;
  if (parts.length === 3) {
    return `calc(${parts[0]} + ${x}) calc(${parts[1]} + ${y}) ${parts[2]}`;
  }
  return `${x} ${y}`;
}

function prepareStudioPathOffsetBase(element: HTMLElement, updateBase: boolean): void {
  const inlineTranslate = element.style.getPropertyValue("translate");
  const currentTranslate = readTransformLonghandBase(element, "translate");
  const hasMarker = element.hasAttribute(STUDIO_PATH_OFFSET_ATTR);
  const wasResetByAnimation = !styleUsesStudioOffset(currentTranslate);
  if (!hasMarker) {
    element.setAttribute(
      STUDIO_ORIGINAL_INLINE_TRANSLATE_ATTR,
      styleUsesStudioOffset(inlineTranslate) ? "" : inlineTranslate,
    );
    element.setAttribute(
      STUDIO_ORIGINAL_TRANSLATE_ATTR,
      wasResetByAnimation ? currentTranslate : "",
    );
  } else if (updateBase && wasResetByAnimation && !isStudioManualEditGestureActive(element)) {
    element.setAttribute(STUDIO_ORIGINAL_TRANSLATE_ATTR, currentTranslate);
  }
}

function writeStudioPathOffsetVars(
  element: HTMLElement,
  offset: { x: number; y: number },
  options: { updateBase?: boolean } = {},
): void {
  prepareStudioPathOffsetBase(element, options.updateBase ?? true);
  element.setAttribute(STUDIO_PATH_OFFSET_ATTR, "true");
  element.style.setProperty(STUDIO_OFFSET_X_PROP, `${roundTo3(offset.x)}px`);
  element.style.setProperty(STUDIO_OFFSET_Y_PROP, `${roundTo3(offset.y)}px`);
}

/* ── Path offset apply ────────────────────────────────────────────── */

// GSAP 3.x reads the resolved CSS `translate` individual property at initialization and bakes it
// into element.style.transform (as a matrix) on every seek. When the studio's reapply hook also
// writes `translate`, both properties compose additively, doubling the visual offset.
//
// This helper subtracts only the baked studio offset from m41/m42, preserving any GSAP animation
// contribution (e.g. a tween animating y: -20). The studio offset is read from the CSS custom
// properties which tell us exactly how much was baked from the CSS translate.
function isIdentityAfterTranslateStrip(m: DOMMatrix): boolean {
  return m.is2D && m.a === 1 && m.b === 0 && m.c === 0 && m.d === 1;
}

// fallow-ignore-next-line complexity
function stripGsapTranslateFromTransform(element: HTMLElement): void {
  if (element.hasAttribute(STUDIO_MANUAL_EDIT_GESTURE_ATTR)) return;
  const transform = element.style.getPropertyValue("transform");
  if (!transform || transform === "none") return;
  const DOMMatrixCtor = (element.ownerDocument.defaultView as (Window & typeof globalThis) | null)
    ?.DOMMatrix;
  if (!DOMMatrixCtor) return;
  try {
    const m = new DOMMatrixCtor(transform);
    if (m.m41 === 0 && m.m42 === 0) return;
    const offsetX = readPxCustomProperty(element, STUDIO_OFFSET_X_PROP);
    const offsetY = readPxCustomProperty(element, STUDIO_OFFSET_Y_PROP);
    const angle = Math.atan2(m.b, m.a);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    m.m41 -= offsetX * cos - offsetY * sin;
    m.m42 -= offsetX * sin + offsetY * cos;
    if (Math.abs(m.m41) < 0.01 && Math.abs(m.m42) < 0.01 && isIdentityAfterTranslateStrip(m)) {
      element.style.removeProperty("transform");
    } else {
      element.style.setProperty("transform", m.toString());
    }
  } catch {
    /* non-parseable transform — leave as-is */
  }
}

// GSAP owns the element's `transform` (it bakes x/y into a matrix and writes
// `translate: none` every tick). Folding the drag offset into a CSS `translate`
// — as the non-GSAP path does — composes ON TOP of GSAP's transform, and the
// subsequent strip/reapply math compounds into a runaway matrix that flings the
// element off-canvas. So for GSAP-animated elements we keep `translate: none`
// and push the offset straight into GSAP's x/y via gsap.set; the var() offset an
// older Studio saved stays in the file, and GSAP re-reads it at init on reload.
// Returns true when handled as GSAP (caller must skip the CSS path).
// fallow-ignore-next-line complexity
function applyStudioPathOffsetViaGsap(
  element: HTMLElement,
  offset: { x: number; y: number },
): boolean {
  if (!gsapWritesChannels(element, ["x", "y"])) return false;
  element.style.setProperty("translate", "none");
  const win = element.ownerDocument.defaultView as
    | (Window & {
        gsap?: {
          set: (el: Element, vars: Record<string, unknown>) => void;
          getProperty: (el: Element, prop: string) => number;
        };
      })
    | null;
  if (win?.gsap) {
    const baseX = Number.parseFloat(element.getAttribute("data-hf-drag-gsap-base-x") ?? "");
    const baseY = Number.parseFloat(element.getAttribute("data-hf-drag-gsap-base-y") ?? "");
    const origX = Number.parseFloat(element.getAttribute("data-hf-drag-initial-offset-x") ?? "");
    const origY = Number.parseFloat(element.getAttribute("data-hf-drag-initial-offset-y") ?? "");
    const gsapBaseX = Number.isFinite(baseX)
      ? baseX
      : (win.gsap.getProperty(element, "x") as number);
    const gsapBaseY = Number.isFinite(baseY)
      ? baseY
      : (win.gsap.getProperty(element, "y") as number);
    if (!Number.isFinite(baseX))
      element.setAttribute("data-hf-drag-gsap-base-x", String(gsapBaseX));
    if (!Number.isFinite(baseY))
      element.setAttribute("data-hf-drag-gsap-base-y", String(gsapBaseY));
    const deltaX = offset.x - (Number.isFinite(origX) ? origX : 0);
    const deltaY = offset.y - (Number.isFinite(origY) ? origY : 0);
    win.gsap.set(element, { x: gsapBaseX + deltaX, y: gsapBaseY + deltaY });
  }
  return true;
}

export function applyStudioPathOffset(
  element: HTMLElement,
  offset: { x: number; y: number },
  options: { updateBase?: boolean } = {},
): void {
  promoteInlineForTransform(element);
  writeStudioPathOffsetVars(element, offset, { updateBase: options.updateBase ?? true });
  // GSAP elements: route through gsap.set, NOT a CSS translate (would corrupt the
  // matrix). Symmetrical with applyStudioPathOffsetDraft — the commit path used to
  // skip this branch, which is what flung dragged GSAP elements off-canvas.
  if (applyStudioPathOffsetViaGsap(element, offset)) return;
  element.style.setProperty(
    "translate",
    composeTranslateValue(
      element,
      `var(${STUDIO_OFFSET_X_PROP}, 0px)`,
      `var(${STUDIO_OFFSET_Y_PROP}, 0px)`,
    ),
  );
  stripGsapTranslateFromTransform(element);
}

export function applyStudioPathOffsetDraft(
  element: HTMLElement,
  offset: { x: number; y: number },
): void {
  promoteInlineForTransform(element);
  writeStudioPathOffsetVars(element, offset, { updateBase: false });
  if (applyStudioPathOffsetViaGsap(element, offset)) return;
  // Non-GSAP elements: use CSS translate as before.
  element.style.setProperty(
    "translate",
    composeTranslateValue(element, `${roundTo3(offset.x)}px`, `${roundTo3(offset.y)}px`),
  );
  stripGsapTranslateFromTransform(element);
}

/* ── Box size apply ───────────────────────────────────────────────── */
function readParentFlexBasisPixels(
  element: HTMLElement,
  size: { width: number; height: number },
): number | null {
  const parent = element.parentElement;
  if (!parent) return null;

  const display = readStyleOrComputed(parent, "display").trim();
  if (display !== "flex" && display !== "inline-flex") return null;

  const direction = readStyleOrComputed(parent, "flex-direction").trim();
  return direction.startsWith("column") ? size.height : size.width;
}

function restoreStaleStudioScaleResize(element: HTMLElement): void {
  if (!element.hasAttribute(STUDIO_ORIGINAL_SCALE_ATTR)) return;
  const origScale = element.getAttribute(STUDIO_ORIGINAL_SCALE_ATTR);
  if (origScale == null || origScale === "") element.style.removeProperty("scale");
  else element.style.setProperty("scale", origScale);
  element.removeAttribute(STUDIO_ORIGINAL_SCALE_ATTR);
  const origOrigin = element.getAttribute(STUDIO_ORIGINAL_TRANSFORM_ORIGIN_ATTR);
  if (origOrigin == null || origOrigin === "") element.style.removeProperty("transform-origin");
  else element.style.setProperty("transform-origin", origOrigin);
  element.removeAttribute(STUDIO_ORIGINAL_TRANSFORM_ORIGIN_ATTR);
}

function writeStudioBoxSizeVars(
  element: HTMLElement,
  size: { width: number; height: number },
): void {
  // Keep the measurement on its own migration-safe guard. Elements drafted by
  // an older Studio can already carry the box-size marker without these newer
  // attributes; the next resize still reaches this function before its width
  // and height are overwritten, so this is the last honest layout box to save.
  // Offset sizes are layout values, so a running scale animation does not
  // distort them.
  if (!element.hasAttribute(STUDIO_ORIGINAL_BOX_WIDTH_ATTR)) {
    element.setAttribute(STUDIO_ORIGINAL_BOX_WIDTH_ATTR, String(element.offsetWidth));
  }
  if (!element.hasAttribute(STUDIO_ORIGINAL_BOX_HEIGHT_ATTR)) {
    element.setAttribute(STUDIO_ORIGINAL_BOX_HEIGHT_ATTR, String(element.offsetHeight));
  }
  if (!element.hasAttribute(STUDIO_BOX_SIZE_ATTR)) {
    element.setAttribute(STUDIO_ORIGINAL_WIDTH_ATTR, element.style.getPropertyValue("width"));
    element.setAttribute(STUDIO_ORIGINAL_HEIGHT_ATTR, element.style.getPropertyValue("height"));
    element.setAttribute(
      STUDIO_ORIGINAL_MIN_WIDTH_ATTR,
      element.style.getPropertyValue("min-width"),
    );
    element.setAttribute(
      STUDIO_ORIGINAL_MIN_HEIGHT_ATTR,
      element.style.getPropertyValue("min-height"),
    );
    element.setAttribute(
      STUDIO_ORIGINAL_MAX_WIDTH_ATTR,
      element.style.getPropertyValue("max-width"),
    );
    element.setAttribute(
      STUDIO_ORIGINAL_MAX_HEIGHT_ATTR,
      element.style.getPropertyValue("max-height"),
    );
    element.setAttribute(
      STUDIO_ORIGINAL_FLEX_BASIS_ATTR,
      element.style.getPropertyValue("flex-basis"),
    );
    element.setAttribute(
      STUDIO_ORIGINAL_FLEX_GROW_ATTR,
      element.style.getPropertyValue("flex-grow"),
    );
    element.setAttribute(
      STUDIO_ORIGINAL_FLEX_SHRINK_ATTR,
      element.style.getPropertyValue("flex-shrink"),
    );
    element.setAttribute(
      STUDIO_ORIGINAL_BOX_SIZING_ATTR,
      element.style.getPropertyValue("box-sizing"),
    );
    element.setAttribute(STUDIO_ORIGINAL_SCALE_ATTR, element.style.getPropertyValue("scale"));
    element.setAttribute(
      STUDIO_ORIGINAL_TRANSFORM_ORIGIN_ATTR,
      element.style.getPropertyValue("transform-origin"),
    );
    element.setAttribute(STUDIO_ORIGINAL_DISPLAY_ATTR, element.style.getPropertyValue("display"));
  }

  element.setAttribute(STUDIO_BOX_SIZE_ATTR, "true");
  element.style.setProperty(STUDIO_WIDTH_PROP, `${size.width}px`);
  element.style.setProperty(STUDIO_HEIGHT_PROP, `${size.height}px`);
}

function applyStudioBoxSizeDimensions(
  element: HTMLElement,
  wantedSize: { width: number; height: number },
): { width: number; height: number } {
  const size = roundToLayoutSize(wantedSize);
  writeStudioBoxSizeVars(element, size);
  restoreStaleStudioScaleResize(element);

  element.style.setProperty("box-sizing", "border-box");
  element.style.setProperty("width", `${size.width}px`);
  element.style.setProperty("height", `${size.height}px`);
  element.style.setProperty("min-width", "0px");
  element.style.setProperty("min-height", "0px");
  element.style.setProperty("max-width", "none");
  element.style.setProperty("max-height", "none");
  const flexBasis = readParentFlexBasisPixels(element, size);
  if (flexBasis != null) {
    element.style.setProperty("flex-basis", `${flexBasis}px`);
    element.style.setProperty("flex-grow", "0");
    element.style.setProperty("flex-shrink", "0");
  }
  const computedDisplay = safeComputedStyleProperty(element, "display");
  if (computedDisplay === "inline") {
    element.style.setProperty("display", "inline-block");
  }
  return size;
}

export function applyStudioBoxSize(
  element: HTMLElement,
  size: { width: number; height: number },
): void {
  promoteInlineForTransform(element);
  applyStudioBoxSizeDimensions(element, size);
}

// The element's box before a resize draft first changed it; gone once the resize saves or is restored.
const boxSizeDraftBases = new WeakMap<HTMLElement, { width: number; height: number }>();

export function readStudioBoxSizeDraftBase(
  element: HTMLElement,
): { width: number; height: number } | null {
  return boxSizeDraftBases.get(element) ?? null;
}

export function forgetStudioBoxSizeDraftBase(element: HTMLElement): void {
  boxSizeDraftBases.delete(element);
}

export function applyStudioBoxSizeDraft(
  element: HTMLElement,
  size: { width: number; height: number },
): { width: number; height: number } {
  if (!boxSizeDraftBases.has(element)) {
    boxSizeDraftBases.set(element, { width: element.offsetWidth, height: element.offsetHeight });
  }
  promoteInlineForTransform(element);
  return applyStudioBoxSizeDimensions(element, size);
}

/* ── Rotation apply ───────────────────────────────────────────────── */
function isSimpleRotateAngle(value: string): boolean {
  return /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:deg|rad|turn|grad)$/.test(value.trim());
}

function composeStudioRotationValue(element: HTMLElement, rotationValue: string): string {
  const original = element.getAttribute(STUDIO_ORIGINAL_ROTATE_ATTR)?.trim();
  if (!original || original === "none" || !isSimpleRotateAngle(original)) {
    return rotationValue;
  }
  return `calc(${original} + ${rotationValue})`;
}

function prepareStudioRotationBase(element: HTMLElement, updateBase: boolean): void {
  const inlineRotate = element.style.getPropertyValue("rotate");
  const currentRotate = readTransformLonghandBase(element, "rotate");
  const hasMarker = element.hasAttribute(STUDIO_ROTATION_ATTR);
  const wasResetByAnimation =
    !styleUsesStudioRotation(currentRotate) &&
    !styleMatchesStudioRotationDraft(element, currentRotate);
  if (!hasMarker) {
    element.setAttribute(
      STUDIO_ORIGINAL_INLINE_ROTATE_ATTR,
      styleUsesStudioRotation(inlineRotate) ? "" : inlineRotate,
    );
    element.setAttribute(STUDIO_ORIGINAL_ROTATE_ATTR, wasResetByAnimation ? currentRotate : "");
  } else if (updateBase && wasResetByAnimation && !isStudioManualEditGestureActive(element)) {
    element.setAttribute(STUDIO_ORIGINAL_ROTATE_ATTR, currentRotate);
  }
  if (!element.hasAttribute(STUDIO_ORIGINAL_ROTATION_TRANSFORM_ORIGIN_ATTR)) {
    element.setAttribute(
      STUDIO_ORIGINAL_ROTATION_TRANSFORM_ORIGIN_ATTR,
      element.style.getPropertyValue("transform-origin"),
    );
  }
}

function writeStudioRotationVars(
  element: HTMLElement,
  rotation: { angle: number },
  options: { updateBase?: boolean } = {},
): void {
  prepareStudioRotationBase(element, options.updateBase ?? true);
  element.setAttribute(STUDIO_ROTATION_ATTR, "true");
  element.style.setProperty(STUDIO_ROTATION_PROP, `${roundTo3(rotation.angle)}deg`);
  element.style.setProperty("transform-origin", STUDIO_ROTATION_TRANSFORM_ORIGIN);
}

export function applyStudioRotation(element: HTMLElement, rotation: { angle: number }): void {
  promoteInlineForTransform(element);
  writeStudioRotationVars(element, rotation);
  element.removeAttribute(STUDIO_ROTATION_DRAFT_ATTR);
  element.style.setProperty(
    "rotate",
    composeStudioRotationValue(element, `var(${STUDIO_ROTATION_PROP}, 0deg)`),
  );
}
