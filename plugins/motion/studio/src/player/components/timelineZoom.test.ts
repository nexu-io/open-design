import { describe, expect, it } from "vitest";
import {
  clampTimelineZoomPercent,
  computePinnedZoomPercent,
  getMaxTimelineZoomPercent,
  getNextTimelineZoomPercent,
  getPinchTimelineZoomPercent,
  getTimelinePixelsPerSecond,
  getTimelineZoomPercent,
  MIN_TIMELINE_ZOOM_PERCENT,
  TIMELINE_RANGE_MARGIN_PX,
  timelineZoomPercentToSlider,
  timelineSliderToZoomPercent,
  zoomToSelectedClips,
} from "./timelineZoom";

const FIT_PPS = 12;
const MAX_ZOOM_PERCENT = 12_000;

describe("clampTimelineZoomPercent", () => {
  it("defaults invalid values to 100", () => {
    expect(clampTimelineZoomPercent(Number.NaN, FIT_PPS)).toBe(100);
  });

  it("clamps to the supported percent bounds", () => {
    expect(clampTimelineZoomPercent(1, FIT_PPS)).toBe(MIN_TIMELINE_ZOOM_PERCENT);
    expect(clampTimelineZoomPercent(100_000, FIT_PPS)).toBe(MAX_ZOOM_PERCENT);
  });

  it("zooms to a readable width for each 30fps frame instead of stopping at 2000%", () => {
    const fitPixelsPerSecond = 12;
    const percent = clampTimelineZoomPercent(100_000, fitPixelsPerSecond);

    expect(percent).toBe(12_000);
    expect(getTimelinePixelsPerSecond(fitPixelsPerSecond, "manual", percent)).toBe(1_440);
  });
});

describe("getTimelineZoomPercent", () => {
  it("treats fit mode as 100 percent", () => {
    expect(getTimelineZoomPercent("fit", 375, FIT_PPS)).toBe(100);
  });

  it("returns the clamped manual zoom percent", () => {
    expect(getTimelineZoomPercent("manual", 125.2, FIT_PPS)).toBe(125);
  });
});

describe("getTimelinePixelsPerSecond", () => {
  it("uses fit pixels per second in fit mode", () => {
    expect(getTimelinePixelsPerSecond(144, "fit", 250)).toBe(144);
  });

  it("scales from fit pixels per second in manual mode", () => {
    expect(getTimelinePixelsPerSecond(144, "manual", 125)).toBe(180);
  });
});

describe("getNextTimelineZoomPercent", () => {
  it("zooms out from fit relative to 100 percent", () => {
    expect(getNextTimelineZoomPercent("out", "fit", 375, FIT_PPS)).toBe(50);
  });

  it("zooms in from fit relative to 100 percent", () => {
    expect(getNextTimelineZoomPercent("in", "fit", 375, FIT_PPS)).toBe(200);
  });

  it("clamps the lower bound", () => {
    expect(getNextTimelineZoomPercent("out", "manual", MIN_TIMELINE_ZOOM_PERCENT, FIT_PPS)).toBe(
      MIN_TIMELINE_ZOOM_PERCENT,
    );
  });

  it("clamps the upper bound", () => {
    expect(getNextTimelineZoomPercent("in", "manual", MAX_ZOOM_PERCENT, FIT_PPS)).toBe(
      MAX_ZOOM_PERCENT,
    );
  });
});

describe("getPinchTimelineZoomPercent", () => {
  it("zooms in for upward pinch wheel deltas", () => {
    expect(getPinchTimelineZoomPercent(-80, "fit", 100, FIT_PPS)).toBeGreaterThan(100);
  });

  it("zooms out for downward pinch wheel deltas", () => {
    expect(getPinchTimelineZoomPercent(80, "manual", 200, FIT_PPS)).toBeLessThan(200);
  });

  it("keeps the current zoom for zero or invalid deltas", () => {
    expect(getPinchTimelineZoomPercent(0, "manual", 180, FIT_PPS)).toBe(180);
    expect(getPinchTimelineZoomPercent(Number.NaN, "manual", 180, FIT_PPS)).toBe(180);
  });

  it("clamps pinch zoom to the supported range", () => {
    expect(getPinchTimelineZoomPercent(10000, "manual", 100, FIT_PPS)).toBe(
      MIN_TIMELINE_ZOOM_PERCENT,
    );
    expect(getPinchTimelineZoomPercent(-10000, "manual", 100, FIT_PPS)).toBe(MAX_ZOOM_PERCENT);
  });
});

