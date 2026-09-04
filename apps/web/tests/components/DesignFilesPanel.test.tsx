// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";

import { CollabProvider } from "../../src/collab/collab-context";
import {
  DesignFilesPanel,
  type DesignFilesNavState,
} from "../../src/components/DesignFilesPanel";
import { setHtmlSourceSnapshot } from "../../src/components/html-source-snapshot-cache";
import type {
  ProjectFile,
  ProjectFileKind,
  ProjectFolder,
} from "../../src/types";
import { VISUAL_STABILITY_STORAGE_KEY } from "../../src/utils/visualStability";
import { workspaceContextFixture } from "../helpers/workspace-context";

function folder(path: string): ProjectFolder {
  return {
    name: path.split("/").pop() ?? path,
    path,
    type: "dir",
    size: 0,
    mtime: 1700000000,
  };
}

// Stub localStorage so the component's view-state persistence writes to an
// in-memory store. Cleared in beforeEach so no test bleeds state into the next.
const lsStore = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => lsStore.get(key) ?? null,
  setItem: (key: string, value: string) => {
    lsStore.set(key, value);
  },
  removeItem: (key: string) => {
    lsStore.delete(key);
  },
  clear: () => {
    lsStore.clear();
  },
});

beforeEach(() => {
  lsStore.clear();
});

function extForKind(kind: ProjectFileKind): string {
  if (kind === "html") return "html";
  if (kind === "image") return "png";
  if (kind === "sketch") return "sketch.json";
  if (kind === "text") return "txt";
  if (kind === "code") return "ts";
  if (kind === "pdf") return "pdf";
  return "bin";
}

function file(
  overrides: Partial<ProjectFile> & Pick<ProjectFile, "name">,
): ProjectFile {
  return {
    path: overrides.name,
    type: "file",
    size: 1024,
    mtime: Date.now(),
    kind: "html",
    mime: "text/html",
    ...overrides,
  };
}

function generateFiles(count: number): ProjectFile[] {
  const kinds: ProjectFileKind[] = [
    "html",
    "image",
    "sketch",
    "text",
    "code",
    "pdf",
  ];
  return Array.from({ length: count }, (_, i) => {
    const kind = kinds[i % kinds.length]!;
    return file({
      name: `file-${i + 1}.${extForKind(kind)}`,
      kind,
      size: 1024 * (i + 1),
      mtime: Date.now() - i * 60_000,
      mime: "text/plain",
    });
  });
}

function renderPanel(
  files: ProjectFile[],
  overrides: Partial<ComponentProps<typeof DesignFilesPanel>> = {},
) {
  const onOpenFile = vi.fn();
  const onDeleteFiles = vi.fn();
  const onClearUploadError = vi.fn();
  const result = render(
    <DesignFilesPanel
      projectId="test-project"
      projectKind="prototype"
      files={files}
      liveArtifacts={[]}
      onRefreshFiles={vi.fn()}
      onOpenFile={onOpenFile}
      onOpenLiveArtifact={vi.fn()}
      onRenameFile={vi.fn()}
      onDeleteFile={vi.fn()}
      onDeleteFiles={onDeleteFiles}
      onUpload={vi.fn()}
      onUploadFiles={vi.fn()}
      onPaste={vi.fn()}
      onNewSketch={vi.fn()}
      onClearUploadError={onClearUploadError}
      {...overrides}
    />,
  );
  return { ...result, onDeleteFiles, onOpenFile, onClearUploadError };
}

// The panel shows one group at a time behind the category tab bar; a tab only
// exists when its group has content at the current directory level.
function tabLabels(): string[] {
  return Array.from(document.querySelectorAll<HTMLElement>(".df-tab")).map(
    (el) => el.textContent ?? "",
  );
}

function clickTab(id: string) {
  fireEvent.click(screen.getByTestId(`design-files-tab-${id}`));
}

