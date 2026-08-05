// Hub push-channel consumer for 'project-content-changed' (recvqmKQRiIlYf):
// a teammate published a new version of a shared project, so THIS daemon
// pulls the content proactively — no open tab required — instead of leaving
// freshness to the member web's ~5s status polling. That polling stays
// running untouched as the fallback (and as the ONLY mechanism while the hub
// channel is down); everything here degrades to it: a guard skip, a failed
// pull, or a revoked project simply leaves freshness to the poll loop.
//
// Guard boundary (all fail CLOSED — an uncertain answer skips the pull):
//   - An existing local binding must be a team binding. A newly-shared project
//     with no local binding may bootstrap only from an explicitly scoped hub
//     event. That exact Workspace is resolved through authoritative membership
//     rather than the daemon's mutable global active Workspace. This
//     closes the first-publication gap: the catalog can expose the card before
//     the member has ever opened/materialized it, and waiting for an open tab
//     leaves its files/details absent for tens of seconds.
//   - The pull NEVER runs when this daemon's member owns the project. The
//     owner's local copy is the single writer (see useProjectCollab.ts's
//     member auto-pull gate, which holds the same rule on the web side);
//     pulling over it could clobber unpublished edits. The owner's daemon
//     receives its own publish echo over the SSE channel, so this guard is
//     load-bearing, not defensive.
//   - Event workspace, local binding workspace, and the exact resolved
//     identity must all agree; a mismatch means the event belongs to a scope
//     this daemon must not address with that principal.
//
// Dedup model: a per-project cursor records the version the last successful
// pull materialized, so repeated/out-of-order events for an already-landed
// head are no-ops; an event racing an in-flight pull waits it out and re-runs
// AT MOST once when the cursor is still behind (a newer head arrived while
// pulling). The cursor only advances on a successful pull — failures keep it
// behind so the same-version retry stays possible.

const WITNESS_MAX_AGE_MS = 5_000;
const issuedAuthorizationWitnesses = new WeakSet<object>();
const issuedAuthorizedStageInvocations = new WeakSet<object>();

export interface ProactiveContentPullEvent {
  projectId?: string | undefined;
  workspaceId?: string | undefined;
  version?: number | undefined;
  /** Internal diagnostic origin; never serialized to the hub or web. */
  profileReceivedAtMs?: number | undefined;
}

export interface ProactiveContentPullProjectRef {
  projectId: string;
  ownerMemberId: string;
}

export function activeTeamWorkspaceIdentity(context: {
  workspaceId?: string | null;
  teamId?: string | null;
  workspaceMemberId?: string | null;
  workspaceType?: string | null;
  memberStatus?: string | null;
  lifecycleState?: string | null;
} | null): {
  workspaceId: string;
  resourceTeamId: string;
  workspaceMemberId: string;
} | null {
  const workspaceId = context?.workspaceId?.trim() ?? '';
  const resourceTeamId = context?.teamId?.trim() ?? '';
  const workspaceMemberId = context?.workspaceMemberId?.trim() ?? '';
  if (
    context?.workspaceType !== 'team' ||
    context.memberStatus !== 'active' ||
    context.lifecycleState !== 'active' ||
    !workspaceId ||
    !resourceTeamId ||
    !workspaceMemberId
  ) {
    return null;
  }
  return { workspaceId, resourceTeamId, workspaceMemberId };
}

export interface ProactivePullAuthorizationScope {
  projectId: string;
  workspaceId: string;
  resourceTeamId: string;
  viewerMemberId: string;
  ownerMemberId: string;
}

export interface ProactivePullAuthorizationWitness
  extends ProactivePullAuthorizationScope {
  readonly kind: 'proactive-content-pull';
  readonly version: number;
  readonly verifiedAtMs: number;
}

export interface AuthorizedProactivePullInvocation
  extends ProactivePullAuthorizationScope {
  readonly kind: 'authorized-proactive-stage';
  readonly expectedVersion: number;
  /** Opt-in profiling origin only; never participates in authorization. */
  readonly profileReceivedAtMs?: number;
  readonly isStillExpected: () => boolean;
  readonly signal: AbortSignal;
}

function issueAuthorizedProactivePullInvocation(
  scope: ProactivePullAuthorizationScope,
  expectedVersion: number,
  profileReceivedAtMs: number | undefined,
  isStillExpected: () => boolean,
  signal: AbortSignal,
): AuthorizedProactivePullInvocation {
  const invocation = Object.freeze({
    kind: 'authorized-proactive-stage' as const,
    ...scope,
    expectedVersion,
    ...(profileReceivedAtMs != null ? { profileReceivedAtMs } : {}),
    isStillExpected,
    signal,
  });
  issuedAuthorizedStageInvocations.add(invocation);
  return invocation;
}

export function isAuthorizedProactivePullInvocation(
  invocation: AuthorizedProactivePullInvocation | undefined,
  scope: ProactivePullAuthorizationScope,
  expectedVersion: number | undefined,
): boolean {
  return Boolean(
    isBoundProactivePullInvocation(invocation, scope, expectedVersion) &&
    !invocation!.signal.aborted &&
    invocation!.isStillExpected()
  );
}

export function isBoundProactivePullInvocation(
  invocation: AuthorizedProactivePullInvocation | undefined,
  scope: ProactivePullAuthorizationScope,
  expectedVersion: number | undefined,
): boolean {
  return Boolean(
    invocation &&
    issuedAuthorizedStageInvocations.has(invocation) &&
    Number.isSafeInteger(expectedVersion) &&
    expectedVersion != null &&
    expectedVersion >= 0 &&
    invocation.expectedVersion === expectedVersion &&
    invocation.projectId === scope.projectId &&
    invocation.workspaceId === scope.workspaceId &&
    invocation.resourceTeamId === scope.resourceTeamId &&
    invocation.viewerMemberId === scope.viewerMemberId &&
    invocation.ownerMemberId === scope.ownerMemberId
  );
}

function issueProactivePullAuthorizationWitness(
  scope: ProactivePullAuthorizationScope,
  version: number,
  verifiedAtMs = Date.now(),
): ProactivePullAuthorizationWitness {
  const witness = Object.freeze({
    kind: 'proactive-content-pull' as const,
    ...scope,
    version,
    verifiedAtMs,
  });
  issuedAuthorizationWitnesses.add(witness);
  return witness;
}

export function isFreshProactivePullAuthorizationWitness(
  witness: ProactivePullAuthorizationWitness | undefined,
  scope: ProactivePullAuthorizationScope,
  expectedVersion: number | undefined,
  nowMs = Date.now(),
): boolean {
  if (!witness || !issuedAuthorizationWitnesses.has(witness)) return false;
  const ageMs = nowMs - witness.verifiedAtMs;
  return Boolean(
    expectedVersion != null &&
    Number.isSafeInteger(expectedVersion) &&
    expectedVersion >= 0 &&
    witness.version === expectedVersion &&
    Number.isFinite(witness.verifiedAtMs) &&
    ageMs >= 0 &&
    ageMs <= WITNESS_MAX_AGE_MS &&
    witness.projectId === scope.projectId &&
    witness.workspaceId === scope.workspaceId &&
    witness.resourceTeamId === scope.resourceTeamId &&
    witness.viewerMemberId === scope.viewerMemberId &&
    witness.ownerMemberId === scope.ownerMemberId
  );
}

/** Outcome contract of the injected pull — structurally the same shape
 *  `CollabSyncRoutesHandle.pullSharedProject` (routes/collab-sync.ts)
 *  resolves with, redeclared here so this module stays free of the routes
 *  layer. */
export type ProactiveContentPullOutcome =
  | { status: 'pulled'; version: number | null }
  | { status: 'revoked' }
  | { status: 'register_failed' };

/** Exact team scope proved by the hub event + active identity + owner lookup. */
export interface ProactiveContentPullTarget {
  projectId: string;
  workspaceId: string;
  resourceTeamId: string;
  viewerMemberId: string;
  ownerMemberId: string;
  authorizationWitness?: ProactivePullAuthorizationWitness;
  authorizedStageInvocation?: AuthorizedProactivePullInvocation;
}

