import { describe, expect, it } from "vitest";
import type { TimelineElement } from "../store/playerStore";
import { classifyZone, isMainTrackElement, normalizeToZones } from "./timelineZones";

function el(id: string, tag: string, track: number, duration = 2): TimelineElement {
  return { id, tag, start: 0, duration, track };
}

function zClip(
  id: string,
  start: number,
  duration: number,
  track: number,
  zIndex: number,
  tag = "video",
): TimelineElement {
  return { id, tag, start, duration, track, zIndex };
}

function trackOf(els: TimelineElement[], id: string): number {
  return els.find((e) => e.id === id)!.track;
}

/** Assert normalizeToZones is idempotent: re-zoning keeps every clip's lane. */
function expectZoningIdempotent(input: TimelineElement[]): void {
  const once = normalizeToZones(input);
  const twice = normalizeToZones(once);
  for (const e of once) expect(trackOf(twice, e.id)).toBe(e.track);
}

describe("classifyZone", () => {
  it("audio → audio; video / image / everything else → visual", () => {
    expect(classifyZone(el("m", "audio", 3))).toBe("audio");
    expect(classifyZone(el("v", "video", 1))).toBe("visual");
    expect(classifyZone(el("i", "img", 0))).toBe("visual");
  });

  it("zone identity invariant: normalizeToZones preserves each clip's zone (mixed input)", () => {
    // normalizeToZones only remaps lanes — it must never reclassify a clip's zone.
    const input = [
      el("v", "video", 0),
      el("a1", "audio", 1),
      el("i", "img", 2),
      el("a2", "audio", 3),
    ];
    const out = normalizeToZones(input);
    for (const e of input) {
      expect(classifyZone(out.find((o) => o.id === e.id)!)).toBe(classifyZone(e));
    }
    // And the partition holds: every visual lane sits above every audio lane.
    const laneOf = (id: string) => trackOf(out, id);
    const maxVisual = Math.max(laneOf("v"), laneOf("i"));
    const minAudio = Math.min(laneOf("a1"), laneOf("a2"));
    expect(maxVisual).toBeLessThan(minAudio);
  });
});

describe("isMainTrackElement", () => {
  it("is true for a visual clip on display track 0", () => {
    expect(isMainTrackElement(el("v", "video", 0))).toBe(true);
  });

  it("is false for a visual clip on any other track", () => {
    expect(isMainTrackElement(el("v", "video", 1))).toBe(false);
  });

  it("is false for an audio clip even on track 0 (audio-only project has no main track)", () => {
    expect(isMainTrackElement(el("m", "audio", 0))).toBe(false);
  });
});

