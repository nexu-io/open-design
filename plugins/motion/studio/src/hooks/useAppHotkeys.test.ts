// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dispatchModifierKey, dispatchPlainKey, type HotkeyCallbacks } from "./appHotkeysDispatch";
import { liveTime, usePlayerStore } from "../player/store/playerStore";
import type { DomEditSelection } from "../components/editor/domEditing";
import { clearAutomationClipboard, copyRange } from "../player/components/automationClipboard";
import { VOLUME_RANGE } from "@hyperframes/core/audio-automation";
import type { TimelineElement } from "../player/store/timelineElement";
import { useDockLayoutStore } from "../components/dock/dockLayoutStore";
import { setStudioKeys } from "../player/components/studioShortcuts";
import { useAudioGainDialogStore } from "../player/components/audioGainDialogStore";
import {
  cancelTimelineZoom,
  registerTimelineZoomViewport,
} from "../player/components/timelineZoomInput";

/** Minimal valid fixture — TimelineElement only requires these five fields. */
const bgmElement: TimelineElement = {
  id: "bgm",
  key: "bgm",
  tag: "audio",
  start: 0,
  duration: 6,
  track: 0,
};

/** Every callback dispatchPlainKey can reach, so a test can assert which one
 *  a key resolved to. Unannotated on purpose: the parameter type is not
 *  exported, and structural inference checks it at the call site. */
function callbacks(overrides: Partial<HotkeyCallbacks> = {}) {
  return {
    handleTimelineElementDelete: vi.fn(async () => {}),
    handleTimelineElementsDelete: vi.fn(async () => {}),
    handleTimelineElementSplit: vi.fn(async () => {}),
    handleDomEditElementDelete: vi.fn(async () => {}),
    handleUndo: vi.fn(async () => {}),
    handleRedo: vi.fn(async () => {}),
    handleCopy: vi.fn(() => false),
    handlePaste: vi.fn(async () => {}),
    handleCut: vi.fn(async () => false),
    handleDuplicate: vi.fn(async () => false),
    onGroupSelection: vi.fn(),
    onUngroupSelection: vi.fn(),
    onResetKeyframes: vi.fn(() => true),
    onDeleteSelectedKeyframes: vi.fn(),
    showToast: vi.fn(),
    domEditSelectionRef: { current: null },
    readOnlyPreview: false,
    ...overrides,
  };
}

const press = (key: string) =>
  new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });

const chord = (key: string) =>
  new KeyboardEvent("keydown", { key, metaKey: true, bubbles: true, cancelable: true });

afterEach(() => {
  setStudioKeys(null);
  usePlayerStore.getState().setActiveTool("select");
  clearAutomationClipboard();
  usePlayerStore.getState().clearAutomationSelection();
  usePlayerStore.setState({
    elements: [],
    selectedElementId: null,
    selectedElementIds: new Set<string>(),
    selectedKeyframes: new Set<string>(),
  });
});

describe("keys on a focused slider", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });
  const slider = () => {
    const el = document.createElement("div");
    el.setAttribute("role", "slider");
    document.body.append(el);
    return el;
  };
  const from = (target: HTMLElement, init: KeyboardEventInit) => {
    const event = new KeyboardEvent("keydown", { ...init, bubbles: true, cancelable: true });
    Object.defineProperty(event, "target", { value: target });
    return event;
  };

  it("leaves Delete to the slider instead of deleting the selected clip", () => {
    usePlayerStore.setState({
      elements: [bgmElement],
      selectedElementId: "bgm",
      selectedElementIds: new Set(["bgm"]),
    });
    const cb = callbacks();
    dispatchPlainKey(from(slider(), { key: "Delete" }), "delete", cb);
    expect(cb.handleTimelineElementsDelete).not.toHaveBeenCalled();
    expect(cb.handleTimelineElementDelete).not.toHaveBeenCalled();
  });

  it.each(["video", "audio"])("leaves Delete to a focused <%s controls>", (tag) => {
    usePlayerStore.setState({
      elements: [bgmElement],
      selectedElementId: "bgm",
      selectedElementIds: new Set(["bgm"]),
    });
    const player = document.body.appendChild(document.createElement(tag));
    player.setAttribute("controls", "");
    const cb = callbacks();
    dispatchPlainKey(from(player, { key: "Delete" }), "delete", cb);
    expect(cb.handleTimelineElementsDelete).not.toHaveBeenCalled();
    expect(cb.handleTimelineElementDelete).not.toHaveBeenCalled();
  });

  it("still undoes with Cmd+Z while a slider has focus", () => {
    const cb = callbacks();
    dispatchModifierKey(from(slider(), { key: "z", metaKey: true }), "z", cb);
    expect(cb.handleUndo).toHaveBeenCalledTimes(1);
  });
});

