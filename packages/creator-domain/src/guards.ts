/**
 * Lightweight type guards for domain types.
 * Only the four guards required by the task.
 */

import type { ActivityCategory, TaskStage, TaskStatus, TriggerSource } from "./types.js";

// ---------------------------------------------------------------------------
// TriggerSource
//.---------------------------------------------------------------------------

export function isTriggerSource(value: unknown): value is TriggerSource {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.sourceBlock === "string";
}

// ---------------------------------------------------------------------------
// TaskStage — topic / material / editing / release / review
// ---------------------------------------------------------------------------

const TASK_STAGES: readonly TaskStage[] = [
  "topic",
  "material",
  "editing",
  "release",
  "review",
];

export function isTaskStage(value: unknown): value is TaskStage {
  return typeof value === "string" && TASK_STAGES.includes(value as TaskStage);
}

// ---------------------------------------------------------------------------
// TaskStatus — todo / ready / blocked / done
// ---------------------------------------------------------------------------

const TASK_STATUSES: readonly TaskStatus[] = [
  "todo",
  "ready",
  "blocked",
  "done",
];

export function isTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === "string" && TASK_STATUSES.includes(value as TaskStatus);
}

// ---------------------------------------------------------------------------
// ActivityCategory — topic / material / editing / release / review
// ---------------------------------------------------------------------------

const ACTIVITY_CATEGORIES: readonly ActivityCategory[] = [
  "topic",
  "material",
  "editing",
  "release",
  "review",
];

export function isActivityCategory(value: unknown): value is ActivityCategory {
  return typeof value === "string" && ACTIVITY_CATEGORIES.includes(value as ActivityCategory);
}
