// @vitest-environment happy-dom

// Proves the package's public exports, not internal hook paths, are enough
// for a host to mount hand editing outside EditorShell: an edit writes
// through the history path, Undo restores it, and a 409 shows the banner.
import { act, createElement, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
// Backend/storage mocking only, standing in for a host's own server and
// persistence — not part of the host's integration code under test.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createStudioApi,
  openProjectHistory,
  type StudioApiAdapter,
} from "@hyperframes/studio-server";
import { studioFileContentVersion } from "./utils/studioFileVersion";
import {
  flushStudioPendingEdits,
  useTimelineEditing,
  useProjectFileWriter,
  usePersistentEditHistory,
  useEditHistoryActions,
  ExternalFileConflictBanner,
  StudioFileConflictError,
  type ExternalFileChangeCoordinatorHandle,
  type TimelineElement,
} from "./index";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ORIGINAL_HTML = '<div id="clip" data-start="0" data-track-index="0"></div>';

let root: Root | null = null;
const cleanups: Array<() => unknown> = [];
afterEach(async () => {
  act(() => root?.unmount());
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  for (const step of cleanups.splice(0).reverse()) await step();
});

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** A project folder with etag-guarded PUT, faithful enough to exercise a real
 *  conflict: a stale If-Match gets a 409 with the current version + content.
 *  History requests go to the real history routes over the real engine. */
async function stubHostProjectDisk(
  initial: Record<string, string>,
  options?: { editElsewhereAfterFirstRead?: boolean },
) {
  const dir = tempDir("hf-host-mount-");
  for (const [path, text] of Object.entries(initial)) writeFileSync(join(dir, path), text);
  const history = await openProjectHistory({
    projectDir: dir,
    historyRoot: tempDir("hf-host-mount-history-"),
  });
  cleanups.push(() => history.close());
  const api = createStudioApi({
    listProjects: () => [],
    resolveProject: (id: string) => (id === "p1" ? { id, dir } : null),
    history: () => history,
  } as unknown as StudioApiAdapter);
  const readsSeen = new Set<string>();
  const read = (path: string) => readFileSync(join(dir, path), "utf8");
  // The real backend's etag is a content hash (useProjectFileWriter derives
  // If-Match the same way) — an arbitrary counter here would make every
  // write from a host that hasn't just read the file look stale.
  const versionOf = (path: string) => studioFileContentVersion(read(path));

  async function handlePut(path: string, init: RequestInit | undefined) {
    const ifMatch = new Headers(init?.headers).get("If-Match");
    const currentVersion = await versionOf(path);
    if (ifMatch && ifMatch !== currentVersion) {
      return new Response(JSON.stringify({ currentVersion, currentContent: read(path) }), {
        status: 409,
      });
    }
    writeFileSync(join(dir, path), String(init?.body ?? ""));
    return new Response(JSON.stringify({ version: await versionOf(path) }), { status: 200 });
  }

  async function handleGet(path: string) {
    const served = read(path);
    // Simulates another writer landing between this read and the caller's
    // own write: content moves on right after being served once, so the
    // caller's hash of what it just read no longer matches disk.
    if (options?.editElsewhereAfterFirstRead && !readsSeen.has(path)) {
      readsSeen.add(path);
      writeFileSync(join(dir, path), `${served} <!--edited elsewhere-->`);
    }
    return new Response(
      JSON.stringify({ content: served, version: await studioFileContentVersion(served) }),
      { status: 200 },
    );
  }

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/history")) return api.request(url.replace(/^\/api/, ""), init);
    const match = url.match(/\/files\/([^?]+)/);
    if (!match) return new Response("{}", { status: 404 });
    const path = decodeURIComponent(match[1]);
    return (init?.method ?? "GET") === "PUT" ? handlePut(path, init) : handleGet(path);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { read, fetchMock };
}

type TimelineEditingHandle = {
  handleTimelineElementMove: (
    element: TimelineElement,
    updates: { start: number; track: number },
  ) => Promise<void>;
};

