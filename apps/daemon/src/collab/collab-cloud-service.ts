// Collab-cloud orchestration (C-lane §D2.5 / §D4): ties the collab-cloud client
// to the one workspace context so a single signed-in identity drives member
// registration, comment push, and the pull+merge poller. Kept OUT of
// collab/runtime.ts (which #5383 is also editing) so the surfaces do not collide.
//
// Everything degrades to a no-op off-team: when the workspace context has no
// team identity, registration/push/poll all short-circuit. The client itself is
// only constructed when OD_COLLAB_CLOUD_URL is set (see createCollabCloudClientFromEnv),
// so an unconfigured daemon never even reaches here.

import { SHARE_COMMENT_TERMINAL_REJECTION } from "@open-design/contracts";
import type {
	CollabCloudComment,
	CollabCloudMemberDirectoryEntry,
	PreviewComment,
	WorkspaceCollabContext,
} from "@open-design/contracts";
import {
	CollabCloudError,
	type CollabCloudClient,
	type CollabCloudMemberRebuildCode,
} from "../integrations/collab-cloud.js";
import type { SyncedCommentMergeResult } from "../db.js";
import {
	nextMemberPageQuery,
	type CommentInboundStore,
	type MemberSyncScope,
} from "./comment-inbound-store.js";
import type { WorkspaceContextProvider } from "./workspace-context.js";
import type { CommentRelayScope } from "./comment-relay-scope.js";
import type {
	CommentRelayOutboxIdentity,
	CommentRelayOutboxRecord,
	CommentRelayOutboxStore,
} from "./comment-relay-outbox.js";

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
	validateCommentRelayProjectBinding?: (
		record: CommentRelayOutboxRecord,
	) => boolean;
	/**
	 * True when a personal record failed that witness only because its creator's
	 * project became team-visible (a public link in a team workspace). Such a
	 * record is re-queued as Team relay instead of being cancelled.
	 */
	isCommentRelayRecordPromotedToTeam?: (
		record: CommentRelayOutboxRecord,
	) => boolean;
	/** Separate creator-scoped eligibility for active public personal projects. */
	commentRelayScope?: (
		projectId: string,
		filePath: string,
		context: WorkspaceCollabContext,
	) => CommentRelayScope | null;
	/** Exact active personal-publication files for this project's persisted creator.
	 * This must fail closed and must not consult the member directory. */
	listPersonalCommentRelayFilePaths?: (
		projectId: string,
		context: WorkspaceCollabContext,
	) => ReadonlySet<string>;
	/**
	 * Where a comment we already store lives, by project AND comment id.
	 *
	 * A deletion arriving from the cloud carries no anchor: there is nothing left
	 * to point at. The personal path filters incoming records by `filePath`, so a
	 * tombstone matches nothing and is dropped — while the cursor still advances
	 * past it. The deletion is then unreachable forever, and the local copy keeps
	 * a comment the author deleted on the web.
	 *
	 * Resolving the stored record's own `filePath` is what lets a tombstone be
	 * judged by the same publication rules as the comment it deletes, instead of
	 * by an anchor it cannot have.
	 *
	 * Contract, and each clause is load-bearing:
	 * - BOTH ids are required. Matching on comment id alone would let one
	 *   project's deletion reach another project's row.
	 * - `found: false` means the row is genuinely absent — a safe no-op.
	 * - A failed lookup MUST throw. It must never be reported as absence: that
	 *   would turn "the database did not answer" into "there is nothing to
	 *   delete", and the batch would be acknowledged with the deletion lost.
	 * - Only the stored path is returned. The comment's own content stays out of
	 *   this seam; the caller is deciding eligibility, not reading the comment.
	 */
	resolveStoredCommentLocation?: (
		projectId: string,
		commentId: string,
	) => { found: false } | { found: true; filePath: string | null };
	/** Resolve a server-asserted publication identity to a currently published local path.
	 * null is an unknown/stopped alias; errors retain the batch cursor for retry.
	 * This does not authorize a merge: existing identity/file checks still apply.
	 */
	resolvePublishedCommentSourcePath?: (input: {
		projectId: string;
		publicationSlug: string;
		publishedPath: string;
		context: WorkspaceCollabContext;
	}) => string | null;
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
	 * Acknowledge changed or safely unchanged state; throw on persistence failure.
	 */
	mergeComment: (input: {
		projectId: string;
		conversationId: string;
		comment: CollabCloudComment;
		/**
		 * The seq space `comment.seq` belongs to (relay team + stream). Seqs are
		 * only comparable within one stream: a rebuilt member stream renumbers,
		 * and a personal and a team relay count independently.
		 */
		stream?: string;
	}) => SyncedCommentMergeResult;
	/**
	 * Durable C3-LITE member-page cursor + atomic page commit. When present, a
	 * team project's MEMBER comments arrive through bounded pages (snapshot,
	 * then incremental rounds) instead of the legacy unbounded pull. Share-page
	 * (user) comments still come from the legacy pull until public paging (BA2)
	 * exists. Omitted → legacy pull only, exactly as before.
	 */
	memberCommentStore?: CommentInboundStore;
	/**
	 * Local binding witness for member paging: false once this project is no
	 * longer team-shared here (stop sharing flips visibility inside the same
	 * workspace, so the workspace context alone cannot see it). False drops the
	 * project's member cursors/ledgers and refuses in-flight pages. Omitted →
	 * the workspace context is the only witness.
	 */
	isMemberSyncProjectShared?: (projectId: string) => boolean;
	/**
	 * The stored member cursor was unusable (C3-LITE §4 `INVALID_CURSOR`,
	 * `CURSOR_STALE`, `SCOPE_CHANGED`, or a page whose scope token no longer
	 * matches the stored round) and a rebuild is starting: the cursor has been
	 * reset and the same drain continues with a fresh snapshot. Diagnostic only.
	 */
	onMemberSyncRebuildRequired?: (input: {
		projectId: string;
		scope: MemberSyncScope;
		code: "INVALID_CURSOR" | "CURSOR_STALE" | "SCOPE_CHANGED";
	}) => void;
	/** Poll cadence; defaults to the spec's foreground 5s (§D4.5). */
	pollIntervalMs?: number;
	/** Durable outbound Team-comment queue. Omitted by isolated/local callers. */
	commentOutbox?: CommentRelayOutboxStore;
	/** Called after a queued create/edit receives its authoritative relay seq. */
	onCommentPushed?: (input: {
		projectId: string;
		commentId: string;
		seq: number;
		memberId: string;
		authorKey?: string;
	}) => void;
	now?: () => number;
	retryDelayMs?: (attemptCount: number) => number;
	/**
	 * Delay before the member page route is tried again after `failures`
	 * consecutive failed drains of one scope (a programming error such as
	 * `INVALID_PAGE_REQUEST` counts one extra). Defaults to
	 * `memberPageRetryDelayMs`.
	 */
	memberPageRetryDelayMs?: (failures: number) => number;
	onError?: (error: unknown) => void;
	/**
	 * At most once per pull round (member page drain + legacy pull), with the
	 * number of committed rows that round changed. A trailing rerun is its own
	 * round.
	 */
	onMerged?: (input: { projectId: string; inserted: number }) => void;
}

