import type { WorkspaceCollabContext } from '@open-design/contracts';
import type Database from 'better-sqlite3';
import {
  ensureWorkspaceProject,
  getProject,
  getWorkspaceProjectByProjectId,
  SYNC_KEEPS_UPDATED_AT,
  updateWorkspaceProject,
} from '../db.js';
import { isUnmaterializedSharedPlaceholder } from './shared-project-placeholder.js';

interface LocalPublicShareOwnership {
  resolveLocalPublicShareOwner(projectId: string, workspaceId: string): string | null;
  adoptLegacyPublicShareProject(projectId: string, context: WorkspaceCollabContext): string | null;
}

export function createLocalPublicShareOwnership(
  db: Database.Database,
  isContentUnavailable: (projectId: string) => boolean = () => false,
): LocalPublicShareOwnership {
  function resolveLocalPublicShareOwner(projectId: string, workspaceId: string): string | null {
    const binding = getWorkspaceProjectByProjectId(db, projectId);
    const project = getProject(db, projectId);
    if (!binding || binding.workspaceId !== workspaceId || binding.resourceState !== 'active'
      || binding.cloudTombstonedAt != null || !project
      || isUnmaterializedSharedPlaceholder(project)) return null;
    return typeof binding.createdByWorkspaceMemberId === 'string' ? binding.createdByWorkspaceMemberId : null;
  }

  /**
   * An explicit share may adopt a pre-identity local draft into its verified
   * Personal owner's workspace. The context MUST come from fresh membership
   * verification, never request role/type headers. Existing homes and cloud
   * identities are preserved; a Team mirror's null creator is never authorship.
   * No schema change is needed, so old project rows remain readable on upgrade.
   */
  function adoptLegacyPublicShareProject(projectId: string, context: WorkspaceCollabContext): string | null {
    if (context.workspaceType !== 'personal' || context.role !== 'owner'
      || context.memberStatus !== 'active' || context.lifecycleState !== 'active'
      || !context.permissions.canShareProjects || !context.workspaceId || !context.workspaceMemberId) return null;
    return db.transaction(() => {
      const project = getProject(db, projectId);
      if (!project || isUnmaterializedSharedPlaceholder(project)
        || project.metadata?.teamMirrorRevokedAt || isContentUnavailable(projectId)) return null;
      const binding = getWorkspaceProjectByProjectId(db, projectId);
      // An inbound mirror keeps a durable materialization witness even if an
      // older build damaged its ordinary binding. Never adopt those bytes.
      if (db.prepare('SELECT 1 FROM team_project_materializations WHERE project_id = ? LIMIT 1').get(projectId)) return null;
      if (binding) {
        if (binding.workspaceId !== context.workspaceId || binding.visibility !== 'personal'
          || binding.resourceState !== 'active' || binding.createdByWorkspaceMemberId != null
          || binding.resourceHubResourceId != null || binding.cloudTombstonedAt != null
          || binding.transferredFromWorkspaceMemberId != null || binding.syncState !== 'local_only') return null;
        updateWorkspaceProject(db, context.workspaceId, projectId, {
          createdByWorkspaceMemberId: context.workspaceMemberId,
          updatedByWorkspaceMemberId: context.workspaceMemberId,
          updatedAt: SYNC_KEEPS_UPDATED_AT,
        });
      } else {
        // The existing orphan-adoption policy chooses the Personal workspace,
        // including clients which publish directly before reading its list.
        ensureWorkspaceProject(db, {
          projectId, workspaceId: context.workspaceId, visibility: 'personal', resourceState: 'active',
          createdByWorkspaceMemberId: context.workspaceMemberId,
          updatedByWorkspaceMemberId: context.workspaceMemberId,
          syncState: 'local_only', createdAt: project.createdAt, updatedAt: project.updatedAt,
        });
      }
      return resolveLocalPublicShareOwner(projectId, context.workspaceId);
    }).immediate();
  }

  return { resolveLocalPublicShareOwner, adoptLegacyPublicShareProject };
}
