// @vitest-environment happy-dom

import React, { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useTimelineAssetDropOps } from "./useTimelineAssetDropOps";
import { mountReactHarness } from "./domSelectionTestHarness";
import { usePlayerStore } from "../player/store/playerStore";
import type { TimelineElement } from "../player";
import type { TimelineDropPlacement } from "../player/components/timelineCallbacks";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  usePlayerStore.getState().reset();
});

type DropFn = ReturnType<typeof useTimelineAssetDropOps>["handleTimelineAssetDrop"];
type FileDropFn = ReturnType<typeof useTimelineAssetDropOps>["handleTimelineFileDrop"];
type CompositionDropFn = ReturnType<
  typeof useTimelineAssetDropOps
>["handleTimelineCompositionDrop"];

function renderDropHook(
  sourceContent: string,
  writeProjectFile: (path: string, content: string, expectedContent?: string) => Promise<void>,
  timelineElements: TimelineElement[] = [],
  checkEditable?: (targets: readonly TimelineElement[]) => boolean,
  uploadProjectFiles: (files: Iterable<File>, dir?: string) => Promise<string[]> = vi
    .fn()
    .mockResolvedValue([]),
) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ content: sourceContent }) }),
  );
  let drop: DropFn | null = null;
  let fileDrop: FileDropFn | null = null;
  let compositionDrop: CompositionDropFn | null = null;
  function Harness() {
    const handlers = useTimelineAssetDropOps({
      projectIdRef: { current: "project" },
      activeCompPath: "index.html",
      timelineElements,
      showToast: vi.fn(),
      writeProjectFile,
      recordEdit: vi.fn().mockResolvedValue(undefined),
      reloadPreview: vi.fn(),
      uploadProjectFiles,
      checkEditable,
    });
    drop = handlers.handleTimelineAssetDrop;
    fileDrop = handlers.handleTimelineFileDrop;
    compositionDrop = handlers.handleTimelineCompositionDrop;
    return null;
  }
  mountReactHarness(<Harness />);
  return Object.assign(() => drop!, {
    file: () => fileDrop!,
    composition: () => compositionDrop!,
  });
}

