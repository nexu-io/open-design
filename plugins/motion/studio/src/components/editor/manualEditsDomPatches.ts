import type { PatchOperation } from "../../utils/sourcePatcher";
import { gsapRendersTransform } from "./gsapAnimatesProperty";
import {
  STUDIO_OFFSET_X_PROP,
  STUDIO_OFFSET_Y_PROP,
  STUDIO_WIDTH_PROP,
  STUDIO_HEIGHT_PROP,
  STUDIO_ROTATION_PROP,
  STUDIO_PATH_OFFSET_ATTR,
  STUDIO_BOX_SIZE_ATTR,
  STUDIO_ROTATION_ATTR,
  STUDIO_ROTATION_DRAFT_ATTR,
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
  STUDIO_ORIGINAL_TRANSFORM_DISPLAY_ATTR,
} from "./manualEditsTypes";
import {
  STUDIO_MOTION_ATTR,
  STUDIO_MOTION_ORIGINAL_TRANSFORM_ATTR,
  STUDIO_MOTION_ORIGINAL_OPACITY_ATTR,
  STUDIO_MOTION_ORIGINAL_VISIBILITY_ATTR,
} from "./studioMotionTypes";

/* ── Shared helpers ──────────────────────────────────────────────── */

function collectInlineStyleOps(
  element: HTMLElement,
  properties: readonly string[],
  ops: PatchOperation[],
): void {
  for (const prop of properties) {
    const val = element.style.getPropertyValue(prop);
    if (val) ops.push({ type: "inline-style", property: prop, value: val });
  }
}

function collectAttributeOps(
  element: HTMLElement,
  attrNames: readonly string[],
  ops: PatchOperation[],
): void {
  for (const attr of attrNames) {
    const val = element.getAttribute(attr);
    if (val !== null) ops.push({ type: "attribute", property: attr, value: val });
  }
}

function appendTransformDisplayOps(element: HTMLElement, ops: PatchOperation[]): void {
  const val = element.getAttribute(STUDIO_ORIGINAL_TRANSFORM_DISPLAY_ATTR);
  if (val !== null) {
    ops.push({ type: "inline-style", property: "display", value: val || null });
    ops.push({ type: "attribute", property: STUDIO_ORIGINAL_TRANSFORM_DISPLAY_ATTR, value: null });
  }
}

/* ── Path offset patches ─────────────────────────────────────────── */

export function buildClearPathOffsetPatches(element: HTMLElement): PatchOperation[] {
  const originalInlineTranslate = element.getAttribute(STUDIO_ORIGINAL_INLINE_TRANSLATE_ATTR);
  const ops: PatchOperation[] = [
    { type: "inline-style", property: STUDIO_OFFSET_X_PROP, value: null },
    { type: "inline-style", property: STUDIO_OFFSET_Y_PROP, value: null },
    { type: "inline-style", property: "translate", value: originalInlineTranslate || null },
    { type: "attribute", property: STUDIO_PATH_OFFSET_ATTR, value: null },
    { type: "attribute", property: STUDIO_ORIGINAL_TRANSLATE_ATTR, value: null },
    { type: "attribute", property: STUDIO_ORIGINAL_INLINE_TRANSLATE_ATTR, value: null },
  ];
  appendTransformDisplayOps(element, ops);
  return ops;
}

/* ── Box size patches ────────────────────────────────────────────── */

export const BOX_SIZE_STYLE_PROPS = [
  "width",
  "height",
  "min-width",
  "min-height",
  "max-width",
  "max-height",
  "flex-basis",
  "flex-grow",
  "flex-shrink",
  "box-sizing",
  "scale",
  "transform-origin",
  "display",
] as const;

const BOX_SIZE_ORIG_ATTRS: ReadonlyArray<[string, string]> = [
  [STUDIO_ORIGINAL_WIDTH_ATTR, "width"],
  [STUDIO_ORIGINAL_HEIGHT_ATTR, "height"],
  // Records a measurement rather than a style, so it restores nothing.
  [STUDIO_ORIGINAL_BOX_WIDTH_ATTR, ""],
  [STUDIO_ORIGINAL_BOX_HEIGHT_ATTR, ""],
  [STUDIO_ORIGINAL_MIN_WIDTH_ATTR, "min-width"],
  [STUDIO_ORIGINAL_MIN_HEIGHT_ATTR, "min-height"],
  [STUDIO_ORIGINAL_MAX_WIDTH_ATTR, "max-width"],
  [STUDIO_ORIGINAL_MAX_HEIGHT_ATTR, "max-height"],
  [STUDIO_ORIGINAL_FLEX_BASIS_ATTR, "flex-basis"],
  [STUDIO_ORIGINAL_FLEX_GROW_ATTR, "flex-grow"],
  [STUDIO_ORIGINAL_FLEX_SHRINK_ATTR, "flex-shrink"],
  [STUDIO_ORIGINAL_BOX_SIZING_ATTR, "box-sizing"],
  [STUDIO_ORIGINAL_SCALE_ATTR, "scale"],
  [STUDIO_ORIGINAL_TRANSFORM_ORIGIN_ATTR, "transform-origin"],
  [STUDIO_ORIGINAL_DISPLAY_ATTR, "display"],
  [STUDIO_ORIGINAL_TRANSFORM_DISPLAY_ATTR, ""],
];

