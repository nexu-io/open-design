import type {
  ActivityRecordedEvent,
  CreatorEventEnvelope,
  CreatorEventType,
  RunFinishedEvent,
  RunStartedEvent,
  RunbackRecordedEvent,
  TaskCreatedEvent,
  TaskUpdatedEvent,
} from "./types.js";

const CREATOR_EVENT_TYPES: readonly CreatorEventType[] = [
  "task.created",
  "task.updated",
  "activity.recorded",
  "run.started",
  "run.finished",
  "runback.recorded",
];

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isCreatorEventType(value: unknown): value is CreatorEventType {
  return typeof value === "string" && CREATOR_EVENT_TYPES.includes(value as CreatorEventType);
}

export function isCreatorEventEnvelope(
  value: unknown,
): value is CreatorEventEnvelope<CreatorEventType, object> {
  if (!isObjectRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    isCreatorEventType(value.type) &&
    typeof value.projectId === "string" &&
    typeof value.occurredAt === "string" &&
    isObjectRecord(value.payload)
  );
}

export function isTaskCreatedEvent(value: unknown): value is TaskCreatedEvent {
  if (!isCreatorEventEnvelope(value) || value.type !== "task.created") return false;
  return "task" in value.payload && isObjectRecord(value.payload.task);
}

export function isTaskUpdatedEvent(value: unknown): value is TaskUpdatedEvent {
  if (!isCreatorEventEnvelope(value) || value.type !== "task.updated") return false;
  return "task" in value.payload && isObjectRecord(value.payload.task);
}

export function isActivityRecordedEvent(value: unknown): value is ActivityRecordedEvent {
  if (!isCreatorEventEnvelope(value) || value.type !== "activity.recorded") return false;
  return "activity" in value.payload && isObjectRecord(value.payload.activity);
}

export function isRunStartedEvent(value: unknown): value is RunStartedEvent {
  if (!isCreatorEventEnvelope(value) || value.type !== "run.started") return false;
  return "session" in value.payload && isObjectRecord(value.payload.session);
}

export function isRunFinishedEvent(value: unknown): value is RunFinishedEvent {
  if (!isCreatorEventEnvelope(value) || value.type !== "run.finished") return false;
  return "session" in value.payload && isObjectRecord(value.payload.session);
}

export function isRunbackRecordedEvent(value: unknown): value is RunbackRecordedEvent {
  if (!isCreatorEventEnvelope(value) || value.type !== "runback.recorded") return false;
  return "runback" in value.payload && isObjectRecord(value.payload.runback);
}
