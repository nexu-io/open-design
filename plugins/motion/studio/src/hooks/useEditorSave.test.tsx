// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const trackStudioSaveFailure = vi.hoisted(() => vi.fn());
vi.mock("../utils/studioSaveDiagnostics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../utils/studioSaveDiagnostics")>()),
  trackStudioSaveFailure,
}));

import { StudioFileConflictError } from "../utils/studioSaveDiagnostics";
import { useEditorSave, type EditorSaveHandle } from "./useEditorSave";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type WriteProjectFile = (path: string, content: string, expectedContent?: string) => Promise<void>;

async function mountEditorSave(writeProjectFile: WriteProjectFile) {
  const captured: { handle: EditorSaveHandle | null } = { handle: null };
  const showToast = vi.fn();

  function Probe() {
    captured.handle = useEditorSave({
      editingPathRef: { current: "index.html" },
      projectIdRef: { current: "project-a" },
      readProjectFile: vi.fn(async () => "before"),
      writeProjectFile,
      recordEdit: vi.fn(async () => undefined),
      setRefreshKey: vi.fn(),
      showToast,
    });
    return null;
  }

  const root = createRoot(document.createElement("div"));
  await act(async () => root.render(<Probe />));
  if (!captured.handle) throw new Error("Editor save handle was not mounted");

  return {
    handle: captured.handle,
    showToast,
    unmount: () => act(async () => root.unmount()),
  };
}

describe("useEditorSave pending work", () => {
  beforeEach(() => {
    trackStudioSaveFailure.mockClear();
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn(() => 41),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("exposes and flushes the latest rAF-buffered source candidate", async () => {
    const writeProjectFile = vi.fn(async () => undefined);
    const mounted = await mountEditorSave(writeProjectFile);
    act(() => mounted.handle.handleContentChange("studio candidate"));

    expect(mounted.handle.getPendingCandidate()).toEqual({
      projectId: "project-a",
      path: "index.html",
      content: "studio candidate",
    });
    await expect(mounted.handle.flushPendingSave()).resolves.toEqual({ status: "clean" });
    expect(writeProjectFile).toHaveBeenCalledWith("index.html", "studio candidate", "before");

    await mounted.unmount();
  });

  it("joins an in-flight source save instead of writing the frozen candidate twice", async () => {
    let frame: FrameRequestCallback | null = null;
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => {
        frame = callback;
        return 42;
      }),
    );
    let finishWrite!: () => void;
    const writeProjectFile = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finishWrite = resolve;
          }),
      )
      .mockResolvedValue(undefined);
    const mounted = await mountEditorSave(writeProjectFile);
    act(() => mounted.handle.handleContentChange("candidate"));
    act(() => frame?.(0));
    await vi.waitFor(() => expect(writeProjectFile).toHaveBeenCalledOnce());

    const drained = mounted.handle.flushPendingSave();
    expect(writeProjectFile).toHaveBeenCalledOnce();
    finishWrite();
    await expect(drained).resolves.toEqual({ status: "clean" });
    expect(writeProjectFile).toHaveBeenCalledOnce();
    await mounted.unmount();
  });

  it("preserves conflict details when flushing a buffered source candidate", async () => {
    const conflict = new StudioFileConflictError({
      filePath: "index.html",
      currentVersion: "external-v2",
      currentContent: "external",
      attemptedContent: "studio candidate",
    });
    const mounted = await mountEditorSave(async () => {
      throw conflict;
    });
    act(() => mounted.handle.handleContentChange("studio candidate"));

    await expect(mounted.handle.flushPendingSave()).resolves.toEqual({
      status: "conflict",
      error: conflict,
    });
    expect(trackStudioSaveFailure).toHaveBeenCalledWith({
      source: "code_editor",
      error: conflict,
      filePath: "index.html",
    });

    await mounted.unmount();
  });

  it("emits one identical failure per five-second burst", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    const error = new Error("Load failed");
    const mounted = await mountEditorSave(async () => {
      throw error;
    });

    act(() => mounted.handle.handleContentChange("first candidate"));
    await mounted.handle.flushPendingSave();
    vi.spyOn(Date, "now").mockReturnValue(2_000);
    act(() => mounted.handle.handleContentChange("second candidate"));
    await mounted.handle.flushPendingSave();

    expect(trackStudioSaveFailure).toHaveBeenCalledOnce();
    expect(mounted.showToast).toHaveBeenCalledOnce();
    await mounted.unmount();
  });

  it("emits a changed failure immediately and repeats after the burst window", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000);
    const writeProjectFile = vi
      .fn<WriteProjectFile>()
      .mockRejectedValueOnce(new Error("Load failed"))
      .mockRejectedValueOnce(new Error("Failed to fetch"))
      .mockRejectedValueOnce(new Error("Failed to fetch"));
    const mounted = await mountEditorSave(writeProjectFile);

    act(() => mounted.handle.handleContentChange("first candidate"));
    await mounted.handle.flushPendingSave();
    now.mockReturnValue(2_000);
    act(() => mounted.handle.handleContentChange("second candidate"));
    await mounted.handle.flushPendingSave();
    now.mockReturnValue(8_000);
    act(() => mounted.handle.handleContentChange("third candidate"));
    await mounted.handle.flushPendingSave();

    expect(trackStudioSaveFailure).toHaveBeenCalledTimes(3);
    await mounted.unmount();
  });

  it("emits the same failure again after a successful save", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    const writeProjectFile = vi
      .fn<WriteProjectFile>()
      .mockRejectedValueOnce(new Error("Load failed"))
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("Load failed"));
    const mounted = await mountEditorSave(writeProjectFile);

    act(() => mounted.handle.handleContentChange("first candidate"));
    await mounted.handle.flushPendingSave();
    act(() => mounted.handle.handleContentChange("successful candidate"));
    await mounted.handle.flushPendingSave();
    act(() => mounted.handle.handleContentChange("third candidate"));
    await mounted.handle.flushPendingSave();

    expect(trackStudioSaveFailure).toHaveBeenCalledTimes(2);
    await mounted.unmount();
  });

  it("discards an rAF-buffered candidate without persisting it", async () => {
    const writeProjectFile = vi.fn(async () => undefined);
    const mounted = await mountEditorSave(writeProjectFile);
    act(() => mounted.handle.handleContentChange("discard me"));
    act(() => mounted.handle.discardPendingSave());

    expect(mounted.handle.getPendingCandidate()).toBeNull();
    await expect(mounted.handle.flushPendingSave()).resolves.toEqual({ status: "clean" });
    expect(writeProjectFile).not.toHaveBeenCalled();
    expect(cancelAnimationFrame).toHaveBeenCalledWith(41);

    await mounted.unmount();
  });
});
