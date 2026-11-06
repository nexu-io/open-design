import { expect, it, vi } from "vitest";
import { buildTimelineTrackInsertLayout } from "./timelineTrackInsertLayout";
import { computeDragPreview } from "./timelineClipDragPreview";
import { commitDraggedClipMove } from "./timelineClipDragCommit";
import { timelineAudioRow, resolveZoneDropPlacement } from "./timelineCollision";
import { createTimelineRowGeometry } from "./timelineLayout";
import type { TimelineElement } from "../store/playerStore";
import type { DraggedClipState } from "./timelineClipDragTypes";

it.each([
  { order: [0, 0.5, 1, 3, 2, 4], seam: 4 },
  { order: [0, 0.5, 2, 4], seam: 2 },
])(
  "inserts below an expanded or collapsed group block in displayed order ($seam)",
  async ({ order, seam }) => {
    const layout = buildTimelineTrackInsertLayout(order, [
      { anchorKey: 0.5, memberTracks: [1, 3] },
    ]);
    const elements: TimelineElement[] = [0, 1, 2, 3, 4].map((track) => ({
      id: `clip-${track}`,
      domId: `clip-${track}`,
      tag: "audio",
      start: 0,
      duration: 1,
      track,
      audioGroup: track === 1 || track === 3 ? "group" : undefined,
    }));
    elements.push({ id: "tail", domId: "tail", tag: "audio", start: 3, duration: 1, track: 4 });
    const hero = elements[4];
    const drag: DraggedClipState = {
      pointerId: 1,
      element: hero,
      originClientX: 100,
      originClientY: 48 + order.indexOf(hero.track) * 48,
      originScrollLeft: 0,
      originScrollTop: 0,
      pointerClientX: 100,
      pointerClientY: 48 + order.indexOf(hero.track) * 48,
      pointerOffsetX: 0,
      pointerOffsetY: 0,
      previewStart: 0,
      previewTrack: 4,
      desiredTrack: 4,
      insertRow: null,
      snapTime: null,
      snapType: null,
      started: true,
    };
    const geometry = createTimelineRowGeometry(
      order,
      order.map(() => 48),
      { top: 0 },
    );
    const context = {
      scroll: null,
      pps: 100,
      duration: 10,
      trackOrder: order,
      rowGeometry: geometry,
      elements,
      selectedKeys: new Set<string>(),
      buildSnapTargets: () => [],
      allowedInsertRows: layout.allowedRows,
      groupTracks: layout.groupTracks,
    };
    const ontoHeader = computeDragPreview(drag, 100, geometry.getRowTop(1) + 24, context);
    expect(ontoHeader.insertRow).toBeNull();
    expect(ontoHeader.previewTrack).toBe(order.length === 6 ? 1 : 4);
    if (order.length === 6) {
      expect(layout.allowedRows.has(2)).toBe(false);
      expect(layout.allowedRows.has(3)).toBe(false);
      const ontoMember = computeDragPreview(drag, 100, 130, context);
      expect(ontoMember.insertRow).toBeNull();
      expect(ontoMember.previewTrack).toBe(1);
    }
    const preview = computeDragPreview(drag, 100, geometry.getRowTop(seam), context);
    expect(preview.insertRow).toBe(seam);
    const moved = new Map(elements.map((element) => [element.id, element]));
    const persist = vi.fn();
    commitDraggedClipMove(preview, {
      elements,
      trackOrder: order,
      trackInsertLayout: layout,
      updateElement: (id, updates) => {
        moved.set(id, { ...moved.get(id)!, ...updates });
      },
      onMoveElements: persist,
    });
    await Promise.resolve();
    expect(persist).toHaveBeenCalledOnce();
    expect(moved.get("clip-1")?.track).toBe(1);
    expect(moved.get("clip-3")?.track).toBe(2);
    expect(moved.get("clip-4")?.track).toBe(3);
    expect(moved.get("clip-2")?.track).toBe(4);
  },
);

it.each([{ order: [0, 0.5] }, { order: [0, 0.5, 2] }])(
  "keeps a collapsed audio group at the zone boundary ($order)",
  ({ order }) => {
    const layout = buildTimelineTrackInsertLayout(order, [
      { anchorKey: 0.5, memberTracks: [1, 3] },
    ]);
    expect(timelineAudioRow(order, new Set([1, 3, 2]), layout.groupTracks)).toBe(1);
  },
);

