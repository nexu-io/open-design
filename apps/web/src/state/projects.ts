// Project / conversation / message / tab persistence — backed by the
// daemon's SQLite store. All writes round-trip through HTTP so projects
// stay coherent across multiple browser tabs and across restarts.
//
// These helpers fail soft (returning null / [] on transport errors) so
// the UI can stay rendered when the daemon is briefly unreachable.

import { coalescedGet, evictCoalescedGet } from '../lib/coalesced-get';
import { markProjectCreatedByViewer } from '../collab/useProjectCollab';
import { API_ERROR_CODES, type ApiErrorCode } from '@open-design/contracts';
import type {
  AppliedPluginSnapshot,
  ApplyResult,
  ChatSessionMode,
  CreateConversationRequest,
  CreateDesignSystemProjectFromProjectResponse,
  DuplicateProjectResponse,
  CreatePluginShareProjectResponse,
  CreateTerminalRequest,
  ImportFolderRequest,
  ImportFolderResponse,
  InstalledPluginRecord,
  PluginDuplicateProjectResponse,
  PluginInstallOutcome,
  PluginShareAction,
  ProjectPluginFolderInstallRequest,
  ProjectVisibility,
  ProjectWorkspaceScopeResponse,
  TerminalSession,
  WorkspaceCollabContext,
  WorkspaceProjectSummary,
  WorkspaceProjectsResponse,
} from '@open-design/contracts';
import { randomUUID } from '../utils/uuid';
import { markProjectDisplaySnapshotsDirty } from './project-display-cache';
import {
  workspaceIdentityCacheKey,
  workspaceProjectHeaders,
  workspaceResourceUrl,
} from '../collab/workspace-identity';
import { currentWorkspaceAccountGeneration } from '../collab/useWorkspaceContext';
import type {
  ChatMessage,
  Conversation,
  OpenTabsState,
  Project,
  ProjectMetadata,
  ProjectTemplate,
} from '../types';

export type { PluginInstallOutcome } from '@open-design/contracts';
export type { PluginShareAction } from '@open-design/contracts';
export { workspaceProjectHeaders } from '../collab/workspace-identity';

export type WorkspaceProjectListView = 'all' | 'recent' | 'drafts' | 'team';

const WORKSPACE_PROJECT_LIST_VIEWS: readonly WorkspaceProjectListView[] = [
  'all',
  'recent',
  'drafts',
  'team',
];

function workspaceProjectListCacheKey(
  context: WorkspaceCollabContext,
  workspaceView: WorkspaceProjectListView,
): string {
  return [
    'workspace-projects',
    workspaceIdentityCacheKey(context),
    workspaceView,
  ].join(':');
}

export function invalidateWorkspaceProjectLists(
  context: WorkspaceCollabContext,
  accountGeneration?: number,
): void {
  for (const workspaceView of WORKSPACE_PROJECT_LIST_VIEWS) {
    evictCoalescedGet(workspaceProjectListCacheKey(context, workspaceView));
  }
  markProjectDisplaySnapshotsDirty({ context, accountGeneration });
}

export type WorkspaceContextForWrite = {
  context: WorkspaceCollabContext | null;
  loading: boolean;
  identityChangePending?: boolean;
  failure?: 'unsupported' | 'unavailable';
};

export type WorkspaceContextWriteResolutionOptions = {
  /**
   * `unscoped` is reserved for callers whose operation is genuinely local and
   * does not require AMR Workspace authority. All Workspace-owned writes keep
   * the default `reject` policy.
   */
  unavailablePolicy?: 'reject' | 'unscoped';
};

/**
 * Preserve headerless old-daemon/anonymous compatibility, but never collapse
 * an unresolved or unavailable modern workspace authority into "anonymous".
 */
export function resolvedWorkspaceContextForWrite(
  state: WorkspaceContextForWrite,
  options: WorkspaceContextWriteResolutionOptions = {},
): WorkspaceCollabContext | null {
  if (
    state.loading
    || state.identityChangePending === true
    || state.failure === 'unavailable'
  ) {
    if (options.unavailablePolicy === 'unscoped') return null;
    throw new Error('Workspace context is unavailable. Try again when workspace sync finishes.');
  }
  return state.context;
}

/**
 * A workspace project move the daemon refused, carrying the contract error
 * code (`ApiError.code`) when the response body names one. Kept as a named
 * class so UI callers can branch on `code` — `TEAM_PROJECT_OWNER_CONFLICT`
 * is a permanent ownership conflict that must not render as the generic
 * "try again later" hint.
 */
export class WorkspaceProjectMoveError extends Error {
  readonly code: ApiErrorCode | null;

  constructor(message: string, code: ApiErrorCode | null) {
    super(message);
    this.name = 'WorkspaceProjectMoveError';
    this.code = code;
  }
}

/**
 * The contract error code a failed move carries, or null. Duck-typed on a
 * string `code` property (validated against `API_ERROR_CODES`) instead of
 * `instanceof`, so callers and tests can classify any conforming error
 * without importing the concrete class.
 */
export function workspaceProjectMoveErrorCode(error: unknown): ApiErrorCode | null {
  if (!(error instanceof Error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && (API_ERROR_CODES as readonly string[]).includes(code)
    ? (code as ApiErrorCode)
    : null;
}

export async function moveWorkspaceProject(input: {
  projectId: string;
  visibility: ProjectVisibility;
  workspaceContext: WorkspaceCollabContext | null;
}): Promise<WorkspaceProjectSummary> {
  const context = input.workspaceContext;
  if (!context) throw new Error('Workspace context is required');
  const resp = await fetch(
    `/api/workspaces/${encodeURIComponent(context.workspaceId)}/projects/${encodeURIComponent(input.projectId)}/move`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...workspaceProjectHeaders(context),
      },
      body: JSON.stringify({ visibility: input.visibility }),
    },
  );
  if (!resp.ok) {
    let message = `workspace project move failed with status ${resp.status}`;
    let code: ApiErrorCode | null = null;
    try {
      const body = await resp.json() as { error?: unknown };
      if (body.error && typeof body.error === 'object') {
        const errorBody = body.error as { code?: unknown; message?: unknown };
        if (
          typeof errorBody.code === 'string' &&
          (API_ERROR_CODES as readonly string[]).includes(errorBody.code)
        ) {
          code = errorBody.code as ApiErrorCode;
        }
        if (typeof errorBody.message === 'string' && errorBody.message.trim()) {
          message = errorBody.message;
        }
      }
    } catch {
      // Keep the generic fallback when the error body is absent or invalid.
    }
    throw new WorkspaceProjectMoveError(message, code);
  }
  // A share/unshare changes membership across several projections at once
  // (`recent`, `drafts`, `team`, and `all`). Do not let the coalescing window
  // replay the pre-move snapshot into the immediate refresh.
  invalidateWorkspaceProjectLists(context);
  const json = (await resp.json()) as { project: WorkspaceProjectSummary };
  return json.project;
}

function omitWorkspaceContext<T extends { workspaceContext?: WorkspaceCollabContext | null }>(
  input: T,
): Omit<T, 'workspaceContext'> {
  const { workspaceContext: _workspaceContext, ...rest } = input;
  return rest;
}

export async function listProjects(options?: {
  throwOnError?: boolean;
  workspaceContext?: WorkspaceCollabContext | null;
  workspaceView?: WorkspaceProjectListView;
}): Promise<Project[]> {
  const context = options?.workspaceContext ?? null;
  if (context) {
    const summaries = await listWorkspaceProjectSummaries({
      context,
      workspaceView: options?.workspaceView,
      throwOnError: options?.throwOnError,
    });
    const seenProjectIds = new Set<string>();
    return summaries.flatMap((summary) => {
      // Workspace list responses carry the authoritative scope on the summary
      // wrapper. Remote catalog projects can omit it from the nested project,
      // and a stale nested value must not leak another Workspace into a card.
      const project: Project = {
        ...summary.project,
        workspaceId: summary.workspaceId,
        workspaceVisibility: summary.visibility,
      };
      // Workspace summaries have resource-level identities, so the same
      // logical project can legitimately appear more than once when local and
      // remote catalog records overlap. Project cards are opened by project.id;
      // keep the first (the daemon orders local summaries before remote ones)
      // instead of rendering duplicate cards with duplicate React keys.
      if (seenProjectIds.has(project.id)) return [];
      seenProjectIds.add(project.id);
      return [project];
    });
  }
  // No resolved workspace identity at all — either the context has not landed
  // yet or this daemon has no workspace plane. The key is a constant on
  // purpose: it caches the ONE unscoped `/api/projects` answer, and it is
  // unreachable once a context exists (the workspace branch above returns
  // first), so it can never serve one workspace's rows to another. The
  // workspace-scoped read's own key is built in
  // `listWorkspaceProjectSummaries` below and carries the full wire identity
  // plus the requested view.
  try {
    return await coalescedGet('local-projects', async () => {
      const resp = await fetch('/api/projects');
      // Throw inside the coalesced run so a failed read is not cached — the next
      // caller/poll retries immediately (see coalesced-get.ts).
      if (!resp.ok) throw new Error(`projects ${resp.status}`);
      const json = (await resp.json()) as { projects: Project[] };
      return json.projects ?? [];
    });
  } catch (err) {
    if (options?.throwOnError) throw err;
    return [];
  }
}

