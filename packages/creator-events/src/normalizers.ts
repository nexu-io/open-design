import {
  isActivityRecordedEvent,
  isCreatorEventEnvelope,
  isRunFinishedEvent,
  isRunStartedEvent,
  isRunbackRecordedEvent,
  isTaskCreatedEvent,
  isTaskUpdatedEvent,
} from "./guards.js";
import type { CreatorEvent } from "./types.js";

export function normalizeCreatorEvent(input: unknown): CreatorEvent | null {
  if (!isCreatorEventEnvelope(input)) return null;

  switch (input.type) {
    case "task.created":
      return isTaskCreatedEvent(input) ? input : null;
    case "task.updated":
      return isTaskUpdatedEvent(input) ? input : null;
    case "activity.recorded":
      return isActivityRecordedEvent(input) ? input : null;
    case "run.started":
      return isRunStartedEvent(input) ? input : null;
    case "run.finished":
      return isRunFinishedEvent(input) ? input : null;
    case "runback.recorded":
      return isRunbackRecordedEvent(input) ? input : null;
    default:
      return null;
  }
}
