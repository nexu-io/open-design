// @vitest-environment jsdom
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DomEditSelection } from "../components/editor/domEditing";
import { DomEditSaveQueueOpenError } from "../utils/domEditSaveQueue";
import { mountReactHarness } from "./domSelectionTestHarness";
import { useDomEditPositionPatchCommit } from "./useDomEditPositionPatchCommit";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

let cleanup: (() => void) | null = null;

function selectionStub(): DomEditSelection {
  const element = document.createElement("div");
  element.id = "card";
  return {
    id: "card",
    element,
    label: "Card",
    tagName: "div",
    sourceFile: "index.html",
    compositionPath: "index.html",
    isCompositionHost: false,
    isInsideLockedComposition: false,
    boundingBox: { x: 0, y: 0, width: 100, height: 100 },
    textContent: null,
    dataAttributes: {},
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

function renderCommit(params: Parameters<typeof useDomEditPositionPatchCommit>[0]) {
  const captured: { commit: ReturnType<typeof useDomEditPositionPatchCommit> | null } = {
    commit: null,
  };
  function Probe() {
    captured.commit = useDomEditPositionPatchCommit(params);
    return null;
  }
  const root = mountReactHarness(<Probe />);
  cleanup = () => act(() => root.unmount());
  if (!captured.commit) throw new Error("hook did not initialize");
  return captured.commit;
}

function paramsWith(persistDomEditOperations: () => Promise<undefined>) {
  const showToast = vi.fn();
  return {
    showToast,
    params: {
      activeCompPath: "index.html",
      persistDomEditOperations,
      showToast,
    },
  };
}

const options = { label: "Move layer", coalesceKey: "path-offset:card" };

afterEach(() => {
  cleanup?.();
  cleanup = null;
  vi.restoreAllMocks();
});

describe("useDomEditPositionPatchCommit", () => {
  it("rejects when the save queue is paused, so the caller can revert its optimistic change", async () => {
    const { showToast, params } = paramsWith(() => Promise.reject(new DomEditSaveQueueOpenError()));
    const commit = renderCommit(params);

    await act(async () => {
      await expect(commit(selectionStub(), [], options)).rejects.toBeInstanceOf(
        DomEditSaveQueueOpenError,
      );
    });

    // No toast: the paused-save banner already tells the human, and one toast per
    // blocked edit is what the original swallow existed to prevent.
    expect(showToast).not.toHaveBeenCalled();
  });

  it("toasts and rejects on an ordinary save failure", async () => {
    const { showToast, params } = paramsWith(() => Promise.reject(new Error("server said no")));
    const commit = renderCommit(params);

    await act(async () => {
      await expect(commit(selectionStub(), [], options)).rejects.toThrow("server said no");
    });

    expect(showToast).toHaveBeenCalledWith("server said no");
  });

  it("resolves when the write lands", async () => {
    const { showToast, params } = paramsWith(() => Promise.resolve(undefined));
    const commit = renderCommit(params);

    await act(async () => {
      await expect(commit(selectionStub(), [], options)).resolves.toBeUndefined();
    });

    expect(showToast).not.toHaveBeenCalled();
  });
});
