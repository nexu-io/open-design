import { describe, it, expect } from "vitest";
import {
  RULER_H,
  TRACK_H,
  LANE_H,
  TRACKS_TOP_PAD,
  TRACKS_BOTTOM_PAD,
  GUTTER,
  TRACKS_LEFT_PAD,
  getTimelineRowTop,
  getTimelineScrubTime,
  getTimelineRowFromY,
  getTimelineRowOffsets,
  getTimelineCanvasHeight,
  createTimelineRowGeometry,
  getTimelineRowGeometry,
  trackHeights,
  resolveTimelineAssetDrop,
  getTimelineBeatEntries,
} from "./timelineLayout";
import {
  generateTicks,
  getTimelineGridStep,
  getTimelineMajorTickInterval,
} from "./timelineRulerGeometry";
import { resolveInsertRow } from "./timelineCollision";
import { getTimelineRenderTimeRange } from "./timelineViewportGeometry";

describe("horizontal timeline window", () => {
  it("adds the shared quarter-viewport overscan on each side and clamps to duration", () => {
    expect(getTimelineRenderTimeRange({ scrollLeft: 300, clientWidth: 500 }, 100, 200, 20)).toEqual(
      { start: 0, end: 7.25 },
    );
    expect(
      getTimelineRenderTimeRange({ scrollLeft: 1_900, clientWidth: 500 }, 100, 200, 20),
    ).toEqual({ start: 15.75, end: 20 });
  });

  it("generates globally aligned ticks directly inside the bounded window", () => {
    const ticks = generateTicks(10_000, 100, undefined, { start: 500.2, end: 501.8 });
    const interval = getTimelineMajorTickInterval(10_000, 100);
    expect(ticks.major.every((time) => time >= 500.2 && time <= 501.8)).toBe(true);
    expect(
      ticks.major.every((time) => Math.abs(time / interval - Math.round(time / interval)) < 1e-6),
    ).toBe(true);
    expect(ticks.major.length + ticks.minor.length).toBeLessThan(100);
  });

  it("spaces the snap grid exactly like the ruler's drawn lines at each zoom", () => {
    for (const [pps, fps] of [
      [100, undefined],
      [12, undefined],
      [900, undefined],
      [100, 30],
      [3, 30],
    ] as const) {
      const { major, minor } = generateTicks(60, pps, fps);
      const lines = [...major, ...minor].sort((a, b) => a - b);
      expect(getTimelineGridStep(60, pps, fps)).toBeCloseTo(lines[1]! - lines[0]!, 6);
    }
  });

  it("has no snap grid where the ruler draws no lines", () => {
    expect(generateTicks(20_000, 100)).toEqual({ major: [], minor: [] });
    expect(getTimelineGridStep(20_000, 100)).toBe(0);
  });

  it("slices beat records with original strength indexes and unions a pinned beat", () => {
    expect(
      getTimelineBeatEntries(
        [0, 1, 2, 3],
        [0.1, 0.2, 0.3, 0.4],
        { start: 1, end: 3 },
        new Set([3]),
      ),
    ).toEqual([
      { index: 1, time: 1, strength: 0.2 },
      { index: 2, time: 2, strength: 0.3 },
      { index: 3, time: 3, strength: 0.4 },
    ]);
  });
});

/** N collapsed rows, the shape every caller passes when nothing is expanded. */
const baseRows = (count: number) => Array.from({ length: count }, () => TRACK_H);

