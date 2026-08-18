import type { WorkspaceContextState } from '../collab/useWorkspaceContext';

export type EntryRailAccountFooterState = 'hidden' | 'syncing' | 'recovering' | 'sign-in';

export function requiresAmrReauthentication(
  amrSessionState: import('@open-design/contracts').AmrSessionState | undefined,
  workspaceFailure: WorkspaceContextState['failure'],
): boolean {
  return amrSessionState === 'reauth_required' || workspaceFailure === 'reauth-required';
}

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
  amrSessionState?: import('@open-design/contracts').AmrSessionState,
): EntryRailAccountFooterState {
  if (requiresAmrReauthentication(amrSessionState, workspaceState.failure)) return 'sign-in';
  if (workspaceState.context) return 'hidden';
  if (workspaceState.loading) return 'syncing';
  if (
    workspaceState.failure === 'unavailable'
    && amrLoggedIn !== false
  ) {
    return 'recovering';
  }
  return 'sign-in';
}
