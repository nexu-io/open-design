// Team collaboration client integration. Ties the daemon collab capabilities
// together for a shared-project session: heartbeat presence, poll the published
// head version (so a member knows when to pull), and report author-side changes
// / request a publish. It is the glue the read-only collab view consumes.
//
// Polling-based by design (live cursors were cut; content is polled — the spec).

import type {
  CollabMemberRole,
  CollabPresenceMember,
  ProjectContentTransferState,
  ProjectSyncState,
  WorkspaceCollabContext,
} from '@open-design/contracts';

// Presence identity is the shared contract DTO; re-export so collab consumers
// keep importing it from the client module.
import { coalescedGet, evictCoalescedGet } from '../lib/coalesced-get';
import { randomUUID } from '../utils/uuid';
import {
  workspaceIdentityCacheKey,
  workspaceProjectHeaders,
} from './workspace-identity';
export type { CollabPresenceMember };

export interface CollabSnapshot {
  present: CollabPresenceMember[];
  publishedVersion: number | null;
  materializedVersion: number | null;
  contentTransferState: ProjectContentTransferState | null;
  /**
   * The daemon has only an unmaterialized shared-project placeholder for this
   * project, so its local file list is provably not the project's content. See
   * `CollabSyncStatusResponse.awaitingFirstMaterialization`.
   */
  awaitingFirstMaterialization: boolean;
  /** Monotonic trigger incremented after every successful status response. */
  statusPollGeneration: number;
  /**  project sync state; null until the first status poll lands. */
  syncState: ProjectSyncState | null;
  /** The member who shared this project (its single writer); null if unshared. */
  ownerMemberId: string | null;
  /**
   * The owner's display name, resolved server-side from the collab-cloud member
   * directory, so the read-only banner can read "这是 麻薯 创建的共享项目" instead
   * of an opaque id. Null when unshared or the owner is not in the directory.
   */
  ownerDisplayName: string | null;
  /** The owner's team role (owner/admin/member), from the same directory entry. */
  ownerRole: CollabMemberRole | null;
}

export interface CollabClientOptions {
  projectId: string;
  /**
   * The presence identity. Nullable because status polling does not need the
   * richer presence DTO once the workspace authority above is known. A caller
   * can supply it later via {@link CollabClient.setMember}; heartbeat + leave
   * stay a no-op while `member` is null.
   */
  member: CollabPresenceMember | null;
  /** Workspace authority captured when this client session was created. */
  workspaceContext?: WorkspaceCollabContext;
  /** Injectable for tests; defaults to the global fetch. */
  fetch?: typeof fetch;
  /** Daemon API base; default '' (same origin). */
  baseUrl?: string;
  heartbeatMs?: number;
  statusPollMs?: number;
  onUpdate?: (snapshot: CollabSnapshot) => void;
  onError?: (error: unknown) => void;
}

const DEFAULT_HEARTBEAT_MS = 10_000;
const DEFAULT_STATUS_POLL_MS = 5_000;
/**
 * Ceiling for the failure-widened heartbeat interval. Presence retries
 * forever (the upstream can recover at any moment), but a packaged client
 * left open against a persistently rejecting upstream must degrade to a slow
 * probe — not an error every 10 seconds for hours (the 502 storm).
 */
const HEARTBEAT_BACKOFF_CAP_MS = 300_000;
/** ±10% jitter so many open clients do not re-probe in lockstep. */
const HEARTBEAT_BACKOFF_JITTER = 0.2;
// Vela's authoritative project-presence lease is 30 seconds from the
// server-recorded heartbeatAt, not from when this client happens to observe
// the roster. Using observation time can nearly double a stale lease.
const DEFAULT_PRESENCE_ROSTER_GRACE_MS = 30_000;

class CollabRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'CollabRequestError';
  }
}

