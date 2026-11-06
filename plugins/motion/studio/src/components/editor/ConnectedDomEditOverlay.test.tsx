// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getPreviewState, iframeRef } from "../nle/PreviewOverlaysTestMocks";
import { PreviewOverlays } from "../nle/PreviewOverlays";
import { ConnectedDomEditOverlay } from "./ConnectedDomEditOverlay";

// Overlay prop -> session handler, as PreviewOverlays wired DomEditOverlay itself.
const WIRING = {
  onCanvasMouseDown: "handlePreviewCanvasMouseDown",
  onCanvasPointerMove: "handlePreviewCanvasPointerMove",
  onCanvasPointerLeave: "handlePreviewCanvasPointerLeave",
  onSelectionChange: "applyDomSelection",
  onBlockedMove: "handleBlockedDomMove",
  onManualDragStart: "handleDomManualDragStart",
  onPathOffsetCommit: "handleDomPathOffsetCommit",
  onGroupPathOffsetCommit: "handleDomGroupPathOffsetCommit",
  onBoxSizeCommit: "handleDomBoxSizeCommit",
  onRotationCommit: "handleDomRotationCommit",
  onStyleCommit: "handleDomStyleCommit",
  onDeleteSelection: "handleDomEditElementDelete",
  onMarqueeSelect: "applyMarqueeSelection",
} as const;

const ctx = vi.hoisted(() => ({
  overlayProps: null as Record<string, unknown> | null,
  actions: {} as Record<string, unknown>,
  selection: {
    domEditHoverSelection: { label: "hover" },
    domEditSelection: { label: "selected" },
    domEditGroupSelections: [{ label: "member" }],
  },
}));

vi.mock("../../contexts/DomEditContext", () => ({
  useDomEditSelectionContext: () => ctx.selection,
  useDomEditActionsContext: () => ctx.actions,
}));
vi.mock("./DomEditOverlay", () => ({
  DomEditOverlay: (props: Record<string, unknown>) => {
    ctx.overlayProps = props;
    return null;
  },
}));
vi.mock("./TopologyLens", () => ({ TopologyLens: () => null }));
vi.mock("./MotionPathOverlay", () => ({ MotionPathOverlay: () => null }));
vi.mock("./SnapToolbar", () => ({ SnapToolbar: () => null }));
vi.mock("./GridOverlay", () => ({ GridOverlay: () => null }));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;

function mount(node: React.ReactNode): Record<string, unknown> {
  ctx.actions = {
    previewIframeRef: iframeRef,
    handleDomZIndexReorderCommit: vi.fn(() => Promise.resolve(undefined)),
  };
  for (const name of Object.values(WIRING)) ctx.actions[name] = vi.fn();
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(node));
  return ctx.overlayProps!;
}

afterEach(() => {
  act(() => root.unmount());
  ctx.overlayProps = null;
  getPreviewState().isPlaying = false;
  document.body.replaceChildren();
});

describe("ConnectedDomEditOverlay", () => {
  it("is what PreviewOverlays renders, with every handler from the session", () => {
    const props = mount(
      <PreviewOverlays
        shouldShowMotionPath={false}
        shouldShowSelectedDomBounds={true}
        recordingState={"idle" as never}
        onToggleRecording={vi.fn()}
      />,
    );
    // The overlay never read these, so the connected wrapper does not pass them.
    expect(props).not.toHaveProperty("recordingState");
    expect(props).not.toHaveProperty("onToggleRecording");
    for (const [prop, handler] of Object.entries(WIRING)) {
      expect(props[prop], prop).toBe(ctx.actions[handler]);
    }
    expect(props).toMatchObject({
      iframeRef,
      activeCompositionPath: "index.html",
      hoverSelection: ctx.selection.domEditHoverSelection,
      selection: ctx.selection.domEditSelection,
      groupSelections: ctx.selection.domEditGroupSelections,
      allowCanvasMovement: true,
      canvasInput: undefined,
      onTextEditingChange: undefined,
    });
  });

  it("shows no hover box while playback runs", () => {
    getPreviewState().isPlaying = true;
    const props = mount(
      <PreviewOverlays shouldShowMotionPath={false} shouldShowSelectedDomBounds={true} />,
    );
    expect(props.hoverSelection).toBeNull();
    expect(props.selection).toBe(ctx.selection.domEditSelection);
  });

  it("hides the selection and stops movement while a gesture records", () => {
    const props = mount(
      <PreviewOverlays
        shouldShowMotionPath={false}
        shouldShowSelectedDomBounds={false}
        isGestureRecording={true}
      />,
    );
    expect(props).toMatchObject({
      selection: null,
      groupSelections: [],
      allowCanvasMovement: false,
    });
  });

  it("persists a z-order change through the session's reorder commit", () => {
    const props = mount(
      <PreviewOverlays shouldShowMotionPath={false} shouldShowSelectedDomBounds={true} />,
    );
    const element = document.createElement("div");
    element.id = "card";
    const sel = { element, id: "card", selector: "#card", sourceFile: "index.html" };
    const apply = props.onApplyZIndex as (...args: unknown[]) => void;
    act(() => apply(sel, [{ element, zIndex: 4 }], "bring-forward", null));
    expect(ctx.actions.handleDomZIndexReorderCommit).toHaveBeenCalledWith(
      [expect.objectContaining({ element, zIndex: 4, id: "card", sourceFile: "index.html" })],
      expect.stringContaining("z-reorder:bring-forward"),
      "bring-forward",
    );
  });

  it("passes a host's canvas input, text-editing listener and hover gate to the overlay", () => {
    const onTextEditingChange = vi.fn();
    const props = mount(
      <ConnectedDomEditOverlay
        activeCompositionPath={null}
        showHoverSelection={false}
        shouldShowSelectedDomBounds={true}
        canvasInput="host"
        allowBodyDrag={false}
        onTextEditingChange={onTextEditingChange}
      />,
    );
    expect(props).toMatchObject({
      canvasInput: "host",
      allowBodyDrag: false,
      onTextEditingChange,
      hoverSelection: null,
      selection: ctx.selection.domEditSelection,
      iframeRef,
    });
  });
});
