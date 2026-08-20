// Agent task — a project-agnostic, durable unit of work that owns a goal across
// many steps AND across many projects. The same shape answers two deferred needs
// at once: cross-project work and long-horizon (multi-step) work — a task simply
// is not bound to a single project. Pure types only: no runtime logic, no imports
// from apps/daemon/browser/React, and (deliberately) NO project/app UI state — an
// AgentTask is a bounded ownership record, not a `ProjectView`. The runtime that
// creates, persists, and enforces these lands in slice 5 (see
// docs/rfc-drafts/agent-ready-cross-project.md); this file is only the shape.

/**
 * Lifecycle states for an {@link AgentTask}. The `const` array mirrors the house
 * `API_ERROR_CODES` idiom so the union derives from a single source.
 */
export const AGENT_TASK_STATUSES = [
  // Running (or ready to run) its next step.
  'active',
  // Paused pending user consent — e.g. the task tried to touch a project outside
  // its authorized set, or a write requires confirmation (see the companion RFC
  // "Permissions"). Correlates to the reserved `USER_DENIED` action error.
  'awaiting-consent',
  // The goal was reached; the task is terminal.
  'completed',
  // The task stopped on an unrecoverable error; terminal.
  'failed',
  // The user (or system) cancelled the task before completion; terminal.
  'cancelled',
] as const;

export type AgentTaskStatus = (typeof AGENT_TASK_STATUSES)[number];

/**
 * A durable, project-agnostic unit of work. An AgentTask owns a goal that may
 * span several steps and several projects; it is NOT tied to the chat of any one
 * project.
 *
 * `projectIds` is the ownership / blast-radius boundary — the SET of projects
 * this task is authorized to touch — NOT the enforcement mechanism. How that set
 * is granted and widened (explicit allow-list vs just-in-time consent) is the
 * maintainer's separate reviewable decision; see the companion RFC "Permissions".
 * Keeping the boundary as a plain id set (no embedded project state, no roles) is
 * the deliberate guard against re-modeling `ProjectView` here.
 */
export interface AgentTask {
  /** Stable identity for the task; unique within a workspace. */
  taskId: string;
  /** Optional human-readable goal ("Apply our Q3 brand to the pitch deck"). */
  goal?: string;
  /**
   * The projects this task is authorized to act on. Empty means "no project
   * scope granted yet." A step targeting a project not in this set must obtain
   * consent (see the RFC) rather than proceed.
   */
  projectIds: string[];
  /** Current lifecycle state. */
  status: AgentTaskStatus;
}
