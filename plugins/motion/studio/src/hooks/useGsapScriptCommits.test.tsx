// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the two preview-sync primitives so we can assert which path runCommit took.
// `patchRuntimeTweenInPlace` is the instant in-place patch; `applySoftReload` is
// the existing fallback. `extractGsapScriptText` is re-exported from the same
// module and used elsewhere in the hook — keep it a harmless stub.
const patchRuntimeTweenInPlace = vi.fn<(...args: unknown[]) => boolean>();
const applySoftReload = vi.fn<(...args: unknown[]) => string>();
const trackStudioEvent = vi.fn();
const readNestedFiles = vi.fn<(...args: unknown[]) => unknown>(() => null);

vi.mock("./gsapRuntimePatch", () => ({
  patchRuntimeTweenInPlace: (...args: unknown[]) => patchRuntimeTweenInPlace(...args),
}));
vi.mock("../utils/gsapSoftReload", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../utils/gsapSoftReload")>()),
  applySoftReload: (...args: unknown[]) => applySoftReload(...args),
  extractGsapScriptText: () => "",
  readNestedFiles: (...args: unknown[]) => readNestedFiles(...args),
}));
vi.mock("../utils/studioTelemetry", () => ({
  trackStudioEvent: (...args: unknown[]) => trackStudioEvent(...args),
}));

// Tell React this is an act-capable environment so act(...) flushes effects
// without warning (React reads this global at call time).
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import type { DomEditSelection } from "../components/editor/domEditingTypes";
import type {
  CommitMutationCall,
  CommitMutationOptions,
  MutationResult,
} from "./gsapScriptCommitTypes";
import { persistSdkSerialize } from "../utils/sdkCutover";
import { jsonResponse } from "./fetchStubTestUtils";
import { applyPreviewSync, useGsapScriptCommits } from "./useGsapScriptCommits";
import {
  beginStudioPendingEdit,
  hasStudioPendingEdits,
  paintBackNewestStudioPendingEdit,
} from "../utils/studioPendingEdits";
import { observeGsapGesture } from "./gsapGestureOutcome";

// ── applyPreviewSync (pure preview-sync decision) ────────────────────────────

const FAKE_IFRAME = {} as HTMLIFrameElement;

function result(over: Partial<MutationResult> = {}): MutationResult {
  return { ok: true, scriptText: "tl.set('#a',{})", ...over };
}

/** The canonical drag commit options every path-decision test drives with. */
function dragOptions() {
  return {
    label: "drag",
    softReload: true,
    instantPatch: { selector: "#a", change: { kind: "set" as const, props: { x: 10 } } },
  };
}

function syncDragPreview(res: MutationResult, reloadPreview: () => void) {
  applyPreviewSync(FAKE_IFRAME, res, dragOptions(), reloadPreview);
}

function expectSoftReloadedWith(onAsyncFailure: unknown, authoredHtml: string | undefined) {
  expect(applySoftReload).toHaveBeenCalledWith(FAKE_IFRAME, "SCRIPT", {
    onAsyncFailure,
    currentTimeOverride: 0,
    authoredHtml,
  });
}

