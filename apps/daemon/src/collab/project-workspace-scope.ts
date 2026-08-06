import type {
  ProjectVisibility,
  ProjectWorkspaceScope,
} from '@open-design/contracts';
import {
  workspaceContextFromDirectoryItem,
  type WorkspaceDirectoryFetchResult,
} from './vela-workspace-context.js';

interface ProjectWorkspaceBinding {
  workspaceId?: unknown;
  visibility?: unknown;
  resourceState?: unknown;
}

export type ProjectWorkspaceScopeBootstrapResult =
  | {
      ok: true;
      scope: ProjectWorkspaceScope;
    }
  | {
      ok: false;
      status: 403 | 503;
      code: 'WORKSPACE_PROJECT_PERMISSION_DENIED' | 'WORKSPACE_DIRECTORY_UNAVAILABLE';
      message: string;
    };

/**
 * Resolve a project's persisted workspace binding against the signed-in
 * caller's authoritative membership directory.
 *
 * Directory ordering and the daemon's ambient/active workspace are
 * intentionally irrelevant. A missing or failed exact membership lookup
 * stays `unavailable`; it must never borrow another workspace's member id.
 */
export function resolveProjectWorkspaceScope(input: {
  projectId: string;
  binding: ProjectWorkspaceBinding | null | undefined;
  directory: WorkspaceDirectoryFetchResult;
}): ProjectWorkspaceScope {
  const projectId = input.projectId.trim();
  const workspaceId =
    typeof input.binding?.workspaceId === 'string'
      ? input.binding.workspaceId.trim()
      : '';
  if (!workspaceId) {
    return {
      kind: 'unbound',
      projectId,
      workspaceId: null,
      context: null,
    };
  }

  const visibility: ProjectVisibility =
    input.binding?.visibility === 'team' ? 'team' : 'personal';
  const unavailable = (): ProjectWorkspaceScope => ({
    kind: 'unavailable',
    projectId,
    workspaceId,
    visibility,
    context: null,
  });
  if (!input.directory.ok) return unavailable();

  const item = input.directory.items.find(
    (candidate) =>
      candidate.workspaceId === workspaceId &&
      candidate.memberStatus === 'active' &&
      candidate.lifecycleState !== 'deleted',
  );
  if (!item) return unavailable();

  const context = workspaceContextFromDirectoryItem(item);
  if (
    context.workspaceId !== workspaceId ||
    !context.workspaceMemberId ||
    context.memberStatus !== 'active'
  ) {
    return unavailable();
  }
  if (context.workspaceType === 'team') {
    return {
      kind: 'team',
      projectId,
      workspaceId,
      visibility,
      context: { ...context, workspaceType: 'team' },
    };
  }
  return {
    kind: 'personal',
    projectId,
    workspaceId,
    visibility,
    context: { ...context, workspaceType: 'personal' },
  };
}

/**
 * Resolve the one headerless bootstrap read used by a fresh project deep link.
 *
 * This does not authorize project content. It discloses a persisted binding
 * only after a fresh signed-in directory proves the caller is an active member
 * of that exact Workspace. The web must then attach the returned context to
 * every project data-plane request, which still passes the normal route gate.
 */
export function resolveProjectWorkspaceScopeBootstrap(input: {
  projectId: string;
  binding: ProjectWorkspaceBinding | null | undefined;
  directory: WorkspaceDirectoryFetchResult;
}): ProjectWorkspaceScopeBootstrapResult {
  if (!input.binding?.workspaceId) {
    return {
      ok: true,
      scope: resolveProjectWorkspaceScope(input),
    };
  }
  if (input.binding.resourceState === 'deleted') {
    return {
      ok: false,
      status: 403,
      code: 'WORKSPACE_PROJECT_PERMISSION_DENIED',
      message: 'workspace project read is not allowed',
    };
  }
  if (!input.directory.ok) {
    return {
      ok: false,
      status: 503,
      code: 'WORKSPACE_DIRECTORY_UNAVAILABLE',
      message: 'workspace membership directory is unavailable',
    };
  }
  const scope = resolveProjectWorkspaceScope(input);
  if (scope.kind === 'unavailable' || scope.context === null) {
    return {
      ok: false,
      status: 403,
      code: 'WORKSPACE_PROJECT_PERMISSION_DENIED',
      message: 'workspace project read is not allowed',
    };
  }
  return { ok: true, scope };
}