export interface ProactiveContentPullDeps {
  /** This daemon's own `workspace_projects` row for the project, or null when
   *  it was never bound locally. */
  getLocalBinding: (
    projectId: string,
  ) => { workspaceId: string; visibility: 'personal' | 'team' } | null;
  /** The authoritative TEAM identity for this exact Workspace (active
   * membership only), or null when signed out / personal-only / unavailable. */
  getWorkspaceIdentity: (workspaceId: string) => Promise<{
    workspaceId: string;
    resourceTeamId: string;
    workspaceMemberId: string;
  } | null>;
  /** Server-authoritative owner lookup in the same exact Workspace scope. */
  resolveSharedProjectOwner: (
    projectId: string,
    workspaceId: string,
  ) => Promise<string | null>;
  /** The shared pull flow (revocation gate → pull → register → signals) —
   *  `CollabSyncRoutesHandle.pullSharedProject` in production wiring. */
  pullSharedProject: (
    target: ProactiveContentPullTarget,
    expectedVersion?: number,
  ) => Promise<ProactiveContentPullOutcome>;
  /**
   * One workspace-scoped catalog read used only on a verified hub connection
   * (first connect and reconnect). Optional so event-driven consumers remain
   * usable without a catch-up transport.
   */
  listSharedProjects?: (
    workspaceId: string,
  ) => Promise<readonly ProactiveContentPullProjectRef[]>;
  /** Exact-scope local materialization probe. The broad low-frequency floor
   *  still selects only missing projects; a project-targeted catalog recovery
   *  may also compare an existing mirror's durable version with remote head. */
  hasMaterializedProject?: (
    projectId: string,
    target: ProactiveContentPullTarget,
  ) => boolean | Promise<boolean>;
  /** Read one authoritative published head after the single catalog sweep has
   *  selected a recently changed, non-owned project. Calls are sequential to
   *  avoid a reconnect request burst. */
  publishedHead?: (target: ProactiveContentPullTarget) => Promise<number | null>;
  /** Durable last materialized version, shared with other team-resource
   *  reconcilers. Seeds the in-memory event cursor after daemon restart. */
  materializedVersion?: (target: ProactiveContentPullTarget) => string | null;
  /** Called after a successful, versioned pull has materialized bytes. Used
   *  to invalidate list-level cover reads that do not subscribe to the
   *  project's own SSE stream. */
  onPulled?: (target: ProactiveContentPullTarget, version: number) => void | Promise<void>;
  /**
   * Called when handling the original hub event reaches a terminal decision
   * without leaving a retry/recovery lane behind. Successful pulls also call
   * this after `onPulled`; consumers should treat it as idempotent.
   */
  onEventSettled?: (event: ProactiveContentPullEvent) => void;
  /** Opt-in, secret-free timing observer. It must not affect pull behavior. */
  onTiming?: (event: {
    phase:
      | 'queued'
      | 'guard-started'
      | 'guard-completed'
      | 'invoke'
      | 'completed';
    projectId: string;
    version?: number;
    receivedAtMs?: number;
    atMs: number;
    status?: string;
  }) => void;
  /** Secret-free lifecycle diagnostics for the bounded catch-up sweep. */
  onCatchUp?: (event: {
    phase:
      | 'started'
      | 'completed'
      | 'skipped'
      | 'retry-scheduled'
      | 'retry-exhausted';
    mode: 'full' | 'missing-only';
    lane: 'broad' | 'targeted';
    workspaceId?: string;
    projectId?: string;
    scanned?: number;
    candidates?: number;
    /** Remote published-head requests issued by this sweep. */
    headChecks?: number;
    /** Remote heads that resolved to a published version. */
    heads?: number;
    suppressed?: number;
    complete?: boolean;
    failures?: number;
    attempt?: number;
    delayMs?: number;
    reason?: 'no-active-team' | 'scope-mismatch' | 'unavailable';
  }) => void;
  onError?: (error: unknown) => void;
  /** Injectable retry clock for deterministic tests. */
  scheduler?: {
    setTimeout: (
      callback: () => void | Promise<void>,
      delayMs: number,
    ) => unknown;
    clearTimeout: (handle: unknown) => void;
  };
  /** Injectable entropy for equal-jitter retry delays. */
  random?: () => number;
  /** Injectable wall clock for deterministic broad-head cooldown tests. */
  now?: () => number;
}

export interface ProactiveContentPull {
  /**
   * React to one hub 'project-content-changed' event. Never rejects: every
   * failure lands on `onError` and leaves freshness to the polling fallback.
   */
  handleContentChanged(event: ProactiveContentPullEvent): Promise<void>;
  /**
   * Sweep published heads after a verified hub first-connect/reconnect.
   * Calls are single-flight with at most one trailing pass.
   */
  catchUpPublishedHeads(expectedWorkspaceId?: string): Promise<void>;
  /**
   * Advance the bounded full-recovery cursor from the existing safety-floor
   * heartbeat, additionally healing projects whose local tree is absent.
   */
  advanceRecoveryFloor(expectedWorkspaceId?: string): Promise<void>;
  /**
   * Low-frequency catalog safety floor for the healthy-stream/missed-event
   * case. Only remote projects with no local materialization are considered.
   */
  materializeMissingProjects(
    expectedWorkspaceId?: string,
    expectedProjectId?: string,
  ): Promise<void>;
  /**
   * Adopt an exact-scope version that another pull lane durably committed.
   * The caller must invoke this only after bytes, mirror binding, and cursor
   * persistence all succeed.
   */
  observeMaterialized(
    target: ProactiveContentPullTarget,
    version: number,
  ): Promise<void>;
  /** Stop background recovery and release every pending retry timer. */
  dispose(): void;
}

type CatchUpMode = 'full' | 'missing-only';

interface CatchUpSweepRequest {
  expectedWorkspaceId?: string;
  expectedProjectIds: Set<string>;
  healMissing: boolean;
}

interface CatchUpLane {
  inFlight: Promise<void> | null;
  requestedGeneration: number;
  completedGeneration: number;
  requestedSweep: CatchUpSweepRequest | null;
  retryFailures: number;
  retryTimer: unknown | null;
}

type SuccessfulPullOutcome = Extract<
  ProactiveContentPullOutcome,
  { status: 'pulled' | 'revoked' }
>;

interface ProjectPullCompletion {
  scopeKey: string;
  outcome: ProactiveContentPullOutcome | null;
}

interface PullIntent {
  key: string;
  event: ProactiveContentPullEvent;
  force: boolean;
  /** Live/targeted work owns open-ended transport retries. Broad recovery is
   * one-shot per published head and waits for a newer event or safety floor. */
  persistentRetry: boolean;
  desiredVersion?: number;
  expectedScopeKey?: string;
  guardedTarget?: ProactiveContentPullTarget;
  skipNextForceProbe?: boolean;
  failures: number;
  revision: number;
  timer: unknown | null;
  driving: Promise<boolean> | null;
  abortController?: AbortController;
  /** A live hub event may reserve priority for one retry. Persistent failures
   * continue backing off after this reaches zero, but may no longer starve
   * broad reconnect recovery. A newer event refreshes the budget. */
  foregroundRetryBudget?: number;
}

interface SuppressedBroadHead {
  version: number;
  failures: number;
  retryAt: number;
}

interface CatalogProjectRetry {
  key: string;
  workspaceId: string;
  projectId: string;
  failures: number;
  timer: unknown | null;
  foregroundRetryBudget?: number;
}

interface CatchUpSweepOutcome {
  retryLane: boolean;
  retryProjectIds: string[];
  retryWorkspaceId: string | null;
  preemptedByForeground?: boolean;
}

type PullAttempt =
  | { kind: 'satisfied' }
  | { kind: 'stopped'; staleGuard?: boolean }
  | { kind: 'revoked' }
  | { kind: 'failed'; staleGuard?: boolean }
  | { kind: 'retry-now' }
  | { kind: 'merged'; intent: PullIntent };

type PullDecision =
  | { kind: 'target'; target: ProactiveContentPullTarget }
  | {
      kind: 'skip';
      retryable: boolean;
      reason:
        | 'invalid'
        | 'personal'
        | 'scope-mismatch'
        | 'identity-missing'
        | 'identity-error'
        | 'owner-missing'
        | 'owner-error'
        | 'self-owner';
    };

const MAX_CATALOG_PROPAGATION_RETRIES = 5;
const FOREGROUND_CATCH_UP_QUIET_MS = 250;
const BROAD_HEAD_CHECK_BUDGET = 4;
const BROAD_HEAD_RETRY_BASE_MS = 15_000;
const BROAD_HEAD_RETRY_MAX_MS = 5 * 60_000;

