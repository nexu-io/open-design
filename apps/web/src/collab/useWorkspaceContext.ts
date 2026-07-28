import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  TeamProject,
  WorkspaceBillingResponse,
  WorkspaceBillingRuntimeState,
  WorkspaceBillingSnapshot,
  WorkspaceBillingSummary,
  WorkspaceCollabContext,
  WorkspaceContextResponse,
  WorkspaceInvalidationSsePayload,
} from '@open-design/contracts';
import { coalescedGet, forceCoalescedGet } from '../lib/coalesced-get';
import { isTeamPlanTier } from './team-plan';
import { fetchTeamProjectsCatalog } from './team-projects-catalog';
import { useWorkspaceInvalidation } from './workspace-events';
import {
  createWorkspaceBillingInterestOwnerId,
  ensureWorkspaceBillingInterestDeclared,
  resetWorkspaceBillingInterestRegistry,
  retainWorkspaceBillingInterest,
  workspaceBillingInterestHeaders,
} from './workspace-billing-interests';

// One shared read of the workspace context (`GET /api/workspace/context`) for the
// navigation shell. The daemon proxies B's `CurrentWorkspaceContext`; `context`
// is non-null for both personal and team workspaces when the local AMR identity
// is available, and null when signed out / offline / B unavailable. Every
// workspace surface in the entry shell consumes THIS one read so the shell never
// re-derives role/permission judgements or fans out duplicate fetches. See
// `packages/contracts/src/api/collab.ts` for the shape.
export interface WorkspaceContextState {
  context: WorkspaceCollabContext | null;
  loading: boolean;
  /**
   * `unsupported` is an old daemon with no workspace endpoint and retains the
   * legal pre-workspace/headerless behavior. `unavailable` means a modern
   * workspace answer is unknown; write paths must fail closed instead of
   * treating that outage as an anonymous identity.
   */
  failure?: 'unsupported' | 'unavailable';
}

/** Coalescing key for `GET /api/workspace/context`; shared so an identity
 *  change can evict exactly this read instead of the whole cache. */
const WORKSPACE_CONTEXT_COALESCE_KEY = 'workspace-context';

// Last successfully-resolved workspace context, kept at module scope so it
// survives a component unmount/remount. Returning to the home view remounts the
// nav shell, and starting each remount from `null` flashed the signed-out state
// for the full duration of the (vela-backed, seconds-long) context read before
// snapping to the real workspace. Seeding the remount from this cache shows the
// last-known signed-in state instantly while the background read revalidates.
let cachedWorkspaceContext: WorkspaceContextState['context'] = null;
let workspaceContextRevision = 0;

/** Test seam: clear the module-level context cache between tests. */
export function resetWorkspaceContextCache(): void {
  cachedWorkspaceContext = null;
  workspaceContextRevision = 0;
}

/**
 * The last context the shell resolved, for consumers that mount later and would
 * otherwise start their own read from `null`. Read-only: this cache is owned by
 * `useWorkspaceContext` and only a successful read redefines it.
 */
export function lastResolvedWorkspaceContext(): WorkspaceContextState['context'] {
  return cachedWorkspaceContext;
}

// Last team-shared catalog this shell successfully read. `null` means "never
// loaded", which is NOT the same as "nothing is shared" — consumers that relax
// a fail-closed gate on this must treat null as "unknown" and keep failing
// closed.
let cachedTeamProjects: TeamProject[] | null = null;

/** Test seam: clear the module-level team-project cache between tests. */
export function resetTeamProjectsCache(): void {
  cachedTeamProjects = null;
}

/**
 * The team-shared catalog the shell last resolved, or null if it never has.
 * Same source the 全部项目 grid reads, exposed for consumers that need to know
 * whether a project is shared before `/collab/status` answers.
 */
export function lastResolvedTeamProjects(): TeamProject[] | null {
  return cachedTeamProjects;
}

