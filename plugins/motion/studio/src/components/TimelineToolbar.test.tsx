// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import { usePlayerStore } from "../player/store/playerStore";
import { makeSelection } from "../hooks/domSelectionTestHarness";
import { useAudioMetersVisible } from "../utils/audioMeterVisibility";
import { readStudioUiPreferences } from "../utils/studioUiPreferences";
import { dispatchPlainKey, type HotkeyCallbacks } from "../hooks/appHotkeysDispatch";
import { AudioMeterStrip } from "./nle/AudioMeterStrip";
import { TimelineToolbar } from "./TimelineToolbar";
import { registerTimelineZoomViewport } from "../player/components/timelineZoomInput";

vi.mock("../contexts/StudioContext", () => ({
  useStudioShellContextOptional: () => ({
    previewIframeRef: { current: null },
    editHistory: { canUndo: false, canRedo: false },
    handleUndo: vi.fn(),
    handleRedo: vi.fn(),
  }),
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
  usePlayerStore.setState({
    autoKeyframeEnabled: true,
    thumbnailMode: "adaptive",
    zoomMode: "fit",
  });
});

function renderToolbar(
  domEditSession?: React.ComponentProps<typeof TimelineToolbar>["domEditSession"],
  props: Partial<React.ComponentProps<typeof TimelineToolbar>> = {},
) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => {
    root.render(<TimelineToolbar domEditSession={domEditSession} {...props} />);
  });
  return { host, root };
}

// Regression (#1808): the auto-keyframe toggle is a GLOBAL setting (unlike the
// diamond "Add keyframe" button, which needs a selection to mean anything), so
// it must stay visible and usable with nothing selected — it must not be
// gated behind `domEditSession`/`onToggleKeyframe`.
describe("TimelineToolbar — auto-keyframe toggle (#1808)", () => {
  it("renders enabled (pressed) by default with no selection", () => {
    const { host, root } = renderToolbar();
    const btn = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Auto-record manual edits as keyframes"]',
    );
    expect(btn).not.toBeNull();
    expect(btn?.getAttribute("aria-pressed")).toBe("true");
    act(() => root.unmount());
  });

  it("flips autoKeyframeEnabled in the store when clicked", () => {
    const { host, root } = renderToolbar();
    const btn = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Auto-record manual edits as keyframes"]',
    );
    if (!btn) throw new Error("auto-keyframe toggle not rendered");

    act(() => {
      btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(usePlayerStore.getState().autoKeyframeEnabled).toBe(false);
    expect(btn.getAttribute("aria-pressed")).toBe("false");
    act(() => root.unmount());
  });
});

describe("TimelineToolbar — adaptive thumbnails", () => {
  it("keeps a user-controlled hidden mode as the rollback path", () => {
    const { host, root } = renderToolbar();
    const button = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Hide thumbnails: labels only"]',
    );
    if (!button) throw new Error("thumbnail toggle not rendered");

    act(() => button.click());

    expect(usePlayerStore.getState().thumbnailMode).toBe("hidden");
    expect(button.getAttribute("aria-label")).toBe(
      "Show thumbnails: posters stay visible; richer previews appear on interaction",
    );
    act(() => root.unmount());
  });
});

describe("TimelineToolbar — motion path endpoints", () => {
  it("does not advertise a destructive keyframe toggle for a required endpoint", () => {
    usePlayerStore.setState({ currentTime: 10 });
    const animation: GsapAnimation = {
      id: "#el-to-0-position",
      targetSelector: "#el",
      method: "to",
      position: 0,
      duration: 10,
      properties: {},
      keyframes: {
        format: "object-array",
        keyframes: [
          { percentage: 0, properties: { x: 0, y: 0 } },
          { percentage: 100, properties: { x: 100, y: 0 } },
        ],
      },
      arcPath: {
        enabled: true,
        autoRotate: false,
        segments: [{ curviness: 1 }],
      },
    };
    const element = document.createElement("div");
    element.id = "el";
    const session = {
      domEditSelection: makeSelection("Element", element),
      selectedGsapAnimations: [animation],
      handleGsapAddAnimation: vi.fn(),
      handleGsapConvertToKeyframes: vi.fn(),
      handleGsapRemoveKeyframe: vi.fn(),
    } satisfies NonNullable<React.ComponentProps<typeof TimelineToolbar>["domEditSession"]>;

    const { host, root } = renderToolbar(session);
    const button = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Motion path endpoint"]',
    );
    expect(button?.disabled).toBe(true);
    act(() => root.unmount());
  });
});

