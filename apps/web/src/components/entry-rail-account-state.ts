import type { WorkspaceContextState } from '../collab/useWorkspaceContext';

export type EntryRailAccountFooterState = 'hidden' | 'syncing' | 'sign-in';

/**
 * Decide what the rail may claim about the Cloud account.
 *
 * A successful workspace response with `context: null` is authoritative:
 * Cloud is reachable and says there is no active workspace identity, so the
 * sign-in entry belongs on screen. A transient outage is not an identity
 * answer. While Cloud is unreachable, keep the last resolved workspace (the
 * hook does this when one exists) or show the neutral syncing placeholder for
 * a locally signed-in/unknown account instead of falsely claiming sign-out.
 */
export function resolveEntryRailAccountFooterState(
  workspaceState: WorkspaceContextState,
  amrLoggedIn: boolean | null | undefined,
): EntryRailAccountFooterState {
  if (workspaceState.context) return 'hidden';
  if (workspaceState.loading) return 'syncing';
  if (
    workspaceState.failure === 'unavailable'
    && amrLoggedIn !== false
  ) {
    return 'syncing';
  }
  return 'sign-in';
}
