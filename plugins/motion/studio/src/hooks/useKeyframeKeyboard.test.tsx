// @vitest-environment happy-dom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useKeyframeKeyboard } from "./useKeyframeKeyboard";
import { dispatchPlainKey, type HotkeyCallbacks } from "./appHotkeysDispatch";
import { DEFAULT_SHORTCUT_SECTIONS } from "../player/components/studioShortcuts";
import { usePlayerStore } from "../player/store/playerStore";
import { createHappyDomRootHarness } from "../player/components/testRootHarness";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { mount } = createHappyDomRootHarness();

function KeyframeKeyboard(props: { enabled: boolean; onAddKeyframe: () => void }) {
  useKeyframeKeyboard(props);
  return null;
}

/** Wires the keyframe keys the way TimelineToolbar does; returns the add-keyframe spy. */
function mountKeyframeKeyboard(enabled: boolean) {
  const onAddKeyframe = vi.fn();
  const host = document.createElement("div");
  document.body.append(host);
  act(() =>
    mount(host).render(<KeyframeKeyboard enabled={enabled} onAddKeyframe={onAddKeyframe} />),
  );
  return onAddKeyframe;
}

function press(key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  window.dispatchEvent(event);
  return event;
}

function selectKeyframe() {
  usePlayerStore.setState({ selectedElementId: "box", selectedKeyframes: new Set(["box:50"]) });
}

beforeEach(selectKeyframe);
afterEach(() => usePlayerStore.getState().reset());

describe("keyframe shortcuts", () => {
  it("every key the Keyframes section lists does something with a keyframe selected", () => {
    mountKeyframeKeyboard(true);
    const cb = {
      onDeleteSelectedKeyframes: vi.fn(),
      onToggleRecording: vi.fn(),
      domEditSelectionRef: { current: null },
      readOnlyPreview: false,
    } as unknown as HotkeyCallbacks;
    const appHotkeys = (event: KeyboardEvent) =>
      dispatchPlainKey(event, event.key.toLowerCase(), cb);
    window.addEventListener("keydown", appHotkeys, true);

    const section = DEFAULT_SHORTCUT_SECTIONS.find((s) => s.title.startsWith("Keyframes"));
    const dead = (section?.hints ?? []).filter((hint) => {
      selectKeyframe();
      return !press(hint.key === "Del" ? "Delete" : hint.key.toLowerCase()).defaultPrevented;
    });
    window.removeEventListener("keydown", appHotkeys, true);

    expect(section?.hints.length).toBeGreaterThan(0);
    expect(dead.map((hint) => hint.key)).toEqual([]);
  });

  it("K adds a keyframe only while enabled and leaves J and the arrows to playback", () => {
    const playback = vi.fn();
    window.addEventListener("keydown", playback);
    const onAddKeyframe = mountKeyframeKeyboard(true);

    for (const [key, shiftKey] of [
      ["j", false],
      ["J", true],
      ["ArrowLeft", false],
      ["ArrowRight", true],
    ] as const) {
      expect(press(key, { shiftKey }).defaultPrevented).toBe(false);
    }
    expect(playback).toHaveBeenCalledTimes(4);
    expect(onAddKeyframe).not.toHaveBeenCalled();

    expect(press("k").defaultPrevented).toBe(true);
    expect(onAddKeyframe).toHaveBeenCalledTimes(1);
    expect(playback).toHaveBeenCalledTimes(4);
    window.removeEventListener("keydown", playback);
  });

  describe("with a focused picker", () => {
    const picker = document.createElement("button");
    picker.setAttribute("role", "combobox");
    afterEach(() => picker.remove());

    it("leaves K to a focused picker that owns typing, like a font combobox", () => {
      const onAddKeyframe = mountKeyframeKeyboard(true);
      document.body.append(picker);
      picker.focus();

      expect(press("k").defaultPrevented).toBe(false);
      expect(onAddKeyframe).not.toHaveBeenCalled();
    });
  });

  it("K stays playback's stop key when no keyframeable element is selected", () => {
    const playback = vi.fn();
    window.addEventListener("keydown", playback);
    const onAddKeyframe = mountKeyframeKeyboard(false);

    expect(press("k").defaultPrevented).toBe(false);
    expect(onAddKeyframe).not.toHaveBeenCalled();
    expect(playback).toHaveBeenCalledTimes(1);
    window.removeEventListener("keydown", playback);
  });
});
