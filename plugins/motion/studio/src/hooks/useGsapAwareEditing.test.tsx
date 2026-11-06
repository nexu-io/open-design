// @vitest-environment happy-dom

import React, { act } from "react";
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import type { DomEditSelection } from "../components/editor/domEditingTypes";
import type { RotationCommit } from "../components/editor/rotationDraft";
import type { DomEditGroupPathOffsetCommit } from "../components/editor/DomEditOverlay";
import { mountReactHarness, withInlineLayoutBox } from "./domSelectionTestHarness";
import { DomEditCropHandles } from "../components/editor/DomEditCropHandles";
import { applyStudioBoxSizeDraft } from "../components/editor/manualEdits";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  resize: vi.fn(),
  drag: vi.fn(),
  readPosition: vi.fn(),
  setPosition: vi.fn(),
  commitAnimatedProperty: vi.fn(),
  commitAnimatedProperties: vi.fn(),
}));

vi.mock("./gsapResizeIntercept", () => ({ tryGsapResizeIntercept: mocks.resize }));
vi.mock("./gsapRuntimeBridge", () => ({
  tryGsapDragIntercept: mocks.drag,
  tryGsapRotationIntercept: vi.fn(),
}));
vi.mock("./gsapPositionDetection", () => ({
  readGsapPositionFromIframe: mocks.readPosition,
}));
vi.mock("../utils/elementGsap", () => ({ setElementGsapPosition: mocks.setPosition }));
vi.mock("./useAnimatedPropertyCommit", () => ({
  useAnimatedPropertyCommit: () => ({
    commitAnimatedProperty: mocks.commitAnimatedProperty,
    commitAnimatedProperties: mocks.commitAnimatedProperties,
  }),
}));
vi.mock("./useSafeGsapCommitMutation", () => ({
  useGsapSaveFailureTelemetry: () => vi.fn(),
  useSafeGsapCommitMutation: (commit: unknown) => commit,
}));

import { useGsapAwareEditing } from "./useGsapAwareEditing";
import { isPreviewChanging } from "../player/previewReloading";
import { tryGsapRotationIntercept } from "./gsapRuntimeBridge";

afterEach(() => {
  vi.clearAllMocks();
});

/** An element GSAP already renders the transform of, so moves take the GSAP route. */
function gsapPositioned(tag: string): HTMLElement {
  return Object.assign(document.createElement(tag), { _gsap: { renderTransform: () => {} } });
}

function mountResizeHandler(
  animations: GsapAnimation[],
  targetAnimations: GsapAnimation[] = animations,
  gsapOwnsBox = true,
  hasGsapWriter = true,
) {
  const element = gsapOwnsBox ? gsapPositioned("div") : document.createElement("div");
  const selection = { element, id: "clip", selector: "#clip" } as unknown as DomEditSelection;
  const fallback = vi.fn().mockResolvedValue(undefined);
  const anchorSave = vi.fn().mockResolvedValue(undefined);
  const anchorRollback = vi.fn();
  const elementOffset = vi.fn(() => ({ save: anchorSave, rollback: anchorRollback }));
  const commitMutation = vi.fn().mockResolvedValue(undefined);
  const commitPatch = vi.fn().mockResolvedValue(undefined);
  const fetchAnimations = vi.fn(() => vi.fn().mockResolvedValue(targetAnimations));
  let resize:
    | ((
        selection: DomEditSelection,
        size: { width: number; height: number },
        offset?: { x: number; y: number },
        restore?: () => void,
        route?: { plainTranslate: boolean },
      ) => Promise<void | import("../utils/previewFeatureUsage").GeometryCommitResult>)
    | null = null;
  let property: ReturnType<typeof useGsapAwareEditing>["commitAnimatedProperty"] | null = null;
  function Harness() {
    const editing = useGsapAwareEditing({
      domEditSelection: selection,
      selectedGsapAnimations: animations,
      gsapCommitMutation: hasGsapWriter ? commitMutation : null,
      previewIframeRef: { current: null },
      showToast: vi.fn(),
      bumpGsapCache: vi.fn(),
      makeFetchFallback: fetchAnimations,
      trackGsapInteractionFailure: vi.fn(),
      stageElementPositionOffset: elementOffset,
      handleDomBoxSizeCommit: fallback,
      handleDomRotationCommit: vi.fn(),
      commitPositionPatchToHtml: commitPatch,
      addGsapAnimation: vi.fn(),
      convertToKeyframes: vi.fn(),
      setArcPath: vi.fn(),
      updateArcSegment: vi.fn(),
    });
    resize = editing.handleGsapAwareBoxSizeCommit;
    property = editing.commitAnimatedProperty;
    return null;
  }
  const root = mountReactHarness(<Harness />);
  return {
    selection,
    fallback,
    elementOffset,
    anchorSave,
    anchorRollback,
    commitMutation,
    commitPatch,
    fetchAnimations,
    resize: resize!,
    property: property!,
    root,
  };
}

