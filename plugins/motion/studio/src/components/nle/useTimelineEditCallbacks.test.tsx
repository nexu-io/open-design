// @vitest-environment happy-dom

import React, { act } from "react";
import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TimelineElement } from "../../player";
import type { TimelineEditCallbacks } from "../../player/components/timelineCallbacks";
import { usePlayerStore } from "../../player/store/playerStore";
import { installReactActEnvironment, mountReactHarness } from "../../hooks/domSelectionTestHarness";

installReactActEnvironment();

const mocks = vi.hoisted(() => ({
  actions: {
    handleGsapRemoveKeyframe: vi.fn(),
    handleGsapMoveKeyframeToPlayhead: vi.fn(),
    handleGsapMoveKeyframe: vi.fn().mockResolvedValue(true),
    handleGsapResizeKeyframedTween: vi.fn().mockResolvedValue(true),
    handleGsapUpdateMeta: vi.fn().mockResolvedValue(true),
    handleGsapAddKeyframe: vi.fn(),
    handleGsapAddKeyframeBatch: vi.fn().mockResolvedValue(undefined),
    handleGsapConvertToKeyframes: vi.fn(),
    handleGsapRemoveAllKeyframes: vi.fn().mockResolvedValue(true),
    handleGsapDeleteAnimation: vi.fn(),
    buildDomSelectionForTimelineElement: vi.fn(),
  },
  selection: { id: "box", selector: "#box", sourceFile: "index.html" },
  animations: Array<GsapAnimation>(),
}));

vi.mock("../../contexts/StudioContext", () => ({
  useStudioShellContext: () => ({ projectId: "project", activeCompPath: "index.html" }),
}));

vi.mock("../../contexts/DomEditContext", () => ({
  useDomEditActionsContext: () => mocks.actions,
  useDomEditSelectionContext: () => ({
    domEditSelection: mocks.selection,
    selectedGsapAnimations: mocks.animations,
  }),
}));

import { useTimelineEditCallbacks } from "./useTimelineEditCallbacks";

const element: TimelineElement = {
  id: "box",
  key: "index.html#box",
  domId: "box",
  tag: "div",
  start: 0,
  duration: 1,
  track: 0,
  sourceFile: "index.html",
};

const flatAnimation: GsapAnimation = {
  id: "box-to-0-position",
  targetSelector: "#box",
  method: "to",
  position: 0,
  resolvedStart: 0,
  duration: 1,
  properties: { x: 420 },
  propertyGroup: "position",
};

const otherFlatAnimation: GsapAnimation = {
  ...flatAnimation,
  id: "circle-to-0-position",
  targetSelector: "#circle",
};

const otherKeyframedAnimation: GsapAnimation = {
  ...otherFlatAnimation,
  keyframes: {
    format: "percentage",
    keyframes: [
      { percentage: 0, properties: { x: 0 } },
      { percentage: 100, properties: { x: 420 } },
    ],
  },
};

function authoredInteriorAnimation(): GsapAnimation {
  return {
    ...flatAnimation,
    keyframes: {
      format: "percentage",
      keyframes: [
        { percentage: 0, properties: { x: 0 } },
        { percentage: 50, properties: { x: 210 } },
        { percentage: 100, properties: { x: 420 } },
      ],
    },
  };
}

function renderCallbacks(): { callbacks: TimelineEditCallbacks; unmount: () => void } {
  let callbacks: TimelineEditCallbacks | null = null;
  function Harness() {
    callbacks = useTimelineEditCallbacks({
      handleTimelineElementMove: vi.fn(),
      handleTimelineElementsMove: vi.fn(),
      handleTimelineElementResize: vi.fn(),
      handleTimelineGroupResize: vi.fn(),
      handleToggleTrackHidden: vi.fn(),
      setAudioGroupAttribute: { setLive: vi.fn(), setQuiet: vi.fn() },
      handleBlockedTimelineEdit: vi.fn(),
      handleTimelineElementSplit: vi.fn(),
      handleRazorSplit: vi.fn(),
      handleRazorSplitAll: vi.fn(),
    });
    return null;
  }
  const root = mountReactHarness(<Harness />);
  if (!callbacks) throw new Error("timeline callbacks did not initialize");
  return { callbacks, unmount: () => act(() => root.unmount()) };
}

