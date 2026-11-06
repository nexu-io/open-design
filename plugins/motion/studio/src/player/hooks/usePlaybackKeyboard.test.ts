// @vitest-environment happy-dom
// fallow-ignore-file code-duplication

import React, { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePlaybackKeyboard } from "./usePlaybackKeyboard";
import { usePlayerStore } from "../store/playerStore";
import { setStudioKeys } from "../components/studioShortcuts";
import { useLinkedClipPreferences } from "../../utils/linkedClipPreferences";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  setStudioKeys(null);
  document.body.innerHTML = "";
  usePlayerStore.getState().reset();
  useLinkedClipPreferences.getState().setCompositionFps(30);
});

interface Spies {
  seek: ReturnType<typeof vi.fn>;
  play: ReturnType<typeof vi.fn>;
  playBackward: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
}

interface HookHandle {
  dispatch: (event: KeyboardEvent) => void;
  release: (event: KeyboardEvent) => void;
  spies: Spies;
}

function setupHook(): HookHandle {
  const spies: Spies = {
    seek: vi.fn(),
    play: vi.fn(),
    playBackward: vi.fn(),
    pause: vi.fn(),
  };

  let captured: ReturnType<typeof usePlaybackKeyboard> | null = null;

  function Harness() {
    const iframeRef = React.useRef<HTMLIFrameElement | null>(null);
    const shuttleDirectionRef = React.useRef<"forward" | "backward" | null>(null);
    const shuttleSpeedIndexRef = React.useRef(0);
    const iframeShortcutCleanupRef = React.useRef<(() => void) | null>(null);
    const result = usePlaybackKeyboard({
      iframeRef,
      shuttleDirectionRef,
      shuttleSpeedIndexRef,
      iframeShortcutCleanupRef,
      getAdapter: () => null,
      ...spies,
    });
    useEffect(() => {
      captured = result;
    });
    return null;
  }

  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => {
    root.render(React.createElement(Harness));
  });

  if (!captured) throw new Error("usePlaybackKeyboard harness did not capture handlers");

  return {
    dispatch: (event) => captured!.playbackKeyDownRef.current(event),
    release: (event) => captured!.playbackKeyUpRef.current(event),
    spies,
  };
}

function keydown(init: {
  code: string;
  key: string;
  shiftKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}): KeyboardEvent {
  return new KeyboardEvent("keydown", {
    code: init.code,
    key: init.key,
    shiftKey: init.shiftKey ?? false,
    metaKey: init.metaKey ?? false,
    altKey: init.altKey ?? false,
    cancelable: true,
  });
}

function keyup(init: { code: string; key: string }): KeyboardEvent {
  return new KeyboardEvent("keyup", { code: init.code, key: init.key });
}