export async function listWorkspaceProjectSummaries(options: {
  context: WorkspaceCollabContext;
  throwOnError?: boolean;
  workspaceView?: WorkspaceProjectListView;
}): Promise<WorkspaceProjectSummary[]> {
  const { context } = options;
  const workspaceView = options.workspaceView ?? 'drafts';
  const key = workspaceProjectListCacheKey(context, workspaceView);
  try {
    return await coalescedGet(key, async () => {
      const resp = await fetch(
        `/api/workspaces/${encodeURIComponent(context.workspaceId)}/projects?view=${encodeURIComponent(workspaceView)}`,
        { headers: workspaceProjectHeaders(context) },
      );
      if (!resp.ok) throw new Error(`projects ${resp.status}`);
      const json = (await resp.json()) as WorkspaceProjectsResponse;
      return json.projects ?? [];
    });
  } catch (err) {
    if (options.throwOnError) throw err;
    return [];
  }
}

export async function getProject(
  id: string,
  workspaceContext?: WorkspaceCollabContext | null,
): Promise<Project | null> {
  try {
    const resp = await fetch(
      `/api/projects/${encodeURIComponent(id)}`,
      workspaceContext
        ? { headers: workspaceProjectHeaders(workspaceContext) }
        : undefined,
    );
    if (!resp.ok) return null;
    const json = (await resp.json()) as { project: Project };
    return json.project;
  } catch {
    return null;
  }
}

export type ProjectRouteBootstrapResult =
  | {
      kind: 'found';
      project: Project;
      scope: ProjectWorkspaceScopeResponse['scope'];
      resolvedDir: string | null;
    }
  | { kind: 'not-found' }
  | { kind: 'forbidden' }
  | { kind: 'unavailable' };

/**
 * Bootstrap a fresh project deep link without borrowing the shell's ambient
 * Workspace. A card-opening witness goes straight through the scoped endpoint;
 * a context-free deep link uses its first headerless response only to discover
 * the persisted binding, then re-confirms it with exact Workspace/member
 * headers. The project row is read only after either exact check succeeds.
 */
export async function bootstrapProjectRoute(
  projectId: string,
  options: {
    accountGeneration: number;
    exactContext?: WorkspaceCollabContext | null;
  },
): Promise<ProjectRouteBootstrapResult> {
  const suppliedContext = options.exactContext ?? null;
  const suppliedIdentity = workspaceIdentityCacheKey(suppliedContext);
  const key = [
    'project-route-bootstrap',
    options.accountGeneration,
    projectId,
    suppliedIdentity,
  ].join(':');
  const result = await coalescedGet(key, async (): Promise<ProjectRouteBootstrapResult> => {
    try {
      const scopeResponse = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/workspace-scope`,
        {
          cache: 'no-store',
          ...(suppliedContext
            ? { headers: workspaceProjectHeaders(suppliedContext) }
            : {}),
        },
      );
      if (!scopeResponse.ok) {
        if (scopeResponse.status === 404) return { kind: 'not-found' };
        if (scopeResponse.status === 403) return { kind: 'forbidden' };
        return { kind: 'unavailable' };
      }
      let body = (await scopeResponse.json()) as ProjectWorkspaceScopeResponse;
      if (!body.scope || body.scope.projectId !== projectId) {
        return { kind: 'unavailable' };
      }
      let context = body.scope.context;
      if (suppliedContext) {
        if (
          !context
          || body.scope.workspaceId !== suppliedContext.workspaceId
          || workspaceIdentityCacheKey(context) !== suppliedIdentity
        ) {
          // A caller-supplied witness is exact authority, never a hint. If the
          // daemon cannot re-confirm it, do not retry this project headerless or
          // let it fall through to Personal/local scope.
          return { kind: 'forbidden' };
        }
      } else if (context) {
        // Headerless scope is discovery only. Once it names the exact persisted
        // Workspace/member pair, prove that claim through the ordinary
        // fail-closed authorization lane before trusting it as ProjectView's
        // seed. This also ensures an already-known Team route never completes
        // with headerless scope as its last authorization request.
        const exactScopeResponse = await fetch(
          `/api/projects/${encodeURIComponent(projectId)}/workspace-scope`,
          {
            cache: 'no-store',
            headers: workspaceProjectHeaders(context),
          },
        );
        if (!exactScopeResponse.ok) {
          if (exactScopeResponse.status === 404) return { kind: 'not-found' };
          if (exactScopeResponse.status === 403) return { kind: 'forbidden' };
          return { kind: 'unavailable' };
        }
        const exactBody = (await exactScopeResponse.json()) as ProjectWorkspaceScopeResponse;
        const exactContext = exactBody.scope?.context;
        if (
          !exactBody.scope
          || exactBody.scope.projectId !== projectId
          || !exactContext
          || exactBody.scope.workspaceId !== context.workspaceId
          || workspaceIdentityCacheKey(exactContext) !== workspaceIdentityCacheKey(context)
        ) {
          return { kind: 'forbidden' };
        }
        body = exactBody;
        context = exactContext;
      }
      const projectResponse = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}`,
        {
          cache: 'no-store',
          ...(context ? { headers: workspaceProjectHeaders(context) } : {}),
        },
      );
      if (!projectResponse.ok) {
        if (projectResponse.status === 404) return { kind: 'not-found' };
        if (projectResponse.status === 403) return { kind: 'forbidden' };
        return { kind: 'unavailable' };
      }
      const projectBody = (await projectResponse.json()) as {
        project?: Project;
        resolvedDir?: unknown;
      };
      if (!projectBody.project || projectBody.project.id !== projectId) {
        return { kind: 'unavailable' };
      }
      if (
        context
        && projectBody.project.workspaceId !== context.workspaceId
      ) {
        // The binding changed between the scope witness and the detail read.
        // Do not mount the row under stale authority.
        return { kind: 'forbidden' };
      }
      if (!context && projectBody.project.workspaceId) {
        return { kind: 'forbidden' };
      }
      return {
        kind: 'found',
        project: projectBody.project,
        scope: body.scope,
        resolvedDir:
          typeof projectBody.resolvedDir === 'string'
            ? projectBody.resolvedDir
            : typeof projectBody.project.metadata?.baseDir === 'string'
              ? projectBody.project.metadata.baseDir
              : null,
      };
    } catch {
      return { kind: 'unavailable' };
    }
  });
  if (result.kind === 'unavailable') evictCoalescedGet(key);
  return result;
}

export async function getProjectDetail(
  id: string,
  opts?: { ensureDir?: boolean },
  workspaceContext?: WorkspaceCollabContext | null,
): Promise<{ project: Project; resolvedDir: string | null } | null> {
  try {
    // `ensureDir` asks the daemon to materialize a managed project's folder
    // before resolving it, so referencing a brand-new (empty) project yields a
    // real on-disk directory instead of a path that fails existence checks.
    const query = opts?.ensureDir ? '?ensureDir=1' : '';
    const resp = await fetch(
      `/api/projects/${encodeURIComponent(id)}${query}`,
      workspaceContext
        ? { headers: workspaceProjectHeaders(workspaceContext) }
        : undefined,
    );
    if (!resp.ok) return null;
    const json = (await resp.json()) as { project: Project; resolvedDir?: unknown };
    return {
      project: json.project,
      resolvedDir: typeof json.resolvedDir === 'string' ? json.resolvedDir : null,
    };
  } catch {
    return null;
  }
}

export async function createProject(input: {
  name: string;
  projectLocationId?: string;
  skillId: string | null;
  designSystemId: string | null;
  pendingPrompt?: string;
  metadata?: ProjectMetadata;
  conversationMode?: ChatSessionMode;
  // Plan §3.A1 / spec §11.5 — POST /api/projects accepts a pluginId
  // (or pre-applied snapshot id) to resolve and pin a plugin to the new
  // project. Used by the PluginLoopHome flow on Home.
  pluginId?: string;
  appliedPluginSnapshotId?: string;
  pluginInputs?: Record<string, unknown>;
  workspaceContext?: WorkspaceCollabContext | null;
}): Promise<{ project: Project; conversationId: string; appliedPluginSnapshotId?: string }> {
  try {
    // `randomUUID` falls back to `crypto.getRandomValues` / `Math.random`
    // when `crypto.randomUUID` is unavailable. Open Design served over
    // plain HTTP on a LAN IP (Docker / unRAID self-hosting) is a
    // non-secure context, where `crypto.randomUUID` is undefined and
    // calling it directly throws — the surrounding try/catch then turns
    // the Create button into a silent no-op (issue #849).
    const id = randomUUID();
    const resp = await fetch('/api/projects', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(input.workspaceContext ? workspaceProjectHeaders(input.workspaceContext) : {}),
      },
      body: JSON.stringify({ id, ...omitWorkspaceContext(input) }),
    });
    if (!resp.ok) {
      let message = 'Could not create project';
      try {
        const body = await resp.json() as { error?: unknown };
        if (
          body.error &&
          typeof body.error === 'object' &&
          'message' in body.error &&
          typeof body.error.message === 'string' &&
          body.error.message.trim()
        ) {
          message = body.error.message;
        }
      } catch {
        // Keep the generic fallback when the error body is absent or invalid.
      }
      throw new Error(message);
    }
    const created = (await resp.json()) as {
      project: Project;
      conversationId: string;
      appliedPluginSnapshotId?: string;
    };
    // Preserve the exact Workspace authority used by this create request.
    // `useProjectCollab` may use this only to skip the initial status-unknown
    // read-only window; another Workspace with the same project id must not
    // inherit the signal.
    markProjectCreatedByViewer(created.project.id, input.workspaceContext ?? null);
    return created;
  } catch (err) {
    throw err instanceof Error ? err : new Error('Could not create project');
  }
}