describe("TimelineToolbar — keyframes on audio tracks", () => {
  const clip = (tag: string) => ({
    id: "bgm",
    key: "bgm",
    tag,
    start: 0,
    duration: 10,
    track: 1,
  });

  /** A session whose selection would otherwise offer the keyframe toggle. */
  function sessionFor(tag: string) {
    usePlayerStore.setState({ elements: [clip(tag)], selectedElementId: "bgm", currentTime: 1 });
    const element = document.createElement(tag);
    element.id = "bgm";
    return {
      domEditSelection: makeSelection("Element", element),
      selectedGsapAnimations: [],
      handleGsapAddAnimation: vi.fn(),
      handleGsapConvertToKeyframes: vi.fn(),
      handleGsapRemoveKeyframe: vi.fn(),
    } satisfies NonNullable<React.ComponentProps<typeof TimelineToolbar>["domEditSession"]>;
  }

  it("offers no keyframe toggle for an audio clip", () => {
    // An audio clip has no box on the canvas, so there is nothing to move or fade —
    // and pressing this seeded a tween from the position properties, which put a
    // position lane on a track that has no position. Audio is automated instead.
    const { host, root } = renderToolbar(sessionFor("audio"));
    const button = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Add keyframe at playhead"]',
    );
    expect(button?.disabled).toBe(true);
    act(() => root.unmount());
  });

  it("still offers it for a visual clip", () => {
    const { host, root } = renderToolbar(sessionFor("div"));
    const button = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Add keyframe at playhead"]',
    );
    expect(button?.disabled).toBe(false);
    act(() => root.unmount());
  });

  const keyframeControls = (host: HTMLElement) => [
    host.querySelector('button[aria-label="Add keyframe at playhead"]'),
    host.querySelector('button[aria-label="Auto-record manual edits as keyframes"]'),
  ];
  /** True when the keyframe shortcut claimed K, so playback never saw it. */
  const pressK = () => {
    const event = new KeyboardEvent("keydown", { key: "k", bubbles: true, cancelable: true });
    act(() => {
      window.dispatchEvent(event);
    });
    return event.defaultPrevented;
  };

  it("shows Add keyframe and auto-record, and K adds a keyframe, by default", () => {
    const { host, root } = renderToolbar(sessionFor("div"));
    expect(keyframeControls(host).every(Boolean)).toBe(true);
    expect(pressK()).toBe(true);
    act(() => root.unmount());
  });

  it("hides both controls for a host without keyframes, turns auto-record off and leaves K alone", () => {
    const { host, root } = renderToolbar(sessionFor("div"), { showKeyframes: false });
    expect(keyframeControls(host)).toEqual([null, null]);
    expect(usePlayerStore.getState().autoKeyframeEnabled).toBe(false);
    expect(pressK()).toBe(false);
    act(() => root.unmount());
  });
});

describe("TimelineToolbar snap key", () => {
  let root: ReturnType<typeof createRoot> | null = null;
  const snapBefore = usePlayerStore.getState().timelineSnapEnabled;
  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    usePlayerStore.getState().setTimelineSnapEnabled(snapBefore);
  });

  it("N toggles snapping, but not while a picker that owns typing has focus", () => {
    root = renderToolbar().root;
    const pressN = (target: EventTarget) =>
      act(() => {
        target.dispatchEvent(new KeyboardEvent("keydown", { key: "n", bubbles: true }));
      });
    const before = usePlayerStore.getState().timelineSnapEnabled;
    const picker = document.createElement("button");
    picker.setAttribute("role", "combobox");
    document.body.append(picker);

    pressN(picker);
    expect(usePlayerStore.getState().timelineSnapEnabled).toBe(before);
    pressN(document.body);
    expect(usePlayerStore.getState().timelineSnapEnabled).toBe(!before);
  });
});

