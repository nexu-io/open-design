// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { EditPopover } from "./EditModal";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
});

describe("EditPopover", () => {
  // The timeline panel's dockview overlay is transformed, which makes it the containing
  // block for position: fixed. Rendered inside it, the popover's viewport coordinates are
  // resolved against the panel, so a Shift+drag low on the page puts it out of view.
  it("renders on document.body, outside a transformed panel", () => {
    const panel = document.createElement("div");
    panel.style.transform = "translateZ(0)";
    document.body.appendChild(panel);
    const root = createRoot(panel);
    act(() =>
      root.render(
        <EditPopover rangeStart={1} rangeEnd={2} anchorX={400} anchorY={900} onClose={() => {}} />,
      ),
    );

    const textarea = document.querySelector("textarea");
    expect(textarea).not.toBeNull();
    expect(panel.contains(textarea)).toBe(false);

    act(() => root.unmount());
  });
});