describe("DesignFilesPanel sections", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("does not show grouping, sort, filter, or pagination chrome", () => {
    renderPanel(generateFiles(60));

    expect(screen.queryByRole("group", { name: "Group by" })).toBeNull();
    expect(document.querySelector(".df-table")).toBeNull();
    expect(document.querySelector(".df-th-sortable")).toBeNull();
    expect(document.querySelector(".df-kind-filter")).toBeNull();
    expect(document.querySelector(".df-pagination")).toBeNull();
    expect(document.querySelector(".df-page-btn")).toBeNull();
  });

  it("renders a single-line toolbar with no up/refresh buttons, and no new-document/upload actions once files exist", () => {
    renderPanel([file({ name: "page.html", kind: "html" })]);

    expect(document.querySelector(".df-topbar")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Up" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Refresh" })).toBeNull();
    expect(document.querySelector(".df-up-btn")).toBeNull();
    expect(document.querySelector(".df-refresh-control")).toBeNull();
    // New-document / upload moved into the empty state only; see below.
    expect(screen.queryByTestId("design-files-upload-trigger")).toBeNull();
    expect(screen.queryByTestId("design-files-empty-new-document")).toBeNull();
  });

  it("shows prioritized project starter actions in the empty state", () => {
    const onNewSketch = vi.fn();
    const onOpenBrowser = vi.fn();
    const onCreateDesignSystem = vi.fn();
    const onPaste = vi.fn();
    const onUpload = vi.fn();

    renderPanel([], {
      onNewSketch,
      onOpenBrowser,
      onCreateDesignSystem,
      onPaste,
      onUpload,
    });

    fireEvent.click(screen.getByTestId("design-files-empty-new-sketch"));
    fireEvent.click(screen.getByTestId("design-files-empty-open-browser"));
    fireEvent.click(screen.getByTestId("design-files-empty-create-design-system"));
    fireEvent.click(screen.getByTestId("design-files-empty-new-document"));
    fireEvent.click(screen.getByTestId("design-files-upload-trigger"));

    expect(onNewSketch).toHaveBeenCalledTimes(1);
    expect(onOpenBrowser).toHaveBeenCalledTimes(1);
    expect(onCreateDesignSystem).toHaveBeenCalledTimes(1);
    expect(onPaste).toHaveBeenCalledTimes(1);
    expect(onUpload).toHaveBeenCalledTimes(1);
  });

  it("keeps empty-state actions visible but disables mutations for read-only shared viewers", () => {
    const onNewSketch = vi.fn();
    const onOpenBrowser = vi.fn();
    const onCreateDesignSystem = vi.fn();
    const onPaste = vi.fn();
    const onUpload = vi.fn();

    renderPanel([], {
      viewerOnly: true,
      onNewSketch,
      onOpenBrowser,
      onCreateDesignSystem,
      onPaste,
      onUpload,
    });

    const mutationButtons = [
      screen.getByTestId("design-files-empty-new-sketch"),
      screen.getByTestId("design-files-empty-new-document"),
      screen.getByTestId("design-files-upload-trigger"),
      screen.getByTestId("design-files-empty-create-design-system"),
    ];
    for (const button of mutationButtons) {
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute(
        "title",
        "Shared project is read-only: you can comment, but cannot edit or export.",
      );
      fireEvent.click(button);
    }

    expect(onNewSketch).not.toHaveBeenCalled();
    expect(onCreateDesignSystem).not.toHaveBeenCalled();
    expect(onPaste).not.toHaveBeenCalled();
    expect(onUpload).not.toHaveBeenCalled();

    const openBrowser = screen.getByTestId("design-files-empty-open-browser");
    expect(openBrowser).not.toBeDisabled();
    fireEvent.click(openBrowser);
    expect(onOpenBrowser).toHaveBeenCalledTimes(1);
  });

  it("groups files into category tabs and shows one group at a time", () => {
    renderPanel([
      file({ name: "page.html", kind: "html", mime: "text/html" }),
      file({ name: "chart.png", kind: "image", mime: "image/png" }),
    ]);

    const labels = tabLabels();
    expect(labels.some((text) => text.includes("Pages"))).toBe(true);
    expect(labels.some((text) => text.includes("Images"))).toBe(true);
    // Pages is the default tab; other groups render after picking their tab.
    expect(screen.getByTestId("design-file-row-page.html")).toBeTruthy();
    expect(screen.queryByTestId("design-file-row-chart.png")).toBeNull();
    clickTab("cat:image");
    expect(screen.getByTestId("design-file-row-chart.png")).toBeTruthy();
    expect(screen.queryByTestId("design-file-row-page.html")).toBeNull();
  });

  it("splits stylesheets into their own tab with a Stylesheet subtitle", () => {
    renderPanel([
      file({ name: "styles.css", kind: "code", mime: "text/css" }),
      file({ name: "app.ts", kind: "code", mime: "text/typescript" }),
    ]);

    const labels = tabLabels();
    expect(labels.some((text) => text.includes("Stylesheets"))).toBe(true);
    expect(labels.some((text) => text.includes("Scripts"))).toBe(true);

    clickTab("cat:stylesheet");
    const cssRow = screen.getByTestId("design-file-row-styles.css");
    expect(cssRow.querySelector(".df-row-sub")?.textContent).toBe("Stylesheet");
    clickTab("cat:code");
    const tsRow = screen.getByTestId("design-file-row-app.ts");
    expect(tsRow.querySelector(".df-row-sub")?.textContent).toBe("Script");
  });

  it('shows the file size beside the modified time while preserving the type subtitle', () => {
    // Images now render as bare masonry cards without a meta strip, so the
    // list-row size/subtitle contract is asserted on a stylesheet file, which
    // still renders as a compact row.
    renderPanel([
      file({ name: 'styles.css', kind: 'code', mime: 'text/css', size: 4096 }),
    ]);

    const row = screen.getByTestId('design-file-row-styles.css');
    expect(row.querySelector('.df-row-sub')?.textContent).toBe('Stylesheet');
    expect(row.querySelector('.df-row-size')?.textContent).toBe('4.0 KB');
  });

  // #5517 removed the always-on footer drop-hint strip and its rotating
  // useful-info tip; drag & drop still works via the df-drop-overlay, which
  // the drag-and-drop suite above covers.
  it("renders no footer info strip", () => {
    renderPanel([file({ name: "page.html", kind: "html" })]);

    expect(document.querySelector(".df-footer-info")).toBeNull();
    expect(document.querySelector(".df-drop-hint")).toBeNull();
  });
});