type AwareEditingParams = Parameters<typeof useGsapAwareEditing>[0];

function mountGroupHandler({
  gsapCommitMutation = vi.fn().mockResolvedValue(undefined),
  makeFetchFallback = () => vi.fn().mockResolvedValue([]),
  trackGsapInteractionFailure = vi.fn(),
  stageElementPositionOffset = vi.fn(),
  handleDomRotationCommit = vi.fn(),
}: Partial<
  Pick<
    AwareEditingParams,
    | "gsapCommitMutation"
    | "makeFetchFallback"
    | "trackGsapInteractionFailure"
    | "stageElementPositionOffset"
    | "handleDomRotationCommit"
  >
> = {}) {
  let groupCommit!: (
    updates: DomEditGroupPathOffsetCommit[],
  ) => Promise<void | import("../utils/previewFeatureUsage").GeometryCommitResult>;
  let pathOffsetCommit!: (
    selection: DomEditSelection,
    next: { x: number; y: number },
    route?: { plainTranslate?: boolean },
  ) => Promise<void | import("../utils/previewFeatureUsage").GeometryCommitResult>;
  let rotationCommit!: (
    selection: DomEditSelection,
    next: RotationCommit,
  ) => Promise<void | import("../utils/previewFeatureUsage").GeometryCommitResult>;
  function Harness() {
    const editing = useGsapAwareEditing({
      domEditSelection: null,
      selectedGsapAnimations: [],
      gsapCommitMutation,
      previewIframeRef: { current: null },
      showToast: vi.fn(),
      bumpGsapCache: vi.fn(),
      makeFetchFallback,
      trackGsapInteractionFailure,
      stageElementPositionOffset,
      handleDomBoxSizeCommit: vi.fn(),
      handleDomRotationCommit,
      commitPositionPatchToHtml: vi.fn(),
      addGsapAnimation: vi.fn(),
      convertToKeyframes: vi.fn(),
      setArcPath: vi.fn(),
      updateArcSegment: vi.fn(),
    });
    groupCommit = editing.handleGsapAwareGroupPathOffsetCommit;
    pathOffsetCommit = editing.handleGsapAwarePathOffsetCommit;
    rotationCommit = editing.handleGsapAwareRotationCommit;
    return null;
  }
  const root = mountReactHarness(<Harness />);
  return {
    groupCommit: (updates: DomEditGroupPathOffsetCommit[]) => groupCommit(updates),
    pathOffsetCommit: (
      selection: DomEditSelection,
      next: { x: number; y: number },
      route?: { plainTranslate?: boolean },
    ) => pathOffsetCommit(selection, next, route),
    rotationCommit: (selection: DomEditSelection, next: RotationCommit) =>
      rotationCommit(selection, next),
    root,
  };
}

describe("useGsapAwareEditing moves of an element GSAP does not position", () => {
  it("saves the move on the element itself, with no GSAP write and no animation read", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const stageElementPositionOffset = vi.fn(() => ({ save, rollback: vi.fn() }));
    const gsapCommitMutation = vi.fn();
    const makeFetchFallback = vi.fn();
    const { pathOffsetCommit, root } = mountGroupHandler({
      gsapCommitMutation,
      makeFetchFallback,
      stageElementPositionOffset,
    });
    const box = { element: document.createElement("div"), id: "box", selector: "#box" };
    await act(() => pathOffsetCommit(box as unknown as DomEditSelection, { x: 130.25, y: 90 }));
    expect(stageElementPositionOffset).toHaveBeenCalledWith(box, { x: 130.25, y: 90 }, true);
    expect(save).toHaveBeenCalledTimes(1);
    expect(gsapCommitMutation).not.toHaveBeenCalled();
    expect(makeFetchFallback).not.toHaveBeenCalled();
    expect(mocks.drag).not.toHaveBeenCalled();
    act(() => root.unmount());
  });
});

describe("useGsapAwareEditing keeps the route a gesture chose at press", () => {
  it.each([
    ["the CSS route, on an element GSAP has since taken over", true, () => gsapPositioned("div")],
    [
      "the GSAP route, on an element that now looks GSAP-free",
      false,
      () => document.createElement("div"),
    ],
  ])("%s", async (_, plainTranslate, makeElement) => {
    mocks.drag.mockResolvedValue({ status: "persisted" });
    const save = vi.fn().mockResolvedValue(undefined);
    const stageElementPositionOffset = vi.fn(() => ({ save, rollback: vi.fn() }));
    const { pathOffsetCommit, groupCommit, root } = mountGroupHandler({
      stageElementPositionOffset,
    });
    const box = {
      element: makeElement(),
      id: "box",
      selector: "#box",
    } as unknown as DomEditSelection;
    await act(() => pathOffsetCommit(box, { x: 40, y: 20 }, { plainTranslate }));
    await act(() => groupCommit([{ selection: box, next: { x: 40, y: 20 }, plainTranslate }]));
    expect(stageElementPositionOffset.mock.calls.length).toBe(plainTranslate ? 2 : 0);
    expect(mocks.drag.mock.calls.some((call) => call[0] === box)).toBe(!plainTranslate);
    act(() => root.unmount());
  });
});