export async function createDesignSystemProjectFromProject(
  projectId: string,
  input: { name?: string; pendingPrompt?: string } = {},
  workspaceContext?: WorkspaceCollabContext | null,
): Promise<CreateDesignSystemProjectFromProjectResponse> {
  try {
    const resp = await fetch(`/api/projects/${encodeURIComponent(projectId)}/design-system-copy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(workspaceContext ? workspaceProjectHeaders(workspaceContext) : {}),
      },
      body: JSON.stringify(input),
    });
    if (!resp.ok) {
      let message = 'Could not create design system';
      try {
        const body = await resp.json() as { error?: unknown };
        if (
          body.error &&
          typeof body.error === 'object' &&
          'message' in body.error &&
          typeof body.error.message === 'string' &&
          body.error.message.trim()
        ) {
          message = body.error.message;
        } else if (typeof body.error === 'string' && body.error.trim()) {
          message = body.error;
        }
      } catch {
        // Keep the generic fallback when the error body is absent or invalid.
      }
      throw new Error(message);
    }
    return (await resp.json()) as CreateDesignSystemProjectFromProjectResponse;
  } catch (err) {
    throw err instanceof Error ? err : new Error('Could not create design system');
  }
}

export async function duplicateProject(
  projectId: string,
  input: { name?: string } = {},
  workspaceContext?: WorkspaceCollabContext | null,
): Promise<DuplicateProjectResponse> {
  try {
    const resp = await fetch(`/api/projects/${encodeURIComponent(projectId)}/duplicate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(workspaceContext ? workspaceProjectHeaders(workspaceContext) : {}),
      },
      body: JSON.stringify(input),
    });
    if (!resp.ok) {
      let message = 'Could not duplicate project';
      try {
        const body = await resp.json() as { error?: unknown };
        if (
          body.error &&
          typeof body.error === 'object' &&
          'message' in body.error &&
          typeof body.error.message === 'string' &&
          body.error.message.trim()
        ) {
          message = body.error.message;
        } else if (typeof body.error === 'string' && body.error.trim()) {
          message = body.error;
        }
      } catch {
        // Keep the generic fallback when the error body is absent or invalid.
      }
      throw new Error(message);
    }
    const created = (await resp.json()) as DuplicateProjectResponse;
    markProjectCreatedByViewer(created.project.id, workspaceContext ?? null);
    return created;
  } catch (err) {
    throw err instanceof Error ? err : new Error('Could not duplicate project');
  }
}

export async function pickLocalFolderPath(): Promise<string | null> {
  const resp = await fetch('/api/dialog/open-folder', {
    method: 'POST',
  });
  if (!resp.ok) {
    let message = 'Could not open folder picker';
    try {
      const body = await resp.json() as { error?: unknown };
      if (typeof body.error === 'string' && body.error.trim()) {
        message = body.error;
      } else if (
        body.error
        && typeof body.error === 'object'
        && 'message' in body.error
        && typeof body.error.message === 'string'
        && body.error.message.trim()
      ) {
        message = body.error.message;
      }
    } catch { /* use default message */ }
    throw new Error(message);
  }

  const body = await resp.json() as { path?: unknown };
  if (body.path == null) return null;
  if (typeof body.path !== 'string') {
    throw new Error('Could not open folder picker');
  }
  return body.path.length > 0 ? body.path : null;
}

export async function importFolderProject(
  input: ImportFolderRequest,
  workspaceContext?: WorkspaceCollabContext | null,
): Promise<ImportFolderResponse> {
  const resp = await fetch('/api/import/folder', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(workspaceContext ? workspaceProjectHeaders(workspaceContext) : {}),
    },
    body: JSON.stringify(input),
  });
  if (!resp.ok) {
    let message = 'Failed to import folder';
    try {
      const body = await resp.json();
      if (body?.error?.message) message = body.error.message;
    } catch { /* use default message */ }
    throw new Error(message);
  }
  return (await resp.json()) as ImportFolderResponse;
}

export async function importClaudeDesignZip(
  file: File,
  workspaceContext?: WorkspaceCollabContext | null,
): Promise<{ project: Project; conversationId: string; entryFile: string }> {
  const form = new FormData();
  form.append('file', file);
  const resp = await fetch('/api/import/claude-design', {
    method: 'POST',
    ...(workspaceContext ? { headers: workspaceProjectHeaders(workspaceContext) } : {}),
    body: form,
  });
  if (!resp.ok) {
    const payload = await resp.json().catch(() => null);
    const message =
      payload != null &&
      typeof payload === 'object' &&
      typeof (payload as { error?: unknown }).error === 'string'
        ? (payload as { error: string }).error
        : `Import failed (${resp.status})`;
    throw new Error(message);
  }
  return (await resp.json()) as {
    project: Project;
    conversationId: string;
    entryFile: string;
  };
}

// ---------- templates ----------

export async function listTemplates(): Promise<ProjectTemplate[]> {
  try {
    const resp = await fetch('/api/templates');
    if (!resp.ok) return [];
    const json = (await resp.json()) as { templates: ProjectTemplate[] };
    return json.templates ?? [];
  } catch {
    return [];
  }
}

export async function getTemplate(id: string): Promise<ProjectTemplate | null> {
  try {
    const resp = await fetch(`/api/templates/${encodeURIComponent(id)}`);
    if (!resp.ok) return null;
    const json = (await resp.json()) as { template: ProjectTemplate };
    return json.template;
  } catch {
    return null;
  }
}

export async function saveTemplate(input: {
  name: string;
  description?: string;
  sourceProjectId: string;
}): Promise<ProjectTemplate | null> {
  try {
    const resp = await fetch('/api/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!resp.ok) return null;
    const json = (await resp.json()) as { template: ProjectTemplate };
    return json.template;
  } catch {
    return null;
  }
}

export async function deleteTemplate(id: string): Promise<boolean> {
  try {
    const resp = await fetch(`/api/templates/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    return resp.ok;
  } catch {
    return false;
  }
}

type ProjectPatch = Omit<Partial<Project>, 'pendingPrompt' | 'customInstructions'> & {
  pendingPrompt?: Project['pendingPrompt'] | null;
  customInstructions?: string | null;
};

export async function patchProject(
  id: string,
  patch: ProjectPatch,
  workspaceContext?: WorkspaceCollabContext | null,
): Promise<Project | null> {
  try {
    const resp = await fetch(`/api/projects/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(workspaceContext ? workspaceProjectHeaders(workspaceContext) : {}),
      },
      body: JSON.stringify(patch),
    });
    if (!resp.ok) return null;
    const json = (await resp.json()) as { project: Project };
    // Any successful project patch can change fields rendered by the project
    // lists (name, metadata, updatedAt, bindings displayed on cards). A list
    // read started immediately after this write must not reuse the settled
    // pre-write value from coalescedGet's one-second burst window.
    if (workspaceContext) {
      invalidateWorkspaceProjectLists(
        workspaceContext,
        currentWorkspaceAccountGeneration(),
      );
    } else {
      evictCoalescedGet('local-projects');
    }
    return json.project;
  } catch {
    return null;
  }
}

/**
 * Delete a project.
 *
 * `workspaceContext`, when known, MUST be attached: `enforceWorkspaceProjectMutation`
 * (apps/daemon/src/routes/project/index.ts) treats a request carrying NEITHER
 * `x-od-workspace-id` NOR `x-od-workspace-member-id` as a legacy pre-workspace
 * caller and skips its ownership check entirely (`ctx === null` → allowed).
 * Omitting these headers — which this call used to do unconditionally — meant
 * every delete from a workspace-team build bypassed the daemon's own
 * cross-workspace permission check, so a project that leaked into the wrong
 * workspace's 草稿 grid (recvq5bz3HIDVt) was ALSO really deletable from there
 * (recvq5ecTkar91), not just visible. See {@link moveWorkspaceProject} for the
 * same headers on the sibling move endpoint.
 */
