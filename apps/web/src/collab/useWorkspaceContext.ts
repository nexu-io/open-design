import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  TeamProject,
  WorkspaceBillingResponse,
  WorkspaceBillingRuntimeState,
  WorkspaceBillingSnapshot,
  WorkspaceBillingSummary,
  WorkspaceCollabContext,
  WorkspaceContextResponse,
  WorkspaceDirectoryItem,
  WorkspaceDirectoryResponse,
  WorkspaceInvalidationSsePayload,
} from '@open-design/contracts';
import {
  buildWorkspacePermissions,
  buildWorkspaceSeatSummary,
} from '@open-design/contracts';
import { coalescedGet, forceCoalescedGet } from '../lib/coalesced-get';
import {
  markProjectDisplaySnapshotsDirty,
  patchProjectDisplaySnapshots,
} from '../state/project-display-cache';
import { isTeamPlanTier } from './team-plan';
import {
  beginTeamProjectCatalogRefresh,
  beginTeamProjectMetadataRefresh,
  fetchTeamProjectCatalogEntry,
  fetchTeamProjectsCatalog,
  resetTeamProjectMetadataRefreshOrdering,
} from './team-projects-catalog';
import { useWorkspaceInvalidation } from './workspace-events';
import {
  beginWorkspaceScopedRead,
  workspaceIdentityCacheKey,
  type WorkspaceResourceReadIdentity,
} from './workspace-identity';
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
  /** Monotonic browser boundary for sign-in/sign-out account changes. */
  accountGeneration?: number;
  /**
   * Exact directory-backed identity that read-only Workspace catalogs may use
   * while the richer `/api/workspace/context` projection is still loading.
   *
   * This is deliberately separate from `context`: writes, runs, comments and
   * project mutations must continue to wait for the fully verified context.
   * The provisional value is only published when this tab's session selection
   * has an exact active row in the current account directory.
   */
  resourceReadIdentity?: WorkspaceResourceReadIdentity | null;
  loading: boolean;
  /**
   * A deliberate identity change was announced, but its replacement context has
   * not resolved yet. Consumers of workspace-owned data must hide the previous
   * identity's snapshot during this window even though `context` intentionally
   * stays available to avoid flashing the whole shell signed out.
   */
  identityChangePending?: boolean;
  /**
   * `unsupported` is an old daemon with no workspace endpoint and retains the
   * legal pre-workspace/headerless behavior. `unavailable` means a modern
   * workspace answer is unknown; write paths must fail closed instead of
   * treating that outage as an anonymous identity.
   */
  failure?: 'unsupported' | 'unavailable';
}

/**
 * Exact identity for read-only Workspace resources.
 *
 * Production providers always publish `resourceReadIdentity`; when it is
 * present, its null value is meaningful and must fail closed instead of
 * falling back to a stale richer context during a Workspace switch. The
 * `undefined` compatibility lane is only for older test/provider doubles.
 */
export function workspaceResourceReadContext(
  state: WorkspaceContextState,
): WorkspaceCollabContext | null {
  if (state.resourceReadIdentity !== undefined) {
    return state.resourceReadIdentity?.context ?? null;
  }
  return state.context;
}

/**
 * Whether an Open Design Cloud (AMR) run has a cloud identity that could pay
 * for it.
 *
 * AMR bills the caller's OWN wallet — their current workspace. The only state
 * in which it genuinely cannot run is "there is no cloud identity at all": a
 * settled, authoritative read that came back with no workspace. Every other
 * state is the user spending their own quota, and whether they may is the
 * server's call — the daemon's `WORKSPACE_CONTEXT_REQUIRED` 401 and vela's
 * own billing check are the enforcement points. A client-side veto on a
 * weaker signal cannot add safety; it can only turn a request the server
 * would have answered into a dead, unexplained button.
 *
 * Deliberately NOT treated as "cannot be billed":
 *
 * - `loading` — the read holds no answer yet. Reporting "signed out" on a
 *   frame that has not heard back is the bug shape this replaces.
 * - `failure: 'unavailable'` — a transient outage. Offline, a 504, and a
 *   timeout all collapse into one `ok: false` upstream, so nothing was
 *   learned about the user's identity.
 * - `failure: 'unsupported'` — an old daemon with no workspace endpoint,
 *   which keeps its legal pre-workspace behavior.
 *
 * Note this asks about the CALLER's identity, not about the project. A
 * project whose own workspace scope is `unbound` or `unavailable` says
 * nothing about whether the signed-in user has a wallet.
 */
export function workspaceIdentityCanBillAmr(state: WorkspaceContextState): boolean {
  if (state.context !== null) return true;
  if (state.loading) return true;
  if (state.failure) return true;
  return false;
}

/**
 * The identity a per-caller read cache must be keyed on.
 *
 * `coalescedGet` / `sharedCancellableGet` are CACHES (1s share window) as well as
 * single-flight dedupers, so any read whose answer depends on WHO is asking must
 * put that identity in its key or the previous identity's answer is served to the
 * next one.
 *
 * This is `listWorkspaceProjectSummaries`' key tuple — workspace, member, role,
 * member status, lifecycle — plus workspace type and the two permission bits, so
 * it digests EXACTLY the eight fields `workspaceProjectHeaders` puts on the wire.
 * A key coarser than the request it caches is the bug this helper exists to
 * prevent; a key that changes for a field the request does not carry would only
 * cost a redundant fetch.
 *
 * Deliberately excludes the money/plan fields (`planId`, `billingState`,
 * `seatSummary`, ...): they ride along in the context response but no request is
 * scoped by them, so keying on them would re-fetch every read on a balance
 * change. Reads that DO depend on money key themselves (see
 * `useWorkspaceBillingResponse`'s `billingRequestKey`).
 *
 * Returns `'none'` for a caller with no resolved workspace identity, which is a
 * distinct cache partition from any real one, not a wildcard that matches them.
 */
export { workspaceIdentityCacheKey } from './workspace-identity';

