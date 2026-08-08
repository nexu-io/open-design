import { createHash } from 'node:crypto';
import {
  buildWorkspacePermissions,
  buildWorkspaceSeatSummary,
} from '@open-design/contracts';
import type {
  CollabMemberRole,
  WorkspaceBillingState,
  WorkspaceCollabContext,
  WorkspaceDirectoryItem,
  WorkspaceLifecycleState,
  WorkspaceMemberStatus,
  WorkspacePermissions,
  WorkspaceProviderMode,
  WorkspaceSeatSummary,
  WorkspaceType,
} from '@open-design/contracts';
import { readVelaControlApiContext, type VelaUser } from '../integrations/vela.js';
import {
  createDevWorkspaceContextProvider,
  resolveWorkspaceSettingsUrl,
  type WorkspaceContextProvider,
  type WorkspaceContextRequest,
} from './workspace-context.js';

// Real B-integration provider (T2). The daemon reuses the SAME vela login session
// that AMR / the vela CLI use — `readVelaControlApiContext` reads the control key
// + api url from ~/.amr/config.json (or env) — and calls B's authoritative
// `GET /api/v1/workspaces/current`, which authenticates that session and returns
// the CurrentWorkspaceContext. No second identity: one vela session drives AMR,
// resource sharing, and the workspace context. Any failure (no session, signed
// out, B unreachable) degrades to null → collab stays single-player, never throws.

const WORKSPACE_CURRENT_PATH = '/api/v1/workspaces/current';
const DEFAULT_TIMEOUT_MS = 8_000;
// Read authorization is display-only and is polled every 5s by an open shared
// project. Keep the successful lease comfortably wider than that cadence so a
// poll cannot expire the lease at the exact instant it is meant to reuse it.
// Mutations never consume this lease: `fresh()` below always performs (or joins)
// an unsettled authoritative read.
const DEFAULT_DIRECTORY_CACHE_TTL_MS = 15_000;
// After a failed legacy default-workspace bootstrap, avoid repeating the
// directory read on every compatibility request.
const BOOTSTRAP_FAILURE_COOLDOWN_MS = 60_000;

const WORKSPACE_TYPES = new Set<WorkspaceType>(['personal', 'team']);
const ROLES = new Set<CollabMemberRole>(['owner', 'admin', 'member']);
const MEMBER_STATUSES = new Set<WorkspaceMemberStatus>(['active', 'removed']);
const LIFECYCLE_STATES = new Set<WorkspaceLifecycleState>([
  'active',
  'billing_past_due',
  'locked',
  'deleting',
  'deleted',
]);
const BILLING_STATES = new Set<WorkspaceBillingState>([
  'free',
  'active',
  'past_due',
  'canceled',
  'inactive',
  'locked',
]);
const PROVIDER_MODES = new Set<WorkspaceProviderMode>(['platform_credits', 'personal_byok']);

interface VelaWorkspaceContextOptions {
  /** Injectable for tests. */
  fetch?: typeof fetch;
  /** Injectable for tests; defaults to reading ~/.amr/config.json + env. */
  readSession?: typeof readVelaControlApiContext;
  /**
   * Legacy default for no-argument `current()` and fresh-account bootstrap.
   * Exact request resolution never reads it.
   */
  getActiveWorkspaceId?: () => string | null | undefined;
  /**
   * Persist a LOCAL default selection (fresh account with no selection
   * anywhere). Never writes B's account-level Active Workspace — per the
   * explicit-workspace handoff only a deliberate user switch PUTs current.
   */
  setLocalSelection?: (workspaceId: string) => void | Promise<void>;
  /**
   * Purge a CONFIRMED-stale local pin: the membership directory was
   * successfully read and no longer lists this workspace as an active
   * membership (removed member, or the workspace itself is gone). Never
   * called on a merely unreachable B — see `resolvePinnedWorkspace` below.
   */
  clearLocalSelection?: () => void | Promise<void>;
  timeoutMs?: number;
}

