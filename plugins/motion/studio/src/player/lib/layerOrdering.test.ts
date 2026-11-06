// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { getElementZIndex, resolveContextOrder } from "./layerOrdering";

function makeElement(zIndex?: string): HTMLElement {
  const element = document.createElement("div");
  if (zIndex != null) element.style.zIndex = zIndex;
  document.body.appendChild(element);
  return element;
}

describe("getElementZIndex", () => {
  it("returns inline z-index when present", () => {
    expect(getElementZIndex(makeElement("7"))).toBe(7);
  });

  it("falls back to computed style when inline z-index is not usable", () => {
    const element = makeElement();
    element.className = "computed-z";
    const style = document.createElement("style");
    style.textContent = ".computed-z { position: relative; z-index: 12; }";
    document.head.appendChild(style);

    expect(getElementZIndex(element)).toBe(12);
  });

  it("returns zero for auto or missing z-index", () => {
    expect(getElementZIndex(makeElement())).toBe(0);
    expect(getElementZIndex(makeElement("auto"))).toBe(0);
  });
});

describe("resolveContextOrder", () => {
  it("sorts a flat sibling group by z-index descending then original order", () => {
    const ordered = resolveContextOrder([
      { id: "a", zIndex: 2, parentCompositionId: null, compositionAncestors: ["root"] },
      { id: "b", zIndex: 5, parentCompositionId: null, compositionAncestors: ["root"] },
      { id: "c", zIndex: 5, parentCompositionId: null, compositionAncestors: ["root"] },
    ]);

    expect(ordered.map((item) => item.id)).toEqual(["b", "c", "a"]);
  });

  it("keeps distinct stacking contexts from interleaving", () => {
    const ordered = resolveContextOrder([
      { id: "root-low", zIndex: 1, parentCompositionId: null, compositionAncestors: ["root"] },
      {
        id: "nested-high",
        zIndex: 100,
        parentCompositionId: "scene",
        compositionAncestors: ["root", "scene"],
      },
      { id: "root-top", zIndex: 2, parentCompositionId: null, compositionAncestors: ["root"] },
    ]);

    expect(ordered.map((item) => item.id)).toEqual(["root-top", "root-low", "nested-high"]);
  });

  it("returns an empty list for empty input", () => {
    expect(resolveContextOrder([])).toEqual([]);
  });
});
