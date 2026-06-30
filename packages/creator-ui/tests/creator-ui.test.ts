import { describe, expect, it } from "vitest";
import {
  getActivityCategoryLabel,
  getPriorityLabel,
  getSourceTypeLabel,
  getTaskPriorityLabel,
  getTaskStageLabel,
  getTaskStatusLabel,
  getTriggerSourceLabel,
  getWorkflowActiveLabel,
} from "../src/labels.js";
import {
  toActivityItemViewModelFromActivity,
  toActivityItemViewModelFromEvent,
  toTaskCardViewModel,
  toWorkflowSummaryViewModel,
} from "../src/view-models.js";
import {
  normalizeActivityItemViewModel,
  normalizeTaskCardViewModel,
  normalizeWorkflowSummaryViewModel,
} from "../src/normalizers.js";
import type {
  ActivityEvent,
  Task,
  WorkflowDefinition,
} from "@open-design/creator-domain";

// ---------------------------------------------------------------------------
// Label helpers
// ---------------------------------------------------------------------------

describe("getTaskStageLabel", () => {
  it("returns Chinese label for each stage", () => {
    expect(getTaskStageLabel("topic")).toBe("选题");
    expect(getTaskStageLabel("material")).toBe("素材");
    expect(getTaskStageLabel("editing")).toBe("剪辑");
    expect(getTaskStageLabel("release")).toBe("发布");
    expect(getTaskStageLabel("review")).toBe("复盘");
  });

  it("falls back to raw value for unknown stage", () => {
    expect(getTaskStageLabel("unknown" as any)).toBe("unknown");
  });
});

describe("getTaskStatusLabel", () => {
  it("returns Chinese label for each status", () => {
    expect(getTaskStatusLabel("todo")).toBe("待办");
    expect(getTaskStatusLabel("ready")).toBe("就绪");
    expect(getTaskStatusLabel("blocked")).toBe("阻塞");
    expect(getTaskStatusLabel("done")).toBe("完成");
  });

  it("falls back to raw value for unknown status", () => {
    expect(getTaskStatusLabel("unknown" as any)).toBe("unknown");
  });
});

describe("getTaskPriorityLabel", () => {
  it("returns Chinese label for each priority", () => {
    expect(getTaskPriorityLabel("low")).toBe("低");
    expect(getTaskPriorityLabel("medium")).toBe("中");
    expect(getTaskPriorityLabel("high")).toBe("高");
  });

  it("falls back to raw value for unknown priority", () => {
    expect(getTaskPriorityLabel("unknown" as any)).toBe("unknown");
  });
});

describe("getActivityCategoryLabel", () => {
  it("returns Chinese label for each category", () => {
    expect(getActivityCategoryLabel("topic")).toBe("选题");
    expect(getActivityCategoryLabel("material")).toBe("素材");
    expect(getActivityCategoryLabel("editing")).toBe("剪辑");
    expect(getActivityCategoryLabel("release")).toBe("发布");
    expect(getActivityCategoryLabel("review")).toBe("复盘");
  });

  it("falls back to raw value for unknown category", () => {
    expect(getActivityCategoryLabel("unknown" as any)).toBe("unknown");
  });
});

describe("getWorkflowActiveLabel", () => {
  it("returns 启用中 for true", () => {
    expect(getWorkflowActiveLabel(true)).toBe("启用中");
  });

  it("returns 已停用 for false", () => {
    expect(getWorkflowActiveLabel(false)).toBe("已停用");
  });
});

describe("getTriggerSourceLabel", () => {
  it("returns undefined for undefined input", () => {
    expect(getTriggerSourceLabel(undefined)).toBeUndefined();
  });

  it("returns 来源：{sourceBlock} when only sourceBlock present", () => {
    expect(getTriggerSourceLabel({ sourceBlock: "manual" })).toBe("来源：manual");
  });

  it("returns 来源：{sourceBlock} / {sourceTitle} when both present", () => {
    expect(getTriggerSourceLabel({ sourceBlock: "manual", sourceTitle: "Timer" })).toBe("来源：manual / Timer");
  });
});

