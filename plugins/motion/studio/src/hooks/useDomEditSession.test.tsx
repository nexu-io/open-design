// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { shouldUseSdkCutover } from "../utils/sdkCutover";
import type { PatchOperation } from "../utils/sourcePatcher";
import type { Composition } from "@hyperframes/sdk";
import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import type { DomEditSelection } from "../components/editor/domEditingTypes";
import type { TimelineElement } from "../player";
import type { UseDomEditSessionParams } from "./useDomEditSession";
import { makeSelection } from "./domSelectionTestHarness";
import { readTranslatePx } from "../components/editor/plainTranslate";

const styleOp = (property: string, value: string): PatchOperation => ({
  type: "inline-style",
  property,
  value,
});

const attrOp = (property: string, value: string): PatchOperation => ({
  type: "attribute",
  property,
  value,
});

describe("shouldUseSdkCutover", () => {
  it("returns false when flag is disabled", () => {
    expect(shouldUseSdkCutover(false, true, "hf-abc", [styleOp("color", "red")])).toBe(false);
  });

  it("returns false when no SDK session", () => {
    expect(shouldUseSdkCutover(true, false, "hf-abc", [styleOp("color", "red")])).toBe(false);
  });

  it("returns false when selection has no hfId", () => {
    expect(shouldUseSdkCutover(true, true, null, [styleOp("color", "red")])).toBe(false);
    expect(shouldUseSdkCutover(true, true, undefined, [styleOp("color", "red")])).toBe(false);
  });

  it("returns false when ops array is empty", () => {
    expect(shouldUseSdkCutover(true, true, "hf-abc", [])).toBe(false);
  });

  it("returns true when all conditions met with supported op types", () => {
    expect(shouldUseSdkCutover(true, true, "hf-abc", [styleOp("color", "red")])).toBe(true);
    expect(
      shouldUseSdkCutover(true, true, "hf-abc", [styleOp("color", "red"), attrOp("data-x", "1")]),
    ).toBe(true);
  });
});

// ── onReorderShadow source filter (Fix 3) ────────────────────────────────────
//
// useDomEditSession composes ~9 sub-hooks; the only one relevant to this fix is
// useDomEditCommits, which receives the onReorderShadow callback built inline.
// Every other sub-hook is stubbed to a minimal shape so the hook under test can
// render without pulling in unrelated preview/GSAP/selection machinery.

const recordResolverParity = vi.fn<(...args: unknown[]) => Promise<void>>(async () => {});
const capturedOnReorderShadow: { fn: ((targets: string[]) => void) | undefined } = {
  fn: undefined,
};
const domEditSelectionRef: { current: DomEditSelection | null } = { current: null };
const domEditGroupSelectionsRef: { current: DomEditSelection[] } = { current: [] };
const groupSelectionSpy = vi.fn();
const gsapCommitMutation = Object.assign(vi.fn(), { batch: vi.fn() });
const neverParsed = new Promise<{ animations: GsapAnimation[] }>(() => undefined);
const parsedFile = { current: neverParsed };
const groupCommitSpy = vi.fn(async () => {});

function createSessionParams(
  overrides: Partial<UseDomEditSessionParams> = {},
): UseDomEditSessionParams {
  return {
    projectId: "proj-1",
    activeCompPath: "index.html",
    compIdToSrc: new Map(),
    captionEditMode: false,
    compositionLoading: false,
    previewIframeRef: { current: null },
    timelineElements: [],
    getTimelineSelectionSet: () => new Set(),
    setSelectedTimelineElementId: vi.fn(),
    setTimelineSelectionSet: vi.fn(),
    setRightCollapsed: vi.fn(),
    setRightPanelTab: vi.fn(),
    showToast: vi.fn(),
    refreshPreviewDocumentVersion: vi.fn(),
    queueDomEditSave: async <T,>(save: () => Promise<T>) => save(),
    readProjectFile: async () => "",
    writeProjectFile: async () => {},
    updateEditingFileContent: vi.fn(),
    editHistory: { recordEdit: async () => {} },
    fileTree: [],
    importedFontAssetsRef: { current: [] },
    projectDir: null,
    projectIdRef: { current: "proj-1" },
    previewIframe: null,
    refreshKey: 0,
    previewDocumentVersion: 0,
    rightPanelTab: "design",
    applyStudioManualEditsToPreviewRef: { current: async () => {} },
    syncPreviewHotkeys: vi.fn(),
    reloadPreview: vi.fn(),
    setRefreshKey: vi.fn(),
    handleTimelineElementsDelete: vi.fn(),
    readOnlyPreview: false,
    ...overrides,
  };
}