export class CollabClient {
  private readonly projectId: string;
  /**
   * One lease identity for this mounted client session. A member can leave and
   * immediately reopen the same project while the old leave request is still
   * in flight; using the member id as the lease key would let that stale leave
   * delete the replacement session's fresh heartbeat.
   */
  private readonly clientId = randomUUID();
  // Mutable — see setMember(). Status polling below never reads this; only
  // heartbeat/leave/leaveBeacon do, and all three no-op while it is null.
  private member: CollabPresenceMember | null;
  private readonly workspaceContext: WorkspaceCollabContext | undefined;
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;
  private readonly heartbeatMs: number;
  private readonly statusPollMs: number;
  private readonly onUpdate?: CollabClientOptions['onUpdate'];
  private readonly onError?: CollabClientOptions['onError'];
  private readonly timers: ReturnType<typeof setInterval>[] = [];
  private snapshot: CollabSnapshot = {
    present: [],
    publishedVersion: null,
    materializedVersion: null,
    contentTransferState: null,
    awaitingFirstMaterialization: false,
    statusPollGeneration: 0,
    syncState: null,
    ownerMemberId: null,
    ownerDisplayName: null,
    ownerRole: null,
  };
  /**
   * Local ordering fences for status requests racing each other and project
   * SSE. Server timestamps cannot safely order states across a daemon restart,
   * and a null tombstone has no timestamp at all. Therefore every status
   * response, concrete or null, may change transfer state only when it is the
   * newest request issued and no local transfer update landed while it was in
   * flight.
   */
  private contentTransferStateGeneration = 0;
  private contentTransferStatusRequestGeneration = 0;
  /**
   * Orders responses that can replace the presence roster. Issuing a newer
   * request must not suppress an older valid response while the newer one is
   * still pending (slow 10s+ networks would otherwise starve every heartbeat).
   * Only a successfully applied newer response supersedes older work. stop()
   * and identity changes advance both fences so obsolete sessions stay inert.
   */
  private presenceRequestGeneration = 0;
  private presenceAppliedRequestGeneration = 0;
  /** Authoritative Vela lease expiry derived from each valid heartbeatAt. */
  private readonly presenceLeaseExpiresAt = new Map<string, number>();
  /** Compatibility grace for legacy/local rosters without a valid heartbeatAt. */
  private readonly presenceFallbackMissingSince = new Map<string, number>();
  /** Suppresses the status-transition echo of an optimistic Team heartbeat. */
  private presenceAttemptedForMember = false;
  /**
   * Cancels cold-start work queued by an obsolete start/stop lifecycle. React
   * StrictMode replays mount effects as setup -> cleanup -> setup; launching
   * the first status read synchronously made both the discarded and surviving
   * clients hit `/collab/status`. The status ordering counters remain
   * untouched: this fence only decides whether a queued first poll launches.
   */
  private lifecycleGeneration = 0;
  /** Monotonic write ordering for this clientId's remote presence lease. */
  private presenceSessionSequence = 0;
  /** A leave is necessary only after a heartbeat request could have made a lease. */
  private presenceLeaseMemberId: string | null = null;
  /**
   * Self-scheduling heartbeat chain (single pending timer). A fixed interval
   * cannot express failure backoff, so each settled heartbeat schedules the
   * next one at {@link nextHeartbeatDelayMs}.
   */
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  /** Consecutive failed heartbeat requests; any success resets it. */
  private heartbeatFailureStreak = 0;
  private running = false;
  private onVisibilityChange: (() => void) | null = null;

  constructor(options: CollabClientOptions) {
    this.projectId = options.projectId;
    this.member = options.member;
    this.workspaceContext = options.workspaceContext;
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.baseUrl = options.baseUrl ?? '';
    this.heartbeatMs = Math.max(1_000, options.heartbeatMs ?? DEFAULT_HEARTBEAT_MS);
    this.statusPollMs = Math.max(1_000, options.statusPollMs ?? DEFAULT_STATUS_POLL_MS);
    this.onUpdate = options.onUpdate;
    this.onError = options.onError;
  }

  getSnapshot(): CollabSnapshot {
    return this.snapshot;
  }

