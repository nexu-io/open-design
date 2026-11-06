// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Timeline } from "./Timeline";
import { installTimelineMountEnv, KEYFRAMED_CARD } from "./timelineMountTestEnv";
import { usePlayerStore, type TimelineElement } from "../store/playerStore";
import { TimelineEditProvider } from "../../contexts/TimelineEditContext";
import type { TimelineProps } from "./TimelineTypes";
import { TimelineReadOnlyContext } from "./timelineReadOnly";
import { BeatStrip } from "./BeatStrip";
import { TimelineFxButton } from "./TimelineFxButton";
import { TimelineDiamondLane } from "./TimelineClipDiamonds";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

installTimelineMountEnv();

beforeAll(() => {
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.releasePointerCapture = vi.fn();
});

let root: Root | null = null;
afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  document.body.innerHTML = "";
  usePlayerStore.getState().reset();
});

const CLIPS: TimelineElement[] = [
  { id: "a", key: "a", domId: "a", tag: "video", start: 0, duration: 2, track: 0 },
  { id: "b", key: "b", domId: "b", tag: "video", start: 5, duration: 3, track: 0 },
];

function mount(props: TimelineProps, elements: TimelineElement[] = CLIPS, wired = true) {
  usePlayerStore.setState({ duration: 10, currentTime: 0, timelineReady: true, elements });
  const edits = {
    onMoveElement: vi.fn(),
    onMoveElements: vi.fn(),
    onResizeElement: vi.fn(),
    onBlockedEditAttempt: vi.fn(),
    onToggleTrackHidden: vi.fn(),
    onSetElementAttributeLive: vi.fn(),
    onSetElementAttributeQuiet: vi.fn(),
    onRazorSplit: vi.fn(),
    onRazorSplitAll: vi.fn(),
    onTogglePropertyGroupKeyframe: vi.fn(),
    onMoveKeyframe: vi.fn().mockResolvedValue(true),
    onDeleteElement: vi.fn(),
  };
  const onSeek = vi.fn();
  const onFileDrop = vi.fn();
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const render = (next: TimelineProps) =>
    act(() =>
      root!.render(
        !wired ? (
          <Timeline {...next} onSeek={onSeek} />
        ) : (
          <TimelineEditProvider value={edits}>
            {/* The host's edits arrive both ways: through the edit context and as Timeline props. */}
            <Timeline
              {...next}
              onSeek={onSeek}
              onFileDrop={onFileDrop}
              onMoveElement={edits.onMoveElement}
              onMoveElements={edits.onMoveElements}
              onResizeElement={edits.onResizeElement}
              onBlockedEditAttempt={edits.onBlockedEditAttempt}
              onDeleteElement={edits.onDeleteElement}
            />
          </TimelineEditProvider>
        ),
      ),
    );
  render(props);
  const viewport = host.querySelector<HTMLElement>("[data-timeline-scroll-viewport]")!;
  if (elements.length > 0) {
    viewport.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 900, bottom: 400, width: 900, height: 400 }) as DOMRect;
  }
  const clip = (id: string) => host.querySelector<HTMLElement>(`[data-clip][data-el-id="${id}"]`);
  const pointer = (clientX: number, clientY: number) => ({
    bubbles: true,
    button: 0,
    pointerId: 1,
    clientX,
    clientY,
  });
  return {
    host,
    edits,
    onSeek,
    onFileDrop,
    clip,
    rerender: render,
    /** Press clip `a`, travel past the drag threshold, and report whether a drag had started. */
    dragClip() {
      const target = clip("a")!;
      const rect = target.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      act(() => {
        target.dispatchEvent(new PointerEvent("pointerdown", pointer(x, y)));
      });
      act(() => {
        window.dispatchEvent(new PointerEvent("pointermove", pointer(x + 30, y)));
        window.dispatchEvent(new PointerEvent("pointermove", pointer(x + 60, y)));
      });
      const dragging = clip("a") === null;
      act(() => {
        window.dispatchEvent(new PointerEvent("pointerup", pointer(x + 60, y)));
      });
      return dragging;
    },
    pressRuler() {
      const at = pointer(400, 4);
      act(() => viewport.dispatchEvent(new PointerEvent("pointerdown", at)));
      act(() => viewport.dispatchEvent(new PointerEvent("pointerup", at)));
    },
    contextMenu(target: HTMLElement, clientX: number) {
      act(() => {
        target.dispatchEvent(
          new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX, clientY: 40 }),
        );
      });
    },
    /** Right-click the first lane's empty space, past clip `a`. */
    laneMenu() {
      const cell = host.querySelector<HTMLElement>('[role="gridcell"][aria-colindex="2"]')!;
      cell.getBoundingClientRect = () =>
        ({ left: 0, top: 0, right: 900, bottom: 40, width: 900, height: 40 }) as DOMRect;
      this.contextMenu(cell, 350);
    },
    dragFileOver() {
      const dataTransfer = {
        types: ["Files"],
        dropEffect: "copy",
        files: [new File(["x"], "clip.mp4", { type: "video/mp4" })],
        items: [],
        getData: () => "",
      };
      const fire = (type: string) => {
        const event = new Event(type, { bubbles: true, cancelable: true });
        Object.assign(event, { dataTransfer, clientX: 400, clientY: 40 });
        act(() => {
          viewport.dispatchEvent(event);
        });
        return event;
      };
      fire("dragover");
      const second = fire("dragover");
      // The shell rings itself while a drop would land (the drag-over preview).
      const preview = host
        .querySelector('[aria-label="Timeline track view"]')!
        .className.includes("ring-studio-accent");
      fire("drop");
      return { dropEffect: dataTransfer.dropEffect, accepted: second.defaultPrevented, preview };
    },
  };
}