vi.mock("../utils/sdkResolverShadow", () => ({
  runResolverShadow: vi.fn(),
  recordResolverParity: (...args: unknown[]) => recordResolverParity(...args),
}));
const handleDomEditElementsDeleteMock = vi.fn(async () => ({ ok: true }) as const);
vi.mock("./useDomEditCommits", () => ({
  useDomEditCommits: (params: { onReorderShadow?: (targets: string[]) => void }) => {
    capturedOnReorderShadow.fn = params.onReorderShadow;
    return {
      resolveImportedFontAsset: vi.fn(),
      handleDomStyleCommit: vi.fn(),
      handleDomAttributeCommit: vi.fn(),
      handleDomAttributeLiveCommit: vi.fn(),
      handleDomHtmlAttributeCommit: vi.fn(),
      handleDomTextCommit: vi.fn(),
      handleDomTextFieldStyleCommit: vi.fn(),
      handleDomAddTextField: vi.fn(),
      handleDomRemoveTextField: vi.fn(),
      handleDomBoxSizeCommit: vi.fn(),
      handleDomManualEditsReset: vi.fn(),
      handleDomEditElementsDelete: handleDomEditElementsDeleteMock,
      handleDomZIndexReorderCommit: vi.fn(),
    };
  },
}));
const iframesHandedOn: Array<{ hook: string; iframe: unknown }> = [];
vi.mock("./useDomSelection", () => ({
  useDomSelection: ({ previewIframe }: { previewIframe: unknown }) => {
    iframesHandedOn.push({ hook: "selection", iframe: previewIframe });
    return {
      domEditSelection: domEditSelectionRef.current,
      domEditGroupSelections: [],
      domEditHoverSelection: null,
      activeGroupElement: null,
      domEditSelectionRef,
      domEditGroupSelectionsRef,
      setActiveGroupElement: vi.fn(),
      applyDomSelection: vi.fn(),
      clearDomSelection: vi.fn(),
      buildDomSelectionFromTarget: vi.fn(),
      resolveDomSelectionFromPreviewPoint: vi.fn(),
      resolveAllDomSelectionsFromPreviewPoint: vi.fn(),
      updateDomEditHoverSelection: vi.fn(),
      buildDomSelectionForTimelineElement: vi.fn(),
      handleTimelineElementSelect: vi.fn(),
      refreshDomEditSelectionFromPreview: vi.fn(),
      applyMarqueeSelection: vi.fn(),
    };
  },
}));
vi.mock("./useAskAgentModal", () => ({
  useAskAgentModal: () => ({
    agentModalOpen: false,
    agentModalAnchorPoint: null,
    copiedAgentPrompt: null,
    agentPromptSelectionContext: null,
    setAgentModalOpen: vi.fn(),
    setAgentPromptSelectionContext: vi.fn(),
    setAgentModalAnchorPoint: vi.fn(),
    handleAskAgent: vi.fn(),
    handleAgentModalSubmit: vi.fn(),
  }),
}));
vi.mock("./useStudioSelectionPublisher", () => ({
  useStudioSelectionPublisher: () => {},
}));
vi.mock("./keyframeCacheAstLoad", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./keyframeCacheAstLoad")>()),
  fetchParsedAnimations: () => parsedFile.current,
}));
vi.mock("./useGsapTweenCache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./useGsapTweenCache")>()),
  useGsapCacheVersion: () => ({ version: 0, bump: vi.fn() }),
}));
vi.mock("./useGsapScriptCommits", () => ({
  useGsapScriptCommits: () => ({
    commitMutation: gsapCommitMutation,
    updateGsapProperty: vi.fn(),
    updateGsapMeta: vi.fn(),
    deleteGsapAnimation: vi.fn(),
    deleteAllForSelector: vi.fn(),
    addGsapAnimation: vi.fn(),
    addGsapProperty: vi.fn(),
    removeGsapProperty: vi.fn(),
    updateGsapFromProperty: vi.fn(),
    addGsapFromProperty: vi.fn(),
    removeGsapFromProperty: vi.fn(),
    addKeyframe: vi.fn(),
    addKeyframeBatch: vi.fn(),
    removeKeyframe: vi.fn(),
    moveKeyframe: vi.fn(),
    resizeKeyframedTween: vi.fn(),
    convertToKeyframes: vi.fn(),
    removeAllKeyframes: vi.fn(),
    setArcPath: vi.fn(),
    updateArcSegment: vi.fn(),
  }),
}));
vi.mock("./useGroupCommits", () => ({
  useGroupCommits: () => ({
    groupSelection: (...args: unknown[]) => groupSelectionSpy(...args),
    ungroupSelection: vi.fn(),
  }),
}));
vi.mock("./useDomEditWiring", () => ({
  useDomEditWiring: ({ previewIframe }: { previewIframe: unknown }) => {
    iframesHandedOn.push({ hook: "wiring", iframe: previewIframe });
    return {
      onClickToSource: vi.fn(),
      selectedGsapAnimations: [],
      gsapMultipleTimelines: false,
      gsapUnsupportedTimelinePattern: false,
      trackGsapInteractionFailure: vi.fn(),
      makeFetchFallback: vi.fn(),
      handleGsapUpdateProperty: vi.fn(),
      handleGsapUpdateMeta: vi.fn(),
      handleGsapDeleteAnimation: vi.fn(),
      handleGsapDeleteAllForElement: vi.fn(),
      handleGsapAddAnimation: vi.fn(),
      handleGsapAddProperty: vi.fn(),
      handleGsapRemoveProperty: vi.fn(),
      handleGsapUpdateFromProperty: vi.fn(),
      handleGsapAddFromProperty: vi.fn(),
      handleGsapRemoveFromProperty: vi.fn(),
      handleGsapAddKeyframe: vi.fn(),
      handleGsapAddKeyframeBatch: vi.fn(),
      handleGsapRemoveKeyframe: vi.fn(),
      handleGsapMoveKeyframeToPlayhead: vi.fn(),
      handleGsapMoveKeyframe: vi.fn(),
      handleGsapResizeKeyframedTween: vi.fn(),
      handleGsapConvertToKeyframes: vi.fn(),
      handleGsapRemoveAllKeyframes: vi.fn(),
      handleResetSelectedElementKeyframes: vi.fn(),
    };
  },
}));
vi.mock("./usePreviewInteraction", () => ({
  usePreviewInteraction: () => ({
    handlePreviewCanvasMouseDown: vi.fn(),
    handlePreviewCanvasPointerMove: vi.fn(),
    handlePreviewCanvasPointerLeave: vi.fn(),
    handleBlockedDomMove: vi.fn(),
    handleDomManualDragStart: vi.fn(),
  }),
}));
vi.mock("./useGsapAwareEditing", () => ({
  useGsapAwareEditing: () => ({
    handleGsapAwarePathOffsetCommit: vi.fn(),
    handleGsapAwareGroupPathOffsetCommit: groupCommitSpy,
    handleGsapAwareBoxSizeCommit: vi.fn(),
    handleGsapAwareRotationCommit: vi.fn(),
    commitAnimatedProperty: vi.fn(),
    commitAnimatedProperties: vi.fn(),
    handleSetArcPath: vi.fn(),
    handleUpdateArcSegment: vi.fn(),
    handleUnroll: vi.fn(),
    commitMutation: vi.fn(),
  }),
}));