export function useWorkspaceContext(): WorkspaceContextState {
  const [state, setState] = useState<WorkspaceContextState>(() => ({
    context: cachedWorkspaceContext,
    loading: cachedWorkspaceContext === null,
  }));
  const mountedRef = useRef(true);
  // A forced workspace switch can overtake an older ambient read. Keep request
  // ordering local to each hook instance so the late answer cannot redefine
  // either this hook's state or the module cache that seeds future mounts.
  const requestEpochRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestEpochRef.current += 1;
    };
  }, []);

  /**
   * Read the workspace context.
   *
   * `markLoading` announces that this read was triggered by something that just
   * CHANGED the identity (a sign-in), so the shell should treat the answer it
   * currently holds as void rather than authoritative. It only ever promotes
   * "no context" to "loading": a read that starts while a context is already in
   * hand keeps showing it, which is what stops the rail flashing signed-out.
   *
   * Without it, signing in during onboarding left the bottom-left "sign in to
   * Open Design Cloud" callout on screen for the whole (vela-backed,
   * up-to-seconds) re-read, because `loading` had already settled to false on
   * the earlier signed-out read and only `context !== null` gates the callout
   * (#140). It also forces the coalescing entry, whose whole premise — that
   * sub-second staleness is invisible — stops holding at exactly this moment:
   * the cached answer describes the identity the user just replaced.
   *
   * This hook is mounted by a dozen-plus components at once (App, EntryShell,
   * SettingsDialog, HomeView, ...), and a sign-in fires ONE broadcast event
   * every mounted instance reacts to in the same synchronous pass. Forcing via
   * `forceCoalescedGet` (rather than `evictCoalescedGet` + `coalescedGet`
   * directly) collapses that whole burst to a single real fetch instead of one
   * per mounted instance — see its doc for why the naive evict-then-fetch
   * pattern is unsafe here.
   */
  const loadContext = useCallback(async (options: { markLoading?: boolean } = {}) => {
    const requestEpoch = ++requestEpochRef.current;
    if (options.markLoading && mountedRef.current) {
      setState((prev) =>
        prev.context === null && !prev.loading ? { ...prev, loading: true } : prev,
      );
    }
    try {
      const fetchContext = async () => {
        const res = await fetch('/api/workspace/context', { cache: 'no-store' });
        if (!res.ok) {
          const error = new Error(`workspace-context ${res.status}`) as Error & {
            status?: number;
          };
          error.status = res.status;
          throw error;
        }
        return (await res.json()) as WorkspaceContextResponse;
      };
      // Coalesced: every mounted consumer of this hook (and every focus/pageshow
      // refresh across them) fires the same read on a home-view burst — collapse
      // them to one request. The nav shell tolerates sub-second staleness.
      // An explicit identity-change refresh forces a fresh read instead of
      // sharing a settled answer that predates the change.
      const body = options.markLoading
        ? await forceCoalescedGet(WORKSPACE_CONTEXT_COALESCE_KEY, fetchContext)
        : await coalescedGet(WORKSPACE_CONTEXT_COALESCE_KEY, fetchContext);
      if (!mountedRef.current || requestEpochRef.current !== requestEpoch) return;
      // A successful read is the only thing that redefines "signed in": persist it
      // (including an explicit null for a genuinely signed-out response) so the
      // next remount seeds from the truth, not a stale value.
      const nextContext = body.context ?? null;
      if (workspaceContextIdentity(cachedWorkspaceContext) !== workspaceContextIdentity(nextContext)) {
        workspaceContextRevision += 1;
      }
      cachedWorkspaceContext = nextContext;
      setState({ context: cachedWorkspaceContext, loading: false });
    } catch (error) {
      if (!mountedRef.current || requestEpochRef.current !== requestEpoch) return;
      // Transient failure (offline, momentary daemon/hub hiccup): keep the
      // last-known context instead of flashing the signed-out state. A never-
      // signed-in / personal user has a null cache, so this still shows the local
      // state for them.
      setState({
        context: cachedWorkspaceContext,
        loading: false,
        failure:
          (error as { status?: unknown })?.status === 404
            ? 'unsupported'
            : 'unavailable',
      });
    }
  }, []);

  useEffect(() => {
    void loadContext();
  }, [loadContext]);

  // Collab realtime hop-2: subscribe to the workspace SSE and re-fetch on a
  // pushed `workspace-context-changed`. `connected` drives poll-as-floor below.
  // `loadContext` is the coalesced no-arg reader (it keeps the last-known context
  // on failure rather than clearing), so the SSE re-fetch just calls it.
  const { connected: sseConnected } = useWorkspaceInvalidation(
    { 'workspace-context-changed': () => void loadContext() },
    { onActive: () => void loadContext() },
  );

  useEffect(() => {
    // Poll-as-floor: slow the poll while the SSE is delivering, run it at full
    // cadence when the stream is unavailable so there is no regression.
    const intervalMs = sseConnected ? WORKSPACE_CONTEXT_SSE_FLOOR_MS : WORKSPACE_CONTEXT_POLL_MS;
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') void loadContext();
    }, intervalMs);
    return () => clearInterval(interval);
  }, [loadContext, sseConnected]);

  useEffect(() => {
    const refresh = () => {
      void loadContext();
    };
    // An EXPLICIT refresh means a caller just changed the identity (signed in
    // through onboarding or the rail callout) and is telling us so. Focus and
    // visibility are ambient revalidation and stay silent — only the deliberate
    // signal may blank a stale signed-out answer while the re-read runs (#140).
    const refreshAfterIdentityChange = () => {
      void loadContext({ markLoading: true });
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === WORKSPACE_CONTEXT_REFRESH_STORAGE_KEY) refreshAfterIdentityChange();
    };
    window.addEventListener('focus', refresh);
    window.addEventListener('pageshow', refresh);
    window.addEventListener(WORKSPACE_CONTEXT_REFRESH_EVENT, refreshAfterIdentityChange);
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('pageshow', refresh);
      window.removeEventListener(WORKSPACE_CONTEXT_REFRESH_EVENT, refreshAfterIdentityChange);
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [loadContext]);

  return state;
}