describe("Timeline readOnly", () => {
  it("still scrubs from the ruler", () => {
    const onReadOnlyPress = vi.fn();
    const t = mount({ readOnly: true, onReadOnlyPress });
    t.pressRuler();
    expect(t.onSeek).toHaveBeenCalled();
    expect(onReadOnlyPress).not.toHaveBeenCalled();
  });

  it("refuses a clip drag before it starts and reports it once", () => {
    const onReadOnlyPress = vi.fn();
    const t = mount({ readOnly: true, onReadOnlyPress });
    expect(t.dragClip()).toBe(false);
    expect(onReadOnlyPress).toHaveBeenCalledTimes(1);
    expect(t.edits.onMoveElement).not.toHaveBeenCalled();
    expect(t.edits.onMoveElements).not.toHaveBeenCalled();
    expect(t.edits.onBlockedEditAttempt).not.toHaveBeenCalled();
  });

  it("reports a clip drag even when the host wires no edit callbacks", () => {
    const onReadOnlyPress = vi.fn();
    const t = mount({ readOnly: true, onReadOnlyPress }, CLIPS, false);
    expect(t.dragClip()).toBe(false);
    expect(onReadOnlyPress).toHaveBeenCalledTimes(1);
  });

  it("offers no trim handle and still selects on a plain click", () => {
    const onReadOnlyPress = vi.fn();
    const t = mount({ readOnly: true, onReadOnlyPress });
    act(() => t.clip("a")!.click());
    expect(usePlayerStore.getState().selectedElementId).toBe("a");
    expect(t.clip("a")!.querySelector('[style*="col-resize"]')).toBeNull();
    expect(onReadOnlyPress).not.toHaveBeenCalled();
  });

  it("opens no clip menu on right-click and reports it once", () => {
    const onReadOnlyPress = vi.fn();
    const t = mount({ readOnly: true, onReadOnlyPress });
    t.contextMenu(t.clip("a")!, 20);
    expect(document.querySelector('[role="menu"][aria-label="Clip actions"]')).toBeNull();
    expect(onReadOnlyPress).toHaveBeenCalledTimes(1);
  });

  it("opens no gap menu on an empty lane and reports it once", () => {
    const onReadOnlyPress = vi.fn();
    const t = mount({ readOnly: true, onReadOnlyPress });
    t.laneMenu();
    expect(document.body.textContent).not.toContain("Close gap");
    expect(onReadOnlyPress).toHaveBeenCalledTimes(1);
  });

  it("refuses a file drag with no preview or commit and reports it once", () => {
    const onReadOnlyPress = vi.fn();
    const t = mount({ readOnly: true, onReadOnlyPress });
    const drag = t.dragFileOver();
    expect(drag).toEqual({ dropEffect: "none", accepted: false, preview: false });
    expect(t.onFileDrop).not.toHaveBeenCalled();
    expect(onReadOnlyPress).toHaveBeenCalledTimes(1);
  });

  it("reports to the host's latest callback after it re-renders with a new one", () => {
    const first = vi.fn();
    const latest = vi.fn();
    const t = mount({ readOnly: true, onReadOnlyPress: first });
    t.rerender({ readOnly: true, onReadOnlyPress: latest });
    act(() => t.host.querySelector<HTMLElement>('button[aria-label^="Hide track"]')!.click());
    expect([first.mock.calls.length, latest.mock.calls.length]).toEqual([0, 1]);
  });

  it("reports the track eye instead of toggling it", () => {
    const onReadOnlyPress = vi.fn();
    const t = mount({ readOnly: true, onReadOnlyPress });
    act(() => t.host.querySelector<HTMLElement>('button[aria-label^="Hide track"]')!.click());
    expect(t.edits.onToggleTrackHidden).not.toHaveBeenCalled();
    expect(onReadOnlyPress).toHaveBeenCalledTimes(1);
  });
});