describe("dispatchPlainKey — select leftward / rightward", () => {
  const clips = [
    { ...bgmElement, id: "early", key: "early", start: 0, track: 0 },
    { ...bgmElement, id: "at", key: "at", start: 4, track: 1 },
    { ...bgmElement, id: "late", key: "late", start: 7, track: 2 },
    { ...bgmElement, id: "gone", key: "gone", start: 0, duration: 2, track: 3 },
  ];
  beforeEach(() => usePlayerStore.setState({ elements: clips, currentTime: 4 }));

  it("[ selects every clip that started before the playhead, crossing clips included", () => {
    const event = press("[");
    dispatchPlainKey(event, "[", callbacks());
    expect([...usePlayerStore.getState().selectedElementIds].sort()).toEqual(["early", "gone"]);
    expect(usePlayerStore.getState().selectedElementId).toBe("early");
    expect(event.defaultPrevented).toBe(true);
  });

  it("uses the live playhead while playing, not the time stored at play start", () => {
    usePlayerStore.setState({ isPlaying: true, currentTime: 0 });
    liveTime.notify(8);
    try {
      dispatchPlainKey(press("["), "[", callbacks());
      expect([...usePlayerStore.getState().selectedElementIds].sort()).toEqual([
        "at",
        "early",
        "gone",
        "late",
      ]);
    } finally {
      usePlayerStore.setState({ isPlaying: false });
      liveTime.notify(0);
    }
  });

  it("clears a clicked keyframe like any other selection change", () => {
    usePlayerStore.setState({ activeKeyframePct: 50 });
    dispatchPlainKey(press("]"), "]", callbacks());
    expect(usePlayerStore.getState().activeKeyframePct).toBeNull();
  });

  it("] selects every clip still running at or after the playhead, crossing clips included", () => {
    dispatchPlainKey(press("]"), "]", callbacks());
    const { selectedElementIds, selectedElementId } = usePlayerStore.getState();
    expect([...selectedElementIds].sort()).toEqual(["at", "early", "late"]);
    expect(selectedElementId).toBe("early");
  });

  it("selects nothing when no clip is on that side", () => {
    usePlayerStore.setState({
      currentTime: 0,
      selectedElementId: "late",
      selectedElementIds: new Set(["late"]),
    });
    dispatchPlainKey(press("["), "[", callbacks());
    expect(usePlayerStore.getState().selectedElementIds.size).toBe(0);
    expect(usePlayerStore.getState().selectedElementId).toBeNull();
  });
});

