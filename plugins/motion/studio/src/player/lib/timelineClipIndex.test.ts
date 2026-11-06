import { describe, expect, it } from "vitest";
import type { TimelineElement } from "../store/playerStore";
import { getTimelineElementIdentity } from "./timelineElementHelpers";
import { createTimelineClipIndex, queryTimelineClipIndex } from "./timelineClipIndex";

function clip(
  id: string,
  start: number,
  duration: number,
  track = 1,
  hidden = false,
): TimelineElement {
  return { id, tag: "div", start, duration, track, hidden };
}

function ids(elements: readonly TimelineElement[]): string[] {
  return elements.map(getTimelineElementIdentity);
}

function createDeterministicRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function linearOracle(
  elements: readonly TimelineElement[],
  range: { start: number; end: number },
  pinned: ReadonlySet<string>,
): readonly TimelineElement[] {
  return elements.filter((element) => {
    if (!Number.isFinite(element.start) || !Number.isFinite(element.duration)) return false;
    if (pinned.has(getTimelineElementIdentity(element))) return true;
    if (range.end <= range.start) return false;
    const end = element.start + Math.max(0, element.duration);
    if (end <= element.start) return element.start >= range.start && element.start < range.end;
    return element.start < range.end && end > range.start;
  });
}

describe("timelineClipIndex", () => {
  it("finds a long predecessor spanning the window", () => {
    const index = createTimelineClipIndex([[1, [clip("long", 0, 100), clip("late", 80, 1)]]]);
    expect(ids(queryTimelineClipIndex(index, 1, { start: 50, end: 51 }))).toEqual(["long"]);
  });

  it("prunes 50k ended clips around one long interval in a late window", () => {
    const elements = [
      clip("long", 0, 50_000),
      ...Array.from({ length: 49_999 }, (_, index) => clip(`short-${index}`, index, 0.25)),
    ];
    const index = createTimelineClipIndex([[1, elements]]);
    expect(ids(queryTimelineClipIndex(index, 1, { start: 49_999, end: 49_999.5 }))).toEqual([
      "long",
    ]);
  });

  it("queries a shifted multi-drag window on a 50k-clip row without a row scan", () => {
    const elements = Array.from({ length: 50_000 }, (_, index) =>
      clip(`clip-${index}`, index, 0.25),
    );
    const index = createTimelineClipIndex([[1, elements]]);
    const selected = new Set(["clip-10", "clip-49"]);

    expect(
      ids(
        queryTimelineClipIndex(index, 1, { start: 60_000, end: 60_001 }, new Set(), [
          { range: { start: 10, end: 11 }, identities: selected },
        ]),
      ),
    ).toEqual(["clip-10"]);
  });

  it("uses half-open render boundaries and retains zero-duration points", () => {
    const index = createTimelineClipIndex([
      [
        1,
        [
          clip("left", 0, 2),
          clip("right", 2, 2),
          clip("point", 3, 0),
          clip("negative", 3.5, -2),
          clip("micro", 4, 1e-9),
        ],
      ],
    ]);
    expect(ids(queryTimelineClipIndex(index, 1, { start: 2, end: 4 }))).toEqual([
      "right",
      "point",
      "negative",
    ]);
    expect(ids(queryTimelineClipIndex(index, 1, { start: 4, end: 5 }))).toEqual(["micro"]);
  });

  it("preserves projection order after overlap and pin union", () => {
    const index = createTimelineClipIndex([
      [1, [clip("pinned", 10, 1), clip("visible-b", 2, 1), clip("visible-a", 1, 3)]],
    ]);
    expect(
      ids(queryTimelineClipIndex(index, 1, { start: 1.5, end: 2.5 }, new Set(["pinned"]))),
    ).toEqual(["pinned", "visible-b", "visible-a"]);
  });

  it("keeps duplicate identities deterministic and ignores stale pins", () => {
    const index = createTimelineClipIndex([
      [1, [clip("duplicate", 10, 1), clip("duplicate", 20, 1), clip("hidden", 30, 1, 1, true)]],
      [2, [clip("duplicate", 40, 1, 2)]],
    ]);
    expect(
      ids(queryTimelineClipIndex(index, 1, { start: 0, end: 1 }, new Set(["duplicate", "stale"]))),
    ).toEqual(["duplicate", "duplicate"]);
    expect(
      ids(queryTimelineClipIndex(index, 2, { start: 0, end: 1 }, new Set(["duplicate"]))),
    ).toEqual(["duplicate"]);
  });

  it("keeps an immutable interval snapshot when the source projection array changes", () => {
    const source = [clip("first", 0, 2), clip("second", 5, 2)];
    const index = createTimelineClipIndex([[1, source]]);
    source.splice(0, source.length, clip("replacement", 0, 20));
    expect(ids(queryTimelineClipIndex(index, 1, { start: 0, end: 1 }))).toEqual(["first"]);
  });

  it("excludes clips with non-finite timing", () => {
    const index = createTimelineClipIndex([
      [1, [clip("bad-start", Number.NaN, 1), clip("bad-duration", 0, Number.POSITIVE_INFINITY)]],
    ]);
    expect(ids(queryTimelineClipIndex(index, 1, { start: 0, end: 1 }))).toEqual([]);
  });

  it("indexes synthetic fractional display rows independently", () => {
    const index = createTimelineClipIndex([
      [1, [clip("host", 0, 1)]],
      [1.5, [clip("child", 10, 1, 1.5)]],
    ]);
    expect(ids(queryTimelineClipIndex(index, 1.5, { start: 10, end: 11 }))).toEqual(["child"]);
    expect(ids(queryTimelineClipIndex(index, 1, { start: 10, end: 11 }))).toEqual([]);
  });

  it("matches a linear oracle across deterministic randomized windows and pins", () => {
    const random = createDeterministicRandom(0x2698);
    for (let scenario = 0; scenario < 50; scenario += 1) {
      const elements = Array.from({ length: 60 }, (_, index) => {
        const element = clip(
          `clip-${scenario}-${index}`,
          Math.floor(random() * 120) - 10,
          random() < 0.15 ? -Math.floor(random() * 5) : Math.floor(random() * 30),
        );
        if (index % 4 === 0) element.key = `index.html#${element.id}`;
        return element;
      });
      const index = createTimelineClipIndex([[1, elements]]);
      for (let query = 0; query < 12; query += 1) {
        const start = Math.floor(random() * 120) - 10;
        const range = { start, end: start + Math.floor(random() * 35) };
        const pinned = new Set(
          elements
            .filter(() => random() < 0.05)
            .map((element) => getTimelineElementIdentity(element)),
        );
        expect(queryTimelineClipIndex(index, 1, range, pinned)).toEqual(
          linearOracle(elements, range, pinned),
        );
      }
    }
  });
});
