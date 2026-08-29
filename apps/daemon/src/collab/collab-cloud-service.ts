// Collab-cloud orchestration (C-lane §D2.5 / §D4): ties the collab-cloud client
// to the one workspace context so a single signed-in identity drives member
// registration, comment push, and the pull+merge poller. Kept OUT of
// collab/runtime.ts (which #5383 is also editing) so the surfaces do not collide.
//
// Everything degrades to a no-op off-team: when the workspace context has no
// team identity, registration/push/poll all short-circuit. The client itself is
// only constructed when OD_COLLAB_CLOUD_URL is set (see createCollabCloudClientFromEnv),
// so an unconfigured daemon never even reaches here.

import type {
  CollabCloudComment,
  CollabCloudMemberDirectoryEntry,
  PreviewComment,
  WorkspaceCollabContext,
} from '@open-design/contracts';
import type { CollabCloudClient } from '../integrations/collab-cloud.js';
import type { WorkspaceContextProvider } from './workspace-context.js';
import type {
  CommentRelayOutboxIdentity,
  CommentRelayOutboxRecord,
  CommentRelayOutboxStore,
} from './comment-relay-outbox.js';

/** The daemon-local seams the service needs; injected so this file stays free of
 *  SQLite and the poller is unit-testable with fakes. */
export interface CollabCloudServiceDeps {
  client: CollabCloudClient;
  /**
   * Legacy construction seam retained for compatibility with isolated callers.
   * Project operations never read it: ambient active-workspace state is not
   * data-plane authority.
   */
  workspaceContext?: WorkspaceContextProvider;
  /** Local project ids to poll for inbound comments. */
  listProjectIds: () => string[];
  /** Resolve the exact persisted + directory-verified scope for one project. */
  resolveProjectWorkspaceContext?: (
    projectId: string,
    options?: { fresh?: boolean },
  ) => Promise<WorkspaceCollabContext | null>;
  /**
   * Resolve one fresh directory authority for a durable relay batch. The
   * returned context must still match the persisted identity; the service
   * verifies that before any catalog read or push.
   */
  resolveCommentRelayWorkspaceContext?: (
    identity: CommentRelayOutboxIdentity,
    options: { fresh: true },
  ) => Promise<WorkspaceCollabContext | null>;
  /** Cheap local binding witness applied per queued record in a batch. */
  validateCommentRelayProjectBinding?: (record: CommentRelayOutboxRecord) => boolean;
  /** Local binding witness captured synchronously when the mutation commits. */
  resolveLocalProjectRelayBinding?: (projectId: string) => {
    workspaceId: string;
    ownerMemberId: string | null;
  } | null;
  /** Fresh remote catalog witness checked immediately before each relay push. */
  resolveRemoteProjectOwnerMemberId?: (
    projectId: string,
    context: WorkspaceCollabContext,
  ) => Promise<string | null>;
  /**
   * One uncached Team catalog snapshot for a durable relay batch. Multiple
   * owners for the same project id are retained and matched exactly.
   */
  listRemoteProjectRelayBindings?: (
    context: WorkspaceCollabContext,
  ) => Promise<Array<{ projectId: string; ownerMemberId: string }>>;
  /**
   * Resolve a LOCAL conversation id to re-home synced comments onto (conversation
   * ids do not cross daemons, and preview_comments has a conversation FK). Null
   * when the project has no local conversation yet — the poller then skips it.
   */
  resolveLocalConversationId: (projectId: string) => string | null;
  /**
   * Merge one pulled comment into local storage, idempotently by comment id.
   * Returns true when a new row was inserted (false when it already existed).
   */
  mergeComment: (input: {
    projectId: string;
    conversationId: string;
    comment: CollabCloudComment;
  }) => boolean;
  /** Poll cadence; defaults to the spec's foreground 5s (§D4.5). */
  pollIntervalMs?: number;
  /** Durable outbound Team-comment queue. Omitted by isolated/local callers. */
  commentOutbox?: CommentRelayOutboxStore;
  /** Called after a queued create/edit receives its authoritative relay seq. */
  onCommentPushed?: (input: {
    projectId: string;
    commentId: string;
    seq: number;
  }) => void;
  now?: () => number;
  retryDelayMs?: (attemptCount: number) => number;
  onError?: (error: unknown) => void;
  onMerged?: (input: { projectId: string; inserted: number }) => void;
}

