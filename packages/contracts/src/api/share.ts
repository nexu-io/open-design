/**
 * Share + external-comment contract (P0).
 *
 * This module is the ONE place the share feature's cross-surface shapes are
 * frozen. Four independent lanes consume it — the OD daemon publish path, the
 * vela share page, the vela cloud comment API, and the OD client comment
 * sidebar — and none of them can see each other's code. A field renamed here
 * is a four-way break, so prefer adding over changing.
 *
 * `vela` is a SEPARATE pnpm workspace and cannot import this package. Its
 * server-side mirror of these shapes is hand-maintained; the cross-repo
 * agreement is the field NAMES and the literal string unions below, which is
 * why they are spelled out as `const` arrays rather than left implicit in a
 * type alias. Any change here needs the mirror changed in the same change set.
 *
 * Pure TypeScript, dependency-free — safe to import from daemon, web, and CLI.
 */

import type { PublicProjectFilePublication } from './collab.js';
import type { PreviewCommentSelectionKind, PreviewCommentStatus } from './comments.js';

/* ------------------------------------------------------------------ *
 * Share addressing
 * ------------------------------------------------------------------ */

/**
 * Public share URL shape, frozen 2026-09-21:
 *
 *     https://open-design.ai/cloud/artifact/{projectId}/{slug}
 *                            └── base path ──┘
 *
 * Both segments are load-bearing and neither is decorative:
 *
 * - `projectId` is the OD-side project id. It is what `collab.comment_events`
 *   is keyed by (`(team_id, project_id, seq)`), so carrying it in the path
 *   lets the share page ask for a project's comments without first resolving
 *   the snapshot back to a project.
 * - `slug` is the opaque public share key. It is a STABLE alias, not a
 *   snapshot address: updating a share advances what it points at, so the
 *   link a person was sent keeps working and shows the current version on
 *   their next load. Stop-then-resume restores the same slug.
 *
 * `/cloud/` is the DEPLOYMENT base path (`VITE_APP_BASE_PATH`), not part of
 * the application route, so it is deliberately absent from what this module
 * builds. Baking it in here would produce a wrong URL in every environment
 * that mounts the app somewhere else.
 *
 * `team_id` is deliberately NOT in the URL. The snapshot table already carries
 * that rule for its own public read — team_id is resolved server-side and
 * never exposed publicly — and the share binding follows it.
 *
 * ## Two segments means two independent public inputs
 *
 * A caller supplies `projectId` and `slug` separately, so the server MUST
 * confirm the slug actually belongs to that project before serving anything.
 * Without that check, pairing project A's id with project B's slug reads
 * across the boundary. The single-segment alternative had no such hole by
 * construction; this shape has to close it explicitly — see
 * {@link ShareBindingLookup}.
 *
 * ## `projectId` is a public identifier from now on
 *
 * It appears in URLs, `Referer` headers and browser history. Any existing
 * logic of the form "knowing a projectId is sufficient to do X" needs
 * re-examining against that.
 */
export const SHARE_URL_PATH_SEGMENT = 'artifact';

/**
 * What the server must resolve a share URL's two segments into before it
 * serves a share page or any of its comments.
 *
 * The resolution is the authorization step, not a lookup convenience: it is
 * where "this slug belongs to this project" is established. A caller that has
 * a valid `projectId` and a valid `slug` that do not belong together must be
 * refused with {@link ShareCommentErrorCode} `SHARE_NOT_FOUND` — the same
 * answer an unknown slug gets, so the mismatch does not confirm that either
 * half exists.
 *
 * ## This is the ONLY authority for whether a share is live
 *
 * `status` here is the single truth for the share's lifecycle. Whatever
 * stores the share's CONTENT — the alias row that points at the current
 * published version — must carry the version pointer and nothing else. It
 * must not carry its own `enabled` / `active` / `deleted` flag.
 *
 * This is not a style preference. Two lifecycle flags means two stop
 * switches, and nothing keeps them equal: stopping through one path leaves
 * the other saying "live", so the page serves content while comments answer
 * 410 Gone, or the reverse. Both halves look correct in isolation and their
 * own tests pass.
 *
 * Note the shape of the truth as well as its location: the lifecycle is a
 * four-state enum ({@link SHARE_STATUSES}), not a boolean. A boolean cannot
 * distinguish `none` from `stopped`, which is what makes "stop preserves the
 * binding so the same slug can resume" expressible at all.
 */
export interface ShareBindingLookup {
  projectId: string;
  slug: string;
  /** Resolved server-side; never echoed to the client. */
  teamId: string;
  status: ShareStatus;
}

/** Parsed form of a share URL path. */
export interface ShareUrlParts {
  projectId: string;
  slug: string;
}

/**
 * Build the public path (no origin) for a share. Callers that need an absolute
 * URL join this onto the configured cloud origin themselves — the origin
 * differs per environment and must not be baked into a shared contract.
 */
export function buildSharePath(parts: ShareUrlParts): string {
  return `/${SHARE_URL_PATH_SEGMENT}/${encodeURIComponent(parts.projectId)}/${encodeURIComponent(parts.slug)}`;
}

/**
 * Parse a share URL path back into its parts. Returns `null` for anything that
 * is not exactly `/artifact/{projectId}/{slug}` — including a trailing extra
 * segment, which is a different route, not a share with a suffix.
 */
export function parseSharePath(pathname: string): ShareUrlParts | null {
  const [head, rawProjectId, rawSlug, ...rest] = pathname.split('/').filter(Boolean);
  if (rest.length > 0) return null;
  if (head !== SHARE_URL_PATH_SEGMENT) return null;
  if (rawProjectId === undefined || rawSlug === undefined) return null;
  let projectId: string;
  let slug: string;
  try {
    projectId = decodeURIComponent(rawProjectId);
    slug = decodeURIComponent(rawSlug);
  } catch {
    return null;
  }
  if (!projectId || !slug) return null;
  return { projectId, slug };
}

/* ------------------------------------------------------------------ *
 * Comment authorship
 * ------------------------------------------------------------------ */

/**
 * Which identity union arm an external comment's author came from.
 *
 * - `member` — a workspace member of the owning team. Carries a
 *   `workspaceMemberId`; this is every comment written inside the OD client.
 * - `user` — a site-account holder with NO workspace membership: someone who
 *   opened a share link, logged in, and commented from the share page.
 *
 * This is the discriminator persisted as `collab.comment_events.author_kind`,
 * enforced there by `comment_events_author_shape_check`. Legacy rows default
 * to `member`, which is why no backfill was needed.
 */
export const SHARE_AUTHOR_KINDS = ['member', 'user'] as const;
export type ShareAuthorKind = (typeof SHARE_AUTHOR_KINDS)[number];

/**
 * Stable per-account key used as the AVATAR COLOR SEED on both ends.
 *
 * `authorKey = HMAC(server secret, app_user_id)`, lowercase hex, exactly
 * {@link AUTHOR_KEY_HEX_LENGTH} characters (HMAC-SHA256). Keyed on the ACCOUNT,
 * not the membership, so the same person is the same color whether they
 * commented from the OD client (as a member) or from the share page (as a
 * user).
 *
 * It is a display seed and nothing else. It is NOT a capability, NOT an
 * identity assertion, and must never be used to decide whether a comment
 * belongs to the viewer — `isMine` is computed server-side against the live
 * session, because a client can only compare keys and would get that wrong.
 *
 * The length is frozen because both ends hash it into a fixed palette index;
 * a shorter or differently-cased key silently produces a different color on
 * one side, which reads as a rendering bug rather than a contract break.
 */
export const AUTHOR_KEY_HEX_LENGTH = 64;

/** True when `value` has the frozen `authorKey` shape (lowercase hex, 64 chars). */
export function isValidAuthorKey(value: string): boolean {
  return value.length === AUTHOR_KEY_HEX_LENGTH && /^[0-9a-f]+$/.test(value);
}

/**
 * Display-name snapshot rules, shared by the OD client sidebar and the vela
 * share page (D104 ②: the share page matches the client, and the client is
 * the baseline because it is already shipped).
 *
 * The name is stamped by the SERVER at write time and stored on the event.
 * It is never read back out of the team member directory at render time —
 * that directory is a privacy boundary (real names + roles) that the share
 * page must not be able to reach. A renamed author therefore keeps the name
 * that was current when they wrote, which is intentional: a comment reads as
 * the record of who said it then.
 */
export const AUTHOR_DISPLAY_NAME_MAX_LENGTH = 64;

/**
 * Resolve the name to render for a comment author, with the client's existing
 * fallback ladder. Both ends must call THIS function rather than each
 * re-implementing the ladder — the two-implementation version is exactly how
 * the same author ends up labelled differently on the two surfaces.
 *
 * Ladder: stamped display name → caller-supplied directory name → `null`.
 * A `null` result means "render the existing id-only anonymous form", which
 * is what the client does today; it is not an error.
 */
export function resolveAuthorDisplayName(input: {
  /** Server-stamped snapshot from the comment event. */
  stamped?: string | null;
  /** Locally resolved member-directory name, when the viewer can see one. */
  directory?: string | null;
}): string | null {
  const stamped = input.stamped?.trim();
  if (stamped) return stamped.slice(0, AUTHOR_DISPLAY_NAME_MAX_LENGTH);
  const directory = input.directory?.trim();
  if (directory) return directory.slice(0, AUTHOR_DISPLAY_NAME_MAX_LENGTH);
  return null;
}

/** Author identity as it travels with an external comment. */
export interface ShareCommentAuthor {
  kind: ShareAuthorKind;
  /** Avatar color seed — see {@link AUTHOR_KEY_HEX_LENGTH}. */
  authorKey: string;
  /** Server-stamped name snapshot; absent means render the id-only form. */
  displayName?: string;
  /** Present only when `kind === 'member'`. */
  memberId?: string;
}

/* ------------------------------------------------------------------ *
 * Idempotency
 * ------------------------------------------------------------------ */