describe("normalizeToZones — CapCut-stable lanes follow the track-index (never z)", () => {
  it("orders visual lanes by authored track-index (ascending), audio at the bottom", () => {
    // img (track 0), vid (track 2), mus (audio, track 5). Lanes follow the track
    // index: the LOWER visual track owns the upper lane. z is irrelevant (absent).
    const out = normalizeToZones([
      el("img", "img", 0),
      el("vid", "video", 2),
      el("mus", "audio", 5),
    ]);
    expect(trackOf(out, "img")).toBe(0); // track 0 → top lane
    expect(trackOf(out, "vid")).toBe(1); // track 2 → below it
    expect(trackOf(out, "mus")).toBe(2); // audio → bottom
  });

  it("compacts sparse visual track-indexes to contiguous lanes, preserving ascending order", () => {
    // Distinct authored tracks 0, 3, 7 → three adjacent lanes in the same order.
    const out = normalizeToZones([el("a", "video", 7), el("b", "img", 0), el("c", "video", 3)]);
    expect(trackOf(out, "b")).toBe(0); // track 0
    expect(trackOf(out, "c")).toBe(1); // track 3
    expect(trackOf(out, "a")).toBe(2); // track 7
  });

  it("drops audio below the visual lanes even when it holds a LOWER authored index", () => {
    // Audio authored at track 0, video at track 5 — audio must still sink below.
    const out = normalizeToZones([zClip("a", 0, 10, 0, 0, "audio"), zClip("v", 0, 10, 5, 0)]);
    expect(trackOf(out, "v")).toBe(0); // visual on top
    expect(trackOf(out, "a")).toBe(1); // audio below, despite its lower track index
  });

  it("drops audio below the visual lanes even when sharing a track index", () => {
    const out = normalizeToZones([el("v", "video", 0), el("a", "audio", 0)]);
    expect(trackOf(out, "v")).toBe(0);
    expect(trackOf(out, "a")).toBe(1);
  });

  it("groups multiple audio tracks at the bottom, ordered by their track index", () => {
    const out = normalizeToZones([el("v", "video", 0), el("a2", "audio", 4), el("a1", "audio", 1)]);
    expect(trackOf(out, "v")).toBe(0);
    expect(trackOf(out, "a1")).toBe(1); // audio track 1 above audio track 4
    expect(trackOf(out, "a2")).toBe(2);
  });

  it("ignores z-index entirely — a high-z clip does NOT jump above a lower-track clip", () => {
    // lo on track 0 with z=1; hi on track 1 with z=99. They fully overlap in time.
    // The old z-rank pack lifted hi above lo; the CapCut rule keeps lane = track.
    const out = normalizeToZones([zClip("lo", 0, 10, 0, 1), zClip("hi", 0, 10, 1, 99)]);
    expect(trackOf(out, "lo")).toBe(0); // track 0 stays on top
    expect(trackOf(out, "hi")).toBe(1); // higher z does NOT lift it
  });

  it("ignores z-index across authored tracks (scattered z, lanes still by track)", () => {
    const out = normalizeToZones([
      zClip("t0", 0, 10, 0, 3),
      zClip("t1", 0, 10, 1, 26),
      zClip("t2", 0, 10, 2, 0),
    ]);
    expect(trackOf(out, "t0")).toBe(0);
    expect(trackOf(out, "t1")).toBe(1);
    expect(trackOf(out, "t2")).toBe(2);
  });

  it("sequential (non-overlapping) same-track clips share a lane", () => {
    const out = normalizeToZones([zClip("a", 0, 5, 0, 1), zClip("c", 6, 3, 0, 9)]);
    expect(trackOf(out, "a")).toBe(0);
    expect(trackOf(out, "c")).toBe(0); // shares the lane regardless of z
  });

  it("returns the same array (identity) when already zoned", () => {
    // i on track 0, v on track 1, a (audio) on track 2 — already contiguous, visual
    // above audio, so re-zoning is a no-op and the SAME reference comes back.
    const input = [el("i", "img", 0), el("v", "video", 1), el("a", "audio", 2)];
    expect(normalizeToZones(input)).toBe(input);
  });

  it("is idempotent (no drift on re-zoning)", () => {
    const input = [
      el("img", "img", 1),
      el("v", "video", 3),
      el("a1", "audio", 2),
      el("a2", "audio", 6),
    ];
    expectZoningIdempotent(input);
  });

  it("re-derives identical lanes from fresh objects carrying the same tracks (reload-stable)", () => {
    const build = (): TimelineElement[] => [
      zClip("hi", 0, 10, 0, 9),
      zClip("lo", 0, 10, 1, 1),
      zClip("mid", 3, 5, 2, 5),
    ];
    const first = normalizeToZones(build());
    const second = normalizeToZones(build());
    for (const e of first) expect(trackOf(second, e.id)).toBe(e.track);
  });
});

