// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DomEditSelection } from "../components/editor/domEditing";
import { useAskAgentModal } from "./useAskAgentModal";

const copied = vi.hoisted(() => [] as string[]);
vi.mock("../utils/clipboard", () => ({
  copyTextToClipboard: async (text: string) => copied.push(text) > 0,
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
  copied.length = 0;
  vi.unstubAllGlobals();
});

describe("useAskAgentModal", () => {
  it("sends the live element without the preview's lazy loading or look-ahead mark, keeping authored loading", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const element = document.createElement("div");
    element.setAttribute("data-hf-upcoming", "");
    element.innerHTML =
      '<img src="plate.png" loading="lazy" data-hf-preview-lazy><img src="own.png" loading="eager">';
    const selection: DomEditSelection = {
      element,
      label: "Plate",
      tagName: "div",
      sourceFile: "index.html",
      compositionPath: "index.html",
      isCompositionHost: false,
      isInsideLockedComposition: false,
      selector: "div",
      selectorIndex: 0,
      boundingBox: { x: 0, y: 0, width: 10, height: 10 },
      textContent: "",
      dataAttributes: {},
      inlineStyles: {},
      computedStyles: {},
      textFields: [],
      capabilities: {
        canSelect: true,
        canEditStyles: true,
        canCrop: false,
        canMove: true,
        canResize: true,
        canApplyManualOffset: false,
        canApplyManualSize: false,
        canApplyManualRotation: false,
      },
    };
    let hook: ReturnType<typeof useAskAgentModal> | null = null;
    function Harness() {
      hook = useAskAgentModal({
        projectId: "demo",
        activeCompPath: "index.html",
        projectDir: "/demo",
        projectIdRef: { current: "demo" },
        showToast: () => {},
        domEditSelectionRef: { current: selection },
        domEditSelection: selection,
      });
      return null;
    }
    const host = document.body.appendChild(document.createElement("div"));
    await act(async () => createRoot(host).render(<Harness />));

    await act(async () => hook!.handleAgentModalSubmit("Make it bigger"));

    expect(copied[0]).toContain('<img src="plate.png"><img src="own.png" loading="eager">');
    expect(copied[0]).not.toContain("data-hf-preview-lazy");
    expect(copied[0]).not.toContain("data-hf-upcoming");
  });
});