describe("applyPreviewSync", () => {
  beforeEach(() => {
    patchRuntimeTweenInPlace.mockReset();
    applySoftReload.mockReset();
    trackStudioEvent.mockReset();
  });

  it("instantPatch + patch succeeds: skips both soft reload and full reload", () => {
    patchRuntimeTweenInPlace.mockReturnValue(true);
    const reloadPreview = vi.fn();

    syncDragPreview(result(), reloadPreview);

    expect(patchRuntimeTweenInPlace).toHaveBeenCalledWith(
      FAKE_IFRAME,
      "#a",
      {
        kind: "set",
        props: { x: 10 },
      },
      undefined,
      false,
    );
    expect(applySoftReload).not.toHaveBeenCalled();
    expect(reloadPreview).not.toHaveBeenCalled();
  });

  it("instantPatches: patches every element the batch wrote, rendering once at the end", () => {
    patchRuntimeTweenInPlace.mockReturnValue(true);
    const reloadPreview = vi.fn();

    applyPreviewSync(
      FAKE_IFRAME,
      result(),
      {
        label: "Move animated layer (group)",
        softReload: true,
        instantPatches: [
          { selector: "#a", change: { kind: "set" as const, props: { x: 1 } } },
          { selector: "#b", change: { kind: "set" as const, props: { x: 2 } } },
          { selector: "#c", change: { kind: "set" as const, props: { x: 3 } } },
        ],
      },
      reloadPreview,
    );

    // Only the last patch re-renders — the earlier two defer their seek, so the
    // group repaints once instead of once per member.
    expect(patchRuntimeTweenInPlace.mock.calls.map((call) => [call[1], call[4]])).toEqual([
      ["#a", true],
      ["#b", true],
      ["#c", false],
    ]);
    expect(applySoftReload).not.toHaveBeenCalled();
    expect(reloadPreview).not.toHaveBeenCalled();
  });

  it("applies both plural and singular patches when a caller supplies both", () => {
    patchRuntimeTweenInPlace.mockReturnValue(true);

    applyPreviewSync(
      FAKE_IFRAME,
      result(),
      {
        label: "mixed patch contract",
        instantPatches: [
          { selector: "#group-a", change: { kind: "set" as const, props: { x: 1 } } },
        ],
        instantPatch: {
          selector: "#single-b",
          change: { kind: "set" as const, props: { x: 2 } },
        },
      },
      vi.fn(),
    );

    expect(patchRuntimeTweenInPlace.mock.calls.map((call) => [call[1], call[4]])).toEqual([
      ["#group-a", true],
      ["#single-b", false],
    ]);
  });

  it("instantPatches: one patch that misses falls the whole batch back to the reload", () => {
    patchRuntimeTweenInPlace.mockImplementation((_iframe, selector) => selector !== "#b");
    applySoftReload.mockReturnValue("applied");
    const reloadPreview = vi.fn();

    applyPreviewSync(
      FAKE_IFRAME,
      result({ scriptText: "SCRIPT" }),
      {
        label: "Move animated layer (group)",
        softReload: true,
        instantPatches: [
          { selector: "#a", change: { kind: "set" as const, props: { x: 1 } } },
          { selector: "#b", change: { kind: "set" as const, props: { x: 2 } } },
        ],
      },
      reloadPreview,
    );

    // A half-patched preview is worse than a reloaded one: "#a" landed, "#b" did
    // not, so the reload repaints both from the written source.
    expect(applySoftReload).toHaveBeenCalled();
    expect(trackStudioEvent).toHaveBeenCalledWith("gsap_instant_patch_fallback", {
      selector: "#b",
    });
  });

  it("carries a deferred patch miss into the final batch render", () => {
    const previewFallbackLatch = { pending: false };
    applySoftReload.mockReturnValue("applied");
    const reloadPreview = vi.fn();
    patchRuntimeTweenInPlace.mockReturnValueOnce(false).mockReturnValueOnce(true);

    applyPreviewSync(
      FAKE_IFRAME,
      result({ scriptText: "SCRIPT" }),
      {
        label: "Move animated layer (group)",
        softReload: true,
        deferPreviewSync: true,
        previewFallbackLatch,
        instantPatch: { selector: "#missed", change: { kind: "set", props: { x: 1 } } },
      },
      reloadPreview,
    );

    expect(previewFallbackLatch.pending).toBe(true);
    expect(applySoftReload).not.toHaveBeenCalled();

    applyPreviewSync(
      FAKE_IFRAME,
      result({ scriptText: "SCRIPT" }),
      {
        label: "Move animated layer (group)",
        softReload: true,
        previewFallbackLatch,
        instantPatch: { selector: "#final", change: { kind: "set", props: { x: 2 } } },
      },
      reloadPreview,
    );

    expect(previewFallbackLatch.pending).toBe(false);
    expect(applySoftReload).toHaveBeenCalledTimes(1);
  });

  it("carries a deferred write with no instant patch into the final batch render", () => {
    const previewFallbackLatch = { pending: false };
    applySoftReload.mockReturnValue("applied");
    patchRuntimeTweenInPlace.mockReturnValue(true);
    const group = {
      label: "Move animated layer (group)",
      softReload: true,
      previewFallbackLatch,
    };

    applyPreviewSync(
      FAKE_IFRAME,
      result({ scriptText: "SCRIPT" }),
      { ...group, deferPreviewSync: true },
      vi.fn(),
    );
    expect(previewFallbackLatch.pending).toBe(true);
    expect(applySoftReload).not.toHaveBeenCalled();

    applyPreviewSync(
      FAKE_IFRAME,
      result({ scriptText: "SCRIPT" }),
      { ...group, instantPatch: { selector: "#final", change: { kind: "set", props: { x: 2 } } } },
      vi.fn(),
    );
    expect(applySoftReload).toHaveBeenCalledTimes(1);
  });

  it("falls back immediately when a deferred patch miss has no final-render latch", () => {
    patchRuntimeTweenInPlace.mockReturnValue(false);
    applySoftReload.mockReturnValue("applied");

    applyPreviewSync(
      FAKE_IFRAME,
      result({ scriptText: "SCRIPT" }),
      {
        label: "Deferred standalone write",
        softReload: true,
        deferPreviewSync: true,
        instantPatch: { selector: "#missed", change: { kind: "set", props: { x: 1 } } },
      },
      vi.fn(),
    );

    expect(applySoftReload).toHaveBeenCalledTimes(1);
  });

  it("instantPatch + patch fails: falls back to the soft reload, passing onAsyncFailure", () => {
    patchRuntimeTweenInPlace.mockReturnValue(false);
    applySoftReload.mockReturnValue("applied");
    const reloadPreview = vi.fn();

    syncDragPreview(result({ scriptText: "SCRIPT" }), reloadPreview);

    // reloadPreview is wired as onAsyncFailure (3rd arg) so a MotionPath-plugin
    // CDN load failure escalates to a full reload — but it is NOT called eagerly.
    expectSoftReloadedWith(reloadPreview, undefined);
    expect(reloadPreview).not.toHaveBeenCalled();
    // A successful instant patch is the fast path; here it missed → fallback event.
    expect(trackStudioEvent).toHaveBeenCalledWith(
      "gsap_instant_patch_fallback",
      expect.objectContaining({ selector: "#a" }),
    );
  });

  it('instantPatch + patch fails + soft reload "verify-failed": transient, does NOT escalate (U4)', () => {
    patchRuntimeTweenInPlace.mockReturnValue(false);
    applySoftReload.mockReturnValue("verify-failed");
    const reloadPreview = vi.fn();

    syncDragPreview(result({ scriptText: "SCRIPT" }), reloadPreview);

    // U4: "verify-failed" is the TRANSIENT empty-timeline window — the live state
    // is correct, so we must NOT escalate to a full reload.
    expectSoftReloadedWith(reloadPreview, undefined);
    expect(reloadPreview).not.toHaveBeenCalled();
    // Telemetry records the suppressed transient (escalated: false).
    expect(trackStudioEvent).toHaveBeenCalledWith(
      "gsap_soft_reload_outcome",
      expect.objectContaining({
        origin: "preview_sync",
        result: "verify-failed",
        escalated: false,
      }),
    );
  });

  it('instantPatch + patch fails + soft reload "cannot-soft-reload": escalates to full reload', () => {
    patchRuntimeTweenInPlace.mockReturnValue(false);
    applySoftReload.mockReturnValue("cannot-soft-reload");
    const reloadPreview = vi.fn();

    syncDragPreview(result({ scriptText: "SCRIPT" }), reloadPreview);

    // Structural failure: the preview is genuinely stale/broken → full reload.
    expectSoftReloadedWith(reloadPreview, undefined);
    expect(reloadPreview).toHaveBeenCalledTimes(1);
    expect(trackStudioEvent).toHaveBeenCalledWith(
      "gsap_soft_reload_outcome",
      expect.objectContaining({
        origin: "preview_sync",
        result: "cannot-soft-reload",
        escalated: true,
      }),
    );
  });

  it("no instantPatch + softReload + scriptText: soft reloads, passing onAsyncFailure", () => {
    applySoftReload.mockReturnValue("applied");
    const reloadPreview = vi.fn();

    applyPreviewSync(
      FAKE_IFRAME,
      result({ scriptText: "SCRIPT" }),
      { label: "x", softReload: true },
      reloadPreview,
    );

    expect(patchRuntimeTweenInPlace).not.toHaveBeenCalled();
    expectSoftReloadedWith(reloadPreview, undefined);
    expect(reloadPreview).not.toHaveBeenCalled();
    // "applied" emits no telemetry (only the failure paths do).
    expect(trackStudioEvent).not.toHaveBeenCalled();
  });

  it('no instantPatch + softReload "verify-failed": transient, does NOT escalate (U4)', () => {
    applySoftReload.mockReturnValue("verify-failed");
    const reloadPreview = vi.fn();

    applyPreviewSync(
      FAKE_IFRAME,
      result({ scriptText: "SCRIPT" }),
      { label: "x", softReload: true },
      reloadPreview,
    );

    // onAsyncFailure is wired, but the transient result does not trigger it.
    expectSoftReloadedWith(reloadPreview, undefined);
    expect(reloadPreview).not.toHaveBeenCalled();
    expect(trackStudioEvent).toHaveBeenCalledWith(
      "gsap_soft_reload_outcome",
      expect.objectContaining({ result: "verify-failed", escalated: false }),
    );
  });

  it('no instantPatch + softReload "cannot-soft-reload": escalates to full reload', () => {
    applySoftReload.mockReturnValue("cannot-soft-reload");
    const reloadPreview = vi.fn();

    applyPreviewSync(
      FAKE_IFRAME,
      result({ scriptText: "SCRIPT" }),
      { label: "x", softReload: true },
      reloadPreview,
    );

    expectSoftReloadedWith(reloadPreview, undefined);
    expect(reloadPreview).toHaveBeenCalledTimes(1);
    expect(trackStudioEvent).toHaveBeenCalledWith(
      "gsap_soft_reload_outcome",
      expect.objectContaining({ result: "cannot-soft-reload", escalated: true }),
    );
  });

  it("no instantPatch + no softReload: full reload (today's behavior)", () => {
    const reloadPreview = vi.fn();

    applyPreviewSync(FAKE_IFRAME, result(), { label: "x" }, reloadPreview);

    expect(patchRuntimeTweenInPlace).not.toHaveBeenCalled();
    expect(applySoftReload).not.toHaveBeenCalled();
    expect(reloadPreview).toHaveBeenCalledTimes(1);
  });
});

