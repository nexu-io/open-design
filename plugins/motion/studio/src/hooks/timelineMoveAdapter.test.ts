import { describe, expect, it, vi } from "vitest";
import type { TimelineElement } from "../player";
import { persistTimelineMoveEditsAtomically } from "./timelineMoveAdapter";

type MoveArgs = Parameters<typeof persistTimelineMoveEditsAtomically>;

const element = (id: string, track: number): TimelineElement => ({
  id,
  key: id,
  tag: "div",
  start: 0,
  duration: 2,
  track,
});

const twoLaneEdits = (bTrack: number): MoveArgs[0] => [
  { element: element("a", 0), updates: { start: 1, track: 1 } },
  { element: element("b", bTrack), updates: { start: 3, track: 2 } },
];

const movedPair = (edits: MoveArgs[0]) => [
  { element: edits[0].element, start: 1, track: 1 },
  { element: edits[1].element, start: 3, track: 2 },
];

const runMove = async (edits: MoveArgs[0], coalesceKey: MoveArgs[1], intent: MoveArgs[2]) => {
  const handleTimelineGroupMove = vi.fn().mockResolvedValue(undefined);
  await persistTimelineMoveEditsAtomically(edits, coalesceKey, intent, {
    handleTimelineGroupMove,
  });
  return handleTimelineGroupMove;
};

describe("persistTimelineMoveEditsAtomically", () => {
  it("persists two vertical edits as one group with the gesture coalesce key", async () => {
    const edits = twoLaneEdits(1);
    const handleTimelineGroupMove = await runMove(edits, "clip-lane-move:7", "track-insert");
    expect(handleTimelineGroupMove).toHaveBeenCalledTimes(1);
    expect(handleTimelineGroupMove).toHaveBeenCalledWith(movedPair(edits), {
      coalesceKey: "clip-lane-move:7",
    });
  });

  it("omits track attrs for plain timing moves (keeps the SDK fast path eligible)", async () => {
    const edit = { element: element("a", 0), updates: { start: 1, track: 0 } };
    const handleTimelineGroupMove = await runMove([edit], undefined, "timing");
    expect(handleTimelineGroupMove).toHaveBeenCalledWith([{ element: edit.element, start: 1 }], {
      coalesceKey: undefined,
    });
  });

  it("persists the track attr for a single lane reorder (stable track lanes)", async () => {
    // Lane = authored data-track-index; a vertical move that never hits disk
    // snaps back on the next normalize, so the lane change MUST persist.
    const edit = { element: element("a", 0), updates: { start: 1, track: 1 } };
    const handleTimelineGroupMove = await runMove([edit], "clip-lane-move:7", "lane-reorder");
    expect(handleTimelineGroupMove).toHaveBeenCalledWith(
      [{ element: edit.element, start: 1, track: 1 }],
      { coalesceKey: "clip-lane-move:7" },
    );
  });

  it("persists track attrs for a multi-selection lane drag (stable track lanes)", async () => {
    const edits = twoLaneEdits(2);
    const handleTimelineGroupMove = await runMove(edits, "clip-lane-move:7", "lane-reorder");
    expect(handleTimelineGroupMove).toHaveBeenCalledWith(movedPair(edits), {
      coalesceKey: "clip-lane-move:7",
    });
  });

  it("carries explicit detachment through the atomic move", async () => {
    const edit = {
      element: { ...element("voice", 1), audioGroup: "group" },
      updates: { start: 1, track: 0, audioGroup: null },
    };
    const handle = await runMove([edit], "move", "track-insert");
    expect(handle).toHaveBeenCalledWith(
      [{ element: edit.element, start: 1, track: 0, audioGroup: null }],
      { coalesceKey: "move" },
    );
  });

  it("rejects without retrying individual members when the atomic batch fails", async () => {
    const failure = new Error("batch failed");
    const handleTimelineGroupMove = vi.fn().mockRejectedValue(failure);
    await expect(
      persistTimelineMoveEditsAtomically(twoLaneEdits(1), "clip-lane-move:7", "track-insert", {
        handleTimelineGroupMove,
      }),
    ).rejects.toBe(failure);
    expect(handleTimelineGroupMove).toHaveBeenCalledTimes(1);
  });
});
