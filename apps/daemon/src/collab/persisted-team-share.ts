import type { ResourceHubPrincipal } from './resource-principal.js';

export interface PersistedTeamShareRow {
  projectId?: string | null;
  workspaceId?: string | null;
  createdByWorkspaceMemberId?: string | null;
  updatedByWorkspaceMemberId?: string | null;
}

export interface PersistedTeamShare {
  projectId: string;
  principal: ResourceHubPrincipal;
}

/**
 * Recover only creator-attributed share ownership after a daemon restart.
 *
 * `updatedByWorkspaceMemberId` records who last materialized or reconciled the
 * local row. On a read-only team mirror that is the current viewer, not the
 * remote project's single writer, so it is never evidence of ownership.
 * Mirrors without creator attribution deliberately return null here and
 * recover their owner through the workspace-scoped authoritative catalog used
 * by status and publish gating.
 */
export function recoverPersistedTeamShareOwnership(
  row: PersistedTeamShareRow,
): PersistedTeamShare | null {
  const ownerMemberId = row.createdByWorkspaceMemberId;
  if (!row.projectId || !row.workspaceId || !ownerMemberId) return null;
  return {
    projectId: row.projectId,
    principal: {
      memberId: ownerMemberId,
      teamId: row.workspaceId,
      role: 'member',
      lifecycleState: 'active',
    },
  };
}
