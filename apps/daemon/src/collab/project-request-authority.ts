import type { Response } from 'express';
import {
  requestWithWorkspaceNavigationScope,
  workspaceResourceContextFromRequest,
  type ResolveWorkspaceResourceReadAuthority,
  type VerifyWorkspaceRequestAuthority,
  type WorkspaceResourceAccessInput,
  type WorkspaceResourceMutationCapability,
} from './workspace-resource-mutation.js';

export type AuthorizeProjectRequestOptions =
  | {
      mode: 'read';
      /** EventSource, iframe, and direct asset navigation cannot set headers. */
      allowNavigationQuery?: boolean;
    }
  | {
      mode: 'write';
      capability: WorkspaceResourceMutationCapability;
    };

export type AuthorizeProjectRequest = (
  req: any,
  res: Response,
  projectId: string,
  options: AuthorizeProjectRequestOptions,
) => Promise<boolean>;

/** Add live Vela membership to the persisted local project gate. */
export function createVerifiedProjectRequestAuthority(deps: {
  localAuthority: AuthorizeProjectRequest;
  getBinding: (projectId: string) => WorkspaceResourceAccessInput | null | undefined;
  verifyWorkspaceRequestAuthority: VerifyWorkspaceRequestAuthority;
  isPersonalWorkspaceForAccount: (workspaceId: string, creatorMemberId: string | null) => Promise<boolean>;
  reconcileMemberRemovalProjects: (workspaceId: string, ownerMemberId: string) => Promise<unknown>;
  sendApiError: (res: Response, status: number, code: string, message: string) => unknown;
}): AuthorizeProjectRequest {
  return async (req, res, projectId, options) => {
    const binding = deps.getBinding(projectId);
    if (!binding?.workspaceId) return deps.localAuthority(req, res, projectId, options);
    const scopedRequest = options.mode === 'read' && options.allowNavigationQuery
      ? requestWithWorkspaceNavigationScope(req)
      : req;
    if (scopedRequest === 'conflict') {
      deps.sendApiError(res, 400, 'WORKSPACE_CONTEXT_CONFLICT', 'workspace header and navigation scope must match');
      return false;
    }
    const claimed = workspaceResourceContextFromRequest(scopedRequest);
    if (!claimed) {
      // A headerless Personal project retains its local path only with a
      // fresh positive account-directory witness; Team and outages fail closed.
      if (await deps.isPersonalWorkspaceForAccount(
        binding.workspaceId,
        binding.createdByWorkspaceMemberId ?? null,
      )) {
        return deps.localAuthority(req, res, projectId, options);
      }
      deps.sendApiError(res, 400, 'WORKSPACE_CONTEXT_REQUIRED', 'an exact workspace identity is required');
      return false;
    }
    if (claimed === 'missing') {
      deps.sendApiError(res, 400, 'WORKSPACE_CONTEXT_REQUIRED', 'an exact workspace identity is required');
      return false;
    }
    // Request headers are claims, never an authority or a reason to bypass
    // this fresh check. This covers reads and writes after a missed SSE event.
    const verified = await deps.verifyWorkspaceRequestAuthority(scopedRequest);
    if (!verified.ok) {
      deps.sendApiError(res, verified.status, verified.code, verified.message);
      return false;
    }
    if (
      verified.context.workspaceId !== binding.workspaceId
      || verified.context.workspaceMemberId !== claimed.workspaceMemberId
      || verified.context.memberStatus !== 'active'
    ) {
      deps.sendApiError(res, 403, 'WORKSPACE_PROJECT_PERMISSION_DENIED', `workspace project ${options.mode} is not allowed`);
      return false;
    }
    if (
      binding.visibility === 'personal'
      && binding.createdByWorkspaceMemberId == null
      && verified.context.workspaceType === 'personal'
      && verified.context.role !== 'owner'
    ) {
      deps.sendApiError(res, 403, 'WORKSPACE_PROJECT_PERMISSION_DENIED', 'legacy private project access is not allowed');
      return false;
    }
    if (
      options.mode === 'read'
      && binding.visibility === 'personal'
      && binding.createdByWorkspaceMemberId !== claimed.workspaceMemberId
      && verified.context.role === 'owner'
    ) {
      try {
        await deps.reconcileMemberRemovalProjects(binding.workspaceId, claimed.workspaceMemberId);
      } catch (error) {
        console.warn('[od] member removal project deep-link readback failed:', String(error));
      }
    }
    return deps.localAuthority(req, res, projectId, options);
  };
}

/** A tool token names a Run, while its project binding names a creator.
 * Those identities differ for shared projects, so resolve only a live member
 * of the token's exact Workspace. AMR Runs also carry a pinned launch member. */
export function projectToolActorMember(input: {
  workspaceId: string;
  pinnedMemberId: string | null;
  requirePinnedMember: boolean;
  directory: ReadonlyArray<{
    workspaceId: string;
    workspaceMemberId: string;
    memberStatus: string;
    lifecycleState: string;
  }>;
}): string | null {
  if (input.requirePinnedMember && !input.pinnedMemberId) return null;
  const member = input.directory.find((item) =>
    item.workspaceId === input.workspaceId
    && item.memberStatus === 'active'
    && item.lifecycleState !== 'deleted'
    && item.workspaceMemberId.trim()
    && (!input.pinnedMemberId || item.workspaceMemberId === input.pinnedMemberId));
  return member?.workspaceMemberId ?? null;
}

