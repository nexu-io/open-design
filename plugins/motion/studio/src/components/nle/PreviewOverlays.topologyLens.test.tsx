// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getPreviewState, iframeRef } from "./PreviewOverlaysTestMocks";
import { PreviewOverlays } from "./PreviewOverlays";

const previewState = getPreviewState();

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../contexts/DomEditContext", () => ({
  useDomEditSelectionContext: () => ({
    domEditHoverSelection: null,
    domEditSelection: null,
    domEditGroupSelections: [],
  }),
  useDomEditActionsContext: () => ({
    handlePreviewCanvasMouseDown: vi.fn(),
    handlePreviewCanvasPointerMove: vi.fn(),
    handlePreviewCanvasPointerLeave: vi.fn(),
    applyDomSelection: vi.fn(),
    handleBlockedDomMove: vi.fn(),
    handleDomManualDragStart: vi.fn(),
    handleDomPathOffsetCommit: vi.fn(),
    handleDomGroupPathOffsetCommit: vi.fn(),
    handleDomBoxSizeCommit: vi.fn(),
    handleDomRotationCommit: vi.fn(),
    handleDomStyleCommit: vi.fn(),
    applyMarqueeSelection: vi.fn(),
    handleDomEditElementDelete: vi.fn(),
    handleDomZIndexReorderCommit: vi.fn(),
  }),
}));

vi.mock("../editor/TopologyLens", async () => {
  const { createElement } = await import("react");
  return {
    TopologyLens: () => createElement("div", { "data-topology-host": "true" }),
  };
});
vi.mock("../../captions/components/CaptionOverlay", () => ({ CaptionOverlay: () => null }));
vi.mock("../editor/DomEditOverlay", () => ({ DomEditOverlay: () => null }));
vi.mock("../editor/MotionPathOverlay", () => ({ MotionPathOverlay: () => null }));
vi.mock("../editor/SnapToolbar", () => ({ SnapToolbar: () => null }));

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function render(props: Partial<React.ComponentProps<typeof PreviewOverlays>> = {}): void {
  host = document.createElement("div");
  iframeRef.current = document.createElement("iframe");
  document.body.append(host, iframeRef.current);
  root = createRoot(host);
  act(() => {
    root?.render(
      <PreviewOverlays
        shouldShowMotionPath={false}
        shouldShowSelectedDomBounds={false}
        {...props}
      />,
    );
  });
}

afterEach(() => {
  if (root) act(() => root?.unmount());
  root = null;
  host = null;
  iframeRef.current = null;
  previewState.captionEditMode = false;
  document.body.replaceChildren();
});

describe("PreviewOverlays Topology Lens host", () => {
  it("stays in Studio chrome while a block preview covers the composition", () => {
    render({
      blockPreview: {
        id: "block-a",
        title: "Block",
        posterUrl: "poster.png",
      } as React.ComponentProps<typeof PreviewOverlays>["blockPreview"],
    });

    expect(host?.querySelector('[data-topology-host="true"]')).not.toBeNull();
  });

  it("stays independent of caption editing chrome", () => {
    previewState.captionEditMode = true;
    render();

    expect(host?.querySelector('[data-topology-host="true"]')).not.toBeNull();
  });
});
