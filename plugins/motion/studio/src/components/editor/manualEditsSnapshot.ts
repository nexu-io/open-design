import {
  styleUsesStudioOffset,
  styleUsesStudioSize,
  styleUsesStudioRotation,
  restoreInlineDisplay,
  forgetStudioBoxSizeDraftBase,
} from "./manualEditsDom";
import {
  STUDIO_OFFSET_X_PROP,
  STUDIO_OFFSET_Y_PROP,
  STUDIO_WIDTH_PROP,
  STUDIO_HEIGHT_PROP,
  STUDIO_ROTATION_PROP,
  STUDIO_PATH_OFFSET_ATTR,
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
} from "./manualEditsTypes";
import type {
  StudioBoxSizeSnapshot,
  StudioRotationSnapshot,
  StudioPathOffsetSnapshot,
} from "./manualEditsTypes";

/* ── Capture ──────────────────────────────────────────────────────── */
export function captureStudioBoxSize(element: HTMLElement): StudioBoxSizeSnapshot {
  return {
    width: element.style.getPropertyValue("width"),
    height: element.style.getPropertyValue("height"),
    minWidth: element.style.getPropertyValue("min-width"),
    minHeight: element.style.getPropertyValue("min-height"),
    maxWidth: element.style.getPropertyValue("max-width"),
    maxHeight: element.style.getPropertyValue("max-height"),
    flexBasis: element.style.getPropertyValue("flex-basis"),
    flexGrow: element.style.getPropertyValue("flex-grow"),
    flexShrink: element.style.getPropertyValue("flex-shrink"),
    boxSizing: element.style.getPropertyValue("box-sizing"),
    scale: element.style.getPropertyValue("scale"),
    transformOrigin: element.style.getPropertyValue("transform-origin"),
    display: element.style.getPropertyValue("display"),
    studioWidth: element.style.getPropertyValue(STUDIO_WIDTH_PROP),
    studioHeight: element.style.getPropertyValue(STUDIO_HEIGHT_PROP),
    marker: element.getAttribute(STUDIO_BOX_SIZE_ATTR),
    originalWidth: element.getAttribute(STUDIO_ORIGINAL_WIDTH_ATTR),
    originalHeight: element.getAttribute(STUDIO_ORIGINAL_HEIGHT_ATTR),
    originalBoxWidth: element.getAttribute(STUDIO_ORIGINAL_BOX_WIDTH_ATTR),
    originalBoxHeight: element.getAttribute(STUDIO_ORIGINAL_BOX_HEIGHT_ATTR),
    originalMinWidth: element.getAttribute(STUDIO_ORIGINAL_MIN_WIDTH_ATTR),
    originalMinHeight: element.getAttribute(STUDIO_ORIGINAL_MIN_HEIGHT_ATTR),
    originalMaxWidth: element.getAttribute(STUDIO_ORIGINAL_MAX_WIDTH_ATTR),
    originalMaxHeight: element.getAttribute(STUDIO_ORIGINAL_MAX_HEIGHT_ATTR),
    originalFlexBasis: element.getAttribute(STUDIO_ORIGINAL_FLEX_BASIS_ATTR),
    originalFlexGrow: element.getAttribute(STUDIO_ORIGINAL_FLEX_GROW_ATTR),
    originalFlexShrink: element.getAttribute(STUDIO_ORIGINAL_FLEX_SHRINK_ATTR),
    originalBoxSizing: element.getAttribute(STUDIO_ORIGINAL_BOX_SIZING_ATTR),
    originalScale: element.getAttribute(STUDIO_ORIGINAL_SCALE_ATTR),
    originalTransformOrigin: element.getAttribute(STUDIO_ORIGINAL_TRANSFORM_ORIGIN_ATTR),
    originalDisplay: element.getAttribute(STUDIO_ORIGINAL_DISPLAY_ATTR),
  };
}

export function captureStudioRotation(element: HTMLElement): StudioRotationSnapshot {
  return {
    rotate: element.style.getPropertyValue("rotate"),
    transform: element.style.getPropertyValue("transform"),
    display: element.style.getPropertyValue("display"),
    transformOrigin: element.style.getPropertyValue("transform-origin"),
    studioRotation: element.style.getPropertyValue(STUDIO_ROTATION_PROP),
    marker: element.getAttribute(STUDIO_ROTATION_ATTR),
    draftMarker: element.getAttribute(STUDIO_ROTATION_DRAFT_ATTR),
    originalRotate: element.getAttribute(STUDIO_ORIGINAL_ROTATE_ATTR),
    originalInlineRotate: element.getAttribute(STUDIO_ORIGINAL_INLINE_ROTATE_ATTR),
    originalTransformOrigin: element.getAttribute(STUDIO_ORIGINAL_ROTATION_TRANSFORM_ORIGIN_ATTR),
  };
}