// ── runCommit (full hook path: persist + preview sync) ───────────────────────

type HookApi = ReturnType<typeof useGsapScriptCommits>;

let cleanup: (() => void) | null = null;

function renderCommitHook(
  options: {
    writeProjectFile?: (path: string, content: string) => Promise<void>;
    iframe?: HTMLIFrameElement;
  } = {},
) {
  const reloadPreview = vi.fn();
  const onCacheInvalidate = vi.fn();
  const onFileContentChanged = vi.fn();
  const forceReloadSdkSession = vi.fn();
  const recordEdit = vi.fn(async () => {});
  const showToast = vi.fn();

  const captured: { api: HookApi | null } = { api: null };
  function Probe() {
    captured.api = useGsapScriptCommits({
      projectIdRef: { current: "proj-1" },
      activeCompPath: "index.html",
      previewIframeRef: { current: options.iframe ?? FAKE_IFRAME },
      editHistory: { recordEdit },
      reloadPreview,
      onCacheInvalidate,
      onFileContentChanged,
      showToast,
      sdkSession: null,
      writeProjectFile: options.writeProjectFile,
      forceReloadSdkSession,
    });
    return null;
  }

  const container = document.createElement("div");
  const root = createRoot(container);
  act(() => {
    root.render(<Probe />);
  });
  cleanup = () => act(() => root.unmount());
  const hookApi = captured.api;
  if (!hookApi) throw new Error("hook did not initialize");
  return {
    api: hookApi,
    reloadPreview,
    onCacheInvalidate,
    onFileContentChanged,
    forceReloadSdkSession,
    recordEdit,
    showToast,
  };
}