/**
 * Client-generated key for one SEND ATTEMPT (D131, frozen 2026-09-21).
 *
 * Per attempt, not per comment: `collab.comment_events` is an append-only
 * event log, so one `comment_id` legitimately produces many events (create,
 * edit, status change) and keying on it would reject the second legitimate
 * event. The uniqueness constraint in the database is therefore
 * `(team_id, project_id, idempotency_key) WHERE idempotency_key IS NOT NULL`,
 * which leaves every legacy row — all NULL — unaffected.
 *
 * The share page generates this BEFORE navigating away to log in, so the
 * replay that happens on return carries the same key and cannot produce a
 * second comment. That is the red-line case: same key POSTed twice yields
 * exactly one comment.
 *
 * Format frozen as a v4 UUID string so both ends can generate it with a
 * platform primitive (`crypto.randomUUID()`) and neither needs a dependency.
 */
export const IDEMPOTENCY_KEY_MAX_LENGTH = 64;

/** True when `value` is an acceptable idempotency key (non-empty, within bounds). */
export function isValidIdempotencyKey(value: string): boolean {
  return value.length > 0 && value.length <= IDEMPOTENCY_KEY_MAX_LENGTH;
}

/* ------------------------------------------------------------------ *
 * Share state (the DTO the OD client reads)
 * ------------------------------------------------------------------ */

/**
 * Lifecycle of one project's share, as the OD client sees it.
 *
 * - `none` — never shared, or the last share was stopped and forgotten.
 * - `preparing` — an upload is in flight. Transient; the client polls.
 * - `active` — a live share link exists.
 * - `stopped` — the owner stopped sharing. The link now answers 410 Gone;
 *   existing comments are retained, not deleted.
 */
export const SHARE_STATUSES = ['none', 'preparing', 'active', 'stopped'] as const;
export type ShareStatus = (typeof SHARE_STATUSES)[number];

/**
 * One file the publish plan could not include, surfaced to the share panel.
 *
 * `missing` — referenced by the document but not present on disk.
 * `invalid` — present but unreadable or of a type the plan refuses.
 *
 * S16: these render as a yellow, expandable list and MUST NOT disable the
 * share button. A partially-complete share is the normal case for a
 * work-in-progress document; blocking on it was explicitly rejected.
 */
export interface SharePlanExclusion {
  path: string;
  reason: 'missing' | 'invalid';
}

/**
 * Total-bytes ceiling for one share (S15). Checked BEFORE the upload starts,
 * so the user is refused immediately rather than after a long transfer.
 *
 * NOTE: the 20 MB figure is carried over from the product spec and has no
 * source in code or in the decision ledger — it is an inherited constant, not
 * a measured limit. It is frozen here so the two ends agree, not because it
 * has been justified.
 */
export const SHARE_MAX_TOTAL_BYTES = 20 * 1024 * 1024;

/**
 * Summary of what a share WOULD contain, computed by the daemon's
 * `buildSharePlan` before any bytes move. Drives S2/S3/S7/S15/S16.
 */
export interface SharePlanSummary {
  fileCount: number;
  totalBytes: number;
  /** `totalBytes > SHARE_MAX_TOTAL_BYTES` — the S15 pre-upload refusal. */
  exceedsSizeLimit: boolean;
  /** S16. Empty array, never absent, so callers need no `?? []`. */
  exclusions: SharePlanExclusion[];
}

/**
 * The per-project share DTO. This is the single signal the client uses to
 * decide which share-panel state to open (G1 vs G2) and whether a project
 * has a live share at all (A22, replacing two `collab.enabled` reads).
 *
 * There is deliberately no third branch: the panel state is a total function
 * of `status`, so a future state must be added to {@link SHARE_STATUSES}
 * rather than inferred from some other field being present.
 */
export interface ProjectShareState {
  projectId: string;
  status: ShareStatus;
  /** Present when `status` is `active` or `stopped`. */
  slug?: string;
  /** Public path for the share; present exactly when `slug` is. */
  path?: string;
  /** Monotonic publish counter; bumped on each re-publish. */
  version?: number;
  /** Epoch ms of the most recent successful publish. */
  publishedAt?: number;
  /** Last computed plan summary, when one has been computed. */
  plan?: SharePlanSummary;
  /**
   * Count of comments on this project that have not been dealt with, as the
   * SERVER counts them.
   *
   * D116 ②/③, frozen: this is the number of UNRESOLVED comments — the same
   * figure the client already shows — NOT an unread count computed against
   * `lastReadAt`. The design draft asked for an unread count; we keep the
   * shipped meaning and only adopt the draft's red-dot appear/clear behavior.
   *
   * It must come from the server because the share page's list is capped at
   * {@link SHARE_COMMENT_PAGE_LIMIT}; computing it from `list.length` is a
   * negative assertion in the acceptance tests.
   */
  unresolvedTotal?: number;
}

/**
 * True when this project has a share the client should treat as live. A22
 * replaces two `collab.enabled` reads with this predicate — note it is a
 * predicate over the DTO, not over the transport, so a project with cloud
 * collaboration disabled can still have a live share and vice versa.
 */
export function hasActiveShare(state: ProjectShareState | null | undefined): boolean {
  return state?.status === 'active';
}

/* ------------------------------------------------------------------ *
 * Share-page comment API (I4)
 * ------------------------------------------------------------------ */

/**
 * Server-side page cap on the share page's comment list. The list is
 * truncated at this many items; {@link ProjectShareState.unresolvedTotal}
 * carries the real count.
 */
export const SHARE_COMMENT_PAGE_LIMIT = 500;

/**
 * Anti-abuse ceiling on a comment body, in BYTES. Not a product limit.
 *
 * The product decision is that comment length is not limited: no character
 * count, no disabled send button, no truncation, and no `maxLength` on the
 * input. A 4000-character cap was proposed and explicitly rejected, as was an
 * earlier 200-code-point one and a later 1–400 character one. This constant
 * exists only so a single request cannot be used to push unbounded bytes at
 * the server, which is a transport concern.
 *
 * The distinction is load-bearing, not pedantic:
 *
 * - It is measured in BYTES, not characters, because it is about payload size
 *   rather than anything a person types. Never render it as a character
 *   budget, and never derive a counter from it.
 * - Exceeding it is `PAYLOAD_TOO_LARGE`, not `INVALID_COMMENT`. It is not a
 *   validation rule about what a comment may say.
 * - The client must NOT pre-check it. The input stays uncapped; the server
 *   refuses the pathological case. A client-side check would reintroduce the
 *   exact "count and disable" behaviour the product ruled out.
 *
 * 64 KiB is roughly twenty thousand Chinese characters. Anything reaching it
 * is a script or a paste accident, not a person writing a comment.
 */
export const SHARE_COMMENT_MAX_BYTES = 64 * 1024;

/**
 * The four event shapes the comment stream carries. `delete` remains in the
 * union because the OD CLIENT can delete; the SHARE PAGE cannot (D97 — the
 * share page has no edit and no delete entry point at all, and one appearing
 * is a bug).
 */
export const SHARE_COMMENT_EVENT_TYPES = ['create', 'update', 'delete', 'status'] as const;
export type ShareCommentEventType = (typeof SHARE_COMMENT_EVENT_TYPES)[number];

/**
 * Frozen error codes for the share-page comment API (I4).
 *
 * The validation ORDER is part of the contract, not an implementation detail,
 * because each step leaks strictly less than the next: checking the session
 * before the share's liveness avoids telling an unauthenticated caller whether
 * a share exists. D58, narrowed to four steps by D97 (the author-identity step
 * disappeared with edit/delete):
 *
 *     401 UNAUTHENTICATED → 410 SHARE_STOPPED → 400 INVALID_COMMENT → 429 RATE_LIMITED
 *
 * An implementation that reorders these passes its own unit tests and fails
 * the contract, so the order is asserted directly.
 */
export const SHARE_COMMENT_ERROR_CODES = [
  /** 401 — no session, or the session expired mid-compose. */
  'UNAUTHENTICATED',
  /** 410 — the owner stopped this share. Both GET and POST answer this. */
  'SHARE_STOPPED',
  /** 404 — no share binding for this `(projectId, slug)` pair. */
  'SHARE_NOT_FOUND',
  /**
   * 400 — body empty or anchor malformed.
   *
   * NOT the answer for an oversized body: that is `PAYLOAD_TOO_LARGE`
   * against {@link SHARE_COMMENT_MAX_BYTES}, because size is a transport
   * fact rather than a judgement about the comment.
   */
  'INVALID_COMMENT',
  /** 429 — per-viewer write throttle tripped; carries `retryAfterSeconds`. */
  'RATE_LIMITED',
  /** 413 — request body exceeded the transport limit. */
  'PAYLOAD_TOO_LARGE',
] as const;
export type ShareCommentErrorCode = (typeof SHARE_COMMENT_ERROR_CODES)[number];

/** The order the checks must run in. Asserted, not merely documented. */
export const SHARE_COMMENT_VALIDATION_ORDER: readonly ShareCommentErrorCode[] = [
  'UNAUTHENTICATED',
  'SHARE_STOPPED',
  'INVALID_COMMENT',
  'RATE_LIMITED',
] as const;

/**
 * The failure envelope the vela CLI writes to stdout when a single comment
 * push fails, and the field names the daemon must read it by.
 *
 * This exists because the two halves were built to different names and both
 * sides' tests passed: the Go side emitted `errorCode`, the daemon parser
 * required `code`, so the parse returned null, no structured error was ever
 * produced, and the daemon's terminal-cancel could not fire. Nothing was red.
 * An agreement that lives only in two implementations is not an agreement.
 *
 * `errorCode` is the name, because the batch push path shipped it first
 * (`collabCommentPushBatchItemResult`); the parser is what moves.
 *
 * Both fields are required to act on it. A code alone must never cancel
 * data: cancelling discards a comment the user already wrote, so a loose
 * match — an upstream proxy whose prose happens to contain the code — would
 * destroy it. Status without code is equally insufficient.
 */