const DEFAULT_POLL_INTERVAL_MS = 5_000;
const COMMENT_OUTBOX_PUSH_CONCURRENCY = 4;

/**
 * Map a locally-stored preview comment to the cloud sync unit. Carries the full
 * anchoring payload + drift-ladder fields so the comment keeps pointing at the
 * same element on the receiver. `memberId` is the AUTHOR (who wrote it), taken
 * from the comment's authorMemberId, falling back to the sharing member.
 */
export function previewCommentToCloud(
  comment: PreviewComment,
  fallbackMemberId: string,
): CollabCloudComment {
  const cloud: CollabCloudComment = {
    id: comment.id,
    projectId: comment.projectId,
    conversationId: comment.conversationId,
    memberId: comment.authorMemberId ?? fallbackMemberId,
    seq: 0,
    note: comment.note,
    filePath: comment.filePath,
    elementId: comment.elementId,
    selector: comment.selector,
    label: comment.label,
    text: comment.text,
    htmlHint: comment.htmlHint,
    position: comment.position,
    status: comment.status,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
  };
  // Copy optional fields only when present (exactOptionalPropertyTypes-safe).
  if (comment.style !== undefined) cloud.style = comment.style;
  if (comment.selectionKind !== undefined) cloud.selectionKind = comment.selectionKind;
  if (comment.memberCount !== undefined) cloud.memberCount = comment.memberCount;
  if (comment.podMembers !== undefined) cloud.podMembers = comment.podMembers;
  if (comment.slideIndex !== undefined) cloud.slideIndex = comment.slideIndex;
  if (comment.attachments !== undefined) cloud.attachments = comment.attachments;
  if (comment.anchorState !== undefined) cloud.anchorState = comment.anchorState;
  if (comment.anchoredVersion !== undefined) cloud.anchoredVersion = comment.anchoredVersion;
  if (comment.lastGoodPosition !== undefined) cloud.lastGoodPosition = comment.lastGoodPosition;
  return cloud;
}

