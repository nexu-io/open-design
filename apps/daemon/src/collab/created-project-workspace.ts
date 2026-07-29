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

/**
 * The daemon's own last-verified workspace identity, narrowed to the fields a
 * created project's binding needs.
 *
 * Structurally a subset of `WorkspaceCollabContext`, so a caller passes
 * `() => workspaceContext.lastKnown?.() ?? null` directly. Deliberately NOT the
 * `WorkspaceContextProvider` type — same reason `workspace-resource-mutation.ts`
 * takes a plain `GetLastKnownWorkspaceMembership` closure: a create path must not
 * drag the async B integration into a module every resource type depends on.
 */
export type AmbientWorkspaceSnapshot = {
  workspaceId: string;
  workspaceType: 'personal' | 'team';
  workspaceMemberId: string;
  role: WorkspaceResourceContext['role'];
  memberStatus: WorkspaceResourceContext['memberStatus'];
  lifecycleState: WorkspaceResourceContext['lifecycleState'];
  permissions: { canShareProjects: boolean; canWriteSyncedFiles: boolean };
};

/**
 * Read the daemon's ambient workspace with NO network I/O and no failure mode.
 * Backed by `collab/workspace-context.ts`'s `lastKnown()`, which is populated as
 * a side effect of the `.current()` traffic the daemon already serves (the web
 * client's periodic `GET /api/workspace/context` poll, the collab-cloud poller's
 * 5s tick, the dev/demo `PUT /api/workspace/context` seam).
 */
export type GetAmbientWorkspace = () => AmbientWorkspaceSnapshot | null | undefined;

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
 * The daemon's ambient workspace as a binding subject, or null when it is not
 * one this daemon may hand a project to.
 *
 * Refused for the same three reasons a header identity is: a removed member, a
 * member who cannot write synced files, and a locked/deleted workspace. Refusal
 * means "leave the project unbound", never "fail the create".
 *
 * `workspaceTypeAsserted` is null on purpose. That field records what the CALLER
 * claimed, and an ambient identity is the daemon's own knowledge — nobody claimed
 * anything, so `team-share-scope.ts` must not read a claim that was never made.
 *
 * `appUserId` is empty for the same reason: it mirrors a request header
 * (`x-od-app-user-id`) this path has none of. Nothing in the binding written
 * below consumes it.
 */
function ambientWorkspaceHome(
  getAmbientWorkspace?: GetAmbientWorkspace,
): WorkspaceResourceContext | null {
  const ambient = getAmbientWorkspace?.();
  if (!ambient) return null;
  const workspaceId = ambient.workspaceId?.trim();
  const workspaceMemberId = ambient.workspaceMemberId?.trim();
  if (!workspaceId || !workspaceMemberId) return null;
  const context: WorkspaceResourceContext = {
    workspaceId,
    workspaceType: ambient.workspaceType === 'team' ? 'team' : 'personal',
    workspaceTypeAsserted: null,
    appUserId: '',
    workspaceMemberId,
    role: ambient.role,
    memberStatus: ambient.memberStatus,
    lifecycleState: ambient.lifecycleState,
    canShareProjects: ambient.permissions.canShareProjects,
    canWriteSyncedFiles: ambient.permissions.canWriteSyncedFiles,
  };
  if (
    context.memberStatus !== 'active'
    || !context.canWriteSyncedFiles
    || isWorkspaceResourceLocked(context)
  ) {
    return null;
  }
  return context;
}

/**
 * The workspace a project created by this request belongs to — for a creation
 * path that has NO authorization gate of its own and must never grow one.
 *
 * INVARIANT: this never refuses and never throws. It answers with the caller's
 * own workspace when the request names a usable one, the daemon's ambient
 * workspace when it does not, and null only when neither exists — a genuinely
 * signed-out daemon, where `unbound` is the honest answer and a guard would
 * break the single-player user.
 *
 * Use this instead of `resolveCreatedProjectWorkspace` on paths that were
 * previously binding nothing at all (Orbit and routine projects, the plugin
 * share-project task, the library capture-as-page exit, project-location scan
 * imports, the design-system workspace project). Those paths ship today and
 * return 200 today; turning a header problem into a 4xx there would be a
 * regression, so a partial/denied header identity degrades to the ambient
 * workspace rather than failing.
 */
export function createdProjectWorkspaceHome(
  req: unknown,
  getAmbientWorkspace?: GetAmbientWorkspace,
): WorkspaceResourceContext | null {
  const claimed = resolveCreatedProjectWorkspace(req);
  if (claimed.ok && claimed.context !== null) return claimed.context;
  return ambientWorkspaceHome(getAmbientWorkspace);
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
 * `context` is the caller's own workspace when the request named one. When it did
 * not, the binding falls back to the daemon's ambient workspace instead of
 * leaving an orphan — a headerless create is a caller that COULDN'T say which
 * workspace it meant (`od project create` and the MCP `create_project` tool mint
 * no headers; a web create fired before the seconds-long identity read lands
 * sends none; Orbit and scheduled routines have no request at all), not a caller
 * asserting there is no workspace. The one case with genuinely no answer — no
 * request identity and no resolved session — still binds nothing, on purpose.
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
  getAmbientWorkspace?: GetAmbientWorkspace,
): void {
  const home = context ?? ambientWorkspaceHome(getAmbientWorkspace);
  if (!home) return;
  ensureWorkspaceProject({
    projectId,
    workspaceId: home.workspaceId,
    visibility: 'personal',
    resourceState: 'active',
    createdByWorkspaceMemberId: home.workspaceMemberId,
    updatedByWorkspaceMemberId: home.workspaceMemberId,
    syncState: 'local_only',
    resourceHubResourceId: null,
    cloudTombstonedAt: null,
    createdAt: now,
    updatedAt: now,
  });
}
