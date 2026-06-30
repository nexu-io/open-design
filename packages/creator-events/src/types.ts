import type {
  ActivityEvent,
  RunSession,
  Runback,
  Task,
  TaskStage,
  TaskStatus,
} from "@open-design/creator-domain";

export type CreatorEventType =
  | "task.created"
  | "task.updated"
  | "activity.recorded"
  | "run.started"
  | "run.finished"
  | "runback.recorded";

export interface CreatorEventEnvelope<
  TType extends CreatorEventType,
  TPayload,
> {
  id: string;
  type: TType;
  projectId: string;
  occurredAt: string;
  payload: TPayload;
}

export interface TaskCreatedPayload {
  task: Task;
}

export interface TaskUpdatedPayload {
  task: Task;
  previousStatus?: TaskStatus;
  previousStage?: TaskStage;
}

export interface ActivityRecordedPayload {
  activity: ActivityEvent;
}

export interface RunStartedPayload {
  session: RunSession;
}

export interface RunFinishedPayload {
  session: RunSession;
}

export interface RunbackRecordedPayload {
  runback: Runback;
}

export type TaskCreatedEvent = CreatorEventEnvelope<"task.created", TaskCreatedPayload>;
export type TaskUpdatedEvent = CreatorEventEnvelope<"task.updated", TaskUpdatedPayload>;
export type ActivityRecordedEvent = CreatorEventEnvelope<
  "activity.recorded",
  ActivityRecordedPayload
>;
export type RunStartedEvent = CreatorEventEnvelope<"run.started", RunStartedPayload>;
export type RunFinishedEvent = CreatorEventEnvelope<"run.finished", RunFinishedPayload>;
export type RunbackRecordedEvent = CreatorEventEnvelope<
  "runback.recorded",
  RunbackRecordedPayload
>;

export type CreatorEvent =
  | TaskCreatedEvent
  | TaskUpdatedEvent
  | ActivityRecordedEvent
  | RunStartedEvent
  | RunFinishedEvent
  | RunbackRecordedEvent;