describe("useTimelineAssetDropOps handleTimelineAssetDrop", () => {
  it("grows the root duration when the drop lands past the current end", async () => {
    const source =
      '<main data-composition-id="scene" data-duration="10" data-width="1920" data-height="1080"></main>';
    const writeProjectFile = vi.fn().mockResolvedValue(undefined);
    const getDrop = renderDropHook(source, writeProjectFile);

    await act(async () => {
      await getDrop()("clip.mp4", { start: 8, track: 0 }, 5);
    });

    const [, written] = writeProjectFile.mock.calls[0] as [string, string];
    expect(written).toContain('data-duration="13"');
  });

  it("leaves the root duration alone when the drop lands inside the current end", async () => {
    const source =
      '<main data-composition-id="scene" data-duration="10" data-width="1920" data-height="1080"></main>';
    const writeProjectFile = vi.fn().mockResolvedValue(undefined);
    const getDrop = renderDropHook(source, writeProjectFile);

    await act(async () => {
      await getDrop()("clip.mp4", { start: 1, track: 0 }, 2);
    });

    const [, written] = writeProjectFile.mock.calls[0] as [string, string];
    expect(written).toContain('data-duration="10"');
  });

  it("selects and reveals the newly dropped clip", async () => {
    const source =
      '<main data-composition-id="scene" data-duration="10" data-width="1920" data-height="1080"></main>';
    const writeProjectFile = vi.fn().mockResolvedValue(undefined);
    const getDrop = renderDropHook(source, writeProjectFile);

    await act(async () => {
      await getDrop()("clip.mp4", { start: 1, track: 0 }, 2);
    });

    expect(usePlayerStore.getState().selectedElementId).toBe("index.html#clip");
  });

  it("measures the insert row against every manifest timeline row", async () => {
    const clip = (id: string, track: number): TimelineElement => ({
      id,
      key: id,
      tag: "div",
      start: 0,
      duration: 2,
      track,
      authoredTrack: track,
      hfId: `hf-${id}`,
      domId: id,
    });
    const source = [
      '<main data-composition-id="scene" data-duration="10" data-width="1920" data-height="1080">',
      ...["a:0", "hidden:1", "b:2"].map((t) => {
        const [id, track] = t.split(":");
        return `<div data-hf-id="hf-${id}" id="${id}" data-start="0" data-track-index="${track}"></div>`;
      }),
      "</main>",
    ].join("\n");
    const writeProjectFile = vi.fn().mockResolvedValue(undefined);
    const getDrop = renderDropHook(source, writeProjectFile, [
      clip("a", 0),
      clip("hidden", 1),
      clip("b", 2),
    ]);

    await act(async () => {
      await getDrop()("clip.mp4", { start: 1, track: 1, insertRow: 1, trackOrder: [0, 2] }, 2);
    });

    const [, written] = writeProjectFile.mock.calls[0] as [string, string];
    expect(written).toContain('id="b" data-start="0" data-track-index="3"');
    expect(written).toContain('id="hidden" data-start="0" data-track-index="2"');
    expect(written).toMatch(/<video id="clip"[^>]*data-track-index="1"/);
  });

  // A clip shown on timeline row `row` and written on file track `track`.
  const rowClip = (
    id: string,
    start: number,
    duration: number,
    shown: { tag?: string; row?: number; track?: number } = {},
  ): TimelineElement => ({
    id,
    key: id,
    tag: shown.tag ?? "div",
    start,
    duration,
    track: shown.row ?? 0,
    authoredTrack: shown.track ?? shown.row ?? 0,
    hfId: `hf-${id}`,
    domId: id,
  });
  const rowSource = (clips: TimelineElement[]) =>
    [
      '<main data-composition-id="scene" data-duration="10" data-width="1920" data-height="1080">',
      ...clips.map(
        (c) =>
          `<${c.tag} data-hf-id="hf-${c.id}" id="${c.id}" data-start="${c.start}" data-duration="${c.duration}" data-track-index="${c.authoredTrack}"></${c.tag}>`,
      ),
      "</main>",
    ].join("\n");
  const writtenClip = (written: string, tag: string) =>
    written.match(new RegExp(`<${tag} id="[^"]*"[^>]*>`))?.[0] ?? "";

  it("lands an asset dropped on an occupied row at that row's nearest free time", async () => {
    const subtitle = rowClip("subtitle", 0, 6);
    const writeProjectFile = vi.fn().mockResolvedValue(undefined);
    const getDrop = renderDropHook(rowSource([subtitle]), writeProjectFile, [subtitle]);

    await act(async () => {
      await getDrop()("clip.mp4", { start: 2, track: 0 }, 5);
    });

    const [, written] = writeProjectFile.mock.calls[0] as [string, string];
    const clip = writtenClip(written, "video");
    expect(clip).toContain('data-start="6"');
    expect(clip).toContain('data-track-index="0"');
    expect(written).toContain(
      'id="subtitle" data-start="0" data-duration="6" data-track-index="0"',
    );
  });

  // Drops two files (3 s images by default) onto `clips`; returns each written clip's start and track.
  async function twoFileDrop(
    clips: TimelineElement[],
    placement: TimelineDropPlacement,
    [names, tag] = [["one.png", "two.png"], "img"] as [string[], string],
  ) {
    const writeProjectFile = vi.fn().mockResolvedValue(undefined);
    const uploadProjectFiles = vi.fn().mockResolvedValue(names);
    const getDrop = renderDropHook(
      rowSource(clips),
      writeProjectFile,
      clips,
      undefined,
      uploadProjectFiles,
    );
    const files = names.map((name) => new File([name], name));
    await act(async () => {
      await getDrop.file()(files, placement);
    });
    return writeProjectFile.mock.calls.map(([, written]) => {
      const img = writtenClip(written as string, tag);
      return [img.match(/data-start="([^"]*)"/)?.[1], img.match(/data-track-index="([^"]*)"/)?.[1]];
    });
  }

  it("keeps a multi-file drop's clips off each other and off the row's clips", async () => {
    const landed = await twoFileDrop([rowClip("a", 0, 4), rowClip("b", 8, 2)], {
      start: 1,
      track: 0,
    });
    // The first moves past a [0,4); the second is too long for [7,8) and goes after b.
    expect(landed).toEqual([
      ["4", "0"],
      ["10", "0"],
    ]);
  });

  it("puts a multi-file drop that opens a track back to back on that new track", async () => {
    const landed = await twoFileDrop([rowClip("a", 0, 10)], {
      start: 2,
      track: 0,
      insertRow: 0,
      trackOrder: [0],
    });
    // Clip a moved down a row, so it no longer blocks the second file.
    expect(landed).toEqual([
      ["2", "0"],
      ["5", "0"],
    ]);
  });

  it("keeps a multi-file drop on the file track of the row it was dropped on", async () => {
    const clips = [
      rowClip("title", 0, 10, { track: 2 }),
      rowClip("mid", 0, 1, { row: 1, track: 3 }),
      rowClip("other", 0, 1, { row: 2, track: 5 }),
    ];
    // Row 0 is file track 2; the second file must not read that 2 back as row 2 (track 5).
    expect(await twoFileDrop(clips, { start: 3, track: 0 })).toEqual([
      ["10", "2"],
      ["13", "2"],
    ]);
  });

  it("reads a row's file track from every clip of the file, whether or not it names the file", async () => {
    const unnamed = rowClip("unnamed", 0, 1, { row: 2, track: 0 });
    const title = { ...rowClip("title", 0, 10), sourceFile: "index.html" };
    const writeProjectFile = vi.fn().mockResolvedValue(undefined);
    const getDrop = renderDropHook(rowSource([unnamed, title]), writeProjectFile, [unnamed, title]);
    await act(async () => {
      await getDrop()("pic.png", { start: 2, track: 0 }, 3);
    });
    const img = writtenClip(writeProjectFile.mock.calls[0][1] as string, "img");
    expect(img).toContain('data-track-index="0"');
    expect(img).toContain('data-start="10"');
  });

  it("keeps two audio files dropped on a visual row together, as a single one would go", async () => {
    const clips = [
      rowClip("title", 0, 10, { track: 1 }),
      rowClip("music", 2, 3, { tag: "audio", row: 1, track: 0 }),
    ];
    const landed = await twoFileDrop(clips, { start: 12, track: 0 }, [["a.mp3", "b.mp3"], "audio"]);
    // Audio length probing times out in this harness, so each file gets the 5 s default.
    expect(landed).toEqual([
      ["12", "0"],
      ["17", "0"],
    ]);
  }, 30_000);

  it("refuses an asset drop before reading or writing when editing is blocked", async () => {
    const writeProjectFile = vi.fn().mockResolvedValue(undefined);
    const checkEditable = vi.fn(() => false);
    const getDrop = renderDropHook(
      '<main data-composition-id="scene" data-duration="10"></main>',
      writeProjectFile,
      [],
      checkEditable,
    );

    await act(async () => {
      await getDrop()("clip.mp4", { start: 1, track: 0 }, 2);
    });

    expect(writeProjectFile).not.toHaveBeenCalled();
    expect(checkEditable).toHaveBeenCalledWith([
      expect.objectContaining({ sourceFile: "index.html", start: 1, track: 0 }),
    ]);
  });

  it("refuses file and composition drops before their writes when editing is blocked", async () => {
    const writeProjectFile = vi.fn().mockResolvedValue(undefined);
    const uploadProjectFiles = vi.fn().mockResolvedValue(["clip.mp4"]);
    const getDrop = renderDropHook(
      '<main data-composition-id="scene" data-duration="10"></main>',
      writeProjectFile,
      [],
      () => false,
      uploadProjectFiles,
    );
    const fetchMock = vi.mocked(globalThis.fetch);

    await act(async () => {
      await getDrop.file()([new File(["clip"], "clip.mp4")], { start: 1, track: 0 });
      await getDrop.composition()("scene.html", { start: 1, track: 0 });
    });

    expect(uploadProjectFiles).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(writeProjectFile).not.toHaveBeenCalled();
  });
});