export function captureStudioPathOffset(element: HTMLElement): StudioPathOffsetSnapshot {
  return {
    translate: element.style.getPropertyValue("translate"),
    x: element.style.getPropertyValue(STUDIO_OFFSET_X_PROP),
    y: element.style.getPropertyValue(STUDIO_OFFSET_Y_PROP),
    marker: element.getAttribute(STUDIO_PATH_OFFSET_ATTR),
    originalTranslate: element.getAttribute(STUDIO_ORIGINAL_TRANSLATE_ATTR),
    originalInlineTranslate: element.getAttribute(STUDIO_ORIGINAL_INLINE_TRANSLATE_ATTR),
  };
}

/* ── Restore helpers ──────────────────────────────────────────────── */
function restoreAttribute(element: HTMLElement, attribute: string, value: string | null): void {
  if (value == null) element.removeAttribute(attribute);
  else element.setAttribute(attribute, value);
}

function restoreStyleProperty(element: HTMLElement, property: string, value: string): void {
  if (value) element.style.setProperty(property, value);
  else element.style.removeProperty(property);
}

export function restoreStudioBoxSize(element: HTMLElement, previous: StudioBoxSizeSnapshot): void {
  forgetStudioBoxSizeDraftBase(element);
  restoreStyleProperty(element, "width", previous.width);
  restoreStyleProperty(element, "height", previous.height);
  restoreStyleProperty(element, "min-width", previous.minWidth);
  restoreStyleProperty(element, "min-height", previous.minHeight);
  restoreStyleProperty(element, "max-width", previous.maxWidth);
  restoreStyleProperty(element, "max-height", previous.maxHeight);
  restoreStyleProperty(element, "flex-basis", previous.flexBasis);
  restoreStyleProperty(element, "flex-grow", previous.flexGrow);
  restoreStyleProperty(element, "flex-shrink", previous.flexShrink);
  restoreStyleProperty(element, "box-sizing", previous.boxSizing);
  restoreStyleProperty(element, "scale", previous.scale);
  restoreStyleProperty(element, "transform-origin", previous.transformOrigin);
  restoreStyleProperty(element, "display", previous.display);
  restoreStyleProperty(element, STUDIO_WIDTH_PROP, previous.studioWidth);
  restoreStyleProperty(element, STUDIO_HEIGHT_PROP, previous.studioHeight);
  restoreAttribute(element, STUDIO_BOX_SIZE_ATTR, previous.marker);
  restoreAttribute(element, STUDIO_ORIGINAL_WIDTH_ATTR, previous.originalWidth);
  restoreAttribute(element, STUDIO_ORIGINAL_HEIGHT_ATTR, previous.originalHeight);
  restoreAttribute(element, STUDIO_ORIGINAL_BOX_WIDTH_ATTR, previous.originalBoxWidth);
  restoreAttribute(element, STUDIO_ORIGINAL_BOX_HEIGHT_ATTR, previous.originalBoxHeight);
  restoreAttribute(element, STUDIO_ORIGINAL_MIN_WIDTH_ATTR, previous.originalMinWidth);
  restoreAttribute(element, STUDIO_ORIGINAL_MIN_HEIGHT_ATTR, previous.originalMinHeight);
  restoreAttribute(element, STUDIO_ORIGINAL_MAX_WIDTH_ATTR, previous.originalMaxWidth);
  restoreAttribute(element, STUDIO_ORIGINAL_MAX_HEIGHT_ATTR, previous.originalMaxHeight);
  restoreAttribute(element, STUDIO_ORIGINAL_FLEX_BASIS_ATTR, previous.originalFlexBasis);
  restoreAttribute(element, STUDIO_ORIGINAL_FLEX_GROW_ATTR, previous.originalFlexGrow);
  restoreAttribute(element, STUDIO_ORIGINAL_FLEX_SHRINK_ATTR, previous.originalFlexShrink);
  restoreAttribute(element, STUDIO_ORIGINAL_BOX_SIZING_ATTR, previous.originalBoxSizing);
  restoreAttribute(element, STUDIO_ORIGINAL_SCALE_ATTR, previous.originalScale);
  restoreAttribute(
    element,
    STUDIO_ORIGINAL_TRANSFORM_ORIGIN_ATTR,
    previous.originalTransformOrigin,
  );
  restoreAttribute(element, STUDIO_ORIGINAL_DISPLAY_ATTR, previous.originalDisplay);
}

