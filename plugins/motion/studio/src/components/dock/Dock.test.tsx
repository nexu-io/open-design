// @vitest-environment happy-dom

import React, { act, type ComponentProps } from "react";
import type { DockviewApi } from "dockview-react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as dockLayout from "./dockLayout";
import { I18nProvider, useI18n } from "../../i18n/I18n";
import { Dock } from "./Dock";
import { parseDockLayout } from "./dockLayoutSchema";
import { useDockLayoutStore } from "./dockLayoutStore";
import { PANEL_IDS } from "./panelRegistry";
import { readStudioUiPreferences } from "../../utils/studioUiPreferences";
import { applyMotionLayout, MotionPreviewButton } from "../../motion/MotionLayoutControls";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let dockApi: DockviewApi | null = null;
vi.mock("dockview-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("dockview-react")>();
  return {
    ...actual,
    DockviewReact: (props: ComponentProps<typeof actual.DockviewReact>) =>
      React.createElement(actual.DockviewReact, {
        ...props,
        onReady: (event) => {
          dockApi = event.api;
          props.onReady(event);
        },
      }),
  };
});

const liveObservers = new Set<{ callback: () => void; target?: Element }>();
class ResizeObserverStub {
  private readonly entry: { callback: () => void; target?: Element };
  constructor(callback: () => void) {
    this.entry = { callback };
  }
  observe(target: Element) {
    this.entry.target = target;
    liveObservers.add(this.entry);
  }
  unobserve() {}
  disconnect() {
    liveObservers.delete(this.entry);
  }
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;

vi.mock("./dockLayout", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./dockLayout")>();
  return {
    ...actual,
    applySideMinimums: vi.fn(actual.applySideMinimums),
    addRegisteredPanel: vi.fn(actual.addRegisteredPanel),
  };
});
const applySideMinimums = vi.mocked(dockLayout.applySideMinimums);
const addRegisteredPanel = vi.mocked(dockLayout.addRegisteredPanel);

let root: Root | null = null;

function mount(
  projectId: string | null,
  titles: Partial<Record<(typeof PANEL_IDS)[number], string>> = {},
  options: Omit<ComponentProps<typeof Dock.Root>, "projectId" | "children"> = {},
) {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => {
    root?.render(
      <Dock.Root projectId={projectId} {...options}>
        <Dock.WindowMenu />
        <MotionPreviewButton />
        {(options.panels ?? PANEL_IDS).map((id) => (
          <Dock.Panel key={id} id={id} title={titles[id]}>
            <div data-testid={`content-${id}`}>{id}</div>
          </Dock.Panel>
        ))}
      </Dock.Root>,
    );
  });
  return host;
}

/** The persisted views of the group holding `id`, after the debounced write lands. */
function persistedGroupOf(id: string): string | undefined {
  act(() => {
    vi.advanceTimersByTime(1000);
  });
  const grid = JSON.stringify(readStudioUiPreferences(undefined, "p1").dockLayout?.grid);
  const groups = [...grid.matchAll(/"views":\[([^\]]*)\]/g)].map((m) => m[1]);
  return groups.find((views) => views.includes(`"${id}"`));
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  vi.useRealTimers();
});

// The default Edit layout tabs [compositions|assets|code|catalog] into one
// group and [design|layers|renders|variables] into another; dockview shows
// only the active tab's content per group. `slideshow` is never part of the
// default build — StudioRightPanels opens it itself when the file is one.
const DEFAULT_OPEN = PANEL_IDS.filter((id) => id !== "slideshow" && id !== "history");
const DEFAULT_VISIBLE = ["preview", "timeline", "compositions", "design"];

