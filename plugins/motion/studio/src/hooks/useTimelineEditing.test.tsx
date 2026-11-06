// fallow-ignore-file code-duplication
// @vitest-environment happy-dom

import React, { act, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { openComposition } from "@hyperframes/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePlayerStore, type TimelineElement } from "../player";
import { jsonResponse, requestUrl } from "./fetchStubTestUtils";
import { useElementLifecycleOps } from "./useElementLifecycleOps";
import { useTimelineEditing } from "./useTimelineEditing";
import {
  buildMissingCompositionElements,
  createTimelineElementFromManifestClip,
  parseTimelineFromDOM,
} from "../player/lib/timelineDOM";
import type { ClipManifestClip, IframeWindow } from "../player/lib/playbackTypes";
import { computeResizePreview } from "../player/components/timelineClipDragPreview";
import {
  buildTimelineGroupResizeMembers,
  resolveTimelineGroupResizeChanges,
} from "../player/components/timelineGroupEditing";
import { createRuntimeStartTimeResolver } from "@hyperframes/core/runtime/start-resolver";
import {
  scalePositionsInScript,
  shiftPositionsInScript,
} from "@hyperframes/core/gsap-writer-acorn";

vi.mock("../components/editor/manualEditingAvailability", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../components/editor/manualEditingAvailability")>();
  return {
    ...actual,
    STUDIO_SDK_CUTOVER_ENABLED: true,
    STUDIO_SDK_CUTOVER_FAMILIES: new Set(["timing"]),
    STUDIO_SDK_RESOLVER_SHADOW_ENABLED: false,
  };
});

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type ZIndexEntry = {
  element: HTMLElement;
  zIndex: number;
  id?: string;
  selector?: string;
  selectorIndex?: number;
  sourceFile: string;
};

afterEach(() => {
  document.body.innerHTML = "";
  usePlayerStore.getState().reset();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function createPreviewIframe(
  clips: Array<{
    id: string;
    track: number;
    style?: string;
  }> = [
    { id: "front", track: 0 },
    { id: "back", track: 1 },
  ],
): HTMLIFrameElement {
  const iframe = document.createElement("iframe");
  document.body.append(iframe);
  const doc = iframe.contentDocument;
  if (!doc) throw new Error("Expected iframe document");
  doc.body.innerHTML = clips
    .map(
      (clip) =>
        `<div id="${clip.id}" data-start="0" data-duration="2" data-track-index="${clip.track}"${
          clip.style ? ` style="${clip.style}"` : ""
        }></div>`,
    )
    .join("\n");
  return iframe;
}

function timelineElement(input: {
  id: string;
  track: number;
  zIndex: number;
  tag?: string;
  start?: number;
  duration?: number;
  sourceFile?: string;
}): TimelineElement {
  return {
    id: input.id,
    domId: input.id,
    hfId: `hf-${input.id}`,
    tag: input.tag ?? "div",
    start: input.start ?? 0,
    duration: input.duration ?? 2,
    track: input.track,
    zIndex: input.zIndex,
    stackingContextId: "root",
    parentCompositionId: null,
    compositionAncestors: ["root"],
    sourceFile: input.sourceFile ?? "index.html",
  };
}

/** Mount a harness component under act() and return its unmount hook. */
function mountHarness(node: React.ReactElement): { unmount: () => void } {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => {
    root.render(node);
  });
  return {
    unmount: () => {
      act(() => root.unmount());
    },
  };
}

function renderTimelineEditingHook(input: {
  timelineElements: TimelineElement[];
  iframe: HTMLIFrameElement;
  onZIndexCommit: (entries: ZIndexEntry[]) => Promise<void>;
  projectId?: string | null;
  writeProjectFile?: (path: string, content: string) => Promise<void>;
  recordEdit?: (input: {
    label: string;
    coalesceKey?: string;
    files: Record<string, { before: string; after: string }>;
  }) => Promise<void>;
  reloadPreview?: () => void;
  sdkSession?: Awaited<ReturnType<typeof openComposition>> | null;
  publishSdkSession?: NonNullable<Parameters<typeof useTimelineEditing>[0]["publishSdkSession"]>;
  forceReloadSdkSession?: () => void;
  invalidateGsapCache?: () => void;
  showToast?: (message: string, kind?: string) => void;
  canEdit?: NonNullable<Parameters<typeof useTimelineEditing>[0]["canEdit"]>;
  activeCompPath?: string;
}): {
  move: ReturnType<typeof useTimelineEditing>["handleTimelineElementMove"];
  resize: ReturnType<typeof useTimelineEditing>["handleTimelineElementResize"];
  groupMove: ReturnType<typeof useTimelineEditing>["handleTimelineGroupMove"];
  groupResize: ReturnType<typeof useTimelineEditing>["handleTimelineGroupResize"];
  del: ReturnType<typeof useTimelineEditing>["handleTimelineElementDelete"];
  elementsDelete: ReturnType<typeof useTimelineEditing>["handleTimelineElementsDelete"];
  handleAutoGroupCarveSources: ReturnType<typeof useTimelineEditing>["handleAutoGroupCarveSources"];
  setAudioGroupAttribute: ReturnType<typeof useTimelineEditing>["setAudioGroupAttribute"];
  setElementFxAttribute: ReturnType<typeof useTimelineEditing>["setElementFxAttribute"];
  unmount: () => void;
} {
  let move: ReturnType<typeof useTimelineEditing>["handleTimelineElementMove"] | null = null;
  let resize: ReturnType<typeof useTimelineEditing>["handleTimelineElementResize"] | null = null;
  let groupMove: ReturnType<typeof useTimelineEditing>["handleTimelineGroupMove"] | null = null;
  let groupResize: ReturnType<typeof useTimelineEditing>["handleTimelineGroupResize"] | null = null;
  let del: ReturnType<typeof useTimelineEditing>["handleTimelineElementDelete"] | null = null;
  let elementsDelete: ReturnType<typeof useTimelineEditing>["handleTimelineElementsDelete"] | null =
    null;
  let handleAutoGroupCarveSources:
    | ReturnType<typeof useTimelineEditing>["handleAutoGroupCarveSources"]
    | null = null;
  let setAudioGroupAttribute:
    | ReturnType<typeof useTimelineEditing>["setAudioGroupAttribute"]
    | null = null;
  let latest: ReturnType<typeof useTimelineEditing> | null = null;

  function Harness() {
    const commitRef = useRef(input.onZIndexCommit);
    commitRef.current = input.onZIndexCommit;
    const hook = useTimelineEditing({
      projectId: input.projectId ?? null,
      activeCompPath: input.activeCompPath ?? "index.html",
      timelineElements: input.timelineElements,
      showToast: input.showToast ?? vi.fn(),
      writeProjectFile: input.writeProjectFile ?? vi.fn(),
      recordEdit: input.recordEdit ?? vi.fn(),
      reloadPreview: input.reloadPreview ?? vi.fn(),
      previewIframeRef: { current: input.iframe },
      pendingTimelineEditPathRef: { current: new Set<string>() },
      uploadProjectFiles: vi.fn(),
      sdkSession: input.sdkSession,
      publishSdkSession: input.publishSdkSession,
      forceReloadSdkSession: input.forceReloadSdkSession,
      invalidateGsapCache: input.invalidateGsapCache,
      handleDomZIndexReorderCommitRef: commitRef,
      canEdit: input.canEdit,
    });
    move = hook.handleTimelineElementMove;
    resize = hook.handleTimelineElementResize;
    groupMove = hook.handleTimelineGroupMove;
    groupResize = hook.handleTimelineGroupResize;
    del = hook.handleTimelineElementDelete;
    elementsDelete = hook.handleTimelineElementsDelete;
    handleAutoGroupCarveSources = hook.handleAutoGroupCarveSources;
    setAudioGroupAttribute = hook.setAudioGroupAttribute;
    latest = hook;
    return null;
  }

  const { unmount } = mountHarness(<Harness />);
  if (!move) throw new Error("Expected hook to expose move handler");
  if (!resize) throw new Error("Expected hook to expose resize handler");
  if (!groupMove) throw new Error("Expected hook to expose group move handler");
  if (!groupResize) throw new Error("Expected hook to expose group resize handler");
  if (!del) throw new Error("Expected hook to expose delete handler");
  if (!elementsDelete) throw new Error("Expected hook to expose elements-delete handler");
  if (!handleAutoGroupCarveSources) throw new Error("Expected hook to expose group handler");
  if (!setAudioGroupAttribute) throw new Error("Expected hook to expose audio group handler");
  return {
    move,
    resize,
    groupMove,
    groupResize,
    del,
    elementsDelete,
    handleAutoGroupCarveSources,
    setAudioGroupAttribute,
    setElementFxAttribute: (latest as unknown as ReturnType<typeof useTimelineEditing>)
      .setElementFxAttribute,
    unmount,
  };
}

type TimelineRecordEdit = NonNullable<
  Parameters<typeof renderTimelineEditingHook>[0]["recordEdit"]
>;
type TimelinePublishSdkSession = NonNullable<
  Parameters<typeof renderTimelineEditingHook>[0]["publishSdkSession"]
>;

function renderTimelineEditingHookWithLifecycle(input: {
  timelineElements: TimelineElement[];
  iframe: HTMLIFrameElement;
  commitDomEditPatchBatches: ReturnType<
    typeof vi.fn<
      (...args: unknown[]) => Promise<{ durable: boolean; allMatched: boolean; changed: boolean }>
    >
  >;
}): {
  move: ReturnType<typeof useTimelineEditing>["handleTimelineElementMove"];
  unmount: () => void;
} {
  let move: ReturnType<typeof useTimelineEditing>["handleTimelineElementMove"] | null = null;

  function Harness() {
    const lifecycle = useElementLifecycleOps({
      activeCompPath: "index.html",
      showToast: vi.fn(),
      writeProjectFile: vi.fn(),
      editHistory: { recordEdit: vi.fn() },
      projectIdRef: { current: "p1" },
      reloadPreview: vi.fn(),
      clearDomSelection: vi.fn(),
      commitDomEditPatchBatches: input.commitDomEditPatchBatches,
    });
    const commitRef = useRef(lifecycle.handleDomZIndexReorderCommit);
    commitRef.current = lifecycle.handleDomZIndexReorderCommit;
    const hook = useTimelineEditing({
      projectId: null,
      activeCompPath: "index.html",
      timelineElements: input.timelineElements,
      showToast: vi.fn(),
      writeProjectFile: vi.fn(),
      recordEdit: vi.fn(),
      reloadPreview: vi.fn(),
      previewIframeRef: { current: input.iframe },
      pendingTimelineEditPathRef: { current: new Set<string>() },
      uploadProjectFiles: vi.fn(),
      handleDomZIndexReorderCommitRef: commitRef,
    });
    move = hook.handleTimelineElementMove;
    return null;
  }

  const { unmount } = mountHarness(<Harness />);
  if (!move) throw new Error("Expected hook to expose move handler");
  return { move, unmount };
}

async function flushAsyncWork(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await Promise.resolve();
  }
}

/**
 * Stub global fetch for project "p1": serves file contents (a single source
 * string, or a path → content map) and answers the GSAP-mutation endpoint
 * with `gsapBody`. Returns the mock for call inspection.
 */
