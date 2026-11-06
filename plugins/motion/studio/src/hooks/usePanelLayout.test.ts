// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDockLayoutStore, type DockController } from "../components/dock/dockLayoutStore";
import { PANEL_IDS, type PanelId } from "../components/dock/panelRegistry";
import { trackStudioEvent } from "../utils/studioTelemetry";
import { usePanelLayout, type InitialPanelLayoutState } from "./usePanelLayout";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../utils/studioTelemetry", () => ({ trackStudioEvent: vi.fn() }));

function fakeController(): DockController {
  return {
    open: vi.fn(),
    activate: vi.fn(),
    close: vi.fn(),
    setTitle: vi.fn(),
    setGroupVisible: vi.fn(),
    reset: vi.fn(),
  };
}

function showDock(visible: PanelId[], controller = fakeController()) {
  useDockLayoutStore.setState({
    controller,
    openPanels: new Set(PANEL_IDS),
    visiblePanels: new Set(visible),
    lastActive: {},
    activePanel: null,
  });
  return controller;
}

function renderLayout(initial?: InitialPanelLayoutState) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  let current: ReturnType<typeof usePanelLayout> | null = null;
  function Harness() {
    current = usePanelLayout(initial);
    return null;
  }
  act(() => root.render(React.createElement(Harness)));
  return {
    get layout() {
      if (!current) throw new Error("layout not rendered");
      return current;
    },
    unmount: () => act(() => root.unmount()),
  };
}

beforeEach(() => vi.mocked(trackStudioEvent).mockClear());
afterEach(() => {
  document.body.innerHTML = "";
  useDockLayoutStore.setState({ controller: null });
});

describe("usePanelLayout over the dock", () => {
  it("reads the tab of the right-zone panel that is showing", () => {
    showDock(["preview", "timeline", "compositions", "renders"]);
    const view = renderLayout();
    expect(view.layout.rightPanelTab).toBe("renders");
    expect(view.layout.rightCollapsed).toBe(false);
  });

  it("is collapsed when no right-zone panel is showing", () => {
    showDock(["preview", "timeline", "compositions"]);
    const view = renderLayout();
    expect(view.layout.rightCollapsed).toBe(true);
    expect(view.layout.rightPanelTab).toBe("design");
  });

  it("opens the Design panel for the legacy block-params tab and reports the tab switch", () => {
    const controller = showDock(["preview"]);
    const view = renderLayout();
    act(() => view.layout.setRightPanelTab("block-params"));
    expect(controller.setGroupVisible).toHaveBeenCalledWith("design", true);
    expect(controller.activate).toHaveBeenCalledWith("design");
    expect(trackStudioEvent).toHaveBeenCalledWith("tab_switch", {
      panel: "right_panel",
      tab: "block-params",
    });
  });

  it("reports a tab switch only when the tab actually changes", () => {
    showDock(["preview", "design"]);
    const view = renderLayout();
    vi.mocked(trackStudioEvent).mockClear();
    act(() => view.layout.setRightPanelTab("design"));
    expect(trackStudioEvent).not.toHaveBeenCalled();
    act(() => view.layout.setRightPanelTab("layers"));
    expect(trackStudioEvent).toHaveBeenCalledWith("tab_switch", {
      panel: "right_panel",
      tab: "layers",
    });
  });

  it("collapses every open right-zone panel group and leaves the other zones alone", () => {
    const controller = showDock(["preview", "design"]);
    const view = renderLayout();
    act(() => view.layout.setRightCollapsed(true));
    const hidden = vi.mocked(controller.setGroupVisible).mock.calls;
    expect(hidden.map(([id]) => id).sort()).toEqual(
      ["design", "history", "layers", "motionBlur", "renders", "slideshow", "variables"].sort(),
    );
    expect(hidden.every(([, visible]) => visible === false)).toBe(true);
  });

  it("expanding an already-showing right column does nothing to the tab", () => {
    const controller = showDock(["design"]);
    const view = renderLayout();
    act(() => view.layout.setRightCollapsed(false));
    expect(controller.activate).not.toHaveBeenCalled();
  });

  it("expanding a fully hidden right column brings Design back", () => {
    const controller = showDock(["preview"]);
    const view = renderLayout();
    act(() => view.layout.setRightCollapsed(false));
    expect(controller.activate).toHaveBeenCalledWith("design");
  });

  it("applies the URL's tab and collapse state once, when the dock attaches", () => {
    useDockLayoutStore.setState({ controller: null, openPanels: new Set(PANEL_IDS) });
    const view = renderLayout({ rightPanelTab: "variables", rightCollapsed: true });
    const controller = fakeController();
    act(() => useDockLayoutStore.getState().attach(controller));
    expect(controller.activate).toHaveBeenCalledWith("variables");
    expect(controller.setGroupVisible).toHaveBeenCalledWith("design", false);
    const later = fakeController();
    act(() => useDockLayoutStore.getState().attach(later));
    expect(later.activate).not.toHaveBeenCalled();
    expect(later.setGroupVisible).not.toHaveBeenCalled();
    view.unmount();
  });

  it("keeps a URL's slideshow tab until the panel opens, then activates it once", () => {
    const opened = new Set<PanelId>(PANEL_IDS.filter((id) => id !== "slideshow"));
    useDockLayoutStore.setState({ controller: null, openPanels: opened });
    const view = renderLayout({ rightPanelTab: "slideshow" });
    const controller = fakeController();
    act(() => useDockLayoutStore.getState().attach(controller));
    expect(controller.activate).not.toHaveBeenCalled();
    act(() => useDockLayoutStore.setState({ openPanels: new Set(PANEL_IDS) }));
    expect(controller.activate).toHaveBeenCalledWith("slideshow");
    view.unmount();
  });
});