describe("dispatchPlainKey — Delete arbitration", () => {
  const selectBgm = () =>
    usePlayerStore.setState({ elements: [bgmElement], selectedElementId: "bgm" });

  const selectRange = () =>
    usePlayerStore
      .getState()
      .setAutomationSelection({ elementKey: "bgm", target: "volume", t0: 2, t1: 4 });

  it("deletes the selected clip when no automation range is active", () => {
    selectBgm();
    const cb = callbacks();
    const e = press("Delete");
    dispatchPlainKey(e, "delete", cb);
    // The pre-existing contract, pinned so the new guard cannot widen.
    expect(cb.handleTimelineElementsDelete).toHaveBeenCalledTimes(1);
    expect(cb.handleTimelineElementsDelete).toHaveBeenCalledWith([bgmElement]);
    expect(e.defaultPrevented).toBe(true);
  });

  it("deletes EVERY clip in a marquee selection, not just the first", () => {
    // The reported bug: select all, press Delete, and one clip disappears while
    // the rest stay — still drawn as selected. The handler used `elements.find`,
    // which stops at the first match.
    const clips = ["a", "b", "c"].map((id) => ({ ...bgmElement, id, key: id }));
    usePlayerStore.setState({
      elements: clips,
      selectedElementId: null,
      selectedElementIds: new Set(["a", "b", "c"]),
    });

    const cb = callbacks();
    const e = press("Delete");
    dispatchPlainKey(e, "delete", cb);

    expect(cb.handleTimelineElementsDelete).toHaveBeenCalledTimes(1);
    const [passed] = cb.handleTimelineElementsDelete.mock.calls[0] as [typeof clips];
    expect(passed.map((c) => c.key)).toEqual(["a", "b", "c"]);
    expect(e.defaultPrevented).toBe(true);
  });

  it("hands a canvas selection its whole group instead of the timeline's partial copy", () => {
    // The reported bug: marquee 73 elements on the canvas, press Delete, and 14
    // vanish. Only those 14 owned a timeline row, and the timeline mirror drops
    // every member that does not — so deleting through it left 59 behind, still
    // drawn as selected.
    const clips = ["a", "b"].map((id) => ({ ...bgmElement, id, key: id }));
    usePlayerStore.setState({
      elements: clips,
      selectedElementId: null,
      selectedElementIds: new Set(["a", "b"]),
    });
    const domSelection = { selector: ".title", selectorIndex: 0, sourceFile: "index.html" };

    const cb = callbacks();
    cb.domEditSelectionRef = { current: domSelection } as typeof cb.domEditSelectionRef;
    const e = press("Delete");
    dispatchPlainKey(e, "delete", cb);

    expect(cb.handleDomEditElementDelete).toHaveBeenCalledWith(domSelection, {
      expandGroup: true,
    });
    expect(cb.handleTimelineElementsDelete).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(true);
  });

  it("asks for the whole group, so Cut can still take just the one it copied", () => {
    // Expanding inside the delete handler meant every caller got the group.
    // Cut copies the primary alone, so it put one element on the clipboard and
    // removed every other member with it; paste brought back one.
    usePlayerStore.setState({
      elements: [],
      selectedElementId: null,
      selectedElementIds: new Set(),
    });
    const domSelection = { selector: ".title", selectorIndex: 0, sourceFile: "index.html" };

    const cb = callbacks();
    cb.domEditSelectionRef = { current: domSelection } as typeof cb.domEditSelectionRef;
    dispatchPlainKey(press("Delete"), "delete", cb);

    expect(cb.handleDomEditElementDelete).toHaveBeenCalledWith(domSelection, { expandGroup: true });
  });

  it("includes the primary selection alongside the marquee set", () => {
    const clips = ["a", "b"].map((id) => ({ ...bgmElement, id, key: id }));
    usePlayerStore.setState({
      elements: clips,
      selectedElementId: "b",
      selectedElementIds: new Set(["a"]),
    });

    const cb = callbacks();
    dispatchPlainKey(press("Delete"), "delete", cb);

    const [passed] = cb.handleTimelineElementsDelete.mock.calls[0] as [typeof clips];
    expect(passed.map((c) => c.key).sort()).toEqual(["a", "b"]);
  });

  it("leaves the clip alone when an automation range is active", () => {
    // The bug: this listener is on window/capture so it runs BEFORE
    // useAutomationSelectionKeyboard's document/capture handler. Without the
    // guard, clearing a 2s automation range deleted the whole audio clip.
    selectBgm();
    selectRange();
    const cb = callbacks();
    const e = press("Delete");
    dispatchPlainKey(e, "delete", cb);
    expect(cb.handleTimelineElementsDelete).not.toHaveBeenCalled();
    // Must NOT be consumed: the automation handler downstream still needs it.
    expect(e.defaultPrevented).toBe(false);
  });

  it("leaves keyframe reset alone when an automation range is active", () => {
    // Backspace's reset-keyframes branch sits below the guard, so it has to be
    // covered too — otherwise Backspace wiped every keyframe on the clip.
    selectBgm();
    usePlayerStore.setState({
      keyframeCache: new Map([["bgm", { targets: [], version: 0 }]]),
    });
    selectRange();
    const cb = callbacks();
    const e = press("Backspace");
    dispatchPlainKey(e, "backspace", cb);
    expect(cb.onResetKeyframes).not.toHaveBeenCalled();
    expect(cb.handleTimelineElementsDelete).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(false);
  });

  it("still lets a keyframe selection win over an automation range", () => {
    // Ordering: the keyframe guard precedes the automation one, so a keyframe
    // selection keeps Delete even with a range showing.
    selectBgm();
    selectRange();
    usePlayerStore.setState({ selectedKeyframes: new Set(["bgm:opacity:0"]) });
    const cb = callbacks();
    const e = press("Delete");
    dispatchPlainKey(e, "delete", cb);
    expect(cb.onDeleteSelectedKeyframes).toHaveBeenCalledTimes(1);
    expect(cb.handleTimelineElementsDelete).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(true);
  });
});

