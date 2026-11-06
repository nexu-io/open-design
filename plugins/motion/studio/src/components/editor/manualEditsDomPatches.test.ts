// fallow-ignore-file code-duplication
// @vitest-environment happy-dom

import { describe, it, expect } from "vitest";
import type { PatchOperation } from "../../utils/sourcePatcher";
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
import {
  buildClearPathOffsetPatches,
  buildBoxSizePatches,
  buildClearBoxSizePatches,
  buildClearRotationPatches,
  buildMotionPatches,
  buildClearMotionPatches,
} from "./manualEditsDomPatches";
import { applyStudioBoxSize } from "./manualEditsDom";

/* ── helpers ── */

function div(): HTMLElement {
  return document.createElement("div");
}

function opKey(op: PatchOperation): string {
  return `${op.type}:${op.property}`;
}

function assertClearCoversKeys(buildOps: PatchOperation[], clearOps: PatchOperation[]): void {
  const clearKeys = new Set(clearOps.map(opKey));
  for (const op of buildOps) {
    expect(clearKeys.has(opKey(op)), `clear missing key "${opKey(op)}"`).toBe(true);
  }
}

/* ── Path offset ─────────────────────────────────────────────────────────── */

describe("buildClearPathOffsetPatches", () => {
  it("clear: restores translate from STUDIO_ORIGINAL_INLINE_TRANSLATE_ATTR and display from STUDIO_ORIGINAL_TRANSFORM_DISPLAY_ATTR", () => {
    const e = div();
    e.setAttribute(STUDIO_ORIGINAL_INLINE_TRANSLATE_ATTR, "5px");
    e.setAttribute(STUDIO_ORIGINAL_TRANSFORM_DISPLAY_ATTR, "grid");
    const ops = buildClearPathOffsetPatches(e);
    expect(ops).toEqual([
      { type: "inline-style", property: STUDIO_OFFSET_X_PROP, value: null },
      { type: "inline-style", property: STUDIO_OFFSET_Y_PROP, value: null },
      { type: "inline-style", property: "translate", value: "5px" },
      { type: "attribute", property: STUDIO_PATH_OFFSET_ATTR, value: null },
      { type: "attribute", property: STUDIO_ORIGINAL_TRANSLATE_ATTR, value: null },
      { type: "attribute", property: STUDIO_ORIGINAL_INLINE_TRANSLATE_ATTR, value: null },
      { type: "inline-style", property: "display", value: "grid" },
      { type: "attribute", property: STUDIO_ORIGINAL_TRANSFORM_DISPLAY_ATTR, value: null },
    ]);
  });

  it("clear: empty STUDIO_ORIGINAL_INLINE_TRANSLATE_ATTR coerces to null (translate not set to empty string)", () => {
    const e = div();
    e.setAttribute(STUDIO_ORIGINAL_INLINE_TRANSLATE_ATTR, "");
    const ops = buildClearPathOffsetPatches(e);
    expect(ops.find((o) => o.property === "translate")?.value).toBeNull();
  });
});

/* ── Box size ────────────────────────────────────────────────────────────── */

