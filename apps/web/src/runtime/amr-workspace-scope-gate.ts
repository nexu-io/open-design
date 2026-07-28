// Why an Open Design Cloud project run is held closed, and which remedy clears
// it.
//
// The gate itself lives in ProjectView: an AMR run may only start once the
// daemon has resolved the project's personal/team workspace authority, because
// that authority is what the final spawn bills against (`21f452ffe`). Failing
// closed there is deliberate and stays. Failing closed SILENTLY is the bug this
// module exists to prevent: the send button went dead with no reason on screen
// and no way out, while Home's equivalent dead end (`checkAmrBalanceGate` ->
// `AmrBalanceDialog` reason `signed_out`) hands the user an in-app sign-in.
//
// This is a classifier, not a second gate: it never decides whether the send is
// allowed, only how to explain a send that is already blocked.

import type { WorkspaceContextState } from '../collab/useWorkspaceContext';
import {
  projectWorkspaceScopeAuthorizesAmr,
  type ProjectWorkspaceScopeState,
} from '../collab/useProjectWorkspaceScope';

/**
 * A blocked AMR composer, tagged by the remedy that clears it.
 *
 * `signed_out` — no Open Design Cloud session exists, so no workspace can own
 *   the run. Cleared by signing in (the same action Home's balance gate uses).
 * `unresolved` — a session exists (or its existence is itself unknown), but the
 *   project's workspace authority did not resolve: an old daemon, a revoked
 *   membership, a workspace-directory outage, or a project with no binding.
 *   Cleared by re-reading the scope; an account action would be a guess.
 */
export type AmrWorkspaceScopeBlock =
  | { kind: 'signed_out' }
  | { kind: 'unresolved' };

/**
 * Classify a held-closed AMR composer, or return `null` when there is nothing
 * to explain.
 *
 * `null` covers three distinct cases on purpose:
 *   - the run does not need a workspace authority (non-AMR, or non-daemon mode),
 *   - the authority resolved and the send is genuinely allowed,
 *   - a read has not settled yet. A pre-answer frame must not accuse the user of
 *     anything; both reads revalidate on a timer, so an answer always arrives.
 */
export function amrWorkspaceScopeBlock(input: {
  requiresWorkspaceScope: boolean;
  projectScope: ProjectWorkspaceScopeState;
  workspaceIdentity: WorkspaceContextState;
}): AmrWorkspaceScopeBlock | null {
  const { requiresWorkspaceScope, projectScope, workspaceIdentity } = input;
  if (!requiresWorkspaceScope) return null;
  if (projectWorkspaceScopeAuthorizesAmr(projectScope.scope)) return null;
  if (projectScope.loading) return null;
  if (workspaceIdentity.loading) return null;
  // A null context is only "signed out" when the identity read SUCCEEDED and
  // said so. A null context carrying a failure means the identity is unknown,
  // and offering a sign-in for an identity nobody read would be a guess — the
  // 30s context poll settles the failure away and reclassifies this on its own.
  const signedOut =
    workspaceIdentity.context === null && workspaceIdentity.failure == null;
  return signedOut ? { kind: 'signed_out' } : { kind: 'unresolved' };
}