export function restoreStudioRotation(
  element: HTMLElement,
  previous: StudioRotationSnapshot,
): void {
  restoreStyleProperty(element, "rotate", previous.rotate);
  restoreStyleProperty(element, "transform-origin", previous.transformOrigin);
  restoreStyleProperty(element, STUDIO_ROTATION_PROP, previous.studioRotation);
  restoreAttribute(element, STUDIO_ROTATION_ATTR, previous.marker);
  restoreAttribute(element, STUDIO_ROTATION_DRAFT_ATTR, previous.draftMarker);
  restoreAttribute(element, STUDIO_ORIGINAL_ROTATE_ATTR, previous.originalRotate);
  restoreAttribute(element, STUDIO_ORIGINAL_INLINE_ROTATE_ATTR, previous.originalInlineRotate);
  restoreAttribute(
    element,
    STUDIO_ORIGINAL_ROTATION_TRANSFORM_ORIGIN_ATTR,
    previous.originalTransformOrigin,
  );
}

export function restoreStudioPathOffset(
  element: HTMLElement,
  previous: StudioPathOffsetSnapshot,
): void {
  if (previous.translate) element.style.setProperty("translate", previous.translate);
  else element.style.removeProperty("translate");

  if (previous.x) element.style.setProperty(STUDIO_OFFSET_X_PROP, previous.x);
  else element.style.removeProperty(STUDIO_OFFSET_X_PROP);

  if (previous.y) element.style.setProperty(STUDIO_OFFSET_Y_PROP, previous.y);
  else element.style.removeProperty(STUDIO_OFFSET_Y_PROP);

  restoreAttribute(element, STUDIO_PATH_OFFSET_ATTR, previous.marker);
  restoreAttribute(element, STUDIO_ORIGINAL_TRANSLATE_ATTR, previous.originalTranslate);
  restoreAttribute(
    element,
    STUDIO_ORIGINAL_INLINE_TRANSLATE_ATTR,
    previous.originalInlineTranslate,
  );

  // Restore GSAP x/y if a draft was applied via gsap.set during drag
  const baseX = element.getAttribute("data-hf-drag-gsap-base-x");
  const baseY = element.getAttribute("data-hf-drag-gsap-base-y");
  if (baseX != null || baseY != null) {
    const win = element.ownerDocument.defaultView as
      | (Window & { gsap?: { set: (el: Element, vars: Record<string, unknown>) => void } })
      | null;
    if (win?.gsap) {
      const x = Number.parseFloat(baseX ?? "0") || 0;
      const y = Number.parseFloat(baseY ?? "0") || 0;
      win.gsap.set(element, { x, y });
    }
    element.removeAttribute("data-hf-drag-gsap-base-x");
    element.removeAttribute("data-hf-drag-gsap-base-y");
  }
}

/* ── Clear functions ──────────────────────────────────────────────── */
type BoxSizeProperty =
  | "width"
  | "height"
  | "min-width"
  | "min-height"
  | "max-width"
  | "max-height"
  | "flex-basis"
  | "flex-grow"
  | "flex-shrink"
  | "box-sizing"
  | "scale"
  | "transform-origin"
  | "display";

function restoreOriginalBoxSizeProperty(
  element: HTMLElement,
  property: BoxSizeProperty,
  attribute: string,
): void {
  const original = element.getAttribute(attribute);
  if (original == null || original === "") element.style.removeProperty(property);
  else element.style.setProperty(property, original);
  element.removeAttribute(attribute);
}

function restoreOriginalRotationProperty(element: HTMLElement): void {
  const original = element.getAttribute(STUDIO_ORIGINAL_INLINE_ROTATE_ATTR);
  if (original == null || original === "") element.style.removeProperty("rotate");
  else element.style.setProperty("rotate", original);
  element.removeAttribute(STUDIO_ORIGINAL_INLINE_ROTATE_ATTR);
  element.removeAttribute(STUDIO_ORIGINAL_ROTATE_ATTR);
  const originalTransformOrigin = element.getAttribute(
    STUDIO_ORIGINAL_ROTATION_TRANSFORM_ORIGIN_ATTR,
  );
  if (originalTransformOrigin != null) {
    if (originalTransformOrigin === "") element.style.removeProperty("transform-origin");
    else element.style.setProperty("transform-origin", originalTransformOrigin);
  }
  element.removeAttribute(STUDIO_ORIGINAL_ROTATION_TRANSFORM_ORIGIN_ATTR);
}

