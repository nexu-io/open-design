import type { ProjectCommentWorkspaceContextResolution } from '../routes/project/comments.js';

export interface LocalProjectCommentWorkspaceBinding {
  workspaceId?: string | null;
  visibility?: string | null;
  resourceState?: string | null;
  createdByWorkspaceMemberId?: string | null;
}

/**
 * Attribute workspace-bound comments to the request's local member identity.
 * Project creation is an ownership witness, never a substitute caller. Local
 * comments remain available without a directory round trip; relay publication
 * must still use its own fresh cloud authority. Unbound projects stay local.
 */
export function resolveLocalProjectCommentWorkspaceContext(input: {
  binding: LocalProjectCommentWorkspaceBinding | undefined;
  revoked: boolean;
  local: ProjectCommentWorkspaceContextResolution;
}): ProjectCommentWorkspaceContextResolution {
  const { binding, revoked, local } = input;
  if (revoked || binding?.resourceState === 'deleted') {
    return {
      ok: false,
      status: 403,
      code: 'WORKSPACE_PROJECT_PERMISSION_DENIED',
      message: 'workspace project read is not allowed',
    };
  }
  if (!binding?.workspaceId) return { ok: true, context: null };
  if (!local.ok) return local;
  if (!local.context) {
    return {
      ok: false,
      status: 400,
      code: 'WORKSPACE_CONTEXT_REQUIRED',
      message: 'workspace context is required',
    };
  }
  if (
    local.context.workspaceId !== binding.workspaceId
    || (
      binding.visibility !== 'team'
      && binding.createdByWorkspaceMemberId
      && local.context.workspaceMemberId !== binding.createdByWorkspaceMemberId
    )
  ) {
    return {
      ok: false,
      status: 403,
      code: 'WORKSPACE_PROJECT_PERMISSION_DENIED',
      message: 'workspace project access is not allowed',
    };
  }
  return {
    ok: true,
    context: local.context,
  };
}