describe("timelineZoomPercentToSlider", () => {
  it("maps min zoom to slider position 0", () => {
    expect(timelineZoomPercentToSlider(MIN_TIMELINE_ZOOM_PERCENT, FIT_PPS)).toBeCloseTo(0, 5);
  });

  it("maps max zoom to slider position 100", () => {
    expect(timelineZoomPercentToSlider(MAX_ZOOM_PERCENT, FIT_PPS)).toBeCloseTo(100, 5);
  });

  it("maps 100% onto the dynamic log range", () => {
    const expected =
      ((Math.log(100) - Math.log(10)) / (Math.log(MAX_ZOOM_PERCENT) - Math.log(10))) * 100;
    expect(timelineZoomPercentToSlider(100, FIT_PPS)).toBeCloseTo(expected, 3);
  });
});

describe("timelineSliderToZoomPercent", () => {
  it("maps slider 0 to min zoom", () => {
    expect(timelineSliderToZoomPercent(0, FIT_PPS)).toBe(MIN_TIMELINE_ZOOM_PERCENT);
  });

  it("maps slider 100 to max zoom", () => {
    expect(timelineSliderToZoomPercent(100, FIT_PPS)).toBe(MAX_ZOOM_PERCENT);
  });
});

describe("computePinnedZoomPercent", () => {
  it("returns 100 when current pps equals the fit pps (a no-op pin at the current fit)", () => {
    expect(computePinnedZoomPercent(42, 42)).toBe(100);
  });

  it("reproduces the current pps: percent × fitPps / 100 === currentPps", () => {
    const fitPps = 20;
    const currentPps = 50; // user zoomed in 2.5×
    const percent = computePinnedZoomPercent(currentPps, fitPps);
    expect(percent).toBe(250);
    // Round-trips through getTimelinePixelsPerSecond back to the on-screen pps.
    expect(getTimelinePixelsPerSecond(fitPps, "manual", percent)).toBeCloseTo(currentPps, 5);
  });

  it("clamps a pin that would exceed the manual-zoom bounds", () => {
    // currentPps 10000 / fitPps 1 = 1_000_000% → clamped to MAX.
    expect(computePinnedZoomPercent(10000, 1)).toBe(getMaxTimelineZoomPercent(1));
    // Tiny ratio → clamped up to MIN.
    expect(computePinnedZoomPercent(0.001, 1000)).toBe(MIN_TIMELINE_ZOOM_PERCENT);
  });

  it("falls back to 100 for unusable inputs (a safe no-op pin)", () => {
    expect(computePinnedZoomPercent(Number.NaN, 20)).toBe(100);
    expect(computePinnedZoomPercent(50, 0)).toBe(100);
    expect(computePinnedZoomPercent(-5, 20)).toBe(100);
    expect(computePinnedZoomPercent(50, Number.POSITIVE_INFINITY)).toBe(100);
  });
});

const VIEW = { viewportWidth: 1080, contentOrigin: 32, fitPixelsPerSecond: 10 };

describe("zoomToSelectedClips", () => {
  const usable = VIEW.viewportWidth - VIEW.contentOrigin - TIMELINE_RANGE_MARGIN_PX * 2;

  it("returns the span and the percent that fits it between the margins", () => {
    expect(zoomToSelectedClips({ ...VIEW, clips: [{ start: 10, end: 20 }] })).toEqual({
      start: 10,
      end: 20,
      zoomPercent: (usable / 10 / VIEW.fitPixelsPerSecond) * 100,
    });
  });

  it("unions several clips and skips a zero-length entry", () => {
    expect(
      zoomToSelectedClips({
        ...VIEW,
        clips: [
          { start: 28, end: 30 },
          { start: 10, end: 12 },
          { start: 0, end: 0 },
        ],
      }),
    ).toEqual({
      start: 10,
      end: 30,
      zoomPercent: (usable / 20 / VIEW.fitPixelsPerSecond) * 100,
    });
  });

  it("returns null when nothing selectable is passed or the timeline is collapsed", () => {
    expect(zoomToSelectedClips({ ...VIEW, clips: [] })).toBeNull();
    expect(zoomToSelectedClips({ ...VIEW, clips: [{ start: 4, end: 4 }] })).toBeNull();
    expect(
      zoomToSelectedClips({
        ...VIEW,
        viewportWidth: VIEW.contentOrigin,
        clips: [{ start: 0, end: 1 }],
      }),
    ).toBeNull();
    expect(
      zoomToSelectedClips({ ...VIEW, viewportWidth: 0, clips: [{ start: 0, end: 1 }] }),
    ).toBeNull();
  });
});

describe("timelineZoomPercentToSlider / timelineSliderToZoomPercent round-trip", () => {
  for (const percent of [10, 100, 500, 2000, MAX_ZOOM_PERCENT]) {
    it(`round-trips ${percent}% within ±1%`, () => {
      const slider = timelineZoomPercentToSlider(percent, FIT_PPS);
      const back = timelineSliderToZoomPercent(slider, FIT_PPS);
      expect(Math.abs(back - percent) / percent).toBeLessThan(0.01);
    });
  }
});
