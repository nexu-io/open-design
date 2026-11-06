import { useCallback } from "react";
import type { TimelineElement } from "../player";
import type {
  TimelineGroupCommitOptions,
  TimelineGroupMoveChange,
} from "./useTimelineGroupEditing";

export type TimelineAtomicMoveUpdates = Pick<TimelineElement, "start" | "track"> & {
  audioGroup?: null;
};

export interface TimelineAtomicMoveEdit {
  element: TimelineElement;
  updates: TimelineAtomicMoveUpdates;
}

interface AtomicMoveDeps {
  handleTimelineGroupMove: (
    changes: TimelineGroupMoveChange[],
    options?: TimelineGroupCommitOptions,
  ) => Promise<void>;
}

export type TimelineMoveOperation = "timing" | "lane-reorder" | "track-insert";

export type TimelineMoveEditsHandler = (
  edits: TimelineAtomicMoveEdit[],
  coalesceKey?: string,
  operation?: TimelineMoveOperation,
) => Promise<void>;

export function persistTimelineMoveEditsAtomically(
  edits: TimelineAtomicMoveEdit[],
  coalesceKey: string | undefined,
  operation: TimelineMoveOperation,
  deps: AtomicMoveDeps,
): Promise<void> {
  return deps.handleTimelineGroupMove(
    edits.map(({ element, updates }) => ({
      element,
      start: updates.start,
      audioGroup: updates.audioGroup,
      // Stable track lanes: a lane is the authored data-track-index, so every
      // vertical gesture (lane-reorder AND track-insert) must persist the track;
      // z is paint order only and is synced separately. Plain horizontal moves
      // ("timing") omit it so they stay eligible for the SDK fast path.
      track: operation === "timing" ? undefined : updates.track,
    })),
    { coalesceKey },
  );
}

export function useTimelineMoveEditsHandler(
  handleTimelineGroupMove: AtomicMoveDeps["handleTimelineGroupMove"],
): TimelineMoveEditsHandler {
  return useCallback(
    async (edits, coalesceKey, operation: TimelineMoveOperation = "timing") => {
      const deps = { handleTimelineGroupMove };
      await persistTimelineMoveEditsAtomically(edits, coalesceKey, operation, deps);
    },
    [handleTimelineGroupMove],
  );
}
