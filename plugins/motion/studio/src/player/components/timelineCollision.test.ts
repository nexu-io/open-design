import { describe, expect, it } from "vitest";
import type { TimelineElement } from "../store/playerStore";
import {
  clampTrackToZone,
  isInsertAllowedForZone,
  isLaneFree,
  resolveInsertRow,
  resolveNearestFreeStart,
  resolveZoneDropPlacement,
  timeRangesOverlap,
} from "./timelineCollision";

function el(id: string, track: number, start: number, duration: number): TimelineElement {
  return { id, tag: "video", start, duration, track };
}

describe("timeRangesOverlap", () => {
  it("detects overlap and treats touching edges as free (half-open)", () => {
    expect(timeRangesOverlap(0, 2, 1, 3)).toBe(true);
    expect(timeRangesOverlap(0, 2, 2, 4)).toBe(false); // touching at 2
    expect(timeRangesOverlap(2, 4, 0, 2)).toBe(false);
  });
});

describe("isLaneFree", () => {
  const els = [el("a", 0, 0, 5), el("b", 1, 2, 3)];

  it("is free when nothing overlaps on the track", () => {
    expect(isLaneFree(els, 2, 0, 5, null)).toBe(true);
    expect(isLaneFree(els, 0, 6, 8, null)).toBe(true); // same track, no time overlap
  });

  it("is occupied when a clip overlaps on the same track", () => {
    expect(isLaneFree(els, 0, 1, 3, null)).toBe(false);
  });

  it("ignores the excluded (dragged) clip", () => {
    expect(isLaneFree(els, 0, 1, 3, "a")).toBe(true);
  });
});

describe("resolveNearestFreeStart", () => {
  const row = [el("a", 0, 2, 3), el("b", 0, 8, 2)]; // busy [2,5) and [8,10)

  it("keeps a start whose span is already free", () => {
    expect(resolveNearestFreeStart(row, 0, 5, 3, null)).toBe(5);
    expect(resolveNearestFreeStart(row, 1, 3, 4, null)).toBe(3); // another row
  });

  it("keeps the clip's own start between edges no centisecond start fits", () => {
    const tight = [el("a", 0, 0, 3.333), el("b", 0, 6.666, 4)];
    expect(resolveNearestFreeStart(tight, 0, 3.333, 3.333, null)).toBe(10.67);
    expect(resolveNearestFreeStart(tight, 0, 3.333, 3.333, null, 0, 3.333)).toBe(3.333);
    expect(resolveNearestFreeStart(tight, 0, 3.4, 3.333, null, 0, 3.333)).toBe(3.333);
  });

  it("keeps the clip's own start when float sums land a hair past a neighbour's edge", () => {
    const after = [el("a", 0, 0, 0.333), el("b", 0, 2.066, 1)]; // 0.333 + 1.733 = 2.0660000000000003
    expect(resolveNearestFreeStart(after, 0, 0.333, 1.733, null, 0, 0.333)).toBe(0.333);
    const before = [el("a", 0, 0.1, 0.2), el("b", 0, 1.3, 1)]; // a ends at 0.30000000000000004
    expect(resolveNearestFreeStart(before, 0, 0.3, 1, null, 0, 0.3)).toBe(0.3);
  });

  it("takes the clip's own start only when it is free, not below minStart, and nearest", () => {
    expect(resolveNearestFreeStart(row, 0, 4, 2, null, 0, 3.5)).toBe(5); // nearer, but its own spot overlaps a
    expect(resolveNearestFreeStart(row, 0, 0, 1, null, 1, 0.5)).toBe(1); // below the floor
    expect(resolveNearestFreeStart(row, 0, 6, 1, null, 0, 5.5)).toBe(6); // the release time is nearer
    expect(resolveNearestFreeStart(row, 0, 6.5, 1, null, 0, 6)).toBe(6.5); // nearer again, not the origin
  });

  it("moves an overlapping span to the nearest time it fits", () => {
    expect(resolveNearestFreeStart(row, 0, 4, 2, null)).toBe(5); // 1 s later beats 2 s earlier
    expect(resolveNearestFreeStart(row, 0, 2.2, 1.5, null)).toBe(0.5); // 1.7 s earlier beats 2.8 s later
  });

  it("sends a tie to the later time", () => {
    expect(resolveNearestFreeStart([el("a", 0, 2, 2)], 0, 2, 2, null)).toBe(4); // 0 and 4 both 2 s away
  });

  it("skips a gap too short for the clip and lands after the row's last clip", () => {
    expect(resolveNearestFreeStart(row, 0, 5, 4, null)).toBe(10); // the [5,8) gap is 3 s
    expect(resolveNearestFreeStart([el("a", 0, 0, 30)], 0, 12, 5, null)).toBe(30);
  });

  it("ignores the excluded (dragged) clip", () => {
    expect(resolveNearestFreeStart(row, 0, 2, 3, "a")).toBe(2);
  });

  it("never goes below the lowest allowed start", () => {
    const blocked = [el("c", 0, 6.4, 3.6)]; // busy [6.4,10)
    expect(resolveNearestFreeStart(blocked, 0, 6.5, 2, null)).toBe(4.4);
    expect(resolveNearestFreeStart(blocked, 0, 6.5, 2, null, 6.5)).toBe(10);
    expect(resolveNearestFreeStart([], 0, 6.667, 2, null, 6.667)).toBe(6.667); // not rounded up
  });

  it("keeps a gap-bound start on centiseconds so a written start cannot overlap", () => {
    const start = resolveNearestFreeStart([el("a", 0, 7.1, 2)], 0, 3, 5.045333, null);
    expect(start).toBe(2.05);
    expect(start + 5.045333).toBeLessThanOrEqual(7.1);
  });
});

