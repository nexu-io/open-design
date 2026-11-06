import { describe, it, expect } from "vitest";
import {
  MARQUEE_DRAG_THRESHOLD_PX,
  isMarqueeDrag,
  isTimelineRulerPress,
  getMarqueeRect,
  getTimelineClipRect,
  getMarqueeClipCandidates,
  computeMarqueeSelection,
} from "./timelineMarquee";
import { createTimelineClipIndex } from "../lib/timelineClipIndex";
import type { TimelineElement } from "../store/playerStore";
import {
  GUTTER,
  LANE_H,
  TRACK_H,
  RULER_H,
  CLIP_Y,
  TRACKS_LEFT_PAD,
  createTimelineRowGeometry,
  getTimelineRowTop,
} from "./timelineLayout";

// Canvas-space time origin used by the breathing-pad (default) test cases: right
// edge of the sticky gutter + the left pad. Other cases pass GUTTER or LABEL_COL_W
// directly as contentOrigin to test the plain/keyframe-label-column origins.
const ORIGIN = GUTTER + TRACKS_LEFT_PAD;

describe("isTimelineRulerPress", () => {
  const rectTop = 500; // scroll container's viewport top

  it("treats a press inside the ruler band as a ruler press (unscrolled)", () => {
    expect(isTimelineRulerPress(rectTop, rectTop)).toBe(true);
    expect(isTimelineRulerPress(rectTop + RULER_H - 1, rectTop)).toBe(true);
  });

  it("treats a press below the ruler band as a body press", () => {
    expect(isTimelineRulerPress(rectTop + RULER_H, rectTop)).toBe(false);
    expect(isTimelineRulerPress(rectTop + RULER_H + 100, rectTop)).toBe(false);
  });

  it("stays a ruler press when the body is scrolled down (sticky ruler)", () => {
    // The ruler is position:sticky — scrolled down, its VISUAL band is still
    // the top RULER_H px of the container. Content-space math
    // (clientY - rectTop + scrollTop) would report y = 10 + 300 = 310 ≥ RULER_H
    // and misclassify this as a body/marquee press; viewport-space math must
    // still classify it as a ruler press regardless of scrollTop.
    const scrollTop = 300;
    const clientY = rectTop + 10; // visually on the stuck ruler
    const contentSpaceY = clientY - rectTop + scrollTop;
    expect(contentSpaceY).toBeGreaterThanOrEqual(RULER_H); // the old, broken signal
    expect(isTimelineRulerPress(clientY, rectTop)).toBe(true);
  });

  it("honors a custom ruler height", () => {
    expect(isTimelineRulerPress(rectTop + 30, rectTop, 32)).toBe(true);
    expect(isTimelineRulerPress(rectTop + 33, rectTop, 32)).toBe(false);
  });
});

describe("isMarqueeDrag", () => {
  it("treats sub-threshold movement as a click, not a drag", () => {
    expect(isMarqueeDrag(100, 50, 100, 50)).toBe(false);
    expect(
      isMarqueeDrag(
        100,
        50,
        100 + MARQUEE_DRAG_THRESHOLD_PX - 1,
        50 + MARQUEE_DRAG_THRESHOLD_PX - 1,
      ),
    ).toBe(false);
  });

  it("becomes a drag once either axis passes the threshold", () => {
    expect(isMarqueeDrag(100, 50, 100 + MARQUEE_DRAG_THRESHOLD_PX, 50)).toBe(true);
    expect(isMarqueeDrag(100, 50, 100, 50 + MARQUEE_DRAG_THRESHOLD_PX)).toBe(true);
    expect(isMarqueeDrag(100, 50, 100 - MARQUEE_DRAG_THRESHOLD_PX, 50)).toBe(true);
  });
});

describe("getMarqueeRect", () => {
  it("builds a rect from origin to current for a down-right drag", () => {
    expect(getMarqueeRect(10, 20, 110, 70)).toEqual({ left: 10, top: 20, width: 100, height: 50 });
  });

  it("normalizes negative drags (up-left) into a positive rect", () => {
    expect(getMarqueeRect(110, 70, 10, 20)).toEqual({ left: 10, top: 20, width: 100, height: 50 });
  });

  it("normalizes mixed-direction drags (down-left / up-right)", () => {
    expect(getMarqueeRect(110, 20, 10, 70)).toEqual({ left: 10, top: 20, width: 100, height: 50 });
    expect(getMarqueeRect(10, 70, 110, 20)).toEqual({ left: 10, top: 20, width: 100, height: 50 });
  });

  it("yields a zero-size rect when the pointer has not moved", () => {
    expect(getMarqueeRect(42, 42, 42, 42)).toEqual({ left: 42, top: 42, width: 0, height: 0 });
  });
});

