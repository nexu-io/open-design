// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";

import { DesignFilesPanel } from "../../src/components/DesignFilesPanel";
import {
  liveArtifactTabId,
  type LiveArtifactWorkspaceEntry,
  type ProjectFile,
} from "../../src/types";

// Plugin-folder and live-artifact rows are "result rows" (#4056): file-row
// height and icon→name gap, no check column (they never mix with file rows),
// status in the meta line under the name, and a trailing cluster of
// time · one action · ⋯ (plugin) or time · Refresh (live).

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function file(name: string): ProjectFile {
  return {
    name,
    path: name,
    type: "file",
    size: 1024,
    mtime: Date.now(),
    kind: "text",
    mime: "text/plain",
  };
}

function liveArtifact(
  overrides: Partial<LiveArtifactWorkspaceEntry> = {},
): LiveArtifactWorkspaceEntry {
  return {
    kind: "live-artifact",
    tabId: liveArtifactTabId("la-1"),
    artifactId: "la-1",
    projectId: "test-project",
    title: "Sales dashboard",
    slug: "sales-dashboard",
    status: "active",
    refreshStatus: "idle",
    pinned: false,
    preview: { type: "html", entry: "index.html" },
    hasDocument: true,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

const pluginFiles = [
  file("generated-plugin/open-design.json"),
  file("generated-plugin/SKILL.md"),
];

function renderPanel(overrides: Partial<ComponentProps<typeof DesignFilesPanel>> = {}) {
  return render(
    <DesignFilesPanel
      projectId="test-project"
      projectKind="prototype"
      files={[]}
      liveArtifacts={[]}
      onRefreshFiles={vi.fn()}
      onOpenFile={vi.fn()}
      onOpenLiveArtifact={vi.fn()}
      onRenameFile={vi.fn()}
      onDeleteFile={vi.fn()}
      onDeleteFiles={vi.fn()}
      onUpload={vi.fn()}
      onUploadFiles={vi.fn()}
      onPaste={vi.fn()}
      onNewSketch={vi.fn()}
      {...overrides}
    />,
  );
}

function columnClasses(row: Element): string[] {
  return Array.from(row.children).map((child) => child.className.split(" ")[0] ?? "");
}

describe("DesignFilesPanel live-artifact rows", () => {
  it("renders a div row: icon, name with status in the meta line, time, Refresh", () => {
    renderPanel({ liveArtifacts: [liveArtifact()] });
    fireEvent.click(screen.getByTestId("design-files-tab-live-artifacts"));

    const row = screen.getByTestId(`design-file-row-${liveArtifactTabId("la-1")}`);
    // Not a <button>: the global 36px button height used to clip the row.
    expect(row.tagName).toBe("DIV");
    expect(row.closest("button")).toBeNull();
    expect(row.classList.contains("df-row-result")).toBe(true);
    // No check column, no floating status column, no ⋯ (live rows have no
    // menu items): Refresh is the trailing element.
    expect(columnClasses(row)).toEqual([
      "df-row-icon",
      "df-row-name-wrap",
      "df-row-time",
      expect.any(String), // Refresh (Button primitive)
    ]);
    expect(row.lastElementChild?.textContent).toBe("Refresh");
    expect(row.querySelector(".df-row-menu")).toBeNull();
    // Status reads "Live artifact · Live" in the meta line, sentence case,
    // with a dot glyph; the old uppercase pill is gone.
    const status = screen.getByTestId(`design-file-status-${liveArtifactTabId("la-1")}`);
    expect(status.closest(".df-row-sub")).toBeTruthy();
    expect(status.getAttribute("data-tone")).toBe("live");
    expect(status.querySelector(".df-row-meta-dot")).toBeTruthy();
    expect(row.querySelector(".df-row-sub")?.textContent).toBe("Live artifact·Live");
    expect(row.querySelector(".live-artifact-badge")).toBeNull();
  });

  it("opens from a row click and from the name button without opening twice", () => {
    const onOpenLiveArtifact = vi.fn();
    renderPanel({ liveArtifacts: [liveArtifact()], onOpenLiveArtifact });
    fireEvent.click(screen.getByTestId("design-files-tab-live-artifacts"));

    const row = screen.getByTestId(`design-file-row-${liveArtifactTabId("la-1")}`);
    fireEvent.click(row);
    expect(onOpenLiveArtifact).toHaveBeenCalledTimes(1);

    const nameButton = row.querySelector<HTMLButtonElement>(".df-row-name-btn");
    expect(nameButton).toBeTruthy();
    fireEvent.click(nameButton!);
    expect(onOpenLiveArtifact).toHaveBeenCalledTimes(2);
    expect(onOpenLiveArtifact).toHaveBeenLastCalledWith(liveArtifactTabId("la-1"));
  });

  it.each([
    ["running", "active", "running", "Refreshing…", true],
    ["failed", "active", "failed", "Refresh failed", true],
    ["idle", "archived", "archived", "Archived", false],
    ["succeeded", "active", "live", "Live", false],
  ] as const)(
    "shows refreshStatus=%s status=%s as one %s meta-line state",
    (refreshStatus, status, tone, label, hasGlyph) => {
      renderPanel({ liveArtifacts: [liveArtifact({ refreshStatus, status })] });
      fireEvent.click(screen.getByTestId("design-files-tab-live-artifacts"));
      const el = screen.getByTestId(`design-file-status-${liveArtifactTabId("la-1")}`);
      expect(el.getAttribute("data-tone")).toBe(tone);
      expect(el.textContent).toBe(label);
      // Spinner / alert glyph so the state never relies on colour alone.
      expect(Boolean(el.querySelector("svg"))).toBe(hasGlyph);
    },
  );

  it("refreshes from the row action without opening the artifact", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ artifact: {}, refresh: { refreshedSourceCount: 1 } }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const onOpenLiveArtifact = vi.fn();
    const onRefreshFiles = vi.fn();
    renderPanel({ liveArtifacts: [liveArtifact()], onOpenLiveArtifact, onRefreshFiles });
    fireEvent.click(screen.getByTestId("design-files-tab-live-artifacts"));

    const refresh = screen.getByTestId(
      `design-live-artifact-refresh-${liveArtifactTabId("la-1")}`,
    );
    expect(refresh.textContent).toBe("Refresh");
    await act(async () => {
      fireEvent.click(refresh);
    });

    await waitFor(() => expect(onRefreshFiles).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/api/live-artifacts/la-1/refresh");
    expect(init.method).toBe("POST");
    expect(onOpenLiveArtifact).not.toHaveBeenCalled();
  });
});

describe("DesignFilesPanel live-artifact refresh outcomes", () => {
  function refreshResponse(refreshedSourceCount: number) {
    return new Response(
      JSON.stringify({ artifact: {}, refresh: { refreshedSourceCount } }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }

  it("hides Refresh from read-only viewers without leaving a placeholder", () => {
    renderPanel({ liveArtifacts: [liveArtifact()], viewerOnly: true });
    fireEvent.click(screen.getByTestId("design-files-tab-live-artifacts"));
    expect(
      screen.queryByTestId(`design-live-artifact-refresh-${liveArtifactTabId("la-1")}`),
    ).toBeNull();
    const row = screen.getByTestId(`design-file-row-${liveArtifactTabId("la-1")}`);
    // No empty placeholder: time is the trailing element.
    expect(columnClasses(row)).toEqual(["df-row-icon", "df-row-name-wrap", "df-row-time"]);
  });

  it("says when a refresh had no source instead of looking like success", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => refreshResponse(0)));
    renderPanel({ liveArtifacts: [liveArtifact()] });
    fireEvent.click(screen.getByTestId("design-files-tab-live-artifacts"));
    await act(async () => {
      fireEvent.click(
        screen.getByTestId(`design-live-artifact-refresh-${liveArtifactTabId("la-1")}`),
      );
    });
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe(
        "Sales dashboard: No refresh source is available yet.",
      ),
    );
  });

  it("shows the localized network failure message, naming the artifact", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    renderPanel({ liveArtifacts: [liveArtifact()] });
    fireEvent.click(screen.getByTestId("design-files-tab-live-artifacts"));
    await act(async () => {
      fireEvent.click(
        screen.getByTestId(`design-live-artifact-refresh-${liveArtifactTabId("la-1")}`),
      );
    });
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe(
        "Sales dashboard: Refresh request failed. Check your connection and try again.",
      ),
    );
  });

  it("disables every row's Refresh while one refresh is in flight", async () => {
    let finish: (r: Response) => void = () => {};
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; })));
    renderPanel({
      liveArtifacts: [
        liveArtifact(),
        liveArtifact({ artifactId: "la-2", tabId: liveArtifactTabId("la-2"), title: "Weekly KPIs" }),
      ],
    });
    fireEvent.click(screen.getByTestId("design-files-tab-live-artifacts"));
    const first = screen.getByTestId<HTMLButtonElement>(
      `design-live-artifact-refresh-${liveArtifactTabId("la-1")}`,
    );
    const second = screen.getByTestId<HTMLButtonElement>(
      `design-live-artifact-refresh-${liveArtifactTabId("la-2")}`,
    );
    await act(async () => {
      fireEvent.click(first);
    });
    expect(first.disabled).toBe(true);
    expect(second.disabled).toBe(true);
    // The row being refreshed shows Refreshing… in its meta line.
    expect(
      screen.getByTestId(`design-file-status-${liveArtifactTabId("la-1")}`).textContent,
    ).toContain("Refreshing");

    await act(async () => {
      finish(refreshResponse(1));
    });
    await waitFor(() => expect(second.disabled).toBe(false));
    expect(first.disabled).toBe(false);
  });
});

