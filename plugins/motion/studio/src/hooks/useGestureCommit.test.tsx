// @vitest-environment jsdom
import { act, useLayoutEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import { trackStudioEvent } from "../utils/studioTelemetry";
import { trackKeyframeCommit } from "../utils/keyframeUsage";
import type { DomEditSelection } from "../components/editor/domEditing";
import { usePlayerStore } from "../player";
import { mountReactHarness } from "./domSelectionTestHarness";
import type { CommitMutationOptions } from "./gsapScriptCommitTypes";
import { useGsapAwareEditing } from "./useGsapAwareEditing";
import { useGestureCommit } from "./useGestureCommit";
import { xAtTime } from "./gsapPlaybackTestHarness";

vi.mock("../utils/studioTelemetry", () => ({ trackStudioEvent: vi.fn() }));

const gestureRecording = vi.hoisted(() => ({
  startRecording: vi.fn(),
  stopRecording: vi.fn(() => [
    { time: 0, properties: { x: 0, y: 0, opacity: 1 } },
    { time: 0.5, properties: { x: 50, y: 25, opacity: 0.5 } },
    { time: 1, properties: { x: 100, y: 50, opacity: 0 } },
  ]),
  clearSamples: vi.fn(),
  cancelRecording: vi.fn(),
  isRecording: false,
  recordingDuration: 0,
  samplesRef: { current: [] },
  trailRef: { current: [] },
}));

vi.mock("./useGestureRecording", () => ({
  useGestureRecording: () => gestureRecording,
}));

vi.mock("../utils/rdpSimplify", () => ({
  simplifyGestureSamples: () =>
    new Map([
      [0, { x: 0, y: 0, opacity: 1 }],
      [50, { x: 50, y: 25, opacity: 0.5 }],
      [100, { x: 100, y: 50, opacity: 0 }],
    ]),
}));

vi.mock("../utils/gestureSmoother", () => ({
  smoothGestureKeyframes: (keyframes: unknown) => keyframes,
}));

vi.mock("../utils/velocityEaseFitter", () => ({
  fitEasesFromVelocity: (keyframes: unknown) => keyframes,
}));

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

let cleanup: (() => void) | null = null;

afterEach(() => {
  cleanup?.();
  cleanup = null;
  usePlayerStore.getState().reset();
  document.body.replaceChildren();
  vi.clearAllMocks();
});

function makeSelection(element: HTMLElement): DomEditSelection {
  return {
    id: element.id,
    element,
    label: "Card",
    tagName: "div",
    sourceFile: "index.html",
    compositionPath: "index.html",
    isCompositionHost: false,
    isInsideLockedComposition: false,
    boundingBox: { x: 0, y: 0, width: 100, height: 100 },
    textContent: null,
    dataAttributes: { start: "0", duration: "2" },
    inlineStyles: {},
    computedStyles: {},
    textFields: [],
    capabilities: {
      canSelect: true,
      canEditStyles: true,
      canCrop: true,
      canMove: true,
      canResize: true,
      canApplyManualOffset: true,
      canApplyManualSize: true,
      canApplyManualRotation: true,
    },
  };
}

function mountRecording(
  writer: (
    mutation: Record<string, unknown>,
    options: CommitMutationOptions,
    selection?: DomEditSelection,
  ) => Promise<void>,
  animations: GsapAnimation[] = [],
  readOnlyPreview = false,
) {
  const iframe = document.createElement("iframe");
  document.body.append(iframe);
  const element = document.createElement("div");
  element.id = "card";
  const session = {
    current: {
      domEditSelection: makeSelection(element),
      selectedGsapAnimations: animations,
      commitMutation: writer,
    },
  };
  let hook: ReturnType<typeof useGestureCommit> | null = null;
  function Probe() {
    const editing = useGsapAwareEditing({
      domEditSelection: session.current.domEditSelection,
      selectedGsapAnimations: session.current.selectedGsapAnimations,
      gsapCommitMutation: (selection, mutation, options) => writer(mutation, options, selection),
      previewIframeRef: { current: iframe },
      showToast: vi.fn(),
      bumpGsapCache: vi.fn(),
      makeFetchFallback: () => vi.fn(),
      trackGsapInteractionFailure: vi.fn(),
      stageElementPositionOffset: vi.fn(),
      handleDomBoxSizeCommit: vi.fn(),
      handleDomRotationCommit: vi.fn(),
      commitPositionPatchToHtml: vi.fn(),
      addGsapAnimation: vi.fn(),
      convertToKeyframes: vi.fn(),
      setArcPath: vi.fn(),
      updateArcSegment: vi.fn(),
    });
    const currentHook = useGestureCommit({
      domEditSessionRef: session,
      previewIframeRef: { current: iframe },
      showToast: vi.fn(),
      isGestureRecordingRef: { current: false },
      readOnlyPreview,
    });
    useLayoutEffect(() => {
      session.current.commitMutation = editing.commitMutation;
      hook = currentHook;
    });
    return null;
  }
  const root = mountReactHarness(<Probe />);
  cleanup = () => act(() => root.unmount());
  return Object.assign(
    () => {
      if (!hook) throw new Error("hook did not initialize");
      return hook;
    },
    {
      select: (selection: DomEditSelection, nextAnimations: GsapAnimation[]) => {
        session.current.domEditSelection = selection;
        session.current.selectedGsapAnimations = nextAnimations;
        act(() => root.render(<Probe />));
      },
    },
  );
}

describe("useGestureCommit", () => {
  it("coalesces property-group commits and reloads only the terminal group", async () => {
    const writer = vi.fn<
      (mutation: Record<string, unknown>, options: CommitMutationOptions) => Promise<void>
    >(async () => {});
    const hook = mountRecording(writer);
    act(() => hook().handleToggleRecording());
    act(() => hook().handleToggleRecording());
    await act(async () => {
      await vi.waitFor(() => expect(writer).toHaveBeenCalledTimes(2));
    });
    const options = writer.mock.calls.map((call) => call[1]);
    expect(new Set(options.map((entry) => entry.coalesceKey)).size).toBe(1);
    expect(options[0]).toEqual(expect.objectContaining({ coalesceMs: Infinity, skipReload: true }));
    expect(options[0]).not.toHaveProperty("softReload");
    expect(options[1]).toEqual(expect.objectContaining({ coalesceMs: Infinity, softReload: true }));
    expect(options[1]).not.toHaveProperty("skipReload");
  });

  it("does not start a recording while the preview is read-only", () => {
    const writer = vi.fn(async () => {});
    const hook = mountRecording(writer, [], true);
    act(() => hook().handleToggleRecording());
    expect(gestureRecording.startRecording).not.toHaveBeenCalled();
    expect(writer).not.toHaveBeenCalled();
  });
});

it.each([
  ["new mixed-property recording", undefined, true, true, 1, "button"],
  ["keyboard recording", undefined, true, true, 1, "keyboard"],
  ["static hold replacement", "set", true, true, 1, "button"],
  ["overlapping tween replacement", "to", true, true, 1, "button"],
  ["unchanged recording", undefined, true, false, 0, "button"],
  ["refused recording", undefined, false, true, 0, "button"],
] as const)(
  "counts writer receipts once for %s",
  async (_name, method, ok, changed, count, inputMethod) => {
    const animations = method
      ? [
          {
            id: "card-position",
            targetSelector: "#card",
            propertyGroup: "position",
            method,
            properties: { x: 0, y: 0 },
            resolvedStart: 0,
            position: 0,
            duration: method === "set" ? 0 : 2,
            keyframes: {
              keyframes: [
                { percentage: 0, properties: { x: 0 } },
                { percentage: 100, properties: { x: 100 } },
              ],
            },
          } as unknown as GsapAnimation,
        ]
      : [];
    const writer = vi.fn(
      async (mutation: Record<string, unknown>, options: CommitMutationOptions) => {
        const result = { ok, changed };
        trackKeyframeCommit([mutation], result, options);
        options.onResult?.(result);
      },
    );
    const hook = mountRecording(writer, animations);
    act(() => hook().handleToggleRecording(inputMethod));
    await act(async () => {
      hook().handleToggleRecording();
      await vi.waitFor(() => expect(writer).toHaveBeenCalled());
    });
    expect(trackStudioEvent).toHaveBeenCalledTimes(count * 2);
    if (count) {
      expect(trackStudioEvent).toHaveBeenCalledWith("keyframe", { action: "add" });
      expect(trackStudioEvent).toHaveBeenCalledWith("feature_used", {
        feature: "gesture_recording",
        surface: "preview",
        method: inputMethod,
      });
    }
  },
);

const FROM_0_TO_100 = [
  { percentage: 0, properties: { x: 0 } },
  { percentage: 100, properties: { x: 100 } },
];

function positionTween(
  duration: number,
  eases: { ease?: string; easeEach?: string } = {},
  keyframes = FROM_0_TO_100,
) {
  return {
    id: "card-position",
    targetSelector: "#card",
    propertyGroup: "position",
    method: "to",
    properties: { x: 0, y: 0 },
    resolvedStart: 0,
    position: 0,
    duration,
    ...(eases.ease ? { ease: eases.ease } : {}),
    keyframes: {
      ...(eases.easeEach ? { easeEach: eases.easeEach } : {}),
      keyframes,
    },
  } as unknown as GsapAnimation;
}

/** Records the mocked 1 s gesture (x 0, 50, 100) from 0 s over `tween`; resolves to the merge mutation. */
async function recordMergeInto(tween: GsapAnimation) {
  const writer = vi.fn(
    async (_mutation: Record<string, unknown>, options: CommitMutationOptions) => {
      options.onResult?.({ ok: true, changed: true });
    },
  );
  const hook = mountRecording(writer, [tween]);
  act(() => hook().handleToggleRecording("button"));
  await act(async () => {
    hook().handleToggleRecording();
    await vi.waitFor(() => expect(writer).toHaveBeenCalled());
  });
  expect(writer.mock.calls[0]![1]).toMatchObject({ label: "Gesture recording (merge)" });
  return writer.mock.calls[0]![0] as unknown as Parameters<typeof xAtTime>[0] & {
    type: string;
    ease?: string;
    easeEach?: string;
  };
}

it("keeps the tween's eases when a recording merges into it", async () => {
  const merge = await recordMergeInto(
    positionTween(2, { ease: "back.out", easeEach: "power2.out" }),
  );
  expect(merge).toMatchObject({
    type: "replace-with-keyframes",
    ease: "back.out",
    easeEach: "power2.out",
  });
  // Recorded segments the fitter left unset stay constant speed instead of taking easeEach.
  expect(merge.keyframes.map((kf) => kf.ease)).toEqual([undefined, "none", "none", undefined]);
});

it("plays a recording merged into an eased tween at the times it was recorded", async () => {
  const merge = await recordMergeInto(positionTween(3, { ease: "power2.out" }));
  expect(xAtTime(merge, 0.5)).toBeCloseTo(50, 0);
  expect(xAtTime(merge, 1)).toBeCloseTo(100, 0);
});

it("keeps recorded keyframes apart over the tail of a power4.out tween", async () => {
  usePlayerStore.setState({ currentTime: 9 });
  const merge = await recordMergeInto(positionTween(10, { ease: "power4.out" }));
  expect(xAtTime(merge, 9.5)).toBeCloseTo(50, 0);
});

it("keeps a keyframe playing at 8.5 s when a recording covers 9-10 s of a power2.out tween", async () => {
  usePlayerStore.setState({ currentTime: 9 });
  const at8_5s = { percentage: 99.6625, properties: { x: 80 } };
  const merge = await recordMergeInto(
    positionTween(10, { ease: "power2.out" }, [FROM_0_TO_100[0]!, at8_5s, FROM_0_TO_100[1]!]),
  );
  expect(merge.keyframes).toContainEqual(at8_5s);
  expect(xAtTime(merge, 8.5)).toBeCloseTo(80, 0);
});

it("writes merged keyframe percentages rounded, not as float noise", async () => {
  const merge = await recordMergeInto(positionTween(3));
  expect(merge.keyframes.map((kf) => kf.percentage)).toEqual([0, 16.667, 33.333, 100]);
});

it("keeps a pending recording isolated until its writer settles", async () => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const writer = vi.fn(
    async (_mutation: Record<string, unknown>, options: CommitMutationOptions) => {
      await pending;
      options.onResult?.({ ok: true, changed: true });
    },
  );
  const hook = mountRecording(writer);
  act(() => hook().handleToggleRecording("keyboard"));
  act(() => hook().handleToggleRecording());
  await vi.waitFor(() => expect(writer).toHaveBeenCalledTimes(1));
  act(() => hook().handleToggleRecording("button"));
  expect(gestureRecording.startRecording).toHaveBeenCalledTimes(1);
  await act(async () => {
    release();
    await vi.waitFor(() =>
      expect(trackStudioEvent).toHaveBeenCalledWith("feature_used", {
        feature: "gesture_recording",
        surface: "preview",
        method: "keyboard",
      }),
    );
  });
  expect(gestureRecording.clearSamples).toHaveBeenCalledTimes(1);
  act(() => hook().handleToggleRecording("button"));
  expect(gestureRecording.startRecording).toHaveBeenCalledTimes(2);
});