describe("buildBoxSizePatches / buildClearBoxSizePatches", () => {
  function populatedBoxEl(): HTMLElement {
    const e = div();
    e.style.setProperty(STUDIO_WIDTH_PROP, "300px");
    e.style.setProperty(STUDIO_HEIGHT_PROP, "200px");
    e.style.setProperty("width", "300px");
    e.style.setProperty("height", "200px");
    e.style.setProperty("min-width", "100px");
    e.style.setProperty("min-height", "50px");
    e.style.setProperty("max-width", "500px");
    e.style.setProperty("max-height", "400px");
    e.style.setProperty("flex-basis", "auto");
    e.style.setProperty("flex-grow", "1");
    e.style.setProperty("flex-shrink", "0");
    e.style.setProperty("box-sizing", "border-box");
    e.style.setProperty("scale", "1.5");
    e.style.setProperty("transform-origin", "center");
    e.style.setProperty("display", "block");
    e.setAttribute(STUDIO_ORIGINAL_WIDTH_ATTR, "250px");
    e.setAttribute(STUDIO_ORIGINAL_HEIGHT_ATTR, "150px");
    e.setAttribute(STUDIO_ORIGINAL_MIN_WIDTH_ATTR, "0px");
    e.setAttribute(STUDIO_ORIGINAL_MIN_HEIGHT_ATTR, "0px");
    e.setAttribute(STUDIO_ORIGINAL_MAX_WIDTH_ATTR, "none");
    e.setAttribute(STUDIO_ORIGINAL_MAX_HEIGHT_ATTR, "none");
    e.setAttribute(STUDIO_ORIGINAL_FLEX_BASIS_ATTR, "0px");
    e.setAttribute(STUDIO_ORIGINAL_FLEX_GROW_ATTR, "0");
    e.setAttribute(STUDIO_ORIGINAL_FLEX_SHRINK_ATTR, "1");
    e.setAttribute(STUDIO_ORIGINAL_BOX_SIZING_ATTR, "content-box");
    e.setAttribute(STUDIO_ORIGINAL_SCALE_ATTR, "1");
    e.setAttribute(STUDIO_ORIGINAL_TRANSFORM_ORIGIN_ATTR, "50% 50%");
    e.setAttribute(STUDIO_ORIGINAL_DISPLAY_ATTR, "flex");
    e.setAttribute(STUDIO_ORIGINAL_TRANSFORM_DISPLAY_ATTR, "");
    return e;
  }

  it("populated: captures studio-width/height, all BOX_SIZE_STYLE_PROPS, marker, and all orig attrs", () => {
    const ops = buildBoxSizePatches(populatedBoxEl());
    expect(ops).toEqual([
      { type: "inline-style", property: STUDIO_WIDTH_PROP, value: "300px" },
      { type: "inline-style", property: STUDIO_HEIGHT_PROP, value: "200px" },
      { type: "inline-style", property: "width", value: "300px" },
      { type: "inline-style", property: "height", value: "200px" },
      { type: "inline-style", property: "min-width", value: "100px" },
      { type: "inline-style", property: "min-height", value: "50px" },
      { type: "inline-style", property: "max-width", value: "500px" },
      { type: "inline-style", property: "max-height", value: "400px" },
      { type: "inline-style", property: "flex-basis", value: "auto" },
      { type: "inline-style", property: "flex-grow", value: "1" },
      { type: "inline-style", property: "flex-shrink", value: "0" },
      { type: "inline-style", property: "box-sizing", value: "border-box" },
      { type: "inline-style", property: "scale", value: "1.5" },
      { type: "inline-style", property: "transform-origin", value: "center" },
      { type: "inline-style", property: "display", value: "block" },
      { type: "attribute", property: STUDIO_BOX_SIZE_ATTR, value: "true" },
      { type: "attribute", property: STUDIO_ORIGINAL_WIDTH_ATTR, value: "250px" },
      { type: "attribute", property: STUDIO_ORIGINAL_HEIGHT_ATTR, value: "150px" },
      { type: "attribute", property: STUDIO_ORIGINAL_MIN_WIDTH_ATTR, value: "0px" },
      { type: "attribute", property: STUDIO_ORIGINAL_MIN_HEIGHT_ATTR, value: "0px" },
      { type: "attribute", property: STUDIO_ORIGINAL_MAX_WIDTH_ATTR, value: "none" },
      { type: "attribute", property: STUDIO_ORIGINAL_MAX_HEIGHT_ATTR, value: "none" },
      { type: "attribute", property: STUDIO_ORIGINAL_FLEX_BASIS_ATTR, value: "0px" },
      { type: "attribute", property: STUDIO_ORIGINAL_FLEX_GROW_ATTR, value: "0" },
      { type: "attribute", property: STUDIO_ORIGINAL_FLEX_SHRINK_ATTR, value: "1" },
      { type: "attribute", property: STUDIO_ORIGINAL_BOX_SIZING_ATTR, value: "content-box" },
      { type: "attribute", property: STUDIO_ORIGINAL_SCALE_ATTR, value: "1" },
      { type: "attribute", property: STUDIO_ORIGINAL_TRANSFORM_ORIGIN_ATTR, value: "50% 50%" },
      { type: "attribute", property: STUDIO_ORIGINAL_DISPLAY_ATTR, value: "flex" },
      { type: "attribute", property: STUDIO_ORIGINAL_TRANSFORM_DISPLAY_ATTR, value: "" },
    ]);
  });

  it("empty: bare element yields only the box-size marker", () => {
    expect(buildBoxSizePatches(div())).toEqual([
      { type: "attribute", property: STUDIO_BOX_SIZE_ATTR, value: "true" },
    ]);
  });

  it("clear(populated): ops follow interleaved restore-then-null order for every orig attr", () => {
    const ops = buildClearBoxSizePatches(populatedBoxEl());
    expect(ops).toEqual([
      { type: "inline-style", property: STUDIO_WIDTH_PROP, value: null },
      { type: "inline-style", property: STUDIO_HEIGHT_PROP, value: null },
      { type: "attribute", property: STUDIO_BOX_SIZE_ATTR, value: null },
      { type: "inline-style", property: "width", value: "250px" },
      { type: "attribute", property: STUDIO_ORIGINAL_WIDTH_ATTR, value: null },
      { type: "inline-style", property: "height", value: "150px" },
      { type: "attribute", property: STUDIO_ORIGINAL_HEIGHT_ATTR, value: null },
      // Measurements, so they are cleared without restoring a style.
      { type: "attribute", property: STUDIO_ORIGINAL_BOX_WIDTH_ATTR, value: null },
      { type: "attribute", property: STUDIO_ORIGINAL_BOX_HEIGHT_ATTR, value: null },
      { type: "inline-style", property: "min-width", value: "0px" },
      { type: "attribute", property: STUDIO_ORIGINAL_MIN_WIDTH_ATTR, value: null },
      { type: "inline-style", property: "min-height", value: "0px" },
      { type: "attribute", property: STUDIO_ORIGINAL_MIN_HEIGHT_ATTR, value: null },
      { type: "inline-style", property: "max-width", value: "none" },
      { type: "attribute", property: STUDIO_ORIGINAL_MAX_WIDTH_ATTR, value: null },
      { type: "inline-style", property: "max-height", value: "none" },
      { type: "attribute", property: STUDIO_ORIGINAL_MAX_HEIGHT_ATTR, value: null },
      { type: "inline-style", property: "flex-basis", value: "0px" },
      { type: "attribute", property: STUDIO_ORIGINAL_FLEX_BASIS_ATTR, value: null },
      { type: "inline-style", property: "flex-grow", value: "0" },
      { type: "attribute", property: STUDIO_ORIGINAL_FLEX_GROW_ATTR, value: null },
      { type: "inline-style", property: "flex-shrink", value: "1" },
      { type: "attribute", property: STUDIO_ORIGINAL_FLEX_SHRINK_ATTR, value: null },
      { type: "inline-style", property: "box-sizing", value: "content-box" },
      { type: "attribute", property: STUDIO_ORIGINAL_BOX_SIZING_ATTR, value: null },
      { type: "inline-style", property: "scale", value: "1" },
      { type: "attribute", property: STUDIO_ORIGINAL_SCALE_ATTR, value: null },
      { type: "inline-style", property: "transform-origin", value: "50% 50%" },
      { type: "attribute", property: STUDIO_ORIGINAL_TRANSFORM_ORIGIN_ATTR, value: null },
      { type: "inline-style", property: "display", value: "flex" },
      { type: "attribute", property: STUDIO_ORIGINAL_DISPLAY_ATTR, value: null },
      { type: "attribute", property: STUDIO_ORIGINAL_TRANSFORM_DISPLAY_ATTR, value: null },
    ]);
  });

  it("clear: empty orig attr coerces to null (style is removed rather than set to empty string)", () => {
    const e = div();
    e.setAttribute(STUDIO_ORIGINAL_WIDTH_ATTR, "");
    const ops = buildClearBoxSizePatches(e);
    expect(ops.find((o) => o.property === "width")?.value).toBeNull();
  });

  it("clear: bare element emits only null ops — no style restores fire when orig attrs are absent", () => {
    const ops = buildClearBoxSizePatches(div());
    // 3 fixed (studio-width, studio-height, box-size marker) + 16 attr-null pushes (one per BOX_SIZE_ORIG_ATTR)
    expect(ops).toHaveLength(19);
    expect(ops.every((op) => op.value === null)).toBe(true);
  });

  it("backfills the measured box on a legacy element that already has the resize marker", () => {
    const e = div();
    e.setAttribute(STUDIO_BOX_SIZE_ATTR, "true");
    Object.defineProperties(e, {
      offsetWidth: { configurable: true, value: 630 },
      offsetHeight: { configurable: true, value: 252 },
    });

    applyStudioBoxSize(e, { width: 320, height: 128 });

    expect(e.getAttribute(STUDIO_ORIGINAL_BOX_WIDTH_ATTR)).toBe("630");
    expect(e.getAttribute(STUDIO_ORIGINAL_BOX_HEIGHT_ATTR)).toBe("252");
  });

  it("build/clear symmetry: clear addresses every {type,property} key that build emits", () => {
    const e = populatedBoxEl();
    assertClearCoversKeys(buildBoxSizePatches(e), buildClearBoxSizePatches(e));
  });
});