/**
 * One workspace-scoped read: the identity it was issued for, plus the check that
 * must pass before its response may be committed.
 *
 * Keying a request (or its `coalescedGet` entry) by identity stops the WRONG
 * IDENTITY BEING SERVED an answer fetched for someone else. It does nothing
 * about the other direction: a read issued for identity A resolves later, and by
 * then the caller may be identity B. Committing that late answer restores A's
 * data under B — the exact staleness the identity keys exist to prevent,
 * arriving through the back door. Reverse-order completion is not exotic here;
 * a workspace switch is precisely when one read is in flight and another starts.
 *
 * So every workspace-scoped read follows the same four steps:
 *
 *   const read = beginWorkspaceScopedRead(contextRef.current);
 *   const data = await fetchSomething(read.context);
 *   if (!read.isStillCurrent(contextRef.current)) return;   // ← the invariant
 *   commit(data);
 *
 * Two rules make it actually hold:
 *
 *  1. Request with `read.context`, never with the caller's own variable, so the
 *     request and the guard can never disagree about whose data was asked for.
 *  2. Compare against a REF, never a closed-over prop or state value. A closure
 *     captures the identity the read was issued for, so comparing against it
 *     always succeeds and guards nothing.
 *
 * This is the cross-component form of the `requestEpochRef` ordering guard
 * `useWorkspaceContext` already applies to its own read; identity is the right
 * discriminator for reads that are scoped BY identity.
 */
export { beginWorkspaceScopedRead } from './workspace-identity';
export type { WorkspaceScopedRead } from './workspace-identity';

/**
 * `GET /api/workspace/context` is the read that ESTABLISHES the caller's
 * identity, so — unlike every other workspace read — it cannot be keyed on the
 * identity it is fetching, and it takes no workspace argument the key could
 * borrow instead (the switch is a separate `PUT /api/workspace/active`).
 *
 * What it CAN be keyed on is which identity generation the caller is asking
 * about. This token names that generation: it advances once per deliberate
 * identity change (a workspace switch or a sign-in) and never on ambient
 * revalidation, so:
 *
 *  - Every mounted consumer reacting to ONE broadcast computes the same token
 *    and shares one request — the thundering herd `forceCoalescedGet` exists to
 *    prevent stays prevented.
 *  - Two switches inside that 250ms burst window are two generations, so the
 *    second is no longer mistaken for a second consumer of the first and served
 *    the answer fetched for the workspace the user already left.
 *
 * Cross-tab, the token is the shared `localStorage` stamp the acting tab wrote,
 * so every listening consumer in a passive tab advances to the SAME value and
 * still collapses to one request.
 */
let workspaceContextRequestToken = 'initial';
let localIdentityChangeSeq = 0;

function advanceWorkspaceContextRequestToken(sharedToken?: string | null): void {
  const next = sharedToken?.trim() || `local:${++localIdentityChangeSeq}`;
  if (next === workspaceContextRequestToken) return;
  workspaceContextRequestToken = next;
  // Any seed belonged to the generation just retired; a later generation must
  // never adopt it (see `seededWorkspaceContext`).
  seededWorkspaceContext = null;
}

/** Coalescing key for `GET /api/workspace/context`: this read alone, partitioned
 *  by the identity generation above. */
function workspaceContextCoalesceKey(): string {
  return `workspace-context:${workspaceContextRequestToken}`;
}

async function fetchWorkspaceDirectory(): Promise<WorkspaceDirectoryResponse> {
  const response = await fetch('/api/workspace/directory', { cache: 'no-store' });
  if (!response.ok) {
    const error = new Error(`workspace-directory ${response.status}`) as Error & {
      status?: number;
    };
    error.status = response.status;
    throw error;
  }
  return (await response.json()) as WorkspaceDirectoryResponse;
}

/**
 * Read the signed-in account's Workspace directory for the current identity
 * generation.
 *
 * The shell context bootstrap and a fresh project deep link both need this
 * same answer. Keeping the read behind one generation-keyed single flight lets
 * a project derive its persisted Workspace/member authority as soon as the
 * directory lands, without waiting for the slower ambient
 * `/api/workspace/context` projection and without issuing a second directory
 * request.
 */
export function readWorkspaceDirectoryForCurrentGeneration(
  options: { fresh?: boolean } = {},
): Promise<WorkspaceDirectoryResponse> {
  const key = `workspace-directory-selection:${workspaceContextRequestToken}`;
  return options.fresh
    ? forceCoalescedGet(key, fetchWorkspaceDirectory)
    : coalescedGet(key, fetchWorkspaceDirectory);
}

function billingStateFromLifecycle(
  lifecycleState: WorkspaceDirectoryItem['lifecycleState'],
): WorkspaceCollabContext['billingState'] {
  switch (lifecycleState) {
    case 'active':
      return 'active';
    case 'billing_past_due':
      return 'past_due';
    case 'locked':
      return 'locked';
    default:
      return 'inactive';
  }
}

/**
 * Build the exact request identity carried by a Workspace directory item.
 *
 * Directory items deliberately omit billing detail, but they contain every
 * authority field used by project resource headers. The permission projection
 * is the shared contract projection used by the daemon, so its identity key is
 * identical to the context that `/workspace-scope` later returns.
 */
export function workspaceContextFromDirectoryItem(
  item: WorkspaceDirectoryItem,
): WorkspaceCollabContext {
  const context: WorkspaceCollabContext = {
    workspaceId: item.workspaceId,
    workspaceType: item.workspaceType,
    workspaceMemberId: item.workspaceMemberId,
    role: item.role,
    memberStatus: item.memberStatus,
    lifecycleState: item.lifecycleState,
    billingState: billingStateFromLifecycle(item.lifecycleState),
    planId: null,
    providerMode: 'platform_credits',
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 0, usedSeats: 0 }),
    permissions: buildWorkspacePermissions({
      role: item.role,
      lifecycleState: item.lifecycleState,
      memberStatus: item.memberStatus,
    }),
    workspaceName: item.workspaceName,
  };
  if (item.workspaceType === 'team') {
    context.teamId = item.workspaceId;
    context.teamName = item.workspaceName;
  }
  return context;
}

/**
 * Resolve one persisted project Workspace from the account directory. This
 * never reads or mutates the shell's current/default Workspace.
 */
export async function resolveBoundProjectWorkspaceContext(
  workspaceId: string,
  options: { fresh?: boolean } = {},
): Promise<WorkspaceCollabContext | null> {
  const requestedWorkspaceId = workspaceId.trim();
  if (!requestedWorkspaceId) return null;
  const directory = await readWorkspaceDirectoryForCurrentGeneration(options);
  const item = (directory.items ?? []).find(
    (candidate) =>
      candidate.workspaceId === requestedWorkspaceId
      && candidate.workspaceMemberId.trim().length > 0
      && candidate.memberStatus === 'active'
      && candidate.lifecycleState !== 'deleted',
  );
  return item ? workspaceContextFromDirectoryItem(item) : null;
}

export interface CurrentWorkspaceContextReadWitness {
  context: WorkspaceCollabContext | null;
  isStillCurrent: () => boolean;
}

