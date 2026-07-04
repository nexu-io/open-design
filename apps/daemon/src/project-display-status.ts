// Authors: Leon Aburime using Claude Fable 5
// @ts-nocheck — carried over verbatim from server.ts's file-level @ts-nocheck.
// The moved bodies are untyped JS-in-TS; typing them is a later effort and new
// sibling code must NOT copy this.
/** @module project-display-status
 * Project run-status display normalization.
 *
 * `normalizeProjectDisplayStatus` collapses the transient 'starting'/'queued'
 * states to 'running' for display; `composeProjectDisplayStatus` layers the
 * 'awaiting_input' override (a succeeded run whose project is waiting on the
 * user) on top of that normalization. Both are pure — they read only their
 * arguments.
 *
 * Extracted verbatim from apps/daemon/src/server.ts (strangler-fig slice 3).
 * server.ts imports both back (deps object) and re-exports them to preserve its
 * public surface.
 */

export function normalizeProjectDisplayStatus(status) {
  return status === 'starting' || status === 'queued' ? 'running' : status;
}

export function composeProjectDisplayStatus(
  baseStatus,
  awaitingInputProjects,
  projectId,
) {
  if (
    baseStatus.value === 'succeeded' &&
    awaitingInputProjects.has(projectId)
  ) {
    return { ...baseStatus, value: 'awaiting_input' };
  }
  return {
    ...baseStatus,
    value: normalizeProjectDisplayStatus(baseStatus.value),
  };
}
