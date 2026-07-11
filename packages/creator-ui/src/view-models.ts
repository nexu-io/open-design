import type { ActivityEvent, Task, TaskStage } from "@open-design/creator-domain";
import type { CreatorEvent } from "@open-design/creator-events";
import type { WorkflowDefinition } from "@open-design/creator-workflows";
import type { ActivityItemViewModel, TaskCardViewModel, WorkflowSummaryViewModel } from "./types.js";
import {
  getActivityCategoryLabel,
  getSourceTypeLabel,
  getTaskPriorityLabel,
  getTaskStageLabel,
  getTaskStatusLabel,
  getTriggerSourceLabel,
  getWorkflowActiveLabel,
} from "./labels.js";

// ---------------------------------------------------------------------------
// TaskCardViewModel
// ---------------------------------------------------------------------------

export function toTaskCardViewModel(task: Task): TaskCardViewModel {
  return {
    id: task.id,
    projectId: task.projectId,
    title: task.title,
    description: task.description,
    stage: task.stage,
    stageLabel: getTaskStageLabel(task.stage),
    status: task.status,
    statusLabel: getTaskStatusLabel(task.status),
    priority: task.priority,
    priorityLabel: getTaskPriorityLabel(task.priority),
    sourceType: task.sourceType,
    sourceLabel: getSourceTypeLabel(task.sourceType),
    blockerNote: task.blockerNote,
    updatedAt: task.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// ActivityItemViewModel
// ---------------------------------------------------------------------------

export function toActivityItemViewModelFromActivity(activity: ActivityEvent): ActivityItemViewModel {
  return {
    id: activity.id,
    projectId: activity.projectId,
    title: activity.title,
    summary: activity.summary ?? "",
    category: activity.category,
    categoryLabel: getActivityCategoryLabel(activity.category),
    occurredAt: activity.createdAt,
    triggerSourceLabel: getTriggerSourceLabel(activity.triggerSource),
  };
}

export function toActivityItemViewModelFromEvent(event: CreatorEvent): ActivityItemViewModel | null {
  if (event.type === "task.created" || event.type === "task.updated") {
    return null;
  }

  if (event.type === "activity.recorded") {
    const activity = event.payload.activity;
    return {
      id: `activity.recorded:${activity.id}`,
      projectId: activity.projectId,
      eventType: event.type,
      title: activity.title,
      summary: activity.summary ?? "",
      category: activity.category,
      categoryLabel: getActivityCategoryLabel(activity.category),
      occurredAt: event.occurredAt,
      triggerSourceLabel: getTriggerSourceLabel(activity.triggerSource),
    };
  }

  if (event.type === "run.started") {
    const session = event.payload.session;
    return {
      id: `run.started:${session.id}`,
      projectId: session.projectId,
      eventType: event.type,
      title: "运行开始",
      summary: "",
      category: "system",
      categoryLabel: "系统",
      occurredAt: event.occurredAt,
      triggerSourceLabel: undefined,
    };
  }

  if (event.type === "run.finished") {
    const session = event.payload.session;
    return {
      id: `run.finished:${session.id}`,
      projectId: session.projectId,
      eventType: event.type,
      title: "运行完成",
      summary: "",
      category: "system",
      categoryLabel: "系统",
      occurredAt: event.occurredAt,
      triggerSourceLabel: undefined,
    };
  }

  if (event.type === "runback.recorded") {
    const runback = event.payload.runback;
    return {
      id: `runback.recorded:${runback.id}`,
      projectId: runback.projectId,
      eventType: event.type,
      title: runback.title,
      summary: "",
      category: "system",
      categoryLabel: "系统",
      occurredAt: event.occurredAt,
      triggerSourceLabel: undefined,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// WorkflowSummaryViewModel
// ---------------------------------------------------------------------------

export function toWorkflowSummaryViewModel(definition: WorkflowDefinition): WorkflowSummaryViewModel {
  const template = definition.template;
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    active: template.active,
    activeLabel: getWorkflowActiveLabel(template.active),
    stageCount: template.stages.length,
    stages: template.stages,
    stageLabels: template.stages.map(getTaskStageLabel),
    defaultStage: definition.defaultStage,
    defaultStageLabel: getTaskStageLabel(definition.defaultStage),
  };
}
