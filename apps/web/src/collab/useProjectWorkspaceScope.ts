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
import { workspaceIdentityCacheKey } from './workspace-identity';

const PROJECT_SCOPE_RETRY_MS = 5_000;
/**
 * First retry delay, doubling up to {@link PROJECT_SCOPE_RETRY_MS}.
 *
 * What this polls for is almost always a project row the daemon has not
 * written yet — the first open of a project pulled from the hub — and that
 * clears in a second or two. At a flat steady cadence the reader spends most
 * of the wait idle AFTER the row exists, which is dead time the user reads as
 * a slow open. Probe tightly first, then relax so a genuinely long outage
 * still settles into a cheap poll rather than hammering the daemon.
 */
const PROJECT_SCOPE_FIRST_RETRY_MS = 500;
/**
 * How long "the daemon has not materialized this project yet" stays worth
 * re-asking.
 *
 * That answer can only become true while materialization is actually running.
 * A project that is simply gone returns the same 404 forever, so without a
 * deadline a stale tab pointed at a deleted project polls for as long as it
 * stays open. A transient backend outage deliberately keeps its unbounded
 * poll — that one can start succeeding at any moment.
 */
const PROJECT_SCOPE_MATERIALIZATION_WINDOW_MS = 120_000;

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
 * The one run-identity branch allowed to move a truly unbound historical
 * project into a Workspace. Exporting the decision lets recovery flows carry
 * structured proof of this exact branch instead of guessing from an opaque
 * identity cache key.
 */