describe("dispatchModifierKey — Cmd+C/Cmd+V arbitration", () => {
  const clip: TimelineElement = {
    id: "bgm",
    key: "bgm",
    tag: "audio",
    start: 0,
    duration: 6,
    track: 0,
  };

  it("lets the clip clipboard have Cmd+C when no automation range is active", () => {
    usePlayerStore.setState({ elements: [clip], selectedElementId: "bgm" });
    const cb = callbacks();
    dispatchModifierKey(chord("c"), "c", cb);
    expect(cb.handleCopy).toHaveBeenCalled();
  });

  it("keeps Cmd+C from the clip clipboard when an automation range is active", () => {
    // Both clipboards arming on one press double-wrote and toasted "Copied clip".
    usePlayerStore.setState({ elements: [clip], selectedElementId: "bgm" });
    usePlayerStore.getState().setAutomationSelection({
      elementKey: "bgm",
      target: "volume",
      t0: 1,
      t1: 3,
    });
    const cb = callbacks();
    const e = chord("c");
    expect(dispatchModifierKey(e, "c", cb)).toBe(true);
    expect(cb.handleCopy).not.toHaveBeenCalled();
    // No preventDefault: the automation handler downstream still needs the key.
    expect(e.defaultPrevented).toBe(false);
  });

  it("lets the clip clipboard have Cmd+V when the automation clipboard is empty", () => {
    // Nothing to paste means nothing to claim — the clip paste should still run.
    clearAutomationClipboard();
    usePlayerStore.setState({ elements: [clip], selectedElementId: "bgm" });
    usePlayerStore.getState().setAutomationSelection({
      elementKey: "bgm",
      target: "volume",
      t0: 1,
      t1: 3,
    });
    const cb = callbacks();
    dispatchModifierKey(chord("v"), "v", cb);
    expect(cb.handlePaste).toHaveBeenCalled();
  });

  it("keeps Cmd+V from duplicating the clip while an automation paste is pending", () => {
    clearAutomationClipboard();
    copyRange(
      null,
      {
        target: "volume",
        points: [
          { t: 1, v: 1 },
          { t: 3, v: 0.25 },
        ],
      },
      VOLUME_RANGE,
      1,
      3,
    );
    usePlayerStore.setState({ elements: [clip], selectedElementId: "bgm" });
    usePlayerStore.getState().setAutomationSelection({
      elementKey: "bgm",
      target: "volume",
      t0: 1,
      t1: 3,
    });
    const cb = callbacks();
    const e = chord("v");
    dispatchModifierKey(e, "v", cb);
    expect(cb.handlePaste).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(false);
  });
});

describe('dispatchPlainKey — "A" returns to select while the razor is armed', () => {
  afterEach(() => {
    usePlayerStore.setState({ activeTool: "select" });
  });

  it("returns to the select tool, matching CapCut's keybinding", () => {
    usePlayerStore.setState({ activeTool: "razor" });
    const e = press("a");
    dispatchPlainKey(e, "a", callbacks());
    expect(usePlayerStore.getState().activeTool).toBe("select");
    expect(e.defaultPrevented).toBe(true);
  });

  it("does not intercept plain \"a\" when the razor isn't armed, leaving playback's seek-to-in-point live", () => {
    usePlayerStore.setState({ activeTool: "select" });
    const e = press("a");
    dispatchPlainKey(e, "a", callbacks());
    expect(usePlayerStore.getState().activeTool).toBe("select");
    expect(e.defaultPrevented).toBe(false);
  });
});

