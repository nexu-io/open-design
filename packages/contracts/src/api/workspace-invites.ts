import type {
  CollabMemberRole,
  WorkspaceCollabContext,
  WorkspaceLifecycleState,
  WorkspaceMemberStatus,
} from './collab.js';

// Workspace-invite acceptance contract (the invitee client flow).
//
//   invite email link → web acceptance page → POST accept → continuation
//     → deeplink hands the activated membership to the desktop client.
//
// B (identity/membership) owns the server facts (preview + accept). C (this
// lane) owns the client flow: preview render, accept call, the local pending
// continuation, workspace activation, and the deeplink hand-off. This module is
// the single source of truth for the shapes both lanes speak, plus the pure
// deeplink parse/build helpers. Role and lifecycle enums are REUSED from
// `collab.ts` — never re-declared here — so the two lanes cannot drift.

/** Lifecycle status of a workspace invite (B's server fact). */
export type WorkspaceInviteStatus = 'pending' | 'accepted' | 'declined' | 'revoked' | 'expired';

/**
 * The role an invite can grant. An invite never creates an owner, so this is a
 * narrowing of the shared {@link CollabMemberRole} — not a new enum.
 */
export type WorkspaceInviteRole = Extract<CollabMemberRole, 'admin' | 'member'>;

/**
 * Safe, user-actionable invite-create failures that may cross the B → daemon
 * → web boundary. The daemon must keep every other upstream body detail
 * private and fall back to its transport-shaped `create_<status>` error.
 */
export const WORKSPACE_INVITE_CREATE_ERROR_CODES = [
  'already_member',
  'active_pending_invite',
  'workspace_seat_limit_reached',
  'workspace_subscription_seat_allocation_unavailable',
] as const;

export type WorkspaceInviteCreateErrorCode =
  (typeof WORKSPACE_INVITE_CREATE_ERROR_CODES)[number];

const WORKSPACE_INVITE_CREATE_ERROR_ALIASES: Readonly<
  Record<string, WorkspaceInviteCreateErrorCode>
> = {
  already_member: 'already_member',
  // B's wire code for "this address is already an ACTIVE member of the
  // workspace". Its create path resolves the email hash against the member
  // table before minting an invite and rejects with 409
  // `{"error":"invite_existing_member"}` — no seat is consumed. Without this
  // alias the code fell through to the transport-shaped `create_409`, and the
  // dialog told the user to "try again later" for a conflict that retrying can
  // never resolve.
  invite_existing_member: 'already_member',
  active_pending_invite: 'active_pending_invite',
  invite_duplicate: 'active_pending_invite',
  workspace_seat_limit_reached: 'workspace_seat_limit_reached',
  workspace_subscription_seat_allocation_unavailable:
    'workspace_subscription_seat_allocation_unavailable',
};

/**
 * Normalize only explicitly allowlisted B codes. In particular, HTTP 409 by
 * itself never implies a duplicate: it can also mean no seat, a locked
 * subscription, or another conflict the client does not understand yet.
 */
export function normalizeWorkspaceInviteCreateErrorCode(
  value: unknown,
): WorkspaceInviteCreateErrorCode | null {
  return typeof value === 'string'
    ? WORKSPACE_INVITE_CREATE_ERROR_ALIASES[value] ?? null
    : null;
}

/** The custom URL scheme the desktop client registers for continuation deeplinks. */
export const INVITE_DEEPLINK_SCHEME = 'opendesign' as const;
export type InviteDeeplinkScheme = typeof INVITE_DEEPLINK_SCHEME;

/** Fixed authority + path of a continuation deeplink: `opendesign://workspace/invite/continue`. */
export const INVITE_DEEPLINK_PATH = 'workspace/invite/continue' as const;

/** Client capability + install hints B returns with a preview. */
export interface WorkspaceInviteClientHints {
  /** The scheme the web page should attempt to open (always {@link INVITE_DEEPLINK_SCHEME}). */
  preferredDesktopScheme: InviteDeeplinkScheme;
  /** Where to send a user who does not have the desktop client installed. */
  downloadUrl: string;
}

/**
 * GET /api/v1/workspace-invites/:token — a side-effect-free preview of the
 * invite. Rendered on the acceptance landing page before the user accepts.
 * `invitedEmailMasked` is always masked (`j***@company.com`); the raw address
 * never crosses the wire.
 */
export interface WorkspaceInvitePreviewResponse {
  inviteId: string;
  workspaceId: string;
  workspaceName: string;
  invitedEmailMasked: string;
  role: WorkspaceInviteRole;
  status: WorkspaceInviteStatus;
  /** Epoch ms at which the invite expires. */
  expiresAt: number;
  clientHints: WorkspaceInviteClientHints;
}

