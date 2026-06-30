import { describe, expect, it } from "vitest";
import {
  createActivityEvent,
  createRunSession,
  createRunback,
  createTask,
} from "@open-design/creator-domain";
import {
  createRunFinishedEvent,
  createRunStartedEvent,
  createRunbackRecordedEvent,
  createTaskCreatedEvent,
  createTaskUpdatedEvent,
  isCreatorEventEnvelope,
  isCreatorEventType,
  normalizeCreatorEvent,
} from "../src/index.js";

describe("isCreatorEventType", () => {
  it("accepts all valid values", () => {
    for (const value of [
      "task.created",
      "task.updated",
      "activity.recorded",
      "run.started",
      "run.finished",
      "runback.recorded",
    ]) {
      expect(isCreatorEventType(value)).toBe(true);
    }
  });

  it("rejects invalid values", () => {
    expect(isCreatorEventType("task.deleted")).toBe(false);
    expect(isCreatorEventType("")).toBe(false);
    expect(isCreatorEventType(null)).toBe(false);
  });
});

describe("isCreatorEventEnvelope", () => {
  it("accepts a valid base envelope", () => {
    expect(
      isCreatorEventEnvelope({
        id: "evt-1",
        type: "task.created",
        projectId: "p-1",
        occurredAt: "2026-06-29T00:00:00.000Z",
        payload: {},
      }),
    ).toBe(true);
  });

  it("rejects missing or invalid top-level fields", () => {
    expect(
      isCreatorEventEnvelope({
        type: "task.created",
        projectId: "p-1",
        occurredAt: "2026-06-29T00:00:00.000Z",
        payload: {},
      }),
    ).toBe(false);
    expect(
      isCreatorEventEnvelope({
        id: "evt-1",
        type: "task.deleted",
        projectId: "p-1",
        occurredAt: "2026-06-29T00:00:00.000Z",
        payload: {},
      }),
    ).toBe(false);
    expect(
      isCreatorEventEnvelope({
        id: "evt-1",
        type: "task.created",
        projectId: "p-1",
        occurredAt: "2026-06-29T00:00:00.000Z",
        payload: null,
      }),
    ).toBe(false);
  });
});

describe("event factories", () => {
  it("createTaskCreatedEvent keeps task and defaults occurredAt", () => {
    const task = createTask({
      id: "t-1",
      projectId: "p-1",
      title: "Task title",
    });
    const event = createTaskCreatedEvent({
      id: "evt-1",
      projectId: "p-1",
      task,
    });

    expect(event.type).toBe("task.created");
    expect(event.payload.task).toEqual(task);
    expect(typeof event.occurredAt).toBe("string");
  });

  it("createTaskUpdatedEvent keeps previous fields", () => {
    const task = createTask({
      id: "t-2",
      projectId: "p-1",
      title: "Task title",
      stage: "editing",
      status: "ready",
    });
    const event = createTaskUpdatedEvent({
      id: "evt-2",
      projectId: "p-1",
      task,
      previousStatus: "todo",
      previousStage: "topic",
    });

    expect(event.type).toBe("task.updated");
    expect(event.payload.previousStatus).toBe("todo");
    expect(event.payload.previousStage).toBe("topic");
  });

  it("createRunStartedEvent keeps session", () => {
    const session = createRunSession({
      id: "run-1",
      projectId: "p-1",
      workflowId: "wf-1",
      prompt: "start run",
    });
    const event = createRunStartedEvent({
      id: "evt-3",
      projectId: "p-1",
      session,
    });

    expect(event.type).toBe("run.started");
    expect(event.payload.session).toEqual(session);
  });

  it("createRunFinishedEvent keeps finished session", () => {
    const session = createRunSession({
      id: "run-2",
      projectId: "p-1",
      workflowId: "wf-1",
      prompt: "finish run",
      status: "succeeded",
    });
    const event = createRunFinishedEvent({
      id: "evt-4",
      projectId: "p-1",
      session,
    });

    expect(event.type).toBe("run.finished");
    expect(["succeeded", "failed"]).toContain(event.payload.session.status);
  });

  it("createRunbackRecordedEvent keeps triggerSource", () => {
    const runback = createRunback({
      id: "rb-1",
      projectId: "p-1",
      runSessionId: "run-1",
      title: "Rollback",
      triggerSource: { sourceBlock: "task-queue" },
    });
    const event = createRunbackRecordedEvent({
      id: "evt-5",
      projectId: "p-1",
      runback,
    });

    expect(event.type).toBe("runback.recorded");
    expect(event.payload.runback.triggerSource).toEqual({ sourceBlock: "task-queue" });
  });
});

describe("normalizeCreatorEvent", () => {
  it("returns task.created event for valid input", () => {
    const task = createTask({
      id: "t-3",
      projectId: "p-1",
      title: "Task title",
    });
    const input = createTaskCreatedEvent({
      id: "evt-6",
      projectId: "p-1",
      task,
    });

    expect(normalizeCreatorEvent(input)).toEqual(input);
  });

  it("returns run.finished event for valid input", () => {
    const session = createRunSession({
      id: "run-3",
      projectId: "p-1",
      workflowId: "wf-1",
      prompt: "finish run",
      status: "failed",
    });
    const input = createRunFinishedEvent({
      id: "evt-7",
      projectId: "p-1",
      session,
    });

    expect(normalizeCreatorEvent(input)).toEqual(input);
  });

  it("returns null for invalid type", () => {
    expect(
      normalizeCreatorEvent({
        id: "evt-8",
        type: "task.deleted",
        projectId: "p-1",
        occurredAt: "2026-06-29T00:00:00.000Z",
        payload: {},
      }),
    ).toBeNull();
  });

  it("returns null for missing payload", () => {
    expect(
      normalizeCreatorEvent({
        id: "evt-9",
        type: "task.created",
        projectId: "p-1",
        occurredAt: "2026-06-29T00:00:00.000Z",
      }),
    ).toBeNull();
  });

  it("returns null when payload shape does not match type", () => {
    expect(
      normalizeCreatorEvent({
        id: "evt-10",
        type: "activity.recorded",
        projectId: "p-1",
        occurredAt: "2026-06-29T00:00:00.000Z",
        payload: {},
      }),
    ).toBeNull();
  });
});

describe("activity event integration", () => {
  it("supports activity.recorded payload shape", () => {
    const activity = createActivityEvent({
      id: "act-1",
      projectId: "p-1",
      category: "topic",
      title: "Topic selected",
    });

    expect(
      normalizeCreatorEvent({
        id: "evt-11",
        type: "activity.recorded",
        projectId: "p-1",
        occurredAt: "2026-06-29T00:00:00.000Z",
        payload: { activity },
      }),
    ).not.toBeNull();
  });
});
