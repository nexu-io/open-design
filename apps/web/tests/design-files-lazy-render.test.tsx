// @vitest-environment jsdom

// Regression suite for the 0.18.0 client meltdown: a 7442-file web-clone
// project rendered EVERY nested HTML file as a thumbnail card at the project
// root, and every card fetched its content on mount. 4000+ concurrent
// fetches exhausted local sockets (net::ERR_INSUFFICIENT_RESOURCES) and
// 502'd the web<->daemon proxy. The contract under test:
//   1. thumbnail content fetches start only once a card nears the viewport;
//   2. at most 6 thumbnail fetches are in flight at once (FIFO queue);
//      unmount drops queued tasks, but a slot whose request already started
//      stays held until the request settles — real network concurrency must
//      never exceed the cap, even across unmount/remount navigation churn;
//   3. file cards, file rows, and folder rows render incrementally behind an
//      invisible sentinel, without changing category counts;
//   4. the root directory still lists every nested file (semantics guard).
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";

import { DesignFilesPanel } from "../src/components/DesignFilesPanel";
import { resetHtmlThumbnailSourceCache } from "../src/components/html-thumbnail-source-cache";
import type { ProjectFile } from "../src/types";

// Stub localStorage with an in-memory store so no test bleeds view state into
// the next (same convention as tests/components/DesignFilesPanel.test.tsx).
const lsStore = new Map<string, string>();

// Manually triggerable IntersectionObserver stand-in. jsdom ships no
// IntersectionObserver, and the component treats that as "everything is
// immediately visible" — so lazy behavior can only be asserted by installing
// a fake whose intersections the test fires explicitly.
type IntersectionCallback = (
  entries: IntersectionObserverEntry[],
  observer: IntersectionObserver,
) => void;

class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];

  static reset(): void {
    FakeIntersectionObserver.instances = [];
  }

  readonly observed = new Set<Element>();

  constructor(
    readonly callback: IntersectionCallback,
    readonly options?: IntersectionObserverInit,
  ) {
    FakeIntersectionObserver.instances.push(this);
  }

  observe(target: Element): void {
    this.observed.add(target);
  }

  unobserve(target: Element): void {
    this.observed.delete(target);
  }

  disconnect(): void {
    this.observed.clear();
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

function fireIntersection(target: Element): void {
  for (const instance of [...FakeIntersectionObserver.instances]) {
    if (!instance.observed.has(target)) continue;
    instance.callback(
      [{ isIntersecting: true, target } as unknown as IntersectionObserverEntry],
      instance as unknown as IntersectionObserver,
    );
  }
}

/** Fire intersection for every element currently matching `selector`. */
function intersectAll(selector: string): void {
  act(() => {
    for (const el of Array.from(document.querySelectorAll(selector))) {
      fireIntersection(el);
    }
  });
}

/** Reveal grid batches until the sentinel disappears (list fully rendered). */
function drainGridSentinel(maxRounds = 30): void {
  for (let round = 0; round < maxRounds; round += 1) {
    const sentinel = screen.queryByTestId("design-files-grid-sentinel");
    if (!sentinel) return;
    act(() => fireIntersection(sentinel));
  }
  throw new Error("grid sentinel never drained");
}

const BASE_MTIME = 1700000000000;

function htmlFile(name: string, index: number): ProjectFile {
  return {
    name,
    path: name,
    type: "file",
    size: 4096,
    mtime: BASE_MTIME - index * 1000,
    kind: "html",
    mime: "text/html",
  };
}

/**
 * Nested pages shaped like the web-clone incident project: every file lives
 * several directories deep (`ja/plugins/p1/index.html`), none at the root.
 */
function nestedHtmlFiles(count: number, localeRoot = "ja"): ProjectFile[] {
  return Array.from({ length: count }, (_, i) =>
    htmlFile(`${localeRoot}/plugins/p${i + 1}/index.html`, i),
  );
}

function imageFile(name: string, index: number): ProjectFile {
  return {
    name,
    path: name,
    type: "file",
    size: 2048,
    mtime: BASE_MTIME - index * 1000,
    kind: "image",
    mime: "image/png",
  };
}

function renderPanel(
  files: ProjectFile[],
  overrides: Partial<ComponentProps<typeof DesignFilesPanel>> = {},
) {
  return render(
    <DesignFilesPanel
      projectId="lazy-render-project"
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
      {...overrides}
    />,
  );
}

/**
 * fetch stub whose responses stay pending until the test releases them.
 * Every release is also registered module-wide so afterEach can settle
 * whatever a test left pending: an in-flight request holds its pool slot
 * until it settles (slots are NOT freed by unmount), so an unsettled mock
 * fetch would leak its slot into the next test. Firing a release twice is
 * harmless — resolving an already-resolved promise is a no-op.
 */
const outstandingReleases: Array<() => void> = [];

function pendingFetchMock() {
  const releases: Array<() => void> = [];
  const fetchMock = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        const release = () =>
          resolve(
            new Response(
              "<!doctype html><html><body><main>page</main></body></html>",
              {
                status: 200,
                headers: { "Content-Type": "text/html; charset=utf-8" },
              },
            ),
          );
        releases.push(release);
        outstandingReleases.push(release);
      }),
  );
  return { fetchMock, releases };
}

