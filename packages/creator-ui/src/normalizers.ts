import type { ActivityItemViewModel, TaskCardViewModel, WorkflowSummaryViewModel } from "./types.js";

// ---------------------------------------------------------------------------
// Shape guards (plain objects, no domain dependency)
// ---------------------------------------------------------------------------

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const activityItemEventTypes = [
  "activity.recorded",
  "run.started",
  "run.finished",
  "runback.recorded",
] as const;

function hasValidActivityItemEventType(record: Record<string, unknown>): boolean {
  const eventType = record.eventType;
  return eventType === undefined || activityItemEventTypes.includes(
    eventType as (typeof activityItemEventTypes)[number],
  );
}

function hasStringFields(record: Record<string, unknown>, fields: string[]): boolean {
  return fields.every((field) => typeof record[field] === "string");
}

function hasOptionalStringFields(
  record: Record<string, unknown>,
  fields: string[],
): boolean {
  return fields.every(
    (field) => record[field] === undefined || typeof record[field] === "string",
  );
}

// ---------------------------------------------------------------------------
// TaskCardViewModel
// ---------------------------------------------------------------------------

export function normalizeTaskCardViewModel(input: unknown): TaskCardViewModel | null {
  if (!isObjectRecord(input)) return null;
  if (!hasStringFields(input, ["id", "projectId", "title", "stage", "stageLabel", "status", "statusLabel", "priority", "priorityLabel", "updatedAt"])) return null;
  if (!hasOptionalStringFields(input, ["description", "sourceType", "sourceLabel", "blockerNote"])) return null;
  return input as unknown as TaskCardViewModel;
}

// ---------------------------------------------------------------------------
// ActivityItemViewModel
// ---------------------------------------------------------------------------

export function normalizeActivityItemViewModel(input: unknown): ActivityItemViewModel | null {
  if (!isObjectRecord(input)) return null;
  if (!hasStringFields(input, ["id", "projectId", "title", "category", "categoryLabel", "occurredAt"])) return null;
  if (!hasOptionalStringFields(input, ["eventType", "summary", "triggerSourceLabel"])) return null;
  if (!hasValidActivityItemEventType(input)) return null;
  return input as unknown as ActivityItemViewModel;
}

// ---------------------------------------------------------------------------
// WorkflowSummaryViewModel
// ---------------------------------------------------------------------------

export function normalizeWorkflowSummaryViewModel(input: unknown): WorkflowSummaryViewModel | null {
  if (!isObjectRecord(input)) return null;
  if (!hasStringFields(input, ["id", "name", "activeLabel", "defaultStage", "defaultStageLabel"])) return null;
  if (typeof input.active !== "boolean") return null;
  if (!Array.isArray(input.stages)) return null;
  if (!input.stages.every((s) => typeof s === "string")) return null;
  if (!Array.isArray(input.stageLabels)) return null;
  if (!input.stageLabels.every((s) => typeof s === "string")) return null;
  if (typeof input.stageCount !== "number") return null;
  if (!hasOptionalStringFields(input, ["description"])) return null;
  return input as unknown as WorkflowSummaryViewModel;
}
