import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ProjectWorkspaceScope,
  ProjectWorkspaceScopeResponse,
  WorkspaceCollabContext,
} from '@open-design/contracts';
import { WORKSPACE_CONTEXT_REFRESH_EVENT } from './useWorkspaceContext';
import {
  forceSharedCancellableGet,
  sharedCancellableGet,
} from '../lib/shared-cancellable-get';
import { useWorkspaceInvalidation } from './workspace-events';

const PROJECT_SCOPE_RETRY_MS = 5_000;

export interface ProjectWorkspaceScopeState {
  loading: boolean;
  scope: ProjectWorkspaceScope | null;
  failure?: 'unsupported' | 'forbidden' | 'unavailable';
  /**
   * Force a fresh read of this project's scope — the same revalidation an
   * identity change / reconnect / `pageshow` triggers, exposed so a UI that has
   * to tell the user "we could not resolve this" can also offer them the retry.
   * Optional so fixtures can describe a state without owning the read.
   */
  revalidate?: () => void;
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

async function fetchProjectWorkspaceScope(
  projectId: string,
  signal: AbortSignal,
  options?: { fresh?: boolean },
): Promise<ProjectWorkspaceScope> {
  // Every mounted consumer of one project's scope shares a single request
  // (Batch A §4.3). One consumer unmounting only detaches itself; the shared
  // read is aborted when nobody is left awaiting it. Identity-change
  // revalidations pass `fresh` to evict the burst cache first (once per
  // broadcast burst).
  const get = options?.fresh ? forceSharedCancellableGet : sharedCancellableGet;
  return get(
    `project-workspace-scope:${projectId}`,
    async (sharedSignal): Promise<ProjectWorkspaceScope> => {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/workspace-scope`,
        { cache: 'no-store', signal: sharedSignal },
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
  const [state, setState] = useState<ProjectWorkspaceScopeState & {
    resolvedRevision: number;
  }>({
    loading: true,
    scope: null,
    resolvedRevision: -1,
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
        });
        firstAttempt = false;
      }
      try {
        const scope = await fetchProjectWorkspaceScope(projectId, controller.signal, {
          // Revision 0 is the initial mount read; anything later is an
          // explicit revalidation (identity change, reconnect, pageshow,
          // deferred TTL re-read) and must not be served from the burst cache.
          fresh: refreshRevision > 0,
        });
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
  }, [projectId, refreshRevision]);

  // React preserves hook state across a ProjectView A→B prop change until the
  // effect above runs. Never expose A's already-resolved scope during that
  // transition frame: it could briefly enable B's composer with A's wallet.
  if (
    state.resolvedRevision !== refreshRevision ||
    (state.scope !== null && state.scope.projectId !== projectId)
  ) {
    return { loading: true, scope: null, revalidate };
  }
  return {
    loading: state.loading,
    scope: state.scope,
    revalidate,
    ...(state.failure ? { failure: state.failure } : {}),
  };
}