describe("TimelineToolbar Fit", () => {
  // A zoom lands on the next frame; these tests step frames instead of waiting for them.
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: [
        "requestAnimationFrame",
        "cancelAnimationFrame",
        "setTimeout",
        "clearTimeout",
        "performance",
      ],
    });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** A mounted timeline for the zoom to preview on: 1080px wide, 32px of headers. */
  function mountTimelineViewport() {
    const scroll = document.createElement("div");
    Object.defineProperties(scroll, {
      clientWidth: { value: 1080 },
      // At Fit the content is as wide as the view.
      scrollWidth: { value: 1080 },
      scrollLeft: { value: 0, writable: true },
    });
    usePlayerStore.setState({
      zoomMode: "fit",
      manualZoomPercent: 100,
      timelineFitPps: 10,
      timelinePps: 10,
    });
    return {
      scroll,
      unregister: registerTimelineZoomViewport({
        scroll,
        contentOrigin: 32,
        publishScroll: () => {},
      }),
    };
  }

  it("moves the slider and its readout with a zoom while it is previewed", () => {
    const { unregister } = mountTimelineViewport();
    const { host, root } = renderToolbar();
    const slider = host.querySelector<HTMLInputElement>('input[aria-label="Timeline zoom"]')!;
    const before = slider.value;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
        slider,
        String(Number(before) + 5),
      );
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => vi.advanceTimersToNextFrame());
    // Not laid out yet: the store still holds Fit, but the toolbar shows the zoom on screen.
    expect(usePlayerStore.getState().zoomMode).toBe("fit");
    expect(slider.value).not.toBe(before);
    expect(host.querySelector('[aria-label="Timeline zoom level"]')?.textContent).not.toBe("Fit");
    act(() => root.unmount());
    act(() => unregister());
  });

  it("keeps Fit when it is picked while a zoom waits to be laid out", () => {
    const { unregister } = mountTimelineViewport();
    const { host, root } = renderToolbar();
    act(() =>
      host
        .querySelector('button[aria-label="Zoom in"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true })),
    );

    act(() =>
      host
        .querySelector('button[aria-label="Fit timeline to width"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true })),
    );
    act(() => vi.advanceTimersByTime(1000));
    expect(usePlayerStore.getState().zoomMode).toBe("fit");
    act(() => root.unmount());
    act(() => unregister());
  });

  it("disables zoom-to-selection until a clip is selected", () => {
    usePlayerStore.setState({ selectedElementId: null, selectedElementIds: new Set() });
    const { host, root } = renderToolbar();
    const button = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Select a clip to zoom the timeline"]',
    );
    expect(button?.disabled).toBe(true);
    act(() => root.unmount());
  });

  it("disables zoom-to-selection when the selection is not a timeline clip", () => {
    usePlayerStore.setState({
      elements: [{ id: "a", key: "a", tag: "div", start: 0, duration: 4, track: 0 }],
      selectedElementId: "scene.html#child",
      selectedElementIds: new Set(["scene.html#child"]),
    });
    const { host, root } = renderToolbar();
    expect(
      host.querySelector<HTMLButtonElement>(
        'button[aria-label="Select a clip to zoom the timeline"]',
      )?.disabled,
    ).toBe(true);
    act(() => root.unmount());
  });

  it("disables zoom-to-selection when every selected clip has no duration", () => {
    usePlayerStore.setState({
      elements: [{ id: "a", key: "a", tag: "div", start: 2, duration: 0, track: 0 }],
      selectedElementId: "a",
      selectedElementIds: new Set(["a"]),
    });
    const { host, root } = renderToolbar();
    expect(
      host.querySelector<HTMLButtonElement>(
        'button[aria-label="Select a clip to zoom the timeline"]',
      )?.disabled,
    ).toBe(true);
    act(() => root.unmount());
  });

  function clickZoom(host: HTMLElement) {
    act(() => {
      host
        .querySelector('button[aria-label="Zoom to selected clips"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    act(() => {
      for (let i = 0; i < 30; i++) vi.advanceTimersToNextFrame();
    });
  }

  it("zooms the mounted timeline so the selected clips fill the width between the margins", () => {
    const { scroll, unregister } = mountTimelineViewport();
    usePlayerStore.setState({
      elements: [{ id: "a", key: "a", tag: "div", start: 10, duration: 20, track: 0 }],
      selectedElementId: "a",
      selectedElementIds: new Set(["a"]),
    });
    const { host, root } = renderToolbar();
    clickZoom(host);
    const pps = usePlayerStore.getState().timelinePps;
    expect(pps).toBeCloseTo(50);
    expect(32 + 10 * pps - scroll.scrollLeft).toBeCloseTo(56);
    expect(32 + 30 * pps - scroll.scrollLeft).toBeCloseTo(1056);
    act(() => root.unmount());
    act(() => unregister());
    usePlayerStore.setState({
      elements: [],
      selectedElementId: null,
      selectedElementIds: new Set(),
    });
  });

  it("keeps a clip at the start on screen without scrolling past zero", () => {
    const { scroll, unregister } = mountTimelineViewport();
    usePlayerStore.setState({
      elements: [{ id: "a", key: "a", tag: "div", start: 0, duration: 10, track: 0 }],
      selectedElementId: "a",
      selectedElementIds: new Set(["a"]),
    });
    const { host, root } = renderToolbar();
    clickZoom(host);
    expect(scroll.scrollLeft).toBe(0);
    const pps = usePlayerStore.getState().timelinePps;
    expect(32 + 10 * pps).toBeLessThanOrEqual(1080);
    act(() => root.unmount());
    act(() => unregister());
  });

  it("keeps a clip at the end of the fit span inside the viewport", () => {
    const end = (1080 - 32 - 2) / 10;
    const { scroll, unregister } = mountTimelineViewport();
    usePlayerStore.setState({
      elements: [{ id: "a", key: "a", tag: "div", start: end - 10, duration: 10, track: 0 }],
      selectedElementId: "a",
      selectedElementIds: new Set(["a"]),
    });
    const { host, root } = renderToolbar();
    clickZoom(host);
    const pps = usePlayerStore.getState().timelinePps;
    expect(scroll.scrollLeft).toBeGreaterThan(0);
    expect(32 + (end - 10) * pps - scroll.scrollLeft).toBeGreaterThanOrEqual(0);
    expect(32 + end * pps - scroll.scrollLeft).toBeLessThanOrEqual(1080);
    act(() => root.unmount());
    act(() => unregister());
  });

  it("shows Fit as a named icon and says whether fit is on", () => {
    const { host, root } = renderToolbar();
    const fit = () => host.querySelector('button[aria-label="Fit timeline to width"]');
    expect(fit()?.textContent).toBe("");
    expect(fit()?.querySelector("svg")).not.toBeNull();
    act(() => fit()?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(fit()?.getAttribute("aria-pressed")).toBe("true");
    act(() =>
      host
        .querySelector('button[aria-label="Zoom in"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true })),
    );
    act(() => vi.advanceTimersToNextFrame());
    expect(fit()?.getAttribute("aria-pressed")).toBe("false");
    act(() => root.unmount());
  });

  it("counts a zoom-in click as a person's zoom, so the timeline anchors it on the playhead", () => {
    const { host, root } = renderToolbar();
    const before = usePlayerStore.getState().userZoomCount;
    act(() =>
      host
        .querySelector('button[aria-label="Zoom in"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true })),
    );
    act(() => vi.advanceTimersToNextFrame());
    expect(usePlayerStore.getState().userZoomCount).toBe(before + 1);
    act(() => root.unmount());
  });
});

describe("TimelineToolbar audio meters", () => {
  it("keeps fresh preferences hidden until the user opts in and persists the choice", () => {
    localStorage.clear();
    useAudioMetersVisible.setState(useAudioMetersVisible.getInitialState());
    usePlayerStore.setState({
      elements: [{ id: "music", key: "music", tag: "audio", start: 0, duration: 10, track: 1 }],
    });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
      act(() =>
        root.render(
          <>
            <TimelineToolbar />
            <AudioMeterStrip />
          </>,
        ),
      );
      const button = host.querySelector<HTMLButtonElement>(
        'button[aria-label="Toggle audio meters"]',
      );
      expect(readStudioUiPreferences().audioMetersVisible).toBeUndefined();
      expect(button?.getAttribute("aria-pressed")).toBe("false");
      expect(host.querySelector('[data-testid="audio-meter-strip"]')).toBeNull();
      if (!button) throw new Error("audio meter toggle not rendered");
      act(() => button.click());
      expect(button.getAttribute("aria-pressed")).toBe("true");
      expect(host.querySelector('[data-testid="audio-meter-strip"]')).not.toBeNull();
      expect(readStudioUiPreferences().audioMetersVisible).toBe(true);
    } finally {
      act(() => root.unmount());
      useAudioMetersVisible.setState(useAudioMetersVisible.getInitialState());
      localStorage.clear();
    }
  });
});

describe("TimelineToolbar history", () => {
  const historyButtons = (host: HTMLElement) =>
    host.querySelectorAll('button[aria-label="Undo"], button[aria-label="Redo"]').length;

  it("shows Undo and Redo by default", () => {
    const { host, root } = renderToolbar();
    expect(historyButtons(host)).toBe(2);
    act(() => root.unmount());
  });

  it("renders neither when the host hides history", () => {
    const { host, root } = renderToolbar(undefined, { showHistory: false });
    expect(historyButtons(host)).toBe(0);
    act(() => root.unmount());
  });
});

describe("TimelineToolbar tool menu", () => {
  async function openMenuRows(props: Partial<React.ComponentProps<typeof TimelineToolbar>>) {
    const { host, root } = renderToolbar(undefined, props);
    const trigger = host.querySelector<HTMLButtonElement>('button[aria-label^="Timeline tool:"]')!;
    await act(async () => {
      trigger.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const rows = [...document.querySelectorAll('[role="menuitem"] > span:first-child')].map(
      (label) => label.textContent,
    );
    act(() => root.unmount());
    return rows;
  }

  it("lists Select, Split, Select leftward and Select rightward by default", async () => {
    expect(await openMenuRows({})).toEqual([
      "Select",
      "Split",
      "Select leftward",
      "Select rightward",
    ]);
  });

  it("lists only Select and Split when the host hides select around the playhead", async () => {
    expect(await openMenuRows({ showSelectAroundPlayhead: false })).toEqual(["Select", "Split"]);
  });

  it.each([true, false])("[ and ] select around the playhead with the rows shown: %s", (shown) => {
    usePlayerStore.setState({
      currentTime: 4,
      elements: [0, 4, 7].map((start, track) => ({
        id: `c${start}`,
        key: `c${start}`,
        tag: "div",
        start,
        duration: 2,
        track,
      })),
    });
    const { root } = renderToolbar(undefined, { showSelectAroundPlayhead: shown });
    const press = (key: string) =>
      act(() =>
        dispatchPlainKey(new KeyboardEvent("keydown", { key }), key, {} as HotkeyCallbacks),
      );
    try {
      press("[");
      expect([...usePlayerStore.getState().selectedElementIds]).toEqual(["c0"]);
      press("]");
      expect([...usePlayerStore.getState().selectedElementIds].sort()).toEqual(["c4", "c7"]);
    } finally {
      act(() => root.unmount());
      usePlayerStore.setState({
        elements: [],
        selectedElementId: null,
        selectedElementIds: new Set(),
      });
    }
  });
});

describe("TimelineToolbar add beat", () => {
  it("shows Add beat by default, as Studio does", () => {
    const { host, root } = renderToolbar();
    expect(host.querySelector('button[aria-label="Add beat at playhead"]')).not.toBeNull();
    act(() => root.unmount());
  });
});

describe("TimelineToolbar Linked Selection", () => {
  it("is on by default, first among the editing toggles, and persists a click", async () => {
    const { useLinkedClipPreferences } = await import("../utils/linkedClipPreferences");
    const { host } = renderToolbar();
    const button = host.querySelector<HTMLButtonElement>('button[aria-label="Linked Selection"]');
    expect(button?.getAttribute("aria-pressed")).toBe("true");
    const snapping = host.querySelector('button[aria-label="Toggle timeline snapping"]');
    expect(snapping && button?.compareDocumentPosition(snapping)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    act(() => button?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(button?.getAttribute("aria-pressed")).toBe("false");
    expect(readStudioUiPreferences().linkedSelectionEnabled).toBe(false);
    act(() => useLinkedClipPreferences.getState().setLinkedSelection(true));
  });

  it("right-click toggles the out-of-sync indicator preference", async () => {
    const { useLinkedClipPreferences } = await import("../utils/linkedClipPreferences");
    const { host } = renderToolbar();
    const button = host.querySelector('button[aria-label="Linked Selection"]');
    act(() => button?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true })));
    const item = document.querySelector<HTMLButtonElement>('[role="menuitemcheckbox"]');
    expect(item?.textContent).toContain("Show out-of-sync indicators");
    expect(item?.getAttribute("aria-checked")).toBe("true");
    act(() => item?.click());
    expect(useLinkedClipPreferences.getState().syncIndicatorsVisible).toBe(false);
    expect(readStudioUiPreferences().syncIndicatorsVisible).toBe(false);
    act(() => useLinkedClipPreferences.getState().setSyncIndicatorsVisible(true));
  });
});

describe("TimelineToolbar — host right actions", () => {
  it("draws the host's controls immediately before the thumbnails toggle", () => {
    const { host, root } = renderToolbar(undefined, {
      rightActions: <button type="button">Script</button>,
    });
    const buttons = [...host.querySelectorAll("button")];
    const script = buttons.findIndex((b) => b.textContent === "Script");
    const thumbs = buttons.findIndex((b) => b.getAttribute("aria-label")?.includes("thumbnails"));
    expect(script).toBeGreaterThan(-1);
    expect(thumbs).toBe(script + 1);
    act(() => root.unmount());
  });
});

describe("TimelineToolbar split hint", () => {
  async function splitTooltip(props: Partial<React.ComponentProps<typeof TimelineToolbar>>) {
    usePlayerStore.setState({
      elements: [{ id: "a", domId: "a", tag: "div", start: 0, duration: 4, track: 0 }],
      selectedElementId: "a",
      currentTime: 2,
    });
    const { host, root } = renderToolbar(undefined, { onSplitElement: vi.fn(), ...props });
    const button = host.querySelector<HTMLButtonElement>('button[aria-label="Split at playhead"]');
    act(() => button?.focus());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const label = document.querySelector('[role="tooltip"]')?.textContent;
    act(() => root.unmount());
    usePlayerStore.setState({ elements: [], selectedElementId: null, currentTime: 0 });
    return label;
  }

  it("names S unless the host binds Split to another key", async () => {
    expect(await splitTooltip({})).toBe("Split at playhead (S)");
    expect(await splitTooltip({ splitShortcut: "⌘B" })).toBe("Split at playhead (⌘B)");
  });
});