  /**
   * Supply (or clear) the presence identity after construction. Status
   * polling is already running by the time an identity typically resolves —
   * this lets the caller hand it in without tearing the client (and its
   * in-flight status poll) down and rebuilding it. Fires an immediate
   * heartbeat when a real member arrives while running, so presence
   * announces itself right away instead of waiting out the next interval
   * tick — the same immediacy `start()` gives a member known up front. Updating
   * metadata for the same member only changes the next scheduled payload; it
   * must not create an extra heartbeat loop on ordinary React rerenders.
   */
  setMember(member: CollabPresenceMember | null): void {
    const previousMemberId = this.member?.memberId ?? null;
    const nextMemberId = member?.memberId ?? null;
    this.member = member;
    if (nextMemberId !== previousMemberId) {
      this.presenceRequestGeneration += 1;
      this.presenceAppliedRequestGeneration = this.presenceRequestGeneration;
      this.clearPresenceRoster();
      this.presenceAttemptedForMember = false;
      // A new identity is a new presence session: probe it promptly instead
      // of inheriting the previous identity's widened failure interval.
      this.heartbeatFailureStreak = 0;
    }
    if (
      this.running
      && member
      && nextMemberId !== previousMemberId
    ) {
      // Defer one microtask so React StrictMode can run its mount-cleanup-
      // remount probe before the network side effect starts. The retired
      // client's heartbeat then sees `running === false`; the live client
      // still announces in the same browser task without waiting for status.
      void Promise.resolve().then(() => {
        if (!this.presenceAttemptedForMember) return this.heartbeat();
      });
    }
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    const lifecycleGeneration = ++this.lifecycleGeneration;
    const statusRequestGeneration =
      this.contentTransferStatusRequestGeneration;
    // Let a same-turn teardown cancel a discarded StrictMode lifecycle before
    // it spends a cold status request. This is deliberately not request
    // single-flight: explicit polls retain their transfer-ordering semantics.
    queueMicrotask(() => {
      if (
        this.running
        && lifecycleGeneration === this.lifecycleGeneration
        && statusRequestGeneration
          === this.contentTransferStatusRequestGeneration
      ) {
        void this.pollStatus();
      }
    });
    // The daemon keeps a short-lived, authority-checked presence roster cache.
    // Consume that hot path before issuing the write heartbeat: the latter may
    // still need a slow Vela round trip, but a teammate already known to the
    // daemon should appear immediately. Only an exact Team scope may use this
    // pre-status path; legacy/unscoped and Personal sessions still wait for
    // authoritative project status.
    if (this.hasExplicitTeamScope()) void this.readCachedPresence();
    // Immediate first heartbeat: the presence roster comes from the heartbeat
    // RESPONSE, so without this the avatars only appear on the interval's
    // first tick — a 10s blank presence bar on every project open. This also
    // announces us to teammates right away.
    void this.heartbeat();
    // Hidden-tab gating applies only to the heavier status poll. Chrome can
    // report a still-mounted window as hidden merely because another window is
    // focused; presence must keep its lightweight lease alive in that state.
    const visible = () =>
      typeof document === 'undefined' || document.visibilityState !== 'hidden';
    this.timers.push(setInterval(() => {
      if (visible()) void this.pollStatus();
    }, this.statusPollMs));
    if (typeof document !== 'undefined') {
      this.onVisibilityChange = () => {
        if (!visible()) return;
        // Presence itself never pauses while hidden: heartbeat responses keep
        // the roster converged. This fresh read is only an extra catch-up for
        // events/timers the browser may have throttled in the background, and
        // it preserves the current roster until the response lands.
        void this.refreshPresenceAfterVisibility();
        void this.pollStatus();
      };
      document.addEventListener('visibilitychange', this.onVisibilityChange);
    }
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.lifecycleGeneration += 1;
    this.presenceRequestGeneration += 1;
    this.presenceAppliedRequestGeneration = this.presenceRequestGeneration;
    this.presenceLeaseExpiresAt.clear();
    this.presenceFallbackMissingSince.clear();
    for (const timer of this.timers) clearInterval(timer);
    this.timers.length = 0;
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.onVisibilityChange && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
      this.onVisibilityChange = null;
    }
    void this.leave();
  }

  /** The author edited a file — schedule a coalesced publish. */
  async reportChange(): Promise<void> {
    await this.post('/collab/changed');
  }

  /** Run boundary — flush the pending publish now. */
  async requestPublish(): Promise<void> {
    await this.post('/collab/publish');
  }

  /**
   * Member side — pull the resource-hub head into the local project directory.
   * The daemon materializes the new content and its file watcher then fires the
   * existing live-reload SSE, so the FileViewer refreshes on its own.
   */
  async pull(): Promise<number | null> {
    const body = await this.post('/collab/pull');
    return typeof body?.version === 'number' ? body.version : null;
  }

  async heartbeat(): Promise<void> {
    // A status request issued by a client that React has since cleaned up may
    // still resolve and reach the "newly shared" heartbeat below. Stopped
    // clients no longer own a presence loop and must never write to it.
    if (!this.running) return;
    try {
      await this.heartbeatOnce();
    } finally {
      // Every heartbeat attempt — including the identity-less and unshared
      // early returns — keeps the presence loop alive by scheduling the next
      // beat. stop() is the only exit from the chain.
      this.scheduleNextHeartbeat();
    }
  }

  private async heartbeatOnce(): Promise<void> {
    // No identity yet (status polling can be running well before `member`
    // resolves — see setMember) — presence has nothing to announce.
    if (!this.member) return;
    // Only an exact Team identity may optimistically announce before the
    // first status response. Personal Workspaces can be upgraded and gain
    // collaborators, so they must retain the established post-status path:
    // once the project is authoritatively confirmed shared below, Presence is
    // valid and the heartbeat must run.
    const explicitTeamStatusPending =
      this.snapshot.syncState === null
      && this.workspaceContext?.workspaceType === 'team'
      && Boolean(this.workspaceContext.workspaceId.trim())
      && Boolean(this.workspaceContext.workspaceMemberId.trim());
    if (!this.isSharedProject() && !explicitTeamStatusPending) {
      this.clearPresenceRoster();
      return;
    }
    this.presenceAttemptedForMember = true;
    const requestGeneration = ++this.presenceRequestGeneration;
    const sequence = ++this.presenceSessionSequence;
    const member = this.member;
    // Set before fetch: a timed-out or in-flight request may still establish a
    // remote lease, so stop() must close every heartbeat that was attempted.
    this.presenceLeaseMemberId = member.memberId;
    try {
      const body = await this.post('/presence/heartbeat', {
        ...member,
        clientId: this.clientId,
        sequence,
      });
      this.heartbeatFailureStreak = 0;
      if (Array.isArray(body?.present)) {
        this.applyPresenceResponse(
          requestGeneration,
          body.present as CollabPresenceMember[],
        );
      }
    } catch (error) {
      this.heartbeatFailureStreak += 1;
      if (isForbiddenCollabRequest(error)) {
        this.applyPresenceAuthorityRevocation(requestGeneration);
      }
      this.presenceAttemptedForMember = false;
      this.onError?.(error);
    }
  }

  /**
   * Reschedule the single pending heartbeat. Out-of-band beats (setMember's
   * immediate announce, the shared-transition beat in pollStatus) land here
   * too, so the loop never accumulates parallel timers.
   */
  private scheduleNextHeartbeat(): void {
    if (!this.running) return;
    if (this.heartbeatTimer) clearTimeout(this.heartbeatTimer);
    this.heartbeatTimer = setTimeout(() => {
      this.heartbeatTimer = null;
      void this.heartbeat();
    }, this.nextHeartbeatDelayMs());
  }

  /**
   * The invariant behind the 502-storm fix: consecutive heartbeat failures
   * double the interval (base → 2× → 4× → …) up to
   * {@link HEARTBEAT_BACKOFF_CAP_MS}, with jitter; one success — or a new
   * presence identity — restores the base cadence.
   */
  private nextHeartbeatDelayMs(): number {
    if (this.heartbeatFailureStreak === 0) return this.heartbeatMs;
    const exponent = Math.min(this.heartbeatFailureStreak - 1, 10);
    const widened = Math.min(
      this.heartbeatMs * 2 ** exponent,
      HEARTBEAT_BACKOFF_CAP_MS,
    );
    const jitter =
      1 - HEARTBEAT_BACKOFF_JITTER / 2 + HEARTBEAT_BACKOFF_JITTER * Math.random();
    return Math.round(widened * jitter);
  }

  /**
   * Re-read the presence roster without mutating the caller's heartbeat.
   *
   * Hub `presence-changed` events are emitted in response to presence writes.
   * Answering one with another heartbeat creates a write → event → write
   * feedback loop, so push-channel consumers must use this read-only path.
   */
  async refreshPresence(): Promise<void> {
    await this.readFreshPresence(false);
  }

  /**
   * Visibility catch-up is not evidence of an explicit viewer-set mutation.
   * Preserve still-live last-good peers just like a heartbeat response.
   */
  private async refreshPresenceAfterVisibility(): Promise<void> {
    await this.readFreshPresence(true);
  }

  private async readFreshPresence(preserveMissingPeers: boolean): Promise<void> {
    const requestGeneration = ++this.presenceRequestGeneration;
    try {
      // A hub presence event marks the daemon's short-lived roster cache stale.
      // Ordinary reads intentionally use stale-while-revalidate, but the event
      // consumer gets no second push after that background refresh settles.
      // Ask this one read to wait for the shared in-flight refresh so a stale
      // self-only roster cannot supersede an authoritative heartbeat forever.
      const body = await this.get('/presence?fresh=1');
      if (Array.isArray(body?.present)) {
        this.applyPresenceResponse(
          requestGeneration,
          body.present as CollabPresenceMember[],
          preserveMissingPeers,
        );
      }
    } catch (error) {
      if (isForbiddenCollabRequest(error)) {
        this.applyPresenceAuthorityRevocation(requestGeneration);
      }
      this.onError?.(error);
    }
  }

  /** Read the daemon's non-blocking SWR roster on an explicitly scoped start. */
  private async readCachedPresence(): Promise<void> {
    const requestGeneration = ++this.presenceRequestGeneration;
    try {
      const body = await this.get('/presence');
      if (Array.isArray(body?.present)) {
        this.applyPresenceResponse(
          requestGeneration,
          body.present as CollabPresenceMember[],
        );
      }
    } catch (error) {
      if (isForbiddenCollabRequest(error)) {
        this.applyPresenceAuthorityRevocation(requestGeneration);
      }
      // This is a best-effort latency optimization. The immediately following
      // heartbeat (or later authoritative status) owns failure reporting; do
      // not surface the same cold-start authority/network failure twice.
    }
  }

  async pollStatus(): Promise<void> {
    const statusRequestGeneration =
      ++this.contentTransferStatusRequestGeneration;
    const transferGenerationAtStart =
      this.contentTransferStateGeneration;
    try {
      const wasShared = this.isSharedProject();
      // Deliberately NOT the shared single-flight read: the poll's transfer
      // fences (`statusRequestGeneration` / `transferGenerationAtStart`) order
      // responses by request START time. Joining an already-in-flight GET
      // would let a poll issued AFTER a restart tombstone receive a body
      // captured BEFORE it and apply pre-restart transfer state over the
      // tombstone. One-shot consumers without ordering fences share
      // `fetchProjectCollabStatus` below instead.
      const body = await this.get('/collab/status');
      const version = typeof body?.publishedVersion === 'number' ? body.publishedVersion : null;
      const materializedVersion =
        typeof body?.materializedVersion === 'number' ? body.materializedVersion : null;
      const contentTransferState =
        parseProjectContentTransferState(body?.contentTransferState);
      const reportsContentTransferState =
        body != null
        && typeof body === 'object'
        && Object.prototype.hasOwnProperty.call(
          body,
          'contentTransferState',
        );
      const syncState = (body?.syncState as ProjectSyncState | undefined) ?? null;
      const ownerMemberId = typeof body?.ownerMemberId === 'string' ? body.ownerMemberId : null;
      const ownerDisplayName = typeof body?.ownerDisplayName === 'string' ? body.ownerDisplayName : null;
      const ownerRole = isCollabMemberRole(body?.ownerRole) ? body.ownerRole : null;
      const next: Partial<CollabSnapshot> = {
        publishedVersion: version,
        materializedVersion,
        awaitingFirstMaterialization: body?.awaitingFirstMaterialization === true,
        statusPollGeneration: this.snapshot.statusPollGeneration + 1,
        syncState,
        ownerMemberId,
        ownerDisplayName,
        ownerRole,
      };
      const transferResponseIsCurrent =
        reportsContentTransferState
        && statusRequestGeneration
          === this.contentTransferStatusRequestGeneration
        && transferGenerationAtStart
          === this.contentTransferStateGeneration;
      if (transferResponseIsCurrent) {
        if (
          contentTransferState
          && (
            this.snapshot.contentTransferState == null
            || contentTransferState.updatedAt
              >= this.snapshot.contentTransferState.updatedAt
          )
        ) {
          next.contentTransferState = contentTransferState;
        } else if (body?.contentTransferState == null) {
          next.contentTransferState = null;
        }
        // Even an invalid or timestamp-older concrete response is a settled
        // request-generation tombstone. Older in-flight requests must not
        // become eligible merely because this response made no visible patch.
        this.contentTransferStateGeneration += 1;
      }
      this.update(next);
      if (
        !wasShared
        && this.isSharedProject()
        && !this.presenceAttemptedForMember
      ) {
        void this.heartbeat();
      }
    } catch (error) {
      this.onError?.(error);
    }
  }

  /**
   * Apply the project SSE lifecycle update immediately. Timestamp ordering
   * prevents a slower status response from restoring an already-finished
   * download badge.
   */
  applyContentTransferState(state: ProjectContentTransferState): void {
    const current = this.snapshot.contentTransferState;
    if (current && current.updatedAt > state.updatedAt) return;
    this.contentTransferStateGeneration += 1;
    this.update({ contentTransferState: state });
  }

  private async leave(): Promise<void> {
    const memberId = this.presenceLeaseMemberId;
    if (!memberId) return;
    const sequence = ++this.presenceSessionSequence;
    try {
      await this.post('/presence/leave', {
        memberId,
        clientId: this.clientId,
        sequence,
      });
    } catch (error) {
      this.onError?.(error);
    }
  }

  /**
   * Best-effort leave that survives page unload. A normal fetch is aborted when
   * the tab closes, so a hard close would otherwise leave the member lingering
   * until the daemon's presence TTL sweeps it (~30s). sendBeacon (with a
   * keepalive-fetch fallback) hands the request to the browser to deliver after
   * the page is gone, so the present set drops promptly.
   */
  leaveBeacon(): void {
    const memberId = this.presenceLeaseMemberId;
    if (!memberId) return;
    const sequence = ++this.presenceSessionSequence;
    const url = this.url('/presence/leave');
    const body = JSON.stringify({
      memberId,
      clientId: this.clientId,
      sequence,
    });
    // sendBeacon cannot attach workspace headers. Retain it only for legacy
    // unscoped clients; real workspace sessions use keepalive fetch so the
    // daemon can authenticate the same captured identity as every other
    // collab route.
    if (!this.workspaceContext) {
      try {
        if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
          const blob = new Blob([body], { type: 'application/json' });
          if (navigator.sendBeacon(url, blob)) return;
        }
      } catch {
        // fall through to the keepalive fetch
      }
    }
    void this.fetchImpl(url, {
      method: 'POST',
      headers: {
        ...(this.workspaceContext
          ? workspaceProjectHeaders(this.workspaceContext)
          : {}),
        'content-type': 'application/json',
      },
      body,
      keepalive: true,
    }).catch(() => {});
  }

  private update(patch: Partial<CollabSnapshot>): void {
    const nextPatch = patch.present
      ? {
          ...patch,
          present: retainPresenceDisplayMetadata(
            this.snapshot.present,
            patch.present,
          ),
        }
      : patch;
    this.snapshot = { ...this.snapshot, ...nextPatch };
    this.onUpdate?.(this.snapshot);
  }

  private applyPresenceResponse(
    requestGeneration: number,
    present: CollabPresenceMember[],
    preserveMissingPeers = true,
  ): void {
    if (requestGeneration <= this.presenceAppliedRequestGeneration) return;
    this.presenceAppliedRequestGeneration = requestGeneration;
    this.update({
      present: this.stabilizePresenceRoster(present, preserveMissingPeers),
    });
  }

  private applyPresenceAuthorityRevocation(requestGeneration: number): void {
    if (requestGeneration <= this.presenceAppliedRequestGeneration) return;
    this.presenceAppliedRequestGeneration = requestGeneration;
    this.clearPresenceRoster();
  }

  private clearPresenceRoster(): void {
    this.presenceLeaseExpiresAt.clear();
    this.presenceFallbackMissingSince.clear();
    if (this.snapshot.present.length > 0) this.update({ present: [] });
  }

  private stabilizePresenceRoster(
    incoming: CollabPresenceMember[],
    preserveMissingPeers: boolean,
  ): CollabPresenceMember[] {
    const selfMemberId = this.member?.memberId;
    const incomingIds = new Set(incoming.map((member) => member.memberId));
    // Only the relay's known self-bearing partial roster gets display grace.
    // Empty and caller-less responses can signal revoked project authority.
    if (
      !this.running
      || !selfMemberId
      || incoming.length === 0
      || !incomingIds.has(selfMemberId)
    ) {
      this.presenceLeaseExpiresAt.clear();
      this.presenceFallbackMissingSince.clear();
      return incoming;
    }

    const now = Date.now();
    for (const member of incoming) {
      const heartbeatAt = member.heartbeatAt?.trim();
      const heartbeatAtMs = heartbeatAt ? Date.parse(heartbeatAt) : Number.NaN;
      if (Number.isFinite(heartbeatAtMs)) {
        this.presenceLeaseExpiresAt.set(
          member.memberId,
          heartbeatAtMs + DEFAULT_PRESENCE_ROSTER_GRACE_MS,
        );
      } else {
        this.presenceLeaseExpiresAt.delete(member.memberId);
      }
      this.presenceFallbackMissingSince.delete(member.memberId);
    }
    if (!preserveMissingPeers) {
      for (const memberId of this.presenceLeaseExpiresAt.keys()) {
        if (!incomingIds.has(memberId)) this.presenceLeaseExpiresAt.delete(memberId);
      }
      for (const memberId of this.presenceFallbackMissingSince.keys()) {
        if (!incomingIds.has(memberId)) {
          this.presenceFallbackMissingSince.delete(memberId);
        }
      }
      return incoming;
    }

    const retained: CollabPresenceMember[] = [];
    const previousIds = new Set(
      this.snapshot.present.map((member) => member.memberId),
    );
    for (const member of this.snapshot.present) {
      if (incomingIds.has(member.memberId)) continue;
      const leaseExpiresAt = this.presenceLeaseExpiresAt.get(member.memberId);
      if (leaseExpiresAt !== undefined) {
        if (now < leaseExpiresAt) retained.push(member);
        else this.presenceLeaseExpiresAt.delete(member.memberId);
        this.presenceFallbackMissingSince.delete(member.memberId);
        continue;
      }

      const missingSince = this.presenceFallbackMissingSince.get(member.memberId);
      if (missingSince === undefined) {
        this.presenceFallbackMissingSince.set(member.memberId, now);
        retained.push(member);
      } else if (now - missingSince < this.heartbeatMs) {
        retained.push(member);
      } else {
        this.presenceFallbackMissingSince.delete(member.memberId);
      }
    }
    for (const memberId of this.presenceLeaseExpiresAt.keys()) {
      if (!previousIds.has(memberId) && !incomingIds.has(memberId)) {
        this.presenceLeaseExpiresAt.delete(memberId);
      }
    }
    for (const memberId of this.presenceFallbackMissingSince.keys()) {
      if (!previousIds.has(memberId) && !incomingIds.has(memberId)) {
        this.presenceFallbackMissingSince.delete(memberId);
      }
    }
    return retained.length > 0 ? [...incoming, ...retained] : incoming;
  }

  private isSharedProject(): boolean {
    return this.snapshot.syncState !== null && this.snapshot.syncState !== 'local_only';
  }

  private hasExplicitTeamScope(): boolean {
    return this.workspaceContext?.workspaceType === 'team'
      && Boolean(this.workspaceContext.workspaceId.trim())
      && Boolean(this.workspaceContext.workspaceMemberId.trim());
  }

  private async get(path: string): Promise<Record<string, unknown> | null> {
    const response = await this.fetchImpl(this.url(path), {
      ...(this.workspaceContext
        ? { headers: workspaceProjectHeaders(this.workspaceContext) }
        : {}),
    });
    if (!response.ok) {
      throw new CollabRequestError(
        `collab GET ${path} failed: ${response.status}`,
        response.status,
      );
    }
    return (await response.json()) as Record<string, unknown>;
  }

  private async post(path: string, body?: unknown): Promise<Record<string, unknown> | null> {
    const init: RequestInit = {
      method: 'POST',
      ...(this.workspaceContext
        ? { headers: workspaceProjectHeaders(this.workspaceContext) }
        : {}),
    };
    if (body !== undefined) {
      init.headers = {
        ...(this.workspaceContext
          ? workspaceProjectHeaders(this.workspaceContext)
          : {}),
        'content-type': 'application/json',
      };
      init.body = JSON.stringify(body);
    }
    const response = await this.fetchImpl(this.url(path), init);
    if (!response.ok) {
      throw new CollabRequestError(
        `collab POST ${path} failed: ${response.status}`,
        response.status,
      );
    }
    return (await response.json()) as Record<string, unknown>;
  }

  private url(path: string): string {
    return `${this.baseUrl}/api/projects/${encodeURIComponent(this.projectId)}${path}`;
  }
}

