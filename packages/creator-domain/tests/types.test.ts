import { describe, expect, it } from "vitest";

import {
  createActivityEvent,
  createProject,
  createRunSession,
  createRunback,
  createTask,
  createWorkflowTemplate,
  isActivityCategory,
  isTaskStage,
  isTaskStatus,
  isTriggerSource,
} from "../src/index.js";

// ---------------------------------------------------------------------------
// isTriggerSource — object shape
// ---------------------------------------------------------------------------

describe("isTriggerSource", () => {
  it("accepts object with sourceBlock", () => {
    expect(isTriggerSource({ sourceBlock: "manual" })).toBe(true);
    expect(isTriggerSource({ sourceBlock: "scheduled", sourceTitle: "Timer" })).toBe(true);
  });

  it("rejects non-object or missing sourceBlock", () => {
    expect(isTriggerSource("manual")).toBe(false);
    expect(isTriggerSource(null)).toBe(false);
    expect(isTriggerSource(42)).toBe(false);
    expect(isTriggerSource({})).toBe(false);
    expect(isTriggerSource({ sourceTitle: "Timer" })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isTaskStage — topic / material / editing / release / review
// ---------------------------------------------------------------------------

describe("isTaskStage", () => {
  it("accepts all valid stages", () => {
    for (const s of ["topic", "material", "editing", "release", "review"]) {
      expect(isTaskStage(s)).toBe(true);
    }
  });

  it("rejects invalid values", () => {
    expect(isTaskStage("planning")).toBe(false);
    expect(isTaskStage("idea")).toBe(false);
    expect(isTaskStage("")).toBe(false);
    expect(isTaskStage(1)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isTaskStatus — todo / ready / blocked / done
// ---------------------------------------------------------------------------

describe("isTaskStatus", () => {
  it("accepts all valid statuses", () => {
    for (const s of ["todo", "ready", "blocked", "done"]) {
      expect(isTaskStatus(s)).toBe(true);
    }
  });

  it("rejects invalid values", () => {
    expect(isTaskStatus("active")).toBe(false);
    expect(isTaskStatus("pending")).toBe(false);
    expect(isTaskStatus("")).toBe(false);
    expect(isTaskStatus(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isActivityCategory — topic / material / editing / release / review
// ---------------------------------------------------------------------------

describe("isActivityCategory", () => {
  it("accepts all valid categories", () => {
    for (const c of ["topic", "material", "editing", "release", "review"]) {
      expect(isActivityCategory(c)).toBe(true);
    }
  });

  it("rejects invalid values", () => {
    expect(isActivityCategory("task")).toBe(false);
    expect(isActivityCategory("edit")).toBe(false);
    expect(isActivityCategory("")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createTask — defaults: stage=topic, status=todo, priority=medium
// ---------------------------------------------------------------------------

describe("createTask", () => {
  it("fills defaults", () => {
    const task = createTask({ id: "t-1", projectId: "p-1", title: "Test" });

    expect(task.stage).toBe("topic");
    expect(task.status).toBe("todo");
    expect(task.priority).toBe("medium");
    expect(task.description).toBeUndefined();
    expect(task.sourceType).toBeUndefined();
    expect(typeof task.createdAt).toBe("string");
    expect(typeof task.updatedAt).toBe("string");
  });

  it("preserves explicit values", () => {
    const task = createTask({
      id: "t-2",
      projectId: "p-1",
      title: "Edit",
      stage: "editing",
      status: "ready",
      priority: "high",
      description: "desc",
      sourceType: "webhook",
    });

    expect(task.stage).toBe("editing");
    expect(task.status).toBe("ready");
    expect(task.priority).toBe("high");
    expect(task.description).toBe("desc");
    expect(task.sourceType).toBe("webhook");
  });
});

// ---------------------------------------------------------------------------
// createRunSession — default status=running
// ---------------------------------------------------------------------------

describe("createRunSession", () => {
  it("defaults status to running", () => {
    const session = createRunSession({
      id: "r-1",
      projectId: "p-1",
      workflowId: "wf-1",
      prompt: "generate landing page",
    });

    expect(session.status).toBe("running");
    expect(session.workflowId).toBe("wf-1");
    expect(session.prompt).toBe("generate landing page");
    expect(typeof session.startedAt).toBe("string");
    expect(session.finishedAt).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// createRunback — preserves triggerSource
// ---------------------------------------------------------------------------

describe("createRunback", () => {
  it("preserves triggerSource when provided", () => {
    const runback = createRunback({
      id: "rb-1",
      projectId: "p-1",
      runSessionId: "r-1",
      title: "Rollback",
      triggerSource: { sourceBlock: "manual" },
    });

    expect(runback.triggerSource).toEqual({ sourceBlock: "manual" });
    expect(runback.title).toBe("Rollback");
    expect(runback.runSessionId).toBe("r-1");
  });

  it("omits triggerSource when not provided", () => {
    const runback = createRunback({
      id: "rb-2",
      projectId: "p-1",
      runSessionId: "r-1",
      title: "Rollback",
    });

    expect(runback.triggerSource).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// createProject — default status=active
// ---------------------------------------------------------------------------

describe("createProject", () => {
  it("fills defaults", () => {
    const project = createProject({ id: "p-1", name: "My Project", slug: "my-project" });

    expect(project.status).toBe("active");
    expect(typeof project.createdAt).toBe("string");
    expect(typeof project.updatedAt).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// createWorkflowTemplate — default active=true
// ---------------------------------------------------------------------------

describe("createWorkflowTemplate", () => {
  it("creates template with stages and defaults active=true", () => {
    const template = createWorkflowTemplate({
      id: "wt-1",
      name: "Default",
      stages: ["topic", "material", "editing", "release", "review"],
    });

    expect(template.active).toBe(true);
    expect(template.stages).toHaveLength(5);
    expect(template.description).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// createActivityEvent — basic shape
// ---------------------------------------------------------------------------

describe("createActivityEvent", () => {
  it("creates event with required fields", () => {
    const event = createActivityEvent({
      id: "ae-1",
      projectId: "p-1",
      category: "topic",
      title: "Topic selected",
    });

    expect(event.category).toBe("topic");
    expect(event.title).toBe("Topic selected");
    expect(event.taskId).toBeUndefined();
    expect(event.summary).toBeUndefined();
    expect(event.triggerSource).toBeUndefined();
  });
});
