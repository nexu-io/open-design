import { describe, it, expect } from "vitest";
import type { TimelineElement } from "../store/playerStore";
import {
  groupMoveFloor,
  isMultiDragActive,
  isMultiDragPassenger,
  multiDragDeltaSeconds,
  multiDragPassengerOffsetPx,
  resolveGroupMovers,
  type MultiDragPreviewInput,
} from "./timelineMultiDragPreview";

const base = (over: Partial<MultiDragPreviewInput> = {}): MultiDragPreviewInput => ({
  dragStarted: true,
  draggedKey: "a",
  draggedOriginStart: 2,
  draggedPreviewStart: 5,
  selectedKeys: new Set(["a", "b", "c"]),
  ...over,
});

describe("isMultiDragActive", () => {
  it("is active when a started drag's clip is part of a 2+ selection", () => {
    expect(isMultiDragActive(base())).toBe(true);
  });

  it("is inactive before the drag starts", () => {
    expect(isMultiDragActive(base({ dragStarted: false }))).toBe(false);
  });

  it("is inactive for a single-clip selection (single-drag behavior)", () => {
    expect(isMultiDragActive(base({ selectedKeys: new Set(["a"]) }))).toBe(false);
  });

  it("is inactive when the dragged clip is not itself selected", () => {
    expect(isMultiDragActive(base({ draggedKey: "z" }))).toBe(false);
  });
});

describe("multiDragDeltaSeconds (the one formation delta)", () => {
  it("is the grabbed clip's preview − origin start when active", () => {
    // The preview start is already group-clamped upstream, so this delta is the
    // clamped delta every member (ghost + passengers) moves by.
    expect(multiDragDeltaSeconds(base())).toBe(3);
  });

  it("supports a leftward (negative) delta", () => {
    expect(multiDragDeltaSeconds(base({ draggedPreviewStart: 0.5 }))).toBeCloseTo(-1.5);
  });

  it("is zero when no multi-drag is active", () => {
    expect(multiDragDeltaSeconds(base({ selectedKeys: new Set(["a"]) }))).toBe(0);
  });
});

describe("isMultiDragPassenger", () => {
  it("marks a selected non-dragged clip as a passenger", () => {
    expect(isMultiDragPassenger("b", base())).toBe(true);
    expect(isMultiDragPassenger("c", base())).toBe(true);
  });

  it("never marks the dragged clip itself (it is the free ghost)", () => {
    expect(isMultiDragPassenger("a", base())).toBe(false);
  });

  it("never marks an unselected clip", () => {
    expect(isMultiDragPassenger("d", base())).toBe(false);
  });

  it("marks nothing when the drag is a single-drag", () => {
    const single = base({ selectedKeys: new Set(["a"]) });
    expect(isMultiDragPassenger("b", single)).toBe(false);
  });
});

describe("multiDragPassengerOffsetPx (rigid: every passenger shares the delta)", () => {
  it("converts the one formation delta to pixels for every passenger", () => {
    // Both passengers move by the SAME 3s × 100pps = 300px — spacing locked.
    expect(multiDragPassengerOffsetPx("b", 100, base())).toBe(300);
    expect(multiDragPassengerOffsetPx("c", 100, base())).toBe(300);
  });

  it("is zero for the dragged clip and for non-passengers", () => {
    expect(multiDragPassengerOffsetPx("a", 100, base())).toBe(0);
    expect(multiDragPassengerOffsetPx("d", 100, base())).toBe(0);
  });

  it("is zero for a non-finite pps", () => {
    expect(multiDragPassengerOffsetPx("b", Number.NaN, base())).toBe(0);
  });

  it("follows a leftward delta", () => {
    expect(multiDragPassengerOffsetPx("c", 50, base({ draggedPreviewStart: 0 }))).toBe(-100);
  });
});

const at = (id: string, start: number, locked = false): TimelineElement => ({
  id,
  key: id,
  tag: "video",
  start,
  duration: 1,
  track: 0,
  domId: id,
  ...(locked ? { timelineLocked: true } : {}),
});

describe("groupMoveFloor (rigid group move)", () => {
  it("lets the grabbed clip go as far left as the leftmost mover allows, and no further", () => {
    expect(groupMoveFloor(at("g", 10), [at("g", 10), at("p", 1), at("q", 4)])).toBe(9);
    expect(groupMoveFloor(at("g", 5), [at("g", 5), at("p", 8)])).toBe(0); // the grabbed clip is leftmost
  });

  it("forbids any leftward move once a mover sits at 0", () => {
    expect(groupMoveFloor(at("g", 3), [at("g", 3), at("p", 0)])).toBe(3);
  });

  it("stops a nested mover at its host composition's start, and a lone clip at its own host", () => {
    const nested = { ...at("p", 3), parentCompositionStart: 2 };
    expect(groupMoveFloor(at("g", 10), [at("g", 10), nested])).toBe(9);
    expect(groupMoveFloor(nested, [])).toBe(2);
  });
});

describe("resolveGroupMovers (the clips a group drag moves)", () => {
  const elements = [at("g", 5), at("p", 2), at("locked", 0, true), at("other", 1)];

  it("is every selected clip that can move, never a locked one or an unselected one", () => {
    const movers = resolveGroupMovers(elements, new Set(["g", "p", "locked"]), "g");
    expect(movers?.map((e) => e.id)).toEqual(["g", "p"]);
  });

  it("is null when the grabbed clip is not part of a multi-selection", () => {
    expect(resolveGroupMovers(elements, new Set(["g"]), "g")).toBeNull();
    expect(resolveGroupMovers(elements, new Set(["p", "other"]), "g")).toBeNull();
    expect(resolveGroupMovers(elements, undefined, "g")).toBeNull();
  });
});