export function projectToolActorPinIsCurrent(input: {
  pin: { workspaceId: string; workspaceMemberId: string; directoryIdentity: string } | null;
  workspaceId: string;
  currentDirectoryIdentity: string;
  amrPinnedMemberId?: string | null;
}): boolean {
  return Boolean(
    input.pin
    && input.pin.workspaceId === input.workspaceId
    && input.pin.directoryIdentity === input.currentDirectoryIdentity
    && (!Object.prototype.hasOwnProperty.call(input, 'amrPinnedMemberId')
      || input.amrPinnedMemberId === input.pin.workspaceMemberId),
  );
}

export function pinProjectToolActor(input: {
  workspaceId: string;
  runWorkspaceMemberId: string | null | undefined;
  directoryIdentityBefore: string;
  directoryIdentityAfter: string;
  directory: Parameters<typeof projectToolActorMember>[0]['directory'];
}): { workspaceId: string; workspaceMemberId: string; directoryIdentity: string } | null {
  if (input.directoryIdentityBefore !== input.directoryIdentityAfter) return null;
  const workspaceMemberId = projectToolActorMember({
    workspaceId: input.workspaceId,
    pinnedMemberId: input.runWorkspaceMemberId ?? null,
    requirePinnedMember: true,
    directory: input.directory,
  });
  return workspaceMemberId
    ? { workspaceId: input.workspaceId, workspaceMemberId, directoryIdentity: input.directoryIdentityAfter }
    : null;
}

export type AuthorizedProjectToolRequest = {
  readonly workspace: {
    readonly workspaceId: string;
    readonly workspaceMemberId: string;
  } | null;
};

export type AuthorizeProjectToolRequest = (
  res: Response,
  projectId: string,
  options: AuthorizeProjectRequestOptions,
  runId: string,
) => Promise<AuthorizedProjectToolRequest | null>;

export async function enforceLocalProjectDataPlaneRequest(input: {
  req: any;
  projectId: string;
  options: AuthorizeProjectRequestOptions;
  db: unknown;
  getWorkspaceProject: (
    db: unknown,
    workspaceId: string,
    projectId: string,
  ) => WorkspaceResourceAccessInput | null | undefined;
  getWorkspaceProjectByProjectId: (
    db: unknown,
    projectId: string,
  ) => WorkspaceResourceAccessInput | null | undefined;
  onDenied?: (
    status: number,
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ) => unknown;
}): Promise<boolean> {
  const {
    req,
    projectId,
    options,
    db,
    getWorkspaceProject,
    getWorkspaceProjectByProjectId,
    onDenied,
  } = input;
  const deny = (
    status: number,
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ): false => {
    onDenied?.(status, code, message, details);
    return false;
  };
  const persisted = getWorkspaceProjectByProjectId(db, projectId);
  if (!persisted?.workspaceId) return true;

  const scopedRequest = options.mode === 'read' && options.allowNavigationQuery
    ? requestWithWorkspaceNavigationScope(req)
    : req;
  if (scopedRequest === 'conflict') {
    return deny(
      400,
      'WORKSPACE_CONTEXT_CONFLICT',
      'workspace header and navigation scope must match',
    );
  }
  const claimed = workspaceResourceContextFromRequest(scopedRequest);
  if (claimed === 'missing') {
    return deny(
      400,
      'WORKSPACE_CONTEXT_INCOMPLETE',
      'both workspace and member identity are required',
    );
  }
  // A removed member's local private project has been transferred to the
  // Owner. The legacy headerless Personal read/write allowance cannot apply
  // to this project: without an exact claimed identity it would expose the
  // transferred contents to anyone using the same daemon data root.
  if (!claimed && persisted.transferredFromWorkspaceMemberId) {
    return deny(
      403,
      'WORKSPACE_PROJECT_PERMISSION_DENIED',
      `workspace project ${options.mode} is not allowed`,
    );
  }
  if (claimed && claimed.workspaceId !== persisted.workspaceId) {
    return deny(
      403,
      'WORKSPACE_PROJECT_PERMISSION_DENIED',
      `workspace project ${options.mode} is not allowed`,
    );
  }

  const row = getWorkspaceProject(db, persisted.workspaceId, projectId);
  if (!row || row.resourceState === 'deleted') {
    return deny(
      403,
      'WORKSPACE_PROJECT_PERMISSION_DENIED',
      `workspace project ${options.mode} is not allowed`,
    );
  }
  if (options.mode === 'read') {
    if (
      claimed
      && row.visibility === 'personal'
      && row.createdByWorkspaceMemberId
      && row.createdByWorkspaceMemberId !== claimed.workspaceMemberId
    ) {
      return deny(
        403,
        'WORKSPACE_PROJECT_PERMISSION_DENIED',
        'workspace project read is not allowed',
      );
    }
    return true;
  }
  if (row.resourceState === 'frozen') {
    return deny(
      403,
      'WORKSPACE_LOCKED',
      'workspace project mutation is not allowed',
    );
  }
  if (options.capability === 'comment') {
    if (!claimed) {
      return deny(
        400,
        'WORKSPACE_CONTEXT_REQUIRED',
        'workspace context is required',
      );
    }
    if (row.visibility === 'team') return true;
  }
  if (!claimed && row.visibility === 'team') {
    return deny(
      400,
      'WORKSPACE_CONTEXT_REQUIRED',
      'workspace context is required',
    );
  }

  // A Team project is single-writer. Pulled member mirrors deliberately persist
  // a null creator, so null means "no local writer", not "unattributed local
  // project". Keep those mirrors read-only from the durable row even when Vela
  // is unavailable; only an exact persisted creator/member match may write.
  if (
    row.visibility === 'team'
    && row.createdByWorkspaceMemberId !== claimed?.workspaceMemberId
  ) {
    return deny(
      403,
      'WORKSPACE_PROJECT_PERMISSION_DENIED',
      'workspace project mutation is not allowed',
    );
  }

  // An explicit browser/tool identity must still match the persisted creator
  // for attributed Personal projects. Headerless Personal projects retain CLI
  // compatibility.
  if (
    claimed
    && row.createdByWorkspaceMemberId
    && row.createdByWorkspaceMemberId !== claimed.workspaceMemberId
  ) {
    return deny(
      403,
      'WORKSPACE_PROJECT_PERMISSION_DENIED',
      'workspace project mutation is not allowed',
    );
  }
  return true;
}

