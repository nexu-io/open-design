// Transport home for the project's file-change SSE stream. Wraps the
// existing pure connection manager (`createProjectEventsConnection`, already
// exposed standalone for testability) as a `subscribeX(onEvent): () => void`
// bridge per ADR 0002's browser-subscription pattern — the slice's hook owns
// the enabled/projectId-gating effect itself and only needs the plain
// connect/disconnect primitive from this file.
import { createProjectEventsConnection, type ProjectEvent } from '../project-events';

/** Subscribe to a project's filesystem-change SSE stream. Returns an
 *  unsubscribe. No-ops (and returns a no-op unsubscribe) when `EventSource`
 *  isn't available (SSR / a test environment without it) — the underlying
 *  connection manager already guards for that. */
export function subscribeProjectFileEvents(
  projectId: string,
  onEvent: (evt: ProjectEvent) => void,
): () => void {
  const conn = createProjectEventsConnection(projectId, onEvent);
  return () => conn.close();
}
