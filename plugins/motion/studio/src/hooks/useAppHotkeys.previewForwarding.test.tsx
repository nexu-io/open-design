// @vitest-environment happy-dom

import React, { act, useRef } from "react";
import type { Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DomEditSelection } from "../components/editor/domEditing";
import { usePlayerStore } from "../player/store/playerStore";
import { useAppHotkeys } from "./useAppHotkeys";
import { mountReactHarness } from "./domSelectionTestHarness";
import { trackStudioEvent } from "../utils/studioTelemetry";

vi.mock("../utils/studioTelemetry", () => ({ trackStudioEvent: vi.fn() }));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const domDelete = vi.fn(async () => undefined);
const historyUndo = vi.fn(async () => ({ ok: false }));
const historyRedo = vi.fn(async () => ({ ok: false }));
const settle = vi.fn(async () => undefined);
let root: Root | null = null;
let sync: ((iframe: HTMLIFrameElement | null) => void) | null = null;

function selection(): DomEditSelection {
  const element = document.createElement("section");
  element.id = "card";
  return {
    element,
    id: "card",
    selector: "#card",
    selectorIndex: 0,
    sourceFile: "index.html",
  } as unknown as DomEditSelection;
}

function Harness() {
  const selectionRef = useRef<DomEditSelection | null>(selection());
  const hotkeys = useAppHotkeys({
    handleTimelineElementsDelete: vi.fn(async () => undefined),
    handleTimelineElementSplit: vi.fn(async () => undefined),
    handleDomEditElementDelete: domDelete,
    domEditSelectionRef: selectionRef,
    clearDomSelectionRef: useRef<() => void>(() => undefined),
    editHistory: {
      undo: historyUndo,
      redo: historyRedo,
      state: { undo: [], redo: [] },
    },
    readOptionalProjectFile: vi.fn(async () => ""),
    readProjectFile: vi.fn(async () => ""),
    writeProjectFile: vi.fn(async () => undefined),
    showToast: vi.fn(),
    syncHistoryPreviewAfterApply: vi.fn(async () => undefined),
    settlePendingEdits: settle,
    handleCopy: vi.fn(() => false),
    handlePaste: vi.fn(() => false),
    handleCut: vi.fn(() => false),
    onResetKeyframes: vi.fn(() => false),
    onDeleteSelectedKeyframes: vi.fn(),
    onAfterUndoRedo: vi.fn(),
  } as unknown as Parameters<typeof useAppHotkeys>[0]);
  sync = hotkeys.syncPreviewHotkeys;
  return null;
}

afterEach(() => {
  if (root) act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  usePlayerStore.getState().reset();
  domDelete.mockClear();
  historyUndo.mockClear();
  historyRedo.mockClear();
  settle.mockReset();
  settle.mockImplementation(async () => undefined);
  vi.mocked(trackStudioEvent).mockClear();
});

describe("preview iframe hotkey forwarding", () => {
  it("still delivers Delete after the preview reloads", () => {
    // A reload keeps the iframe element (no ref callback) and the same
    // WindowProxy (an identity check sees no change) but replaces the window
    // holding the listeners. Attaching once left Delete dead inside the canvas
    // after the first reload — and clicking the canvas is what puts focus there.
    root = mountReactHarness(<Harness />);

    const iframe = document.createElement("iframe");
    document.body.append(iframe);
    act(() => sync?.(iframe));

    // The reload: same element, a window that has lost its listeners.
    act(() => sync?.(iframe));

    const inner = iframe.contentWindow as (Window & typeof globalThis) | null;
    if (!inner) throw new Error("expected an iframe window");
    inner.document.body.dispatchEvent(
      new inner.KeyboardEvent("keydown", { key: "Delete", bubbles: true }),
    );

    expect(domDelete).toHaveBeenCalledTimes(1);
  });

  function mountWithPreview(): Window & typeof globalThis {
    root = mountReactHarness(<Harness />);
    const iframe = document.createElement("iframe");
    document.body.append(iframe);
    act(() => sync?.(iframe));
    const inner = iframe.contentWindow as (Window & typeof globalThis) | null;
    if (!inner) throw new Error("expected an iframe window");
    return inner;
  }

  async function press(inner: Window & typeof globalThis, init: KeyboardEventInit) {
    await act(async () => {
      inner.document.body.dispatchEvent(
        new inner.KeyboardEvent("keydown", { ...init, bubbles: true }),
      );
    });
  }

  it("takes one tracked undo step per Cmd+Z pressed inside the preview", async () => {
    await press(mountWithPreview(), { key: "z", ctrlKey: true });

    expect(historyUndo).toHaveBeenCalledTimes(1);
    expect(trackStudioEvent).toHaveBeenCalledTimes(1);
    expect(trackStudioEvent).toHaveBeenCalledWith("keyboard_shortcut", { action: "undo" });
  });

  it("settles pending edits, failed ones included, before Cmd+Z steps the history", async () => {
    let settled!: () => void;
    settle.mockImplementation(
      () => new Promise<undefined>((resolve) => (settled = () => resolve(undefined))),
    );
    await press(mountWithPreview(), { key: "z", ctrlKey: true });
    expect(settle).toHaveBeenCalledTimes(1);
    expect(historyUndo).not.toHaveBeenCalled();
    await act(async () => settled());
    expect(historyUndo).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["Shift+Cmd+Z", { key: "Z", metaKey: true, shiftKey: true }],
    ["Ctrl+Y", { key: "y", ctrlKey: true }],
  ])("takes one tracked redo step per %s pressed inside the preview", async (_, init) => {
    await press(mountWithPreview(), init);

    expect(historyRedo).toHaveBeenCalledTimes(1);
    expect(trackStudioEvent).toHaveBeenCalledTimes(1);
    expect(trackStudioEvent).toHaveBeenCalledWith("keyboard_shortcut", { action: "redo" });
  });

  it("stops handling preview keys once the app unmounts", async () => {
    root = mountReactHarness(<Harness />);
    const iframe = document.createElement("iframe");
    document.body.append(iframe);
    const inner = iframe.contentWindow as (Window & typeof globalThis) | null;
    if (!inner) throw new Error("expected an iframe window");
    const add = vi.spyOn(inner, "addEventListener");
    const remove = vi.spyOn(inner, "removeEventListener");
    act(() => sync?.(iframe));
    act(() => root?.unmount());
    root = null;

    await press(inner, { key: "z", ctrlKey: true });

    expect(historyUndo).not.toHaveBeenCalled();
    // happy-dom removes a listener whatever its capture flag; a browser does not, so pin the flag.
    expect(add).toHaveBeenCalled();
    expect(remove.mock.calls).toEqual(add.mock.calls);
  });
});