const selection: DomEditSelection = { id: "a", selector: "#a" } as DomEditSelection;

async function commitBatch(calls: CommitMutationCall[], options: CommitMutationOptions) {
  const deps = renderCommitHook();
  const batch = deps.api.commitMutation.batch;
  if (!batch) throw new Error("batch capability missing");
  await act(async () => {
    await batch(calls, options);
  });
  return deps;
}

function mockFetchResult(over: Partial<MutationResult> = {}): void {
  const body: MutationResult = {
    ok: true,
    changed: true,
    before: "BEFORE",
    after: "AFTER",
    scriptText: "SCRIPT",
    ...over,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => body }) as unknown as Response),
  );
}

describe("a GSAP script commit", () => {
  it("counts as a pending edit from its call until it lands, so a quick Cmd+Z waits for it", async () => {
    mockFetchResult();
    const deps = renderCommitHook();
    let committed!: Promise<unknown>;
    act(() => {
      committed = deps.api.commitMutation(
        selection,
        { type: "remove-all-keyframes", animationId: "a" },
        { label: "Remove all keyframes" },
      );
    });
    expect(hasStudioPendingEdits()).toBe(true);
    await act(async () => void (await committed));
    expect(hasStudioPendingEdits()).toBe(false);
  });

  it("a gesture's write after an await is still its edit, and once undo paints that edit back it saves without drawing it", async () => {
    applySoftReload.mockReturnValue("applied");
    let respond!: () => void;
    const body: MutationResult = { ok: true, changed: true, after: "AFTER", scriptText: "SCRIPT" };
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((resolve) => {
            respond = () => resolve({ ok: true, json: async () => body } as unknown as Response);
          }),
      ),
    );
    const deps = renderCommitHook();
    const edit = beginStudioPendingEdit(() => () => undefined);
    const saved = edit.adopt(async () => {
      const writes = observeGsapGesture(deps.api.commitMutation);
      await Promise.resolve();
      return writes.commit!(selection, { x: 10 }, { label: "Move layer", softReload: true });
    });
    edit.settle(saved);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());

    const shown = paintBackNewestStudioPendingEdit();
    expect(shown).not.toBeNull();
    await act(async () => {
      respond();
      await saved;
    });
    expect(deps.onFileContentChanged).toHaveBeenCalledWith("index.html", "AFTER");
    expect(applySoftReload).not.toHaveBeenCalled();

    shown!.showAgain();
    expect(applySoftReload).toHaveBeenCalledTimes(1);
  });
});

