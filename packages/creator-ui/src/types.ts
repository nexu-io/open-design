import type { CreatorEventType } from "@open-design/creator-events";

export type ActivityItemEventType = Exclude<
  CreatorEventType,
  "task.created" | "task.updated"
>;

export interface TaskCardViewModel {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  stage: string;
  stageLabel: string;
  status: string;
  statusLabel: string;
  priority: string;
  priorityLabel: string;
  sourceType?: string;
  sourceLabel?: string;
  updatedAt: string;
}

export interface ActivityItemViewModel {
  id: string;
  projectId: string;
  /** Present only when this item was derived from a CreatorEvent. */
  eventType?: ActivityItemEventType;
  title: string;
  summary?: string;
  category: string;
  categoryLabel: string;
  occurredAt: string;
  triggerSourceLabel?: string;
}

export interface WorkflowSummaryViewModel {
  id: string;
  name: string;
  description?: string;
  active: boolean;
  activeLabel: string;
  stageCount: number;
  stages: string[];
  stageLabels: string[];
  defaultStage: string;
  defaultStageLabel: string;
}
