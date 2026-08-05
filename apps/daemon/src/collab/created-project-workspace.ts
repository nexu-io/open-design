import type { ApiErrorResponse } from '@open-design/contracts';
import type { Response } from 'express';
import {
  isWorkspaceResourceLocked,
  workspaceResourceContextFromRequest,
  type WorkspaceResourceContext,
} from './workspace-resource-mutation.js';
import {
  workspaceContextFromDirectoryItem,
  type WorkspaceDirectoryFetchResult,
} from './vela-workspace-context.js';
import { sendApiError } from '../http/api-errors.js';

export type CreatedProjectWorkspaceResolution =
  | { ok: true; context: WorkspaceResourceContext | null }
  | {
      ok: false;
      status: 400 | 403 | 503;
      code:
        | 'WORKSPACE_CONTEXT_INCOMPLETE'
        | 'WORKSPACE_PROJECT_PERMISSION_DENIED'
        | 'WORKSPACE_AUTHORITY_UNAVAILABLE';
      message: string;
      retryable?: true;
    };

export type CreatedProjectWorkspaceError = Extract<
  CreatedProjectWorkspaceResolution,
  { ok: false }
>;

export function sendCreatedProjectWorkspaceError(
  res: Response,
  error: CreatedProjectWorkspaceError,
): Response<ApiErrorResponse> {
  return sendApiError(
    res,
    error.status,
    error.code,
    error.message,
    error.retryable ? { retryable: true } : {},
  );
}

/**
 * Resolve the workspace authority for a route that creates a project.
 *
 * A completely headerless request is a legal legacy/anonymous caller and
 * intentionally leaves the new project unbound. Once either workspace
 * identity header is present, however, the request is a workspace-aware
 * caller: partial, removed, locked, or non-writing identities must fail
 * closed instead of silently creating an unbound orphan.
 */
export function resolveCreatedProjectWorkspace(
  req: unknown,
): CreatedProjectWorkspaceResolution {
  const context = workspaceResourceContextFromRequest(req);
  if (context === null) return { ok: true, context: null };
  if (context === 'missing') {
    return {
      ok: false,
      status: 400,
      code: 'WORKSPACE_CONTEXT_INCOMPLETE',
      message: 'workspace project creation requires both workspace and member identity',
    };
  }
  if (
    context.memberStatus !== 'active'
    || !context.canWriteSyncedFiles
    || isWorkspaceResourceLocked(context)
  ) {
    return {
      ok: false,
      status: 403,
      code: 'WORKSPACE_PROJECT_PERMISSION_DENIED',
      message: 'workspace project creation is not allowed',
    };
  }
  return { ok: true, context };
}

/**
 * Authorize an explicitly-scoped project create against the signed-in
 * membership directory. The caller-selected workspace/member pair is the
 * lookup key; the daemon's ambient active workspace is deliberately absent
 * from this contract.
 *
 * A missing fetcher is the local/dev compatibility path. Production Vela
 * mode injects one and therefore fails closed when AMR is unavailable.
 */
export async function authorizeCreatedProjectWorkspace(
  req: unknown,
  fetchWorkspaceDirectory?: () => Promise<WorkspaceDirectoryFetchResult>,
): Promise<CreatedProjectWorkspaceResolution> {
  const claimed = resolveCreatedProjectWorkspace(req);
  if (!claimed.ok || claimed.context === null || !fetchWorkspaceDirectory) {
    return claimed;
  }
  const claimedContext = claimed.context;

  let directory: WorkspaceDirectoryFetchResult;
  try {
    directory = await fetchWorkspaceDirectory();
  } catch {
    directory = { ok: false, items: [] };
  }
  if (!directory.ok) {
    return {
      ok: false,
      status: 503,
      code: 'WORKSPACE_AUTHORITY_UNAVAILABLE',
      message: 'workspace membership authority is temporarily unavailable',
      retryable: true,
    };
  }

  const item = directory.items.find(
    (candidate) =>
      candidate.workspaceId === claimedContext.workspaceId
      && candidate.workspaceMemberId === claimedContext.workspaceMemberId,
  );
  if (!item) {
    return {
      ok: false,
      status: 403,
      code: 'WORKSPACE_PROJECT_PERMISSION_DENIED',
      message: 'workspace project creation is not allowed',
    };
  }

  const authoritative = workspaceContextFromDirectoryItem(item);
  const context: WorkspaceResourceContext = {
    workspaceId: authoritative.workspaceId,
    workspaceType: authoritative.workspaceType,
    workspaceTypeAsserted: authoritative.workspaceType,
    appUserId: claimedContext.appUserId,
    workspaceMemberId: authoritative.workspaceMemberId,
    role: authoritative.role,
    memberStatus: authoritative.memberStatus,
    lifecycleState: authoritative.lifecycleState,
    canShareProjects: authoritative.permissions.canShareProjects,
    canWriteSyncedFiles: authoritative.permissions.canWriteSyncedFiles,
  };
  if (
    context.memberStatus !== 'active'
    || !context.canWriteSyncedFiles
    || isWorkspaceResourceLocked(context)
  ) {
    return {
      ok: false,
      status: 403,
      code: 'WORKSPACE_PROJECT_PERMISSION_DENIED',
      message: 'workspace project creation is not allowed',
    };
  }
  return { ok: true, context };
}

