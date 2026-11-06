// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeSelection } from "../../hooks/domSelectionTestHarness";
import { CANVAS_NUDGE_COMMIT_DEBOUNCE_MS } from "./domEditNudge";
import { __resetForTests } from "../../utils/canvasNudgeGate";
import { PreviewReadOnlyProvider } from "./previewReadOnlyContext";
import "./domEditOverlayTestMocks";
import { DomEditOverlay } from "./DomEditOverlay";
import { UNREADABLE_TRANSLATE } from "./plainTranslate";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const RECT = { left: 100, top: 100, width: 200, height: 100, editScaleX: 1, editScaleY: 1 };
const layout = vi.hoisted(() => ({
  group: [] as unknown[],
  hover: null as unknown,
  offCanvas: [] as unknown[],
  offCanvasElements: new Map<string, HTMLElement>(),
}));

const actions = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("../../contexts/DomEditContext", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../contexts/DomEditContext")>()),
  useDomEditActionsContextOptional: () => actions.current,
}));
vi.mock("./useOffCanvasIndicators", () => ({
  useOffCanvasIndicators: () => ({
    offCanvasRects: layout.offCanvas,
    offCanvasElementsRef: { current: layout.offCanvasElements },
  }),
}));

vi.mock("./useDomEditOverlayRects", () => ({
  useDomEditOverlayRects: () => ({
    overlayRect: { left: 100, top: 100, width: 200, height: 100, editScaleX: 1, editScaleY: 1 },
    overlayRectRef: {
      current: { left: 100, top: 100, width: 200, height: 100, editScaleX: 1, editScaleY: 1 },
    },
    setOverlayRect: () => undefined,
    hoverRect: layout.hover,
    groupOverlayItems: layout.group,
    groupOverlayItemsRef: { current: layout.group },
    setGroupOverlayItems: () => undefined,
    childRects: [],
  }),
}));
const BOX = '[data-dom-edit-selection-box="true"]';
let root: Root;
let host: HTMLElement;

function textElement(id: string): HTMLElement {
  const element = document.createElement("h1");
  element.id = id;
  element.textContent = "Title";
  document.body.append(element);
  return element;
}

function fixture(
  overrides: Partial<React.ComponentProps<typeof DomEditOverlay>> = {},
  readOnly = false,
) {
  const spies = {
    onCanvasMouseDown: vi.fn(),
    onSelectionChange: vi.fn(),
    onManualDragStart: vi.fn(),
    onBlockedMove: vi.fn(),
    onPathOffsetCommit: vi.fn(),
    onGroupPathOffsetCommit: vi.fn(),
    onBoxSizeCommit: vi.fn(),
    onRotationCommit: vi.fn(),
    onStyleCommit: vi.fn(),
    onDeleteSelection: vi.fn(),
    onApplyZIndex: vi.fn(),
    onMarqueeSelect: vi.fn(),
    onTextEditingChange: vi.fn(),
  };
  const selection = makeSelection("Title", textElement("title"));
  selection.capabilities.canApplyManualRotation = true;
  selection.textFields = [{ key: "text", label: "Text", value: "Title" }] as never;
  const props = {
    iframeRef: { current: document.createElement("iframe") },
    activeCompositionPath: null,
    selection,
    hoverSelection: null,
    onCanvasPointerMove: () => Promise.resolve(selection),
    onCanvasPointerLeave: () => undefined,
    ...spies,
    ...overrides,
  };
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root.render(
      <PreviewReadOnlyProvider readOnly={readOnly}>
        <DomEditOverlay {...props} />
      </PreviewReadOnlyProvider>,
    ),
  );
  return { spies, selection, overlay: host.firstElementChild as HTMLElement };
}

const fire = (target: Element, type: string, init: MouseEventInit = {}) => {
  const buttons = type === "pointerdown" || type === "pointermove" ? 1 : 0;
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    buttons,
    ...init,
  });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
};

const pressEnter = (overlay: HTMLElement) =>
  act(() => {
    overlay.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    );
  });

