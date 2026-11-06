// @vitest-environment happy-dom

import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { compile } from "tailwindcss";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FlatTextLayerList, FlatTextSection } from "./propertyPanelFlatTextSection";
import type { DomEditSelection, DomEditTextField } from "./domEditingTypes";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
});

function renderInto(node: React.ReactElement) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => {
    root.render(node);
  });
  return { host, root };
}

const FIELDS = [
  {
    key: "a",
    label: "Text",
    value: "Headline",
    tagName: "div",
    attributes: [],
    inlineStyles: {},
    computedStyles: {},
    source: "self" as const,
  },
  {
    key: "b",
    label: "Text",
    value: "Subhead",
    tagName: "span",
    attributes: [],
    inlineStyles: {},
    computedStyles: {},
    source: "self" as const,
  },
];

describe("FlatTextLayerList", () => {
  it("falls back to a numbered label per index for empty fields, not a bare 'Text'", () => {
    const emptyFields = [
      { ...FIELDS[0], value: "" },
      { ...FIELDS[1], value: "" },
    ];
    const { host, root } = renderInto(
      <FlatTextLayerList
        fields={emptyFields as never}
        activeFieldKey="a"
        styles={{}}
        onSelect={vi.fn()}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(host.textContent).toContain("Text 1");
    expect(host.textContent).toContain("Text 2");
    act(() => root.unmount());
  });

  it("lists every field, highlights the active one, and fires onSelect/onAdd/onRemove", () => {
    const onSelect = vi.fn();
    const onAdd = vi.fn();
    const onRemove = vi.fn();
    const { host, root } = renderInto(
      <FlatTextLayerList
        fields={FIELDS as never}
        activeFieldKey="a"
        styles={{}}
        onSelect={onSelect}
        onAdd={onAdd}
        onRemove={onRemove}
      />,
    );
    expect(host.textContent).toContain("Headline");
    expect(host.textContent).toContain("Subhead");

    const rows = host.querySelectorAll('[data-flat-text-layer-row="true"]');
    expect(rows).toHaveLength(2);
    expect((rows[0] as HTMLElement).getAttribute("data-active")).toBe("true");
    expect((rows[1] as HTMLElement).getAttribute("data-active")).toBe("false");

    act(() => rows[1].dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onSelect).toHaveBeenCalledWith("b");

    const addButton = host.querySelector<HTMLButtonElement>('[data-flat-text-layer-add="true"]');
    act(() => addButton?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onAdd).toHaveBeenCalledTimes(1);

    const removeButton = host.querySelector<HTMLButtonElement>(
      '[data-flat-text-layer-remove="true"]',
    );
    act(() => removeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onRemove).toHaveBeenCalledWith("a");
    // stopPropagation on the remove button must prevent the row's own onClick
    // from also firing onSelect for the removed field's key.
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalledWith("a");
    act(() => root.unmount());
  });
});

function makeMultiFieldElement(): DomEditSelection {
  return {
    element: document.createElement("div"),
    id: "multi",
    selector: ".multi",
    label: "Multi",
    tagName: "div",
    sourceFile: "index.html",
    compositionPath: "index.html",
    isCompositionHost: false,
    isInsideLockedComposition: false,
    boundingBox: { x: 0, y: 0, width: 100, height: 100 },
    textContent: "Headline Subhead",
    dataAttributes: {},
    inlineStyles: {},
    computedStyles: {},
    textFields: [
      {
        key: "a",
        label: "Text",
        value: "Headline",
        tagName: "div",
        attributes: [],
        inlineStyles: {},
        computedStyles: {},
        source: "self",
      },
      {
        key: "b",
        label: "Text",
        value: "Subhead",
        tagName: "span",
        attributes: [],
        inlineStyles: {},
        computedStyles: {},
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
  } as DomEditSelection;
}

function makeSingleFieldElement(overrides: Partial<DomEditTextField> = {}): DomEditSelection {
  const base = makeMultiFieldElement();
  return {
    ...base,
    textFields: [
      {
        key: "a",
        label: "Text",
        value: "Headline",
        tagName: "div",
        attributes: [],
        inlineStyles: {},
        computedStyles: {},
        source: "self",
        ...overrides,
      },
    ],
  } as DomEditSelection;
}

function segmentedRowButtons(host: HTMLElement, label: string): HTMLButtonElement[] {
  const labelSpan = Array.from(host.querySelectorAll("span")).find(
    (el) => el.textContent === label,
  );
  const row = labelSpan?.parentElement;
  return Array.from(row?.querySelectorAll<HTMLButtonElement>('[data-flat-segment="true"]') ?? []);
}

describe("FlatTextFieldEditor controls", () => {
  it("commits text-transform: capitalize when the new 'Ag' case button is clicked", () => {
    const onSetTextFieldStyle = vi.fn();
    const { host, root } = renderInto(
      <FlatTextSection
        element={makeSingleFieldElement()}
        styles={{}}
        fontAssets={[]}
        onSetText={vi.fn()}
        onSetTextFieldStyle={onSetTextFieldStyle}
        onAddTextField={vi.fn()}
        onRemoveTextField={vi.fn()}
      />,
    );
    const capitalizeButton = segmentedRowButtons(host, "Case · Style").find(
      (button) => button.textContent === "Ag",
    );
    expect(capitalizeButton).not.toBeUndefined();
    act(() => capitalizeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onSetTextFieldStyle).toHaveBeenCalledWith("a", "text-transform", "capitalize");
    act(() => root.unmount());
  });

  it("lights up 'right' for text-align: end but re-clicking it is a no-op — preserves the logical value", () => {
    const onSetTextFieldStyle = vi.fn();
    const { host, root } = renderInto(
      <FlatTextSection
        element={makeSingleFieldElement({ computedStyles: { "text-align": "end" } })}
        styles={{}}
        fontAssets={[]}
        onSetText={vi.fn()}
        onSetTextFieldStyle={onSetTextFieldStyle}
        onAddTextField={vi.fn()}
        onRemoveTextField={vi.fn()}
      />,
    );
    const alignButtons = segmentedRowButtons(host, "Align");
    const rightButton = alignButtons.find((button) => button.textContent === "R");
    expect(rightButton).not.toBeUndefined();
    expect(rightButton?.className).toContain("border-panel-accent");
    // Clicking the option that's already visually active for "end" must NOT
    // rewrite it to the physical "right" — that would destroy the logical
    // semantics and break RTL content, where "end" and "right" differ.
    act(() => rightButton?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onSetTextFieldStyle).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  it("commits a genuine align change away from a logical value", () => {
    const onSetTextFieldStyle = vi.fn();
    const { host, root } = renderInto(
      <FlatTextSection
        element={makeSingleFieldElement({ computedStyles: { "text-align": "end" } })}
        styles={{}}
        fontAssets={[]}
        onSetText={vi.fn()}
        onSetTextFieldStyle={onSetTextFieldStyle}
        onAddTextField={vi.fn()}
        onRemoveTextField={vi.fn()}
      />,
    );
    const alignButtons = segmentedRowButtons(host, "Align");
    const centerButton = alignButtons.find((button) => button.textContent === "C");
    expect(centerButton).not.toBeUndefined();
    act(() => centerButton?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onSetTextFieldStyle).toHaveBeenCalledWith("a", "text-align", "center");
    act(() => root.unmount());
  });

  it("previews Size input immediately and persists once on blur", () => {
    const onSetTextFieldStyle = vi.fn();
    const onPreviewTextFieldStyle = vi.fn();
    const { host, root } = renderInto(
      <FlatTextSection
        element={makeSingleFieldElement()}
        styles={{}}
        fontAssets={[]}
        onSetText={vi.fn()}
        onSetTextFieldStyle={onSetTextFieldStyle}
        onPreviewTextFieldStyle={onPreviewTextFieldStyle}
        onAddTextField={vi.fn()}
        onRemoveTextField={vi.fn()}
      />,
    );
    const sizeLabel = Array.from(host.querySelectorAll("span")).find(
      (el) => el.textContent === "Size",
    );
    const input = sizeLabel?.parentElement?.querySelector<HTMLInputElement>("input");
    if (!input) throw new Error("expected the Size row's input");
    act(() => {
      input.focus();
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      nativeInputValueSetter?.call(input, "24px");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onPreviewTextFieldStyle).toHaveBeenCalledWith("a", "font-size", "24px");
    expect(onSetTextFieldStyle).not.toHaveBeenCalled();
    act(() => {
      input.blur();
    });
    expect(onSetTextFieldStyle).toHaveBeenCalledWith("a", "font-size", "24px");
    act(() => root.unmount());
  });
});

describe("FlatTextSection — multi-field", () => {
  it("shows the layer list, switches the active field's rows on selection, and has no doubled heading (this component never renders its own heading — the parent FlatGroup does)", () => {
    const { host, root } = renderInto(
      <FlatTextSection
        element={makeMultiFieldElement()}
        styles={{}}
        fontAssets={[]}
        onSetText={vi.fn()}
        onSetTextFieldStyle={vi.fn()}
        onAddTextField={vi.fn()}
        onRemoveTextField={vi.fn()}
      />,
    );
    expect(host.textContent).toContain("Headline");
    expect(host.textContent).toContain("Subhead");
    // Active field's editor rows are visible (Font/Weight/etc. from FlatTextFieldEditor).
    expect(host.textContent).toContain("Weight");
    // Exactly one "Text layers" micro-label — this component doesn't duplicate its own list.
    const layerLabels = Array.from(host.querySelectorAll("div")).filter(
      (el) => el.textContent === "Text layers",
    );
    expect(layerLabels.length).toBeLessThanOrEqual(1);

    const rows = host.querySelectorAll('[data-flat-text-layer-row="true"]');
    act(() => rows[1].dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(host.textContent).toContain("Subhead");
    act(() => root.unmount());
  });

  it("wires onAdd/onRemove end-to-end: async onAddTextField switches the active field once it appears in props, and the resync effect falls back to the first field when the active one disappears", async () => {
    let addResolved = false;

    function Harness() {
      const [fields, setFields] = useState<DomEditTextField[]>(makeMultiFieldElement().textFields);
      const element: DomEditSelection = { ...makeMultiFieldElement(), textFields: fields };
      return (
        <FlatTextSection
          element={element}
          styles={{}}
          fontAssets={[]}
          onSetText={vi.fn()}
          onSetTextFieldStyle={vi.fn()}
          onAddTextField={() =>
            Promise.resolve().then(() => {
              addResolved = true;
              setFields((prev) => [
                ...prev,
                {
                  key: "c",
                  label: "Text",
                  value: "Third",
                  tagName: "div",
                  attributes: [],
                  inlineStyles: {},
                  computedStyles: {},
                  source: "self",
                },
              ]);
              return "c";
            })
          }
          onRemoveTextField={(fieldKey: string) =>
            setFields((prev) => prev.filter((field) => field.key !== fieldKey))
          }
        />
      );
    }

    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() => {
      root.render(<Harness />);
    });

    let rows = host.querySelectorAll('[data-flat-text-layer-row="true"]');
    expect(rows).toHaveLength(2);
    expect((rows[0] as HTMLElement).getAttribute("data-active")).toBe("true");

    const addButton = host.querySelector<HTMLButtonElement>('[data-flat-text-layer-add="true"]');
    await act(async () => {
      addButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(addResolved).toBe(true);
    rows = host.querySelectorAll('[data-flat-text-layer-row="true"]');
    expect(rows).toHaveLength(3);
    expect((rows[2] as HTMLElement).getAttribute("data-active")).toBe("true");

    // Remove the active field ("c") through the wired onRemoveTextField — the
    // resync useEffect must fall back to the first remaining field ("a")
    // since "c" no longer exists in element.textFields.
    const removeButtons = host.querySelectorAll<HTMLButtonElement>(
      '[data-flat-text-layer-remove="true"]',
    );
    act(() => {
      removeButtons[2].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    rows = host.querySelectorAll('[data-flat-text-layer-row="true"]');
    expect(rows).toHaveLength(2);
    expect((rows[0] as HTMLElement).getAttribute("data-active")).toBe("true");

    act(() => root.unmount());
  });

  it("does not steal canvas focus when a multi-field element is selected", () => {
    const focusOwner = document.createElement("button");
    document.body.append(focusOwner);
    focusOwner.focus();

    const { root } = renderInto(
      <FlatTextSection
        element={makeMultiFieldElement()}
        styles={{}}
        fontAssets={[]}
        onSetText={vi.fn()}
        onSetTextFieldStyle={vi.fn()}
        onAddTextField={vi.fn()}
        onRemoveTextField={vi.fn()}
      />,
    );

    expect(document.activeElement).toBe(focusOwner);
    act(() => root.unmount());
  });

  it("auto-focuses the Content textarea when a new text field is added", async () => {
    let addResolved = false;

    function Harness() {
      const [fields, setFields] = useState<DomEditTextField[]>(makeMultiFieldElement().textFields);
      const element: DomEditSelection = { ...makeMultiFieldElement(), textFields: fields };
      return (
        <FlatTextSection
          element={element}
          styles={{}}
          fontAssets={[]}
          onSetText={vi.fn()}
          onSetTextFieldStyle={vi.fn()}
          onAddTextField={() =>
            Promise.resolve().then(() => {
              addResolved = true;
              setFields((prev) => [
                ...prev,
                {
                  key: "c",
                  label: "Text",
                  value: "",
                  tagName: "div",
                  attributes: [],
                  inlineStyles: {},
                  computedStyles: {},
                  source: "self",
                },
              ]);
              return "c";
            })
          }
          onRemoveTextField={vi.fn()}
        />
      );
    }

    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() => {
      root.render(<Harness />);
    });

    const addButton = host.querySelector<HTMLButtonElement>('[data-flat-text-layer-add="true"]');
    // Wait for onAddTextField's promise to resolve (adds field "c" and makes it
    // active) before checking focus, mirroring the async add-field pattern above.
    await act(async () => {
      addButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(addResolved).toBe(true);

    const contentTextarea = host.querySelector("textarea");
    expect(contentTextarea).not.toBeNull();
    expect(document.activeElement).toBe(contentTextarea);

    act(() => root.unmount());
  });

  it("keeps Content expandable and grows it with multiline text", async () => {
    const element = makeMultiFieldElement();
    element.textFields[0].value = "First line\nSecond line\nThird line";

    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
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

    const contentTextarea = host.querySelector<HTMLTextAreaElement>("textarea");
    expect(contentTextarea?.value).toBe("First line\nSecond line\nThird line");
    expect(contentTextarea?.classList).toContain("resize-y");
    expect(contentTextarea?.classList).toContain("overflow-y-auto");

    // Tailwind v4 has no PostCSS-plugin JS API; `compile` takes the stylesheet
    // and is handed the candidates directly instead of scanning raw content.
    const candidates = Array.from(host.querySelectorAll<HTMLElement>("*")).flatMap((el) =>
      Array.from(el.classList),
    );
    const compiled = await compile("@tailwind utilities;");
    expect(compiled.build(candidates)).toContain("field-sizing: content");

    act(() => root.unmount());
  });
});