function restoreOriginalTranslateProperty(element: HTMLElement): void {
  const original = element.getAttribute(STUDIO_ORIGINAL_INLINE_TRANSLATE_ATTR);
  if (original == null || original === "") element.style.removeProperty("translate");
  else element.style.setProperty("translate", original);
  element.removeAttribute(STUDIO_ORIGINAL_INLINE_TRANSLATE_ATTR);
  element.removeAttribute(STUDIO_ORIGINAL_TRANSLATE_ATTR);
}

export function clearStudioPathOffset(element: HTMLElement): void {
  if (
    element.hasAttribute(STUDIO_PATH_OFFSET_ATTR) ||
    element.hasAttribute(STUDIO_ORIGINAL_INLINE_TRANSLATE_ATTR) ||
    styleUsesStudioOffset(element.style.getPropertyValue("translate"))
  ) {
    restoreOriginalTranslateProperty(element);
  }
  restoreInlineDisplay(element);
  element.style.removeProperty(STUDIO_OFFSET_X_PROP);
  element.style.removeProperty(STUDIO_OFFSET_Y_PROP);
  element.removeAttribute(STUDIO_PATH_OFFSET_ATTR);
  element.removeAttribute(STUDIO_ORIGINAL_TRANSLATE_ATTR);
  element.removeAttribute(STUDIO_ORIGINAL_INLINE_TRANSLATE_ATTR);
}

export function clearStudioRotation(element: HTMLElement): void {
  if (
    element.hasAttribute(STUDIO_ROTATION_ATTR) ||
    styleUsesStudioRotation(element.style.getPropertyValue("rotate"))
  ) {
    restoreOriginalRotationProperty(element);
  }
  restoreInlineDisplay(element);
  element.style.removeProperty(STUDIO_ROTATION_PROP);
  element.removeAttribute(STUDIO_ROTATION_ATTR);
  element.removeAttribute(STUDIO_ROTATION_DRAFT_ATTR);
  element.removeAttribute(STUDIO_ORIGINAL_ROTATE_ATTR);
  element.removeAttribute(STUDIO_ORIGINAL_INLINE_ROTATE_ATTR);
  element.removeAttribute(STUDIO_ORIGINAL_ROTATION_TRANSFORM_ORIGIN_ATTR);
}

export function clearStudioBoxSize(element: HTMLElement): void {
  forgetStudioBoxSizeDraftBase(element);
  if (
    element.hasAttribute(STUDIO_BOX_SIZE_ATTR) ||
    styleUsesStudioSize(element.style.getPropertyValue("width")) ||
    styleUsesStudioSize(element.style.getPropertyValue("height")) ||
    element.hasAttribute(STUDIO_ORIGINAL_SCALE_ATTR)
  ) {
    restoreOriginalBoxSizeProperty(element, "width", STUDIO_ORIGINAL_WIDTH_ATTR);
    restoreOriginalBoxSizeProperty(element, "height", STUDIO_ORIGINAL_HEIGHT_ATTR);
    restoreOriginalBoxSizeProperty(element, "min-width", STUDIO_ORIGINAL_MIN_WIDTH_ATTR);
    restoreOriginalBoxSizeProperty(element, "min-height", STUDIO_ORIGINAL_MIN_HEIGHT_ATTR);
    restoreOriginalBoxSizeProperty(element, "max-width", STUDIO_ORIGINAL_MAX_WIDTH_ATTR);
    restoreOriginalBoxSizeProperty(element, "max-height", STUDIO_ORIGINAL_MAX_HEIGHT_ATTR);
    restoreOriginalBoxSizeProperty(element, "flex-basis", STUDIO_ORIGINAL_FLEX_BASIS_ATTR);
    restoreOriginalBoxSizeProperty(element, "flex-grow", STUDIO_ORIGINAL_FLEX_GROW_ATTR);
    restoreOriginalBoxSizeProperty(element, "flex-shrink", STUDIO_ORIGINAL_FLEX_SHRINK_ATTR);
    restoreOriginalBoxSizeProperty(element, "box-sizing", STUDIO_ORIGINAL_BOX_SIZING_ATTR);
    restoreOriginalBoxSizeProperty(element, "scale", STUDIO_ORIGINAL_SCALE_ATTR);
    restoreOriginalBoxSizeProperty(
      element,
      "transform-origin",
      STUDIO_ORIGINAL_TRANSFORM_ORIGIN_ATTR,
    );
    restoreOriginalBoxSizeProperty(element, "display", STUDIO_ORIGINAL_DISPLAY_ATTR);
  }
  restoreInlineDisplay(element);
  element.style.removeProperty(STUDIO_WIDTH_PROP);
  element.style.removeProperty(STUDIO_HEIGHT_PROP);
  element.removeAttribute(STUDIO_BOX_SIZE_ATTR);
}
