import type {
  WorkspaceCollabContext,
  WorkspaceInvalidationEventName,
  WorkspaceInvalidationSsePayload,
} from '@open-design/contracts';
import { useEventStream, type UseEventStreamResult } from '../hooks/useEventStream';
import { workspaceResourceUrl } from './workspace-identity';

// Collab realtime hop-2 — the workspace-scoped invalidation SSE
// (`GET /api/workspace/events`). One shared connection for the whole nav shell:
// team-projects, members, context, and billing hooks all subscribe here and
// `useEventStream` multiplexes them onto a SINGLE EventSource (the "one SSE per
// surface" rule), so the shell does not spend four of the browser's ~6-per-host
// connections on realtime.

const WORKSPACE_EVENTS_PATH = '/api/workspace/events';

export function workspaceEventsUrl(
  workspaceContext: WorkspaceCollabContext | null | undefined,
): string | null {
  if (!workspaceContext) return null;
  return workspaceResourceUrl(WORKSPACE_EVENTS_PATH, workspaceContext);
}

/** Thin-event handlers keyed by SSE event name; the payload carries no body, so
 *  each handler is a plain re-fetch trigger. */
export type WorkspaceInvalidationHandlers = {
  [Name in WorkspaceInvalidationEventName]?: (
    payload: Extract<WorkspaceInvalidationSsePayload, { type: Name }>,
  ) => void;
};

export interface UseWorkspaceInvalidationOptions {
  /** Exact selected/project-persisted identity encoded into EventSource URL. */
  workspaceContext: WorkspaceCollabContext | null;
  /** Re-fetch the subscribed resource's snapshot on (re)connect + tab-visible. */
  onActive?: () => void;
  /** When false the hook stays poll-only. Defaults to true. */
  enabled?: boolean;
}

/**
 * Subscribe to the workspace invalidation SSE. Returns `{ connected }` for
 * poll-as-floor gating — the caller keeps its existing poll but slows it while
 * connected and runs it at full cadence while not.
 */
export function useWorkspaceInvalidation(
  handlers: WorkspaceInvalidationHandlers,
  options: UseWorkspaceInvalidationOptions,
): UseEventStreamResult {
  const url = workspaceEventsUrl(options.workspaceContext);
  return useEventStream(url ?? WORKSPACE_EVENTS_PATH, {
    events: handlers as Record<string, (data: unknown) => void>,
    ...(options.onActive ? { onActive: options.onActive } : {}),
    enabled: Boolean(url) && (options.enabled ?? true),
  });
}
