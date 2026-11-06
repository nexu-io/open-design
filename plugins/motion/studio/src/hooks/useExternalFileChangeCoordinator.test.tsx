// fallow-ignore-file code-duplication
// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudioFileConflictError } from "../utils/studioSaveDiagnostics";
import { markStudioWriteToken, resetStudioWriteTokens } from "../utils/studioFileVersion";
import { markSelfWrite, resetSelfWriteRegistry } from "./sdkSelfWriteRegistry";
import {
  useExternalFileChangeCoordinator,
  type ExternalFileChangeCoordinatorHandle,
} from "./useExternalFileChangeCoordinator";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type HotHandler = (payload?: unknown) => void;
type CoordinatorOptions = Parameters<typeof useExternalFileChangeCoordinator>[0];
const roots: Array<ReturnType<typeof createRoot>> = [];
let handler: HotHandler | null;

async function mountCoordinator(overrides: Partial<CoordinatorOptions> = {}) {
  const captured: { handle: ExternalFileChangeCoordinatorHandle | null } = { handle: null };
  const defaults: CoordinatorOptions = {
    projectId: "project-a",
    activeCompPath: "index.html",
    pendingTimelineEditPathRef: { current: new Set() },
    drainPendingChanges: vi.fn(async () => ({ status: "clean" as const })),
    reloadPreview: vi.fn(),
    reloadSdkSession: vi.fn(),
    persistConflictSnapshot: vi.fn(async () => undefined),
    discardPendingChanges: vi.fn(),
    overwriteConflict: vi.fn(async () => undefined),
    readProjectFile: vi.fn(async () => "external"),
    onAcceptedPersistedFileChange: vi.fn(),
  };
  const options = { ...defaults, ...overrides };
  const root = createRoot(document.createElement("div"));
  roots.push(root);
  function Probe() {
    captured.handle = useExternalFileChangeCoordinator(options);
    return null;
  }
  await act(async () => root.render(<Probe />));
  const rerender = async (next: Partial<CoordinatorOptions>) => {
    Object.assign(options, next);
    await act(async () => root.render(<Probe />));
  };
  return { captured, options, rerender };
}