describe("DesignFilesPanel large list", () => {
  afterEach(() => cleanup());

  it("renders every entry of the active tab at once (no pagination)", () => {
    const { container } = renderPanel(generateFiles(500));
    // 500 files cycle through 6 kinds; the default Pages tab holds the
    // ⌈500/6⌉ = 84 html files, all rendered as page cards without pagination.
    expect(container.querySelectorAll(".df-card-grid .df-card").length).toBe(84);
    expect(document.querySelector(".df-pagination")).toBeNull();
  });

  it("renders 500 files within a reasonable time", () => {
    const files = generateFiles(500);
    const start = performance.now();
    renderPanel(files);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(2000);
  });
});

describe("DesignFilesPanel selection", () => {
  afterEach(() => cleanup());

  it("shows the batch bar and passes every selected file to batch delete", () => {
    const files = generateFiles(3);
    const { container, onDeleteFiles } = renderPanel(files);

    // Selection spans category tabs: pick one file on the default Pages tab
    // and a second one behind the Images tab. Both categories render as cards
    // with the floating check chip.
    fireEvent.click(
      screen
        .getByTestId("design-file-row-file-1.html")
        .querySelector(".df-card-check")!,
    );
    clickTab("cat:image");
    fireEvent.click(
      screen
        .getByTestId("design-file-row-file-2.png")
        .querySelector(".df-card-check")!,
    );

    expect(
      container.querySelector('[data-testid="design-files-batch-bar"]'),
    ).toBeTruthy();

    fireEvent.click(
      container.querySelector('[data-testid="design-files-batch-delete"]')!,
    );
    expect(onDeleteFiles).toHaveBeenCalledTimes(1);
    expect(onDeleteFiles).toHaveBeenCalledWith(["file-1.html", "file-2.png"]);
  });

  it("sends the project-pinned Workspace identity on batch archive download", async () => {
    const workspaceContext = workspaceContextFixture({
      workspaceId: "workspace-a",
      workspaceMemberId: "member-a",
    });
    const fetchMock = vi.fn<typeof fetch>(async () =>
      new Response("zip", {
        status: 200,
        headers: {
          "content-type": "application/zip",
          "content-disposition": 'attachment; filename="project.zip"',
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:test"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    const files = [file({ name: "page.html", kind: "html" })];
    const { container } = render(
      <CollabProvider
        value={{
          workspaceContext,
          workspaceContextLoading: false,
          enabled: true,
          member: null,
          present: [],
          publishedVersion: null,
          syncState: null,
          viewerOnly: false,
          writerAuthority: 'allowed',
          isOwner: true,
          isEffectiveOwner: true,
          isSharedNonOwner: false,
          ownerDisplayName: null,
          ownerRole: null,
          downloadPending: false,
          reportChange: vi.fn(),
          requestPublish: vi.fn(),
          refreshPresence: vi.fn(),
          checkStatusNow: vi.fn(),
        }}
      >
        <DesignFilesPanel
          projectId="test-project"
          projectKind="prototype"
          files={files}
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
        />
      </CollabProvider>,
    );

    fireEvent.click(
      screen
        .getByTestId("design-file-row-page.html")
        .querySelector(".df-card-check")!,
    );
    fireEvent.click(
      container.querySelector('[data-testid="design-files-batch-bar"] button')!,
    );

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([input]) =>
          String(input).endsWith("/archive/batch"),
        ),
      ).toBe(true);
    });
    const archiveCall = fetchMock.mock.calls.find(([input]) =>
      String(input).endsWith("/archive/batch"),
    );
    expect(archiveCall).toBeTruthy();
    const [, init] = archiveCall!;
    const headers = new Headers(init?.headers);
    expect(headers.get("x-od-workspace-id")).toBe("workspace-a");
    expect(headers.get("x-od-workspace-member-id")).toBe("member-a");
  });

  it("does not open files from card controls", () => {
    const files = generateFiles(1);
    const { container, onOpenFile } = renderPanel(files);
    const card = container.querySelector(".df-card")!;

    fireEvent.click(card.querySelector(".df-card-check")!);
    expect(onOpenFile).not.toHaveBeenCalled();

    fireEvent.click(card.querySelector(".df-row-menu")!);
    expect(onOpenFile).not.toHaveBeenCalled();
  });

  it("copies the local file path from the row menu", async () => {
    const originalClipboard = Object.getOwnPropertyDescriptor(
      navigator,
      "clipboard",
    );
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    try {
      const { container } = renderPanel([
        file({
          name: "alpha.html",
          localPath: "/tmp/open-design/projects/test-project/alpha.html",
        }),
      ]);

      fireEvent.click(screen.getByTestId("design-file-menu-alpha.html"));
      fireEvent.click(
        screen.getByRole("button", { name: "Copy local file path" }),
      );

      await waitFor(() => {
        expect(writeText).toHaveBeenCalledWith(
          "/tmp/open-design/projects/test-project/alpha.html",
        );
      });
      // The panel has no detail pane — copying a path never opens one.
      expect(container.querySelector(".df-preview")).toBeNull();
    } finally {
      if (originalClipboard) {
        Object.defineProperty(navigator, "clipboard", originalClipboard);
      } else {
        Reflect.deleteProperty(navigator, "clipboard");
      }
    }
  });

  // #5517 contract: the card grid IS the preview surface, so one click on the
  // thumb opens the page in a workspace tab. There is no detail pane and no
  // double-click step.
  it("opens the file from a single click on the card thumb", () => {
    const files = generateFiles(1);
    const { container, onOpenFile } = renderPanel(files);
    const card = container.querySelector(".df-card")!;

    fireEvent.click(card.querySelector(".df-card-thumb")!);
    expect(onOpenFile).toHaveBeenCalledWith("file-1.html");
    expect(container.querySelector(".df-preview")).toBeNull();
  });

  it("opens the image from a single click on its masonry card", () => {
    const { container, onOpenFile } = renderPanel([
      file({ name: "shot.png", kind: "image", mime: "image/png" }),
    ]);
    clickTab("cat:image");

    fireEvent.click(container.querySelector(".df-card--image .df-card-thumb")!);
    expect(onOpenFile).toHaveBeenCalledWith("shot.png");
    expect(container.querySelector(".df-preview")).toBeNull();
  });

  it("reserves a full thumbnail skeleton until masonry image bytes load", () => {
    const { container } = renderPanel([
      file({ name: "slow-shot.png", kind: "image", mime: "image/png" }),
    ]);
    clickTab("cat:image");

    const thumb = container.querySelector<HTMLButtonElement>(
      ".df-card--image .df-card-thumb",
    );
    const image = thumb?.querySelector<HTMLImageElement>("img");
    expect(thumb?.dataset.imageStatus).toBe("loading");
    expect(thumb?.querySelector(".df-image-skeleton")).toBeTruthy();

    fireEvent.load(image!);
    expect(thumb?.dataset.imageStatus).toBe("loaded");
    expect(thumb?.querySelector(".df-image-skeleton")).toBeNull();
  });

  it("opens the file from a single click on a list row's name", () => {
    const { container, onOpenFile } = renderPanel([
      file({ name: "notes.txt", kind: "text", mime: "text/plain" }),
    ]);

    fireEvent.click(container.querySelector(".df-file-row .df-row-name-btn")!);
    expect(onOpenFile).toHaveBeenCalledWith("notes.txt");
    expect(container.querySelector(".df-preview")).toBeNull();
  });

  // The card's name button is the inline-rename entry point for editors, and
  // stays a plain open target for read-only viewers (who have no rename path).
  it("starts an inline rename from the card name for editors", () => {
    const files = generateFiles(1);
    const { container, onOpenFile } = renderPanel(files);

    fireEvent.click(container.querySelector(".df-card-name-btn")!);
    expect(container.querySelector(".df-rename-input")).toBeTruthy();
    expect(onOpenFile).not.toHaveBeenCalled();
  });

  it("opens instead of renaming from the card name for read-only viewers", () => {
    const files = generateFiles(1);
    const { container, onOpenFile } = renderPanel(files, { viewerOnly: true });

    fireEvent.click(container.querySelector(".df-card-name-btn")!);
    expect(container.querySelector(".df-rename-input")).toBeNull();
    expect(onOpenFile).toHaveBeenCalledWith("file-1.html");
  });
});