/* ── Rotation ────────────────────────────────────────────────────────────── */

describe("buildClearRotationPatches", () => {
  it("clear: restores rotate and transform-origin from orig attrs, nulls draft attr", () => {
    const e = div();
    e.setAttribute(STUDIO_ORIGINAL_INLINE_ROTATE_ATTR, "30deg");
    e.setAttribute(STUDIO_ORIGINAL_ROTATION_TRANSFORM_ORIGIN_ATTR, "top left");
    e.setAttribute(STUDIO_ORIGINAL_TRANSFORM_DISPLAY_ATTR, "grid");
    const ops = buildClearRotationPatches(e);
    expect(ops).toEqual([
      { type: "inline-style", property: STUDIO_ROTATION_PROP, value: null },
      { type: "inline-style", property: "rotate", value: "30deg" },
      { type: "inline-style", property: "transform-origin", value: "top left" },
      { type: "attribute", property: STUDIO_ROTATION_ATTR, value: null },
      { type: "attribute", property: STUDIO_ROTATION_DRAFT_ATTR, value: null },
      { type: "attribute", property: STUDIO_ORIGINAL_ROTATE_ATTR, value: null },
      { type: "attribute", property: STUDIO_ORIGINAL_INLINE_ROTATE_ATTR, value: null },
      { type: "attribute", property: STUDIO_ORIGINAL_ROTATION_TRANSFORM_ORIGIN_ATTR, value: null },
      { type: "inline-style", property: "display", value: "grid" },
      { type: "attribute", property: STUDIO_ORIGINAL_TRANSFORM_DISPLAY_ATTR, value: null },
    ]);
  });

  it("clear: absent STUDIO_ORIGINAL_ROTATION_TRANSFORM_ORIGIN_ATTR yields null for transform-origin", () => {
    const ops = buildClearRotationPatches(div());
    expect(ops.find((o) => o.property === "transform-origin")?.value).toBeNull();
  });

  it("clear: empty STUDIO_ORIGINAL_INLINE_ROTATE_ATTR coerces to null (rotate not set to empty string)", () => {
    const e = div();
    e.setAttribute(STUDIO_ORIGINAL_INLINE_ROTATE_ATTR, "");
    const ops = buildClearRotationPatches(e);
    expect(ops.find((o) => o.property === "rotate")?.value).toBeNull();
  });
});

