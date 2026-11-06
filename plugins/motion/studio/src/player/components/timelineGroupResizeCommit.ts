import type { TimelineElement } from "../store/playerStore";
import type { TimelineEditCallbacks } from "./timelineCallbacks";
import type { TimelineGroupResizeSession } from "./timelineGroupEditing";
import { batchElementUpdates } from "../store/batchElementUpdates";
import {
  beginTimelineOptimisticGesture,
  rollbackLatestTimelineOptimisticGesture,
} from "./timelineOptimisticRevision";

export function commitTimelineGroupResize(
  session: TimelineGroupResizeSession,
  updateElement: (key: string, updates: Partial<TimelineElement>) => void,
  persist: TimelineEditCallbacks["onResizeElements"],
): void {
  if (!session.hasChanged) return;
  const changes = session.changes;
  const revision = beginTimelineOptimisticGesture(
    updateElement,
    changes.map((change) => change.key),
  );
  batchElementUpdates(() => {
    for (const change of changes) {
      updateElement(change.key, {
        start: change.start,
        duration: change.duration,
        playbackStart: change.playbackStart,
      });
    }
  });
  if (!persist) {
    rollbackLatestTimelineOptimisticGesture(
      updateElement,
      revision,
      session.members.map((member) => ({ key: member.key, updates: member })),
    );
    return;
  }
  Promise.resolve(
    persist(
      changes.map((change) => ({
        element: change.element,
        start: change.start,
        duration: change.duration,
        playbackStart: change.playbackStart,
      })),
    ),
  ).catch((error) => {
    rollbackLatestTimelineOptimisticGesture(
      updateElement,
      revision,
      session.members.map((member) => ({ key: member.key, updates: member })),
    );
    console.error("[Timeline] Failed to persist group clip resize", error);
  });
}