export const VELA_CLI_FAILURE_ENVELOPE_FIELDS = {
  /** Human-readable text. Must never, on its own, decide anything. */
  message: 'error',
  /** The API error code, e.g. `SHARE_STOPPED`. */
  code: 'errorCode',
  /** The HTTP status the API answered with. Omitted when zero. */
  status: 'status',
} as const;

/**
 * The one condition under which a queued comment is discarded rather than
 * retried. Both halves are required — see above for why.
 */
export const SHARE_COMMENT_TERMINAL_REJECTION = {
  status: 410,
  code: 'SHARE_STOPPED',
} as const;

/**
 * Error body for the share comment API.
 *
 * vela today answers errors in TWO different shapes depending on the route
 * family (`{ error: string }` and `{ code, retryAfterSeconds }`). This
 * interface is the one shape the share routes use; existing routes are not
 * being migrated as part of P0.
 */
export interface ShareCommentErrorResponse {
  code: ShareCommentErrorCode;
  /** Present only with `RATE_LIMITED`. */
  retryAfterSeconds?: number;
}

/**
 * One comment as the share page receives it.
 *
 * Invariant: this is exactly the POST response body as well. A create returns
 * the same shape a list returns, so the page appends the response directly
 * instead of refetching or synthesizing an optimistic row that can drift from
 * what the server actually stored.
 */
export interface ShareComment {
  id: string;
  seq: number;
  author: ShareCommentAuthor;
  /**
   * Computed SERVER-side against the live session (D87). The client cannot
   * derive this from `author.authorKey` and must not try.
   */
  isMine: boolean;
  note: string;
  filePath: string;
  elementId: string;
  selector: string;
  htmlHint: string;
  status: string;
  createdAt: number;
  updatedAt: number;
}

/** `GET` the share page's comment list. `since` is the `seq` cursor. */
export interface ShareCommentListResponse {
  comments: ShareComment[];
  /** Highest `seq` in this page; pass back as `since` to poll forward. */
  latestSeq: number;
  /** Unresolved count, independent of the page cap. See `unresolvedTotal`. */
  unresolvedTotal: number;
}

/** `POST` a comment from the share page. */
export interface ShareCommentCreateRequest {
  /** See {@link IDEMPOTENCY_KEY_MAX_LENGTH}. Required — replay safety. */
  idempotencyKey: string;
  note: string;
  filePath: string;
  elementId: string;
  selector: string;
  htmlHint: string;
}

/** Same shape as one list item — see {@link ShareComment}. */
export interface ShareCommentCreateResponse {
  comment: ShareComment;
}

/* ------------------------------------------------------------------ *
 * Public HTTP seam
 * ------------------------------------------------------------------ */

/**
 * The share page's public endpoints, frozen 2026-09-21.
 *
 * The page URL and the API URL are different things and only the first was
 * frozen earlier, which left the share page unable to write a request without
 * inventing one. These are the shapes the cloud actually serves.
 *
 * `{slug}` rides in the path and `projectId` in the query. That split is not
 * arbitrary: the slug alone identifies the snapshot bytes, while the project
 * is what scopes the comments, and keeping them in different positions makes
 * it obvious at the call site that BOTH must be supplied. A request missing
 * either half is refused as `SHARE_NOT_FOUND` — the same answer a mismatched
 * pair gets, so probing learns nothing.
 */
export const SHARE_COMMENTS_PATH_PREFIX = '/api/v1/collab/share';

/**
 * `GET {prefix}/{slug}/comments?projectId=&filePath=&since=`
 * → {@link ShareCommentListResponse}
 *
 * `since` is the `seq` cursor: pass back the previous response's `latestSeq`
 * to poll forward. It is a DELTA read, not a full list, so a caller that
 * discards its accumulated comments between polls will show an emptying page.
 */
export function buildShareCommentsUrl(input: {
  slug: string;
  projectId: string;
  filePath: string;
  since?: number;
}): string {
  const query = new URLSearchParams({
    projectId: input.projectId,
    filePath: input.filePath,
  });
  if (input.since !== undefined) query.set('since', String(input.since));
  return `${SHARE_COMMENTS_PATH_PREFIX}/${encodeURIComponent(input.slug)}/comments?${query}`;
}

/**
 * Snapshot metadata comes from the EXISTING public snapshot read, not from a
 * new share-specific endpoint: `GET /api/v1/public/snapshots/{slug}` returns
 * the manifest, which is where the entry file name comes from. There is no
 * directory index and no `index.html` fallback, so the page must read the
 * manifest before it can build an iframe `src`.
 */
export const PUBLIC_SNAPSHOT_PATH_PREFIX = '/api/v1/public/snapshots';

/**
 * An OPEN share page does not poll for a newer snapshot. The viewer refreshes.
 *
 * ## The link is stable; what it points at moves
 *
 * A snapshot is immutable, but the share link is NOT a snapshot address — it
 * is a stable alias whose pointer the owner advances when they update. The
 * toast after a successful update says as much: "viewers see the latest
 * version after refreshing". A failed update leaves the server-side pointer
 * where it was, which is only a meaningful guarantee because there IS a
 * pointer. Stop-then-resume likewise restores the SAME link and mints no new
 * snapshot.
 *
 * So a share URL keeps working across updates, and a viewer who reloads gets
 * the current version.
 *
 * An open page DOES learn that a new version exists: the share page's poll
 * (see {@link SHARE_SYNC_INTERVALS_MS.sharePagePoll}) carries the share
 * version alongside comments, and a version increase raises a toast — the
 * owner deployed something new. See {@link SHARE_PAGE_ANNOUNCES_NEW_VERSION}.
 *
 * ⚠️ This constant previously read `false` with a docblock asserting "no
 * version poll, no second request, no push". That was wrong against D113 Q2
 * (product-set, 09-20), which had already decided the share page polls
 * comments AND share version every 30s. Corrected 2026-09-22.
 */
export const SHARE_SNAPSHOT_DISCOVERY_IN_P0 = true;

/**
 * A new deployment announces itself; it does not take over the page.
 *
 * When the polled share version increases, the viewer gets a toast saying a
 * new version has been deployed, with reloading left to them.
 *
 * ## Why it must not reload on its own
 *
 * The viewer may be part-way through writing a comment. Reloading discards
 * that draft to show them something they did not ask for at a moment they did
 * not choose — the page would be punishing them for the owner's timing. The
 * whole point of the stable alias is that the link keeps working; nothing
 * about a new version is urgent enough to interrupt someone mid-sentence.
 *
 * So: announce, and let them pick the moment.
 */
export const SHARE_PAGE_ANNOUNCES_NEW_VERSION = true;

/* ------------------------------------------------------------------ *
 * Comment read state
 * ------------------------------------------------------------------ */

/**
 * When the viewer last opened this project's comments, as epoch ms.
 *
 * Persisted by the DAEMON, not by the cloud and not in browser storage: the
 * red dot has to survive a restart, and a per-browser value would make the
 * same person on two devices disagree about what they have already seen.
 *
 * ## This is NOT the number on the badge
 *
 * The badge shows {@link ProjectShareState.unresolvedTotal} — how many
 * comments are still unhandled. The design draft asked for an unread count
 * and that was declined: the shipped meaning stays. `lastReadAt` drives only
 * whether the dot APPEARS and when it CLEARS.
 *
 * Keeping the two apart matters because they answer different questions.
 * "Three comments need your attention" is true whether or not you have looked
 * at them; "something arrived since you last looked" stops being true the
 * moment you look. Merging them would make the badge drop to zero on open
 * while three comments were still open.
 */
export interface ProjectCommentReadState {
  projectId: string;
  /** Epoch ms; absent means the viewer has never opened this project's comments. */
  lastReadAt?: number;
}

/**
 * Is there something the viewer has not seen yet?
 *
 * Two conditions, and the second is the one that gets forgotten: a comment
 * the viewer wrote themselves must never light the dot. Without that, sending
 * a comment marks your own project unread.
 *
 * A comment that arrived at exactly `lastReadAt` counts as SEEN. The
 * comparison is strict on purpose — a comment written in the same
 * millisecond as the open is far more likely to be the one that triggered
 * the open than one that arrived after it.
 */
export function hasUnreadComments(input: {
  readState: ProjectCommentReadState | null | undefined;
  comments: ReadonlyArray<{ createdAt: number; author: { authorKey?: string } }>;
  viewerAuthorKey: string | null;
}): boolean {
  const lastReadAt = input.readState?.lastReadAt;
  return input.comments.some((comment) => {
    if (comment.author.authorKey && comment.author.authorKey === input.viewerAuthorKey) {
      return false;
    }
    return lastReadAt === undefined || comment.createdAt > lastReadAt;
  });
}

/** `PUT /api/projects/:projectId/comments/read` — stamps `lastReadAt` to now. */
export interface ProjectCommentReadRequest {
  /** Epoch ms. Server-clamped: a client clock ahead of the server cannot hide future comments. */
  readAt: number;
}

/* ------------------------------------------------------------------ *
 * Delete-time residual cleanup
 * ------------------------------------------------------------------ */

/**
 * The project was deleted locally, but stopping its public share did not
 * finish.
 *
 * Deleting a shared project is two effects against two systems: the local
 * project row goes away, and the cloud binding that keeps the public link
 * serving has to be stopped. The second one crosses the network and can fail
 * on its own — expired credentials, the cloud being down, the account no
 * longer authorized for that project.
 *
 * ## Why this cannot be folded into the delete's success flag
 *
 * Failing the whole delete would be wrong: the project IS gone, and telling
 * the user it was not would make them try again against something that no
 * longer exists. Succeeding silently would be worse: a link they believe they
 * just revoked is still serving their content to anyone holding it. That is a
 * privacy-visible outcome, and it is exactly the one an `ok: true` with no
 * further shape cannot say.
 *
 * So the delete reports success AND carries this. One response, two facts.
 *
 * ## `retrying` is the difference between a notice and an alarm
 *
 * `true` means the stop was queued and the daemon will keep attempting it;
 * the user needs to know the link may be briefly live, not to do anything.
 * `false` means nothing further will happen on its own and the link stays up
 * until someone acts. Collapsing the two produces either a scary banner for a
 * self-healing case, or a calm one for a case that needs a person.
 *
 * ## Exactly once
 *
 * This is delivered on the delete response and nowhere else. The project is
 * gone, so there is no row left to hang a persistent indicator on, and no
 * later request will rediscover the condition. A surface that drops it drops
 * it permanently — which is why it rides the response every consumer already
 * reads rather than a separate channel one of them might not subscribe to.
 */
