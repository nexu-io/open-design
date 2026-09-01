import Database from 'better-sqlite3';

import {
  ensureTeamProjectCommentConversations,
  ensureWorkspaceProject,
  getProject,
  getWorkspaceProject,
  getWorkspaceProjectByProjectId,
  insertProject,
  rebindWorkspaceProject,
  updateProject,
} from '../db.js';
import { projectResourceIdFor } from '../integrations/vela-team-projects.js';
import type {
  RegisterPulledProjectInput,
  TeamMirrorPullScope,
} from '../routes/collab-sync.js';
import type { AuthorizedTeamProjectPullReceipt } from './authorized-team-project-pull.js';
import type { ResourceHubPrincipal } from './resource-principal.js';
import { isUnmaterializedSharedPlaceholder } from './shared-project-placeholder.js';

type SqliteDb = Database.Database;

export interface MaterializePulledTeamMirrorResult {
  localRecordChanged: boolean;
}

export function teamProjectMaterializationMatches(
  stored: AuthorizedTeamProjectPullReceipt | null,
  expected: AuthorizedTeamProjectPullReceipt,
): boolean {
  return Boolean(
    stored &&
    stored.schemaVersion === expected.schemaVersion &&
    stored.workspaceId === expected.workspaceId &&
    stored.resourceTeamId === expected.resourceTeamId &&
    stored.viewerMemberId === expected.viewerMemberId &&
    stored.ownerMemberId === expected.ownerMemberId &&
    stored.projectId === expected.projectId &&
    stored.resourceId === expected.resourceId &&
    stored.ref === expected.ref &&
    stored.version === expected.version &&
    stored.versionId === expected.versionId &&
    stored.manifestDigest === expected.manifestDigest &&
    stored.lifecycleState === expected.lifecycleState &&
    stored.authorizedAt === expected.authorizedAt &&
    stored.expiresAt === expected.expiresAt
  );
}

export function teamProjectMaterializationSupersedes(
  stored: AuthorizedTeamProjectPullReceipt | null,
  previous: AuthorizedTeamProjectPullReceipt,
): boolean {
  const canonicalResourceId = projectResourceIdFor(previous.projectId, {
    teamId: previous.resourceTeamId,
    memberId: previous.ownerMemberId,
    role: 'member',
    lifecycleState: 'active',
    workspaceType: 'team',
  });
  return Boolean(
    stored &&
    stored.schemaVersion === previous.schemaVersion &&
    stored.workspaceId === previous.workspaceId &&
    stored.resourceTeamId === previous.resourceTeamId &&
    stored.viewerMemberId === previous.viewerMemberId &&
    stored.ownerMemberId === previous.ownerMemberId &&
    stored.projectId === previous.projectId &&
    stored.resourceId === canonicalResourceId &&
    previous.resourceId === canonicalResourceId &&
    stored.ref === previous.ref &&
    stored.lifecycleState === previous.lifecycleState &&
    Number.isSafeInteger(stored.version) &&
    (
      stored.version > previous.version ||
      (
        stored.version === previous.version &&
        stored.versionId === previous.versionId &&
        stored.manifestDigest === previous.manifestDigest &&
        !teamProjectMaterializationMatches(stored, previous)
      )
    )
  );
}

export function getTeamProjectMaterialization(
  db: SqliteDb,
  workspaceId: string,
  projectId: string,
): AuthorizedTeamProjectPullReceipt | null {
  const value = db.prepare(`
    SELECT
      workspace_id AS workspaceId,
      resource_team_id AS resourceTeamId,
      viewer_member_id AS viewerMemberId,
      owner_member_id AS ownerMemberId,
      project_id AS projectId,
      resource_id AS resourceId,
      ref,
      version,
      version_id AS versionId,
      manifest_digest AS manifestDigest,
      lifecycle_state AS lifecycleState,
      authorized_at AS authorizedAt,
      expires_at AS expiresAt
    FROM team_project_materializations
    WHERE workspace_id = ? AND project_id = ?
  `).get(workspaceId, projectId) as
    | Omit<AuthorizedTeamProjectPullReceipt, 'schemaVersion'>
    | undefined;
  return value ? { schemaVersion: 1, ...value } : null;
}