describe("getTimelineClipRect", () => {
  const trackOrder = [0, 2, 5];
  const geometry = createTimelineRowGeometry(
    trackOrder,
    trackOrder.map(() => TRACK_H),
  );

  it("maps start/duration to x via pps and the track row to y via the shared row→y helper", () => {
    const rect = getTimelineClipRect({ start: 2, duration: 3, track: 2 }, geometry, 100, GUTTER);
    expect(rect).toEqual({
      left: GUTTER + 200,
      top: getTimelineRowTop(1) + CLIP_Y,
      width: 300,
      height: TRACK_H - CLIP_Y * 2,
    });
  });

  it("places the first visible track below the ruler + top breathing pad", () => {
    const rect = getTimelineClipRect({ start: 0, duration: 1, track: 0 }, geometry, 50, GUTTER);
    expect(rect?.top).toBe(getTimelineRowTop(0) + CLIP_Y);
    expect(rect?.left).toBe(GUTTER);
  });

  it("uses the row index in trackOrder, not the raw track number", () => {
    const rect = getTimelineClipRect({ start: 0, duration: 1, track: 5 }, geometry, 50, GUTTER);
    expect(rect?.top).toBe(getTimelineRowTop(2) + CLIP_Y);
  });

  it("uses cumulative tops and the resolved height for an expanded row", () => {
    const rowHeights = [TRACK_H + 2 * LANE_H, TRACK_H, TRACK_H];
    const expandedGeometry = createTimelineRowGeometry(trackOrder, rowHeights);
    const rect = getTimelineClipRect(
      { start: 0, duration: 1, track: 0 },
      expandedGeometry,
      50,
      GUTTER,
    );
    expect(rect).toMatchObject({
      top: getTimelineRowTop(0, rowHeights) + CLIP_Y,
      height: TRACK_H - CLIP_Y * 2,
    });
    expect(
      getTimelineClipRect({ start: 0, duration: 1, track: 2 }, expandedGeometry, 50, GUTTER)?.top,
    ).toBe(getTimelineRowTop(1, rowHeights) + CLIP_Y);
  });

  it("enforces the 4px minimum rendered width", () => {
    const rect = getTimelineClipRect({ start: 0, duration: 0.01, track: 0 }, geometry, 10, GUTTER);
    expect(rect?.width).toBe(4);
  });

  it("returns null for a track that is not displayed or an invalid pps", () => {
    expect(
      getTimelineClipRect({ start: 0, duration: 1, track: 9 }, geometry, 100, GUTTER),
    ).toBeNull();
    expect(
      getTimelineClipRect({ start: 0, duration: 1, track: 0 }, geometry, 0, GUTTER),
    ).toBeNull();
    expect(
      getTimelineClipRect({ start: 0, duration: 1, track: 0 }, geometry, NaN, GUTTER),
    ).toBeNull();
  });
});