export interface ProjectDeleteShareResidual {
  /**
   * Which file's link is still serving.
   *
   * Publications are per FILE, not per project: `public_file_publications` is
   * keyed by `(resource_team_id, owner_member_id, project_id, file_path)`. A
   * person who published three files from one project and then deleted it can
   * therefore be left with three live links, each of which may fail to stop
   * for its own reason.
   *
   * Without this, a message could only say "a link is still up" — and the
   * person has no way to tell which of their files it is.
   */
  filePath: string;
  /** The public slug that may still be serving. */
  slug: string;
  /** Will the daemon keep trying THIS one on its own? */
  retrying: boolean;
  /** The failure's error code, when the stop attempt produced one. */
  code?: string;
}

/**
 * `DELETE /api/projects/:projectId` response.
 *
 * `ok` describes the LOCAL delete only. It stays `true` when
 * {@link ProjectDeleteShareResidual} is present — see that type for why.
 */
export interface ProjectDeleteResponse {
  ok: true;
  /**
   * Every file whose public link may still be serving, one entry each.
   *
   * A list, not a single value: see {@link ProjectDeleteShareResidual.filePath}
   * — publications are per file, so one delete can leave several behind, and
   * they do not share a fate. Some may be queued for retry while others are
   * terminal, which is why `retrying` lives on each entry rather than here.
   *
   * Absent or empty means the project had no live share, or every stop
   * succeeded. A caller must not treat a single-element list as the only
   * possible shape.
   */
  shareResiduals?: ReadonlyArray<ProjectDeleteShareResidual>;
}

/* ------------------------------------------------------------------ *
 * Publishing: content and binding can succeed separately
 * ------------------------------------------------------------------ */

/**
 * What a publish confirmed, as the SERVER reported it.
 *
 * Every field here is a fact the server sent back. None of it may be
 * reconstructed from a child process's exit code: a nonzero exit proves that
 * something failed, NOT that the alias is unchanged. A publish that timed out
 * may well have landed. Reconciliation reads this receipt or asks the server
 * again; it never infers pointer state from a failure.
 */
export interface SharePublishReceipt {
  /** The file that was published, in the same spelling the rest of this module uses. */
  filePath: string;
  /** The stable public alias. */
  slug: string;
  /** Epoch ms of this publish. */
  publishedAt: number;
  /** Alias generation: which publish this link now points at. */
  version: number;
  /** The immutable version the alias was pointed at, so a retry cannot drift. */
  versionId: string;
  /** Entry file inside the published package, e.g. the rewritten `index.html`. */
  entryPath: string;
}

/**
 * Publishing is two effects, and the second one can fail alone.
 *
 * `od` uploads the content and advances the alias, then registers the share
 * binding that makes the link serve. The registration crosses the network
 * separately, so there is a real outcome in the middle: **the content is
 * published and the alias has moved, but the link is not bound yet.**
 *
 * ## Why this needs its own status rather than an error
 *
 * Reporting it as a failure is a lie the user pays for twice: the content DID
 * upload, and the alias DID advance, so a retry of the whole publish would
 * push the pointer forward again for nothing. Reporting it as success is
 * worse — the person is handed a link that does not serve.
 *
 * Collapsing it also loses the receipt. `share.go` returns its binding error
 * before it writes the share receipt to stdout, which is exactly how the
 * daemon came to lose a confirmed publish; that is a defect against this
 * contract, not a shape this contract accommodates.
 *
 * ## Retry means binding only
 *
 * A `binding_pending` publish is resumed by registering the binding again for
 * the same project, slug and `versionId` under the original identity. It must
 * NOT re-run the publish: that advances the alias and invents a new version
 * nobody asked for. The queue that carries these retries must also be
 * distinct from the stop queue — a binding task misfiled as a stop would
 * revoke the very share it was meant to complete.
 *
 * ## A failure BEFORE the content lands is still an ordinary error
 *
 * This union covers outcomes where a receipt exists. A publish that failed
 * before confirming anything keeps the existing error response; do not dress
 * it up as `binding_pending` with an empty receipt.
 */
export type SharePublishResult =
  | {
      status: 'published';
      receipt: SharePublishReceipt;
      /** Absent on purpose: a bound share has nothing pending to warn about. */
      binding?: never;
    }
  | {
      status: 'binding_pending';
      receipt: SharePublishReceipt;
      binding: SharePublishBindingPending;
    };

/**
 * Why the link is not serving yet, and whether anyone will fix it.
 *
 * `retrying` is the DAEMON's fact and only the daemon may assert it: it is
 * true once a durable enqueue has succeeded, and false otherwise — including
 * when the enqueue itself failed. The vela CLI cannot fill this in, because it
 * does not own the queue; a CLI result that claims it is reporting something
 * it cannot know.
 *
 * A failed enqueue is therefore still `binding_pending`, with
 * `retrying: false`. It is never full success (the link does not serve) and
 * never a generic publish failure (the content is up). That combination is
 * the one that needs a person, which is precisely why it must stay sayable.
 */
export interface SharePublishBindingPending {
  /** Will the daemon keep trying on its own? */
  retrying: boolean;
  /** The binding failure's error code, sanitized for a public response. */
  code?: string;
}

/**
 * Owner, workspace, resource ids and queue revision tokens stay OUT of the
 * public publish response.
 *
 * The daemon needs every one of them to retry a binding under the original
 * identity and generation, and it already holds them. Echoing them to a
 * caller would publish internal identifiers to buy nothing, and a token in a
 * response is a token in a log.
 */
export const SHARE_PUBLISH_RESPONSE_OMITS_INTERNAL_IDS = true;

/* ------------------------------------------------------------------ *
 * Share entry: is what is serving still what you would publish?
 * ------------------------------------------------------------------ */

/**
 * Whether the live share still matches the content it would publish now.
 *
 * This is a SECOND axis, orthogonal to {@link ShareStatus}. Status answers
 * "does a share exist and is it serving"; freshness answers "is what it
 * serves still current". Folding them into one enum would force a `stopped`
 * share to also claim a freshness it cannot have.
 *
 * ## `unknown` is a third value, not a default
 *
 * It means the comparison could not be made — the query is in flight, it
 * failed, or the stored record predates fingerprinting and cannot be compared.
 * It is NOT `outdated` and it is NOT "never shared". Collapsing it in either
 * direction is a visible defect:
 *
 * - read as fresh → the entry shows a confident "shared" state for content
 *   that may have moved on
 * - read as outdated → the person is nagged to re-publish something that is
 *   already current
 * - read as none → **the existing share link disappears from the UI**, which
 *   is the worst of the three: the share is still live and public, and the
 *   person has just lost the only handle they had on it
 *
 * So `unknown` keeps the plain entry and keeps the copy-link affordance. It
 * says less, and says nothing false.
 */
export const SHARE_CONTENT_FRESHNESS = ['current', 'outdated', 'unknown'] as const;
export type ShareContentFreshness = (typeof SHARE_CONTENT_FRESHNESS)[number];

/**
 * What may and may not establish `current`.
 *
 * `current` requires positive proof: a fingerprint over the COMPLETE publish
 * plan, compared against the payload of the last successful publish. Complete
 * means the dependency resources too — a share whose entry HTML is untouched
 * but whose stylesheet changed is `outdated`, and a comparison that only
 * looked at the entry would call it `current` and be wrong.
 *
 * None of the following may stand in for that comparison:
 *
 * - **`status === 'active'`** — proves a share is serving, says nothing about
 *   what it serves.
 * - **file mtime** — changes without content changing, and fails to change
 *   when content is restored to an earlier state.
 * - **url or slug** — the slug is a STABLE alias across updates by design
 *   (see the addressing section above). It cannot distinguish versions; that
 *   is the point of it.
 * - **a revision or counter that is not derived from content** — it answers
 *   "did we publish again", not "is the content the same".
 *
 * When the fingerprint is unavailable, the answer is `unknown`. Guessing from
 * any of the above is how a confident wrong state gets shipped.
 */
export const SHARE_FRESHNESS_REQUIRES_CONTENT_FINGERPRINT = true;

/**
 * What the share entry should show, derived once so no surface re-derives it.
 *
 * Three appearances, and the mapping is a total function of the two axes:
 *
 * - `plain` — no live share to point at, or nothing trustworthy to say about
 *   one. Covers `none`, `stopped`, `preparing`, and every `unknown`.
 * - `published` — the "already shared" affirmative state. Requires BOTH an
 *   `active` share AND `current` freshness. Nothing else earns it.
 * - `outdated` — an active share whose content has provably moved on. Leads
 *   to the update path; it must never be drawn as the affirmative state.
 *
 * `canCopyLink` is deliberately separate from appearance: a share that is
 * `active` still has a working link while its freshness is `unknown` or
 * `outdated`, and hiding the copy affordance there would strand the person.
 */
export interface ShareEntryPresentation {
  appearance: 'plain' | 'published' | 'outdated';
  /** True whenever a live link exists, regardless of how fresh it is. */
  canCopyLink: boolean;
}

/**
 * The single place the two axes become an appearance.
 *
 * Kept as a function rather than a table so the `unknown` rule cannot be
 * quietly dropped by a caller writing `status === 'active' ? green : plain`.
 */
export function shareEntryPresentation(input: {
  status: ShareStatus;
  freshness: ShareContentFreshness;
}): ShareEntryPresentation {
  if (input.status !== 'active') {
    return { appearance: 'plain', canCopyLink: false };
  }
  if (input.freshness === 'current') {
    return { appearance: 'published', canCopyLink: true };
  }
  if (input.freshness === 'outdated') {
    return { appearance: 'outdated', canCopyLink: true };
  }
  // unknown: the link works, but nothing affirmative may be claimed about it.
  return { appearance: 'plain', canCopyLink: true };
}

