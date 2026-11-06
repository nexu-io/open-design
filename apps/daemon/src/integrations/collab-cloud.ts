// Client for the collab cloud (C-lane §D4): the cross-daemon comment relay +
// member directory. Mirrors the resource-hub integration shape — a factory with
// injectable fetch/config/timeout, env-scoped config (this file, not
// app-config.ts, owns OD_COLLAB_CLOUD_*), and a from-env constructor.
//
// DEGRADE: unlike the resource-hub client, this factory returns `null` when
// OD_COLLAB_CLOUD_URL is unset, so every caller is a plain `client?.method()`
// no-op off-team / unconfigured. Auth is a single bearer token (§D4.4); the real
// hub verifies B's signed token, this stub presents a shared local token.

import type {
	CollabCloudComment,
	CollabCloudMemberDirectoryEntry,
	CollabMemberRole,
} from "@open-design/contracts";

const DEFAULT_FETCH_TIMEOUT_MS = 8_000;

type FetchLike = typeof fetch;

export interface CollabCloudConfig {
	baseUrl: string;
	token: string | null;
}

/** Read the collab-cloud config from env, or null when no URL is configured
 *  (the single "is collab cloud on?" gate — everything degrades to no-op). */
export function readCollabCloudConfig(
	env: NodeJS.ProcessEnv = process.env,
): CollabCloudConfig | null {
	const baseUrl = env.OD_COLLAB_CLOUD_URL?.trim();
	if (!baseUrl) return null;
	return { baseUrl, token: env.OD_COLLAB_CLOUD_TOKEN?.trim() || null };
}

export function hasExplicitCollabCloudConfig(
	env: NodeJS.ProcessEnv = process.env,
): boolean {
	return Boolean(env.OD_COLLAB_CLOUD_URL?.trim());
}

export class CollabCloudError extends Error {
	constructor(
		readonly status: number,
		readonly code: string,
		message?: string,
	) {
		super(message ?? `collab cloud error ${status} (${code})`);
		this.name = "CollabCloudError";
	}
}

export interface CollabCloudMemberRegistration {
	displayName: string;
	role: CollabMemberRole;
}

export interface CollabCloudPullResult {
	comments: CollabCloudComment[];
	latestSeq: number;
}

// —— C3-LITE member comment pages ————————————————————————————————————————————
//
// One bounded page of the member comment stream (C3-LITE §2–§4). Both
// transports (Vela CLI and HTTP) return the same typed result so the drain in
// collab-cloud-service.ts never sees transport details:
//
// - The page ENVELOPE is strict: a response that does not describe a coherent
//   intermediate or terminal page is a protocol error and throws. A cursor is
//   never derived from an envelope we could not read.
// - Each ITEM is judged on its own. The cloud forwards stored member payloads
//   verbatim without filling defaults (§6 item 8), so one historical payload
//   that misses a required field must not reject the page — otherwise the
//   cursor can never pass it and sync stops for the whole project. Such items
//   land in `skipped` and the rest of the page is still applied.
// - `INVALID_CURSOR`, `CURSOR_STALE` and `SCOPE_CHANGED` are not failures of
//   this request but a statement that the stored cursor is unusable. They are
//   returned as `rebuild-required` so the caller keeps the cursor untouched
//   and hands over to the rebuild path.

export type CollabCloudMemberPageMode = "snapshot" | "incremental";

export type CollabCloudMemberPageQuery = {
	mode: CollabCloudMemberPageMode;
	limit?: number;
	/** Continue the current round (mode must match the round's mode). */
	pageToken?: string;
	/** Start a new incremental round from a terminal page's resumeToken. */
	resumeToken?: string;
};

/**
 * A delete as the cloud emits it: `{id, projectId, seq, deleted: true}` and
 * nothing else. `projectId` is filled from the requested scope when absent, so
 * downstream code never has to special-case its presence.
 */
export interface CollabCloudMemberTombstone {
	id: string;
	projectId: string;
	seq: number;
	deleted: true;
}