describe("hotkeys with the preview read-only", () => {
  beforeEach(() => {
    usePlayerStore.setState({ elements: [bgmElement], selectedElementId: null });
  });

  it("does not delete the selected element on Delete", () => {
    const cb = callbacks({ readOnlyPreview: true });
    cb.domEditSelectionRef.current = { id: "card" } as DomEditSelection;
    dispatchPlainKey(press("Delete"), "delete", cb);
    expect(cb.handleDomEditElementDelete).not.toHaveBeenCalled();
    expect(cb.handleTimelineElementsDelete).not.toHaveBeenCalled();
  });

  it("does not split on s", () => {
    usePlayerStore.setState({
      currentTime: 3,
      elements: [{ ...bgmElement, hfId: "hf-bgm" }],
      selectedElementId: "bgm",
    });
    const cb = callbacks({ readOnlyPreview: true });
    dispatchPlainKey(press("s"), "s", cb);
    expect(cb.handleTimelineElementSplit).not.toHaveBeenCalled();
  });

  it.each([
    ["x", "handleCut"],
    ["d", "handleDuplicate"],
    ["v", "handlePaste"],
    ["g", "onGroupSelection"],
  ] as const)("does not run %s", (key, callback) => {
    const cb = callbacks({ readOnlyPreview: true });
    cb.domEditSelectionRef.current = { id: "card" } as DomEditSelection;
    dispatchModifierKey(chord(key), key, cb);
    expect(cb[callback]).not.toHaveBeenCalled();
  });

  it("still undoes, because history covers timeline edits", () => {
    const cb = callbacks({ readOnlyPreview: true });
    dispatchModifierKey(chord("z"), "z", cb);
    expect(cb.handleUndo).toHaveBeenCalledTimes(1);
  });

  it("keeps timeline paste when the mirrored preview selection is not the owner", () => {
    usePlayerStore.setState({ selectedElementId: "bgm" });
    const cb = callbacks({ readOnlyPreview: true });
    cb.domEditSelectionRef.current = { id: "card" } as DomEditSelection;
    const event = chord("v");
    const timeline = document.createElement("div");
    timeline.dataset.studioTimeline = "true";
    Object.defineProperty(event, "target", { value: timeline });
    dispatchModifierKey(event, "v", cb);
    expect(cb.handlePaste).toHaveBeenCalledTimes(1);
  });

  it("control: with the flag off Delete removes the selected element", () => {
    const cb = callbacks();
    cb.domEditSelectionRef.current = { id: "card" } as DomEditSelection;
    dispatchPlainKey(press("Delete"), "delete", cb);
    expect(cb.handleDomEditElementDelete).toHaveBeenCalledTimes(1);
  });
});

describe("dispatchPlainKey — G opens Audio Gain", () => {
  const video: TimelineElement = {
    id: "b-roll",
    key: "b-roll",
    tag: "video",
    start: 0,
    duration: 4,
    track: 1,
  };

  afterEach(() => useAudioGainDialogStore.getState().close());

  it("opens the dialog for the selected clips with sound and owns the key", () => {
    usePlayerStore.setState({
      elements: [bgmElement, video],
      selectedElementId: "bgm",
      selectedElementIds: new Set(["bgm", "b-roll"]),
    });
    const event = press("g");
    dispatchPlainKey(event, "g", callbacks());
    expect(useAudioGainDialogStore.getState().targetKeys).toEqual(["bgm"]);
    expect(event.defaultPrevented).toBe(true);
  });

  it("Z zooms when a clip is selected and does not take the key otherwise", () => {
    const scroll = document.createElement("div");
    Object.defineProperties(scroll, {
      clientWidth: { value: 1080 },
      scrollWidth: { value: 1080 },
      scrollLeft: { value: 0, writable: true },
    });
    const unregister = registerTimelineZoomViewport({
      scroll,
      contentOrigin: 32,
      publishScroll: () => {},
    });
    usePlayerStore.setState({
      elements: [bgmElement],
      selectedElementId: "bgm",
      selectedElementIds: new Set(["bgm"]),
    });
    const event = press("z");
    dispatchPlainKey(event, "z", callbacks());
    expect(event.defaultPrevented).toBe(true);
    cancelTimelineZoom();
    unregister();

    const unmounted = press("z");
    dispatchPlainKey(unmounted, "z", callbacks());
    expect(unmounted.defaultPrevented).toBe(false);

    const collapsedScroll = document.createElement("div");
    Object.defineProperties(collapsedScroll, {
      clientWidth: { value: 32 },
      scrollWidth: { value: 32 },
      scrollLeft: { value: 0, writable: true },
    });
    const unregisterCollapsed = registerTimelineZoomViewport({
      scroll: collapsedScroll,
      contentOrigin: 32,
      publishScroll: () => {},
    });
    const collapsed = press("z");
    dispatchPlainKey(collapsed, "z", callbacks());
    expect(collapsed.defaultPrevented).toBe(false);
    unregisterCollapsed();

    usePlayerStore.setState({ selectedElementId: null, selectedElementIds: new Set() });
    const idle = press("z");
    dispatchPlainKey(idle, "z", callbacks());
    expect(idle.defaultPrevented).toBe(false);

    const shifted = new KeyboardEvent("keydown", { key: "z", shiftKey: true, bubbles: true });
    dispatchPlainKey(shifted, "z", callbacks());
    expect(shifted.defaultPrevented).toBe(false);

    usePlayerStore.setState({
      elements: [bgmElement],
      selectedElementId: "scene.html#child",
      selectedElementIds: new Set(["scene.html#child"]),
    });
    const child = press("z");
    dispatchPlainKey(child, "z", callbacks());
    expect(child.defaultPrevented).toBe(false);

    usePlayerStore.setState({
      elements: [{ ...bgmElement, duration: 0 }],
      selectedElementId: "bgm",
      selectedElementIds: new Set(["bgm"]),
    });
    const zero = press("z");
    dispatchPlainKey(zero, "z", callbacks());
    expect(zero.defaultPrevented).toBe(false);
  });

  it("leaves G to the grid toggle when nothing selected has sound", () => {
    usePlayerStore.setState({ elements: [video], selectedElementId: "b-roll" });
    const event = press("g");
    dispatchPlainKey(event, "g", callbacks());
    expect(useAudioGainDialogStore.getState().targetKeys).toBeNull();
    expect(event.defaultPrevented).toBe(false);
  });
});