/** Client capabilities the web page reports at accept time (optional hints for B). */
export interface WorkspaceInviteAcceptClient {
  platform?: string;
  appVersion?: string;
  canOpenDesktop?: boolean;
}

/** POST /api/v1/workspace-invites/:token/accept request body. */
export interface WorkspaceInviteAcceptRequest {
  /**
   * Set when the signed-in account's email differs from the invited email and
   * the user chose to join with the current account anyway. B must only consume
   * the invite once the account choice is explicit.
   */
  continueWithCurrentAccount?: boolean;
  client?: WorkspaceInviteAcceptClient;
}

/**
 * The continuation B mints on a successful accept: the signed deeplink that
 * hands the activated membership to the desktop client, its expiry, and a
 * download fallback. `nonce` is a single-use continuation secret — it is NOT
 * the raw invite token. C persists nonce/deeplink only; the raw token stays in
 * the URL and is never written to storage.
 */
export interface WorkspaceInviteContinuation {
  nonce: string;
  deeplinkUrl: string;
  /** Epoch ms at which the continuation (and its deeplink) expires. */
  expiresAt: number;
  fallbackDownloadUrl: string;
}

/** POST /api/v1/workspace-invites/:token/accept — success response. */
export interface WorkspaceInviteAcceptResponse {
  workspaceId: string;
  workspaceMemberId: string;
  memberId: string;
  inviteId: string;
  role: CollabMemberRole;
  lifecycleState: WorkspaceLifecycleState;
  continuation: WorkspaceInviteContinuation;
  /** The freshly-activated workspace context — the source for {@link LocalWorkspaceActivation}. */
  currentWorkspaceContext: WorkspaceCollabContext;
}

// —— Invite creation (the inviter/host flow) ——————————————————————————————
// The team switcher's "邀请同事" dialog collects one or more { email, role }
// pairs and POSTs them to the daemon (`POST /api/workspace/invite`), which
// creates each invite on B with the signed-in vela session. Roles narrow to the
// assignable set (never owner), reusing {@link WorkspaceInviteRole}.

/** One invited teammate: an email plus the role to grant (never owner). */
export interface WorkspaceInviteCreateItem {
  email: string;
  role: WorkspaceInviteRole;
}

/**
 * POST /api/workspace/invite request body. The dialog submits one or more
 * teammates in a single call; the daemon creates each invite independently, so
 * a partial success is possible.
 */
export interface WorkspaceInviteCreateRequest {
  invites: WorkspaceInviteCreateItem[];
}

/** Per-invite outcome the daemon reports back for one submitted email. */
export interface WorkspaceInviteCreateResult {
  email: string;
  ok: boolean;
  /** B's created invite id, present when ok === true. */
  inviteId?: string;
  /**
   * Stable failure code when ok === false — mirrors the daemon helper's typed
   * outcomes (`create_<status>` for B's HTTP errors, `create_unreachable` for a
   * transport failure). Never thrown into the client.
   */
  error?: string;
}

/** POST /api/workspace/invite success response — one result per submitted email. */
export interface WorkspaceInviteCreateResponse {
  results: WorkspaceInviteCreateResult[];
}

// —— Local (client-owned) storage shapes ————————————————————————————————
// These live on the invitee's device, not on the wire. C persists a pending
// continuation while the invite is accepted-but-not-yet-handed-off (signed out,
// desktop not installed, or an open attempt failed) and a workspace activation
// once the continuation is validated. Neither shape carries the raw invite
// token.

/** Delivery status of a locally-held continuation. */
export type LocalPendingInviteContinuationStatus = 'pending' | 'opened' | 'failed';

/**
 * A continuation held locally so the hand-off can be retried — kept when the
 * user is signed out, the desktop client isn't installed yet, or an open
 * attempt failed. Cleared on success, on expiry, or when replaced by a newer
 * continuation.
 */
export interface LocalPendingInviteContinuation {
  nonce: string;
  inviteId: string;
  workspaceId: string;
  workspaceMemberId: string;
  /** Epoch ms at which the continuation expires. */
  expiresAt: number;
  deeplinkUrl: string;
  status: LocalPendingInviteContinuationStatus;
  /** Epoch ms of the most recent open attempt, if any. */
  lastAttemptAt?: number;
}

/**
 * The activated membership persisted after the continuation validates, derived
 * from the accept response's `currentWorkspaceContext`. Role, member status,
 * and lifecycle reuse the shared collab enums.
 */