/** A full member comment (`deleted` absent/false) or a minimal tombstone. */
export type CollabCloudMemberChange =
	| (CollabCloudComment & { deleted?: false })
	| CollabCloudMemberTombstone;

export interface CollabCloudMemberPageSkip {
	/** Position in the page's `comments` array. */
	index: number;
	id: string | null;
	seq: number | null;
	reason: string;
}

export interface CollabCloudMemberPage {
	mode: CollabCloudMemberPageMode;
	comments: CollabCloudMemberChange[];
	/** Items the adapter could not use; the page still commits without them. */
	skipped: CollabCloudMemberPageSkip[];
	hasMore: boolean;
	complete: boolean;
	nextPageToken: string | null;
	resumeToken: string | null;
	scopeToken: string;
	watermarkSeq: number;
	scanThroughSeq: number;
	handoff: { sinceSeq: number; resumeToken: string; scopeToken: string } | null;
	streamEpoch: string;
	latestSeq: number | null;
	nextSeq: number | null;
	snapshotAt: number | null;
}

/** Cursor-invalidation codes (C3-LITE §4): drop the cursor and rebuild. */
export const MEMBER_PAGE_REBUILD_CODES = [
	"INVALID_CURSOR",
	"CURSOR_STALE",
	"SCOPE_CHANGED",
] as const;
export type CollabCloudMemberRebuildCode =
	(typeof MEMBER_PAGE_REBUILD_CODES)[number];

export type CollabCloudMemberPageResult =
	| { kind: "page"; page: CollabCloudMemberPage }
	| {
			kind: "rebuild-required";
			code: CollabCloudMemberRebuildCode;
			status: number;
	  };

const isRecord = (value: unknown): value is Record<string, unknown> =>
	value !== null && typeof value === "object" && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === "string";
const isNonEmptyString = (value: unknown): value is string =>
	isString(value) && value.trim().length > 0;
const isFiniteNumber = (value: unknown): value is number =>
	typeof value === "number" && Number.isFinite(value);
const isSafeSeq = (value: unknown): value is number =>
	Number.isSafeInteger(value) && (value as number) >= 0;
const COMMENT_STATUSES = new Set([
	"open",
	"attached",
	"applying",
	"needs_review",
	"resolved",
	"failed",
]);
const ANCHOR_STATES = new Set(["anchored", "reanchored", "stale", "lost"]);

function validPosition(value: unknown): boolean {
	return (
		isRecord(value) &&
		["x", "y", "width", "height"].every((key) => isFiniteNumber(value[key]))
	);
}
function validStyle(value: unknown): boolean {
	if (!isRecord(value)) return false;
	return [
		"color",
		"backgroundColor",
		"fontSize",
		"fontWeight",
		"lineHeight",
		"textAlign",
		"fontFamily",
		"paddingTop",
		"paddingRight",
		"paddingBottom",
		"paddingLeft",
		"borderRadius",
	].every((key) => value[key] === undefined || isString(value[key]));
}
function validPodMember(value: unknown): boolean {
	return (
		isRecord(value) &&
		["elementId", "selector", "label", "text", "htmlHint"].every((key) =>
			isString(value[key]),
		) &&
		validPosition(value.position) &&
		(value.style === undefined || validStyle(value.style))
	);
}
const nonNegativeInt = (value: unknown) =>
	Number.isSafeInteger(value) && (value as number) >= 0;

/**
 * Why a full member comment cannot be merged, or null when it can. Only what
 * the local row genuinely needs is required: identity, anchor, status and the
 * two timestamps (`updatedAt` drives last-writer-wins; defaulting it would make
 * every replay look newer). Display strings the server does not backfill
 * (`conversationId`, `label`, `text`, `htmlHint`, `note`) are defaulted by
 * {@link normalizeMemberComment} instead of dropping the comment.
 */
