import { describe, expect, it } from "vitest";
import {
  computeStackingPatches,
  laneIsAbove,
  samePaintScope,
  type StackingDirection,
  type StackingElement,
} from "./timelineStackingSync";

function el(
  key: string,
  track: number,
  start: number,
  duration: number,
  zIndex: number,
  isAudio = false,
  domIndex?: number,
): StackingElement {
  return { key, track, start, duration, zIndex, isAudio, domIndex };
}

function patchMap(
  elements: StackingElement[],
  edited: string[],
  direction: StackingDirection,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of computeStackingPatches(elements, edited, direction)) out[p.key] = p.zIndex;
  return out;
}

describe("stacking-context partitioning", () => {
  it("uses source file and normalized stacking context as the canonical paint scope", () => {
    expect(samePaintScope({}, { stackingContextId: null })).toBe(true);
    expect(samePaintScope({}, { sourceFile: "index.html" })).toBe(false);
    expect(
      samePaintScope(
        { sourceFile: "scene.html", stackingContextId: "card" },
        { sourceFile: "scene.html", stackingContextId: "modal" },
      ),
    ).toBe(false);
  });

  it("never compares or patches across source files in the root context", () => {
    const root: StackingElement = {
      key: "root",
      track: 0,
      start: 0,
      duration: 5,
      zIndex: 1,
      isAudio: false,
      sourceFile: "index.html",
      stackingContextId: null,
    };
    const scene: StackingElement = {
      key: "scene",
      track: 1,
      start: 0,
      duration: 5,
      zIndex: 10,
      isAudio: false,
      sourceFile: "scenes/scene.html",
      stackingContextId: null,
    };

    expect(patchMap([root, scene], ["root"], "up")).toEqual({});
  });

  it("never compares or patches across stacking contexts", () => {
    // X lives in sub-comp context "scene-1" with a high leaf z; Y is a root clip
    // with a lower leaf z, overlapping in time. Their leaf z values are NOT
    // comparable (the ancestors' z decides paint order), so moving X's lane above
    // Y must not reason on Y or patch either based on the 10-vs-5 comparison.
    const x: StackingElement = {
      key: "x",
      track: 0,
      start: 0,
      duration: 5,
      zIndex: 10,
      isAudio: false,
      stackingContextId: "scene-1",
    };
    const y: StackingElement = {
      key: "y",
      track: 1,
      start: 0,
      duration: 5,
      zIndex: 5,
      isAudio: false,
      stackingContextId: null,
    };
    // X edited: only same-context neighbours participate — none here, so X keeps
    // its z (nothing to fix WITHIN its context) and Y is never touched.
    expect(patchMap([x, y], ["x"], "up")).toEqual({});
  });

  it("still resolves within the edited clip's own context", () => {
    const a: StackingElement = {
      key: "a",
      track: 1,
      start: 0,
      duration: 5,
      zIndex: 1,
      isAudio: false,
      stackingContextId: "scene-1",
    };
    const b: StackingElement = {
      key: "b",
      track: 0,
      start: 0,
      duration: 5,
      zIndex: 5,
      isAudio: false,
      stackingContextId: "scene-1",
    };
    // 'a' moved BELOW b's lane... a (track 1) is under b (track 0): a's z (1)
    // is already below b's (5) — consistent, no patch. Move a ABOVE (track -1
    // relative ordering) is covered by existing suites; here we just prove the
    // same-context pair still participates (no patch ≠ no participation: verify
    // by flipping z so a MUST be lifted).
    const aWrong = { ...a, track: 0, zIndex: 1 };
    const bLow = { ...b, track: 1, zIndex: 5 };
    const patches = patchMap([aWrong, bLow], ["a"], "up");
    expect(patches.a).toBeGreaterThan(5);
  });
});

describe("laneIsAbove", () => {
  it("lower track renders above (top of timeline wins)", () => {
    expect(laneIsAbove({ track: 0 }, { track: 1 })).toBe(true);
    expect(laneIsAbove({ track: 2 }, { track: 1 })).toBe(false);
    expect(laneIsAbove({ track: 1 }, { track: 1 })).toBe(false);
  });
});