const WORKSPACE_CONTEXT_POLL_MS = 30_000;
// Poll-as-floor cadence while the workspace SSE is connected — a slow safety net
// behind the pushed `workspace-context-changed` events.
const WORKSPACE_CONTEXT_SSE_FLOOR_MS = 120_000;
export const WORKSPACE_CONTEXT_REFRESH_EVENT = 'od:workspace-context-refresh';
const WORKSPACE_CONTEXT_REFRESH_STORAGE_KEY = 'od.workspaceContext.refreshAt';

export function notifyWorkspaceContextRefresh(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(WORKSPACE_CONTEXT_REFRESH_EVENT));
  try {
    window.localStorage.setItem(WORKSPACE_CONTEXT_REFRESH_STORAGE_KEY, String(Date.now()));
  } catch {
    // The in-window event is enough when localStorage is unavailable.
  }
}

function workspaceContextIdentity(context: WorkspaceCollabContext | null): string {
  if (!context) return '';
  return [
    context.workspaceId?.trim() ?? '',
    context.workspaceMemberId?.trim() ?? '',
    context.workspaceType,
  ].join(':');
}

const cachedWorkspaceBillingResponses = new Map<string, WorkspaceBillingResponse>();
const MAX_BROWSER_TIMER_DELAY_MS = 2_147_483_647;

function workspaceBillingRuntimeProjectionIsUsable(
  runtime: WorkspaceBillingRuntimeState,
  now = Date.now(),
): boolean {
  if (runtime.status === 'access-revoked') return false;
  const hardExpiresAt = runtime.hardExpiresAt
    ? Date.parse(runtime.hardExpiresAt)
    : Number.NaN;
  return Number.isFinite(hardExpiresAt) && hardExpiresAt > now;
}

function enforceWorkspaceBillingHardExpiry(
  response: WorkspaceBillingResponse,
  now = Date.now(),
): WorkspaceBillingResponse {
  const runtime = response.workspaceRuntime;
  if (!runtime || workspaceBillingRuntimeProjectionIsUsable(runtime, now)) {
    return response;
  }
  return {
    ...response,
    workspaceBalance: null,
    workspaceSnapshot: null,
  };
}

class WorkspaceBillingHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`billing ${status}: ${code}`);
    this.name = 'WorkspaceBillingHttpError';
  }
}

/** Test seam: clear last-good workspace billing snapshots between tests. */
export function resetWorkspaceBillingCache(): void {
  cachedWorkspaceBillingResponses.clear();
  resetWorkspaceBillingInterestRegistry();
}

type BillingInvalidation = Extract<
  WorkspaceInvalidationSsePayload,
  {
    type:
      | 'billing-changed'
      | 'billing-subscription-changed'
      | 'wallet-balance-changed';
  }
>;

/**
 * Legacy invalidations are broad for compatibility. V2 invalidations fail
 * closed on the URL-selected workspace, and wallet events additionally require
 * the authenticated workspace member carried by the current context.
 */
export function shouldRefreshWorkspaceBilling(
  event: BillingInvalidation,
  context: WorkspaceCollabContext | null,
): boolean {
  if (event.type === 'billing-changed') {
    return !event.workspaceId || event.workspaceId === context?.workspaceId;
  }
  if (!context || event.workspaceId !== context.workspaceId) return false;
  return event.type === 'billing-subscription-changed'
    || event.workspaceMemberId === context.workspaceMemberId;
}

function billingInvalidationToken(event: BillingInvalidation): string {
  // Vela emits the v2 subscription signal and legacy alias with one revision.
  // A shared key collapses those two transport frames into one authoritative
  // read while keeping genuinely different revisions independent.
  return event.revision
    ? `revision:${event.revision}`
    : `${event.type}:${event.at ?? 'unversioned'}`;
}

/**
 * One shared explicit-scope billing read. Account metadata and a backend-proven
 * workspace wallet are independently nullable, so a summary outage cannot
 * erase workspace money. Null means the scoped request itself has not resolved.
 */
export interface WorkspaceBillingScopeInput {
  context: WorkspaceCollabContext | null;
  loading?: boolean;
  /**
   * Identity epoch for a caller whose exact scope can cycle A→B→A. A project
   * scope normally stays pinned and may omit it; ambient navigation uses the
   * provider's global context revision.
   */
  revision?: string | number;
}