export interface CollabCloudService {
  /** PUT the current member's directory entry (best-effort; no-op off-team). */
  registerSelf(context?: WorkspaceCollabContext): Promise<void>;
  /**
   * Push a created OR edited comment to the cloud (best-effort; no-op off-team).
   * The relay upserts by id and receivers apply the newest by `updatedAt`, so the
   * same call carries both the initial create and any later edit/status change.
   *
   * Resolves with the cloud-assigned `seq` for THIS push (or `null` off-team /
   * on failure) so the caller can reconcile a new comment's provisional
   * `pin_seq` — see `confirmPreviewCommentPinSeq` in db.ts and the
   * recvq5BVsolIxi design note above `previewCommentToCloud`. The value is
   * safe to feed into that reconciliation from EITHER a create or an edit
   * push: the guard there only ever applies once per comment, so whichever
   * push resolves first (in practice almost always the create) wins and a
   * later resolution is a no-op.
   */
  pushComment(
    comment: PreviewComment,
    context: WorkspaceCollabContext,
  ): Promise<{ seq: number } | null>;
  /**
   * Push a delete as a tombstone (best-effort; no-op off-team). Receivers remove
   * the comment by id. Stamps a fresh `updatedAt` so the tombstone is not treated
   * as a stale edit if it races an in-flight update.
   */
  pushCommentDeletion(
    comment: PreviewComment,
    context: WorkspaceCollabContext,
  ): Promise<void>;
  /** Persist a create/edit for asynchronous, restart-safe relay delivery. */
  enqueueComment(
    comment: PreviewComment,
    context: WorkspaceCollabContext,
  ): boolean;
  /** Persist a delete tombstone for asynchronous, restart-safe delivery. */
  enqueueCommentDeletion(
    comment: PreviewComment,
    context: WorkspaceCollabContext,
  ): boolean;
  /** Drain due durable deliveries; exposed for deterministic tests/catch-up. */
  flushPendingComments(): Promise<void>;
  /** The explicitly scoped team's member directory (empty only off-team). */
  listMembers(
    context: WorkspaceCollabContext,
  ): Promise<CollabCloudMemberDirectoryEntry[]>;
  /** Resolve one member id to its directory entry, or null. */
  resolveMember(
    memberId: string,
    context: WorkspaceCollabContext,
  ): Promise<CollabCloudMemberDirectoryEntry | null>;
  /** Run one poll cycle (register + pull + merge across all local projects). */
  pollOnce(): Promise<void>;
  /**
   * Pull + merge ONE project's comments now, regardless of whether it has a
   * live events subscriber. This is the hub push-channel consumer: a
   * `comment-changed` dirty mark must be redeemable even when the project is
   * not in `listProjectIds()` (the poll loop's open-projects scope) — the
   * poll loop otherwise never covers it and the mark would be consumed for
   * nothing. Errors land on `onError`; never throws.
   *
   * Resolves `true` only when a pull actually ran against the relay for this
   * project (a legitimately-empty/not-modified result still counts). Resolves
   * `false` when it no-oped (no team identity yet, no local conversation to
   * merge into) or the pull failed — the caller must then treat its consumed
   * dirty mark as UNREDEEMED and restore it, otherwise a transient miss
   * silently loses the one signal a single comment ever gets.
   */
  pullProject(
    projectId: string,
    context: WorkspaceCollabContext,
  ): Promise<boolean>;
  /** Start the background poller. */
  start(): void;
  /** Stop the poller. */
  dispose(): void;
}