/* ------------------------------------------------------------------ *
 * Reading one file's share state
 * ------------------------------------------------------------------ */

/**
 * `GET /api/projects/:projectId/files/:filePath/publish-public`
 *
 * Three fields, deliberately independent. Each answers a different question
 * and each can be absent or unknown on its own:
 *
 * - `publication` — the LOCAL record of what was published: the link to show
 *   and copy. `null` means no local record.
 * - `status` — whether a share exists and is serving, from the lifecycle
 *   source of truth.
 * - `freshness` — whether what is serving still matches current content.
 *
 * ## `publication: null` is not `status: 'none'`
 *
 * Losing the local record is a gap in what we know, not proof that nothing is
 * shared. A share registered under this identity can be live and public while
 * this daemon has no row for it — after a reinstall, a data-dir move, or a
 * record written before this field existed.
 *
 * Collapsing the two makes the UI say "not shared" about a link that is
 * serving, and takes away the only handle the person had on it. That is the
 * same failure the `unknown` freshness rule exists to prevent, arriving
 * through a different door.
 *
 * ## A local row does not prove the cloud says `active`
 *
 * `publication` is written by this daemon; `status` belongs to the share
 * lifecycle, which lives on the other side of the network. A stopped share
 * leaves the local row in place ON PURPOSE, so the same slug can resume.
 * Deriving `status` from `publication != null` would make `stopped`
 * unreachable and re-break the thing the four-state enum exists for.
 *
 * ## A failed read changes nothing
 *
 * On a non-2xx, a caller keeps what it already had: the previously known link
 * stays on screen and freshness degrades to `unknown`. It must not rewrite
 * state to `none` — a request that did not answer is not an answer.
 *
 * ## Caching
 *
 * Scope any cache by identity + project + file, because all three change what
 * the correct answer is. Invalidate and re-read after a successful publish,
 * update or stop. Drop the old scope's entries when the identity changes
 * rather than letting them answer for the new one. The card and the toolbar
 * read the SAME entry — two independent polls of the same fact would let the
 * two surfaces disagree on screen.
 */
export interface ProjectFilePublicShareResponse {
  /** Local record of the published link; `null` when we hold none. */
  publication: PublicProjectFilePublication | null;
  /** A durable publication can exist without a copyable URL. Re-reading after
   * configuration is repaired can recover its link without uploading again. */
  link?: SharePublishLinkUnavailable;
  /** From the lifecycle source, not inferred from `publication`. */
  status: ShareStatus;
  /** From a content fingerprint comparison; `unknown` until one is available. */
  freshness: ShareContentFreshness;
}

/* ------------------------------------------------------------------ *
 * Share page ↔ preview frame bridge
 * ------------------------------------------------------------------ */

/**
 * The postMessage envelope between the share page (host) and the previewed
 * artifact (frame).
 *
 * Sent as a JSON STRING, not a structured clone: the frame renders untrusted
 * authored content, and a string forces both sides through an explicit parse
 * and schema check instead of receiving whatever object shape arrives.
 */
export interface ShareViewerBridgeEnvelope {
  version: 1;
  type: ShareViewerBridgeMessageType;
  /** See {@link SHARE_BRIDGE_NONCE_IS_FRESHNESS_NOT_PERMISSION}. */
  nonce: string;
  payload: unknown;
}

export const SHARE_VIEWER_BRIDGE_HOST_TO_FRAME = [
  'share:init',
  'share:mode',
  'share:locate',
  'share:pins',
] as const;

export const SHARE_VIEWER_BRIDGE_FRAME_TO_HOST = [
  'share:ready',
  'share:target',
  'share:pin',
  'share:located',
] as const;

export type ShareViewerBridgeMessageType =
  | (typeof SHARE_VIEWER_BRIDGE_HOST_TO_FRAME)[number]
  | (typeof SHARE_VIEWER_BRIDGE_FRAME_TO_HOST)[number];

/** host → frame. Turns the comment affordance on or off in the frame. */
export interface ShareBridgeInitPayload { enabled: boolean }
/** host → frame. Enters or leaves element-selection mode. */
export interface ShareBridgeModePayload { enabled: boolean }
/** host → frame. Asks the frame to find and highlight one anchored comment. */
export interface ShareBridgeLocatePayload {
  id: string;
  elementId: string;
  selector: string;
}
/** host → frame. The full pin set to draw; replaces whatever is drawn. */
export interface ShareBridgePinsPayload {
  items: ReadonlyArray<{ id: string; elementId: string; selector: string }>;
}

/** frame → host. The frame has loaded and will accept the other three types. */
export interface ShareBridgeReadyPayload { }
/** frame → host. The viewer picked an element to comment on. */
export interface ShareBridgeTargetPayload {
  elementId: string;
  selector: string;
  htmlHint: string;
}
/** frame → host. A drawn pin was activated. */
export interface ShareBridgePinPayload { id: string }
/** frame → host. The answer to one `share:locate`. */
export interface ShareBridgeLocatedPayload { id: string; found: boolean }

/**
 * The nonce proves FRESHNESS, not permission.
 *
 * It says "this message belongs to the current document load", which is what
 * makes a message from a previous load — after a navigation, a re-render, or
 * a restored bfcache page — discardable instead of acted on.
 *
 * It is NOT an authorization secret, and it cannot be:
 *
 * - Any script running in the SAME document can read it. It defends against
 *   staleness, never against code already inside the frame.
 * - The host cannot observe when a cross-origin frame BEGINS navigating, so
 *   there is a window in which a rotated nonce has not reached the frame yet.
 *   Treating the nonce as a capability would make that window a hole; treating
 *   it as freshness makes it merely a dropped message.
 *
 * Authorization lives where it always lived: the origin check on the message
 * source, and the server's own checks on anything that changes state.
 */
export const SHARE_BRIDGE_NONCE_IS_FRESHNESS_NOT_PERMISSION = true;

/**
 * What must never cross this bridge.
 *
 * The frame renders content the viewer did not write and the host cannot
 * vouch for. Everything the frame is handed becomes readable by that content.
 *
 * - **No `filePath`** — the bridge speaks in elements and ids; which file is
 *   being viewed is the host's business, and the frame has no use for it.
 * - **No credentials, tokens or session material** of any kind.
 * - **No comment bodies** — the frame needs to know WHERE a comment is
 *   anchored, never what it says. Pins carry ids; text stays on the host.
 *
 * A message that would need any of these is a message that belongs on the
 * host side of the boundary instead.
 */
export const SHARE_BRIDGE_CARRIES_NO_PATHS_BODIES_OR_CREDENTIALS = true;

/**
 * `selector` and `htmlHint` are data, never code.
 *
 * They are matched and displayed. They are never evaluated, never written
 * into the DOM as markup, and never used to build a selector string that is
 * then evaluated. An unparseable or unmatched selector clears the highlight
 * and answers `found: false`; it does not throw the frame into an error path
 * a page could steer.
 */
export const SHARE_BRIDGE_SELECTOR_IS_DATA_NOT_CODE = true;

/**
 * Size and rate ceilings, so one side cannot wedge the other.
 *
 * These bound the transport only. The comment body has no product-level
 * length limit (that decision is recorded elsewhere) and does not travel
 * here, so nothing about these numbers constrains what a person may write.
 */
export const SHARE_BRIDGE_LIMITS = {
  /** A UUID string. */
  nonceLength: 36,
  idMaxLength: 200,
  elementIdMaxLength: 1000,
  selectorMaxLength: 2000,
  htmlHintMaxLength: 2000,
  /** Items in one `share:pins`. */
  pinsMaxItems: 200,
  /** Bytes of one serialized envelope. */
  messageMaxBytes: 64 * 1024,
  /** Messages per second, per direction. */
  messagesPerSecond: 20,
} as const;

/**
 * Ordering and revocation — the rules that make a stale message harmless.
 *
 * **Gates.** `share:ready` carrying the current nonce must arrive before the
 * host sends `mode`, `locate` or `pins`. A `share:target` is accepted only
 * while the frame is both ready and in selection mode; a `share:located` only
 * for an id the host actually has in flight; a `share:pin` only for an id in
 * the set the host last drew. Each gate exists so that a message which is
 * merely late cannot be mistaken for one that is meaningful.
 *
 * **Revocation.** A frame load, leaving the view, or any identity change
 * immediately drops the pending selection, the drawn pins and every in-flight
 * locate. Not doing so is how a pin from one viewer's session ends up
 * answering for another's.
 *
 * **Never auto-submit.** Nothing arriving on this bridge may cause a POST on
 * its own. The frame proposes a target; a person decides to comment.
 */
export const SHARE_BRIDGE_ORDERING_AND_REVOCATION_REQUIRED = true;

/* ------------------------------------------------------------------ *
 * Opening a share: the alias resolves, then the content loads
 * ------------------------------------------------------------------ */

/**
 * What the share page needs to open a link, resolved from the stable alias.
 *
 * A NEW shape rather than a change to the existing immutable-snapshot DTO,
 * because the two describe different things and are read by different
 * callers. The snapshot DTO is about one immutable set of bytes; this is
 * about the alias that currently points at one.
 *
 * ## Two identities, and they are not interchangeable
 *
 * - `slug` is the STABLE alias — the thing in the link a person was sent. It
 *   survives updates by design.
 * - `snapshotSlug` is the immutable snapshot it points at RIGHT NOW. It
 *   changes on every update.
 *
 * The existing reader was only ever missing the second one. Adding it here
 * rather than overloading `slug` is what lets the next step say which bytes
 * it believes it is loading.
 */
export interface StableAliasViewerMetadata {
  /** Stable alias; the link the viewer holds. */
  slug: string;
  /** The immutable snapshot this alias points at now. */
  snapshotSlug: string;
  /** Entry file inside that snapshot. */
  entryPath: string;
  /** Human-facing name for the shared artifact. */
  displayName: string;
  /** Epoch ms of the publish this snapshot came from. */
  publishedAt: number;
  /** Alias generation. */
  version: number;
}

