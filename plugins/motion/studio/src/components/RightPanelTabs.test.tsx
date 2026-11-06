// @vitest-environment happy-dom

/**
 * The strip's keyboard behaviour, which tab reads as selected, and how the hotkey
 * filters classify the elements (KTD13). The arrow-key tests are new behaviour, not a port.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { RightPanelTabs, type RightPanelTabDescriptor } from "./RightPanelTabs";
import { isTypingTarget } from "../utils/typingTarget";
import { shouldIgnorePlaybackShortcutTarget } from "../player/lib/playbackShortcuts";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const IDS = ["design", "layers", "renders", "variables"];

let mounted: { root: Root; host: HTMLElement } | null = null;

afterEach(() => {
  if (!mounted) return;
  const { root, host } = mounted;
  mounted = null;
  act(() => root.unmount());
  host.remove();
});

/** The harness owns the active state too, so a selection moves as it does in the real panel. */
function mount(
  initialActive: string[],
  activateOnFocus = true,
): {
  host: HTMLElement;
  selections: ReturnType<typeof vi.fn>;
} {
  const selections = vi.fn();

  function Harness() {
    const [active, setActive] = React.useState(initialActive);
    const tabs: RightPanelTabDescriptor[] = IDS.map((id) => ({
      id,
      label: id,
      tooltip: `${id} tooltip`,
      active: active.includes(id),
      onSelect: () => {
        selections(id);
        setActive([id]);
      },
    }));
    return <RightPanelTabs tabs={tabs} activateOnFocus={activateOnFocus} />;
  }

  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  mounted = { root, host };
  act(() => root.render(<Harness />));
  return { host, selections };
}

function tab(host: HTMLElement, id: string): HTMLElement {
  const el = host.querySelector<HTMLElement>(`[data-tab-id="${id}"]`);
  if (!el) throw new Error(`no tab for ${id}`);
  return el;
}

function selected(host: HTMLElement): string | null {
  return (
    host.querySelector('[role="tab"][aria-selected="true"]')?.getAttribute("data-tab-id") ?? null
  );
}

/** Base UI moves the roving tabindex synchronously and the focus one task later. */
async function arrow(key: string): Promise<void> {
  const target = document.activeElement ?? document.body;
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, composed: true }));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

it("moves from Design to Layers with ArrowRight and asks the panel to switch", async () => {
  const { host, selections } = mount(["design"]);
  act(() => tab(host, "design").focus());

  await arrow("ArrowRight");

  expect(document.activeElement).toBe(tab(host, "layers"));
  expect(selections).toHaveBeenCalledWith("layers");
});

it("only moves focus on an arrow key when selection would toggle a pane", async () => {
  const { host, selections } = mount(["design"], false);
  act(() => tab(host, "design").focus());

  await arrow("ArrowRight");

  expect(document.activeElement).toBe(tab(host, "layers"));
  expect(selections).not.toHaveBeenCalled();
});

it("jumps to the first and last tab with Home and End", async () => {
  const { host, selections } = mount(["design"]);
  act(() => tab(host, "design").focus());

  await arrow("End");
  expect(document.activeElement).toBe(tab(host, "variables"));
  expect(selections).toHaveBeenLastCalledWith("variables");

  await arrow("Home");
  expect(document.activeElement).toBe(tab(host, "design"));
  expect(selections).toHaveBeenLastCalledWith("design");
});

it("selects the tab whose content is on screen", () => {
  const { host } = mount(["renders"]);

  expect(selected(host)).toBe("renders");
});

it("leaves every tab unselected when the panel shows something the strip has no tab for", () => {
  // Block params take over the panel body without a tab of their own. The old
  // buttons all read unpressed in that state; nothing should read selected now.
  const { host } = mount([]);

  expect(selected(host)).toBe(null);
});

it("keeps a second open pane looking open in the legacy split inspector", () => {
  // Design and Layers render together there. Only one tab can carry
  // aria-selected, so the other has to keep the selected look or the strip
  // would claim a pane is closed while it is on screen.
  const { host } = mount(["design", "layers"]);

  expect(selected(host)).toBe("design");
  expect(tab(host, "layers").className).toContain("bg-hover");
});

it("classifies its tabs for the hotkey filters exactly as the old buttons did (KTD13)", () => {
  // The old strip rendered plain <button>s: not a typing target, and claimed by
  // the playback filter through its `button` selector. Base UI's tab is a
  // <button> too, so both verdicts have to be unchanged.
  const { host } = mount(["design"]);
  const el = tab(host, "design");

  expect(el.tagName).toBe("BUTTON");
  expect(isTypingTarget(el)).toBe(false);
  expect(shouldIgnorePlaybackShortcutTarget(el)).toBe(true);
});
