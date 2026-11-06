import { afterEach, describe, expect, it } from "vitest";
import { setStudioKeys } from "../../player/components/studioShortcuts";
import {
  CANVAS_NUDGE_SHIFT_STEP_PX,
  CANVAS_NUDGE_STEP_PX,
  canCanvasNudgeTargets,
  resolveCanvasNudgeDelta,
} from "./domEditNudge";

function mockKeyboardEvent(
  key: string,
  overrides: Partial<Pick<KeyboardEvent, "altKey" | "ctrlKey" | "metaKey" | "shiftKey">> = {},
): Pick<KeyboardEvent, "altKey" | "ctrlKey" | "metaKey" | "shiftKey" | "key"> {
  return {
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    key,
    ...overrides,
  };
}

describe("resolveCanvasNudgeDelta", () => {
  it("maps plain arrows to 1px composition deltas", () => {
    expect(resolveCanvasNudgeDelta(mockKeyboardEvent("ArrowLeft"))).toEqual({
      dx: -CANVAS_NUDGE_STEP_PX,
      dy: 0,
    });
    expect(resolveCanvasNudgeDelta(mockKeyboardEvent("ArrowRight"))).toEqual({
      dx: CANVAS_NUDGE_STEP_PX,
      dy: 0,
    });
    expect(resolveCanvasNudgeDelta(mockKeyboardEvent("ArrowUp"))).toEqual({
      dx: 0,
      dy: -CANVAS_NUDGE_STEP_PX,
    });
    expect(resolveCanvasNudgeDelta(mockKeyboardEvent("ArrowDown"))).toEqual({
      dx: 0,
      dy: CANVAS_NUDGE_STEP_PX,
    });
  });

  it("maps Shift+arrow to 10px deltas", () => {
    expect(resolveCanvasNudgeDelta(mockKeyboardEvent("ArrowRight", { shiftKey: true }))).toEqual({
      dx: CANVAS_NUDGE_SHIFT_STEP_PX,
      dy: 0,
    });
    expect(resolveCanvasNudgeDelta(mockKeyboardEvent("ArrowUp", { shiftKey: true }))).toEqual({
      dx: 0,
      dy: -CANVAS_NUDGE_SHIFT_STEP_PX,
    });
  });

  it("ignores browser and app shortcut chords", () => {
    expect(resolveCanvasNudgeDelta(mockKeyboardEvent("ArrowLeft", { altKey: true }))).toBeNull();
    expect(resolveCanvasNudgeDelta(mockKeyboardEvent("ArrowLeft", { ctrlKey: true }))).toBeNull();
    expect(resolveCanvasNudgeDelta(mockKeyboardEvent("ArrowLeft", { metaKey: true }))).toBeNull();
  });

  it("ignores non-arrow keys", () => {
    expect(resolveCanvasNudgeDelta(mockKeyboardEvent("Escape"))).toBeNull();
    expect(resolveCanvasNudgeDelta(mockKeyboardEvent("a"))).toBeNull();
  });
});

describe("canCanvasNudgeTargets", () => {
  const movable = { capabilities: { canApplyManualOffset: true } };
  const locked = { capabilities: { canApplyManualOffset: false } };

  it("requires at least one target", () => {
    expect(canCanvasNudgeTargets([])).toBe(false);
  });

  it("allows only when every target accepts a manual offset", () => {
    expect(canCanvasNudgeTargets([movable])).toBe(true);
    expect(canCanvasNudgeTargets([movable, movable])).toBe(true);
    expect(canCanvasNudgeTargets([locked])).toBe(false);
    expect(canCanvasNudgeTargets([movable, locked])).toBe(false);
  });
});

describe("resolveCanvasNudgeDelta: remapped keys", () => {
  afterEach(() => setStudioKeys(null));

  it("a remapped direction and step key answer and the arrow goes dead", () => {
    setStudioKeys({ nudgeLeft: "h", nudgeRightTen: "alt+l" });
    expect(resolveCanvasNudgeDelta(mockKeyboardEvent("ArrowLeft"))).toBeNull();
    expect(resolveCanvasNudgeDelta(mockKeyboardEvent("h"))).toEqual({ dx: -1, dy: 0 });
    expect(resolveCanvasNudgeDelta(mockKeyboardEvent("l", { altKey: true }))).toEqual({
      dx: 10,
      dy: 0,
    });
    expect(resolveCanvasNudgeDelta(mockKeyboardEvent("ArrowRight", { shiftKey: true }))).toBeNull();
  });
});
