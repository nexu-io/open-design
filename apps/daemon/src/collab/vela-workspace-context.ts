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
import {
  markVelaAuthorizationExpired,
  readVelaControlApiContext,
  type VelaControlApiContext,
  type VelaUser,
} from '../integrations/vela.js';
import type { HubEventsEndpoint } from './hub-events-subscriber.js';
import {
  createDevWorkspaceContextProvider,
  resolveWorkspaceSettingsUrl,
  type WorkspaceContextProvider,
  type WorkspaceContextRequest,
} from './workspace-context.js';

// Real B-integration provider (T2). The daemon reuses the SAME vela login session
// that AMR / the vela CLI use — `readVelaControlApiContext` reads the control key
// + api url from ~/.amr/config.json (or env) — and reads B's authenticated
// workspace membership directory. The locally persisted selection decides which
// directory entry is current for THIS client; B's account-global "current"
// selection is deliberately outside this path. No second identity: one vela
// session drives AMR, resource sharing, and the workspace context. Any failure
// (no session, signed out, B unreachable) degrades to null → collab stays
// single-player, never throws.

const DEFAULT_TIMEOUT_MS = 8_000;
// Read authorization is display-only and is polled every 5s by an open shared
// project. Keep the successful lease comfortably wider than that cadence so a
// poll cannot expire the lease at the exact instant it is meant to reuse it.
// Mutations never consume this lease: `fresh()` below always performs (or joins)
// an unsettled authoritative read.
const DEFAULT_DIRECTORY_CACHE_TTL_MS = 15_000;
// A failed authority read must not turn every visible fallback surface into a
// fresh upstream attempt. The first failure opens a short, jittered process-
// local circuit; repeated failed probes grow to a two-minute base plus bounded
// positive jitter. Successful reads and authoritative invalidations reset the
// circuit immediately.
const DEFAULT_DIRECTORY_FAILURE_BACKOFF_MIN_MS = 15_000;
const DEFAULT_DIRECTORY_FAILURE_BACKOFF_MAX_MS = 120_000;

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
  /** Reuse the daemon's account-scoped directory authority broker. */
  fetchWorkspaceDirectory?: () => Promise<WorkspaceDirectoryFetchResult>;
  /** Injectable for tests; defaults to reading ~/.amr/config.json + env. */
  readSession?: typeof readVelaControlApiContext;
  /** Settings-backed AMR environment used by the daemon's agent launcher. */
  configuredEnv?: Record<string, string> | (() => Record<string, string>);
  /**
   * Legacy default for no-argument `current()` and fresh-account bootstrap.
   * Exact request resolution never reads it.
   */
  getActiveWorkspaceId?: () => string | null | undefined;
  /**
   * Persist a directory-derived bootstrap or recovery choice only while the
   * inspected LOCAL selection is still current. Returns the selection that
   * wins against user switches already queued during persistence. This never
   * reads or writes B's account-level Active Workspace.
   */
  replaceLocalSelection?: (
    expectedWorkspaceId: string | null,
    workspaceId: string,
  ) => string | null | Promise<string | null>;
  timeoutMs?: number;
}

/**
 * Map a rich workspace-context body onto our WorkspaceCollabContext. The invite
 * continuation response still carries this shape even though ordinary client
 * startup no longer calls B's account-global current-workspace endpoint. This
 * is a near pass-through with two adjustments:
 *  - `teamId` is derived as `workspaceId` for a team workspace: B has no separate
 *    team id — the workspace IS the team scope the resource hub keys resources by.
 *  - `permissions` / `seatSummary` are trusted from B when well-formed, and
 *    defensively re-derived (so read-only gating never breaks) if B omits them.
 * Returns null when a required field is missing or an enum is out of range —
 * collab then stays dormant rather than acting on a malformed context.
 */
