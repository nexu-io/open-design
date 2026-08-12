// Recovery lane for resources that predate workspace isolation (#6528).
//
// `pluginVisibleFromWorkspace`, `skillVisibleFromBinding` and the user half of
// `listAllDesignSystems` all quarantine a user resource that has no
// `workspace_resources` binding: absence of an ownership witness must not
// authorize a cross-workspace read. Resources installed before the binding
// table existed therefore vanish from every explicit Workspace after an
// upgrade, even though their bytes are intact on disk.
//
// The reconcilers below are the ONE sanctioned adoption path. They run on
// demand from the catalog routes AFTER the caller's Workspace authority has
// been verified, and claim each still-unbound resource as a Personal binding
// created by the authenticated member — exactly the row a fresh install
// writes. Callers that are unauthenticated, headerless, or missing either
// half of the identity adopt nothing, so "no caller may adopt legacy bytes
// merely by viewing them" continues to hold for them.

import { ensureWorkspaceResource, getWorkspaceResourceByResourceId, updateWorkspaceResource } from './db.js';
import type Database from 'better-sqlite3';

type SqliteDb = Database.Database;

export interface ReconcileUnboundResourcesInput {
  /** `workspace_resources.resource_type`, e.g. `'plugin'`. */
  resourceType: string;
  /** Candidate resource ids, already filtered to USER-owned resources. */
  resourceIds: Iterable<string>;
  workspaceId: string | null | undefined;
  workspaceMemberId: string | null | undefined;
}

/**
 * Bind every still-unbound id to `workspaceId` as a Personal resource created
 * by `workspaceMemberId`. Returns how many bindings were written.
 *
 * Idempotent by construction: `ensureWorkspaceResource` is keyed on
 * `(resource_type, resource_id)`, so a resource already bound ANYWHERE —
 * including to another Workspace on a multi-workspace machine, and including
 * a `resource_state: 'deleted'` tombstone — is returned as-is and left
 * untouched. A tombstone stays terminal.
 */
export function reconcileUnboundResources(
  db: SqliteDb,
  input: ReconcileUnboundResourcesInput,
): number {
  const scopeId = input.workspaceId?.trim();
  const memberId = input.workspaceMemberId?.trim();
  if (!scopeId || !memberId) return 0;
  let adopted = 0;
  for (const rawId of input.resourceIds) {
    const resourceId = typeof rawId === 'string' ? rawId.trim() : '';
    if (!resourceId) continue;
    if (getWorkspaceResourceByResourceId(db, input.resourceType, resourceId)) continue;
    ensureWorkspaceResource(db, input.resourceType, scopeId, resourceId, {
      visibility: 'personal',
      resourceState: 'active',
      createdByWorkspaceMemberId: memberId,
    });
    adopted += 1;
  }
  return adopted;
}

/**
 * Repair Personal bindings that already belong to this Workspace but carry no
 * creator.
 *
 * A `visibility: 'personal'` row with a NULL/empty
 * `created_by_workspace_member_id` is unreachable by EVERY member, because the
 * personal branch of each visibility check ends in
 * `Boolean(creatorId && callerId && creatorId === callerId)` — an empty
 * `creatorId` can never match. Observed in the wild on a 0.18.0 install whose
 * design system was invisible under "Your systems" despite a correct
 * `workspace_id`, `visibility` and `resource_state`.
 *
 * Scope is deliberately narrow: only rows ALREADY bound to the caller's exact
 * Workspace, still `personal`, not tombstoned, and with no creator at all.
 * Ownership is never transferred between members — an empty creator is not a
 * meaningful value, so there is no prior owner to displace. Rows bound to
 * another Workspace, Team rows, and tombstones are untouched.
 *
 * Kept separate from {@link reconcileUnboundResources} so a reviewer can adopt
 * the two behaviors independently: one binds missing rows, this one repairs
 * rows that a writer left in a terminal state.
 */
export function repairCreatorlessPersonalBindings(
  db: SqliteDb,
  input: ReconcileUnboundResourcesInput,
): number {
  const scopeId = input.workspaceId?.trim();
  const memberId = input.workspaceMemberId?.trim();
  if (!scopeId || !memberId) return 0;
  let repaired = 0;
  for (const rawId of input.resourceIds) {
    const resourceId = typeof rawId === 'string' ? rawId.trim() : '';
    if (!resourceId) continue;
    const binding = getWorkspaceResourceByResourceId(db, input.resourceType, resourceId);
    if (!binding) continue;
    if (binding.workspaceId !== scopeId) continue;
    if (binding.visibility !== 'personal') continue;
    if (binding.resourceState === 'deleted') continue;
    const creatorId = typeof binding.createdByWorkspaceMemberId === 'string'
      ? binding.createdByWorkspaceMemberId.trim()
      : '';
    if (creatorId) continue;
    updateWorkspaceResource(db, input.resourceType, scopeId, resourceId, {
      createdByWorkspaceMemberId: memberId,
      updatedByWorkspaceMemberId: memberId,
    });
    repaired += 1;
  }
  return repaired;
}

/** Convenience wrapper: bind missing rows, then repair creatorless ones. */
export function reconcileWorkspaceResourceBindings(
  db: SqliteDb,
  input: ReconcileUnboundResourcesInput,
): { adopted: number; repaired: number } {
  const ids = Array.from(input.resourceIds);
  return {
    adopted: reconcileUnboundResources(db, { ...input, resourceIds: ids }),
    repaired: repairCreatorlessPersonalBindings(db, { ...input, resourceIds: ids }),
  };
}
