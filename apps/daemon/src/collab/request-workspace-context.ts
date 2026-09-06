import type { WorkspaceCollabContext } from '@open-design/contracts';
import { workspaceResourceContextFromRequest } from './workspace-resource-mutation.js';
import {
  workspaceContextFromDirectoryItem,
  type WorkspaceDirectoryFetchResult,
} from './vela-workspace-context.js';

export type VerifiedWorkspaceRequestContextResult =
  | { ok: true; context: WorkspaceCollabContext }
  | {
      ok: false;
      status: 400 | 401 | 403 | 503;
      code:
        | 'WORKSPACE_CONTEXT_REQUIRED'
        | 'WORKSPACE_CONTEXT_INCOMPLETE'
        | 'AMR_AUTH_REQUIRED'
        | 'WORKSPACE_AUTHORITY_UNAVAILABLE'
        | 'WORKSPACE_ACCESS_DENIED';
      message: string;
      retryable?: true;
    };

/**
 * Resolve a request's explicit Workspace identity against the signed-in
 * account's authoritative membership directory.
 *
 * Data-plane routes must call this instead of reading the daemon's mutable
 * active Workspace. The headers choose which membership to verify; the
 * directory supplies every authority-bearing field.
 */
export async function verifyWorkspaceRequestContext(input: {
  req: unknown;
  fetchWorkspaceDirectory: () => Promise<WorkspaceDirectoryFetchResult>;
  configuredEnv?: Record<string, string>;
  requireTeam?: boolean;
}): Promise<VerifiedWorkspaceRequestContextResult> {
  const claimed = workspaceResourceContextFromRequest(input.req);
  if (claimed === null) {
    return {
      ok: false,
      status: 400,
      code: 'WORKSPACE_CONTEXT_REQUIRED',
      message: 'an explicit workspace context is required',
    };
  }
  if (claimed === 'missing') {
    return {
      ok: false,
      status: 400,
      code: 'WORKSPACE_CONTEXT_INCOMPLETE',
      message: 'both workspace and member identity are required',
    };
  }

  let directory: WorkspaceDirectoryFetchResult;
  try {
    directory = await input.fetchWorkspaceDirectory();
  } catch {
    directory = { ok: false, items: [] };
  }
  if (!directory.ok) {
    if (directory.reason === 'unauthorized') {
      return {
        ok: false,
        status: 401,
        code: 'AMR_AUTH_REQUIRED',
        message: 'AMR authorization expired. Sign in again to continue.',
      };
    }
    return {
      ok: false,
      status: 503,
      code: 'WORKSPACE_AUTHORITY_UNAVAILABLE',
      message: 'workspace membership authority is temporarily unavailable',
      retryable: true,
    };
  }

  const membership = directory.items.find(
    (item) =>
      item.workspaceId === claimed.workspaceId
      && item.workspaceMemberId === claimed.workspaceMemberId
      && item.memberStatus === 'active'
      && item.lifecycleState !== 'deleted',
  );
  if (!membership || (input.requireTeam && membership.workspaceType !== 'team')) {
    return {
      ok: false,
      status: 403,
      code: 'WORKSPACE_ACCESS_DENIED',
      message: 'the requested workspace is not available to this member',
    };
  }

  return {
    ok: true,
    context: workspaceContextFromDirectoryItem(membership, input.configuredEnv),
  };
}

/**
 * The local/dev counterpart of {@link verifyWorkspaceRequestContext}: there is
 * no signed membership directory, so the request's explicit headers are the
 * complete, static authority. It still never consults the daemon's mutable
 * active-workspace context. Lives here rather than inline in `server.ts` so a
 * test that builds a route in isolation can run the production local verifier
 * instead of a hand-rolled double.
 */
export function verifyLocalWorkspaceRequestContext(
  req: unknown,
  options: { configuredEnv?: Record<string, string>; requireTeam?: boolean } = {},
): VerifiedWorkspaceRequestContextResult {
  const claimed = workspaceResourceContextFromRequest(req);
  if (claimed === null) {
    return {
      ok: false,
      status: 400,
      code: 'WORKSPACE_CONTEXT_REQUIRED',
      message: 'an explicit workspace context is required',
    };
  }
  if (claimed === 'missing') {
    return {
      ok: false,
      status: 400,
      code: 'WORKSPACE_CONTEXT_INCOMPLETE',
      message: 'both workspace and member identity are required',
    };
  }
  if (
    claimed.memberStatus !== 'active'
    || claimed.lifecycleState === 'deleted'
    || (options.requireTeam && claimed.workspaceType !== 'team')
  ) {
    return {
      ok: false,
      status: 403,
      code: 'WORKSPACE_ACCESS_DENIED',
      message: 'the requested workspace is not available to this member',
    };
  }
  return {
    ok: true,
    context: workspaceContextFromDirectoryItem({
      workspaceId: claimed.workspaceId,
      workspaceName: claimed.workspaceId,
      workspaceType: claimed.workspaceType,
      workspaceMemberId: claimed.workspaceMemberId,
      role: claimed.role,
      memberStatus: claimed.memberStatus,
      lifecycleState: claimed.lifecycleState,
    }, options.configuredEnv),
  };
}
