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
}

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
      candidate.lifecycleState === 'active',
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