function memberCommentProblem(
	value: Record<string, unknown>,
	projectId: string,
): string | null {
	if (value.projectId !== projectId)
		return "projectId does not match the requested project";
	if (!isString(value.memberId)) return "memberId missing";
	if (
		!isString(value.filePath) ||
		!isString(value.elementId) ||
		!isString(value.selector)
	)
		return "anchor fields missing";
	if (!validPosition(value.position)) return "position invalid";
	if (!COMMENT_STATUSES.has(String(value.status))) return "status invalid";
	if (!isFiniteNumber(value.createdAt) || !isFiniteNumber(value.updatedAt))
		return "timestamps invalid";
	if (value.deleted !== undefined && value.deleted !== false)
		return "deleted flag invalid";
	for (const key of ["conversationId", "note", "label", "text", "htmlHint"]) {
		if (value[key] !== undefined && !isString(value[key]))
			return `${key} invalid`;
	}
	if (value.style !== undefined && !validStyle(value.style))
		return "style invalid";
	if (
		value.selectionKind !== undefined &&
		value.selectionKind !== "element" &&
		value.selectionKind !== "pod"
	)
		return "selectionKind invalid";
	if (value.memberCount !== undefined && !nonNegativeInt(value.memberCount))
		return "memberCount invalid";
	if (
		value.podMembers !== undefined &&
		(!Array.isArray(value.podMembers) ||
			!value.podMembers.every(validPodMember))
	)
		return "podMembers invalid";
	if (value.slideIndex !== undefined && !nonNegativeInt(value.slideIndex))
		return "slideIndex invalid";
	if (
		value.attachments !== undefined &&
		(!Array.isArray(value.attachments) ||
			!value.attachments.every(
				(item) => isRecord(item) && isString(item.path) && isString(item.name),
			))
	)
		return "attachments invalid";
	if (
		value.anchorState !== undefined &&
		!ANCHOR_STATES.has(String(value.anchorState))
	)
		return "anchorState invalid";
	if (
		value.anchoredVersion !== undefined &&
		!nonNegativeInt(value.anchoredVersion)
	)
		return "anchoredVersion invalid";
	if (
		value.lastGoodPosition !== undefined &&
		!validPosition(value.lastGoodPosition)
	)
		return "lastGoodPosition invalid";
	if (value.authorKind !== undefined && value.authorKind !== "member")
		return "authorKind is not member";
	if (value.authorAppUserId !== undefined && !isString(value.authorAppUserId))
		return "authorAppUserId invalid";
	if (
		value.authorDisplayName !== undefined &&
		!isString(value.authorDisplayName)
	)
		return "authorDisplayName invalid";
	if (value.authorKey !== undefined && !isString(value.authorKey))
		return "authorKey invalid";
	if (value.author !== undefined) {
		const author = value.author;
		if (
			!isRecord(author) ||
			(author.displayName !== undefined && !isString(author.displayName)) ||
			(author.authorKey !== undefined && !isString(author.authorKey))
		)
			return "author invalid";
		if (
			value.authorDisplayName !== undefined &&
			author.displayName !== undefined &&
			value.authorDisplayName !== author.displayName
		)
			return "author alias mismatch";
		if (
			value.authorKey !== undefined &&
			author.authorKey !== undefined &&
			value.authorKey !== author.authorKey
		)
			return "author alias mismatch";
	}
	return null;
}

/** Fill defaultable display fields and lift the nested `author` aliases. */
function normalizeMemberComment(
	value: Record<string, unknown>,
): CollabCloudComment & { deleted?: false } {
	const author = isRecord(value.author) ? value.author : null;
	const authorKey = value.authorKey ?? author?.authorKey;
	const authorDisplayName = value.authorDisplayName ?? author?.displayName;
	return {
		...(value as unknown as CollabCloudComment),
		conversationId: isString(value.conversationId) ? value.conversationId : "",
		note: isString(value.note) ? value.note : "",
		label: isString(value.label) ? value.label : "",
		text: isString(value.text) ? value.text : "",
		htmlHint: isString(value.htmlHint) ? value.htmlHint : "",
		...(isNonEmptyString(authorKey) ? { authorKey } : {}),
		...(isNonEmptyString(authorDisplayName) ? { authorDisplayName } : {}),
	} as CollabCloudComment & { deleted?: false };
}

