/**
 * Passive Cloud-gate routing decisions (issue #8370).
 *
 * The gate is derived from config and workspace state, so a user-initiated
 * cancellation has to be remembered until the state that caused it changes.
 * A dismissal only suppresses the workspace-credential bounce; an explicit
 * Cloud selection that still needs authentication always returns to the gate.
 */
export type CloudGateInput = {
  usesOpenDesignCloud: boolean;
  amrLoggedIn?: boolean;
  amrSessionState?: string | null;
  workspaceFailure?: string;
  dismissed?: boolean;
};

export function cloudGateDecision(input: CloudGateInput): boolean {
  const workspaceReauth =
    input.workspaceFailure === 'reauth-required' && input.dismissed !== true;
  const cloudReauth = input.usesOpenDesignCloud && (
    input.amrLoggedIn === false || input.amrSessionState === 'reauth_required'
  );
  return workspaceReauth || cloudReauth;
}

export type CloudAuthStatus = { loggedIn?: boolean; sessionState?: string | null } | null;

/**
 * An expired Cloud session keeps `loggedIn: true` with
 * `sessionState: 'reauth_required'`. Auto-picking it would recreate the gate the
 * user just left, so treat it as unusable until reauthenticated.
 */
export function isCloudAgentUsableForAutoPick(status: CloudAuthStatus): boolean {
  if (!status) return true;
  if (status.loggedIn === false) return false;
  if (status.sessionState === 'reauth_required') return false;
  return true;
}
