import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ProjectWorkspaceScope,
  ProjectWorkspaceScopeResponse,
  WorkspaceCollabContext,
} from '@open-design/contracts';
import {
  WORKSPACE_CONTEXT_REFRESH_EVENT,
} from './useWorkspaceContext';
import {
  forceSharedCancellableGet,
  sharedCancellableGet,
} from '../lib/shared-cancellable-get';
import { useWorkspaceInvalidation } from './workspace-events';

const PROJECT_SCOPE_RETRY_MS = 5_000;

interface ProjectWorkspaceAuthority {
  workspaceId: string;
  workspaceMemberId: string;
}

function projectWorkspaceAuthority(
  context: WorkspaceCollabContext | null | undefined,
): ProjectWorkspaceAuthority | null {
  const workspaceId = context?.workspaceId.trim() ?? '';
  const workspaceMemberId = context?.workspaceMemberId.trim() ?? '';
  return workspaceId && workspaceMemberId
    ? { workspaceId, workspaceMemberId }
    : null;
}

function projectWorkspaceAuthorityKey(
  authority: ProjectWorkspaceAuthority | null | undefined,
): string {
  return authority
    ? `${authority.workspaceId}:${authority.workspaceMemberId}`
    : 'none';
}

function projectWorkspaceAuthorityHeaders(
  authority: ProjectWorkspaceAuthority,
): HeadersInit {
  return {
    'x-od-workspace-id': authority.workspaceId,
    'x-od-workspace-member-id': authority.workspaceMemberId,
  };
}

export interface ProjectWorkspaceScopeState {
  loading: boolean;
  scope: ProjectWorkspaceScope | null;
  failure?: 'unsupported' | 'forbidden' | 'unavailable';
}

export function projectWorkspaceContext(
  scope: ProjectWorkspaceScope | null | undefined,
): WorkspaceCollabContext | null {
  return scope?.kind === 'personal' || scope?.kind === 'team'
    ? scope.context
    : null;
}

export function projectWorkspaceScopeReady(
  scope: ProjectWorkspaceScope | null | undefined,
): boolean {
  return scope?.kind === 'unbound' || scope?.kind === 'personal' || scope?.kind === 'team';
}

function activePersonalAdoptionWitness(
  caller: WorkspaceCollabContext | null | undefined,
): WorkspaceCollabContext | null {
  if (
    caller?.workspaceType !== 'personal'
    || caller.memberStatus !== 'active'
    || caller.workspaceId.trim().length === 0
    || caller.workspaceMemberId.trim().length === 0
  ) {
    return null;
  }
  return caller;
}

/**
 * The workspace identity a run creation asserts to the daemon.
 *
 * The project's resolved scope wins: it is the authority for which workspace
 * the run writes into and which wallet pays. Before the first scope answer,
 * Home may auto-send, so the caller is a safe temporary witness only when the
 * project's persisted binding already names that same workspace. That binding
 * lives on the project read model and survives ProjectView's authorization-key
 * remount; unlike hook-local "first read" state it therefore cannot turn an
 * A-bound project into workspace B during a switch.
 *
 * Once the endpoint answers `unavailable`, or a scope read settles as failed,
 * the caller is no longer evidence for the project and the request stays
 * headerless. The daemon's mutation gate performs its own fresh authoritative
 * membership check: a removed member is rejected and a directory outage fails
 * closed before any side effect. Sending stale shell headers after this read
 * failed would only assert an authority the client can no longer prove.
 *
 * While the first scope read is pending, a caller whose workspace matches the
 * project's persisted workspace id may be used so the first request does not
 * escape unscoped.
 *
 * A project whose read model is explicitly unbound has one narrower exception:
 * an active Personal caller may witness the daemon's one-time transactional
 * adoption. This does not let the web authorize or persist the binding; the
 * daemon freshly verifies that exact Personal workspace/member pair and owns
 * the decision. Team callers, absent callers, and any failed/forbidden/
 * unavailable scope read stay headerless so the client cannot adopt the
 * project into whichever Workspace happens to be selected.
 */
export function runWorkspaceIdentity(
  state: ProjectWorkspaceScopeState,
  caller: WorkspaceCollabContext | null,
  persistedProjectWorkspaceId: string | null | undefined,
): WorkspaceCollabContext | null {
  const resolved = projectWorkspaceContext(state.scope);
  if (resolved) return resolved;
  if (state.failure) return null;
  const personalAdoptionWitness = activePersonalAdoptionWitness(caller);
  if (state.scope?.kind === 'unbound') {
    return personalAdoptionWitness;
  }
  if (
    state.loading
    && state.scope === null
    && persistedProjectWorkspaceId == null
  ) {
    return personalAdoptionWitness;
  }
  if (
    state.loading
    && state.scope === null
    && caller
    && persistedProjectWorkspaceId === caller.workspaceId
  ) {
    return caller;
  }
  return null;
}

/** Whether the settled project scope itself resolves an explicit AMR billing
 * principal. An unbound project can still present a Personal adoption witness
 * through {@link runWorkspaceIdentity}; this predicate intentionally describes
 * only the persisted project scope. */