const FADED_AUDIO: TimelineElement[] = [
  {
    id: "vo",
    key: "vo",
    domId: "vo",
    tag: "audio",
    src: "vo.mp3",
    start: 0,
    duration: 4,
    track: 0,
    fadeIn: 1,
  },
];

const CARD: TimelineElement[] = [
  {
    id: "card",
    key: "card",
    domId: "card",
    label: "Hero card",
    tag: "div",
    start: 0,
    duration: 4,
    track: 0,
  },
];
const CARD_KEYFRAMES = new Map([
  [
    "card",
    {
      format: "percentage" as const,
      keyframes: [{ percentage: 50, properties: { x: 100 }, tweenPercentage: 50 }],
    },
  ],
]);

/** Every one-shot gesture routed through the refusal, run against a mount with or without readOnly. */
function oneShotGestures(readOnly: boolean) {
  const onReadOnlyPress = vi.fn();
  const props = readOnly ? { readOnly, onReadOnlyPress } : {};
  const remount = (elements: TimelineElement[]) => {
    if (root) act(() => root!.unmount());
    root = null;
    document.body.innerHTML = "";
    return mount(props, elements);
  };
  const reported = () => onReadOnlyPress.mock.calls.length;

  usePlayerStore.setState({ activeTool: "razor" });
  let t = remount(CLIPS);
  act(() => t.clip("a")!.click());
  const razor = { reported: reported(), split: t.edits.onRazorSplit.mock.calls.length };
  act(() => t.clip("b")!.dispatchEvent(new MouseEvent("click", { bubbles: true, shiftKey: true })));
  const razorAll = {
    reported: reported() - razor.reported,
    split: t.edits.onRazorSplitAll.mock.calls.length,
  };
  const beforeShift = reported();
  const viewport = t.host.querySelector<HTMLElement>("[data-timeline-scroll-viewport]")!;
  act(() => {
    viewport.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        button: 0,
        pointerId: 2,
        clientX: 700,
        clientY: 60,
        shiftKey: true,
      }),
    );
  });
  const shiftSplitAll = {
    reported: reported() - beforeShift,
    split: t.edits.onRazorSplitAll.mock.calls.length - razorAll.split,
  };
  usePlayerStore.setState({ activeTool: "select" });

  usePlayerStore.setState({ gsapAnimations: new Map(), keyframeCache: CARD_KEYFRAMES });
  t = remount(CARD);
  const beforeMenu = reported();
  t.contextMenu(t.host.querySelector<HTMLElement>('button[title="50%"]')!, 60);
  const keyframeMenu = {
    reported: reported() - beforeMenu,
    open: document.querySelector('[role="menu"][aria-label="Keyframe actions"]') !== null,
  };

  usePlayerStore.setState({ selectedElementId: "card", gsapAnimations: KEYFRAMED_CARD });
  t = remount(CARD);
  const beforeToggle = reported();
  act(() =>
    t.host.querySelector<HTMLElement>('button[aria-pressed][aria-label$=" keyframe"]')!.click(),
  );
  const propertyToggle = {
    reported: reported() - beforeToggle,
    toggled: t.edits.onTogglePropertyGroupKeyframe.mock.calls.length,
  };
  return { razor, razorAll, shiftSplitAll, keyframeMenu, propertyToggle };
}