function parseMemberChange(
	value: unknown,
	index: number,
	projectId: string,
): { change: CollabCloudMemberChange } | { skip: CollabCloudMemberPageSkip } {
	const record = isRecord(value) ? value : null;
	const id = record && isNonEmptyString(record.id) ? record.id : null;
	const seq = record && isSafeSeq(record.seq) ? record.seq : null;
	const skip = (reason: string) => ({ skip: { index, id, seq, reason } });
	if (!record) return skip("not an object");
	if (id === null) return skip("id missing");
	if (seq === null) return skip("seq invalid");
	if (record.deleted === true) {
		if (record.projectId !== undefined && record.projectId !== projectId) {
			return skip("projectId does not match the requested project");
		}
		return { change: { id, projectId, seq, deleted: true } };
	}
	const problem = memberCommentProblem(record, projectId);
	return problem ? skip(problem) : { change: normalizeMemberComment(record) };
}

const invalidPage = (detail: string) =>
	new Error(`Invalid member page response: ${detail}`);
const optionalSeq = (value: unknown, field: string): number | null => {
	if (value === undefined || value === null) return null;
	if (!isSafeSeq(value)) throw invalidPage(`${field} invalid`);
	return value;
};

/**
 * Parse one C3-LITE member page. Throws on an incoherent envelope; returns
 * per-item skips for malformed comments. Extra envelope fields are ignored.
 */
export function parseMemberPage(
	value: unknown,
	mode: CollabCloudMemberPageMode,
	projectId: string,
): CollabCloudMemberPage {
	if (!isRecord(value)) throw invalidPage("not an object");
	const p = value;
	if (p.mode !== mode) throw invalidPage("mode mismatch");
	if (!Array.isArray(p.comments)) throw invalidPage("comments missing");
	if (typeof p.hasMore !== "boolean" || p.complete !== !p.hasMore)
		throw invalidPage("hasMore/complete inconsistent");
	if (!isNonEmptyString(p.scopeToken)) throw invalidPage("scopeToken missing");
	if (!isNonEmptyString(p.streamEpoch))
		throw invalidPage("streamEpoch missing");
	if (!isSafeSeq(p.watermarkSeq) || !isSafeSeq(p.scanThroughSeq))
		throw invalidPage("watermark invalid");
	if (!(p.nextPageToken === null || isNonEmptyString(p.nextPageToken)))
		throw invalidPage("nextPageToken invalid");
	if (!(p.resumeToken === null || isNonEmptyString(p.resumeToken)))
		throw invalidPage("resumeToken invalid");
	const handoff = p.handoff ?? null;
	if (p.hasMore) {
		// An intermediate page — including a legal empty one — only continues.
		if (p.nextPageToken === null || p.resumeToken !== null || handoff !== null)
			throw invalidPage("intermediate page tokens");
	} else {
		if (p.nextPageToken !== null || p.resumeToken === null)
			throw invalidPage("terminal page tokens");
		if (mode === "snapshot") {
			if (
				!isRecord(handoff) ||
				handoff.resumeToken !== p.resumeToken ||
				handoff.scopeToken !== p.scopeToken ||
				handoff.sinceSeq !== p.watermarkSeq
			)
				throw invalidPage("snapshot handoff");
		} else if (handoff !== null)
			throw invalidPage("incremental page carries a handoff");
	}
	const comments: CollabCloudMemberChange[] = [];
	const skipped: CollabCloudMemberPageSkip[] = [];
	p.comments.forEach((item, index) => {
		const parsed = parseMemberChange(item, index, projectId);
		if ("change" in parsed) comments.push(parsed.change);
		else skipped.push(parsed.skip);
	});
	return {
		mode,
		comments,
		skipped,
		hasMore: p.hasMore,
		complete: !p.hasMore,
		nextPageToken: p.nextPageToken as string | null,
		resumeToken: p.resumeToken as string | null,
		scopeToken: p.scopeToken,
		watermarkSeq: p.watermarkSeq,
		scanThroughSeq: p.scanThroughSeq,
		handoff: handoff as CollabCloudMemberPage["handoff"],
		streamEpoch: p.streamEpoch,
		latestSeq: optionalSeq(p.latestSeq, "latestSeq"),
		nextSeq: optionalSeq(p.nextSeq, "nextSeq"),
		snapshotAt: optionalSeq(p.snapshotAt, "snapshotAt"),
	};
}