function mountHost(
  clip: TimelineElement,
  iframe: HTMLIFrameElement,
): {
  timelineEditing: TimelineEditingHandle;
  undo: () => Promise<void>;
  bannerHost: HTMLDivElement;
} {
  let timelineEditing: TimelineEditingHandle | null = null;
  let undo: (() => Promise<void>) | null = null;
  let conflict: ExternalFileChangeCoordinatorHandle = {
    blocked: null,
    retry: async () => {},
    useExternalFile: async () => {},
    keepStudioFile: async () => {},
  };
  const bannerHost = document.createElement("div");
  document.body.append(bannerHost);
  const bannerRoot = createRoot(bannerHost);

  function Harness() {
    const writer = useProjectFileWriter({ projectId: "p1" });
    const editHistory = usePersistentEditHistory({ projectId: "p1" });
    const historyActions = useEditHistoryActions({
      editHistory,
      readOptionalProjectFile: writer.readOptionalProjectFile,
      readProjectFile: writer.readProjectFile,
      writeProjectFile: writer.writeProjectFile,
      showToast: () => {},
      syncHistoryPreviewAfterApply: async () => {},
      // The pattern a host's own dom-edit queue would also drain through —
      // this is the one gate that closes the undo/delete race (#4194).
      waitForPendingDomEditSaves: async () => {
        const result = await flushStudioPendingEdits();
        if (result.status !== "clean") throw result.error;
      },
    });
    undo = historyActions.undo;
    const commitRef = useRef(null);
    timelineEditing = useTimelineEditing({
      projectId: "p1",
      activeCompPath: "index.html",
      timelineElements: [clip],
      showToast: () => {},
      writeProjectFile: async (path, content, expectedContent) => {
        try {
          await writer.writeProjectFile(path, content, expectedContent);
        } catch (error) {
          if (error instanceof StudioFileConflictError) {
            conflict = {
              ...conflict,
              blocked: { status: "conflict", generation: 0, error, payload: null },
            };
            bannerRoot.render(createElement(ExternalFileConflictBanner, { coordinator: conflict }));
          }
          throw error;
        }
      },
      observeProjectFileVersion: writer.observeProjectFileVersion,
      recordEdit: editHistory.recordEdit,
      reloadPreview: () => {},
      previewIframeRef: { current: iframe },
      pendingTimelineEditPathRef: { current: new Set<string>() },
      uploadProjectFiles: async () => [],
      handleDomZIndexReorderCommitRef: commitRef,
    });
    return null;
  }

  root = createRoot(document.createElement("div"));
  act(() => root!.render(createElement(Harness)));
  if (!timelineEditing) throw new Error("Expected hook to mount");
  if (!undo) throw new Error("Expected undo to be exposed");
  return { timelineEditing, undo, bannerHost };
}

describe("public export surface: a host mounting hand editing outside EditorShell", () => {
  it("writes a move through the history path and undo restores it", async () => {
    const disk = await stubHostProjectDisk({ "index.html": ORIGINAL_HTML });
    const iframe = document.createElement("iframe");
    document.body.append(iframe);
    iframe.contentDocument!.body.innerHTML = ORIGINAL_HTML;
    const clip: TimelineElement = {
      id: "clip",
      domId: "clip",
      tag: "div",
      start: 0,
      duration: 2,
      track: 0,
    };

    const { timelineEditing, undo } = mountHost(clip, iframe);
    await act(async () => {
      await timelineEditing.handleTimelineElementMove(clip, { start: 5, track: 0 });
    });
    expect(disk.read("index.html")).toContain('data-start="5"');

    await act(async () => {
      await undo();
    });
    expect(disk.read("index.html")).toContain('data-start="0"');
  });

  it("surfaces the conflict banner on a 409", async () => {
    await stubHostProjectDisk(
      { "index.html": ORIGINAL_HTML },
      { editElsewhereAfterFirstRead: true },
    );
    const iframe = document.createElement("iframe");
    document.body.append(iframe);
    iframe.contentDocument!.body.innerHTML = ORIGINAL_HTML;
    const clip: TimelineElement = {
      id: "clip",
      domId: "clip",
      tag: "div",
      start: 0,
      duration: 2,
      track: 0,
    };

    const { timelineEditing, bannerHost } = mountHost(clip, iframe);

    await act(async () => {
      await expect(
        timelineEditing.handleTimelineElementMove(clip, { start: 5, track: 0 }),
      ).rejects.toBeInstanceOf(StudioFileConflictError);
    });

    expect(bannerHost.textContent).toContain("changed outside Studio");
  });
});