/**
 * Error thrown by resolver-style creation paths. It preserves the same typed
 * 400/403/503 result as direct HTTP creation gates so callers can reject before
 * touching the filesystem or database.
 */
export class CreatedProjectWorkspaceResolutionError extends Error {
  readonly status: CreatedProjectWorkspaceError['status'];
  readonly code: CreatedProjectWorkspaceError['code'];
  readonly retryable?: true;

  constructor(error: CreatedProjectWorkspaceError) {
    super(error.message);
    this.name = 'CreatedProjectWorkspaceResolutionError';
    this.status = error.status;
    this.code = error.code;
    if (error.retryable) this.retryable = true;
  }
}

/**
 * Resolve an exact creation scope. Headerless legacy requests remain unbound.
 * Once either identity field is asserted, any incomplete, removed, denied, or
 * unavailable authority fails closed; it never degrades to ambient/current or
 * silently creates an unbound project.
 */
export async function createdProjectWorkspaceHome(
  req: unknown,
  fetchWorkspaceDirectory?: () => Promise<WorkspaceDirectoryFetchResult>,
): Promise<WorkspaceResourceContext | null> {
  const authorized = await authorizeCreatedProjectWorkspace(req, fetchWorkspaceDirectory);
  if (!authorized.ok) throw new CreatedProjectWorkspaceResolutionError(authorized);
  return authorized.context;
}

/**
 * A `createdProjectWorkspaceHome` bound to one daemon's authorities, so a route
 * module takes a single dep instead of re-threading three.
 */
export type CreatedProjectWorkspaceResolver = (
  req: unknown,
) => Promise<WorkspaceResourceContext | null>;

export function createCreatedProjectWorkspaceResolver(deps: {
  fetchWorkspaceDirectory?: () => Promise<WorkspaceDirectoryFetchResult>;
}): CreatedProjectWorkspaceResolver {
  return (req) =>
    createdProjectWorkspaceHome(
      req,
      deps.fetchWorkspaceDirectory,
    );
}

/**
 * Write the `workspace_projects` row for a project this daemon just created.
 *
 * INVARIANT: a project created while this daemon knows a signed-in workspace
 * always gets a binding row. A project with no row is not a harmless default —
 * `GET /api/projects/:id/workspace-scope` answers `unbound` for it, which strips
 * the workspace off the run request (`ProjectView`'s `projectRunWorkspaceContext`
 * → an Open Design Cloud run nothing can bill) and blanks the balance/plan area
 * while that project is open (`AvatarMenu`). It is also denied a run outright by
 * `enforceWorkspaceResourceMutation` the moment the caller carries any workspace
 * header, because the two-key lookup comes back empty.
 *
 * `context` is the caller's exact verified Workspace when the request named
 * one. A headerless legacy request supplies null and remains unbound.
 */
export function bindCreatedProjectToWorkspace(
  ensureWorkspaceProject: (input: {
    projectId: string;
    workspaceId: string;
    visibility: 'personal';
    resourceState: 'active';
    createdByWorkspaceMemberId: string;
    updatedByWorkspaceMemberId: string;
    syncState: 'local_only';
    resourceHubResourceId: null;
    cloudTombstonedAt: null;
    createdAt: number;
    updatedAt: number;
  }) => unknown,
  context: WorkspaceResourceContext | null,
  projectId: string,
  now: number,
): void {
  if (!context) return;
  ensureWorkspaceProject({
    projectId,
    workspaceId: context.workspaceId,
    visibility: 'personal',
    resourceState: 'active',
    createdByWorkspaceMemberId: context.workspaceMemberId,
    updatedByWorkspaceMemberId: context.workspaceMemberId,
    syncState: 'local_only',
    resourceHubResourceId: null,
    cloudTombstonedAt: null,
    createdAt: now,
    updatedAt: now,
  });
}