/**
 * Map B's `GET /api/v1/workspaces/current` body onto our WorkspaceCollabContext.
 * The shape is a faithful mirror of B's CurrentWorkspaceContext, so this is a
 * near pass-through with two adjustments:
 *  - `teamId` is derived as `workspaceId` for a team workspace: B has no separate
 *    team id — the workspace IS the team scope the resource hub keys resources by.
 *  - `permissions` / `seatSummary` are trusted from B when well-formed, and
 *    defensively re-derived (so read-only gating never breaks) if B omits them.
 * Returns null when a required field is missing or an enum is out of range —
 * collab then stays dormant rather than acting on a malformed context.
 */
export function mapVelaWorkspaceContext(input: unknown): WorkspaceCollabContext | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;

  const workspaceId = str(raw.workspaceId);
  const workspaceMemberId = str(raw.workspaceMemberId);
  if (!workspaceId || !workspaceMemberId) return null;
  if (!WORKSPACE_TYPES.has(raw.workspaceType as WorkspaceType)) return null;
  if (!ROLES.has(raw.role as CollabMemberRole)) return null;
  if (!MEMBER_STATUSES.has(raw.memberStatus as WorkspaceMemberStatus)) return null;
  if (!LIFECYCLE_STATES.has(raw.lifecycleState as WorkspaceLifecycleState)) return null;
  if (!PROVIDER_MODES.has(raw.providerMode as WorkspaceProviderMode)) return null;

  const workspaceType = raw.workspaceType as WorkspaceType;
  const role = raw.role as CollabMemberRole;
  const memberStatus = raw.memberStatus as WorkspaceMemberStatus;
  const lifecycleState = raw.lifecycleState as WorkspaceLifecycleState;
  const billingState = BILLING_STATES.has(raw.billingState as WorkspaceBillingState)
    ? raw.billingState as WorkspaceBillingState
    : billingStateFromLifecycle(lifecycleState);

  const context: WorkspaceCollabContext = {
    workspaceId,
    workspaceType,
    workspaceMemberId,
    role,
    memberStatus,
    lifecycleState,
    billingState,
    planId: str(raw.planId) || null,
    providerMode: raw.providerMode as WorkspaceProviderMode,
    seatSummary: parseSeatSummary(raw.seatSummary),
    permissions:
      parsePermissions(raw.permissions) ??
      buildWorkspacePermissions({ role, lifecycleState, memberStatus }),
  };
  const billingRecovery = parseBillingRecovery(raw.billingRecovery);
  if (billingRecovery) context.billingRecovery = billingRecovery;
  const lastActive = str(raw.lastActiveWorkspaceId);
  if (lastActive) context.lastActiveWorkspaceId = lastActive;
  // The team workspace IS the team scope; carry its id as teamId so the resource
  // hub principal derives from this one context.
  const settingsUrl = resolveWorkspaceSettingsUrl(
    workspaceId,
    (raw as { workspaceSettingsUrl?: unknown }).workspaceSettingsUrl,
  );
  if (settingsUrl) context.workspaceSettingsUrl = settingsUrl;

  if (workspaceType === 'team') {
    context.teamId = workspaceId;
  }
  const workspaceName = str((raw as { workspaceName?: unknown }).workspaceName);
  // B names EVERY workspace, personal included, so the name belongs on the
  // context for both types — that is what lets a surface label the current
  // workspace off the startup context alone. `teamName` stays team-only: it is
  // the team switcher's field and doubles as an "is a team" signal.
  if (workspaceName) context.workspaceName = workspaceName;
  if (workspaceName && workspaceType === 'team') context.teamName = workspaceName;
  const displayName = str((raw as { displayName?: unknown }).displayName);
  if (displayName) context.displayName = displayName;
  return context;
}

export function mapVelaWorkspaceDirectory(input: unknown): WorkspaceDirectoryItem[] {
  if (!input || typeof input !== 'object') return [];
  const raw = input as { items?: unknown };
  if (!Array.isArray(raw.items)) return [];
  const items: WorkspaceDirectoryItem[] = [];
  for (const entry of raw.items) {
    const mapped = mapVelaWorkspaceDirectoryItem(entry);
    if (mapped) items.push(mapped);
  }
  return items;
}

