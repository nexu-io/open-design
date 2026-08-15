import type { Express, Request, Response } from 'express';
import type {
  CollabPresenceMember,
  WorkspaceCollabContext,
} from '@open-design/contracts';
import type { CollabRuntime } from '../collab/runtime.js';
import type { PresenceMember } from '../collab/presence-tracker.js';
import type {
  VelaCliPresenceHeartbeatInput,
  VelaCliPresenceLeaveInput,
} from '../collab/vela-cli-collab-client.js';
import type {
  VerifiedWorkspaceRequestContextResult,
} from '../collab/request-workspace-context.js';
import {
  classifyCollabCloudError,
  CollabCloudUpstreamBlockedError,
  type ClassifiedCollabCloudError,
} from '../collab/collab-cloud-error.js';

type PresenceActivity = Exclude<PresenceMember['activity'], undefined>;

export interface CollabPresenceCloudClient {
  heartbeatPresence(
    projectId: string,
    input: VelaCliPresenceHeartbeatInput,
    context?: WorkspaceCollabContext | null,
  ): Promise<CollabPresenceMember[]>;
  listPresence(
    projectId: string,
    context?: WorkspaceCollabContext | null,
  ): Promise<CollabPresenceMember[]>;
  leavePresence(
    projectId: string,
    input: VelaCliPresenceLeaveInput,
    context?: WorkspaceCollabContext | null,
  ): Promise<CollabPresenceMember[]>;
}

export interface RegisterCollabPresenceRoutesDeps {
  collab: Pick<CollabRuntime, 'presence'>;
  cloud?: CollabPresenceCloudClient | null;
  isProjectShared?: (
    projectId: string,
    context?: WorkspaceCollabContext | null,
  ) => Promise<boolean>;
  verifyWorkspaceRequest?: (
    req: Request,
    projectId: string,
  ) => Promise<
    | VerifiedWorkspaceRequestContextResult
    | WorkspaceCollabContext
    | null
  >;
  /**
   * Leave must bypass any background authority outage lease so closing a tab
   * still gets one chance to release its remote presence lease. Heartbeats use
   * `verifyWorkspaceRequest`; leave falls back to it when this seam is absent.
   */
  verifyWorkspaceLeaveRequest?: RegisterCollabPresenceRoutesDeps['verifyWorkspaceRequest'];
  /**
   * Bounded successful authority lease for the idempotent GET surface.
   * Heartbeat deliberately keeps using `verifyWorkspaceRequest`.
   */
  verifyWorkspaceReadRequest?: RegisterCollabPresenceRoutesDeps['verifyWorkspaceRequest'];
  /** Test/operations seam for the short-lived cloud list cache. */
  presenceListCacheFreshMs?: number;
  /** Virtual clock seam for deterministic TTL coverage. */
  presenceListCacheNow?: () => number;
  /**
   * The configured cloud route authoritatively rejects projects outside the
   * requested workspace, so a separate remote team-project lookup is redundant.
   */
  cloudAuthorizesProjectPresence?: (projectId: string) => boolean;
  /**
   * Cooldown for the upstream negative cache: after repeated consecutive
   * cloud-transport failures for one project, presence stops spawning the
   * transport for this long and replays the classified failure instead.
   */
  presenceUpstreamCooldownMs?: number;
  /** Virtual clock seam for deterministic negative-cache coverage. */
  presenceUpstreamNow?: () => number;
}

export interface CollabPresenceRoutesControl {
  /**
   * Preserve the last authorized roster but make it due for background
   * refresh. Presence-change events use this path so their own relay echo
   * cannot turn the next UI read into a cold, blocking Vela request.
   */
  markPresenceStale(projectId: string, workspaceId?: string): void;
  /**
   * Drop cached list results for one project after a share-authority change.
   * `workspaceId` keeps invalidation scoped when it is known.
   */
  invalidatePresence(projectId: string, workspaceId?: string): void;
}

const DEFAULT_PRESENCE_LIST_CACHE_FRESH_MS = 1_000;
const MAX_PRESENCE_LIST_CACHE_ENTRIES = 256;