/**
 * Opening a share is two requests, and the second must prove it is still
 * talking about the first one's answer.
 *
 * ```
 * 1. GET /api/v1/public/snapshots/:stableSlug?projectId=…&shareAlias=1
 *      → StableAliasViewerMetadata
 * 2. GET /api/v1/public/snapshots/:snapshotSlug/files/:entryPath
 *        ?projectId=…&shareSlug=…&commentBridge=1
 *      → the document
 * ```
 *
 * ## The window between them is the whole problem
 *
 * An update can land in that gap. If step 2 resolved the alias again, it
 * would serve the NEW bytes while the page around it — the comment anchors,
 * the pins, the version it thinks it is showing — still describes the old
 * ones. Comments would point at elements that no longer exist, or worse, at
 * different elements that happen to match.
 *
 * So step 2 names the `snapshotSlug` step 1 returned, and the server serves
 * it only when that is still the current one. A moved alias is `409`, and
 * the page refreshes deliberately instead of silently drifting.
 *
 * ## A query parameter is not authorization
 *
 * `projectId`, `shareSlug` and the `commentBridge` / `shareAlias` flags are
 * all supplied by the caller. They say which pairing is being ASKED about;
 * they cannot say it is allowed. Both steps authorize against the binding —
 * active, and belonging to the team and resource the catalog records — before
 * anything is served. Treating the flag as the gate would make the whole
 * surface openable by adding a parameter.
 */
export const SHARE_VIEWER_ENTRY_STATUS = {
  /** No such alias/snapshot, or the pair does not match. The two are not distinguished. */
  missingOrMismatched: 404,
  /** The share was stopped. */
  stopped: 410,
  /** The alias has moved on; the snapshot named is no longer current. */
  generationAdvanced: 409,
} as const;

/**
 * `404` covers both "not there" and "does not match" on purpose.
 *
 * Separating them would let a caller probe which halves of a pair exist by
 * watching the status change. The viewer has nothing to do differently in
 * the two cases, so there is nothing to buy with the distinction.
 */
export const SHARE_VIEWER_MISSING_AND_MISMATCH_SHARE_ONE_STATUS = true;

/**
 * Deleting the source makes the link stop serving. This is not best-effort.
 *
 * Product ruling: once the file or project is gone, its public link must
 * become inaccessible and say so. The residual on
 * {@link ProjectDeleteShareResidual} describes the window before that is
 * true, not a state the system is allowed to settle in — a residual with
 * `retrying: false` is an unmet obligation someone has to clear, not a
 * tolerated outcome.
 *
 * The consequence for the viewer: a stop caused by deletion is `410`, the
 * same as any other stop, but it is not the same event to the person
 * holding the link. "The owner stopped sharing this" invites them to ask for
 * it back; "the original file was deleted" tells them there is nothing to ask
 * for. {@link SHARE_VIEWER_STOP_REASONS} carries that difference so the two
 * do not collapse into one sentence.
 */
export const SHARE_LINK_MUST_DIE_WITH_ITS_SOURCE = true;

/**
 * Why a stop carries a reason at all.
 *
 * A single `410` can only produce a single sentence, and the only sentence
 * true for every `410` is the vaguest one. Naming the cause lets the viewer
 * say the accurate thing without the server leaking anything the holder of a
 * dead link could not already infer: they know the link existed, and they now
 * know it does not work.
 *
 * `unspecified` is deliberate and is NOT a synonym for `stopped_by_owner`.
 * A reason the server did not record must not be rendered as a cause it did.
 */
export const SHARE_VIEWER_STOP_REASONS = [
  'stopped_by_owner',
  'source_deleted',
  'unspecified',
] as const;
export type ShareViewerStopReason = (typeof SHARE_VIEWER_STOP_REASONS)[number];


/**
 * The shared document is never cached and never revalidated.
 *
 * `no-store`, no `ETag`, no `Last-Modified`, and no `304` path. The alias is
 * stable across updates, so a cached response keyed by URL would serve the
 * previous version under a link that now points elsewhere — and a validator
 * would let a `304` confirm exactly that stale body.
 *
 * The CSP sandbox is unchanged by any of this: the document still loads with
 * `allow-scripts` and the existing sandbox flags.
 */
export const SHARE_VIEWER_DOCUMENT_IS_UNCACHEABLE = true;

/**
 * What the host does with `409`.
 *
 * It tells the person the share moved on and offers to reload. It does NOT
 * re-POST anything, and it does not start a SECOND polling loop of its own —
 * the share page already polls the version on its normal cadence (see
 * {@link SHARE_SYNC_INTERVALS_MS.sharePagePoll}).
 *
 * `409` and the new-version toast are different moments and must stay that
 * way. The toast says "there is something newer, whenever you want it"; a
 * `409` says "the request you just made cannot be served" — the page asked
 * for a snapshot that is no longer current, so that one is not optional.
 */
export const SHARE_VIEWER_409_PROMPTS_RELOAD_WITHOUT_POLLING = true;

/* ------------------------------------------------------------------ *
 * Which publication a public comment belongs to
 * ------------------------------------------------------------------ */

/**
 * The publication a public comment was written against, asserted by the
 * server that accepted it.
 *
 * ## `filePath` cannot answer this
 *
 * Publishing rewrites the entry to `index.html`, so the stored path of a
 * comment on project A's share and one on project B's share are the same
 * string. With only the path, a comment that arrives late — after A was
 * stopped — matches B's live publication and is filed there. The comment
 * lands under someone else's share, and nothing in the record says it is in
 * the wrong place.
 *
 * Carrying the slug removes the ambiguity at the source instead of asking
 * every consumer to guess from what is currently live.
 *
 * ## The server asserts it; the client never reports it
 *
 * `publicationSlug` is filled in by the API that accepted the comment, from
 * the binding it already authorized the write against. A client-supplied
 * value would let a caller file a comment into a publication it had no part
 * in, which is the same class of hole as trusting a query parameter for
 * authorization.
 *
 * ## Resolving it back is allowed to fail
 *
 * A consumer mapping this to a local file resolves by the full identity —
 * team, creator, project, slug and published path — against the CURRENT
 * publication record. Two rules make that safe:
 *
 * - **Ambiguity throws.** If the identity matches more than one record,
 *   something is wrong with the data, and picking one would silently attach
 *   the comment to an arbitrary share.
 * - **Unknown or expired answers null.** There is no fallback to "whatever is
 *   published now" — that fallback is exactly how a stopped share's late
 *   comment ends up on a live one.
 */
export interface PublicCommentPublicationIdentity {
  /** The stable alias of the publication this comment was written against. */
  publicationSlug: string;
}

/**
 * Set on the downstream comment payload by the accepting server, never by a
 * client, and never inferred by a consumer from what is currently live.
 */
export const PUBLIC_COMMENT_PUBLICATION_SLUG_IS_SERVER_ASSERTED = true;

/* ------------------------------------------------------------------ *
 * Sync cadence
 * ------------------------------------------------------------------ */

/**
 * Three different intervals, for three different operations.
 *
 * They were repeatedly read as one contested number. They are not: two are
 * downstream pulls on different surfaces, and the third is the upstream relay
 * going the other way.
 */
export const SHARE_SYNC_INTERVALS_MS = {
  /**
   * Share page → server, for comments and share version. 30s (D113 Q2,
   * product-set; the earlier 5s and D80's 10s are both void). Polling STOPS
   * while the page is hidden.
   */
  sharePagePoll: 30_000,
  /**
   * OD client fallback poll while SSE is connected. SSE carries the change in
   * practice; this is the floor when it does not. (D80, unaffected by D113.)
   */
  clientFallbackWithSse: 30_000,
  /** OD client poll when SSE is disconnected — the only path left, so faster. */
  clientFallbackWithoutSse: 5_000,
} as const;

/**
 * Sending a comment UP to the cloud may be faster than any of those.
 *
 * Ruled 2026-09-22: the 30s figure is the PAGE REFRESH, and the upward relay
 * is a separate question that may be quicker.
 *
 * No number is frozen here, deliberately. The downstream intervals are
 * budgets — each poll is a request from every open page, so the cost of
 * shortening them scales with viewers. The upward relay fires on an action a
 * person just took: it is bounded by how often people write comments, not by
 * how many pages are open, so the same reasoning does not apply and the
 * ceiling that produced 30s is not the ceiling here.
 *
 * Pick the value from the relay's own constraints — batching, backoff,
 * retry pressure on the API — not by copying a poll interval.
 */
export const SHARE_COMMENT_UPSTREAM_MAY_BE_FASTER_THAN_POLL = true;

/**
 * The link to hand the person, present only when the share actually serves.
 *
 * This is the share PAGE address — `/artifact/{projectId}/{slug}` on the web
 * origin — not the resource API path that loads the file's bytes. Those are
 * different addresses for different purposes, and handing out the second one
 * bypasses the share page entirely: comments, sign-in, error states and the
 * badge all live on the page, and the raw file renders without any of them.
 * It looks like it works, which is why the substitution survives review.
 *
 * ## Absent on `binding_pending`, and that is the point
 *
 * A `binding_pending` publish has content uploaded and the alias advanced,
 * but the binding that makes the link serve was not registered. Returning a
 * URL there would hand the person something to copy and send that answers
 * with nothing. The union carries no `url` in that branch so a caller cannot
 * offer a copy affordance for a link that does not work yet — the retry fills
 * the binding in, and the URL becomes available with it.
 */
export interface SharePublishedLink {
  /** Share page address on the web origin, e.g. `/artifact/{projectId}/{slug}`. */
  url: string;
}

/**
 * The publish HTTP response: the outcome, the receipt, and — only when it
 * serves — the link.
 *
 * Composing them here rather than adding `url` to
 * {@link SharePublishReceipt} keeps the receipt what it is: facts the server
 * confirmed about the upload. The URL is not one of those. It is derived from
 * the web origin plus ids, it exists only in the serving case, and mixing it
 * into the receipt would make `binding_pending` carry a field it must not.
 */