export async function deleteProject(
  id: string,
  workspaceContext?: WorkspaceCollabContext | null,
): Promise<boolean> {
  try {
    const resp = await fetch(`/api/projects/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      ...(workspaceContext ? { headers: workspaceProjectHeaders(workspaceContext) } : {}),
    });
    // Drop the project's local tab-state cache once it is gone server-side, so
    // the `open-design:project-tabs:*` keys don't accumulate in localStorage
    // for the lifetime of the browser profile as projects are deleted.
    if (resp.ok) removeCachedTabs(id, workspaceContext);
    return resp.ok;
  } catch {
    return false;
  }
}

// ---------- conversations ----------

export class ProjectConversationsHttpError extends Error {
  constructor(readonly status: number) {
    super(`conversations ${status}`);
    this.name = 'ProjectConversationsHttpError';
  }
}

export async function listConversations(
  projectId: string,
  options?: {
    throwOnError?: boolean;
    workspaceContext?: WorkspaceCollabContext | null;
  },
): Promise<Conversation[]> {
  const workspaceContext = options?.workspaceContext ?? null;
  const readKey = `project-conversations:${projectId}:${workspaceIdentityCacheKey(workspaceContext)}`;
  try {
    // Concurrent consumers of one project's conversation list share a single
    // request per burst (Batch A §4.3); conversation writes below evict.
    const json = await coalescedGet(
      readKey,
      async () => {
        const resp = await fetch(
          `/api/projects/${encodeURIComponent(projectId)}/conversations`,
          workspaceContext
            ? { headers: workspaceProjectHeaders(workspaceContext) }
            : undefined,
        );
        if (!resp.ok) throw new ProjectConversationsHttpError(resp.status);
        return (await resp.json()) as { conversations: Conversation[] };
      },
    );
    return json.conversations ?? [];
  } catch (err) {
    if (options?.throwOnError) throw err;
    return [];
  }
}

/** Thin invalidation for the shared conversations read after a write. */
function evictConversationsRead(
  projectId: string,
  workspaceContext?: WorkspaceCollabContext | null,
): void {
  evictCoalescedGet(
    `project-conversations:${projectId}:${workspaceIdentityCacheKey(workspaceContext)}`,
  );
}

export async function createConversation(
  projectId: string,
  title?: string,
  // Side Chat: seed the new conversation with another conversation's context
  // by copying its messages. `forkAfterMessageId` narrows that copy to a
  // specific point in the source history.
  opts?: {
    seedFromConversationId?: string | null;
    forkAfterMessageId?: string | null;
    sessionMode?: ChatSessionMode;
    // Fork snapshot: the exact in-memory messages to copy (up to the fork
    // point). Lets the daemon fork from what the user sees even when the fork
    // point was never persisted (e.g. a run that errored before its assistant
    // message reached the database).
    seedMessages?: ChatMessage[];
    workspaceContext?: WorkspaceCollabContext | null;
  },
): Promise<Conversation | null> {
  try {
    const body: CreateConversationRequest = { title };
    if (opts?.sessionMode) {
      body.sessionMode = opts.sessionMode;
    }
    if (opts?.seedFromConversationId) {
      body.seedFromConversationId = opts.seedFromConversationId;
    }
    if (opts?.forkAfterMessageId) {
      body.forkAfterMessageId = opts.forkAfterMessageId;
    }
    if (opts?.seedMessages && opts.seedMessages.length > 0) {
      body.seedMessages = opts.seedMessages;
    }
    const resp = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/conversations`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(opts?.workspaceContext
            ? workspaceProjectHeaders(opts.workspaceContext)
            : {}),
        },
        body: JSON.stringify(body),
      },
    );
    if (!resp.ok) return null;
    const json = (await resp.json()) as { conversation: Conversation };
    evictConversationsRead(projectId, opts?.workspaceContext);
    return json.conversation;
  } catch {
    return null;
  }
}

export async function patchConversation(
  projectId: string,
  conversationId: string,
  patch: Partial<Conversation>,
  workspaceContext?: WorkspaceCollabContext | null,
): Promise<Conversation | null> {
  try {
    const resp = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/conversations/${encodeURIComponent(conversationId)}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(workspaceContext ? workspaceProjectHeaders(workspaceContext) : {}),
        },
        body: JSON.stringify(patch),
      },
    );
    if (!resp.ok) return null;
    const json = (await resp.json()) as { conversation: Conversation };
    evictConversationsRead(projectId, workspaceContext);
    return json.conversation;
  } catch {
    return null;
  }
}

export async function deleteConversation(
  projectId: string,
  conversationId: string,
  workspaceContext?: WorkspaceCollabContext | null,
): Promise<boolean> {
  try {
    const resp = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/conversations/${encodeURIComponent(conversationId)}`,
      {
        method: 'DELETE',
        ...(workspaceContext
          ? { headers: workspaceProjectHeaders(workspaceContext) }
          : {}),
      },
    );
    if (resp.ok) evictConversationsRead(projectId, workspaceContext);
    return resp.ok;
  } catch {
    return false;
  }
}

// ---------- messages ----------

export async function listMessages(
  projectId: string,
  conversationId: string,
  workspaceContext?: WorkspaceCollabContext | null,
): Promise<ChatMessage[]> {
  try {
    const resp = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/conversations/${encodeURIComponent(conversationId)}/messages`,
      workspaceContext
        ? { headers: workspaceProjectHeaders(workspaceContext) }
        : undefined,
    );
    if (!resp.ok) return [];
    const json = (await resp.json()) as { messages: ChatMessage[] };
    return json.messages ?? [];
  } catch {
    return [];
  }
}

export interface SaveMessageOptions {
  telemetryFinalized?: boolean;
  workspaceContext?: WorkspaceCollabContext | null;
  // Set during page-unload paths (pagehide / visibilitychange→hidden) so
  // the in-flight PUT survives even if the document tears down before the
  // response arrives. Without keepalive the browser cancels the fetch
  // and the daemon never sees the final buffered text chunk.
  keepalive?: boolean;
}

export async function saveMessage(
  projectId: string,
  conversationId: string,
  message: ChatMessage,
  options: SaveMessageOptions = {},
): Promise<void> {
  try {
    const body = options.telemetryFinalized
      ? { ...message, telemetryFinalized: true }
      : message;
    await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(message.id)}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(options.workspaceContext
            ? workspaceProjectHeaders(options.workspaceContext)
            : {}),
        },
        body: JSON.stringify(body),
        ...(options.keepalive ? { keepalive: true } : {}),
      },
    );
  } catch {
    // best-effort persistence — UI keeps the message in-memory either way
  }
}

// ---------- terminals ----------
//
// Interactive PTY sessions rooted at the project working directory. The daemon
// streams output down over SSE (`GET .../stream`) and accepts keystrokes /
// resizes back up over plain POST — see `packages/contracts/src/api/terminals.ts`.
// `<TerminalViewer>` drives `terminalStreamUrl` directly via EventSource; these
// helpers cover the request/response endpoints.

export async function createTerminal(
  projectId: string,
  init?: CreateTerminalRequest,
  workspaceContext?: WorkspaceCollabContext | null,
): Promise<TerminalSession | null> {
  try {
    const resp = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/terminals`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(workspaceContext ? workspaceProjectHeaders(workspaceContext) : {}),
        },
        body: JSON.stringify(init ?? {}),
      },
    );
    if (!resp.ok) return null;
    const json = (await resp.json()) as { terminal: TerminalSession };
    return json.terminal ?? null;
  } catch {
    return null;
  }
}

/** SSE endpoint a `<TerminalViewer>` subscribes to for raw PTY output. */
export function terminalStreamUrl(
  projectId: string,
  terminalId: string,
  workspaceContext?: WorkspaceCollabContext | null,
): string {
  return workspaceResourceUrl(
    `/api/projects/${encodeURIComponent(projectId)}/terminals/${encodeURIComponent(terminalId)}/stream`,
    workspaceContext,
  );
}

export async function sendTerminalStdin(
  projectId: string,
  terminalId: string,
  data: string,
  workspaceContext?: WorkspaceCollabContext | null,
): Promise<boolean> {
  try {
    const resp = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/terminals/${encodeURIComponent(terminalId)}/stdin`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(workspaceContext ? workspaceProjectHeaders(workspaceContext) : {}),
        },
        body: JSON.stringify({ data }),
      },
    );
    return resp.ok;
  } catch {
    return false;
  }
}

export async function resizeTerminal(
  projectId: string,
  terminalId: string,
  cols: number,
  rows: number,
  workspaceContext?: WorkspaceCollabContext | null,
): Promise<boolean> {
  try {
    const resp = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/terminals/${encodeURIComponent(terminalId)}/resize`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(workspaceContext ? workspaceProjectHeaders(workspaceContext) : {}),
        },
        body: JSON.stringify({ cols, rows }),
      },
    );
    return resp.ok;
  } catch {
    return false;
  }
}

export async function killTerminal(
  projectId: string,
  terminalId: string,
  // Page-unload paths set keepalive so the kill survives document teardown,
  // mirroring `saveMessage`. Without it the browser cancels the fetch and the
  // PTY leaks until the daemon GCs it.
  options: {
    keepalive?: boolean;
    workspaceContext?: WorkspaceCollabContext | null;
  } = {},
): Promise<boolean> {
  try {
    const resp = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/terminals/${encodeURIComponent(terminalId)}/kill`,
      {
        method: 'POST',
        ...(options.workspaceContext
          ? { headers: workspaceProjectHeaders(options.workspaceContext) }
          : {}),
        ...(options.keepalive ? { keepalive: true } : {}),
      },
    );
    return resp.ok;
  } catch {
    return false;
  }
}