// Tell React this is an act-capable environment so act(...) flushes effects.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("onReorderShadow source filter", () => {
  it("passes a readSource function as the 4th recordResolverParity argument when sdkSession and activeCompPath are set", async () => {
    const { useDomEditSession } = await import("./useDomEditSession");
    const readProjectFile = vi.fn(async (path: string) => `content of ${path}`);
    // Minimal opaque test double: no sub-hook under test actually calls into the
    // session (useDomEditCommits and recordResolverParity are both mocked above),
    // so it only needs to flow through as a reference.
    const sdkSession = {} as unknown as Composition;

    function Probe() {
      const params = createSessionParams({
        queueDomEditSave: vi.fn(async <T,>(save: () => Promise<T>) => save()) as <T>(
          save: () => Promise<T>,
        ) => Promise<T>,
        readProjectFile,
        writeProjectFile: vi.fn(async () => {}),
        editHistory: { recordEdit: vi.fn(async () => {}) },
        sdkSession,
        forceReloadSdkSession: vi.fn(),
      });
      useDomEditSession(params);
      return null;
    }

    const container = document.createElement("div");
    const root = createRoot(container);
    act(() => {
      root.render(<Probe />);
    });
    try {
      expect(capturedOnReorderShadow.fn).toBeTypeOf("function");
      capturedOnReorderShadow.fn?.(["hf-target"]);
      expect(recordResolverParity).toHaveBeenCalledWith(
        sdkSession,
        "hf-target",
        "reorderElements",
        expect.any(Function),
      );
    } finally {
      act(() => root.unmount());
    }
  });
});