function stubProjectFetch(files: string | Record<string, string>, gsapBody?: unknown) {
  const pathAfter = (url: string, marker: string) =>
    decodeURIComponent(url.split(marker)[1] ?? "index.html");
  const fileContent = (path: string) => (typeof files === "string" ? files : files[path]);
  // One handler per route, so the mock itself stays a lookup: the request
  // sequence callers assert on is still readable top to bottom.
  const routes: Array<[marker: string, respond: (url: string) => Response]> = [
    [
      "/api/projects/p1/gsap-mutation-capabilities",
      () => jsonResponse({ atomicOwnershipPairs: true }),
    ],
    [
      "/api/projects/p1/files/",
      (url) => jsonResponse({ content: fileContent(pathAfter(url, "/files/")) }),
    ],
    [
      "/api/projects/p1/gsap-mutations",
      (url) => {
        const content =
          fileContent(pathAfter(url, url.includes("-batch/") ? "-batch/" : "s/")) ?? "";
        return jsonResponse(
          gsapBody ?? { mutated: false, scriptText: null, before: content, after: content },
        );
      },
    ],
  ];
  const fetchMock = vi.fn(
    async (
      input: Parameters<typeof fetch>[0],
      _init?: Parameters<typeof fetch>[1],
    ): Promise<Response> => {
      const url = requestUrl(input);
      const route = routes.find(([marker]) => url.includes(marker));
      if (!route) throw new Error(`Unexpected fetch: ${url}`);
      return route[1](url);
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/**
 * One clip on track 0 + the editing hook wired to project "p1" — shared setup
 * for the single-clip move-path tests (horizontal, vertical-only, track-only,
 * diagonal) so their arrange blocks aren't clones of each other.
 */
function setupSingleClipHarness(options?: {
  source?: string;
  clipStyle?: string;
  onZIndexCommit?: (entries: ZIndexEntry[]) => Promise<void>;
  canEdit?: NonNullable<Parameters<typeof useTimelineEditing>[0]["canEdit"]>;
}) {
  const iframe = createPreviewIframe([{ id: "clip", track: 0, style: options?.clipStyle }]);
  const clip = timelineElement({ id: "clip", track: 0, zIndex: 0 });
  const commit =
    options?.onZIndexCommit ??
    vi.fn<(entries: ZIndexEntry[]) => Promise<void>>().mockResolvedValue(undefined);
  const writeProjectFile = vi.fn<(...args: unknown[]) => Promise<void>>(async () => {});
  const reloadPreview = vi.fn();
  const fetchMock = stubProjectFetch(
    options?.source ?? '<div id="clip" data-start="0" data-track-index="0"></div>',
  );
  const recordEdit = vi.fn(async () => {});
  const showToast = vi.fn();
  const hook = renderTimelineEditingHook({
    timelineElements: [clip],
    iframe,
    onZIndexCommit: commit,
    projectId: "p1",
    writeProjectFile,
    recordEdit,
    reloadPreview,
    showToast,
    canEdit: options?.canEdit,
  });
  return {
    iframe,
    clip,
    commit,
    writeProjectFile,
    recordEdit,
    showToast,
    reloadPreview,
    fetchMock,
    ...hook,
  };
}

/** Assert a lane write landed in both the live iframe DOM and the persisted file. */
function expectLanePersisted(
  iframe: HTMLIFrameElement,
  writeProjectFile: { mock: { calls: unknown[][] } },
  track: string,
): void {
  const doc = iframe.contentDocument;
  if (!doc) throw new Error("Expected iframe document");
  expect(doc.getElementById("clip")?.getAttribute("data-track-index")).toBe(track);
  expect(writeProjectFile.mock.calls[0]![1]).toContain(`data-track-index="${track}"`);
}

/**
 * Two 1s clips — a@0s on track 0, b@1s on track 1 — plus the matching iframe.
 * Shared by the group-move tests; `bSourceFile` puts b in its own file for the
 * cross-file partition test.
 */
function makeTwoClipPair(bSourceFile?: string) {
  const iframe = createPreviewIframe([
    { id: "a", track: 0 },
    { id: "b", track: 1 },
  ]);
  const a = timelineElement({ id: "a", track: 0, zIndex: 0, start: 0, duration: 1 });
  const b = timelineElement({
    id: "b",
    track: 1,
    zIndex: 0,
    start: 1,
    duration: 1,
    sourceFile: bSourceFile,
  });
  return { iframe, a, b };
}

const ROOT_DURATION_FALLBACK_SOURCE = [
  `<div data-composition-id="main" data-duration="4">`,
  `  <div id="clip" data-hf-id="hf-clip" data-start="0" data-duration="2"></div>`,
  `</div>`,
].join("\n");

/** Shared setup for the SDK-fallback root-duration tests: one 2s clip in a 4s comp. */
async function setupRootDurationFallback() {
  const iframe = createPreviewIframe([{ id: "clip", track: 0 }]);
  const clip = timelineElement({ id: "clip", track: 0, zIndex: 0 });
  const sdkSession = await openComposition(ROOT_DURATION_FALLBACK_SOURCE);
  const setTimingSpy = vi.spyOn(sdkSession, "setTiming");
  const writeProjectFile = vi.fn<(...args: unknown[]) => Promise<void>>(async () => {});
  const recordEdit = vi.fn<TimelineRecordEdit>(async () => {});
  const forceReloadSdkSession = vi.fn();
  const reloadPreview = vi.fn();
  const iframeWindow = iframe.contentWindow;
  if (!iframeWindow) throw new Error("Expected iframe window");
  const postMessageSpy = vi.spyOn(iframeWindow, "postMessage");
  stubProjectFetch(ROOT_DURATION_FALLBACK_SOURCE, {
    mutated: false,
    scriptText: null,
    before: ROOT_DURATION_FALLBACK_SOURCE,
    after: ROOT_DURATION_FALLBACK_SOURCE,
  });
  usePlayerStore.getState().setDuration(4);
  const hook = renderTimelineEditingHook({
    timelineElements: [clip],
    iframe,
    onZIndexCommit: vi.fn().mockResolvedValue(undefined),
    projectId: "p1",
    writeProjectFile,
    recordEdit,
    sdkSession,
    forceReloadSdkSession,
    reloadPreview,
  });
  return {
    hook,
    clip,
    setTimingSpy,
    writeProjectFile,
    forceReloadSdkSession,
    reloadPreview,
    postMessageSpy,
  };
}

/** Shared assertions: the fallback path grew the root to 5s and did ONE full reload. */
function expectRootDurationExtendedViaFallback(
  ctx: Awaited<ReturnType<typeof setupRootDurationFallback>>,
): void {
  expect(ctx.setTimingSpy).not.toHaveBeenCalled();
  expect(ctx.writeProjectFile.mock.calls[0]![1]).toContain(
    'data-composition-id="main" data-duration="5"',
  );
  expect(usePlayerStore.getState().duration).toBe(5);
  expect(ctx.forceReloadSdkSession).toHaveBeenCalledTimes(1);
  // The GSAP endpoint returned no rewritten scriptText, so the timing sync
  // escalates from the flash-free soft reload to ONE full reload. The root
  // duration travels via the persisted content-driven `data-duration` (above),
  // not a `set-root-duration` postMessage.
  expect(ctx.reloadPreview).toHaveBeenCalledTimes(1);
  expect(ctx.postMessageSpy).not.toHaveBeenCalledWith(
    expect.objectContaining({ action: "set-root-duration" }),
    "*",
  );
}

describe("useTimelineEditing timeline z-index reorder", () => {
  it("extends root duration through the fallback path when an SDK-backed move passes the end", async () => {
    const ctx = await setupRootDurationFallback();

    await act(async () => {
      await ctx.hook.move(ctx.clip, { start: 3, track: ctx.clip.track });
    });

    expect(ctx.writeProjectFile.mock.calls[0]![1]).toContain('data-start="3"');
    expectRootDurationExtendedViaFallback(ctx);

    ctx.hook.unmount();
  });

  it("extends root duration through the fallback path when an SDK-backed resize passes the end", async () => {
    const ctx = await setupRootDurationFallback();

    await act(async () => {
      await ctx.hook.resize(ctx.clip, { start: 0, duration: 5, playbackStart: undefined });
    });

    expect(ctx.writeProjectFile.mock.calls[0]![1]).toContain('data-duration="5"></div>');
    expectRootDurationExtendedViaFallback(ctx);

    ctx.hook.unmount();
  });

  it("routes a vertical drag through the shared z-index commit without writing track-index", async () => {
    const iframe = createPreviewIframe([
      { id: "front", track: 0, style: "position: relative; z-index: 10" },
      { id: "back", track: 2, style: "position: relative; z-index: 1" },
    ]);
    const front = timelineElement({ id: "front", track: 0, zIndex: 10 });
    const back = timelineElement({ id: "back", track: 2, zIndex: 1 });
    const commit = vi.fn<(entries: ZIndexEntry[]) => Promise<void>>().mockResolvedValue(undefined);
    const { move, unmount } = renderTimelineEditingHook({
      timelineElements: [front, back],
      iframe,
      onZIndexCommit: commit,
    });

    await act(async () => {
      await move(back, {
        start: back.start,
        track: back.track,
        stackingReorder: {
          contextKey: "root",
          placement: { type: "onto", layerId: "layer-front" },
          zIndexChanges: [{ key: "back", zIndex: 10 }],
        },
      });
    });

    const doc = iframe.contentDocument;
    if (!doc) throw new Error("Expected iframe document");

    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit.mock.calls[0]![0].map((entry) => [entry.id, entry.zIndex])).toEqual([
      ["back", 10],
    ]);
    expect(doc.getElementById("back")?.getAttribute("data-track-index")).toBe("2");

    unmount();
  });

  it("never writes z-index when the dragged clip is audio (no visual layer)", async () => {
    const iframe = createPreviewIframe([
      { id: "front", track: 0 },
      { id: "music", track: 1 },
    ]);
    const front = timelineElement({ id: "front", track: 0, zIndex: 0 });
    const music = timelineElement({ id: "music", track: 1, zIndex: 0, tag: "audio" });
    const commit = vi.fn<(entries: ZIndexEntry[]) => Promise<void>>().mockResolvedValue(undefined);
    const { move, unmount } = renderTimelineEditingHook({
      timelineElements: [front, music],
      iframe,
      onZIndexCommit: commit,
    });

    await act(async () => {
      await move(music, {
        start: music.start,
        track: music.track,
        stackingReorder: {
          contextKey: "root",
          placement: { type: "onto", layerId: "layer-front" },
          zIndexChanges: [{ key: "music", zIndex: 2 }],
        },
      });
    });

    expect(commit).not.toHaveBeenCalled();

    unmount();
  });

  it("commits only the minimum z-index changes resolved by the timeline drag", async () => {
    const iframe = createPreviewIframe([
      { id: "front", track: 0, style: "position: relative; z-index: 2" },
      { id: "back", track: 1, style: "position: relative; z-index: 1" },
      { id: "dragged", track: 2, style: "position: relative; z-index: 0" },
    ]);
    const front = timelineElement({ id: "front", track: 0, zIndex: 2 });
    const back = timelineElement({ id: "back", track: 1, zIndex: 1 });
    const dragged = timelineElement({ id: "dragged", track: 2, zIndex: 0 });
    const commit = vi.fn<(entries: ZIndexEntry[]) => Promise<void>>().mockResolvedValue(undefined);
    const { move, unmount } = renderTimelineEditingHook({
      timelineElements: [front, back, dragged],
      iframe,
      onZIndexCommit: commit,
    });

    await act(async () => {
      await move(dragged, {
        start: dragged.start,
        track: dragged.track,
        stackingReorder: {
          contextKey: "root",
          placement: { type: "between", beforeLayerId: "front", afterLayerId: "back" },
          zIndexChanges: [
            { key: "dragged", zIndex: 2 },
            { key: "front", zIndex: 3 },
          ],
        },
      });
    });

    expect(commit.mock.calls[0]![0].map((entry) => [entry.id, entry.zIndex])).toEqual([
      ["dragged", 2],
      ["front", 3],
    ]);

    unmount();
  });

  it("uses the shared lifecycle commit so static clips receive position relative", async () => {
    const iframe = createPreviewIframe([
      { id: "front", track: 0, style: "position: static" },
      { id: "back", track: 1, style: "position: static" },
    ]);
    const front = timelineElement({ id: "front", track: 0, zIndex: 0 });
    const back = timelineElement({ id: "back", track: 1, zIndex: 0 });
    const commitDomEditPatchBatches = vi.fn<
      (...args: unknown[]) => Promise<{ durable: boolean; allMatched: boolean; changed: boolean }>
    >(async () => ({ durable: true, allMatched: true, changed: true }));
    const { move, unmount } = renderTimelineEditingHookWithLifecycle({
      timelineElements: [front, back],
      iframe,
      commitDomEditPatchBatches,
    });

    await act(async () => {
      await move(back, {
        start: back.start,
        track: back.track,
        stackingReorder: {
          contextKey: "root",
          placement: { type: "above", layerId: "front" },
          zIndexChanges: [{ key: "back", zIndex: 2 }],
        },
      });
      await flushAsyncWork();
    });

    expect(commitDomEditPatchBatches).toHaveBeenCalled();
    const batch = commitDomEditPatchBatches.mock.calls[0]![0] as Array<{
      patches: Array<{ operations: unknown[] }>;
    }>;
    expect(batch[0]?.patches[0]?.operations).toEqual([
      { type: "inline-style", property: "z-index", value: "2" },
      { type: "inline-style", property: "position", value: "relative" },
    ]);

    unmount();
  });

  it("rejects and rolls back DOM and store z-index changes when a reorder save fails", async () => {
    const iframe = createPreviewIframe([
      { id: "front", track: 0, style: "position: relative; z-index: 7" },
      { id: "back", track: 1, style: "position: static" },
    ]);
    const front = timelineElement({ id: "front", track: 0, zIndex: 7 });
    const back = timelineElement({ id: "back", track: 1, zIndex: 0 });
    usePlayerStore.getState().setElements([
      { ...front, hasExplicitZIndex: true },
      { ...back, hasExplicitZIndex: false },
    ]);
    const saveError = new Error("save failed");
    const commitDomEditPatchBatches = vi
      .fn<
        (...args: unknown[]) => Promise<{ durable: boolean; allMatched: boolean; changed: boolean }>
      >()
      .mockRejectedValueOnce(saveError);
    const { move, unmount } = renderTimelineEditingHookWithLifecycle({
      timelineElements: [front, back],
      iframe,
      commitDomEditPatchBatches,
    });
    const doc = iframe.contentDocument;
    if (!doc) throw new Error("Expected iframe document");
    const frontElement = doc.getElementById("front") as HTMLElement | null;
    const backElement = doc.getElementById("back") as HTMLElement | null;
    if (!frontElement || !backElement) throw new Error("Expected reordered elements");

    let rejection: unknown;
    await act(async () => {
      try {
        await move(back, {
          start: back.start,
          track: back.track,
          stackingReorder: {
            contextKey: "root",
            placement: { type: "above", layerId: "front" },
            zIndexChanges: [
              { key: "front", zIndex: 2 },
              { key: "back", zIndex: 5 },
            ],
          },
        });
      } catch (error) {
        rejection = error;
      }
      await flushAsyncWork();
    });

    expect(rejection).toBe(saveError);
    expect(frontElement.style.zIndex).toBe("7");
    expect(frontElement.style.position).toBe("relative");
    expect(backElement.style.zIndex).toBe("");
    expect(backElement.style.position).toBe("static");
    const storeEntries = usePlayerStore.getState().elements;
    expect(storeEntries.find((entry) => entry.id === "front")).toMatchObject({
      zIndex: 7,
      hasExplicitZIndex: true,
    });
    expect(storeEntries.find((entry) => entry.id === "back")).toMatchObject({
      zIndex: 0,
      hasExplicitZIndex: false,
    });

    unmount();
  });

  it("waits for the lifecycle z-index batch before resolving a reorder", async () => {
    const iframe = createPreviewIframe([
      { id: "front", track: 0, style: "position: relative; z-index: 1" },
      { id: "back", track: 1, style: "position: relative; z-index: 0" },
    ]);
    const front = timelineElement({ id: "front", track: 0, zIndex: 1 });
    const back = timelineElement({ id: "back", track: 1, zIndex: 0 });
    let releaseBatch!: () => void;
    const batchSave = new Promise<void>((resolve) => {
      releaseBatch = resolve;
    });
    const commitDomEditPatchBatches = vi
      .fn<
        (...args: unknown[]) => Promise<{ durable: boolean; allMatched: boolean; changed: boolean }>
      >()
      .mockReturnValueOnce(
        batchSave.then(() => ({ durable: true, allMatched: true, changed: true })),
      );
    const { move, unmount } = renderTimelineEditingHookWithLifecycle({
      timelineElements: [front, back],
      iframe,
      commitDomEditPatchBatches,
    });
    let settled = false;

    let movePromise!: Promise<void>;
    await act(async () => {
      movePromise = move(back, {
        start: back.start,
        track: back.track,
        stackingReorder: {
          contextKey: "root",
          placement: { type: "above", layerId: "front" },
          zIndexChanges: [
            { key: "front", zIndex: 2 },
            { key: "back", zIndex: 3 },
          ],
        },
      }).then(() => {
        settled = true;
      });
      await flushAsyncWork();
    });

    expect(commitDomEditPatchBatches).toHaveBeenCalledTimes(1);
    expect(settled).toBe(false);

    await act(async () => {
      releaseBatch();
      await movePromise;
      await flushAsyncWork();
    });
    expect(settled).toBe(true);

    unmount();
  });

  it("keeps horizontal-only drag on the timing and GSAP shift path without z-index writes", async () => {
    const h = setupSingleClipHarness();

    await act(async () => {
      await h.move(h.clip, { start: 1.25, track: h.clip.track });
    });

    const doc = h.iframe.contentDocument;
    if (!doc) throw new Error("Expected iframe document");
    expect(doc.getElementById("clip")?.getAttribute("data-start")).toBe("1.25");
    expect(doc.getElementById("clip")?.getAttribute("data-track-index")).toBe("0");
    expect(h.commit).not.toHaveBeenCalled();
    expect(h.writeProjectFile.mock.calls[0]![1]).toContain('data-start="1.25"');
    expect(h.writeProjectFile.mock.calls[0]![1]).toContain('data-track-index="0"');
    expect(h.writeProjectFile.mock.calls[0]![1]).not.toContain("z-index");
    expect(
      h.fetchMock.mock.calls.some((call) => requestUrl(call[0]).includes("gsap-mutations")),
    ).toBe(true);

    h.unmount();
  });

  it("persists a vertical-only lane move (start unchanged) through the single-element fallback", async () => {
    // Regression: `if (!startChanged) return` ran BEFORE the file persist, so a
    // pure lane change routed through onMoveElement (no onMoveElements wired)
    // wrote NOTHING — the lane snapped back on the next reload.
    const h = setupSingleClipHarness();

    await act(async () => {
      // Vertical-only: same start, new track (already authored-space on this path).
      await h.move(h.clip, { start: h.clip.start, track: 2 });
    });

    // Live DOM patched (no pre-reload lane snap-back) and the file write
    // carries the new data-track-index with start intact.
    expectLanePersisted(h.iframe, h.writeProjectFile, "2");
    expect(h.writeProjectFile.mock.calls[0]![1]).toContain('data-start="0"');

    h.unmount();
  });

  it("orders the timing write after the z-index commit so a diagonal drag can't clobber the restack", async () => {
    // Gate the z-index commit so we can observe whether the timing write waits.
    let releaseCommit!: () => void;
    const commitGate = new Promise<void>((resolve) => {
      releaseCommit = resolve;
    });
    const h = setupSingleClipHarness({
      clipStyle: "position: relative; z-index: 0",
      onZIndexCommit: vi
        .fn<(entries: ZIndexEntry[]) => Promise<void>>()
        .mockReturnValue(commitGate),
    });
    const { clip, commit, writeProjectFile, move, unmount } = h;

    // Diagonal drag: both a time move (start change) and a restack (z-index change).
    let movePromise!: Promise<unknown>;
    await act(async () => {
      movePromise = move(clip, {
        start: 1.25,
        track: clip.track,
        stackingReorder: {
          contextKey: "root",
          placement: { type: "onto", layerId: "layer-clip" },
          zIndexChanges: [{ key: "clip", zIndex: 5 }],
        },
      });
      await flushAsyncWork();
    });

    // The z-index commit is in flight but gated; the full-file timing write must
    // not have run yet, or it would overwrite the file without the z-index change.
    expect(commit).toHaveBeenCalledTimes(1);
    expect(writeProjectFile).not.toHaveBeenCalled();

    // Release the z-index commit → the timing write now proceeds, on top of it.
    await act(async () => {
      releaseCommit();
      await movePromise;
      await flushAsyncWork();
    });
    expect(writeProjectFile).toHaveBeenCalled();

    unmount();
  });

  it("persists a same-file group move with one write containing every clip timing", async () => {
    const source = [
      '<div id="a" data-start="0" data-duration="1"></div>',
      '<div id="b" data-start="1" data-duration="1"></div>',
      '<div id="c" data-start="2" data-duration="1"></div>',
    ].join("\n");
    const iframe = createPreviewIframe([
      { id: "a", track: 0 },
      { id: "b", track: 1 },
      { id: "c", track: 2 },
    ]);
    const clips = [
      timelineElement({ id: "a", track: 0, zIndex: 0, start: 0, duration: 1 }),
      timelineElement({ id: "b", track: 1, zIndex: 0, start: 1, duration: 1 }),
      timelineElement({ id: "c", track: 2, zIndex: 0, start: 2, duration: 1 }),
    ];
    const writeProjectFile = vi.fn<(...args: unknown[]) => Promise<void>>(async () => {});
    const recordEdit = vi.fn<TimelineRecordEdit>(async (_entry) => {});
    stubProjectFetch(source);
    const { groupMove, unmount } = renderTimelineEditingHook({
      timelineElements: clips,
      iframe,
      onZIndexCommit: vi.fn().mockResolvedValue(undefined),
      projectId: "p1",
      writeProjectFile,
      recordEdit,
    });

    await act(async () => {
      await groupMove([
        { element: clips[0], start: 0.5 },
        { element: clips[1], start: 1.5 },
        { element: clips[2], start: 2.5 },
      ]);
    });

    expect(writeProjectFile).toHaveBeenCalledTimes(1);
    const written = writeProjectFile.mock.calls[0]![1] as string;
    expect(written).toContain('id="a" data-start="0.5"');
    expect(written).toContain('id="b" data-start="1.5"');
    expect(written).toContain('id="c" data-start="2.5"');
    expect(recordEdit).toHaveBeenCalledTimes(1);
    expect(Object.keys(recordEdit.mock.calls[0]![0].files)).toEqual(["index.html"]);

    unmount();
  });

  it("partitions a group move by source file while keeping one undo entry", async () => {
    const files: Record<string, string> = {
      "index.html": '<div id="a" data-start="0" data-duration="1"></div>',
      "scene.html": '<div id="b" data-start="1" data-duration="1"></div>',
    };
    const { iframe, a, b } = makeTwoClipPair("scene.html");
    const writeProjectFile = vi.fn<(...args: unknown[]) => Promise<void>>(async () => {});
    const recordEdit = vi.fn<TimelineRecordEdit>(async (_entry) => {});
    stubProjectFetch(files);
    const { groupMove, unmount } = renderTimelineEditingHook({
      timelineElements: [a, b],
      iframe,
      onZIndexCommit: vi.fn().mockResolvedValue(undefined),
      projectId: "p1",
      writeProjectFile,
      recordEdit,
    });

    await act(async () => {
      await groupMove([
        { element: a, start: 0.25 },
        { element: b, start: 1.25 },
      ]);
    });

    expect(writeProjectFile.mock.calls.map((call) => call[0])).toEqual([
      "index.html",
      "scene.html",
    ]);
    expect(writeProjectFile.mock.calls[0]![1]).toContain('data-start="0.25"');
    expect(writeProjectFile.mock.calls[1]![1]).toContain('data-start="1.25"');
    expect(recordEdit).toHaveBeenCalledTimes(1);
    expect(Object.keys(recordEdit.mock.calls[0]![0].files).sort()).toEqual([
      "index.html",
      "scene.html",
    ]);

    unmount();
  });

  it("waits for a z-index commit before the group timing write", async () => {
    const source = '<div id="clip" data-start="0" data-duration="1"></div>';
    const iframe = createPreviewIframe([{ id: "clip", track: 0 }]);
    const clip = timelineElement({ id: "clip", track: 0, zIndex: 0, start: 0, duration: 1 });
    let releaseCommit!: () => void;
    const zIndexCommit = new Promise<void>((resolve) => {
      releaseCommit = resolve;
    });
    const writeProjectFile = vi.fn<(...args: unknown[]) => Promise<void>>(async () => {});
    stubProjectFetch(source);
    const { groupMove, unmount } = renderTimelineEditingHook({
      timelineElements: [clip],
      iframe,
      onZIndexCommit: vi.fn().mockResolvedValue(undefined),
      projectId: "p1",
      writeProjectFile,
      recordEdit: vi.fn(async () => {}),
    });

    let movePromise!: Promise<unknown>;
    await act(async () => {
      movePromise = groupMove([{ element: clip, start: 0.75 }], { beforeTiming: zIndexCommit });
      await flushAsyncWork();
    });
    expect(writeProjectFile).not.toHaveBeenCalled();

    await act(async () => {
      releaseCommit();
      await movePromise;
      await flushAsyncWork();
    });
    expect(writeProjectFile).toHaveBeenCalledTimes(1);

    unmount();
  });

  it("skips the GSAP fallback and reload for a TRACK-ONLY group move (z-mirror lane move)", async () => {
    // The mirrored z-order lane move persists {start: unchanged, track: new}.
    // Nothing timing-related changed — data-track-index is never read by the
    // renderer — so the persist must NOT be followed by the GSAP round-trip or
    // the full preview reload (the reload is what blinked the canvas).
    const h = setupSingleClipHarness({
      source: '<div id="clip" data-start="0" data-duration="2" data-track-index="0"></div>',
    });

    await act(async () => {
      await h.groupMove([{ element: h.clip, start: h.clip.start, track: 2 }]);
      await flushAsyncWork();
    });

    // The lane write still persisted (live DOM + file)...
    expectLanePersisted(h.iframe, h.writeProjectFile, "2");
    expect(h.writeProjectFile).toHaveBeenCalledTimes(1);
    // ...but no GSAP mutation ran and the preview was NOT reloaded.
    expect(
      h.fetchMock.mock.calls.some((call) => requestUrl(call[0]).includes("gsap-mutations")),
    ).toBe(false);
    expect(h.reloadPreview).not.toHaveBeenCalled();

    h.unmount();
  });

  it("rebinds the preview in place (no blink) for a time-move of a no-domId clip", async () => {
    // The gap-close blink path: "Close gap" issues pure TIME moves through
    // handleTimelineGroupMove. A selector-addressed clip (no domId — e.g. a
    // .sub caption) has no id-addressed GSAP tweens, so the mutation step has
    // nothing to rewrite and used to fall through to a full reloadPreview().
    // The sync must instead rebind the runtime timing in place — seek + rebind
    // re-derive the clip windows from the already-patched DOM — WITHOUT
    // re-executing any script (a comp's init-style scripts, e.g. a three.js
    // setup, must never run twice) and without the full-reload blink.
    const iframe = document.createElement("iframe");
    document.body.append(iframe);
    const doc = iframe.contentDocument;
    if (!doc) throw new Error("Expected iframe document");
    doc.body.innerHTML =
      '<div class="cap" data-start="2" data-duration="1" data-track-index="0"></div>';
    const liveScript = doc.createElement("script");
    liveScript.textContent =
      'window.__timelines = window.__timelines || {}; window.__timelines["root"] = { kill: function () {} };';
    doc.body.appendChild(liveScript);
    const win = iframe.contentWindow as unknown as Record<string, unknown>;
    win.gsap = { timeline: vi.fn(), set: vi.fn() };
    win.__timelines = { root: { kill: vi.fn() } };
    win.__hfForceTimelineRebind = vi.fn();
    win.__player = { getTime: () => 0, seek: vi.fn() };

    const cap: TimelineElement = {
      ...timelineElement({ id: "cap", track: 0, zIndex: 0, start: 2, duration: 1 }),
      domId: undefined,
      selector: ".cap",
      selectorIndex: 0,
    };
    const writeProjectFile = vi.fn<(...args: unknown[]) => Promise<void>>(async () => {});
    const reloadPreview = vi.fn();
    const fetchMock = stubProjectFetch(
      '<div class="cap" data-hf-id="hf-cap" data-start="2" data-duration="1" data-track-index="0"></div>',
    );
    const { groupMove, unmount } = renderTimelineEditingHook({
      timelineElements: [cap],
      iframe,
      onZIndexCommit: vi.fn().mockResolvedValue(undefined),
      projectId: "p1",
      writeProjectFile,
      recordEdit: vi.fn(async () => {}),
      reloadPreview,
    });

    await act(async () => {
      // Mirror timelineGapCommit: a pure time move keeping the current lane.
      await groupMove([{ element: cap, start: 1, track: cap.track }]);
      await flushAsyncWork();
    });

    // The move persisted (live DOM + file)...
    expect(doc.querySelector(".cap")?.getAttribute("data-start")).toBe("1");
    expect(writeProjectFile.mock.calls[0]![1]).toContain('data-start="1"');
    // ...no GSAP mutation ran (nothing id-addressed to rewrite)...
    expect(
      fetchMock.mock.calls.some((call) => requestUrl(call[0]).includes("gsap-mutations")),
    ).toBe(false);
    // ...and the preview was rebound in place, NOT full-reloaded (blink),
    // with the live script element left untouched (no re-execution).
    expect(reloadPreview).not.toHaveBeenCalled();
    expect(win.__hfForceTimelineRebind).toHaveBeenCalledTimes(1);
    expect(doc.body.contains(liveScript)).toBe(true);
    expect(doc.querySelectorAll("script")).toHaveLength(1);

    unmount();
  });

  it("keeps the GSAP fallback + reload for a MIXED batch (any start change)", async () => {
    // One clip changes lane only, the other shifts in time — the batch is not
    // track-only, so the existing behavior (GSAP shift + full reload when no
    // rewritten scriptText comes back — this stub iframe has no runtime rebind
    // hook, so the in-place rebind can't apply) must be preserved.
    const source = [
      '<div id="a" data-start="0" data-duration="1" data-track-index="0"></div>',
      '<div id="b" data-start="1" data-duration="1" data-track-index="1"></div>',
    ].join("\n");
    const { iframe, a, b } = makeTwoClipPair();
    const writeProjectFile = vi.fn<(...args: unknown[]) => Promise<void>>(async () => {});
    const reloadPreview = vi.fn();
    const fetchMock = stubProjectFetch(source, {
      mutated: false,
      scriptText: null,
      before: source,
      after: source,
    });
    const { groupMove, unmount } = renderTimelineEditingHook({
      timelineElements: [a, b],
      iframe,
      onZIndexCommit: vi.fn().mockResolvedValue(undefined),
      projectId: "p1",
      writeProjectFile,
      recordEdit: vi.fn(async () => {}),
      reloadPreview,
    });

    await act(async () => {
      await groupMove([
        { element: a, start: a.start, track: 2 },
        { element: b, start: 1.5, track: b.track },
      ]);
      await flushAsyncWork();
    });

    expect(writeProjectFile).toHaveBeenCalledTimes(1);
    // The time-shifted clip still goes through the GSAP shift endpoint...
    expect(
      fetchMock.mock.calls.some((call) => requestUrl(call[0]).includes("gsap-mutations")),
    ).toBe(true);
    // ...and with no rewritten scriptText the sync escalates to one full reload.
    expect(reloadPreview).toHaveBeenCalledTimes(1);

    unmount();
  });

  it("matches the single-clip move output when a group move contains one clip", async () => {
    const source = '<div id="clip" data-start="0" data-duration="1"></div>';
    const clip = timelineElement({ id: "clip", track: 0, zIndex: 0, start: 0, duration: 1 });
    stubProjectFetch(source);

    const singleWrite = vi.fn<(...args: unknown[]) => Promise<void>>(async () => {});
    const single = renderTimelineEditingHook({
      timelineElements: [clip],
      iframe: createPreviewIframe([{ id: "clip", track: 0 }]),
      onZIndexCommit: vi.fn().mockResolvedValue(undefined),
      projectId: "p1",
      writeProjectFile: singleWrite,
      recordEdit: vi.fn(async () => {}),
    });
    await act(async () => {
      await single.move(clip, { start: 0.5, track: clip.track });
    });
    single.unmount();

    const groupWrite = vi.fn<(...args: unknown[]) => Promise<void>>(async () => {});
    const group = renderTimelineEditingHook({
      timelineElements: [clip],
      iframe: createPreviewIframe([{ id: "clip", track: 0 }]),
      onZIndexCommit: vi.fn().mockResolvedValue(undefined),
      projectId: "p1",
      writeProjectFile: groupWrite,
      recordEdit: vi.fn(async () => {}),
    });
    await act(async () => {
      await group.groupMove([{ element: clip, start: 0.5 }]);
    });

    expect(groupWrite.mock.calls[0]![1]).toBe(singleWrite.mock.calls[0]![1]);
    group.unmount();
  });

  it("gives each single-clip move and resize its own undo step, which its GSAP rewrite joins", async () => {
    const source = '<div id="clip" data-start="0" data-duration="1"></div>';
    const clip = timelineElement({ id: "clip", track: 0, zIndex: 0, start: 0, duration: 1 });
    stubProjectFetch(source, {
      mutated: true,
      scriptText: null,
      before: "tweens at 0",
      after: source,
    });
    const recordEdit = vi.fn(async (_edit: { coalesceKey?: string; coalesceMs?: number }) => {});
    const h = renderTimelineEditingHook({
      timelineElements: [clip],
      iframe: createPreviewIframe([{ id: "clip", track: 0 }]),
      onZIndexCommit: vi.fn().mockResolvedValue(undefined),
      projectId: "p1",
      writeProjectFile: vi.fn(async () => {}),
      recordEdit,
    });

    await act(async () => {
      await h.move(clip, { start: 0.5, track: clip.track });
      await h.move(clip, { start: 1, track: clip.track });
      await h.resize(clip, { start: 0, duration: 2 });
    });

    const steps = recordEdit.mock.calls.map(([edit]) => edit);
    expect(steps.map((edit) => edit.coalesceMs)).toEqual(Array(6).fill(Infinity));
    const [move, fold, again, foldAgain, resize, resizeFold] = steps.map(
      (edit) => edit.coalesceKey,
    );
    expect([fold, foldAgain, resizeFold]).toEqual([move, again, resize]);
    expect(new Set([move, again, resize]).size).toBe(3);
    h.unmount();
  });
});

describe("useTimelineEditing duration rollback on failed persist", () => {
  const ROLLBACK_SOURCE = [
    `<div data-composition-id="main" data-duration="4">`,
    `  <div id="clip" data-start="0" data-duration="2" data-track-index="0"></div>`,
    `</div>`,
  ].join("\n");

  /** Iframe with a comp root so the optimistic sync (and its rollback) can patch data-duration. */
  function createRootedIframe(source: string = ROLLBACK_SOURCE): HTMLIFrameElement {
    const iframe = document.createElement("iframe");
    document.body.append(iframe);
    const doc = iframe.contentDocument;
    if (!doc) throw new Error("Expected iframe document");
    doc.body.innerHTML = source;
    return iframe;
  }

  function rootDurationAttr(iframe: HTMLIFrameElement): string | null | undefined {
    return iframe.contentDocument
      ?.querySelector("[data-composition-id]")
      ?.getAttribute("data-duration");
  }

  function setupFailedPersist() {
    const iframe = createRootedIframe();
    const clip = timelineElement({ id: "clip", track: 0, zIndex: 0 });
    const writeError = new Error("write failed");
    const writeProjectFile = vi
      .fn<(...args: unknown[]) => Promise<void>>()
      .mockRejectedValue(writeError);
    stubProjectFetch(ROLLBACK_SOURCE);
    usePlayerStore.getState().setDuration(4);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const showToast = vi.fn();
    const hook = renderTimelineEditingHook({
      timelineElements: [clip],
      iframe,
      onZIndexCommit: vi.fn().mockResolvedValue(undefined),
      projectId: "p1",
      writeProjectFile,
      recordEdit: vi.fn(async () => {}),
      reloadPreview: vi.fn(),
      showToast,
    });
    return { iframe, clip, hook, showToast, writeError };
  }

  /**
   * Run a persist that must reject with the harness's writeError, then assert
   * the store duration AND the live root rolled back to the pre-edit 4s —
   * the shared act/assert core of the four failed-persist tests below.
   */
  async function expectPersistRollback(
    ctx: ReturnType<typeof setupFailedPersist>,
    run: () => Promise<unknown>,
  ): Promise<void> {
    let rejection: unknown;
    await act(async () => {
      await run().catch((error) => {
        rejection = error;
      });
      await flushAsyncWork();
    });
    expect(rejection).toBe(ctx.writeError);
    expect(ctx.showToast).toHaveBeenCalledWith("write failed", "error");
    expect(usePlayerStore.getState().duration).toBe(4);
    expect(rootDurationAttr(ctx.iframe)).toBe("4");
  }

  it("rolls back the store duration and live root when a move persist fails", async () => {
    const ctx = setupFailedPersist();
    // Move past the end: the optimistic sync grows the readout to 5s.
    await expectPersistRollback(ctx, () =>
      ctx.hook.move(ctx.clip, { start: 3, track: ctx.clip.track }),
    );
    ctx.hook.unmount();
  });

  it("rolls back the store duration and live root when a resize persist fails", async () => {
    const ctx = setupFailedPersist();
    await expectPersistRollback(ctx, () =>
      ctx.hook.resize(ctx.clip, { start: 0, duration: 6, playbackStart: undefined }),
    );
    ctx.hook.unmount();
  });

  it("rolls back the store duration and live root when a group move persist fails", async () => {
    const ctx = setupFailedPersist();
    await expectPersistRollback(ctx, () => ctx.hook.groupMove([{ element: ctx.clip, start: 3.5 }]));
    ctx.hook.unmount();
  });

  it("rolls back the store duration and live root when a group resize persist fails", async () => {
    const ctx = setupFailedPersist();
    await expectPersistRollback(ctx, () =>
      ctx.hook.groupResize([{ element: ctx.clip, start: 0, duration: 7 }]),
    );
    ctx.hook.unmount();
  });

  it("rolls back the store duration and live root when a delete persist fails", async () => {
    // Two clips; deleting the furthest one shrinks the content-driven duration
    // optimistically (4s -> 2s), so a failed write must roll that shrink back.
    const DELETE_SOURCE = [
      `<div data-composition-id="main" data-duration="4">`,
      `  <div id="clip" data-start="0" data-duration="2" data-track-index="0"></div>`,
      `  <div id="tail" data-start="2" data-duration="2" data-track-index="0"></div>`,
      `</div>`,
    ].join("\n");
    const DELETE_REMOVED_SOURCE = [
      `<div data-composition-id="main" data-duration="4">`,
      `  <div id="clip" data-start="0" data-duration="2" data-track-index="0"></div>`,
      `</div>`,
    ].join("\n");

    const iframe = createRootedIframe(DELETE_SOURCE);
    const tail = timelineElement({ id: "tail", track: 0, zIndex: 0, start: 2, duration: 2 });
    const writeError = new Error("write failed");
    const writeProjectFile = vi
      .fn<(...args: unknown[]) => Promise<void>>()
      .mockRejectedValue(writeError);
    // The delete path reads the file, then asks the server-side remove-element
    // mutation for the post-removal source before persisting it.
    const fetchMock = vi.fn(async (input: Parameters<typeof fetch>[0]): Promise<Response> => {
      const url = requestUrl(input);
      if (url.includes("/api/projects/p1/files/")) {
        return jsonResponse({ content: DELETE_SOURCE });
      }
      if (url.includes("/api/projects/p1/file-mutations/remove-elements/")) {
        return jsonResponse({ changed: true, content: DELETE_REMOVED_SOURCE });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    usePlayerStore.getState().setDuration(4);
    const showToast = vi.fn();
    const hook = renderTimelineEditingHook({
      timelineElements: [tail],
      iframe,
      onZIndexCommit: vi.fn().mockResolvedValue(undefined),
      projectId: "p1",
      writeProjectFile,
      recordEdit: vi.fn(async () => {}),
      reloadPreview: vi.fn(),
      showToast,
    });

    await act(async () => {
      // Unlike move/resize, the delete handler swallows the persist failure
      // into a toast, so the promise resolves.
      await hook.del(tail);
      await flushAsyncWork();
    });

    // The optimistic shrink reached the persist attempt (root patched to the
    // furthest remaining clip end, 2s)...
    expect(writeProjectFile).toHaveBeenCalledTimes(1);
    expect(String(writeProjectFile.mock.calls[0]![1])).toContain(
      'data-composition-id="main" data-duration="2"',
    );
    expect(showToast).toHaveBeenCalledWith("write failed");
    // ...and the failed write rolled the readout AND the live root back.
    expect(usePlayerStore.getState().duration).toBe(4);
    expect(rootDurationAttr(iframe)).toBe("4");

    hook.unmount();
  });

  it("keeps the grown duration when the persist succeeds", async () => {
    const { iframe, clip, hook } = setupFailedPersist();
    // Same harness, but with a write that succeeds this time.
    hook.unmount();
    const writeProjectFile = vi.fn<(...args: unknown[]) => Promise<void>>(async () => {});
    const succeeding = renderTimelineEditingHook({
      timelineElements: [clip],
      iframe,
      onZIndexCommit: vi.fn().mockResolvedValue(undefined),
      projectId: "p1",
      writeProjectFile,
      recordEdit: vi.fn(async () => {}),
      reloadPreview: vi.fn(),
    });

    await act(async () => {
      await succeeding.move(clip, { start: 3, track: clip.track });
      await flushAsyncWork();
    });

    expect(usePlayerStore.getState().duration).toBe(5);
    expect(rootDurationAttr(iframe)).toBe("5");

    succeeding.unmount();
  });
});

// Blocked means no fetch write, no recordEdit, and the host's reason
// toasted. Absent canEdit behaves exactly as before (asserted above).
describe("useTimelineEditing: canEdit gate", () => {
  it("re-reads canEdit after the host changes its verdict", async () => {
    const iframe = createPreviewIframe([{ id: "clip", track: 0 }]);
    const clip = timelineElement({ id: "clip", track: 0, zIndex: 0 });
    const writeProjectFile = vi.fn<(...args: unknown[]) => Promise<void>>(async () => {});
    const showToast = vi.fn();
    const recordEdit = vi.fn(async () => {});
    const pendingTimelineEditPathRef = { current: new Set<string>() };
    const previewIframeRef = { current: iframe };
    const uploadProjectFiles = vi.fn();
    const reloadPreview = vi.fn();
    let setBlocked = () => {};
    let hook: ReturnType<typeof useTimelineEditing> | null = null;

    function Harness() {
      const [blocked, updateBlocked] = useState(false);
      setBlocked = () => updateBlocked(true);
      hook = useTimelineEditing({
        projectId: "p1",
        activeCompPath: "index.html",
        timelineElements: [clip],
        showToast,
        writeProjectFile,
        recordEdit,
        reloadPreview,
        previewIframeRef,
        pendingTimelineEditPathRef,
        uploadProjectFiles,
        canEdit: () => (blocked ? { blocked: true, reason: "Reserved by an agent" } : true),
      });
      return null;
    }

    const { unmount } = mountHarness(<Harness />);
    if (!hook) throw new Error("Expected hook to mount");
    act(() => setBlocked());

    await act(async () => {
      await hook!.handleTimelineElementMove(clip, { start: 3, track: clip.track });
      await flushAsyncWork();
    });

    expect(writeProjectFile).not.toHaveBeenCalled();
    expect(recordEdit).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith("Reserved by an agent", "error");
    unmount();
  });

  it("refuses a move with the host's reason, writing nothing", async () => {
    const { clip, move, writeProjectFile, recordEdit, showToast, unmount } = setupSingleClipHarness(
      {
        canEdit: () => ({ blocked: true, reason: "Reserved by an agent" }),
      },
    );

    await act(async () => {
      await move(clip, { start: 3, track: clip.track });
      await flushAsyncWork();
    });

    expect(writeProjectFile).not.toHaveBeenCalled();
    expect(recordEdit).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith("Reserved by an agent", "error");
    unmount();
  });

  it("refuses a delete (single and multi) with nothing written", async () => {
    const { clip, del, elementsDelete, writeProjectFile, recordEdit, unmount } =
      setupSingleClipHarness({
        canEdit: () => ({ blocked: true, reason: "Reserved by an agent" }),
      });

    await act(async () => {
      await del(clip);
      await elementsDelete([clip]);
      await flushAsyncWork();
    });

    expect(writeProjectFile).not.toHaveBeenCalled();
    expect(recordEdit).not.toHaveBeenCalled();
    unmount();
  });

  it("resolves toggle-track-hidden against the store-owned timeline rows", async () => {
    // The visibility hook reads the single store-owned row source. The editing
    // guard must receive that same source so a blocked row cannot fall through
    // to the write path.
    const iframe = createPreviewIframe([{ id: "clip", track: 0 }]);
    const clip = timelineElement({ id: "clip", track: 0, zIndex: 0 });
    usePlayerStore.getState().setElements([clip]);
    const showToast = vi.fn();
    const writeProjectFile = vi.fn<(...args: unknown[]) => Promise<void>>(async () => {});
    const canEdit = vi.fn((element: TimelineElement) =>
      element.id === "clip" ? { blocked: true as const, reason: "Reserved by an agent" } : true,
    );
    let hook: ReturnType<typeof useTimelineEditing> | null = null;
    function Harness() {
      hook = useTimelineEditing({
        projectId: "p1",
        activeCompPath: "index.html",
        timelineElements: [clip],
        showToast,
        writeProjectFile,
        recordEdit: vi.fn(),
        reloadPreview: vi.fn(),
        previewIframeRef: { current: iframe },
        pendingTimelineEditPathRef: { current: new Set<string>() },
        uploadProjectFiles: vi.fn(),
        canEdit,
      });
      return null;
    }
    const { unmount } = mountHarness(<Harness />);
    if (!hook) throw new Error("Expected hook to mount");

    await act(async () => {
      await hook!.handleToggleTrackHidden(0, true);
      await flushAsyncWork();
    });

    expect(canEdit).toHaveBeenCalledWith(clip);
    expect(showToast).toHaveBeenCalledWith("Reserved by an agent", "error");
    expect(writeProjectFile).not.toHaveBeenCalled();
    unmount();
  });

  it("lets an unblocked element through while a blocked one is refused", async () => {
    const iframe = createPreviewIframe([
      { id: "free", track: 0 },
      { id: "locked", track: 1 },
    ]);
    const free = timelineElement({ id: "free", track: 0, zIndex: 0 });
    const locked = timelineElement({ id: "locked", track: 1, zIndex: 0 });
    const writeProjectFile = vi.fn<(...args: unknown[]) => Promise<void>>(async () => {});
    const recordEdit = vi.fn(async () => {});
    stubProjectFetch(
      '<div id="free" data-start="0" data-track-index="0"></div>' +
        '<div id="locked" data-start="0" data-track-index="1"></div>',
    );
    const hook = renderTimelineEditingHook({
      timelineElements: [free, locked],
      iframe,
      onZIndexCommit: vi.fn().mockResolvedValue(undefined),
      projectId: "p1",
      writeProjectFile,
      recordEdit,
      canEdit: (element) =>
        element.id === "locked" ? { blocked: true, reason: "Reserved by an agent" } : true,
    });

    await act(async () => {
      await hook.move(locked, { start: 3, track: locked.track });
      await flushAsyncWork();
    });
    expect(writeProjectFile).not.toHaveBeenCalled();

    await act(async () => {
      await hook.move(free, { start: 3, track: free.track });
      await flushAsyncWork();
    });
    expect(writeProjectFile).toHaveBeenCalled();
    hook.unmount();
  });

  it("refuses razor-split-all when it would split a blocked clip, writing nothing", async () => {
    const iframe = createPreviewIframe([{ id: "clip", track: 0 }]);
    const clip = timelineElement({ id: "clip", track: 0, zIndex: 0, start: 0, duration: 2 });
    usePlayerStore.getState().setElements([clip]);
    const showToast = vi.fn();
    const fetchMock = vi.fn(async () => {
      throw new Error("must not be called: canEdit should have refused the split");
    });
    vi.stubGlobal("fetch", fetchMock);
    let hook: ReturnType<typeof useTimelineEditing> | null = null;
    function Harness() {
      hook = useTimelineEditing({
        projectId: "p1",
        activeCompPath: "index.html",
        timelineElements: [clip],
        showToast,
        writeProjectFile: vi.fn(),
        recordEdit: vi.fn(),
        reloadPreview: vi.fn(),
        previewIframeRef: { current: iframe },
        pendingTimelineEditPathRef: { current: new Set<string>() },
        uploadProjectFiles: vi.fn(),
        canEdit: () => ({ blocked: true, reason: "Reserved by an agent" }),
      });
      return null;
    }
    const { unmount } = mountHarness(<Harness />);
    if (!hook) throw new Error("Expected hook to mount");

    await act(async () => {
      await hook!.handleRazorSplitAll(1);
      await flushAsyncWork();
    });

    expect(showToast).toHaveBeenCalledWith("Reserved by an agent", "error");
    expect(fetchMock).not.toHaveBeenCalled();
    unmount();
  });

  it("refuses a blocked group's audio attribute write, writing nothing", async () => {
    const iframe = createPreviewIframe([{ id: "member", track: 0 }]);
    const member = timelineElement({ id: "member", track: 0, zIndex: 0 });
    usePlayerStore.getState().setElements([{ ...member, audioGroup: "hf-group" }]);
    const showToast = vi.fn();
    const fetchMock = vi.fn(async () => {
      throw new Error("must not be called: canEdit should have refused the write");
    });
    vi.stubGlobal("fetch", fetchMock);
    let hook: ReturnType<typeof useTimelineEditing> | null = null;
    function Harness() {
      hook = useTimelineEditing({
        projectId: "p1",
        activeCompPath: "index.html",
        timelineElements: [member],
        showToast,
        writeProjectFile: vi.fn(),
        recordEdit: vi.fn(),
        reloadPreview: vi.fn(),
        previewIframeRef: { current: iframe },
        pendingTimelineEditPathRef: { current: new Set<string>() },
        uploadProjectFiles: vi.fn(),
        canEdit: (element) =>
          element.id === "member" ? { blocked: true, reason: "Reserved by an agent" } : true,
      });
      return null;
    }
    const { unmount } = mountHarness(<Harness />);
    if (!hook) throw new Error("Expected hook to mount");

    await act(async () => {
      await hook!.setAudioGroupAttribute.setQuiet("hf-group", "data-volume", "0.5", "Set volume");
      await flushAsyncWork();
    });

    expect(showToast).toHaveBeenCalledWith("Reserved by an agent", "error");
    expect(fetchMock).not.toHaveBeenCalled();
    unmount();
  });

  it("refuses a group write when its members live only inside a sub-composition", async () => {
    // syncStoredGroupAttribute mirrors into domClipChildren for a group with
    // no flat twin (timelineAudioGroupVolume.ts) — the resolver must check
    // that array too, or a sub-comp-only group's write goes ungated.
    const iframe = createPreviewIframe([]);
    usePlayerStore.getState().setElements([]);
    usePlayerStore.getState().setDomClipChildren([
      {
        id: "sub-member",
        parentId: "host",
        hostId: "host",
        label: "Sub member",
        stackingContextId: "root",
        audioGroup: "hf-group",
      },
    ]);
    const showToast = vi.fn();
    const fetchMock = vi.fn(async () => {
      throw new Error("must not be called: canEdit should have refused the write");
    });
    vi.stubGlobal("fetch", fetchMock);
    let hook: ReturnType<typeof useTimelineEditing> | null = null;
    function Harness() {
      hook = useTimelineEditing({
        projectId: "p1",
        activeCompPath: "index.html",
        timelineElements: [],
        showToast,
        writeProjectFile: vi.fn(),
        recordEdit: vi.fn(),
        reloadPreview: vi.fn(),
        previewIframeRef: { current: iframe },
        pendingTimelineEditPathRef: { current: new Set<string>() },
        uploadProjectFiles: vi.fn(),
        canEdit: (element) =>
          element.id === "sub-member" ? { blocked: true, reason: "Reserved by an agent" } : true,
      });
      return null;
    }
    const { unmount } = mountHarness(<Harness />);
    if (!hook) throw new Error("Expected hook to mount");

    await act(async () => {
      await hook!.setAudioGroupAttribute.setQuiet("hf-group", "data-volume", "0.5", "Set volume");
      await flushAsyncWork();
    });

    expect(showToast).toHaveBeenCalledWith("Reserved by an agent", "error");
    expect(fetchMock).not.toHaveBeenCalled();
    unmount();
  });

  it("refuses auto-grouping before it patches existing clips", async () => {
    const iframe = document.createElement("iframe");
    document.body.append(iframe);
    const doc = iframe.contentDocument;
    if (!doc) throw new Error("Expected iframe document");
    doc.body.innerHTML =
      '<audio id="voice-1" data-start="0" data-duration="5"></audio>' +
      '<audio id="voice-2" data-start="5" data-duration="5"></audio>';
    const voice1 = timelineElement({ id: "voice-1", tag: "audio", track: 0, zIndex: 0 });
    const voice2 = timelineElement({ id: "voice-2", tag: "audio", track: 1, zIndex: 0 });
    usePlayerStore.getState().setElements([voice1, voice2]);
    const writeProjectFile = vi.fn<(...args: unknown[]) => Promise<void>>(async () => {});
    const recordEdit = vi.fn(async () => {});
    const showToast = vi.fn();
    const fetchMock = stubProjectFetch(
      '<audio id="voice-1" data-start="0" data-duration="5"></audio>' +
        '<audio id="voice-2" data-start="5" data-duration="5"></audio>',
    );
    const hook = renderTimelineEditingHook({
      timelineElements: [voice1, voice2],
      iframe,
      onZIndexCommit: vi.fn().mockResolvedValue(undefined),
      projectId: "p1",
      writeProjectFile,
      recordEdit,
      showToast,
      canEdit: (element) =>
        element.id === "voice-2" ? { blocked: true, reason: "Reserved by an agent" } : true,
    });

    await expect(
      hook.handleAutoGroupCarveSources(["voice-1", "voice-2"], "voiceover"),
    ).rejects.toThrow("Timeline edit blocked");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(writeProjectFile).not.toHaveBeenCalled();
    expect(recordEdit).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith("Reserved by an agent", "error");
    expect(doc.getElementById("voice-1")?.getAttribute("data-audio-group")).toBeNull();
    expect(doc.getElementById("voiceover")).toBeNull();
    hook.unmount();
  });

  it("reverts an optimistic group live value when the commit is refused", async () => {
    const iframe = document.createElement("iframe");
    document.body.append(iframe);
    const doc = iframe.contentDocument;
    if (!doc) throw new Error("Expected iframe document");
    doc.body.innerHTML =
      '<hf-audio-group id="voiceover" data-volume="1"></hf-audio-group>' +
      '<audio id="voice-1" data-start="0" data-duration="5"></audio>';
    const member = {
      ...timelineElement({ id: "voice-1", tag: "audio", track: 0, zIndex: 0 }),
      audioGroup: "voiceover",
      audioGroupVolume: 1,
    };
    usePlayerStore.getState().setElements([member]);
    const writeProjectFile = vi.fn<(...args: unknown[]) => Promise<void>>(async () => {});
    const recordEdit = vi.fn(async () => {});
    const showToast = vi.fn();
    const hook = renderTimelineEditingHook({
      timelineElements: [member],
      iframe,
      onZIndexCommit: vi.fn().mockResolvedValue(undefined),
      projectId: "p1",
      writeProjectFile,
      recordEdit,
      showToast,
      canEdit: () => ({ blocked: true, reason: "Reserved by an agent" }),
    });

    await act(async () => {
      hook.setAudioGroupAttribute.setLive("voiceover", "data-volume", "0.4");
    });
    expect(doc.getElementById("voiceover")?.getAttribute("data-volume")).toBe("0.4");
    expect(usePlayerStore.getState().elements[0]?.audioGroupVolume).toBe(0.4);

    await act(async () => {
      await hook.setAudioGroupAttribute.setQuiet("voiceover", "data-volume", "0.4", "Set volume");
    });

    expect(doc.getElementById("voiceover")?.getAttribute("data-volume")).toBe("1");
    expect(usePlayerStore.getState().elements[0]?.audioGroupVolume).toBe(1);
    expect(writeProjectFile).not.toHaveBeenCalled();
    expect(recordEdit).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith("Reserved by an agent", "error");
    hook.unmount();
  });
});

// Regression: track()/guard() must return the same wrapped handler across
// renders for the same fn, or a consumer using it as a memo/effect
// dependency re-runs on every render for nothing.
describe("useTimelineEditing: handler identity is stable across renders", () => {
  it("returns the same handleTimelineElementMove reference on a re-render", () => {
    const iframe = createPreviewIframe([{ id: "clip", track: 0 }]);
    const clip = timelineElement({ id: "clip", track: 0, zIndex: 0 });
    stubProjectFetch('<div id="clip" data-start="0" data-track-index="0"></div>');
    // Every option below is hoisted (created once), matching a real caller's
    // stable useCallback/selector inputs — a fresh vi.fn() per render would
    // change handleTimelineElementMove's own identity regardless of the fix.
    const timelineElements = [clip];
    const showToast = vi.fn();
    const writeProjectFile = vi.fn();
    const recordEdit = vi.fn();
    const reloadPreview = vi.fn();
    const uploadProjectFiles = vi.fn();
    const previewIframeRef = { current: iframe };
    const pendingTimelineEditPathRef = { current: new Set<string>() };
    const seen: unknown[] = [];
    let bumpTick = 0;
    let bump = () => {};
    function Harness() {
      const [, setTick] = React.useState(0);
      bump = () => setTick((t) => t + 1);
      bumpTick += 1;
      const hook = useTimelineEditing({
        projectId: "p1",
        activeCompPath: "index.html",
        timelineElements,
        showToast,
        writeProjectFile,
        recordEdit,
        reloadPreview,
        previewIframeRef,
        pendingTimelineEditPathRef,
        uploadProjectFiles,
      });
      seen.push(hook.handleTimelineElementMove);
      return null;
    }
    const { unmount } = mountHarness(<Harness />);
    act(() => bump());
    expect(bumpTick).toBeGreaterThan(1);
    expect(seen[0]).toBe(seen[1]);
    unmount();
  });
});

describe("useTimelineEditing effect saves report what happened", () => {
  const LOCKED = { blocked: true as const, reason: "Reserved by an agent" };

  it("resolves a saved clip effect as saved", async () => {
    const { clip, setElementFxAttribute, writeProjectFile, unmount } = setupSingleClipHarness();
    let outcome: unknown;
    await act(async () => {
      outcome = await setElementFxAttribute.setQuiet(clip, "data-hf-audio-fx", "echo", "Apply");
    });
    expect(outcome).toEqual({ status: "saved" });
    expect(writeProjectFile).toHaveBeenCalled();
    unmount();
  });

  it("resolves a clip effect on a locked clip as refused, with the host's reason", async () => {
    const { clip, setElementFxAttribute, writeProjectFile, unmount } = setupSingleClipHarness({
      canEdit: () => LOCKED,
    });
    let outcome: unknown;
    await act(async () => {
      outcome = await setElementFxAttribute.setQuiet(clip, "data-hf-audio-fx", "echo", "Apply");
    });
    expect(outcome).toEqual({ status: "refused", reason: "Reserved by an agent" });
    expect(writeProjectFile).not.toHaveBeenCalled();
    unmount();
  });

  it("resolves a clip effect whose write fails as failed", async () => {
    const { clip, setElementFxAttribute, writeProjectFile, unmount } = setupSingleClipHarness();
    writeProjectFile.mockRejectedValue(new Error("disk full"));
    let outcome: unknown;
    await act(async () => {
      outcome = await setElementFxAttribute.setQuiet(clip, "data-hf-audio-fx", "echo", "Apply");
    });
    expect(outcome).toEqual({ status: "failed", reason: expect.stringContaining("disk full") });
    unmount();
  });

  it("resolves a group audio effect on a locked group as refused", async () => {
    const member = timelineElement({ id: "clip", track: 0, zIndex: 0 });
    usePlayerStore.getState().setElements([{ ...member, audioGroup: "hf-group" }]);
    const { setAudioGroupAttribute, writeProjectFile, unmount } = setupSingleClipHarness({
      canEdit: () => LOCKED,
    });
    let outcome: unknown;
    await act(async () => {
      outcome = await setAudioGroupAttribute.setQuiet("hf-group", "data-volume", "0.5", "Volume");
    });
    expect(outcome).toEqual({ status: "refused", reason: "Reserved by an agent" });
    expect(writeProjectFile).not.toHaveBeenCalled();
    unmount();
  });
});

// main 0 > intro 2 > logo 3 > badge 1: rows are master time, files are local.
const NESTED_PREVIEW = `
  <div data-composition-id="main" data-start="0" data-duration="20">
    <div id="intro" data-hf-id="hf-intro" data-composition-id="intro" data-start="2" data-duration="10">
      <div data-composition-id="intro" data-composition-file="compositions/intro.html">
        <video id="vo" data-start="7" data-duration="2" data-hf-media-start-basis="global"></video>
        <div id="logo" data-hf-id="hf-logo" data-composition-id="logo" data-start="3" data-duration="5">
          <div data-composition-id="logo" data-composition-file="compositions/logo.html">
            <div id="badge" data-hf-id="hf-badge" class="clip" data-start="1" data-duration="2"></div>
            <div id="star" data-hf-id="hf-star" data-composition-id="star" data-start="1.5" data-duration="2">
              <div data-composition-id="star" data-composition-file="compositions/star.html"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>`;
const NESTED_FILES: Record<string, string> = {
  "index.html": [
    `<div data-composition-id="main" data-duration="20">`,
    `  <div id="intro" data-composition-id="intro" data-composition-src="compositions/intro.html" data-start="2" data-duration="10"></div>`,
    `</div>`,
  ].join("\n"),
  "compositions/intro.html": [
    `<div data-composition-id="intro" data-duration="10">`,
    `  <div id="intro-bg" class="clip" data-start="0" data-duration="10"></div>`,
    `  <video id="vo" data-start="7" data-duration="2" data-hf-media-start-basis="global"></video>`,
    `  <div id="logo" data-composition-id="logo" data-composition-src="compositions/logo.html" data-start="3" data-duration="5"></div>`,
    `</div>`,
  ].join("\n"),
  "compositions/logo.html": [
    `<div data-composition-id="logo" data-duration="5">`,
    `  <div id="logo-bg" class="clip" data-start="0" data-duration="5"></div>`,
    `  <div id="badge" class="clip" data-start="1" data-duration="2"></div>`,
    `  <div id="star" data-composition-id="star" data-composition-src="compositions/star.html" data-start="1.5" data-duration="2"></div>`,
    `</div>`,
  ].join("\n"),
};

function setupNestedHarness() {
  const iframe = document.createElement("iframe");
  document.body.append(iframe);
  const doc = iframe.contentDocument!;
  doc.body.innerHTML = NESTED_PREVIEW;
  const row = (domId: string) => parseTimelineFromDOM(doc, 20).find((e) => e.domId === domId)!;
  // The app's path: the runtime manifest's root clips, then the missing-host pass.
  const manifestRow = (domId: string) => {
    const intro = { id: "intro", start: 2, duration: 10, track: 0, kind: "composition" };
    const clip = { ...intro, tagName: "div", compositionId: "intro" } as ClipManifestClip;
    const hostEl = doc.getElementById("intro");
    const roots = [createTimelineElementFromManifestClip({ clip, fallbackIndex: 0, doc, hostEl })];
    const win = iframe.contentWindow as IframeWindow;
    return buildMissingCompositionElements(doc, win, roots, 20).missing.find(
      (e) => e.domId === domId,
    )!;
  };
  const playsAt = (domId: string) => {
    const resolver = createRuntimeStartTimeResolver({
      includeAuthoredTimingAttrs: true,
      documentRef: doc,
    });
    const el = doc.getElementById(domId)!;
    return el.tagName === "VIDEO"
      ? resolver.resolveMediaStartForElement(el)
      : resolver.resolveStartForElement(el);
  };
  const writeProjectFile = vi.fn<(path: string, content: string) => Promise<void>>(async () => {});
  const written = (path: string, domId: string, attr: string) => {
    const call = writeProjectFile.mock.calls.find(([p]) => p === path);
    if (!call) throw new Error(`nothing written to ${path}`);
    const el = new DOMParser().parseFromString(call[1], "text/html").getElementById(domId);
    return el?.getAttribute(attr);
  };
  const writtenRootDuration = (path: string) => {
    const call = writeProjectFile.mock.calls.find(([p]) => p === path)!;
    return new DOMParser()
      .parseFromString(call[1], "text/html")
      .querySelector("[data-composition-id]")
      ?.getAttribute("data-duration");
  };
  const fetchMock = stubProjectFetch(NESTED_FILES);
  const scaleCalls = () =>
    fetchMock.mock.calls
      .filter((call) => requestUrl(call[0]).includes("/gsap-mutations"))
      .flatMap((call) => {
        const body = JSON.parse(String((call[1] as RequestInit).body));
        return body.mutations ?? [body];
      })
      .filter((body) => body.type === "scale-positions");
  usePlayerStore.getState().setDuration(20);
  const hook = renderTimelineEditingHook({
    timelineElements: parseTimelineFromDOM(doc, 20),
    iframe,
    onZIndexCommit: vi.fn().mockResolvedValue(undefined),
    projectId: "p1",
    writeProjectFile,
    recordEdit: vi.fn(async () => {}),
  });
  return {
    doc,
    row,
    manifestRow,
    playsAt,
    written,
    writtenRootDuration,
    writeProjectFile,
    scaleCalls,
    ...hook,
  };
}

describe("useTimelineEditing: nested rows write composition-local starts", () => {
  it("round-trips a depth-2 drag: drawn and played at the drop point, written local", async () => {
    const h = setupNestedHarness();
    const logo = h.row("logo");
    expect(logo.start).toBe(5);

    await act(async () => {
      await h.move(logo, { start: 6, track: logo.track });
    });

    expect(h.written("compositions/intro.html", "logo", "data-start")).toBe("4");
    expect(h.doc.getElementById("logo")?.getAttribute("data-start")).toBe("4");
    expect(h.row("logo").start).toBe(6);
    expect(h.playsAt("logo")).toBe(6);
    expect(h.writtenRootDuration("compositions/intro.html")).toBe("10");
    h.unmount();
  });

  it("round-trips a depth-3 drag through two enclosing hosts", async () => {
    const h = setupNestedHarness();
    const badge = h.row("badge");
    expect(badge.start).toBe(6);

    await act(async () => {
      await h.move(badge, { start: 7, track: badge.track });
    });

    expect(h.written("compositions/logo.html", "badge", "data-start")).toBe("2");
    expect(h.row("badge").start).toBe(7);
    expect(h.playsAt("badge")).toBe(7);
    expect(h.writtenRootDuration("compositions/logo.html")).toBe("5");
    h.unmount();
  });

  it("round-trips a legacy root-time video inside a sub-composition, writing master time", async () => {
    const h = setupNestedHarness();
    const vo = h.row("vo");
    expect(vo.start).toBe(7);

    await act(async () => {
      await h.move(vo, { start: 8, track: vo.track });
    });

    expect(h.written("compositions/intro.html", "vo", "data-start")).toBe("8");
    expect(h.row("vo").start).toBe(8);
    expect(h.playsAt("vo")).toBe(8);
    h.unmount();
  });

  it("writes a local start on a head trim and leaves a tail trim's start alone", async () => {
    const h = setupNestedHarness();
    await act(async () => {
      await h.resize(h.row("logo"), { start: 5.5, duration: 4.5, playbackStart: undefined });
    });
    expect(h.written("compositions/intro.html", "logo", "data-start")).toBe("3.5");
    expect(h.written("compositions/intro.html", "logo", "data-duration")).toBe("4.5");
    expect(h.row("logo")).toMatchObject({ start: 5.5, duration: 4.5 });

    h.writeProjectFile.mockClear();
    await act(async () => {
      await h.resize(h.row("logo"), { start: 5.5, duration: 3, playbackStart: undefined });
    });
    expect(h.doc.getElementById("logo")?.getAttribute("data-start")).toBe("3.5");
    expect(h.doc.getElementById("logo")?.getAttribute("data-duration")).toBe("3");
    h.unmount();
  });

  it("scales a head-trimmed nested row's tweens over its local window", async () => {
    const h = setupNestedHarness();
    await act(async () => {
      await h.resize(h.row("logo"), { start: 5.5, duration: 4.5, playbackStart: undefined });
    });
    expect(h.scaleCalls()).toEqual([
      expect.objectContaining({ oldStart: 3, oldDuration: 5, newStart: 3.5, newDuration: 4.5 }),
    ]);
    h.unmount();
  });

  it("writes local starts and a local scale window for a nested group resize", async () => {
    const h = setupNestedHarness();
    await act(async () => {
      await h.groupResize([{ element: h.row("logo"), start: 5.5, duration: 4.5 }]);
    });
    expect(h.written("compositions/intro.html", "logo", "data-start")).toBe("3.5");
    expect(h.scaleCalls()).toEqual([
      expect.objectContaining({ oldStart: 3, oldDuration: 5, newStart: 3.5, newDuration: 4.5 }),
    ]);
    h.unmount();
  });

  it("scales a legacy root-time video's tweens on its host's clock, single and group", async () => {
    const window = { oldStart: 5, oldDuration: 2, newStart: 5.5, newDuration: 1.5 };
    for (const group of [false, true]) {
      const h = setupNestedHarness();
      const vo = h.row("vo");
      await act(async () => {
        if (group) await h.groupResize([{ element: vo, start: 7.5, duration: 1.5 }]);
        else await h.resize(vo, { start: 7.5, duration: 1.5, playbackStart: undefined });
      });
      expect(h.scaleCalls()).toEqual([expect.objectContaining(window)]);
      h.unmount();
      vi.unstubAllGlobals();
    }
  });

  it("stops a head trim past the host's start at the host's start, end held", async () => {
    const h = setupNestedHarness();
    const logo = h.manifestRow("logo");
    expect(logo).toMatchObject({ start: 5, duration: 5, parentCompositionStart: 2 });
    const pps = 100;
    const preview = computeResizePreview(
      {
        element: logo,
        edge: "start",
        originClientX: 0,
        previewStart: 5,
        previewDuration: 5,
        started: true,
        pointerId: 1,
      },
      -4 * pps,
      { scroll: null, pps, buildSnapTargets: () => [] },
    );
    expect(preview).toMatchObject({ previewStart: 2, previewDuration: 8 });

    await act(async () => {
      await h.resize(logo, {
        start: preview.previewStart,
        duration: preview.previewDuration,
        playbackStart: undefined,
      });
    });
    expect(h.written("compositions/intro.html", "logo", "data-start")).toBe("0");
    expect(h.written("compositions/intro.html", "logo", "data-duration")).toBe("8");
    expect(h.row("logo")).toMatchObject({ start: 2, duration: 8 });
    expect(h.scaleCalls()).toEqual([
      expect.objectContaining({ oldStart: 3, oldDuration: 5, newStart: 0, newDuration: 8 }),
    ]);
    h.unmount();
  });

  it("stops a group head trim at the nested member's host start", async () => {
    const h = setupNestedHarness();
    const logo = h.manifestRow("logo");
    const outro: TimelineElement = {
      ...logo,
      id: "outro",
      key: "outro",
      domId: undefined,
      start: 12,
      parentCompositionStart: 0,
    };
    const members = buildTimelineGroupResizeMembers(
      [logo, outro],
      new Set([logo.key ?? logo.id, "outro"]),
      logo.key ?? logo.id,
      "start",
    )!;
    const changes = resolveTimelineGroupResizeChanges(members, "start", -4);
    const logoChange = changes.find((c) => c.key === (logo.key ?? logo.id))!;
    expect(logoChange).toMatchObject({ start: 2, duration: 8 });

    await act(async () => {
      await h.groupResize([
        { element: logo, start: logoChange.start, duration: logoChange.duration },
      ]);
    });
    expect(h.written("compositions/intro.html", "logo", "data-start")).toBe("0");
    expect(h.written("compositions/intro.html", "logo", "data-duration")).toBe("8");
    expect(h.scaleCalls()).toEqual([
      expect.objectContaining({ oldStart: 3, oldDuration: 5, newStart: 0, newDuration: 8 }),
    ]);
    h.unmount();
  });

  it("round-trips a depth-3 host from the manifest path", async () => {
    const h = setupNestedHarness();
    const star = h.manifestRow("star");
    expect(star).toMatchObject({ start: 6.5, parentCompositionStart: 5 });

    await act(async () => {
      await h.move(star, { start: 7.5, track: star.track });
    });

    expect(h.written("compositions/logo.html", "star", "data-start")).toBe("2.5");
    expect(h.playsAt("star")).toBe(7.5);
    expect(h.manifestRow("star").start).toBe(7.5);
    h.unmount();
  });

  it("clamps a nested row dropped before its host's start to the host's start", async () => {
    const h = setupNestedHarness();
    const logo = h.row("logo");
    await act(async () => {
      await h.move(logo, { start: 1, track: logo.track });
    });
    expect(h.written("compositions/intro.html", "logo", "data-start")).toBe("0");
    expect(h.row("logo").start).toBe(2);
    h.unmount();
  });

  it("writes local starts for nested rows in a group move", async () => {
    const h = setupNestedHarness();
    await act(async () => {
      await h.groupMove([{ element: h.row("logo"), start: 6 }]);
    });
    expect(h.written("compositions/intro.html", "logo", "data-start")).toBe("4");
    expect(h.row("logo").start).toBe(6);
    h.unmount();
  });

  it("leaves a top-level row's start as written", async () => {
    const h = setupNestedHarness();
    const intro = h.row("intro");
    expect(intro.parentCompositionStart).toBe(0);

    await act(async () => {
      await h.move(intro, { start: 3, track: intro.track });
    });

    expect(h.written("index.html", "intro", "data-start")).toBe("3");
    expect(h.row("intro").start).toBe(3);
    h.unmount();
  });

  it("hands the SDK a local start for a nested clip in the open file", async () => {
    const source = [
      `<div data-hf-id="hf-main" data-hf-root data-composition-id="main" data-duration="20">`,
      `  <div id="intro" data-hf-id="hf-intro" data-composition-id="intro" data-start="2" data-duration="10">`,
      `    <div id="clip" data-hf-id="hf-clip" data-start="1" data-duration="2"></div>`,
      `  </div>`,
      `</div>`,
    ].join("\n");
    const iframe = document.createElement("iframe");
    document.body.append(iframe);
    iframe.contentDocument!.body.innerHTML = source;
    const clip = parseTimelineFromDOM(iframe.contentDocument!, 20).find((e) => e.domId === "clip")!;
    expect(clip.start).toBe(3);
    const sdkSession = await openComposition(source);
    const writeProjectFile = vi.fn<(...args: unknown[]) => Promise<void>>(async () => {});
    stubProjectFetch(source);
    usePlayerStore.getState().setDuration(20);
    const hook = renderTimelineEditingHook({
      timelineElements: [clip],
      iframe,
      onZIndexCommit: vi.fn().mockResolvedValue(undefined),
      projectId: "p1",
      writeProjectFile,
      recordEdit: vi.fn(async () => {}),
      sdkSession,
      publishSdkSession: vi.fn<TimelinePublishSdkSession>(() => "published"),
    });

    await act(async () => {
      await hook.move(clip, { start: 4, track: clip.track });
    });

    expect(writeProjectFile.mock.calls[0]?.[1]).toContain(
      'id="clip" data-hf-id="hf-clip" data-start="2"',
    );
    hook.unmount();
  });
});

describe("clip timing edits sync GSAP exactly once", () => {
  const SCENE_PATH = "compositions/scene.html";
  const SCENE_SOURCE = [
    `<div data-hf-id="hf-stage" data-hf-root data-composition-id="scene" data-duration="10">`,
    `  <div id="scene" data-hf-id="hf-scene" data-start="1" data-duration="4"><h1 data-hf-id="hf-title">Hi</h1></div>`,
    `  <div id="side" data-hf-id="hf-side" data-start="0" data-duration="8"></div>`,
    `</div>`,
    `<script>`,
    `const tl = gsap.timeline({ paused: true });`,
    `tl.to("#scene", { x: 1, duration: 1 }, 1);`,
    `tl.from("#scene h1", { y: 20, duration: 1 }, 1.5);`,
    `tl.to("#side", { x: 5, duration: 1 }, 2);`,
    `window.__timelines = [tl];`,
    `</script>`,
  ].join("\n");

  // A project whose files live in memory, with the GSAP route running the real server writer on them.
  function stubProjectFiles(initial: Record<string, string>) {
    const files = { ...initial };
    const pathAfter = (url: string, marker: string) => decodeURIComponent(url.split(marker)[1]!);
    const applyServerMutation = (path: string, body: Record<string, unknown>) => {
      const before = files[path]!;
      const doc = new DOMParser().parseFromString(before, "text/html");
      const root = doc.querySelector("template")?.content ?? doc;
      const old = [...root.querySelectorAll("script")]
        .map((script) => script.textContent ?? "")
        .find((text) => text.includes("gsap.timeline"))!;
      const next =
        body.type === "shift-positions"
          ? shiftPositionsInScript(old, String(body.targetSelector), Number(body.delta), root)
          : scalePositionsInScript(
              old,
              String(body.targetSelector),
              Number(body.oldStart),
              Number(body.oldDuration),
              Number(body.newStart),
              Number(body.newDuration),
              root,
            );
      const after = before.replace(old, next);
      files[path] = after;
      return {
        ok: true,
        mutated: after !== before,
        changed: after !== before,
        scriptText: next,
        before,
        after,
      };
    };
    const fetchMock = vi.fn(
      async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const url = requestUrl(input);
        if (url.includes("/gsap-mutation-capabilities"))
          return jsonResponse({ atomicOwnershipPairs: true });
        if (url.includes("/gsap-mutations/")) {
          return jsonResponse(
            applyServerMutation(pathAfter(url, "/gsap-mutations/"), JSON.parse(String(init?.body))),
          );
        }
        if (url.includes("/gsap-mutations-batch/")) {
          const path = pathAfter(url, "/gsap-mutations-batch/");
          const steps = (
            JSON.parse(String(init?.body)) as { mutations: Record<string, unknown>[] }
          ).mutations.map((mutation) => applyServerMutation(path, mutation));
          const last = steps[steps.length - 1]!;
          return jsonResponse({
            ...last,
            before: steps[0]!.before,
            mutated: steps[0]!.before !== last.after,
            changed: steps[0]!.before !== last.after,
          });
        }
        if (url.includes("/files/"))
          return jsonResponse({ content: files[pathAfter(url, "/files/")] });
        throw new Error(`Unexpected fetch: ${url}`);
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    const writeProjectFile = vi.fn(async (path: string, content: string) => {
      files[path] = content;
    });
    return { files, fetchMock, writeProjectFile };
  }

  async function setupScene(withSdk: boolean, source = SCENE_SOURCE) {
    const project = stubProjectFiles({ [SCENE_PATH]: source });
    const iframe = createPreviewIframe([
      { id: "scene", track: 0 },
      { id: "side", track: 1 },
    ]);
    const scene = timelineElement({
      id: "scene",
      track: 0,
      zIndex: 0,
      start: 1,
      duration: 4,
      sourceFile: SCENE_PATH,
    });
    const side = timelineElement({
      id: "side",
      track: 1,
      zIndex: 0,
      start: 0,
      duration: 8,
      sourceFile: SCENE_PATH,
    });
    usePlayerStore.getState().setDuration(10);
    const hook = renderTimelineEditingHook({
      timelineElements: [scene, side],
      iframe,
      onZIndexCommit: vi.fn().mockResolvedValue(undefined),
      projectId: "p1",
      activeCompPath: SCENE_PATH,
      writeProjectFile: project.writeProjectFile,
      recordEdit: vi.fn(async () => {}),
      sdkSession: withSdk ? await openComposition(source) : undefined,
      publishSdkSession: vi.fn<TimelinePublishSdkSession>(() => "published"),
    });
    const tweens = () =>
      project.files[SCENE_PATH]!.split("\n").filter((line) => line.startsWith("tl."));
    return { ...project, hook, scene, side, tweens };
  }

  it("a move then a stretch through the SDK sync once in a template file with a config script first", async () => {
    const withConfig = `<template id="scene-template">\n${SCENE_SOURCE.replace(
      "<script>",
      "<script>gsap.config({ nullTargetWarn: false });</script>\n<script>",
    )}\n</template>`;
    const h = await setupScene(true, withConfig);
    await act(async () => {
      await h.hook.move(h.scene, { start: 3, track: h.scene.track });
      await flushAsyncWork();
    });
    const moved = { ...h.scene, start: 3 };
    await act(async () => {
      await h.hook.resize(moved, { start: 3, duration: 6, playbackStart: undefined });
      await flushAsyncWork();
    });
    expect(h.tweens()).toEqual([
      `tl.to("#scene", { x: 1, duration: 1.5 }, 3);`,
      `tl.from("#scene h1", { y: 20, duration: 1.5 }, 3.75);`,
      `tl.to("#side", { x: 5, duration: 1 }, 2);`,
    ]);
    h.hook.unmount();
  });

  for (const withSdk of [true, false]) {
    const via = withSdk ? "through the SDK" : "through the server (no SDK session)";

    it(`a move ${via} lands each tween once`, async () => {
      const h = await setupScene(withSdk);
      await act(async () => {
        await h.hook.move(h.scene, { start: 3, track: h.scene.track });
        await flushAsyncWork();
      });
      expect(h.tweens()).toEqual([
        `tl.to("#scene", { x: 1, duration: 1 }, 3);`,
        `tl.from("#scene h1", { y: 20, duration: 1 }, 3.5);`,
        `tl.to("#side", { x: 5, duration: 1 }, 2);`,
      ]);
      h.hook.unmount();
    });

    it(`a resize ${via} scales each tween once`, async () => {
      const h = await setupScene(withSdk);
      await act(async () => {
        await h.hook.resize(h.scene, { start: 1, duration: 8, playbackStart: undefined });
        await flushAsyncWork();
      });
      expect(h.tweens()).toEqual([
        `tl.to("#scene", { x: 1, duration: 2 }, 1);`,
        `tl.from("#scene h1", { y: 20, duration: 2 }, 2);`,
        `tl.to("#side", { x: 5, duration: 1 }, 2);`,
      ]);
      h.hook.unmount();
    });

    it(`a group move ${via} lands each tween once`, async () => {
      const h = await setupScene(withSdk);
      await act(async () => {
        await h.hook.groupMove([
          { element: h.scene, start: 3 },
          { element: h.side, start: 1 },
        ]);
        await flushAsyncWork();
      });
      expect(h.tweens()).toEqual([
        `tl.to("#scene", { x: 1, duration: 1 }, 3);`,
        `tl.from("#scene h1", { y: 20, duration: 1 }, 3.5);`,
        `tl.to("#side", { x: 5, duration: 1 }, 3);`,
      ]);
      if (!withSdk) {
        const gsapUrls = h.fetchMock.mock.calls
          .map((call) => requestUrl(call[0]))
          .filter((url) => url.includes("/gsap-mutations"));
        // Both clips live in one file, so their rewrites travel as one request.
        expect(gsapUrls).toEqual([expect.stringContaining("/gsap-mutations-batch/")]);
      }
      h.hook.unmount();
    });
  }
});