/** Reject a query the cloud would answer with INVALID_PAGE_REQUEST. */
export function assertMemberPageQuery(
	query: CollabCloudMemberPageQuery,
): number {
	const limit = query.limit ?? 100;
	const { pageToken, resumeToken } = query;
	if (
		(query.mode !== "snapshot" && query.mode !== "incremental") ||
		!Number.isInteger(limit) ||
		limit < 1 ||
		limit > 100 ||
		(pageToken !== undefined && !isNonEmptyString(pageToken)) ||
		(resumeToken !== undefined && !isNonEmptyString(resumeToken)) ||
		(pageToken !== undefined && resumeToken !== undefined) ||
		(query.mode === "snapshot" && resumeToken !== undefined) ||
		(query.mode === "incremental" &&
			pageToken === undefined &&
			resumeToken === undefined)
	) {
		throw new Error("Invalid member page query");
	}
	return limit;
}

/**
 * Map a transport error to `rebuild-required` when it invalidates the cursor.
 * Everything else — including 400 `INVALID_PAGE_REQUEST`, a programming error
 * that must not be retried into a loop of rebuilds — is rethrown unchanged.
 */
export function memberPageRebuildResult(
	error: unknown,
): CollabCloudMemberPageResult {
	if (
		error instanceof CollabCloudError &&
		(MEMBER_PAGE_REBUILD_CODES as readonly string[]).includes(error.code)
	) {
		return {
			kind: "rebuild-required",
			code: error.code as CollabCloudMemberRebuildCode,
			status: error.status,
		};
	}
	throw error;
}

interface CollabCloudClientOptions {
	config?: CollabCloudConfig;
	fetch?: FetchLike;
	timeoutMs?: number;
}