describe("computeStackingPatches", () => {
  it("no overlapping clips → no patch", () => {
    // a (0..5 on track 0) and b (10..15 on track 1) never overlap in time.
    const elements = [el("a", 0, 0, 5, 10), el("b", 1, 10, 5, 5)];
    expect(patchMap(elements, ["a"], "up")).toEqual({});
  });

  it("moved up with z too low → raised above the clip it now sits above", () => {
    const elements = [el("a", 0, 0, 10, 1), el("b", 1, 0, 10, 5)];
    expect(patchMap(elements, ["a"], "up")).toEqual({ a: 6 });
  });

  it("moved down with z too high → lowered below the clip now above it", () => {
    const elements = [el("a", 2, 0, 10, 9), el("b", 0, 0, 10, 5)];
    expect(patchMap(elements, ["a"], "down")).toEqual({ a: 4 });
  });

  it("already in order → no patch (authored z preserved)", () => {
    const elements = [el("a", 0, 0, 10, 8), el("b", 1, 0, 10, 3)];
    expect(patchMap(elements, ["a"], "up")).toEqual({});
  });

  it("untouched clips never get a patch even when they overlap the edit", () => {
    const elements = [el("a", 0, 0, 10, 1), el("b", 1, 0, 10, 5), el("c", 2, 0, 10, 9)];
    const patches = computeStackingPatches(elements, ["a"], "up");
    expect(patches.map((p) => p.key)).toEqual(["a"]);
  });

  it("moved up rises one above the clips now below it and ignores the clips above it", () => {
    const elements = [el("a", 1, 0, 10, 0), el("below", 2, 0, 10, 2), el("above", 0, 0, 10, 10)];
    expect(patchMap(elements, ["a"], "up")).toEqual({ a: 3 });
  });

  it("moved down sinks one below the clips now above it and ignores the clips below it", () => {
    const elements = [el("a", 1, 0, 10, 20), el("below", 2, 0, 10, 2), el("above", 0, 0, 10, 10)];
    expect(patchMap(elements, ["a"], "down")).toEqual({ a: 9 });
  });

  it("audio clips are excluded — an audio edit yields no patch", () => {
    const elements = [el("music", 3, 0, 10, 0, true), el("v", 0, 0, 10, 5)];
    expect(patchMap(elements, ["music"], "down")).toEqual({});
  });

  it("audio clips are excluded as neighbours — a visual edit ignores overlapping audio", () => {
    const elements = [el("v", 0, 0, 10, 3), el("music", 3, 0, 10, 99, true)];
    expect(patchMap(elements, ["v"], "up")).toEqual({});
  });

  it("moved up over several clips → one above the highest of them", () => {
    const elements = [el("a", 0, 0, 10, 0), el("b", 1, 0, 10, 3), el("c", 2, 0, 10, 7)];
    expect(patchMap(elements, ["a"], "up")).toEqual({ a: 8 });
  });

  it("moved down under several clips → one below the lowest of them, never under 0", () => {
    const elements = [el("a", 2, 0, 10, 9), el("b", 0, 0, 10, 1), el("c", 1, 0, 10, 4)];
    expect(patchMap(elements, ["a"], "down")).toEqual({ a: 0 });
  });

  it("partial time overlap still counts", () => {
    const elements = [el("a", 0, 0, 6, 1), el("b", 1, 5, 10, 5)];
    expect(patchMap(elements, ["a"], "up")).toEqual({ a: 6 });
  });

  it("touching-but-not-overlapping intervals do NOT count", () => {
    const elements = [el("a", 0, 0, 5, 1), el("b", 1, 5, 5, 5)];
    expect(patchMap(elements, ["a"], "up")).toEqual({});
  });

  it("multi-clip move up: the bottom member resolves first, the top one rises above it", () => {
    const elements = [el("a", 0, 0, 10, 0), el("b", 1, 0, 10, 0), el("c", 2, 0, 10, 5)];
    expect(patchMap(elements, ["a", "b"], "up")).toEqual({ a: 7, b: 6 });
  });

  it("multi-clip move down: the top member resolves first, the bottom one sinks below it", () => {
    const elements = [el("a", 1, 0, 10, 9), el("b", 2, 0, 10, 9), el("c", 0, 0, 10, 5)];
    expect(patchMap(elements, ["a", "b"], "down")).toEqual({ a: 4, b: 3 });
  });

  it("multi-clip move skips a member that is already in order", () => {
    const elements = [el("a", 0, 0, 10, 20), el("b", 1, 0, 10, 0), el("c", 2, 0, 10, 5)];
    expect(patchMap(elements, ["a", "b"], "up")).toEqual({ b: 6 });
  });

  it("empty edited set → no patches", () => {
    const elements = [el("a", 0, 0, 10, 1), el("b", 1, 0, 10, 5)];
    expect(computeStackingPatches(elements, [], "up")).toEqual([]);
  });

  it("an unresolved neighbour (non-finite z) is excluded, not treated as z=0", () => {
    const elements = [
      el("a", 2, 0, 10, 9),
      el("b", 0, 0, 10, 3),
      el("ghost", 1, 0, 10, Number.NaN),
    ];
    expect(patchMap(elements, ["a"], "down")).toEqual({ a: 2 });
  });

  it("an edited clip whose own z is unresolved (non-finite) yields no patch", () => {
    const elements = [el("a", 0, 0, 10, Number.NaN), el("b", 1, 0, 10, 5)];
    expect(patchMap(elements, ["a"], "up")).toEqual({});
  });
});