describe("getSourceTypeLabel", () => {
  it("returns sourceType as-is (passthrough)", () => {
    expect(getSourceTypeLabel("manual")).toBe("manual");
    expect(getSourceTypeLabel("webhook")).toBe("webhook");
    expect(getSourceTypeLabel("custom")).toBe("custom");
  });

  it("returns undefined for undefined input", () => {
    expect(getSourceTypeLabel(undefined)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// toTaskCardViewModel
// ---------------------------------------------------------------------------

describe("toTaskCardViewModel", () => {
  const task: Task = {
    id: "t-1",
    projectId: "p-1",
    title: "Test Task",
    description: "A description",
    stage: "topic",
    status: "todo",
    priority: "high",
    sourceType: "manual",
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-02T00:00:00Z",
  };

  it("maps all fields with computed labels", () => {
    const vm = toTaskCardViewModel(task);
    expect(vm.id).toBe("t-1");
    expect(vm.projectId).toBe("p-1");
    expect(vm.title).toBe("Test Task");
    expect(vm.description).toBe("A description");
    expect(vm.stage).toBe("topic");
    expect(vm.stageLabel).toBe("选题");
    expect(vm.status).toBe("todo");
    expect(vm.statusLabel).toBe("待办");
    expect(vm.priority).toBe("high");
    expect(vm.priorityLabel).toBe("高");
    expect(vm.sourceType).toBe("manual");
    expect(vm.sourceLabel).toBe("manual");
    expect(vm.updatedAt).toBe("2025-01-02T00:00:00Z");
  });

  it("returns undefined sourceLabel when sourceType is absent", () => {
    const noSource: Task = {
      ...task,
      sourceType: undefined,
    };
    const vm = toTaskCardViewModel(noSource);
    expect(vm.sourceType).toBeUndefined();
    expect(vm.sourceLabel).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// toActivityItemViewModelFromActivity
// ---------------------------------------------------------------------------

describe("toActivityItemViewModelFromActivity", () => {
  const activity: ActivityEvent = {
    id: "a-1",
    projectId: "p-1",
    taskId: "t-1",
    category: "topic",
    title: "Research done",
    summary: "Detailed summary",
    createdAt: "2025-01-01T00:00:00Z",
    triggerSource: { sourceBlock: "manual", sourceTitle: "Timer" },
  };

  it("maps all fields with category and categoryLabel", () => {
    const vm = toActivityItemViewModelFromActivity(activity);
    expect(vm.id).toBe("a-1");
    expect(vm.projectId).toBe("p-1");
    expect(vm.title).toBe("Research done");
    expect(vm.summary).toBe("Detailed summary");
    expect(vm.category).toBe("topic");
    expect(vm.categoryLabel).toBe("选题");
    expect(vm.occurredAt).toBe("2025-01-01T00:00:00Z");
    expect(vm.triggerSourceLabel).toBe("来源：manual / Timer");
  });

  it("returns empty summary when activity has none", () => {
    const noSummary: ActivityEvent = {
      ...activity,
      summary: undefined,
      triggerSource: undefined,
    };
    const vm = toActivityItemViewModelFromActivity(noSummary);
    expect(vm.summary).toBe("");
    expect(vm.triggerSourceLabel).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// toActivityItemViewModelFromEvent
// ---------------------------------------------------------------------------

describe("toActivityItemViewModelFromEvent", () => {
  const baseEnvelope = {
    projectId: "p-1",
    occurredAt: "2025-01-01T00:00:00Z",
  };

  it("returns null for task.created", () => {
    const input = {
      type: "task.created" as const,
      id: "e-1",
      ...baseEnvelope,
      payload: { task: {
        id: "t-1", projectId: "p-1", title: "New", stage: "topic",
        status: "todo", priority: "medium", createdAt: "2025-01-01T00:00:00Z", updatedAt: "2025-01-01T00:00:00Z",
      }},
    };
    expect(toActivityItemViewModelFromEvent(input)).toBeNull();
  });

  it("returns null for task.updated", () => {
    const input = {
      type: "task.updated" as const,
      id: "e-2",
      ...baseEnvelope,
      payload: { task: {
        id: "t-1", projectId: "p-1", title: "New", stage: "topic",
        status: "todo", priority: "medium", createdAt: "2025-01-01T00:00:00Z", updatedAt: "2025-01-01T00:00:00Z",
      }},
    };
    expect(toActivityItemViewModelFromEvent(input)).toBeNull();
  });

  it("converts activity.recorded using payload activity and event.occurredAt", () => {
    const input = {
      type: "activity.recorded" as const,
      id: "e-3",
      ...baseEnvelope,
      payload: { activity: {
        id: "a-1", projectId: "p-1", category: "topic",
        title: "Research", summary: "Done", createdAt: "2025-01-01T00:00:00Z",
        triggerSource: { sourceBlock: "manual" },
      }},
    };
    const vm = toActivityItemViewModelFromEvent(input);
    expect(vm).not.toBeNull();
    expect(vm!.projectId).toBe("p-1");
    expect(vm!.title).toBe("Research");
    expect(vm!.summary).toBe("Done");
    expect(vm!.category).toBe("topic");
    expect(vm!.categoryLabel).toBe("选题");
    expect(vm!.occurredAt).toBe("2025-01-01T00:00:00Z");
    expect(vm!.triggerSourceLabel).toBe("来源：manual");
  });

  it("converts run.started with fixed title and system category", () => {
    const input = {
      type: "run.started" as const,
      id: "e-4",
      ...baseEnvelope,
      payload: { session: {
        id: "s-1", projectId: "p-1", workflowId: "w-1",
        prompt: "test", startedAt: "2025-01-01T00:00:00Z",
      }},
    };
    const vm = toActivityItemViewModelFromEvent(input);
    expect(vm).not.toBeNull();
    expect(vm!.projectId).toBe("p-1");
    expect(vm!.title).toBe("运行开始");
    expect(vm!.category).toBe("system");
    expect(vm!.categoryLabel).toBe("系统");
    expect(vm!.summary).toBe("");
    expect(vm!.triggerSourceLabel).toBeUndefined();
  });

  it("converts run.finished with fixed title and system category", () => {
    const input = {
      type: "run.finished" as const,
      id: "e-5",
      ...baseEnvelope,
      payload: { session: {
        id: "s-2", projectId: "p-1", workflowId: "w-1",
        prompt: "test", startedAt: "2025-01-01T00:00:00Z", finishedAt: "2025-01-02T00:00:00Z",
      }},
    };
    const vm = toActivityItemViewModelFromEvent(input);
    expect(vm).not.toBeNull();
    expect(vm!.projectId).toBe("p-1");
    expect(vm!.title).toBe("运行完成");
    expect(vm!.category).toBe("system");
    expect(vm!.categoryLabel).toBe("系统");
  });

  it("converts runback.recorded with runback title and system category", () => {
    const input = {
      type: "runback.recorded" as const,
      id: "e-6",
      ...baseEnvelope,
      payload: { runback: {
        id: "rb-1", projectId: "p-1", runSessionId: "r-1",
        title: "Runback A", createdAt: "2025-01-01T00:00:00Z",
      }},
    };
    const vm = toActivityItemViewModelFromEvent(input);
    expect(vm).not.toBeNull();
    expect(vm!.projectId).toBe("p-1");
    expect(vm!.title).toBe("Runback A");
    expect(vm!.category).toBe("system");
    expect(vm!.categoryLabel).toBe("系统");
  });
});

// ---------------------------------------------------------------------------
// toWorkflowSummaryViewModel
// ---------------------------------------------------------------------------

describe("toWorkflowSummaryViewModel", () => {
  const definition: WorkflowDefinition = {
    template: {
      id: "w-1",
      name: "Video Pipeline",
      description: "Standard video workflow",
      stages: ["topic", "material", "editing", "release"],
      active: true,
    },
    defaultStage: "topic",
    triggers: [],
    transitions: [],
  };

  it("maps all fields with computed labels and raw stages", () => {
    const vm = toWorkflowSummaryViewModel(definition);
    expect(vm.id).toBe("w-1");
    expect(vm.name).toBe("Video Pipeline");
    expect(vm.description).toBe("Standard video workflow");
    expect(vm.active).toBe(true);
    expect(vm.activeLabel).toBe("启用中");
    expect(vm.stageCount).toBe(4);
    expect(vm.stages).toEqual(["topic", "material", "editing", "release"]);
    expect(vm.stageLabels).toEqual(["选题", "素材", "剪辑", "发布"]);
    expect(vm.defaultStage).toBe("topic");
    expect(vm.defaultStageLabel).toBe("选题");
  });

  it("returns 已停用 label for inactive workflow", () => {
    const inactive: WorkflowDefinition = {
      ...definition,
      template: { ...definition.template, active: false },
    };
    const vm = toWorkflowSummaryViewModel(inactive);
    expect(vm.activeLabel).toBe("已停用");
  });
});

// ---------------------------------------------------------------------------
// Normalizers
// ---------------------------------------------------------------------------

describe("normalizeTaskCardViewModel", () => {
  const validVm: TaskCardViewModel = {
    id: "t-1",
    projectId: "p-1",
    title: "Test",
    stage: "topic",
    stageLabel: "选题",
    status: "todo",
    statusLabel: "待办",
    priority: "high",
    priorityLabel: "高",
    updatedAt: "2025-01-01T00:00:00Z",
  };

  it("returns the same object when shape is valid", () => {
    const result = normalizeTaskCardViewModel(validVm);
    expect(result).toBe(validVm);
  });

  it("returns null when required field is missing", () => {
    expect(normalizeTaskCardViewModel({ ...validVm, id: 123 })).toBeNull();
  });

  it("returns null for non-object input", () => {
    expect(normalizeTaskCardViewModel(null)).toBeNull();
    expect(normalizeTaskCardViewModel("string")).toBeNull();
    expect(normalizeTaskCardViewModel({})).toBeNull();
  });
});

describe("normalizeActivityItemViewModel", () => {
  const validVm: ActivityItemViewModel = {
    id: "a-1",
    projectId: "p-1",
    title: "Test",
    category: "topic",
    categoryLabel: "选题",
    occurredAt: "2025-01-01T00:00:00Z",
  };

  it("returns the same object when shape is valid", () => {
    const result = normalizeActivityItemViewModel(validVm);
    expect(result).toBe(validVm);
  });

  it("returns null when category is missing", () => {
    const { category, ...rest } = validVm;
    expect(normalizeActivityItemViewModel(rest)).toBeNull();
  });

  it("returns null for non-object input", () => {
    expect(normalizeActivityItemViewModel(null)).toBeNull();
    expect(normalizeActivityItemViewModel("string")).toBeNull();
  });
});

describe("normalizeWorkflowSummaryViewModel", () => {
  const validVm: WorkflowSummaryViewModel = {
    id: "w-1",
    name: "Pipeline",
    active: true,
    activeLabel: "启用中",
    stageCount: 4,
    stages: ["topic", "editing"],
    stageLabels: ["选题", "剪辑"],
    defaultStage: "topic",
    defaultStageLabel: "选题",
  };

  it("returns the same object when shape is valid", () => {
    const result = normalizeWorkflowSummaryViewModel(validVm);
    expect(result).toBe(validVm);
  });

  it("returns null when stages is not an array", () => {
    expect(normalizeWorkflowSummaryViewModel({ ...validVm, stages: "topic" })).toBeNull();
  });

  it("returns null when active is not a boolean", () => {
    expect(normalizeWorkflowSummaryViewModel({ ...validVm, active: "true" })).toBeNull();
  });

  it("returns null for non-object input", () => {
    expect(normalizeWorkflowSummaryViewModel(null)).toBeNull();
    expect(normalizeWorkflowSummaryViewModel({})).toBeNull();
  });
});