describe("bulk segment ease commits", () => {
  it("uses one ordered batch for many ids and sane paths for one or no ids", async () => {
    const { useDomEditSession } = await import("./useDomEditSession");
    const hero = document.createElement("div");
    hero.id = "hero";
    const selection = makeSelection("Hero", hero);
    domEditSelectionRef.current = selection;
    gsapCommitMutation.mockClear();
    gsapCommitMutation.batch.mockClear();
    let updateSegmentEase:
      | ((targets: Array<{ animationId: string; tweenPercentage: number }>, ease: string) => void)
      | undefined;

    function Probe() {
      const params = createSessionParams();
      updateSegmentEase = useDomEditSession(params).handleUpdateSegmentEase;
      return null;
    }

    const container = document.createElement("div");
    const root = createRoot(container);
    act(() => root.render(<Probe />));
    try {
      expect(updateSegmentEase).toBeTypeOf("function");
      if (!updateSegmentEase) return;
      const options = { label: "Update segment ease", softReload: true };
      const targets = [
        { animationId: "move-x", tweenPercentage: 20 },
        { animationId: "move-y", tweenPercentage: 50 },
        { animationId: "fade", tweenPercentage: 80 },
      ];
      updateSegmentEase(targets, "power2.inOut");

      expect(gsapCommitMutation).not.toHaveBeenCalled();
      expect(gsapCommitMutation.batch).toHaveBeenCalledTimes(1);
      expect(gsapCommitMutation.batch).toHaveBeenCalledWith(
        targets.map(({ animationId, tweenPercentage }) => ({
          selection,
          mutation: {
            type: "update-keyframe",
            animationId,
            percentage: tweenPercentage,
            properties: {},
            ease: "power2.inOut",
          },
          options,
        })),
        options,
      );

      gsapCommitMutation.mockClear();
      gsapCommitMutation.batch.mockClear();
      updateSegmentEase([{ animationId: "fade", tweenPercentage: 25 }], "none");
      expect(gsapCommitMutation).toHaveBeenCalledTimes(1);
      expect(gsapCommitMutation).toHaveBeenCalledWith(
        selection,
        {
          type: "update-keyframe",
          animationId: "fade",
          percentage: 25,
          properties: {},
          ease: "none",
        },
        { label: "Update keyframe ease", softReload: true },
      );
      expect(gsapCommitMutation.batch).not.toHaveBeenCalled();

      gsapCommitMutation.mockClear();
      updateSegmentEase([], "linear");
      expect(gsapCommitMutation).not.toHaveBeenCalled();
      expect(gsapCommitMutation.batch).not.toHaveBeenCalled();

      // A commit with no batch transport (a wrapped one, e.g. inside a gesture
      // transaction) must still write every tween. Optional-chaining the batch
      // call would drop the whole edit here and report nothing.
      gsapCommitMutation.mockClear();
      const restoreBatch = gsapCommitMutation.batch;
      Reflect.deleteProperty(gsapCommitMutation, "batch");
      try {
        updateSegmentEase(targets, "power1.in");
        expect(gsapCommitMutation).toHaveBeenCalledTimes(targets.length);
      } finally {
        gsapCommitMutation.batch = restoreBatch;
      }
    } finally {
      domEditSelectionRef.current = null;
      act(() => root.unmount());
    }
  });
});