// ---------- tabs ----------

const PROJECT_TABS_CACHE_PREFIX = 'open-design:project-tabs:v1:';

function tabsCacheKey(
  projectId: string,
  workspaceContext?: WorkspaceCollabContext | null,
): string {
  if (!workspaceContext) return `${PROJECT_TABS_CACHE_PREFIX}${projectId}`;
  return `${PROJECT_TABS_CACHE_PREFIX}${projectId}:${workspaceIdentityCacheKey(workspaceContext)}`;
}

function normalizeTabsState(value: unknown): OpenTabsState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.tabs) || !record.tabs.every((tab) => typeof tab === 'string')) {
    return null;
  }
  const browserTabs = Array.isArray(record.browserTabs)
    ? record.browserTabs.filter(
        (tab) =>
          Boolean(tab) &&
          typeof tab === 'object' &&
          !Array.isArray(tab) &&
          typeof (tab as Record<string, unknown>).id === 'string' &&
          typeof (tab as Record<string, unknown>).label === 'string',
      ) as OpenTabsState['browserTabs']
    : undefined;
  const state: OpenTabsState = {
    tabs: record.tabs.slice() as string[],
    active: typeof record.active === 'string' ? record.active : null,
  };
  if (browserTabs && browserTabs.length > 0) state.browserTabs = browserTabs;
  if (record.hasSavedState === true) state.hasSavedState = true;
  if (typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt)) {
    state.updatedAt = record.updatedAt;
  }
  return state;
}

function readCachedTabs(
  projectId: string,
  workspaceContext?: WorkspaceCollabContext | null,
): OpenTabsState | null {
  if (typeof window === 'undefined') return null;
  try {
    return normalizeTabsState(JSON.parse(
      window.localStorage.getItem(tabsCacheKey(projectId, workspaceContext)) ?? 'null',
    ));
  } catch {
    return null;
  }
}

function removeCachedTabs(
  projectId: string,
  workspaceContext?: WorkspaceCollabContext | null,
): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(tabsCacheKey(projectId, workspaceContext));
  } catch {
    // Ignore private-mode/quota errors; the cache entry is best-effort.
  }
}

function writeCachedTabs(
  projectId: string,
  state: OpenTabsState,
  workspaceContext?: WorkspaceCollabContext | null,
): OpenTabsState {
  const next: OpenTabsState = {
    ...state,
    updatedAt: Date.now(),
  };
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(
        tabsCacheKey(projectId, workspaceContext),
        JSON.stringify(next),
      );
    } catch {
      // Ignore quota/private-mode failures. The daemon save below is canonical.
    }
  }
  return next;
}

function newestTabsState(
  first: OpenTabsState | null,
  second: OpenTabsState | null,
): OpenTabsState {
  if (!first && !second) return { tabs: [], active: null };
  if (!first) return second!;
  if (!second) return first;
  return (second.updatedAt ?? 0) > (first.updatedAt ?? 0) ? second : first;
}

async function persistTabsToDaemon(
  projectId: string,
  state: OpenTabsState,
  workspaceContext?: WorkspaceCollabContext | null,
): Promise<void> {
  const requestKey =
    `project-tabs:${projectId}:${workspaceIdentityCacheKey(workspaceContext)}`;
  // Thin invalidation: a write makes any burst-shared read stale.
  evictCoalescedGet(requestKey);
  await fetch(`/api/projects/${encodeURIComponent(projectId)}/tabs`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(workspaceContext ? workspaceProjectHeaders(workspaceContext) : {}),
    },
    body: JSON.stringify(state),
    keepalive: true,
  });
}