describe("Dock on React 19", () => {
  it("mounts the default layout's ten panels, showing only each group's active tab", () => {
    const host = mount("p1");
    for (const id of DEFAULT_VISIBLE) {
      expect(host.querySelector(`[data-testid="content-${id}"]`)).not.toBeNull();
    }
    for (const id of DEFAULT_OPEN.filter((id) => !DEFAULT_VISIBLE.includes(id))) {
      expect(host.querySelector(`[data-testid="content-${id}"]`)).toBeNull();
    }
    expect(host.querySelector('[data-testid="content-slideshow"]')).toBeNull();
    expect(useDockLayoutStore.getState().openPanels).toEqual(new Set(DEFAULT_OPEN));
  });

  it("persists a layout change per project and reads it back through the schema", () => {
    mount("p1");
    act(() => useDockLayoutStore.getState().closePanel("renders"));
    act(() => {
      vi.advanceTimersByTime(400);
    });
    const stored = readStudioUiPreferences(undefined, "p1").dockLayout;
    const expected = DEFAULT_OPEN.filter((id) => id !== "renders");
    expect(Object.keys(stored?.panels ?? {}).sort()).toEqual([...expected].sort());
    expect(readStudioUiPreferences(undefined, "p2").dockLayout).toBeUndefined();
  });

  it("closes a panel and reopens it from the store, becoming its group's visible tab", async () => {
    const host = mount("p1");
    act(() => useDockLayoutStore.getState().closePanel("renders"));
    expect(useDockLayoutStore.getState().openPanels.has("renders")).toBe(false);
    expect(host.querySelector('[data-testid="content-renders"]')).toBeNull();
    // dockview's own panel-active event dispatch resolves on a microtask, one
    // tick after the synchronous store call returns; `act(async ...)` is what
    // actually waits for it instead of asserting against pre-flush DOM.
    await act(async () => {
      useDockLayoutStore.getState().togglePanel("renders");
      await Promise.resolve();
    });
    expect(useDockLayoutStore.getState().openPanels.has("renders")).toBe(true);
    expect(host.querySelector('[data-testid="content-renders"]')).not.toBeNull();
  });

  it("keeps a panel's custom title when it is closed and reopened", async () => {
    const host = mount("p1", { renders: "Renders (2)" });
    expect(host.textContent).toContain("Renders (2)");
    act(() => useDockLayoutStore.getState().closePanel("renders"));
    await act(async () => {
      useDockLayoutStore.getState().togglePanel("renders");
      await Promise.resolve();
    });
    expect(host.textContent).toContain("Renders (2)");
  });

  it("reopens a closed panel as a tab of its zone's group, not a new group", () => {
    mount("p1");
    act(() => useDockLayoutStore.getState().closePanel("compositions"));
    act(() => useDockLayoutStore.getState().togglePanel("compositions"));
    expect(persistedGroupOf("compositions")).toContain('"assets"');
  });

  it("reopens a side panel next to the preview when its whole column was closed", () => {
    mount("p1");
    const { closePanel, togglePanel } = useDockLayoutStore.getState();
    for (const id of ["compositions", "assets", "code", "catalog"] as const)
      act(() => closePanel(id));
    act(() => togglePanel("compositions"));
    expect(useDockLayoutStore.getState().openPanels.has("compositions")).toBe(true);
    expect(useDockLayoutStore.getState().visiblePanels.has("compositions")).toBe(true);
  });

  it("reopens a side panel beside preview when its usual tab neighbour is closed", () => {
    mount("p1");
    const { closePanel, togglePanel } = useDockLayoutStore.getState();
    for (const id of ["compositions", "assets", "code", "catalog"] as const)
      act(() => closePanel(id));
    addRegisteredPanel.mockClear();
    act(() => togglePanel("assets"));
    expect(addRegisteredPanel).toHaveBeenCalledWith(expect.anything(), "assets", { referencePanel: "preview", direction: "left" });
    expect(dockApi!.getPanel("assets")!.group).not.toBe(dockApi!.getPanel("preview")!.group);
  });

  it("reopens the timeline as its own group, never as a tab of the preview", () => {
    mount("p1");
    act(() => useDockLayoutStore.getState().closePanel("timeline"));
    act(() => useDockLayoutStore.getState().togglePanel("timeline"));
    expect(persistedGroupOf("timeline")).not.toContain('"preview"');
  });

  it("reopens preview between the side columns and keeps the timeline below", () => {
    mount("p1");
    function hierarchy(node: ReturnType<DockviewApi["toJSON"]>["grid"]["root"]): unknown {
      return node.type === "leaf" ? node.data.views : node.data.map(hierarchy);
    }
    const before = hierarchy(dockApi!.toJSON().grid.root);
    act(() => useDockLayoutStore.getState().closePanel("preview"));
    act(() => useDockLayoutStore.getState().activatePanel("preview"));
    expect(hierarchy(dockApi!.toJSON().grid.root)).toEqual(before);
    expect(useDockLayoutStore.getState().visiblePanels.has("preview")).toBe(true);
    act(() => dockApi!.getPanel("preview")!.group.api.maximize());
    act(() => useDockLayoutStore.getState().activatePanel("preview"));
    expect(dockApi!.getPanel("preview")!.group.api.isMaximized()).toBe(true);
  });

  it("recovers a preview closed before reload through the permanent header button", () => {
    mount("p1");
    act(() => useDockLayoutStore.getState().closePanel("preview"));
    act(() => vi.advanceTimersByTime(400));
    act(() => root?.unmount());
    root = null;
    document.body.innerHTML = "";
    const host = mount("p1");
    const button = host.querySelector<HTMLButtonElement>('[aria-label="Open preview"]')!;
    expect(button).not.toBeNull();
    act(() => button.click());
    expect(useDockLayoutStore.getState().visiblePanels.has("preview")).toBe(true);
    expect(dockApi!.getPanel("preview")!.group).not.toBe(dockApi!.getPanel("timeline")!.group);
    act(() => button.click());
    expect(useDockLayoutStore.getState().visiblePanels.has("preview")).toBe(true);
  });

  it("restores preview after every panel is closed and can recover a maximized layout", () => {
    const host = mount("p1");
    act(() => { for (const id of [...useDockLayoutStore.getState().openPanels]) useDockLayoutStore.getState().closePanel(id); });
    act(() => host.querySelector<HTMLButtonElement>('[aria-label="Open preview"]')!.click());
    expect(useDockLayoutStore.getState().visiblePanels.has("preview")).toBe(true);
    act(() => useDockLayoutStore.getState().activatePanel("design"));
    act(() => dockApi!.getPanel("design")!.group.api.maximize());
    act(() => useDockLayoutStore.getState().activatePanel("preview"));
    expect(dockApi!.getPanel("design")!.group.api.isMaximized()).toBe(false);
    expect(useDockLayoutStore.getState().visiblePanels.has("preview")).toBe(true);
  });

  it("applies persistent layout presets and restores the full editor", () => {
    mount("p1");
    act(() => applyMotionLayout("preview"));
    expect(useDockLayoutStore.getState().openPanels).toEqual(new Set(["preview"]));
    expect(persistedGroupOf("preview")).toBe('"preview"');
    act(() => useDockLayoutStore.getState().activatePanel("assets"));
    expect(dockApi!.getPanel("assets")!.group).not.toBe(dockApi!.getPanel("preview")!.group);
    expect(useDockLayoutStore.getState().visiblePanels.has("preview")).toBe(true);
    act(() => applyMotionLayout("code"));
    expect(useDockLayoutStore.getState().openPanels).toEqual(new Set(["preview", "timeline", "code"]));
    act(() => applyMotionLayout("edit"));
    expect(useDockLayoutStore.getState().openPanels).toEqual(new Set(DEFAULT_OPEN));
    act(() => useDockLayoutStore.getState().activatePanel("history"));
    expect(persistedGroupOf("history")).toContain('"design"');
  });

  it("restores the stored layout on the next mount instead of rebuilding the default", () => {
    mount("p1");
    act(() => useDockLayoutStore.getState().closePanel("renders"));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    act(() => root?.unmount());
    root = null;
    document.body.innerHTML = "";

    mount("p1");
    expect(useDockLayoutStore.getState().openPanels.has("renders")).toBe(false);
  });

  it("falls back to the default layout when the stored one names an unknown panel", () => {
    localStorage.setItem(
      "hf-studio-ui-preferences:p1",
      JSON.stringify({ dockLayout: { grid: {}, panels: { nope: {} } } }),
    );
    const host = mount("p1");
    expect(host.querySelector('[data-testid="content-preview"]')).not.toBeNull();
  });
});

