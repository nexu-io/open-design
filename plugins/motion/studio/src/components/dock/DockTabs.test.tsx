// @vitest-environment happy-dom

import { readFileSync } from "node:fs";
import path from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Dock } from "./Dock";
import { useDockLayoutStore } from "./dockLayoutStore";
import { PANEL_IDS, type PanelId } from "./panelRegistry";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// happy-dom never resizes anything; a test calls `resizeAll` to stand in for a real resize.
const liveObservers = new Set<ResizeObserverStub>();
class ResizeObserverStub {
  readonly callback: () => void;
  constructor(callback: () => void) {
    this.callback = callback;
    liveObservers.add(this);
  }
  observe() {}
  unobserve() {}
  disconnect() {
    liveObservers.delete(this);
  }
}
const resizeAll = () => {
  for (const observer of liveObservers) observer.callback();
};
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;

// happy-dom has no layout: a tab sits at 100px per position and is 90px wide.
const TAB_STEP = 100;
const TAB_WIDTH = 90;
const tabIndex = (element: HTMLElement) =>
  element.classList.contains("dv-tab")
    ? [...(element.parentElement?.querySelectorAll(":scope > .dv-tab") ?? [])].indexOf(element)
    : -1;
const layout = {
  offsetLeft: {
    get(this: HTMLElement) {
      return Math.max(tabIndex(this), 0) * TAB_STEP;
    },
  },
  offsetWidth: {
    get(this: HTMLElement) {
      return tabIndex(this) >= 0 ? TAB_WIDTH : 0;
    },
  },
};
const original = {
  offsetLeft: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetLeft"),
  offsetWidth: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth"),
};
beforeAll(() => {
  // The shown-tab-only rule lives in dock.css; apply it so computed display is what a user sees.
  const style = document.createElement("style");
  style.textContent = readFileSync(path.join(import.meta.dirname, "dock.css"), "utf8").replace(
    /@import[^;]*;/,
    "",
  );
  document.head.append(style);
  Object.defineProperties(HTMLElement.prototype, {
    offsetLeft: { ...layout.offsetLeft, configurable: true },
    offsetWidth: { ...layout.offsetWidth, configurable: true },
  });
});
afterAll(() => {
  for (const [key, descriptor] of Object.entries(original)) {
    if (descriptor) Object.defineProperty(HTMLElement.prototype, key, descriptor);
  }
});

let root: Root | null = null;
let host: HTMLElement;

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => {
    root?.render(
      <Dock.Root projectId="p1">
        {PANEL_IDS.map((id) => (
          <Dock.Panel key={id} id={id}>
            <div>{id}</div>
          </Dock.Panel>
        ))}
      </Dock.Root>,
    );
  });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  vi.useRealTimers();
});

const tab = (id: PanelId) => host.querySelector<HTMLElement>(`[data-tab-panel-id="${id}"]`);
const stripOf = (id: PanelId) => tab(id)?.closest<HTMLElement>(".dv-tabs-container");
const groupOf = (id: PanelId) => tab(id)?.closest<HTMLElement>(".dv-groupview");
const shows = (id: PanelId, part: "icon" | "close") => {
  const element = tab(id)?.querySelector(`.hf-dock-tab-${part}`);
  return element ? getComputedStyle(element).display !== "none" : false;
};

async function activate(id: PanelId) {
  // dockview settles the active panel on a microtask; `act(async)` waits for it.
  await act(async () => useDockLayoutStore.getState().activatePanel(id));
}

describe("dock tabs", () => {
  it("draw the type icon and close glyph on the shown tab only", () => {
    for (const id of ["design", "compositions"] as const) {
      expect(shows(id, "icon")).toBe(true);
      expect(shows(id, "close")).toBe(true);
    }
    for (const id of ["layers", "renders", "variables", "assets", "code", "catalog"] as const) {
      expect(shows(id, "icon")).toBe(false);
      expect(shows(id, "close")).toBe(false);
    }
  });

  it("move the icon to the newly shown tab and drop it from the old one", async () => {
    await activate("layers");
    expect(shows("layers", "icon")).toBe(true);
    expect(shows("design", "icon")).toBe(false);
    expect(shows("design", "close")).toBe(false);
  });

  it("name the close control after the panel, and close only that panel", async () => {
    const close = tab("design")?.querySelector<HTMLElement>(".hf-dock-tab-close");
    expect(close?.getAttribute("aria-label")).toBe("Close Design");
    await act(async () => close?.click());
    expect(useDockLayoutStore.getState().openPanels.has("design")).toBe(false);
    expect(useDockLayoutStore.getState().openPanels.has("layers")).toBe(true);
  });
});

