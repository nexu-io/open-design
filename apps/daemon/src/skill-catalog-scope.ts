import type { ProjectMetadata } from '@open-design/contracts';

/**
 * The catalogue partition a run may resolve Skill-like entries from.
 *
 * `workspaceMemberId` is nullable on purpose: the project binding can name a
 * Workspace before it names the member who created the project, and a run must
 * still see that Workspace's Skills rather than fall back to the unscoped
 * local roots.
 */
export interface SkillCatalogScope {
  workspaceId: string;
  workspaceMemberId: string | null;
}

/** The project-row shape this resolver reads; deliberately structural. */
export interface SkillCatalogWorkspaceBinding {
  workspaceId?: unknown;
  createdByWorkspaceMemberId?: unknown;
}

function stagedLocalCatalogScope(value: unknown): SkillCatalogScope | null {
  const scope = value as { workspaceId?: unknown; workspaceMemberId?: unknown } | undefined;
  const workspaceId = typeof scope?.workspaceId === 'string' ? scope.workspaceId.trim() : '';
  const workspaceMemberId = typeof scope?.workspaceMemberId === 'string'
    ? scope.workspaceMemberId.trim()
    : '';
  return workspaceId && workspaceMemberId ? { workspaceId, workspaceMemberId } : null;
}

/**
 * Resolve the Skill catalogue partition for one project's run.
 *
 * The invariant this exists to hold: **every surface that resolves a
 * user-selected Skill for a run resolves it from the same partition.** The
 * system-prompt composer and OD Next's frozen-package capture both answer
 * "which Skills can this run see", and a run that admits a Skill through one
 * and cannot find it through the other would silently drop the user's
 * selection.
 *
 * Resource provenance is intentionally independent from project attribution. A
 * Home selection can be staged while Workspace identity is still transitioning,
 * so a staged local catalogue partition wins over the project's Workspace
 * binding: the first run then reads the same local record without waiting for
 * identity discovery, and without treating the staged value as remote
 * membership authority.
 */
export function resolveSkillCatalogScope(input: {
  metadata?: ProjectMetadata | null | undefined;
  workspaceBinding?: SkillCatalogWorkspaceBinding | null | undefined;
}): SkillCatalogScope | null {
  const staged = stagedLocalCatalogScope(
    (input.metadata as { localCatalogScopes?: { skill?: unknown } } | null | undefined)
      ?.localCatalogScopes?.skill,
  );
  if (staged) return staged;
  const binding = input.workspaceBinding;
  if (!binding?.workspaceId) return null;
  return {
    workspaceId: String(binding.workspaceId),
    workspaceMemberId: typeof binding.createdByWorkspaceMemberId === 'string'
      ? binding.createdByWorkspaceMemberId
      : null,
  };
}