describe("Dock wiring", () => {
  it("re-applies the side minimums when a panel is dragged to another group", () => {
    mount(null);
    applySideMinimums.mockClear();
    const preview = dockApi?.getPanel("preview");
    const design = dockApi?.getPanel("design");
    if (!preview || !design) throw new Error("default layout is missing panels");
    act(() => design.api.moveTo({ group: preview.group }));
    expect(applySideMinimums).toHaveBeenCalled();
  });

  it("makes the sashes keyboard-focusable separators", () => {
    const host = mount(null);
    const sashes = host.querySelectorAll<HTMLElement>('.dv-sash[role="separator"]');
    expect(sashes.length).toBeGreaterThan(0);
    for (const sash of sashes) expect(sash.tabIndex).toBe(0);
  });

  it("re-fits the side columns to the window width when it resizes", () => {
    mount(null);
    const innerWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { value: 560, configurable: true });
    try {
      applySideMinimums.mockClear();
      const dockObservers = [...liveObservers].filter(({ target }) =>
        target?.classList.contains("hf-dock"),
      );
      act(() => dockObservers.forEach(({ callback }) => callback()));
      expect(applySideMinimums).toHaveBeenCalledWith(expect.anything(), 560);
    } finally {
      Object.defineProperty(window, "innerWidth", { value: innerWidth, configurable: true });
    }
  });
});

