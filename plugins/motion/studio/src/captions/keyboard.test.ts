// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from "vitest";
import { setStudioKeys } from "../player/components/studioShortcuts";
import { shouldHandleCaptionNudgeKey } from "./keyboard";

function mockKeyboardEvent(
  key: string,
  overrides: Partial<Pick<KeyboardEvent, "altKey" | "ctrlKey" | "metaKey">> = {},
): Pick<KeyboardEvent, "altKey" | "ctrlKey" | "metaKey" | "key"> {
  return {
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    key,
    ...overrides,
  };
}

describe("shouldHandleCaptionNudgeKey", () => {
  it("handles plain and Shift-modified arrow keys for caption nudging", () => {
    expect(shouldHandleCaptionNudgeKey(mockKeyboardEvent("ArrowLeft"))).toBe(true);
    expect(shouldHandleCaptionNudgeKey(mockKeyboardEvent("ArrowRight"))).toBe(true);
  });

  it("ignores browser and app shortcut chords", () => {
    expect(shouldHandleCaptionNudgeKey(mockKeyboardEvent("ArrowLeft", { altKey: true }))).toBe(
      false,
    );
    expect(shouldHandleCaptionNudgeKey(mockKeyboardEvent("ArrowRight", { ctrlKey: true }))).toBe(
      false,
    );
    expect(shouldHandleCaptionNudgeKey(mockKeyboardEvent("ArrowRight", { metaKey: true }))).toBe(
      false,
    );
  });

  it("ignores non-arrow keys", () => {
    expect(shouldHandleCaptionNudgeKey(mockKeyboardEvent("KeyL"))).toBe(false);
  });

  it("ignores arrows a focused slider owns", () => {
    const slider = document.createElement("div");
    slider.setAttribute("role", "slider");
    expect(shouldHandleCaptionNudgeKey(mockKeyboardEvent("ArrowUp"), slider)).toBe(false);
  });

  it("ignores arrows when the event target is an editable element", () => {
    const input = document.createElement("input");
    const textarea = document.createElement("textarea");
    const div = document.createElement("div");
    expect(shouldHandleCaptionNudgeKey(mockKeyboardEvent("ArrowUp"), input)).toBe(false);
    expect(shouldHandleCaptionNudgeKey(mockKeyboardEvent("ArrowUp"), textarea)).toBe(false);
    expect(shouldHandleCaptionNudgeKey(mockKeyboardEvent("ArrowUp"), div)).toBe(true);
    expect(shouldHandleCaptionNudgeKey(mockKeyboardEvent("ArrowUp"), null)).toBe(true);
  });

  it.each(["video", "audio"])("leaves the arrows to a focused <%s controls>", (tag) => {
    const player = document.createElement(tag);
    player.setAttribute("controls", "");
    expect(shouldHandleCaptionNudgeKey(mockKeyboardEvent("ArrowRight"), player)).toBe(false);
  });
});

describe("shouldHandleCaptionNudgeKey: remapped", () => {
  afterEach(() => setStudioKeys(null));

  it("follows the canvas nudge keys", () => {
    setStudioKeys({ nudgeUp: "u" });
    expect(shouldHandleCaptionNudgeKey(mockKeyboardEvent("ArrowUp"))).toBe(false);
    expect(shouldHandleCaptionNudgeKey(mockKeyboardEvent("u"))).toBe(true);
  });
});