export function useWorkspaceBillingResponse(
  explicitScope?: WorkspaceBillingScopeInput,
): WorkspaceBillingResponse | null {
  const ambient = useWorkspaceContext();
  const context = explicitScope ? explicitScope.context : ambient.context;
  const contextLoading = explicitScope
    ? explicitScope.loading === true
    : ambient.loading;
  const workspaceId = context?.workspaceId?.trim() ?? '';
  const workspaceMemberId = context?.workspaceMemberId?.trim() ?? '';
  const billingScopeKey =
    contextLoading
      ? null
      : context?.workspaceType === 'team'
        ? workspaceId && workspaceMemberId
          ? `workspace-billing:workspace:${workspaceId}:member:${workspaceMemberId}`
          : null
        : `workspace-billing:account:${workspaceId || 'anonymous'}:${workspaceMemberId || 'anonymous'}`;
  const billingUrl =
    billingScopeKey && context?.workspaceType !== 'team'
      ? '/api/workspace/billing?scope=account'
      : billingScopeKey
        ? `/api/workspace/billing?scope=workspace&workspaceId=${encodeURIComponent(workspaceId)}`
        : null;
  // The same workspace can be left and selected again while an earlier read is
  // still in flight. The context revision makes A→B→A a new request identity.
  const billingRequestKey = billingScopeKey
    ? `${billingScopeKey}:context-revision:${
        explicitScope?.revision ?? workspaceContextRevision
      }`
    : null;
  const billingInterestScope =
    billingRequestKey && context?.workspaceType === 'team'
      ? { workspaceId, workspaceMemberId }
      : null;
  const [state, setState] = useState<{
    scopeKey: string;
    response: WorkspaceBillingResponse;
  } | null>(null);
  const mountedRef = useRef(true);
  const activeScopeKeyRef = useRef<string | null>(billingScopeKey);
  const activeRequestKeyRef = useRef<string | null>(billingRequestKey);
  const requestEpochRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runtimeManagedRef = useRef(false);
  const interestOwnerIdRef = useRef('');
  if (!interestOwnerIdRef.current) {
    interestOwnerIdRef.current = createWorkspaceBillingInterestOwnerId();
  }
  activeScopeKeyRef.current = billingScopeKey;
  activeRequestKeyRef.current = billingRequestKey;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestEpochRef.current += 1;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!billingInterestScope) return;
    return retainWorkspaceBillingInterest(
      interestOwnerIdRef.current,
      billingInterestScope,
    );
  }, [billingInterestScope?.workspaceId, billingInterestScope?.workspaceMemberId]);

  // `force` mirrors `loadContext`'s `markLoading`/`loadFull`'s `force`: an
  // explicit identity-change refresh (sign-in) must bypass a settled cached
  // answer via `forceCoalescedGet`, or `notifyWorkspaceBillingRefresh()`
  // fires the event but every mounted consumer just replays the pre-sign-in
  // cached summary — no new request, so the surface never actually updates.
  // Ambient triggers (focus/pageshow/visibility) stay on plain `coalescedGet`
  // and tolerate sub-second staleness, same as context/team-projects.
  const loadBilling = useCallback(async (
    clearOnFailure: boolean,
    force = false,
    invalidationToken?: string,
  ) => {
    if (!billingScopeKey || !billingRequestKey || !billingUrl) {
      if (clearOnFailure && mountedRef.current) setState(null);
      return;
    }
    const scopeKey = billingScopeKey;
    const requestKey = billingRequestKey;
    const fetchKey = invalidationToken
      ? `${requestKey}:invalidation:${invalidationToken}`
      : requestKey;
    const requestEpoch = ++requestEpochRef.current;
    try {
      const fetchBilling = async () => {
        if (billingInterestScope) {
          await ensureWorkspaceBillingInterestDeclared();
        }
        const runtimeHeaders =
          billingInterestScope
            ? workspaceBillingInterestHeaders(billingInterestScope)
            : undefined;
        const res = await fetch(billingUrl, {
          cache: 'no-store',
          ...(runtimeHeaders ? { headers: runtimeHeaders } : {}),
        });
        if (!res.ok) {
          let errorCode = `workspace_billing_http_${res.status}`;
          try {
            const errorBody = (await res.json()) as { error?: unknown };
            if (typeof errorBody.error === 'string' && errorBody.error.trim()) {
              errorCode = errorBody.error.trim();
            }
          } catch {
            // The status remains authoritative when an older daemon returns
            // a non-JSON error page.
          }
          throw new WorkspaceBillingHttpError(res.status, errorCode);
        }
        const body = (await res.json()) as WorkspaceBillingResponse;
        return enforceWorkspaceBillingHardExpiry({
          summary: body.summary ?? null,
          workspaceBalance: body.workspaceBalance ?? null,
          workspaceSnapshot: body.workspaceSnapshot ?? null,
          ...(body.workspaceRuntime
            ? { workspaceRuntime: body.workspaceRuntime }
            : {}),
        });
      };
      const response = force
        ? await forceCoalescedGet(fetchKey, fetchBilling)
        : await coalescedGet(fetchKey, fetchBilling);
      if (
        mountedRef.current &&
        requestEpochRef.current === requestEpoch &&
        activeScopeKeyRef.current === scopeKey &&
        activeRequestKeyRef.current === requestKey
      ) {
        runtimeManagedRef.current = Boolean(response.workspaceRuntime);
        if (retryTimerRef.current) {
          clearTimeout(retryTimerRef.current);
          retryTimerRef.current = null;
        }
        cachedWorkspaceBillingResponses.set(scopeKey, response);
        setState({ scopeKey, response });
      }
    } catch (error) {
      if (
        mountedRef.current &&
        requestEpochRef.current === requestEpoch &&
        activeScopeKeyRef.current === scopeKey &&
        activeRequestKeyRef.current === requestKey
      ) {
        const lastGood = cachedWorkspaceBillingResponses.get(scopeKey);
        const revoked =
          error instanceof WorkspaceBillingHttpError &&
          error.status === 403;
        if (revoked) {
          cachedWorkspaceBillingResponses.delete(scopeKey);
          runtimeManagedRef.current = false;
          setState(null);
        } else if (lastGood) {
          runtimeManagedRef.current = Boolean(lastGood.workspaceRuntime);
          setState({ scopeKey, response: lastGood });
        } else if (clearOnFailure) {
          runtimeManagedRef.current = false;
          setState({
            scopeKey,
            response: {
              summary: null,
              workspaceBalance: null,
              workspaceSnapshot: null,
            },
          });
        }
        if (!revoked && !retryTimerRef.current) {
          retryTimerRef.current = setTimeout(() => {
            retryTimerRef.current = null;
            if (
              mountedRef.current &&
              activeScopeKeyRef.current === scopeKey &&
              activeRequestKeyRef.current === requestKey
            ) {
              window.dispatchEvent(new CustomEvent(WORKSPACE_BILLING_RETRY_EVENT, {
                detail: { requestKey },
              }));
            }
          }, WORKSPACE_BILLING_RETRY_MS);
        }
      }
    }
  }, [
    billingInterestScope?.workspaceId,
    billingInterestScope?.workspaceMemberId,
    billingRequestKey,
    billingScopeKey,
    billingUrl,
  ]);

  useEffect(() => {
    void loadBilling(true, true);
  }, [loadBilling]);

  useEffect(() => {
    if (
      !billingScopeKey ||
      !billingRequestKey ||
      state?.scopeKey !== billingScopeKey
    ) {
      return;
    }
    const runtime = state.response.workspaceRuntime;
    const hardExpiresAt = runtime?.hardExpiresAt
      ? Date.parse(runtime.hardExpiresAt)
      : Number.NaN;
    if (!runtime || !Number.isFinite(hardExpiresAt)) return;
    const delay = hardExpiresAt - Date.now();
    if (delay <= 0) return;
    const expectedRevision = runtime.revision;
    const expectedHardExpiresAt = runtime.hardExpiresAt;
    const scopeKey = billingScopeKey;
    const requestKey = billingRequestKey;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const expireWhenDue = () => {
      const remaining = hardExpiresAt - Date.now();
      if (remaining > 0) {
        timer = setTimeout(
          expireWhenDue,
          Math.min(remaining + 1, MAX_BROWSER_TIMER_DELAY_MS),
        );
        return;
      }
      if (
        !mountedRef.current ||
        activeScopeKeyRef.current !== scopeKey ||
        activeRequestKeyRef.current !== requestKey
      ) {
        return;
      }
      const current = cachedWorkspaceBillingResponses.get(scopeKey);
      if (
        !current?.workspaceRuntime ||
        current.workspaceRuntime.revision !== expectedRevision ||
        current.workspaceRuntime.hardExpiresAt !== expectedHardExpiresAt
      ) {
        return;
      }
      const expired = enforceWorkspaceBillingHardExpiry(current);
      cachedWorkspaceBillingResponses.set(scopeKey, expired);
      setState({ scopeKey, response: expired });
      window.dispatchEvent(new CustomEvent(WORKSPACE_BILLING_RETRY_EVENT, {
        detail: { requestKey },
      }));
    };
    timer = setTimeout(
      expireWhenDue,
      Math.min(delay + 1, MAX_BROWSER_TIMER_DELAY_MS),
    );
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [
    billingRequestKey,
    billingScopeKey,
    state?.scopeKey,
    state?.response.workspaceRuntime?.hardExpiresAt,
    state?.response.workspaceRuntime?.revision,
  ]);

  // Thin invalidations never carry authoritative money/plan data. Legacy
  // events stay broad; v2 events are rejected unless their explicit workspace
  // and member scopes match the currently selected context.
  useWorkspaceInvalidation({
    'billing-changed': (event) => {
      if (shouldRefreshWorkspaceBilling(event, context)) {
        void loadBilling(false, true, billingInvalidationToken(event));
      }
    },
    'billing-subscription-changed': (event) => {
      if (shouldRefreshWorkspaceBilling(event, context)) {
        void loadBilling(false, true, billingInvalidationToken(event));
      }
    },
    'wallet-balance-changed': (event) => {
      if (shouldRefreshWorkspaceBilling(event, context)) {
        void loadBilling(false, true, billingInvalidationToken(event));
      }
    },
  }, { onActive: () => void loadBilling(false, true) });

  useEffect(() => {
    const interval = setInterval(() => {
      // New daemons own the 30s safety floor and bounded retries. Keep the old
      // browser poll only as an additive compatibility path for old daemons
      // whose response has no runtime metadata.
      if (!runtimeManagedRef.current && document.visibilityState === 'visible') {
        void loadBilling(false);
      }
    }, WORKSPACE_BILLING_POLL_MS);
    return () => clearInterval(interval);
  }, [loadBilling]);

  useEffect(() => {
    const refresh = () => {
      void loadBilling(true);
    };
    // Same distinction as useWorkspaceContext's refresh vs
    // refreshAfterIdentityChange: WORKSPACE_BILLING_REFRESH_EVENT (and its
    // cross-tab storage twin) is the deliberate "identity just changed"
    // signal notifyWorkspaceBillingRefresh() fires — it must force past a
    // settled cache entry. Focus/pageshow/visibility are ambient revalidation
    // and stay on the plain cache-tolerant path.
    const refreshAfterIdentityChange = () => {
      void loadBilling(true, true);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === WORKSPACE_BILLING_REFRESH_STORAGE_KEY) refreshAfterIdentityChange();
    };
    const onRetry = (event: Event) => {
      const requestKey = (event as CustomEvent<{ requestKey?: string }>).detail?.requestKey;
      if (requestKey === activeRequestKeyRef.current) void loadBilling(false, true);
    };
    window.addEventListener('focus', refresh);
    window.addEventListener('pageshow', refresh);
    window.addEventListener(WORKSPACE_BILLING_REFRESH_EVENT, refreshAfterIdentityChange);
    window.addEventListener(WORKSPACE_BILLING_RETRY_EVENT, onRetry);
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('pageshow', refresh);
      window.removeEventListener(WORKSPACE_BILLING_REFRESH_EVENT, refreshAfterIdentityChange);
      window.removeEventListener(WORKSPACE_BILLING_RETRY_EVENT, onRetry);
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [loadBilling]);

  if (!billingScopeKey) return null;
  if (state?.scopeKey === billingScopeKey) return state.response;
  return cachedWorkspaceBillingResponses.get(billingScopeKey) ?? null;
}