function parseLegacyTeamProjectVersion(stored: string | null): number | null {
  if (stored == null || !/^(?:0|[1-9]\d*)$/.test(stored)) return null;
  const parsed = Number(stored);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/**
 * Read the newest cursor across the receipt-backed and legacy stores.
 *
 * Legacy/manual pulls may advance after an authorized staged pull. The receipt
 * cursor remains useful, but it must not hide that newer legacy cursor. An
 * authorized row only participates when its complete scope and canonical
 * owner-scoped resource binding still match the requested project.
 */
export function latestTeamProjectMaterializationVersion(
  authorized: AuthorizedTeamProjectPullReceipt | null,
  legacyVersion: string | null,
  projectId: string,
  scope: TeamMirrorPullScope,
): number | null {
  const ownerPrincipal: ResourceHubPrincipal = {
    teamId: scope.resourceTeamId,
    memberId: scope.ownerMemberId,
    role: 'member',
    lifecycleState: 'active',
    workspaceType: 'team',
  };
  const authorizedVersion =
    authorized &&
    authorized.schemaVersion === 1 &&
    authorized.workspaceId === scope.workspaceId &&
    authorized.resourceTeamId === scope.resourceTeamId &&
    authorized.viewerMemberId === scope.viewerMemberId &&
    authorized.ownerMemberId === scope.ownerMemberId &&
    authorized.projectId === projectId &&
    authorized.resourceId === projectResourceIdFor(projectId, ownerPrincipal) &&
    authorized.ref === 'published' &&
    authorized.lifecycleState === 'active' &&
    Number.isSafeInteger(authorized.version) &&
    authorized.version >= 0
      ? authorized.version
      : null;
  const legacy = parseLegacyTeamProjectVersion(legacyVersion);
  if (authorizedVersion == null) return legacy;
  if (legacy == null) return authorizedVersion;
  return Math.max(authorizedVersion, legacy);
}

/**
 * Atomically create/update a pulled project and bind it as a read-only mirror
 * in the exact validated team scope. Existing bindings are never migrated:
 * only an absent row or a compatible active mirror may proceed.
 */
export function materializePulledTeamMirror(
  db: SqliteDb,
  input: RegisterPulledProjectInput,
  scope: TeamMirrorPullScope,
  receipt?: AuthorizedTeamProjectPullReceipt,
  options: { placeholder?: boolean } = {},
): MaterializePulledTeamMirrorResult {
  if (
    receipt &&
    (
      receipt.workspaceId !== scope.workspaceId ||
      receipt.resourceTeamId !== scope.resourceTeamId ||
      receipt.viewerMemberId !== scope.viewerMemberId ||
      receipt.ownerMemberId !== scope.ownerMemberId ||
      receipt.projectId !== input.id ||
      receipt.ref !== 'published' ||
      receipt.lifecycleState !== 'active'
    )
  ) {
    throw new Error(`team mirror receipt binding conflict for ${input.id}`);
  }
  return db.transaction(() => {
    const ownerPrincipal: ResourceHubPrincipal = {
      teamId: scope.resourceTeamId,
      memberId: scope.ownerMemberId,
      role: 'member',
      lifecycleState: 'active',
      workspaceType: 'team',
    };
    const expectedCreator = options.placeholder
      ? null
      : scope.ownerMemberId === scope.viewerMemberId
        ? scope.viewerMemberId
        : null;
    const resourceHubResourceId =
      receipt?.resourceId ?? projectResourceIdFor(input.id, ownerPrincipal);
    if (
      receipt &&
      receipt.resourceId !== projectResourceIdFor(input.id, ownerPrincipal)
    ) {
      throw new Error(`team mirror receipt resource conflict for ${input.id}`);
    }
    const existingBinding = getWorkspaceProjectByProjectId(db, input.id) as
      | {
          workspaceId: string;
          visibility: string;
          resourceState: string | null;
          createdByWorkspaceMemberId: string | null;
          resourceHubResourceId: string | null;
          cloudTombstonedAt: number | null;
        }
      | undefined;
    const existing = getProject(db, input.id);
    const existingIsPlaceholder = isUnmaterializedSharedPlaceholder(existing);
    if (options.placeholder && existing && !existingIsPlaceholder) {
      throw new Error(`team placeholder project conflict for ${input.id}`);
    }
    const isRevokedMirror =
      existingBinding?.resourceState === 'deleted'
      && Boolean(existing?.metadata?.teamMirrorRevokedAt);
    const compatibleBinding =
      !existingBinding ||
      (
        existingBinding.workspaceId === scope.workspaceId &&
        existingBinding.visibility === 'team' &&
        (
          existingBinding.resourceState === 'active'
          || isRevokedMirror
        ) &&
        existingBinding.cloudTombstonedAt === null &&
        (
          existingBinding.createdByWorkspaceMemberId === expectedCreator
          || (
            !options.placeholder
            && existingIsPlaceholder
            && existingBinding.createdByWorkspaceMemberId === null
          )
        ) &&
        (
          existingBinding.resourceHubResourceId === null ||
          existingBinding.resourceHubResourceId === resourceHubResourceId
        )
      );
    if (!compatibleBinding) {
      throw new Error(`team mirror binding conflict for ${input.id}`);
    }

    let localRecordChanged = false;
    const persistedInput = options.placeholder
      ? {
          ...input,
          metadata: {
            ...(input.metadata ?? {}),
            sharedProjectPlaceholderAt: Date.now(),
          },
        }
      : input;
    if (!existing) {
      insertProject(db, {
        id: persistedInput.id,
        name: persistedInput.name,
        skillId: persistedInput.skillId,
        designSystemId: persistedInput.designSystemId,
        metadata: persistedInput.metadata,
        createdAt: persistedInput.createdAt,
        updatedAt: persistedInput.updatedAt,
      });
      localRecordChanged = true;
    } else if (
      (!options.placeholder && existingIsPlaceholder)
      || (
        !existingIsPlaceholder
        && expectedCreator === null
        && input.updatedAt > existing.updatedAt
      )
    ) {
      updateProject(db, input.id, {
        name: persistedInput.name,
        skillId: persistedInput.skillId,
        designSystemId: persistedInput.designSystemId,
        metadata: persistedInput.metadata,
        updatedAt: persistedInput.updatedAt,
      });
      localRecordChanged = true;
    } else if (existing.metadata?.teamMirrorRevokedAt) {
      const metadata = {
        ...((existing.metadata as Record<string, unknown> | null) ?? {}),
      };
      delete metadata.teamMirrorRevokedAt;
      updateProject(db, input.id, {
        metadata,
        // Materialization is synchronization, not local activity. Preserve
        // the owner's content timestamp rather than stamping this daemon's
        // re-share observation time.
        updatedAt: input.updatedAt,
      });
      localRecordChanged = true;
    }
    const commentConversations = ensureTeamProjectCommentConversations(
      db,
      input.id,
    );
    if (commentConversations.anchorCreated || commentConversations.routingCreated) {
      localRecordChanged = true;
    }

    const patch = {
      workspaceId: scope.workspaceId,
      visibility: 'team' as const,
      resourceState: 'active' as const,
      createdByWorkspaceMemberId: expectedCreator,
      updatedByWorkspaceMemberId: scope.viewerMemberId,
      resourceHubResourceId,
      cloudTombstonedAt: null,
      syncState: 'synced' as const,
      // The ORIGIN's content time, exactly like the project row above — never
      // this pull's clock. The project list answers a card's one relative time
      // as `MAX(p.updated_at, wp.updated_at)`, so carrying the origin into the
      // project row alone was not enough: the binding written in this same
      // transaction defaulted to `Date.now()` and `MAX` surfaced it, which is
      // why a member's card read 「刚刚更新」 hours after a background pull.
      updatedAt: input.updatedAt,
    };
    if (existingBinding) {
      rebindWorkspaceProject(db, input.id, patch);
    } else {
      ensureWorkspaceProject(db, { projectId: input.id, ...patch });
    }
    const binding = getWorkspaceProject(db, scope.workspaceId, input.id) as
      | {
          workspaceId: string;
          visibility: string;
          resourceState: string | null;
          createdByWorkspaceMemberId: string | null;
          updatedByWorkspaceMemberId: string | null;
          resourceHubResourceId: string | null;
          cloudTombstonedAt: number | null;
          syncState: string | null;
        }
      | undefined;
    if (
      !binding ||
      binding.workspaceId !== patch.workspaceId ||
      binding.visibility !== patch.visibility ||
      binding.resourceState !== patch.resourceState ||
      binding.createdByWorkspaceMemberId !== patch.createdByWorkspaceMemberId ||
      binding.updatedByWorkspaceMemberId !== patch.updatedByWorkspaceMemberId ||
      binding.resourceHubResourceId !== patch.resourceHubResourceId ||
      binding.cloudTombstonedAt !== null ||
      binding.syncState !== patch.syncState
    ) {
      throw new Error(`team mirror binding verification failed for ${input.id}`);
    }
    if (receipt) {
      db.prepare(`
        INSERT INTO team_project_materializations (
          workspace_id,
          resource_team_id,
          viewer_member_id,
          owner_member_id,
          project_id,
          resource_id,
          ref,
          version,
          version_id,
          manifest_digest,
          lifecycle_state,
          authorized_at,
          expires_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(workspace_id, project_id) DO UPDATE SET
          resource_team_id = excluded.resource_team_id,
          viewer_member_id = excluded.viewer_member_id,
          owner_member_id = excluded.owner_member_id,
          resource_id = excluded.resource_id,
          ref = excluded.ref,
          version = excluded.version,
          version_id = excluded.version_id,
          manifest_digest = excluded.manifest_digest,
          lifecycle_state = excluded.lifecycle_state,
          authorized_at = excluded.authorized_at,
          expires_at = excluded.expires_at,
          updated_at = excluded.updated_at
      `).run(
        receipt.workspaceId,
        receipt.resourceTeamId,
        receipt.viewerMemberId,
        receipt.ownerMemberId,
        receipt.projectId,
        receipt.resourceId,
        receipt.ref,
        receipt.version,
        receipt.versionId,
        receipt.manifestDigest,
        receipt.lifecycleState,
        receipt.authorizedAt,
        receipt.expiresAt,
        Date.now(),
      );
      if (
        !teamProjectMaterializationMatches(
          getTeamProjectMaterialization(db, scope.workspaceId, input.id),
          receipt,
        )
      ) {
        throw new Error(
          `team mirror materialization verification failed for ${input.id}`,
        );
      }
    }
    return { localRecordChanged };
  })();
}