describe("Timeline readOnly one-shot edits", () => {
  it("refuses razor splits, the keyframe menu and the property keyframe toggle, reporting each once", () => {
    expect(oneShotGestures(true)).toEqual({
      razor: { reported: 1, split: 0 },
      razorAll: { reported: 1, split: 0 },
      shiftSplitAll: { reported: 1, split: 0 },
      keyframeMenu: { reported: 1, open: false },
      propertyToggle: { reported: 1, toggled: 0 },
    });
  });

  it("performs every one of them without readOnly", () => {
    expect(oneShotGestures(false)).toEqual({
      razor: { reported: 0, split: 1 },
      razorAll: { reported: 0, split: 1 },
      shiftSplitAll: { reported: 0, split: 1 },
      keyframeMenu: { reported: 0, open: true },
      propertyToggle: { reported: 0, toggled: 1 },
    });
  });
});

const LOCKED: TimelineProps = { readOnly: true, onReadOnlyPress: vi.fn() };
const press = (x: number, y = 10) => ({
  bubbles: true,
  button: 0,
  pointerId: 1,
  clientX: x,
  clientY: y,
});
const onWindow = (type: string, x: number) =>
  act(() => {
    window.dispatchEvent(new PointerEvent(type, press(x)));
  });
const pressOn = (el: Element, x: number) =>
  act(() => {
    el.dispatchEvent(new PointerEvent("pointerdown", press(x)));
  });

describe("Timeline switched to readOnly mid-edit", () => {
  it("drops a clip drag without committing it", () => {
    const t = mount({});
    pressOn(t.clip("a")!, 0);
    onWindow("pointermove", 30);
    onWindow("pointermove", 60);
    expect(t.clip("a")).toBeNull();
    t.rerender(LOCKED);
    onWindow("pointerup", 60);
    expect(t.edits.onMoveElement).not.toHaveBeenCalled();
    expect(t.edits.onMoveElements).not.toHaveBeenCalled();
  });

  it("drops a clip resize without committing it", () => {
    const t = mount({});
    act(() => t.clip("a")!.click());
    pressOn(t.clip("a")!.querySelector('[style*="col-resize"]')!, 0);
    onWindow("pointermove", 20);
    onWindow("pointermove", 40);
    t.rerender(LOCKED);
    onWindow("pointerup", 40);
    expect(t.edits.onResizeElement).not.toHaveBeenCalled();
  });

  it("drops a beat drag without committing it", () => {
    const commitBeatEdits = vi.fn();
    const t = mount({}, [
      {
        id: "music",
        tag: "audio",
        src: "m.mp3",
        start: 0,
        duration: 10,
        track: 0,
        timelineRole: "music",
      },
    ]);
    // The music analysis resets the beats on mount, so they arrive afterwards.
    act(() =>
      usePlayerStore.setState({
        beatAnalysis: {
          beatTimes: [1, 3],
          beatStrengths: [0.5, 0.8],
          bpm: 120,
          bpmConfidence: "high",
          channelData: null,
          sampleRate: 48_000,
          peak: 1,
        },
        commitBeatEdits,
      }),
    );
    pressOn(t.host.querySelector('[title="Drag to move · ⌥-click to delete"]')!, 100);
    expect(usePlayerStore.getState().beatDragging).toBe(true);
    onWindow("pointermove", 160);
    t.rerender(LOCKED);
    expect(usePlayerStore.getState().beatDragging).toBe(false);
    onWindow("pointerup", 160);
    expect(commitBeatEdits).not.toHaveBeenCalled();
  });

  it("drops a keyframe retime without committing it", () => {
    usePlayerStore.setState({ selectedElementId: "card", gsapAnimations: KEYFRAMED_CARD });
    const t = mount({}, CARD);
    pressOn(t.host.querySelector('button[title="25%"]')!, 80);
    t.rerender(LOCKED);
    onWindow("pointerup", 120);
    expect(t.edits.onMoveKeyframe).not.toHaveBeenCalled();
  });

  it("closes an open clip menu, gap menu and keyframe menu", () => {
    const t = mount({});
    t.contextMenu(t.clip("a")!, 20);
    t.rerender(LOCKED);
    const clipMenu = document.querySelector('[role="menu"][aria-label="Clip actions"]');
    t.rerender({});
    t.laneMenu();
    t.rerender(LOCKED);
    const gapMenu = document.body.textContent?.includes("Close gap");
    act(() => root!.unmount());
    root = null;
    usePlayerStore.setState({ gsapAnimations: new Map(), keyframeCache: CARD_KEYFRAMES });
    const k = mount({}, CARD);
    k.contextMenu(k.host.querySelector<HTMLElement>('button[title="50%"]')!, 60);
    k.rerender(LOCKED);
    const keyframeMenu = document.querySelector('[role="menu"][aria-label="Keyframe actions"]');
    expect({ clipMenu, gapMenu, keyframeMenu }).toEqual({
      clipMenu: null,
      gapMenu: false,
      keyframeMenu: null,
    });
    expect(t.edits.onDeleteElement).not.toHaveBeenCalled();
  });
});