interface PresenceListCacheEntry {
  projectId: string;
  workspaceId: string;
  value: CollabPresenceMember[] | null;
  settledAt: number;
  inflight: Promise<CollabPresenceMember[]> | null;
}

function presenceListCacheKey(
  projectId: string,
  context: WorkspaceCollabContext | null,
): string {
  const permissions = context?.permissions;
  return JSON.stringify([
    projectId,
    context?.workspaceId?.trim() ?? '',
    context?.workspaceMemberId?.trim() ?? '',
    context?.workspaceType ?? '',
    context?.role ?? '',
    context?.memberStatus ?? '',
    context?.lifecycleState ?? '',
    permissions?.canManageMembers ?? false,
    permissions?.canManageBilling ?? false,
    permissions?.canInviteMembers ?? false,
    permissions?.canManageAutoRecharge ?? false,
    permissions?.canShareProjects ?? false,
    permissions?.canWriteSyncedFiles ?? false,
    permissions?.canViewWorkspaceSettings ?? false,
    permissions?.canManageSharedResources ?? false,
  ]);
}

function createPresenceListCache(options: {
  freshMs: number;
  now: () => number;
}) {
  const entries = new Map<string, PresenceListCacheEntry>();
  const store = (key: string, entry: PresenceListCacheEntry) => {
    entries.delete(key);
    entries.set(key, entry);
    while (entries.size > MAX_PRESENCE_LIST_CACHE_ENTRIES) {
      const oldestKey = entries.keys().next().value;
      if (oldestKey === undefined) break;
      entries.delete(oldestKey);
    }
  };

  const refresh = (
    key: string,
    entry: PresenceListCacheEntry,
    fetcher: () => Promise<CollabPresenceMember[]>,
  ): Promise<CollabPresenceMember[]> => {
    const request = Promise.resolve().then(fetcher);
    entry.inflight = request;
    request.then(
      (value) => {
        if (entries.get(key) !== entry) return;
        entry.value = value;
        entry.settledAt = options.now();
        entry.inflight = null;
      },
      () => {
        if (entries.get(key) !== entry) return;
        // A failed read is not presence evidence. Preserve a previously
        // authorized roster so a transient relay/CLI outage cannot make every
        // open project flash empty; keep it stale so the next read retries.
        // Cold failures still remove the empty shell and retry normally.
        if (entry.value !== null) {
          entry.inflight = null;
        } else {
          entries.delete(key);
        }
      },
    );
    return request;
  };

  return {
    read(
      projectId: string,
      context: WorkspaceCollabContext | null,
      fetcher: () => Promise<CollabPresenceMember[]>,
      readOptions?: { waitForFresh?: boolean },
    ): Promise<CollabPresenceMember[]> {
      const key = presenceListCacheKey(projectId, context);
      let entry = entries.get(key);
      if (!entry) {
        entry = {
          projectId,
          workspaceId: context?.workspaceId?.trim() ?? '',
          value: null,
          settledAt: 0,
          inflight: null,
        };
        store(key, entry);
        return refresh(key, entry, fetcher);
      }
      // Bounded LRU: a daemon that opens many historical projects must not
      // retain every short-lived roster forever.
      store(key, entry);
      if (entry.value !== null) {
        const value = entry.value;
        let refreshRequest = entry.inflight;
        if (
          !refreshRequest
          && options.now() - entry.settledAt >= options.freshMs
        ) {
          // Polls never wait on a fresh Vela process once this exact viewer has
          // a value. Refresh in the background and keep concurrent callers on
          // the same process.
          refreshRequest = refresh(key, entry, fetcher);
          void refreshRequest.catch(() => undefined);
        }
        if (readOptions?.waitForFresh && refreshRequest) return refreshRequest;
        return Promise.resolve(value);
      }
      return entry.inflight ?? refresh(key, entry, fetcher);
    },

    publish(
      projectId: string,
      context: WorkspaceCollabContext | null,
      value: CollabPresenceMember[],
    ): void {
      const key = presenceListCacheKey(projectId, context);
      store(key, {
        projectId,
        workspaceId: context?.workspaceId?.trim() ?? '',
        value,
        settledAt: options.now(),
        inflight: null,
      });
    },

    markStale(projectId: string, workspaceId?: string): void {
      const exactWorkspaceId = workspaceId?.trim();
      for (const entry of entries.values()) {
        if (entry.projectId !== projectId) continue;
        if (exactWorkspaceId && entry.workspaceId !== exactWorkspaceId) continue;
        // Keep the last authorized roster for the immediate caller. The next
        // read starts one background refresh and returns without waiting on
        // the Vela process.
        entry.settledAt = Number.NEGATIVE_INFINITY;
      }
    },

    invalidate(projectId: string, workspaceId?: string): void {
      const exactWorkspaceId = workspaceId?.trim();
      for (const [key, entry] of entries) {
        if (entry.projectId !== projectId) continue;
        if (exactWorkspaceId && entry.workspaceId !== exactWorkspaceId) continue;
        entries.delete(key);
      }
    },
  };
}

