// @vitest-environment happy-dom

import React, { act, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TextAreaField } from "../components/editor/propertyPanelSections";
import type { DomEditSelection } from "../components/editor/domEditing";
import { usePlayerStore } from "../player/store/playerStore";
import { useAppHotkeys } from "./useAppHotkeys";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const timelineDeleteMany = vi.fn(async () => undefined);
const domDelete = vi.fn(async () => undefined);
const keyframeDelete = vi.fn();
const textCommits = vi.fn();
let root: Root | null = null;

function parentWithTextChild(): DomEditSelection {
  const element = document.createElement("section");
  element.id = "selected-card";
  const child = document.createElement("span");
  child.textContent = "Kicker";
  element.append(child);
  return {
    element,
    id: "selected-card",
    selector: "#selected-card",
    selectorIndex: 0,
    label: "Selected card",
    tagName: "section",
    sourceFile: "index.html",
    compositionPath: "index.html",
    isCompositionHost: false,
    isInsideLockedComposition: false,
    boundingBox: { x: 0, y: 0, width: 320, height: 180 },
    textContent: "Kicker",
    dataAttributes: {},
    inlineStyles: {},
    computedStyles: {},
    textFields: [
      {
        key: "child:0:span",
        label: "Content",
        value: "Kicker",
        tagName: "span",
        attributes: [],
        inlineStyles: {},
        computedStyles: {},
        source: "child",
        sourceChildIndex: 0,
      },
    ],
    capabilities: {
      canSelect: true,
      canEditStyles: true,
      canCrop: false,
      canMove: true,
      canResize: true,
      canApplyManualOffset: true,
      canApplyManualSize: true,
      canApplyManualRotation: true,
    },
  };
}

function Harness() {
  const [value, setValue] = useState("Kicker");
  const [selectionRefreshed, setSelectionRefreshed] = useState(false);
  const selectionRef = useRef<DomEditSelection | null>(parentWithTextChild());
  const clearSelectionRef = useRef<() => void>(() => undefined);

  useAppHotkeys({
    handleTimelineElementsDelete: timelineDeleteMany,
    handleTimelineElementSplit: vi.fn(async () => undefined),
    handleDomEditElementDelete: domDelete,
    domEditSelectionRef: selectionRef,
    clearDomSelectionRef: clearSelectionRef,
    editHistory: {
      undo: vi.fn(async () => ({ ok: false })),
      redo: vi.fn(async () => ({ ok: false })),
      state: { undo: [], redo: [] },
    },
    readOptionalProjectFile: vi.fn(async () => ""),
    readProjectFile: vi.fn(async () => ""),
    writeProjectFile: vi.fn(async () => undefined),
    showToast: vi.fn(),
    syncHistoryPreviewAfterApply: vi.fn(async () => undefined),
    settlePendingEdits: vi.fn(async () => undefined),
    handleCopy: vi.fn(() => false),
    handlePaste: vi.fn(async () => undefined),
    handleCut: vi.fn(async () => false),
    handleDuplicate: vi.fn(async () => false),
    onResetKeyframes: vi.fn(() => false),
    onDeleteSelectedKeyframes: keyframeDelete,
    readOnlyPreview: false,
  });

  return (
    <>
      <TextAreaField
        label="Content"
        value={value}
        onCommit={(next) => {
          textCommits(next);
          setValue(next);
          // Text persistence rebuilds the selected parent's text-field model
          // from the preview. Model that refresh: it must not transfer keyboard
          // ownership away from the still-mounted Content editor.
          setSelectionRefreshed(true);
        }}
      />
      <button type="button" data-testid="canvas" data-selection-refreshed={selectionRefreshed}>
        Canvas
      </button>
    </>
  );
}

function setTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  if (!setter) throw new Error("expected native textarea value setter");
  setter.call(textarea, value);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  textarea.setSelectionRange(value.length, value.length);
}

function pressBackspace(target: HTMLElement): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key: "Backspace",
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  vi.useFakeTimers();
  timelineDeleteMany.mockClear();
  domDelete.mockClear();
  keyframeDelete.mockClear();
  textCommits.mockClear();
  usePlayerStore.getState().reset();
  usePlayerStore.getState().setElements([
    {
      id: "selected-card",
      tag: "section",
      start: 0,
      duration: 10,
      track: 0,
    },
  ]);
  usePlayerStore.getState().setSelectedElementId("selected-card");
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  usePlayerStore.getState().reset();
  vi.useRealTimers();
});

describe("useAppHotkeys text-field ownership", () => {
  it("keeps two Backspaces in a child text editor across its scheduled save", () => {
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    act(() => root?.render(<Harness />));

    const textarea = host.querySelector("textarea");
    const canvas = host.querySelector<HTMLButtonElement>('[data-testid="canvas"]');
    if (!textarea || !canvas) throw new Error("expected text editor and canvas target");

    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);

    const first = pressBackspace(textarea);
    act(() => setTextareaValue(textarea, "Kicke"));
    act(() => vi.advanceTimersByTime(120));

    expect(first.defaultPrevented).toBe(false);
    expect(textCommits).toHaveBeenLastCalledWith("Kicke");
    expect(canvas.dataset.selectionRefreshed).toBe("true");
    expect(document.activeElement).toBe(textarea);
    expect(textarea.selectionStart).toBe(5);
    expect(textarea.selectionEnd).toBe(5);

    const second = pressBackspace(textarea);
    act(() => setTextareaValue(textarea, "Kick"));
    act(() => vi.advanceTimersByTime(120));

    expect(second.defaultPrevented).toBe(false);
    expect(textarea.value).toBe("Kick");
    expect(textCommits.mock.calls).toEqual([["Kicke"], ["Kick"]]);
    expect(document.activeElement).toBe(textarea);
    expect(textarea.selectionStart).toBe(4);
    expect(textarea.selectionEnd).toBe(4);
    expect(timelineDeleteMany).not.toHaveBeenCalled();
    expect(domDelete).not.toHaveBeenCalled();
    expect(keyframeDelete).not.toHaveBeenCalled();

    canvas.focus();
    const canvasDelete = pressBackspace(canvas);

    expect(canvasDelete.defaultPrevented).toBe(true);
    // The canvas holds a selection, so it owns the delete — the timeline's copy
    // of that selection is derived and drops any member without a timeline row.
    expect(domDelete).toHaveBeenCalledTimes(1);
    expect(timelineDeleteMany).not.toHaveBeenCalled();
    expect(keyframeDelete).not.toHaveBeenCalled();
  });
});