describe("resolveInsertRow (only empty space outside the rows opens a track)", () => {
  const n = 3; // three rows: 0, 1, 2

  it("stays on the row everywhere over it, edges included", () => {
    for (let rowFloat = 0; rowFloat < n; rowFloat += 0.01) {
      expect(resolveInsertRow(rowFloat, n)).toBeNull();
    }
  });

  it("opens a track above the first row and below the last", () => {
    expect(resolveInsertRow(-0.4, n)).toBe(0);
    expect(resolveInsertRow(n, n)).toBe(n);
    expect(resolveInsertRow(n + 0.4, n)).toBe(n);
  });

  it("opens the first track on an empty timeline", () => {
    expect(resolveInsertRow(0.5, 0)).toBe(0);
  });
});

describe("clampTrackToZone", () => {
  // trackOrder [0,1,2,3]: rows 0,1 = visual; rows 2,3 = audio (audioRow = 2).
  const order = [0, 1, 2, 3];

  it("is a no-op when there is no audio zone", () => {
    expect(clampTrackToZone(3, order, -1, false)).toBe(3);
  });

  it("keeps a visual clip in the visual zone", () => {
    expect(clampTrackToZone(1, order, 2, false)).toBe(1); // already visual
    expect(clampTrackToZone(3, order, 2, false)).toBe(1); // in audio → last visual lane
  });

  it("keeps an audio clip in the audio zone", () => {
    expect(clampTrackToZone(2, order, 2, true)).toBe(2); // already audio
    expect(clampTrackToZone(0, order, 2, true)).toBe(2); // in visual → first audio lane
  });
});

describe("isInsertAllowedForZone", () => {
  // audioRow = 2
  it("allows any insert when there is no audio zone", () => {
    expect(isInsertAllowedForZone(0, -1, false)).toBe(true);
    expect(isInsertAllowedForZone(3, -1, true)).toBe(true);
  });

  it("allows a visual insert only at/above the audio zone top", () => {
    expect(isInsertAllowedForZone(0, 2, false)).toBe(true);
    expect(isInsertAllowedForZone(2, 2, false)).toBe(true); // bottom of the visual zone
    expect(isInsertAllowedForZone(3, 2, false)).toBe(false); // inside the audio zone
  });

  it("allows an audio insert only at/below the audio zone top (audio clips make audio tracks)", () => {
    expect(isInsertAllowedForZone(2, 2, true)).toBe(true);
    expect(isInsertAllowedForZone(4, 2, true)).toBe(true); // below the bottom
    expect(isInsertAllowedForZone(1, 2, true)).toBe(false); // inside the visual zone
  });
});