export function createCollabCloudClient(
	options: CollabCloudClientOptions = {},
) {
	const config = options.config ?? readCollabCloudConfig();
	if (!config) {
		throw new Error(
			"collab cloud is not configured (OD_COLLAB_CLOUD_URL is unset)",
		);
	}
	const fetchImpl = options.fetch ?? fetch;
	const timeoutMs = options.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;

	function authHeaders(extra?: Record<string, string>): Record<string, string> {
		const headers: Record<string, string> = {
			"content-type": "application/json",
			...extra,
		};
		if (config!.token) headers.authorization = `Bearer ${config!.token}`;
		return headers;
	}

	async function request<T>(
		method: string,
		path: string,
		body?: unknown,
		extraHeaders?: Record<string, string>,
	): Promise<{ status: number; payload: T; etag: string | null }> {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), timeoutMs);
		try {
			const response = await fetchImpl(new URL(path, config!.baseUrl), {
				method,
				headers: authHeaders(extraHeaders),
				...(body === undefined ? {} : { body: JSON.stringify(body) }),
				signal: controller.signal,
			});
			const etag = response.headers.get("etag");
			if (response.status === 304) {
				return { status: 304, payload: {} as T, etag };
			}
			const text = await response.text();
			const payload = text ? JSON.parse(text) : {};
			if (!response.ok) {
				const code =
					typeof payload?.error === "string" ? payload.error : "unknown";
				throw new CollabCloudError(response.status, code, payload?.message);
			}
			return { status: response.status, payload: payload as T, etag };
		} finally {
			clearTimeout(timeout);
		}
	}

	return {
		isConfigured(): boolean {
			return true;
		},

		/** Register (idempotently upsert) a member's directory entry. */
		async registerMember(
			teamId: string,
			memberId: string,
			input: CollabCloudMemberRegistration,
		): Promise<CollabCloudMemberDirectoryEntry> {
			const { payload } = await request<{
				member: CollabCloudMemberDirectoryEntry;
			}>(
				"PUT",
				`/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(memberId)}`,
				input,
			);
			return payload.member;
		},

		/** List the team's member directory (memberId → {displayName, role}). */
		async listMembers(
			teamId: string,
		): Promise<CollabCloudMemberDirectoryEntry[]> {
			const { payload } = await request<{
				members: CollabCloudMemberDirectoryEntry[];
			}>("GET", `/teams/${encodeURIComponent(teamId)}/members`);
			return payload.members ?? [];
		},

		/** Append a comment to a project's stream; returns the assigned seq. */
		async pushComment(
			teamId: string,
			projectId: string,
			comment: CollabCloudComment,
			idempotencyKey?: string,
			historicalAuthorMemberId?: string,
		): Promise<{ seq: number; authorKey?: string }> {
			const { payload } = await request<{
				seq: number;
				authorKey?: string;
				author?: { authorKey?: string };
			}>(
				"POST",
				`/teams/${encodeURIComponent(teamId)}/projects/${encodeURIComponent(projectId)}/comments`,
				{ comment, ...(idempotencyKey ? { idempotencyKey } : {}),
				  ...(historicalAuthorMemberId ? { historicalAuthorMemberId } : {}) },
			);
			const authorKey = payload.author?.authorKey ?? payload.authorKey;
			return { seq: payload.seq, ...(authorKey ? { authorKey } : {}) };
		},

		/**
		 * Fetch exactly one C3-LITE member page; never drains. Paged mode sends no
		 * `If-None-Match` and expects no ETag/304 (C3-LITE §6 item 10).
		 */
		async pullMemberPage(
			_teamId: string,
			projectId: string,
			query: CollabCloudMemberPageQuery,
		): Promise<CollabCloudMemberPageResult> {
			const limit = assertMemberPageQuery(query);
			const params = new URLSearchParams({
				mode: query.mode,
				limit: String(limit),
				authorKinds: "member",
			});
			if (query.pageToken !== undefined)
				params.set("pageToken", query.pageToken);
			if (query.resumeToken !== undefined)
				params.set("resumeToken", query.resumeToken);
			let payload: unknown;
			try {
				({ payload } = await request<unknown>(
					"GET",
					`/api/v1/collab/projects/${encodeURIComponent(projectId)}/comments?${params}`,
				));
			} catch (error) {
				return memberPageRebuildResult(error);
			}
			return {
				kind: "page",
				page: parseMemberPage(payload, query.mode, projectId),
			};
		},

		/**
		 * Legacy unbounded pull with `seq > sinceSeq`. `etag` (from a prior pull)
		 * enables a 304 short-circuit: on 304 the result echoes back `sinceSeq` as
		 * `latestSeq` with no comments, and `notModified` is true. Still the only
		 * source of share-page (user) comments until public paging (BA2) lands.
		 */
		async pullComments(
			teamId: string,
			projectId: string,
			sinceSeq: number,
			etag?: string | null,
		): Promise<
			CollabCloudPullResult & { notModified: boolean; etag: string | null }
		> {
			const query = `?sinceSeq=${encodeURIComponent(String(sinceSeq))}`;
			const {
				status,
				payload,
				etag: nextEtag,
			} = await request<CollabCloudPullResult>(
				"GET",
				`/teams/${encodeURIComponent(teamId)}/projects/${encodeURIComponent(projectId)}/comments${query}`,
				undefined,
				etag ? { "if-none-match": etag } : undefined,
			);
			if (status === 304) {
				return {
					comments: [],
					latestSeq: sinceSeq,
					notModified: true,
					etag: nextEtag,
				};
			}
			return {
				comments: payload.comments ?? [],
				latestSeq:
					typeof payload.latestSeq === "number" ? payload.latestSeq : sinceSeq,
				notModified: false,
				etag: nextEtag,
			};
		},
	};
}

export type CollabCloudClient = ReturnType<typeof createCollabCloudClient>;

/** Build the client from env, or null when the collab cloud is not configured. */
export function createCollabCloudClientFromEnv(
	env: NodeJS.ProcessEnv = process.env,
): CollabCloudClient | null {
	const config = readCollabCloudConfig(env);
	if (!config) return null;
	return createCollabCloudClient({ config });
}