describe("runCommit — instantPatch wiring", () => {
  it("explains a deliberate mutation that the server safely rejected as unchanged", async () => {
    mockFetchResult({ changed: false });
    const deps = renderCommitHook();

    await act(async () => {
      await deps.api.commitMutation(
        selection,
        { type: "move-keyframe", fromPercentage: 50, toPercentage: 100 },
        { label: "Move keyframe" },
      );
    });

    expect(deps.showToast).toHaveBeenCalledWith("A keyframe already exists at that time", "info");
  });

  it("publishes the server mutation outcome to callers", async () => {
    mockFetchResult({ changed: false });
    const deps = renderCommitHook();
    let commitResult: MutationResult | undefined;

    await act(async () => {
      await deps.api.commitMutation(
        selection,
        { type: "move-keyframe", fromPercentage: 50, toPercentage: 75 },
        {
          label: "Move keyframe",
          onResult: (result) => {
            commitResult = result;
          },
        },
      );
    });

    expect(commitResult).toEqual(expect.objectContaining({ ok: true, changed: false }));
  });

  it("no-op commit with an instantPatch still patches the runtime (paired x/y commits)", async () => {
    patchRuntimeTweenInPlace.mockReturnValue(true);
    mockFetchResult({ changed: false });
    const deps = renderCommitHook();

    await act(async () => {
      await deps.api.commitMutation(
        selection,
        { type: "update-property", property: "y", value: 311 },
        {
          label: "Move layer",
          softReload: true,
          instantPatch: { selector: "#a", change: { kind: "set", props: { x: 485, y: 311 } } },
        },
      );
    });

    // The file already matched (changed:false) but the runtime patch deferred
    // from the paired first commit must still land.
    expect(patchRuntimeTweenInPlace).toHaveBeenCalledWith(
      FAKE_IFRAME,
      "#a",
      {
        kind: "set",
        props: { x: 485, y: 311 },
      },
      undefined,
      false,
    );
    expect(deps.reloadPreview).not.toHaveBeenCalled();
  });

  it("no-op batch still applies every plural instant patch", async () => {
    patchRuntimeTweenInPlace.mockReturnValue(true);
    mockFetchResult({ changed: false });
    const deps = renderCommitHook();
    const batch = deps.api.commitMutation.batch;
    if (!batch) throw new Error("batch capability missing");

    await act(async () => {
      await batch(
        [
          {
            selection,
            mutation: { type: "update-property", property: "x", value: 10 },
            options: {
              label: "Move layer",
              instantPatch: { selector: "#a", change: { kind: "set", props: { x: 10 } } },
            },
          },
          {
            selection: { ...selection, id: "b", selector: "#b" },
            mutation: { type: "update-property", property: "x", value: 20 },
            options: {
              label: "Move layer",
              instantPatch: { selector: "#b", change: { kind: "set", props: { x: 20 } } },
            },
          },
        ],
        { label: "Move animated layer (group)" },
      );
    });

    expect(patchRuntimeTweenInPlace.mock.calls.map((call) => call[1])).toEqual(["#a", "#b"]);
    expect(deps.reloadPreview).not.toHaveBeenCalled();
  });

  it("batch where a write without an instant patch soft-reloads instead of patching the rest", async () => {
    // A corner resize saves size (no in-place patch) and position (patched) in one batch.
    patchRuntimeTweenInPlace.mockReturnValue(true);
    applySoftReload.mockReturnValue("applied");
    mockFetchResult({ changed: true });
    const position = { selector: "#a", change: { kind: "set" as const, props: { x: 10 } } };
    const deps = await commitBatch(
      [
        {
          selection,
          mutation: { type: "update-property", property: "width", value: 300 },
          options: { label: "Resize layer" },
        },
        {
          selection,
          mutation: { type: "update-property", property: "x", value: 10 },
          options: { label: "Resize layer", instantPatch: position },
        },
      ],
      { label: "Resize layer", softReload: true },
    );

    expect(applySoftReload).toHaveBeenCalledTimes(1);
    expect(deps.reloadPreview).not.toHaveBeenCalled();
  });

  it("no-op commit whose instant patch MISSES soft-reloads (never full-reloads)", async () => {
    // Server contract: gsap-mutations returns scriptText on EVERY response,
    // including changed:false — so the fallback re-runs the identical script
    // ("applied") instead of escalating a genuine no-op to a full reload.
    patchRuntimeTweenInPlace.mockReturnValue(false);
    applySoftReload.mockReturnValue("applied");
    mockFetchResult({ changed: false });
    const deps = renderCommitHook();

    await act(async () => {
      await deps.api.commitMutation(
        selection,
        { type: "update-property", property: "y", value: 311 },
        {
          label: "Move layer",
          softReload: true,
          instantPatch: { selector: "#a", change: { kind: "set", props: { x: 485, y: 311 } } },
        },
      );
    });

    expectSoftReloadedWith(deps.reloadPreview, "AFTER");
    expect(deps.reloadPreview).not.toHaveBeenCalled();
  });

  beforeEach(() => {
    patchRuntimeTweenInPlace.mockReset();
    applySoftReload.mockReset();
    trackStudioEvent.mockReset();
    readNestedFiles.mockReset().mockReturnValue(null);
  });
  afterEach(() => {
    cleanup?.();
    cleanup = null;
    vi.unstubAllGlobals();
  });

  it.each([
    ["add-keyframe", "add"],
    ["add-with-keyframes", "add"],
    ["convert-to-keyframes", "convert"],
    ["remove-all-keyframes", "remove_all"],
  ])("counts %s only after a changed durable write", async (type, action) => {
    mockFetchResult();
    const deps = renderCommitHook();
    await deps.api.commitMutation(
      selection,
      { type, properties: { text: "private-content" } },
      { label: "Edit" },
    );
    expect(trackStudioEvent.mock.calls.filter(([event]) => event === "keyframe")).toEqual([
      ["keyframe", { action }],
    ]);
  });

  it("counts reset with its explicit action and suppresses intermediate writes", async () => {
    mockFetchResult();
    const deps = renderCommitHook();
    await deps.api.commitMutation(
      selection,
      { type: "convert-to-keyframes" },
      { label: "Convert", keyframeTelemetry: false },
    );
    await deps.api.commitMutation(
      selection,
      { type: "remove-all-keyframes" },
      { label: "Reset", keyframeAction: "reset" },
    );
    expect(trackStudioEvent.mock.calls.filter(([event]) => event === "keyframe")).toEqual([
      ["keyframe", { action: "reset" }],
    ]);
  });

  it("does not count a successful unchanged keyframe write", async () => {
    mockFetchResult({ changed: false });
    const deps = renderCommitHook();
    await deps.api.commitMutation(selection, { type: "add-keyframe" }, { label: "Add" });
    expect(trackStudioEvent.mock.calls.filter(([event]) => event === "keyframe")).toEqual([]);
  });

  it("does not count a failed write that skipReload suppresses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500 })),
    );
    const deps = renderCommitHook();
    await deps.api.commitMutation(
      selection,
      { type: "add-keyframe" },
      { label: "Add", skipReload: true },
    );
    expect(trackStudioEvent.mock.calls.filter(([event]) => event === "keyframe")).toEqual([]);
  });

  it("rejects a refused write with the server's reason in a toast", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: "file changed on disk" }, 409)),
    );
    const deps = renderCommitHook();

    await expect(
      deps.api.commitMutation(selection, { type: "add-keyframe" }, { label: "Add" }),
    ).rejects.toThrow();
    expect(deps.showToast).toHaveBeenCalledWith(
      expect.stringContaining("file changed on disk"),
      "error",
    );
  });

  const NESTED_SCRIPT = 'window.__timelines["root"] = tl;';
  const SUB = `<template><div data-composition-id="sub"><div id="nwid" style="left: 40px"></div></div></template>`;

  // A preview whose top-level timeline tweens an element written in a nested composition file.
  function nestedPreview(): HTMLIFrameElement {
    const doc = document.implementation.createHTMLDocument("");
    doc.body.innerHTML = `<div data-composition-id="root"><div data-composition-file="compositions/sub.html"><div id="nwid"></div></div></div>`;
    const nwid = doc.getElementById("nwid")!;
    const tween = { targets: () => [nwid], vars: { width: 400 } };
    return {
      contentDocument: doc,
      contentWindow: { __timelines: { root: { getChildren: () => [tween] } } },
    } as unknown as HTMLIFrameElement;
  }

  // The mutation endpoint answers the commit; the files endpoint serves the nested file, or fails.
  function mockServer(fileOk: boolean): ReturnType<typeof vi.fn> {
    const body = {
      ok: true,
      changed: true,
      before: "BEFORE",
      after: "AFTER",
      scriptText: NESTED_SCRIPT,
    };
    const fetch = vi.fn(async (url: string) =>
      url.includes("/files/")
        ? ({ ok: fileOk, json: async () => ({ content: SUB }) } as unknown as Response)
        : ({ ok: true, json: async () => body } as unknown as Response),
    );
    vi.stubGlobal("fetch", fetch);
    return fetch;
  }

  async function useRealNestedRead() {
    const actual =
      await vi.importActual<typeof import("../utils/gsapSoftReload")>("../utils/gsapSoftReload");
    readNestedFiles.mockImplementation((...args) =>
      actual.readNestedFiles(...(args as Parameters<typeof actual.readNestedFiles>)),
    );
  }

  it("hands the soft reload the nested composition file it read for a reset element", async () => {
    await useRealNestedRead();
    applySoftReload.mockReturnValue("applied");
    const fetch = mockServer(true);
    const deps = renderCommitHook({ iframe: nestedPreview() });

    await act(async () => {
      await deps.api.commitMutation(selection, { x: 10 }, { label: "drag", softReload: true });
    });

    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/files/compositions%2Fsub.html"), {
      credentials: "omit",
    });
    expect(applySoftReload).toHaveBeenCalledWith(
      expect.anything(),
      NESTED_SCRIPT,
      expect.objectContaining({ nestedFiles: new Map([["compositions/sub.html", SUB]]) }),
    );
  });

  it("reloads the preview in full when that nested file cannot be read", async () => {
    await useRealNestedRead();
    applySoftReload.mockReturnValue("cannot-soft-reload");
    mockServer(false);
    const deps = renderCommitHook({ iframe: nestedPreview() });

    await act(async () => {
      await deps.api.commitMutation(selection, { x: 10 }, { label: "drag", softReload: true });
    });

    expect(applySoftReload).toHaveBeenCalledWith(
      expect.anything(),
      NESTED_SCRIPT,
      expect.objectContaining({ nestedFiles: null }),
    );
    expect(deps.reloadPreview).toHaveBeenCalledTimes(1);
  });

  it("instantPatch succeeds: persists, invalidates cache, NO reload", async () => {
    patchRuntimeTweenInPlace.mockReturnValue(true);
    mockFetchResult();
    const deps = renderCommitHook();

    await act(async () => {
      await deps.api.commitMutation(selection, { x: 10 }, dragOptions());
    });

    expect(fetch).toHaveBeenCalledTimes(1); // source mutation persisted
    expect(deps.recordEdit).toHaveBeenCalledTimes(1);
    expect(deps.onCacheInvalidate).toHaveBeenCalledTimes(1);
    expect(applySoftReload).not.toHaveBeenCalled();
    expect(deps.reloadPreview).not.toHaveBeenCalled();
  });

  it("instantPatch fails: persists AND falls back to soft reload", async () => {
    patchRuntimeTweenInPlace.mockReturnValue(false);
    applySoftReload.mockReturnValue("applied");
    mockFetchResult();
    const deps = renderCommitHook();

    await act(async () => {
      await deps.api.commitMutation(selection, { x: 10 }, dragOptions());
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    expectSoftReloadedWith(deps.reloadPreview, "AFTER");
    expect(deps.reloadPreview).not.toHaveBeenCalled();
    expect(deps.onCacheInvalidate).toHaveBeenCalledTimes(1);
  });

  it("no instantPatch: identical to today — soft reload when softReload+scriptText", async () => {
    applySoftReload.mockReturnValue("applied");
    mockFetchResult();
    const deps = renderCommitHook();

    await act(async () => {
      await deps.api.commitMutation(selection, { x: 10 }, { label: "drag", softReload: true });
    });

    expect(patchRuntimeTweenInPlace).not.toHaveBeenCalled();
    expectSoftReloadedWith(deps.reloadPreview, "AFTER");
    expect(deps.reloadPreview).not.toHaveBeenCalled();
  });

  it("batch capability posts ordered mutations and finalizes the result once", async () => {
    applySoftReload.mockReturnValue("applied");
    mockFetchResult();
    const deps = renderCommitHook();
    const firstMutation = { type: "add", value: 1 };
    const lastMutation = { type: "delete", value: 2 };
    const batch = deps.api.commitMutation.batch;
    if (!batch) throw new Error("batch capability missing");

    await act(async () => {
      await batch(
        [
          { selection, mutation: firstMutation, options: { label: "Resize", skipReload: true } },
          { selection, mutation: lastMutation, options: { label: "Resize", softReload: true } },
        ],
        { label: "Resize", coalesceKey: "tx:resize:1", coalesceMs: Infinity, softReload: true },
      );
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      "/api/projects/proj-1/gsap-mutations-batch/index.html",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ mutations: [firstMutation, lastMutation] }),
      }),
    );
    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(new Headers(init?.headers).get("X-Hyperframes-Write-Token")).toBeTruthy();
    expect(deps.recordEdit).toHaveBeenCalledTimes(1);
    expect(deps.recordEdit).toHaveBeenCalledWith(
      expect.objectContaining({ label: "Resize", coalesceKey: "tx:resize:1" }),
    );
    expect(deps.onFileContentChanged).toHaveBeenCalledTimes(1);
    expect(deps.forceReloadSdkSession).toHaveBeenCalledTimes(1);
    expect(applySoftReload).toHaveBeenCalledTimes(1);
    expect(deps.onCacheInvalidate).toHaveBeenCalledTimes(1);
  });

  it("serializes a legacy fallback request behind an in-flight SDK whole-file edit", async () => {
    let releaseSdkWrite: (() => void) | undefined;
    const sdkWriteGate = new Promise<void>((resolve) => {
      releaseSdkWrite = resolve;
    });
    let notifySdkWriteStarted: (() => void) | undefined;
    const sdkWriteStarted = new Promise<void>((resolve) => {
      notifySdkWriteStarted = resolve;
    });
    const writeProjectFile = vi.fn(async () => {
      notifySdkWriteStarted?.();
      await sdkWriteGate;
    });
    const deps = renderCommitHook({ writeProjectFile });
    const sdkEdit = persistSdkSerialize(() => "SDK_AFTER", "index.html", "BEFORE", {
      editHistory: { recordEdit: deps.recordEdit },
      writeProjectFile,
      readProjectFile: vi.fn(async () => "BEFORE"),
      reloadPreview: deps.reloadPreview,
    });
    await sdkWriteStarted;

    mockFetchResult();
    let legacyEdit: Promise<void> | undefined;
    act(() => {
      legacyEdit = deps.api.commitMutation(selection, { x: 10 }, { label: "Legacy fallback" });
    });
    await Promise.resolve();
    expect(fetch).not.toHaveBeenCalled();

    releaseSdkWrite?.();
    await act(async () => {
      await Promise.all([sdkEdit, legacyEdit]);
    });
    expect(fetch).toHaveBeenCalledWith(
      "/api/projects/proj-1/gsap-mutations/index.html",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