/** Presentation availability is independent of upload/binding success. A missing
 * deployment Web origin must neither abort publication nor guess a hostname in
 * another environment. This is NOT a transport/auth/publish failure: consumers
 * retain the receipt, say "published; link temporarily unavailable", and must
 * not retry the upload merely to obtain a link. Real failures remain non-2xx.
 * Binding can also be pending at the same time; neither condition erases the
 * other. A link is copyable only when a confirmed publication carries `url`.
 */
export interface SharePublishLinkUnavailable {
  status: 'unavailable';
  code: 'PUBLIC_SHARE_WEB_URL_UNAVAILABLE';
}

export type SharePublishResponse =
  | ({ status: 'published'; receipt: SharePublishReceipt; link?: never } & SharePublishedLink)
  | { status: 'published'; receipt: SharePublishReceipt; url?: never; link: SharePublishLinkUnavailable }
  | { status: 'binding_pending'; receipt: SharePublishReceipt; binding: SharePublishBindingPending; link?: SharePublishLinkUnavailable };

/**
 * Has this project ever been shared — as opposed to being shared right now?
 *
 * Derived from the BINDING, not from the local publication row.
 *
 * ## Why the local row cannot answer it
 *
 * Stopping a share deletes the daemon's publication record: that row is a
 * cache of "what we last published", and once the share is stopped there is
 * nothing being served for it to describe. So locally, `stopped` and
 * `never shared` look identical — both are an absent row.
 *
 * The binding is the opposite: stop sets it to `stopped` rather than removing
 * it, precisely so the same slug can resume. A binding that exists in ANY
 * status is therefore proof the project was shared at some point, and that is
 * the only place that proof lives.
 *
 * ## What must not stand in for it
 *
 * - **An empty publication list** — that is the stopped case as well as the
 *   never case.
 * - **An absent or empty share URL** — same collapse, one layer up.
 * - **`status === 'none'`** — `none` means "no share is active", which is
 *   true of a stopped share too.
 *
 * Each of those reads "stopped" as "never", and every feature built on that
 * reading will re-offer a first-time experience to someone who already shared
 * this project and deliberately stopped.
 *
 * ## No new field
 *
 * This is a question answered by data that already exists. A separate
 * `hasEverShared` column would be a second truth to keep in sync with the
 * binding, and the two would disagree the first time one of them was written
 * without the other.
 */
export function hasEverShared(input: { bindingExists: boolean }): boolean {
  return input.bindingExists;
}

/* ------------------------------------------------------------------ *
 * Comment sync state
 * ------------------------------------------------------------------ */

/**
 * What the client can say about comment syncing, so the banners have an input.
 *
 * Today the outbox is daemon-internal — `CommentRelayOutboxStore.count()` has
 * no way out — so the UI has nothing to render K8/K3/K5/K2 from. That is why
 * those states are unbuildable rather than merely unbuilt: nobody can draw a
 * condition the system never computes.
 *
 * Shape follows the Lane-4 board's S-4 draft. The invariants below are the
 * part that is easy to get wrong.
 */
export interface CommentSyncState {
  /** Outbox entries not yet sent. */
  pending: number;
  /** Last failure, sanitized for display. See the rules below. */
  lastError: string | null;
  /** K8. A CONJUNCTION — see below. */
  sessionMissing: boolean;
  /**
   * K3. Distinct from never-shared, and `null` when it could not be read.
   *
   * This field was a required boolean and that was wrong: the authoritative
   * answer lives on the cloud binding, and a 404, an auth failure, a network
   * error or an unusable projection each leave the client with no answer at
   * all. A boolean forces one of those to be spelled `false` — "the share is
   * not stopped" — which is a confident claim about something that was never
   * read, and the banner it drives would be absent for a share that really
   * had been stopped.
   *
   * So `null` means undeterminable, and it is not `false`.
   */
  shareStopped: boolean | null;
  /**
   * K2. Backfill of the comments that already existed when a file was
   * published. Absent means NOT ATTEMPTED — never "succeeded", and it is
   * absent whenever the caller did not name a file
   * ({@link COMMENT_BACKFILL_REQUIRES_A_NAMED_FILE}).
   *
   * This is deliberately NOT `lastError`. `lastError` is the ordinary
   * outbox's most recent failure across the whole scope; folding backfill
   * into it would render an unrelated network blip as "the existing comments
   * did not go up", and would let a backfill failure be erased by the next
   * unrelated success.
   */
  backfill?: CommentBackfillState;
  /**
   * Last align result, when one was run.
   *
   * ABSENT MEANS NOT CHECKED — not aligned. See
   * {@link COMMENT_ALIGN_UNKNOWN_AND_ABSENT_ARE_NOT_ALIGNED}.
   */
  align?: CommentAlignResult;
}

/**
 * `sessionMissing` is "needs to sync AND has no session", not "logged out".
 *
 * Someone signed out of a project with nothing to sync is not in a paused
 * state — there is nothing being held back, and telling them sync is paused
 * describes a problem they do not have. The banner exists to explain why
 * something they wrote is not reaching anyone, which is only true when both
 * halves hold.
 *
 * Neither half may be inferred from the other, and neither from a proxy:
 * being logged out, having an empty publication list, or holding no share URL
 * each answer a different question.
 */
export const COMMENT_SYNC_SESSION_MISSING_IS_A_CONJUNCTION = true;

/**
 * `pending > 0` is not a failure, and `lastError` is not a current state.
 *
 * - Entries are pending for a moment on every normal send. A count above zero
 *   means work is queued, not that anything went wrong.
 * - `lastError` records the most recent failure. A later attempt may have
 *   succeeded and left it in place, so it must never be read as "syncing is
 *   broken right now". It is context for a state established by the other
 *   fields, not a state itself.
 *
 * Reading either as failure produces a banner that appears during healthy
 * operation, which trains people to ignore the one that matters.
 */
export const COMMENT_SYNC_PENDING_AND_LAST_ERROR_ARE_NOT_FAILURE_STATES = true;

/**
 * `shareStopped` means a share existed and was stopped — never the absence of
 * one.
 *
 * Same distinction as {@link hasEverShared}: a project that was never shared
 * has no stopped state to report, and rendering K3 for it tells someone their
 * sharing was stopped when they never started.
 */
export const COMMENT_SYNC_STOPPED_IS_NOT_NEVER_SHARED = true;

/**
 * `pending` counts THIS project's queue for THIS principal — never a global
 * total.
 *
 * The outbox holds work for every project the person has open and, on a
 * shared machine, potentially more than one identity. Reporting its raw
 * `count()` would put another project's backlog on this project's banner, and
 * would tell a viewer how much unsent work exists outside what they can see.
 *
 * Scope it the same way every other answer here is scoped, and when the scope
 * cannot be established, report nothing rather than a number that belongs to
 * someone else.
 */
export const COMMENT_SYNC_PENDING_IS_SCOPED_NOT_GLOBAL = true;

/* ------------------------------------------------------------------ *
 * Pushing comments in one request
 * ------------------------------------------------------------------ */

/** `POST /api/v1/collab/projects/:projectId/comments/batch` */
export interface CommentBatchPushRequest {
  /** 1..{@link COMMENT_BATCH_MAX_ITEMS}. */
  comments: ReadonlyArray<{
    /** Caller's handle for this entry, echoed back so results can be matched. */
    key: string;
    comment: unknown;
    idempotencyKey: string;
  }>;
}

export interface CommentBatchPushResponse {
  results: ReadonlyArray<{
    key: string;
    ok: boolean;
    /** Human-readable; never on its own the thing a caller branches on. */
    error?: string;
    errorCode?: string;
    /** HTTP status this entry failed with, completing the failure envelope. */
    status?: number;
  }>;
}

export const COMMENT_BATCH_MAX_ITEMS = 500;

/**
 * Idempotency is per ENTRY, and a partial failure keeps its successes.
 *
 * A batch is a transport convenience, not a unit of work. Rolling the whole
 * thing back because entry 400 failed would discard 399 comments that were
 * accepted, and the retry would re-send all 400 — so the failure rate would
 * have to reach zero before anything landed at all.
 *
 * So each entry carries its own idempotency key and commits on its own. A
 * retry re-sends the batch; entries that already landed are recognised by
 * their key and not duplicated; only the ones that failed are attempted
 * again. The response reports every entry by the caller's `key`, because
 * position is not a reliable identity once retries reorder anything.
 *
 * The call still exits nonzero on partial failure — the caller has work left
 * to do — but the successful results are in the response and must be read
 * rather than discarded with the exit code.
 */
export const COMMENT_BATCH_IS_PER_ITEM_NOT_ATOMIC = true;

/* ------------------------------------------------------------------ *
 * Align: is what we merged still what the cloud has?
 * ------------------------------------------------------------------ */

export const COMMENT_ALIGN_STATES = ['aligned', 'diverged', 'unknown'] as const;
export type CommentAlignState = (typeof COMMENT_ALIGN_STATES)[number];

export const COMMENT_ALIGN_REASONS = [
  /** Events the comparison needed are gone — retention, not disagreement. */
  'history_incomplete',
  /** The cloud's consistency snapshot moved while comparing. */
  'snapshot_changed',
  /** The comparison could not be performed at all. */
  'unavailable',
] as const;
export type CommentAlignReason = (typeof COMMENT_ALIGN_REASONS)[number];

export interface CommentAlignResult {
  state: CommentAlignState;
  /** Required when `state` is `unknown`; explains which way it failed. */
  reason?: CommentAlignReason;
  latestSeq?: number;
}

/**
 * Equal cursors are not equal content.
 *
 * A cursor says how far we have read. It says nothing about whether what we
 * merged matches what is there — a comment can be edited, removed, or have
 * arrived under a filter that skipped it, all without moving the cursor.
 * Comparing cursors and calling the result "aligned" is the cheapest possible
 * check and it answers a different question.
 *
 * Align compares the locally merged projection of cloud comments against the
 * cloud's own consistency snapshot. Anything less is `unknown`.
 */