export interface LocalWorkspaceActivation {
  workspaceId: string;
  workspaceMemberId: string;
  role: CollabMemberRole;
  memberStatus: WorkspaceMemberStatus;
  lifecycleState: WorkspaceLifecycleState;
  /** Epoch ms at which the activation was recorded. */
  activatedAt: number;
}

// —— Invite error codes ——————————————————————————————————————————————————
// B's accept/preview failure facts. C maps these to localized copy and decides
// whether the flow is recoverable (e.g. retry) or terminal.

export const WORKSPACE_INVITE_ERROR_CODES = [
  'invite_expired',
  'invite_consumed',
  'workspace_seat_limit_reached',
  'workspace_subscription_locked',
  'workspace_not_found',
  'workspace_forbidden',
] as const;

export type WorkspaceInviteErrorCode = (typeof WORKSPACE_INVITE_ERROR_CODES)[number];

/** The HTTP status each invite error maps to (B's contract). */
export const WORKSPACE_INVITE_ERROR_STATUS: Record<WorkspaceInviteErrorCode, number> = {
  invite_expired: 410,
  invite_consumed: 409,
  workspace_seat_limit_reached: 409,
  workspace_subscription_locked: 409,
  workspace_not_found: 404,
  workspace_forbidden: 403,
};

export function isWorkspaceInviteErrorCode(value: unknown): value is WorkspaceInviteErrorCode {
  return (
    typeof value === 'string' &&
    (WORKSPACE_INVITE_ERROR_CODES as readonly string[]).includes(value)
  );
}

/**
 * Classify a failed invite response into a stable code the UI switches on.
 * Prefers the body's explicit code (the only way to tell the two 409 variants
 * apart); otherwise infers from the HTTP status. A bare 409 with no body code
 * falls back to `invite_consumed`, the most common consume conflict. Returns
 * null when the status/code pair is not a recognized invite failure.
 */
export function resolveWorkspaceInviteError(input: {
  status: number;
  code?: string | null;
}): WorkspaceInviteErrorCode | null {
  if (isWorkspaceInviteErrorCode(input.code)) return input.code;
  switch (input.status) {
    case 410:
      return 'invite_expired';
    case 404:
      return 'workspace_not_found';
    case 403:
      return 'workspace_forbidden';
    case 409:
      return 'invite_consumed';
    default:
      return null;
  }
}

// —— Deeplink parse / build ——————————————————————————————————————————————
// The continuation deeplink is the hand-off payload the desktop client
// consumes. It MUST always carry these four fields; a partial payload cannot
// activate a membership, so `parseInviteDeeplink` rejects it.

/** The four fields every continuation deeplink carries. */
export interface InviteDeeplinkPayload {
  workspaceId: string;
  memberId: string;
  inviteId: string;
  nonce: string;
}

/**
 * Build the canonical continuation deeplink:
 *   `opendesign://workspace/invite/continue?workspace_id=..&member_id=..&invite_id=..&nonce=..`
 *
 * In production B mints `deeplinkUrl` directly; this is the symmetric
 * constructor used for the fallback path and round-trip tests.
 */
export function buildInviteDeeplink(payload: InviteDeeplinkPayload): string {
  const params = new URLSearchParams({
    workspace_id: payload.workspaceId,
    member_id: payload.memberId,
    invite_id: payload.inviteId,
    nonce: payload.nonce,
  });
  return `${INVITE_DEEPLINK_SCHEME}://${INVITE_DEEPLINK_PATH}?${params.toString()}`;
}

/**
 * Parse a continuation deeplink back into its payload, or null when the URL is
 * not a well-formed invite continuation link: wrong scheme, wrong authority /
 * path, or any of the four required fields missing or empty. Extra query
 * params (e.g. a signature B appends) are ignored, not rejected.
 */
export function parseInviteDeeplink(url: string): InviteDeeplinkPayload | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== `${INVITE_DEEPLINK_SCHEME}:`) return null;
  // Non-special scheme: `opendesign://workspace/invite/continue` parses to
  // host='workspace', pathname='/invite/continue'. Recombine and strip any
  // trailing slash before comparing to the fixed authority+path.
  const path = `${parsed.host}${parsed.pathname}`.replace(/\/+$/, '');
  if (path !== INVITE_DEEPLINK_PATH) return null;
  const workspaceId = parsed.searchParams.get('workspace_id')?.trim() ?? '';
  const memberId = parsed.searchParams.get('member_id')?.trim() ?? '';
  const inviteId = parsed.searchParams.get('invite_id')?.trim() ?? '';
  const nonce = parsed.searchParams.get('nonce')?.trim() ?? '';
  if (!workspaceId || !memberId || !inviteId || !nonce) return null;
  return { workspaceId, memberId, inviteId, nonce };
}