describe("editor keys the host can remap", () => {
  const dispatch = (key: string) => {
    const event = press(key);
    dispatchPlainKey(event, key.toLowerCase(), callbacks());
    return event;
  };
  const tool = () => usePlayerStore.getState().activeTool;

  it("answers every default key", () => {
    dispatch("b");
    expect(tool()).toBe("razor");
    dispatch("a");
    expect(tool()).toBe("select");
    dispatch("b");
    dispatch("v");
    expect(tool()).toBe("select");
    const original = usePlayerStore.getState().selectLeftward;
    const left = vi.fn();
    usePlayerStore.setState({ selectLeftward: left });
    dispatch("[");
    usePlayerStore.setState({ selectLeftward: original });
    expect(left).toHaveBeenCalledTimes(1);
  });

  it("a remapped key answers and the old one does not", () => {
    setStudioKeys({ razorTool: "y", selectTool: "u", exitRazor: "q" });
    dispatch("b");
    expect(tool()).toBe("select");
    expect(dispatch("y").defaultPrevented).toBe(true);
    expect(tool()).toBe("razor");
    dispatch("a");
    expect(tool()).toBe("razor");
    dispatch("q");
    expect(tool()).toBe("select");
    dispatch("y");
    dispatch("v");
    expect(tool()).toBe("razor");
    dispatch("u");
    expect(tool()).toBe("select");
  });

  it("split, fullscreen and record follow the map", () => {
    setStudioKeys({ split: "t", record: "w" });
    const cb = callbacks({ onToggleRecording: vi.fn() });
    dispatchPlainKey(press("r"), "r", cb);
    expect(cb.onToggleRecording).not.toHaveBeenCalled();
    dispatchPlainKey(press("w"), "w", cb);
    expect(cb.onToggleRecording).toHaveBeenCalledTimes(1);
    expect(press("s").defaultPrevented).toBe(false);
    const split = press("t");
    dispatchPlainKey(split, "t", cb);
    expect(split.defaultPrevented).toBe(true);
  });
});