/**
 * Return the billing summary PROJECTED onto the workspace `context` names.
 *
 * `WorkspaceBillingSummary` is an ACCOUNT read: the contract pins its
 * `workspaceId` to null, and the daemon answers every `?workspaceId=` with the
 * same unscoped `vela billing summary`. Its `membershipTier` therefore says
 * what the ACCOUNT subscribes to, never what THIS workspace subscribes to — an
 * account holding a personal Plus reports `plus` while the user stands in a
 * brand-new, unpaid team workspace. Handing that field to a workspace surface
 * produces a nameplate that cannot change when the workspace changes, because
 * it was never about the workspace: the 专业版 Plus badge on a 免费 workspace,
 * beside a wallet figure that was correct precisely because money already
 * routes through `workspaceBillingBalanceUsd`.
 *
 * Plan and money are partitioned on the same key — `workspaceId` +
 * `workspaceMemberId`:
 *
 *  • personal workspace — the account IS the scope, so the summary passes
 *    through untouched. (A team-namespaced tier is deliberately kept here:
 *    `hasTeamPlan` offers the team surfaces to a personal workspace that holds
 *    a team plan.)
 *  • team workspace — the plan comes from the context-authorized snapshot.
 *    Without one, the account tier may stand in ONLY when it is itself
 *    team-namespaced (`isTeamPlanTier`), because a personal tier
 *    (`free`/`plus`/`pro`/`max`) describes the account's own subscription and
 *    cannot name a team workspace's plan. Anything else becomes `''` — the
 *    contract's "this source does not know" — so `resolvePlanTier` falls
 *    through to the workspace-scoped `context.planId` / `context.billingState`
 *    instead of answering a workspace question with an account tier.
 *
 * That fallback is load-bearing, not laxness: `workspaceSnapshot` is an
 * additive capability, and B omits `planId`/`billingState` from a non-owner's
 * context, so for a paying MEMBER on an older daemon/CLI a team-namespaced
 * account tier is the only surviving evidence that their team is paid. Dropping
 * it flashed the free-tier upsell at Team Plus members (飞书 P0, covered by
 * `tests/components/App.amr-plan-tier.test.tsx`).
 *
 * Money fields are left alone: they are already documented as account metadata
 * and every workspace surface reads them through `workspaceBillingBalanceUsd`.
 */
