// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STUDIO_MOTION_PATH } from "../components/editor/studioMotion";
import { isPreviewChanging } from "../player/previewReloading";
import { useEditHistoryActions, type EditHistoryHandle } from "./useEditHistoryActions";
import {
  beginStudioPendingEdit,
  isStudioEditSaving,
  setStudioPendingEditClaimClock,
  setStudioWaitingPressCancel,
  trackStudioPendingEdit,
} from "../utils/studioPendingEdits";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  setStudioPendingEditClaimClock(null);
  setStudioWaitingPressCancel(null);
});

type RestoreFiles = Record<string, { previous: string; restored: string }>;
type Prediction = { id: string; files: RestoreFiles };

function mount(
  result: {
    ok: boolean;
    reason?: string;
    message?: string;
    label?: string;
    paths?: string[];
    undoes?: string;
    files?: RestoreFiles;
  },
  predicted?: Prediction,
  claims: () => number = () => 7,
) {
  const editHistory = {
    undo: vi.fn<EditHistoryHandle["undo"]>(async () => result),
    redo: vi.fn<EditHistoryHandle["redo"]>(async () => result),
    predict: () => predicted ?? null,
    claims,
  };
  const putBack = vi.fn();
  const deps = {
    editHistory,
    readOptionalProjectFile: vi.fn(async () => ""),
    readProjectFile: vi.fn(async () => ""),
    writeProjectFile: vi.fn(async () => undefined),
    showToast: vi.fn(),
    syncHistoryPreviewAfterApply: vi.fn(async (_restore: unknown) => undefined),
    putBack,
    showHistoryRestoreNow: vi.fn((_files: RestoreFiles) => putBack),
    waitForPendingDomEditSaves: vi.fn(async () => undefined),
    onAfterUndoRedo: vi.fn(),
    activeCompPath: "index.html",
    forceReloadSdkSession: vi.fn(),
  };
  let actions!: ReturnType<typeof useEditHistoryActions>;
  function Probe() {
    actions = useEditHistoryActions(deps);
    return null;
  }
  root = createRoot(document.createElement("div"));
  act(() => root!.render(createElement(Probe)));
  return { deps, actions };
}

const PREDICTED = { id: "e1", files: { "index.html": { previous: "B", restored: "A" } } };
const SERVER_FILES = { "index.html": { previous: "B", restored: "A2" } };

