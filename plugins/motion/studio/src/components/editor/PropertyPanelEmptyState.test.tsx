// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PropertyPanelEmptyState } from "./PropertyPanelEmptyState";
import type { DomEditSelection } from "./domEditingTypes";

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

describe("PropertyPanelEmptyState — flat empty", () => {
  it("shows the cursor glyph, headline, and the two shortcut rows", () => {
    const { host, root } = renderInto(<PropertyPanelEmptyState flat multiSelectCount={0} />);
    expect(host.textContent).toContain("Nothing selected");
    expect(host.textContent).toContain("Record a gesture");
    expect(host.textContent).toContain("Describe a change to the agent");
    act(() => root.unmount());
  });
});

describe("PropertyPanelEmptyState — flat multi-select", () => {
  const elements = [
    { id: "mono-label", selector: ".mono-label", label: "Mono Label", tagName: "div" },
    { id: null, selector: "#s2-chart", label: "S2 Chart", tagName: "div" },
  ] as unknown as DomEditSelection[];

  it("lists each selected element and wires group/hide-all/clear actions", () => {
    const onGroupSelection = vi.fn();
    const onHideAllSelected = vi.fn();
    const onClearSelection = vi.fn();
    const { host, root } = renderInto(
      <PropertyPanelEmptyState
        flat
        multiSelectCount={2}
        multiSelectedElements={elements}
        onGroupSelection={onGroupSelection}
        onHideAllSelected={onHideAllSelected}
        onClearSelection={onClearSelection}
      />,
    );
    expect(host.textContent).toContain("2 elements selected");
    expect(host.textContent).toContain("Mono Label");
    expect(host.textContent).toContain("S2 Chart");

    const group = host.querySelector<HTMLButtonElement>('[data-flat-multiselect-group="true"]');
    act(() => group?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onGroupSelection).toHaveBeenCalledTimes(1);

    const hideAll = host.querySelector<HTMLButtonElement>(
      '[data-flat-multiselect-hide-all="true"]',
    );
    act(() => hideAll?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onHideAllSelected).toHaveBeenCalledTimes(1);

    const clear = host.querySelector<HTMLButtonElement>('[data-flat-multiselect-clear="true"]');
    act(() => clear?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onClearSelection).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });

  // A layout group is a positioned wrapper around a bounding box; an <audio>
  // clip has none (offsetWidth/Height are 0), so grouping audio produced a 0x0
  // div with inline left/top on elements that are never laid out. Withheld
  // rather than offered-then-refused.
  const audioElements = (tags: string[]) =>
    tags.map((tag, i) => ({
      id: `el-${i}`,
      selector: `#el-${i}`,
      label: `El ${i}`,
      tagName: tag,
      element: document.createElement(tag),
    })) as unknown as DomEditSelection[];

  it("withholds both actions when the selection includes audio", () => {
    const { host, root } = renderInto(
      <PropertyPanelEmptyState
        flat
        multiSelectCount={2}
        multiSelectedElements={audioElements(["audio", "audio"])}
        onGroupSelection={vi.fn()}
        onHideAllSelected={vi.fn()}
      />,
    );
    expect(host.querySelector('[data-flat-multiselect-group="true"]')).toBeNull();
    // Hiding is visibility, and `data-hidden` on audio is what mutes it; the
    // timeline owns that write as a mute.
    expect(host.querySelector('[data-flat-multiselect-hide-all="true"]')).toBeNull();
    // The list still names what is selected; only the actions go.
    expect(host.textContent).toContain("2 elements selected");
    act(() => root.unmount());
  });

  it("withholds it for a mixed selection too, since the wrapper would still take audio in", () => {
    const { host, root } = renderInto(
      <PropertyPanelEmptyState
        flat
        multiSelectCount={2}
        multiSelectedElements={audioElements(["div", "audio"])}
        onGroupSelection={vi.fn()}
      />,
    );
    expect(host.querySelector('[data-flat-multiselect-group="true"]')).toBeNull();
    expect(host.querySelector('[data-flat-multiselect-hide-all="true"]')).toBeNull();
    act(() => root.unmount());
  });

  it("counts an <hf-audio-group> bus as audio too", () => {
    const { host, root } = renderInto(
      <PropertyPanelEmptyState
        flat
        multiSelectCount={2}
        multiSelectedElements={audioElements(["hf-audio-group", "div"])}
        onGroupSelection={vi.fn()}
      />,
    );
    expect(host.querySelector('[data-flat-multiselect-group="true"]')).toBeNull();
    act(() => root.unmount());
  });

  it("still offers both for a selection of layout elements", () => {
    const { host, root } = renderInto(
      <PropertyPanelEmptyState
        flat
        multiSelectCount={2}
        multiSelectedElements={audioElements(["div", "span"])}
        onGroupSelection={vi.fn()}
      />,
    );
    expect(host.querySelector('[data-flat-multiselect-group="true"]')).not.toBeNull();
    expect(host.querySelector('[data-flat-multiselect-hide-all="true"]')).not.toBeNull();
    act(() => root.unmount());
  });
});
