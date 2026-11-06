// Invitee client state machine + local storage (C lane).
//
// Pure, injectable logic behind the invite acceptance page:
//   - persist / read / clear the pending continuation (retry the desktop
//     hand-off when signed out, not installed, or after a failed open)
//   - derive a LocalWorkspaceActivation from the accept response
//   - the account-mismatch judgement (current signed-in email vs the masked
//     invited email)
//   - re-export the contract-owned deeplink parse/build helpers
//
// The DTO shapes live in `@open-design/contracts` (workspace-invites.ts); this
// module owns only the client-side behavior so the component stays thin and the
// logic stays unit-testable. The raw invite token is NEVER persisted here — the
// pending continuation carries a single-use nonce, not the token.

import type {
  LocalPendingInviteContinuation,
  LocalPendingInviteContinuationStatus,
  LocalWorkspaceActivation,
  WorkspaceCollabContext,
  WorkspaceInviteAcceptResponse,
} from '@open-design/contracts';
import { buildInviteDeeplink, parseInviteDeeplink } from '@open-design/contracts';

export { buildInviteDeeplink, parseInviteDeeplink };
export type {
  InviteDeeplinkPayload,
  LocalPendingInviteContinuation,
  LocalPendingInviteContinuationStatus,
  LocalWorkspaceActivation,
} from '@open-design/contracts';

/** The minimal storage surface the continuation store needs (localStorage-compatible). */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const PENDING_INVITE_CONTINUATION_KEY = 'od.collab.pendingInviteContinuation';
export const WORKSPACE_ACTIVATION_KEY = 'od.collab.workspaceActivation';

/** Resolve the browser localStorage, or null when it is unavailable/denied. */
export function defaultInviteStorage(): KeyValueStorage | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    // Access can throw in a sandboxed / privacy-locked context.
  }
  return null;
}

const CONTINUATION_STATUSES: ReadonlySet<LocalPendingInviteContinuationStatus> = new Set([
  'pending',
  'opened',
  'failed',
]);

function coercePendingContinuation(value: unknown): LocalPendingInviteContinuation | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (
    typeof v.nonce !== 'string' ||
    typeof v.inviteId !== 'string' ||
    typeof v.workspaceId !== 'string' ||
    typeof v.workspaceMemberId !== 'string' ||
    typeof v.deeplinkUrl !== 'string' ||
    typeof v.expiresAt !== 'number' ||
    typeof v.status !== 'string' ||
    !CONTINUATION_STATUSES.has(v.status as LocalPendingInviteContinuationStatus)
  ) {
    return null;
  }
  const entry: LocalPendingInviteContinuation = {
    nonce: v.nonce,
    inviteId: v.inviteId,
    workspaceId: v.workspaceId,
    workspaceMemberId: v.workspaceMemberId,
    deeplinkUrl: v.deeplinkUrl,
    expiresAt: v.expiresAt,
    status: v.status as LocalPendingInviteContinuationStatus,
  };
  if (typeof v.lastAttemptAt === 'number') entry.lastAttemptAt = v.lastAttemptAt;
  return entry;
}

/**
 * Read the pending continuation, or null when there is none, it is malformed,
 * or it has expired. A malformed or expired entry is removed as a side effect
 * so the store self-heals.
 */
export function readPendingInviteContinuation(
  storage: KeyValueStorage | null = defaultInviteStorage(),
  now: number = Date.now(),
): LocalPendingInviteContinuation | null {
  if (!storage) return null;
  const raw = storage.getItem(PENDING_INVITE_CONTINUATION_KEY);
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    storage.removeItem(PENDING_INVITE_CONTINUATION_KEY);
    return null;
  }
  const entry = coercePendingContinuation(parsed);
  if (!entry) {
    storage.removeItem(PENDING_INVITE_CONTINUATION_KEY);
    return null;
  }
  if (entry.expiresAt <= now) {
    storage.removeItem(PENDING_INVITE_CONTINUATION_KEY);
    return null;
  }
  return entry;
}

/** Persist the pending continuation, replacing any prior one (single slot). */
export function writePendingInviteContinuation(
  entry: LocalPendingInviteContinuation,
  storage: KeyValueStorage | null = defaultInviteStorage(),
): void {
  storage?.setItem(PENDING_INVITE_CONTINUATION_KEY, JSON.stringify(entry));
}

/** Clear the pending continuation (on success, expiry, or replacement). */
export function clearPendingInviteContinuation(
  storage: KeyValueStorage | null = defaultInviteStorage(),
): void {
  storage?.removeItem(PENDING_INVITE_CONTINUATION_KEY);
}

/**
 * Update the stored continuation's delivery status (and stamp the attempt
 * time). Returns the updated entry, or null when there is no live entry.
 */
export function markPendingInviteContinuation(
  status: LocalPendingInviteContinuationStatus,
  attemptedAt: number = Date.now(),
  storage: KeyValueStorage | null = defaultInviteStorage(),
): LocalPendingInviteContinuation | null {
  const current = readPendingInviteContinuation(storage, attemptedAt);
  if (!current) return null;
  const next: LocalPendingInviteContinuation = { ...current, status, lastAttemptAt: attemptedAt };
  writePendingInviteContinuation(next, storage);
  return next;
}

/**
 * Derive the pending continuation to persist from a successful accept response.
 * Status starts at `pending`; only the nonce (never the raw token) is carried.
 */
