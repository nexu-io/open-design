import type {
  ActivityEvent,
  RunSession,
  Runback,
  Task,
  TaskStage,
  TaskStatus,
} from "@open-design/creator-domain";
import type {
  ActivityRecordedEvent,
  RunFinishedEvent,
  RunStartedEvent,
  RunbackRecordedEvent,
  TaskCreatedEvent,
  TaskUpdatedEvent,
} from "./types.js";

export function createTaskCreatedEvent(input: {
  id: string;
  projectId: string;
  task: Task;
  occurredAt?: string;
}): TaskCreatedEvent {
  return {
    id: input.id,
    type: "task.created",
    projectId: input.projectId,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    payload: {
      task: input.task,
    },
  };
}

export function createTaskUpdatedEvent(input: {
  id: string;
  projectId: string;
  task: Task;
  previousStatus?: TaskStatus;
  previousStage?: TaskStage;
  occurredAt?: string;
}): TaskUpdatedEvent {
  return {
    id: input.id,
    type: "task.updated",
    projectId: input.projectId,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    payload: {
      task: input.task,
      previousStatus: input.previousStatus,
      previousStage: input.previousStage,
    },
  };
}

export function createActivityRecordedEvent(input: {
  id: string;
  projectId: string;
  activity: ActivityEvent;
  occurredAt?: string;
}): ActivityRecordedEvent {
  return {
    id: input.id,
    type: "activity.recorded",
    projectId: input.projectId,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    payload: {
      activity: input.activity,
    },
  };
}

export function createRunStartedEvent(input: {
  id: string;
  projectId: string;
  session: RunSession;
  occurredAt?: string;
}): RunStartedEvent {
  return {
    id: input.id,
    type: "run.started",
    projectId: input.projectId,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    payload: {
      session: input.session,
    },
  };
}

export function createRunFinishedEvent(input: {
  id: string;
  projectId: string;
  session: RunSession;
  occurredAt?: string;
}): RunFinishedEvent {
  return {
    id: input.id,
    type: "run.finished",
    projectId: input.projectId,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    payload: {
      session: input.session,
    },
  };
}

export function createRunbackRecordedEvent(input: {
  id: string;
  projectId: string;
  runback: Runback;
  occurredAt?: string;
}): RunbackRecordedEvent {
  return {
    id: input.id,
    type: "runback.recorded",
    projectId: input.projectId,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    payload: {
      runback: input.runback,
    },
  };
}