const clickBox = (overlay: HTMLElement) => {
  const box = overlay.querySelector(BOX)!;
  for (const type of ["pointerdown", "pointerup", "click"]) fire(box, type);
};

const enterOn = (target: Element) =>
  act(() => {
    target.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    );
  });

const rightClick = async (overlay: HTMLElement) => {
  await act(async () => {
    overlay.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }),
    );
  });
};

beforeEach(() => {
  vi.useFakeTimers();
  __resetForTests();
  HTMLElement.prototype.setPointerCapture = () => undefined;
});

afterEach(() => {
  act(() => root.unmount());
  actions.current = null;
  document.body.innerHTML = "";
  layout.group = [];
  layout.hover = null;
  layout.offCanvas = [];
  layout.offCanvasElements.clear();
  vi.useRealTimers();
});

describe("DomEditOverlay with the preview read-only", () => {
  it("control: with the flag off a press on the box starts a move", () => {
    const { spies, overlay } = fixture();
    fire(overlay.querySelector(BOX)!, "pointerdown");
    expect(spies.onManualDragStart).toHaveBeenCalledTimes(1);
  });

  it("refuses to start a move from the selection box", () => {
    const { spies, overlay } = fixture({}, true);
    const box = overlay.querySelector(BOX)!;
    fire(box, "pointerdown");
    fire(box, "pointermove", { clientX: 40 });
    fire(box, "pointerup");
    expect(spies.onManualDragStart).not.toHaveBeenCalled();
    expect(spies.onBlockedMove).not.toHaveBeenCalled();
    expect(spies.onPathOffsetCommit).not.toHaveBeenCalled();
  });

  it("offers no resize dots, and none can start a resize", () => {
    const off = fixture();
    expect(off.overlay.querySelectorAll("div.h-4.w-4")).toHaveLength(4);
    act(() => root.unmount());
    document.body.innerHTML = "";
    const { spies, overlay } = fixture({}, true);
    expect(overlay.querySelectorAll("div.h-4.w-4")).toHaveLength(0);
    expect(spies.onBoxSizeCommit).not.toHaveBeenCalled();
  });

  it("offers no rotate handle", () => {
    const off = fixture();
    expect(off.overlay.querySelector('[aria-label="Rotate selection"]')).not.toBeNull();
    act(() => root.unmount());
    document.body.innerHTML = "";
    const { spies, overlay } = fixture({}, true);
    expect(overlay.querySelector('[aria-label="Rotate selection"]')).toBeNull();
    expect(spies.onRotationCommit).not.toHaveBeenCalled();
  });

  it("offers no crop handles, so clip-path is never committed", () => {
    const off = fixture();
    expect(off.overlay.querySelector("[data-dom-edit-crop-frame]")).not.toBeNull();
    act(() => root.unmount());
    document.body.innerHTML = "";
    const { spies, overlay } = fixture({}, true);
    expect(overlay.querySelector("[data-dom-edit-crop-frame]")).toBeNull();
    expect(spies.onStyleCommit).not.toHaveBeenCalled();
  });

  it("does not drag a multi-selection", () => {
    const members = ["a", "b"].map((id) => {
      const selection = makeSelection(id, textElement(id));
      return { key: id, selection, element: selection.element, rect: RECT };
    });
    layout.group = members;
    const { spies, overlay } = fixture(
      {
        selection: null,
        groupSelections: members.map((m) => m.selection),
      },
      true,
    );
    fire(overlay.querySelector(BOX)!, "pointerdown");
    expect(spies.onManualDragStart).not.toHaveBeenCalled();
    expect(spies.onGroupPathOffsetCommit).not.toHaveBeenCalled();
  });

  const nudge = () => {
    const event = new KeyboardEvent("keydown", {
      key: "ArrowRight",
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      window.dispatchEvent(event);
      vi.advanceTimersByTime(CANVAS_NUDGE_COMMIT_DEBOUNCE_MS + 10);
    });
    return event;
  };

  it("control: with the flag off an arrow key nudges", () => {
    const { spies } = fixture();
    expect(nudge().defaultPrevented).toBe(true);
    expect(spies.onPathOffsetCommit).toHaveBeenCalledTimes(1);
  });

  it("neither nudges on an arrow key nor swallows it", () => {
    const { spies } = fixture({}, true);
    expect(nudge().defaultPrevented).toBe(false);
    expect(spies.onPathOffsetCommit).not.toHaveBeenCalled();
  });

  it("control: with the flag off Enter opens the text for editing", () => {
    const { selection, overlay } = fixture();
    pressEnter(overlay);
    expect(selection.element.hasAttribute("contenteditable")).toBe(true);
  });

  it("does not open text for editing on Enter", () => {
    const { selection, overlay } = fixture({}, true);
    pressEnter(overlay);
    expect(selection.element.hasAttribute("contenteditable")).toBe(false);
  });

  it("control: with the flag off right-click offers delete and z-order", async () => {
    const { overlay } = fixture();
    await rightClick(overlay);
    expect(document.body.textContent).toContain("Delete");
  });

  it("offers no delete or z-order on right-click when read-only", async () => {
    // Same fixture as the control test above (a real, already-selected element) so the
    // context menu actually opens; `selection: null` here would close it via
    // useCanvasContextMenuState's own deselect effect, before read-only ever mattered.
    const { spies, overlay } = fixture({}, true);
    await rightClick(overlay);
    expect(document.body.textContent).not.toContain("Delete");
    expect(spies.onDeleteSelection).not.toHaveBeenCalled();
    expect(spies.onApplyZIndex).not.toHaveBeenCalled();
  });

  it("still selects and reports to the host on right-click of an unselected element", async () => {
    const { spies, overlay } = fixture({ selection: null }, true);
    await rightClick(overlay);
    expect(spies.onSelectionChange).toHaveBeenCalledTimes(1);
  });

  it("still selects and reports to the host on a click", () => {
    const { spies, overlay } = fixture({ selection: null }, true);
    fire(overlay, "mousedown");
    expect(spies.onCanvasMouseDown).toHaveBeenCalledTimes(1);
  });

  it("still selects on a click of the selection box", () => {
    const { spies, overlay } = fixture({}, true);
    fire(overlay.querySelector(BOX)!, "click");
    expect(spies.onCanvasMouseDown).toHaveBeenCalledTimes(1);
  });
});