export function workspaceBillingSummaryForContext(
  response: WorkspaceBillingResponse | null | undefined,
  context: WorkspaceCollabContext | null | undefined,
): WorkspaceBillingSummary | null {
  if (!response || !context) return null;
  const summary = response.summary;
  if (context.workspaceType !== 'team') return summary ?? null;
  const snapshot = workspaceBillingSnapshotForContext(response, context);
  const snapshotTier =
    snapshot?.billing.planId?.trim()
    || (snapshot?.billing.billingState === 'free' ? 'free' : '');
  const accountTier = summary?.membershipTier?.trim() ?? '';
  const teamNamespacedAccountTier = isTeamPlanTier(accountTier) ? accountTier : '';
  const scopedTier = snapshotTier || teamNamespacedAccountTier;
  if (summary) {
    return {
      ...summary,
      membershipTier: scopedTier,
      subscriptionStatus: snapshotTier
        ? snapshot?.billing.billingState ?? ''
        : scopedTier
          ? summary.subscriptionStatus
          : '',
    };
  }
  // Account metadata is independently nullable from workspace state, so a
  // proven workspace plan must survive an account-summary outage.
  if (!snapshot) return null;
  return {
    workspaceId: null,
    membershipTier: snapshotTier,
    totalAvailableCredits: 0,
    subscriptionCredits: 0,
    rechargeCredits: 0,
    balanceUsd: snapshot.wallet.balanceUsd,
    subscriptionStatus: snapshot.billing.billingState ?? '',
    availableActions: [],
    workspaceBalance: {
      workspaceId: snapshot.workspaceId,
      workspaceMemberId: snapshot.workspaceMemberId,
      balanceUsd: snapshot.wallet.balanceUsd,
      billingScopeVersion: 2,
      expiresAt: snapshot.wallet.expiresAt,
      updatedAt: snapshot.wallet.updatedAt,
    },
  };
}

