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

export type AuthorizeProjectToolRequest = (
  res: Response,
  projectId: string,
  options: AuthorizeProjectRequestOptions,
) => Promise<boolean>;

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
  verifyWorkspaceRequestAuthority?: VerifyWorkspaceRequestAuthority;
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
    verifyWorkspaceRequestAuthority,
    sendApiError,
  } = deps;
  return (req, res, projectId, options) => {
    if (options.mode === 'write') {
      return enforceVerifiedWorkspaceResourceMutation(
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
    return enforceVerifiedWorkspaceResourceRead(
      'project',
      req,
      res,
      sendApiError,
      getWorkspaceProject,
      getWorkspaceProjectByProjectId,
      db,
      projectId,
      verifyWorkspaceRequestAuthority,
      options.allowNavigationQuery ? { allowNavigationQuery: true } : {},
    );
  };
}