describe("variable timeline row geometry", () => {
  const tracks = [
    [{ clipId: "a", laneCount: 0 }],
    [{ clipId: "b", laneCount: 2 }],
    [{ clipId: "c", laneCount: 1 }],
  ];

  it("resolves every row to the base height when no clip is expanded", () => {
    expect(trackHeights(tracks)).toEqual([TRACK_H, TRACK_H, TRACK_H]);
    expect(trackHeights([[], [], []])).toEqual([TRACK_H, TRACK_H, TRACK_H]);
  });

  it("adds one lane height per lane on an expanded clip", () => {
    expect(trackHeights(tracks, new Set(["b"]))).toEqual([TRACK_H, TRACK_H + 2 * LANE_H, TRACK_H]);
  });

  it("derives row tops from cumulative offsets", () => {
    const heights = trackHeights(tracks, new Set(["b"]));
    expect(getTimelineRowOffsets(heights)).toEqual([
      0,
      TRACK_H,
      2 * TRACK_H + 2 * LANE_H,
      3 * TRACK_H + 2 * LANE_H,
    ]);
    expect(getTimelineRowTop(2, heights)).toBe(RULER_H + TRACKS_TOP_PAD + 2 * TRACK_H + 2 * LANE_H);
  });

  it("maps y inside an expanded lane region back to the expanded track", () => {
    const heights = trackHeights(tracks, new Set(["b"]));
    const yInSecondExpandedLane = getTimelineRowTop(1, heights) + TRACK_H + LANE_H * 1.5;
    const row = getTimelineRowFromY(yInSecondExpandedLane, heights);
    expect(Math.floor(row)).toBe(1);
    expect(row).toBeGreaterThan(1.5);
    expect(row).toBeLessThan(2);
  });

  it("sums resolved row heights into the canvas height", () => {
    const heights = trackHeights(tracks, new Set(["b"]));
    expect(getTimelineCanvasHeight(heights)).toBe(
      RULER_H + TRACKS_TOP_PAD + 3 * TRACK_H + 2 * LANE_H + TRACKS_BOTTOM_PAD,
    );
  });

  it("reuses one immutable geometry snapshot for one height array", () => {
    const heights = trackHeights(tracks, new Set(["b"]));
    const first = getTimelineRowGeometry(heights);
    expect(getTimelineRowGeometry(heights)).toBe(first);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.rowOffsets)).toBe(true);
  });

  it("looks up row boundaries through the precomputed geometry", () => {
    const geometry = createTimelineRowGeometry([4, 8, 12], [48, 104, 76]);
    expect(getTimelineRowGeometry(geometry.rowHeights)).toBe(geometry);
    expect(geometry.getRowIndex(8)).toBe(1);
    expect(geometry.getRowFromY(geometry.getRowTop(1))).toBe(1);
    expect(geometry.getRowFromY(geometry.getRowTop(2) - 0.001)).toBeLessThan(2);
    expect(geometry.getRowFromY(geometry.getRowTop(2))).toBe(2);
    expect(geometry.canvasHeight).toBe(RULER_H + TRACKS_TOP_PAD + 228 + TRACKS_BOTTOM_PAD);
  });
});

describe("collapsed timeline row geometry characterization", () => {
  it.each([
    [0, 32],
    [1, 80],
    [4, 224],
  ])("keeps row %i at content y=%i", (row, expectedTop) => {
    expect(getTimelineRowTop(row)).toBe(expectedTop);
  });

  it.each([
    [32, 0],
    [44, 0.25],
    [104, 1.5],
    [248, 4.5],
  ])("maps content y=%i to fractional row %f", (contentY, expectedRow) => {
    expect(getTimelineRowFromY(contentY)).toBe(expectedRow);
  });

  it.each([
    [0, 80],
    [1, 128],
    [3, 224],
    [5, 320],
  ])("keeps the %i-track canvas height at %i", (trackCount, expectedHeight) => {
    expect(getTimelineCanvasHeight(baseRows(trackCount))).toBe(expectedHeight);
  });
});

