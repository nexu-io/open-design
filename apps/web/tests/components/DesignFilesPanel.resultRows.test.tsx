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

// Plugin-folder and live-artifact rows are "result rows": they share the file
// row's leading columns (check, icon, name) and end in
// status · time · one action · ⋯ (#4056).

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
  it("renders a div row aligned with file rows, with status, time, Refresh and ⋯ columns", () => {
    renderPanel({ liveArtifacts: [liveArtifact()] });
    fireEvent.click(screen.getByTestId("design-files-tab-live-artifacts"));

    const row = screen.getByTestId(`design-file-row-${liveArtifactTabId("la-1")}`);
    // Not a <button>: the global 36px button height used to clip the row.
    expect(row.tagName).toBe("DIV");
    expect(row.closest("button")).toBeNull();
    expect(row.classList.contains("df-row-result")).toBe(true);
    expect(columnClasses(row)).toEqual([
      "df-row-check",
      "df-row-icon",
      "df-row-name-wrap",
      "df-row-status",
      "df-row-time",
      expect.any(String), // Refresh (Button primitive)
      "df-row-menu",
    ]);
    // The Live badge moved out of the subtitle into the status column.
    const status = screen.getByTestId(`design-file-status-${liveArtifactTabId("la-1")}`);
    expect(status.textContent).toContain("Live");
    expect(row.querySelector(".df-row-sub")?.textContent).toBe("Live artifact");
    expect(row.querySelector(".df-row-sub .live-artifact-badges")).toBeNull();
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

  it("shows Refresh failed in the status column", () => {
    renderPanel({ liveArtifacts: [liveArtifact({ refreshStatus: "failed" })] });
    fireEvent.click(screen.getByTestId("design-files-tab-live-artifacts"));
    const status = screen.getByTestId(`design-file-status-${liveArtifactTabId("la-1")}`);
    expect(status.textContent).toContain("Refresh failed");
  });

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

describe("DesignFilesPanel plugin-folder rows", () => {
  it("keeps one primary action in the row and moves share actions into ⋯", async () => {
    const onPluginFolderAgentAction = vi.fn();
    const onOpenFile = vi.fn();
    renderPanel({ files: pluginFiles, onPluginFolderAgentAction, onOpenFile });
    fireEvent.click(screen.getByTestId("design-files-tab-plugin-folders"));

    const row = screen.getByTestId("design-plugin-folder-generated-plugin");
    expect(row.classList.contains("df-row-result")).toBe(true);
    expect(columnClasses(row)).toEqual([
      "df-row-check",
      "df-row-icon",
      "df-row-name-wrap",
      "df-row-status",
      "df-row-time",
      expect.any(String), // Add to My plugins (Button primitive)
      "df-row-menu",
    ]);
    expect(screen.getByTestId("design-plugin-folder-install-generated-plugin").textContent)
      .toBe("Add to My plugins");
    expect(screen.queryByTestId("design-plugin-folder-publish-generated-plugin")).toBeNull();
    expect(screen.queryByTestId("design-plugin-folder-contribute-generated-plugin")).toBeNull();
    // Idle rows show no status chip.
    expect(screen.getByTestId("design-plugin-folder-status-generated-plugin").textContent).toBe("");

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

  it("shows Sending… in the status column while an action is in flight", async () => {
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
    expect(status.textContent).toBe("");
  });

  it("opens the plugin manifest from a row click", () => {
    const onOpenFile = vi.fn();
    renderPanel({ files: pluginFiles, onPluginFolderAgentAction: vi.fn(), onOpenFile });
    fireEvent.click(screen.getByTestId("design-files-tab-plugin-folders"));
    fireEvent.click(screen.getByTestId("design-plugin-folder-generated-plugin"));
    expect(onOpenFile).toHaveBeenCalledWith("generated-plugin/open-design.json");
  });
});
