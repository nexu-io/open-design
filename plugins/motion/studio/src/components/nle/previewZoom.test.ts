// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import {
  DEFAULT_PREVIEW_ZOOM,
  MAX_PREVIEW_ZOOM_PERCENT,
  MIN_PREVIEW_ZOOM_PERCENT,
  canStartPreviewPan,
  clampPreviewPan,
  clampPreviewZoomPercent,
  getNextPreviewZoomPercent,
  getPreviewWheelZoomPercent,
  ownsPreviewPanTarget,
  PREVIEW_PAN_OVERSCROLL_PX,
  PREVIEW_PAN_SURFACE_SELECTOR,
  resolvePreviewVisibleRegion,
  resolvePreviewWheelPan,
  resolvePreviewWheelZoom,
  toDomPrecision,
} from "./previewZoom";

describe("toDomPrecision", () => {
  it("rounds to 4 decimal places", () => {
    expect(toDomPrecision(1.23456789)).toBe(1.2346);
  });

  it("preserves zero", () => {
    expect(toDomPrecision(0)).toBe(0);
  });

  it("handles negative values", () => {
    expect(toDomPrecision(-3.14159)).toBe(-3.1416);
  });
});

describe("clampPreviewZoomPercent", () => {
  it("falls back to fit zoom for invalid input", () => {
    expect(clampPreviewZoomPercent(Number.NaN)).toBe(100);
  });

  it("clamps to supported preview zoom bounds", () => {
    expect(clampPreviewZoomPercent(1)).toBe(MIN_PREVIEW_ZOOM_PERCENT);
    expect(clampPreviewZoomPercent(5000)).toBe(MAX_PREVIEW_ZOOM_PERCENT);
  });
});

describe("getPreviewWheelZoomPercent", () => {
  it("zooms in on negative deltaY (scroll up / pinch out)", () => {
    expect(getPreviewWheelZoomPercent(-5, 100)).toBeGreaterThan(100);
  });

  it("zooms out on positive deltaY (scroll down / pinch in)", () => {
    expect(getPreviewWheelZoomPercent(5, 200)).toBeLessThan(200);
  });

  it("clamps large deltas to prevent overshoot", () => {
    const small = getPreviewWheelZoomPercent(-5, 100);
    const large = getPreviewWheelZoomPercent(-50, 100);
    expect(large).toBeLessThan(small * 2);
  });

  it("preserves the current zoom for invalid input", () => {
    expect(getPreviewWheelZoomPercent(Number.NaN, 180)).toBe(180);
  });
});

describe("getNextPreviewZoomPercent", () => {
  it("steps preview zoom in and out", () => {
    expect(getNextPreviewZoomPercent("in", 100)).toBe(125);
    expect(getNextPreviewZoomPercent("out", 125)).toBe(100);
  });
});

describe("clampPreviewPan", () => {
  it("allows a small overscroll margin at fit zoom", () => {
    const next = clampPreviewPan({
      panX: 900,
      panY: -900,
      zoomPercent: 100,
      viewportWidth: 800,
      viewportHeight: 600,
    });

    expect(next.panX).toBe(PREVIEW_PAN_OVERSCROLL_PX);
    expect(next.panY).toBe(-PREVIEW_PAN_OVERSCROLL_PX);
  });

  it("keeps pan within the zoomed preview bounds", () => {
    expect(
      clampPreviewPan({
        panX: 900,
        panY: -900,
        zoomPercent: 200,
        viewportWidth: 800,
        viewportHeight: 600,
      }),
    ).toEqual({
      panX: 400 + PREVIEW_PAN_OVERSCROLL_PX,
      panY: -(300 + PREVIEW_PAN_OVERSCROLL_PX),
    });
  });

  it("allows overscroll even when only one axis overflows", () => {
    expect(
      clampPreviewPan({
        panX: 120,
        panY: -90,
        zoomPercent: 107.25,
        viewportWidth: 1352,
        viewportHeight: 682,
        contentWidth: 1184,
        contentHeight: 666,
      }),
    ).toEqual({
      panX: PREVIEW_PAN_OVERSCROLL_PX,
      panY: -(16.142499999999984 + PREVIEW_PAN_OVERSCROLL_PX),
    });
  });
});