export function pendingContinuationFromAccept(
  response: WorkspaceInviteAcceptResponse,
): LocalPendingInviteContinuation {
  return {
    nonce: response.continuation.nonce,
    inviteId: response.inviteId,
    workspaceId: response.workspaceId,
    workspaceMemberId: response.workspaceMemberId,
    expiresAt: response.continuation.expiresAt,
    deeplinkUrl: response.continuation.deeplinkUrl,
    status: 'pending',
  };
}

/**
 * Derive the local workspace activation from the accept response's freshly
 * activated `currentWorkspaceContext`. Role / member status / lifecycle are
 * taken verbatim — never re-derived — so C never drifts from B's facts.
 */
export function deriveWorkspaceActivation(
  ctx: WorkspaceCollabContext,
  activatedAt: number = Date.now(),
): LocalWorkspaceActivation {
  return {
    workspaceId: ctx.workspaceId,
    workspaceMemberId: ctx.workspaceMemberId,
    role: ctx.role,
    memberStatus: ctx.memberStatus,
    lifecycleState: ctx.lifecycleState,
    activatedAt,
  };
}

function coerceActivation(value: unknown): LocalWorkspaceActivation | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (
    typeof v.workspaceId !== 'string' ||
    typeof v.workspaceMemberId !== 'string' ||
    typeof v.role !== 'string' ||
    typeof v.memberStatus !== 'string' ||
    typeof v.lifecycleState !== 'string' ||
    typeof v.activatedAt !== 'number'
  ) {
    return null;
  }
  return {
    workspaceId: v.workspaceId,
    workspaceMemberId: v.workspaceMemberId,
    role: v.role as LocalWorkspaceActivation['role'],
    memberStatus: v.memberStatus as LocalWorkspaceActivation['memberStatus'],
    lifecycleState: v.lifecycleState as LocalWorkspaceActivation['lifecycleState'],
    activatedAt: v.activatedAt,
  };
}

/** Persist the derived activation. */
export function writeWorkspaceActivation(
  activation: LocalWorkspaceActivation,
  storage: KeyValueStorage | null = defaultInviteStorage(),
): void {
  storage?.setItem(WORKSPACE_ACTIVATION_KEY, JSON.stringify(activation));
}

/** Read the persisted activation, or null when absent/malformed. */
export function readWorkspaceActivation(
  storage: KeyValueStorage | null = defaultInviteStorage(),
): LocalWorkspaceActivation | null {
  if (!storage) return null;
  const raw = storage.getItem(WORKSPACE_ACTIVATION_KEY);
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    storage.removeItem(WORKSPACE_ACTIVATION_KEY);
    return null;
  }
  const entry = coerceActivation(parsed);
  if (!entry) {
    storage.removeItem(WORKSPACE_ACTIVATION_KEY);
    return null;
  }
  return entry;
}

// —— Account-mismatch judgement ——————————————————————————————————————————

/** Result of comparing the signed-in account against the invited email. */
export type AccountMatch = 'match' | 'mismatch' | 'unknown';

// Characters B may use to mask the invited email (`j***@` / `j•••@` / `j···@`).
const MASK_CHARS = /[*•·]/;
const VISIBLE_LEAD = /^[^*•·]+/;
const VISIBLE_TRAIL = /[^*•·]+$/;

/**
 * Decide whether the currently signed-in account is the one the invite was
 * sent to, given only the masked invited email (`j***@company.com`).
 *
 * - `unknown` — no signed-in email, or an unparseable masked email. The UI
 *   must not assert a mismatch it cannot prove.
 * - `mismatch` — domains differ, or a visible (unmasked) segment of the local
 *   part does not line up with the current local part.
 * - `match` — domain matches and every visible segment lines up.
 *
 * This is a tolerant heuristic: B owns the true mask algorithm, so the check
 * only ever fires a mismatch it is confident about; ambiguous cases resolve to
 * `match` (domain-only) or `unknown`.
 */
export function evaluateAccountMatch(
  currentEmail: string | null | undefined,
  invitedEmailMasked: string,
): AccountMatch {
  const current = (currentEmail ?? '').trim().toLowerCase();
  const currentAt = current.lastIndexOf('@');
  if (currentAt <= 0 || currentAt >= current.length - 1) return 'unknown';
  const currentLocal = current.slice(0, currentAt);
  const currentDomain = current.slice(currentAt + 1);

  const masked = invitedEmailMasked.trim().toLowerCase();
  const maskedAt = masked.lastIndexOf('@');
  if (maskedAt <= 0 || maskedAt >= masked.length - 1) return 'unknown';
  const maskedLocal = masked.slice(0, maskedAt);
  const maskedDomain = masked.slice(maskedAt + 1);

  if (currentDomain !== maskedDomain) return 'mismatch';

  // No mask characters: the local part is fully visible → require an exact match.
  if (!MASK_CHARS.test(maskedLocal)) {
    return currentLocal === maskedLocal ? 'match' : 'mismatch';
  }

  const visibleLead = maskedLocal.match(VISIBLE_LEAD)?.[0] ?? '';
  const visibleTrail = maskedLocal.match(VISIBLE_TRAIL)?.[0] ?? '';

  if (visibleLead && !currentLocal.startsWith(visibleLead)) return 'mismatch';
  if (visibleTrail && visibleTrail !== visibleLead && !currentLocal.endsWith(visibleTrail)) {
    return 'mismatch';
  }
  return 'match';
}