export function createProactiveContentPull(
  deps: ProactiveContentPullDeps,
): ProactiveContentPull {
  /** Last hub version a successful pull materialized, per project + scope. */
  const pulledVersions = new Map<string, number>();
  /** The filesystem is project-scoped, so transport serialization must be
   * project-scoped too. Different workspace/owner scopes may never write the
   * same project directory concurrently. */
  const projectPulls = new Map<string, Promise<ProjectPullCompletion>>();
  /** Retry state is isolated by the event's logical resource scope. */
  const intents = new Map<string, PullIntent>();
  /** Catalog propagation retries are independent from transport intents:
   * one newly-shared project may lag without consuming or overwriting another
   * project's backoff state. */
  const catalogProjectRetries = new Map<string, CatalogProjectRetry>();
  /** Project-specific first-share recovery must never wait behind the broad
   * missing-project sweep. One lane per project keeps simultaneous new shares
   * independent while `projectPulls` still dedupes disk writes. */
  const targetedCatalogRecoveries = new Map<string, Promise<void>>();
  /** Concurrent first-share events in one workspace share the same catalog
   * snapshot read, but never share or serialize their per-project pulls. */
  const targetedCatalogReads = new Map<
    string,
    Promise<readonly ProactiveContentPullProjectRef[]>
  >();
  const scheduler = deps.scheduler ?? {
    setTimeout: (
      callback: () => void | Promise<void>,
      delayMs: number,
    ): ReturnType<typeof setTimeout> =>
      setTimeout(() => {
        void callback();
      }, delayMs),
    clearTimeout: (handle: unknown): void =>
      clearTimeout(handle as ReturnType<typeof setTimeout>),
  };
  const random = deps.random ?? Math.random;
  const now = deps.now ?? Date.now;
  let disposed = false;
  let foregroundGeneration = 0;
  let foregroundEventsInFlight = 0;
  let foregroundResumeTimer: unknown | null = null;
  const foregroundIntents = new Set<PullIntent>();
  const foregroundCatalogRetries = new Set<CatalogProjectRetry>();
  const foregroundResumeRequests = new Map<
    CatchUpMode,
    CatchUpSweepRequest
  >();

  const reportTiming = (
    event: Parameters<NonNullable<ProactiveContentPullDeps['onTiming']>>[0],
  ): void => {
    try {
      deps.onTiming?.(event);
    } catch {
      // Diagnostics are observational and must never affect pull behavior.
    }
  };
  /** Monotonic completion counter per project scope. A missing-only manifest
   *  probe captures this before awaiting I/O, then compares it afterwards so
   *  a successful full-sweep pull cannot disappear in the probe → inFlight
   *  gap merely because its promise has already been removed. */
  const completionGenerations = new Map<string, number>();
  const successfulCompletions = new Map<
    string,
    { generation: number; outcome: SuccessfulPullOutcome }
  >();
  /** A broad sweep must not turn every historical unavailable project into a
   * permanent retry timer. Cool down only the exact guarded scope + head; a
   * later safety-floor pass, newer head, or targeted/live request retries. */
  const suppressedBroadHeads = new Map<string, SuppressedBroadHead>();
  /** Resume each broad workspace/mode lane after the last candidate it
   * inspected. The safety floor is intentionally timer-free: the existing
   * heartbeat supplies the next bounded round. */
  const broadHeadCursors = new Map<string, string>();
  /**
   * Full reconnect recovery may spend a long time walking historical heads.
   * Keep the missing-only safety floor on its own single-flight lane so a
   * newly-shared project can materialize immediately. Both lanes still share
   * `projectPulls` and `pulledVersions` above, preserving per-project dedupe.
   */
  const catchUpLanes: Record<CatchUpMode, CatchUpLane> = {
    full: {
      inFlight: null,
      requestedGeneration: 0,
      completedGeneration: 0,
      requestedSweep: null,
      retryFailures: 0,
      retryTimer: null,
    },
    'missing-only': {
      inFlight: null,
      requestedGeneration: 0,
      completedGeneration: 0,
      requestedSweep: null,
      retryFailures: 0,
      retryTimer: null,
    },
  };

  const pullScopeKey = (target: ProactiveContentPullTarget) =>
    JSON.stringify([
      target.projectId,
      target.workspaceId,
      target.resourceTeamId,
      target.viewerMemberId,
      target.ownerMemberId,
    ]);

  const outcomeCoversVersion = (
    outcome: ProactiveContentPullOutcome | null | undefined,
    version: number | undefined,
  ): outcome is SuccessfulPullOutcome => {
    if (outcome?.status === 'revoked') return true;
    if (outcome?.status !== 'pulled') return false;
    if (outcome.version == null) return false;
    if (version == null) return true;
    return outcome.version >= version;
  };

  const seedMaterializedVersion = (
    target: ProactiveContentPullTarget,
  ): number | null => {
    const version = Number(deps.materializedVersion?.(target) ?? NaN);
    if (!Number.isSafeInteger(version) || version < 0) return null;
    const scopeKey = pullScopeKey(target);
    const cursor = pulledVersions.get(scopeKey);
    if (cursor == null || version > cursor) {
      pulledVersions.set(scopeKey, version);
    }
    return version;
  };

  const notifyPulled = async (
    target: ProactiveContentPullTarget,
    version: number,
  ): Promise<void> => {
    try {
      const callbackTarget = { ...target };
      delete callbackTarget.authorizationWitness;
      delete callbackTarget.authorizedStageInvocation;
      await deps.onPulled?.(callbackTarget, version);
    } catch (error) {
      // Content and its durable cursor are already committed. List
      // invalidation is recoverable via its polling floor.
      deps.onError?.(error);
    }
  };

  const observeMaterialized = async (
    target: ProactiveContentPullTarget,
    version: number,
  ): Promise<void> => {
    if (!Number.isSafeInteger(version) || version < 0) return;
    const scopeKey = pullScopeKey(target);
    const cursor = pulledVersions.get(scopeKey);
    const advanced = cursor == null || version > cursor;
    if (advanced) pulledVersions.set(scopeKey, version);
    const intent = intents.get(scopeKey);
    if (
      intent &&
      intent.desiredVersion != null &&
      version >= intent.desiredVersion
    ) {
      clearIntent(intent);
    }
    if (advanced) await notifyPulled(target, version);
  };

  function readTargetedCatalog(
    workspaceId: string,
  ): Promise<readonly ProactiveContentPullProjectRef[]> {
    const existing = targetedCatalogReads.get(workspaceId);
    if (existing) return existing;
    const read = Promise.resolve().then(() =>
      deps.listSharedProjects!(workspaceId));
    targetedCatalogReads.set(workspaceId, read);
    const clear = () => {
      if (targetedCatalogReads.get(workspaceId) === read) {
        targetedCatalogReads.delete(workspaceId);
      }
    };
    void read.then(clear, clear);
    return read;
  }

  async function shouldPull(
    event: ProactiveContentPullEvent,
    ownerHint?: string,
  ): Promise<PullDecision> {
    const projectId = event.projectId;
    if (!projectId) {
      return { kind: 'skip', retryable: false, reason: 'invalid' };
    }
    const binding = deps.getLocalBinding(projectId);
    if (binding?.visibility === 'personal') {
      return { kind: 'skip', retryable: false, reason: 'personal' };
    }
    const targetWorkspaceId = binding?.workspaceId ?? event.workspaceId;
    // An unbound project has no local scope witness, so the hub event must
    // carry one. Existing team bindings keep supporting legacy events that
    // omit workspaceId.
    if (!targetWorkspaceId) {
      return { kind: 'skip', retryable: false, reason: 'invalid' };
    }
    if (event.workspaceId && targetWorkspaceId !== event.workspaceId) {
      return { kind: 'skip', retryable: false, reason: 'scope-mismatch' };
    }
    // Identity and ownership are independent, read-only guards. Start both
    // cold reads together: in the Vela-backed runtime each may spawn its own
    // CLI/network round-trip, so serializing them adds their latencies before
    // a pull can even begin. Promise.allSettled keeps every decision
    // fail-closed while preserving the existing priority: identity validity
    // and workspace scope are established before an owner result is trusted.
    const startRead = <T>(read: () => Promise<T>): Promise<T> => {
      try {
        return Promise.resolve(read());
      } catch (error) {
        return Promise.reject(error);
      }
    };
    const identityRead = startRead(() =>
      deps.getWorkspaceIdentity(targetWorkspaceId));
    const hintedOwner = ownerHint?.trim();
    const ownerRead = hintedOwner
      ? Promise.resolve(hintedOwner)
      : startRead(() =>
        deps.resolveSharedProjectOwner(projectId, targetWorkspaceId));
    const [identityResult, ownerResult] = await Promise.allSettled([
      identityRead,
      ownerRead,
    ]);
    if (identityResult.status === 'rejected') {
      deps.onError?.(identityResult.reason);
      return { kind: 'skip', retryable: true, reason: 'identity-error' };
    }
    const identity = identityResult.value;
    if (!identity) {
      return { kind: 'skip', retryable: true, reason: 'identity-missing' };
    }
    if (identity.workspaceId !== targetWorkspaceId) {
      return { kind: 'skip', retryable: false, reason: 'scope-mismatch' };
    }
    // Fail-closed ownership: pulling over the single writer's working tree is
    // destructive, so an unresolvable owner refuses the pull rather than
    // guessing.
    if (ownerResult.status === 'rejected') {
      return { kind: 'skip', retryable: true, reason: 'owner-error' };
    }
    const owner = ownerResult.value;
    if (!owner) {
      // A first-share content event can arrive before the separate catalog
      // upsert exposes its owner row. Only an UNBOUND event may enter catalog
      // propagation recovery; an established binding treats authoritative
      // owner absence as revocation and stays fail-closed.
      return {
        kind: 'skip',
        retryable: binding == null,
        reason: 'owner-missing',
      };
    }
    if (owner === identity.workspaceMemberId) {
      return { kind: 'skip', retryable: false, reason: 'self-owner' };
    }
    const scope = {
      projectId,
      workspaceId: targetWorkspaceId,
      resourceTeamId: identity.resourceTeamId,
      viewerMemberId: identity.workspaceMemberId,
      ownerMemberId: owner,
    };
    return {
      kind: 'target',
      target: {
        ...scope,
        ...(!hintedOwner &&
        event.version != null &&
        Number.isSafeInteger(event.version) &&
        event.version >= 0
          ? {
              authorizationWitness:
                issueProactivePullAuthorizationWitness(scope, event.version),
            }
          : {}),
      },
    };
  }

  async function runPull(
    target: ProactiveContentPullTarget,
    event: ProactiveContentPullEvent,
  ): Promise<ProjectPullCompletion> {
    const { projectId } = target;
    const scopeKey = pullScopeKey(target);
    const targetForPull = { ...target };
    if (targetForPull.authorizationWitness?.version !== event.version) {
      delete targetForPull.authorizationWitness;
    }
    if (
      targetForPull.authorizedStageInvocation?.expectedVersion !==
      event.version
    ) {
      delete targetForPull.authorizedStageInvocation;
    }
    const run = (async (): Promise<ProjectPullCompletion> => {
      let outcome: ProactiveContentPullOutcome | null = null;
      try {
        reportTiming({
          phase: 'invoke',
          projectId,
          ...(event.version != null ? { version: event.version } : {}),
          ...(event.profileReceivedAtMs != null
            ? { receivedAtMs: event.profileReceivedAtMs }
            : {}),
          atMs: Date.now(),
        });
        outcome = await deps.pullSharedProject(targetForPull, event.version);
        if (outcome?.status !== 'pulled') return { scopeKey, outcome };
        // Advance the cursor only with the version the pull itself reported
        // as materialized — trusting the event's number here could mark
        // content as landed that never reached disk.
        if (outcome.version == null) return { scopeKey, outcome };
        const cursor = pulledVersions.get(scopeKey);
        if (cursor == null || outcome.version > cursor) {
          pulledVersions.set(scopeKey, outcome.version);
        }
        await notifyPulled(targetForPull, outcome.version);
        return { scopeKey, outcome };
      } catch (error) {
        // Silent degradation: the web's status polling keeps pulling as the
        // fallback, and the cursor stays behind so the next event retries.
        deps.onError?.(error);
        return { scopeKey, outcome: null };
      } finally {
        reportTiming({
          phase: 'completed',
          projectId,
          ...(event.version != null ? { version: event.version } : {}),
          ...(event.profileReceivedAtMs != null
            ? { receivedAtMs: event.profileReceivedAtMs }
            : {}),
          atMs: Date.now(),
          status: outcome?.status ?? 'failed',
        });
        const generation = (completionGenerations.get(scopeKey) ?? 0) + 1;
        completionGenerations.set(scopeKey, generation);
        if (outcomeCoversVersion(outcome, undefined)) {
          successfulCompletions.set(scopeKey, { generation, outcome });
        }
      }
    })();
    projectPulls.set(projectId, run);
    try {
      return await run;
    } finally {
      if (projectPulls.get(projectId) === run) projectPulls.delete(projectId);
    }
  }

  function provisionalIntentKey(
    event: ProactiveContentPullEvent,
  ): string | null {
    if (!event.projectId) return null;
    const binding = deps.getLocalBinding(event.projectId);
    return JSON.stringify([
      'pending-guard',
      event.projectId,
      binding?.workspaceId ?? event.workspaceId ?? null,
    ]);
  }

  function cancelIntentTimer(intent: PullIntent): void {
    if (intent.timer == null) return;
    scheduler.clearTimeout(intent.timer);
    intent.timer = null;
  }

  function markIntentForeground(intent: PullIntent): void {
    intent.foregroundRetryBudget = 1;
    if (foregroundIntents.has(intent)) {
      cancelForegroundResumeTimer();
      return;
    }
    foregroundIntents.add(intent);
    cancelForegroundResumeTimer();
  }

  function releaseIntentForeground(intent: PullIntent): void {
    delete intent.foregroundRetryBudget;
    if (foregroundIntents.delete(intent)) {
      armForegroundResumeTimer();
    }
  }

  function transferIntentForeground(
    source: PullIntent,
    target: PullIntent,
  ): void {
    if (!foregroundIntents.delete(source)) return;
    const sourceBudget = source.foregroundRetryBudget ?? 0;
    delete source.foregroundRetryBudget;
    target.foregroundRetryBudget = Math.max(
      target.foregroundRetryBudget ?? 0,
      sourceBudget,
    );
    foregroundIntents.add(target);
    cancelForegroundResumeTimer();
  }

  function clearIntent(intent: PullIntent): void {
    intent.abortController?.abort();
    delete intent.abortController;
    cancelIntentTimer(intent);
    if (intents.get(intent.key) === intent) intents.delete(intent.key);
    releaseIntentForeground(intent);
  }

  function createIntent(
    key: string,
    event: ProactiveContentPullEvent,
    force: boolean,
    persistentRetry: boolean,
    target?: ProactiveContentPullTarget,
  ): PullIntent {
    return {
      key,
      event: { ...event },
      force,
      persistentRetry,
      ...(event.version != null ? { desiredVersion: event.version } : {}),
      ...(target
        ? {
            expectedScopeKey: key,
            guardedTarget: target,
          }
        : {}),
      failures: 0,
      revision: 0,
      timer: null,
      driving: null,
    };
  }

  function mergeIntentUpdate(
    intent: PullIntent,
    event: ProactiveContentPullEvent,
    force: boolean,
  ): boolean {
    const incomingVersion = event.version;
    const higherVersion =
      incomingVersion != null &&
      (intent.desiredVersion == null || incomingVersion > intent.desiredVersion);
    const strongerForce = force && !intent.force;
    if (higherVersion) {
      intent.abortController?.abort();
      intent.desiredVersion = incomingVersion;
      intent.event = { ...event };
    }
    if (strongerForce) intent.force = true;
    if (higherVersion || strongerForce) intent.revision += 1;
    return higherVersion || strongerForce;
  }

  function mergeIntentState(
    target: PullIntent,
    source: PullIntent,
  ): boolean {
    transferIntentForeground(source, target);
    target.persistentRetry ||= source.persistentRetry;
    const changed = mergeIntentUpdate(target, source.event, source.force);
    target.failures = Math.max(target.failures, source.failures);
    return changed;
  }

  function retryDelay(failures: number): number {
    const ceiling = Math.min(30_000, 1_000 * (2 ** Math.max(0, failures - 1)));
    const jitter = Math.min(1, Math.max(0, random()));
    return Math.round((ceiling / 2) + ((ceiling / 2) * jitter));
  }

  function broadHeadRetryDelay(failures: number): number {
    return Math.min(
      BROAD_HEAD_RETRY_MAX_MS,
      BROAD_HEAD_RETRY_BASE_MS * (2 ** Math.max(0, failures - 1)),
    );
  }

  function scheduleRetry(intent: PullIntent): void {
    if (disposed || intents.get(intent.key) !== intent || intent.timer != null) {
      return;
    }
    intent.failures += 1;
    const delayMs = retryDelay(intent.failures);
    let handle: unknown;
    handle = scheduler.setTimeout(async () => {
      if (intent.timer !== handle) return;
      intent.timer = null;
      await driveIntent(intent, true);
    }, delayMs);
    intent.timer = handle;
    (
      handle as { unref?: () => void } | null | undefined
    )?.unref?.();
  }

  async function transitionToCatalogRecovery(
    intent: PullIntent,
    decision: PullDecision,
  ): Promise<boolean> {
    if (
      decision.kind !== 'skip' ||
      decision.reason !== 'owner-missing' ||
      !decision.retryable ||
      intent.expectedScopeKey != null ||
      !intent.event.workspaceId ||
      !intent.event.projectId ||
      intents.get(intent.key) !== intent
    ) {
      return false;
    }
    const { workspaceId, projectId } = intent.event;
    // Identity/transport retries are intentionally open-ended, but an unbound
    // first share whose owner row has not propagated gets exactly the bounded
    // catalog policy. Transfer ownership by removing the provisional intent
    // before scheduling the project retry; otherwise both timers can survive.
    const foreground = foregroundIntents.has(intent);
    clearIntent(intent);
    await requestCatalogProjectRecovery(
      workspaceId,
      projectId,
      'external',
      foreground,
    );
    return true;
  }

  async function attemptIntent(intent: PullIntent): Promise<PullAttempt> {
    try {
      let target = intent.guardedTarget;
      delete intent.guardedTarget;
      if (!target) {
        const decision = await shouldPull(intent.event);
        if (decision.kind === 'skip') {
          if (await transitionToCatalogRecovery(intent, decision)) {
            return { kind: 'stopped', staleGuard: true };
          }
          const establishedScopeGone =
            intent.expectedScopeKey != null &&
            (
              decision.reason === 'identity-missing' ||
              decision.reason === 'owner-missing'
            );
          return {
            kind:
              !decision.retryable || establishedScopeGone
                ? 'stopped'
                : 'failed',
            staleGuard: true,
          };
        }
        target = decision.target;
      }
      const { projectId } = target;
      const scopeKey = pullScopeKey(target);
      if (intent.expectedScopeKey && intent.expectedScopeKey !== scopeKey) {
        return { kind: 'stopped' };
      }
      if (!intent.expectedScopeKey) {
        const previousKey = intent.key;
        const existing = intents.get(scopeKey);
        if (existing && existing !== intent) {
          const wake = mergeIntentState(existing, intent);
          if (intents.get(previousKey) === intent) intents.delete(previousKey);
          cancelIntentTimer(intent);
          if (wake) {
            cancelIntentTimer(existing);
            existing.guardedTarget = target;
          }
          return { kind: 'merged', intent: existing };
        }
        if (intents.get(previousKey) === intent) intents.delete(previousKey);
        intent.key = scopeKey;
        intent.expectedScopeKey = scopeKey;
        intents.set(scopeKey, intent);
      }
      const completionGenerationBeforeProbe =
        completionGenerations.get(scopeKey) ?? 0;
      if (intent.force && deps.hasMaterializedProject) {
        try {
          // The missing-only sweep selected this project from an earlier
          // manifest probe. A concurrent full sweep may have materialized it
          // while owner/scope checks were in flight, so close that window
          // before forcing a download. This observes real bytes, unlike the
          // durable version cursor that missing-only intentionally ignores.
          if (intent.skipNextForceProbe) {
            delete intent.skipNextForceProbe;
          } else if (await deps.hasMaterializedProject(projectId, target)) {
            // The outer missing-only probe can go stale while owner/scope/head
            // checks run. Seeing bytes now only withdraws the forced-download
            // requirement; the version cursor still has to cover the head.
            intent.force = false;
            seedMaterializedVersion(target);
          } else {
            const completedDuringProbe = successfulCompletions.get(scopeKey);
            if (
              completedDuringProbe &&
              completedDuringProbe.generation > completionGenerationBeforeProbe &&
              outcomeCoversVersion(
                completedDuringProbe.outcome,
                intent.desiredVersion,
              )
            ) {
              return { kind: 'satisfied' };
            }
          }
        } catch (error) {
          deps.onError?.(error);
          return { kind: 'failed' };
        }
      }
      if (!intent.force) {
        const persistedVersion = Number(
          deps.materializedVersion?.(target) ?? NaN,
        );
        if (
          Number.isSafeInteger(persistedVersion) &&
          persistedVersion >= 0 &&
          (
            intent.desiredVersion == null ||
            persistedVersion >= intent.desiredVersion
          )
        ) {
          try {
            const hasMaterializedBytes = deps.hasMaterializedProject
              ? await deps.hasMaterializedProject(projectId, target)
              : true;
            if (hasMaterializedBytes) {
              const cursor = pulledVersions.get(scopeKey);
              if (cursor == null || persistedVersion > cursor) {
                pulledVersions.set(scopeKey, persistedVersion);
              }
            }
          } catch (error) {
            deps.onError?.(error);
            return { kind: 'failed' };
          }
        }
      }
      const cursor = pulledVersions.get(scopeKey);
      if (
        !intent.force &&
        intent.desiredVersion != null &&
        cursor != null &&
        cursor >= intent.desiredVersion
      ) {
        return { kind: 'satisfied' };
      }
      const running = projectPulls.get(projectId);
      if (running) {
        const completion = await running;
        // A completion from another resource scope is never proof for this
        // intent. Loop through every guard again before deciding what to do.
        if (completion.scopeKey !== scopeKey) return { kind: 'retry-now' };
        if (completion.outcome?.status === 'revoked') {
          return { kind: 'revoked' };
        }
        if (
          outcomeCoversVersion(completion.outcome, intent.desiredVersion)
        ) {
          return { kind: 'satisfied' };
        }
        return { kind: 'retry-now' };
      }
      const expectedVersion = intent.desiredVersion;
      const abortController = new AbortController();
      intent.abortController = abortController;
      const targetForPull: ProactiveContentPullTarget = {
        ...target,
        ...(expectedVersion != null
          ? {
              authorizedStageInvocation:
                issueAuthorizedProactivePullInvocation(
                  target,
                  expectedVersion,
                  intent.event.profileReceivedAtMs,
                  () =>
                    intents.get(intent.key) === intent &&
                    intent.desiredVersion === expectedVersion,
                  abortController.signal,
                ),
            }
          : {}),
      };
      let completion: ProjectPullCompletion;
      try {
        completion = await runPull(targetForPull, {
          ...intent.event,
          ...(expectedVersion != null ? { version: expectedVersion } : {}),
        });
      } finally {
        if (intent.abortController === abortController) {
          delete intent.abortController;
        }
      }
      if (completion.outcome?.status === 'revoked') {
        return { kind: 'revoked' };
      }
      return outcomeCoversVersion(
        completion.outcome,
        intent.desiredVersion,
      )
        ? { kind: 'satisfied' }
        : { kind: 'failed' };
    } catch (error) {
      deps.onError?.(error);
      return { kind: 'failed' };
    }
  }

  async function runIntent(intent: PullIntent): Promise<boolean> {
    while (!disposed && intents.get(intent.key) === intent) {
      const revision = intent.revision;
      const result = await attemptIntent(intent);
      // Revocation is authoritative even when a newer event arrived while the
      // pull was in flight.
      if (result.kind === 'revoked') {
        clearIntent(intent);
        return true;
      }
      if (result.kind === 'merged') {
        if (
          result.intent.timer == null &&
          result.intent.driving == null
        ) {
          return await driveIntent(result.intent);
        }
        return result.intent.driving
          ? await result.intent.driving
          : false;
      }
      // A freshly verified event can migrate this same provisional intent
      // while its old guard is still awaiting identity/owner I/O. Ignore only
      // that stale guard's terminal answer and loop into guardedTarget. A
      // completed pull that already covers the merged desired version remains
      // satisfied; treating every revision change as stale would duplicate the
      // full-sweep/missing-only shared pull.
      if (
        result.kind === 'stopped' &&
        result.staleGuard &&
        intent.revision !== revision
      ) {
        continue;
      }
      if (result.kind === 'satisfied' || result.kind === 'stopped') {
        suppressedBroadHeads.delete(intent.expectedScopeKey ?? intent.key);
        clearIntent(intent);
        return true;
      }
      if (result.kind === 'retry-now' || intent.revision !== revision) {
        continue;
      }
      if (!intent.persistentRetry) {
        if (
          intent.expectedScopeKey &&
          Number.isSafeInteger(intent.desiredVersion) &&
          intent.desiredVersion != null
        ) {
          const previous = suppressedBroadHeads.get(intent.expectedScopeKey);
          const failures = previous?.version === intent.desiredVersion
            ? previous.failures + 1
            : 1;
          suppressedBroadHeads.set(intent.expectedScopeKey, {
            version: intent.desiredVersion,
            failures,
            retryAt: now() + broadHeadRetryDelay(failures),
          });
        }
        clearIntent(intent);
        return false;
      }
      scheduleRetry(intent);
      return false;
    }
    return true;
  }

  function driveIntent(
    intent: PullIntent,
    consumeForegroundRetry = false,
  ): Promise<boolean> {
    if (disposed || intents.get(intent.key) !== intent) {
      return Promise.resolve(true);
    }
    if (intent.driving) return intent.driving;
    if (consumeForegroundRetry && foregroundIntents.has(intent)) {
      intent.foregroundRetryBudget = Math.max(
        0,
        (intent.foregroundRetryBudget ?? 0) - 1,
      );
    }
    const run = runIntent(intent);
    intent.driving = run;
    const clearDriving = () => {
      if (intent.driving === run) intent.driving = null;
      if (
        foregroundIntents.has(intent) &&
        (intent.foregroundRetryBudget ?? 0) <= 0
      ) {
        releaseIntentForeground(intent);
      }
    };
    // A `.finally()` call creates a second promise that mirrors rejection; if
    // nobody observes that derived promise it can surface as an unhandled
    // rejection even when the original `run` is awaited by its caller.
    void run.then(clearDriving, clearDriving);
    return run;
  }

  async function processContentChanged(
    event: ProactiveContentPullEvent,
    ownerHint?: string,
    force = false,
    foreground = false,
    persistentRetry = true,
  ): Promise<boolean> {
    try {
      const provisionalKey = provisionalIntentKey(event);
      if (!provisionalKey) return true;
      reportTiming({
        phase: 'guard-started',
        projectId: event.projectId!,
        ...(event.version != null ? { version: event.version } : {}),
        ...(event.profileReceivedAtMs != null
          ? { receivedAtMs: event.profileReceivedAtMs }
          : {}),
        atMs: Date.now(),
      });
      const decision = await shouldPull(event, ownerHint);
      reportTiming({
        phase: 'guard-completed',
        projectId: event.projectId!,
        ...(event.version != null ? { version: event.version } : {}),
        ...(event.profileReceivedAtMs != null
          ? { receivedAtMs: event.profileReceivedAtMs }
          : {}),
        atMs: Date.now(),
        status: decision.kind === 'target' ? 'target' : decision.reason,
      });
      if (decision.kind === 'skip') {
        if (
          decision.reason === 'owner-missing' &&
          decision.retryable &&
          event.workspaceId &&
          event.projectId
        ) {
          const pending = intents.get(provisionalKey);
          if (pending) clearIntent(pending);
          await requestCatalogProjectRecovery(
            event.workspaceId,
            event.projectId,
            'external',
            foreground,
          );
          return false;
        }
        if (!decision.retryable) return true;
        if (!persistentRetry) return false;
        let pending = intents.get(provisionalKey);
        if (!pending) {
          pending = createIntent(
            provisionalKey,
            event,
            force,
            persistentRetry,
          );
          intents.set(provisionalKey, pending);
          if (foreground) markIntentForeground(pending);
          scheduleRetry(pending);
          return false;
        }
        pending.persistentRetry ||= persistentRetry;
        if (foreground) markIntentForeground(pending);
        const wake = mergeIntentUpdate(pending, event, force);
        if (wake) {
          cancelIntentTimer(pending);
          scheduleRetry(pending);
        }
        return pending.driving ? await pending.driving : false;
      }

      const { target } = decision;
      const key = pullScopeKey(target);
      if (persistentRetry) suppressedBroadHeads.delete(key);
      let effectiveForce = force;
      let forceProbeAlreadyRan = false;
      if (force && deps.hasMaterializedProject) {
        const generationBeforeProbe =
          completionGenerations.get(key) ?? 0;
        try {
          forceProbeAlreadyRan = true;
          if (await deps.hasMaterializedProject(target.projectId, target)) {
            effectiveForce = false;
            seedMaterializedVersion(target);
          } else {
            const completedDuringProbe = successfulCompletions.get(key);
            if (
              completedDuringProbe &&
              completedDuringProbe.generation > generationBeforeProbe &&
              outcomeCoversVersion(
                completedDuringProbe.outcome,
                event.version,
              )
            ) {
              return true;
            }
          }
        } catch (error) {
          deps.onError?.(error);
          return false;
        }
      }
      let intent = intents.get(key);
      const pending = intents.get(provisionalKey);
      if (foreground) {
        if (intent) markIntentForeground(intent);
        if (pending) markIntentForeground(pending);
      }
      let absorbedWake = false;
      let migrated = false;
      if (pending && pending !== intent) {
        if (intent) {
          absorbedWake = mergeIntentState(intent, pending);
          clearIntent(pending);
        } else {
          cancelIntentTimer(pending);
          if (intents.get(provisionalKey) === pending) {
            intents.delete(provisionalKey);
          }
          pending.key = key;
          pending.expectedScopeKey = key;
          pending.guardedTarget = target;
          // A timer callback may already be awaiting the provisional guard.
          // Keep that one drive, but make its eventual result stale so it loops
          // and consumes the freshly verified target instead of clearing or
          // backing off this migrated intent.
          if (pending.driving) pending.revision += 1;
          intent = pending;
          migrated = true;
          intents.set(key, intent);
        }
      }
      if (!intent) {
        intent = createIntent(
          key,
          event,
          effectiveForce,
          persistentRetry,
          target,
        );
        if (effectiveForce && forceProbeAlreadyRan) {
          intent.skipNextForceProbe = true;
        }
        intents.set(key, intent);
        if (foreground) markIntentForeground(intent);
        return await driveIntent(intent);
      }
      intent.persistentRetry ||= persistentRetry;
      if (force && !effectiveForce) {
        intent.force = false;
        delete intent.skipNextForceProbe;
        const cursor = pulledVersions.get(key);
        const desired = Math.max(
          intent.desiredVersion ?? Number.NEGATIVE_INFINITY,
          event.version ?? Number.NEGATIVE_INFINITY,
        );
        if (Number.isFinite(desired) && cursor != null && cursor >= desired) {
          clearIntent(intent);
          return true;
        }
      }
      const mergedWake = mergeIntentUpdate(intent, event, effectiveForce);
      const wake = migrated || mergedWake || absorbedWake;
      if (effectiveForce && forceProbeAlreadyRan) {
        intent.skipNextForceProbe = true;
      }
      if (!wake) {
        return intent.driving ? await intent.driving : false;
      }
      cancelIntentTimer(intent);
      intent.guardedTarget = target;
      return await driveIntent(intent);
    } catch (error) {
      deps.onError?.(error);
      return false;
    }
  }

  async function runCatchUpSweep(
    mode: 'full' | 'missing-only',
    expectedWorkspaceId?: string,
    expectedProjectIds: ReadonlySet<string> = new Set(),
    targetedOnly = false,
    foreground = false,
    healMissing = false,
  ): Promise<CatchUpSweepOutcome> {
    const foregroundGenerationAtStart = foregroundGeneration;
    const lane = targetedOnly ? 'targeted' : 'broad';
    const foregroundShouldPreempt = (): boolean =>
      !targetedOnly &&
      (
        foregroundEventsInFlight > 0 ||
        foregroundIntents.size > 0 ||
        foregroundCatalogRetries.size > 0 ||
        foregroundResumeTimer != null ||
        foregroundGeneration !== foregroundGenerationAtStart
      );
    if (
      !deps.listSharedProjects ||
      !deps.publishedHead ||
      (mode === 'missing-only' && !deps.hasMaterializedProject)
    ) {
      deps.onCatchUp?.({
        phase: 'skipped',
        mode,
        lane,
        reason: 'unavailable',
      });
      return {
        retryLane: false,
        retryProjectIds: [],
        retryWorkspaceId: null,
      };
    }
    if (!expectedWorkspaceId) {
      deps.onCatchUp?.({
        phase: 'skipped',
        mode,
        lane,
        reason: 'no-active-team',
      });
      return {
        retryLane: false,
        retryProjectIds: [],
        retryWorkspaceId: null,
      };
    }
    const identity = await deps.getWorkspaceIdentity(
      expectedWorkspaceId,
    ).catch((error) => {
      deps.onError?.(error);
      return null;
    });
    if (!identity) {
      deps.onCatchUp?.({
        phase: 'skipped',
        mode,
        lane,
        reason: 'no-active-team',
      });
      return {
        retryLane: false,
        retryProjectIds: [],
        retryWorkspaceId: null,
      };
    }
    if (expectedWorkspaceId && identity.workspaceId !== expectedWorkspaceId) {
      deps.onCatchUp?.({
        phase: 'skipped',
        mode,
        lane,
        workspaceId: identity.workspaceId,
        reason: 'scope-mismatch',
      });
      return {
        retryLane: false,
        retryProjectIds: [],
        retryWorkspaceId: null,
      };
    }

    const { workspaceId } = identity;
    deps.onCatchUp?.({ phase: 'started', mode, lane, workspaceId });

    let complete = true;
    let retrySweep = false;
    let preemptedByForeground = false;
    let suppressed = 0;
    let heads = 0;
    let headChecks = 0;
    const retryProjectIds: string[] = [];
    const preemptedOutcome = (
      scanned: number,
      candidates: number,
    ): CatchUpSweepOutcome => {
      deps.onCatchUp?.({
        phase: 'completed',
        mode,
        lane,
        workspaceId,
        scanned,
        candidates,
        headChecks,
        heads,
        suppressed,
        complete: false,
      });
      return {
        retryLane: false,
        retryProjectIds,
        retryWorkspaceId: workspaceId,
        preemptedByForeground: true,
      };
    };
    if (foregroundShouldPreempt()) {
      return preemptedOutcome(0, 0);
    }

    let projects: readonly ProactiveContentPullProjectRef[];
    try {
      projects = await (targetedOnly
        ? readTargetedCatalog(workspaceId)
        : deps.listSharedProjects(workspaceId));
    } catch (error) {
      deps.onError?.(error);
      if (foregroundShouldPreempt()) {
        return preemptedOutcome(0, 0);
      }
      deps.onCatchUp?.({
        phase: 'completed',
        mode,
        lane,
        workspaceId,
        scanned: 0,
        candidates: 0,
        headChecks: 0,
        heads: 0,
        complete: false,
      });
      return {
        retryLane: expectedProjectIds.size === 0,
        retryProjectIds: [...expectedProjectIds],
        retryWorkspaceId: workspaceId,
      };
    }

    if (foregroundShouldPreempt()) {
      return preemptedOutcome(projects.length, 0);
    }
    const visibleProjectIds = new Set(projects.map((project) => project.projectId));
    for (const expectedProjectId of expectedProjectIds) {
      if (visibleProjectIds.has(expectedProjectId)) {
        clearCatalogProjectRetry(workspaceId, expectedProjectId);
        continue;
      }
      const binding = deps.getLocalBinding(expectedProjectId);
      // An existing local binding plus authoritative absence is an unshare,
      // not propagation lag. Only an unseen project gets the bounded retry
      // window needed by first-time sharing.
      if (!binding) retryProjectIds.push(expectedProjectId);
      else clearCatalogProjectRetry(workspaceId, expectedProjectId);
    }
    const candidates: Array<{
      project: ProactiveContentPullProjectRef;
      forcePull: boolean;
    }> = [];
    const projectsToInspect = targetedOnly
      ? projects.filter((project) => expectedProjectIds.has(project.projectId))
      : projects;
    for (const project of projectsToInspect) {
      if (project.ownerMemberId === identity.workspaceMemberId) continue;
      const target: ProactiveContentPullTarget = {
        projectId: project.projectId,
        workspaceId,
        resourceTeamId: identity.resourceTeamId,
        viewerMemberId: identity.workspaceMemberId,
        ownerMemberId: project.ownerMemberId,
      };
      // Full recovery still has to heal a missing local tree. Mark its
      // candidates as force-capable and let processContentChanged perform the
      // race-closing materialization probe once, after the authoritative head
      // read. Missing-only needs the earlier probe as a catalog filter.
      let forcePull =
        mode === 'full' &&
        healMissing &&
        Boolean(deps.hasMaterializedProject);
      if (mode === 'missing-only') {
        let materialized: boolean;
        try {
          materialized = await deps.hasMaterializedProject!(
            project.projectId,
            target,
          );
        } catch (error) {
          deps.onError?.(error);
          complete = false;
          retrySweep = true;
          if (foregroundShouldPreempt()) {
            preemptedByForeground = true;
            break;
          }
          continue;
        }
        if (foregroundShouldPreempt()) {
          complete = false;
          preemptedByForeground = true;
          break;
        }
        if (mode === 'missing-only' && materialized && !targetedOnly) continue;
        forcePull = !materialized;
      }
      candidates.push({ project, forcePull });
    }
    // A project-specific first-share recovery must not wait behind historical
    // missing projects from the same workspace. Keep the broad safety-floor
    // sweep, but pull its explicit witnesses first so unrelated downloads
    // cannot delay the event that requested this recovery.
    const expectedFirstCandidates = expectedProjectIds.size === 0
      ? candidates
      : [
          ...candidates.filter(({ project }) =>
            expectedProjectIds.has(project.projectId)),
          ...candidates.filter(({ project }) =>
            !expectedProjectIds.has(project.projectId)),
        ];
    const broadCursorKey = JSON.stringify([mode, workspaceId]);
    const previousBroadCursor = broadHeadCursors.get(broadCursorKey);
    let broadStartIndex = 0;
    if (!targetedOnly && previousBroadCursor) {
      const exactIndex = expectedFirstCandidates.findIndex(
        ({ project }) => project.projectId === previousBroadCursor,
      );
      if (exactIndex >= 0) {
        broadStartIndex = (exactIndex + 1) % expectedFirstCandidates.length;
      } else {
        const nextIndex = expectedFirstCandidates.findIndex(
          ({ project }) => project.projectId > previousBroadCursor,
        );
        broadStartIndex = nextIndex >= 0 ? nextIndex : 0;
      }
    }
    const orderedCandidates = targetedOnly || broadStartIndex === 0
      ? expectedFirstCandidates
      : [
          ...expectedFirstCandidates.slice(broadStartIndex),
          ...expectedFirstCandidates.slice(0, broadStartIndex),
        ];
    const markBroadCandidateInspected = (projectId: string): void => {
      if (!targetedOnly) broadHeadCursors.set(broadCursorKey, projectId);
    };
    // Deliberately sequential: reconnect is a recovery path, not permission
    // to fan out one request per shared project at once.
    for (const candidate of preemptedByForeground ? [] : orderedCandidates) {
      // A verified hub event is the latency-sensitive lane. It already runs
      // independently from broad reconnect recovery, but two Vela children
      // still contend for the same session/network/object-store resources.
      // Never abort a pull already materializing (the transport does not yet
      // expose a proven-safe cancellation boundary); once that candidate
      // settles, stop before launching the next historical download. Targeted
      // first-share recovery is deliberately exempt.
      if (foregroundShouldPreempt()) {
        complete = false;
        preemptedByForeground = true;
        break;
      }
      const { project, forcePull } = candidate;
      const binding = deps.getLocalBinding(project.projectId);
      if (binding?.visibility === 'personal') {
        markBroadCandidateInspected(project.projectId);
        continue;
      }
      if (binding && binding.workspaceId !== workspaceId) {
        markBroadCandidateInspected(project.projectId);
        continue;
      }
      const target: ProactiveContentPullTarget = {
        projectId: project.projectId,
        workspaceId,
        resourceTeamId: identity.resourceTeamId,
        viewerMemberId: identity.workspaceMemberId,
        ownerMemberId: project.ownerMemberId,
      };
      const persistentRetry = targetedOnly || foreground;
      const suppressedHead = suppressedBroadHeads.get(pullScopeKey(target));
      if (
        !persistentRetry &&
        suppressedHead &&
        now() < suppressedHead.retryAt
      ) {
        // The exact scope is still inside its bounded failure cooldown. Avoid
        // even the per-project head CLI here: a newer head may wait until the
        // next safety floor, while targeted/live events continue to bypass.
        suppressed += 1;
        complete = false;
        markBroadCandidateInspected(project.projectId);
        continue;
      }
      const persistedVersion = Number(
        deps.materializedVersion?.(target) ?? NaN,
      );
      if (!forcePull && Number.isFinite(persistedVersion)) {
        const scopeKey = pullScopeKey(target);
        const cursor = pulledVersions.get(scopeKey);
        if (cursor == null || persistedVersion > cursor) {
          pulledVersions.set(scopeKey, persistedVersion);
        }
      }
      if (!targetedOnly && headChecks >= BROAD_HEAD_CHECK_BUDGET) {
        complete = false;
        break;
      }
      let version: number | null;
      try {
        headChecks += 1;
        version = await deps.publishedHead(target);
      } catch (error) {
        deps.onError?.(error);
        complete = false;
        retrySweep = true;
        markBroadCandidateInspected(project.projectId);
        if (foregroundShouldPreempt()) {
          preemptedByForeground = true;
          break;
        }
        continue;
      }
      markBroadCandidateInspected(project.projectId);
      if (foregroundShouldPreempt()) {
        complete = false;
        preemptedByForeground = true;
        break;
      }
      if (version == null) continue;
      heads += 1;
      if (!forcePull && Number.isFinite(persistedVersion) && persistedVersion >= version) {
        continue;
      }
      const materialized = await processContentChanged(
        { projectId: project.projectId, workspaceId, version },
        project.ownerMemberId,
        forcePull,
        foreground,
        persistentRetry,
      );
      if (!materialized) {
        complete = false;
      }
      if (foregroundShouldPreempt()) {
        complete = false;
        preemptedByForeground = true;
        break;
      }
    }
    deps.onCatchUp?.({
      phase: 'completed',
      mode,
      lane,
      workspaceId,
      scanned: projects.length,
      candidates: candidates.length,
      headChecks,
      heads,
      suppressed,
      complete,
    });
    return {
      // The foreground resume re-runs the whole sweep, including any head
      // read that failed before preemption. Do not also schedule the ordinary
      // failure retry or two background lanes would restart together.
      retryLane: preemptedByForeground ? false : retrySweep,
      retryProjectIds,
      retryWorkspaceId: workspaceId,
      ...(preemptedByForeground ? { preemptedByForeground: true } : {}),
    };
  }

  function mergeForegroundResumeRequest(
    mode: CatchUpMode,
    request: CatchUpSweepRequest,
  ): void {
    const existing = foregroundResumeRequests.get(mode);
    if (
      existing &&
      existing.expectedWorkspaceId === request.expectedWorkspaceId
    ) {
      for (const projectId of request.expectedProjectIds) {
        existing.expectedProjectIds.add(projectId);
      }
      existing.healMissing ||= request.healMissing;
      return;
    }
    foregroundResumeRequests.set(mode, {
      ...(request.expectedWorkspaceId
        ? { expectedWorkspaceId: request.expectedWorkspaceId }
        : {}),
      expectedProjectIds: new Set(request.expectedProjectIds),
      healMissing: request.healMissing,
    });
  }

  function cancelForegroundResumeTimer(): void {
    if (foregroundResumeTimer == null) return;
    scheduler.clearTimeout(foregroundResumeTimer);
    foregroundResumeTimer = null;
  }

  function armForegroundResumeTimer(): void {
    if (
      disposed ||
      foregroundEventsInFlight > 0 ||
      foregroundIntents.size > 0 ||
      foregroundCatalogRetries.size > 0 ||
      foregroundResumeRequests.size === 0 ||
      foregroundResumeTimer != null
    ) {
      return;
    }
    const generation = foregroundGeneration;
    let handle: unknown;
    handle = scheduler.setTimeout(async () => {
      if (foregroundResumeTimer !== handle) return;
      foregroundResumeTimer = null;
      if (disposed) return;
      if (
        foregroundEventsInFlight > 0 ||
        foregroundIntents.size > 0 ||
        foregroundCatalogRetries.size > 0 ||
        foregroundGeneration !== generation
      ) {
        armForegroundResumeTimer();
        return;
      }
      const requests = [...foregroundResumeRequests.entries()];
      foregroundResumeRequests.clear();
      await Promise.all(
        requests.map(([mode, request]) =>
          requestCatchUp(
            mode,
            request.expectedWorkspaceId,
            request.expectedProjectIds,
            'foreground-resume',
            request.healMissing,
          )),
      );
    }, FOREGROUND_CATCH_UP_QUIET_MS);
    foregroundResumeTimer = handle;
    (
      handle as { unref?: () => void } | null | undefined
    )?.unref?.();
  }

  function deferCatchUpForForeground(
    mode: CatchUpMode,
    request: CatchUpSweepRequest,
  ): void {
    mergeForegroundResumeRequest(mode, request);
    armForegroundResumeTimer();
  }

  function cancelCatchUpRetry(lane: CatchUpLane): void {
    if (lane.retryTimer == null) return;
    scheduler.clearTimeout(lane.retryTimer);
    lane.retryTimer = null;
  }

  function scheduleCatchUpRetry(
    mode: CatchUpMode,
    expectedWorkspaceId?: string,
    expectedProjectIds: ReadonlySet<string> = new Set(),
    healMissing = false,
  ): void {
    const lane = catchUpLanes[mode];
    if (disposed || lane.retryTimer != null) return;
    if (lane.retryFailures >= MAX_CATALOG_PROPAGATION_RETRIES) {
      deps.onCatchUp?.({
        phase: 'retry-exhausted',
        mode,
        lane: 'broad',
        ...(expectedWorkspaceId ? { workspaceId: expectedWorkspaceId } : {}),
        failures: lane.retryFailures,
        attempt: lane.retryFailures,
      });
      return;
    }
    lane.retryFailures += 1;
    const delayMs = retryDelay(lane.retryFailures);
    deps.onCatchUp?.({
      phase: 'retry-scheduled',
      mode,
      lane: 'broad',
      ...(expectedWorkspaceId ? { workspaceId: expectedWorkspaceId } : {}),
      failures: lane.retryFailures,
      attempt: lane.retryFailures,
      delayMs,
    });
    let handle: unknown;
    handle = scheduler.setTimeout(async () => {
      if (lane.retryTimer !== handle) return;
      lane.retryTimer = null;
      await requestCatchUp(
        mode,
        expectedWorkspaceId,
        expectedProjectIds,
        'retry',
        healMissing,
      );
    }, delayMs);
    lane.retryTimer = handle;
    (
      handle as { unref?: () => void } | null | undefined
    )?.unref?.();
  }

  function catalogProjectRetryKey(
    workspaceId: string,
    projectId: string,
  ): string {
    return JSON.stringify([workspaceId, projectId]);
  }

  function markCatalogRetryForeground(retry: CatalogProjectRetry): void {
    retry.foregroundRetryBudget = 1;
    foregroundCatalogRetries.add(retry);
    cancelForegroundResumeTimer();
  }

  function releaseCatalogRetryForeground(retry: CatalogProjectRetry): void {
    delete retry.foregroundRetryBudget;
    if (foregroundCatalogRetries.delete(retry)) {
      armForegroundResumeTimer();
    }
  }

  function clearCatalogProjectRetry(
    workspaceId: string,
    projectId: string,
  ): void {
    const key = catalogProjectRetryKey(workspaceId, projectId);
    const retry = catalogProjectRetries.get(key);
    if (!retry) return;
    if (retry.timer != null) scheduler.clearTimeout(retry.timer);
    retry.timer = null;
    catalogProjectRetries.delete(key);
    releaseCatalogRetryForeground(retry);
  }

  function clearCatalogRetriesOutsideWorkspace(workspaceId: string): void {
    for (const retry of catalogProjectRetries.values()) {
      if (retry.workspaceId === workspaceId) continue;
      clearCatalogProjectRetry(retry.workspaceId, retry.projectId);
    }
  }

  function scheduleCatalogProjectRetry(
    workspaceId: string,
    projectId: string,
  ): void {
    if (disposed) return;
    const key = catalogProjectRetryKey(workspaceId, projectId);
    let retry = catalogProjectRetries.get(key);
    if (!retry) {
      retry = {
        key,
        workspaceId,
        projectId,
        failures: 0,
        timer: null,
      };
      catalogProjectRetries.set(key, retry);
    }
    if (retry.timer != null) return;
    if (retry.failures >= MAX_CATALOG_PROPAGATION_RETRIES) {
      deps.onCatchUp?.({
        phase: 'retry-exhausted',
        mode: 'missing-only',
        lane: 'targeted',
        workspaceId,
        projectId,
        failures: retry.failures,
        attempt: retry.failures,
      });
      return;
    }
    retry.failures += 1;
    const delayMs = retryDelay(retry.failures);
    deps.onCatchUp?.({
      phase: 'retry-scheduled',
      mode: 'missing-only',
      lane: 'targeted',
      workspaceId,
      projectId,
      failures: retry.failures,
      attempt: retry.failures,
      delayMs,
    });
    let handle: unknown;
    handle = scheduler.setTimeout(async () => {
      if (retry?.timer !== handle) return;
      retry.timer = null;
      if (foregroundCatalogRetries.has(retry)) {
        retry.foregroundRetryBudget = Math.max(
          0,
          (retry.foregroundRetryBudget ?? 0) - 1,
        );
      }
      await requestCatalogProjectRecovery(workspaceId, projectId, 'retry');
      if (
        foregroundCatalogRetries.has(retry) &&
        (retry.foregroundRetryBudget ?? 0) <= 0
      ) {
        releaseCatalogRetryForeground(retry);
      }
    }, delayMs);
    retry.timer = handle;
    (
      handle as { unref?: () => void } | null | undefined
    )?.unref?.();
  }

  async function requestCatalogProjectRecovery(
    workspaceId: string,
    projectId: string,
    source: 'external' | 'retry',
    foreground = false,
  ): Promise<void> {
    if (disposed) return;
    const key = catalogProjectRetryKey(workspaceId, projectId);
    if (source === 'external') {
      clearCatalogRetriesOutsideWorkspace(workspaceId);
      clearCatalogProjectRetry(workspaceId, projectId);
      const retry: CatalogProjectRetry = {
        key,
        workspaceId,
        projectId,
        failures: 0,
        timer: null,
      };
      catalogProjectRetries.set(key, retry);
      if (foreground) markCatalogRetryForeground(retry);
    }
    const retryState = catalogProjectRetries.get(key);
    const runForeground = Boolean(
      retryState && foregroundCatalogRetries.has(retryState),
    );
    let targeted = targetedCatalogRecoveries.get(key);
    if (!targeted) {
      targeted = (async () => {
        const outcome = await runCatchUpSweep(
          'missing-only',
          workspaceId,
          new Set([projectId]),
          true,
          runForeground,
        );
        if (outcome.retryProjectIds.length > 0) {
          const currentIdentity = await deps.getWorkspaceIdentity(
            outcome.retryWorkspaceId ?? '',
          ).catch(
            (error) => {
              deps.onError?.(error);
              return null;
            },
          );
          if (
            !currentIdentity ||
            currentIdentity.workspaceId !== outcome.retryWorkspaceId
          ) {
            return;
          }
        }
        for (const retryProjectId of outcome.retryProjectIds) {
          if (outcome.retryWorkspaceId) {
            scheduleCatalogProjectRetry(
              outcome.retryWorkspaceId,
              retryProjectId,
            );
          }
        }
      })();
      targetedCatalogRecoveries.set(key, targeted);
      void targeted.then(
        () => {
          if (targetedCatalogRecoveries.get(key) === targeted) {
            targetedCatalogRecoveries.delete(key);
          }
        },
        () => {
          if (targetedCatalogRecoveries.get(key) === targeted) {
            targetedCatalogRecoveries.delete(key);
          }
        },
      );
    }
    await targeted;
    const retry = catalogProjectRetries.get(key);
    if (retry?.timer == null) {
      catalogProjectRetries.delete(key);
      if (retry) releaseCatalogRetryForeground(retry);
    }
  }

  async function requestCatchUp(
    mode: CatchUpMode,
    expectedWorkspaceId?: string,
    expectedProjectIds: ReadonlySet<string> = new Set(),
    source: 'external' | 'retry' | 'foreground-resume' = 'external',
    healMissing = false,
  ): Promise<void> {
    if (disposed) return;
    const lane = catchUpLanes[mode];
    if (source === 'external') {
      cancelCatchUpRetry(lane);
      lane.retryFailures = 0;
    }
    lane.requestedGeneration += 1;
    // Requests for the same workspace UNION their project witnesses so two
    // first shares cannot overwrite one another while a sweep is in flight.
    // A different verified workspace supersedes stale pending work.
    if (
      lane.requestedSweep &&
      lane.requestedSweep.expectedWorkspaceId === expectedWorkspaceId
    ) {
      for (const projectId of expectedProjectIds) {
        lane.requestedSweep.expectedProjectIds.add(projectId);
      }
      lane.requestedSweep.healMissing ||= healMissing;
    } else {
      lane.requestedSweep = {
        ...(expectedWorkspaceId ? { expectedWorkspaceId } : {}),
        expectedProjectIds: new Set(expectedProjectIds),
        healMissing,
      };
    }
    if (lane.inFlight) {
      return lane.inFlight;
    }
    const run = (async () => {
      while (lane.completedGeneration < lane.requestedGeneration) {
        const generation = lane.requestedGeneration;
        const next: CatchUpSweepRequest = lane.requestedSweep ?? {
          expectedProjectIds: new Set(),
          healMissing: false,
        };
        lane.requestedSweep = null;
        if (next.expectedWorkspaceId) {
          // A workspace switch may arrive while the preceding sweep is still
          // in flight. Clear any stale retries that sweep just rescheduled
          // before processing the new verified scope.
          clearCatalogRetriesOutsideWorkspace(next.expectedWorkspaceId);
        }
        const outcome = await runCatchUpSweep(
          mode,
          next.expectedWorkspaceId,
          next.expectedProjectIds,
          false,
          false,
          next.healMissing,
        );
        lane.completedGeneration = generation;
        if (outcome.preemptedByForeground) {
          deferCatchUpForForeground(mode, next);
        }
        for (const projectId of outcome.retryProjectIds) {
          if (outcome.retryWorkspaceId) {
            scheduleCatalogProjectRetry(
              outcome.retryWorkspaceId,
              projectId,
            );
          }
        }
        if (lane.completedGeneration < lane.requestedGeneration) continue;
        if (outcome.retryLane) {
          scheduleCatchUpRetry(
            mode,
            next.expectedWorkspaceId,
            next.expectedProjectIds,
            next.healMissing,
          );
        } else {
          lane.retryFailures = 0;
        }
      }
    })();
    lane.inFlight = run;
    try {
      await run;
    } finally {
      if (lane.inFlight === run) lane.inFlight = null;
    }
  }

  return {
    async handleContentChanged(event: ProactiveContentPullEvent): Promise<void> {
      if (event.projectId) {
        reportTiming({
          phase: 'queued',
          projectId: event.projectId,
          ...(event.version != null ? { version: event.version } : {}),
          ...(event.profileReceivedAtMs != null
            ? { receivedAtMs: event.profileReceivedAtMs }
            : {}),
          atMs: Date.now(),
        });
      }
      const isForeground = Boolean(event.projectId);
      if (isForeground) {
        foregroundGeneration += 1;
        foregroundEventsInFlight += 1;
        cancelForegroundResumeTimer();
      }
      try {
        const settled = await processContentChanged(
          event,
          undefined,
          false,
          isForeground,
        );
        if (settled) {
          try {
            deps.onEventSettled?.(event);
          } catch {
            // Lifecycle observation must never affect pull behavior.
          }
        }
      } finally {
        if (isForeground) {
          foregroundEventsInFlight -= 1;
          armForegroundResumeTimer();
        }
      }
    },
    catchUpPublishedHeads: (workspaceId) =>
      requestCatchUp('full', workspaceId),
    advanceRecoveryFloor: (workspaceId) =>
      requestCatchUp(
        'full',
        workspaceId,
        new Set(),
        'external',
        true,
      ),
    materializeMissingProjects: (workspaceId, projectId) =>
      projectId && workspaceId
        ? requestCatalogProjectRecovery(workspaceId, projectId, 'external')
        : requestCatchUp('missing-only', workspaceId),
    observeMaterialized,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      for (const intent of intents.values()) clearIntent(intent);
      intents.clear();
      for (const lane of Object.values(catchUpLanes)) {
        cancelCatchUpRetry(lane);
      }
      cancelForegroundResumeTimer();
      foregroundIntents.clear();
      foregroundResumeRequests.clear();
      for (const retry of [...catalogProjectRetries.values()]) {
        clearCatalogProjectRetry(retry.workspaceId, retry.projectId);
      }
      foregroundCatalogRetries.clear();
      targetedCatalogRecoveries.clear();
      targetedCatalogReads.clear();
      suppressedBroadHeads.clear();
      broadHeadCursors.clear();
    },
  };
}
