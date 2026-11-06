// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SHORTCUT_SECTIONS,
  DEFAULT_STUDIO_KEYS,
  getShortcutSections,
  getStudioKey,
  setStudioKeys,
  useStudioKeys,
} from "./studioShortcuts";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  setStudioKeys(null);
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

const hintFor = (label: string) =>
  getShortcutSections()
    .flatMap((s) => s.hints)
    .find((h) => h.label === label)?.key;

describe("studio key resolver", () => {
  it("answers today's keys when no host overrides anything", () => {
    expect(DEFAULT_STUDIO_KEYS).toMatchObject({
      mute: "m",
      pause: "k",
      shuttleBack: "j",
      shuttleForward: "l",
      inPoint: "i",
      outPoint: "o",
      seekToIn: "a",
      seekToOut: "e",
      fullscreen: "f",
      split: "s",
      record: "r",
      addKeyframe: "k",
      audioGain: "g",
      zoomSelection: "z",
      selectTool: "v",
      razorTool: "b",
      selectLeftward: "[",
      selectRightward: "]",
      exitRazor: "a",
      snap: "s",
      grid: "g",
      timelineSnap: "n",
    });
    expect(getShortcutSections()).toEqual(DEFAULT_SHORTCUT_SECTIONS);
  });

  it("normalises an override to lower case and leaves the other actions alone", () => {
    setStudioKeys({ mute: "X" });
    expect(getStudioKey("mute")).toBe("x");
    expect(getStudioKey("fullscreen")).toBe("f");
  });

  it("lists the remapped key in the shortcut list", () => {
    setStudioKeys({ mute: "x", seekToIn: "u" });
    expect(hintFor("Toggle mute")).toBe("X");
    expect(hintFor("Jump to in-point")).toBe("U");
    expect(hintFor("Toggle loop")).toBe("⇧L");
    setStudioKeys({ shuttleForward: "y" });
    expect(hintFor("Play forward")).toBe("Y");
    expect(hintFor("Toggle loop")).toBe("⇧L");
  });

  it("refuses a map that binds two actions to one key and keeps every default", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    setStudioKeys({ mute: "x", razorTool: "x" });
    expect(getStudioKey("mute")).toBe("m");
    expect(getStudioKey("razorTool")).toBe("b");
    setStudioKeys({ mute: "x", razorTool: "x" });
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("refuses a key that is not one character", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    setStudioKeys({ razorTool: "y", mute: "ctrl" });
    expect(getStudioKey("mute")).toBe("m");
    expect(getStudioKey("razorTool")).toBe("b");
    setStudioKeys({ razorTool: "y", toString: "z" } as never);
    expect(getStudioKey("razorTool")).toBe("b");
  });

  it("still lets the keys Studio already shares (K stop/keyframe, S split/snap) share", () => {
    setStudioKeys({ mute: "x" });
    expect(getStudioKey("pause")).toBe(getStudioKey("addKeyframe"));
    expect(getStudioKey("mute")).toBe("x");
  });

  it("re-renders a component using the hook when the host swaps the map", () => {
    function Probe() {
      return <span data-probe>{useStudioKeys().razorTool}</span>;
    }
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() => root.render(<Probe />));
    expect(host.textContent).toBe("b");
    act(() => setStudioKeys({ razorTool: "y" }));
    expect(host.textContent).toBe("y");
    act(() => root.unmount());
  });
});

describe("lists follow combos", () => {
  it("shows the remapped combos and keeps today's default text", () => {
    expect(hintFor("Undo")).toBe("⌘Z");
    expect(hintFor("Redo")).toBe("⌘⇧Z");
    expect(hintFor("Play / Pause")).toBe("Space");
    expect(hintFor("Step 1 frame")).toBe("←/→");
    expect(hintFor("Step 10 frames")).toBe("⇧←/⇧→");
    expect(hintFor("Toggle loop")).toBe("⇧L");
    setStudioKeys({ undo: "mod+u", playPause: "p", frameBack: "y", frameForward: "u" });
    expect(hintFor("Undo")).toBe("⌘U");
    expect(hintFor("Play / Pause")).toBe("P");
    expect(hintFor("Step 1 frame")).toBe("Y/U");
  });
});