export async function loadTabs(
  projectId: string,
  workspaceContext?: WorkspaceCollabContext | null,
  options: {
    reconcileNewerCacheToDaemon?: boolean;
  } = {},
): Promise<OpenTabsState> {
  const cached = readCachedTabs(projectId, workspaceContext);
  const requestKey =
    `project-tabs:${projectId}:${workspaceIdentityCacheKey(workspaceContext)}`;
  try {
    // Concurrent mounts share one daemon read per burst (Batch A §4.3); the
    // per-caller cache reconciliation below still runs for every caller.
    const saved = await coalescedGet(requestKey, async () => {
      const resp = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/tabs`,
        workspaceContext
          ? { headers: workspaceProjectHeaders(workspaceContext) }
          : undefined,
      );
      if (!resp.ok) throw new Error(`tabs ${resp.status}`);
      return normalizeTabsState(await resp.json());
    });
    const latest = newestTabsState(cached, saved);
    if (
      options.reconcileNewerCacheToDaemon !== false
      && cached
      && latest === cached
      && (cached.updatedAt ?? 0) > (saved?.updatedAt ?? 0)
    ) {
      void persistTabsToDaemon(projectId, cached, workspaceContext).catch(() => {});
    }
    return latest;
  } catch {
    return cached ?? { tabs: [], active: null };
  }
}

export async function saveTabs(
  projectId: string,
  state: OpenTabsState,
  workspaceContext?: WorkspaceCollabContext | null,
): Promise<void> {
  const next = writeCachedTabs(projectId, state, workspaceContext);
  try {
    await persistTabsToDaemon(projectId, next, workspaceContext);
  } catch {
    // best-effort
  }
}

/**
 * Write tab state to the local cache ONLY (synchronous localStorage), returning
 * the `updatedAt`-stamped state. Callers that debounce the canonical daemon
 * write use this so the cache is always current — `loadTabs` reconciles cache
 * vs daemon by `updatedAt`, so a debounced (or dropped) daemon PUT never loses
 * data: a newer cache is re-pushed on next load.
 */
export function cacheTabsLocally(
  projectId: string,
  state: OpenTabsState,
  workspaceContext?: WorkspaceCollabContext | null,
): OpenTabsState {
  return writeCachedTabs(projectId, state, workspaceContext);
}

/** Persist already-stamped tab state to the daemon (the debounced write). */
export async function persistTabsToDaemonNow(
  projectId: string,
  state: OpenTabsState,
  workspaceContext?: WorkspaceCollabContext | null,
): Promise<void> {
  try {
    await persistTabsToDaemon(projectId, state, workspaceContext);
  } catch {
    // best-effort; the local cache (written via cacheTabsLocally) is canonical
    // and will re-push on the next loadTabs reconciliation.
  }
}

// ---------- plugins ----------
// Plan §3.C1 — plugin discovery + apply.
//
// applyPlugin() is the canonical entry point for both the inline rail
// (NewProjectPanel + ChatComposer) and the marketplace detail page. It
// hits POST /api/plugins/:id/apply, which is the same pure resolver
// the daemon uses; the response carries everything the composer needs:
//   - query (pre-filled brief)
//   - contextItems (chip strip)
//   - inputs (form fields)
//   - appliedPlugin (snapshot id; sent back on POST /api/runs to pin
//     the prompt block to the frozen view)

export interface ListPluginsOptions {
  includeHidden?: boolean;
  /**
   * When present, attaches the same workspace identity headers project reads
   * already carry (`workspaceProjectHeaders`) so the daemon's `GET /api/plugins`
   * can apply its workspace-scoped filter (routes/plugins/index.ts +
   * `listInstalledPlugins`'s one-way "unclaimed visible everywhere, claimed
   * elsewhere hidden" rule). Omit for callers that genuinely need the
   * headerless compatibility catalogue. The complete Workspace/member
   * identity is part of the cache key below, so a scoped read can never leak
   * into that headerless partition or a differently scoped caller.
   */
  workspaceContext?: WorkspaceCollabContext | null;
  /**
   * Account boundary paired with the complete Workspace identity below. Tests
   * and callers holding a captured generation may pass it explicitly; normal
   * UI callers use the current generation.
   */
  accountGeneration?: number;
}

interface CachedVisiblePlugins {
  plugins: InstalledPluginRecord[];
  cachedAt: number;
}

// The plugin catalogue is filtered by the request's Workspace headers. Keep
// the warm snapshot that avoids Home's 1-2s remount stall, but partition it by
// BOTH the signed-in account generation and every identity field carried on
// the wire. A display cache is never an authorization witness: callers still
// pass the verified context to mutations independently.
const cachedVisiblePlugins = new Map<string, CachedVisiblePlugins>();
// Every request start and explicit invalidation advances the exact partition's
// generation. Deleting the settled value alone is insufficient: an older
// `listPlugins()` can resolve after a replacement read and otherwise put its
// stale snapshot back into this cache. Latest-started-wins also covers ordinary
// same-key request races that do not pass through invalidation. Generations use
// the same account + Workspace key as the values, so activity in A cannot
// suppress a concurrent B (or next-account) response.
const pluginCatalogCacheGenerations = new Map<string, number>();
const PLUGINS_CACHE_TTL_MS = 10_000;
const MAX_PLUGIN_CATALOG_CACHE_ENTRIES = 24;

export function pluginCatalogCacheKey(
  options: Pick<ListPluginsOptions, 'workspaceContext' | 'accountGeneration'> = {},
): string {
  return JSON.stringify([
    options.accountGeneration ?? currentWorkspaceAccountGeneration(),
    workspaceIdentityCacheKey(options.workspaceContext ?? null),
  ]);
}

function cacheVisiblePlugins(
  key: string,
  plugins: InstalledPluginRecord[],
): void {
  cachedVisiblePlugins.delete(key);
  cachedVisiblePlugins.set(key, { plugins, cachedAt: Date.now() });
  while (cachedVisiblePlugins.size > MAX_PLUGIN_CATALOG_CACHE_ENTRIES) {
    const oldest = cachedVisiblePlugins.keys().next().value as string | undefined;
    if (!oldest) break;
    cachedVisiblePlugins.delete(oldest);
  }
}

export async function listPlugins(
  options: ListPluginsOptions = {},
): Promise<InstalledPluginRecord[]> {
  const cacheKey = pluginCatalogCacheKey(options);
  const requestGeneration = (pluginCatalogCacheGenerations.get(cacheKey) ?? 0) + 1;
  pluginCatalogCacheGenerations.set(cacheKey, requestGeneration);
  try {
    const resp = await fetch(
      '/api/plugins',
      options.workspaceContext ? { headers: workspaceProjectHeaders(options.workspaceContext) } : undefined,
    );
    if (!resp.ok) return [];
    const json = (await resp.json()) as { plugins?: InstalledPluginRecord[] };
    const plugins = json.plugins ?? [];
    const visible = plugins.filter(isVisiblePlugin);
    if (pluginCatalogCacheGenerations.get(cacheKey) === requestGeneration) {
      cacheVisiblePlugins(cacheKey, visible);
    }
    return options.includeHidden ? plugins : visible;
  } catch {
    return [];
  }
}

// Return the cached visible plugins without hitting the network when the cache
// is still within its TTL; otherwise fetch (which refreshes the cache). Used by
// surfaces that mount often (Home) where a slightly stale list is fine and the
// heavy `/api/plugins` round trip per mount is not.
export async function listPluginsFresh(
  options: Pick<ListPluginsOptions, 'workspaceContext' | 'accountGeneration'> = {},
): Promise<InstalledPluginRecord[]> {
  const cached = cachedVisiblePlugins.get(pluginCatalogCacheKey(options));
  if (cached && Date.now() - cached.cachedAt < PLUGINS_CACHE_TTL_MS) {
    return cached.plugins;
  }
  return listPlugins(options);
}

/**
 * Return the last successful unscoped plugin catalog regardless of its refresh
 * age. Frequently remounted surfaces use this snapshot for their first render
 * while `listPluginsFresh()` revalidates an expired catalog in the background.
 * A null result is the only state that still requires the cold-start loading
 * guard: once a catalog has loaded, network latency must not make known plugin
 * actions temporarily unactionable again.
 */
export function readCachedVisiblePlugins(
  options: Pick<ListPluginsOptions, 'workspaceContext' | 'accountGeneration'> = {},
): InstalledPluginRecord[] | null {
  return cachedVisiblePlugins.get(pluginCatalogCacheKey(options))?.plugins ?? null;
}

/**
 * Evict one authenticated plugin-catalog partition after a thin Workspace
 * invalidation. Both account generation and the complete Workspace/member
 * identity are required so an event for A cannot discard B's warm catalog.
 */
export function invalidatePluginCatalogCache(options: {
  workspaceContext: WorkspaceCollabContext | null;
  accountGeneration: number;
}): void {
  const cacheKey = pluginCatalogCacheKey(options);
  cachedVisiblePlugins.delete(cacheKey);
  pluginCatalogCacheGenerations.set(
    cacheKey,
    (pluginCatalogCacheGenerations.get(cacheKey) ?? 0) + 1,
  );
}

// Test-only: drop the warm visible-plugins cache so each case starts cold. The
// module-level cache intentionally survives Home remounts in the app, but that
// same persistence leaks across test cases in a worker (a case's mocked
// `/api/plugins` payload would satisfy the next case via `listPluginsFresh`).
// The web vitest setup calls this in a global `afterEach`.
export function resetPluginsCache(): void {
  cachedVisiblePlugins.clear();
  pluginCatalogCacheGenerations.clear();
}

export function isVisiblePlugin(plugin: InstalledPluginRecord): boolean {
  const od = (plugin.manifest?.od ?? {}) as Record<string, unknown>;
  return od.hidden !== true;
}

export async function duplicatePluginAsProject(
  pluginId: string,
  input: { name?: string } = {},
  workspaceContext?: WorkspaceCollabContext | null,
): Promise<PluginDuplicateProjectResponse> {
  const resp = await fetch(
    `/api/plugins/${encodeURIComponent(pluginId)}/duplicate-project`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(workspaceContext ? workspaceProjectHeaders(workspaceContext) : {}),
      },
      body: JSON.stringify(input),
    },
  );
  if (!resp.ok) {
    throw new Error(await readErrorMessage(resp));
  }
  const json = (await resp.json()) as PluginDuplicateProjectResponse;
  if (!json?.ok || !json.projectId) {
    throw new Error('Could not duplicate this template.');
  }
  markProjectCreatedByViewer(json.projectId, workspaceContext ?? null);
  return json;
}

interface PluginInstallEvent {
  kind?: 'progress' | 'success' | 'error';
  phase?: string;
  message?: string;
  plugin?: InstalledPluginRecord;
  warnings?: string[];
}

export async function installPluginSource(
  source: string,
  workspaceContext?: WorkspaceCollabContext | null,
): Promise<PluginInstallOutcome> {
  const log: string[] = [];
  try {
    const resp = await fetch('/api/plugins/install', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(workspaceContext ? workspaceProjectHeaders(workspaceContext) : {}),
      },
      body: JSON.stringify({ source }),
    });
    if (!resp.ok) {
      const message = await readErrorMessage(resp);
      return { ok: false, warnings: [], message, log };
    }
    if (!resp.body) {
      return {
        ok: false,
        warnings: [],
        message: 'Install stream did not start.',
        log,
      };
    }

    let success: InstalledPluginRecord | undefined;
    let warnings: string[] = [];
    let errorMessage: string | undefined;
    for await (const ev of readServerSentEvents(resp.body)) {
      if (ev.message) log.push(ev.message);
      if (ev.warnings) warnings = ev.warnings;
      if (ev.kind === 'success') success = ev.plugin;
      if (ev.kind === 'error') errorMessage = ev.message ?? 'Install failed.';
    }
    return {
      ok: Boolean(success) && !errorMessage,
      plugin: success,
      warnings,
      message: errorMessage ?? (success ? `Installed ${success.title}.` : 'Install finished.'),
      log,
    };
  } catch (err) {
    return {
      ok: false,
      warnings: [],
      message: (err as Error).message,
      log,
    };
  }
}

export async function uploadPluginZip(file: File): Promise<PluginInstallOutcome> {
  const form = new FormData();
  form.append('file', file);
  return postPluginUpload('/api/plugins/upload-zip', form);
}

export async function uploadPluginFolder(files: File[]): Promise<PluginInstallOutcome> {
  const form = new FormData();
  for (const file of files) {
    const relativePath = getUploadRelativePath(file);
    form.append('files', file, file.name);
    form.append('paths', relativePath);
  }
  return postPluginUpload('/api/plugins/upload-folder', form);
}

export async function installGeneratedPluginFolder(
  projectId: string,
  relativePath: string,
  workspaceContext?: WorkspaceCollabContext | null,
): Promise<PluginInstallOutcome> {
  // Capture the account boundary before the request starts. If sign-in changes
  // while the install is in flight, the successful response must evict the
  // catalog that authorized this mutation, never the next account's cache.
  const accountGeneration = currentWorkspaceAccountGeneration();
  try {
    const request: ProjectPluginFolderInstallRequest = { path: relativePath };
    const resp = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/plugins/install-folder`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(workspaceContext ? workspaceProjectHeaders(workspaceContext) : {}),
        },
        body: JSON.stringify(request),
      },
    );
    const outcome = await readPluginInstallOutcome(resp);
    if (outcome.ok) {
      // The event refreshes mounted consumers, but it is not durable: Home may
      // be unmounted or identity-masked while a project installs its generated
      // plugin. Evict the exact warm partition first so a later mount cannot
      // reuse the pre-install catalog for the full TTL. Other Workspaces stay
      // warm and avoid an unrelated refresh/performance regression.
      invalidatePluginCatalogCache({
        workspaceContext: workspaceContext ?? null,
        accountGeneration,
      });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('open-design:plugins-changed'));
      }
    }
    return outcome;
  } catch (err) {
    return {
      ok: false,
      warnings: [],
      message: (err as Error).message,
      log: [],
    };
  }
}

