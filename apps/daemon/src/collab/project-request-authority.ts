import type { Response } from 'express';
import {
  enforceVerifiedWorkspaceResourceMutation,
  enforceVerifiedWorkspaceResourceRead,
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
) => Promise<AuthorizedProjectToolRequest | null>;

/**
 * Build the one project data-plane authority gate used by route modules.
 *
 * Persisted project binding is the resource identity. Bound projects require a
 * fresh exact Workspace/member verification on every request; no active,
 * current, or last-known daemon Workspace participates. Unbound pre-Workspace
 * local projects retain their legacy behavior.
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
  /**
   * Bounded successful authority lease for idempotent project reads. When
   * omitted, reads retain the mutation verifier for compatibility with narrow
   * fixtures and callers that do not provide separate cache policy.
   */
  verifyWorkspaceReadAuthority?: VerifyWorkspaceRequestAuthority;
  /** Fresh fail-closed authority used for every project mutation. */
  verifyWorkspaceRequestAuthority?: VerifyWorkspaceRequestAuthority;
  /**
   * Durable local quarantine witness for a pulled mirror whose authoritative
   * Team catalog row disappeared. Kept outside the generic workspace binding
   * shape because it lives on project metadata for restart-safe recovery.
   */
  isProjectRevoked?: (db: unknown, projectId: string) => boolean;
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
    verifyWorkspaceReadAuthority,
    verifyWorkspaceRequestAuthority,
    isProjectRevoked,
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
    if (options.mode === 'write') {
      return await enforceVerifiedWorkspaceResourceMutation(
        'project',
        req,
        res,
        sendApiError,
        getWorkspaceProject,
        getWorkspaceProjectByProjectId,
        db,
        projectId,
        options.capability,
        verifyWorkspaceRequestAuthority,
      );
    }
    return await enforceVerifiedWorkspaceResourceRead(
      'project',
      req,
      res,
      sendApiError,
      getWorkspaceProject,
      getWorkspaceProjectByProjectId,
      db,
      projectId,
      verifyWorkspaceReadAuthority ?? verifyWorkspaceRequestAuthority,
      options.allowNavigationQuery ? { allowNavigationQuery: true } : {},
    );
  };
}
