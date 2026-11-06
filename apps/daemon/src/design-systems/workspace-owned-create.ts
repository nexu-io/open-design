import type { WorkspaceResourceContext } from '../collab/workspace-resource-mutation.js';
import {
  createUserDesignSystem,
  deleteUserDesignSystem,
  type DesignSystemSummary,
  type UserDesignSystemInput,
} from './index.js';

type WorkspaceResourceEnvelopeInput = {
  visibility: 'personal';
  resourceState: 'active';
  createdByWorkspaceMemberId: string;
  updatedByWorkspaceMemberId: string;
};

export interface CreateWorkspaceOwnedDesignSystemDeps {
  ensureWorkspaceResource: (
    resourceType: 'design_system',
    workspaceId: string,
    resourceId: string,
    input: WorkspaceResourceEnvelopeInput,
  ) => unknown;
  listReservedResourceIds?: () => Iterable<string>;
  createUserDesignSystem?: (
    root: string,
    input: UserDesignSystemInput,
  ) => Promise<DesignSystemSummary>;
  deleteUserDesignSystem?: (root: string, id: string) => Promise<boolean>;
}

export interface DeleteWorkspaceOwnedDesignSystemDeps {
  deleteUserDesignSystem?: (root: string, id: string) => Promise<boolean>;
  deleteWorkspaceResourceByResourceId: (
    resourceType: 'design_system',
    resourceId: string,
  ) => unknown;
}

/**
 * Persist one user design system and its Workspace ownership envelope.
 *
 * `context` is already directory-verified by the caller. A null context is
 * the deliberate headerless/local compatibility lane: the design system is
 * created without a Workspace claim or envelope. For a scoped create, the
 * filesystem and SQLite writes form one logical unit. If the envelope write
 * fails, remove only the directory allocated by this call before surfacing
 * the original error, so a later catalog scan cannot expose a half-owned
 * design system.
 */
export async function createWorkspaceOwnedDesignSystem(
  root: string,
  input: UserDesignSystemInput,
  context: WorkspaceResourceContext | null,
  deps: CreateWorkspaceOwnedDesignSystemDeps,
): Promise<DesignSystemSummary> {
  const create = deps.createUserDesignSystem ?? createUserDesignSystem;
  const remove = deps.deleteUserDesignSystem ?? deleteUserDesignSystem;
  const created = await create(root, {
    ...input,
    reservedResourceIds: deps.listReservedResourceIds?.() ?? [],
    ...(context ? { workspaceId: context.workspaceId } : {}),
  });

  if (!context) return created;

  try {
    const binding = deps.ensureWorkspaceResource(
      'design_system',
      context.workspaceId,
      created.id,
      {
        visibility: 'personal',
        resourceState: 'active',
        createdByWorkspaceMemberId: context.workspaceMemberId,
        updatedByWorkspaceMemberId: context.workspaceMemberId,
      },
    );
    if (
      !binding
      || typeof binding !== 'object'
      || !('workspaceId' in binding)
      || binding.workspaceId !== context.workspaceId
      || !('resourceId' in binding)
      || binding.resourceId !== created.id
      || !('visibility' in binding)
      || binding.visibility !== 'personal'
      || !('createdByWorkspaceMemberId' in binding)
      || binding.createdByWorkspaceMemberId !== context.workspaceMemberId
    ) {
      throw new Error('DESIGN_SYSTEM_ID_CONFLICT');
    }
    return created;
  } catch (error) {
    await remove(root, created.id).catch(() => false);
    throw error;
  }
}

/**
 * Delete one user design system and then remove its Workspace envelope.
 *
 * The filesystem is the canonical payload. Keep the ownership envelope when
 * that delete fails so callers do not expose unbound bytes through a later
 * catalog scan. This mirrors the normal design-system DELETE route ordering.
 */
export async function deleteWorkspaceOwnedDesignSystem(
  root: string,
  id: string,
  deps: DeleteWorkspaceOwnedDesignSystemDeps,
): Promise<boolean> {
  const remove = deps.deleteUserDesignSystem ?? deleteUserDesignSystem;
  const removed = await remove(root, id);
  if (!removed) return false;
  deps.deleteWorkspaceResourceByResourceId('design_system', id);
  return true;
}
