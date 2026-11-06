// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { TIMELINE_ASSET_MIME, TIMELINE_BLOCK_MIME } from "../../utils/timelineAssetDrop";
import { usePlayerStore, type TimelineElement } from "../store/playerStore";
import { createTimelineRowGeometry } from "./timelineLayout";
import { resolveDropInsertRow, useTimelineAssetDrop } from "./timelineDragDrop";
import { getTimelineRowTop, TRACK_H } from "./timelineLayout";
import { configureTimelineTestViewport } from "./timelineTestViewport";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ROW0_MID_Y = getTimelineRowTop(0) + TRACK_H / 2;

interface DropTransfer {
  types: string[];
  files: File[];
  dropEffect: DataTransfer["dropEffect"];
  getData: (type: string) => string;
}

function dragEvent(transfer: DropTransfer, clientX: number, clientY: number): React.DragEvent {
  return {
    clientX,
    clientY,
    dataTransfer: transfer,
    preventDefault: vi.fn(),
  } as unknown as React.DragEvent;
}

function assetTransfer(payload: string): DropTransfer {
  return {
    types: [TIMELINE_ASSET_MIME],
    files: [],
    dropEffect: "none",
    getData: (type) => (type === TIMELINE_ASSET_MIME ? payload : ""),
  };
}

// One far-off clip per lane, so a drop keeps its pointer time instead of an empty lane's 0.
const FAR_CLIPS: TimelineElement[] = Array.from({ length: 100 }, (_, track) => ({
  id: `far-${track}`,
  tag: "div",
  start: 900,
  duration: 1,
  track,
}));