describe("usePlaybackKeyboard — keyboard layout independence (#834)", () => {
  it("'Jump to in-point' fires on physical KeyA in a QWERTY layout", () => {
    const { dispatch, spies } = setupHook();
    usePlayerStore.setState({ inPoint: 1.5 });

    act(() => {
      dispatch(keydown({ code: "KeyA", key: "a" }));
    });

    expect(spies.seek).toHaveBeenCalledWith(1.5, { keepPlaying: true });
  });

  it("'Jump to in-point' fires on AZERTY (physical KeyQ produces e.key='a')", () => {
    const { dispatch, spies } = setupHook();
    usePlayerStore.setState({ inPoint: 2.5 });

    act(() => {
      dispatch(keydown({ code: "KeyQ", key: "a" }));
    });

    expect(spies.seek).toHaveBeenCalledWith(2.5, { keepPlaying: true });
  });

  it("AZERTY 'A' physical key (e.key='q') no longer triggers in-point seek", () => {
    const { dispatch, spies } = setupHook();
    usePlayerStore.setState({ inPoint: 4.0 });

    act(() => {
      dispatch(keydown({ code: "KeyA", key: "q" }));
    });

    expect(spies.seek).not.toHaveBeenCalled();
  });

  it("Shift+I clears the in-point (e.key='I' is matched after lowercasing)", () => {
    const { dispatch } = setupHook();
    usePlayerStore.setState({ inPoint: 3.0 });

    act(() => {
      dispatch(keydown({ code: "KeyI", key: "I", shiftKey: true }));
    });

    expect(usePlayerStore.getState().inPoint).toBeNull();
  });

  it("K-held + L steps forward one frame (combo uses character, not physical position)", () => {
    const { dispatch, spies } = setupHook();
    usePlayerStore.setState({ currentTime: 0 });

    act(() => {
      dispatch(keydown({ code: "KeyK", key: "k" }));
    });
    act(() => {
      dispatch(keydown({ code: "KeyL", key: "l" }));
    });

    expect(spies.seek).toHaveBeenCalledTimes(1);
    expect(spies.play).not.toHaveBeenCalled();
  });

  it("releasing K removes it from the pressed set so subsequent L resumes forward shuttle", () => {
    const { dispatch, release, spies } = setupHook();

    act(() => {
      dispatch(keydown({ code: "KeyK", key: "k" }));
    });
    act(() => {
      release(keyup({ code: "KeyK", key: "k" }));
    });
    act(() => {
      dispatch(keydown({ code: "KeyL", key: "l" }));
    });

    expect(spies.play).toHaveBeenCalledTimes(1);
    expect(spies.seek).not.toHaveBeenCalled();
  });

  it("Space (universal e.code) still toggles play", () => {
    const { dispatch, spies } = setupHook();
    usePlayerStore.setState({ isPlaying: false });

    act(() => {
      dispatch(keydown({ code: "Space", key: " " }));
    });

    expect(spies.play).toHaveBeenCalledTimes(1);
  });

  it("'A' does not seek to the in-point while the razor tool is armed, so it's free for the razor's own return-to-select binding", () => {
    const { dispatch, spies } = setupHook();
    usePlayerStore.setState({ inPoint: 1.5, activeTool: "razor" });

    act(() => {
      dispatch(keydown({ code: "KeyA", key: "a" }));
    });

    expect(spies.seek).not.toHaveBeenCalled();
  });

  it("'A' still seeks to the in-point when the razor tool isn't armed", () => {
    const { dispatch, spies } = setupHook();
    usePlayerStore.setState({ inPoint: 1.5, activeTool: "select" });

    act(() => {
      dispatch(keydown({ code: "KeyA", key: "a" }));
    });

    expect(spies.seek).toHaveBeenCalledWith(1.5, { keepPlaying: true });
  });

  it("Shift+A is a different combo from A: it neither jumps to the in-point nor exits the razor", () => {
    const { dispatch, spies } = setupHook();
    usePlayerStore.setState({ inPoint: 1.5, activeTool: "razor" });

    act(() => {
      dispatch(keydown({ code: "KeyA", key: "a", shiftKey: true }));
    });

    expect(spies.seek).not.toHaveBeenCalled();
    expect(usePlayerStore.getState().activeTool).toBe("razor");
  });
});

describe("usePlaybackKeyboard — mute & loop shortcuts (#905)", () => {
  it("M toggles audioMuted", () => {
    const { dispatch } = setupHook();
    expect(usePlayerStore.getState().audioMuted).toBe(false);

    act(() => {
      dispatch(keydown({ code: "KeyM", key: "m" }));
    });
    expect(usePlayerStore.getState().audioMuted).toBe(true);

    act(() => {
      dispatch(keydown({ code: "KeyM", key: "m" }));
    });
    expect(usePlayerStore.getState().audioMuted).toBe(false);
  });

  it("M toggles audioMuted above 1x playback too", () => {
    const { dispatch } = setupHook();
    usePlayerStore.setState({ playbackRate: 2, audioMuted: false });

    act(() => {
      dispatch(keydown({ code: "KeyM", key: "m" }));
    });

    expect(usePlayerStore.getState().audioMuted).toBe(true);
  });

  it("Shift+L toggles loopEnabled without starting forward shuttle", () => {
    const { dispatch, spies } = setupHook();
    expect(usePlayerStore.getState().loopEnabled).toBe(false);

    act(() => {
      dispatch(keydown({ code: "KeyL", key: "L", shiftKey: true }));
    });
    expect(usePlayerStore.getState().loopEnabled).toBe(true);
    expect(spies.play).not.toHaveBeenCalled();

    act(() => {
      dispatch(keydown({ code: "KeyL", key: "L", shiftKey: true }));
    });
    expect(usePlayerStore.getState().loopEnabled).toBe(false);
  });

  it("Plain L still starts forward shuttle (regression guard)", () => {
    const { dispatch, spies } = setupHook();

    act(() => {
      dispatch(keydown({ code: "KeyL", key: "l" }));
    });

    expect(spies.play).toHaveBeenCalledTimes(1);
    expect(usePlayerStore.getState().loopEnabled).toBe(false);
  });
});

