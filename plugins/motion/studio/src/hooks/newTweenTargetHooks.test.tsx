// @vitest-environment jsdom
/**
 * Hook-level siblings of newTweenTarget.test.ts: the property panel and the
 * gesture recorder also author NEW tweens, so they face the same bare-class
 * blow-up. Driven through the real hooks so the classification under test
 * (new tween vs retarget of an existing one) is the production one.
 */
import React, { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import type { DomEditSelection } from "../components/editor/domEditingTypes";
import { usePlayerStore } from "../player/store/playerStore";
import { resolveSelectorElementIds } from "./gsapShared";
import { useAnimatedPropertyCommit } from "./useAnimatedPropertyCommit";
import { useGestureCommit } from "./useGestureCommit";
import { mountReactHarness, installReactActEnvironment } from "./domSelectionTestHarness";

installReactActEnvironment();

const frozenSamples = [
  { time: 0, properties: { x: 0, y: 0 } },
  { time: 0.5, properties: { x: 60, y: 10 } },
  { time: 1, properties: { x: 120, y: 40 } },
];

vi.mock("./useGestureRecording", () => ({
  useGestureRecording: () => ({
    startRecording: vi.fn(),
    stopRecording: () => frozenSamples,
    clearSamples: vi.fn(),
    samples: frozenSamples,
  }),
}));

afterEach(() => {
  document.body.innerHTML = "";
  usePlayerStore.setState({ autoKeyframeEnabled: true, currentTime: 0 });
});

function mountGroupSiblings(): HTMLElement[] {
  document.body.innerHTML = `
    <div id="scene" class="clip" data-start="0" data-duration="2">
      <div class="group" id="group-0"></div>
      <div class="group" id="group-1"></div>
      <div class="group" id="group-2"></div>
      <div class="group" id="group-3"></div>
      <div class="group" id="group-4"></div>
    </div>
  `;
  return Array.from(document.querySelectorAll<HTMLElement>(".group"));
}

/** The id-less shape buildStableSelector answers with a bare class. */
function classOnlySelection(el: HTMLElement): DomEditSelection {
  return {
    element: el,
    id: undefined,
    selector: ".group",
    selectorIndex: Array.prototype.indexOf.call(el.parentElement!.children, el),
    sourceFile: "index.html",
    dataAttributes: { start: "0", duration: "2" },
  } as unknown as DomEditSelection;
}

function attributedTo(targetSelector: unknown): string[] {
  return resolveSelectorElementIds(String(targetSelector), document);
}

type Commit = (
  selection: DomEditSelection,
  props: Record<string, number | string>,
) => Promise<void>;

function renderPropertyCommit(
  animations: GsapAnimation[],
  mutations: Array<Record<string, unknown>>,
  onReady: (commit: Commit) => void,
) {
  function Harness() {
    const { commitAnimatedProperties } = useAnimatedPropertyCommit({
      selectedGsapAnimations: animations,
      gsapCommitMutation: async (_sel: DomEditSelection, mutation: Record<string, unknown>) => {
        mutations.push(mutation);
      },
      addGsapAnimation: vi.fn(),
      convertToKeyframes: vi.fn(),
      previewIframeRef: { current: null },
      bumpGsapCache: vi.fn(),
    } as never);
    onReady(commitAnimatedProperties);
    return null;
  }
  return mountReactHarness(<Harness />);
}

describe("useAnimatedPropertyCommit — new-tween targets", () => {
  it("authors a new static set against one element", async () => {
    const groups = mountGroupSiblings();
    const mutations: Array<Record<string, unknown>> = [];
    let commit: Commit | undefined;
    const root = renderPropertyCommit([], mutations, (fn) => (commit = fn));

    await act(async () => {
      await commit!(classOnlySelection(groups[2]!), { rotationX: 30 });
    });

    const added = mutations.find((m) => m.type === "add");
    expect(added).toBeTruthy();
    expect(attributedTo(added!.targetSelector)).toEqual(["group-2"]);
    act(() => root.unmount());
  });

  it("authors the first same-group keyframe tween against one element", async () => {
    const groups = mountGroupSiblings();
    // A position tween exists, so the element IS animated; a rotation edit has
    // no same-group tween to join and must author a fresh one.
    const positionTween = {
      id: "t-pos",
      targetSelector: ".group",
      propertyGroup: "position",
      method: "to",
      properties: { x: 0 },
      resolvedStart: 0,
      duration: 2,
      keyframes: {
        keyframes: [
          { percentage: 0, properties: { x: 0 } },
          { percentage: 100, properties: { x: 50 } },
        ],
      },
    } as unknown as GsapAnimation;
    const mutations: Array<Record<string, unknown>> = [];
    let commit: Commit | undefined;
    const root = renderPropertyCommit([positionTween], mutations, (fn) => (commit = fn));

    await act(async () => {
      await commit!(classOnlySelection(groups[1]!), { rotationY: 15 });
    });

    const added = mutations.find((m) => m.type === "add-with-keyframes");
    expect(added).toBeTruthy();
    expect(attributedTo(added!.targetSelector)).toEqual(["group-1"]);
    act(() => root.unmount());
  });

  it("leaves an existing group tween aimed at its whole group", async () => {
    const groups = mountGroupSiblings();
    usePlayerStore.setState({ autoKeyframeEnabled: false, currentTime: 0 });
    const groupTween = {
      id: "t-pos",
      targetSelector: ".group",
      propertyGroup: "position",
      method: "to",
      properties: { x: 0 },
      resolvedStart: 0,
      duration: 2,
      keyframes: {
        keyframes: [
          { percentage: 0, properties: { x: 0, y: 0 } },
          { percentage: 100, properties: { x: 50, y: 0 } },
        ],
      },
    } as unknown as GsapAnimation;
    const mutations: Array<Record<string, unknown>> = [];
    let commit: Commit | undefined;
    const root = renderPropertyCommit([groupTween], mutations, (fn) => (commit = fn));

    await act(async () => {
      await commit!(classOnlySelection(groups[2]!), { x: 90 });
    });

    const replaced = mutations.find((m) => m.type === "replace-with-keyframes");
    expect(replaced).toBeTruthy();
    expect(replaced!.targetSelector).toBe(".group");
    act(() => root.unmount());
  });
});

function renderGestureCommit(
  animations: GsapAnimation[],
  mutations: Array<Record<string, unknown>>,
  selection: DomEditSelection,
) {
  let toggle: (() => void) | undefined;
  function Harness() {
    const { handleToggleRecording } = useGestureCommit({
      domEditSessionRef: {
        current: {
          domEditSelection: selection,
          selectedGsapAnimations: animations,
          commitMutation: async (mutation: Record<string, unknown>) => {
            mutations.push(mutation);
          },
        },
      } as never,
      previewIframeRef: { current: document.createElement("iframe") },
      showToast: vi.fn(),
      isGestureRecordingRef: { current: false },
      readOnlyPreview: false,
    });
    toggle = handleToggleRecording;
    return null;
  }
  const root = mountReactHarness(<Harness />);
  return { root, toggle: () => toggle!() };
}

describe("useGestureCommit — new-tween targets", () => {
  it("authors the recorded tween against one element", async () => {
    const groups = mountGroupSiblings();
    const mutations: Array<Record<string, unknown>> = [];
    const { root, toggle } = renderGestureCommit([], mutations, classOnlySelection(groups[3]!));

    act(() => toggle()); // start
    await act(async () => {
      toggle(); // stop + commit
      await Promise.resolve();
    });

    const added = mutations.find((m) => m.type === "add-with-keyframes");
    expect(added).toBeTruthy();
    expect(attributedTo(added!.targetSelector)).toEqual(["group-3"]);
    act(() => root.unmount());
  });

  it("leaves a merged existing group tween aimed at its whole group", async () => {
    const groups = mountGroupSiblings();
    const existing = {
      id: "t-pos",
      targetSelector: ".group",
      propertyGroup: "position",
      method: "to",
      properties: { x: 0 },
      resolvedStart: 0,
      duration: 2,
      keyframes: { keyframes: [{ percentage: 0, properties: { x: 0, y: 0 } }] },
    } as unknown as GsapAnimation;
    const mutations: Array<Record<string, unknown>> = [];
    const { root, toggle } = renderGestureCommit(
      [existing],
      mutations,
      classOnlySelection(groups[3]!),
    );

    act(() => toggle());
    await act(async () => {
      toggle();
      await Promise.resolve();
    });

    const replaced = mutations.find((m) => m.type === "replace-with-keyframes");
    expect(replaced).toBeTruthy();
    expect(replaced!.targetSelector).toBe(".group");
    act(() => root.unmount());
  });
});