// One selection PER element, so a callback that resolves the selection for the
// wrong element gets a visibly different object. A single mockResolvedValue
// hands every element the same selection, which passes just as happily when the
// write is committed through whatever happens to be selected.
function selectionForElement(el: TimelineElement): {
  id: string;
  selector: string;
  sourceFile: string;
} {
  if (el.id === "box") return mocks.selection;
  return { id: el.id, selector: `#${el.id}`, sourceFile: el.sourceFile ?? "index.html" };
}

function arrangeClickedCircle(): {
  circle: TimelineElement;
  selection: { id: string; selector: string; sourceFile: string };
} {
  const elementKey = "scenes/main.html#circle";
  const circle: TimelineElement = {
    ...element,
    id: "circle",
    key: elementKey,
    domId: "circle",
    sourceFile: "scenes/main.html",
  };
  usePlayerStore.setState({
    elements: [element, circle],
    gsapAnimations: new Map([[elementKey, [otherKeyframedAnimation]]]),
  });
  return { circle, selection: selectionForElement(circle) };
}

// main 0 > intro 2 > logo 3 > badge 1: rows are master time, tweens are local.
function nestedKeyframedRow(id: string, start: number, duration: number, host: number) {
  const row: TimelineElement = {
    id,
    key: `compositions/${id}-parent.html#${id}`,
    domId: id,
    tag: "div",
    start,
    duration,
    track: 0,
    sourceFile: `compositions/${id}-parent.html`,
    parentCompositionStart: host,
  };
  const anim: GsapAnimation = {
    ...authoredInteriorAnimation(),
    id: `${id}-to-position`,
    targetSelector: `#${id}`,
    position: start - host,
    resolvedStart: start - host,
    duration,
  };
  usePlayerStore.setState({
    elements: [row],
    gsapAnimations: new Map([[row.key!, [anim]]]),
  });
  return { row, anim };
}