describe("usePlaybackKeyboard — a focused native player owns its keys", () => {
  const KEYS = [
    { code: "ArrowLeft", key: "ArrowLeft" },
    { code: "ArrowRight", key: "ArrowRight" },
    { code: "Space", key: " " },
    { code: "KeyJ", key: "j" },
    { code: "KeyK", key: "k" },
    { code: "KeyL", key: "l" },
  ];

  it.each(["video", "audio"])(
    "leaves the timeline alone while a <%s controls> has focus",
    (tag) => {
      const { dispatch, spies } = setupHook();
      const player = document.createElement(tag);
      player.setAttribute("controls", "");
      document.body.append(player);
      const before = usePlayerStore.getState().currentTime;
      for (const init of KEYS) {
        const event = keydown(init);
        Object.defineProperty(event, "target", { value: player });
        dispatch(event);
        expect(event.defaultPrevented, init.code).toBe(false);
      }
      expect(spies.seek).not.toHaveBeenCalled();
      expect(spies.play).not.toHaveBeenCalled();
      expect(spies.playBackward).not.toHaveBeenCalled();
      expect(spies.pause).not.toHaveBeenCalled();
      expect(usePlayerStore.getState().currentTime).toBe(before);
    },
  );

  it("still steps the timeline from a player without controls", () => {
    const { dispatch } = setupHook();
    const video = document.createElement("video");
    document.body.append(video);
    const event = keydown({ code: "ArrowRight", key: "ArrowRight" });
    Object.defineProperty(event, "target", { value: video });
    dispatch(event);
    expect(event.defaultPrevented).toBe(true);
  });
});

describe("usePlaybackKeyboard — frame step", () => {
  it.each([
    [25, 3],
    [30_000 / 1_001, 3],
  ])("ArrowRight at %s fps steps one frame of the composition", (fps, frame) => {
    const { dispatch, spies } = setupHook();
    useLinkedClipPreferences.getState().setCompositionFps(fps);
    usePlayerStore.setState({ currentTime: frame / fps });

    act(() => {
      dispatch(keydown({ code: "ArrowRight", key: "ArrowRight" }));
    });

    expect(spies.seek).toHaveBeenCalledWith((frame + 1) / fps);
  });
});

describe("usePlaybackKeyboard — keys the host can remap", () => {
  beforeEach(() => usePlayerStore.setState({ audioMuted: false, loopEnabled: false }));

  const press = (dispatch: HookHandle["dispatch"], key: string, shiftKey = false) =>
    act(() => {
      dispatch(keydown({ code: `Key${key.toUpperCase()}`, key, shiftKey }));
    });

  it("answers every default key", () => {
    const { dispatch, release, spies } = setupHook();
    press(dispatch, "m");
    expect(usePlayerStore.getState().audioMuted).toBe(true);
    press(dispatch, "l", true);
    expect(usePlayerStore.getState().loopEnabled).toBe(true);
    press(dispatch, "k");
    expect(spies.pause).toHaveBeenCalledTimes(1);
    act(() => release(keyup({ code: "KeyK", key: "k" })));
    press(dispatch, "j");
    expect(spies.playBackward).toHaveBeenCalledTimes(1);
    press(dispatch, "i");
    expect(usePlayerStore.getState().inPoint).not.toBeNull();
    press(dispatch, "o");
    expect(usePlayerStore.getState().outPoint).not.toBeNull();
    press(dispatch, "a");
    press(dispatch, "e");
    expect(spies.seek).toHaveBeenCalledTimes(2);
  });

  it("a remapped key answers and the old one does not", () => {
    setStudioKeys({ mute: "x", seekToIn: "u", shuttleForward: "y" });
    const { dispatch, spies } = setupHook();
    press(dispatch, "m");
    expect(usePlayerStore.getState().audioMuted).toBe(false);
    press(dispatch, "x");
    expect(usePlayerStore.getState().audioMuted).toBe(true);
    press(dispatch, "a");
    expect(spies.seek).not.toHaveBeenCalled();
    press(dispatch, "u");
    expect(spies.seek).toHaveBeenCalledTimes(1);
    press(dispatch, "l");
    expect(spies.play).not.toHaveBeenCalled();
    press(dispatch, "y");
    expect(spies.play).toHaveBeenCalledTimes(1);
    press(dispatch, "l", true);
    expect(usePlayerStore.getState().loopEnabled).toBe(true);
  });

  it("holding the remapped stop key still frame-steps with the remapped shuttle keys", () => {
    setStudioKeys({ pause: "p", shuttleForward: "y" });
    const { dispatch, spies } = setupHook();
    press(dispatch, "p");
    press(dispatch, "y");
    press(dispatch, "j");
    expect(spies.seek).toHaveBeenCalledTimes(2);
    expect(spies.play).not.toHaveBeenCalled();
    expect(spies.playBackward).not.toHaveBeenCalled();
  });

  it("with the razor armed, jump-to-in still answers when razor-back-to-select moved", () => {
    setStudioKeys({ exitRazor: "x" });
    usePlayerStore.setState({ activeTool: "razor", inPoint: 2 });
    const { dispatch, spies } = setupHook();
    press(dispatch, "a");
    expect(spies.seek).toHaveBeenCalledWith(2, { keepPlaying: true });
  });

  it("with the razor armed, a remapped jump-to-in key still answers", () => {
    setStudioKeys({ seekToIn: "q" });
    usePlayerStore.setState({ activeTool: "razor", inPoint: 3 });
    const { dispatch, spies } = setupHook();
    press(dispatch, "q");
    expect(spies.seek).toHaveBeenCalledWith(3, { keepPlaying: true });
  });
});