describe("computeStackingPatches — only the moved clip changes", () => {
  it("a full-frame scene on the top row stays behind a caption moved up a row under it", () => {
    // Agent-made films often put the scene on track 0. The caption (z1, later in the
    // file) moves from track 3 to 2, still under the scene's row: nothing is below
    // it, so nothing changes. Lifting the scene over it would hide the caption.
    const elements = [el("scene", 0, 0, 10, 0, false, 0), el("caption", 2, 0, 10, 1, false, 1)];
    expect(patchMap(elements, ["caption"], "up")).toEqual({});
  });

  it("a caption moved to the top row comes in front of the full-frame scene", () => {
    const elements = [el("scene", 0, 0, 10, 5, false, 0), el("caption", -0.5, 0, 10, 1, false, 1)];
    expect(patchMap(elements, ["caption"], "up")).toEqual({ caption: 6 });
  });

  it("moved down under a z-0 clip earlier in the file: drops to 0 and the neighbour stays", () => {
    // z never goes negative (it could paint behind the composition's background),
    // and neighbours never move, so this order cannot be fully expressed.
    const elements = [el("r", 0, 0, 10, 0, false, 0), el("v", 1, 0, 10, 2, false, 1)];
    expect(patchMap(elements, ["v"], "down")).toEqual({ v: 0 });
  });

  it("moved down when it cannot go lower → no patch", () => {
    const elements = [el("r", 0, 0, 10, 0, false, 0), el("v", 1, 0, 10, 0, false, 1)];
    expect(patchMap(elements, ["v"], "down")).toEqual({});
  });

  it("moved down never goes under a clip on a lower row it paints over now", () => {
    // v cannot get under r (z0, earlier in the file); dropping it to 0 would hide it under w.
    const elements = [
      el("r", 0, 0, 10, 0, false, 0),
      el("v", 1, 0, 10, 2, false, 1),
      el("w", 2, 0, 10, 1, false, 2),
    ];
    expect(patchMap(elements, ["v"], "down")).toEqual({});
  });

  it("moved down sinks only as far as the clips on lower rows allow", () => {
    const elements = [el("s", 0, 0, 10, 5), el("v", 1, 0, 10, 9), el("w", 2, 0, 10, 7)];
    expect(patchMap(elements, ["v"], "down")).toEqual({ v: 8 });
  });

  it("moved down with equal z: the clip above, later in the file, already paints over it", () => {
    const elements = [el("v", 1, 0, 10, 3, false, 0), el("r", 0, 0, 10, 3, false, 1)];
    expect(patchMap(elements, ["v"], "down")).toEqual({});
  });

  it("#2198: an untouched pair keeps its order because neighbours never move", () => {
    // e overlaps n [5,10); n overlaps m [12,15); e does not overlap m.
    const elements = [
      el("m", 0, 12, 8, 1, false, 0),
      el("n", 1, 5, 10, 0, false, 1),
      el("e", 2, 0, 10, 2, false, 2),
    ];
    expect(patchMap(elements, ["e"], "down")).toEqual({ e: 0 });
  });

  it("equal z broken by file order: the clip later in the file already paints above", () => {
    const elements = [el("b", 1, 0, 10, 3, false, 0), el("e", 0, 0, 10, 3, false, 1)];
    expect(patchMap(elements, ["e"], "up")).toEqual({});
  });

  it("equal z with no file order is ambiguous → the move still writes a z", () => {
    const elements = [el("b", 1, 0, 10, 3), el("e", 0, 0, 10, 3)];
    expect(patchMap(elements, ["e"], "up")).toEqual({ e: 4 });
  });
});