describe("keyframe drags on nested rows", () => {
  it.each([
    ["logo", 5, 5, 2, 60],
    ["badge", 6, 2, 5, 75],
  ])("re-keys %s's middle keyframe inside its local tween", async (id, start, dur, host, pct) => {
    const { row, anim } = nestedKeyframedRow(id, start, dur, host);
    const view = renderCallbacks();
    await act(async () => {
      await view.callbacks.onMoveKeyframe?.(
        row.key!,
        { percentage: 50, propertyGroup: "position", tweenPercentage: 50, animationId: anim.id },
        pct,
      );
    });
    expect(mocks.actions.handleGsapMoveKeyframe).toHaveBeenCalledWith(
      anim.id,
      50,
      pct,
      selectionForElement(row),
    );
    expect(mocks.actions.handleGsapResizeKeyframedTween).not.toHaveBeenCalled();
    view.unmount();
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.animations = [flatAnimation];
  mocks.actions.buildDomSelectionForTimelineElement.mockImplementation((el: TimelineElement) =>
    Promise.resolve(selectionForElement(el)),
  );
  usePlayerStore.setState({
    currentTime: 0.5,
    elements: [element],
    domClipChildren: [],
    keyframeCache: new Map(),
    gsapAnimations: new Map([["box", [flatAnimation]]]),
  });
});

afterEach(() => {
  usePlayerStore.setState({
    elements: [],
    domClipChildren: [],
    keyframeCache: new Map(),
    gsapAnimations: new Map(),
  });
});

describe("useTimelineEditCallbacks — flat tween keyframe lanes", () => {
  it("adds an interior point through the add-keyframe persist boundary", async () => {
    const view = renderCallbacks();

    await act(async () => {
      await view.callbacks.onTogglePropertyGroupKeyframe?.(element, {
        animationId: flatAnimation.id,
        propertyGroup: "position",
        tweenPercentage: 50,
        properties: { x: 210 },
        remove: false,
      });
    });

    expect(mocks.actions.handleGsapAddKeyframeBatch).toHaveBeenCalledWith(
      flatAnimation.id,
      50,
      { x: 210 },
      undefined,
      mocks.selection,
    );
    expect(mocks.actions.handleGsapConvertToKeyframes).not.toHaveBeenCalled();
    view.unmount();
  });

  it("retimes a flat tween's boundary through update-meta, not the keyframe writer", async () => {
    const view = renderCallbacks();

    await expect(
      view.callbacks.onMoveKeyframe?.(
        "box",
        {
          percentage: 0,
          propertyGroup: "position",
          tweenPercentage: 0,
          animationId: flatAnimation.id,
        },
        25,
      ),
    ).resolves.toBe(true);

    // The start boundary moved to 0.25s; the end stays put, so the window is 0.75s.
    expect(mocks.actions.handleGsapUpdateMeta).toHaveBeenCalledWith(
      flatAnimation.id,
      { position: 0.25, duration: 0.75 },
      mocks.selection,
    );
    expect(mocks.actions.handleGsapMoveKeyframe).not.toHaveBeenCalled();
    // resize-keyframed-tween would convert the flat tween to keyframes form.
    expect(mocks.actions.handleGsapResizeKeyframedTween).not.toHaveBeenCalled();
    view.unmount();
  });

  it("reports an unsettled flat-boundary retime as uncommitted", async () => {
    mocks.actions.handleGsapUpdateMeta.mockResolvedValueOnce(false);
    const view = renderCallbacks();

    // The diamond snaps back on `false`. Answering `true` the moment update-meta
    // was dispatched left a rejected boundary drag rendered at its drop position.
    await expect(
      view.callbacks.onMoveKeyframe?.(
        "box",
        {
          percentage: 0,
          propertyGroup: "position",
          tweenPercentage: 0,
          animationId: flatAnimation.id,
        },
        25,
      ),
    ).resolves.toBe(false);
    view.unmount();
  });

  it("refuses a non-selected element flat boundary instead of deleting the tween", async () => {
    const circle: TimelineElement = {
      ...element,
      id: "circle",
      key: "scenes/main.html#circle",
      domId: "circle",
    };
    usePlayerStore.setState({
      elements: [element, circle],
      gsapAnimations: new Map([["scenes/main.html#circle", [otherFlatAnimation]]]),
    });
    const view = renderCallbacks();

    await act(async () => {
      view.callbacks.onDeleteKeyframe?.("scenes/main.html#circle", {
        percentage: 0,
        propertyGroup: "position",
        tweenPercentage: 0,
        animationId: otherFlatAnimation.id,
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    // Persisted through the CLICKED element's own selection, not the current one,
    // and as a remove-keyframe the writer can refuse — never a whole-tween delete.
    expect(mocks.actions.handleGsapRemoveKeyframe).toHaveBeenCalledWith(
      otherFlatAnimation.id,
      0,
      undefined,
      selectionForElement(circle),
    );
    expect(mocks.actions.handleGsapDeleteAnimation).not.toHaveBeenCalled();
    view.unmount();
  });

  it("removes a non-selected element authored endpoint through the clicked element's selection", async () => {
    const circle: TimelineElement = {
      ...element,
      id: "circle",
      key: "scenes/main.html#circle",
      domId: "circle",
    };
    usePlayerStore.setState({
      elements: [element, circle],
      gsapAnimations: new Map([["index.html#circle", [otherKeyframedAnimation]]]),
    });
    const view = renderCallbacks();

    await act(async () => {
      view.callbacks.onDeleteKeyframe?.("scenes/main.html#circle", {
        percentage: 100,
        propertyGroup: "position",
        tweenPercentage: 100,
        animationId: otherKeyframedAnimation.id,
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.actions.handleGsapRemoveKeyframe).toHaveBeenCalledWith(
      otherKeyframedAnimation.id,
      100,
      undefined,
      selectionForElement(circle),
    );
    expect(mocks.actions.handleGsapDeleteAnimation).not.toHaveBeenCalled();
    view.unmount();
  });

  it("deletes all keyframes through the clicked non-selected element's identity", async () => {
    const circle: TimelineElement = {
      ...element,
      id: "circle",
      key: "scenes/main.html#circle",
      domId: "circle",
      sourceFile: "scenes/main.html",
    };
    const circleSelection = { id: "circle", selector: "#circle", sourceFile: "scenes/main.html" };
    const scaleAnimation: GsapAnimation = {
      ...otherKeyframedAnimation,
      id: "circle-to-0-scale",
      properties: {},
      propertyGroup: "scale",
      keyframes: {
        format: "percentage",
        keyframes: [
          { percentage: 0, properties: { scale: 1 } },
          { percentage: 100, properties: { scale: 2 } },
        ],
      },
    };
    usePlayerStore.setState({
      elements: [element, circle],
      gsapAnimations: new Map([
        ["scenes/main.html#circle", [otherKeyframedAnimation, scaleAnimation]],
      ]),
    });
    mocks.actions.buildDomSelectionForTimelineElement.mockResolvedValue(circleSelection);
    const view = renderCallbacks();

    await act(async () => {
      view.callbacks.onDeleteAllKeyframes?.(circle, scaleAnimation.id);
      await Promise.resolve();
    });

    expect(mocks.actions.handleGsapRemoveAllKeyframes).toHaveBeenCalledWith(
      scaleAnimation.id,
      circleSelection,
      false,
    );
    view.unmount();
  });

  it("deletes all keyframes on every keyframed tween of the layer, not just the first", async () => {
    const opacityAnimation: GsapAnimation = {
      ...otherKeyframedAnimation,
      id: "circle-to-0-visual",
      propertyGroup: "visual",
    };
    const { circle } = arrangeClickedCircle();
    usePlayerStore.setState({
      gsapAnimations: new Map([
        ["scenes/main.html#circle", [otherKeyframedAnimation, opacityAnimation]],
      ]),
    });
    const view = renderCallbacks();

    await act(async () => {
      view.callbacks.onDeleteAllKeyframes?.(circle);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.actions.handleGsapRemoveAllKeyframes.mock.calls.map((call) => call[0])).toEqual([
      otherKeyframedAnimation.id,
      opacityAnimation.id,
    ]);
    view.unmount();
  });

  it("does not delete a different lane when an explicit animation identity is stale", async () => {
    const { circle } = arrangeClickedCircle();
    const view = renderCallbacks();

    await act(async () => {
      view.callbacks.onDeleteAllKeyframes?.(circle, "missing-animation-id");
      await Promise.resolve();
    });

    expect(mocks.actions.handleGsapRemoveAllKeyframes).not.toHaveBeenCalled();
    view.unmount();
  });

  it("aborts every mutation when the clicked element resolves no selection", async () => {
    const { circle } = arrangeClickedCircle();
    mocks.actions.buildDomSelectionForTimelineElement.mockResolvedValue(null);
    const view = renderCallbacks();

    await act(async () => {
      view.callbacks.onDeleteAllKeyframes?.(circle);
      view.callbacks.onMoveKeyframeToPlayhead?.(circle, {
        percentage: 100,
        propertyGroup: "position",
        tweenPercentage: 100,
        animationId: otherKeyframedAnimation.id,
      });
      view.callbacks.onDeleteKeyframe?.("scenes/main.html#circle", {
        percentage: 100,
        propertyGroup: "position",
        tweenPercentage: 100,
        animationId: otherKeyframedAnimation.id,
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    // No selection for the clicked element means there is nothing safe to write
    // to: falling back to the current selection would edit a different file.
    expect(mocks.actions.handleGsapRemoveAllKeyframes).not.toHaveBeenCalled();
    expect(mocks.actions.handleGsapMoveKeyframeToPlayhead).not.toHaveBeenCalled();
    expect(mocks.actions.handleGsapRemoveKeyframe).not.toHaveBeenCalled();
    view.unmount();
  });

  it("does not delete a different keyframe when its explicit animation identity is stale", () => {
    const view = renderCallbacks();

    act(() => {
      view.callbacks.onDeleteKeyframe?.("box", {
        percentage: 100,
        propertyGroup: "position",
        tweenPercentage: 100,
        animationId: "missing-animation-id",
      });
    });

    expect(mocks.actions.handleGsapDeleteAnimation).not.toHaveBeenCalled();
    expect(mocks.actions.handleGsapRemoveKeyframe).not.toHaveBeenCalled();
    view.unmount();
  });

  it("does not move a different keyframe when its explicit animation identity is stale", async () => {
    const view = renderCallbacks();

    await act(async () => {
      view.callbacks.onMoveKeyframeToPlayhead?.(element, {
        percentage: 100,
        propertyGroup: "position",
        tweenPercentage: 100,
        animationId: "missing-animation-id",
      });
      await Promise.resolve();
    });

    expect(mocks.actions.handleGsapMoveKeyframeToPlayhead).not.toHaveBeenCalled();
    view.unmount();
  });

  it("moves a keyframe to the playhead through the clicked non-selected element's identity", async () => {
    const { circle, selection } = arrangeClickedCircle();
    const view = renderCallbacks();

    await act(async () => {
      view.callbacks.onMoveKeyframeToPlayhead?.(circle, {
        percentage: 100,
        propertyGroup: "position",
        tweenPercentage: 100,
        animationId: otherKeyframedAnimation.id,
      });
      await Promise.resolve();
    });

    // The retime target, the selection it commits through, and the animation the
    // playhead percentage is computed against all come from the CLICKED element.
    expect(mocks.actions.handleGsapMoveKeyframeToPlayhead).toHaveBeenCalledWith(
      otherKeyframedAnimation.id,
      100,
      selection,
      otherKeyframedAnimation,
    );
    view.unmount();
  });

  it("keeps a selected-element flat boundary on the remove-keyframe path", () => {
    const view = renderCallbacks();

    act(() => {
      view.callbacks.onDeleteKeyframe?.("box", {
        percentage: 0,
        propertyGroup: "position",
        tweenPercentage: 0,
        animationId: flatAnimation.id,
      });
    });

    expect(mocks.actions.handleGsapRemoveKeyframe).toHaveBeenCalledWith(
      flatAnimation.id,
      0,
      undefined,
      undefined,
    );
    expect(mocks.actions.handleGsapDeleteAnimation).not.toHaveBeenCalled();
    view.unmount();
  });

  it("routes the flat lane-header remove toggle through the refusable remove path", async () => {
    const view = renderCallbacks();

    await act(async () => {
      await view.callbacks.onTogglePropertyGroupKeyframe?.(element, {
        animationId: flatAnimation.id,
        propertyGroup: "position",
        tweenPercentage: 100,
        properties: { x: 420 },
        remove: true,
      });
    });

    expect(mocks.actions.handleGsapRemoveKeyframe).toHaveBeenCalledWith(
      flatAnimation.id,
      100,
      undefined,
      mocks.selection,
    );
    expect(mocks.actions.handleGsapDeleteAnimation).not.toHaveBeenCalled();
    view.unmount();
  });

  // The lane-header toggle fires on whichever element owns the lane, which need
  // not be the selected one. It must still commit through that element's own
  // selection, and it must never escalate a flat tween to a whole-tween delete.
  it("removes a non-selected element's flat tween through that element's own selection", async () => {
    const circle: TimelineElement = {
      ...element,
      id: "circle",
      key: "scenes/main.html#circle",
      domId: "circle",
    };
    usePlayerStore.setState({
      elements: [element, circle],
      gsapAnimations: new Map([["scenes/main.html#circle", [otherFlatAnimation]]]),
    });
    const view = renderCallbacks();

    await act(async () => {
      await view.callbacks.onTogglePropertyGroupKeyframe?.(circle, {
        animationId: otherFlatAnimation.id,
        propertyGroup: "position",
        tweenPercentage: 0,
        properties: { x: 0 },
        remove: true,
      });
    });

    expect(mocks.actions.handleGsapRemoveKeyframe).toHaveBeenCalledWith(
      otherFlatAnimation.id,
      0,
      undefined,
      selectionForElement(circle),
    );
    expect(mocks.actions.handleGsapDeleteAnimation).not.toHaveBeenCalled();
    view.unmount();
  });

  it("keeps authored interior deletion on the per-keyframe path", () => {
    mocks.animations = [authoredInteriorAnimation()];
    usePlayerStore.setState({ gsapAnimations: new Map([["box", mocks.animations]]) });
    const view = renderCallbacks();

    act(() => {
      view.callbacks.onDeleteKeyframe?.("box", {
        percentage: 50,
        propertyGroup: "position",
        tweenPercentage: 50,
        animationId: flatAnimation.id,
      });
    });

    expect(mocks.actions.handleGsapRemoveKeyframe).toHaveBeenCalledWith(
      flatAnimation.id,
      50,
      undefined,
      undefined,
    );
    expect(mocks.actions.handleGsapDeleteAnimation).not.toHaveBeenCalled();
    view.unmount();
  });

  it("keeps an authored interior drag on the per-keyframe move path", async () => {
    const authored = authoredInteriorAnimation();
    mocks.animations = [authored];
    usePlayerStore.setState({ gsapAnimations: new Map([["box", [authored]]]) });
    const view = renderCallbacks();

    await expect(
      view.callbacks.onMoveKeyframe?.(
        "box",
        {
          percentage: 50,
          propertyGroup: "position",
          tweenPercentage: 50,
          animationId: authored.id,
        },
        75,
      ),
    ).resolves.toBe(true);

    expect(mocks.actions.handleGsapMoveKeyframe).toHaveBeenCalledWith(
      authored.id,
      50,
      75,
      mocks.selection,
    );
    expect(mocks.actions.handleGsapResizeKeyframedTween).not.toHaveBeenCalled();
    view.unmount();
  });

  it("retimes a duration-less tween's keyframe in the window GSAP plays it, not the clip", async () => {
    const durationless = { ...authoredInteriorAnimation(), duration: undefined };
    mocks.animations = [durationless];
    usePlayerStore.setState({ gsapAnimations: new Map([["box", [durationless]]]) });
    const view = renderCallbacks();

    // GSAP plays it 0-0.5 s of the 1 s clip, so a drop at 0.4 s is 80% of the tween.
    await view.callbacks.onMoveKeyframe?.(
      "box",
      {
        percentage: 25,
        propertyGroup: "position",
        tweenPercentage: 50,
        animationId: durationless.id,
      },
      40,
    );

    expect(mocks.actions.handleGsapMoveKeyframe).toHaveBeenCalledWith(
      durationless.id,
      50,
      80,
      mocks.selection,
    );
    view.unmount();
  });

  // A drag starts on whatever diamond the pointer is over, which need not be the
  // selected element. Resolving against the selection would retime the selected
  // element's tween and commit it through the selected element's file.
  it("retimes a non-selected element's keyframe through that element's own selection", async () => {
    const circle: TimelineElement = {
      ...element,
      id: "circle",
      key: "scenes/main.html#circle",
      domId: "circle",
      sourceFile: "scenes/main.html",
    };
    const circleSelection = { id: "circle", selector: "#circle", sourceFile: "scenes/main.html" };
    const circleAnimation = { ...authoredInteriorAnimation(), id: "circle-to-0-position" };
    usePlayerStore.setState({
      elements: [element, circle],
      gsapAnimations: new Map([["scenes/main.html#circle", [circleAnimation]]]),
    });
    mocks.actions.buildDomSelectionForTimelineElement.mockResolvedValue(circleSelection);
    const view = renderCallbacks();

    await act(async () => {
      await view.callbacks.onMoveKeyframe?.(
        "scenes/main.html#circle",
        {
          percentage: 50,
          propertyGroup: "position",
          tweenPercentage: 50,
          animationId: circleAnimation.id,
        },
        75,
      );
    });

    expect(mocks.actions.handleGsapMoveKeyframe).toHaveBeenCalledWith(
      circleAnimation.id,
      50,
      75,
      circleSelection,
    );
    view.unmount();
  });

  // The diamond's rapid-second-retime path reports the PENDING clip-% (where the
  // first drag put the keyframe), which the keyframe cache has not caught up to.
  // TimelineClipDiamonds' own test mocks onMoveKeyframe, so only this one proves
  // the real callback resolves that stale-cache position off the identity fields
  // instead of failing the lookup.
  it("retimes from a pending position the keyframe cache has not caught up to", async () => {
    const authored = authoredInteriorAnimation();
    mocks.animations = [authored];
    usePlayerStore.setState({
      elements: [element],
      gsapAnimations: new Map([["index.html#box", [authored]]]),
      // Still the pre-drag positions: 75% is not in here.
      keyframeCache: new Map([
        [
          "index.html#box",
          {
            format: "percentage" as const,
            keyframes: [
              { percentage: 0, properties: { x: 0 } },
              { percentage: 50, properties: { x: 210 } },
              { percentage: 100, properties: { x: 420 } },
            ],
          },
        ],
      ]),
    });
    const view = renderCallbacks();

    await expect(
      view.callbacks.onMoveKeyframe?.(
        "index.html#box",
        {
          percentage: 75,
          propertyGroup: "position",
          tweenPercentage: 50,
          animationId: authored.id,
        },
        85,
      ),
    ).resolves.toBe(true);
    expect(mocks.actions.handleGsapMoveKeyframe).toHaveBeenCalledWith(
      authored.id,
      50,
      85,
      mocks.selection,
    );

    // Control: the same drag WITHOUT the identity fields falls back to the cache
    // lookup, finds nothing at 75%, and cannot retime.
    mocks.actions.handleGsapMoveKeyframe.mockClear();
    await expect(
      view.callbacks.onMoveKeyframe?.("index.html#box", { percentage: 75 }, 85),
    ).resolves.toBe(false);
    expect(mocks.actions.handleGsapMoveKeyframe).not.toHaveBeenCalled();
    view.unmount();
  });
});