function renderHarness(
  onAssetDrop: Mock,
  sessionEpoch = 1,
  options: { onBlockDrop?: Mock; strict?: boolean; elements?: TimelineElement[] } = {},
) {
  const tracks = Array.from({ length: 100 }, (_, index) => index);
  const geometry = createTimelineRowGeometry(
    tracks,
    tracks.map(() => 48),
  );
  const scroll = document.createElement("div");
  configureTimelineTestViewport(scroll, geometry.canvasHeight);
  document.body.append(scroll);
  const root = createRoot(document.createElement("div"));
  let api: ReturnType<typeof useTimelineAssetDrop> | null = null;

  function Probe({ epoch }: { epoch: number }) {
    api = useTimelineAssetDrop({
      scrollRef: { current: scroll },
      ppsRef: { current: 40 },
      trackOrderRef: { current: tracks },
      elementsRef: { current: options.elements ?? FAR_CLIPS },
      rowGeometryRef: { current: geometry },
      contentOrigin: 0,
      sessionEpoch: epoch,
      onAssetDrop,
      onBlockDrop: options.onBlockDrop,
    });
    return null;
  }

  const renderProbe = (epoch: number) =>
    root.render(
      options.strict ? (
        <React.StrictMode>
          <Probe epoch={epoch} />
        </React.StrictMode>
      ) : (
        <Probe epoch={epoch} />
      ),
    );
  act(() => renderProbe(sessionEpoch));
  return {
    scroll,
    root,
    get api() {
      if (!api) throw new Error("drop harness did not render");
      return api;
    },
    rerender(epoch: number) {
      act(() => renderProbe(epoch));
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  usePlayerStore.getState().reset();
  document.body.innerHTML = "";
});

describe("useTimelineAssetDrop", () => {
  it("edge-autoscrolls the sole timeline viewport while a supported asset is held", () => {
    let frame: FrameRequestCallback | null = null;
    vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((callback) => {
      frame = callback;
      return 1;
    });
    vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(() => undefined);
    const view = renderHarness(vi.fn());

    act(() => view.api.handleAssetDragOver(dragEvent(assetTransfer("{}"), 790, 120)));
    expect(view.api.isDragOver).toBe(true);
    expect(frame).not.toBeNull();
    act(() => frame?.(0));
    expect(view.scroll.scrollLeft).toBeGreaterThan(0);
    expect(view.scroll.scrollTop).toBe(0);

    act(() => view.api.clearDropPreview());
    expect(view.api.isDragOver).toBe(false);
    act(() => view.root.unmount());
  });

  it("keeps the drop actor while moving between descendants", () => {
    const view = renderHarness(vi.fn());
    const parent = document.createElement("div");
    const child = document.createElement("div");
    parent.append(child);
    act(() => view.api.handleAssetDragOver(dragEvent(assetTransfer("{}"), 400, ROW0_MID_Y)));
    act(() =>
      view.api.handleAssetDragLeave({
        relatedTarget: child,
        currentTarget: parent,
      } as unknown as React.DragEvent),
    );
    expect(view.api.isDragOver).toBe(true);
    act(() => view.root.unmount());
  });

  it("drops once on a model row outside the mounted window and appends below the last row", () => {
    const onAssetDrop = vi.fn();
    const view = renderHarness(onAssetDrop);
    view.scroll.scrollTop = view.scroll.scrollHeight - view.scroll.clientHeight;
    const transfer = assetTransfer(JSON.stringify({ path: "/media/hero.mp4" }));

    act(() => {
      view.api.handleAssetDragOver(dragEvent(transfer, 400, 239));
      view.api.handleAssetDrop(dragEvent(transfer, 400, 239));
    });

    expect(onAssetDrop).toHaveBeenCalledTimes(1);
    // The appended lane is empty, so the drop starts at 0.
    expect(onAssetDrop).toHaveBeenCalledWith("/media/hero.mp4", { start: 0, track: 100 });
    expect(view.api.isDragOver).toBe(false);
    act(() => view.root.unmount());
  });

  it("places the drop at the pointer x, ignoring the playhead", () => {
    const onAssetDrop = vi.fn();
    const view = renderHarness(onAssetDrop);
    usePlayerStore.getState().setCurrentTime(50);
    const transfer = assetTransfer(JSON.stringify({ path: "/media/hero.mp4" }));

    act(() => {
      view.api.handleAssetDragOver(dragEvent(transfer, 80, ROW0_MID_Y));
      view.api.handleAssetDrop(dragEvent(transfer, 80, ROW0_MID_Y));
    });

    // pps=40, clientX=80 -> 2s, far from the 50s playhead: proves start tracks
    // the drop position, not usePlayerStore.currentTime.
    expect(onAssetDrop).toHaveBeenCalledWith("/media/hero.mp4", { start: 2, track: 0 });
    act(() => view.root.unmount());
  });

  it("ignores malformed payloads and clears the actor on project reset", () => {
    const onAssetDrop = vi.fn();
    const view = renderHarness(onAssetDrop, 1);
    const transfer = assetTransfer("not-json");

    act(() => view.api.handleAssetDragOver(dragEvent(transfer, 400, ROW0_MID_Y)));
    expect(view.api.isDragOver).toBe(true);
    view.rerender(2);
    expect(view.api.isDragOver).toBe(false);

    act(() => view.api.handleAssetDrop(dragEvent(transfer, 400, ROW0_MID_Y)));
    expect(onAssetDrop).not.toHaveBeenCalled();
    act(() => view.root.unmount());
  });

  it("falls through a malformed asset payload to a valid block payload", () => {
    const onAssetDrop = vi.fn();
    const onBlockDrop = vi.fn();
    const view = renderHarness(onAssetDrop, 1, { onBlockDrop });
    const transfer: DropTransfer = {
      types: [TIMELINE_ASSET_MIME, TIMELINE_BLOCK_MIME],
      files: [],
      dropEffect: "none",
      getData: (type) =>
        type === TIMELINE_ASSET_MIME
          ? "not-json"
          : type === TIMELINE_BLOCK_MIME
            ? JSON.stringify({ name: "title-card" })
            : "",
    };

    act(() => {
      view.api.handleAssetDragOver(dragEvent(transfer, 400, ROW0_MID_Y));
      view.api.handleAssetDrop(dragEvent(transfer, 400, ROW0_MID_Y));
    });

    expect(onAssetDrop).not.toHaveBeenCalled();
    // pps=40, clientX=400 -> 10s at the pointer.
    expect(onBlockDrop).toHaveBeenCalledExactlyOnceWith("title-card", { start: 10, track: 0 });
    act(() => view.root.unmount());
  });

  it("clears an escaped drag after StrictMode effect replay", () => {
    const view = renderHarness(vi.fn(), 1, { strict: true });
    act(() => view.api.handleAssetDragOver(dragEvent(assetTransfer("{}"), 400, ROW0_MID_Y)));
    expect(view.api.isDragOver).toBe(true);

    act(() => window.dispatchEvent(new Event("dragend")));
    expect(view.api.isDragOver).toBe(false);
    act(() => view.root.unmount());
  });

  it("previews the exact placement the drop commits, and clears it after", () => {
    const onAssetDrop = vi.fn();
    const view = renderHarness(onAssetDrop);
    const payload = JSON.stringify({ path: "assets/a.png" });

    act(() => view.api.handleAssetDragOver(dragEvent(assetTransfer(payload), 400, ROW0_MID_Y)));
    const preview = view.api.dropPreview;
    expect(preview).toEqual({ start: 10, track: 0 });

    act(() => view.api.handleAssetDrop(dragEvent(assetTransfer(payload), 400, ROW0_MID_Y)));
    expect(onAssetDrop).toHaveBeenCalledExactlyOnceWith("assets/a.png", preview);
    expect(view.api.dropPreview).toBeNull();
    act(() => view.root.unmount());
  });

  it("moves the preview with the pointer and drops it when the drag leaves", () => {
    const view = renderHarness(vi.fn());
    act(() => view.api.handleAssetDragOver(dragEvent(assetTransfer("{}"), 400, ROW0_MID_Y)));
    act(() => view.api.handleAssetDragOver(dragEvent(assetTransfer("{}"), 800, ROW0_MID_Y)));
    expect(view.api.dropPreview?.start).toBe(20);

    act(() =>
      view.api.handleAssetDragLeave({
        relatedTarget: null,
        currentTarget: document.body,
      } as unknown as React.DragEvent),
    );
    expect(view.api.dropPreview).toBeNull();
    act(() => view.root.unmount());
  });
});

describe("useTimelineAssetDrop start", () => {
  function dropAt(elements: TimelineElement[], clientX: number) {
    const onAssetDrop = vi.fn();
    const view = renderHarness(onAssetDrop, 1, { elements });
    const transfer = assetTransfer(JSON.stringify({ path: "assets/a.mp4" }));
    act(() => view.api.handleAssetDragOver(dragEvent(transfer, clientX, ROW0_MID_Y)));
    const preview = view.api.dropPreview;
    act(() => view.api.handleAssetDrop(dragEvent(transfer, clientX, ROW0_MID_Y)));
    act(() => view.root.unmount());
    return { preview, committed: onAssetDrop.mock.calls[0]?.[1] };
  }

  it("starts a drop on an empty timeline at 0, in the preview and the commit", () => {
    // pps=40, clientX=80 -> 2s at the pointer.
    const { preview, committed } = dropAt([], 80);
    expect(preview).toEqual({ start: 0, track: 0 });
    expect(committed).toEqual(preview);
  });

  it("starts a drop on an empty lane at 0 while other lanes hold clips", () => {
    const { committed } = dropAt([{ id: "c", tag: "div", start: 0, duration: 5, track: 1 }], 80);
    expect(committed).toEqual({ start: 0, track: 0 });
  });

  it("snaps a drop within TIMELINE_SNAP_PX of a clip edge onto that edge", () => {
    const lane: TimelineElement[] = [{ id: "c", tag: "div", start: 0, duration: 5, track: 0 }];
    // The clip ends at x=200; 6 px past it is 5.15s, inside the 8 px radius.
    const { preview, committed } = dropAt(lane, 206);
    expect(preview).toEqual({ start: 5, track: 0 });
    expect(committed).toEqual(preview);
    // 12 px past it is outside the radius and keeps the pointer time.
    expect(dropAt(lane, 212).committed).toEqual({ start: 5.3, track: 0 });
  });

  it("keeps the pointer time with the magnet off, and still starts an empty lane at 0", () => {
    usePlayerStore.getState().setTimelineSnapEnabled(false);
    try {
      const lane: TimelineElement[] = [{ id: "c", tag: "div", start: 0, duration: 5, track: 0 }];
      expect(dropAt(lane, 206).committed).toEqual({ start: 5.15, track: 0 });
      expect(dropAt([], 80).committed).toEqual({ start: 0, track: 0 });
    } finally {
      usePlayerStore.getState().setTimelineSnapEnabled(true);
    }
  });
});

describe("resolveDropInsertRow", () => {
  const rows = [TRACK_H, TRACK_H, TRACK_H];
  it("stays on the row at the boundary between two rows", () => {
    for (const dy of [-1, 0, 1]) {
      expect(resolveDropInsertRow(getTimelineRowTop(1, rows) + dy, rows, 3)).toBeNull();
    }
  });
  it("arms a new track above the first lane", () => {
    expect(resolveDropInsertRow(getTimelineRowTop(0, rows) - 4, rows, 3)).toBe(0);
  });
  it("stays on the lane when the pointer is over its middle", () => {
    expect(resolveDropInsertRow(getTimelineRowTop(1, rows) + TRACK_H / 2, rows, 3)).toBeNull();
  });
  it("leaves the area below the last lane to the append path", () => {
    expect(resolveDropInsertRow(getTimelineRowTop(2, rows) + TRACK_H + 4, rows, 3)).toBeNull();
  });
  it("never arms on an empty timeline", () => {
    expect(resolveDropInsertRow(80, [], 0)).toBeNull();
  });
});

describe("useTimelineAssetDrop new-track drops", () => {
  it("drops an asset released at the top edge of a row onto that row, with no new track", () => {
    const onAssetDrop = vi.fn();
    const view = renderHarness(onAssetDrop);
    const transfer = assetTransfer(JSON.stringify({ path: "assets/a.png" }));
    const y = getTimelineRowTop(1) + 1;

    act(() => view.api.handleAssetDragOver(dragEvent(transfer, 400, y)));
    expect(view.api.dropPreview).toEqual({ start: 10, track: 1 });
    act(() => view.api.handleAssetDrop(dragEvent(transfer, 400, y)));
    expect(onAssetDrop).toHaveBeenCalledWith("assets/a.png", { start: 10, track: 1 });
    act(() => view.root.unmount());
  });

  it("opens a new track for an asset released in the empty space above the first row", () => {
    const onAssetDrop = vi.fn();
    const view = renderHarness(onAssetDrop);
    const transfer = assetTransfer(JSON.stringify({ path: "assets/a.png" }));
    const y = getTimelineRowTop(0) - 4;

    act(() => view.api.handleAssetDragOver(dragEvent(transfer, 400, y)));
    act(() => view.api.handleAssetDrop(dragEvent(transfer, 400, y)));
    expect(onAssetDrop).toHaveBeenCalledWith(
      "assets/a.png",
      expect.objectContaining({
        start: 0,
        insertRow: 0,
        trackOrder: Array.from({ length: 100 }, (_, index) => index),
      }),
    );
    act(() => view.root.unmount());
  });

  it("does not ask a block drop to insert a track", () => {
    const onBlockDrop = vi.fn();
    const view = renderHarness(vi.fn(), 1, { onBlockDrop });
    const transfer: DropTransfer = {
      types: [TIMELINE_BLOCK_MIME],
      files: [],
      dropEffect: "none",
      getData: (type) => (type === TIMELINE_BLOCK_MIME ? JSON.stringify({ name: "b" }) : ""),
    };
    const y = getTimelineRowTop(1) + 1;
    act(() => {
      view.api.handleAssetDragOver(dragEvent(transfer, 400, y));
      view.api.handleAssetDrop(dragEvent(transfer, 400, y));
    });
    expect(onBlockDrop).toHaveBeenCalledWith("b", { start: 10, track: 1 });
    act(() => view.root.unmount());
  });
});