describe("external file change coordinator", () => {
  beforeEach(() => {
    handler = null;
    resetStudioWriteTokens();
    resetSelfWriteRegistry();
    vi.stubGlobal("__HF_STUDIO_HOT_TEST_ADAPTER__", {
      on: (_event: string, next: HotHandler) => {
        handler = next;
      },
      off: () => {
        handler = null;
      },
    });
  });

  afterEach(async () => {
    while (roots.length > 0) await act(async () => roots.pop()?.unmount());
    vi.unstubAllGlobals();
  });

  describe("SSE reconnect recovery", () => {
    let source: EventTarget;
    let close: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      vi.stubGlobal("__HF_STUDIO_HOT_TEST_ADAPTER__", undefined);
      source = new EventTarget();
      close = vi.fn();
      vi.stubGlobal(
        "EventSource",
        class {
          addEventListener = source.addEventListener.bind(source);
          close = close;
        },
      );
    });

    const open = () =>
      act(async () => {
        source.dispatchEvent(new Event("open"));
      });
    const send = (payload: object) =>
      act(async () => {
        source.dispatchEvent(new MessageEvent("file-change", { data: JSON.stringify(payload) }));
      });

    it("delivers the held reconnect scope when a queued clean drain precedes React's commit", async () => {
      let finishAcceptance = () => {};
      const accepted = new Promise<void>((resolve) => {
        finishAcceptance = resolve;
      });
      const blockedAtSecondDrain: Array<ExternalFileChangeCoordinatorHandle["blocked"]> = [];
      const onAcceptedPersistedFileChange = vi.fn(() => finishAcceptance());
      const drainPendingChanges = vi.fn(async () => {
        if (drainPendingChanges.mock.calls.length === 1) {
          return { status: "failed" as const, error: new Error("save rejected") };
        }
        blockedAtSecondDrain.push(captured.handle?.blocked ?? null);
        return { status: "clean" as const };
      });
      const { captured, options } = await mountCoordinator({
        activeCompPath: "film.html",
        drainPendingChanges,
        onAcceptedPersistedFileChange,
        refreshFileTree: vi.fn(),
      });
      await open();
      await act(async () => {
        source.dispatchEvent(new Event("open"));
        source.dispatchEvent(
          new MessageEvent("file-change", {
            data: JSON.stringify({
              path: "scenes/nested.html",
              affectsPreview: false,
              affectedCompositions: ["scenes/nested.html"],
            }),
          }),
        );
        await accepted;
      });

      expect(blockedAtSecondDrain).toEqual([null]);
      expect(drainPendingChanges).toHaveBeenCalledTimes(2);
      expect(options.reloadPreview).toHaveBeenCalledOnce();
      expect(options.reloadSdkSession).toHaveBeenCalledExactlyOnceWith(".");
      expect(onAcceptedPersistedFileChange).toHaveBeenCalledExactlyOnceWith(".", null);
      expect(options.refreshFileTree).toHaveBeenCalledOnce();
      expect(captured.handle?.blocked).toBeNull();
    });

    it("waits for pending edits before refreshing Preview, SDK, thumbnails and tree on each reconnect", async () => {
      let finishDrain = () => {};
      const pendingEdit = new Promise<void>((resolve) => {
        finishDrain = resolve;
      });
      const { options } = await mountCoordinator({
        drainPendingChanges: vi.fn(async () => {
          await pendingEdit;
          return { status: "clean" as const };
        }),
        refreshFileTree: vi.fn(),
      });
      await open();
      expect(options.drainPendingChanges).not.toHaveBeenCalled();
      await open();
      expect(options.drainPendingChanges).toHaveBeenCalledOnce();
      expect(options.reloadPreview).not.toHaveBeenCalled();
      expect(options.reloadSdkSession).not.toHaveBeenCalled();
      await act(async () => finishDrain());
      expect(options.reloadPreview).toHaveBeenCalledOnce();
      expect(options.reloadSdkSession).toHaveBeenCalledWith(".");
      expect(options.onAcceptedPersistedFileChange).toHaveBeenCalledWith(".", null);
      expect(options.refreshFileTree).toHaveBeenCalledOnce();
      await open();
      expect(options.reloadPreview).toHaveBeenCalledTimes(2);
      expect(options.reloadSdkSession).toHaveBeenCalledTimes(2);
      expect(options.onAcceptedPersistedFileChange).toHaveBeenCalledTimes(2);
      expect(options.refreshFileTree).toHaveBeenCalledTimes(2);
    });

    it("reloads every session for a project-directory change, not just the current composition", async () => {
      let finishDrain = () => {};
      const pendingEdit = new Promise<void>((resolve) => {
        finishDrain = resolve;
      });
      const { options } = await mountCoordinator({
        activeCompPath: "scenes/intro.html",
        drainPendingChanges: vi.fn(async () => {
          await pendingEdit;
          return { status: "clean" as const };
        }),
      });
      await act(async () => {
        source.dispatchEvent(
          new MessageEvent("file-change", {
            data: JSON.stringify({
              path: ".",
              projectId: "project-a",
              affectsPreview: true,
              affectedCompositions: null,
            }),
          }),
        );
      });
      expect(options.drainPendingChanges).toHaveBeenCalledOnce();
      expect(options.reloadPreview).not.toHaveBeenCalled();
      expect(options.reloadSdkSession).not.toHaveBeenCalled();
      await act(async () => finishDrain());
      expect(options.reloadPreview).toHaveBeenCalledOnce();
      expect(options.reloadSdkSession).toHaveBeenCalledExactlyOnceWith(".");
      expect(options.onAcceptedPersistedFileChange).toHaveBeenCalledExactlyOnceWith(".", null);
    });

    it("holds a reconnect behind a persisted conflict until the user accepts the external file", async () => {
      const conflict = new StudioFileConflictError({
        filePath: "index.html",
        currentVersion: "v2",
        currentContent: "external",
        attemptedContent: "studio",
      });
      const { captured, options } = await mountCoordinator({
        drainPendingChanges: vi.fn(async () => ({ status: "conflict" as const, error: conflict })),
      });
      await open();
      await open();
      expect(options.persistConflictSnapshot).toHaveBeenCalledWith("project-a", conflict);
      expect(captured.handle?.blocked).toMatchObject({ status: "conflict", error: conflict });
      expect(options.reloadPreview).not.toHaveBeenCalled();
      expect(options.reloadSdkSession).not.toHaveBeenCalled();
      expect(options.onAcceptedPersistedFileChange).not.toHaveBeenCalled();
      await act(async () => captured.handle?.useExternalFile());
      expect(options.discardPendingChanges).toHaveBeenCalledOnce();
      expect(options.reloadPreview).toHaveBeenCalledOnce();
      expect(options.reloadSdkSession).toHaveBeenCalledWith(".");
    });

    it("reloads every session after navigation and when no composition is selected", async () => {
      const { options, rerender } = await mountCoordinator();
      await open();
      await rerender({ activeCompPath: "scenes/next.html" });
      await open();
      expect(options.reloadSdkSession).toHaveBeenLastCalledWith(".");
      await rerender({ activeCompPath: null });
      await open();
      expect(options.reloadSdkSession).toHaveBeenCalledTimes(2);
      expect(options.reloadSdkSession).toHaveBeenLastCalledWith(".");
      expect(close).not.toHaveBeenCalled();
    });

    it("keeps a reconnect's project-wide reload when a file change queues behind it", async () => {
      let finishDrain = () => {};
      const pendingEdit = new Promise<void>((resolve) => {
        finishDrain = resolve;
      });
      const reloadSdkSession = vi.fn();
      await mountCoordinator({
        reloadSdkSession,
        drainPendingChanges: vi
          .fn()
          .mockImplementationOnce(async () => {
            await pendingEdit;
            return { status: "clean" as const };
          })
          .mockImplementation(async () => ({ status: "clean" as const })),
      });
      await send({ path: "notes.md", version: "n1" });
      await open();
      await open();
      await send({ path: "index.html", version: "v2" });
      await act(async () => finishDrain());
      expect(reloadSdkSession.mock.calls.map(([path]) => path)).toEqual(["notes.md", "."]);
    });

    it("delivers a held reconnect's project-wide reload when a later change saves cleanly", async () => {
      const { options } = await mountCoordinator({
        drainPendingChanges: vi
          .fn()
          .mockResolvedValueOnce({ status: "failed" as const, error: new Error("offline") })
          .mockResolvedValue({ status: "clean" as const }),
        getPendingCandidate: () => ({ path: "script.js", content: "unsaved script" }),
        persistFailureSnapshot: vi.fn(async () => undefined),
      });
      await open();
      await open();
      expect(options.reloadSdkSession).not.toHaveBeenCalled();
      await send({ path: "scenes/nested.html", version: "n1", affectsPreview: false });
      expect(options.reloadSdkSession).toHaveBeenCalledExactlyOnceWith(".");
      expect(options.reloadPreview).toHaveBeenCalledOnce();
      expect(options.onAcceptedPersistedFileChange).toHaveBeenCalledExactlyOnceWith(".", null);
    });

    it("keeps the unsaved draft of the file open in the code panel when a reconnect cannot save it", async () => {
      const failure = new Error("network unavailable");
      const persistFailureSnapshot = vi.fn(async () => undefined);
      const readProjectFile = vi.fn(async () => "disk script");
      const onUseExternalFile = vi.fn();
      const { captured, options } = await mountCoordinator({
        drainPendingChanges: vi.fn(async () => ({ status: "failed" as const, error: failure })),
        getPendingCandidate: () => ({ path: "script.js", content: "unsaved script" }),
        persistFailureSnapshot,
        readProjectFile,
        onUseExternalFile,
      });
      await open();
      await open();
      expect(captured.handle?.blocked).toMatchObject({
        status: "failed",
        path: "script.js",
        studioContent: "unsaved script",
      });
      expect(persistFailureSnapshot).toHaveBeenCalledExactlyOnceWith(
        "project-a",
        "script.js",
        "unsaved script",
        null,
        null,
        failure,
      );
      await act(async () => captured.handle?.useExternalFile());
      expect(readProjectFile).toHaveBeenCalledWith("script.js");
      expect(onUseExternalFile).toHaveBeenCalledWith("script.js", "disk script");
      expect(options.reloadSdkSession).toHaveBeenCalledExactlyOnceWith(".");
    });

    it("keeps the drafted file's recovery off another file's external version", async () => {
      const failure = new Error("network unavailable");
      const persistFailureSnapshot = vi.fn(async () => undefined);
      const { captured } = await mountCoordinator({
        drainPendingChanges: vi.fn(async () => ({ status: "failed" as const, error: failure })),
        getPendingCandidate: () => ({ path: "script.js", content: "unsaved script" }),
        persistFailureSnapshot,
      });
      await send({ path: "index.html", version: "v2", content: "agent html" });
      expect(persistFailureSnapshot).toHaveBeenCalledExactlyOnceWith(
        "project-a",
        "script.js",
        "unsaved script",
        null,
        null,
        failure,
      );
      expect(captured.handle?.blocked).toMatchObject({
        path: "script.js",
        payload: { path: "index.html" },
      });
    });

    it("keeps foreign project changes out of recovery", async () => {
      const { options } = await mountCoordinator();
      await open();
      await act(async () => {
        source.dispatchEvent(
          new MessageEvent("file-change", {
            data: JSON.stringify({ path: "index.html", projectId: "project-b", version: "v2" }),
          }),
        );
      });
      expect(options.drainPendingChanges).not.toHaveBeenCalled();
      await open();
      expect(options.reloadPreview).toHaveBeenCalledOnce();
    });

    it("uses the new project's owner when a reconnect arrives during the previous drain", async () => {
      let finishDrain = () => {};
      const pendingEdit = new Promise<void>((resolve) => {
        finishDrain = resolve;
      });
      const first = {
        drainPendingChanges: vi.fn(async () => {
          await pendingEdit;
          return { status: "clean" as const };
        }),
        reloadPreview: vi.fn(),
        reloadSdkSession: vi.fn(),
        onAcceptedPersistedFileChange: vi.fn(),
      };
      const { rerender } = await mountCoordinator(first);
      await open();
      await open();
      const next = {
        projectId: "project-b",
        activeCompPath: "scenes/next.html",
        drainPendingChanges: vi.fn(async () => ({ status: "clean" as const })),
        reloadPreview: vi.fn(),
        reloadSdkSession: vi.fn(),
        onAcceptedPersistedFileChange: vi.fn(),
      };
      await rerender(next);
      await open();
      expect(next.drainPendingChanges).not.toHaveBeenCalled();
      await act(async () => finishDrain());
      expect(first.drainPendingChanges).toHaveBeenCalledOnce();
      expect(first.reloadPreview).not.toHaveBeenCalled();
      expect(first.reloadSdkSession).not.toHaveBeenCalled();
      expect(first.onAcceptedPersistedFileChange).not.toHaveBeenCalled();
      expect(next.drainPendingChanges).toHaveBeenCalledOnce();
      expect(next.reloadPreview).toHaveBeenCalledOnce();
      expect(next.reloadSdkSession).toHaveBeenCalledExactlyOnceWith(".");
      expect(next.onAcceptedPersistedFileChange).toHaveBeenCalledExactlyOnceWith(".", null);
    });

    it("persists a queued reconnect conflict with the new project's owner", async () => {
      let finishDrain = () => {};
      const pendingEdit = new Promise<void>((resolve) => {
        finishDrain = resolve;
      });
      const first = {
        drainPendingChanges: vi.fn(async () => {
          await pendingEdit;
          return { status: "clean" as const };
        }),
        persistConflictSnapshot: vi.fn(async () => undefined),
        reloadPreview: vi.fn(),
        reloadSdkSession: vi.fn(),
      };
      const { captured, rerender } = await mountCoordinator(first);
      await open();
      await open();
      const conflict = new StudioFileConflictError({
        filePath: "scenes/next.html",
        currentVersion: "v2",
        currentContent: "external",
        attemptedContent: "studio",
      });
      const next = {
        projectId: "project-b",
        activeCompPath: "scenes/next.html",
        drainPendingChanges: vi.fn(async () => ({ status: "conflict" as const, error: conflict })),
        persistConflictSnapshot: vi.fn(async () => undefined),
        reloadPreview: vi.fn(),
        reloadSdkSession: vi.fn(),
      };
      await rerender(next);
      await open();
      await act(async () => finishDrain());
      expect(next.drainPendingChanges).toHaveBeenCalledOnce();
      expect(next.persistConflictSnapshot).toHaveBeenCalledExactlyOnceWith("project-b", conflict);
      expect(first.persistConflictSnapshot).not.toHaveBeenCalled();
      expect(first.reloadPreview).not.toHaveBeenCalled();
      expect(first.reloadSdkSession).not.toHaveBeenCalled();
      expect(next.reloadPreview).not.toHaveBeenCalled();
      expect(next.reloadSdkSession).not.toHaveBeenCalled();
      expect(captured.handle?.blocked).toMatchObject({ status: "conflict", error: conflict });
    });

    it.each([
      { label: "the project changes", projectId: "project-b", activeCompPath: "index.html" },
      { label: "the project is left", projectId: null, activeCompPath: null },
    ])("drops queued old-scope changes when $label", async ({ projectId, activeCompPath }) => {
      let finishDrain = () => {};
      const pendingEdit = new Promise<void>((resolve) => {
        finishDrain = resolve;
      });
      const first = {
        drainPendingChanges: vi.fn(async () => {
          await pendingEdit;
          return { status: "clean" as const };
        }),
        reloadPreview: vi.fn(),
        reloadSdkSession: vi.fn(),
      };
      const { rerender } = await mountCoordinator(first);
      await open();
      await open();
      await open();
      const next = {
        projectId,
        activeCompPath,
        drainPendingChanges: vi.fn(async () => ({ status: "clean" as const })),
        reloadPreview: vi.fn(),
        reloadSdkSession: vi.fn(),
      };
      await rerender(next);
      await act(async () => finishDrain());
      expect(first.drainPendingChanges).toHaveBeenCalledOnce();
      expect(next.drainPendingChanges).not.toHaveBeenCalled();
      expect(first.reloadPreview).not.toHaveBeenCalled();
      expect(first.reloadSdkSession).not.toHaveBeenCalled();
      expect(next.reloadPreview).not.toHaveBeenCalled();
      expect(next.reloadSdkSession).not.toHaveBeenCalled();
    });

    it("still refreshes the tree for a queued outside change after switching compositions", async () => {
      let finishDrain = () => {};
      const pendingEdit = new Promise<void>((resolve) => {
        finishDrain = resolve;
      });
      const refreshFileTree = vi.fn();
      const onAcceptedPersistedFileChange = vi.fn();
      const { rerender } = await mountCoordinator({
        drainPendingChanges: vi.fn(async () => {
          await pendingEdit;
          return { status: "clean" as const };
        }),
        refreshFileTree,
        onAcceptedPersistedFileChange,
      });
      await send({ path: "index.html", content: "external", version: "v2" });
      await send({ path: "scenes/old.html", content: "agent", version: "v3" });
      await rerender({ activeCompPath: "scenes/next.html" });
      await act(async () => finishDrain());
      expect(onAcceptedPersistedFileChange.mock.calls.map(([path]) => path)).toContain(
        "scenes/old.html",
      );
      expect(refreshFileTree).toHaveBeenCalled();
    });

    it("ignores reconnects after leaving the active project", async () => {
      const { options, rerender } = await mountCoordinator();
      await open();
      await rerender({ projectId: null });
      await open();
      expect(options.drainPendingChanges).not.toHaveBeenCalled();
      expect(options.reloadPreview).not.toHaveBeenCalled();
    });
  });

  it("drains before reloading Preview and SDK exactly once", async () => {
    const order: string[] = [];
    const { captured } = await mountCoordinator({
      drainPendingChanges: async () => {
        order.push("drain");
        return { status: "clean" };
      },
      onAcceptedPersistedFileChange: () => order.push("thumbnail"),
      reloadPreview: () => order.push("preview"),
      reloadSdkSession: () => order.push("sdk"),
      refreshFileTree: () => {
        order.push("tree");
      },
    });
    await act(async () => handler?.({ path: "index.html", content: "external", version: "v2" }));
    expect(order).toEqual(["drain", "thumbnail", "preview", "sdk", "tree"]);
    expect(captured.handle?.blocked).toBeNull();
  });

  it("keeps one file-change subscription across re-renders and delivers to the latest callbacks", async () => {
    const on = vi.fn((_event: string, next: HotHandler) => void (handler = next));
    vi.stubGlobal("__HF_STUDIO_HOT_TEST_ADAPTER__", { on, off: vi.fn() });
    const { options } = await mountCoordinator();
    on.mockClear();
    const root = createRoot(document.createElement("div"));
    roots.push(root);
    function Probe({ onAccepted }: { onAccepted: () => void }) {
      useExternalFileChangeCoordinator({ ...options, onAcceptedPersistedFileChange: onAccepted });
      return null;
    }
    const latest = vi.fn();
    await act(async () => root.render(<Probe onAccepted={vi.fn()} />));
    await act(async () => root.render(<Probe onAccepted={latest} />));
    await act(async () => handler?.({ path: "index.html", content: "external", version: "v2" }));
    expect(on).toHaveBeenCalledOnce();
    expect(latest).toHaveBeenCalledOnce();
  });

  // The file tree (useFileTree) is only ever refreshed from Studio's own file
  // operations (create/delete/rename/upload) — never on an external change.
  // Without this call, an agent removing or replacing a composition updates
  // the preview and the SDK session but leaves the listing stale forever.
  it("refreshes the file tree on an accepted external change", async () => {
    const refreshFileTree = vi.fn();
    await mountCoordinator({ refreshFileTree });
    await act(async () => handler?.({ path: "index.html", content: "external", version: "v2" }));
    expect(refreshFileTree).toHaveBeenCalledOnce();
  });

  it("refreshes the file tree but not Preview for a file the preview never loaded", async () => {
    const order: string[] = [];
    await mountCoordinator({
      reloadPreview: () => order.push("preview"),
      reloadSdkSession: () => order.push("sdk"),
      refreshFileTree: () => {
        order.push("tree");
      },
    });
    await act(async () =>
      handler?.({ path: "notes.md", content: "notes", version: "v1", affectsPreview: false }),
    );
    expect(order).toEqual(["sdk", "tree"]);
  });

  it("still reloads Preview when a notes change replaces a waiting film change", async () => {
    let release = () => {};
    const inFlight = new Promise<void>((resolve) => (release = resolve));
    const reloadPreview = vi.fn();
    const reloadSdkSession = vi.fn();
    const onAcceptedPersistedFileChange = vi.fn();
    let drains = 0;
    await mountCoordinator({
      reloadPreview,
      reloadSdkSession,
      onAcceptedPersistedFileChange,
      drainPendingChanges: async () => {
        if (drains++ === 0) await inFlight;
        return { status: "clean" as const };
      },
    });
    await act(async () => handler?.({ path: "index.html", content: "a", version: "v1" }));
    await act(async () =>
      handler?.({
        path: "scene.html",
        content: "b",
        version: "v2",
        affectedCompositions: ["scene.html"],
      }),
    );
    await act(async () =>
      handler?.({ path: "notes.md", content: "c", version: "v3", affectsPreview: false }),
    );
    await act(async () => release());
    expect(reloadPreview).toHaveBeenCalledTimes(2);
    expect(reloadSdkSession).toHaveBeenLastCalledWith("scene.html");
    expect(onAcceptedPersistedFileChange).toHaveBeenLastCalledWith("scene.html", ["scene.html"]);
  });

  it("keeps a waiting head edit's thumbnail refresh when a later write replaces it", async () => {
    let release = () => {};
    const inFlight = new Promise<void>((resolve) => (release = resolve));
    const onAcceptedPersistedFileChange = vi.fn();
    let drains = 0;
    await mountCoordinator({
      onAcceptedPersistedFileChange,
      drainPendingChanges: async () => {
        if (drains++ === 0) await inFlight;
        return { status: "clean" as const };
      },
    });
    await act(async () => handler?.({ path: "other.html", content: "a", version: "v1" }));
    await act(async () => handler?.({ path: "index.html", content: "b", version: "v2" }));
    await act(async () =>
      handler?.({
        path: "index.html",
        content: "c",
        version: "v3",
        affectedCompositions: ["index.html"],
      }),
    );
    await act(async () => release());
    expect(onAcceptedPersistedFileChange).toHaveBeenLastCalledWith("index.html", null);
  });

  it("keeps a head edit's thumbnail refresh through a conflict that a later write replaces", async () => {
    const onAcceptedPersistedFileChange = vi.fn();
    const conflict = new StudioFileConflictError({
      filePath: "index.html",
      currentVersion: "v1",
      currentContent: "theirs",
      attemptedContent: "mine",
    });
    const { captured } = await mountCoordinator({
      onAcceptedPersistedFileChange,
      drainPendingChanges: async () => ({ status: "conflict" as const, error: conflict }),
    });
    await act(async () => handler?.({ path: "index.html", content: "head", version: "v1" }));
    await act(async () =>
      handler?.({
        path: "index.html",
        content: "body",
        version: "v2",
        affectedCompositions: ["index.html"],
      }),
    );
    await act(async () => captured.handle?.useExternalFile());
    expect(onAcceptedPersistedFileChange).toHaveBeenLastCalledWith("index.html", null);
  });

  it("keeps a held head edit's thumbnail refresh when a later write saves cleanly", async () => {
    const onAcceptedPersistedFileChange = vi.fn();
    const conflict = new StudioFileConflictError({
      filePath: "index.html",
      currentVersion: "v1",
      currentContent: "theirs",
      attemptedContent: "mine",
    });
    let drains = 0;
    await mountCoordinator({
      onAcceptedPersistedFileChange,
      drainPendingChanges: async () =>
        drains++ === 0
          ? { status: "conflict" as const, error: conflict }
          : { status: "clean" as const },
    });
    await act(async () => handler?.({ path: "index.html", content: "head", version: "v1" }));
    await act(async () =>
      handler?.({
        path: "index.html",
        content: "body",
        version: "v2",
        affectedCompositions: ["index.html"],
      }),
    );
    expect(onAcceptedPersistedFileChange).toHaveBeenLastCalledWith("index.html", null);
  });

  it("does not refresh the tree for a suppressed self-write echo", async () => {
    const refreshFileTree = vi.fn();
    await mountCoordinator({ refreshFileTree });
    markStudioWriteToken("studio-write-1");
    await act(async () =>
      handler?.({
        path: "index.html",
        content: "studio",
        version: "v2",
        writeToken: "studio-write-1",
      }),
    );
    expect(refreshFileTree).not.toHaveBeenCalled();
  });

  it("is optional — an accepted change with no refreshFileTree collaborator does not throw", async () => {
    const { captured } = await mountCoordinator({ refreshFileTree: undefined });
    await act(async () => handler?.({ path: "index.html", content: "external", version: "v2" }));
    expect(captured.handle?.blocked).toBeNull();
  });

  it("refreshes thumbnails once but suppresses Preview reload for an exact Studio write", async () => {
    const drainPendingChanges = vi.fn(async () => ({ status: "clean" as const }));
    const reloadPreview = vi.fn();
    const reloadSdkSession = vi.fn();
    const onAcceptedPersistedFileChange = vi.fn();
    await mountCoordinator({
      drainPendingChanges,
      reloadPreview,
      reloadSdkSession,
      onAcceptedPersistedFileChange,
    });
    markStudioWriteToken("studio-write-1");
    const payload = {
      path: "index.html",
      content: "studio",
      version: "v2",
      writeToken: "studio-write-1",
    };
    await act(async () => handler?.(payload));
    await act(async () => handler?.(payload));
    expect(drainPendingChanges).not.toHaveBeenCalled();
    expect(reloadPreview).not.toHaveBeenCalled();
    expect(reloadSdkSession).not.toHaveBeenCalled();
    expect(onAcceptedPersistedFileChange).toHaveBeenCalledOnce();
    expect(onAcceptedPersistedFileChange).toHaveBeenCalledWith("index.html", null);
  });

  it("accepts a matching content echo without a write token and suppresses every reload", async () => {
    const drainPendingChanges = vi.fn(async () => ({ status: "clean" as const }));
    const reloadPreview = vi.fn();
    const reloadSdkSession = vi.fn();
    const onAcceptedPersistedFileChange = vi.fn();
    await mountCoordinator({
      drainPendingChanges,
      reloadPreview,
      reloadSdkSession,
      onAcceptedPersistedFileChange,
    });
    markSelfWrite("index.html", "studio content");

    await act(async () =>
      handler?.({ path: "index.html", content: "studio content", version: "v2" }),
    );

    expect(onAcceptedPersistedFileChange).toHaveBeenCalledOnce();
    expect(onAcceptedPersistedFileChange).toHaveBeenCalledWith("index.html", null);
    expect(drainPendingChanges).not.toHaveBeenCalled();
    expect(reloadPreview).not.toHaveBeenCalled();
    expect(reloadSdkSession).not.toHaveBeenCalled();
  });

  it("does not suppress a racing external write by path alone", async () => {
    const pendingTimelineEditPathRef = { current: new Set(["index.html"]) };
    const drainPendingChanges = vi.fn(async () => ({ status: "clean" as const }));
    const reloadPreview = vi.fn();
    const reloadSdkSession = vi.fn();
    await mountCoordinator({
      pendingTimelineEditPathRef,
      drainPendingChanges,
      reloadPreview,
      reloadSdkSession,
    });
    await act(async () => handler?.({ path: "index.html", content: "agent edit", version: "v2" }));
    expect(pendingTimelineEditPathRef.current).not.toContain("index.html");
    expect(drainPendingChanges).toHaveBeenCalledOnce();
    expect(reloadPreview).toHaveBeenCalledOnce();
    expect(reloadSdkSession).toHaveBeenCalledOnce();
  });

  it("blocks both reloads and retains a complete conflict", async () => {
    const conflict = new StudioFileConflictError({
      filePath: "index.html",
      currentVersion: "v2",
      currentContent: "external",
      attemptedContent: "studio",
    });
    const persistConflictSnapshot = vi.fn(async () => undefined);
    const onAcceptedPersistedFileChange = vi.fn();
    const { captured, options } = await mountCoordinator({
      drainPendingChanges: async () => ({ status: "conflict", error: conflict }),
      persistConflictSnapshot,
      onAcceptedPersistedFileChange,
    });
    await act(async () => handler?.({ path: "index.html", content: "external", version: "v2" }));
    expect(persistConflictSnapshot).toHaveBeenCalledWith("project-a", conflict);
    expect(captured.handle?.blocked).toMatchObject({ status: "conflict", error: conflict });
    expect(options.reloadPreview).not.toHaveBeenCalled();
    expect(options.reloadSdkSession).not.toHaveBeenCalled();
    expect(onAcceptedPersistedFileChange).not.toHaveBeenCalled();

    await act(async () => captured.handle?.useExternalFile());
    expect(onAcceptedPersistedFileChange).toHaveBeenCalledOnce();
    expect(options.reloadPreview).toHaveBeenCalledOnce();
    expect(options.reloadSdkSession).toHaveBeenCalledOnce();
  });

  it("serializes drains and processes stashed events", async () => {
    const drains: Array<(result: { status: "clean" }) => void> = [];
    const { options } = await mountCoordinator({
      drainPendingChanges: () => new Promise((resolve) => drains.push(resolve)),
    });
    act(() => {
      handler?.({ path: "index.html", content: "first", version: "v2" });
      handler?.({ path: "index.html", content: "second", version: "v3" });
    });
    expect(drains).toHaveLength(1);
    await act(async () => drains[0]?.({ status: "clean" }));
    expect(options.reloadPreview).toHaveBeenCalledOnce();
    await act(async () => {});
    expect(drains).toHaveLength(2);
    await act(async () => drains[1]?.({ status: "clean" }));
    expect(options.reloadPreview).toHaveBeenCalledTimes(2);
    expect(options.reloadSdkSession).toHaveBeenCalledTimes(2);
  });

  it("restores a durable unresolved conflict after remount", async () => {
    const { captured } = await mountCoordinator({
      recoveryFilePath: "index.html",
      loadConflictSnapshot: vi.fn(async () => ({
        kind: "conflict" as const,
        projectId: "project-a",
        filePath: "index.html",
        externalVersion: "v2",
        externalContent: "external",
        studioContent: "studio",
        createdAt: 100,
      })),
    });
    await vi.waitFor(() => expect(captured.handle?.blocked?.status).toBe("conflict"));
    expect(captured.handle?.blocked).toMatchObject({
      error: { currentContent: "external", attemptedContent: "studio" },
    });
  });

  it("retains the final local candidate when a drain fails", async () => {
    const failure = new Error("network unavailable");
    const persistFailureSnapshot = vi.fn(async () => undefined);
    const deleteConflictSnapshot = vi.fn(async () => undefined);
    const onAcceptedPersistedFileChange = vi.fn();
    const { captured } = await mountCoordinator({
      drainPendingChanges: vi
        .fn()
        .mockResolvedValueOnce({ status: "failed" as const, error: failure })
        .mockResolvedValueOnce({ status: "clean" as const }),
      getPendingCandidate: () => ({ path: "index.html", content: "final local candidate" }),
      persistFailureSnapshot,
      deleteConflictSnapshot,
      onAcceptedPersistedFileChange,
    });
    await act(async () => handler?.({ path: "index.html" }));
    expect(captured.handle?.blocked).toMatchObject({
      status: "failed",
      error: failure,
      studioContent: "final local candidate",
    });
    expect(persistFailureSnapshot).toHaveBeenCalledWith(
      "project-a",
      "index.html",
      "final local candidate",
      null,
      null,
      failure,
    );
    expect(onAcceptedPersistedFileChange).not.toHaveBeenCalled();
    await act(async () => captured.handle?.retry());
    expect(deleteConflictSnapshot).toHaveBeenCalledWith("project-a", "index.html");
    expect(onAcceptedPersistedFileChange).toHaveBeenCalledOnce();
  });

  it("keeps the failed draft blocked, owing both files, when deleting its snapshot fails", async () => {
    const deleteConflictSnapshot = vi.fn(async () => {
      throw new Error("delete failed");
    });
    const { captured } = await mountCoordinator({
      drainPendingChanges: vi
        .fn()
        .mockResolvedValueOnce({ status: "failed" as const, error: new Error("offline") })
        .mockResolvedValueOnce({ status: "clean" as const }),
      getPendingCandidate: () => ({ path: "scene.html", content: "studio" }),
      deleteConflictSnapshot,
    });
    await act(async () =>
      handler?.({ path: "scene.html", content: "scene-external", version: "s1" }),
    );
    await act(async () =>
      handler?.({ path: "index.html", content: "index-external", version: "i1" }),
    );
    expect(captured.handle?.blocked).toMatchObject({
      status: "failed",
      path: "scene.html",
      payload: { path: "." },
    });
    expect(deleteConflictSnapshot).toHaveBeenCalledExactlyOnceWith("project-a", "scene.html");
  });

  it("keeps a failed draft's snapshot when a clean save was for another file", async () => {
    const deleteConflictSnapshot = vi.fn(async () => undefined);
    let candidate = { path: "script.js", content: "unsaved script" };
    const { captured } = await mountCoordinator({
      drainPendingChanges: vi
        .fn()
        .mockResolvedValueOnce({ status: "failed" as const, error: new Error("offline") })
        .mockResolvedValue({ status: "clean" as const }),
      getPendingCandidate: () => candidate,
      persistFailureSnapshot: vi.fn(async () => undefined),
      deleteConflictSnapshot,
    });
    await act(async () => handler?.({ path: "index.html", version: "v1" }));
    expect(captured.handle?.blocked).toMatchObject({ status: "failed", path: "script.js" });
    candidate = { path: "style.css", content: "saved style" };
    await act(async () => handler?.({ path: "index.html", version: "v2" }));
    expect(deleteConflictSnapshot).not.toHaveBeenCalled();
  });

  it("keeps a restored draft's snapshot when an unrelated change saves cleanly", async () => {
    const deleteConflictSnapshot = vi.fn(async () => undefined);
    const { captured, options } = await mountCoordinator({
      recoveryFilePath: "script.js",
      deleteConflictSnapshot,
      loadConflictSnapshot: vi.fn(async () => ({
        kind: "failed" as const,
        projectId: "project-a",
        filePath: "script.js",
        externalVersion: null,
        externalContent: null,
        studioContent: "recover me",
        failureMessage: "network unavailable",
        createdAt: 100,
      })),
    });
    await vi.waitFor(() => expect(captured.handle?.blocked?.status).toBe("failed"));
    await act(async () => handler?.({ path: "index.html", version: "v2" }));
    expect(deleteConflictSnapshot).not.toHaveBeenCalled();
    expect(options.reloadSdkSession).toHaveBeenCalledExactlyOnceWith("index.html");
  });

  it("reloads the held change's scope too when Keep Studio settles a held conflict", async () => {
    const conflict = new StudioFileConflictError({
      filePath: "film.html",
      currentVersion: "v2",
      currentContent: "external",
      attemptedContent: "studio",
    });
    const { captured, options } = await mountCoordinator({
      drainPendingChanges: vi.fn(async () => ({ status: "conflict" as const, error: conflict })),
    });
    await act(async () => handler?.({ path: "film.html", version: "v2" }));
    await act(async () =>
      handler?.({
        path: "scenes/nested.html",
        version: "n1",
        affectedCompositions: ["scenes/nested.html"],
      }),
    );
    await act(async () => captured.handle?.keepStudioFile());
    expect(options.overwriteConflict).toHaveBeenCalledWith(conflict);
    expect(options.reloadSdkSession).toHaveBeenCalledExactlyOnceWith(".");
    expect(options.onAcceptedPersistedFileChange).toHaveBeenCalledExactlyOnceWith(".", null);
  });

  it("names the conflicting file when its conflict snapshot cannot be saved", async () => {
    const conflict = new StudioFileConflictError({
      filePath: "script.js",
      currentVersion: "v2",
      currentContent: "external",
      attemptedContent: "studio",
    });
    const { captured } = await mountCoordinator({
      drainPendingChanges: vi.fn(async () => ({ status: "conflict" as const, error: conflict })),
      persistConflictSnapshot: vi.fn(async () => {
        throw new Error("storage full");
      }),
    });
    await act(async () => handler?.({ path: "index.html", version: "v2" }));
    expect(captured.handle?.blocked).toMatchObject({
      status: "failed",
      path: "script.js",
      studioContent: "studio",
    });
  });

  it("restores and overwrites from a durable failed draft", async () => {
    const overwriteConflict = vi.fn(async () => undefined);
    const onAcceptedPersistedFileChange = vi.fn();
    const { captured } = await mountCoordinator({
      recoveryFilePath: "index.html",
      overwriteConflict,
      onAcceptedPersistedFileChange,
      loadConflictSnapshot: vi.fn(async () => ({
        kind: "failed" as const,
        projectId: "project-a",
        filePath: "index.html",
        externalVersion: "v2",
        externalContent: "external",
        studioContent: "recover me",
        failureMessage: "network unavailable",
        createdAt: 100,
      })),
    });
    await vi.waitFor(() => expect(captured.handle?.blocked?.status).toBe("failed"));
    expect(captured.handle?.blocked).toMatchObject({
      studioContent: "recover me",
      recovered: true,
    });
    await act(async () => captured.handle?.keepStudioFile());
    expect(overwriteConflict).toHaveBeenCalledWith(
      expect.objectContaining({ attemptedContent: "recover me", currentVersion: "v2" }),
    );
    expect(onAcceptedPersistedFileChange).not.toHaveBeenCalled();

    markStudioWriteToken("keep-studio-write");
    await act(async () =>
      handler?.({
        path: "index.html",
        content: "recover me",
        version: "v3",
        writeToken: "keep-studio-write",
      }),
    );
    expect(onAcceptedPersistedFileChange).toHaveBeenCalledOnce();
  });

  it("completes a reload after a burst of rapid external writes", async () => {
    const drains: Array<(result: { status: "clean" }) => void> = [];
    const reloadPreview = vi.fn();
    const onAcceptedPersistedFileChange = vi.fn();
    await mountCoordinator({
      drainPendingChanges: vi.fn(
        () => new Promise<{ status: "clean" }>((resolve) => drains.push(resolve)),
      ),
      reloadPreview,
      onAcceptedPersistedFileChange,
    });

    // Fire three events in rapid succession (simulates generator + check + snapshot)
    act(() => {
      handler?.({ path: "index.html", content: "write-1", version: "v1" });
      handler?.({ path: "index.html", content: "write-2", version: "v2" });
      handler?.({ path: "index.html", content: "write-3", version: "v3" });
    });

    // Only one drain runs — events 2 and 3 are stashed (last one wins)
    expect(drains).toHaveLength(1);

    // Complete the first drain — triggers reload, then stashed event starts a second drain
    await act(async () => drains[0]?.({ status: "clean" }));
    expect(reloadPreview).toHaveBeenCalledOnce();
    await act(async () => {});
    expect(drains).toHaveLength(2);

    // Complete the second drain — processes the final write
    await act(async () => drains[1]?.({ status: "clean" }));
    expect(reloadPreview).toHaveBeenCalledTimes(2);
    expect(onAcceptedPersistedFileChange).toHaveBeenCalledTimes(2);
  });

  describe("SSE-shaped deliveries", () => {
    const sseDelivery = (payload: unknown) =>
      new MessageEvent("file-change", { data: JSON.stringify(payload) });

    it("suppresses every reload for Studio's own write", async () => {
      const drainPendingChanges = vi.fn(async () => ({ status: "clean" as const }));
      const reloadPreview = vi.fn();
      const onAcceptedPersistedFileChange = vi.fn();
      await mountCoordinator({ drainPendingChanges, reloadPreview, onAcceptedPersistedFileChange });
      markStudioWriteToken("studio-write-1");

      await act(async () =>
        handler?.(sseDelivery({ path: "index.html", version: "v2", writeToken: "studio-write-1" })),
      );

      expect(drainPendingChanges).not.toHaveBeenCalled();
      expect(reloadPreview).not.toHaveBeenCalled();
      expect(onAcceptedPersistedFileChange).toHaveBeenCalledWith("index.html", null);
    });

    it("hands the server's affected compositions to the thumbnail refresh", async () => {
      const onAcceptedPersistedFileChange = vi.fn();
      await mountCoordinator({ onAcceptedPersistedFileChange });

      await act(async () =>
        handler?.(
          sseDelivery({
            path: "compositions/scene-a.html",
            version: "v3",
            affectedCompositions: ["index.html", "compositions/scene-a.html"],
          }),
        ),
      );
      await act(async () =>
        handler?.(
          sseDelivery({ path: "assets/logo.svg", version: "v4", affectedCompositions: "all" }),
        ),
      );

      expect(onAcceptedPersistedFileChange).toHaveBeenNthCalledWith(
        1,
        "compositions/scene-a.html",
        ["index.html", "compositions/scene-a.html"],
      );
      expect(onAcceptedPersistedFileChange).toHaveBeenNthCalledWith(2, "assets/logo.svg", null);
    });

    it("reloads once when one watcher event reaches two subscribers", async () => {
      const reloadPreview = vi.fn();
      await mountCoordinator({ reloadPreview });

      const external = { path: "index.html", version: "v2" };
      await act(async () => handler?.(sseDelivery(external)));
      await act(async () => handler?.(sseDelivery(external)));

      expect(reloadPreview).toHaveBeenCalledOnce();
    });

    it("still reloads for a genuinely external write", async () => {
      const reloadPreview = vi.fn();
      await mountCoordinator({ reloadPreview });

      await act(async () => handler?.(sseDelivery({ path: "index.html", version: "v9" })));

      expect(reloadPreview).toHaveBeenCalledOnce();
    });

    it("drops an unparseable delivery instead of throwing", async () => {
      const reloadPreview = vi.fn();
      await mountCoordinator({ reloadPreview });

      await act(async () => handler?.(new MessageEvent("file-change", { data: "not json" })));

      expect(reloadPreview).not.toHaveBeenCalled();
    });
  });

  // `/api/events` is one connection per SERVER (CLI host), not per project — a
  // tab left open from a `preview` run whose port was later reused by a
  // different project's `preview` shares this stream with it. Both projects
  // commonly use the same default composition path, so without the filter a
  // stale tab reloads its preview and re-reads its own composition on every
  // save the OTHER project makes.
  describe("cross-project deliveries on a shared connection", () => {
    it("ignores a delivery whose projectId does not match this tab's", async () => {
      const drainPendingChanges = vi.fn(async () => ({ status: "clean" as const }));
      const reloadPreview = vi.fn();
      const reloadSdkSession = vi.fn();
      await mountCoordinator({ drainPendingChanges, reloadPreview, reloadSdkSession });

      await act(async () =>
        handler?.({
          path: "index.html",
          content: "other project",
          version: "v9",
          projectId: "project-b",
        }),
      );

      expect(drainPendingChanges).not.toHaveBeenCalled();
      expect(reloadPreview).not.toHaveBeenCalled();
      expect(reloadSdkSession).not.toHaveBeenCalled();
    });

    it("still reloads for a delivery whose projectId matches this tab's", async () => {
      const reloadPreview = vi.fn();
      await mountCoordinator({ reloadPreview });

      await act(async () =>
        handler?.({
          path: "index.html",
          content: "same project",
          version: "v9",
          projectId: "project-a",
        }),
      );

      expect(reloadPreview).toHaveBeenCalledOnce();
    });

    it("still reloads when projectId is absent (older server, one release of skew)", async () => {
      const reloadPreview = vi.fn();
      await mountCoordinator({ reloadPreview });

      await act(async () =>
        handler?.({ path: "index.html", content: "no project id", version: "v9" }),
      );

      expect(reloadPreview).toHaveBeenCalledOnce();
    });
  });
});