describe("DesignFilesPanel page thumbnails", () => {
  afterEach(() => cleanup());

  it("does not fetch or iframe large HTML files for the Design Files thumbnail", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { container } = renderPanel([
      file({
        name: "large.html",
        kind: "html",
        mime: "text/html",
        size: 2 * 1024 * 1024,
      }),
    ]);

    expect(fetchMock).not.toHaveBeenCalled();
    // Over the inline cap the card thumb never URL-loads the iframe; it falls
    // back to the glyph placeholder.
    expect(container.querySelector(".df-card-thumb iframe")).toBeNull();
    expect(container.querySelector(".df-preview-placeholder")?.textContent).toContain("⟨⟩");
  });

  it("builds small HTML thumbnails asynchronously without URL-loading the iframe first", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response("<!doctype html><html><body><main>Small</main></body></html>", {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { container } = renderPanel([
      file({
        name: "small.html",
        kind: "html",
        mime: "text/html",
        size: 16 * 1024,
        mtime: 1700000000000,
      }),
    ]);

    await waitFor(() => {
      const iframe = container.querySelector<HTMLIFrameElement>(".df-card-thumb iframe");
      expect(iframe).toBeTruthy();
      expect(iframe?.getAttribute("src")).toBeNull();
      expect(iframe?.getAttribute("srcdoc") ?? iframe?.srcdoc ?? "").toContain("Small");
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/test-project/raw/small.html?v=1700000000000",
      expect.any(Object),
    );
  });

  it("reuses an exact-version HTML thumbnail source across panel remounts", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response("<!doctype html><html><body><main>Cached</main></body></html>", {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const cachedFile = file({
      name: "cached.html",
      kind: "html",
      mime: "text/html",
      size: 16 * 1024,
      mtime: 1700000000000,
    });

    const first = renderPanel([cachedFile]);
    await waitFor(() => {
      expect(first.container.querySelector(".df-card-thumb iframe")).toBeTruthy();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    first.unmount();

    const second = renderPanel([cachedFile]);
    await waitFor(() => {
      expect(second.container.querySelector(".df-card-thumb iframe")).toBeTruthy();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    second.unmount();

    const changed = renderPanel([{ ...cachedFile, mtime: cachedFile.mtime + 1 }]);
    await waitFor(() => {
      expect(changed.container.querySelector(".df-card-thumb iframe")).toBeTruthy();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("builds the current file thumbnail from the exact viewer source snapshot", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const currentFile = file({
      name: "current.html",
      kind: "html",
      mime: "text/html",
      size: 16 * 1024,
      mtime: 1700000000000,
    });
    setHtmlSourceSnapshot({
      authorizationScopeKey: "local",
      projectId: "test-project",
      fileName: currentFile.name,
      refreshKey: `${currentFile.mtime}:${currentFile.size}:7`,
      source: "<!doctype html><html><body><main>Already loaded</main></body></html>",
    });

    const { container } = renderPanel([currentFile], { filesRefreshKey: 7 });

    await waitFor(() => {
      const iframe = container.querySelector<HTMLIFrameElement>(".df-card-thumb iframe");
      expect(iframe?.getAttribute("srcdoc") ?? iframe?.srcdoc ?? "")
        .toContain("Already loaded");
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("mounts a cached HTML thumbnail with the desktop layout viewport on its first render", () => {
    const cachedFile = file({
      name: "deck.html",
      kind: "html",
      mime: "text/html",
      size: 16 * 1024,
      mtime: 1700000000001,
    });
    setHtmlSourceSnapshot({
      authorizationScopeKey: "local",
      projectId: "test-project",
      fileName: cachedFile.name,
      refreshKey: `${cachedFile.mtime}:${cachedFile.size}:8`,
      source: "<!doctype html><html><body><main>Deck</main></body></html>",
    });

    const { container } = renderPanel([cachedFile], { filesRefreshKey: 8 });
    const iframe = container.querySelector<HTMLIFrameElement>(".df-card-thumb iframe");

    expect(iframe).toBeTruthy();
    expect(iframe?.style.width).toBe("1200px");
    expect(iframe?.style.height).toBe("675px");
  });
});

describe("DesignFilesPanel directory navigation", () => {
  afterEach(() => {
    cleanup();
  });

  it("collapses nested files into a single folder row at root with correct descendant count", () => {
    renderPanel([
      file({ name: "assets/logo.png", kind: "image" }),
      file({ name: "assets/icons/star.svg", kind: "image" }),
    ]);

    const dirRows = document.querySelectorAll(".df-dir-row");
    expect(dirRows.length).toBe(1);
    expect(dirRows[0]!.textContent).toContain("assets");
    expect(dirRows[0]!.textContent).toContain("2");
  });

  it("pins folders behind a Folders tab", () => {
    renderPanel([
      file({ name: "assets/logo.png", kind: "image" }),
      file({ name: "top.html", kind: "html" }),
    ]);

    expect(tabLabels().some((text) => text.includes("Folders"))).toBe(true);
    clickTab("folders");
    expect(document.querySelectorAll(".df-dir-row").length).toBe(1);
  });

  it("clicking a folder row navigates into it and shows only basenames and nested dirs", () => {
    // Text files keep the list-row shell (images are bare masonry cards with
    // no visible name), so the basename contract is asserted on rows.
    renderPanel([
      file({ name: "assets/notes.txt", kind: "text", mime: "text/plain" }),
      file({ name: "assets/icons/readme.txt", kind: "text", mime: "text/plain" }),
    ]);

    fireEvent.click(document.querySelector(".df-dir-row .df-row-name-btn")!);

    expect(document.querySelector(".df-breadcrumbs")).toBeTruthy();
    expect(document.querySelector(".df-breadcrumb-current")?.textContent).toBe(
      "assets",
    );

    // No pages at this level, so the Folders tab is the default view.
    const dirRows = document.querySelectorAll(".df-dir-row");
    expect(dirRows.length).toBe(1);
    expect(dirRows[0]!.textContent).toContain("icons");

    clickTab("cat:text");
    const fileRow = screen.getByTestId("design-file-row-assets/notes.txt");
    expect(fileRow.querySelector(".df-row-name")?.textContent).toBe("notes.txt");
    expect(fileRow.querySelector(".df-row-name")?.textContent).not.toContain(
      "assets/",
    );
  });

  it("always renders the root breadcrumb on the default-root view", () => {
    // Regression: managed-storage projects have currentDir==='' and no
    // rootDirName, which previously collapsed the whole breadcrumb nav to null
    // and left the toolbar blank on the left for the most common path. The root
    // crumb must always render, falling back to the t('designFiles.crumbs')
    // label when no rootDirName exists.
    renderPanel([file({ name: "top.html", kind: "html" })]);

    expect(document.querySelector(".df-breadcrumbs")).toBeTruthy();
    expect(document.querySelector(".df-breadcrumb-current")?.textContent).toBe(
      "Project",
    );
  });

  it("shows rootDirName as the root breadcrumb when one is provided", () => {
    renderPanel([file({ name: "top.html", kind: "html" })], {
      rootDirName: "my-folder",
    });

    expect(document.querySelector(".df-breadcrumb-current")?.textContent).toBe(
      "my-folder",
    );
  });

  it("clicking the root breadcrumb navigates back to root", () => {
    renderPanel([
      file({ name: "assets/logo.png", kind: "image" }),
      file({ name: "top.html", kind: "html" }),
    ]);

    clickTab("folders");
    fireEvent.click(document.querySelector(".df-dir-row .df-row-name-btn")!);
    expect(document.querySelector(".df-breadcrumbs")).toBeTruthy();

    fireEvent.click(document.querySelector(".df-breadcrumb-btn")!);

    expect(
      document.querySelector(".df-breadcrumb-current")?.textContent,
    ).not.toBe("assets");
    // Back at the root, the tab choice resets to the default Pages tab.
    expect(screen.getByTestId("design-file-row-top.html")).toBeTruthy();
    clickTab("folders");
    expect(document.querySelectorAll(".df-dir-row").length).toBe(1);
  });

  it("includes subdirectory files in the flat root-level list", () => {
    renderPanel([
      file({ name: "assets/logo.png", kind: "image" }),
      file({ name: "top.html", kind: "html" }),
    ]);

    expect(screen.getByTestId("design-file-row-top.html")).toBeTruthy();
    // The nested image is part of the root-level Images group.
    clickTab("cat:image");
    expect(screen.getByTestId("design-file-row-assets/logo.png")).toBeTruthy();
    clickTab("folders");
    expect(document.querySelectorAll(".df-dir-row").length).toBe(1);
  });

  it("preserves the current directory when remounted with navState from a previous render", () => {
    let saved: DesignFilesNavState | undefined;

    function makePanel(nav?: DesignFilesNavState) {
      return (
        <DesignFilesPanel
          projectId="test-project"
          projectKind="prototype"
          files={[
            file({ name: "assets/logo.png", kind: "image" }),
            file({ name: "top.html", kind: "html" }),
          ]}
          liveArtifacts={[]}
          navState={nav}
          onNavStateChange={(state) => {
            saved = state;
          }}
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
        />
      );
    }

    const { unmount } = render(makePanel());

    fireEvent.click(screen.getByTestId("design-files-tab-folders"));
    fireEvent.click(document.querySelector(".df-dir-row .df-row-name-btn")!);
    expect(document.querySelector(".df-breadcrumb-current")?.textContent).toBe(
      "assets",
    );

    unmount();
    render(makePanel(saved));

    expect(document.querySelector(".df-breadcrumb-current")?.textContent).toBe(
      "assets",
    );
    expect(screen.getByTestId("design-file-row-assets/logo.png")).toBeTruthy();
  });

  it("navigates up one level via the parent breadcrumb", () => {
    renderPanel([file({ name: "assets/icons/star.svg", kind: "image" })]);

    fireEvent.click(document.querySelector(".df-dir-row .df-row-name-btn")!);
    fireEvent.click(document.querySelector(".df-dir-row .df-row-name-btn")!);
    expect(document.querySelector(".df-breadcrumb-current")?.textContent).toBe(
      "icons",
    );

    const crumbs = Array.from(document.querySelectorAll(".df-breadcrumb-btn"));
    fireEvent.click(crumbs[crumbs.length - 1]!);
    expect(document.querySelector(".df-breadcrumb-current")?.textContent).toBe(
      "assets",
    );
  });

  it("clears selection when navigating into or out of a directory", () => {
    renderPanel([
      file({ name: "assets/logo.png", kind: "image" }),
      file({ name: "top.html", kind: "html" }),
    ]);

    const topCard = screen.getByTestId("design-file-row-top.html");
    fireEvent.click(topCard.querySelector(".df-card-check")!);
    expect(topCard.classList.contains("selected")).toBe(true);

    clickTab("folders");
    fireEvent.click(document.querySelector(".df-dir-row .df-row-name-btn")!);
    expect(
      document.querySelectorAll(".df-file-row.selected, .df-card.selected").length,
    ).toBe(0);

    fireEvent.click(document.querySelector(".df-breadcrumb-btn")!);
    expect(
      document.querySelectorAll(".df-file-row.selected, .df-card.selected").length,
    ).toBe(0);
  });

  it("resets currentDir automatically when all files in the current subdirectory are removed", () => {
    function makePanel(files: ProjectFile[]) {
      return (
        <DesignFilesPanel
          projectId="test-project"
          projectKind="prototype"
          files={files}
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
        />
      );
    }

    const { rerender } = render(
      makePanel([
        file({ name: "assets/logo.png", kind: "image" }),
        file({ name: "top.html", kind: "html" }),
      ]),
    );

    fireEvent.click(screen.getByTestId("design-files-tab-folders"));
    fireEvent.click(document.querySelector(".df-dir-row .df-row-name-btn")!);
    expect(document.querySelector(".df-breadcrumb-current")?.textContent).toBe(
      "assets",
    );

    rerender(makePanel([file({ name: "top.html", kind: "html" })]));

    expect(
      document.querySelector(".df-breadcrumb-current")?.textContent,
    ).not.toBe("assets");
    expect(screen.getByTestId("design-file-row-top.html")).toBeTruthy();
  });
});

describe("DesignFilesPanel current-directory sync", () => {
  afterEach(() => cleanup());

  it("reports the active folder so new files are created under it, not the root", () => {
    const onCurrentDirChange = vi.fn();
    renderPanel(
      [
        file({ name: "top.html", kind: "html" }),
        file({ name: "assets/logo.png", kind: "image" }),
      ],
      { onCurrentDirChange },
    );
    // Mounts at the root.
    expect(onCurrentDirChange).toHaveBeenLastCalledWith("");
    // Navigate into the folder — the parent must learn the new target dir, or
    // upload / paste / new-sketch would create at the project root (#3358 regression).
    clickTab("folders");
    fireEvent.click(document.querySelector(".df-dir-row .df-row-name-btn")!);
    expect(onCurrentDirChange).toHaveBeenLastCalledWith("assets");
  });
});

describe("DesignFilesPanel persisted (empty) folders", () => {
  afterEach(() => cleanup());

  it("shows an empty persisted folder that has no files under it", () => {
    // Only a root file + an empty persisted folder; the folder must still
    // appear (it would vanish if we derived dirs from file paths alone).
    renderPanel([file({ name: "top.html", kind: "html" })], {
      folders: [folder("assets")],
    });
    clickTab("folders");
    const dirRows = [...document.querySelectorAll(".df-dir-row")];
    expect(dirRows.some((r) => r.textContent?.includes("assets"))).toBe(true);
  });

  it("surfaces a nested empty persisted folder after navigating into its parent", () => {
    renderPanel([], { folders: [folder("assets"), folder("assets/icons")] });
    // Zero files, but the persisted folder still renders the tree (not the
    // empty state), so 'assets' is navigable at the root.
    const rootDirs = [
      ...document.querySelectorAll(".df-dir-row .df-row-name"),
    ].map((e) => e.textContent);
    expect(rootDirs).toContain("assets");
    fireEvent.click(document.querySelector(".df-dir-row .df-row-name-btn")!);
    const nestedDirs = [
      ...document.querySelectorAll(".df-dir-row .df-row-name"),
    ].map((e) => e.textContent);
    expect(nestedDirs).toContain("icons");
  });
});

// A non-owner member's local mirror trailing the published head
// (`downloadPending`, see useProjectCollab) can still have a complete older
// materialization. Keep that useful content visible while the project-level
// sync badge communicates that a newer version is arriving. Only the
// no-local-content case should replace the empty state with a loading surface.
describe("DesignFilesPanel pending sync (downloadPending)", () => {
  afterEach(() => cleanup());

  it("keeps an existing non-html file visible and openable while a newer version downloads", () => {
    const { onOpenFile } = renderPanel(
      [file({ name: "notes.txt", kind: "text", mime: "text/plain" })],
      { downloadPending: true },
    );

    const row = screen.getByTestId("design-file-row-notes.txt");
    expect(row.className).not.toContain("df-row-pending");
    expect(row.querySelector(".df-row-name")?.textContent).toBe("notes.txt");
    expect(row.querySelector(".skeleton-block")).toBeNull();

    fireEvent.click(row.querySelector(".df-row-name-btn")!);
    expect(onOpenFile).toHaveBeenCalledWith("notes.txt");
  });

  it("keeps an existing HTML page card visible and openable while a newer version downloads", () => {
    const { onOpenFile } = renderPanel(
      [file({ name: "page.html", kind: "html", mime: "text/html" })],
      { downloadPending: true },
    );

    const card = screen.getByTestId("design-file-row-page.html");
    expect(card.className).not.toContain("df-card-pending");
    expect(card.textContent).toContain("page.html");
    const openButton = card.querySelector<HTMLButtonElement>(".df-card-thumb");
    expect(openButton).toBeTruthy();
    fireEvent.click(openButton!);
    expect(onOpenFile).toHaveBeenCalledWith("page.html");
  });

  it("keeps an existing image card visible and openable while a newer version downloads", () => {
    const { onOpenFile } = renderPanel(
      [file({ name: "photo.png", kind: "image", mime: "image/png" })],
      { downloadPending: true },
    );

    const card = screen.getByTestId("design-file-row-photo.png");
    expect(card.className).not.toContain("df-card-pending");
    expect(card.className).toContain("df-card--image");
    const openButton = card.querySelector<HTMLButtonElement>(".df-card-thumb");
    expect(openButton).toBeTruthy();
    fireEvent.click(openButton!);
    expect(onOpenFile).toHaveBeenCalledWith("photo.png");
  });

  it("still reports the correct per-category file counts in the tab bar while pending", () => {
    renderPanel(
      [
        file({ name: "a.txt", kind: "text", mime: "text/plain" }),
        file({ name: "b.txt", kind: "text", mime: "text/plain" }),
      ],
      { downloadPending: true },
    );
    expect(tabLabels().join(" ")).toContain("2");
  });

  it("uses the syncing empty state only when no local content is available", () => {
    renderPanel([], { downloadPending: true, viewerOnly: true });

    expect(screen.getByTestId("design-files-syncing")).toBeTruthy();
    expect(screen.queryByTestId("design-files-empty")).toBeNull();
  });

  it("replaces the retained materialization directly when the pull completes", () => {
    const commonProps = {
      projectId: "test-project",
      projectKind: "prototype" as const,
      liveArtifacts: [],
      onRefreshFiles: vi.fn(),
      onOpenFile: vi.fn(),
      onOpenLiveArtifact: vi.fn(),
      onRenameFile: vi.fn(),
      onDeleteFile: vi.fn(),
      onDeleteFiles: vi.fn(),
      onUpload: vi.fn(),
      onUploadFiles: vi.fn(),
      onPaste: vi.fn(),
      onNewSketch: vi.fn(),
      viewerOnly: true,
    };
    const { rerender } = render(
      <DesignFilesPanel
        {...commonProps}
        files={[file({ name: "version-one.txt", kind: "text", mime: "text/plain" })]}
        downloadPending
      />,
    );
    expect(screen.getByText("version-one.txt")).toBeTruthy();
    expect(document.querySelector(".skeleton-block")).toBeNull();

    rerender(
      <DesignFilesPanel
        {...commonProps}
        files={[file({ name: "version-two.txt", kind: "text", mime: "text/plain" })]}
        downloadPending={false}
      />,
    );
    expect(screen.queryByText("version-one.txt")).toBeNull();
    expect(screen.getByText("version-two.txt")).toBeTruthy();
    expect(document.querySelector(".skeleton-block")).toBeNull();
  });
});