describe("computeMarqueeSelection", () => {
  // Two visible tracks: row 0 = track 0, row 1 = track 1. pps 100.
  const trackOrder = [0, 1];
  const rowGeometry = createTimelineRowGeometry(
    trackOrder,
    trackOrder.map(() => TRACK_H),
  );
  const pps = 100;
  const clips = [
    { id: "a", start: 0, duration: 1, track: 0 }, // x [32,132], row 0
    { id: "b", start: 2, duration: 1, track: 0 }, // x [232,332], row 0
    { id: "c", start: 0.5, duration: 1, track: 1 }, // x [82,182], row 1
  ];
  const row0Top = getTimelineRowTop(0) + CLIP_Y;
  const row1Top = getTimelineRowTop(1) + CLIP_Y;

  it("selects only the clips the marquee rect intersects", () => {
    const marquee = { left: ORIGIN, top: row0Top, width: 50, height: 10 };
    const { ids, primaryId } = computeMarqueeSelection({
      clips,
      rowGeometry,
      pps,
      contentOrigin: ORIGIN,
      marquee,
    });
    expect(ids).toEqual(new Set(["a"]));
    expect(primaryId).toBe("a");
  });

  it("selects across tracks when the rect spans multiple rows", () => {
    const marquee = { left: ORIGIN, top: row0Top, width: 60, height: row1Top - row0Top + 5 };
    const { ids } = computeMarqueeSelection({
      clips,
      rowGeometry,
      pps,
      contentOrigin: ORIGIN,
      marquee,
    });
    expect(ids).toEqual(new Set(["a", "c"]));
  });

  it("excludes clips outside the rect horizontally", () => {
    const marquee = { left: ORIGIN + 140, top: row0Top, width: 50, height: 10 };
    const { ids } = computeMarqueeSelection({
      clips,
      rowGeometry,
      pps,
      contentOrigin: ORIGIN,
      marquee,
    });
    expect(ids).toEqual(new Set());
  });

  it("returns null primaryId and keeps the base when nothing is hit (additive)", () => {
    const marquee = { left: GUTTER + 140, top: row0Top, width: 50, height: 10 };
    const { ids, primaryId } = computeMarqueeSelection({
      clips,
      rowGeometry,
      pps,
      contentOrigin: GUTTER,
      marquee,
      baseSelection: ["b"],
    });
    expect(ids).toEqual(new Set(["b"]));
    expect(primaryId).toBeNull();
  });

  it("unions additive base selection with new hits; primary comes from the marquee", () => {
    const marquee = { left: GUTTER, top: row1Top, width: 100, height: 10 };
    const { ids, primaryId } = computeMarqueeSelection({
      clips,
      rowGeometry,
      pps,
      contentOrigin: GUTTER,
      marquee,
      baseSelection: ["b"],
    });
    expect(ids).toEqual(new Set(["b", "c"]));
    expect(primaryId).toBe("c");
  });

  it("shrinking the rect live drops clips it no longer covers", () => {
    const wide = { left: ORIGIN, top: row0Top, width: 320, height: 10 };
    const narrow = { left: ORIGIN, top: row0Top, width: 80, height: 10 };
    expect(
      computeMarqueeSelection({ clips, rowGeometry, pps, contentOrigin: ORIGIN, marquee: wide })
        .ids,
    ).toEqual(new Set(["a", "b"]));
    expect(
      computeMarqueeSelection({ clips, rowGeometry, pps, contentOrigin: ORIGIN, marquee: narrow })
        .ids,
    ).toEqual(new Set(["a"]));
  });

  it("ignores clips on hidden/undisplayed tracks", () => {
    const marquee = { left: 0, top: 0, width: 10000, height: 10000 };
    const { ids } = computeMarqueeSelection({
      clips: [{ id: "x", start: 0, duration: 1, track: 7 }],
      rowGeometry,
      pps,
      contentOrigin: GUTTER,
      marquee,
    });
    expect(ids).toEqual(new Set());
  });
});

describe("getMarqueeClipCandidates", () => {
  it("queries only the intersecting rows and time span", () => {
    const rowGeometry = createTimelineRowGeometry([0, 1, 2], [TRACK_H, TRACK_H, TRACK_H]);
    const near: TimelineElement = { id: "near", tag: "div", start: 1, duration: 1, track: 1 };
    const wrongTime: TimelineElement = {
      id: "wrong-time",
      tag: "div",
      start: 20,
      duration: 1,
      track: 1,
    };
    const wrongRow: TimelineElement = {
      id: "wrong-row",
      tag: "div",
      start: 1,
      duration: 1,
      track: 2,
    };
    const clipIndex = createTimelineClipIndex([
      [0, []],
      [1, [near, wrongTime]],
      [2, [wrongRow]],
    ]);

    expect(
      getMarqueeClipCandidates({
        clipIndex,
        rowGeometry,
        marquee: {
          left: ORIGIN + 100,
          top: getTimelineRowTop(1),
          width: 100,
          height: TRACK_H - 1,
        },
        pps: 100,
        contentOrigin: ORIGIN,
      }),
    ).toEqual([near]);
  });
});
