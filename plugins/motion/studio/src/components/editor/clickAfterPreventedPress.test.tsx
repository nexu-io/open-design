// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { makeSelection } from "../../hooks/domSelectionTestHarness";
import type { DomEditSelection } from "./domEditing";
import "./domEditOverlayTestMocks";
import { DomEditOverlay } from "./DomEditOverlay";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
HTMLElement.prototype.setPointerCapture ??= () => {};
HTMLElement.prototype.releasePointerCapture ??= () => {};

const pointTarget = vi.hoisted(() => ({ current: null as HTMLElement | null }));
const rect = vi.hoisted(() => ({ current: null as Record<string, number> | null }));
vi.mock("../../utils/studioPreviewHelpers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/studioPreviewHelpers")>()),
  getPreviewTargetFromPointer: () => pointTarget.current,
}));
vi.mock("./useDomEditOverlayRects", () => ({
  useDomEditOverlayRects: () => ({
    overlayRect: rect.current,
    overlayRectRef: rect,
    setOverlayRect: () => undefined,
    hoverRect: null,
    groupOverlayItems: [],
    groupOverlayItemsRef: { current: [] },
    setGroupOverlayItems: () => undefined,
    childRects: [],
  }),
}));

let root: Root;
const onCanvasMouseDown = vi.fn();
const onSelectionChange = vi.fn();

function mount() {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const element = document.createElement("h1");
  document.body.append(element);
  return { host, element, hover: makeSelection("Title", element) };
}

function render(
  hoverSelection: DomEditSelection | null,
  selection: DomEditSelection | null = null,
) {
  act(() =>
    root.render(
      <DomEditOverlay
        iframeRef={{ current: document.createElement("iframe") }}
        activeCompositionPath={null}
        selection={selection}
        hoverSelection={hoverSelection}
        onCanvasMouseDown={onCanvasMouseDown}
        onCanvasPointerMove={() => Promise.resolve(null)}
        onCanvasPointerLeave={() => undefined}
        onSelectionChange={onSelectionChange}
        onBlockedMove={() => undefined}
        onPathOffsetCommit={() => undefined}
        onGroupPathOffsetCommit={() => undefined}
        onBoxSizeCommit={() => undefined}
        onRotationCommit={() => undefined}
        onMarqueeSelect={() => undefined}
      />,
    ),
  );
}

// Like Chrome: a default-prevented pointerdown sends no compatibility mousedown.
function press(target: Element, shiftKey = false) {
  const init = { bubbles: true, cancelable: true, button: 0, pointerId: 1, shiftKey };
  const down = new PointerEvent("pointerdown", init);
  act(() => void target.dispatchEvent(down));
  if (!down.defaultPrevented)
    act(() => void target.dispatchEvent(new MouseEvent("mousedown", init)));
  act(() => void target.dispatchEvent(new PointerEvent("pointerup", init)));
  act(() => void target.dispatchEvent(new MouseEvent("click", init)));
}

afterEach(() => {
  act(() => root.unmount());
  onCanvasMouseDown.mockClear();
  onSelectionChange.mockClear();
  pointTarget.current = null;
  rect.current = null;
  document.body.innerHTML = "";
});

it.each([
  ["a press on empty canvas", false],
  ["a shift+click add", true],
])("after %s, the next click on an element selects it", (_, shiftFirst) => {
  const { host, element, hover } = mount();
  const overlay = () => host.firstElementChild!;

  pointTarget.current = shiftFirst ? element : null;
  render(shiftFirst ? hover : null);
  press(overlay(), shiftFirst);
  expect(onCanvasMouseDown).not.toHaveBeenCalled();

  pointTarget.current = element;
  render(hover);
  press(overlay());
  expect(onCanvasMouseDown).toHaveBeenCalledTimes(1);
});

it("a shift+click on a selected box that cannot move toggles it once", () => {
  const { host, element, hover } = mount();
  hover.capabilities.canApplyManualOffset = false;
  rect.current = { left: 20, top: 30, width: 100, height: 40, editScaleX: 1, editScaleY: 1 };
  pointTarget.current = element;
  render(hover, hover);

  press(host.querySelector('[data-dom-edit-selection-box="true"]')!, true);

  expect(onSelectionChange).toHaveBeenCalledTimes(1);
  expect(onCanvasMouseDown).not.toHaveBeenCalled();
});