/**
 * The workspace-scoped presence surface of the collab transport, as this route
 * module needs it. `VelaCliCollabClient` satisfies it structurally.
 */
export interface CollabPresenceCloudTransport {
  heartbeatPresence(
    projectId: string,
    input: VelaCliPresenceHeartbeatInput,
    workspaceId: string,
  ): Promise<CollabPresenceMember[]>;
  listPresence(
    projectId: string,
    workspaceId: string,
  ): Promise<CollabPresenceMember[]>;
  leavePresence(
    projectId: string,
    input: VelaCliPresenceLeaveInput,
    workspaceId: string,
  ): Promise<CollabPresenceMember[]>;
}

/**
 * Bind a collab transport to a per-project workspace scope, producing the
 * `cloud` dependency below — or nothing when this run has no cloud transport.
 *
 * The invariant: **a `cloud` dependency exists if and only if a transport
 * exists.** Every endpoint below reads a present `cloud` as "the cloud owns
 * presence for this run" and stops consulting the process-local tracker
 * entirely. So a relay built over an absent transport is not merely useless —
 * it turns the in-process fallback into dead code and every gated presence
 * request into a 502. Returning `null` is what keeps that fallback reachable
 * for the runs that have no transport, which is every build that has not
 * opted into the vela-cli collab transport: all stable/prod packaged builds
 * and every plain `tools-dev` run.
 *
 * Callers must route through this rather than assembling an object literal of
 * arrow functions, because a literal is unconditionally truthy no matter what
 * the transport turned out to be.
 */
export function createCollabPresenceCloudClient(
  transport: CollabPresenceCloudTransport | null | undefined,
  workspaceScopeFor: (projectId: string) => string | undefined,
): CollabPresenceCloudClient | null {
  if (!transport) return null;
  const exactWorkspaceId = (
    projectId: string,
    context?: WorkspaceCollabContext | null,
  ): string => {
    const workspaceId =
      context?.workspaceId?.trim() || workspaceScopeFor(projectId)?.trim() || '';
    if (!workspaceId) {
      throw new Error('explicit workspace scope is required');
    }
    return workspaceId;
  };
  return {
    heartbeatPresence: (projectId, input, context) =>
      transport.heartbeatPresence(
        projectId,
        input,
        exactWorkspaceId(projectId, context),
      ),
    listPresence: (projectId, context) =>
      transport.listPresence(
        projectId,
        exactWorkspaceId(projectId, context),
      ),
    leavePresence: (projectId, input, context) =>
      transport.leavePresence(
        projectId,
        input,
        exactWorkspaceId(projectId, context),
      ),
  };
}