export function runWorkspacePersonalAdoptionWitness(
  state: ProjectWorkspaceScopeState,
  caller: WorkspaceCollabContext | null,
  persistedProjectWorkspaceId: string | null | undefined,
): WorkspaceCollabContext | null {
  if (persistedProjectWorkspaceId != null || state.failure) return null;
  if (
    state.scope?.kind !== 'unbound'
    && !(state.loading && state.scope === null)
  ) {
    return null;
  }
  return activePersonalAdoptionWitness(caller);
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
 * A transient `unavailable` answer is not an authorization decision. When the
 * persisted project binding and exact caller still agree, keep asserting that
 * pair and let the daemon's mutation gate perform the fresh authoritative
 * membership check. Dropping the headers here would turn every project read
 * and run into `WORKSPACE_CONTEXT_REQUIRED` during a directory outage. A
 * `forbidden` answer remains authoritative and never borrows the caller.
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
  const callerAuthority = projectWorkspaceAuthority(caller);
  const exactBoundCaller =
    caller
    && callerAuthority
    && persistedProjectWorkspaceId === callerAuthority.workspaceId
      ? caller
      : null;
  if (
    exactBoundCaller
    && (
      state.failure === 'unavailable'
      || state.scope?.kind === 'unavailable'
    )
  ) {
    return exactBoundCaller;
  }
  if (state.failure) return null;
  const personalAdoptionWitness = runWorkspacePersonalAdoptionWitness(
    state,
    caller,
    persistedProjectWorkspaceId,
  );
  if (personalAdoptionWitness) return personalAdoptionWitness;
  if (
    state.loading
    && state.scope === null
    && exactBoundCaller
  ) {
    return exactBoundCaller;
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

/**
 * How to read a non-OK scope response: which failure kind the app should see,
 * and whether asking again can change it.
 *
 * A 404 from this endpoint carries two unrelated meanings. A daemon that never
 * had the route is authoritatively `unsupported` and asking again is
 * pointless. But `PROJECT_NOT_FOUND` says only that this daemon has no local
 * row for the project YET — the first open of a project pulled from the hub,
 * where the row appears a few seconds later once materialization lands.
 *
 * Both report the same failure KIND, because to every consumer of that kind
 * the project is equally unusable right now. They differ only in whether the
 * reader keeps asking. Treating "not yet" as final is not cosmetic: the scope
 * stays null forever and everything needing a resolved scope kind stalls with
 * it — measured on a first open, the chat pane spun indefinitely because the
 * empty-conversation seed can only act once the scope resolves.
 */
async function classifyScopeFetchFailure(
  response: Response,
): Promise<{
  failure: NonNullable<ProjectWorkspaceScopeState['failure']>;
  retryable: boolean;
}> {
  if (response.status === 403) return { failure: 'forbidden', retryable: false };
  if (response.status !== 404) return { failure: 'unavailable', retryable: true };
  let code: unknown;
  try {
    const body = (await response.json()) as { error?: { code?: unknown } } | null;
    code = body?.error?.code;
  } catch {
    // A body-less or non-JSON 404 is the old-daemon shape.
    code = undefined;
  }
  return { failure: 'unsupported', retryable: code === 'PROJECT_NOT_FOUND' };
}

class ProjectWorkspaceScopeFetchError extends Error {
  constructor(
    readonly failure: NonNullable<ProjectWorkspaceScopeState['failure']>,
    /**
     * Whether asking again can change the answer. Deliberately independent of
     * `failure`: the failure kind is what the REST of the app reads to decide
     * how much authority this project has, so widening a kind just to unlock a
     * retry silently changes those decisions too. (Reclassifying a
     * not-yet-materialized project as `unavailable` did exactly that — it
     * flipped `projectResourceAuthority` from `denied` to `workspace` during
     * first open.)
     */
    readonly retryable: boolean,
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
    workspaceIdentityKey?: string;
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
  const workspaceIdentityKey =
    options?.workspaceIdentityKey
    ?? projectWorkspaceAuthorityKey(workspaceAuthority);
  return get(
    `project-workspace-scope:${projectId}:${workspaceIdentityKey}`,
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
        const { failure, retryable } = await classifyScopeFetchFailure(response);
        throw new ProjectWorkspaceScopeFetchError(failure, retryable);
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
    workspaceIdentityKey: workspaceIdentityCacheKey(workspaceContext),
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
  initialScope?: ProjectWorkspaceScope | null,
): ProjectWorkspaceScopeState {
  const epochRef = useRef(0);
  const pinnedAuthorityRef = useRef<{
    projectId: string;
    context: WorkspaceCollabContext | null;
  }>({ projectId, context: null });
  const deferredRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [refreshRequest, setRefreshRequest] = useState({
    revision: 0,
    preserveResolvedScope: false,
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
  // The caller identity is request authority only for an already-bound
  // project. An unbound project's scope read is deliberately headerless, so a
  // shell Workspace A -> B change cannot alter that request or invalidate its
  // answer. Keeping the ambient identity in this key used to abort an in-flight
  // unbound read and synchronously hide an already-settled unbound scope. The
  // FileViewer then returned to its fail-closed skeleton even though the
  // project's resource authority had not changed at all.
  const callerIdentityKey = boundWorkspaceId
    ? workspaceIdentityCacheKey(callerWorkspaceContext)
    : 'none';
  const initialScopeContext = projectWorkspaceContext(initialScope);
  const initialScopeCanSeed = Boolean(
    initialScope
    && validScopeForProject(initialScope, projectId)
    && (
      !boundWorkspaceId
        ? initialScope.kind === 'unbound'
        : initialScope.workspaceId === boundWorkspaceId
          && workspaceIdentityCacheKey(initialScopeContext) === callerIdentityKey
    ),
  );
  const [state, setState] = useState<ProjectWorkspaceScopeState & {
    resolvedRevision: number;
    resolvedAuthorityKey: string | null;
    resolvedCallerIdentityKey: string;
  }>(() => ({
    loading: !initialScopeCanSeed,
    scope: initialScopeCanSeed ? initialScope ?? null : null,
    resolvedRevision: initialScopeCanSeed ? 0 : -1,
    resolvedAuthorityKey: initialScopeCanSeed ? requestAuthorityKey : null,
    resolvedCallerIdentityKey: initialScopeCanSeed ? callerIdentityKey : 'none',
  }));
  const skipFirstActiveRevalidationRef = useRef(initialScopeCanSeed);
  /**
   * Whether this hook's state was actually seeded from `initialScope` at mount.
   *
   * Only a seeded mount already holds the answer the initial read would fetch.
   * A route bootstrap that resolves AFTER the hook mounted flips
   * `initialScopeCanSeed` on an already-running hook, but cannot retroactively
   * seed state — the state initializer ran once, without it. Skipping the
   * initial read on that late flip therefore cancels the in-flight scope GET
   * that is the only thing able to settle `loading`, and strands the hook at
   * `{ loading: true, scope: null }` forever (no scope also means the workspace
   * invalidation SSE never subscribes, so no later event can re-trigger it).
   */
  const seededFromInitialScopeRef = useRef(initialScopeCanSeed);

  const scheduleDeferredRevalidation = useCallback(() => {
    // The daemon shares a short successful directory cache between the scope
    // endpoint and final spawn. Re-read once after that TTL too, so a same-login
    // member removal/rejoin cannot be hidden by the immediately cached answer.
    if (deferredRefreshTimerRef.current) {
      clearTimeout(deferredRefreshTimerRef.current);
    }
    deferredRefreshTimerRef.current = setTimeout(() => {
      deferredRefreshTimerRef.current = null;
      setRefreshRequest((current) => ({
        revision: current.revision + 1,
        preserveResolvedScope: true,
      }));
    }, PROJECT_SCOPE_RETRY_MS);
  }, []);

  const revalidateInBackground = useCallback(() => {
    setRefreshRequest((current) => ({
      revision: current.revision + 1,
      preserveResolvedScope: true,
    }));
    scheduleDeferredRevalidation();
  }, [scheduleDeferredRevalidation]);

  const revalidateAfterIdentityChange = useCallback(() => {
    setRefreshRequest((current) => ({
      revision: current.revision + 1,
      preserveResolvedScope: false,
    }));
    scheduleDeferredRevalidation();
  }, [scheduleDeferredRevalidation]);

  const revalidateOnActive = useCallback(() => {
    // A route bootstrap scope was fetched immediately before this hook mounted.
    // The first EventSource `open` is connection establishment, not evidence of
    // a change since that witness, so do not repeat the exact same scope read.
    if (skipFirstActiveRevalidationRef.current) {
      skipFirstActiveRevalidationRef.current = false;
      return;
    }
    revalidateInBackground();
  }, [revalidateInBackground]);

  const revalidateOnTeamProjectsChanged = useCallback((payload: {
    projectId?: string;
    kind?: 'catalog' | 'metadata';
  }) => {
    if (payload.kind === 'metadata') return;
    if (payload.projectId && payload.projectId !== projectId) return;
    revalidateInBackground();
  }, [projectId, revalidateInBackground]);

  useWorkspaceInvalidation(
    {
      'workspace-context-changed': revalidateInBackground,
      'team-projects-changed': revalidateOnTeamProjectsChanged,
    },
    {
      workspaceContext: projectWorkspaceContext(state.scope),
      onActive: revalidateOnActive,
    },
  );

  useEffect(() => {
    window.addEventListener(
      WORKSPACE_CONTEXT_REFRESH_EVENT,
      revalidateAfterIdentityChange,
    );
    window.addEventListener('pageshow', revalidateInBackground);
    return () => {
      window.removeEventListener(
        WORKSPACE_CONTEXT_REFRESH_EVENT,
        revalidateAfterIdentityChange,
      );
      window.removeEventListener('pageshow', revalidateInBackground);
      if (deferredRefreshTimerRef.current) {
        clearTimeout(deferredRefreshTimerRef.current);
        deferredRefreshTimerRef.current = null;
      }
    };
  }, [revalidateAfterIdentityChange, revalidateInBackground]);

  useEffect(() => {
    const epoch = ++epochRef.current;
    const controller = new AbortController();
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let firstAttempt = true;
    // Scoped to this effect run, so a project / authority change restarts the
    // tight probe instead of inheriting the previous run's relaxed delay.
    let retryAttempt = 0;
    let retryDeadline: number | null = null;
    /**
     * `windowMs` bounds how long this condition is worth re-asking; `null`
     * means it can succeed at any time and keeps the unbounded poll.
     */
    const scheduleRetry = (windowMs: number | null) => {
      if (windowMs !== null) {
        if (retryDeadline === null) retryDeadline = Date.now() + windowMs;
        if (Date.now() >= retryDeadline) return;
      }
      const delay = Math.min(
        PROJECT_SCOPE_RETRY_MS,
        PROJECT_SCOPE_FIRST_RETRY_MS * 2 ** retryAttempt,
      );
      retryAttempt += 1;
      retryTimer = setTimeout(() => void load(), delay);
    };
    const refreshRevision = refreshRequest.revision;

    if (refreshRevision === 0 && initialScopeCanSeed && seededFromInitialScopeRef.current) {
      return () => controller.abort();
    }

    const load = async () => {
      if (boundWorkspaceId && !requestWorkspaceAuthority) {
        setState({
          loading: false,
          scope: null,
          resolvedRevision: refreshRevision,
          resolvedAuthorityKey: requestAuthorityKey,
          resolvedCallerIdentityKey: callerIdentityKey,
          failure: 'forbidden',
        });
        return;
      }
      if (firstAttempt) {
        setState((current) => {
          const canRefreshInBackground =
            refreshRequest.preserveResolvedScope
            && current.resolvedAuthorityKey === requestAuthorityKey
            && current.resolvedCallerIdentityKey === callerIdentityKey
            && current.scope !== null
            && current.scope.projectId === projectId
            && (
              !boundWorkspaceId
              || current.scope.workspaceId === boundWorkspaceId
            );
          return canRefreshInBackground
            ? {
                ...current,
                loading: false,
              }
            : {
                loading: true,
                scope: null,
                resolvedRevision: refreshRevision,
                resolvedAuthorityKey: requestAuthorityKey,
                resolvedCallerIdentityKey: callerIdentityKey,
              };
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
            workspaceIdentityKey: callerIdentityKey,
          },
        );
        if (controller.signal.aborted || epoch !== epochRef.current) return;
        if (scope.kind === 'unavailable') {
          setState((current) => {
            const canKeepResolvedScope =
              refreshRequest.preserveResolvedScope
              && current.resolvedAuthorityKey === requestAuthorityKey
              && current.resolvedCallerIdentityKey === callerIdentityKey
              && current.scope !== null
              && current.scope.kind !== 'unavailable'
              && current.scope.projectId === projectId
              && (
                !boundWorkspaceId
                || current.scope.workspaceId === boundWorkspaceId
              );
            return canKeepResolvedScope
              ? {
                  ...current,
                  loading: false,
                  resolvedRevision: refreshRevision,
                  failure: 'unavailable',
                }
              : {
                  loading: false,
                  scope,
                  resolvedRevision: refreshRevision,
                  resolvedAuthorityKey: requestAuthorityKey,
                  resolvedCallerIdentityKey: callerIdentityKey,
                };
          });
          scheduleRetry(null);
        } else {
          setState({
            loading: false,
            scope,
            resolvedRevision: refreshRevision,
            resolvedAuthorityKey: requestAuthorityKey,
            resolvedCallerIdentityKey: callerIdentityKey,
          });
        }
      } catch (error) {
        if (controller.signal.aborted || epoch !== epochRef.current) return;
        const failure =
          error instanceof ProjectWorkspaceScopeFetchError
            ? error.failure
            : 'unavailable';
        setState((current) => {
          const canKeepResolvedScope =
            failure === 'unavailable'
            && refreshRequest.preserveResolvedScope
            && current.resolvedAuthorityKey === requestAuthorityKey
            && current.resolvedCallerIdentityKey === callerIdentityKey
            && current.scope !== null
            && current.scope.kind !== 'unavailable'
            && current.scope.projectId === projectId
            && (
              !boundWorkspaceId
              || current.scope.workspaceId === boundWorkspaceId
            );
          return canKeepResolvedScope
            ? {
                ...current,
                loading: false,
                resolvedRevision: refreshRevision,
                failure,
              }
            : {
                loading: false,
                scope: null,
                resolvedRevision: refreshRevision,
                resolvedAuthorityKey: requestAuthorityKey,
                resolvedCallerIdentityKey: callerIdentityKey,
                failure,
              };
        });
        // Poll only what asking again can change. A forbidden access decision
        // and an old daemon without the route are both final; they still
        // revalidate on explicit identity, page-lifecycle, or workspace
        // invalidation events.
        const retryable = error instanceof ProjectWorkspaceScopeFetchError
          ? error.retryable
          : true;
        if (retryable) {
          // Only the materialization case is time-boxed; an outage keeps the
          // unbounded poll it has always had.
          scheduleRetry(
            failure === 'unsupported' ? PROJECT_SCOPE_MATERIALIZATION_WINDOW_MS : null,
          );
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
    refreshRequest,
    requestAuthorityKey,
    callerIdentityKey,
    initialScopeCanSeed,
  ]);

  // React preserves hook state across a ProjectView A→B prop change until the
  // effect above runs. Never expose A's already-resolved scope during that
  // transition frame: it could briefly enable B's composer with A's wallet.
  // The caller's identity is held to the same rule: a scope resolved for the
  // workspace the user just left names the wallet they just left with it, and an
  // ambient context refresh can change the identity without bumping the revision.
  if (
    state.resolvedAuthorityKey !== requestAuthorityKey
    || state.resolvedCallerIdentityKey !== callerIdentityKey
    || (
      !refreshRequest.preserveResolvedScope
      && state.resolvedRevision !== refreshRequest.revision
    )
    || (
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
