import { describe, expect, it, vi } from "vitest";
import type { TimelineElement } from "../store/playerStore";
import type { ClipManifestClip } from "../lib/playbackTypes";
import { createTimelineElementFromManifestClip } from "../lib/timelineDOM";
import { normalizeToZones } from "./timelineZones";
import { commitDraggedClipMove, type TimelineMoveEdit } from "./timelineClipDragCommit";
import type { DraggedClipState } from "./useTimelineClipDrag";

/**
 * Pipeline test across the REAL manifest→element boundary: no hand-injected
 * `authoredTrack` / `stackingContextId`. A runtime-manifest-shaped payload with
 * SPARSE authored tracks flows through createTimelineElementFromManifestClip →
 * (normalizeToZones | buildChildElements) → commitDraggedClipMove, and the
 * persisted data-track-index must be the AUTHORED target, never the display lane.
 */

const manifestClip = (over: Partial<ClipManifestClip>): ClipManifestClip => ({
  id: "x",
  label: "x",
  start: 0,
  duration: 2,
  track: 0,
  stackingContextId: "root",
  kind: "element",
  tagName: "div",
  compositionId: null,
  parentCompositionId: null,
  compositionSrc: null,
  assetUrl: null,
  ...over,
});

function fromManifest(clips: ClipManifestClip[]): TimelineElement[] {
  return clips.map((clip, index) =>
    createTimelineElementFromManifestClip({ clip, fallbackIndex: index }),
  );
}

function drag(
  element: TimelineElement,
  opts: { previewStart: number; previewTrack: number },
): DraggedClipState {
  return {
    element,
    originClientX: 0,
    originClientY: 0,
    originScrollLeft: 0,
    originScrollTop: 0,
    pointerClientX: 0,
    pointerClientY: 0,
    pointerOffsetX: 0,
    pointerOffsetY: 0,
    previewStart: opts.previewStart,
    previewTrack: opts.previewTrack,
    desiredTrack: opts.previewTrack,
    insertRow: null,
    snapTime: null,
    snapType: null,
    started: true,
  };
}

/** Commit a lane-change drag and return the single persisted edit batch. */
function commitLaneChange(
  element: TimelineElement,
  previewTrack: number,
  elements: TimelineElement[],
  trackOrder: number[],
): TimelineMoveEdit[] {
  const onMoveElements = vi.fn();
  commitDraggedClipMove(drag(element, { previewStart: element.start, previewTrack }), {
    elements,
    trackOrder,
    updateElement: vi.fn(),
    onMoveElements,
  });
  expect(onMoveElements).toHaveBeenCalledTimes(1);
  return onMoveElements.mock.calls[0][0] as TimelineMoveEdit[];
}

describe("track persist pipeline (manifest → factory → lanes → drag commit)", () => {
  // Sparse authored tracks 3 and 7 (mixed kinds), plus audio on 5, exactly as a
  // runtime manifest would ship them (clip.track is the verbatim data-track-index).
  const sparseManifest = [
    manifestClip({ id: "v", kind: "video", tagName: "video", track: 3, start: 0 }),
    manifestClip({ id: "g", kind: "element", tagName: "div", track: 7, start: 10 }),
    manifestClip({ id: "m", kind: "audio", tagName: "audio", track: 5, start: 0 }),
  ];

  it("factory records the authored track and stacking context from the manifest clip", () => {
    const [v, g, m] = fromManifest(sparseManifest);
    expect([v.authoredTrack, g.authoredTrack, m.authoredTrack]).toEqual([3, 7, 5]);
    expect(v.stackingContextId).toBe("root");
  });

  it("a lane change on a sparse file persists the AUTHORED target track, not the display lane", () => {
    // normalizeToZones packs visual tracks {3, 7} onto display lanes {0, 1} and
    // the audio track 5 onto lane 2, preserving the factory-set authoredTrack.
    const elements = normalizeToZones(fromManifest(sparseManifest));
    const byId = new Map(elements.map((e) => [e.id, e]));
    expect(byId.get("v")).toMatchObject({ track: 0, authoredTrack: 3 });
    expect(byId.get("g")).toMatchObject({ track: 1, authoredTrack: 7 });
    expect(byId.get("m")).toMatchObject({ track: 2, authoredTrack: 5 });

    // Drag the video (lane 0) onto the div's lane (display 1, authored 7).
    const down = commitLaneChange(byId.get("v")!, 1, elements, [0, 1, 2]);
    expect(down).toHaveLength(1);
    expect(down[0].updates.track).toBe(7); // authored, NOT display lane 1
    expect(down[0].updates.track).not.toBe(1);

    // And the reverse: the div (lane 1) onto the video's lane (display 0, authored 3).
    const up = commitLaneChange(byId.get("g")!, 0, elements, [0, 1, 2]);
    expect(up[0].updates.track).toBe(3); // authored, NOT display lane 0
  });
});
