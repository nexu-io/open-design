// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { PropertyPanel } from "./PropertyPanel";
import type { PropertyPanelProps } from "./propertyPanelHelpers";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../contexts/StudioContext", async () => {
  const actual = await vi.importActual<typeof import("../../contexts/StudioContext")>(
    "../../contexts/StudioContext",
  );
  return { ...actual, useStudioShellContext: () => ({ showToast: vi.fn() }) };
});

function selectedElement(): NonNullable<PropertyPanelProps["element"]> {
  return {
    element: document.createElement("div"),
    id: "el",
    selector: "#el",
    label: "El",
    tagName: "div",
    sourceFile: "index.html",
    compositionPath: "index.html",
    isCompositionHost: false,
    isInsideLockedComposition: false,
    boundingBox: { x: 0, y: 0, width: 10, height: 10 },
    textContent: "",
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

describe("PropertyPanel deselect", () => {
  it("re-renders to the empty state on deselect without a hooks-order crash", () => {
    const props = {
      element: selectedElement(),
      assets: [],
      onSetStyle: vi.fn(),
      onSetText: vi.fn(),
      onSetAttributeLive: vi.fn(),
      onClearSelection: vi.fn(),
    } as unknown as PropertyPanelProps;
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() => root.render(<PropertyPanel {...props} />));

    // A same-instance re-render with no element — Escape, clicking empty canvas,
    // or "Clear selection" — must not change which hooks ran.
    expect(() => {
      act(() => root.render(<PropertyPanel {...props} element={null} />));
    }).not.toThrow();

    act(() => root.unmount());
  });
});
