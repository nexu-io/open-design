import { teamResourceWorkspaceRoot } from '../collab/team-resource-materialization.js';
import {
  getWorkspaceProjectByProjectId,
  getWorkspaceResource,
} from '../db.js';
import type { PinnedRunWorkspaceScope } from '../runtimes/project-amr-trace-env.js';
import { workspaceTeamDesignSystemBindingResourceId } from './workspace-team-binding.js';

type SqliteDb = Parameters<typeof getWorkspaceProjectByProjectId>[0];
type WorkspaceResourceBinding = NonNullable<ReturnType<typeof getWorkspaceResource>>;

export type PinnedRunDesignSystemScope = Readonly<
  | {
      schemaVersion: 1;
      kind: 'local';
      projectId: string;
      designSystemId: string;
    }
  | {
      schemaVersion: 1;
      kind: 'workspace-unavailable';
      projectId: string;
      designSystemId: string;
      workspaceId: string;
      workspaceMemberId: string;
      bindingResourceId: string | null;
    }
  | {
      schemaVersion: 1;
      kind: 'workspace-resource';
      projectId: string;
      designSystemId: string;
      workspaceId: string;
      workspaceMemberId: string;
      bindingResourceId: string;
      visibility: 'team' | 'personal';
      bindingResourceState: string;
      bindingVersion: number;
      bindingCreatedAt: number;
      bindingUpdatedAt: number;
      bindingCreatedByWorkspaceMemberId: string;
    }
>;

