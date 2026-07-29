import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ProjectWorkspaceScope,
  ProjectWorkspaceScopeResponse,
  WorkspaceCollabContext,
} from '@open-design/contracts';
import {
  WORKSPACE_CONTEXT_REFRESH_EVENT,
  useWorkspaceContext,
  workspaceIdentityCacheKey,
  type WorkspaceContextState,
} from './useWorkspaceContext';
import {
  forceSharedCancellableGet,
  sharedCancellableGet,
} from '../lib/shared-cancellable-get';
import { workspaceProjectHeaders } from '../state/projects';
import { useWorkspaceInvalidation } from './workspace-events';

const PROJECT_SCOPE_RETRY_MS = 5_000;

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
 * headerless. In particular, `/workspace-scope` can observe a membership
 * removal before the mutation gate's deliberately lagging `lastKnown()` cache;
 * sending stale active caller headers after that fresh answer would add an
 * assertion the server has already disproved. This does not claim to eliminate
 * the daemon's existing headerless/lastKnown lag — it merely does not widen it.
 *
 * An answered `unbound` scope may name the caller. No workspace has claimed
 * that resource, and the daemon's mutation gate now deliberately treats an
 * identified caller the same as a headerless caller without persisting any
 * retroactive binding.
 */
export function runWorkspaceIdentity(
  state: ProjectWorkspaceScopeState,
  caller: WorkspaceCollabContext | null,
  persistedProjectWorkspaceId: string | null | undefined,
): WorkspaceCollabContext | null {
  const resolved = projectWorkspaceContext(state.scope);
  if (resolved) return resolved;
  if (state.scope?.kind === 'unbound') return caller;
  if (
    state.loading &&
    state.scope === null &&
    state.failure === undefined &&
    caller &&
    typeof persistedProjectWorkspaceId === 'string' &&
    persistedProjectWorkspaceId.trim() === caller.workspaceId
  ) {
    return caller;
  }
  return null;
}

/** AMR must resolve an explicit personal/team billing principal. Unbound,
 * revoked, loading and directory-outage states all fail closed. */
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

/**
 * Whether the caller's own identity is settled enough to ask "what is this
 * project's scope for ME".
 *
 * The daemon resolves an unbound project against the workspace the REQUEST names,
 * so a read issued before the shell knows who is asking is answered `unbound` and
 * then immediately re-read once the identity lands — two requests per project
 * open, the first of them wrong. A context read always settles (success and
 * failure both clear `loading`), so this can only delay the scope read, never
 * suppress it.
 */
function callerIdentityIsSettled(state: WorkspaceContextState): boolean {
  return !state.loading || state.context !== null;
}

async function fetchProjectWorkspaceScope(
  projectId: string,
  caller: WorkspaceCollabContext | null,
  signal: AbortSignal,
  options?: { fresh?: boolean },
): Promise<ProjectWorkspaceScope> {
  // Every mounted consumer of one project's scope shares a single request
  // (Batch A §4.3). One consumer unmounting only detaches itself; the shared
  // read is aborted when nobody is left awaiting it. Identity-change
  // revalidations pass `fresh` to evict the burst cache first (once per
  // broadcast burst).
  //
  // The key carries the CALLER's identity because the answer now depends on it:
  // an unbound project resolves to the requesting workspace, and the scope hands
  // back the `workspaceMemberId` that pays for that project's runs. A shared key
  // would serve one member the wallet of another — and `forceSharedCancellableGet`
  // does not save us, since it deliberately treats everything inside its 250ms
  // burst window as one identity change.
  const get = options?.fresh ? forceSharedCancellableGet : sharedCancellableGet;
  return get(
    `project-workspace-scope:${projectId}:${workspaceIdentityCacheKey(caller)}`,
    async (sharedSignal): Promise<ProjectWorkspaceScope> => {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/workspace-scope`,
        {
          cache: 'no-store',
          signal: sharedSignal,
          // Same headers every other workspace-aware project read sends. Without
          // them the daemon cannot tell who is asking and answers `unbound` for
          // an unbound project no matter who reads it.
          ...(caller ? { headers: workspaceProjectHeaders(caller) } : {}),
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
 * Project detail scope is pinned by the daemon's workspace_projects row, not
 * by whichever workspace happens to be active in the navigation rail.
 */
export function useProjectWorkspaceScope(projectId: string): ProjectWorkspaceScopeState {
  const epochRef = useRef(0);
  const deferredRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [refreshRevision, setRefreshRevision] = useState(0);
  const workspaceContextState = useWorkspaceContext();
  const { context: workspaceContext } = workspaceContextState;
  // `callerIdentity` is a string digest of every field the request carries, so it
  // is stable across the context poll's fresh-but-equal objects. Read the context
  // itself through a ref: depending on the OBJECT would re-run the effect (and
  // re-read the scope) on every 30s poll for an identity that never changed.
  const callerContextRef = useRef(workspaceContext);
  callerContextRef.current = workspaceContext;
  const callerIdentity = workspaceIdentityCacheKey(workspaceContext);
  const callerSettled = callerIdentityIsSettled(workspaceContextState);
  const [state, setState] = useState<ProjectWorkspaceScopeState & {
    resolvedRevision: number;
    resolvedIdentity: string | null;
  }>({
    loading: true,
    scope: null,
    resolvedRevision: -1,
    resolvedIdentity: null,
  });

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
    { onActive: revalidate },
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
    // Nothing to ask on behalf of a caller whose own identity has not landed yet.
    // The hook stays in its loading state and this effect re-runs the moment the
    // context settles.
    if (!callerSettled) return;
    const epoch = ++epochRef.current;
    const controller = new AbortController();
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let firstAttempt = true;

    const load = async () => {
      if (firstAttempt) {
        setState({
          loading: true,
          scope: null,
          resolvedRevision: refreshRevision,
          resolvedIdentity: callerIdentity,
        });
        firstAttempt = false;
      }
      try {
        const scope = await fetchProjectWorkspaceScope(
          projectId,
          callerContextRef.current,
          controller.signal,
          {
            // Revision 0 is the initial mount read; anything later is an
            // explicit revalidation (identity change, reconnect, pageshow,
            // deferred TTL re-read) and must not be served from the burst cache.
            fresh: refreshRevision > 0,
          },
        );
        if (controller.signal.aborted || epoch !== epochRef.current) return;
        setState({
          loading: false,
          scope,
          resolvedRevision: refreshRevision,
          resolvedIdentity: callerIdentity,
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
          resolvedIdentity: callerIdentity,
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
  }, [projectId, refreshRevision, callerIdentity, callerSettled]);

  // React preserves hook state across a ProjectView A→B prop change until the
  // effect above runs. Never expose A's already-resolved scope during that
  // transition frame: it could briefly enable B's composer with A's wallet.
  // The caller's identity is held to the same rule: a scope resolved for the
  // workspace the user just left names the wallet they just left with it, and an
  // ambient context refresh can change the identity without bumping the revision.
  if (
    state.resolvedRevision !== refreshRevision ||
    state.resolvedIdentity !== callerIdentity ||
    (state.scope !== null && state.scope.projectId !== projectId)
  ) {
    return { loading: true, scope: null };
  }
  return {
    loading: state.loading,
    scope: state.scope,
    ...(state.failure ? { failure: state.failure } : {}),
  };
}