describe("resolveZoneDropPlacement (a drop on a row stays on that row, no overlap)", () => {
  // order [0,1,2] visual + [3] audio. audioRow = 3.
  const order = [0, 1, 2, 3];
  const audioTracks = new Set([3]);
  const base = {
    order,
    audioTracks,
    deliberateInsertRow: null as number | null,
    start: 2,
    duration: 2,
    dragKey: "x",
    isAudio: false,
  };
  const allVisualOccupied = () => [el("a", 0, 0, 10), el("b", 1, 0, 10), el("c", 2, 0, 10)];

  it("lands on the aimed track when it is free at that time", () => {
    expect(
      resolveZoneDropPlacement({ ...base, elements: [el("a", 1, 10, 3)], desiredTrack: 1 }),
    ).toEqual({ track: 1, insertRow: null, start: 2 });
  });

  it("stays on the aimed row at its nearest free time when the aimed span is occupied", () => {
    expect(
      resolveZoneDropPlacement({ ...base, elements: [el("a", 1, 0, 5)], desiredTrack: 1 }),
    ).toEqual({ track: 1, insertRow: null, start: 5 });
  });

  it("never hops to another row or opens a track when every row is occupied", () => {
    expect(
      resolveZoneDropPlacement({ ...base, elements: allVisualOccupied(), desiredTrack: 1 }),
    ).toEqual({ track: 1, insertRow: null, start: 10 });
  });

  it("does not fall back to the dragged clip's origin row", () => {
    expect(
      resolveZoneDropPlacement({
        ...base,
        elements: [el("a", 0, 0, 5), el("b", 1, 0, 5), el("x", 2, 0, 5)],
        desiredTrack: 1,
      }),
    ).toEqual({ track: 1, insertRow: null, start: 5 });
  });

  it("Tag (2 s, 5 s long) onto the Subtitle row (0-6 s) lands at 6 s on that row", () => {
    const elements = [el("title", 0, 0, 10), el("subtitle", 1, 0, 6), el("tag", 2, 2, 5)];
    const drop = { ...base, elements, start: 2, duration: 5, dragKey: "tag" };
    expect(resolveZoneDropPlacement({ ...drop, desiredTrack: 1 })).toEqual({
      track: 1,
      insertRow: null,
      start: 6,
    });
    expect(resolveZoneDropPlacement({ ...drop, desiredTrack: 0 })).toEqual({
      track: 0,
      insertRow: null,
      start: 10,
    });
  });

  it("shares a track for sequential (non-overlapping) clips", () => {
    expect(
      resolveZoneDropPlacement({
        ...base,
        elements: [el("a", 1, 0, 2)],
        desiredTrack: 1,
        start: 2,
      }),
    ).toEqual({ track: 1, insertRow: null, start: 2 });
  });

  it("clamps a visual clip OUT of the audio zone before placing", () => {
    expect(resolveZoneDropPlacement({ ...base, elements: [], desiredTrack: 3 })).toEqual({
      track: 2,
      insertRow: null,
      start: 2,
    });
  });

  it("clamps an audio clip INTO the audio zone before placing", () => {
    expect(
      resolveZoneDropPlacement({ ...base, elements: [], desiredTrack: 0, isAudio: true }),
    ).toEqual({ track: 3, insertRow: null, start: 2 });
  });

  it("upward create-drag off the top lane inserts at the TOP of the visual zone, never below audio (reviewer repro)", () => {
    // The sentinel desiredTrack = minTrack-1 = -1 must anchor to the visual zone's top boundary.
    expect(
      resolveZoneDropPlacement({ ...base, elements: allVisualOccupied(), desiredTrack: -1 }),
    ).toEqual({ track: -1, insertRow: 0, start: 2 });
  });

  it("downward create-drag off the bottom visual lane inserts at the audio boundary, never below it", () => {
    expect(
      resolveZoneDropPlacement({ ...base, elements: allVisualOccupied(), desiredTrack: 4 }),
    ).toEqual({ track: 4, insertRow: 3, start: 2 });
  });

  it("audio create-drag with an out-of-range aim inserts inside the audio zone", () => {
    expect(
      resolveZoneDropPlacement({
        ...base,
        elements: [el("a", 3, 0, 10)],
        desiredTrack: -1,
        isAudio: true,
      }),
    ).toEqual({ track: -1, insertRow: 3, start: 2 });
  });

  it("honors an insert aimed at the space outside the rows in the clip's own zone", () => {
    expect(
      resolveZoneDropPlacement({ ...base, elements: [], desiredTrack: 0, deliberateInsertRow: 0 }),
    ).toEqual({ track: 0, insertRow: 0, start: 2 });
  });

  it("ignores an insert that lands in the WRONG zone (visual into audio)", () => {
    expect(
      resolveZoneDropPlacement({ ...base, elements: [], desiredTrack: 1, deliberateInsertRow: 4 }),
    ).toEqual({ track: 1, insertRow: null, start: 2 });
  });

  it("lets an AUDIO clip open a new audio track below the last row", () => {
    expect(
      resolveZoneDropPlacement({
        ...base,
        elements: [],
        desiredTrack: 3,
        isAudio: true,
        deliberateInsertRow: 4,
      }),
    ).toEqual({ track: 3, insertRow: 4, start: 2 });
  });

  it("audio dropped on a visual-only timeline opens its zone's first row, no overlap (#2195)", () => {
    const drop = {
      order: [0],
      audioTracks: new Set<number>(),
      elements: [el("v", 0, 0, 5)],
      desiredTrack: 0,
      deliberateInsertRow: null,
      duration: 2,
      dragKey: "audio",
      isAudio: true,
    };
    // Occupied and free spans alike: the visual row is not a row an audio clip may land on.
    expect(resolveZoneDropPlacement({ ...drop, start: 1 })).toEqual({
      track: 0,
      insertRow: 1,
      start: 1,
    });
    expect(resolveZoneDropPlacement({ ...drop, start: 10 })).toEqual({
      track: 0,
      insertRow: 1,
      start: 10,
    });
  });
});