describe("useGsapAwareEditing holds a canvas press while a drop saves", () => {
  it.each([
    ["a move through the script", false, "move"],
    ["a group move through the script", false, "group"],
    ["a move saved as CSS", true, "move"],
  ])("%s", async (_, plainTranslate, kind) => {
    let land: () => void = () => {};
    const landed = new Promise<void>((resolve) => (land = resolve));
    mocks.drag.mockImplementation(async () => {
      await landed;
      return { status: "persisted" };
    });
    const save = vi.fn().mockReturnValue(landed);
    const stageElementPositionOffset = vi.fn(() => ({ save, rollback: vi.fn() }));
    const { pathOffsetCommit, groupCommit, root } = mountGroupHandler({
      stageElementPositionOffset,
    });
    const box = { element: document.createElement("div"), id: "box", selector: "#box" };
    const selection = box as unknown as DomEditSelection;
    const to = { x: 40, y: 20 };
    let saved!: Promise<unknown>;
    act(() => {
      saved =
        kind === "group"
          ? groupCommit([{ selection, next: to, plainTranslate }])
          : pathOffsetCommit(selection, to, { plainTranslate });
    });
    expect(isPreviewChanging(), "from the drop").toBe(!plainTranslate);
    await act(async () => {
      land();
      await saved;
    });
    expect(isPreviewChanging()).toBe(false);
    act(() => root.unmount());
  });
});

describe("useGsapAwareEditing keeps the box route a resize chose at press", () => {
  it.each([
    ["the CSS route, on an element GSAP has since taken over", true],
    ["the GSAP route, on an element that now looks GSAP-free", false],
  ])("%s", async (_, plainTranslate) => {
    mocks.resize.mockResolvedValue({ status: "persisted" });
    const h = mountResizeHandler([], [], plainTranslate);
    const size = { width: 300, height: 200 };
    await act(() => h.resize(h.selection, size, undefined, vi.fn(), { plainTranslate }));
    expect(h.fallback).toHaveBeenCalledTimes(plainTranslate ? 1 : 0);
    expect(mocks.resize).toHaveBeenCalledTimes(plainTranslate ? 0 : 1);
    act(() => h.root.unmount());
  });
});

describe("useGsapAwareEditing refuses a group GSAP took over before writing any member", () => {
  it("writes no member when one CSS-route member has been folded since the press", async () => {
    const stageElementPositionOffset = vi.fn(() => ({ save: vi.fn(), rollback: vi.fn() }));
    const { groupCommit, root } = mountGroupHandler({ stageElementPositionOffset });
    const card = {
      element: document.createElement("div"),
      id: "card",
    } as unknown as DomEditSelection;
    const folded = Object.assign(document.createElement("div"), {
      _gsap: { renderTransform: () => {}, x: "94px", y: "66px" },
    });
    const box = { element: folded, id: "box" } as unknown as DomEditSelection;
    await expect(
      act(() =>
        groupCommit([
          { selection: card, next: { x: 1, y: 2 }, plainTranslate: true },
          { selection: box, next: { x: 1, y: 2 }, plainTranslate: true },
        ]),
      ),
    ).rejects.toThrow(/animation took over/);
    expect(stageElementPositionOffset).not.toHaveBeenCalled();
    act(() => root.unmount());
  });
});