describe("track-area breathing pad y-math", () => {
  describe("getTimelineRowTop", () => {
    it("offsets the first lane below the ruler by the top pad", () => {
      expect(getTimelineRowTop(0)).toBe(RULER_H + TRACKS_TOP_PAD);
    });

    it("advances by one track height per row, keeping the pad", () => {
      expect(getTimelineRowTop(1)).toBe(RULER_H + TRACKS_TOP_PAD + TRACK_H);
      expect(getTimelineRowTop(3)).toBe(RULER_H + TRACKS_TOP_PAD + 3 * TRACK_H);
    });

    it("is a strict positive shift from the pre-pad formula (pad is non-zero)", () => {
      expect(TRACKS_TOP_PAD).toBeGreaterThan(0);
      expect(getTimelineRowTop(2)).toBe(RULER_H + 2 * TRACK_H + TRACKS_TOP_PAD);
    });
  });

  describe("getTimelineRowFromY", () => {
    it("is the exact inverse of getTimelineRowTop at lane boundaries", () => {
      for (const row of [0, 1, 2, 7]) {
        expect(getTimelineRowFromY(getTimelineRowTop(row))).toBeCloseTo(row, 10);
      }
    });

    it("floors a y inside the top pad (above lane 0) to a negative fraction", () => {
      // A drop in the pad between the ruler and lane 0 sits at row < 0, so a
      // floor lands it on row -1 → getDefaultDroppedTrack floors to the top lane.
      const yInPad = RULER_H + TRACKS_TOP_PAD / 2;
      expect(getTimelineRowFromY(yInPad)).toBeLessThan(0);
    });

    it("maps a y in the middle of lane 1 into [1,2)", () => {
      const yMidLane1 = getTimelineRowTop(1) + TRACK_H / 2;
      const row = getTimelineRowFromY(yMidLane1);
      expect(row).toBeGreaterThanOrEqual(1);
      expect(row).toBeLessThan(2);
    });
  });

  describe("getTimelineCanvasHeight", () => {
    it("reserves ruler + top pad + lanes + bottom pad", () => {
      expect(getTimelineCanvasHeight([])).toBe(RULER_H + TRACKS_TOP_PAD + TRACKS_BOTTOM_PAD);
      expect(getTimelineCanvasHeight(baseRows(3))).toBe(
        RULER_H + TRACKS_TOP_PAD + 3 * TRACK_H + TRACKS_BOTTOM_PAD,
      );
    });

    it("leaves room below the last lane for a drag-into-void new track", () => {
      // The gap below the final lane must be at least a full track height so a
      // clip can be dropped there to create a new bottom track.
      const oneLane = getTimelineCanvasHeight(baseRows(1));
      const lastLaneBottom = getTimelineRowTop(0) + TRACK_H;
      expect(oneLane - lastLaneBottom).toBeGreaterThanOrEqual(TRACK_H);
    });
  });

  describe("resolveTimelineAssetDrop honours the top pad", () => {
    const base = {
      rectLeft: 0,
      rectTop: 0,
      scrollLeft: 0,
      scrollTop: 0,
      contentOrigin: GUTTER,
      pixelsPerSecond: 100,
      rowHeights: baseRows(3),
      trackOrder: [0, 1, 2],
    };

    it("drops onto lane 0 when the pointer is in the middle of the first lane", () => {
      const clientY = getTimelineRowTop(0) + TRACK_H / 2;
      const clientX = GUTTER + 100; // t = 1s (contentOrigin = GUTTER)
      const { start, track } = resolveTimelineAssetDrop(base, clientX, clientY);
      expect(track).toBe(0);
      expect(start).toBe(1);
    });

    it("drops into the top pad → floors to the first lane (row < 0)", () => {
      const clientY = RULER_H + TRACKS_TOP_PAD / 2; // inside the pad, above lane 0
      const { track } = resolveTimelineAssetDrop(base, GUTTER, clientY);
      expect(track).toBe(0);
    });

    it("drops below the last lane → appends a new track", () => {
      const clientY = getTimelineRowTop(2) + TRACK_H + 4; // in the bottom pad
      const { track } = resolveTimelineAssetDrop(base, GUTTER, clientY);
      expect(track).toBe(3); // max(trackOrder)+1
    });

    it("keeps a drop in an expanded lane region on that track", () => {
      const rowHeights = [TRACK_H + 2 * LANE_H, TRACK_H, TRACK_H];
      const clientY = getTimelineRowTop(0, rowHeights) + TRACK_H + LANE_H;
      const { track } = resolveTimelineAssetDrop({ ...base, rowHeights }, GUTTER, clientY);
      expect(track).toBe(0);
    });
  });
});