function readHeartbeat(body: unknown): {
  member: PresenceMember;
  clientId: string;
  sequence?: number;
  filePath?: string | null;
  activity?: PresenceMember['activity'];
} | null {
  const raw = (body ?? {}) as Record<string, unknown>;
  const memberId = typeof raw.memberId === 'string' ? raw.memberId.trim() : '';
  if (!memberId) return null;
  const sequence = readPresenceSequence(raw);
  if (sequence === null) return null;
  const member: PresenceMember = { memberId };
  if (typeof raw.name === 'string' && raw.name.trim()) member.name = raw.name.trim();
  if (raw.role === 'owner' || raw.role === 'admin' || raw.role === 'member') member.role = raw.role;
  if (typeof raw.avatarUrl === 'string' || raw.avatarUrl === null) member.avatarUrl = raw.avatarUrl;
  if (typeof raw.filePath === 'string' || raw.filePath === null) member.filePath = raw.filePath;
  if (raw.activity !== undefined) member.activity = raw.activity as PresenceActivity;
  const explicitClientId = typeof raw.clientId === 'string' && raw.clientId.trim()
    ? raw.clientId.trim()
    : '';
  // A sequence only has meaning inside a stable session identity. Legacy
  // requests may still omit both fields and retain the member-id fallback.
  if (sequence !== undefined && !explicitClientId) return null;
  const clientId = explicitClientId || memberId;
  const filePath = typeof raw.filePath === 'string' || raw.filePath === null
    ? raw.filePath
    : undefined;
  return {
    member,
    clientId,
    ...(sequence !== undefined ? { sequence } : {}),
    ...(filePath !== undefined ? { filePath } : {}),
    ...(member.activity !== undefined ? { activity: member.activity } : {}),
  };
}

function readLeave(body: unknown): {
  memberId: string;
  clientId: string;
  sequence?: number;
} | null {
  const raw = (body ?? {}) as Record<string, unknown>;
  const memberId = typeof raw.memberId === 'string' ? raw.memberId.trim() : '';
  if (!memberId) return null;
  const sequence = readPresenceSequence(raw);
  if (sequence === null) return null;
  const explicitClientId = typeof raw.clientId === 'string' && raw.clientId.trim()
    ? raw.clientId.trim()
    : '';
  if (sequence !== undefined && !explicitClientId) return null;
  return {
    memberId,
    clientId: explicitClientId || memberId,
    ...(sequence !== undefined ? { sequence } : {}),
  };
}

function readPresenceSequence(
  raw: Record<string, unknown>,
): number | undefined | null {
  if (!Object.prototype.hasOwnProperty.call(raw, 'sequence')) return undefined;
  return Number.isSafeInteger(raw.sequence) && Number(raw.sequence) > 0
    ? Number(raw.sequence)
    : null;
}

/**
 * Answer a classified cloud-transport failure. Authoritative upstream
 * rejections keep their meaning (403/404) so the web client's existing
 * forbidden-request handling applies; only genuine infrastructure failures
 * stay 502/503. The response body is intentionally free of transport
 * internals — the spawned command line and stderr stay in the daemon log
 * (see {@link cloudError}).
 */
function sendClassifiedCloudError(
  res: Response,
  classified: ClassifiedCollabCloudError,
) {
  const upstreamSuffix =
    classified.upstreamStatus == null
      ? ''
      : ` (upstream status ${classified.upstreamStatus})`;
  const responseByKind = {
    denied: {
      error: 'collab_presence_denied',
      message: `the collab cloud rejected this presence request${upstreamSuffix}`,
    },
    not_found: {
      error: 'collab_presence_not_found',
      message: `the collab cloud has no record of this project${upstreamSuffix}`,
    },
    timeout: {
      error: 'collab_presence_unavailable',
      message: 'the collab cloud transport timed out',
    },
    infrastructure: {
      error: 'collab_presence_unavailable',
      message: `the collab cloud transport failed${upstreamSuffix}`,
    },
  } as const;
  return res.status(classified.status).json({
    ...responseByKind[classified.kind],
    ...(classified.retryable ? { retryable: true } : {}),
  });
}

function cloudError(res: Response, error: unknown) {
  if (error instanceof CollabCloudUpstreamBlockedError) {
    return sendClassifiedCloudError(res, error.classified);
  }
  const classified = classifyCollabCloudError(error);
  // The full failure — command line, stderr — is diagnostic gold but must not
  // reach the renderer; keep it daemon-side.
  console.warn(
    `[od] collab_presence_upstream_failure kind=${classified.kind} status=${classified.status} `
      + `detail=${JSON.stringify(error instanceof Error ? error.message : String(error))}`,
  );
  return sendClassifiedCloudError(res, classified);
}

const DEFAULT_PRESENCE_UPSTREAM_COOLDOWN_MS = 20_000;
/** Failures must be consecutive — one transient blip never opens the cache. */
const PRESENCE_UPSTREAM_FAILURE_THRESHOLD = 2;
const MAX_PRESENCE_UPSTREAM_FAILURE_ENTRIES = 256;

