// Shared harness helpers for selection hook tests (useDomSelection,
// usePreviewInteraction). Test-only module.
import type React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { DomEditSelection } from "../components/editor/domEditing";
import { buildStableSelector, getSelectorIndex } from "../components/editor/domEditingDom";

export function installReactActEnvironment(): void {
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
    value: true,
    configurable: true,
  });
}

export function withInlineLayoutBox<T extends HTMLElement>(el: T): T {
  Object.defineProperties(el, {
    offsetWidth: { get: () => Number.parseFloat(el.style.width) || 0 },
    offsetHeight: { get: () => Number.parseFloat(el.style.height) || 0 },
  });
  return el;
}

/** Mount a React element into a fresh detached host and return its root. */
export function mountReactHarness(node: React.ReactElement): Root {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => {
    root.render(node);
  });
  return root;
}

export function makeSelection(label: string, element: HTMLElement): DomEditSelection {
  return {
    element,
    id: element.id || undefined,
    selector: `#${element.id || label}`,
    selectorIndex: 0,
    sourceFile: "index.html",
    compositionPath: "index.html",
    label,
    tagName: element.tagName.toLowerCase(),
    isCompositionHost: false,
    isInsideLockedComposition: false,
    boundingBox: { x: 0, y: 0, width: 100, height: 40 },
    textContent: element.textContent,
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
      canApplyManualRotation: false,
    },
  };
}

/** Built as getDomLayerPatchTarget builds it: a bare class for an element with no id or hf-id. */
export function stableSelectionFor(el: HTMLElement): DomEditSelection {
  const selector = buildStableSelector(el);
  return {
    element: el,
    id: el.id || undefined,
    hfId: el.getAttribute("data-hf-id") || undefined,
    selector,
    selectorIndex: getSelectorIndex(document, el, selector, "index.html", null),
    sourceFile: "index.html",
    dataAttributes: { start: "0", duration: "2" },
  } as unknown as DomEditSelection;
}

export function mountGroupSiblings(count: number, withIds = false): HTMLElement[] {
  const groups = Array.from({ length: count }, (_, i) =>
    withIds ? `<div class="group" id="group-${i}"></div>` : `<div class="group"></div>`,
  );
  document.body.innerHTML = `<div id="scene" class="clip" data-start="0" data-duration="2">${groups.join("")}</div>`;
  return Array.from(document.querySelectorAll<HTMLElement>(".group"));
}