describe("DomEditOverlay with canvasInput host", () => {
  const HOST = { canvasInput: "host" } as const;

  it("lets presses through its root, and the overlay default keeps them", () => {
    expect(fixture().overlay.className).toContain("pointer-events-auto");
    act(() => root.unmount());
    expect(fixture(HOST).overlay.className).toContain("pointer-events-none");
  });

  it("draws the hover box for the selection the host hovers, and none without one", () => {
    layout.hover = RECT;
    const hovered = (props = {}) => {
      const { overlay } = fixture(props);
      const box = overlay.querySelector('[data-dom-edit-hover-box="true"]');
      act(() => root.unmount());
      return box;
    };
    const selection = makeSelection("Hover", textElement("hover"));
    expect(hovered({ hoverSelection: selection })).not.toBeNull();
    expect(hovered({ ...HOST, hoverSelection: selection })).not.toBeNull();
    expect(hovered({ ...HOST, hoverSelection: null })).toBeNull();
  });

  it("starts no marquee and makes no selection from a press on empty canvas", () => {
    const off = fixture({ selection: null });
    fire(off.overlay, "pointerdown");
    fire(off.overlay, "pointerup");
    expect(off.spies.onMarqueeSelect).toHaveBeenCalledWith([], false);
    act(() => root.unmount());
    const { spies, overlay } = fixture({ ...HOST, selection: null });
    fire(overlay, "pointerdown");
    fire(overlay, "mousedown");
    fire(overlay, "pointerup");
    expect(spies.onMarqueeSelect).not.toHaveBeenCalled();
    expect(spies.onCanvasMouseDown).not.toHaveBeenCalled();
  });

  it("opens no context menu and selects nothing on right-click", async () => {
    const { spies, overlay } = fixture({ ...HOST, selection: null });
    await rightClick(overlay);
    expect(spies.onSelectionChange).not.toHaveBeenCalled();
    act(() => root.unmount());
    await rightClick(fixture(HOST).overlay);
    expect(document.body.textContent).not.toContain("Delete");
  });

  it("does not re-select on a click of the selection box", () => {
    const off = fixture();
    clickBox(off.overlay);
    expect(off.spies.onCanvasMouseDown).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
    const { spies, overlay } = fixture(HOST);
    clickBox(overlay);
    fire(overlay.querySelector(BOX)!, "click");
    expect(spies.onCanvasMouseDown).not.toHaveBeenCalled();
  });

  it("offers no off-canvas indicator to press, so nothing re-selects from one", async () => {
    const MARK = '[aria-label="Select off-canvas element stray"]';
    const offCanvas = (props = {}) => {
      layout.offCanvasElements.set("stray", textElement("stray"));
      layout.offCanvas = [{ key: "stray", left: 820, top: 10, width: 120, height: 40 }];
      return fixture(props);
    };
    const off = offCanvas();
    fire(off.overlay.querySelector(MARK)!, "click");
    await vi.waitFor(() => expect(off.spies.onSelectionChange).toHaveBeenCalledTimes(1));
    act(() => root.unmount());
    const { spies, overlay } = offCanvas(HOST);
    expect(overlay.querySelector(MARK)).toBeNull();
    expect(spies.onSelectionChange).not.toHaveBeenCalled();
  });

  it("reports each selection-box click to the host once, by either route", () => {
    const cases = [
      { props: {}, movable: true, reselects: 1 },
      { props: HOST, movable: true, reselects: 0 },
      { props: HOST, movable: false, reselects: 0 },
    ];
    for (const { props, movable, reselects } of cases) {
      const onSelectionBoxClick = vi.fn();
      const { spies, selection, overlay } = fixture({ ...props, onSelectionBoxClick });
      selection.capabilities.canApplyManualOffset = movable;
      clickBox(overlay);
      expect(onSelectionBoxClick).toHaveBeenCalledTimes(1);
      expect(onSelectionBoxClick).toHaveBeenCalledWith(expect.anything(), selection);
      expect(spies.onCanvasMouseDown).toHaveBeenCalledTimes(reselects);
      act(() => root.unmount());
    }
  });

  it("does not report a press off the box, or a click on a group's box", () => {
    const onSelectionBoxClick = vi.fn();
    const off = fixture({ onSelectionBoxClick, onMarqueeSelect: undefined });
    for (const type of ["pointerdown", "mousedown", "pointerup", "click"]) fire(off.overlay, type);
    expect(off.spies.onCanvasMouseDown).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
    const members = ["a", "b"].map((id) => {
      const selection = makeSelection(id, textElement(id));
      return { key: id, selection, element: selection.element, rect: RECT };
    });
    members[1].selection.capabilities.canApplyManualOffset = false;
    layout.group = members;
    const { spies, overlay } = fixture({
      onSelectionBoxClick,
      selection: members[0].selection,
      groupSelections: members.map((m) => m.selection),
    });
    clickBox(overlay);
    expect(spies.onCanvasMouseDown).toHaveBeenCalledTimes(1);
    expect(onSelectionBoxClick).not.toHaveBeenCalled();
  });

  it("reports the first box click after a handle resize", () => {
    const onSelectionBoxClick = vi.fn();
    const { selection, overlay } = fixture({ ...HOST, onSelectionBoxClick });
    for (const type of ["pointerdown", "pointerup", "click"]) {
      fire(overlay.querySelector("div.h-4.w-4")!, type);
    }
    selection.capabilities.canApplyManualOffset = false;
    clickBox(overlay);
    expect(onSelectionBoxClick).toHaveBeenCalledTimes(1);
  });

  it("opens the text on Enter when nothing else has focus, not from a focused field", () => {
    const off = fixture();
    enterOn(document.body);
    expect(off.selection.element.hasAttribute("contenteditable")).toBe(false);
    act(() => root.unmount());
    const { spies, selection } = fixture(HOST);
    const field = document.createElement("input");
    document.body.append(field);
    enterOn(field);
    expect(selection.element.hasAttribute("contenteditable")).toBe(false);
    enterOn(document.body);
    expect(selection.element.hasAttribute("contenteditable")).toBe(true);
    expect(spies.onTextEditingChange.mock.calls).toEqual([[true]]);
  });

  it("keeps the handles working: drag, resize dots and rotate", () => {
    const { spies, overlay } = fixture(HOST);
    fire(overlay.querySelector(BOX)!, "pointerdown");
    expect(spies.onManualDragStart).toHaveBeenCalledTimes(1);
    fire(overlay.querySelector(BOX)!, "pointerup");
    expect(overlay.querySelectorAll("div.h-4.w-4")).toHaveLength(4);
    const rotate = overlay.querySelector('[aria-label="Rotate selection"]')!;
    fire(rotate, "pointerdown", { clientX: 200, clientY: 250 });
    fire(rotate, "pointermove", { clientX: 300, clientY: 150 });
    fire(rotate, "pointerup", { clientX: 300, clientY: 150 });
    expect(spies.onRotationCommit).toHaveBeenCalledTimes(1);
  });
});