describe("the session hands out selections narrowed to what the GSAP commit accepts", () => {
  it("closes the move of a helper-loop element once its preflight lands", async () => {
    const { useDomEditSession } = await import("./useDomEditSession");
    domEditSelectionRef.current = {
      id: "hero",
      selector: "#hero",
      element: document.createElement("div"),
      sourceFile: "index.html",
      capabilities: {
        canApplyManualOffset: true,
        canApplyManualSize: true,
        canApplyManualRotation: true,
      },
    } as unknown as DomEditSelection;
    const loop = { targetSelector: "#hero", properties: { x: 100 }, provenance: { kind: "loop" } };
    parsedFile.current = Promise.resolve({ animations: [loop as unknown as GsapAnimation] });
    const seen: { selection?: DomEditSelection | null } = {};
    function Probe() {
      seen.selection = useDomEditSession(createSessionParams()).domEditSelection;
      return null;
    }
    const root = createRoot(document.createElement("div"));
    try {
      act(() => root.render(<Probe />));
      expect(seen.selection?.capabilities.canApplyManualOffset).toBe(false);
      await act(async () => {
        for (let tick = 0; tick < 10; tick++) await Promise.resolve();
      });
      expect(seen.selection?.capabilities).toMatchObject({
        canApplyManualOffset: false,
        canApplyManualSize: true,
        canApplyManualRotation: true,
        reasonIfDisabled: expect.stringContaining("helper or loop"),
      });
    } finally {
      domEditSelectionRef.current = null;
      parsedFile.current = neverParsed;
      act(() => root.unmount());
    }
  });
});

// ── Grouping refuses audio ───────────────────────────────────────────────────
//
// A layout group is a positioned wrapper: it takes the members' bounding box,
// rebases each child's left/top against it and adopts the topmost z-index. An
// <audio> clip has no box — offsetWidth/Height are 0 — so this produced a 0x0
// div with inline left/top on elements that are never laid out. Enforced here
// rather than only by hiding the button, because the G shortcut routes through
// the same handler and no hidden button can gate a keystroke.

describe("handleGroupSelection with audio in the selection", () => {
  const sel = (tag: string): DomEditSelection =>
    ({
      id: tag,
      element: document.createElement(tag),
      sourceFile: "index.html",
    }) as unknown as DomEditSelection;

  async function group(members: DomEditSelection[]) {
    const { useDomEditSession } = await import("./useDomEditSession");
    groupSelectionSpy.mockClear();
    domEditGroupSelectionsRef.current = members;
    const showToast = vi.fn();
    const captured: { fn?: () => void } = {};
    function Probe() {
      captured.fn = useDomEditSession(createSessionParams({ showToast })).handleGroupSelection;
      return null;
    }
    const root = createRoot(document.createElement("div"));
    act(() => root.render(<Probe />));
    act(() => captured.fn?.());
    act(() => root.unmount());
    domEditGroupSelectionsRef.current = [];
    return { showToast };
  }

  it("refuses a selection of audio clips, and says where grouping audio lives", async () => {
    const { showToast } = await group([sel("audio"), sel("audio")]);
    expect(groupSelectionSpy).not.toHaveBeenCalled();
    expect(String(showToast.mock.calls[0]?.[0])).toContain("bus");
  });

  it("refuses a mixed selection, since the wrapper would take the audio in too", async () => {
    const { showToast } = await group([sel("div"), sel("audio")]);
    expect(groupSelectionSpy).not.toHaveBeenCalled();
    expect(String(showToast.mock.calls[0]?.[0])).toContain("layout");
  });

  it("still groups a selection of layout elements", async () => {
    await group([sel("div"), sel("span")]);
    expect(groupSelectionSpy).toHaveBeenCalledTimes(1);
  });
});

// ── Delete routing: a timeline row goes through the timeline's own delete op ──