/**
 * The ambient-navigation view used by plan/upgrade surfaces: the billing
 * summary projected onto the workspace the shell is currently in. See
 * `workspaceBillingSummaryForContext` for the partition rule.
 */
export function useWorkspaceBilling(): WorkspaceBillingSummary | null {
  const { context } = useWorkspaceContext();
  const response = useWorkspaceBillingResponse();
  return workspaceBillingSummaryForContext(response, context);
}

/**
 * Return the money that belongs to the currently selected workspace.
 *
 * Team money is valid only when Vela's v2 response proves both the requested
 * workspace and the acting member. It must never fall back to account money:
 * one local daemon may serve multiple windows whose URL-selected workspaces
 * differ. Personal workspaces keep the account-scoped summary by definition.
 */
export function workspaceBillingBalanceUsd(
  response: WorkspaceBillingResponse | null | undefined,
  context: WorkspaceCollabContext | null | undefined,
): string | null {
  if (!response || !context) return null;
  const runtime = response.workspaceRuntime;
  if (
    runtime &&
    (
      runtime.workspaceId !== context.workspaceId ||
      runtime.workspaceMemberId !== context.workspaceMemberId ||
      !workspaceBillingRuntimeProjectionIsUsable(runtime)
    )
  ) {
    return null;
  }
  if (context.workspaceType !== 'team') {
    const accountBalance = response.summary?.balanceUsd?.trim();
    return accountBalance || null;
  }
  const workspaceBalance = response.workspaceBalance;
  if (
    !workspaceBalance ||
    workspaceBalance.billingScopeVersion !== 2 ||
    workspaceBalance.workspaceId !== context.workspaceId ||
    workspaceBalance.workspaceMemberId !== context.workspaceMemberId
  ) {
    return null;
  }
  const balance = workspaceBalance.balanceUsd.trim();
  return balance || null;
}

/**
 * Return the exact workspace/member snapshot authorized for this context.
 * Account summaries and a snapshot for another membership epoch are never
 * accepted as workspace plan authority.
 */
export function workspaceBillingSnapshotForContext(
  response: WorkspaceBillingResponse | null | undefined,
  context: WorkspaceCollabContext | null | undefined,
): WorkspaceBillingSnapshot | null {
  if (!response || !context || context.workspaceType !== 'team') return null;
  const snapshot = response.workspaceSnapshot;
  if (
    !snapshot ||
    snapshot.billingScopeVersion !== 2 ||
    snapshot.workspaceId !== context.workspaceId ||
    snapshot.workspaceMemberId !== context.workspaceMemberId
  ) {
    return null;
  }
  const runtime = response.workspaceRuntime;
  if (
    runtime &&
    (
      runtime.workspaceId !== context.workspaceId ||
      runtime.workspaceMemberId !== context.workspaceMemberId ||
      !workspaceBillingRuntimeProjectionIsUsable(runtime)
    )
  ) {
    return null;
  }
  return snapshot;
}

const WORKSPACE_BILLING_POLL_MS = 30_000;
const WORKSPACE_BILLING_RETRY_MS = 5_000;
const WORKSPACE_BILLING_RETRY_EVENT = 'od:workspace-billing-retry';
export const WORKSPACE_BILLING_REFRESH_EVENT = 'od:workspace-billing-refresh';
const WORKSPACE_BILLING_REFRESH_STORAGE_KEY = 'od.workspaceBilling.refreshAt';

export function notifyWorkspaceBillingRefresh(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(WORKSPACE_BILLING_REFRESH_EVENT));
  try {
    window.localStorage.setItem(WORKSPACE_BILLING_REFRESH_STORAGE_KEY, String(Date.now()));
  } catch {
    // The in-window event is enough when localStorage is unavailable.
  }
}

export interface TeamProjectsState {
  projects: TeamProject[];
  loading: boolean;
  /** Re-fetch the team-shared project list (e.g. after a member pulls one). */
  reload: () => void;
}