describe("useGsapAwareEditing rotation routing", () => {
  function rotate(element: HTMLElement) {
    const handleDomRotationCommit = vi.fn().mockResolvedValue(undefined);
    const gsapCommitMutation = vi.fn();
    const h = mountGroupHandler({
      gsapCommitMutation,
      handleDomRotationCommit,
    });
    const box = { element, id: "box", selector: "#box" } as unknown as DomEditSelection;
    return { ...h, box, handleDomRotationCommit, gsapCommitMutation };
  }

  it("turns an element GSAP does not turn by the CSS writer, with no GSAP write", async () => {
    const h = rotate(document.createElement("div"));
    await act(() => h.rotationCommit(h.box, { angle: 55 }));
    expect(h.handleDomRotationCommit).toHaveBeenCalledWith(h.box, { angle: 55 });
    expect(tryGsapRotationIntercept).not.toHaveBeenCalled();
    expect(h.gsapCommitMutation).not.toHaveBeenCalled();
    act(() => h.root.unmount());
  });

  it("leaves an element a GSAP tween turns to the GSAP rotation route", async () => {
    vi.mocked(tryGsapRotationIntercept).mockResolvedValue({ status: "persisted" });
    const element = document.createElement("div");
    const h = rotate(element);
    const tween = { vars: { rotation: 30 }, targets: () => [element] };
    Object.assign(window, { __timelines: { main: { getChildren: () => [tween] } } });
    try {
      await act(() => h.rotationCommit(h.box, { angle: 55 }));
    } finally {
      delete (window as { __timelines?: unknown }).__timelines;
    }
    expect(tryGsapRotationIntercept).toHaveBeenCalledTimes(1);
    expect(h.handleDomRotationCommit).not.toHaveBeenCalled();
    act(() => h.root.unmount());
  });

  it("saves a turn the press sent down the GSAP route there, even once the element looks GSAP-free", async () => {
    vi.mocked(tryGsapRotationIntercept).mockResolvedValue({ status: "persisted" });
    const h = rotate(document.createElement("div"));
    await act(() => h.rotationCommit(h.box, { angle: 55, plain: null }));
    expect(tryGsapRotationIntercept).toHaveBeenCalledTimes(1);
    expect(h.handleDomRotationCommit).not.toHaveBeenCalled();
    act(() => h.root.unmount());
  });

  it("saves a turn the press drew as CSS by the CSS writer, even once a GSAP tween turns the element", async () => {
    const element = document.createElement("div");
    const h = rotate(element);
    const tween = { vars: { rotation: 30 }, targets: () => [element] };
    Object.assign(window, { __timelines: { main: { getChildren: () => [tween] } } });
    const plain = {
      property: "rotate",
      before: "",
      after: "",
      share: 0,
      sign: 1,
      inline: false,
    } as const;
    try {
      await act(() => h.rotationCommit(h.box, { angle: 55, plain }));
    } finally {
      delete (window as { __timelines?: unknown }).__timelines;
    }
    expect(h.handleDomRotationCommit).toHaveBeenCalledWith(h.box, { angle: 55, plain });
    expect(tryGsapRotationIntercept).not.toHaveBeenCalled();
    act(() => h.root.unmount());
  });
});