it.each([
  { insertRow: 0, target: 0 },
  { insertRow: null, target: 2 },
])(
  "detaches only new-track drops, retaining member-track behavior ($insertRow)",
  async ({ insertRow, target }) => {
    const hero: TimelineElement = {
      id: "hero",
      domId: "hero",
      tag: "audio",
      start: 0,
      duration: 1,
      track: 1,
      audioGroup: "voice",
    };
    const member: TimelineElement = {
      id: "member",
      domId: "member",
      tag: "audio",
      start: 2,
      duration: 1,
      track: 2,
      audioGroup: "voice",
    };
    const elements = [hero, member];
    const order = [0.5, 1, 2];
    const layout = buildTimelineTrackInsertLayout(order, [
      { anchorKey: 0.5, memberTracks: [1, 2] },
    ]);
    const moved = new Map(elements.map((element) => [element.id, element]));
    const persist = vi.fn();
    commitDraggedClipMove(
      {
        pointerId: null,
        element: hero,
        insertRow,
        started: true,
        originClientX: 0,
        originClientY: 0,
        originScrollLeft: 0,
        originScrollTop: 0,
        pointerClientX: 0,
        pointerClientY: 0,
        pointerOffsetX: 0,
        pointerOffsetY: 0,
        previewStart: 0,
        previewTrack: target,
        desiredTrack: target,
        snapTime: null,
        snapType: null,
      },
      {
        elements,
        trackOrder: order,
        trackInsertLayout: layout,
        onMoveElements: persist,
        updateElement: (id, updates) => {
          moved.set(id, { ...moved.get(id)!, ...updates });
        },
      },
    );
    await Promise.resolve();
    expect(moved.get("hero")?.audioGroup).toBe(insertRow === null ? "voice" : undefined);
    expect(moved.get("hero")?.track).toBe(target);
    expect(moved.get("member")?.audioGroup).toBe("voice");
    const edit = persist.mock.calls[0][0].find(
      (edit: { element: TimelineElement }) => edit.element.id === "hero",
    );
    expect(edit.updates.audioGroup).toBe(insertRow === null ? undefined : null);
  },
);

it("creates the first visual lane above an all-audio timeline", () => {
  expect(
    resolveZoneDropPlacement({
      order: [0, 1],
      audioTracks: new Set([0, 1]),
      elements: [],
      desiredTrack: 0,
      deliberateInsertRow: null,
      start: 2,
      duration: 1,
      dragKey: "new-visual",
      isAudio: false,
    }),
  ).toEqual({ track: 0, insertRow: 0, start: 2 });
});

it("keeps audible-video groups in the visual zone for header drops and edge inserts", () => {
  const order = [0, 0.5, 1, 2];
  const layout = buildTimelineTrackInsertLayout(order, [{ anchorKey: 0.5, memberTracks: [1] }]);
  const input = {
    order,
    audioTracks: new Set<number>(),
    groupTracks: layout.groupTracks,
    allowedInsertRows: layout.allowedRows,
    elements: [],
    desiredTrack: 0.5,
    deliberateInsertRow: null,
    start: 2,
    duration: 1,
    dragKey: "video",
    isAudio: false,
    origin: { track: 2, start: 2 },
  };
  expect(timelineAudioRow(order, input.audioTracks, layout.groupTracks)).toBe(-1);
  expect(resolveZoneDropPlacement(input)).toEqual({ track: 1, insertRow: null, start: 2 });
  expect(resolveZoneDropPlacement({ ...input, deliberateInsertRow: 3 })).toEqual({
    track: 0.5,
    insertRow: 3,
    start: 2,
  });
});

it.each([
  { isAudio: false, target: 1 },
  { isAudio: true, target: 3 },
])(
  "maps a mixed-kind group header to its first visible member of the clip kind ($isAudio)",
  ({ isAudio, target }) => {
    const order = [0, 0.5, 1, 3, 2];
    const layout = buildTimelineTrackInsertLayout(order, [
      { anchorKey: 0.5, memberTracks: [1, 3] },
    ]);
    expect(
      resolveZoneDropPlacement({
        order,
        audioTracks: new Set([3]),
        groupTracks: layout.groupTracks,
        allowedInsertRows: layout.allowedRows,
        elements: [],
        desiredTrack: 0.5,
        deliberateInsertRow: null,
        start: 2,
        duration: 1,
        dragKey: "clip",
        isAudio,
        origin: { track: 2, start: 2 },
      }),
    ).toEqual({ track: target, insertRow: null, start: 2 });
  },
);