export function createCollabCloudService(deps: CollabCloudServiceDeps): CollabCloudService {
  const pollIntervalMs = deps.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const now = deps.now ?? Date.now;
  const retryDelayMs = deps.retryDelayMs ?? ((attemptCount: number) =>
    Math.min(30_000, 1_000 * (2 ** Math.min(Math.max(0, attemptCount), 5))));
  // Per-project pull cursor + last ETag, so each poll only fetches new comments
  // and a 304 costs nothing.
  const cursors = new Map<string, number>();
  const etags = new Map<string, string | null>();
  const inFlightPulls = new Map<string, Promise<boolean>>();
  let timer: NodeJS.Timeout | null = null;
  let running = false;
  let outboxRunning = false;
  let outboxRerunRequested = false;
  let started = false;
  // The identity we last pushed to the member directory. Re-registering only
  // when this changes keeps `pollOnce` from spawning a `vela member register`
  // process on every 5s tick (see pollOnce).
  let lastRegisteredKey: string | null = null;

  function explicitTeamIdentity(context: WorkspaceCollabContext): {
    teamId: string;
    memberId: string;
    role: 'owner' | 'admin' | 'member';
    displayName: string;
  } | null {
    if (
      context.workspaceType !== 'team'
      || context.memberStatus !== 'active'
      || context.lifecycleState === 'deleted'
    ) {
      return null;
    }
    const teamId = context.teamId?.trim() || context.workspaceId.trim();
    const memberId = context.workspaceMemberId.trim();
    if (!teamId || !memberId) return null;
    return {
      teamId,
      memberId,
      role: context.role,
      displayName: context.displayName?.trim() || memberId,
    };
  }

  async function registerSelf(
    context?: WorkspaceCollabContext,
  ): Promise<void> {
    const identity = context ? explicitTeamIdentity(context) : null;
    if (!identity) return;
    await deps.client.registerMember(identity.teamId, identity.memberId, {
      displayName: identity.displayName,
      role: identity.role,
    });
  }

  async function pushComment(
    comment: PreviewComment,
    context: WorkspaceCollabContext,
  ): Promise<{ seq: number } | null> {
    const identity = explicitTeamIdentity(context);
    if (!identity) return null;
    const cloud = previewCommentToCloud(comment, identity.memberId);
    const result = await deps.client.pushComment(identity.teamId, comment.projectId, cloud);
    return result ?? null;
  }

  async function pushCommentDeletion(
    comment: PreviewComment,
    context: WorkspaceCollabContext,
  ): Promise<void> {
    const identity = explicitTeamIdentity(context);
    if (!identity) return;
    const cloud = previewCommentToCloud(comment, identity.memberId);
    cloud.deleted = true;
    // The tombstone's own event time — newer than the comment's last content
    // edit so it can't be mistaken for a stale record on the relay/receiver.
    cloud.updatedAt = Date.now();
    await deps.client.pushComment(identity.teamId, comment.projectId, cloud);
  }

  function queuedCloudComment(
    comment: PreviewComment,
    context: WorkspaceCollabContext,
    deleted: boolean,
  ): boolean {
    if (!deps.commentOutbox) return false;
    const identity = explicitTeamIdentity(context);
    if (!identity) return false;
    const localBinding = deps.resolveLocalProjectRelayBinding?.(comment.projectId) ?? null;
    const expectedOwnerMemberId = localBinding?.ownerMemberId?.trim() || null;
    if (
      !localBinding
      || localBinding.workspaceId !== context.workspaceId
    ) return false;
    const cloud = previewCommentToCloud(comment, identity.memberId);
    if (deleted) {
      cloud.deleted = true;
      cloud.updatedAt = now();
    }
    try {
      deps.commentOutbox.enqueue({
        workspaceId: context.workspaceId,
        workspaceMemberId: identity.memberId,
        teamId: identity.teamId,
        projectId: comment.projectId,
        expectedOwnerMemberId,
        comment: cloud,
      });
    } catch (error) {
      deps.onError?.(error);
      return false;
    }
    if (started) {
      queueMicrotask(() => {
        void flushPendingComments().catch((error) => deps.onError?.(error));
      });
    }
    return true;
  }

  function deferOutboxRecord(record: CommentRelayOutboxRecord, error: unknown): void {
    const attemptCount = record.attemptCount + 1;
    const message = error instanceof Error ? error.message : String(error);
    deps.commentOutbox?.defer(record, {
      nextAttemptAt: now() + Math.max(0, retryDelayMs(attemptCount)),
      error: message,
    });
    deps.onError?.(error);
  }

  const relayIdentityKey = (record: CommentRelayOutboxIdentity): string =>
    JSON.stringify([record.workspaceId, record.workspaceMemberId, record.teamId]);

  const relayIdentityMatches = (
    context: WorkspaceCollabContext,
    record: CommentRelayOutboxIdentity,
  ): ReturnType<typeof explicitTeamIdentity> => {
    const identity = explicitTeamIdentity(context);
    return identity
      && context.workspaceId === record.workspaceId
      && identity.memberId === record.workspaceMemberId
      && identity.teamId === record.teamId
      ? identity
      : null;
  };

  async function pushOutboxRecord(
    record: CommentRelayOutboxRecord,
    identity: NonNullable<ReturnType<typeof explicitTeamIdentity>>,
  ): Promise<void> {
    try {
      const result = await deps.client.pushComment(
        identity.teamId,
        record.projectId,
        record.comment,
      );
      // Revision-conditional ACK: if an edit/delete was queued while this
      // payload was in flight, its newer row remains for the next drain.
      deps.commentOutbox?.acknowledge(record);
      if (!record.comment.deleted) {
        deps.onCommentPushed?.({
          projectId: record.projectId,
          commentId: record.commentId,
          seq: result.seq,
        });
      }
    } catch (error) {
      deferOutboxRecord(record, error);
    }
  }

  async function pushOutboxProjectLanes(
    records: CommentRelayOutboxRecord[],
    identity: NonNullable<ReturnType<typeof explicitTeamIdentity>>,
  ): Promise<void> {
    const lanes = new Map<string, CommentRelayOutboxRecord[]>();
    for (const record of records) {
      const lane = lanes.get(record.projectId);
      if (lane) lane.push(record);
      else lanes.set(record.projectId, [record]);
    }
    const pendingLanes = [...lanes.values()];
    let nextLane = 0;
    const worker = async () => {
      while (nextLane < pendingLanes.length) {
        const lane = pendingLanes[nextLane];
        nextLane += 1;
        if (!lane) continue;
        // A project's relay sequence is user-visible comment order. Keep that
        // lane strictly serial while unrelated projects use spare capacity.
        for (const record of lane) await pushOutboxRecord(record, identity);
      }
    };
    await Promise.all(
      Array.from(
        { length: Math.min(COMMENT_OUTBOX_PUSH_CONCURRENCY, pendingLanes.length) },
        () => worker(),
      ),
    );
  }

  async function flushLegacyOutboxRecord(record: CommentRelayOutboxRecord): Promise<void> {
    try {
      const context =
        await deps.resolveProjectWorkspaceContext?.(
          record.projectId,
          { fresh: true },
        ) ?? null;
      const identity = context ? relayIdentityMatches(context, record) : null;
      if (!context || !identity) {
        deferOutboxRecord(
          record,
          new Error('comment relay delivery authority is unavailable or changed'),
        );
        return;
      }
      const remoteOwnerMemberId =
        await deps.resolveRemoteProjectOwnerMemberId?.(
          record.projectId,
          context,
        );
      if (
        !remoteOwnerMemberId
        || (
          record.expectedOwnerMemberId !== null
          && remoteOwnerMemberId !== record.expectedOwnerMemberId
        )
      ) {
        deps.commentOutbox?.acknowledge(record);
        if (
          remoteOwnerMemberId
          && record.expectedOwnerMemberId !== null
          && remoteOwnerMemberId !== record.expectedOwnerMemberId
        ) {
          deps.onError?.(new Error('comment relay delivery owner changed; canceled'));
        }
        return;
      }
      await pushOutboxRecord(record, identity);
    } catch (error) {
      deferOutboxRecord(record, error);
    }
  }

  async function flushOutboxIdentityBatch(
    records: CommentRelayOutboxRecord[],
  ): Promise<void> {
    const representative = records[0];
    if (!representative) return;
    let eligible = records;
    if (deps.validateCommentRelayProjectBinding) {
      eligible = [];
      for (const record of records) {
        if (deps.validateCommentRelayProjectBinding(record)) eligible.push(record);
        else {
          // A local unshare/delete/re-home is authoritative and cannot become
          // valid again for this queued revision. Cancel it even if the remote
          // catalog still carries a briefly-stale row.
          deps.commentOutbox?.acknowledge(record);
          deps.onError?.(new Error('comment relay project binding changed; canceled'));
        }
      }
    }
    if (eligible.length === 0) return;

    let context: WorkspaceCollabContext | null;
    try {
      context = await deps.resolveCommentRelayWorkspaceContext?.(
        representative,
        { fresh: true },
      ) ?? null;
    } catch (error) {
      for (const record of eligible) deferOutboxRecord(record, error);
      return;
    }
    const identity = context ? relayIdentityMatches(context, representative) : null;
    if (!context || !identity) {
      const error = new Error('comment relay delivery authority is unavailable or changed');
      for (const record of eligible) deferOutboxRecord(record, error);
      return;
    }

    let bindings: Array<{ projectId: string; ownerMemberId: string }>;
    try {
      bindings = await deps.listRemoteProjectRelayBindings?.(context) ?? [];
    } catch (error) {
      for (const record of eligible) deferOutboxRecord(record, error);
      return;
    }
    const remoteOwners = new Map<string, Set<string>>();
    for (const binding of bindings) {
      const projectId = binding.projectId.trim();
      const ownerMemberId = binding.ownerMemberId.trim();
      if (!projectId || !ownerMemberId) continue;
      const owners = remoteOwners.get(projectId);
      if (owners) owners.add(ownerMemberId);
      else remoteOwners.set(projectId, new Set([ownerMemberId]));
    }

    const deliverable: CommentRelayOutboxRecord[] = [];
    for (const record of eligible) {
      const owners = remoteOwners.get(record.projectId);
      const expectedOwner = record.expectedOwnerMemberId;
      if (!owners || owners.size === 0) {
        deps.commentOutbox?.acknowledge(record);
        continue;
      }
      if (expectedOwner !== null && !owners.has(expectedOwner)) {
        deps.commentOutbox?.acknowledge(record);
        deps.onError?.(new Error('comment relay delivery owner changed; canceled'));
        continue;
      }
      deliverable.push(record);
    }
    await pushOutboxProjectLanes(deliverable, identity);
  }

  async function flushPendingComments(): Promise<void> {
    if (!deps.commentOutbox) return;
    if (outboxRunning) {
      // A mutation can land after the active drain took its SQLite snapshot.
      // Coalesce that signal into one follow-up pass instead of dropping it
      // and making the revision wait for the next 5s poll tick.
      outboxRerunRequested = true;
      return;
    }
    outboxRunning = true;
    try {
      do {
        outboxRerunRequested = false;
        const pending = deps.commentOutbox.listDue(now());
        if (pending.length === 0) continue;
        if (
          !deps.resolveCommentRelayWorkspaceContext
          || !deps.listRemoteProjectRelayBindings
        ) {
          for (const record of pending) await flushLegacyOutboxRecord(record);
          continue;
        }
        const batches = new Map<string, CommentRelayOutboxRecord[]>();
        for (const record of pending) {
          const key = relayIdentityKey(record);
          const batch = batches.get(key);
          if (batch) batch.push(record);
          else batches.set(key, [record]);
        }
        // Identity batches remain serial so a login/session transition cannot
        // overlap two principals. Pushes inside one verified batch are bounded.
        for (const batch of batches.values()) await flushOutboxIdentityBatch(batch);
      } while (outboxRerunRequested);
    } finally {
      outboxRunning = false;
    }
  }

  async function listMembersForTeamId(
    teamId: string,
  ): Promise<CollabCloudMemberDirectoryEntry[]> {
    if (!teamId) return [];
    try {
      return await deps.client.listMembers(teamId);
    } catch (error) {
      deps.onError?.(error);
      // A transport failure is not evidence that the team has no members.
      // Propagate it so the persistent + SWR layers retain their last-good
      // roster and the invalidation poller retains its previous signature.
      throw error;
    }
  }

  async function listMembers(
    context: WorkspaceCollabContext,
  ): Promise<CollabCloudMemberDirectoryEntry[]> {
    const identity = explicitTeamIdentity(context);
    return identity ? listMembersForTeamId(identity.teamId) : [];
  }

  async function resolveMember(
    memberId: string,
    context: WorkspaceCollabContext,
  ): Promise<CollabCloudMemberDirectoryEntry | null> {
    const identity = explicitTeamIdentity(context);
    if (!identity) return null;
    const members = await listMembersForTeamId(identity.teamId);
    return members.find((m) => m.memberId === memberId) ?? null;
  }

  /** Resolves `true` when a pull ran (even if it returned nothing new),
   *  `false` when there was no local conversation to merge into. */
  async function pollProject(
    teamId: string,
    scopeKey: string,
    projectId: string,
  ): Promise<boolean> {
    const conversationId = deps.resolveLocalConversationId(projectId);
    // No local conversation to attach to yet (e.g. a member who pulled the
    // project but has not opened a chat) — nothing to merge into.
    if (!conversationId) return false;
    const cursorKey = `${scopeKey}:${projectId}`;
    const sinceSeq = cursors.get(cursorKey) ?? 0;
    const result = await deps.client.pullComments(
      teamId,
      projectId,
      sinceSeq,
      etags.get(cursorKey),
    );
    etags.set(cursorKey, result.etag);
    if (result.notModified) return true;
    let inserted = 0;
    for (const comment of result.comments) {
      if (deps.mergeComment({ projectId, conversationId, comment })) inserted += 1;
    }
    cursors.set(cursorKey, result.latestSeq);
    if (inserted > 0) deps.onMerged?.({ projectId, inserted });
    return true;
  }

  function pullProjectSingleflight(
    context: WorkspaceCollabContext,
    identity: {
      teamId: string;
      memberId: string;
    },
    projectId: string,
  ): Promise<boolean> {
    const scopeKey = `${context.workspaceId}:${identity.memberId}`;
    const inFlightKey = JSON.stringify([
      context.workspaceId,
      identity.teamId,
      identity.memberId,
      projectId,
    ]);
    const existing = inFlightPulls.get(inFlightKey);
    if (existing) return existing;

    const request = pollProject(identity.teamId, scopeKey, projectId)
      .catch((error) => {
        deps.onError?.(error);
        return false;
      });
    inFlightPulls.set(inFlightKey, request);
    void request.then(() => {
      if (inFlightPulls.get(inFlightKey) === request) {
        inFlightPulls.delete(inFlightKey);
      }
    });
    return request;
  }

  async function pullProject(
    projectId: string,
    context: WorkspaceCollabContext,
  ): Promise<boolean> {
    const identity = explicitTeamIdentity(context);
    if (!identity) return false;
    return pullProjectSingleflight(context, identity, projectId);
  }

  async function pollOnce(): Promise<void> {
    // Outbound delivery is durable and owns its own single-flight guard. Do
    // not put inbound pulls behind a slow relay push: a stalled outbox row
    // must not delay a teammate's newly-created comment from appearing.
    void flushPendingComments().catch((error) => deps.onError?.(error));
    for (const projectId of deps.listProjectIds()) {
      try {
        const context =
          await deps.resolveProjectWorkspaceContext?.(projectId) ?? null;
        const identity = context ? explicitTeamIdentity(context) : null;
        if (!context || !identity) continue;
        // Refresh the exact project's member directory entry only when its
        // immutable workspace/member identity changes. Never borrow the
        // daemon's ambient active workspace.
        const identityKey =
          `${context.workspaceId}:${identity.teamId}:${identity.memberId}:`
          + `${identity.role}:${identity.displayName}`;
        if (identityKey !== lastRegisteredKey) {
          await deps.client.registerMember(identity.teamId, identity.memberId, {
            displayName: identity.displayName,
            role: identity.role,
          });
          lastRegisteredKey = identityKey;
        }
        await pullProjectSingleflight(context, identity, projectId);
      } catch (error) {
        deps.onError?.(error);
      }
    }
  }

  function tick(): void {
    if (running) return;
    running = true;
    void pollOnce()
      .catch((error) => deps.onError?.(error))
      .finally(() => {
        running = false;
      });
  }

  return {
    registerSelf,
    pushComment,
    pushCommentDeletion,
    enqueueComment(comment, context) {
      return queuedCloudComment(comment, context, false);
    },
    enqueueCommentDeletion(comment, context) {
      return queuedCloudComment(comment, context, true);
    },
    flushPendingComments,
    listMembers,
    resolveMember,
    pollOnce,
    pullProject,
    start() {
      if (timer) return;
      started = true;
      timer = setInterval(tick, pollIntervalMs);
      // Do not keep the event loop alive solely for polling.
      timer.unref?.();
      // Recover rows left by a prior daemon before waiting a whole poll period.
      tick();
    },
    dispose() {
      started = false;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
}