interface PresenceUpstreamFailureState {
  consecutiveFailures: number;
  blockedUntil: number;
  classified: ClassifiedCollabCloudError;
}

/**
 * Negative cache for a persistently failing collab cloud upstream.
 *
 * Every presence heartbeat/list over the vela-cli transport spawns a child
 * process. When the upstream keeps rejecting the same project (the packaged
 * 502-storm incident: hours of one CLI spawn per 10s beat against a dead
 * upstream), repeated consecutive failures open a cooldown during which the
 * stored classification is replayed without spawning; the first attempt after
 * the cooldown probes the upstream again. Any success closes the entry.
 */
function createPresenceUpstreamFailureCache(options: {
  cooldownMs: number;
  now: () => number;
}) {
  const states = new Map<string, PresenceUpstreamFailureState>();
  const keyFor = (
    projectId: string,
    context: WorkspaceCollabContext | null,
  ): string => `${context?.workspaceId?.trim() ?? ''}\0${projectId}`;
  const touch = (key: string, state: PresenceUpstreamFailureState) => {
    states.delete(key);
    states.set(key, state);
    while (states.size > MAX_PRESENCE_UPSTREAM_FAILURE_ENTRIES) {
      const oldestKey = states.keys().next().value;
      if (oldestKey === undefined) break;
      states.delete(oldestKey);
    }
  };

  return {
    /** The classification to replay while the cooldown is active, else null. */
    active(
      projectId: string,
      context: WorkspaceCollabContext | null,
    ): ClassifiedCollabCloudError | null {
      const state = states.get(keyFor(projectId, context));
      if (!state) return null;
      return options.now() < state.blockedUntil ? state.classified : null;
    },

    recordFailure(
      projectId: string,
      context: WorkspaceCollabContext | null,
      classified: ClassifiedCollabCloudError,
    ): void {
      const key = keyFor(projectId, context);
      const state = states.get(key) ?? {
        consecutiveFailures: 0,
        blockedUntil: 0,
        classified,
      };
      state.consecutiveFailures += 1;
      state.classified = classified;
      if (state.consecutiveFailures >= PRESENCE_UPSTREAM_FAILURE_THRESHOLD) {
        state.blockedUntil = options.now() + options.cooldownMs;
      }
      touch(key, state);
    },

    recordSuccess(
      projectId: string,
      context: WorkspaceCollabContext | null,
    ): void {
      states.delete(keyFor(projectId, context));
    },
  };
}

type PresenceWorkspaceVerification =
  | { ok: true; context: WorkspaceCollabContext | null }
  | Exclude<VerifiedWorkspaceRequestContextResult, { ok: true }>;

function normalizeWorkspaceVerification(
  value:
    | VerifiedWorkspaceRequestContextResult
    | WorkspaceCollabContext
    | null,
): PresenceWorkspaceVerification {
  if (value && 'ok' in value) return value;
  if (value) return { ok: true, context: value };
  // Legacy injected test adapters used null as a route-specific denial.
  // Production supplies the structured verifier result above.
  return { ok: true, context: null };
}

function sendWorkspaceVerificationFailure(
  res: Response,
  verification: Exclude<PresenceWorkspaceVerification, { ok: true }>,
) {
  return res.status(verification.status).json({
    error: verification.code,
    message: verification.message,
    ...(verification.retryable ? { retryable: true } : {}),
  });
}

interface PresenceSessionFenceState {
  latestSequence: number;
  closed: boolean;
  inflightHeartbeats: number;
}

interface PresenceHeartbeatFenceToken {
  state: PresenceSessionFenceState;
  accepted: boolean;
}

const MAX_PRESENCE_SESSION_FENCES = 4_096;

/**
 * Process-local ordering for the Web → daemon presence protocol.
 *
 * A close tombstone rejects heartbeats that arrive after leave, while an
 * already-running heartbeat observes the same state when it settles and sends
 * one compensating leave. Legacy requests without a sequence retain their old
 * behavior; new sessions use random client ids, so a closed old mount cannot
 * affect its replacement.
 */
