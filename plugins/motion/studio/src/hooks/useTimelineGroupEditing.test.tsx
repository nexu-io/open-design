// @vitest-environment happy-dom

import { act } from "react";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createStudioApi,
  openProjectHistory,
  type StudioApiAdapter,
} from "@hyperframes/studio-server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Root } from "react-dom/client";
import type { TimelineElement } from "../player";
import { persistTimelineMoveEditsAtomically } from "./timelineMoveAdapter";
import { useTimelineGroupEditing } from "./useTimelineGroupEditing";
import { usePersistentEditHistory } from "./usePersistentEditHistory";
import { installReactActEnvironment, mountReactHarness } from "./domSelectionTestHarness";

installReactActEnvironment();

function el(id: string, start: number, duration: number, track = 0): TimelineElement {
  return { id, tag: "video", start, duration, track, domId: id };
}

describe("useTimelineGroupEditing: handleTimelineGroupMove suppressFailureToast", () => {
  let root: Root | null = null;

  afterEach(() => {
    if (root) act(() => root!.unmount());
    root = null;
    document.body.innerHTML = "";
  });

  type GroupEditingOptions = Parameters<typeof useTimelineGroupEditing>[0];

  // No project id makes enqueueGroupOperation reject before any persist runs,
  // exercising the move's real catch block without faking the SDK/server path.
  function mountFailingHarness(showToast: GroupEditingOptions["showToast"]) {
    let hook: ReturnType<typeof useTimelineGroupEditing> | null = null;
    function Harness() {
      hook = useTimelineGroupEditing({
        activeCompPath: "index.html",
        editQueueRef: { current: Promise.resolve() },
        pendingTimelineEditPathRef: { current: new Set() },
        previewIframeRef: { current: null },
        projectIdRef: { current: null },
        recordEdit: vi.fn().mockResolvedValue(undefined),
        reloadPreview: vi.fn(),
        showToast,
        writeProjectFile: vi.fn().mockResolvedValue(undefined),
      });
      return null;
    }
    root = mountReactHarness(<Harness />);
    return () => hook!;
  }

  const change = { element: el("a", 0, 2), start: 2 };

  it("shows no toast when suppressFailureToast is set on a failed move", async () => {
    const showToast = vi.fn();
    const getHook = mountFailingHarness(showToast);

    await act(async () => {
      await expect(
        getHook().handleTimelineGroupMove([change], { suppressFailureToast: true }),
      ).rejects.toThrow();
    });

    expect(showToast).not.toHaveBeenCalled();
  });

  it("shows one toast when suppressFailureToast is not set on a failed move", async () => {
    const showToast = vi.fn();
    const getHook = mountFailingHarness(showToast);

    await act(async () => {
      await expect(getHook().handleTimelineGroupMove([change])).rejects.toThrow();
    });

    expect(showToast).toHaveBeenCalledTimes(1);
  });
});

it.each([false, true])(
  "keeps detachment and the lane atomic, including a refused history write ($0)",
  async (refused) => {
    const before =
      '<main data-composition-id="root" data-duration="4"><audio id="voice" data-start="0" data-duration="2" data-track-index="1" data-audio-group="group"></audio></main>';
    let disk = before;
    const failure = new Error("history refused");
    const recordEdit = refused ? vi.fn().mockRejectedValue(failure) : vi.fn();
    const iframe = document.createElement("iframe");
    document.body.append(iframe);
    iframe.contentDocument!.body.innerHTML = before;
    const writeProjectFile = vi.fn(async (_path: string, content: string) => {
      disk = content;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ content: disk }), {
            headers: { "content-type": "application/json" },
          }),
      ),
    );
    let hook: ReturnType<typeof useTimelineGroupEditing>;
    function Harness() {
      hook = useTimelineGroupEditing({
        activeCompPath: "index.html",
        editQueueRef: { current: Promise.resolve() },
        pendingTimelineEditPathRef: { current: new Set() },
        previewIframeRef: { current: iframe },
        projectIdRef: { current: "fixture" },
        recordEdit,
        writeProjectFile,
        reloadPreview: vi.fn(),
        showToast: vi.fn(),
      });
      return null;
    }
    const root = mountReactHarness(<Harness />);
    try {
      await act(async () => {
        const moved = persistTimelineMoveEditsAtomically(
          [
            {
              element: { ...el("voice", 0, 2, 1), tag: "audio", audioGroup: "group" },
              updates: { start: 0, track: 0, audioGroup: null },
            },
          ],
          "insert",
          "track-insert",
          { handleTimelineGroupMove: hook!.handleTimelineGroupMove },
        );
        if (refused) await expect(moved).rejects.toBe(failure);
        else await moved;
      });
      expect(
        iframe.contentDocument!.getElementById("voice")?.getAttribute("data-audio-group"),
      ).toBe("group");
      if (refused) {
        expect(disk).toBe(before);
        expect(writeProjectFile).toHaveBeenCalledTimes(2);
        return;
      }
      expect(writeProjectFile).toHaveBeenCalledOnce();
      expect(recordEdit).toHaveBeenCalledOnce();
      expect(disk).not.toContain("data-audio-group");
      expect(disk).toContain('data-track-index="0"');
      expect(recordEdit.mock.calls[0][0].files["index.html"]).toEqual({ before, after: disk });
    } finally {
      act(() => root.unmount());
      iframe.remove();
      vi.unstubAllGlobals();
    }
  },
);