describe("handleDomEditElementDelete routing", () => {
  const domSel = (id: string): DomEditSelection =>
    ({
      id,
      element: document.createElement("div"),
      sourceFile: "index.html",
    }) as unknown as DomEditSelection;

  async function deleteViaSession(
    selection: DomEditSelection,
    timelineElements: TimelineElement[],
    options?: { expandGroup?: boolean; group?: DomEditSelection[] },
  ) {
    const { useDomEditSession } = await import("./useDomEditSession");
    handleDomEditElementsDeleteMock.mockClear();
    domEditGroupSelectionsRef.current = options?.group ?? [];
    const handleTimelineElementsDelete = vi.fn(async () => {});
    const captured: {
      fn?: (selection: DomEditSelection, options?: { expandGroup?: boolean }) => Promise<void>;
    } = {};
    function Probe() {
      captured.fn = useDomEditSession(
        createSessionParams({ timelineElements, handleTimelineElementsDelete }),
      ).handleDomEditElementDelete;
      return null;
    }
    const root = createRoot(document.createElement("div"));
    act(() => root.render(<Probe />));
    await act(async () => captured.fn?.(selection, { expandGroup: options?.expandGroup }));
    act(() => root.unmount());
    domEditGroupSelectionsRef.current = [];
    return { handleTimelineElementsDelete };
  }

  it("hands a selection that IS a timeline row to the timeline delete op, not the REST path", async () => {
    const clip = {
      id: "clip-a",
      domId: "clip-a",
      sourceFile: "index.html",
      tag: "video",
      start: 0,
      duration: 2,
      track: 0,
    } as TimelineElement;
    const { handleTimelineElementsDelete } = await deleteViaSession(domSel("clip-a"), [clip]);
    expect(handleTimelineElementsDelete).toHaveBeenCalledWith([clip]);
    expect(handleDomEditElementsDeleteMock).not.toHaveBeenCalled();
  });

  it("falls through to the REST path for a selection with no timeline row of its own", async () => {
    const { handleTimelineElementsDelete } = await deleteViaSession(domSel("nested-child"), []);
    expect(handleTimelineElementsDelete).not.toHaveBeenCalled();
    expect(handleDomEditElementsDeleteMock).toHaveBeenCalledWith([domSel("nested-child")]);
  });

  it("expands a multi-member marquee group to the timeline op when every member resolves", async () => {
    const clipA = {
      id: "clip-a",
      domId: "clip-a",
      sourceFile: "index.html",
      tag: "video",
      start: 0,
      duration: 2,
      track: 0,
    } as TimelineElement;
    const clipB = {
      id: "clip-b",
      domId: "clip-b",
      sourceFile: "index.html",
      tag: "video",
      start: 2,
      duration: 2,
      track: 0,
    } as TimelineElement;
    const group = [domSel("clip-a"), domSel("clip-b")];
    const { handleTimelineElementsDelete } = await deleteViaSession(group[0], [clipA, clipB], {
      expandGroup: true,
      group,
    });
    expect(handleTimelineElementsDelete).toHaveBeenCalledWith([clipA, clipB]);
    expect(handleDomEditElementsDeleteMock).not.toHaveBeenCalled();
  });
});

describe("a shadow reload promoted without a host re-render", () => {
  it("hands the promoted iframe to the session's selection and preview sync", async () => {
    const { useDomEditSession } = await import("./useDomEditSession");
    const { announcePreviewPromoted } = await import("../player/sceneSwap");
    const [host, promoted] = [0, 1].map(() => document.createElement("iframe"));
    function Probe() {
      useDomEditSession(createSessionParams({ previewIframe: host! }));
      return null;
    }
    const root = createRoot(document.createElement("div"));
    act(() => root.render(<Probe />));
    act(() => announcePreviewPromoted({ retired: host!, live: promoted! }));
    const last = (hook: string) => iframesHandedOn.findLast((seen) => seen.hook === hook)?.iframe;
    expect(last("selection")).toBe(promoted);
    expect(last("wiring")).toBe(promoted);
    act(() => root.unmount());
  });
});

describe("handleDomGroupMoveBy", () => {
  it("saves through the group drag's commit, leaving a refusal for the host to explain", async () => {
    const { useDomEditSession } = await import("./useDomEditSession");
    const element = document.createElement("div");
    document.body.append(element);
    element.getBoundingClientRect = () => {
      const { x, y } = readTranslatePx(element);
      return new DOMRect(x, y, 40, 20);
    };
    const selection = makeSelection("card", element);
    let moveBy!: ReturnType<typeof useDomEditSession>["handleDomGroupMoveBy"];
    function Probe() {
      moveBy = useDomEditSession(createSessionParams()).handleDomGroupMoveBy;
      return null;
    }
    const root = createRoot(document.createElement("div"));
    act(() => root.render(<Probe />));
    await act(() => moveBy([{ selection, delta: { x: 10, y: 0 } }]));
    expect(groupCommitSpy).toHaveBeenCalledWith(
      [{ selection, next: { x: 10, y: 0 }, plainTranslate: true }],
      { refusalToast: false },
    );
    act(() => root.unmount());
    element.remove();
  });
});