describe("normalizeToZones — legacy overlap spill (display-only, deterministic)", () => {
  it("keeps a labelled transition pair on one row", () => {
    const transitionLabel = "hf:transition:outgoing:incoming:crossfade";
    const out = normalizeToZones([
      { ...zClip("outgoing", 0, 2.5, 0, 0), transitionLabel },
      { ...zClip("incoming", 2, 2.5, 0, 0), transitionLabel },
    ]);
    expect(trackOf(out, "outgoing")).toBe(0);
    expect(trackOf(out, "incoming")).toBe(0);
  });

  it("still splits an unlabelled overlap", () => {
    const out = normalizeToZones([
      zClip("outgoing", 0, 2.5, 0, 0),
      zClip("incoming", 2, 2.5, 0, 0),
    ]);
    expect(trackOf(out, "outgoing")).not.toBe(trackOf(out, "incoming"));
  });

  it("splits time-overlapping SAME-track clips onto adjacent sub-lanes (no visible overlap)", () => {
    // a [0,5), b [2,7) overlaps a, c [6,9) sequential — all authored on track 1.
    // The editor forbids per-track overlap, but a legacy file can carry it; the
    // spill orders by stable id (a, b, c) and first-fits: a→lane0, b overlaps a→
    // lane1, c fits back on lane0 (no overlap with a).
    const clip = (id: string, start: number, duration: number): TimelineElement => ({
      id,
      tag: "video",
      start,
      duration,
      track: 1,
    });
    const out = normalizeToZones([clip("a", 0, 5), clip("b", 2, 5), clip("c", 6, 3)]);
    expect(trackOf(out, "a")).toBe(0);
    expect(trackOf(out, "b")).toBe(1); // overlaps a → adjacent sub-lane
    expect(trackOf(out, "c")).toBe(0); // sequential to a → shares lane 0
    // No two time-overlapping clips share a lane.
    expect(trackOf(out, "a")).not.toBe(trackOf(out, "b"));
    // Idempotent: re-laying the split result changes nothing.
    const twice = normalizeToZones(out);
    for (const e of out) expect(trackOf(twice, e.id)).toBe(e.track);
  });

  it("spills two fully-overlapping same-track clips by stable id (a above b)", () => {
    const out = normalizeToZones([zClip("b", 0, 10, 0, 5), zClip("a", 0, 10, 0, 5)]);
    expect(trackOf(out, "a")).toBe(0); // "a" < "b"
    expect(trackOf(out, "b")).toBe(1);
    // Survives re-normalization (stable id tie-break, never the mutated lane).
    const twice = normalizeToZones(out);
    for (const e of out) expect(trackOf(twice, e.id)).toBe(e.track);
  });
});

describe("normalizeToZones — legacy file with scattered z (requirement 6)", () => {
  // Mirrors /tmp/hf-fixwave/userproj/index.html: many visual clips on contiguous
  // authored tracks (0..17) each carrying an unrelated, scattered inline z-index,
  // and audio on the highest tracks (18..). The display must follow the
  // track-index, NOT the z, and a well-formed (contiguous, audio-last) legacy file
  // must not be re-laned at all — normalize is the identity.
  const legacy = (): TimelineElement[] => [
    zClip("sub-0", 3, 1.15, 0, 0, "div"), // no explicit z (0)
    zClip("cap-hit", 4.51, 1.73, 3, 26, "div"), // scattered z
    zClip("cap-send", 5.85, 1.27, 4, 25, "div"),
    zClip("avatar", 6.4, 1.148, 1, 26),
    zClip("v-opener", 0, 3, 15, 12),
    zClip("v-letters", 30.08, 4.39, 5, 25),
    zClip("music", 3, 42.95, 18, 10, "audio"),
    zClip("vo", 3.2, 10.3, 19, 4, "audio"),
  ];

  it("lanes follow the track-index, not the scattered z", () => {
    const out = normalizeToZones(legacy());
    // Visual tracks 0,1,3,4,5,15 compact to lanes 0..5 in ascending track order —
    // z (0,26,25,26,12,25) is ignored.
    expect(trackOf(out, "sub-0")).toBe(0); // track 0
    expect(trackOf(out, "avatar")).toBe(1); // track 1
    expect(trackOf(out, "cap-hit")).toBe(2); // track 3
    expect(trackOf(out, "cap-send")).toBe(3); // track 4
    expect(trackOf(out, "v-letters")).toBe(4); // track 5
    expect(trackOf(out, "v-opener")).toBe(5); // track 15
    // Audio stays below every visual lane.
    expect(trackOf(out, "music")).toBe(6);
    expect(trackOf(out, "vo")).toBe(7);
    // The z=26 caption does NOT ride above the z=0 subtitle on track 0.
    expect(trackOf(out, "cap-hit")).toBeGreaterThan(trackOf(out, "sub-0"));
  });

  it("does not rewrite a well-formed (contiguous, audio-last) legacy set — identity", () => {
    // Same shape but authored tracks already contiguous 0..7 with audio last.
    const input = [
      zClip("a", 0, 3, 0, 12),
      zClip("b", 0, 3, 1, 26),
      zClip("c", 0, 3, 2, 3),
      zClip("m", 0, 3, 3, 9, "audio"),
    ];
    // Every clip already sits on its track-index lane, so normalize is a no-op.
    expect(normalizeToZones(input)).toBe(input);
  });

  it("is idempotent on the scattered-z legacy shape (no drift on re-discovery)", () => {
    expectZoningIdempotent(legacy());
  });
});
