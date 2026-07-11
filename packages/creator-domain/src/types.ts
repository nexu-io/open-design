/**
 * Core domain types for the Creator Workbench.
 *
 * Only type definitions. No persistence, no UI, no execution logic.
 */

// ---------------------------------------------------------------------------
// TriggerSource
// ---------------------------------------------------------------------------

export interface TriggerSource {
  sourceBlock: string;
  sourceTitle?: string;
}

// ---------------------------------------------------------------------------
// TaskStage
// ---------------------------------------------------------------------------

export type TaskStage = "topic" | "material" | "editing" | "release" | "review";

// ---------------------------------------------------------------------------
// TaskStatus
// ---------------------------------------------------------------------------

export type TaskStatus = "todo" | "ready" | "blocked" | "done";

// ---------------------------------------------------------------------------
// ActivityCategory
// ---------------------------------------------------------------------------

export type ActivityCategory = "topic" | "material" | "editing" | "release" | "review";

// ---------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------

export interface Project {
  id: string;
  name: string;
  slug: string;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Task
// ---------------------------------------------------------------------------

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  stage: TaskStage;
  status: TaskStatus;
  priority: "low" | "medium" | "high";
  sourceType?: string;
  blockerNote?: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// ActivityEvent
// ---------------------------------------------------------------------------

export interface ActivityEvent {
  id: string;
  projectId: string;
  taskId?: string;
  category: ActivityCategory;
  title: string;
  summary?: string;
  createdAt: string;
  triggerSource?: TriggerSource;
}

// ---------------------------------------------------------------------------
// RunSession
// ---------------------------------------------------------------------------

export interface RunSession {
  id: string;
  projectId: string;
  workflowId: string;
  prompt: string;
  startedAt: string;
  finishedAt?: string;
  status: "running" | "succeeded" | "failed";
}

// ---------------------------------------------------------------------------
// Runback
// ---------------------------------------------------------------------------

export interface Runback {
  id: string;
  projectId: string;
  runSessionId: string;
  title: string;
  summary?: string;
  createdAt: string;
  triggerSource?: TriggerSource;
}

// ---------------------------------------------------------------------------
// WorkflowTemplate
// ---------------------------------------------------------------------------

export interface WorkflowTemplate {
  id: string;
  name: string;
  description?: string;
  stages: Array<TaskStage>;
  active: boolean;
}
