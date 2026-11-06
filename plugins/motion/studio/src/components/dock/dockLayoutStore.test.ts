import { beforeEach, describe, expect, it } from "vitest";
import { useDockLayoutStore } from "./dockLayoutStore";
import type { PanelId } from "./panelRegistry";

const snapshot = (groupActivePanels: PanelId[], activePanel: PanelId | null = null) => ({
  openPanels: new Set<PanelId>(["design", "renders", "compositions"]),
  visiblePanels: new Set<PanelId>(groupActivePanels),
  activePanel,
  groupActivePanels,
});

describe("dock store sync", () => {
  beforeEach(() => useDockLayoutStore.setState({ lastActive: {} }));

  it("records what every side group shows, not only the globally active panel", () => {
    useDockLayoutStore.getState().sync(snapshot(["compositions", "renders"], "compositions"));
    expect(useDockLayoutStore.getState().lastActive).toEqual({
      left: "compositions",
      right: "renders",
    });
  });

  it("forgets the previous dock's memory on detach", () => {
    useDockLayoutStore.getState().sync(snapshot(["renders"], "renders"));
    useDockLayoutStore.getState().detach();
    expect(useDockLayoutStore.getState().lastActive).toEqual({});
  });
});