export interface PluginShareOutcome {
  ok: boolean;
  message: string;
  url?: string;
  log?: string[];
  code?: string;
}

export interface PluginShareTaskStart {
  taskId: string;
  action: 'publish-github' | 'contribute-open-design';
  path: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  startedAt: number;
}

export interface PluginShareTaskResult {
  message: string;
  url?: string;
  log?: string[];
}

export interface PluginShareTaskError {
  message: string;
  code?: string;
  log?: string[];
}

export interface PluginShareTaskSnapshot {
  taskId: string;
  action: 'publish-github' | 'contribute-open-design';
  path: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  startedAt: number;
  endedAt?: number | null;
  progress: string[];
  nextSince: number;
  result?: PluginShareTaskResult;
  error?: PluginShareTaskError;
}

export async function publishGeneratedPluginToGitHub(
  projectId: string,
  relativePath: string,
  workspaceContext?: WorkspaceCollabContext | null,
): Promise<PluginShareOutcome> {
  return postGeneratedPluginShareAction(
    projectId,
    relativePath,
    'publish-github',
    workspaceContext,
  );
}

export async function contributeGeneratedPluginToOpenDesign(
  projectId: string,
  relativePath: string,
  workspaceContext?: WorkspaceCollabContext | null,
): Promise<PluginShareOutcome> {
  return postGeneratedPluginShareAction(
    projectId,
    relativePath,
    'contribute-open-design',
    workspaceContext,
  );
}

export async function startGeneratedPluginShareTask(
  projectId: string,
  relativePath: string,
  action: 'publish-github' | 'contribute-open-design',
  workspaceContext?: WorkspaceCollabContext | null,
): Promise<PluginShareTaskStart> {
  const resp = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/plugins/share-tasks`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(workspaceContext ? workspaceProjectHeaders(workspaceContext) : {}),
      },
      body: JSON.stringify({ path: relativePath, action }),
    },
  );
  const body = await resp.json().catch(() => null) as Partial<PluginShareTaskStart> & {
    error?: string | { message?: string };
    message?: string;
  } | null;
  if (!resp.ok || !body?.taskId || !body?.action || !body?.path || !body?.status || !body?.startedAt) {
    const errorMessage =
      body?.message
      ?? (typeof body?.error === 'string' ? body.error : body?.error?.message)
      ?? 'Could not start plugin share task.';
    throw new Error(errorMessage);
  }
  return {
    taskId: body.taskId,
    action: body.action,
    path: body.path,
    status: body.status,
    startedAt: body.startedAt,
  };
}

export async function waitGeneratedPluginShareTask(
  taskId: string,
  since: number,
  timeoutMs = 25_000,
  workspaceContext?: WorkspaceCollabContext | null,
): Promise<PluginShareTaskSnapshot> {
  const resp = await fetch(`/api/plugins/share-tasks/${encodeURIComponent(taskId)}/wait`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(workspaceContext ? workspaceProjectHeaders(workspaceContext) : {}),
    },
    body: JSON.stringify({ since, timeoutMs }),
  });
  const body = await resp.json().catch(() => null) as PluginShareTaskSnapshot & {
    error?: string | { message?: string };
    message?: string;
  } | null;
  if (!resp.ok || !body?.taskId) {
    const errorMessage =
      body?.message
      ?? (typeof body?.error === 'string' ? body.error : body?.error?.message)
      ?? 'Could not fetch plugin share task.';
    throw new Error(errorMessage);
  }
  return body;
}

export type PluginShareProjectOutcome =
  | (CreatePluginShareProjectResponse & { ok: true })
  | {
      ok: false;
      message: string;
      code?: string;
    };

/**
 * Start a plugin share task, which stands up a real chat project server-side.
 *
 * `workspaceContext` MUST be attached, for the same reason every sibling create
 * in this file attaches it: the project this endpoint creates gets a
 * `workspace_projects` binding from the request's own identity, and a headerless
 * create leaves it unbound — denied its first run by the daemon's workspace gate
 * and carrying no workspace to bill on any run that does get through. This call
 * was the one create in this file with no `workspaceContext` parameter at all,
 * so it was permanently unbound rather than merely racy.
 */
export async function createPluginShareProject(
  pluginId: string,
  action: PluginShareAction,
  locale?: string,
  workspaceContext?: WorkspaceCollabContext | null,
): Promise<PluginShareProjectOutcome> {
  try {
    const resp = await fetch(
      `/api/plugins/${encodeURIComponent(pluginId)}/share-project`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(workspaceContext ? workspaceProjectHeaders(workspaceContext) : {}),
        },
        body: JSON.stringify({
          action,
          ...(locale ? { locale } : {}),
        }),
      },
    );
    const body = (await resp.json().catch(() => null)) as
      | (Partial<CreatePluginShareProjectResponse> & {
          error?: string | { code?: string; message?: string };
          code?: string;
        })
      | null;
    if (resp.ok && body?.ok && body.project && body.conversationId) {
      return body as CreatePluginShareProjectResponse & { ok: true };
    }
    const errorMessage =
      typeof body?.error === 'string' ? body.error : body?.error?.message;
    const fallbackMessage = resp.statusText || 'Could not create plugin share project.';
    const message = body?.message ?? errorMessage ?? fallbackMessage;
    const code =
      body?.code ?? (typeof body?.error === 'object' ? body.error.code : undefined);
    return {
      ok: false,
      message,
      ...(code ? { code } : {}),
    };
  } catch (err) {
    return {
      ok: false,
      message: (err as Error).message,
    };
  }
}

async function postGeneratedPluginShareAction(
  projectId: string,
  relativePath: string,
  action: 'publish-github' | 'contribute-open-design',
  workspaceContext?: WorkspaceCollabContext | null,
): Promise<PluginShareOutcome> {
  try {
    const resp = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/plugins/${action}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(workspaceContext ? workspaceProjectHeaders(workspaceContext) : {}),
        },
        body: JSON.stringify({ path: relativePath }),
      },
    );
    const body = (await resp.json().catch(() => null)) as Partial<PluginShareOutcome> | null;
    return {
      ok: Boolean(resp.ok && body?.ok),
      message: body?.message ?? (resp.ok ? 'Action finished.' : 'Plugin share action failed.'),
      ...(body?.url ? { url: body.url } : {}),
      ...(body?.log ? { log: body.log } : {}),
      ...(body?.code ? { code: body.code } : {}),
    };
  } catch (err) {
    return {
      ok: false,
      message: (err as Error).message,
      log: [],
    };
  }
}

export async function upgradePlugin(id: string): Promise<PluginInstallOutcome> {
  const log: string[] = [];
  try {
    const resp = await fetch(`/api/plugins/${encodeURIComponent(id)}/upgrade`, {
      method: 'POST',
    });
    if (!resp.ok) {
      const message = await readErrorMessage(resp);
      return { ok: false, warnings: [], message, log };
    }
    if (!resp.body) {
      return {
        ok: false,
        warnings: [],
        message: 'Upgrade stream did not start.',
        log,
      };
    }
    let success: InstalledPluginRecord | undefined;
    let warnings: string[] = [];
    let errorMessage: string | undefined;
    for await (const ev of readServerSentEvents(resp.body)) {
      if (ev.message) log.push(ev.message);
      if (ev.warnings) warnings = ev.warnings;
      if (ev.kind === 'success') success = ev.plugin;
      if (ev.kind === 'error') errorMessage = ev.message ?? 'Upgrade failed.';
    }
    return {
      ok: Boolean(success) && !errorMessage,
      plugin: success,
      warnings,
      message: errorMessage ?? (success ? `Upgraded ${success.title}.` : 'Upgrade finished.'),
      log,
    };
  } catch (err) {
    return {
      ok: false,
      warnings: [],
      message: (err as Error).message,
      log,
    };
  }
}

async function postPluginUpload(url: string, form: FormData): Promise<PluginInstallOutcome> {
  try {
    const resp = await fetch(url, {
      method: 'POST',
      body: form,
    });
    const json = (await resp.json()) as Partial<PluginInstallOutcome> & {
      error?: string | { message?: string };
    };
    if (resp.ok && json.ok) {
      return {
        ok: true,
        plugin: json.plugin,
        warnings: json.warnings ?? [],
        message: json.message ?? 'Plugin installed.',
        log: json.log ?? [],
      };
    }
    const message =
      json.message ??
      (typeof json.error === 'string' ? json.error : json.error?.message) ??
      resp.statusText;
    return {
      ok: false,
      warnings: json.warnings ?? [],
      message,
      log: json.log ?? [],
    };
  } catch (err) {
    return {
      ok: false,
      warnings: [],
      message: (err as Error).message,
      log: [],
    };
  }
}

async function readPluginInstallOutcome(resp: Response): Promise<PluginInstallOutcome> {
  const json = (await resp.json()) as Partial<PluginInstallOutcome> & {
    error?: string | { message?: string };
  };
  if (resp.ok && json.ok) {
    return {
      ok: true,
      ...(json.plugin ? { plugin: json.plugin } : {}),
      warnings: json.warnings ?? [],
      message: json.message ?? 'Plugin installed.',
      log: json.log ?? [],
    };
  }
  const message =
    json.message ??
    (typeof json.error === 'string' ? json.error : json.error?.message) ??
    resp.statusText;
  return {
    ok: false,
    ...(json.plugin ? { plugin: json.plugin } : {}),
    warnings: json.warnings ?? [],
    message,
    log: json.log ?? [],
  };
}

function getUploadRelativePath(file: File): string {
  const withRelativePath = file as File & { webkitRelativePath?: string };
  return withRelativePath.webkitRelativePath || file.name;
}

export async function uninstallPlugin(
  id: string,
  workspaceContext?: WorkspaceCollabContext | null,
): Promise<boolean> {
  try {
    const resp = await fetch(`/api/plugins/${encodeURIComponent(id)}/uninstall`, {
      method: 'POST',
      ...(workspaceContext
        ? { headers: workspaceProjectHeaders(workspaceContext) }
        : {}),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

export interface PluginMarketplace {
  id: string;
  url: string;
  trust: PluginMarketplaceTrust;
  specVersion?: string;
  version?: string;
  addedAt?: number;
  refreshedAt?: number;
  manifest: {
    name?: string;
    version?: string;
    plugins?: PluginMarketplaceEntry[];
  };
}

export type PluginMarketplaceTrust = 'official' | 'trusted' | 'restricted';

export interface PluginMarketplaceEntry {
  name: string;
  source: string;
  version?: string;
  ref?: string;
  dist?: {
    type?: string;
    archive?: string;
    integrity?: string;
    manifestDigest?: string;
  };
  versions?: Array<{
    version: string;
    source?: string;
    ref?: string;
    dist?: {
      type?: string;
      archive?: string;
      integrity?: string;
      manifestDigest?: string;
    };
    integrity?: string;
    manifestDigest?: string;
    deprecated?: boolean | string;
    yanked?: boolean;
    yankedAt?: string;
    yankReason?: string;
  }>;
  distTags?: Record<string, string>;
  integrity?: string;
  manifestDigest?: string;
  publisher?: {
    id?: string;
    github?: string;
    url?: string;
  };
  homepage?: string;
  license?: string;
  permissions?: string[];
  capabilitiesSummary?: string[];
  deprecated?: boolean | string;
  yanked?: boolean;
  yankedAt?: string;
  yankReason?: string;
  tags?: string[];
  title?: string;
  title_i18n?: Record<string, string>;
  description?: string;
  description_i18n?: Record<string, string>;
  icon?: string;
}

export interface PluginMarketplaceMutationOutcome {
  ok: boolean;
  marketplace?: PluginMarketplace;
  message: string;
}

export async function listPluginMarketplaces(): Promise<PluginMarketplace[]> {
  try {
    const resp = await fetch('/api/marketplaces');
    if (!resp.ok) return [];
    const json = (await resp.json()) as { marketplaces?: PluginMarketplace[] };
    return json.marketplaces ?? [];
  } catch {
    return [];
  }
}

export async function addPluginMarketplace(input: {
  url: string;
  trust: PluginMarketplaceTrust;
}): Promise<PluginMarketplaceMutationOutcome> {
  try {
    const resp = await fetch('/api/marketplaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return readPluginMarketplaceOutcome(resp, 'Marketplace source added.');
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

export async function refreshPluginMarketplace(
  id: string,
): Promise<PluginMarketplaceMutationOutcome> {
  try {
    const resp = await fetch(`/api/marketplaces/${encodeURIComponent(id)}/refresh`, {
      method: 'POST',
    });
    return readPluginMarketplaceOutcome(resp, 'Marketplace source refreshed.');
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

export async function removePluginMarketplace(
  id: string,
): Promise<PluginMarketplaceMutationOutcome> {
  try {
    const resp = await fetch(`/api/marketplaces/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (!resp.ok) {
      return { ok: false, message: await readErrorMessage(resp) };
    }
    return { ok: true, message: 'Marketplace source removed.' };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

export async function setPluginMarketplaceTrust(
  id: string,
  trust: PluginMarketplaceTrust,
): Promise<PluginMarketplaceMutationOutcome> {
  try {
    const resp = await fetch(`/api/marketplaces/${encodeURIComponent(id)}/trust`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trust }),
    });
    return readPluginMarketplaceOutcome(resp, 'Marketplace trust updated.');
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

