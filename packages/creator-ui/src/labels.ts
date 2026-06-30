import type { ActivityCategory, TaskStage, TaskStatus } from "@open-design/creator-domain";

// ---------------------------------------------------------------------------
// Lookup tables
// ---------------------------------------------------------------------------

export const taskStageLabels: Record<TaskStage, string> = {
  topic: "选题",
  material: "素材",
  editing: "剪辑",
  release: "发布",
  review: "复盘",
};

export const taskStatusLabels: Record<TaskStatus, string> = {
  todo: "待办",
  ready: "就绪",
  blocked: "阻塞",
  done: "完成",
};

export const taskPriorityLabels: Record<"low" | "medium" | "high", string> = {
  low: "低",
  medium: "中",
  high: "高",
};

export const activityCategoryLabels: Record<ActivityCategory, string> = {
  topic: "选题",
  material: "素材",
  editing: "剪辑",
  release: "发布",
  review: "复盘",
};

// ---------------------------------------------------------------------------
// Label helpers
// ---------------------------------------------------------------------------

export function getTaskStageLabel(stage: TaskStage): string {
  return taskStageLabels[stage] ?? stage;
}

export function getTaskStatusLabel(status: TaskStatus): string {
  return taskStatusLabels[status] ?? status;
}

export function getTaskPriorityLabel(priority: "low" | "medium" | "high"): string {
  return taskPriorityLabels[priority] ?? priority;
}

export function getActivityCategoryLabel(category: ActivityCategory): string {
  return activityCategoryLabels[category] ?? category;
}

export function getWorkflowActiveLabel(active: boolean): string {
  return active ? "启用中" : "已停用";
}

export function getTriggerSourceLabel(source?: { sourceBlock: string; sourceTitle?: string }): string | undefined {
  if (!source) return undefined;
  if (source.sourceTitle !== undefined) {
    return `来源：${source.sourceBlock} / ${source.sourceTitle}`;
  }
  return `来源：${source.sourceBlock}`;
}

export function getSourceTypeLabel(sourceType?: string): string | undefined {
  return sourceType;
}