it("writes one recording to its original selection after selecting another source", async () => {
  const original = {
    id: "original-position",
    targetSelector: "#card",
    propertyGroup: "position",
    method: "set",
    properties: { x: 0, y: 0 },
    resolvedStart: 0,
    position: 0,
    duration: 0,
  } as GsapAnimation;
  const writer = vi.fn(
    async (
      _mutation: Record<string, unknown>,
      options: CommitMutationOptions,
      _selection?: DomEditSelection,
    ) => {
      options.onResult?.({ ok: true, changed: true });
    },
  );
  const hook = mountRecording(writer, [original]);
  act(() => hook().handleToggleRecording("keyboard"));
  const other = document.createElement("div");
  other.id = "other";
  hook.select(
    { ...makeSelection(other), sourceFile: "other.html", compositionPath: "other.html" },
    [],
  );
  await act(async () => {
    hook().handleToggleRecording();
    await vi.waitFor(() => expect(trackStudioEvent).toHaveBeenCalledTimes(2));
  });
  expect(writer).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      type: "replace-with-keyframes",
      animationId: "original-position",
      targetSelector: "#card",
    }),
    expect.objectContaining({ keyframeAction: "add" }),
    expect.objectContaining({
      id: "card",
      sourceFile: "index.html",
      compositionPath: "index.html",
    }),
  );
  expect(trackStudioEvent).toHaveBeenCalledWith("keyframe", { action: "add" });
  expect(trackStudioEvent).toHaveBeenCalledWith("feature_used", {
    feature: "gesture_recording",
    surface: "preview",
    method: "keyboard",
  });
});