describe("host track padding", () => {
  const geometry = createTimelineRowGeometry([0, 1, 2], baseRows(3), { top: 0, bottom: TRACK_H });
  // Row 1 with no top pad, but still row 0 if any reader keeps the default pad.
  const yInRow1 = RULER_H + TRACK_H + 10;

  it("moves the first row up and sizes the canvas from the host pads", () => {
    expect(geometry.getRowTop(0)).toBe(RULER_H);
    expect(getTimelineRowTop(1, geometry.rowHeights)).toBe(RULER_H + TRACK_H);
    expect(getTimelineCanvasHeight(geometry.rowHeights)).toBe(RULER_H + 4 * TRACK_H);
  });

  it("maps a drag pointer y to the row under it", () => {
    expect(Math.floor(geometry.getRowFromY(yInRow1))).toBe(1);
    expect(Math.floor(getTimelineRowFromY(yInRow1, geometry.rowHeights))).toBe(1);
  });

  it("drops onto the row under the pointer, and a new track in the bottom pad", () => {
    const drop = {
      rectLeft: 0,
      rectTop: 0,
      scrollLeft: 0,
      scrollTop: 0,
      contentOrigin: GUTTER,
      pixelsPerSecond: 100,
      rowHeights: geometry.rowHeights,
      trackOrder: [0, 1, 2],
    };
    expect(resolveTimelineAssetDrop(drop, GUTTER, yInRow1).track).toBe(1);
    const inBottomPad = RULER_H + 3 * TRACK_H + TRACK_H / 2;
    expect(resolveTimelineAssetDrop(drop, GUTTER, inBottomPad).track).toBe(3);
  });

  it("clamps a negative pad to 0 and replaces a non-finite one with the default", () => {
    const odd = createTimelineRowGeometry([0], baseRows(1), { top: -20, bottom: Number.NaN });
    expect(odd.padding).toEqual({ top: 0, bottom: TRACKS_BOTTOM_PAD });
    expect(odd.getRowTop(0)).toBe(RULER_H);
    expect(odd.canvasHeight).toBe(RULER_H + TRACK_H + TRACKS_BOTTOM_PAD);
    const infinite = createTimelineRowGeometry([0], baseRows(1), { top: Infinity });
    expect(infinite.padding.top).toBe(TRACKS_TOP_PAD);
  });

  it("keeps the default pads when a host passes none", () => {
    const defaults = createTimelineRowGeometry([0], baseRows(1));
    expect(defaults.padding).toEqual({ top: TRACKS_TOP_PAD, bottom: TRACKS_BOTTOM_PAD });
  });
});

describe("default track pads", () => {
  const rows = [TRACK_H, TRACK_H, TRACK_H];
  const lastLaneBottom = RULER_H + 8 + 3 * TRACK_H;

  it("sits the first row 8px under the ruler and leaves one track below the last", () => {
    expect(getTimelineRowTop(0)).toBe(RULER_H + 8);
    expect(getTimelineCanvasHeight(rows)).toBe(lastLaneBottom + TRACK_H);
  });

  it("opens a new track from anywhere in the bottom lane", () => {
    const drop = {
      rectLeft: 0,
      rectTop: 0,
      scrollLeft: 0,
      scrollTop: 0,
      contentOrigin: GUTTER,
      pixelsPerSecond: 100,
      rowHeights: rows,
      trackOrder: [0, 1, 2],
    };
    for (const y of [lastLaneBottom, getTimelineCanvasHeight(rows) - 1]) {
      expect(resolveTimelineAssetDrop(drop, GUTTER, y).track).toBe(3);
      expect(resolveInsertRow(getTimelineRowFromY(y, rows), rows.length)).toBe(3);
    }
    expect(resolveTimelineAssetDrop(drop, GUTTER, lastLaneBottom - 1).track).toBe(2);
  });
});

describe("getTimelineScrubTime", () => {
  const at = (clientX: number, duration = 10) =>
    getTimelineScrubTime({
      clientX,
      viewportLeft: 0,
      scrollLeft: 0,
      contentOrigin: GUTTER + TRACKS_LEFT_PAD,
      pixelsPerSecond: 100,
      duration,
    });
  const origin = GUTTER + TRACKS_LEFT_PAD;

  it("maps the content origin to t=0", () => {
    expect(at(origin)).toBe(0);
    expect(at(origin + 250)).toBe(2.5);
  });

  // The bug: a pointer left of the origin used to abort the scrub instead of
  // clamping, so dragging the playhead to the start only worked if a sample
  // happened to land in the few px before t=0.
  it("clamps a pointer left of the origin to 0 instead of dropping the scrub", () => {
    expect(at(origin - 1)).toBe(0);
    expect(at(origin - 500)).toBe(0);
    expect(at(0)).toBe(0);
  });

  it("clamps past the end to the duration", () => {
    expect(at(origin + 5000)).toBe(10);
  });

  it("returns 0 for a degenerate zoom or duration", () => {
    expect(
      getTimelineScrubTime({
        clientX: 500,
        viewportLeft: 0,
        scrollLeft: 0,
        contentOrigin: GUTTER + TRACKS_LEFT_PAD,
        pixelsPerSecond: 0,
        duration: 10,
      }),
    ).toBe(0);
    expect(at(origin + 250, Number.NaN)).toBe(0);
  });
});
