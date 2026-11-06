// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StyleSections } from "./propertyPanelStyleSections";
import { FlatStyleSection } from "./propertyPanelFlatStyleSections";
import type { DomEditSelection } from "./domEditing";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => {
  document.body.innerHTML = "";
});

function mount(
  Panel: typeof StyleSections | typeof FlatStyleSection,
  tag = "img",
  sourceFile = "index.html",
  src = "assets/old.png",
) {
  const selected = document.createElement(tag);
  selected.id = "picture";
  selected.setAttribute("src", src);
  document.body.append(selected);
  const element: DomEditSelection = {
    element: selected,
    id: "picture",
    selector: "#picture",
    label: "Picture",
    tagName: tag,
    sourceFile,
    compositionPath: sourceFile,
    isCompositionHost: false,
    isInsideLockedComposition: false,
    boundingBox: { x: 0, y: 0, width: 320, height: 180 },
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
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const onSetStyle = vi.fn((prop: string, value: string) =>
    selected.style.setProperty(prop, value),
  );
  const onSetHtmlAttribute = vi.fn((attr: string, value: string | null) => {
    if (value !== null) selected.setAttribute(attr, value);
  });
  act(() =>
    root.render(
      <Panel
        projectId="fixture"
        element={element}
        styles={{}}
        assets={["assets/old.png", "assets/new.png"]}
        onSetStyle={onSetStyle}
        onSetHtmlAttribute={onSetHtmlAttribute}
      />,
    ),
  );
  const image = Array.from(host.querySelectorAll("button")).find(
    (button) => button.textContent === "Image",
  );
  if (!image) throw new Error("Image control must exist");
  act(() => image.click());
  // The Image asset select is the one whose options include the fixture asset.
  const assetSelect = Array.from(host.querySelectorAll("select")).find((node) =>
    Array.from(node.options).some((option) => option.value === "assets/new.png"),
  );
  if (!assetSelect) throw new Error("Project asset control must exist");
  function choose(value: string) {
    const control = assetSelect;
    if (!control) throw new Error("Asset control must exist");
    act(() => {
      control.value = value;
      control.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }
  return { host, selected, root, choose, assetSelect, onSetStyle, onSetHtmlAttribute };
}

describe.each([
  ["classic", StyleSections],
  ["flat", FlatStyleSection],
] as const)("%s Image fill", (_name, Panel) => {
  it("shows the img source as the current project asset", () => {
    const view = mount(Panel);
    expect(view.assetSelect.value).toBe("assets/old.png");
    act(() => view.root.unmount());
  });
  it.each([
    "assets/100%.png",
    'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100%"></svg>',
  ])("shows an authored source containing a literal percent: %s", (src) => {
    const view = mount(Panel, "img", "index.html", src);
    const input = Array.from(view.host.querySelectorAll("label"))
      .find((node) => node.querySelector("span")?.textContent === "External URL")
      ?.querySelector("input");
    expect(input?.value).toBe(src);
    act(() => view.root.unmount());
  });
  it("replaces the img source rather than writing a hidden background", () => {
    const view = mount(Panel);
    view.choose("assets/new.png");
    expect(view.selected.getAttribute("src")).toBe("assets/new.png");
    expect(view.onSetHtmlAttribute).toHaveBeenCalledExactlyOnceWith("src", "assets/new.png");
    expect(view.onSetStyle).not.toHaveBeenCalled();
    act(() => view.root.unmount());
  });
  it("replaces an img with an external URL without CSS wrapping", () => {
    const view = mount(Panel);
    const row = Array.from(view.host.querySelectorAll("label")).find(
      (node) =>
        node.querySelector("span")?.textContent === "External URL" && node.querySelector("input"),
    );
    const input = row?.querySelector("input");
    if (!input) throw new Error("External URL input must exist");
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
        input,
        "https://example.com/new.png",
      );
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(view.selected.getAttribute("src")).toBe("https://example.com/new.png");
    expect(view.onSetStyle).not.toHaveBeenCalled();
    act(() => view.root.unmount());
  });
  it("keeps the img source when cleared", () => {
    const view = mount(Panel);
    view.choose("");
    expect(view.selected.getAttribute("src")).toBe("assets/old.png");
    expect(view.onSetHtmlAttribute).not.toHaveBeenCalled();
    expect(view.onSetStyle).not.toHaveBeenCalled();
    act(() => view.root.unmount());
  });
  it("uses source-relative image paths in nested compositions", () => {
    const view = mount(Panel, "img", "compositions/scene.html");
    view.choose("assets/new.png");
    expect(view.selected.getAttribute("src")).toBe("../assets/new.png");
    act(() => view.root.unmount());
  });
  it("keeps background-image replacement and clearing for ordinary elements", () => {
    const view = mount(Panel, "div");
    view.choose("assets/new.png");
    expect(view.selected.style.backgroundImage).toBe('url("assets/new.png")');
    view.choose("");
    expect(view.selected.style.backgroundImage).toBe("none");
    expect(view.onSetHtmlAttribute).not.toHaveBeenCalled();
    act(() => view.root.unmount());
  });
});