describe("dock strip actions", () => {
  const groupsWithActions = () =>
    [...host.querySelectorAll(".hf-dock-strip-actions")].map((actions) =>
      actions.closest(".dv-groupview"),
    );

  it("sit on the active group's strip only, and follow the active group", async () => {
    await activate("design");
    expect(groupsWithActions()).toEqual([groupOf("design")]);
    const labels = [...host.querySelectorAll(".hf-dock-strip-actions button")].map((button) =>
      button.getAttribute("aria-label"),
    );
    expect(labels).toEqual(["Panel menu", "Maximize panel", "Close group"]);
    await activate("assets");
    expect(groupsWithActions()).toEqual([groupOf("assets")]);
  });
});

describe("dock tab fill", () => {
  it("is one element per strip, under the shown tab, and follows a switch", async () => {
    for (const strip of host.querySelectorAll(".dv-tabs-container")) {
      expect(strip.querySelectorAll(".hf-dock-tab-fill")).toHaveLength(1);
    }
    const fill = () => stripOf("design")?.querySelector<HTMLElement>(".hf-dock-tab-fill");
    expect(fill()?.style.transform).toBe("translateX(0px)");
    expect(fill()?.style.width).toBe(`${TAB_WIDTH}px`);
    await activate("renders");
    expect(stripOf("design")?.querySelectorAll(".hf-dock-tab-fill")).toHaveLength(1);
    expect(fill()?.style.transform).toBe(`translateX(${2 * TAB_STEP}px)`);
  });

  it("keeps the shown tab whole when its strip narrows, as when the strip's actions appear", async () => {
    const strip = stripOf("design");
    if (!strip) throw new Error("no design strip");
    await activate("variables");
    // The four tabs fit, so the strip is unscrolled; then it narrows to two and a half tabs.
    strip.scrollLeft = 0;
    Object.defineProperty(strip, "clientWidth", { value: 1000, configurable: true });
    act(() => resizeAll());
    Object.defineProperty(strip, "clientWidth", { value: 250, configurable: true });
    act(() => resizeAll());
    expect(strip.scrollLeft).toBe(3 * TAB_STEP + TAB_WIDTH + 1 - 250);
  });

  it("leaves a strip the user scrolled alone when something else in the dock changes", async () => {
    const strip = stripOf("design");
    if (!strip) throw new Error("no design strip");
    await activate("variables");
    Object.defineProperty(strip, "clientWidth", { value: 250, configurable: true });
    act(() => resizeAll());
    // Scrolled back by hand to look at the first tabs, then another group takes focus.
    strip.scrollLeft = 0;
    await activate("assets");
    act(() => resizeAll());
    expect(strip.scrollLeft).toBe(0);
  });

  it("keeps a hand scroll through another group being maximised and restored", async () => {
    const strip = stripOf("design");
    if (!strip) throw new Error("no design strip");
    await activate("variables");
    Object.defineProperty(strip, "clientWidth", { value: 250, configurable: true });
    act(() => resizeAll());
    strip.scrollLeft = 0;
    // Hidden while another group is maximised; the browser keeps a hidden strip's scroll.
    Object.defineProperty(strip, "clientWidth", { value: 0, configurable: true });
    act(() => resizeAll());
    Object.defineProperty(strip, "clientWidth", { value: 250, configurable: true });
    act(() => resizeAll());
    expect(strip.scrollLeft).toBe(0);
  });

  it("leaves a hand scroll alone when its strip widens", async () => {
    const strip = stripOf("design");
    if (!strip) throw new Error("no design strip");
    await activate("variables");
    Object.defineProperty(strip, "clientWidth", { value: 150, configurable: true });
    act(() => resizeAll());
    strip.scrollLeft = 0;
    // Wider, but the shown tab is still out of view where the user left the strip.
    Object.defineProperty(strip, "clientWidth", { value: 200, configurable: true });
    act(() => resizeAll());
    expect(strip.scrollLeft).toBe(0);
  });

  it("reveals the shown tab when its strip comes back narrower than it left", async () => {
    const strip = stripOf("design");
    if (!strip) throw new Error("no design strip");
    await activate("variables");
    strip.scrollLeft = 0;
    Object.defineProperty(strip, "clientWidth", { value: 1000, configurable: true });
    act(() => resizeAll());
    Object.defineProperty(strip, "clientWidth", { value: 0, configurable: true });
    act(() => resizeAll());
    Object.defineProperty(strip, "clientWidth", { value: 250, configurable: true });
    act(() => resizeAll());
    expect(strip.scrollLeft).toBe(3 * TAB_STEP + TAB_WIDTH + 1 - 250);
  });

  it("reveals the shown tab when a panel beside it closes and it moves", async () => {
    const strip = stripOf("design");
    if (!strip) throw new Error("no design strip");
    await activate("variables");
    Object.defineProperty(strip, "clientWidth", { value: 150, configurable: true });
    act(() => resizeAll());
    strip.scrollLeft = 0;
    await act(async () => useDockLayoutStore.getState().togglePanel("design"));
    // Variables moved from the fourth place to the third; its right edge is at 290.
    expect(strip.scrollLeft).toBe(2 * TAB_STEP + TAB_WIDTH + 1 - 150);
  });
});