describe("Timeline readOnly with a host edit context", () => {
  it("draws no fade handle, so the context's fade writers are never reached", () => {
    const t = mount({ readOnly: true, onReadOnlyPress: vi.fn() }, FADED_AUDIO);
    act(() => t.clip("vo")!.click());
    expect(t.host.querySelector('[role="slider"]')).toBeNull();
    expect(t.edits.onSetElementAttributeLive).not.toHaveBeenCalled();
  });

  it("says nothing about dropping media on an empty timeline", () => {
    const t = mount({ readOnly: true, onReadOnlyPress: vi.fn() }, []);
    expect(t.host.textContent).not.toContain("Drop media");
  });
});

describe("Timeline without readOnly (unchanged)", () => {
  it("scrubs, drags, opens both menus, previews and commits a drop, toggles the eye", () => {
    const t = mount({});
    t.pressRuler();
    expect(t.onSeek).toHaveBeenCalled();

    expect(t.dragClip()).toBe(true);
    expect(t.edits.onMoveElement.mock.calls.length + t.edits.onMoveElements.mock.calls.length).toBe(
      1,
    );

    t.contextMenu(t.clip("a")!, 20);
    expect(document.querySelector('[role="menu"][aria-label="Clip actions"]')).not.toBeNull();
    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));

    t.laneMenu();
    expect(document.body.textContent).toContain("Close gap");

    const drag = t.dragFileOver();
    expect(drag.dropEffect).toBe("copy");
    expect(drag.accepted).toBe(true);
    expect(drag.preview).toBe(true);
    expect(t.onFileDrop).toHaveBeenCalledTimes(1);

    act(() => t.host.querySelector<HTMLElement>('button[aria-label^="Hide track"]')!.click());
    expect(t.edits.onToggleTrackHidden).toHaveBeenCalledTimes(1);
  });

  it("draws the fade handles from the edit context and offers media drops", () => {
    const t = mount({}, FADED_AUDIO);
    act(() => t.clip("vo")!.click());
    expect(t.host.querySelector('[role="slider"]')).not.toBeNull();
    act(() => root!.unmount());
    root = null;
    expect(mount({}, []).host.textContent).toContain("Drop video, audio or images here");
  });

  it("draws the trim handles on a selected clip", () => {
    const t = mount({});
    act(() => t.clip("a")!.click());
    expect(t.clip("a")!.querySelector('[style*="col-resize"]')).not.toBeNull();
  });
});

function mountReadOnly(node: React.ReactElement) {
  const onReadOnlyPress = vi.fn();
  const host = document.createElement("div");
  host.setAttribute("data-timeline-scroll-viewport", "");
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root!.render(
      <TimelineReadOnlyContext.Provider value={onReadOnlyPress}>
        {node}
      </TimelineReadOnlyContext.Provider>,
    ),
  );
  return { host, onReadOnlyPress };
}