// A host app mounts a subset of Studio's panels under its own storage key and width.
describe("a host's dock", () => {
  const panels = ["preview", "timeline", "assets", "renders"] as const;
  const hostDock = { panels, storageKey: "host-dock" };

  it("builds only its panels, a side column each, and its Window menu lists only them", () => {
    const host = mount("p1", {}, hostDock);
    expect(useDockLayoutStore.getState().openPanels).toEqual(new Set(panels));
    expect(useDockLayoutStore.getState().visiblePanels).toEqual(new Set(panels));
    expect(dockApi?.getPanel("assets")?.group.id).not.toBe(dockApi?.getPanel("renders")?.group.id);
    const menu = [...host.querySelectorAll("button")].find((b) => b.textContent === "Window");
    act(() => menu?.click());
    const items = [...host.querySelectorAll('[role="menuitemcheckbox"]')].map((i) => i.textContent);
    expect(items).toEqual(["✓Preview", "✓Timeline", "✓Assets", "✓Renders"]);
  });

  it("keeps its layout alone under its own key, never in Studio's preferences", () => {
    mount("p1", {}, hostDock);
    act(() => useDockLayoutStore.getState().closePanel("renders"));
    act(() => {
      vi.advanceTimersByTime(400);
    });
    const stored = readStudioUiPreferences(undefined, "p1", "host-dock").dockLayout;
    expect(Object.keys(stored?.panels ?? {}).sort()).toEqual(["assets", "preview", "timeline"]);
    expect(readStudioUiPreferences(undefined, "p1").dockLayout).toBeUndefined();
  });

  it("falls back to its default when a stored layout names a panel it lacks", () => {
    mount("p1");
    act(() => {
      vi.advanceTimersByTime(400);
    });
    const studio = readStudioUiPreferences(undefined, "p1").dockLayout;
    act(() => root?.unmount());
    root = null;
    localStorage.setItem("host-dock:p1", JSON.stringify({ dockLayout: studio }));
    mount("p1", {}, hostDock);
    expect(useDockLayoutStore.getState().openPanels).toEqual(new Set(panels));
  });

  it("reopens a panel beside the preview when the panel it reopens near is not in the dock", () => {
    mount("p1", {}, hostDock);
    act(() => useDockLayoutStore.getState().closePanel("assets"));
    act(() => useDockLayoutStore.getState().togglePanel("assets"));
    expect(useDockLayoutStore.getState().visiblePanels.has("assets")).toBe(true);
  });

  it("sizes its sides against its own width, not the window's", () => {
    mount(null, {}, { ...hostDock, dockWidth: () => 700 });
    applySideMinimums.mockClear();
    const dockObservers = [...liveObservers].filter(({ target }) =>
      target?.classList.contains("hf-dock"),
    );
    act(() => dockObservers.forEach(({ callback }) => callback()));
    expect(applySideMinimums).toHaveBeenCalledWith(expect.anything(), 700);
  });
});