/**
 * Resolve the Workspace selected by this browser tab from the account
 * directory, without waiting for the shell's richer `/workspace/context`
 * projection to commit to React state.
 *
 * This is an authorization witness, not a display cache: the directory read
 * verifies the exact Workspace/member pair and the returned lifetime closes
 * over both the account/context generation and the tab-local selection. A
 * concurrent sign-in or Workspace switch therefore invalidates an in-flight
 * project action before it may commit.
 */
export async function resolveCurrentWorkspaceContextReadWitness(
  options: { fresh?: boolean } = {},
): Promise<CurrentWorkspaceContextReadWitness> {
  const requestToken = workspaceContextRequestToken;
  const accountGeneration = currentWorkspaceAccountGeneration();
  const directory = await readWorkspaceDirectoryForCurrentGeneration(options);
  const selected = chooseWorkspaceForTab(directory.items ?? []);
  const context = selected ? workspaceContextFromDirectoryItem(selected) : null;
  const selectedWorkspaceId = context?.workspaceId ?? null;
  const selectedWorkspaceMemberId = context?.workspaceMemberId ?? null;
  return {
    context,
    isStillCurrent: () => {
      if (
        workspaceContextRequestToken !== requestToken
        || currentWorkspaceAccountGeneration() !== accountGeneration
      ) return false;
      const currentSelection = readWorkspaceSelection();
      return context
        ? currentSelection?.workspaceId === selectedWorkspaceId
          && currentSelection.workspaceMemberId === selectedWorkspaceMemberId
        : currentSelection === null;
    },
  };
}

// Last successfully-resolved workspace context, kept at module scope so it
// survives a component unmount/remount. Returning to the home view remounts the
// nav shell, and starting each remount from `null` flashed the signed-out state
// for the full duration of the (vela-backed, seconds-long) context read before
// snapping to the real workspace. Seeding the remount from this cache shows the
// last-known signed-in state instantly while the background read revalidates.
let cachedWorkspaceContext: WorkspaceContextState['context'] = null;
let cachedWorkspaceContextGeneration = 'initial';
let workspaceContextRevision = 0;
let workspaceContextIdentityChangePending = false;
const WORKSPACE_SELECTION_SESSION_KEY = 'od.workspaceSelection.v1';

interface WorkspaceSelection {
  workspaceId: string;
  workspaceMemberId: string;
}

function readWorkspaceSelection(): WorkspaceSelection | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = JSON.parse(window.sessionStorage.getItem(WORKSPACE_SELECTION_SESSION_KEY) ?? 'null') as {
      workspaceId?: unknown;
      workspaceMemberId?: unknown;
    } | null;
    const workspaceId =
      typeof raw?.workspaceId === 'string' ? raw.workspaceId.trim() : '';
    const workspaceMemberId =
      typeof raw?.workspaceMemberId === 'string' ? raw.workspaceMemberId.trim() : '';
    return workspaceId && workspaceMemberId
      ? { workspaceId, workspaceMemberId }
      : null;
  } catch {
    return null;
  }
}

function writeWorkspaceSelection(selection: WorkspaceSelection | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (selection) {
      window.sessionStorage.setItem(WORKSPACE_SELECTION_SESSION_KEY, JSON.stringify(selection));
    } else {
      window.sessionStorage.removeItem(WORKSPACE_SELECTION_SESSION_KEY);
    }
  } catch {
    // A tab with unavailable sessionStorage still remains isolated in memory.
  }
}

function selectableWorkspaceItems(items: WorkspaceDirectoryItem[]): WorkspaceDirectoryItem[] {
  return items.filter(
    (item) => item.memberStatus === 'active' && item.lifecycleState !== 'deleted',
  );
}

function chooseWorkspaceForTab(items: WorkspaceDirectoryItem[]): WorkspaceDirectoryItem | null {
  const visible = selectableWorkspaceItems(items);
  const selected = readWorkspaceSelection();
  const exact = selected
    ? visible.find(
        (item) =>
          item.workspaceId === selected.workspaceId
          && item.workspaceMemberId === selected.workspaceMemberId,
      )
    : undefined;
  const chosen =
    exact
    ?? visible.find((item) => item.workspaceType === 'personal')
    ?? visible[0]
    ?? null;
  writeWorkspaceSelection(
    chosen
      ? {
          workspaceId: chosen.workspaceId,
          workspaceMemberId: chosen.workspaceMemberId,
        }
      : null,
  );
  return chosen;
}

function explicitWorkspaceHeaders(selection: WorkspaceSelection): Record<string, string> {
  return {
    'x-od-workspace-id': selection.workspaceId,
    'x-od-workspace-member-id': selection.workspaceMemberId,
  };
}

/** Test seam: clear the module-level context cache between tests. */
export function resetWorkspaceContextCache(): void {
  cachedWorkspaceContext = null;
  cachedWorkspaceContextGeneration = 'initial';
  workspaceContextRevision = 0;
  workspaceContextRequestToken = 'initial';
  localIdentityChangeSeq = 0;
  seededWorkspaceContext = null;
  workspaceContextIdentityChangePending = false;
  workspaceAccountGeneration = 0;
  workspaceAccountGenerationStamp = 'initial';
  writeWorkspaceSelection(null);
}

/**
 * The last context the shell resolved, for consumers that mount later and would
 * otherwise start their own read from `null`. Read-only: this cache is owned by
 * `useWorkspaceContext` and only a successful read redefines it.
 */
export function lastResolvedWorkspaceContext(): WorkspaceContextState['context'] {
  return cachedWorkspaceContext;
}

// Last team-shared catalogs this shell successfully read, partitioned by the
// account generation + complete Workspace identity that authorized each response. A missing entry
// means "never loaded", which is NOT the same as "nothing is shared" —
// consumers that relax a fail-closed gate on this must treat it as "unknown".
const cachedTeamProjects = new Map<string, TeamProject[]>();
const MAX_CACHED_TEAM_PROJECT_CATALOGS = 24;

function teamProjectsIdentity(
  context: WorkspaceCollabContext | null | undefined,
  accountGeneration = currentWorkspaceAccountGeneration(),
): string | null {
  return context?.workspaceId?.trim() && context.workspaceMemberId?.trim()
    ? JSON.stringify([accountGeneration, workspaceIdentityCacheKey(context)])
    : null;
}

function cacheTeamProjects(identity: string, projects: TeamProject[]): void {
  cachedTeamProjects.delete(identity);
  cachedTeamProjects.set(identity, projects);
  while (cachedTeamProjects.size > MAX_CACHED_TEAM_PROJECT_CATALOGS) {
    const oldest = cachedTeamProjects.keys().next().value as string | undefined;
    if (!oldest) break;
    cachedTeamProjects.delete(oldest);
  }
}