function createPresenceSessionFence() {
  const states = new Map<string, PresenceSessionFenceState>();
  const keyFor = (
    projectId: string,
    context: WorkspaceCollabContext | null,
    memberId: string,
    clientId: string,
  ) => JSON.stringify([
    context?.workspaceId?.trim() ?? '',
    projectId,
    memberId,
    clientId,
  ]);
  const touch = (key: string, state: PresenceSessionFenceState) => {
    states.delete(key);
    states.set(key, state);
    while (states.size > MAX_PRESENCE_SESSION_FENCES) {
      let removed = false;
      for (const [candidateKey, candidate] of states) {
        if (candidate.inflightHeartbeats > 0) continue;
        states.delete(candidateKey);
        removed = true;
        break;
      }
      if (!removed) break;
    }
  };
  const stateFor = (key: string): PresenceSessionFenceState => {
    const existing = states.get(key);
    if (existing) return existing;
    const created: PresenceSessionFenceState = {
      latestSequence: 0,
      closed: false,
      inflightHeartbeats: 0,
    };
    touch(key, created);
    return created;
  };

  return {
    beginHeartbeat(input: {
      projectId: string;
      context: WorkspaceCollabContext | null;
      memberId: string;
      clientId: string;
      sequence?: number;
    }): PresenceHeartbeatFenceToken | null {
      if (input.sequence === undefined) return null;
      const key = keyFor(
        input.projectId,
        input.context,
        input.memberId,
        input.clientId,
      );
      const state = stateFor(key);
      const accepted = !state.closed && input.sequence > state.latestSequence;
      if (accepted) {
        state.latestSequence = input.sequence;
        state.inflightHeartbeats += 1;
      }
      touch(key, state);
      return { state, accepted };
    },

    close(input: {
      projectId: string;
      context: WorkspaceCollabContext | null;
      memberId: string;
      clientId: string;
      sequence?: number;
    }): boolean {
      if (input.sequence === undefined) return true;
      const key = keyFor(
        input.projectId,
        input.context,
        input.memberId,
        input.clientId,
      );
      const state = stateFor(key);
      if (input.sequence < state.latestSequence) {
        touch(key, state);
        return false;
      }
      // Repeating the same close is a valid retry. The first upstream leave
      // may have failed after the local tombstone was recorded, and deleting
      // the same client lease again is idempotent.
      if (input.sequence === state.latestSequence) {
        touch(key, state);
        return state.closed;
      }
      state.latestSequence = input.sequence;
      state.closed = true;
      touch(key, state);
      return true;
    },

    isClosed(token: PresenceHeartbeatFenceToken | null): boolean {
      return token?.state.closed === true;
    },

    finishHeartbeat(token: PresenceHeartbeatFenceToken | null): void {
      if (!token?.accepted) return;
      token.state.inflightHeartbeats = Math.max(
        0,
        token.state.inflightHeartbeats - 1,
      );
    },
  };
}

/**
 * Team collaboration presence (presence) capability. Members heartbeat while viewing a
 * shared project; clients poll the present set (live cursors were cut, content
 * is polled — the spec). The set is process-local in {@link CollabRuntime}.
 */