/**
 * Build the one project data-plane authority gate used by route modules.
 *
 * Persisted project binding is the local namespace and creator witness. Local
 * project data-plane requests never synchronously depend on Vela membership
 * availability; cloud share/sync/billing boundaries perform their own fresh
 * authorization. Unbound pre-Workspace local projects retain legacy behavior.
 */
export function createAuthorizeProjectRequest(deps: {
  db: unknown;
  getWorkspaceProject: (
    db: unknown,
    workspaceId: string,
    projectId: string,
  ) => WorkspaceResourceAccessInput | null | undefined;
  getWorkspaceProjectByProjectId: (
    db: unknown,
    projectId: string,
  ) => WorkspaceResourceAccessInput | null | undefined;
  /** @deprecated Retained as an ignored compatibility seam for route fixtures. */
  verifyWorkspaceReadAuthority?: VerifyWorkspaceRequestAuthority;
  /** @deprecated Retained as an ignored compatibility seam for route fixtures. */
  resolveWorkspaceReadAuthority?: ResolveWorkspaceResourceReadAuthority;
  /** @deprecated Local project data-plane requests never call this verifier. */
  verifyWorkspaceRequestAuthority?: VerifyWorkspaceRequestAuthority;
  /**
   * Durable local quarantine witness for a pulled mirror whose authoritative
   * Team catalog row disappeared. Kept outside the generic workspace binding
   * shape because it lives on project metadata for restart-safe recovery.
   */
  isProjectRevoked?: (db: unknown, projectId: string) => boolean;
  /** A bound first-open placeholder may be read but is never content authority. */
  isProjectUnmaterializedPlaceholder?: (db: unknown, projectId: string) => boolean;
  /** A receive owns the project content until its local commit finishes. */
  isProjectReceivingContent?: (projectId: string) => boolean;
  sendApiError: (
    res: Response,
    status: number,
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ) => unknown;
}): AuthorizeProjectRequest {
  const {
    db,
    getWorkspaceProject,
    getWorkspaceProjectByProjectId,
    isProjectRevoked,
    isProjectUnmaterializedPlaceholder,
    sendApiError,
  } = deps;
  return async (req, res, projectId, options) => {
    if (isProjectRevoked?.(db, projectId)) {
      sendApiError(
        res,
        options.mode === 'read' ? 404 : 403,
        options.mode === 'read'
          ? 'PROJECT_NOT_FOUND'
          : 'WORKSPACE_PROJECT_PERMISSION_DENIED',
        options.mode === 'read'
          ? 'project not found'
          : 'workspace project mutation is not allowed',
      );
      return false;
    }
    const allowed = await enforceLocalProjectDataPlaneRequest({
      req,
      projectId,
      options,
      db,
      getWorkspaceProject,
      getWorkspaceProjectByProjectId,
      onDenied: (status, code, message, details) => details === undefined
        ? sendApiError(res, status, code, message)
        : sendApiError(res, status, code, message, details),
    });
    if (!allowed) return false;
    if (options.mode === 'write' && options.capability !== 'comment' && deps.isProjectReceivingContent?.(projectId)) {
      sendApiError(res, 409, 'PROJECT_BUSY', 'project is receiving cloud content');
      return false;
    }
    if (
      options.mode !== 'read'
      && options.capability !== 'comment'
      && isProjectUnmaterializedPlaceholder?.(db, projectId)
    ) {
      sendApiError(
        res,
        409,
        'PROJECT_MATERIALIZATION_PENDING',
        'project content is still materializing',
      );
      return false;
    }
    return true;
  };
}