export type PinnedRunDesignSystemResolution =
  | {
      ok: true;
      root: string;
      visibility: 'team' | 'personal' | 'local';
      binding: WorkspaceResourceBinding | null;
      workspaceId: string | null;
      workspaceMemberId: string | null;
    }
  | {
      ok: false;
      code: 'DESIGN_SYSTEM_SCOPE_UNAVAILABLE';
      message: string;
      details: { workspaceId: string; designSystemId: string };
    };

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeNumber(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function unavailableScope(input: {
  projectId: string;
  designSystemId: string;
  workspaceId: string;
  workspaceMemberId: string;
  bindingResourceId?: string | null;
}): PinnedRunDesignSystemScope {
  return Object.freeze({
    schemaVersion: 1 as const,
    kind: 'workspace-unavailable' as const,
    projectId: input.projectId,
    designSystemId: input.designSystemId,
    workspaceId: input.workspaceId,
    workspaceMemberId: input.workspaceMemberId,
    bindingResourceId: input.bindingResourceId ?? null,
  });
}

/** Capture the exact Personal or Team DS row selected when a run starts. */
export function pinRunDesignSystemScope(input: {
  db: SqliteDb;
  projectId: string;
  designSystemId: string | null | undefined;
  workspaceScope: PinnedRunWorkspaceScope | null | undefined;
}): PinnedRunDesignSystemScope | null {
  const projectId = normalizeString(input.projectId);
  const designSystemId = normalizeString(input.designSystemId);
  if (!projectId || !designSystemId.startsWith('user:')) return null;

  const workspaceId = normalizeString(input.workspaceScope?.workspaceId);
  if (!workspaceId) {
    return Object.freeze({
      schemaVersion: 1 as const,
      kind: 'local' as const,
      projectId,
      designSystemId,
    });
  }

  const projectBinding = getWorkspaceProjectByProjectId(input.db, projectId);
  const workspaceMemberId = normalizeString(
    input.workspaceScope?.workspaceMemberId
      ?? projectBinding?.createdByWorkspaceMemberId,
  );
  if (
    normalizeString(projectBinding?.workspaceId) !== workspaceId
    || !workspaceMemberId
  ) {
    return unavailableScope({
      projectId,
      designSystemId,
      workspaceId,
      workspaceMemberId,
    });
  }

  const teamBindingResourceId = workspaceTeamDesignSystemBindingResourceId(
    workspaceId,
    designSystemId,
  );
  const teamBinding = getWorkspaceResource(
    input.db,
    'design_system',
    workspaceId,
    teamBindingResourceId,
  );
  const bindingResourceId = teamBinding ? teamBindingResourceId : designSystemId;
  const binding = teamBinding ?? getWorkspaceResource(
    input.db,
    'design_system',
    workspaceId,
    designSystemId,
  );
  const visibility = normalizeString(binding?.visibility);
  const createdByWorkspaceMemberId = normalizeString(
    binding?.createdByWorkspaceMemberId,
  );
  const bindingIsAuthorized = Boolean(binding)
    && normalizeString(binding?.resourceState) !== 'deleted'
    && (
      visibility === 'team'
      || (
        visibility === 'personal'
        && createdByWorkspaceMemberId === workspaceMemberId
      )
    );
  if (!bindingIsAuthorized || (teamBinding && visibility !== 'team')) {
    return unavailableScope({
      projectId,
      designSystemId,
      workspaceId,
      workspaceMemberId,
      bindingResourceId,
    });
  }

  return Object.freeze({
    schemaVersion: 1 as const,
    kind: 'workspace-resource' as const,
    projectId,
    designSystemId,
    workspaceId,
    workspaceMemberId,
    bindingResourceId,
    visibility: visibility as 'team' | 'personal',
    bindingResourceState: normalizeString(binding?.resourceState),
    bindingVersion: normalizeNumber(binding?.version, 1),
    bindingCreatedAt: normalizeNumber(binding?.createdAt, 0),
    bindingUpdatedAt: normalizeNumber(binding?.updatedAt, 0),
    bindingCreatedByWorkspaceMemberId: createdByWorkspaceMemberId,
  });
}

/** Resolve only the row captured above; never rediscover Team vs Personal. */
export function resolvePinnedRunDesignSystemScope(input: {
  db: SqliteDb;
  scope: PinnedRunDesignSystemScope | null | undefined;
  designSystemId: string;
  userRoot: string;
}): PinnedRunDesignSystemResolution {
  const designSystemId = normalizeString(input.designSystemId);
  const scope = input.scope;
  const unavailable = (workspaceId = ''): PinnedRunDesignSystemResolution => ({
    ok: false,
    code: 'DESIGN_SYSTEM_SCOPE_UNAVAILABLE',
    message: 'active design-system binding no longer matches the run scope',
    details: { workspaceId, designSystemId },
  });

  if (!scope || scope.designSystemId !== designSystemId) return unavailable();
  if (scope.kind === 'local') {
    return {
      ok: true,
      root: input.userRoot,
      visibility: 'local',
      binding: null,
      workspaceId: null,
      workspaceMemberId: null,
    };
  }
  if (scope.kind === 'workspace-unavailable') {
    return unavailable(scope.workspaceId);
  }

  const binding = getWorkspaceResource(
    input.db,
    'design_system',
    scope.workspaceId,
    scope.bindingResourceId,
  );
  if (
    !binding
    || normalizeString(binding.resourceState) !== scope.bindingResourceState
    || scope.bindingResourceState === 'deleted'
    || normalizeString(binding.visibility) !== scope.visibility
    || normalizeString(binding.createdByWorkspaceMemberId)
      !== scope.bindingCreatedByWorkspaceMemberId
    || normalizeNumber(binding.version, 1) !== scope.bindingVersion
    || normalizeNumber(binding.createdAt, 0) !== scope.bindingCreatedAt
    || normalizeNumber(binding.updatedAt, 0) !== scope.bindingUpdatedAt
  ) {
    return unavailable(scope.workspaceId);
  }

  return {
    ok: true,
    root: scope.visibility === 'team'
      ? teamResourceWorkspaceRoot(input.userRoot, scope.workspaceId)
      : input.userRoot,
    visibility: scope.visibility,
    binding,
    workspaceId: scope.workspaceId,
    workspaceMemberId: scope.workspaceMemberId,
  };
}