describe("read-only children", () => {
  it("a beat dot starts no drag, deletes nothing on alt-click, and reports once per press", () => {
    const commitBeatEdits = vi.fn();
    usePlayerStore.setState({
      timelineSessionEpoch: 1,
      timelineProjectId: "project-a",
      elements: [
        {
          id: "music",
          tag: "audio",
          src: "m.mp3",
          start: 0,
          duration: 10,
          track: 0,
          timelineRole: "music",
        },
      ],
      beatAnalysis: {
        beatTimes: [1, 3],
        beatStrengths: [0.5, 0.8],
        bpm: 120,
        bpmConfidence: "high",
        channelData: null,
        sampleRate: 48_000,
        peak: 1,
      },
      commitBeatEdits,
    });
    const { host, onReadOnlyPress } = mountReadOnly(
      <BeatStrip beatTimes={[1, 3]} beatStrengths={[0.5, 0.8]} pps={100} />,
    );
    host.getBoundingClientRect = () => new DOMRect(0, 0, 1_000, 500);
    const beat = host.querySelector<HTMLElement>('[title="Drag to move · ⌥-click to delete"]')!;
    const at = { bubbles: true, button: 0, pointerId: 1, clientX: 100, clientY: 5 };
    act(() => beat.dispatchEvent(new PointerEvent("pointerdown", at)));
    expect(usePlayerStore.getState().beatDragging).toBe(false);
    act(() => {
      beat.dispatchEvent(new PointerEvent("pointerdown", { ...at, altKey: true }));
      beat.dispatchEvent(new MouseEvent("click", { bubbles: true, altKey: true }));
    });
    expect(commitBeatEdits).not.toHaveBeenCalled();
    expect(onReadOnlyPress).toHaveBeenCalledTimes(2);
  });

  it("the FX button opens no popover and reports the click", () => {
    const { host, onReadOnlyPress } = mountReadOnly(
      <TimelineFxButton
        variant="chain"
        fxChainRaw={undefined}
        onChainChange={vi.fn()}
        onOpenRack={vi.fn()}
      />,
    );
    act(() => host.querySelector<HTMLButtonElement>("button")!.click());
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(onReadOnlyPress).toHaveBeenCalledTimes(1);
  });

  it("a keyframe diamond is not retimed by a drag, reports the drag once, and still selects", () => {
    const onMoveKeyframe = vi.fn().mockResolvedValue(true);
    const onClickKeyframe = vi.fn();
    const { host, onReadOnlyPress } = mountReadOnly(
      <TimelineDiamondLane
        keyframesData={{
          format: "percentage",
          keyframes: [
            {
              percentage: 20,
              tweenPercentage: 0,
              propertyGroup: "position",
              animationId: "a",
              properties: { x: 0 },
            },
            {
              percentage: 40,
              tweenPercentage: 50,
              propertyGroup: "position",
              animationId: "a",
              properties: { x: 1 },
            },
            {
              percentage: 60,
              tweenPercentage: 100,
              propertyGroup: "position",
              animationId: "a",
              properties: { x: 2 },
            },
          ],
        }}
        clipWidthPx={200}
        clipHeightPx={48}
        clipDuration={10}
        accentColor="#4ba3d2"
        isSelected
        currentPercentage={0}
        elementId="clip-1"
        selectedKeyframes={new Set()}
        onClickKeyframe={onClickKeyframe}
        onMoveKeyframe={onMoveKeyframe}
        groupAware
      />,
    );
    const diamond = host.querySelector<HTMLButtonElement>('button[title="40%"]')!;
    act(() => {
      diamond.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 80 }),
      );
      window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 90 }));
      window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 100 }));
      diamond.dispatchEvent(
        new PointerEvent("pointerup", { bubbles: true, button: 0, clientX: 100 }),
      );
    });
    expect(onMoveKeyframe).not.toHaveBeenCalled();
    expect(onClickKeyframe).toHaveBeenCalledTimes(1);
    expect(onReadOnlyPress).toHaveBeenCalledTimes(1);
  });
});