describe("useGsapAwareEditing shared-tween moves", () => {
  it("saves a single drag through the element's own offset", async () => {
    mocks.drag.mockResolvedValue({ status: "element-offset" });
    const save = vi.fn().mockResolvedValue(undefined);
    const stageElementPositionOffset = vi.fn(() => ({ save, rollback: vi.fn() }));
    const commitMutation = vi.fn();
    const { pathOffsetCommit, root } = mountGroupHandler({
      gsapCommitMutation: commitMutation,
      stageElementPositionOffset,
    });
    const word = { element: gsapPositioned("span"), hfId: "w0", selector: ".w" };
    await act(() => pathOffsetCommit(word as unknown as DomEditSelection, { x: 40, y: 20 }));
    expect(stageElementPositionOffset).toHaveBeenCalledWith(word, { x: 40, y: 20 }, false);
    expect(save).toHaveBeenCalledTimes(1);
    expect(commitMutation).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  it("saves shared-tween and GSAP-free group members on themselves, under the group key", async () => {
    mocks.drag.mockImplementation(async (selection, _next, _a, _i, commit, _f, options) => {
      if (selection.hfId === "w0") return { status: "element-offset" };
      if (!options?.preflightOnly) await commit(selection, { type: "move" }, { label: "Move" });
      return { status: "persisted" };
    });
    const save = vi.fn().mockResolvedValue(undefined);
    const stageElementPositionOffset = vi.fn(() => ({ save, rollback: vi.fn() }));
    const { groupCommit, root } = mountGroupHandler({ stageElementPositionOffset });
    const word = { element: gsapPositioned("span"), hfId: "w0", selector: ".w" };
    const box = { element: gsapPositioned("div"), id: "box", selector: "#box" };
    const plain = { element: document.createElement("div"), id: "plain", selector: "#plain" };
    await act(() =>
      groupCommit([
        { selection: word, next: { x: 40, y: 20 } },
        { selection: box, next: { x: 40, y: 20 } },
        { selection: plain, next: { x: 40, y: 20 } },
      ] as unknown as DomEditGroupPathOffsetCommit[]),
    );
    const groupKey = expect.stringMatching(/^group-drag:\d+$/);
    expect(stageElementPositionOffset).toHaveBeenCalledWith(
      word,
      { x: 40, y: 20 },
      false,
      groupKey,
    );
    expect(stageElementPositionOffset).toHaveBeenCalledWith(
      plain,
      { x: 40, y: 20 },
      true,
      groupKey,
    );
    expect(mocks.drag.mock.calls.some((call) => call[0] === plain)).toBe(false);
    act(() => root.unmount());
  });
});

describe("useGsapAwareEditing anchored resize", () => {
  it("uses the explicit target's animations instead of the human selection cache", async () => {
    const humanAnimation = { id: "human", propertyGroup: "scale" } as GsapAnimation;
    const targetAnimation = { id: "target", propertyGroup: "size" } as GsapAnimation;
    mocks.resize.mockResolvedValue({ status: "persisted" });
    const h = mountResizeHandler([humanAnimation], [targetAnimation]);
    const target = {
      ...h.selection,
      element: gsapPositioned("div"),
      id: "agent-target",
      selector: "#agent-target",
    } as DomEditSelection;

    await act(() => h.resize(target, { width: 300, height: 200 }));

    expect(mocks.resize).toHaveBeenCalledWith(
      target,
      { width: 300, height: 200 },
      [targetAnimation],
      null,
      expect.any(Function),
      expect.any(Function),
      undefined,
      expect.any(Function),
      expect.objectContaining({ frozen: true }),
    );
    act(() => h.root.unmount());
  });

  it("resizes a box GSAP does not own through the CSS writer, with no GSAP write or fetch", async () => {
    const h = mountResizeHandler([], [], false);
    const restore = vi.fn();
    await act(() =>
      h.resize(h.selection, { width: 300, height: 200 }, { x: -50.5, y: -25 }, restore),
    );
    expect(h.fallback).toHaveBeenCalledWith(
      h.selection,
      { width: 300, height: 200 },
      { x: -50.5, y: -25 },
      restore,
    );
    expect(mocks.resize).not.toHaveBeenCalled();
    expect(mocks.drag).not.toHaveBeenCalled();
    expect(h.commitMutation).not.toHaveBeenCalled();
    expect(h.fetchAnimations).not.toHaveBeenCalled();
    act(() => h.root.unmount());
  });

  it("fails a GSAP-owned resize loudly when there is no GSAP writer, never writing CSS", async () => {
    const h = mountResizeHandler([], [], true, false);
    const restore = vi.fn();
    await expect(
      act(() => h.resize(h.selection, { width: 300, height: 200 }, undefined, restore)),
    ).rejects.toThrow("no GSAP writer");
    expect(h.fallback).not.toHaveBeenCalled();
    expect(restore).toHaveBeenCalledTimes(1);
    act(() => h.root.unmount());
  });

  it("rejects a blocked resize instead of falling through to a competing DOM write", async () => {
    mocks.resize.mockResolvedValue({ status: "blocked", reason: "source-uneditable" });
    const h = mountResizeHandler([]);
    await expect(
      act(() => h.resize(h.selection, { width: 300, height: 200 }, { x: -50, y: -25 })),
    ).rejects.toMatchObject({ reason: "source-uneditable" });
    expect(h.fallback).not.toHaveBeenCalled();
    act(() => h.root.unmount());
  });

  it("persists the anchor exactly once through GSAP position when size route handles resize", async () => {
    mocks.resize.mockResolvedValue({ status: "persisted" });
    mocks.drag.mockResolvedValue({ status: "persisted" });
    const h = mountResizeHandler([]);
    await act(() => h.resize(h.selection, { width: 300, height: 200 }, { x: -50, y: -25 }));
    expect(h.fallback).not.toHaveBeenCalled();
    expect(mocks.drag).toHaveBeenCalledTimes(1);
    expect(mocks.drag.mock.calls[0]![1]).toEqual({ x: -50, y: -25 });
    act(() => h.root.unmount());
  });

  function resizeWritesSize() {
    mocks.resize.mockImplementation(async (selection, _next, _a, _i, commit) => {
      await commit(selection, { type: "size" }, { label: "Resize", softReload: true });
      return { status: "persisted" };
    });
    mocks.drag.mockResolvedValue({ status: "element-offset" });
  }

  it("saves a shared-tween word's anchor move after its size, under the resize's undo key", async () => {
    resizeWritesSize();
    const h = mountResizeHandler([]);
    await act(() => h.resize(h.selection, { width: 300, height: 200 }, { x: -50, y: -25 }));
    const key = h.commitMutation.mock.calls[0]![2].coalesceKey;
    expect(key).toMatch(/^tx:/);
    expect(h.elementOffset).toHaveBeenCalledWith(h.selection, { x: -50, y: -25 }, false, key);
    expect(h.anchorSave.mock.invocationCallOrder[0]).toBeGreaterThan(
      h.commitMutation.mock.invocationCallOrder[0]!,
    );
    act(() => h.root.unmount());
  });

  function mountCropped() {
    const h = mountResizeHandler([]);
    const el = withInlineLayoutBox(h.selection.element);
    el.id = "clip";
    el.style.cssText = "width: 300px; height: 200px; clip-path: inset(0px 60px 0px 0px)";
    document.body.append(el);
    const rect = { left: 0, top: 0, width: 300, height: 200, editScaleX: 1, editScaleY: 1 };
    const crop = mountReactHarness(
      <DomEditCropHandles selection={h.selection} overlayRect={rect} onStyleCommit={vi.fn()} />,
    );
    return { ...h, el, crop };
  }

  function resizeLandsWhen(where: "intercept" | "dispatch", h: { commitMutation: Mock }) {
    const land = (el: HTMLElement) => {
      el.style.width = "450px";
      el.style.height = "300px";
    };
    mocks.resize.mockImplementation(async (selection, _next, _a, _i, commit) => {
      if (where === "intercept") land(selection.element);
      await commit(selection, { type: "size" }, { label: "Resize", softReload: true });
      return { status: "persisted" };
    });
    if (where === "dispatch") h.commitMutation.mockImplementation(async (s) => land(s.element));
  }

  const scaled = "inset(0px 90px 0px 0px)";

  it("saves the crop scaled with a size that lands only when saved (the W/H fields)", async () => {
    const h = mountCropped();
    resizeLandsWhen("dispatch", h);
    await act(() => h.resize(h.selection, { width: 450, height: 300 }));

    expect(h.commitPatch).toHaveBeenCalledWith(
      h.selection,
      [{ type: "inline-style", property: "clip-path", value: scaled }],
      expect.objectContaining({ coalesceKey: h.commitMutation.mock.calls[0]![2].coalesceKey }),
    );
    act(() => h.crop.unmount());
    expect(h.el.style.getPropertyValue("clip-path")).toBe(scaled);
    act(() => h.root.unmount());
  });

  it("scales from the box before a draft its caller applied (the agent tool)", async () => {
    const h = mountCropped();
    resizeLandsWhen("intercept", h);
    applyStudioBoxSizeDraft(h.el, { width: 450, height: 300 });
    await act(() => h.resize(h.selection, { width: 450, height: 300 }));

    expect(h.commitPatch.mock.calls[0]![1]).toEqual([
      { type: "inline-style", property: "clip-path", value: scaled },
    ]);
    act(() => h.crop.unmount());
    act(() => h.root.unmount());
  });

  it("a W field on an animated element saves the scaled crop in the same undo step", async () => {
    const h = mountCropped();
    mocks.commitAnimatedProperties.mockImplementation(async (selection, _props, keyed) => {
      await (keyed ?? h.commitMutation)(selection, { type: "set" }, { label: "Edit width" });
      selection.element.style.width = "450px";
    });
    await act(() => h.property(h.selection, "width", 450));

    const key = h.commitMutation.mock.calls[0]![2].coalesceKey;
    expect(key).toBeTruthy();
    expect(h.commitPatch).toHaveBeenCalledWith(
      h.selection,
      [{ type: "inline-style", property: "clip-path", value: "inset(0px 90px 0px 0px)" }],
      expect.objectContaining({ coalesceKey: key }),
    );
    act(() => h.crop.unmount());
    act(() => h.root.unmount());
  });

  it("shows the scaled crop when deselected before the save lands", async () => {
    const h = mountCropped();
    resizeLandsWhen("intercept", h);
    const saved = h.resize(h.selection, { width: 450, height: 300 });
    act(() => h.crop.unmount());
    await act(() => saved);

    expect(h.el.style.getPropertyValue("clip-path")).toBe(scaled);
    act(() => h.root.unmount());
  });

  it("does not keep the anchor move when the size save fails", async () => {
    resizeWritesSize();
    const h = mountResizeHandler([]);
    h.commitMutation.mockRejectedValueOnce(new Error("size save failed"));
    await expect(
      act(() => h.resize(h.selection, { width: 300, height: 200 }, { x: -50, y: -25 })),
    ).rejects.toThrow("size save failed");
    expect(h.anchorSave).not.toHaveBeenCalled();
    expect(h.anchorRollback).toHaveBeenCalledTimes(1);
    act(() => h.root.unmount());
  });

  it("settles the live GSAP position before resize persistence reaches its first await", async () => {
    let resolveResize!: (outcome: { status: "persisted" }) => void;
    const pendingResize = new Promise<{ status: "persisted" }>((resolve) => {
      resolveResize = resolve;
    });
    mocks.resize.mockReturnValue(pendingResize);
    mocks.drag.mockResolvedValue({ status: "persisted" });
    mocks.readPosition.mockReturnValue({ x: 120.4, y: 80.2 });
    const h = mountResizeHandler([]);
    h.selection.element.setAttribute("data-hf-drag-gsap-base-x", "120.4");
    h.selection.element.setAttribute("data-hf-drag-gsap-base-y", "80.2");
    h.selection.element.setAttribute("data-hf-drag-initial-offset-x", "0");
    h.selection.element.setAttribute("data-hf-drag-initial-offset-y", "0");

    let commit!: Promise<void | import("../utils/previewFeatureUsage").GeometryCommitResult>;
    act(() => {
      commit = h.resize(h.selection, { width: 300, height: 200 }, { x: -50.2, y: -25.6 });
    });

    expect(mocks.setPosition).toHaveBeenCalledWith(h.selection.element, 70.2, 54.6);
    expect(mocks.setPosition.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.resize.mock.invocationCallOrder[0]!,
    );

    resolveResize({ status: "persisted" });
    await act(() => commit);
    act(() => h.root.unmount());
  });

  it("passes a transaction-scoped commit wrapper into the resize path", async () => {
    mocks.resize.mockImplementation(async (selection, _size, _animations, _iframe, commit) => {
      await commit(selection, { type: "resize" }, { label: "Resize", softReload: true });
      return { status: "persisted" };
    });
    const h = mountResizeHandler([]);

    await act(() => h.resize(h.selection, { width: 300, height: 200 }));

    expect(h.commitMutation).toHaveBeenCalledWith(
      h.selection,
      { type: "resize" },
      expect.objectContaining({
        coalesceKey: expect.stringMatching(/^tx:Resize layer:\d+$/),
        softReload: true,
      }),
    );
    act(() => h.root.unmount());
  });

  it("folds a group drag's member writes into one undo entry via a shared coalesceKey", async () => {
    const capturedKeys: Array<string | undefined> = [];
    mocks.drag.mockImplementation(
      async (
        selection: DomEditSelection,
        _next: unknown,
        _anims: unknown,
        _iframe: unknown,
        commit: (
          s: DomEditSelection,
          m: unknown,
          o: { coalesceKey?: string; label?: string; softReload?: boolean },
        ) => Promise<void | import("../utils/previewFeatureUsage").GeometryCommitResult>,
        _fetch: unknown,
        options?: { preflightOnly?: boolean },
      ) => {
        if (options?.preflightOnly) return { status: "persisted" };
        await commit(selection, { type: "move" }, { label: "Move", softReload: true });
        return { status: "persisted" };
      },
    );
    const commitMutation = vi.fn(
      (_s: DomEditSelection, _m: unknown, o: { coalesceKey?: string }) => {
        capturedKeys.push(o.coalesceKey);
        return Promise.resolve();
      },
    );
    const { groupCommit, root } = mountGroupHandler({
      gsapCommitMutation: commitMutation,
    });
    const updates = [
      {
        selection: { element: gsapPositioned("div"), id: "a", selector: "#a" },
        next: { x: 10, y: 10 },
      },
      {
        selection: { element: gsapPositioned("div"), id: "b", selector: "#b" },
        next: { x: 10, y: 10 },
      },
    ] as unknown as DomEditGroupPathOffsetCommit[];

    await act(() => groupCommit(updates));

    expect(capturedKeys).toHaveLength(2);
    expect(capturedKeys[0]).toMatch(/^group-drag:\d+$/);
    // Both members share ONE coalesceKey → they fold into a single undo entry.
    expect(capturedKeys[0]).toBe(capturedKeys[1]);
    act(() => root.unmount());
  });

  it("preflights every group member before the first mutation", async () => {
    const commitMutation = vi.fn().mockResolvedValue(undefined);
    const makeFetchFallback = vi.fn(() => vi.fn().mockResolvedValue([]));
    mocks.drag.mockImplementation(
      async (_selection, _next, _animations, _iframe, _commit, _fetch, options) => {
        if (options?.preflightOnly) {
          return _selection.id === "blocked"
            ? { status: "blocked", reason: "source-uneditable" }
            : { status: "persisted" };
        }
        await _commit(_selection, { type: "move" }, { label: "Move" });
        return { status: "persisted" };
      },
    );
    const { groupCommit, root } = mountGroupHandler({
      gsapCommitMutation: commitMutation,
      makeFetchFallback,
    });
    const updates = [
      {
        selection: { element: gsapPositioned("div"), id: "ok", selector: "#ok" },
        next: { x: 10, y: 10 },
      },
      {
        selection: {
          element: gsapPositioned("div"),
          id: "blocked",
          selector: "#blocked",
        },
        next: { x: 10, y: 10 },
      },
    ] as unknown as DomEditGroupPathOffsetCommit[];

    await expect(groupCommit(updates)).rejects.toMatchObject({
      name: "GsapEditBlockedError",
      reason: "source-uneditable",
    });
    expect(commitMutation).not.toHaveBeenCalled();
    expect(mocks.drag).toHaveBeenCalledTimes(2);
    expect(mocks.drag.mock.calls.map((call) => call[6])).toEqual([
      { preflightOnly: true, group: true },
      { preflightOnly: true, group: true },
    ]);
    expect(makeFetchFallback).toHaveBeenNthCalledWith(1, updates[0]!.selection, {
      failOnFetchError: true,
    });
    expect(makeFetchFallback).toHaveBeenNthCalledWith(2, updates[1]!.selection, {
      failOnFetchError: true,
    });
    act(() => root.unmount());
  });

  it("fails a group preflight closed when ownership cannot be fetched", async () => {
    const fetchError = new Error("parse endpoint unavailable");
    const commitMutation = vi.fn().mockResolvedValue(undefined);
    const { groupCommit, root } = mountGroupHandler({
      gsapCommitMutation: commitMutation,
      makeFetchFallback: () => vi.fn().mockRejectedValue(fetchError),
    });
    const updates = [
      {
        selection: { element: gsapPositioned("div"), id: "a", selector: "#a" },
        next: { x: 10, y: 10 },
      },
    ] as unknown as DomEditGroupPathOffsetCommit[];

    await expect(groupCommit(updates)).rejects.toBe(fetchError);
    expect(mocks.drag).not.toHaveBeenCalled();
    expect(commitMutation).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  it("reports only the first group preflight failure in input order", async () => {
    const failures = [new Error("first blocked"), new Error("second blocked")];
    const trackGsapInteractionFailure = vi.fn();
    const priorDragImplementation = mocks.drag.getMockImplementation();
    mocks.drag.mockImplementation(async (selection) => {
      throw selection.id === "a" ? failures[0] : failures[1];
    });
    const { groupCommit, root } = mountGroupHandler({ trackGsapInteractionFailure });
    const updates = [
      {
        selection: { element: gsapPositioned("div"), id: "a", selector: "#a" },
        next: { x: 10, y: 10 },
      },
      {
        selection: { element: gsapPositioned("div"), id: "b", selector: "#b" },
        next: { x: 20, y: 20 },
      },
    ] as unknown as DomEditGroupPathOffsetCommit[];

    await expect(groupCommit(updates)).rejects.toBe(failures[0]);
    expect(trackGsapInteractionFailure).toHaveBeenCalledOnce();
    expect(trackGsapInteractionFailure).toHaveBeenCalledWith(
      failures[0],
      updates[0]?.selection,
      "drag",
      "Move animated layer (group)",
      true,
    );
    mocks.drag.mockReset();
    if (priorDragImplementation) mocks.drag.mockImplementation(priorDragImplementation);
    act(() => root.unmount());
  });

  it("restores once when resize persistence fails", async () => {
    const error = new Error("resize failed");
    const restore = vi.fn();
    mocks.resize.mockRejectedValue(error);
    const h = mountResizeHandler([]);

    const commit = h.resize(h.selection, { width: 300, height: 200 }, undefined, restore);
    await expect(commit).rejects.toBe(error);
    expect(restore).toHaveBeenCalledTimes(1);
    act(() => h.root.unmount());
  });

  it("does not apply the anchor twice when the resize already settled the drop point", async () => {
    mocks.resize.mockResolvedValue({ status: "persisted", ownsDragOffset: true });
    const scale = { propertyGroup: "scale" } as GsapAnimation;
    const h = mountResizeHandler([scale]);
    await act(() => h.resize(h.selection, { width: 300, height: 200 }, { x: -50, y: -25 }));
    expect(mocks.drag).not.toHaveBeenCalled();
    expect(h.fallback).not.toHaveBeenCalled();
    act(() => h.root.unmount());
  });

  /**
   * The same element, and the resize says it did NOT settle the drop point.
   *
   * This is the shape that broke: an element whose scale is an instant hold has
   * a scale-group tween and still commits width/height. Reading the tweens said
   * "scale route, it settles its own position", so the offset was withheld,
   * nobody wrote it, and the element snapped back on every drag.
   */
  it("applies the anchor when the resize leaves the drop point to the caller", async () => {
    mocks.resize.mockResolvedValue({ status: "persisted" });
    mocks.drag.mockResolvedValue({ status: "persisted" });
    const scale = { propertyGroup: "scale" } as GsapAnimation;
    const h = mountResizeHandler([scale]);
    await act(() => h.resize(h.selection, { width: 300, height: 200 }, { x: -50, y: -25 }));
    expect(mocks.drag).toHaveBeenCalledTimes(1);
    act(() => h.root.unmount());
  });
});