export function buildBoxSizePatches(element: HTMLElement): PatchOperation[] {
  const ops: PatchOperation[] = [];
  collectInlineStyleOps(element, [STUDIO_WIDTH_PROP, STUDIO_HEIGHT_PROP], ops);
  const withoutGsapScaleMask = gsapRendersTransform(element)
    ? BOX_SIZE_STYLE_PROPS.filter((prop) => prop !== "scale")
    : BOX_SIZE_STYLE_PROPS;
  collectInlineStyleOps(element, withoutGsapScaleMask, ops);
  ops.push({ type: "attribute", property: STUDIO_BOX_SIZE_ATTR, value: "true" });
  collectAttributeOps(
    element,
    BOX_SIZE_ORIG_ATTRS.map(([attr]) => attr),
    ops,
  );
  return ops;
}

export function buildClearBoxSizePatches(element: HTMLElement): PatchOperation[] {
  const ops: PatchOperation[] = [
    { type: "inline-style", property: STUDIO_WIDTH_PROP, value: null },
    { type: "inline-style", property: STUDIO_HEIGHT_PROP, value: null },
    { type: "attribute", property: STUDIO_BOX_SIZE_ATTR, value: null },
  ];
  for (const [attrName, styleProp] of BOX_SIZE_ORIG_ATTRS) {
    const origVal = element.getAttribute(attrName);
    if (origVal !== null && styleProp) {
      ops.push({ type: "inline-style", property: styleProp, value: origVal || null });
    }
    ops.push({ type: "attribute", property: attrName, value: null });
  }
  return ops;
}

/* ── Rotation patches ────────────────────────────────────────────── */

export function buildClearRotationPatches(element: HTMLElement): PatchOperation[] {
  const origInlineRotate = element.getAttribute(STUDIO_ORIGINAL_INLINE_ROTATE_ATTR);
  const origRotationTransformOrigin = element.getAttribute(
    STUDIO_ORIGINAL_ROTATION_TRANSFORM_ORIGIN_ATTR,
  );
  const ops: PatchOperation[] = [
    { type: "inline-style", property: STUDIO_ROTATION_PROP, value: null },
    { type: "inline-style", property: "rotate", value: origInlineRotate || null },
    {
      type: "inline-style",
      property: "transform-origin",
      value: origRotationTransformOrigin !== null ? origRotationTransformOrigin || null : null,
    },
    { type: "attribute", property: STUDIO_ROTATION_ATTR, value: null },
    { type: "attribute", property: STUDIO_ROTATION_DRAFT_ATTR, value: null },
    { type: "attribute", property: STUDIO_ORIGINAL_ROTATE_ATTR, value: null },
    { type: "attribute", property: STUDIO_ORIGINAL_INLINE_ROTATE_ATTR, value: null },
    { type: "attribute", property: STUDIO_ORIGINAL_ROTATION_TRANSFORM_ORIGIN_ATTR, value: null },
  ];
  appendTransformDisplayOps(element, ops);
  return ops;
}

/* ── Motion patches ──────────────────────────────────────────────── */

const MOTION_ORIG_ATTRS = [
  STUDIO_MOTION_ORIGINAL_TRANSFORM_ATTR,
  STUDIO_MOTION_ORIGINAL_OPACITY_ATTR,
  STUDIO_MOTION_ORIGINAL_VISIBILITY_ATTR,
] as const;

export function buildMotionPatches(element: HTMLElement): PatchOperation[] {
  const motionJson = element.getAttribute(STUDIO_MOTION_ATTR);
  if (!motionJson) return [];
  const ops: PatchOperation[] = [
    { type: "attribute", property: STUDIO_MOTION_ATTR, value: motionJson },
  ];
  collectAttributeOps(element, MOTION_ORIG_ATTRS, ops);
  return ops;
}

export function buildClearMotionPatches(_element: HTMLElement): PatchOperation[] {
  return [
    { type: "attribute", property: STUDIO_MOTION_ATTR, value: null },
    { type: "attribute", property: STUDIO_MOTION_ORIGINAL_TRANSFORM_ATTR, value: null },
    { type: "attribute", property: STUDIO_MOTION_ORIGINAL_OPACITY_ATTR, value: null },
    { type: "attribute", property: STUDIO_MOTION_ORIGINAL_VISIBILITY_ATTR, value: null },
  ];
}