/** Test seam: clear the module-level team-project cache between tests. */
export function resetTeamProjectsCache(): void {
  cachedTeamProjects.clear();
  resetTeamProjectMetadataRefreshOrdering();
}

/**
 * The team-shared catalog the shell last resolved for `context`, or null if that
 * identity never loaded one or an identity change is still pending. Same source
 * the 全部项目 grid reads, exposed for consumers that need to know whether a
 * project is shared before `/collab/status` answers.
 */
export function lastResolvedTeamProjects(
  context: WorkspaceCollabContext | null | undefined = cachedWorkspaceContext,
): TeamProject[] | null {
  if (workspaceContextIdentityChangePending) return null;
  const identity = teamProjectsIdentity(context);
  return identity ? cachedTeamProjects.get(identity) ?? null : null;
}

export function useWorkspaceContext(): WorkspaceContextState {
  const [state, setState] = useState<WorkspaceContextState>(() => ({
    context: cachedWorkspaceContext,
    resourceReadIdentity:
      cachedWorkspaceContext && !workspaceContextIdentityChangePending
        ? {
            context: cachedWorkspaceContext,
            generation: cachedWorkspaceContextGeneration,
          }
        : null,
    loading: cachedWorkspaceContext === null,
    identityChangePending: workspaceContextIdentityChangePending,
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
   *
   * `fresh` is reserved for authoritative server invalidations. It bypasses
   * settled directory and context answers without marking the shell loading or
   * declaring a new local identity generation.
   */
  const loadContext = useCallback(async (
    options: { markLoading?: boolean; fresh?: boolean } = {},
  ) => {
    const requestEpoch = ++requestEpochRef.current;
    const requestGeneration = workspaceContextRequestToken;
    if (options.markLoading && mountedRef.current) {
      setState((prev) => ({
        ...prev,
        // Keep a resolved context visible to shell-only consumers while marking
        // its workspace-owned data unsafe through identityChangePending.
        loading: prev.context === null ? true : prev.loading,
        resourceReadIdentity: null,
        identityChangePending: true,
      }));
    }
    try {
      const requestedSelection = readWorkspaceSelection();
      const forceFresh = options.markLoading || options.fresh;
      const directory = forceFresh
        ? await readWorkspaceDirectoryForCurrentGeneration({ fresh: true })
        : await readWorkspaceDirectoryForCurrentGeneration();
      if (
        !mountedRef.current
        || requestEpochRef.current !== requestEpoch
        || workspaceContextRequestToken !== requestGeneration
      ) return;
      const selected = chooseWorkspaceForTab(directory.items ?? []);
      const exactSessionSelection = requestedSelection && selected
        && selected.workspaceId === requestedSelection.workspaceId
        && selected.workspaceMemberId === requestedSelection.workspaceMemberId
        ? selected
        : null;
      const provisionalReadContext = exactSessionSelection
        ? workspaceContextFromDirectoryItem(exactSessionSelection)
        : null;
      if (provisionalReadContext) {
        setState((prev) => ({
          ...prev,
          resourceReadIdentity: {
            context: provisionalReadContext,
            generation: requestGeneration,
          },
        }));
      }

      const fetchContext = async () => {
        if (!selected) {
          return { context: null } satisfies WorkspaceContextResponse;
        }
        const res = await fetch('/api/workspace/context', {
          cache: 'no-store',
          headers: explicitWorkspaceHeaders({
            workspaceId: selected.workspaceId,
            workspaceMemberId: selected.workspaceMemberId,
          }),
        });
        if (!res.ok) {
          const error = new Error(`workspace-context ${res.status}`) as Error & {
            status?: number;
          };
          error.status = res.status;
          throw error;
        }
        const body = (await res.json()) as WorkspaceContextResponse;
        if (
          body.context
          && (
            body.context.workspaceId !== selected.workspaceId
            || body.context.workspaceMemberId !== selected.workspaceMemberId
          )
        ) {
          throw new Error('workspace-context identity mismatch');
        }
        if (!body.context || body.context.workspaceName?.trim()) return body;
        // Older Vela context payloads predate `workspaceName`, while the
        // membership directory already carries it. Reuse the name from the
        // exact Workspace/member row selected for THIS tab so label consumers
        // (including plugin context defaults) remain compatible. This is display
        // metadata only: authority still comes from the explicit ids above, and
        // no daemon/backend "active workspace" state is consulted or written.
        const workspaceName = typeof selected.workspaceName === 'string'
          ? selected.workspaceName.trim()
          : '';
        return workspaceName
          ? { context: { ...body.context, workspaceName } }
          : body;
      };
      // Coalesced: every mounted consumer of this hook (and every focus/pageshow
      // refresh across them) fires the same read on a home-view burst — collapse
      // them to one request. The nav shell tolerates sub-second staleness.
      // An explicit identity-change refresh forces a fresh read instead of
      // sharing a settled answer that predates the change.
      const coalesceKey = workspaceContextCoalesceKey();
      const body = forceFresh
        ? await forceCoalescedGet(coalesceKey, fetchContext)
        : await coalescedGet(coalesceKey, fetchContext);
      if (
        !mountedRef.current
        || requestEpochRef.current !== requestEpoch
        || workspaceContextRequestToken !== requestGeneration
      ) return;
      // A successful read is the only thing that redefines "signed in": persist it
      // (including an explicit null for a genuinely signed-out response) so the
      // next remount seeds from the truth, not a stale value.
      const nextContext = body.context ?? null;
      if (workspaceContextIdentity(cachedWorkspaceContext) !== workspaceContextIdentity(nextContext)) {
        workspaceContextRevision += 1;
      }
      cachedWorkspaceContext = nextContext;
      cachedWorkspaceContextGeneration = requestGeneration;
      workspaceContextIdentityChangePending = false;
      setState({
        context: cachedWorkspaceContext,
        resourceReadIdentity: cachedWorkspaceContext
          ? { context: cachedWorkspaceContext, generation: requestGeneration }
          : null,
        loading: false,
        identityChangePending: false,
      });
    } catch (error) {
      if (
        !mountedRef.current
        || requestEpochRef.current !== requestEpoch
        || workspaceContextRequestToken !== requestGeneration
      ) return;
      // Transient failure (offline, momentary daemon/hub hiccup): keep the
      // last-known context instead of flashing the signed-out state. A never-
      // signed-in / personal user has a null cache, so this still shows the local
      // state for them.
      setState({
        context: cachedWorkspaceContext,
        resourceReadIdentity:
          cachedWorkspaceContext && !workspaceContextIdentityChangePending
            ? {
                context: cachedWorkspaceContext,
                generation: cachedWorkspaceContextGeneration,
              }
            : null,
        loading: false,
        identityChangePending: workspaceContextIdentityChangePending,
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
  // The re-fetch keeps the last-known context on failure rather than clearing it.
  const { connected: sseConnected } = useWorkspaceInvalidation(
    // A pushed invalidation is authoritative new state. Reusing either settled
    // one-second cache here can keep a revoked Team membership selected until
    // the SSE-floor poll runs much later.
    { 'workspace-context-changed': () => void loadContext({ fresh: true }) },
    {
      workspaceContext: state.context,
      onActive: () => void loadContext(),
    },
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
    //
    // When the acting caller published the post-change context with the
    // broadcast, adopt it instead of re-reading: it came from the response that
    // changed the identity, so a fetch here would only ask the server to repeat
    // itself. Bumping the request epoch first retires any ambient read still in
    // flight from BEFORE the change, which could otherwise land later and
    // overwrite the new identity with the old one.
    const refreshAfterIdentityChange = () => {
      const seeded = seededContextForCurrentGeneration();
      if (seeded) {
        requestEpochRef.current += 1;
        workspaceContextIdentityChangePending = false;
        if (mountedRef.current) {
          setState({
            context: seeded,
            resourceReadIdentity: {
              context: seeded,
              generation: workspaceContextRequestToken,
            },
            loading: false,
            identityChangePending: false,
          });
        }
        return;
      }
      void loadContext({ markLoading: true });
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== WORKSPACE_ACCOUNT_BOUNDARY_STORAGE_KEY) return;
      // The acting tab advanced its own token inside `notifyWorkspaceContextRefresh`;
      // a passive tab learns of the change only here. Advancing to the stamp the
      // acting tab WROTE keeps this idempotent across the many mounted consumers
      // that all hear the same storage event — they converge on one key, so one
      // change still costs one request.
      advanceWorkspaceContextRequestToken(event.newValue);
      advanceWorkspaceAccountGeneration(event.newValue ?? 'storage');
      refreshAfterIdentityChange();
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

  const accountGeneration = currentWorkspaceAccountGeneration();
  return useMemo(
    () => ({ ...state, accountGeneration }),
    [accountGeneration, state],
  );
}

const WORKSPACE_CONTEXT_POLL_MS = 30_000;
// Poll-as-floor cadence while the workspace SSE is connected — a slow safety net
// behind the pushed `workspace-context-changed` events.
const WORKSPACE_CONTEXT_SSE_FLOOR_MS = 120_000;
export const WORKSPACE_CONTEXT_REFRESH_EVENT = 'od:workspace-context-refresh';
// Keep the deployed storage string for old/new bundle interoperability. The
// semantic name is deliberately narrower: only unseeded sign-in/sign-out
// writes it; a seeded ambient Workspace selection never does.
const WORKSPACE_ACCOUNT_BOUNDARY_STORAGE_KEY = 'od.workspaceContext.refreshAt';

/**
 * A context the ACTING surface already holds, published alongside the identity-
 * change broadcast so consumers adopt it instead of re-reading it.
 *
 * The compatibility switch route returns the post-switch context after verifying
 * the exact Workspace/member pair against the directory. The switch response IS
 * the next context; making every mounted consumer fetch it again would spend a
 * round-trip to learn what request #1 already said.
 *
 * Stamped with the identity generation it belongs to. Every mounted consumer
 * handles one broadcast in the same synchronous pass and each must adopt, so this
 * is peeked rather than consumed; the next `advanceWorkspaceContextRequestToken`
 * retires it. A passive TAB cannot be seeded (it learns of the change through the
 * `localStorage` stamp, which carries no payload) and correctly falls back to a
 * real read.
 */
let seededWorkspaceContext: {
  token: string;
  context: WorkspaceCollabContext;
} | null = null;
let workspaceAccountGeneration = 0;
let workspaceAccountGenerationStamp = 'initial';

function advanceWorkspaceAccountGeneration(stamp: string): void {
  if (workspaceAccountGenerationStamp === stamp) return;
  workspaceAccountGenerationStamp = stamp;
  workspaceAccountGeneration += 1;
}

/**
 * Monotonic account boundary independent from ambient Workspace selection.
 * Fresh project binding witnesses survive A -> B navigation, but must be
 * discarded across sign-in/sign-out when another account may own the same
 * local project id.
 */
export function currentWorkspaceAccountGeneration(): number {
  return workspaceAccountGeneration;
}

/** The seed published for the CURRENT identity generation, if any. */
function seededContextForCurrentGeneration(): WorkspaceCollabContext | null {
  if (!seededWorkspaceContext) return null;
  return seededWorkspaceContext.token === workspaceContextRequestToken
    ? seededWorkspaceContext.context
    : null;
}

/**
 * Whether the current explicit refresh carries a server-verified Workspace
 * switch result. A seeded refresh changes only the shell's ambient selection;
 * it is not an account boundary and must not invalidate an already-open
 * project's independently verified Workspace authority.
 */
export function workspaceContextRefreshHasVerifiedSelection(): boolean {
  return seededContextForCurrentGeneration() !== null;
}

/**
 * Announce a deliberate identity change (a workspace switch or a sign-in).
 *
 * Pass `seed` when the caller already holds the post-change context — the
 * response body that CHANGED it. Consumers then adopt that context instead of
 * issuing a fresh `GET /api/workspace/context`. Omit it for callers that only
 * know something changed (sign-in), which keeps the re-read.
 *
 * The broadcast fires either way: `useProjectWorkspaceScope` listens to it to
 * revalidate the project scope, and other tabs need the storage stamp.
 */
export function notifyWorkspaceContextRefresh(
  seed?: { context: WorkspaceCollabContext } | null,
): void {
  if (typeof window === 'undefined') return;
  const stamp = `${Date.now()}:${localIdentityChangeSeq + 1}`;
  // Advance BEFORE dispatching: this call is the one place that knows a genuine
  // identity change just happened, and every handler the dispatch below runs must
  // read the new generation's key. Doing it per handler instead would turn one
  // change into one request per mounted consumer.
  advanceWorkspaceContextRequestToken();
  if (seed?.context) {
    writeWorkspaceSelection({
      workspaceId: seed.context.workspaceId,
      workspaceMemberId: seed.context.workspaceMemberId,
    });
    workspaceContextIdentityChangePending = false;
    seededWorkspaceContext = { token: workspaceContextRequestToken, context: seed.context };
    // Redefine the module cache now, so a consumer that mounts after this
    // dispatch seeds from the new identity rather than the one just left.
    if (
      workspaceContextIdentity(cachedWorkspaceContext) !== workspaceContextIdentity(seed.context)
    ) {
      workspaceContextRevision += 1;
    }
    cachedWorkspaceContext = seed.context;
    cachedWorkspaceContextGeneration = workspaceContextRequestToken;
  } else {
    advanceWorkspaceAccountGeneration(stamp);
    workspaceContextIdentityChangePending = true;
    seededWorkspaceContext = null;
  }
  window.dispatchEvent(new Event(WORKSPACE_CONTEXT_REFRESH_EVENT));
  // A seeded refresh is a workspace selection and is deliberately tab-local.
  // Sign-in/sign-out has no seed and remains account-wide across tabs.
  if (!seed?.context) {
    try {
      window.localStorage.setItem(WORKSPACE_ACCOUNT_BOUNDARY_STORAGE_KEY, stamp);
    } catch {
      // The in-window event is enough when localStorage is unavailable.
    }
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
  resetWorkspaceBillingRetrySchedules();
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
  const hasExactWorkspaceScope = Boolean(context && workspaceId && workspaceMemberId);
  const billingScopeKey =
    contextLoading || !hasExactWorkspaceScope
      ? null
      : `workspace-billing:workspace:${workspaceId}:member:${workspaceMemberId}`;
  const billingUrl =
    billingScopeKey
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
      // The retry schedule is module-level and deliberately survives this
      // unmount: another consumer of the same requestKey may still be
      // mounted, and a timer that fires with no listeners is a no-op.
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
        clearWorkspaceBillingRetryFailures(requestKey);
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
        // A revoked read (403) fails closed and must not retry. Everything
        // else — including the packaged client's synthetic proxy 502s —
        // retries on the shared, exponentially backed-off schedule.
        if (!revoked) scheduleWorkspaceBillingRetry(requestKey);
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
      // `force: true` — hard expiry KNOWS the cached answer is void (that is
      // the whole point of the timer), so the revalidation must bypass any
      // settled coalescing entry, exactly like an identity change. Failure
      // retries deliberately dispatch WITHOUT force so they can share a
      // concurrent consumer's fresh success instead.
      window.dispatchEvent(new CustomEvent(WORKSPACE_BILLING_RETRY_EVENT, {
        detail: { requestKey, force: true },
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
  }, {
    workspaceContext: context,
    onActive: () => void loadBilling(false, true),
  });

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
      const detail = (event as CustomEvent<{ requestKey?: string; force?: boolean }>).detail;
      if (detail?.requestKey !== activeRequestKeyRef.current) return;
      // Failure retries are deliberately NOT forced: a failed read is never
      // cached, so the plain coalesced path is a genuine refetch — and when a
      // concurrent consumer just succeeded, joining that fresh result re-syncs
      // this one without adding another request to an already-struggling
      // transport. Hard-expiry revalidation dispatches with `force: true`
      // because its cached answer is void by definition.
      void loadBilling(false, detail?.force === true);
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
 * Workspace money is valid only when Vela's v2 response proves both the
 * requested workspace and the acting member. Personal and Team scopes obey the
 * same rule and must never fall back to account money:
 * one local daemon may serve multiple windows whose URL-selected workspaces
 * differ. A headerless legacy client is handled by Vela's canonical Default
 * Workspace fallback; this modern client always carries the selected id.
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
const WORKSPACE_BILLING_RETRY_BASE_MS = 5_000;
const WORKSPACE_BILLING_RETRY_MAX_MS = 60_000;
const WORKSPACE_BILLING_RETRY_EVENT = 'od:workspace-billing-retry';

/**
 * One retry schedule per billing `requestKey`, shared by every mounted
 * consumer — the module-level counterpart of the per-hook timer it replaced.
 *
 * Two properties are load-bearing for the packaged (od://) client, whose
 * proxy answers with synthetic 502s (`OD_PROTOCOL_PROXY_FAILED`) when the
 * bursty first-open request load hits a transient transport failure:
 *
 *  1. The delay grows exponentially (5s → 10s → 20s → 40s → 60s cap) while
 *     failures are consecutive. A fixed 5s cadence against a struggling
 *     transport is self-defeating — each retry adds to the very burst that
 *     is producing the 502s it is retrying.
 *  2. The schedule is keyed once per requestKey, not once per mounted hook.
 *     N consumers failing on the same shared read used to arm N timers whose
 *     N events each fanned out to N listeners; one schedule dispatches one
 *     retry event per cycle and the listeners' coalesced reads share one
 *     network request.
 *
 * A success only RESETS the consecutive-failure count — it deliberately does
 * not cancel a pending timer. Consumers hold their own state, so a success
 * observed by one consumer has not reached the others; letting the pending
 * retry fire re-syncs them through the coalescing cache (a fresh success
 * within the share window costs zero network requests).
 */
type WorkspaceBillingRetrySchedule = {
  consecutiveFailures: number;
  timer: ReturnType<typeof setTimeout> | null;
};
const workspaceBillingRetrySchedules = new Map<string, WorkspaceBillingRetrySchedule>();

function scheduleWorkspaceBillingRetry(requestKey: string): void {
  if (typeof window === 'undefined') return;
  let schedule = workspaceBillingRetrySchedules.get(requestKey);
  if (!schedule) {
    schedule = { consecutiveFailures: 0, timer: null };
    workspaceBillingRetrySchedules.set(requestKey, schedule);
  }
  if (schedule.timer != null) return;
  const delay = Math.min(
    WORKSPACE_BILLING_RETRY_BASE_MS * 2 ** schedule.consecutiveFailures,
    WORKSPACE_BILLING_RETRY_MAX_MS,
  );
  schedule.consecutiveFailures += 1;
  schedule.timer = setTimeout(() => {
    schedule.timer = null;
    // Dispatch unconditionally: listeners filter on their own active
    // requestKey, and an event nobody is mounted for is a no-op.
    window.dispatchEvent(
      new CustomEvent(WORKSPACE_BILLING_RETRY_EVENT, { detail: { requestKey } }),
    );
  }, delay);
}

function clearWorkspaceBillingRetryFailures(requestKey: string): void {
  const schedule = workspaceBillingRetrySchedules.get(requestKey);
  if (schedule) schedule.consecutiveFailures = 0;
}

function resetWorkspaceBillingRetrySchedules(): void {
  for (const schedule of workspaceBillingRetrySchedules.values()) {
    if (schedule.timer != null) clearTimeout(schedule.timer);
  }
  workspaceBillingRetrySchedules.clear();
}
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
let teamProjectsChangedNotificationSequence = 0;

export function notifyTeamProjectsChanged(
  detail?: Pick<
    Extract<WorkspaceInvalidationSsePayload, { type: 'team-projects-changed' }>,
    'projectId' | 'kind'
  >,
): void {
  if (typeof window === 'undefined') return;
  // Always fan out one shared detail object. Every mounted consumer receives
  // this same semantic event token and therefore shares one catalog request;
  // the next call creates another token and cannot be collapsed into this one
  // merely because it happens inside forceCoalescedGet's 250ms burst window.
  const sharedDetail = { type: 'team-projects-changed' as const, ...detail };
  window.dispatchEvent(new CustomEvent(TEAM_PROJECTS_CHANGED_EVENT, {
    detail: sharedDetail,
  }));
  try {
    // Include a monotonic suffix so two genuine mutations in the same
    // millisecond still change the storage value and both reach other tabs.
    window.localStorage.setItem(
      TEAM_PROJECTS_CHANGED_STORAGE_KEY,
      `${Date.now()}:${++teamProjectsChangedNotificationSequence}`,
    );
  } catch {
    // localStorage can be unavailable in restricted contexts; the in-window event
    // already refreshed the current client.
  }
}

export function useTeamProjects(): TeamProjectsState {
  const workspaceState = useWorkspaceContext();
  const {
    context: workspaceContext,
    loading: workspaceContextLoading,
    identityChangePending,
  } = workspaceState;
  // Older test doubles predate resourceReadIdentity. Production state always
  // defines it; the fallback keeps those tests describing the verified-context
  // path without granting a runtime fallback to ambient/default/current state.
  const resourceReadIdentity = workspaceState.resourceReadIdentity === undefined
    ? workspaceContext
      ? { context: workspaceContext, generation: 'verified-context' }
      : null
    : workspaceState.resourceReadIdentity;
  const catalogContext = resourceReadIdentity?.context ?? null;
  const catalogGeneration = resourceReadIdentity?.generation ?? null;
  const catalogContextIdentity = workspaceIdentityCacheKey(catalogContext);
  const catalogAccountGeneration = currentWorkspaceAccountGeneration();
  const catalogScopeKey = catalogGeneration
    ? JSON.stringify([catalogAccountGeneration, catalogGeneration, catalogContextIdentity])
    : null;
  const resourceReadIdentityRef = useRef(resourceReadIdentity);
  resourceReadIdentityRef.current = resourceReadIdentity;
  const teamCatalogIdentity = teamProjectsIdentity(
    catalogContext,
    catalogAccountGeneration,
  );
  const initialCachedCatalog = teamCatalogIdentity
    ? cachedTeamProjects.get(teamCatalogIdentity) ?? null
    : null;
  const [catalog, setCatalog] = useState<{
    identity: string | null;
    projects: TeamProject[];
  }>(() => ({
    identity: initialCachedCatalog ? catalogScopeKey : null,
    projects: initialCachedCatalog ?? [],
  }));
  const [loading, setLoading] = useState(initialCachedCatalog === null);
  const [nonce, setNonce] = useState(0);
  const mountedRef = useRef(true);
  const catalogScopeRef = useRef(catalogScopeKey);
  if (catalogScopeRef.current !== catalogScopeKey) {
    const cached = teamCatalogIdentity
      ? cachedTeamProjects.get(teamCatalogIdentity) ?? null
      : null;
    catalogScopeRef.current = catalogScopeKey;
    setCatalog({
      identity: cached ? catalogScopeKey : null,
      projects: cached ?? [],
    });
    setLoading(cached === null);
  }

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
  const loadFull = useCallback(async (force = false, event?: object) => {
    const issuedIdentity = resourceReadIdentityRef.current;
    const issuedAccountGeneration = currentWorkspaceAccountGeneration();
    const read = beginWorkspaceScopedRead(issuedIdentity?.context);
    const catalogRefresh = event && read.context
      ? beginTeamProjectCatalogRefresh({
          accountGeneration: issuedAccountGeneration,
          context: read.context,
          event,
        })
      : null;
    const isStillCurrent = () => {
      const current = resourceReadIdentityRef.current;
      return currentWorkspaceAccountGeneration() === issuedAccountGeneration
        && current?.generation === issuedIdentity?.generation
        && read.isStillCurrent(current?.context)
        && (catalogRefresh?.isLatest() ?? true);
    };
    if (!read.context) {
      if (mountedRef.current) {
        setCatalog({ identity: null, projects: [] });
        setLoading(false);
      }
      return;
    }
    try {
      // `fetchTeamProjectsCatalog` owns the endpoint, the coalescing key, and
      // the array guarantee — see team-projects-catalog.ts for why those three
      // must not be split across call sites again.
      const projects = await fetchTeamProjectsCatalog({
        context: read.context,
        force,
        requestGeneration: issuedIdentity?.generation,
        cacheDiscriminator: catalogRefresh?.cacheDiscriminator,
      });
      if (!isStillCurrent()) return;
      const identity = teamProjectsIdentity(read.context, issuedAccountGeneration);
      if (identity) cacheTeamProjects(identity, projects);
      if (catalogRefresh) {
        const projectsById = new Map(projects.map((project) => [project.projectId, project]));
        patchProjectDisplaySnapshots({
          accountGeneration: issuedAccountGeneration,
          context: read.context,
          patch: (displayProjects) => displayProjects.map((candidate) => {
            if (candidate.workspaceId !== read.context?.workspaceId) return candidate;
            const catalogProject = projectsById.get(candidate.id);
            if (!catalogProject) return candidate;
            return {
              ...candidate,
              ...(catalogProject.name ? { name: catalogProject.name } : {}),
              ...(catalogProject.metadata ? { metadata: catalogProject.metadata } : {}),
              ...(catalogProject.updatedAt !== undefined
                ? { updatedAt: catalogProject.updatedAt }
                : {}),
            };
          }),
        });
      }
      if (mountedRef.current) {
        setCatalog({ identity: catalogScopeKey, projects });
        setLoading(false);
      }
    } catch {
      // Personal / offline / daemon without the hub: no team-shared projects.
      // A request issued for the workspace the user just left must not clear a
      // newer workspace's successful catalog when it rejects late.
      if (!isStillCurrent()) return;
      if (mountedRef.current) {
        const identity = teamProjectsIdentity(read.context, issuedAccountGeneration);
        const cached = identity ? cachedTeamProjects.get(identity) ?? null : null;
        setCatalog({
          identity: cached ? catalogScopeKey : null,
          projects: cached ?? [],
        });
        setLoading(false);
      }
    }
  }, [catalogScopeKey]);

  const loadProjectMetadata = useCallback(async (
    payload: Extract<WorkspaceInvalidationSsePayload, { type: 'team-projects-changed' }>,
  ) => {
    const projectId = payload.projectId;
    if (!projectId) return;
    const issuedIdentity = resourceReadIdentityRef.current;
    const issuedAccountGeneration = currentWorkspaceAccountGeneration();
    const read = beginWorkspaceScopedRead(issuedIdentity?.context);
    if (!read.context) return;
    const metadataRefresh = beginTeamProjectMetadataRefresh({
      accountGeneration: issuedAccountGeneration,
      context: read.context,
      projectId,
      event: payload,
    });
    const isStillCurrent = () => {
      const current = resourceReadIdentityRef.current;
      return currentWorkspaceAccountGeneration() === issuedAccountGeneration
        && current?.generation === issuedIdentity?.generation
        && read.isStillCurrent(current?.context)
        && metadataRefresh.isLatest();
    };
    try {
      const project = await fetchTeamProjectCatalogEntry({
        context: read.context,
        projectId,
        force: true,
        requestGeneration: issuedIdentity?.generation,
        cacheDiscriminator: metadataRefresh.cacheDiscriminator,
      });
      if (!isStillCurrent()) return;
      if (!project) {
        // A metadata signal should name an existing row. Absence means it
        // raced a share/unshare, so fall back to authoritative reconciliation.
        void loadFull(true, payload);
        return;
      }
      const identity = teamProjectsIdentity(read.context, issuedAccountGeneration);
      const cached = identity ? cachedTeamProjects.get(identity) ?? null : null;
      const base = cached ?? (catalog.identity === catalogScopeKey ? catalog.projects : []);
      if (!base.some((candidate) => candidate.projectId === projectId)) {
        void loadFull(true, payload);
        return;
      }
      const patched = base.map((candidate) =>
        candidate.projectId === projectId ? project : candidate
      );
      if (identity) cacheTeamProjects(identity, patched);
      patchProjectDisplaySnapshots({
        accountGeneration: issuedAccountGeneration,
        context: read.context,
        patch: (projects) => projects.map((candidate) =>
          candidate.id === projectId
            ? {
                ...candidate,
                ...(project.name ? { name: project.name } : {}),
                ...(project.metadata ? { metadata: project.metadata } : {}),
                ...(project.updatedAt !== undefined ? { updatedAt: project.updatedAt } : {}),
              }
            : candidate),
      });
      if (mountedRef.current) {
        setCatalog((current) =>
          isStillCurrent() && current.identity === catalogScopeKey
            ? {
                ...current,
                projects: current.projects.map((candidate) =>
                  candidate.projectId === projectId ? project : candidate
                ),
              }
            : current
        );
      }
    } catch {
      // Keep last-good rows. Poll/reconnect remains the bounded full recovery.
    }
  }, [catalog.identity, catalog.projects, catalogScopeKey, loadFull]);

  const handleTeamProjectsChanged = useCallback((
    payload?: Extract<WorkspaceInvalidationSsePayload, { type: 'team-projects-changed' }>,
    event?: object,
  ) => {
    if (payload?.kind === 'metadata' && payload.projectId) {
      void loadProjectMetadata(payload);
      return;
    }
    // Production broad invalidations always supply the shared SSE payload,
    // CustomEvent detail, or StorageEvent. A defensive direct dispatch of a
    // plain Event still uses that Event object, never a per-listener token.
    if (event) void loadFull(true, event);
  }, [loadFull, loadProjectMetadata]);

  // Initial load + manual reload (nonce bump).
  useEffect(() => {
    if (
      (workspaceContextLoading || identityChangePending)
      && !resourceReadIdentity
    ) return;
    const cached = teamCatalogIdentity
      ? cachedTeamProjects.get(teamCatalogIdentity) ?? null
      : null;
    if (cached) {
      setCatalog({ identity: catalogScopeKey, projects: cached });
      setLoading(false);
    } else {
      setLoading(true);
    }
    void loadFull();
  }, [
    catalogScopeKey,
    nonce,
    loadFull,
    teamCatalogIdentity,
    workspaceContextLoading,
  ]);

  // Collab realtime hop-2: subscribe to the workspace SSE and re-fetch on a
  // pushed `team-projects-changed` (a teammate shared/unshared a project). The
  // daemon's workspace-invalidation poller diffs the team list and pushes only
  // on an actual change. `connected` drives poll-as-floor below.
  const { connected: sseConnected } = useWorkspaceInvalidation(
    {
      'team-projects-changed': (payload) => {
        if (workspaceContext) {
          markProjectDisplaySnapshotsDirty({
            accountGeneration: currentWorkspaceAccountGeneration(),
            context: workspaceContext,
          });
        }
        handleTeamProjectsChanged(payload, payload);
      },
    },
    {
      workspaceContext,
      onActive: () => void loadFull(),
    },
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
    const onTeamProjectsChanged = (event: Event) => {
      if (workspaceContext) {
        markProjectDisplaySnapshotsDirty({
          accountGeneration: currentWorkspaceAccountGeneration(),
          context: workspaceContext,
        });
      }
      // A workspace switch fires this same event (see `switchWorkspace` in
      // EntryNavRail.tsx). Without forcing, an in-flight coalesced read
      // started just before the switch can resolve inside the new call's
      // coalescing window and hand back the PREVIOUS workspace's team list.
      const detail = event instanceof CustomEvent
        ? event.detail as Extract<
            WorkspaceInvalidationSsePayload,
            { type: 'team-projects-changed' }
          > | undefined
        : undefined;
      handleTeamProjectsChanged(detail, detail ?? event);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === TEAM_PROJECTS_CHANGED_STORAGE_KEY) void loadFull(true, event);
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
  }, [handleTeamProjectsChanged, loadFull, workspaceContext]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const catalogMatchesIdentity = catalog.identity === catalogScopeKey;
  const projects =
    catalogMatchesIdentity ? catalog.projects : [];
  return {
    projects,
    loading:
      loading
      || !catalogMatchesIdentity
      || Boolean(identityChangePending && !resourceReadIdentity),
    reload,
  };
}
