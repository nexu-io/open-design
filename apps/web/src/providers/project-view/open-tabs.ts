// Transport home for the project's open-tabs persistence (local-cache +
// debounced daemon PUT), reconciled by `updatedAt` in `state/projects.ts`.
import {
  loadTabs as loadTabsTransport,
  cacheTabsLocally as cacheTabsLocallyTransport,
  persistTabsToDaemonNow as persistTabsToDaemonNowTransport,
} from '../../state/projects';
import type { OpenTabsState } from '../../types';

/** Load the project's persisted open-tabs state, reconciling the local cache
 *  against the daemon by `updatedAt`. Best-effort: falls back to the cache
 *  (or an empty state) on failure. */
export async function loadOpenTabs(projectId: string): Promise<OpenTabsState> {
  return loadTabsTransport(projectId);
}

/** Write tab state to the local cache only (synchronous), returning the
 *  `updatedAt`-stamped state. */
export function cacheOpenTabsLocally(projectId: string, state: OpenTabsState): OpenTabsState {
  return cacheTabsLocallyTransport(projectId, state);
}

/** Persist already-stamped tab state to the daemon (the debounced write).
 *  Best-effort: never rejects. */
export async function persistOpenTabsToDaemon(
  projectId: string,
  state: OpenTabsState,
): Promise<void> {
  return persistTabsToDaemonNowTransport(projectId, state);
}