function mapVelaWorkspaceDirectoryItem(input: unknown): WorkspaceDirectoryItem | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const workspaceId = str(raw.workspaceId);
  const workspaceName = str(raw.workspaceName);
  const workspaceMemberId = str(raw.workspaceMemberId);
  if (!workspaceId || !workspaceName || !workspaceMemberId) return null;
  if (!WORKSPACE_TYPES.has(raw.workspaceType as WorkspaceType)) return null;
  if (!ROLES.has(raw.role as CollabMemberRole)) return null;
  if (!MEMBER_STATUSES.has(raw.memberStatus as WorkspaceMemberStatus)) return null;
  if (!LIFECYCLE_STATES.has(raw.lifecycleState as WorkspaceLifecycleState)) return null;
  const item: WorkspaceDirectoryItem = {
    workspaceId,
    workspaceName,
    workspaceType: raw.workspaceType as WorkspaceType,
    workspaceMemberId,
    role: raw.role as CollabMemberRole,
    memberStatus: raw.memberStatus as WorkspaceMemberStatus,
    lifecycleState: raw.lifecycleState as WorkspaceLifecycleState,
  };
  const workspaceIconKey = str(raw.workspaceIconKey);
  if (workspaceIconKey) item.workspaceIconKey = workspaceIconKey;
  return item;
}

/**
 * Provider that fetches the workspace context from B using the local vela
 * session. Swap this in for the dev stub once a B-backed vela is reachable.
 */