describe("canStartPreviewPan", () => {
  it("allows middle mouse pan at fit zoom", () => {
    expect(canStartPreviewPan(1)).toBe(true);
  });

  it("allows middle mouse pan when zoomed in", () => {
    expect(canStartPreviewPan(1)).toBe(true);
  });

  it("rejects other mouse buttons", () => {
    expect(canStartPreviewPan(0)).toBe(false);
    expect(canStartPreviewPan(2)).toBe(false);
  });
});

describe("ownsPreviewPanTarget", () => {
  it("accepts targets inside the preview stage", () => {
    const stage = document.createElement("div");
    const child = document.createElement("div");
    stage.appendChild(child);

    expect(ownsPreviewPanTarget(child, stage)).toBe(true);
  });

  it("accepts targets inside the shared preview pan surface", () => {
    const surface = document.createElement("div");
    surface.setAttribute("data-preview-pan-surface", "true");
    const overlay = document.createElement("div");
    surface.appendChild(overlay);

    expect(ownsPreviewPanTarget(overlay, null)).toBe(true);
  });

  it("rejects targets outside the preview stage and preview pan surface", () => {
    const outside = document.createElement("div");

    expect(ownsPreviewPanTarget(outside, null)).toBe(false);
  });

  it("uses the shared preview pan surface selector contract", () => {
    expect(PREVIEW_PAN_SURFACE_SELECTOR).toBe('[data-preview-pan-surface="true"]');
  });
});

describe("resolvePreviewWheelZoom", () => {
  it("zooms in from center without shifting pan", () => {
    const next = resolvePreviewWheelZoom({
      state: DEFAULT_PREVIEW_ZOOM,
      deltaY: -5,
      viewportWidth: 800,
      viewportHeight: 600,
    });

    expect(next.zoomPercent).toBeGreaterThan(100);
    expect(next.panX).toBe(0);
    expect(next.panY).toBe(0);
  });

  it("preserves small pan inside the overscroll margin when zooming out past minimum", () => {
    const next = resolvePreviewWheelZoom({
      state: { zoomPercent: 26, panX: 20, panY: 20 },
      deltaY: 500,
      viewportWidth: 800,
      viewportHeight: 600,
    });

    expect(next.zoomPercent).toBeCloseTo(MIN_PREVIEW_ZOOM_PERCENT, 0);
    expect(next.panX).toBe(20);
    expect(next.panY).toBe(20);
  });

  it("zooms toward the cursor when cursorX/cursorY are provided", () => {
    const next = resolvePreviewWheelZoom({
      state: DEFAULT_PREVIEW_ZOOM,
      deltaY: -5,
      viewportWidth: 800,
      viewportHeight: 600,
      cursorX: 200,
      cursorY: 100,
    });

    expect(next.zoomPercent).toBeGreaterThan(100);
    expect(next.panX).toBeLessThan(0);
    expect(next.panY).toBeLessThan(0);
  });

  it("keeps pan at zero when cursor is at viewport center", () => {
    const next = resolvePreviewWheelZoom({
      state: DEFAULT_PREVIEW_ZOOM,
      deltaY: -5,
      viewportWidth: 800,
      viewportHeight: 600,
      cursorX: 0,
      cursorY: 0,
    });

    expect(next.zoomPercent).toBeGreaterThan(100);
    expect(next.panX).toBe(0);
    expect(next.panY).toBe(0);
  });

  it("scales pan proportionally when cursor is at center", () => {
    const next = resolvePreviewWheelZoom({
      state: { zoomPercent: 200, panX: 50, panY: 30 },
      deltaY: -5,
      viewportWidth: 800,
      viewportHeight: 600,
      contentWidth: 800,
      contentHeight: 450,
      cursorX: 0,
      cursorY: 0,
    });

    const ratio = next.zoomPercent / 200;
    expect(next.panX).toBeCloseTo(50 * ratio, 1);
    expect(next.panY).toBeCloseTo(30 * ratio, 1);
  });

  it("keeps the content point under a non-center cursor fixed after zoom", () => {
    const cursorX = 150;
    const cursorY = -80;
    const state: PreviewZoomState = { zoomPercent: 150, panX: 20, panY: -10 };
    const oldScale = state.zoomPercent / 100;

    const next = resolvePreviewWheelZoom({
      state,
      deltaY: -5,
      viewportWidth: 800,
      viewportHeight: 600,
      contentWidth: 800,
      contentHeight: 450,
      cursorX,
      cursorY,
    });

    const newScale = next.zoomPercent / 100;
    const contentXBefore = (cursorX - state.panX) / oldScale;
    const contentXAfter = (cursorX - next.panX) / newScale;
    const contentYBefore = (cursorY - state.panY) / oldScale;
    const contentYAfter = (cursorY - next.panY) / newScale;

    expect(contentXAfter).toBeCloseTo(contentXBefore, 6);
    expect(contentYAfter).toBeCloseTo(contentYBefore, 6);
  });

  it("uses wider pan range for cursor zoom than manual drag", () => {
    let state: PreviewZoomState = { zoomPercent: 100, panX: 0, panY: 0 };
    for (let i = 0; i < 40; i++) {
      state = resolvePreviewWheelZoom({
        state,
        deltaY: 5,
        viewportWidth: 800,
        viewportHeight: 600,
        contentWidth: 800,
        contentHeight: 450,
        cursorX: -300,
        cursorY: 0,
      });
    }

    expect(state.zoomPercent).toBeLessThan(100);

    const dragClamped = clampPreviewPan({
      panX: state.panX,
      panY: state.panY,
      zoomPercent: state.zoomPercent,
      viewportWidth: 800,
      viewportHeight: 600,
      contentWidth: 800,
      contentHeight: 450,
    });

    expect(Math.abs(state.panX)).toBeGreaterThan(Math.abs(dragClamped.panX));
  });
});