describe("parseDockLayout", () => {
  it("rejects shapes that are not a dock layout", () => {
    expect(parseDockLayout(null)).toBeNull();
    expect(parseDockLayout({ grid: {}, panels: {} })).toBeNull();
    expect(
      parseDockLayout({
        grid: {
          width: 1,
          height: 1,
          orientation: "HORIZONTAL",
          root: { type: "leaf", data: { views: ["ghost"] } },
        },
        panels: { ghost: { id: "ghost", contentComponent: "panel" } },
      }),
    ).toBeNull();
  });

  const placed = (views: string[], panelIds: string[]) => ({
    grid: {
      width: 1,
      height: 1,
      orientation: "HORIZONTAL",
      root: { type: "leaf", data: { views } },
    },
    panels: Object.fromEntries(panelIds.map((id) => [id, { id, contentComponent: "panel" }])),
  });

  it("rejects a view that has no panel entry and a panel that no view places", () => {
    expect(parseDockLayout(placed(["preview", "design"], ["preview"]))).toBeNull();
    expect(parseDockLayout(placed(["preview"], ["preview", "design"]))).toBeNull();
    expect(parseDockLayout(placed(["preview", "design"], ["preview", "design"]))).not.toBeNull();
  });
});

function LocaleSwitcher() {
  const { locale, setLocale } = useI18n();
  return <button data-testid="change-language" onClick={() => setLocale(locale === 'en' ? 'zh-CN' : 'en')}>Language</button>;
}

it('changes native dock titles live without recreating panels, preview or layout', () => {
  const host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  act(() => root?.render(<I18nProvider initialLocale="en"><Dock.Root projectId="p1">
    <LocaleSwitcher />
    {PANEL_IDS.map(id => <Dock.Panel key={id} id={id}>
      {id === 'preview' ? <iframe title="Project preview" srcDoc="<p>Preview</p>" /> : <div>{id}</div>}
    </Dock.Panel>)}
  </Dock.Root></I18nProvider>));
  const preview = host.querySelector('iframe');
  const api = dockApi!;
  const groupId = api.getPanel('preview')!.group.id;
  act(() => api.getPanel('preview')!.api.setSize({ width: 650 }));
  const grid = JSON.stringify(api.toJSON().grid);
  const switchLanguage = () => act(() => host.querySelector<HTMLButtonElement>('[data-testid="change-language"]')!.click());
  expect(api.getPanel('preview')!.title).toBe('Preview');
  switchLanguage();
  expect(api.getPanel('preview')!.title).toBe('预览');
  expect(api.getPanel('compositions')!.title).toBe('合成');
  expect(api.getPanel('preview')!.group.id).toBe(groupId);
  expect(JSON.stringify(api.toJSON().grid)).toBe(grid);
  expect(host.querySelector('iframe')).toBe(preview);
  act(() => useDockLayoutStore.getState().activatePanel('history'));
  expect(api.getPanel('history')!.title).toBe('版本历史');
  switchLanguage();
  expect(api.getPanel('history')!.title).toBe('Version history');
  expect(api.getPanel('preview')!.title).toBe('Preview');
  expect(host.querySelector('iframe')).toBe(preview);
});
