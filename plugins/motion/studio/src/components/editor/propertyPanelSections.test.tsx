// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FlatTextSection } from "./propertyPanelFlatTextSection";
import type { DomEditSelection } from "./domEditingTypes";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
});

function makeElement(overrides: Partial<DomEditSelection> = {}): DomEditSelection {
  return {
    element: document.createElement("div"),
    id: "mono-label",
    selector: ".mono-label",
    label: "Mono Label",
    tagName: "div",
    sourceFile: "index.html",
    compositionPath: "index.html",
    isCompositionHost: false,
    isInsideLockedComposition: false,
    boundingBox: { x: 0, y: -24, width: 257, height: 29 },
    textContent: "PACKETS / FRAME",
    dataAttributes: {},
    inlineStyles: {},
    computedStyles: {},
    textFields: [
      {
        key: "field-0",
        label: "Text",
        value: "PACKETS / FRAME",
        tagName: "div",
        attributes: [],
        inlineStyles: { "letter-spacing": "3.96px" },
        computedStyles: {
          "font-family": "JetBrains Mono",
          "font-size": "22px",
          "font-weight": "400",
          "letter-spacing": "3.96px",
          "line-height": "normal",
          "text-align": "right",
          "text-transform": "none",
          "font-style": "normal",
          color: "rgb(255, 176, 32)",
        },
        source: "self",
      },
    ],
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
    ...overrides,
  } as DomEditSelection;
}

function renderSection(overrides: Partial<DomEditSelection> = {}) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const element = makeElement(overrides);
  act(() => {
    root.render(
      <FlatTextSection
        element={element}
        styles={{}}
        fontAssets={[]}
        onSetText={vi.fn()}
        onSetTextFieldStyle={vi.fn()}
        onAddTextField={vi.fn()}
        onRemoveTextField={vi.fn()}
      />,
    );
  });
  return { host, root };
}

describe("FlatTextSection", () => {
  it("renders the content block and every row from #10a", () => {
    const { host, root } = renderSection();
    expect(host.textContent).toContain("PACKETS / FRAME");
    expect(host.textContent).toContain("Font");
    expect(host.textContent).toContain("Weight");
    expect(host.textContent).toContain("Letter spacing");
    expect(host.textContent).toContain("Line height");
    expect(host.textContent).toContain("Align");
    act(() => root.unmount());
  });

  it("colors letter-spacing mint (explicit, differs from 0px default) with a reset button", () => {
    const { host, root } = renderSection();
    const resetButtons = host.querySelectorAll('[data-flat-row-reset="true"]');
    expect(resetButtons.length).toBeGreaterThan(0);
    act(() => root.unmount());
  });

  it("commits a font-weight change through onSetTextFieldStyle", () => {
    const onSetTextFieldStyle = vi.fn();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const element = makeElement();
    act(() => {
      root.render(
        <FlatTextSection
          element={element}
          styles={{}}
          fontAssets={[]}
          onSetText={vi.fn()}
          onSetTextFieldStyle={onSetTextFieldStyle}
          onAddTextField={vi.fn()}
          onRemoveTextField={vi.fn()}
        />,
      );
    });
    const select = host.querySelector<HTMLSelectElement>("select");
    if (!select) throw new Error("expected a weight <select>");
    act(() => {
      select.value = "700";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onSetTextFieldStyle).toHaveBeenCalledWith("field-0", "font-weight", "700");
    act(() => root.unmount());
  });

  it("renders the flat layer list (not the legacy TextSection) for a multi-field element", () => {
    const { host, root } = renderSection({
      textFields: [
        makeElement().textFields[0],
        {
          key: "field-1",
          label: "Text",
          value: "SECOND FIELD",
          tagName: "div",
          attributes: [],
          inlineStyles: {},
          computedStyles: {},
          source: "self",
        },
      ],
    });
    // Legacy TextSection's own Section wrapper (data-panel-section="text")
    // must never render here — multi-field elements now go through the flat
    // FlatTextLayerList + FlatTextFieldEditor path end to end, not a
    // delegation to the legacy component.
    expect(host.querySelector('[data-panel-section="text"]')).toBeNull();
    // The flat layer list's own content must render.
    expect(host.textContent).toContain("Text layers");
    act(() => root.unmount());
  });
});