/**
 * Single-flight `/collab/status` read for one-shot consumers without local
 * ordering fences (shared-status checks in FileWorkspace/FileViewer and
 * similar display reads, Batch A §4.3). CollabClient's poll loop does NOT use
 * this — see the comment in `pollStatus`. Short burst TTL only; call
 * `evictProjectCollabStatusRead` when an authoritative change event demands a
 * guaranteed-fresh read.
 */
export function fetchProjectCollabStatus(
  projectId: string,
  options?: {
    baseUrl?: string;
    fetchImpl?: typeof fetch;
    workspaceContext?: WorkspaceCollabContext;
  },
): Promise<Record<string, unknown> | null> {
  const baseUrl = options?.baseUrl ?? '';
  const fetchImpl = options?.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const identity = workspaceIdentityCacheKey(options?.workspaceContext);
  return coalescedGet(`collab-status:${baseUrl}|${identity}|${projectId}`, async () => {
    const response = await fetchImpl(
      `${baseUrl}/api/projects/${encodeURIComponent(projectId)}/collab/status`,
      options?.workspaceContext
        ? { headers: workspaceProjectHeaders(options.workspaceContext) }
        : undefined,
    );
    if (!response.ok) {
      throw new Error(`collab GET /collab/status failed: ${response.status}`);
    }
    return (await response.json()) as Record<string, unknown>;
  });
}