/**
 * Team-wide shared-project discovery for the "全部项目" view
 * (`GET /api/workspace/projects/team`, resource-hub data behind the daemon).
 * A member's own `/api/projects` list is only their LOCAL projects; the projects
 * the owner shared to the team live on the hub until pulled, and this read
 * surfaces them so a member can discover + open them. Empty off-team or when the
 * hub is not configured — the daemon degrades to `{ projects: [] }` there.
 */
// Poll cadence for the team-shared list. Match the foreground collab cadence so
// a teammate sees a newly shared project within a few seconds, while focus and
// visibility changes still refresh immediately.
const TEAM_PROJECTS_POLL_MS = 15_000;
// Poll-as-floor cadence while the workspace SSE is connected.
const TEAM_PROJECTS_SSE_FLOOR_MS = 60_000;
export const TEAM_PROJECTS_CHANGED_EVENT = 'od:team-projects-changed';
const TEAM_PROJECTS_CHANGED_STORAGE_KEY = 'od.teamProjects.changedAt';

export function notifyTeamProjectsChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(TEAM_PROJECTS_CHANGED_EVENT));
  try {
    window.localStorage.setItem(TEAM_PROJECTS_CHANGED_STORAGE_KEY, String(Date.now()));
  } catch {
    // localStorage can be unavailable in restricted contexts; the in-window event
    // already refreshed the current client.
  }
}

export function useTeamProjects(): TeamProjectsState {
  const [projects, setProjects] = useState<TeamProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Fetch the full list. Shared by the initial load, manual reload(), and the
  // poll. Never flips `loading` (only the initial/reload effect does) so a
  // background refresh has no spinner. `force` bypasses a settled/in-flight
  // cache entry for a genuine identity/workspace change (see
  // `onTeamProjectsChanged` below) via `forceCoalescedGet`, which also
  // collapses the case where every mounted `useTeamProjects()` instance reacts
  // to that same change in one synchronous burst into a single fetch.
  const loadFull = useCallback(async (force = false) => {
    try {
      // `fetchTeamProjectsCatalog` owns the endpoint, the coalescing key, and
      // the array guarantee — see team-projects-catalog.ts for why those three
      // must not be split across call sites again.
      const projects = await fetchTeamProjectsCatalog({ force });
      cachedTeamProjects = projects;
      if (mountedRef.current) {
        setProjects(projects);
        setLoading(false);
      }
    } catch {
      // Personal / offline / daemon without the hub: no team-shared projects.
      if (mountedRef.current) {
        setProjects([]);
        setLoading(false);
      }
    }
  }, []);

  // Initial load + manual reload (nonce bump).
  useEffect(() => {
    setLoading(true);
    void loadFull();
  }, [nonce, loadFull]);

  // Collab realtime hop-2: subscribe to the workspace SSE and re-fetch on a
  // pushed `team-projects-changed` (a teammate shared/unshared a project). The
  // daemon's workspace-invalidation poller diffs the team list and pushes only
  // on an actual change. `connected` drives poll-as-floor below.
  const { connected: sseConnected } = useWorkspaceInvalidation(
    { 'team-projects-changed': () => void loadFull() },
    { onActive: () => void loadFull() },
  );

  // Lightweight polling so teammates see each other's shares without refreshing.
  // A daemon-local read is cheap enough to just refetch; offline errors keep the
  // last snapshot until the next tick. Poll-as-floor: slow the poll while the SSE
  // is delivering, run it at full cadence when the stream is unavailable so a
  // client whose SSE never connects has zero regression.
  useEffect(() => {
    const intervalMs = sseConnected ? TEAM_PROJECTS_SSE_FLOOR_MS : TEAM_PROJECTS_POLL_MS;
    const interval = setInterval(() => {
      // Only poll while the tab is actually visible — an idle/backgrounded tab
      // was refetching the whole team list (and cascading cover fetches) every
      // few seconds for nothing. Focus/visibility/changed-event handlers below
      // still refresh immediately, so a teammate's share shows up right away.
      if (document.visibilityState === 'visible') void loadFull();
    }, intervalMs);
    return () => clearInterval(interval);
  }, [loadFull, sseConnected]);

  // Demo and real team usage often switch between two browser windows after a
  // teammate shares a project. Refresh immediately on focus/visibility instead
  // of making the member wait for the next poll tick.
  useEffect(() => {
    const onFocus = () => {
      void loadFull();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void loadFull();
    };
    const onTeamProjectsChanged = () => {
      // A workspace switch fires this same event (see `switchWorkspace` in
      // EntryNavRail.tsx). Without forcing, an in-flight coalesced read
      // started just before the switch can resolve inside the new call's
      // coalescing window and hand back the PREVIOUS workspace's team list.
      void loadFull(true);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === TEAM_PROJECTS_CHANGED_STORAGE_KEY) void loadFull();
    };
    window.addEventListener('focus', onFocus);
    window.addEventListener(TEAM_PROJECTS_CHANGED_EVENT, onTeamProjectsChanged);
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener(TEAM_PROJECTS_CHANGED_EVENT, onTeamProjectsChanged);
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [loadFull]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { projects, loading, reload };
}