async function readPluginMarketplaceOutcome(
  resp: Response,
  successMessage: string,
): Promise<PluginMarketplaceMutationOutcome> {
  if (!resp.ok) {
    return { ok: false, message: await readErrorMessage(resp) };
  }
  const marketplace = (await resp.json().catch(() => null)) as PluginMarketplace | null;
  return {
    ok: true,
    ...(marketplace ? { marketplace } : {}),
    message: successMessage,
  };
}

export async function applyPlugin(
  pluginId: string,
  options: {
    inputs?: Record<string, unknown>;
    projectId?: string;
    grantCaps?: string[];
    locale?: string;
    workspaceContext?: WorkspaceCollabContext | null;
  } = {},
): Promise<ApplyResult | null> {
  try {
    const resp = await fetch(
      `/api/plugins/${encodeURIComponent(pluginId)}/apply`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(options.workspaceContext
            ? workspaceProjectHeaders(options.workspaceContext)
            : {}),
        },
        body: JSON.stringify({
          inputs: options.inputs ?? {},
          projectId: options.projectId,
          grantCaps: options.grantCaps ?? [],
          locale: options.locale,
        }),
      },
    );
    if (!resp.ok) return null;
    const json = (await resp.json()) as ApplyResult & { ok?: boolean };
    return json;
  } catch {
    return null;
  }
}

async function readErrorMessage(resp: Response): Promise<string> {
  try {
    const json = (await resp.json()) as {
      error?: string | { message?: string; data?: { errors?: unknown } };
      errors?: unknown;
      message?: string;
    };
    const message =
      json.message ??
      (typeof json.error === 'string' ? json.error : json.error?.message);
    const details = extractErrorDetails(
      typeof json.error === 'object' ? json.error.data?.errors : undefined,
      json.errors,
    );
    if (message && details.length > 0) return `${message}: ${details.join('; ')}`;
    if (message) return message;
  } catch {
    // Fall through to the status text below.
  }
  return resp.statusText || `HTTP ${resp.status}`;
}

function extractErrorDetails(...values: unknown[]): string[] {
  return values.flatMap((value) => {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item) => {
      if (typeof item === 'string' && item.trim()) return [item.trim()];
      if (item && typeof item === 'object' && 'message' in item) {
        const message = (item as { message?: unknown }).message;
        if (typeof message === 'string' && message.trim()) return [message.trim()];
      }
      return [];
    });
  });
}

async function* readServerSentEvents(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<PluginInstallEvent, void, void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split(/\n\n/);
      buffer = parts.pop() ?? '';
      for (const part of parts) {
        const event = parseServerSentEvent(part);
        if (event) yield event;
      }
    }
    buffer += decoder.decode();
    const event = parseServerSentEvent(buffer);
    if (event) yield event;
  } finally {
    reader.releaseLock();
  }
}

function parseServerSentEvent(raw: string): PluginInstallEvent | null {
  const data = raw
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n');
  if (!data) return null;
  try {
    return JSON.parse(data) as PluginInstallEvent;
  } catch {
    return null;
  }
}

// Fetch the immutable snapshot pinned to a project / conversation.
// Used by ProjectView to surface the active plugin as a context chip
// on user messages instead of re-rendering the inline plugin rail
// (the user already picked a plugin on Home — re-prompting is noise).
export async function fetchAppliedPluginSnapshot(
  snapshotId: string,
): Promise<AppliedPluginSnapshot | null> {
  try {
    const resp = await fetch(
      `/api/applied-plugins/${encodeURIComponent(snapshotId)}`,
    );
    if (!resp.ok) return null;
    return (await resp.json()) as AppliedPluginSnapshot;
  } catch {
    return null;
  }
}

// Render the brief that the composer should display for the active
// applied plugin. Substitutes `{{var}}` placeholders inside
// useCase.query against the user-supplied inputs map; missing values
// stay as `{{var}}` so the gating "fill required" hint stays visible.
export function renderPluginBriefTemplate(
  template: string,
  inputs: Record<string, unknown>,
): string {
  return template.replace(/\{\{\s*([a-zA-Z_][\w-]*)\s*\}\}/g, (full, key) => {
    if (key in inputs) {
      const v = inputs[key];
      if (v === undefined || v === null || v === '') return full;
      return String(v);
    }
    return full;
  });
}

export function resolvePluginQueryFallback(
  value: unknown,
  locale?: string,
  fallbackLocale: string = 'en',
): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (!isStringMap(value)) return '';

  const candidates = [
    locale,
    locale?.split('-')[0],
    fallbackLocale,
    fallbackLocale.split('-')[0],
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    const resolved = value[candidate];
    if (typeof resolved === 'string' && resolved.length > 0) return resolved;
  }

  return Object.values(value).find((entry) => entry.length > 0) ?? '';
}

function isStringMap(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value).every((entry) => typeof entry === 'string');
}