export function mapVelaWorkspaceContext(
  input: unknown,
  configuredEnv: Record<string, string> = {},
): WorkspaceCollabContext | null {
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
    process.env,
    configuredEnv,
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
  const configuredEnv = () => typeof options.configuredEnv === 'function'
    ? options.configuredEnv()
    : (options.configuredEnv ?? {});
  const readWorkspaceDirectory = (
    session: VelaSession,
    selectedEnv: Record<string, string>,
  ) => options.fetchWorkspaceDirectory?.() ?? fetchVelaWorkspaceDirectory({
    fetch: fetchImpl,
    readSession: () => session,
    configuredEnv: selectedEnv,
    timeoutMs,
  });

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
   * Pick a local bootstrap/recovery workspace from an already-authenticated
   * membership directory. This is used only when this client has no saved
   * selection or its saved membership was authoritatively removed.
   */
  function pickDefaultWorkspace(
    result: WorkspaceDirectoryFetchResult,
  ): WorkspaceDirectoryItem | null {
    const preferredId = options.getActiveWorkspaceId?.()?.trim();
    const pick = selectDefaultCandidate(result.items, preferredId);
    return pick ?? null;
  }

  async function resolveCurrent(
    req: WorkspaceContextRequest,
  ): Promise<WorkspaceCollabContext | null> {
    const selectedEnv = configuredEnv();
    const session = readSession(process.env, selectedEnv);
    if (!session || !session.controlKey || !session.apiUrl) return null;
    try {
      const directory = await readWorkspaceDirectory(session, selectedEnv);
      // A failed directory read confirms nothing. In particular, never evict
      // the local pin on a timeout, auth outage, or non-2xx response.
      if (!directory.ok) return null;

      const explicitSelection = req.workspaceId?.trim() || undefined;
      const localSelection =
        explicitSelection ?? (options.getActiveWorkspaceId?.()?.trim() || undefined);
      if (localSelection) {
        const selected = directory.items.find(
          (entry) =>
            entry.workspaceId === localSelection &&
            entry.memberStatus === 'active' &&
            entry.lifecycleState !== 'deleted',
        );
        if (selected) {
          return withUserIdentity(
            workspaceContextFromDirectoryItem(selected, selectedEnv),
            session,
          );
        }
        // An exact request must not mutate or fall back from the caller's
        // workspace. Only a confirmed-stale daemon-local pin is recoverable.
        if (explicitSelection) return null;
      }

      const fallback = pickDefaultWorkspace(directory);
      if (!fallback) return null;
      const winningSelection = await options.replaceLocalSelection?.(
        localSelection ?? null,
        fallback.workspaceId,
      );
      if (winningSelection !== undefined && winningSelection !== fallback.workspaceId) {
        const concurrent = directory.items.find(
          (entry) =>
            entry.workspaceId === winningSelection
            && entry.memberStatus === 'active'
            && entry.lifecycleState !== 'deleted',
        );
        return concurrent
          ? withUserIdentity(
              workspaceContextFromDirectoryItem(concurrent, selectedEnv),
              session,
            )
          : null;
      }
      return withUserIdentity(
        workspaceContextFromDirectoryItem(fallback, selectedEnv),
        session,
      );
    } catch {
      // Never let a workspace-context failure throw into collab — degrade to
      // single-player. A transient B outage must not break the local editor.
      return null;
    }
  }

  async function resolveExact(
    req: WorkspaceContextRequest & { workspaceId: string },
  ): Promise<WorkspaceCollabContext | null> {
    const selectedEnv = configuredEnv();
    const session = readSession(process.env, selectedEnv);
    const workspaceId = req.workspaceId.trim();
    if (!session || !session.controlKey || !session.apiUrl || !workspaceId) return null;
    try {
      const directory = await readWorkspaceDirectory(session, selectedEnv);
      if (!directory.ok) return null;
      const item = directory.items.find(
        (entry) =>
          entry.workspaceId === workspaceId
          && entry.memberStatus === 'active'
          && entry.lifecycleState !== 'deleted',
      );
      return item
        ? withUserIdentity(workspaceContextFromDirectoryItem(item, selectedEnv), session)
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

/**
 * Synthesize a workspace context from the locally selected membership
 * directory item. The directory carries identity + role + lifecycle;
 * billing-plane fields default conservatively (no plan, derived permissions)
 * until a per-workspace context endpoint exists on B.
 */
export function workspaceContextFromDirectoryItem(
  item: WorkspaceDirectoryItem,
  configuredEnv: Record<string, string> = {},
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
  const settingsUrl = resolveWorkspaceSettingsUrl(
    item.workspaceId,
    undefined,
    process.env,
    configuredEnv,
  );
  if (settingsUrl) context.workspaceSettingsUrl = settingsUrl;
  if (item.workspaceName) context.workspaceName = item.workspaceName;
  if (item.workspaceType === 'team') {
    context.teamId = item.workspaceId;
    context.teamName = item.workspaceName;
  }
  return context;
}

function withUserIdentity(
  context: WorkspaceCollabContext | null,
  session: { user: VelaUser | null },
): WorkspaceCollabContext | null {
  if (context && !context.displayName) {
    const displayName = velaUserDisplayName(session.user);
    if (displayName) context.displayName = displayName;
  }
  if (context && context.avatarUrl === undefined) {
    const avatarUrl = str(session.user?.image);
    if (avatarUrl) context.avatarUrl = avatarUrl;
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
 * anything that decides whether to trust an absence as a CONFIRMED removal:
 * true only when B actually answered with a 2xx — false for a network error,
 * an abort/timeout, or any non-2xx status, regardless of what (if anything)
 * `items` ends up holding.
 */
export interface WorkspaceDirectoryFetchResult {
  ok: boolean;
  items: WorkspaceDirectoryItem[];
  reason?: 'unauthorized' | 'upstream' | 'network';
  status?: number;
}

/**
 * Cheap, non-secret cache partition for the local Vela session. A credential
 * rotation/account switch must never reuse the prior member directory, even
 * within the short success TTL.
 */
export function velaWorkspaceDirectoryIdentity(
  readSession: typeof readVelaControlApiContext = readVelaControlApiContext,
  configuredEnv: Record<string, string> = {},
): string {
  const session = readSession(process.env, configuredEnv);
  return velaWorkspaceDirectoryIdentityForSession(session);
}

/**
 * Derive the cache/stream identity from an already captured control session.
 * Callers that also build an authenticated request should use this form so the
 * URL, credential, and identity can never be assembled from different env
 * snapshots.
 */
export function velaWorkspaceDirectoryIdentityForSession(
  session: VelaControlApiContext | null,
): string {
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

/** Build one Vela hub endpoint from one captured control session. */
function createVelaWorkspaceHubEventsEndpoint(
  session: VelaControlApiContext | null,
  workspaceIdInput: string,
): HubEventsEndpoint | null {
  const workspaceId = workspaceIdInput.trim();
  if (!workspaceId || !session?.controlKey || !session.apiUrl) return null;
  return {
    url: new URL('/api/v1/collab/events', session.apiUrl).toString(),
    workspaceId,
    identityKey: velaWorkspaceDirectoryIdentityForSession(session),
    headers: {
      authorization: `Bearer ${session.controlKey}`,
      'x-vela-workspace-id': workspaceId,
    },
  };
}

/**
 * Resolve a single merged session, then derive every authenticated hub field
 * from that immutable snapshot.
 */
export function resolveVelaWorkspaceHubEventsEndpoint(
  workspaceId: string,
  env: NodeJS.ProcessEnv = process.env,
  configuredEnv: Record<string, string> = {},
): HubEventsEndpoint | null {
  return createVelaWorkspaceHubEventsEndpoint(
    readVelaControlApiContext(env, configuredEnv),
    workspaceId,
  );
}

/**
 * One daemon-owned authority broker shared by idempotent reads and mutations.
 *
 * Successful authority reads seed a bounded display-read lease. General
 * mutations ignore that settled success lease and perform a fresh directory
 * read, while still sharing an already-unsettled request and a short outage
 * circuit from the same Vela session. The cached-only accessor never starts
 * I/O; its one production consumer may use a valid same-session lease for
 * personal local-only project cleanup, then falls back to fresh authority on
 * every miss. This keeps the 5s status poll off the control plane without
 * weakening Team/hub mutation freshness, and prevents a status/heartbeat
 * boundary from launching duplicate directory requests.
 */
export function createWorkspaceDirectoryAuthorityBroker(options: {
  fetchDirectory?: () => Promise<WorkspaceDirectoryFetchResult>;
  identityKey?: () => string;
  ttlMs?: number;
  failureBackoffMinMs?: number;
  failureBackoffMaxMs?: number;
  now?: () => number;
  random?: () => number;
  onDecision?: (input: {
    source: 'cache' | 'directory';
    reason:
      | 'cold'
      | 'lease_hit'
      | 'lease_expired'
      | 'in_flight'
      | 'failure_backoff'
      | 'fresh';
    outcome: 'allow' | 'deny' | 'unavailable' | 'fallback';
    ageMs?: number;
  }) => void;
  onSuppressedRequest?: (input: {
    source: 'directory';
    reason: 'lease_hit' | 'in_flight' | 'failure_backoff';
  }) => void;
  onInvalidation?: (input: {
    source: 'cache';
    reason: 'mutation' | 'event_dirty' | 'auth_reject' | 'catch_up';
  }) => void;
  /** Called only when a successful result belongs to the current generation. */
  onAcceptedResult?: (
    result: WorkspaceDirectoryFetchResult,
    identity: string,
  ) => void;
} = {}): {
  cached: () => Promise<WorkspaceDirectoryFetchResult>;
  read: () => Promise<WorkspaceDirectoryFetchResult>;
  /** User-initiated authority probe: ignores a settled outage circuit. */
  fresh: () => Promise<WorkspaceDirectoryFetchResult>;
  /** Background fresh read: shares the account-wide outage circuit. */
  backgroundFresh: () => Promise<WorkspaceDirectoryFetchResult>;
  /** Keep successful display reads alive while account-directory SSE is strict. */
  setRealtimeHealthy: (healthy: boolean) => void;
  /** Retire every identity partition and fence all unsettled directory reads. */
  resetIdentity: () => void;
  invalidate: (reason?: 'event_dirty' | 'auth_reject' | 'catch_up') => void;
  refreshAfterMutation: () => Promise<WorkspaceDirectoryFetchResult>;
} {
  const fetchDirectory =
    options.fetchDirectory ?? (() => fetchVelaWorkspaceDirectory());
  const identityKey = options.identityKey ?? velaWorkspaceDirectoryIdentity;
  const ttlMs = Math.max(0, options.ttlMs ?? DEFAULT_DIRECTORY_CACHE_TTL_MS);
  const failureBackoffMinMs = Math.max(
    1,
    options.failureBackoffMinMs ?? DEFAULT_DIRECTORY_FAILURE_BACKOFF_MIN_MS,
  );
  const failureBackoffMaxMs = Math.max(
    failureBackoffMinMs,
    options.failureBackoffMaxMs ?? DEFAULT_DIRECTORY_FAILURE_BACKOFF_MAX_MS,
  );
  const now = options.now ?? Date.now;
  const random = options.random ?? Math.random;
  const cached = new Map<
    string,
    {
      generation: number;
      expiresAt: number;
      result: WorkspaceDirectoryFetchResult;
    }
  >();
  const inFlight = new Map<
    string,
    {
      generation: number;
      request: Promise<WorkspaceDirectoryFetchResult>;
    }
  >();
  const generations = new Map<string, number>();
  const failures = new Map<
    string,
    {
      result: WorkspaceDirectoryFetchResult;
      retryAt: number;
      nextDelayMs: number;
    }
  >();
  let realtimeHealthyIdentity: string | null = null;

  const generationFor = (identity: string): number =>
    generations.get(identity) ?? 0;

  const invalidateIdentity = (
    identity: string,
    preserveFailure = false,
  ): void => {
    generations.set(identity, generationFor(identity) + 1);
    cached.delete(identity);
    if (!preserveFailure) failures.delete(identity);
  };

  const resetIdentity = (): void => {
    const identities = new Set([
      ...generations.keys(),
      ...cached.keys(),
      ...inFlight.keys(),
      ...failures.keys(),
    ]);
    for (const identity of identities) invalidateIdentity(identity);
    realtimeHealthyIdentity = null;
  };

  const failureBackoffHit = (
    identity: string,
  ): WorkspaceDirectoryFetchResult | null => {
    const failure = failures.get(identity);
    if (!failure) return null;
    if (now() >= failure.retryAt) return null;
    recordDecision({
      source: 'cache',
      reason: 'failure_backoff',
      outcome: 'unavailable',
    });
    options.onSuppressedRequest?.({
      source: 'directory',
      reason: 'failure_backoff',
    });
    return failure.result;
  };

  const rememberFailure = (
    identity: string,
    result: WorkspaceDirectoryFetchResult,
  ): void => {
    // Authentication rejection has its own credential-revision state machine.
    // Do not hide a newly refreshed credential behind the old identity's
    // transport circuit if an integration returns the same fingerprint.
    if (result.reason === 'unauthorized') {
      failures.delete(identity);
      return;
    }
    const prior = failures.get(identity);
    const delayMs = prior?.nextDelayMs ?? failureBackoffMinMs;
    // Positive jitter in [100%, 150%) spreads a fleet-wide outage without ever
    // retrying faster than the configured base floor. `failureBackoffMaxMs`
    // caps the exponential base; keeping jitter above that base is what avoids
    // every daemon re-synchronizing once the streak reaches its ceiling.
    const jitteredDelayMs = Math.max(
      1,
      Math.floor(
        delayMs
        * (1 + Math.min(0.999_999, Math.max(0, random())) * 0.5),
      ),
    );
    failures.set(identity, {
      result,
      retryAt: now() + jitteredDelayMs,
      nextDelayMs: Math.min(delayMs * 2, failureBackoffMaxMs),
    });
  };

  const recordDecision = (
    input: Parameters<NonNullable<typeof options.onDecision>>[0],
  ): void => {
    options.onDecision?.(input);
  };

  const start = (
    identity: string,
    reason: 'cold' | 'lease_expired' | 'fresh',
  ): Promise<WorkspaceDirectoryFetchResult> => {
    const generation = generationFor(identity);
    const pending = inFlight.get(identity);
    if (pending?.generation === generation) {
      options.onSuppressedRequest?.({ source: 'directory', reason: 'in_flight' });
      return pending.request;
    }
    const request = fetchDirectory()
      .then((result) => {
        if (result.ok && generationFor(identity) === generation) {
          failures.delete(identity);
          cached.set(identity, {
            generation,
            expiresAt: now() + ttlMs,
            result,
          });
          options.onAcceptedResult?.(result, identity);
        } else if (!result.ok && generationFor(identity) === generation) {
          rememberFailure(identity, result);
        }
        recordDecision({
          source: 'directory',
          reason,
          outcome: result.ok ? 'allow' : 'unavailable',
        });
        return result;
      })
      .catch((error) => {
        recordDecision({
          source: 'directory',
          reason,
          outcome: 'unavailable',
        });
        throw error;
      })
      .finally(() => {
        if (inFlight.get(identity)?.request === request) {
          inFlight.delete(identity);
        }
      });
    inFlight.set(identity, { generation, request });
    return request;
  };

  return {
    cached: () => {
      const identity = identityKey();
      const cachedEntry = cached.get(identity);
      if (
        cachedEntry
        && cachedEntry.generation === generationFor(identity)
        && now() < cachedEntry.expiresAt
      ) {
        const ageMs = Math.max(0, ttlMs - (cachedEntry.expiresAt - now()));
        recordDecision({
          source: 'cache',
          reason: 'lease_hit',
          outcome: 'allow',
          ageMs,
        });
        options.onSuppressedRequest?.({ source: 'directory', reason: 'lease_hit' });
        return Promise.resolve(cachedEntry.result);
      }
      const reason = cachedEntry ? 'lease_expired' : 'cold';
      recordDecision({ source: 'cache', reason, outcome: 'fallback' });
      return Promise.resolve({ ok: false, items: [] });
    },
    read: () => {
      const identity = identityKey();
      const cachedEntry = cached.get(identity);
      if (
        cachedEntry
        && cachedEntry.generation === generationFor(identity)
        && (
          now() < cachedEntry.expiresAt
          || realtimeHealthyIdentity === identity
        )
      ) {
        const ageMs = Math.max(0, ttlMs - (cachedEntry.expiresAt - now()));
        recordDecision({
          source: 'cache',
          reason: 'lease_hit',
          outcome: 'allow',
          ageMs,
        });
        options.onSuppressedRequest?.({ source: 'directory', reason: 'lease_hit' });
        return Promise.resolve(cachedEntry.result);
      }
      const backoffResult = failureBackoffHit(identity);
      if (backoffResult) return Promise.resolve(backoffResult);
      const reason = cachedEntry ? 'lease_expired' : 'cold';
      cached.delete(identity);
      return start(identity, reason);
    },
    fresh: () => start(identityKey(), 'fresh'),
    backgroundFresh: () => {
      const identity = identityKey();
      const backoffResult = failureBackoffHit(identity);
      return backoffResult
        ? Promise.resolve(backoffResult)
        : start(identity, 'fresh');
    },
    setRealtimeHealthy: (healthy) => {
      const identity = identityKey();
      realtimeHealthyIdentity = healthy ? identity : null;
    },
    resetIdentity,
    invalidate: (reason = 'event_dirty') => {
      // A dirty event voids successful state, but a sustained event storm must
      // not punch through the account-wide outage circuit on every frame.
      // Explicit catch-up/auth boundaries and successful mutations remain
      // stronger signals and still clear the circuit immediately.
      invalidateIdentity(identityKey(), reason === 'event_dirty');
      options.onInvalidation?.({ source: 'cache', reason });
    },
    refreshAfterMutation: async () => {
      // A read that started before the remote mutation can still be in flight
      // after the mutation commits. Drain it, then deliberately start another
      // fetch so the settled lease is based on post-mutation authority.
      const identity = identityKey();
      // The mutation has already succeeded upstream, which is a stronger
      // recovery signal than the old failed directory probe. Refresh its
      // authority immediately instead of waiting behind the read circuit.
      failures.delete(identity);
      const pending = inFlight.get(identity)?.request;
      if (pending) await pending.catch(() => undefined);
      invalidateIdentity(identity);
      options.onInvalidation?.({ source: 'cache', reason: 'mutation' });
      return start(identityKey(), 'fresh');
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
  failureBackoffMinMs?: number;
  failureBackoffMaxMs?: number;
  now?: () => number;
  random?: () => number;
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
  const configuredEnv = typeof options.configuredEnv === 'function'
    ? options.configuredEnv()
    : (options.configuredEnv ?? {});
  const session = readSession(process.env, configuredEnv);
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
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        if (!options.readSession) {
          markVelaAuthorizationExpired(process.env, configuredEnv);
        }
        return {
          ok: false,
          items: [],
          reason: 'unauthorized',
          status: response.status,
        };
      }
      return {
        ok: false,
        items: [],
        reason: 'upstream',
        status: response.status,
      };
    }
    return { ok: true, items: mapVelaWorkspaceDirectory(await response.json()) };
  } catch {
    return { ok: false, items: [], reason: 'network' };
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
    | 'configuredEnv'
    | 'fetchWorkspaceDirectory'
    | 'getActiveWorkspaceId'
    | 'replaceLocalSelection'
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