describe("useEditHistoryActions", () => {
  it("counts an undo as a preview change from its key until its preview update is applied", async () => {
    const files = { "index.html": { previous: "B", restored: "A" } };
    const stepped = { ok: true, label: "Undid: Move", paths: ["index.html"], files };
    const { deps, actions } = mount(stepped);
    let answer: () => void = () => {};
    deps.editHistory.undo.mockImplementationOnce(
      () => new Promise((resolve) => (answer = () => resolve(stepped))),
    );
    let applied: () => void = () => {};
    deps.syncHistoryPreviewAfterApply.mockImplementationOnce(
      () => new Promise<undefined>((resolve) => (applied = () => resolve(undefined))),
    );
    const undone = actions.undo();
    expect(isPreviewChanging(), "from the key, before the server answers").toBe(true);
    await vi.waitFor(() => expect(deps.editHistory.undo).toHaveBeenCalled());
    expect(isPreviewChanging(), "while the server has the step").toBe(true);
    answer();
    await vi.waitFor(() => expect(deps.syncHistoryPreviewAfterApply).toHaveBeenCalled());
    expect(isPreviewChanging(), "until the preview update is applied").toBe(true);
    applied();
    await act(() => undone);
    expect(isPreviewChanging()).toBe(false);
  });

  it("takes back a canvas press still waiting to run, with no history step", async () => {
    const { deps, actions } = mount({ ok: true, label: "Undid: Move" });
    const cancel = vi.fn(() => (setStudioWaitingPressCancel(null), true));
    setStudioWaitingPressCancel(cancel);
    const revert = vi.fn(() => () => {});
    const saving = beginStudioPendingEdit(revert);
    await act(() => actions.redo());
    expect(cancel, "redo leaves the press").not.toHaveBeenCalled();
    await act(() => actions.undo());
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(revert, "the press is newer than any edit still saving").not.toHaveBeenCalled();
    expect(deps.editHistory.undo).not.toHaveBeenCalled();

    await act(() => actions.undo());
    expect(revert, "the following Cmd+Z takes back the edit still saving").toHaveBeenCalledTimes(1);
    saving.settle();
  });

  it("asks for the edit claimed after the key's claim count only when an edit was saving at the key", async () => {
    const { deps, actions } = mount({ ok: false, reason: "empty" });
    await act(() => actions.undo());
    expect(deps.editHistory.undo.mock.calls[0]![0].claimedAfter).toBeUndefined();

    let land!: () => void;
    trackStudioPendingEdit(new Promise<void>((resolve) => (land = resolve)));
    const undone = actions.undo();
    land();
    await act(() => undone);
    expect(deps.editHistory.undo.mock.calls[1]![0].claimedAfter).toBe(7);
  });

  it("corrects a shown step from the server's restore, diffed from what the preview shows", async () => {
    const { deps, actions } = mount(
      { ok: true, label: "Undid: Move", paths: ["index.html"], undoes: "e1", files: SERVER_FILES },
      PREDICTED,
    );
    await act(() => actions.undo());
    expect(deps.showHistoryRestoreNow).toHaveBeenCalledWith(PREDICTED.files);
    expect(deps.putBack).not.toHaveBeenCalled();
    expect(deps.syncHistoryPreviewAfterApply).toHaveBeenCalledWith({
      paths: ["index.html"],
      files: { "index.html": { previous: "A", restored: "A2" } },
    });
  });

  it("counts a shown step as saving until the server takes it, so a preview reload waits for its write", async () => {
    const { deps, actions } = mount(
      { ok: true, label: "Undid: Move", paths: ["index.html"], undoes: "e1", files: SERVER_FILES },
      PREDICTED,
    );
    let step!: () => void;
    const stepped = new Promise<void>((resolve) => (step = resolve));
    const undo = deps.editHistory.undo.getMockImplementation()!;
    deps.editHistory.undo.mockImplementation(async (cb) => (await stepped, undo(cb)));

    const undone = actions.undo();
    expect(deps.showHistoryRestoreNow).toHaveBeenCalledWith(PREDICTED.files);
    expect(isStudioEditSaving()).toBe(true);
    step();
    await act(() => undone);
    await Promise.resolve();
    expect(isStudioEditSaving()).toBe(false);
  });

  it("puts a shown step back and applies the server's own restore when it stepped another entry", async () => {
    const { deps, actions } = mount(
      {
        ok: true,
        label: "Undid: Outside",
        paths: ["index.html"],
        undoes: "e0",
        files: SERVER_FILES,
      },
      PREDICTED,
    );
    await act(() => actions.undo());
    expect(deps.putBack).toHaveBeenCalledTimes(1);
    expect(deps.syncHistoryPreviewAfterApply).toHaveBeenCalledWith({
      paths: ["index.html"],
      files: SERVER_FILES,
    });
  });

  it("reverts an edit still saving before painting an older predicted step", async () => {
    const reapply = vi.fn();
    const revert = vi.fn(() => reapply);
    const saving = beginStudioPendingEdit(revert);
    const { deps, actions } = mount(
      { ok: true, label: "Undid: Move", paths: ["index.html"], undoes: "e2" },
      PREDICTED,
    );
    const undone = actions.undo();
    expect(revert).toHaveBeenCalledTimes(1);
    expect(deps.showHistoryRestoreNow).not.toHaveBeenCalled();
    saving.settle();
    await act(() => undone);
    expect(deps.editHistory.undo).not.toHaveBeenCalled();
    expect(reapply).not.toHaveBeenCalled();
  });

  // Claim counts: when the edit began, at the key, and once its save landed.
  it.each([
    ["its claim counted while undo waited, the server undo is the shown revert", 7, 7, 8, 0],
    ["its claim counted before the key, the server undo is the shown revert", 7, 8, 8, 0],
    ["its claim never counted, the move is shown again", 7, 7, 7, 1],
  ])("an edit that lands while undo waits: %s", async (_, atBegin, atKey, atLand, reapplied) => {
    let claimCount = atBegin;
    setStudioPendingEditClaimClock(() => claimCount);
    const reapply = vi.fn();
    const saving = beginStudioPendingEdit(() => reapply);
    claimCount = atKey;
    const { deps, actions } = mount(
      { ok: true, label: "Undid: Move", paths: ["index.html"], undoes: "e8" },
      PREDICTED,
      () => claimCount,
    );
    const undone = actions.undo();
    saving.settle(saving.adopt(() => Promise.resolve()));
    claimCount = atLand;
    await act(() => undone);
    expect(deps.editHistory.undo).toHaveBeenCalledTimes(1);
    expect(deps.editHistory.undo.mock.calls[0]![0].claimedAfter).toBe(atBegin);
    expect(deps.showHistoryRestoreNow).not.toHaveBeenCalled();
    expect(reapply).toHaveBeenCalledTimes(reapplied);
  });

  it("puts a shown step back when the server refuses it", async () => {
    const { deps, actions } = mount(
      { ok: false, reason: "failed", message: "disk full" },
      PREDICTED,
    );
    await act(() => actions.undo());
    expect(deps.putBack).toHaveBeenCalledTimes(1);
    expect(deps.syncHistoryPreviewAfterApply).not.toHaveBeenCalled();
  });

  it("undo resyncs the preview and toasts the step as the history names it", async () => {
    const { deps, actions } = mount({ ok: true, label: "Undid: Move clip", paths: ["index.html"] });
    await act(() => actions.undo());
    expect(deps.waitForPendingDomEditSaves).toHaveBeenCalled();
    expect(deps.onAfterUndoRedo).toHaveBeenCalled();
    expect(deps.forceReloadSdkSession).toHaveBeenCalled();
    expect(deps.syncHistoryPreviewAfterApply).toHaveBeenCalled();
    expect(deps.showToast).toHaveBeenCalledWith("Undid: Move clip", "info");
  });

  it("redo reports the redone label and skips the SDK reload for other files", async () => {
    const { deps, actions } = mount({
      ok: true,
      label: "Redid: Split clip",
      paths: ["other.html"],
    });
    await act(() => actions.redo());
    expect(deps.forceReloadSdkSession).not.toHaveBeenCalled();
    expect(deps.showToast).toHaveBeenCalledWith("Redid: Split clip", "info");
  });

  it("names the files that changed since the edit when an undo is refused", async () => {
    const { deps, actions } = mount({
      ok: false,
      reason: "content-mismatch",
      paths: ["index.html"],
    });
    await act(() => actions.undo());
    expect(deps.showToast).toHaveBeenCalledWith(
      "Can't undo: index.html changed since that edit.",
      "info",
    );
    expect(deps.syncHistoryPreviewAfterApply).not.toHaveBeenCalled();
  });

  it("says why when the history could not take the step, with nothing shown to take back", async () => {
    const { deps, actions } = mount({ ok: false, reason: "failed", message: "disk full" });
    await act(() => actions.undo());
    expect(deps.showToast).toHaveBeenCalledWith("Undo failed: disk full", "error");
    expect(deps.syncHistoryPreviewAfterApply).not.toHaveBeenCalled();
  });

  it("waits for pending saves first and reads the motion file through the optional reader", async () => {
    const { deps, actions } = mount({ ok: true, label: "Move clip", paths: ["index.html"] });
    const order: string[] = [];
    deps.waitForPendingDomEditSaves.mockImplementation(async () => void order.push("wait"));
    deps.editHistory.undo.mockImplementation(async (cb) => {
      order.push("undo");
      await cb.readFile(STUDIO_MOTION_PATH);
      await cb.readFile("index.html");
      await cb.serialize?.(["index.html"], async () => order.push("serialized"));
      return { ok: true };
    });
    await act(() => actions.undo());
    expect(order).toEqual(["wait", "undo", "serialized"]);
    expect(deps.readOptionalProjectFile).toHaveBeenCalledWith(STUDIO_MOTION_PATH);
    expect(deps.readProjectFile).toHaveBeenCalledWith("index.html");
    expect(deps.readProjectFile).not.toHaveBeenCalledWith(STUDIO_MOTION_PATH);
  });
});
