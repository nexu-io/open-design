import {
  PROJECT_CATALOG_CHANGED_EVENT,
  PROJECT_CATALOG_EVENTS_PATH,
} from '@open-design/contracts';
import { useEventStream } from './useEventStream';

/**
 * Re-read the project list whenever the daemon announces a project it created
 * for another client (`od` CLI, MCP bridge), and whenever the stream
 * (re)connects or the window returns to the foreground. The foreground catch-up
 * also covers shells where the stream never connects (an `od://` proxy that
 * buffers SSE), so a missed signal degrades to "refreshes on focus" instead of
 * "needs a manual reload".
 */
export function useProjectCatalogEvents(
  onStale: () => void,
  options: { EventSourceCtor?: typeof EventSource } = {},
) {
  return useEventStream(PROJECT_CATALOG_EVENTS_PATH, {
    events: { [PROJECT_CATALOG_CHANGED_EVENT]: () => onStale() },
    onActive: () => onStale(),
    ...(options.EventSourceCtor ? { EventSourceCtor: options.EventSourceCtor } : {}),
  });
}