describe("DesignFilesPanel plugin-folder rows", () => {
  it("keeps one primary action in the row and moves share actions into ⋯", async () => {
    const onPluginFolderAgentAction = vi.fn();
    const onOpenFile = vi.fn();
    renderPanel({ files: pluginFiles, onPluginFolderAgentAction, onOpenFile });
    fireEvent.click(screen.getByTestId("design-files-tab-plugin-folders"));

    const row = screen.getByTestId("design-plugin-folder-generated-plugin");
    expect(row.classList.contains("df-row-result")).toBe(true);
    expect(columnClasses(row)).toEqual([
      "df-row-icon",
      "df-row-name-wrap",
      "df-row-time",
      expect.any(String), // Add to My plugins (Button primitive)
      "df-row-menu",
    ]);
    expect(screen.getByTestId("design-plugin-folder-install-generated-plugin").textContent)
      .toBe("Add to My plugins");
    expect(screen.queryByTestId("design-plugin-folder-publish-generated-plugin")).toBeNull();
    expect(screen.queryByTestId("design-plugin-folder-contribute-generated-plugin")).toBeNull();
    // Idle rows keep the file count in the meta line.
    expect(screen.getByTestId("design-plugin-folder-status-generated-plugin").textContent)
      .toBe("2 files · ready to add to My plugins");

    const trigger = screen.getByTestId("design-plugin-folder-menu-generated-plugin");
    expect(trigger.tagName).toBe("BUTTON");
    expect(trigger.getAttribute("aria-label")).toBe("More actions for generated-plugin");
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    // Opening the menu must not open the plugin manifest.
    expect(onOpenFile).not.toHaveBeenCalled();
    const menu = screen.getByTestId("design-file-menu-popover");
    expect(menu.getAttribute("role")).toBe("menu");
    const items = Array.from(menu.querySelectorAll('[role="menuitem"]')).map((el) => el.textContent);
    expect(items).toEqual(["Publish repo", "OpenDesign PR"]);
    // File-only items (rename, delete, ...) do not leak into the plugin menu.
    expect(menu.textContent).not.toContain("Delete");

    await act(async () => {
      fireEvent.click(screen.getByTestId("design-plugin-folder-publish-generated-plugin"));
    });
    expect(onPluginFolderAgentAction).toHaveBeenCalledWith("generated-plugin", "publish");
    expect(screen.queryByTestId("design-file-menu-popover")).toBeNull();

    fireEvent.click(trigger);
    await act(async () => {
      fireEvent.click(screen.getByTestId("design-plugin-folder-contribute-generated-plugin"));
    });
    expect(onPluginFolderAgentAction).toHaveBeenCalledWith("generated-plugin", "contribute");

    await act(async () => {
      fireEvent.click(screen.getByTestId("design-plugin-folder-install-generated-plugin"));
    });
    expect(onPluginFolderAgentAction).toHaveBeenCalledWith("generated-plugin", "install");
    expect(onOpenFile).not.toHaveBeenCalled();
  });

  it("moves focus into the menu and returns it to ⋯ on Escape", () => {
    renderPanel({ files: pluginFiles, onPluginFolderAgentAction: vi.fn() });
    fireEvent.click(screen.getByTestId("design-files-tab-plugin-folders"));

    const trigger = screen.getByTestId("design-plugin-folder-menu-generated-plugin");
    trigger.focus();
    fireEvent.click(trigger);
    expect(document.activeElement?.textContent).toBe("Publish repo");

    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(document.activeElement?.textContent).toBe("OpenDesign PR");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("design-file-menu-popover")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("returns focus to ⋯ after picking a menu item, and ⋯ toggles the menu", async () => {
    renderPanel({ files: pluginFiles, onPluginFolderAgentAction: vi.fn() });
    fireEvent.click(screen.getByTestId("design-files-tab-plugin-folders"));

    const trigger = screen.getByTestId("design-plugin-folder-menu-generated-plugin");
    fireEvent.mouseDown(trigger);
    fireEvent.click(trigger);
    expect(screen.getByTestId("design-file-menu-popover")).toBeTruthy();
    fireEvent.mouseDown(trigger);
    fireEvent.click(trigger);
    expect(screen.queryByTestId("design-file-menu-popover")).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(trigger);
    await act(async () => {
      fireEvent.click(screen.getByTestId("design-plugin-folder-publish-generated-plugin"));
    });
    expect(document.activeElement).toBe(trigger);
  });

  it("keeps focus in the open menu when ⋯ is pressed, so the press toggles it closed", () => {
    renderPanel({ files: pluginFiles, onPluginFolderAgentAction: vi.fn() });
    fireEvent.click(screen.getByTestId("design-files-tab-plugin-folders"));
    const trigger = screen.getByTestId("design-plugin-folder-menu-generated-plugin");
    fireEvent.click(trigger);
    // Without preventDefault, Safari / Firefox on macOS blur the menu on
    // mousedown (closing it) and the click then reopens it.
    const notCancelled = fireEvent.mouseDown(trigger);
    expect(notCancelled).toBe(false);
  });

  it("shows Sending… while the parent still tracks an agent task for the folder", () => {
    renderPanel({
      files: pluginFiles,
      onPluginFolderAgentAction: vi.fn(),
      activePluginActionPaths: new Set(["generated-plugin"]),
    });
    fireEvent.click(screen.getByTestId("design-files-tab-plugin-folders"));
    expect(screen.getByTestId("design-plugin-folder-status-generated-plugin").textContent)
      .toBe("Sending…");
    expect(
      screen.getByTestId<HTMLButtonElement>("design-plugin-folder-install-generated-plugin").disabled,
    ).toBe(true);
  });

  it("closes the menu when focus leaves it", () => {
    renderPanel({ files: pluginFiles, onPluginFolderAgentAction: vi.fn() });
    fireEvent.click(screen.getByTestId("design-files-tab-plugin-folders"));
    fireEvent.click(screen.getByTestId("design-plugin-folder-menu-generated-plugin"));
    const item = screen.getByTestId("design-plugin-folder-contribute-generated-plugin");
    fireEvent.blur(item, { relatedTarget: document.body });
    expect(screen.queryByTestId("design-file-menu-popover")).toBeNull();
  });

  it("shows Sending… in the meta line while an action is in flight", async () => {
    let resolveAction: () => void = () => {};
    const onPluginFolderAgentAction = vi.fn(
      () => new Promise<void>((resolve) => { resolveAction = resolve; }),
    );
    renderPanel({ files: pluginFiles, onPluginFolderAgentAction });
    fireEvent.click(screen.getByTestId("design-files-tab-plugin-folders"));

    const install = screen.getByTestId<HTMLButtonElement>(
      "design-plugin-folder-install-generated-plugin",
    );
    await act(async () => {
      fireEvent.click(install);
    });
    const status = screen.getByTestId("design-plugin-folder-status-generated-plugin");
    expect(status.textContent).toBe("Sending…");
    expect(install.disabled).toBe(true);

    await act(async () => {
      resolveAction();
    });
    expect(status.textContent).toBe("2 files · ready to add to My plugins");
  });

  it("opens the plugin manifest from a row click", () => {
    const onOpenFile = vi.fn();
    renderPanel({ files: pluginFiles, onPluginFolderAgentAction: vi.fn(), onOpenFile });
    fireEvent.click(screen.getByTestId("design-files-tab-plugin-folders"));
    fireEvent.click(screen.getByTestId("design-plugin-folder-generated-plugin"));
    expect(onOpenFile).toHaveBeenCalledWith("generated-plugin/open-design.json");
  });
});