describe("DomEditOverlay onTextEditingChange", () => {
  it("reports true when the caret goes live and false when the edit ends", () => {
    const { spies, selection, overlay } = fixture();
    expect(spies.onTextEditingChange).not.toHaveBeenCalled();
    pressEnter(overlay);
    expect(spies.onTextEditingChange.mock.calls).toEqual([[true]]);
    act(() => {
      selection.element.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      );
    });
    expect(spies.onTextEditingChange.mock.calls).toEqual([[true], [false]]);
  });

  it("saves the typed words and reports false when the overlay unmounts mid-edit", () => {
    const handleDomRichTextCommit = vi.fn();
    actions.current = { handleDomRichTextCommit };
    const { spies, selection, overlay } = fixture();
    pressEnter(overlay);
    selection.element.textContent = "Typed";
    act(() => root.unmount());
    expect(handleDomRichTextCommit).toHaveBeenCalledWith({
      element: selection.element,
      html: "Typed",
      previousHtml: "Title",
    });
    expect(spies.onTextEditingChange.mock.calls).toEqual([[true], [false]]);
  });
});

describe("DomEditOverlay on a layer whose translate Studio can't read", () => {
  it("refuses a drag and an arrow nudge out loud, and commits nothing", () => {
    const { spies, overlay, selection } = fixture();
    selection.element.style.setProperty("translate", "abs(10% - 50px) 0px");
    fire(overlay.querySelector(BOX)!, "pointerdown");
    const presses = [false, true, true].map(
      (repeat) =>
        new KeyboardEvent("keydown", {
          key: "ArrowRight",
          bubbles: true,
          cancelable: true,
          repeat,
        }),
    );
    act(() => {
      for (const press of presses) window.dispatchEvent(press);
      vi.advanceTimersByTime(CANVAS_NUDGE_COMMIT_DEBOUNCE_MS + 10);
    });
    // One toast for the drag and one for the whole held arrow, whose every press is swallowed.
    expect(spies.onBlockedMove.mock.calls).toEqual([
      [selection, UNREADABLE_TRANSLATE],
      [selection, UNREADABLE_TRANSLATE],
    ]);
    expect(presses.map((press) => press.defaultPrevented)).toEqual([true, true, true]);
    expect(spies.onPathOffsetCommit).not.toHaveBeenCalled();
    expect(selection.element.style.getPropertyValue("translate")).toBe("abs(10% - 50px) 0px");
  });
});