describe("usePlaybackKeyboard: space, arrows, loop and clear keys are combos", () => {
  const send = (dispatch: HookHandle["dispatch"], init: Partial<Parameters<typeof keydown>[0]>) =>
    act(() => {
      dispatch(keydown({ code: "", key: "", ...init }));
    });

  it("Space, arrows (Shift = 10), Shift+L and Shift+I answer by default", () => {
    const { dispatch, spies } = setupHook();
    usePlayerStore.setState({ isPlaying: false, inPoint: 1, loopEnabled: false });
    send(dispatch, { code: "Space", key: " " });
    expect(spies.play).toHaveBeenCalledTimes(1);
    send(dispatch, { code: "ArrowRight", key: "ArrowRight", shiftKey: true });
    send(dispatch, { code: "ArrowLeft", key: "ArrowLeft" });
    expect(spies.seek).toHaveBeenCalledTimes(2);
    send(dispatch, { code: "KeyL", key: "L", shiftKey: true });
    expect(usePlayerStore.getState().loopEnabled).toBe(true);
    send(dispatch, { code: "KeyI", key: "I", shiftKey: true });
    expect(usePlayerStore.getState().inPoint).toBeNull();
  });

  it("a remapped key answers and the old one does not", () => {
    setStudioKeys({
      playPause: "p",
      frameForward: "x",
      loop: "mod+shift+u",
      clearInPoint: "shift+y",
    });
    const { dispatch, spies } = setupHook();
    usePlayerStore.setState({ isPlaying: false, inPoint: 1, loopEnabled: false });
    send(dispatch, { code: "Space", key: " " });
    send(dispatch, { code: "ArrowRight", key: "ArrowRight" });
    send(dispatch, { code: "KeyL", key: "L", shiftKey: true });
    send(dispatch, { code: "KeyI", key: "I", shiftKey: true });
    expect(spies.play).not.toHaveBeenCalled();
    expect(spies.seek).not.toHaveBeenCalled();
    expect(usePlayerStore.getState().loopEnabled).toBe(false);
    expect(usePlayerStore.getState().inPoint).toBe(1);
    send(dispatch, { code: "KeyP", key: "p" });
    expect(spies.play).toHaveBeenCalledTimes(1);
    send(dispatch, { code: "KeyX", key: "x" });
    expect(spies.seek).toHaveBeenCalledTimes(1);
    send(dispatch, { code: "KeyY", key: "Y", shiftKey: true });
    expect(usePlayerStore.getState().inPoint).toBeNull();
  });
});

describe("usePlaybackKeyboard: modifier combos and named keys", () => {
  const send = (dispatch: HookHandle["dispatch"], init: Parameters<typeof keydown>[0]) =>
    act(() => {
      dispatch(keydown(init));
    });

  it("a playback action remapped to a Cmd or Alt combo answers, and the plain key does not", () => {
    setStudioKeys({ playPause: "mod+p", mute: "alt+m" });
    const { dispatch, spies } = setupHook();
    usePlayerStore.setState({ isPlaying: false, audioMuted: false });
    send(dispatch, { code: "KeyP", key: "p", metaKey: true });
    expect(spies.play).toHaveBeenCalledTimes(1);
    send(dispatch, { code: "KeyM", key: "µ", altKey: true });
    expect(usePlayerStore.getState().audioMuted).toBe(true);
    send(dispatch, { code: "KeyP", key: "p" });
    expect(spies.play).toHaveBeenCalledTimes(1);
  });

  it("holding a stop key that is a named key still frame-steps instead of shuttling", () => {
    setStudioKeys({ pause: "Home" });
    const { dispatch, spies } = setupHook();
    send(dispatch, { code: "Home", key: "Home" });
    send(dispatch, { code: "KeyJ", key: "j" });
    expect(spies.seek).toHaveBeenCalledTimes(1);
    expect(spies.playBackward).not.toHaveBeenCalled();
  });
});