export function registerCollabPresenceRoutes(
  app: Express,
  deps: RegisterCollabPresenceRoutesDeps,
): CollabPresenceRoutesControl {
  const { presence } = deps.collab;
  const cloud = deps.cloud ?? null;
  const presenceLists = createPresenceListCache({
    freshMs: Math.max(
      0,
      deps.presenceListCacheFreshMs ?? DEFAULT_PRESENCE_LIST_CACHE_FRESH_MS,
    ),
    now: deps.presenceListCacheNow ?? Date.now,
  });
  const presenceSessions = createPresenceSessionFence();
  const upstreamFailures = createPresenceUpstreamFailureCache({
    cooldownMs: Math.max(
      0,
      deps.presenceUpstreamCooldownMs ?? DEFAULT_PRESENCE_UPSTREAM_COOLDOWN_MS,
    ),
    now: deps.presenceUpstreamNow ?? Date.now,
  });

  async function projectIsShared(
    projectId: string,
    context: WorkspaceCollabContext | null,
  ): Promise<boolean> {
    if (!deps.isProjectShared) return true;
    try {
      return await deps.isProjectShared(projectId, context);
    } catch (error) {
      return false;
    }
  }

  function cloudAuthorizesProject(projectId: string): boolean {
    if (!cloud || !deps.cloudAuthorizesProjectPresence) return false;
    try {
      return deps.cloudAuthorizesProjectPresence(projectId);
    } catch {
      return false;
    }
  }

  async function verifiedContext(
    req: Request,
    projectId: string,
    mode: 'read' | 'heartbeat' | 'leave',
  ): Promise<PresenceWorkspaceVerification> {
    let verify = deps.verifyWorkspaceRequest;
    if (mode === 'read') {
      verify = deps.verifyWorkspaceReadRequest ?? verify;
    } else if (mode === 'leave') {
      verify = deps.verifyWorkspaceLeaveRequest ?? verify;
    }
    if (!verify) {
      return { ok: true, context: null };
    }
    try {
      return normalizeWorkspaceVerification(
        await verify(req, projectId),
      );
    } catch {
      return {
        ok: false,
        status: 503,
        code: 'WORKSPACE_AUTHORITY_UNAVAILABLE',
        message: 'workspace membership authority is temporarily unavailable',
        retryable: true,
      };
    }
  }

  app.get('/api/projects/:id/presence', async (req, res) => {
    const verification = await verifiedContext(req, req.params.id, 'read');
    if (cloud && !verification.ok) {
      return sendWorkspaceVerificationFailure(res, verification);
    }
    const context = verification.ok ? verification.context : null;
    if (cloud) {
      try {
        return res.json({
          present: await presenceLists.read(
            req.params.id,
            context,
            async () => {
              // When the upstream hub subscription cannot authoritatively
              // vouch for this Workspace, resolving the project owner is part
              // of the SAME expensive Vela read as the roster. Keeping this
              // check outside `presenceLists` made every hot GET spawn a
              // second CLI/catalog read even while the roster itself was
              // cached. Explicit share/unshare and hub invalidation drop this
              // entry, while the exact authority verification above still
              // runs before every read and fails closed on membership loss.
              if (
                !cloudAuthorizesProject(req.params.id)
                && !(await projectIsShared(req.params.id, context))
              ) {
                return [];
              }
              const blocked = upstreamFailures.active(req.params.id, context);
              if (blocked) throw new CollabCloudUpstreamBlockedError(blocked);
              try {
                const present = await cloud.listPresence(req.params.id, context);
                upstreamFailures.recordSuccess(req.params.id, context);
                return present;
              } catch (error) {
                upstreamFailures.recordFailure(
                  req.params.id,
                  context,
                  classifyCollabCloudError(error),
                );
                throw error;
              }
            },
            { waitForFresh: req.query.fresh === '1' },
          ),
        });
      } catch (error) {
        return cloudError(res, error);
      }
    }
    if (!(await projectIsShared(req.params.id, context))) {
      return res.json({ present: [] });
    }
    res.json({ present: presence.present(req.params.id) });
  });

  app.post('/api/projects/:id/presence/heartbeat', async (req, res) => {
    const heartbeat = readHeartbeat(req.body);
    if (!heartbeat) return res.status(400).json({ error: 'memberId required' });
    const verification = await verifiedContext(req, req.params.id, 'heartbeat');
    if (cloud && !verification.ok) {
      return sendWorkspaceVerificationFailure(res, verification);
    }
    const context = verification.ok ? verification.context : null;
    if (
      cloud
      && deps.verifyWorkspaceRequest
      && (
        !verification.ok
        || !context
        || heartbeat.member.memberId !== context.workspaceMemberId
      )
    ) {
      return res.status(403).json({ error: 'WORKSPACE_PROJECT_PRESENCE_DENIED' });
    }
    const heartbeatFence = presenceSessions.beginHeartbeat({
      projectId: req.params.id,
      context,
      memberId: heartbeat.member.memberId,
      clientId: heartbeat.clientId,
      ...(heartbeat.sequence !== undefined
        ? { sequence: heartbeat.sequence }
        : {}),
    });
    if (heartbeatFence && !heartbeatFence.accepted) {
      return res.json({ present: [] });
    }
    try {
      if (
        !cloudAuthorizesProject(req.params.id) &&
        !(await projectIsShared(req.params.id, context))
      ) {
        if (cloud) presenceLists.publish(req.params.id, context, []);
        return res.json({ present: [] });
      }
      if (presenceSessions.isClosed(heartbeatFence)) {
        return res.json({ present: [] });
      }
      if (cloud) {
        // A project whose upstream keeps failing must not spawn another
        // transport process on every 10s beat — replay the classified failure
        // until the cooldown lets the next probe through.
        const blocked = upstreamFailures.active(req.params.id, context);
        if (blocked && !presenceSessions.isClosed(heartbeatFence)) {
          return sendClassifiedCloudError(res, blocked);
        }
        let present: CollabPresenceMember[] | null = null;
        let heartbeatError: unknown = null;
        try {
          present = await cloud.heartbeatPresence(
            req.params.id,
            heartbeat,
            context,
          );
          upstreamFailures.recordSuccess(req.params.id, context);
        } catch (error) {
          upstreamFailures.recordFailure(
            req.params.id,
            context,
            classifyCollabCloudError(error),
          );
          heartbeatError = error;
        }
        if (presenceSessions.isClosed(heartbeatFence)) {
          // leave may already have completed while this heartbeat was still in
          // flight. Close the same client lease once more after the old write
          // settles so its late side effect cannot resurrect the session.
          present = await cloud.leavePresence(
            req.params.id,
            {
              memberId: heartbeat.member.memberId,
              clientId: heartbeat.clientId,
            },
            context,
          );
          heartbeatError = null;
        }
        if (heartbeatError) throw heartbeatError;
        const settledPresent = present ?? [];
        presenceLists.publish(req.params.id, context, settledPresent);
        return res.json({ present: settledPresent });
      }
      if (!presenceSessions.isClosed(heartbeatFence)) {
        presence.heartbeat(
          req.params.id,
          heartbeat.member,
          heartbeat.clientId,
        );
      }
      return res.json({ present: presence.present(req.params.id) });
    } catch (error) {
      return cloudError(res, error);
    } finally {
      presenceSessions.finishHeartbeat(heartbeatFence);
    }
  });

  app.post('/api/projects/:id/presence/leave', async (req, res) => {
    const leave = readLeave(req.body);
    if (!leave) return res.status(400).json({ error: 'memberId required' });
    const verification = await verifiedContext(req, req.params.id, 'leave');
    if (cloud && !verification.ok) {
      return sendWorkspaceVerificationFailure(res, verification);
    }
    const context = verification.ok ? verification.context : null;
    if (
      cloud
      && (deps.verifyWorkspaceLeaveRequest ?? deps.verifyWorkspaceRequest)
      && (!verification.ok || !context || leave.memberId !== context.workspaceMemberId)
    ) {
      return res.status(403).json({ error: 'WORKSPACE_PROJECT_PRESENCE_DENIED' });
    }
    const leaveAccepted = presenceSessions.close({
      projectId: req.params.id,
      context,
      memberId: leave.memberId,
      clientId: leave.clientId,
      ...(leave.sequence !== undefined ? { sequence: leave.sequence } : {}),
    });
    if (!leaveAccepted) {
      return res.json({ ok: true, present: [] });
    }
    if (cloud) {
      try {
        // Leave is deliberately never gated by the upstream negative cache: a
        // closing session must always try to release its remote lease.
        const present = await cloud.leavePresence(
          req.params.id,
          leave,
          context,
        );
        upstreamFailures.recordSuccess(req.params.id, context);
        presenceLists.publish(req.params.id, context, present);
        return res.json({
          ok: true,
          present,
        });
      } catch (error) {
        return cloudError(res, error);
      }
    }
    presence.leave(req.params.id, leave.memberId, leave.clientId);
    res.json({ ok: true, present: presence.present(req.params.id) });
  });

  return {
    markPresenceStale: (projectId, workspaceId) =>
      presenceLists.markStale(projectId, workspaceId),
    invalidatePresence: (projectId, workspaceId) =>
      presenceLists.invalidate(projectId, workspaceId),
  };
}