describe("every app shortcut is a remappable combo", () => {
  const dock = vi.fn();
  const ev = (init: KeyboardEventInit) =>
    new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  const select = () => {
    usePlayerStore.setState({ elements: [bgmElement], selectedElementId: "bgm" });
  };
  const rows: Array<{
    action: string;
    combo: string;
    press: KeyboardEventInit;
    moved: KeyboardEventInit;
    hit: (cb: ReturnType<typeof callbacks>) => unknown;
  }> = [
    {
      action: "undo",
      combo: "mod+u",
      press: { key: "z", metaKey: true },
      moved: { key: "u", metaKey: true },
      hit: (c) => c.handleUndo,
    },
    {
      action: "redo",
      combo: "mod+shift+u",
      press: { key: "z", metaKey: true, shiftKey: true },
      moved: { key: "u", metaKey: true, shiftKey: true },
      hit: (c) => c.handleRedo,
    },
    {
      action: "redoAlt",
      combo: "ctrl+shift+y",
      press: { key: "y", ctrlKey: true },
      moved: { key: "y", ctrlKey: true, shiftKey: true },
      hit: (c) => c.handleRedo,
    },
    {
      action: "copy",
      combo: "mod+shift+c",
      press: { key: "c", metaKey: true },
      moved: { key: "c", metaKey: true, shiftKey: true },
      hit: (c) => c.handleCopy,
    },
    {
      action: "paste",
      combo: "mod+shift+v",
      press: { key: "v", metaKey: true },
      moved: { key: "v", metaKey: true, shiftKey: true },
      hit: (c) => c.handlePaste,
    },
    {
      action: "cut",
      combo: "mod+shift+x",
      press: { key: "x", metaKey: true },
      moved: { key: "x", metaKey: true, shiftKey: true },
      hit: (c) => c.handleCut,
    },
    {
      action: "duplicate",
      combo: "mod+shift+d",
      press: { key: "d", metaKey: true },
      moved: { key: "d", metaKey: true, shiftKey: true },
      hit: (c) => c.handleDuplicate,
    },
    {
      action: "group",
      combo: "mod+shift+k",
      press: { key: "g", metaKey: true },
      moved: { key: "k", metaKey: true, shiftKey: true },
      hit: (c) => c.onGroupSelection,
    },
    {
      action: "ungroup",
      combo: "mod+shift+j",
      press: { key: "g", metaKey: true, shiftKey: true },
      moved: { key: "j", metaKey: true, shiftKey: true },
      hit: (c) => c.onUngroupSelection,
    },
    {
      action: "tabCompositions",
      combo: "mod+3",
      press: { key: "1", metaKey: true },
      moved: { key: "3", metaKey: true },
      hit: () => dock,
    },
  ];

  beforeEach(() => {
    dock.mockClear();
    useDockLayoutStore.setState({ activatePanel: dock });
  });

  it.each(rows)("$action answers its default and only its new combo once moved", (row) => {
    for (const [init, expected] of [
      [row.press, true],
      [row.moved, false],
    ] as const) {
      select();
      const cb = callbacks({ handleCopy: vi.fn(() => true) });
      dispatchModifierKey(ev(init), (init.key ?? "").toLowerCase(), cb);
      expect(Boolean(vi.mocked(row.hit(cb) as never).mock.calls.length), row.action).toBe(expected);
      dock.mockClear();
    }
    setStudioKeys({ [row.action]: row.combo } as never);
    for (const [init, expected] of [
      [row.press, false],
      [row.moved, true],
    ] as const) {
      select();
      const cb = callbacks({ handleCopy: vi.fn(() => true) });
      dispatchModifierKey(ev(init), (init.key ?? "").toLowerCase(), cb);
      expect(Boolean(vi.mocked(row.hit(cb) as never).mock.calls.length), row.action).toBe(expected);
      dock.mockClear();
    }
  });

  it("Delete, Backspace and the cancel key are combos too", () => {
    select();
    let cb = callbacks();
    dispatchPlainKey(ev({ key: "Delete", code: "Delete" }), "delete", cb);
    expect(cb.handleTimelineElementsDelete).toHaveBeenCalledTimes(1);
    setStudioKeys({ deleteSelected: "x", deleteSelectedAlt: "shift+x" });
    cb = callbacks();
    dispatchPlainKey(ev({ key: "Delete", code: "Delete" }), "delete", cb);
    dispatchPlainKey(ev({ key: "Backspace", code: "Backspace" }), "backspace", cb);
    expect(cb.handleTimelineElementsDelete).not.toHaveBeenCalled();
    dispatchPlainKey(ev({ key: "x", code: "KeyX" }), "x", cb);
    expect(cb.handleTimelineElementsDelete).toHaveBeenCalledTimes(1);
  });

  it("cancel (Escape by default) returns the armed razor to select, and only the new key does once moved", () => {
    usePlayerStore.getState().setActiveTool("razor");
    dispatchPlainKey(ev({ key: "Escape", code: "Escape" }), "escape", callbacks());
    expect(usePlayerStore.getState().activeTool).toBe("select");
    setStudioKeys({ cancel: "q" });
    usePlayerStore.getState().setActiveTool("razor");
    dispatchPlainKey(ev({ key: "Escape", code: "Escape" }), "escape", callbacks());
    expect(usePlayerStore.getState().activeTool).toBe("razor");
    dispatchPlainKey(ev({ key: "q", code: "KeyQ" }), "q", callbacks());
    expect(usePlayerStore.getState().activeTool).toBe("select");
  });
});