/* ── Motion ──────────────────────────────────────────────────────────────── */

describe("buildMotionPatches / buildClearMotionPatches", () => {
  const MOTION_JSON = '{"kind":"gsap-motion","start":0,"duration":1}';

  function populatedMotionEl(): HTMLElement {
    const e = div();
    e.setAttribute(STUDIO_MOTION_ATTR, MOTION_JSON);
    e.setAttribute(STUDIO_MOTION_ORIGINAL_TRANSFORM_ATTR, "translateX(0)");
    e.setAttribute(STUDIO_MOTION_ORIGINAL_OPACITY_ATTR, "1");
    e.setAttribute(STUDIO_MOTION_ORIGINAL_VISIBILITY_ATTR, "visible");
    return e;
  }

  it("populated: captures motion JSON and all three original attrs when motion attr is present", () => {
    const ops = buildMotionPatches(populatedMotionEl());
    expect(ops).toEqual([
      { type: "attribute", property: STUDIO_MOTION_ATTR, value: MOTION_JSON },
      {
        type: "attribute",
        property: STUDIO_MOTION_ORIGINAL_TRANSFORM_ATTR,
        value: "translateX(0)",
      },
      { type: "attribute", property: STUDIO_MOTION_ORIGINAL_OPACITY_ATTR, value: "1" },
      { type: "attribute", property: STUDIO_MOTION_ORIGINAL_VISIBILITY_ATTR, value: "visible" },
    ]);
  });

  it("empty: returns [] when STUDIO_MOTION_ATTR is absent", () => {
    expect(buildMotionPatches(div())).toEqual([]);
  });

  it("clear: always nulls all four motion attrs regardless of element state", () => {
    const expected = [
      { type: "attribute", property: STUDIO_MOTION_ATTR, value: null },
      { type: "attribute", property: STUDIO_MOTION_ORIGINAL_TRANSFORM_ATTR, value: null },
      { type: "attribute", property: STUDIO_MOTION_ORIGINAL_OPACITY_ATTR, value: null },
      { type: "attribute", property: STUDIO_MOTION_ORIGINAL_VISIBILITY_ATTR, value: null },
    ];
    expect(buildClearMotionPatches(div())).toEqual(expected);
    expect(buildClearMotionPatches(populatedMotionEl())).toEqual(expected);
  });

  it("build/clear symmetry: clear addresses every {type,property} key that build emits", () => {
    const e = populatedMotionEl();
    assertClearCoversKeys(buildMotionPatches(e), buildClearMotionPatches(e));
  });
});