beforeEach(() => {
  lsStore.clear();
  resetHtmlThumbnailSourceCache();
  FakeIntersectionObserver.reset();
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
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
});

afterEach(async () => {
  cleanup();
  // Settle every request the test left pending so retained slots return to
  // the pool before the next test starts (see pendingFetchMock docblock).
  await act(async () => {
    for (const release of outstandingReleases.splice(0)) release();
  });
  vi.unstubAllGlobals();
});

describe("DesignFilesPanel thumbnail fetch viewport gating", () => {
  it("fetches no thumbnail content on mount before any card nears the viewport", () => {
    const { fetchMock } = pendingFetchMock();
    vi.stubGlobal("fetch", fetchMock);

    renderPanel(nestedHtmlFiles(200));

    // The root view lists all 200 nested pages, but not a single content
    // fetch may start until a card actually intersects the viewport.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps at most 6 thumbnail fetches in flight and drains the FIFO queue as slots free up", async () => {
    const { fetchMock, releases } = pendingFetchMock();
    vi.stubGlobal("fetch", fetchMock);

    const { container } = renderPanel(nestedHtmlFiles(50));

    // Reveal every card: the initial batch plus the sentinel (which appends
    // the remaining cards), then the freshly appended cards' hosts.
    intersectAll("[data-testid='design-files-grid-sentinel'], .df-thumb-scale-host");
    intersectAll(".df-thumb-scale-host");
    expect(container.querySelectorAll(".df-card-grid .df-card").length).toBe(50);

    // 50 visible cards, none resolved yet: exactly 6 fetches in flight.
    expect(fetchMock).toHaveBeenCalledTimes(6);

    // Settling fetches returns their slots and starts queued cards, FIFO.
    await act(async () => {
      for (const release of releases.splice(0, 3)) release();
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(9));
  });

  it("keeps unmounted in-flight requests counted against the cap and drops their queued siblings", async () => {
    const { fetchMock, releases } = pendingFetchMock();
    vi.stubGlobal("fetch", fetchMock);

    const first = renderPanel(nestedHtmlFiles(10, "ja"));
    intersectAll(".df-thumb-scale-host");
    expect(fetchMock).toHaveBeenCalledTimes(6);

    // Unmounting with 6 fetches in flight and 4 queued must drop the queued
    // tasks without starting them. The 6 in-flight requests are still on the
    // network — cleanup must NOT free their slots early.
    first.unmount();
    expect(fetchMock).toHaveBeenCalledTimes(6);

    // A replacement grid mounts while the abandoned requests are still in
    // flight (the directory-switch scenario from the incident). Its cards
    // must queue behind them: releasing slots at unmount would start 6 new
    // fetches here and push real network concurrency to 12.
    const second = renderPanel(nestedHtmlFiles(10, "de"));
    intersectAll(".df-thumb-scale-host");
    expect(fetchMock).toHaveBeenCalledTimes(6);

    // Only as the abandoned requests actually settle do their slots return
    // and the queued replacement cards start, FIFO, still capped at 6.
    await act(async () => {
      for (const release of releases.splice(0, 6)) release();
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(12));

    // Settling the replacement wave starts the remaining 4 queued cards:
    // 6 abandoned + 10 replacement requests total, never more than 6 live.
    await act(async () => {
      for (const release of releases.splice(0, 6)) release();
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(16));
    second.unmount();
  });
});

describe("DesignFilesPanel incremental grid rendering", () => {
  it("renders at most 48 page cards initially for 500 files and grows on sentinel intersection", () => {
    const { fetchMock } = pendingFetchMock();
    vi.stubGlobal("fetch", fetchMock);

    const { container } = renderPanel(nestedHtmlFiles(500));

    expect(container.querySelectorAll(".df-card-grid .df-card").length).toBe(48);

    const sentinel = screen.getByTestId("design-files-grid-sentinel");
    act(() => fireIntersection(sentinel));
    expect(container.querySelectorAll(".df-card-grid .df-card").length).toBe(96);
  });

  it("renders the image masonry incrementally behind the same sentinel", () => {
    // Root-level names: with no folders and no pages, Images is the sole tab
    // and the masonry is the default view.
    const { container } = renderPanel(
      Array.from({ length: 120 }, (_, i) => imageFile(`img-${i + 1}.png`, i)),
    );

    expect(
      container.querySelectorAll(".df-image-masonry .df-card--image").length,
    ).toBe(48);

    const sentinel = screen.getByTestId("design-files-grid-sentinel");
    act(() => fireIntersection(sentinel));
    expect(
      container.querySelectorAll(".df-image-masonry .df-card--image").length,
    ).toBe(96);
  });

  it("adds no visible chrome: no load-more button and no loading copy", () => {
    const { fetchMock } = pendingFetchMock();
    vi.stubGlobal("fetch", fetchMock);

    const { container } = renderPanel(nestedHtmlFiles(500));

    const sentinel = screen.getByTestId("design-files-grid-sentinel");
    expect(sentinel.textContent).toBe("");
    // Every button inside the grid belongs to a card, not to pagination.
    const grid = container.querySelector(".df-card-grid")!;
    for (const button of Array.from(grid.querySelectorAll("button"))) {
      expect(button.closest(".df-card")).not.toBeNull();
    }
  });
});

describe("DesignFilesPanel incremental row rendering", () => {
  it("reveals folders and text files in batches while keeping the full category counts", () => {
    const files: ProjectFile[] = Array.from({ length: 120 }, (_, index) => {
      const name = `folder-${String(index).padStart(3, "0")}/notes.txt`;
      return { ...htmlFile(name, index), kind: "text", mime: "text/plain" };
    });
    const { container } = renderPanel(files);

    expect(screen.getByTestId("design-files-tab-folders").textContent).toContain("120");
    expect(container.querySelectorAll(".df-dir-row")).toHaveLength(48);
    act(() => fireIntersection(screen.getByTestId("design-files-grid-sentinel")));
    expect(container.querySelectorAll(".df-dir-row")).toHaveLength(96);

    const textTab = screen.getByTestId("design-files-tab-cat:text");
    expect(textTab.textContent).toContain("120");
    fireEvent.click(textTab);
    expect(container.querySelectorAll(".df-file-row")).toHaveLength(48);
    expect(screen.queryByTestId("design-file-row-folder-119/notes.txt")).toBeNull();

    drainGridSentinel();
    expect(container.querySelectorAll(".df-file-row")).toHaveLength(120);
    expect(screen.getByTestId("design-file-row-folder-119/notes.txt")).toBeTruthy();
  });

  it("ignores a queued observation from the category the user left", () => {
    const files: ProjectFile[] = Array.from({ length: 120 }, (_, index) => ({
      ...htmlFile(`folder-${String(index).padStart(3, "0")}/notes.txt`, index),
      kind: "text",
      mime: "text/plain",
    }));
    const { container } = renderPanel(files);
    const previousSentinel = screen.getByTestId("design-files-grid-sentinel");
    const previousObserver = FakeIntersectionObserver.instances.find((observer) =>
      observer.observed.has(previousSentinel),
    )!;

    fireEvent.click(screen.getByTestId("design-files-tab-cat:text"));
    expect(previousObserver.observed.has(previousSentinel)).toBe(false);
    // The browser may already have queued the entry before disconnect().
    act(() => previousObserver.callback(
      [{ isIntersecting: true, target: previousSentinel } as unknown as IntersectionObserverEntry],
      previousObserver as unknown as IntersectionObserver,
    ));

    expect(container.querySelectorAll(".df-file-row")).toHaveLength(48);
    act(() => fireIntersection(screen.getByTestId("design-files-grid-sentinel")));
    expect(container.querySelectorAll(".df-file-row")).toHaveLength(96);
  });

  it("does not prepare distant rows when switching from a deeply scrolled category", () => {
    const readDistantFileSize = vi.fn(() => 4096);
    const textFiles: ProjectFile[] = Array.from({ length: 192 }, (_, index) => ({
      ...htmlFile(`notes-${index}.txt`, index), kind: "text", mime: "text/plain",
    }));
    const codeFiles: ProjectFile[] = Array.from({ length: 192 }, (_, index) => ({
      ...htmlFile(`script-${index}.js`, index), kind: "code", mime: "text/javascript",
    }));
    // A row reads its size while generating its content, even if React then
    // discards that render. Counting committed DOM rows alone misses that work.
    Object.defineProperty(codeFiles[144]!, "size", { get: readDistantFileSize });

    const { container } = renderPanel([...textFiles, ...codeFiles]);
    fireEvent.click(screen.getByTestId("design-files-tab-cat:text"));
    drainGridSentinel();
    expect(container.querySelectorAll(".df-file-row")).toHaveLength(192);
    readDistantFileSize.mockClear();

    fireEvent.click(screen.getByTestId("design-files-tab-cat:code"));
    expect(container.querySelectorAll(".df-file-row")).toHaveLength(48);
    expect(readDistantFileSize).not.toHaveBeenCalled();
    drainGridSentinel();
    expect(screen.getByTestId("design-file-row-script-144.js")).toBeTruthy();
    expect(readDistantFileSize).toHaveBeenCalled();
  });
});

// Semantics guard: the root view's recursive flat listing is intentional
// (#see dirsAtCurrentDir derivation) — the lazy-render fix must not silently
// turn it into an immediate-children-only listing. Green before AND after.
describe("DesignFilesPanel root recursive listing (guard)", () => {
  it("still lists every nested file at the root and can reveal them all", () => {
    const { fetchMock } = pendingFetchMock();
    vi.stubGlobal("fetch", fetchMock);

    const { container } = renderPanel(nestedHtmlFiles(200));

    // The Pages tab counts every nested page, not just the rendered batch.
    expect(
      document.querySelector(
        "[data-testid='design-files-tab-cat:html'] .df-tab-count",
      )?.textContent,
    ).toBe("200");

    // Scrolling through the whole grid eventually renders every card.
    drainGridSentinel();
    expect(container.querySelectorAll(".df-card-grid .df-card").length).toBe(200);
    expect(
      screen.getByTestId("design-file-row-ja/plugins/p1/index.html"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("design-file-row-ja/plugins/p200/index.html"),
    ).toBeTruthy();
  });
});
