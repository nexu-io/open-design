import { describe, expect, it } from "vitest";
import type { TimelineElement } from "../../player";
import {
  buildInsetClipPathSides,
  buildStrokeStyleUpdates,
  buildStrokeWidthStyleUpdates,
  getClipPathInsetPx,
  getCssFilterFunctionPx,
  inferBoxShadowPreset,
  inferClipPathPreset,
  normalizePanelPxValue,
  parseInsetClipPathSides,
  setCssFilterFunctionPx,
} from "./PropertyPanel";
import { isSelectedElementHidden } from "./propertyPanelHelpers";

describe("PropertyPanel style helpers", () => {
  it("normalizes bounded pixel values without accepting incompatible units", () => {
    expect(normalizePanelPxValue("12", { min: 0, max: 40 })).toBe("12px");
    expect(normalizePanelPxValue("12.50px", { min: 0, max: 40 })).toBe("12.5px");
    expect(normalizePanelPxValue("-8", { min: 0, max: 40 })).toBe("0px");
    expect(normalizePanelPxValue("80px", { min: 0, max: 40 })).toBe("40px");
    expect(normalizePanelPxValue("1.2rem", { min: 0, max: 40 })).toBeNull();
    expect(normalizePanelPxValue("auto", { min: 0, max: 40 })).toBeNull();
  });

  it("adds, replaces, and removes a named filter function while preserving other filters", () => {
    expect(setCssFilterFunctionPx("none", "blur", 12)).toBe("blur(12px)");
    expect(setCssFilterFunctionPx("brightness(1.08)", "blur", 4.5)).toBe(
      "brightness(1.08) blur(4.5px)",
    );
    expect(setCssFilterFunctionPx("brightness(1.08) blur(12px) saturate(1.2)", "blur", 2)).toBe(
      "brightness(1.08) saturate(1.2) blur(2px)",
    );
    expect(setCssFilterFunctionPx("brightness(1.08) blur(12px)", "blur", 0)).toBe(
      "brightness(1.08)",
    );
    expect(setCssFilterFunctionPx("blur(12px)", "blur", 0)).toBe("none");
    expect(getCssFilterFunctionPx("brightness(1.08) blur(3.5px)", "blur")).toBe(3.5);
    expect(getCssFilterFunctionPx("drop-shadow(0 2px 8px black)", "blur")).toBe(0);
  });

  it("infers shadow and clip presets without losing custom values", () => {
    expect(inferBoxShadowPreset("none")).toBe("none");
    expect(inferBoxShadowPreset("0 12px 36px rgba(0, 0, 0, 0.28)")).toBe("soft");
    expect(inferBoxShadowPreset("0 2px 4px red")).toBe("custom");

    expect(inferClipPathPreset(undefined)).toBe("none");
    expect(inferClipPathPreset("inset(12px round 8px)")).toBe("inset");
    expect(inferClipPathPreset("circle(50% at 50% 50%)")).toBe("circle");
    expect(inferClipPathPreset("polygon(0 0, 100% 0, 100% 100%)")).toBe("custom");
    expect(getClipPathInsetPx("inset(12.5px round 8px)")).toBe(12.5);
    expect(getClipPathInsetPx("circle(50% at 50% 50%)")).toBe(0);
  });

  it("builds and parses 4-side inset clip paths without losing radius", () => {
    expect(buildInsetClipPathSides({ top: 10, right: 20, bottom: 30, left: 40 }, 6)).toBe(
      "inset(10px 20px 30px 40px round 6px)",
    );
    expect(parseInsetClipPathSides("inset(10px 20px 30px 40px round 6px)")).toEqual({
      top: 10,
      right: 20,
      bottom: 30,
      left: 40,
      radius: 6,
    });
  });

  it("emits the single-value inset form when all sides are equal", () => {
    expect(buildInsetClipPathSides({ top: 12.5, right: 12.5, bottom: 12.5, left: 12.5 })).toBe(
      "inset(12.5px)",
    );
    expect(parseInsetClipPathSides("inset(12.5px)")).toEqual({
      top: 12.5,
      right: 12.5,
      bottom: 12.5,
      left: 12.5,
      radius: 0,
    });
    expect(getClipPathInsetPx("inset(12.5px 12.5px 12.5px 12.5px)")).toBe(12.5);
  });

  it("accepts CSS shorthand inset values and rejects unsupported clip paths", () => {
    expect(parseInsetClipPathSides("inset(10px 20px)")).toEqual({
      top: 10,
      right: 20,
      bottom: 10,
      left: 20,
      radius: 0,
    });
    expect(parseInsetClipPathSides("inset(10px 20px 30px)")).toEqual({
      top: 10,
      right: 20,
      bottom: 30,
      left: 20,
      radius: 0,
    });
    expect(parseInsetClipPathSides("inset(10%)")).toBeNull();
    expect(parseInsetClipPathSides("circle(50% at 50% 50%)")).toBeNull();
  });

  it("keeps stroke width and style edits visually effective", () => {
    expect(buildStrokeWidthStyleUpdates("3px", "none")).toEqual([
      ["border-width", "3px"],
      ["border-style", "solid"],
    ]);
    expect(buildStrokeWidthStyleUpdates("0px", "none")).toEqual([["border-width", "0px"]]);
    expect(buildStrokeWidthStyleUpdates("3px", "dashed")).toEqual([["border-width", "3px"]]);

    expect(buildStrokeStyleUpdates("dashed", "0px")).toEqual([
      ["border-style", "dashed"],
      ["border-width", "1px"],
    ]);
    expect(buildStrokeStyleUpdates("none", "4px")).toEqual([["border-style", "none"]]);
    expect(buildStrokeStyleUpdates("solid", "4px")).toEqual([["border-style", "solid"]]);
  });
});

describe("isSelectedElementHidden", () => {
  it("reads hidden state by selected timeline id or key", () => {
    const elements: TimelineElement[] = [
      { id: "visible", tag: "div", start: 0, duration: 1, track: 0 },
      { id: "hidden", tag: "div", start: 0, duration: 1, track: 0, hidden: true },
      {
        id: "keyed-hidden",
        key: "scene.html:#keyed-hidden",
        tag: "div",
        start: 0,
        duration: 1,
        track: 0,
        hidden: true,
      },
    ];

    expect(isSelectedElementHidden(elements, null)).toBe(false);
    expect(isSelectedElementHidden(elements, "visible")).toBe(false);
    expect(isSelectedElementHidden(elements, "hidden")).toBe(true);
    expect(isSelectedElementHidden(elements, "scene.html:#keyed-hidden")).toBe(true);
  });
});
