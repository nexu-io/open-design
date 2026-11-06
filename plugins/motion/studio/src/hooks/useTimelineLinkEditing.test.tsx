// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePlayerStore, type TimelineElement } from "../player";
import { useTimelineLinkEditing, withLinkPartners } from "./useTimelineLinkEditing";
import { useLinkedClipPreferences } from "../utils/linkedClipPreferences";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const clip = (id: string, tag: string, link?: string): TimelineElement => ({
  id,
  domId: id,
  tag,
  start: 0,
  duration: 4,
  track: 0,
  ...(link ? { link } : {}),
});
const video = clip("talk", "video", "lk-1");
const audio = clip("talk-audio", "audio", "lk-1");
const title = clip("title", "div");

const SOURCE =
  '<div><video id="talk" muted data-link="lk-1"></video><audio id="talk-audio" data-link="lk-1"></audio></div>';

async function renderLinkEditing(handleTimelineElementsDelete = vi.fn()) {
  usePlayerStore.getState().setElements([video, audio, title]);
  const writeProjectFile = vi.fn().mockResolvedValue(undefined);
  const recordEdit = vi.fn().mockResolvedValue(undefined);
  let api: ReturnType<typeof useTimelineLinkEditing> | undefined;
  function Harness() {
    api = useTimelineLinkEditing({
      projectIdRef: { current: "p1" },
      activeCompPath: "index.html",
      editQueueRef: { current: Promise.resolve() },
      pendingTimelineEditPathRef: { current: new Set() },
      showToast: vi.fn(),
      writeProjectFile,
      recordEdit,
      reloadPreview: vi.fn(),
      handleTimelineElementsDelete,
    });
    return null;
  }
  const root = createRoot(document.body.appendChild(document.createElement("div")));
  await act(async () => root.render(React.createElement(Harness)));
  if (!api) throw new Error("hook did not render");
  return { api, writeProjectFile, recordEdit, unmount: () => act(() => root.unmount()) };
}

describe("withLinkPartners", () => {
  it("adds partners after the selection, once", () => {
    usePlayerStore.getState().setElements([video, audio, title]);
    expect(withLinkPartners([video, title]).map((el) => el.id)).toEqual([
      "talk",
      "title",
      "talk-audio",
    ]);
    expect(withLinkPartners([video, audio])).toHaveLength(2);
  });
});

describe("useTimelineLinkEditing", () => {
  afterEach(() => vi.restoreAllMocks());

  it("deletes a linked clip with its partner", async () => {
    const del = vi.fn().mockResolvedValue(undefined);
    const { api, unmount } = await renderLinkEditing(del);
    await act(async () => api.handleLinkedElementDelete(video));
    expect(del.mock.calls[0]?.[0].map((el: TimelineElement) => el.id)).toEqual([
      "talk",
      "talk-audio",
    ]);
    unmount();
  });

  it("with Linked Selection off, delete removes the clip alone and unlinks the survivor", async () => {
    const del = vi.fn().mockResolvedValue(undefined);
    const { api, unmount } = await renderLinkEditing(del);
    useLinkedClipPreferences.getState().setLinkedSelection(false);
    try {
      expect(withLinkPartners([video])).toEqual([video]);
      await act(async () => api.handleLinkedElementDelete(video));
      expect(del).toHaveBeenCalledWith([video], [audio]);
    } finally {
      useLinkedClipPreferences.getState().setLinkedSelection(true);
    }
    unmount();
  });

  it("delete-only removes one member and unlinks the survivor", async () => {
    const del = vi.fn().mockResolvedValue(undefined);
    const { api, unmount } = await renderLinkEditing(del);
    await act(async () => api.handleDeleteElementOnly(video));
    expect(del).toHaveBeenCalledWith([video], [audio]);
    unmount();
  });

  it("unlink writes one undo step removing data-link from both", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ content: SOURCE }), { status: 200 }),
    );
    const { api, writeProjectFile, recordEdit, unmount } = await renderLinkEditing();
    await act(async () => api.handleLinkEdit({ kind: "unlink", elements: [video, audio] }));
    expect(writeProjectFile).toHaveBeenCalledTimes(1);
    expect(writeProjectFile.mock.calls[0]?.[1]).not.toContain("data-link");
    expect(recordEdit).toHaveBeenCalledTimes(1);
    expect(recordEdit.mock.calls[0]?.[0].label).toBe("Unlink clips");
    unmount();
  });

  it("unlink leaves nothing selected, so a later trim moves only the grabbed clip", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ content: SOURCE }), { status: 200 }),
    );
    const { api, unmount } = await renderLinkEditing();
    usePlayerStore.getState().setSelection(["talk", "talk-audio"], "talk");
    await act(async () => api.handleLinkEdit({ kind: "unlink", elements: [video, audio] }));
    expect(usePlayerStore.getState().selectedElementIds.size).toBe(0);
    expect(usePlayerStore.getState().selectedElementId).toBeNull();
    unmount();
  });
});
