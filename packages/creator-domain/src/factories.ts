/**
 * Pure factory functions for creating domain objects.
 * Only fills default values and normalises field shapes.
 * Does not generate ids — callers supply them.
 * No side effects.
 */

import type {
  ActivityCategory,
  ActivityEvent,
  Project,
  Runback,
  RunSession,
  Task,
  TaskStage,
  TaskStatus,
  TriggerSource,
  WorkflowTemplate,
} from "./types.js";

// ---------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------

export function createProject(input: {
  id: string;
  name: string;
  slug: string;
  status?: "active" | "archived";
  createdAt?: string;
  updatedAt?: string;
}): Project {
  const now = new Date().toISOString();
  return {
    id: input.id,
    name: input.name,
    slug: input.slug,
    status: input.status ?? "active",
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  };
}

// ---------------------------------------------------------------------------
// Task
// ---------------------------------------------------------------------------

export function createTask(input: {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  stage?: TaskStage;
  status?: TaskStatus;
  priority?: "low" | "medium" | "high";
  sourceType?: string;
  createdAt?: string;
  updatedAt?: string;
}): Task {
  const now = new Date().toISOString();
  return {
    id: input.id,
    projectId: input.projectId,
    title: input.title,
    description: input.description,
    stage: input.stage ?? "topic",
    status: input.status ?? "todo",
    priority: input.priority ?? "medium",
    sourceType: input.sourceType,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  };
}

// ---------------------------------------------------------------------------
// ActivityEvent
// ---------------------------------------------------------------------------

export function createActivityEvent(input: {
  id: string;
  projectId: string;
  taskId?: string;
  category: ActivityCategory;
  title: string;
  summary?: string;
  createdAt?: string;
  triggerSource?: TriggerSource;
}): ActivityEvent {
  const now = new Date().toISOString();
  return {
    id: input.id,
    projectId: input.projectId,
    taskId: input.taskId,
    category: input.category,
    title: input.title,
    summary: input.summary,
    createdAt: input.createdAt ?? now,
    triggerSource: input.triggerSource,
  };
}

// ---------------------------------------------------------------------------
// RunSession
// ---------------------------------------------------------------------------

export function createRunSession(input: {
  id: string;
  projectId: string;
  workflowId: string;
  prompt: string;
  startedAt?: string;
  finishedAt?: string;
  status?: "running" | "succeeded" | "failed";
}): RunSession {
  const now = new Date().toISOString();
  return {
    id: input.id,
    projectId: input.projectId,
    workflowId: input.workflowId,
    prompt: input.prompt,
    startedAt: input.startedAt ?? now,
    finishedAt: input.finishedAt,
    status: input.status ?? "running",
  };
}

// ---------------------------------------------------------------------------
// Runback
// ---------------------------------------------------------------------------

export function createRunback(input: {
  id: string;
  projectId: string;
  runSessionId: string;
  title: string;
  summary?: string;
  createdAt?: string;
  triggerSource?: TriggerSource;
}): Runback {
  const now = new Date().toISOString();
  return {
    id: input.id,
    projectId: input.projectId,
    runSessionId: input.runSessionId,
    title: input.title,
    summary: input.summary,
    createdAt: input.createdAt ?? now,
    triggerSource: input.triggerSource,
  };
}

// ---------------------------------------------------------------------------
// WorkflowTemplate
// ---------------------------------------------------------------------------

export function createWorkflowTemplate(input: {
  id: string;
  name: string;
  description?: string;
  stages: Array<TaskStage>;
  active?: boolean;
}): WorkflowTemplate {
  return {
    id: input.id,
    name: input.name,
    description: input.description,
    stages: input.stages,
    active: input.active ?? true,
  };
}