const DEFAULT_POLL_INTERVAL_MS = 5_000;
/**
 * Upper bound on pages one drain requests. The cursor is durable, so stopping
 * here loses nothing: the next wake continues from the last committed page.
 * It only keeps a misbehaving server from pinning a drain forever.
 */
const MAX_MEMBER_PAGES_PER_DRAIN = 200;
const COMMENT_OUTBOX_PUSH_CONCURRENCY = 4;

/** ~10 min of relay backoff: far longer than the background catalog reconcile. */
const AWAIT_TEAM_VISIBILITY_MAX_ATTEMPTS = 24;
const MEMBER_PAGE_RETRY_BASE_MS = 10_000;
const MEMBER_PAGE_RETRY_MAX_MS = 5 * 60_000;

/**
 * Bounded exponential backoff for the member page route. One transient
 * failure is retried on the next poll (0); from the second consecutive failure
 * the delay is 10s, 20s, 40s … capped at 5 minutes. The legacy pull keeps
 * carrying member comments while paging is backed off.
 */
export function memberPageRetryDelayMs(failures: number): number {
	const exponent = failures - 1;
	if (exponent <= 0) return 0;
	return Math.min(
		MEMBER_PAGE_RETRY_MAX_MS,
		MEMBER_PAGE_RETRY_BASE_MS * 2 ** Math.min(exponent - 1, 20),
	);
}

/** A failure that retrying the same request cannot fix (see backoff weight). */
function isPermanentMemberPageError(error: unknown): boolean {
	return (
		error instanceof MemberRebuildRefusedError ||
		(error instanceof CollabCloudError && error.code === "INVALID_PAGE_REQUEST")
	);
}

/** A rebuild snapshot was itself refused, or a drain needed a second rebuild. */
class MemberRebuildRefusedError extends Error {
	constructor(projectId: string, code: string) {
		super(
			`Member comment rebuild for project ${projectId} was refused (${code})`,
		);
		this.name = "MemberRebuildRefusedError";
	}
}

/**
 * Map a locally-stored preview comment to the cloud sync unit. Carries the full
 * anchoring payload + drift-ladder fields so the comment keeps pointing at the
 * same element on the receiver. `memberId` is the AUTHOR (who wrote it), taken
 * only from the comment's authorMemberId; an authorless comment stays blank so
 * the relay owner is never misrepresented as its author.
 */