/** Thin invalidation for the shared status read (authoritative SSE change). */
export function evictProjectCollabStatusRead(
  projectId: string,
  baseUrl = '',
  workspaceContext?: WorkspaceCollabContext,
): void {
  evictCoalescedGet(
    `collab-status:${baseUrl}|${workspaceIdentityCacheKey(workspaceContext)}|${projectId}`,
  );
}

function isCollabMemberRole(value: unknown): value is CollabMemberRole {
  return value === 'owner' || value === 'admin' || value === 'member';
}

/**
 * Presence heartbeats and list reads may return a compact roster containing
 * only member ids. Keep stable display metadata for ids that remain online,
 * while taking membership exclusively from the new roster so departures are
 * never retained locally.
 */
function retainPresenceDisplayMetadata(
  previous: CollabPresenceMember[],
  incoming: CollabPresenceMember[],
): CollabPresenceMember[] {
  const previousById = new Map(
    previous.map((member) => [member.memberId, member]),
  );
  return incoming.map((member) => {
    const known = previousById.get(member.memberId);
    if (!known) return member;
    return {
      ...member,
      ...(member.name === undefined && known.name !== undefined
        ? { name: known.name }
        : {}),
      ...(member.avatarUrl === undefined && known.avatarUrl !== undefined
        ? { avatarUrl: known.avatarUrl }
        : {}),
      ...(member.role === undefined && known.role !== undefined
        ? { role: known.role }
        : {}),
    };
  });
}

function isForbiddenCollabRequest(error: unknown): boolean {
  return error instanceof CollabRequestError && error.status === 403;
}

function parseProjectContentTransferState(
  value: unknown,
): ProjectContentTransferState | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (
    candidate.status !== 'downloading'
    && candidate.status !== 'idle'
  ) {
    return null;
  }
  if (
    typeof candidate.startedAt !== 'number'
    || !Number.isFinite(candidate.startedAt)
    || typeof candidate.updatedAt !== 'number'
    || !Number.isFinite(candidate.updatedAt)
  ) {
    return null;
  }
  if (
    candidate.version !== undefined
    && (
      typeof candidate.version !== 'number'
      || !Number.isSafeInteger(candidate.version)
      || candidate.version < 0
    )
  ) {
    return null;
  }
  return {
    status: candidate.status,
    ...(typeof candidate.version === 'number'
      ? { version: candidate.version }
      : {}),
    startedAt: candidate.startedAt,
    updatedAt: candidate.updatedAt,
  };
}
