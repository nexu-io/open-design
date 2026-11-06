// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PropertyPanelFlatHeader } from "./PropertyPanelFlatHeader";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
});

function renderHeader(overrides: Partial<Parameters<typeof PropertyPanelFlatHeader>[0]> = {}) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const props = {
    name: "Mono Label",
    meta: ".mono-label · div",
    elementKind: "text" as const,
    hidden: false,
    copied: false,
    onCopy: vi.fn(),
    onClear: vi.fn(),
    showUngroup: false,
    ...overrides,
  };
  act(() => {
    root.render(<PropertyPanelFlatHeader {...props} />);
  });
  return { host, root, props };
}

describe("PropertyPanelFlatHeader", () => {
  it("renders name, meta, and the mint text-type icon", () => {
    const { host, root } = renderHeader();
    expect(host.textContent).toContain("Mono Label");
    expect(host.textContent).toContain(".mono-label · div");
    const icon = host.querySelector('[data-flat-header-icon="true"]');
    expect(icon?.className).toContain("text-accent-ink");
    act(() => root.unmount());
  });

  it("colors the media icon cyan and the other icon amber", () => {
    const { host: mediaHost, root: mediaRoot } = renderHeader({ elementKind: "media" });
    expect(mediaHost.querySelector('[data-flat-header-icon="true"]')?.className).toContain(
      "text-panel-media",
    );
    act(() => mediaRoot.unmount());

    const { host: otherHost, root: otherRoot } = renderHeader({ elementKind: "other" });
    expect(otherHost.querySelector('[data-flat-header-icon="true"]')?.className).toContain(
      "text-panel-container",
    );
    act(() => otherRoot.unmount());
  });

  it("fires onCopy and onClear from their action buttons", () => {
    const { host, root, props } = renderHeader();
    const copy = host.querySelector<HTMLButtonElement>(
      '[aria-label="Copy element info to clipboard"]',
    );
    const clear = host.querySelector<HTMLButtonElement>('[aria-label="Clear selection"]');
    act(() => copy?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    act(() => clear?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(props.onCopy).toHaveBeenCalledTimes(1);
    expect(props.onClear).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });

  it("only renders Ungroup when showUngroup is true", () => {
    const { host: without } = renderHeader({ showUngroup: false });
    expect(without.querySelector('[aria-label="Ungroup"]')).toBeNull();

    const { host: withUngroup } = renderHeader({ showUngroup: true, onUngroup: vi.fn() });
    expect(withUngroup.querySelector('[aria-label="Ungroup"]')).not.toBeNull();
  });

  it("renders no visibility control when its caller withholds the handler", () => {
    const { host } = renderHeader({ onToggleHidden: undefined });
    const labels = Array.from(host.querySelectorAll("button")).map((b) =>
      b.getAttribute("aria-label"),
    );
    expect(labels).not.toContain("Hide element");
    expect(labels).not.toContain("Show element");
  });

  it("names a mute on an audio selection", () => {
    const { host } = renderHeader({ onToggleHidden: vi.fn(), asMute: true });
    expect(host.querySelector('button[aria-label="Mute element"]')).not.toBeNull();
    const { host: muted } = renderHeader({ onToggleHidden: vi.fn(), asMute: true, hidden: true });
    expect(muted.querySelector('button[aria-label="Unmute element"]')).not.toBeNull();
  });

  it("renders it when the handler is supplied", () => {
    const { host } = renderHeader({ onToggleHidden: vi.fn() });
    const labels = Array.from(host.querySelectorAll("button")).map((b) =>
      b.getAttribute("aria-label"),
    );
    expect(labels).toContain("Hide element");
  });
});