const SLOWER_THAN_THE_DEFAULT_WINDOW_MS = 400;

it("undoes each group move with its GSAP rewrite in one step, however long the rewrite takes", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const dir = mkdtempSync(join(tmpdir(), "hf-group-move-undo-"));
  const historyRoot = mkdtempSync(join(tmpdir(), "hf-group-move-undo-history-"));
  const before = [
    '<div data-composition-id="root" data-duration="4">',
    '<div id="a" data-start="0" data-duration="2"></div>',
    '<div id="b" data-start="0" data-duration="2"></div>',
    "</div>",
    '<script>const tl = gsap.timeline({ paused: true }); tl.to("#a", { x: 10, duration: 1 }, 0); tl.to("#b", { x: 10, duration: 1 }, 0); window.__timelines["root"] = tl;</script>',
  ].join("");
  writeFileSync(join(dir, "index.html"), before);
  const history = await openProjectHistory({ projectDir: dir, historyRoot });
  const api = createStudioApi({
    listProjects: () => [],
    resolveProject: (id: string) => (id === "demo" ? { id, dir } : null),
    history: () => history,
  } as unknown as StudioApiAdapter);
  let rewriteAsked = () => {};
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    if (url.includes("/gsap-mutations")) {
      rewriteAsked();
      await new Promise((wait) => setTimeout(wait, SLOWER_THAN_THE_DEFAULT_WINDOW_MS));
    }
    return api.request(url.replace(/^\/api/, ""), init);
  });
  let editHistory!: ReturnType<typeof usePersistentEditHistory>;
  let editing!: ReturnType<typeof useTimelineGroupEditing>;
  function Harness() {
    editHistory = usePersistentEditHistory({ projectId: "demo" });
    editing = useTimelineGroupEditing({
      activeCompPath: "index.html",
      editQueueRef: { current: Promise.resolve() },
      pendingTimelineEditPathRef: { current: new Set() },
      previewIframeRef: { current: null },
      projectIdRef: { current: "demo" },
      recordEdit: editHistory.recordEdit,
      reloadPreview: vi.fn(),
      showToast: vi.fn(),
      writeProjectFile: async (path, content) => writeFileSync(join(dir, path), content),
    });
    return null;
  }
  const root = mountReactHarness(<Harness />);
  const file = () => readFileSync(join(dir, "index.html"), "utf8");
  const moveTo = (from: number, to: number) =>
    act(async () => {
      const rewriting = new Promise<void>((resolve) => (rewriteAsked = resolve));
      const moved = editing.handleTimelineGroupMove([
        { element: el("a", from, 2), start: to },
        { element: el("b", from, 2), start: to },
      ]);
      await rewriting;
      await vi.advanceTimersByTimeAsync(SLOWER_THAN_THE_DEFAULT_WINDOW_MS);
      await moved;
    });
  const undo = () =>
    act(() =>
      editHistory.undo({ readFile: async (path) => readFileSync(join(dir, path), "utf8") }),
    );
  try {
    await moveTo(0, 1);
    const once = file();
    await moveTo(1, 2);
    expect(file()).toContain('tl.to("#a", { x: 10, duration: 1 }, 2)');

    await undo();
    expect(file()).toBe(once);
    await undo();
    expect(file()).toBe(before);
  } finally {
    act(() => root.unmount());
    await history.close();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    rmSync(dir, { recursive: true, force: true });
    rmSync(historyRoot, { recursive: true, force: true });
  }
});
