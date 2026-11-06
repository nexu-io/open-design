// @vitest-environment happy-dom

import type { DockviewApi } from "dockview-react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mountBareDockview } from "./dockTestHarness";
import { installDockAccessibility } from "./dockAccessibility";
import { applySideMinimums, buildEditLayout } from "./dockLayout";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;

let host: HTMLElement;
let api: DockviewApi;
let dispose: () => void;

beforeEach(() => {
  ({ host, api } = mountBareDockview());
  api.layout(1200, 700);
  buildEditLayout(api, 1200);
  applySideMinimums(api, 1200);
  dispose = installDockAccessibility(api, host);
});

afterEach(() => {
  dispose();
  api.dispose();
  document.body.innerHTML = "";
});

const sashes = () => [...host.querySelectorAll<HTMLElement>(".dv-sash")];
const columnSash = (index: number) =>
  sashes().filter((sash) => sash.getAttribute("aria-orientation") === "vertical")[
    index
  ] as HTMLElement;
const widthOf = (panel: string) => api.getPanel(panel)?.group.width;
const press = (target: Element, key: string, init: KeyboardEventInit = {}) =>
  target.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }),
  );

describe("dock sashes", () => {
  it("are focusable separators with an orientation and a label", () => {
    expect(sashes()).toHaveLength(3);
    for (const sash of sashes()) {
      expect(sash.getAttribute("role")).toBe("separator");
      expect(sash.tabIndex).toBe(0);
      const label = sash.getAttribute("aria-label");
      const orientation = sash.getAttribute("aria-orientation");
      expect(label).toBe(orientation === "vertical" ? "Resize columns" : "Resize rows");
    }
    expect(
      sashes()
        .map((sash) => sash.getAttribute("aria-orientation"))
        .sort(),
    ).toEqual(["horizontal", "vertical", "vertical"]);
  });

  it("are decorated again after a layout restore rebuilds them", () => {
    api.fromJSON(api.toJSON());
    expect(sashes()).toHaveLength(3);
    for (const sash of sashes()) expect(sash.getAttribute("role")).toBe("separator");
  });

  it("resize the neighbouring groups by 16px per arrow press, 64px with Shift", () => {
    const left = widthOf("compositions") as number;
    const preview = widthOf("preview") as number;
    const sash = columnSash(0);
    press(sash, "ArrowRight");
    expect(widthOf("compositions")).toBe(left + 16);
    expect(widthOf("preview")).toBe(preview - 16);
    press(sash, "ArrowRight", { shiftKey: true });
    expect(widthOf("compositions")).toBe(left + 80);
    press(sash, "ArrowLeft");
    expect(widthOf("compositions")).toBe(left + 64);
  });

  it("stop at the panels' minimum sizes", () => {
    const sash = columnSash(0);
    for (let i = 0; i < 20; i++) press(sash, "ArrowLeft", { shiftKey: true });
    expect(widthOf("compositions")).toBe(200);
    for (let i = 0; i < 40; i++) press(sash, "ArrowRight", { shiftKey: true });
    expect(widthOf("preview")).toBe(360);
  });

  it("ignore the arrow keys of the other axis and keys pressed anywhere else", () => {
    const left = widthOf("compositions");
    press(columnSash(0), "ArrowDown");
    press(host, "ArrowRight");
    press(document.body, "ArrowRight");
    expect(widthOf("compositions")).toBe(left);
  });

  it("resize rows with the vertical arrows", () => {
    const timeline = api.getPanel("timeline")?.group.height as number;
    const rows = sashes().find((sash) => sash.getAttribute("aria-orientation") === "horizontal");
    press(rows as HTMLElement, "ArrowUp");
    expect(api.getPanel("timeline")?.group.height).toBe(timeline + 16);
  });
});

describe("dock tab strips", () => {
  const tabsOf = (panel: string) => [
    ...(api.getPanel(panel)?.group.element.querySelectorAll<HTMLElement>('[role="tab"]') ?? []),
  ];

  it("keep dockview's tablist, tab and selected roles with one tab stop", () => {
    const tabs = tabsOf("compositions");
    expect(tabs).toHaveLength(4);
    expect(tabs[0]?.closest('[role="tablist"]')).not.toBeNull();
    expect(tabs.map((tab) => tab.getAttribute("aria-selected"))).toEqual([
      "true",
      "false",
      "false",
      "false",
    ]);
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1, -1, -1]);
  });

  it("leave browser shortcuts alone when Alt, Ctrl or Meta is held", () => {
    const sash = columnSash(0);
    const left = widthOf("compositions");
    const tab = tabsOf("compositions")[0] as HTMLElement;
    const active = () => api.getPanel("compositions")?.group.activePanel?.id;
    for (const init of [{ altKey: true }, { ctrlKey: true }, { metaKey: true }]) {
      const onSash = new KeyboardEvent("keydown", {
        key: "ArrowRight",
        cancelable: true,
        bubbles: true,
        ...init,
      });
      sash.dispatchEvent(onSash);
      press(tab, "ArrowRight", init);
      expect(onSash.defaultPrevented).toBe(false);
      expect(active()).toBe("compositions");
    }
    expect(widthOf("compositions")).toBe(left);
  });

  it("move focus and activate the neighbouring tab, wrapping at both ends", () => {
    const tabs = tabsOf("compositions");
    const active = () => api.getPanel("compositions")?.group.activePanel?.id;
    (tabs[0] as HTMLElement).focus();
    press(tabs[0] as HTMLElement, "ArrowRight");
    expect(active()).toBe("assets");
    expect(document.activeElement).toBe(tabs[1]);
    press(tabs[1] as HTMLElement, "ArrowLeft");
    press(tabs[0] as HTMLElement, "ArrowLeft");
    expect(active()).toBe("catalog");
    expect(document.activeElement).toBe(tabs[3]);
    press(tabs[3] as HTMLElement, "ArrowRight");
    expect(active()).toBe("compositions");
  });

  it("jump to the first and last tab with Home and End", () => {
    const tabs = tabsOf("design");
    press(tabs[0] as HTMLElement, "End");
    expect(api.getPanel("design")?.group.activePanel?.id).toBe("motionBlur");
    expect(document.activeElement).toBe(tabs[4]);
    press(tabs[4] as HTMLElement, "Home");
    expect(api.getPanel("design")?.group.activePanel?.id).toBe("design");
  });
});