export function previewCommentToCloud(
	comment: PreviewComment,
	_fallbackMemberId: string,
): CollabCloudComment {
	const cloud: CollabCloudComment = {
		id: comment.id,
		projectId: comment.projectId,
		conversationId: comment.conversationId,
		// A relay owner is not the author. Keep the legacy required wire field
		// empty when an external/authorless comment has no workspace member.
		memberId:
			comment.authorKind === "user" ? "" : (comment.authorMemberId ?? ""),
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
	if (comment.selectionKind !== undefined)
		cloud.selectionKind = comment.selectionKind;
	if (comment.memberCount !== undefined)
		cloud.memberCount = comment.memberCount;
	if (comment.podMembers !== undefined) cloud.podMembers = comment.podMembers;
	if (comment.slideIndex !== undefined) cloud.slideIndex = comment.slideIndex;
	if (comment.attachments !== undefined)
		cloud.attachments = comment.attachments;
	if (comment.anchorState !== undefined)
		cloud.anchorState = comment.anchorState;
	if (comment.anchoredVersion !== undefined)
		cloud.anchoredVersion = comment.anchoredVersion;
	if (comment.lastGoodPosition !== undefined)
		cloud.lastGoodPosition = comment.lastGoodPosition;
	if (comment.authorKind !== undefined) cloud.authorKind = comment.authorKind;
	if (comment.authorAppUserId !== undefined)
		cloud.authorAppUserId = comment.authorAppUserId;
	if (comment.authorDisplayName !== undefined)
		cloud.authorDisplayName = comment.authorDisplayName;
	if (comment.authorKey !== undefined) cloud.authorKey = comment.authorKey;
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
	/** Last successfully merged cursor for this exact publication/principal scope.
	 * Null after restart/before pull; never manufacture cursor zero for align. */
	readMergedCommentCursor(
		projectId: string,
		context: WorkspaceCollabContext,
	): number | null;
	/** Start the background poller. */
	start(): void;
	/** Stop the poller. */
	dispose(): void;
}

export function createCollabCloudService(
	deps: CollabCloudServiceDeps,
): CollabCloudService {
	const pollIntervalMs = deps.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
	const now = deps.now ?? Date.now;
	const retryDelayMs =
		deps.retryDelayMs ??
		((attemptCount: number) =>
			Math.min(30_000, 1_000 * 2 ** Math.min(Math.max(0, attemptCount), 5)));
	// Per-project pull cursor + last ETag, so each poll only fetches new comments
	// and a 304 costs nothing.
	const cursors = new Map<string, number>();
	const etags = new Map<string, string | null>();
	const inFlightPulls = new Map<
		string,
		{ promise: Promise<boolean>; rerun: boolean }
	>();
	// The member scope currently syncing each project. A drain whose scope is
	// no longer this one (account switch, stop sharing) must not commit.
	const activeMemberScope = new Map<string, string>();
	// Consecutive failed drains per member scope, and when paging may retry.
	const memberBackoff = new Map<string, { failures: number; until: number }>();
	const memberRetryDelay =
		deps.memberPageRetryDelayMs ?? memberPageRetryDelayMs;
	// Legacy cursor keys whose pulls skipped member records because paging
	// covered them. If paging stops covering them, that cursor is reset.
	const legacyMemberFilteredKeys = new Set<string>();
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
		role: "owner" | "admin" | "member";
		displayName: string;
	} | null {
		if (
			context.workspaceType !== "team" ||
			context.memberStatus !== "active" ||
			context.lifecycleState === "deleted"
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

	type PullIdentity = {
		teamId: string;
		memberId: string;
		relayScope: "team" | "personal";
		allowedFilePaths?: ReadonlySet<string>;
	};

	// Personal pulls share one remote project stream, but each publication set
	// sees only a subset of it. Keep their validators and high-water marks apart:
	// advancing a global cursor after filtering would permanently acknowledge a
	// comment for a file published (or resumed) later.
	function pullCursorKey(
		scopeKey: string,
		projectId: string,
		identity: PullIdentity,
	): string {
		if (identity.relayScope === "team") return `${scopeKey}:${projectId}`;
		const filePaths = [...(identity.allowedFilePaths ?? [])].sort();
		return `${scopeKey}:${projectId}:personal:${JSON.stringify(filePaths)}`;
	}

	function personalPullIdentity(
		projectId: string,
		context: WorkspaceCollabContext,
	): PullIdentity | null {
		if (
			context.workspaceType !== "personal" ||
			context.memberStatus !== "active" ||
			context.lifecycleState === "deleted"
		)
			return null;
		const memberId = context.workspaceMemberId.trim();
		const teamId = context.workspaceId.trim();
		const allowedFilePaths = deps.listPersonalCommentRelayFilePaths?.(
			projectId,
			context,
		);
		if (
			!memberId ||
			!teamId ||
			!allowedFilePaths ||
			allowedFilePaths.size === 0
		)
			return null;
		return { teamId, memberId, relayScope: "personal", allowedFilePaths };
	}

	function pullIdentity(
		projectId: string,
		context: WorkspaceCollabContext,
	): PullIdentity | null {
		const team = explicitTeamIdentity(context);
		if (team)
			return {
				teamId: team.teamId,
				memberId: team.memberId,
				relayScope: "team",
			};
		return personalPullIdentity(projectId, context);
	}

	function relayIdentity(
		context: WorkspaceCollabContext,
		projectId: string,
		filePath: string,
	): {
		teamId: string;
		memberId: string;
		role: "owner" | "admin" | "member";
		displayName: string;
		relayScope: "team" | "personal";
	} | null {
		const scoped = deps.commentRelayScope?.(projectId, filePath, context);
		if (!scoped) {
			if (deps.commentRelayScope) return null;
			const team = explicitTeamIdentity(context);
			return team ? { ...team, relayScope: "team" } : null;
		}
		if (
			context.memberStatus !== "active" ||
			context.lifecycleState === "deleted"
		)
			return null;
		const memberId = context.workspaceMemberId.trim();
		if (!memberId || context.workspaceId !== scoped.workspaceId) return null;
		return {
			teamId: scoped.teamId,
			memberId,
			role: context.role,
			displayName: context.displayName?.trim() || memberId,
			relayScope: scoped.relayScope,
		};
	}

	async function registerSelf(context?: WorkspaceCollabContext): Promise<void> {
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
		const identity = relayIdentity(
			context,
			comment.projectId,
			comment.filePath,
		);
		if (!identity) return null;
		const cloud = previewCommentToCloud(comment, identity.memberId);
		const result = await deps.client.pushComment(
			identity.teamId,
			comment.projectId,
			cloud,
		);
		return result ?? null;
	}

	async function pushCommentDeletion(
		comment: PreviewComment,
		context: WorkspaceCollabContext,
	): Promise<void> {
		const identity = relayIdentity(
			context,
			comment.projectId,
			comment.filePath,
		);
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
		const identity = relayIdentity(
			context,
			comment.projectId,
			comment.filePath,
		);
		if (!identity) return false;
		const localBinding =
			deps.resolveLocalProjectRelayBinding?.(comment.projectId) ?? null;
		const expectedOwnerMemberId = localBinding?.ownerMemberId?.trim() || null;
		if (!localBinding || localBinding.workspaceId !== context.workspaceId)
			return false;
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
				relayScope: identity.relayScope,
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

	/** A stopped public share is a server-confirmed terminal state for this exact durable revision. */
	function isShareStoppedRelayError(error: unknown): error is CollabCloudError {
		return (
			error instanceof CollabCloudError &&
			error.status === SHARE_COMMENT_TERMINAL_REJECTION.status &&
			error.code === SHARE_COMMENT_TERMINAL_REJECTION.code
		);
	}

	function deferOutboxRecord(
		record: CommentRelayOutboxRecord,
		error: unknown,
	): void {
		const attemptCount = record.attemptCount + 1;
		const message = error instanceof Error ? error.message : String(error);
		deps.commentOutbox?.defer(record, {
			nextAttemptAt: now() + Math.max(0, retryDelayMs(attemptCount)),
			error: message,
		});
		deps.onError?.(error);
	}

	const relayIdentityKey = (record: CommentRelayOutboxIdentity): string =>
		JSON.stringify([
			record.workspaceId,
			record.workspaceMemberId,
			record.teamId,
			record.relayScope,
		]);

	const relayIdentityMatches = (
		context: WorkspaceCollabContext,
		record: CommentRelayOutboxRecord,
	) => {
		const identity = relayIdentity(
			context,
			record.projectId,
			record.comment.filePath,
		);
		return identity &&
			identity.relayScope === record.relayScope &&
			context.workspaceId === record.workspaceId &&
			identity.memberId === record.workspaceMemberId &&
			identity.teamId === record.teamId
			? identity
			: null;
	};

	const personalBatchIdentityMatches = (
		context: WorkspaceCollabContext,
		record: CommentRelayOutboxRecord,
	): { teamId: string; memberId: string } | null => {
		const memberId = context.workspaceMemberId.trim();
		return context.memberStatus === "active" &&
			context.lifecycleState !== "deleted" &&
			context.workspaceId === record.workspaceId &&
			memberId === record.workspaceMemberId &&
			record.teamId === record.workspaceId
			? { teamId: record.teamId, memberId }
			: null;
	};

	async function pushOutboxRecord(
		record: CommentRelayOutboxRecord,
		identity: { teamId: string; memberId: string },
	): Promise<void> {
		try {
			// Recheck each publication-bound record immediately before network I/O:
			// an earlier record may have awaited while stop/re-publish changed the witness.
			if (
				record.publication &&
				!deps.commentOutbox?.isPublicationCurrent?.(record)
			) {
				deps.commentOutbox?.acknowledge(record);
				return;
			}
			const result = await deps.client.pushComment(
				identity.teamId,
				record.projectId,
				record.publication
					? {
							...record.comment,
							filePath: record.publication.publicFilePath,
							publicationSlug: record.publication.slug,
						}
					: record.comment,
				record.eventKey,
				// Only the durable owner-mediated publication relay may request an
				// original member. Vela independently verifies this owner, active
				// publication and same-team directory before honoring the hint.
				record.publication && record.comment.memberId && record.comment.memberId !== identity.memberId
					? record.comment.memberId : undefined,
			);
			// Revision-conditional ACK: if an edit/delete was queued while this
			// payload was in flight, its newer row remains for the next drain.
			deps.commentOutbox?.acknowledge(record, "delivered");
			if (!record.comment.deleted) {
				deps.onCommentPushed?.({
					projectId: record.projectId,
					commentId: record.commentId,
					seq: result.seq,
					memberId: record.workspaceMemberId,
					...(result.authorKey ? { authorKey: result.authorKey } : {}),
				});
			}
		} catch (error) {
			if (isShareStoppedRelayError(error)) {
				// The server has authoritatively closed this share. A revision-conditional
				// ACK preserves a newer local edit that raced this rejected request.
				deps.commentOutbox?.acknowledge(record);
				deps.onError?.(error);
				return;
			}
			deferOutboxRecord(record, error);
		}
	}

	async function pushOutboxProjectLanes(
		records: CommentRelayOutboxRecord[],
		identity: { teamId: string; memberId: string },
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
				{
					length: Math.min(
						COMMENT_OUTBOX_PUSH_CONCURRENCY,
						pendingLanes.length,
					),
				},
				() => worker(),
			),
		);
	}

	async function flushLegacyOutboxRecord(
		record: CommentRelayOutboxRecord,
	): Promise<void> {
		try {
			const context =
				(await deps.resolveProjectWorkspaceContext?.(record.projectId, {
					fresh: true,
				})) ?? null;
			const identity = context ? relayIdentityMatches(context, record) : null;
			if (!context || !identity) {
				deferOutboxRecord(
					record,
					new Error(
						"comment relay delivery authority is unavailable or changed",
					),
				);
				return;
			}
			const remoteOwnerMemberId =
				await deps.resolveRemoteProjectOwnerMemberId?.(
					record.projectId,
					context,
				);
			if (
				!remoteOwnerMemberId ||
				(record.expectedOwnerMemberId !== null &&
					remoteOwnerMemberId !== record.expectedOwnerMemberId)
			) {
				deps.commentOutbox?.acknowledge(record);
				if (
					remoteOwnerMemberId &&
					record.expectedOwnerMemberId !== null &&
					remoteOwnerMemberId !== record.expectedOwnerMemberId
				) {
					deps.onError?.(
						new Error("comment relay delivery owner changed; canceled"),
					);
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
				if (deps.validateCommentRelayProjectBinding(record))
					eligible.push(record);
				else if (
					deps.isCommentRelayRecordPromotedToTeam?.(record) &&
					deps.commentOutbox?.rescopeToTeam?.(record)
				) {
					// Same comment, same readers, new relay path: deliver it in this
					// drain's follow-up pass rather than dropping it.
					outboxRerunRequested = true;
				} else {
					// A local unshare/delete/re-home is authoritative and cannot become
					// valid again for this queued revision. Cancel it even if the remote
					// catalog still carries a briefly-stale row.
					deps.commentOutbox?.acknowledge(record);
					deps.onError?.(
						new Error("comment relay project binding changed; canceled"),
					);
				}
			}
		}
		if (eligible.length === 0) return;

		let context: WorkspaceCollabContext | null;
		try {
			context =
				(await deps.resolveCommentRelayWorkspaceContext?.(representative, {
					fresh: true,
				})) ?? null;
		} catch (error) {
			for (const record of eligible) deferOutboxRecord(record, error);
			return;
		}
		const identity = context
			? representative.relayScope === "personal"
				? personalBatchIdentityMatches(context, representative)
				: relayIdentityMatches(context, representative)
			: null;
		if (!context || !identity) {
			const error = new Error(
				"comment relay delivery authority is unavailable or changed",
			);
			for (const record of eligible) deferOutboxRecord(record, error);
			return;
		}

		// A durable identity batch can span files and projects. For personal
		// publications, each record must re-prove its creator-scoped, exact-file
		// publication after fresh authority resolves and immediately before it is
		// scheduled. Local binding only proves a project record still belongs here;
		// it does not prove that this file remains published.
		if (representative.relayScope === "personal") {
			const deliverable: CommentRelayOutboxRecord[] = [];
			for (const record of eligible) {
				if (relayIdentityMatches(context, record)) deliverable.push(record);
				else if (
					context.workspaceType === "team" &&
					record.attemptCount < AWAIT_TEAM_VISIBILITY_MAX_ATTEMPTS &&
					deps.commentOutbox?.isPublicationCurrent?.(record) === true
				) {
					// The binding witness above still holds and the exact publication is
					// still current: this is a creator's private project in a team
					// workspace that has not been marked team-visible yet. That is a
					// transient state (publishing registered it in the team catalog),
					// not a stop, so retry with backoff; once the row turns `team` the
					// record is re-queued as Team relay, and a stop cancels it. Bounded:
					// a row the catalog reconcile never promotes (demoted, moved back to
					// private) is cancelled as before instead of retrying forever.
					deferOutboxRecord(
						record,
						new Error("comment relay awaiting team visibility"),
					);
				} else {
					// Fresh workspace authority is already proven for this identity
					// batch. A failed exact-file scope check therefore means the local
					// durable publication witness was removed (or its creator binding
					// changed), not that login/workspace resolution is temporarily down.
					// Do not let a stopped publication revive from SQLite after restart.
					deps.commentOutbox?.acknowledge(record);
					deps.onError?.(
						new Error(
							"comment relay personal publication stopped or creator changed; canceled",
						),
					);
				}
			}
			await pushOutboxProjectLanes(deliverable, identity);
			return;
		}

		let bindings: Array<{ projectId: string; ownerMemberId: string }>;
		try {
			bindings = (await deps.listRemoteProjectRelayBindings?.(context)) ?? [];
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
				deps.onError?.(
					new Error("comment relay remote project owner missing; canceled"),
				);
				continue;
			}
			if (expectedOwner !== null && !owners.has(expectedOwner)) {
				deps.commentOutbox?.acknowledge(record);
				deps.onError?.(
					new Error("comment relay delivery owner changed; canceled"),
				);
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
					!deps.resolveCommentRelayWorkspaceContext ||
					!deps.listRemoteProjectRelayBindings
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
				for (const batch of batches.values())
					await flushOutboxIdentityBatch(batch);
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

	/**
	 * - `drained`: an incremental round completed; paging owns member comments.
	 * - `paused`: stopped early (page cap, CAS conflict); resume next wake.
	 * - `backoff`: paging is backing off after failures; nothing was requested.
	 * - `scope-lost`: while a page was in flight the scope stopped being this
	 *   project's current one, or could not be re-verified; the page was
	 *   discarded uncommitted (the cursor is dropped only on a proven change).
	 */
	type MemberDrainOutcome = "drained" | "paused" | "backoff" | "scope-lost";

	/** Committed, changed rows of one pull round, summed into one notification. */
	type MergeRound = { changed: number };

	const memberScopeKey = (scope: MemberSyncScope) =>
		JSON.stringify([
			scope.workspaceId,
			scope.memberId,
			scope.teamId,
			scope.projectId,
		]);

	/**
	 * Stop member paging for a project whose bound context is positively no
	 * longer a team member scope (stop sharing, removed from the team, account
	 * switched to a personal workspace). Cursors and ledgers go; the local
	 * comment rows stay as local copies and simply stop syncing.
	 */
	function forgetMemberSync(projectId: string, keep?: MemberSyncScope): void {
		const store = deps.memberCommentStore;
		if (!store) return;
		const keepKey = keep ? memberScopeKey(keep) : null;
		if (keepKey) activeMemberScope.set(projectId, keepKey);
		else activeMemberScope.delete(projectId);
		for (const key of memberBackoff.keys()) {
			if (key !== keepKey && (JSON.parse(key) as string[])[3] === projectId)
				memberBackoff.delete(key);
		}
		store.forgetProject(projectId, keep);
	}

	/**
	 * Is `scope` still the one to commit for? Checked after every awaited page,
	 * immediately before its synchronous commit, so no scope change that was
	 * visible by then can let an old scope's page land.
	 */
	async function memberScopeStillCurrent(
		scope: MemberSyncScope,
		key: string,
		{ claimed = true }: { claimed?: boolean } = {},
	): Promise<"current" | "lost" | "unknown"> {
		const superseded = () =>
			claimed && activeMemberScope.get(scope.projectId) !== key;
		if (superseded()) return "lost";
		if (
			deps.isMemberSyncProjectShared &&
			!deps.isMemberSyncProjectShared(scope.projectId)
		) {
			forgetMemberSync(scope.projectId);
			return "lost";
		}
		if (!deps.resolveProjectWorkspaceContext) return "current";
		const context = await deps.resolveProjectWorkspaceContext(scope.projectId);
		if (superseded()) return "lost";
		if (
			deps.isMemberSyncProjectShared &&
			!deps.isMemberSyncProjectShared(scope.projectId)
		) {
			forgetMemberSync(scope.projectId);
			return "lost";
		}
		// No answer is not a scope change: discard this page, keep the cursor.
		if (!context) return "unknown";
		const team = explicitTeamIdentity(context);
		if (
			!team ||
			context.workspaceId !== scope.workspaceId ||
			team.memberId !== scope.memberId ||
			team.teamId !== scope.teamId
		) {
			forgetMemberSync(
				scope.projectId,
				team
					? {
							workspaceId: context.workspaceId,
							memberId: team.memberId,
							teamId: team.teamId,
							projectId: scope.projectId,
						}
					: undefined,
			);
			return "lost";
		}
		return "current";
	}

	/**
	 * Drain the member page stream for one team project until the cloud reports
	 * an incremental round complete (C3-LITE §3):
	 *
	 * - Every request is derived from the durable cursor, and a page advances
	 *   that cursor only inside the same SQLite transaction that applies it. A
	 *   throw anywhere leaves the cursor on the last fully committed page.
	 * - `comments: []` with `hasMore: true` is an ordinary page: keep going.
	 * - A terminal snapshot page hands off to incremental; the drain then runs
	 *   that first incremental round too, so writes committed while the
	 *   snapshot was being read are not left for the next wake.
	 * - An unusable cursor is reset and rebuilt from a fresh snapshot in the
	 *   same drain. The snapshot's completion prunes rows the stream no longer
	 *   has (see comment-inbound-store). A refused fresh snapshot, or a second
	 *   rebuild in one drain, is an error and backs off instead of looping.
	 * - Rows count toward the round's merge notification only after their page
	 *   commits and only when they actually changed, so a replayed page adds
	 *   nothing. The caller emits once per round (see `pollProject`).
	 */
	async function drainMemberPages(
		store: CommentInboundStore,
		identity: PullIdentity,
		context: WorkspaceCollabContext,
		projectId: string,
		conversationId: string,
		round: MergeRound,
	): Promise<MemberDrainOutcome> {
		const scope: MemberSyncScope = {
			workspaceId: context.workspaceId,
			memberId: identity.memberId,
			teamId: identity.teamId,
			projectId,
		};
		const key = memberScopeKey(scope);
		if (
			deps.isMemberSyncProjectShared &&
			!deps.isMemberSyncProjectShared(projectId)
		) {
			forgetMemberSync(projectId);
			return "scope-lost";
		}
		if (activeMemberScope.get(projectId) !== key) {
			// Prove this caller's scope is the project's current one BEFORE taking
			// the project over: a stale caller (a rerun or wake carrying the old
			// account's context) must not wipe the current scope's cursor.
			if (
				(await memberScopeStillCurrent(scope, key, { claimed: false })) !==
				"current"
			)
				return "scope-lost";
			// A new scope takes the project over: any older scope's in-flight page
			// is now refused, and its cursor/ledger are dropped (local rows stay).
			if (activeMemberScope.get(projectId) !== key)
				forgetMemberSync(projectId, scope);
		}
		const backoff = memberBackoff.get(key);
		if (backoff && now() < backoff.until) return "backoff";
		try {
			const outcome = await drainMemberScope(
				store,
				scope,
				key,
				projectId,
				conversationId,
				round,
			);
			if (outcome === "drained") memberBackoff.delete(key);
			return outcome;
		} catch (error) {
			const failures = (memberBackoff.get(key)?.failures ?? 0) + 1;
			const weighted = failures + (isPermanentMemberPageError(error) ? 1 : 0);
			memberBackoff.set(key, {
				failures,
				until: now() + memberRetryDelay(weighted),
			});
			throw error;
		}
	}

	async function drainMemberScope(
		store: CommentInboundStore,
		scope: MemberSyncScope,
		key: string,
		projectId: string,
		conversationId: string,
		round: MergeRound,
	): Promise<MemberDrainOutcome> {
		let rebuilt = false;
		const rebuild = (
			code: CollabCloudMemberRebuildCode,
			freshSnapshot: boolean,
		): void => {
			if (freshSnapshot || rebuilt)
				throw new MemberRebuildRefusedError(projectId, code);
			rebuilt = true;
			store.reset(scope);
			deps.onMemberSyncRebuildRequired?.({ projectId, scope, code });
		};
		for (let pages = 0; pages < MAX_MEMBER_PAGES_PER_DRAIN; pages += 1) {
			const query = nextMemberPageQuery(store.read(scope));
			const freshSnapshot =
				query.mode === "snapshot" && query.pageToken === undefined;
			const result = await deps.client.pullMemberPage(
				scope.teamId,
				projectId,
				query,
			);
			const standing = await memberScopeStillCurrent(scope, key);
			if (standing !== "current") return "scope-lost";
			if (result.kind === "rebuild-required") {
				rebuild(result.code, freshSnapshot);
				continue;
			}
			const { page } = result;
			if (page.hasMore && page.nextPageToken === query.pageToken) {
				throw new Error("Member page did not advance its cursor");
			}
			const applied = store.apply({
				scope,
				query,
				page,
				merge: (comment) =>
					deps.mergeComment({
						projectId,
						conversationId,
						comment,
						stream: `member:${scope.teamId}:${page.streamEpoch}`,
					}),
			});
			if (applied.status === "rebuild-required") {
				rebuild("SCOPE_CHANGED", freshSnapshot);
				continue;
			}
			// Another writer moved this cursor; the trailing rerun (or next wake)
			// continues from wherever it now stands.
			if (applied.status === "conflict") return "paused";
			if (page.skipped.length > 0) {
				deps.onError?.(
					new Error(
						`Skipped ${page.skipped.length} malformed member comment(s) for project ${projectId}: ` +
							page.skipped
								.map(
									(item) =>
										`${item.id ?? `#${item.index}`}@${item.seq ?? "?"} (${item.reason})`,
								)
								.join(", "),
					),
				);
			}
			round.changed += applied.changed + applied.deleted + applied.pruned;
			if (!page.hasMore && page.mode === "incremental") return "drained";
		}
		return "paused";
	}

	/**
	 * One pull round: the member page drain plus the legacy pull. Every row the
	 * round commits is counted into one `onMerged` notification, emitted when
	 * the round settles — also when it ends early or throws, because rows that
	 * already committed are in local storage either way. A 3-page drain is one
	 * web refetch, not three.
	 */
	async function pollProject(
		identity: PullIdentity,
		scopeKey: string,
		projectId: string,
		requestContext: WorkspaceCollabContext,
	): Promise<boolean> {
		const round: MergeRound = { changed: 0 };
		try {
			return await pollProjectRound(
				identity,
				scopeKey,
				projectId,
				requestContext,
				round,
			);
		} finally {
			// A failing listener must neither mask the round's own error nor turn a
			// successful round into an unredeemed wake.
			if (round.changed > 0) {
				try {
					deps.onMerged?.({ projectId, inserted: round.changed });
				} catch (error) {
					deps.onError?.(error);
				}
			}
		}
	}

	/** Resolves `true` when a pull ran (even if it returned nothing new),
	 *  `false` when there was no local conversation to merge into, or when the
	 *  member page drain failed or paused early (its wake is not redeemed). */
	async function pollProjectRound(
		identity: PullIdentity,
		scopeKey: string,
		projectId: string,
		requestContext: WorkspaceCollabContext,
		round: MergeRound,
	): Promise<boolean> {
		const conversationId = deps.resolveLocalConversationId(projectId);
		// No local conversation to attach to yet (e.g. a member who pulled the
		// project but has not opened a chat) — nothing to merge into.
		if (!conversationId) return false;
		// Member comments of a team project: bounded pages first. The legacy pull
		// below then carries only what paging does not cover yet (share-page user
		// comments, BA2), unless the member cursor needs a rebuild — in that case
		// the legacy pull keeps delivering member comments too, so nothing
		// regresses while BO2's rebuild is pending.
		//
		// Member records are left to paging only after a drain reached the end of
		// an incremental round. A failed, paused or rebuild-required drain keeps
		// the legacy pull carrying them (LWW merges make the overlap harmless), so
		// a server or CLI without paged mode can never silence member comments.
		let memberDrainIncomplete = false;
		let legacyCarriesMembers = true;
		const memberStore =
			identity.relayScope === "team" ? deps.memberCommentStore : undefined;
		if (!memberStore) forgetMemberSync(projectId);
		if (memberStore) {
			try {
				const outcome = await drainMemberPages(
					memberStore,
					identity,
					requestContext,
					projectId,
					conversationId,
					round,
				);
				// This pull's identity is no longer (or not provably) the project's
				// scope: its legacy reply must not be merged either.
				if (outcome === "scope-lost") return false;
				legacyCarriesMembers = outcome !== "drained";
				memberDrainIncomplete = outcome === "paused" || outcome === "backoff";
			} catch (error) {
				memberDrainIncomplete = true;
				deps.onError?.(error);
			}
		}
		const requestCursorKey = pullCursorKey(scopeKey, projectId, identity);
		if (
			legacyCarriesMembers &&
			legacyMemberFilteredKeys.delete(requestCursorKey)
		) {
			// Earlier legacy pulls moved past member records paging then owned.
			// Paging no longer covers them, so replay the legacy stream from zero.
			cursors.delete(requestCursorKey);
			etags.delete(requestCursorKey);
		} else if (!legacyCarriesMembers) {
			legacyMemberFilteredKeys.add(requestCursorKey);
		}
		const sinceSeq = cursors.get(requestCursorKey) ?? 0;
		const result = await deps.client.pullComments(
			identity.teamId,
			projectId,
			sinceSeq,
			etags.get(requestCursorKey),
		);
		// Personal relay eligibility is per published file. Re-check both the
		// principal and active publication set after the async transport returns:
		// an account/workspace switch or stop must never merge an in-flight reply.
		const comments = result.comments;
		let responseIdentity = identity;
		if (identity.relayScope === "personal") {
			const freshContext =
				(await deps.resolveProjectWorkspaceContext?.(projectId, {
					fresh: true,
				})) ?? null;
			const freshIdentity = freshContext
				? personalPullIdentity(projectId, freshContext)
				: null;
			if (
				!freshIdentity ||
				freshContext!.workspaceId !== requestContext.workspaceId ||
				freshIdentity.memberId !== identity.memberId ||
				freshIdentity.teamId !== identity.teamId
			)
				return false;
			responseIdentity = freshIdentity;
			// Apply per-record eligibility during sequential merging below: a later
			// tombstone may target a row created earlier in this very response.
		}
		// Commit the result under the freshly-authoritative publication scope.
		// If the set changed while a conditional request was in flight, a 304 is
		// only valid for the old scope. Leave the new scope uncached so its next
		// poll replays from zero instead of treating hidden comments as seen.
		const responseCursorKey = pullCursorKey(
			scopeKey,
			projectId,
			responseIdentity,
		);
		if (result.notModified) {
			if (responseCursorKey === requestCursorKey)
				etags.set(responseCursorKey, result.etag);
			return !memberDrainIncomplete;
		}
		for (const incoming of comments) {
			let comment = incoming;
			// Member records (including their tombstones, which the member stream
			// also carries) are owned by the paged drain. A legacy tombstone carries
			// no author kind, so only one whose stored target is a share-page
			// comment is still applied here.
			if (!legacyCarriesMembers) {
				if (!incoming.deleted && incoming.authorKind !== "user") continue;
				if (
					incoming.deleted &&
					memberStore?.storedAuthorKind(projectId, incoming.id) !== "user"
				)
					continue;
			}
			// Tombstones intentionally have no publication identity: their trusted
			// project-scoped stored target remains the deletion authority below.
			if (!incoming.deleted && "publicationSlug" in incoming) {
				const publicationSlug = incoming.publicationSlug;
				if (typeof publicationSlug !== "string" || !publicationSlug.trim()) {
					throw new Error("Invalid server publication identity");
				}
				if (!deps.resolvePublishedCommentSourcePath)
					throw new Error("Publication mapping lookup is unavailable");
				const filePath = deps.resolvePublishedCommentSourcePath({
					projectId,
					publicationSlug,
					publishedPath: incoming.filePath,
					context: requestContext,
				});
				if (filePath === null) continue;
				comment = { ...incoming, filePath };
			}
			if (responseIdentity.relayScope === "personal") {
				const allowed = responseIdentity.allowedFilePaths!;
				if (comment.deleted) {
					// A tombstone has no authoritative anchor. Even when it carries a
					// path, only the stored, project-scoped target can authorize deletion.
					// Resolve here, after preceding records have actually persisted.
					if (!deps.resolveStoredCommentLocation) {
						throw new Error("Stored comment location lookup is unavailable");
					}
					const location = deps.resolveStoredCommentLocation(
						projectId,
						comment.id,
					);
					if (!location.found) continue; // Confirmed absence is a safe no-op.
					if (!location.filePath) {
						throw new Error("Stored comment location has no file path");
					}
					if (!allowed.has(location.filePath)) continue;
				} else if (!allowed.has(comment.filePath)) continue;
			}
			const outcome = deps.mergeComment({
				projectId,
				conversationId,
				comment,
				stream: `legacy:${responseIdentity.teamId}`,
			});
			if (outcome === "changed") round.changed += 1;
			else if (outcome !== "unchanged") {
				throw new Error(
					"Comment persistence did not acknowledge the pulled record",
				);
			}
		}
		etags.set(responseCursorKey, result.etag);
		cursors.set(responseCursorKey, result.latestSeq);
		return !memberDrainIncomplete;
	}

	function pullProjectSingleflight(
		context: WorkspaceCollabContext,
		identity: PullIdentity,
		projectId: string,
	): Promise<boolean> {
		const scopeKey = `${context.workspaceId}:${identity.memberId}`;
		const inFlightKey = JSON.stringify([
			context.workspaceId,
			identity.teamId,
			identity.memberId,
			projectId,
		]);
		// A wake that lands while a pull is running cannot join it: that pull may
		// already have read the head the wake is about. It marks the running pull
		// for exactly one trailing rerun instead, and every caller settles only
		// after that rerun. Several wakes during one pull still buy one rerun.
		const existing = inFlightPulls.get(inFlightKey);
		if (existing) {
			existing.rerun = true;
			return existing.promise;
		}
		const entry = { promise: Promise.resolve(false), rerun: false };
		entry.promise = (async () => {
			let ran: boolean;
			do {
				entry.rerun = false;
				ran = await pollProject(identity, scopeKey, projectId, context).catch(
					(error) => {
						deps.onError?.(error);
						return false;
					},
				);
			} while (entry.rerun);
			// Leave the map in the same synchronous step as the final rerun check:
			// a wake arriving after this starts a fresh pull instead of marking a
			// loop that has already finished.
			if (inFlightPulls.get(inFlightKey) === entry)
				inFlightPulls.delete(inFlightKey);
			return ran;
		})();
		inFlightPulls.set(inFlightKey, entry);
		return entry.promise;
	}

	async function pullProject(
		projectId: string,
		context: WorkspaceCollabContext,
	): Promise<boolean> {
		const identity = pullIdentity(projectId, context);
		if (!identity) {
			forgetMemberSync(projectId);
			return false;
		}
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
					(await deps.resolveProjectWorkspaceContext?.(projectId)) ?? null;
				const identity = context ? pullIdentity(projectId, context) : null;
				// A resolved context that is no longer a team scope stops member
				// paging for the project; an unresolved one proves nothing.
				if (context && !identity) forgetMemberSync(projectId);
				if (!context || !identity) continue;
				// Team registration remains directory-only; personal publication pulls
				// deliberately never fetch or synthesize a member directory identity.
				if (identity.relayScope === "team") {
					const teamIdentity = explicitTeamIdentity(context)!;
					// Refresh the exact project's member directory entry only when its
					// immutable workspace/member identity changes. Never borrow the
					// daemon's ambient active workspace.
					const identityKey =
						`${context.workspaceId}:${teamIdentity.teamId}:${teamIdentity.memberId}:` +
						`${teamIdentity.role}:${teamIdentity.displayName}`;
					if (identityKey !== lastRegisteredKey) {
						await deps.client.registerMember(
							teamIdentity.teamId,
							teamIdentity.memberId,
							{
								displayName: teamIdentity.displayName,
								role: teamIdentity.role,
							},
						);
						lastRegisteredKey = identityKey;
					}
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
		readMergedCommentCursor(projectId, context) {
			const identity = pullIdentity(projectId, context);
			if (!identity) return null;
			return (
				cursors.get(
					pullCursorKey(
						`${context.workspaceId}:${identity.memberId}`,
						projectId,
						identity,
					),
				) ?? null
			);
		},
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