export const COMMENT_ALIGN_COMPARES_CONTENT_NOT_CURSORS = true;

/**
 * `unknown` is never `aligned`, and an absent align result is never `aligned`
 * either.
 *
 * Retention is the case that makes this concrete: if the events a comparison
 * needed have aged out, the honest answer is `unknown` with
 * `history_incomplete` — not `aligned` (we did not check) and not `diverged`
 * (we found no disagreement). Both substitutions are confident statements
 * about something nobody looked at.
 *
 * On {@link CommentSyncState}, `align` being absent means NOT CHECKED. A
 * consumer that treats missing as aligned turns every un-run comparison into
 * a clean bill of health.
 */
export const COMMENT_ALIGN_UNKNOWN_AND_ABSENT_ARE_NOT_ALIGNED = true;

/**
 * The fields align compares, and nothing else.
 *
 * Both sides of the comparison project a comment down to this shape before
 * anything is compared: the client from its merged local rows, the cloud from
 * replaying its own events. The projection is named here — rather than left
 * as a field list each side maintains — because a comparison whose two sides
 * disagree about WHICH fields count reports a difference of opinion as a
 * difference of content, and does it silently.
 *
 * What is deliberately NOT here:
 *
 * - **Anchor ladder output** (`anchorState`, `anchoredVersion`,
 *   `lastGoodPosition`). These are recomputed locally at render/sync time
 *   against this device's copy of the HTML. The cloud never runs the ladder,
 *   and two devices that rendered at different moments legitimately hold
 *   different values for an identical comment. Comparing them turns "the
 *   anchor was re-resolved here but not there" into `diverged`, which claims
 *   the comment set disagrees when nothing anyone wrote differs.
 * - **`authorDisplayName`**. A captured display snapshot, not content. It
 *   travels on a separate channel from the member directory by design, so an
 *   event written before the field existed normalizes to empty against a
 *   local row that has a name — a divergence about rendering.
 * - **`podMembers`**. Member identity, which align does not compare (see
 *   below); `memberCount` carries the only part that is content.
 * - **Cursors, local routing ids, timestamps, `pinSeq`, `sortKey`,
 *   `conversationId`, member internal ids.** Per
 *   {@link COMMENT_ALIGN_COMPARES_CONTENT_NOT_CURSORS} and because these are
 *   assigned per-device.
 *
 * `authorKind` IS compared: whether a comment came from a member or from a
 * share-link visitor is a fact about the comment, not about its presentation.
 */
export interface CommentAlignProjection {
  id: string;
  filePath: string;
  elementId: string;
  selector: string;
  selectionKind: PreviewCommentSelectionKind;
  label: string;
  text: string;
  htmlHint: string;
  note: string;
  status: PreviewCommentStatus;
  position: CommentAlignBox;
  style: unknown;
  memberCount: number;
  slideIndex: number;
  attachments: ReadonlyArray<CommentAlignAttachment>;
  authorKind: 'member' | 'user';
}

/**
 * Attachments compare by identity and order, never by bytes.
 *
 * The cloud holds the same attachment behind its own storage identity; asking
 * the two sides to agree on content would make align an upload-integrity
 * check, which is a different question with a different failure mode. Order
 * is compared because reordering is an edit the author made.
 */
export interface CommentAlignAttachment {
  id: string;
  name: string;
}

/**
 * Position compares as integers.
 *
 * A bbox crosses the wire as JSON floats and comes back through two different
 * runtimes' parsers. Comparing raw doubles makes align report `diverged` for
 * a comment nobody touched, on a round-trip artifact. Both sides round to
 * whole pixels before comparing; sub-pixel drift is not an edit.
 */
export interface CommentAlignBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Absent optional fields normalize to the daemon's stored default BEFORE
 * comparison, on both sides: empty text to `''`, optional structures to
 * `null`, `selectionKind` to `element`, `authorKind` to `member`,
 * `memberCount` and `slideIndex` to `0`, `attachments` to `[]`.
 *
 * Without a shared normalization rule, "the field was never set" and "the
 * field was set to its default" compare unequal, and every legacy row
 * diverges from its own faithful copy.
 */
export const COMMENT_ALIGN_NORMALIZES_ABSENT_TO_STORED_DEFAULT = true;

export interface CommentAlignRequest {
  /**
   * The complete set of currently-undeleted comments the client has ALREADY
   * merged, for the whole project — both `member` and `user` authors, and
   * regardless of `status`.
   *
   * "Already merged" is the load-bearing part. Echoing a pull response back
   * compares the cloud against itself and always reports `aligned`: it proves
   * the transport round-tripped, not that the merge landed. What align exists
   * to catch is precisely a merge that dropped, filtered, or mangled a record
   * the transport delivered correctly.
   *
   * Complete is equally load-bearing: a filtered subset can only ever show
   * comments the client kept, so a record it wrongly discarded is invisible
   * to the comparison that exists to find it.
   */
  comments: ReadonlyArray<CommentAlignProjection>;
  /**
   * Guard against the cloud's snapshot moving mid-comparison. A mismatch is
   * `unknown` / `snapshot_changed` — never `diverged`, because a moving
   * target was never compared.
   */
  expectedLatestSeq: number;
}

/**
 * The cloud must prove its event history is continuous before it may answer
 * `aligned`.
 *
 * Replaying a history with a hole and finding the surviving rows equal is not
 * evidence of agreement — the missing events are exactly the ones that would
 * have disagreed. A gap is `unknown` / `history_incomplete`.
 */
export const COMMENT_ALIGN_REQUIRES_PROVEN_CONTINUOUS_HISTORY = true;

/**
 * Align is a read. It never resumes a stopped share, re-enqueues an outbox,
 * advances a cursor, or writes a tombstone — a diagnostic that repairs what
 * it measures can no longer report what was wrong.
 */
export const COMMENT_ALIGN_HAS_NO_SIDE_EFFECTS = true;

/* ------------------------------------------------------------------ *
 * Backfill: did the comments that predate the publish make it up?
 * ------------------------------------------------------------------ */

export const COMMENT_BACKFILL_STATES = ['pending', 'succeeded', 'failed'] as const;
export type CommentBackfillStateValue = (typeof COMMENT_BACKFILL_STATES)[number];

/**
 * Backfill is bound to ONE publish, and says so.
 *
 * ## Why `generation` is required rather than convenient
 *
 * A backfill failure describes the publish that triggered it and nothing
 * else. Without the generation, a failure recorded for an earlier publish
 * outlives the event it described: the owner republishes, the new backfill
 * succeeds, and the banner from two publishes ago is still on screen asking
 * them to retry something that no longer exists. The consumer therefore
 * COMPARES this against the publication's current generation and ignores a
 * stale one — it does not simply render the newest record it was handed.
 *
 * It follows that a success at generation N clears a failure at generation
 * N-1 by superseding it, not by anyone remembering to delete it.
 *
 * ## Publish succeeded AND backfill failed is a normal pair
 *
 * These are two facts about one action, not two possible outcomes of it. The
 * link works, it is safe to copy, and the visitor will see new comments — the
 * comments that predate the publish are what is missing. Copy that says
 * sharing failed is wrong, and disabling the share or copy-link control
 * because of this state is wrong: it takes away a capability that works, over
 * a different capability that did not.
 *
 * ## `retryable` is the difference between a notice and an alarm
 *
 * The same rule as {@link ProjectDeleteShareResidual.retrying}: `true` means
 * something will keep trying and the person needs to know, not to act;
 * `false` means nothing further happens on its own. Collapsing them produces
 * a frightening banner for a self-healing case, or a calm one for a case
 * that needs a person.
 */
export interface CommentBackfillState {
  state: CommentBackfillStateValue;
  /**
   * Which file this result is about. Backfill is per FILE, like the
   * publications it follows — a project with three published files has three
   * independent backfill outcomes, and the newest of them is not "the
   * project's".
   */
  filePath: string;
  /**
   * The publication revision this result describes, as an OPAQUE TOKEN.
   *
   * This was specified as a number and that was wrong: what the publish path
   * actually carries is a revision token, not a counter. A numeric field
   * forces the producer either to invent an ordering the system does not have,
   * or to send a token cast to a number — and a consumer that then writes
   * `record.generation < current` gets an answer from a comparison that never
   * meant anything.
   *
   * So it is a string and it is compared for EQUALITY only. "Stale" means
   * "not the revision this file is published at now", never "smaller".
   */
  publicationRevision: string;
  /** Whether anything will retry on its own. Meaningful when `state` is `failed`. */
  retryable: boolean;
  /** Machine-readable cause, when the producer recorded one. */
  code?: string;
}

/**
 * An absent `backfill` means nobody ran one, exactly as an absent `align`
 * means nobody compared. Rendering "existing comments are up to date" from a
 * field that was never populated is the same mistake as reporting `aligned`
 * for a comparison that never happened.
 */
export const COMMENT_BACKFILL_ABSENT_IS_NOT_SUCCESS = true;

/**
 * A backfill result whose `publicationRevision` is not the file's current one
 * must not be rendered at all — not as a warning, and not as a success.
 *
 * The test is equality, not ordering: the revision is a token, and asking
 * whether one token is "older" than another is a question it cannot answer.
 */
export const COMMENT_BACKFILL_STALE_REVISION_IS_NOT_RENDERED = true;

/**
 * `backfill` is present ONLY when the caller named a file.
 *
 * A project-scoped read has no file to be about, and the tempting fallback —
 * return the most recent backfill record in the project — answers a question
 * nobody asked: it presents one file's outcome as though it described the
 * file the user is looking at. Publishing file B successfully would then
 * clear the failure banner for file A, which still has not been backfilled.
 *
 * So: no `filePath` in the request means no `backfill` in the response, and
 * absent still means NOT ATTEMPTED rather than succeeded.
 */
export const COMMENT_BACKFILL_REQUIRES_A_NAMED_FILE = true;