export function projectWorkspaceScopeAuthorizesAmr(
  scope: ProjectWorkspaceScope | null | undefined,
): boolean {
  return scope?.kind === 'personal' || scope?.kind === 'team';
}

class ProjectWorkspaceScopeFetchError extends Error {
  constructor(
    readonly failure: NonNullable<ProjectWorkspaceScopeState['failure']>,
  ) {
    super(`project workspace scope ${failure}`);
    this.name = 'ProjectWorkspaceScopeFetchError';
  }
}

function validScopeForProject(
  scope: ProjectWorkspaceScope,
  projectId: string,
): boolean {
  if (scope.projectId !== projectId) return false;
  if (scope.kind === 'unbound') {
    return scope.workspaceId === null && scope.context === null;
  }
  if (!scope.workspaceId || scope.context === undefined) return false;
  if (scope.kind === 'unavailable') return scope.context === null;
  return (
    scope.context.workspaceId === scope.workspaceId &&
    scope.context.workspaceMemberId.trim().length > 0 &&
    scope.context.workspaceType === scope.kind
  );
}

async function fetchProjectWorkspaceScope(
  projectId: string,
  signal: AbortSignal,
  options?: {
    fresh?: boolean;
    workspaceAuthority?: ProjectWorkspaceAuthority | null;
  },
): Promise<ProjectWorkspaceScope> {
  // Every mounted consumer of one project's scope shares a single request
  // (Batch A §4.3). One consumer unmounting only detaches itself; the shared
  // read is aborted when nobody is left awaiting it. Identity-change
  // revalidations pass `fresh` to evict the burst cache first (once per
  // broadcast burst).
  //
  // A known bound project must carry the exact caller identity that opened it.
  // The daemon freshly verifies that pair before returning any project scope.
  // Headerless reads are retained only for genuinely unbound/legacy projects;
  // a bound daemon row rejects them without disclosing its Workspace context.
  const get = options?.fresh ? forceSharedCancellableGet : sharedCancellableGet;
  const workspaceAuthority = options?.workspaceAuthority ?? null;
  return get(
    `project-workspace-scope:${projectId}:${projectWorkspaceAuthorityKey(workspaceAuthority)}`,
    async (sharedSignal): Promise<ProjectWorkspaceScope> => {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/workspace-scope`,
        {
          cache: 'no-store',
          ...(workspaceAuthority
            ? { headers: projectWorkspaceAuthorityHeaders(workspaceAuthority) }
            : {}),
          signal: sharedSignal,
        },
      );
      if (!response.ok) {
        throw new ProjectWorkspaceScopeFetchError(
          response.status === 404
            ? 'unsupported'
            : response.status === 403
              ? 'forbidden'
              : 'unavailable',
        );
      }
      const body = (await response.json()) as ProjectWorkspaceScopeResponse;
      if (!body.scope || !validScopeForProject(body.scope, projectId)) {
        throw new Error('project workspace scope identity mismatch');
      }
      return body.scope;
    },
    { signal },
  );
}

/**
 * Resolve one project's persisted Workspace authority for a non-project
 * surface that is about to mutate that project.
 *
 * This deliberately does not accept or consult shell navigation state. A
 * bound project returns its own verified context; unbound/unavailable projects
 * return null so callers never substitute whichever Workspace is currently
 * selected in another part of the UI.
 */
export async function resolveProjectWorkspaceContext(
  projectId: string,
  workspaceContext: WorkspaceCollabContext | null = null,
  persistedProjectWorkspaceId?: string | null,
): Promise<WorkspaceCollabContext | null> {
  const boundWorkspaceId =
    typeof persistedProjectWorkspaceId === 'string'
      ? persistedProjectWorkspaceId.trim()
      : '';
  if (
    boundWorkspaceId
    && workspaceContext?.workspaceId !== boundWorkspaceId
  ) {
    return null;
  }
  const controller = new AbortController();
  const scope = await fetchProjectWorkspaceScope(projectId, controller.signal, {
    fresh: true,
    workspaceAuthority:
      boundWorkspaceId && workspaceContext?.workspaceId === boundWorkspaceId
        ? projectWorkspaceAuthority(workspaceContext)
        : null,
  });
  return projectWorkspaceContext(scope);
}

/**
 * Project detail scope is pinned by the daemon's workspace_projects row, not
 * by whichever workspace happens to be active in the navigation rail.
 */
export function useProjectWorkspaceScope(
  projectId: string,
  callerWorkspaceContext: WorkspaceCollabContext | null = null,
  persistedProjectWorkspaceId?: string | null,
): ProjectWorkspaceScopeState {
  const epochRef = useRef(0);
  const pinnedAuthorityRef = useRef<{
    projectId: string;
    context: WorkspaceCollabContext | null;
  }>({ projectId, context: null });
  const deferredRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [refreshRevision, setRefreshRevision] = useState(0);
  const [state, setState] = useState<ProjectWorkspaceScopeState & {
    resolvedRevision: number;
  }>({
    loading: true,
    scope: null,
    resolvedRevision: -1,
  });
  const boundWorkspaceId =
    typeof persistedProjectWorkspaceId === 'string'
      ? persistedProjectWorkspaceId.trim()
      : '';
  if (pinnedAuthorityRef.current.projectId !== projectId) {
    pinnedAuthorityRef.current = { projectId, context: null };
  }
  if (
    boundWorkspaceId
    && callerWorkspaceContext?.workspaceId === boundWorkspaceId
  ) {
    pinnedAuthorityRef.current = {
      projectId,
      context: callerWorkspaceContext,
    };
  }
  const requestWorkspaceAuthority =
    boundWorkspaceId
      ? pinnedAuthorityRef.current.context?.workspaceId === boundWorkspaceId
        ? projectWorkspaceAuthority(pinnedAuthorityRef.current.context)
        : null
      : null;
  const requestAuthorityKey = projectWorkspaceAuthorityKey(requestWorkspaceAuthority);

  const revalidate = useCallback(() => {
    setRefreshRevision((revision) => revision + 1);
    // The daemon shares a short successful directory cache between the scope
    // endpoint and final spawn. Re-read once after that TTL too, so a same-login
    // member removal/rejoin cannot be hidden by the immediately cached answer.
    if (deferredRefreshTimerRef.current) {
      clearTimeout(deferredRefreshTimerRef.current);
    }
    deferredRefreshTimerRef.current = setTimeout(() => {
      deferredRefreshTimerRef.current = null;
      setRefreshRevision((revision) => revision + 1);
    }, PROJECT_SCOPE_RETRY_MS);
  }, []);

  useWorkspaceInvalidation(
    { 'workspace-context-changed': revalidate },
    {
      workspaceContext: projectWorkspaceContext(state.scope),
      onActive: revalidate,
    },
  );

  useEffect(() => {
    window.addEventListener(WORKSPACE_CONTEXT_REFRESH_EVENT, revalidate);
    window.addEventListener('pageshow', revalidate);
    return () => {
      window.removeEventListener(WORKSPACE_CONTEXT_REFRESH_EVENT, revalidate);
      window.removeEventListener('pageshow', revalidate);
      if (deferredRefreshTimerRef.current) {
        clearTimeout(deferredRefreshTimerRef.current);
        deferredRefreshTimerRef.current = null;
      }
    };
  }, [revalidate]);

  useEffect(() => {
    const epoch = ++epochRef.current;
    const controller = new AbortController();
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let firstAttempt = true;

    const load = async () => {
      if (boundWorkspaceId && !requestWorkspaceAuthority) {
        setState({
          loading: false,
          scope: null,
          resolvedRevision: refreshRevision,
          failure: 'forbidden',
        });
        return;
      }
      if (firstAttempt) {
        setState({
          loading: true,
          scope: null,
          resolvedRevision: refreshRevision,
        });
        firstAttempt = false;
      }
      try {
        const scope = await fetchProjectWorkspaceScope(
          projectId,
          controller.signal,
          {
            // Revision 0 is the initial mount read; anything later is an
            // explicit revalidation (identity change, reconnect, pageshow,
            // deferred TTL re-read) and must not be served from the burst cache.
            fresh: refreshRevision > 0,
            workspaceAuthority: requestWorkspaceAuthority,
          },
        );
        if (controller.signal.aborted || epoch !== epochRef.current) return;
        setState({
          loading: false,
          scope,
          resolvedRevision: refreshRevision,
        });
        if (scope.kind === 'unavailable') {
          retryTimer = setTimeout(() => void load(), PROJECT_SCOPE_RETRY_MS);
        }
      } catch (error) {
        if (controller.signal.aborted || epoch !== epochRef.current) return;
        const failure =
          error instanceof ProjectWorkspaceScopeFetchError
            ? error.failure
            : 'unavailable';
        setState({
          loading: false,
          scope: null,
          resolvedRevision: refreshRevision,
          failure,
        });
        // An old daemon has no endpoint to recover on a timer. Identity-change
        // and page lifecycle invalidations still revalidate after an upgrade.
        if (failure !== 'unsupported') {
          retryTimer = setTimeout(() => void load(), PROJECT_SCOPE_RETRY_MS);
        }
      }
    };

    void load();
    return () => {
      controller.abort();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [
    boundWorkspaceId,
    projectId,
    refreshRevision,
    requestAuthorityKey,
  ]);

  // React preserves hook state across a ProjectView A→B prop change until the
  // effect above runs. Never expose A's already-resolved scope during that
  // transition frame: it could briefly enable B's composer with A's wallet.
  // The caller's identity is held to the same rule: a scope resolved for the
  // workspace the user just left names the wallet they just left with it, and an
  // ambient context refresh can change the identity without bumping the revision.
  if (
    state.resolvedRevision !== refreshRevision ||
    (
      state.scope !== null
      && (
        state.scope.projectId !== projectId
        || (
          boundWorkspaceId
          && state.scope.workspaceId !== boundWorkspaceId
        )
      )
    )
  ) {
    return { loading: true, scope: null };
  }
  return {
    loading: state.loading,
    scope: state.scope,
    ...(state.failure ? { failure: state.failure } : {}),
  };
}