export function createVelaWorkspaceContextProvider(
  options: VelaWorkspaceContextOptions = {},
): WorkspaceContextProvider {
  const fetchImpl = options.fetch ?? fetch;
  const readSession = options.readSession ?? readVelaControlApiContext;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  type VelaSession = NonNullable<ReturnType<typeof readVelaControlApiContext>>;
  let lastBootstrapFailureAt = 0;

  /**
   * Read the context for the workspace THIS daemon is pinned to.
   *
   * The workspace travels as `x-vela-workspace-id`, which is the per-request
   * workspace scope B honours across its resource plane, its billing scope
   * routes and the Link gateway (and which the vela CLI already sends for
   * scoped commands). A `?workspaceId=` query hint is NOT sent: B's
   * `GET /workspaces/current` ignores URL hints by design and asserts that in
   * its own suite, so a query param was only ever dead weight that made this
   * look scoped when it was not.
   *
   * Without the header B answers from the ACCOUNT-LEVEL active workspace,
   * which is one row per account (`active_workspace_selections` is keyed by
   * app user) and therefore cannot describe an account whose clients are in
   * different workspaces. Sending it is what lets two clients of one account
   * each read their own workspace.
   */
  async function fetchCurrent(
    session: VelaSession,
    activeWorkspaceId: string | undefined,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetchImpl(new URL(WORKSPACE_CURRENT_PATH, session.apiUrl), {
        method: 'GET',
        headers: {
          authorization: `Bearer ${session.controlKey}`,
          ...(activeWorkspaceId ? { 'x-vela-workspace-id': activeWorkspaceId } : {}),
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  /** Pick the best default membership out of an already-fetched directory list. */
  function selectDefaultCandidate(
    items: WorkspaceDirectoryItem[],
    preferredId: string | undefined,
  ): WorkspaceDirectoryItem | undefined {
    const candidates = items.filter(
      (item) => item.memberStatus === 'active' && item.lifecycleState === 'active',
    );
    return (
      (preferredId ? candidates.find((item) => item.workspaceId === preferredId) : undefined) ??
      candidates.find((item) => item.workspaceType === 'personal') ??
      candidates[0]
    );
  }

  /**
   * Fresh-account default pick. B's workspace selection is server-side state
   * and a new account has NO current workspace, so every workspace-scoped
   * call fails `403 missing_principal` until something selects one. The
   * client picks a LOCAL default — the OD-active selection when listed, else
   * the personal workspace, else the first active membership — and persists
   * it locally only. It never PUTs B's Active Workspace (handoff rule: only a
   * deliberate user switch may), with a failure cooldown so the poller can't
   * hammer the directory.
   *
   * `prefetched` lets a caller that already fetched the directory this same
   * tick (`resolvePinnedWorkspace`, right after confirming the old pin is
   * gone) reuse that result instead of round-tripping B a second time.
   */
  async function pickDefaultWorkspace(
    session: VelaSession,
    prefetched?: WorkspaceDirectoryFetchResult,
  ): Promise<WorkspaceDirectoryItem | null> {
    if (Date.now() - lastBootstrapFailureAt < BOOTSTRAP_FAILURE_COOLDOWN_MS) return null;
    const result =
      prefetched ??
      (await fetchVelaWorkspaceDirectory({ fetch: fetchImpl, readSession: () => session, timeoutMs }));
    const preferredId = options.getActiveWorkspaceId?.()?.trim();
    const pick = selectDefaultCandidate(result.items, preferredId);
    if (!pick) {
      lastBootstrapFailureAt = Date.now();
      return null;
    }
    return pick;
  }

  /**
   * Resolve the LOCALLY pinned workspace against the membership directory.
   * This is the ONLY place that may clear a bad pin, and it must tell apart
   * two very different situations behind `contextFromDirectory` returning
   * null before this fix — B genuinely confirming the membership is gone,
   * vs. B simply being unreachable for this one request:
   *
   *  - The directory request itself FAILS (network error, timeout, non-2xx)
   *    → B did not answer, so nothing was confirmed. The pin is left exactly
   *    as-is and this resolves to null, matching the existing degrade-to-
   *    single-player behavior for one poll tick. A momentary B outage must
   *    never evict an online user from their current workspace.
   *  - The directory request SUCCEEDS and the pinned workspace IS listed
   *    with an active membership → synthesize its context; the pin is
   *    correct and stays untouched.
   *  - The directory request SUCCEEDS and the pinned workspace is ABSENT (or
   *    listed with a non-active membership / deleted lifecycle) → this is a
   *    CONFIRMED removal. The stale pin is cleared and this same call falls
   *    through to the same local-default bootstrap a fresh account gets
   *    (personal workspace first), so the very next context read already
   *    recovers to a workspace the user can actually use — instead of
   *    `current()` returning null forever, which the web client reads as
   *    "signed out" (recvqbbQ4yljNC: member removed from a team could not
   *    log back into ANY workspace, including personal).
   */
  async function resolvePinnedWorkspace(
    session: VelaSession,
    workspaceId: string,
  ): Promise<WorkspaceCollabContext | null> {
    const result = await fetchVelaWorkspaceDirectory({
      fetch: fetchImpl,
      readSession: () => session,
      timeoutMs,
    });
    if (!result.ok) return null; // B unreachable — preserve the pin, confirm nothing.
    const item = result.items.find(
      (entry) =>
        entry.workspaceId === workspaceId &&
        entry.memberStatus === 'active' &&
        entry.lifecycleState !== 'deleted',
    );
    if (item) return workspaceContextFromDirectoryItem(item);
    // Confirmed stale: the directory answered and this workspace no longer
    // has the caller as an active member. Purge the pin before anything else
    // reads it, then recover exactly like the fresh-account bootstrap.
    await options.clearLocalSelection?.();
    const fallback = await pickDefaultWorkspace(session, result);
    if (!fallback) return null;
    await options.setLocalSelection?.(fallback.workspaceId);
    return workspaceContextFromDirectoryItem(fallback);
  }

  async function resolveCurrent(
    req: WorkspaceContextRequest,
  ): Promise<WorkspaceCollabContext | null> {
      const session = readSession();
      if (!session || !session.controlKey || !session.apiUrl) return null;
      try {
        const explicitSelection = req.workspaceId?.trim() || undefined;
        // The no-argument fallback is legacy compatibility only. Client-facing
        // routes use resolveExact and cannot borrow this daemon-local pin.
        const localSelection =
          explicitSelection ?? (options.getActiveWorkspaceId?.()?.trim() || undefined);
        // B's current is enrichment, not authority (explicit-workspace
        // handoff): the daemon serves the LOCALLY pinned workspace. B's
        // answer is adopted only when it matches — a switch made on another
        // device/surface must not re-aim this daemon.
        const response = await fetchCurrent(session, localSelection);
        if (response.ok) {
          const body: unknown = await response.json();
          const mapped = mapVelaWorkspaceContext(body);
          if (mapped && (!localSelection || mapped.workspaceId === localSelection)) {
            return withDisplayName(mapped, session);
          }
          if (localSelection) {
            // Server disagrees with the pinned scope → synthesize from the
            // membership directory instead of silently following the server.
            return withDisplayName(await resolvePinnedWorkspace(session, localSelection), session);
          }
          return null;
        }
        // 401 = signed out at the vela layer → single-player, never bootstrap.
        if (response.status === 401) return null;
        const missingPrincipal =
          response.status === 403 && (await responseIsMissingPrincipal(response));
        if (localSelection) {
          // The pinned workspace could not be read from current — resolve it
          // from the directory (clears the pin only on a CONFIRMED removal).
          return withDisplayName(await resolvePinnedWorkspace(session, localSelection), session);
        }
        if (missingPrincipal) {
          // Fresh account: B has no current workspace and the client has no
          // selection. Pick a LOCAL default (personal first) — no PUT.
          const picked = await pickDefaultWorkspace(session);
          if (!picked) return null;
          await options.setLocalSelection?.(picked.workspaceId);
          return withDisplayName(workspaceContextFromDirectoryItem(picked), session);
        }
        return null;
      } catch {
        // Never let a workspace-context failure throw into collab — degrade to
        // single-player. A transient B outage must not break the local editor.
        return null;
      }
  }

  async function resolveExact(
    req: WorkspaceContextRequest & { workspaceId: string },
  ): Promise<WorkspaceCollabContext | null> {
    const session = readSession();
    const workspaceId = req.workspaceId.trim();
    if (!session || !session.controlKey || !session.apiUrl || !workspaceId) return null;
    try {
      const response = await fetchCurrent(session, workspaceId);
      if (response.ok) {
        const mapped = mapVelaWorkspaceContext(await response.json());
        if (mapped?.workspaceId === workspaceId) {
          return withDisplayName(mapped, session);
        }
      } else if (response.status === 401) {
        return null;
      }
      const directory = await fetchVelaWorkspaceDirectory({
        fetch: fetchImpl,
        readSession: () => session,
        timeoutMs,
      });
      if (!directory.ok) return null;
      const item = directory.items.find(
        (entry) =>
          entry.workspaceId === workspaceId
          && entry.memberStatus === 'active'
          && entry.lifecycleState !== 'deleted',
      );
      return item
        ? withDisplayName(workspaceContextFromDirectoryItem(item), session)
        : null;
    } catch {
      return null;
    }
  }

  return {
    current: resolveCurrent,
    resolveExact,
  };
}

async function responseIsMissingPrincipal(response: Response): Promise<boolean> {
  try {
    const body: unknown = await response.json();
    return JSON.stringify(body).includes('missing_principal');
  } catch {
    return false;
  }
}

/**
 * Synthesize a workspace context from a membership directory item — the
 * explicit-workspace path where B's `current` is absent or disagrees with the
 * client's pinned scope. The directory carries identity + role + lifecycle;
 * billing-plane fields default conservatively (no plan, derived permissions)
 * until a per-workspace context endpoint exists on B.
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
  };
  const settingsUrl = resolveWorkspaceSettingsUrl(item.workspaceId, undefined);
  if (settingsUrl) context.workspaceSettingsUrl = settingsUrl;
  if (item.workspaceName) context.workspaceName = item.workspaceName;
  if (item.workspaceType === 'team') {
    context.teamId = item.workspaceId;
    context.teamName = item.workspaceName;
  }
  return context;
}

function withDisplayName(
  context: WorkspaceCollabContext | null,
  session: { user: VelaUser | null },
): WorkspaceCollabContext | null {
  if (context && !context.displayName) {
    const displayName = velaUserDisplayName(session.user);
    if (displayName) context.displayName = displayName;
  }
  return context;
}

function velaUserDisplayName(user: VelaUser | null): string {
  const name = str(user?.name);
  if (name) return name;
  const email = str(user?.email);
  if (email) return email;
  return str(user?.id);
}

/**
 * Result of a directory fetch attempt. `ok` is the load-bearing bit for
 * anything that decides whether to trust an absence as a CONFIRMED removal
 * (see `resolvePinnedWorkspace`): true only when B actually answered with a
 * 2xx — false for a network error, an abort/timeout, or any non-2xx status,
 * regardless of what (if anything) `items` ends up holding.
 */
export interface WorkspaceDirectoryFetchResult {
  ok: boolean;
  items: WorkspaceDirectoryItem[];
}

/**
 * Cheap, non-secret cache partition for the local Vela session. A credential
 * rotation/account switch must never reuse the prior member directory, even
 * within the short success TTL.
 */
export function velaWorkspaceDirectoryIdentity(
  readSession: typeof readVelaControlApiContext = readVelaControlApiContext,
): string {
  const session = readSession();
  if (!session?.controlKey || !session.apiUrl) return 'signed-out';
  const credentialFingerprint = createHash('sha256')
    .update(session.controlKey)
    .digest('hex')
    .slice(0, 16);
  return [
    session.profile ?? '',
    session.apiUrl,
    session.user?.id ?? '',
    session.configMtimeMs ?? '',
    credentialFingerprint,
  ].join(':');
}

/**
 * One daemon-owned authority broker shared by idempotent reads and mutations.
 *
 * Successful authority reads seed a bounded display-read lease. Mutations
 * ignore that settled lease and always perform a fresh directory read, while
 * still sharing an already-unsettled request from the same Vela session. This
 * keeps the 5s status poll off the control plane without weakening mutation
 * freshness, and prevents a status/heartbeat boundary from launching duplicate
 * directory requests.
 */
export function createWorkspaceDirectoryAuthorityBroker(options: {
  fetchDirectory?: () => Promise<WorkspaceDirectoryFetchResult>;
  identityKey?: () => string;
  ttlMs?: number;
  now?: () => number;
} = {}): {
  read: () => Promise<WorkspaceDirectoryFetchResult>;
  fresh: () => Promise<WorkspaceDirectoryFetchResult>;
  refreshAfterMutation: () => Promise<WorkspaceDirectoryFetchResult>;
} {
  const fetchDirectory =
    options.fetchDirectory ?? (() => fetchVelaWorkspaceDirectory());
  const identityKey = options.identityKey ?? velaWorkspaceDirectoryIdentity;
  const ttlMs = Math.max(0, options.ttlMs ?? DEFAULT_DIRECTORY_CACHE_TTL_MS);
  const now = options.now ?? Date.now;
  const cached = new Map<
    string,
    { expiresAt: number; result: WorkspaceDirectoryFetchResult }
  >();
  const inFlight = new Map<string, Promise<WorkspaceDirectoryFetchResult>>();

  const start = (
    identity: string,
  ): Promise<WorkspaceDirectoryFetchResult> => {
    const pending = inFlight.get(identity);
    if (pending) return pending;
    const request = fetchDirectory()
      .then((result) => {
        if (result.ok) {
          cached.set(identity, { expiresAt: now() + ttlMs, result });
        }
        return result;
      })
      .finally(() => {
        if (inFlight.get(identity) === request) inFlight.delete(identity);
      });
    inFlight.set(identity, request);
    return request;
  };

  return {
    read: () => {
      const identity = identityKey();
      const cachedEntry = cached.get(identity);
      if (cachedEntry && now() < cachedEntry.expiresAt) {
        return Promise.resolve(cachedEntry.result);
      }
      return start(identity);
    },
    fresh: () => start(identityKey()),
    refreshAfterMutation: async () => {
      // A read that started before the remote mutation can still be in flight
      // after the mutation commits. Drain it, then deliberately start another
      // fetch so the settled lease is based on post-mutation authority.
      const identity = identityKey();
      const pending = inFlight.get(identity);
      if (pending) await pending.catch(() => undefined);
      cached.delete(identity);
      return start(identityKey());
    },
  };
}

/**
 * Compatibility wrapper for callers that only need the bounded read lease.
 * Production daemon wiring uses one shared broker for reads and mutations.
 */
export function createCachedWorkspaceDirectoryFetcher(options: {
  fetchDirectory?: () => Promise<WorkspaceDirectoryFetchResult>;
  identityKey?: () => string;
  ttlMs?: number;
  now?: () => number;
} = {}): () => Promise<WorkspaceDirectoryFetchResult> {
  return createWorkspaceDirectoryAuthorityBroker(options).read;
}

/**
 * Mutation authorization must not reuse a settled directory result, but
 * concurrent checks from the same Vela session may share one authority read.
 * Partitioning the in-flight request by session identity prevents an account
 * switch from authorizing account B with account A's membership directory.
 */
export function createFreshWorkspaceDirectoryFetcher(options: {
  fetchDirectory?: () => Promise<WorkspaceDirectoryFetchResult>;
  identityKey?: () => string;
} = {}): () => Promise<WorkspaceDirectoryFetchResult> {
  return createWorkspaceDirectoryAuthorityBroker(options).fresh;
}

export async function fetchVelaWorkspaceDirectory(
  options: VelaWorkspaceContextOptions = {},
): Promise<WorkspaceDirectoryFetchResult> {
  const fetchImpl = options.fetch ?? fetch;
  const readSession = options.readSession ?? readVelaControlApiContext;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const session = readSession();
  // No local Vela session is an authoritative signed-out identity, not an
  // authority outage. Returning a successful empty directory lets clients
  // clear a previously cached Team selection instead of preserving it forever.
  if (!session || !session.controlKey || !session.apiUrl) return { ok: true, items: [] };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(new URL('/api/v1/workspaces', session.apiUrl), {
      method: 'GET',
      headers: { authorization: `Bearer ${session.controlKey}` },
      signal: controller.signal,
    });
    if (!response.ok) return { ok: false, items: [] };
    return { ok: true, items: mapVelaWorkspaceDirectory(await response.json()) };
  } catch {
    return { ok: false, items: [] };
  } finally {
    clearTimeout(timeout);
  }
}

export async function listVelaWorkspaceDirectory(
  options: VelaWorkspaceContextOptions = {},
): Promise<WorkspaceDirectoryItem[]> {
  return (await fetchVelaWorkspaceDirectory(options)).items;
}

/**
 * Select the workspace-context provider for this run. `OD_WORKSPACE_CONTEXT_SOURCE
 * =vela` opts into the real B-backed provider (production / e2e against a live
 * vela); every other value keeps the dev stub, so demo and tools-dev runs — which
 * have no B and drive the context via the dev PUT — are unaffected.
 */
export function createWorkspaceContextProviderFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  options: Pick<
    VelaWorkspaceContextOptions,
    'getActiveWorkspaceId' | 'setLocalSelection' | 'clearLocalSelection'
  > = {},
): WorkspaceContextProvider {
  if (env.OD_WORKSPACE_CONTEXT_SOURCE?.trim() === 'vela') {
    return createVelaWorkspaceContextProvider(options);
  }
  return createDevWorkspaceContextProvider();
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function billingStateFromLifecycle(
  lifecycleState: WorkspaceLifecycleState,
): WorkspaceBillingState {
  if (lifecycleState === 'billing_past_due') return 'past_due';
  if (lifecycleState === 'locked') return 'locked';
  if (lifecycleState === 'deleting' || lifecycleState === 'deleted') {
    return 'inactive';
  }
  return 'active';
}

function parseSeatSummary(value: unknown): WorkspaceSeatSummary {
  if (value && typeof value === 'object') {
    const raw = value as Record<string, unknown>;
    if (typeof raw.seatLimit === 'number' && typeof raw.usedSeats === 'number') {
      // Re-derive availableSeats/isSeatFull from the authoritative counts so a
      // stale or inconsistent summary can never disagree with itself.
      return buildWorkspaceSeatSummary({ seatLimit: raw.seatLimit, usedSeats: raw.usedSeats });
    }
  }
  return buildWorkspaceSeatSummary({ seatLimit: 0, usedSeats: 0 });
}

function parsePermissions(value: unknown): WorkspacePermissions | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const keys: (keyof WorkspacePermissions)[] = [
    'canManageMembers',
    'canManageBilling',
    'canInviteMembers',
    'canManageAutoRecharge',
    'canShareProjects',
    'canWriteSyncedFiles',
    'canViewWorkspaceSettings',
    'canManageSharedResources',
  ];
  const permissions = {} as WorkspacePermissions;
  for (const key of keys) {
    if (typeof raw[key] !== 'boolean') return null;
    permissions[key] = raw[key] as boolean;
  }
  return permissions;
}

function parseBillingRecovery(
  value: unknown,
): { canEnterBillingRecovery: boolean; recoveryUrl: string | null } | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.canEnterBillingRecovery !== 'boolean') return null;
  return {
    canEnterBillingRecovery: raw.canEnterBillingRecovery,
    recoveryUrl: typeof raw.recoveryUrl === 'string' ? raw.recoveryUrl : null,
  };
}
