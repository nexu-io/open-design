import {
  isSameWorkspacePrincipal,
  type WorkspaceCollabContext,
  type WorkspacePrincipal,
} from '@open-design/contracts';

import { workspaceIdentityCacheKey } from '../collab/workspace-identity';

export interface AmrAuthRetryContinuation {
  projectId: string;
  conversationId: string;
  assistantId: string;
  workspaceIdentityKey: string;
  /** The project scope's principal, for comparison with App's directory
   * projection after Settings. Older inline continuations keep the exact-key
   * path; the scope key still guards consumption within the project surface. */
  workspacePrincipal?: WorkspacePrincipal | null;
  originMountId: string;
  accountIdAtArm: string | null;
  createdAtMs: number;
}

export interface AmrAuthRetryContinuationCandidate {
  projectId: string;
  conversationId: string;
  assistantId: string;
  workspaceIdentityKey: string;
  mountId: string;
  loggedInAccountId: string | null;
  nowMs: number;
  originMountObservedSignedOut: boolean;
  personalAdoptionWitness: AmrAuthRetryPersonalAdoptionWitness | null;
}

/**
 * Structured proof that an explicitly unbound project can be adopted into the
 * signed-in caller's active Personal Workspace. Keep this structured instead
 * of parsing {@link workspaceIdentityKey}: the cache key is an opaque partition
 * fingerprint, not an authorization protocol.
 */
export interface AmrAuthRetryPersonalAdoptionWitness {
  workspaceIdentityKey: string;
  workspaceId: string;
  workspaceMemberId: string;
  workspaceType: 'personal';
  memberStatus: 'active';
}

export const AMR_AUTH_RETRY_CONTINUATION_TTL_MS = 5 * 60 * 1_000;

/**
 * App's directory role and the daemon's project-write role describe different
 * permissions for the same principal. Preserve the retry across that boundary,
 * but never retain it for a different member or an inactive/unwritable caller.
 * This only preserves intent: ProjectView and the daemon still authorize send.
 */
export function amrAuthRetryMatchesRouteContext(
  pending: AmrAuthRetryContinuation,
  context: WorkspaceCollabContext,
): boolean {
  if (pending.workspacePrincipal === undefined) {
    return pending.workspaceIdentityKey === workspaceIdentityCacheKey(context);
  }
  return isSameWorkspacePrincipal(pending.workspacePrincipal, context)
    && context.memberStatus === 'active'
    && context.lifecycleState === 'active'
    && context.permissions.canWriteSyncedFiles;
}

/**
 * A retry armed by inline AMR authorization normally crosses the one expected
 * authorization remount. An unbound local project has no Workspace authority
 * to remount, so its origin mount may consume only after observing the real
 * signed-out -> signed-in transition. Every path must still prove the exact
 * project, conversation, failed turn and authority before retrying.
 */
export function canConsumeAmrAuthRetryContinuation(
  pending: AmrAuthRetryContinuation,
  candidate: AmrAuthRetryContinuationCandidate,
): boolean {
  const ageMs = candidate.nowMs - pending.createdAtMs;
  const freshMountWithExactAuthority =
    pending.originMountId !== candidate.mountId
    && pending.workspaceIdentityKey !== 'none'
    && pending.workspaceIdentityKey === candidate.workspaceIdentityKey;
  const witness = candidate.personalAdoptionWitness;
  const sameMountWithPersonalAdoption =
    pending.originMountId === candidate.mountId
    && pending.workspaceIdentityKey === 'none'
    && pending.accountIdAtArm === null
    && candidate.originMountObservedSignedOut
    && witness !== null
    && witness.workspaceType === 'personal'
    && witness.memberStatus === 'active'
    && witness.workspaceId.trim().length > 0
    && witness.workspaceMemberId.trim().length > 0
    && witness.workspaceIdentityKey !== 'none'
    && witness.workspaceIdentityKey === candidate.workspaceIdentityKey;
  return (
    (freshMountWithExactAuthority || sameMountWithPersonalAdoption)
    && pending.projectId === candidate.projectId
    && pending.conversationId === candidate.conversationId
    && pending.assistantId === candidate.assistantId
    && ageMs >= 0
    && ageMs <= AMR_AUTH_RETRY_CONTINUATION_TTL_MS
    && candidate.loggedInAccountId !== null
    && (
      pending.accountIdAtArm === null
      || pending.accountIdAtArm === candidate.loggedInAccountId
    )
  );
}

export function routeStillMatchesAmrAuthRetryContinuation(
  pending: AmrAuthRetryContinuation,
  route: {
    kind: string;
    projectId?: string | null;
    conversationId?: string | null;
  },
): boolean {
  if (route.kind !== 'project' || route.projectId !== pending.projectId) return false;
  return route.conversationId == null || route.conversationId === pending.conversationId;
}