describe("resolvePreviewWheelPan", () => {
  it("moves preview pan from wheel deltas", () => {
    const next = resolvePreviewWheelPan({
      state: DEFAULT_PREVIEW_ZOOM,
      deltaX: 18,
      deltaY: -12,
      viewportWidth: 800,
      viewportHeight: 600,
    });

    expect(next.zoomPercent).toBe(100);
    expect(next.panX).toBe(-18);
    expect(next.panY).toBe(12);
  });

  it("keeps wheel pan inside overscroll bounds", () => {
    const next = resolvePreviewWheelPan({
      state: DEFAULT_PREVIEW_ZOOM,
      deltaX: -900,
      deltaY: 900,
      viewportWidth: 800,
      viewportHeight: 600,
    });

    expect(next.panX).toBe(PREVIEW_PAN_OVERSCROLL_PX);
    expect(next.panY).toBe(-PREVIEW_PAN_OVERSCROLL_PX);
  });
});

describe("resolvePreviewVisibleRegion", () => {
  const frame = { viewportWidth: 1000, viewportHeight: 600, contentWidth: 800, contentHeight: 450 };

  it("shows the whole frame at Fit", () => {
    expect(resolvePreviewVisibleRegion({ state: DEFAULT_PREVIEW_ZOOM, ...frame })).toEqual({
      left: 0,
      top: 0,
      width: 1,
      height: 1,
    });
  });

  it("shows the centre part at 200%, and the part the pan moved to", () => {
    const zoomed = { zoomPercent: 200, panX: 0, panY: 0 };
    const centre = resolvePreviewVisibleRegion({ state: zoomed, ...frame });
    expect(centre.width).toBeCloseTo(1000 / 1600);
    expect(centre.left).toBeCloseTo((1 - 1000 / 1600) / 2);
    expect(centre.height).toBeCloseTo(600 / 900);

    // Panning right by 300px brings the frame's left side into view.
    const panned = resolvePreviewVisibleRegion({ state: { ...zoomed, panX: 300 }, ...frame });
    expect(panned.left).toBeCloseTo(centre.left - 300 / 1600);
    expect(panned.width).toBeCloseTo(centre.width);
  });

  it("is the whole frame below 100%, and stops at the frame's edge in an overscroll", () => {
    const small = resolvePreviewVisibleRegion({
      state: { zoomPercent: 50, panX: 0, panY: 0 },
      ...frame,
    });
    expect(small).toEqual({ left: 0, top: 0, width: 1, height: 1 });

    const past = resolvePreviewVisibleRegion({
      state: { zoomPercent: 200, panX: 400, panY: 0 },
      ...frame,
    });
    expect(past.left).toBe(0);
    expect(past.width).toBeCloseTo((1000 / 2 - 400 + 800) / 1600);
  });
});
