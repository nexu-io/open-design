// Cross-device sync digest: B's cheap "did anything change?" probe.
//
// `GET /api/v1/collab/sync-digest` answers with four OPAQUE tokens. They are
// comparison keys, NOT timestamps and NOT versions:
//
//   catalogToken / membersToken  `max(updated_at)::text || ':' || count(*)`
//   contextToken                 the workspace row's `updated_at`
//   billingToken                 the subscription row's `updated_at`, or the
//                                empty string when there is no subscription row
//
// The only legal operation on a token is `===` against a token we stored
// earlier. Never parse one, never read it as a date, never ask which of two is
// newer — the `count(*)` term exists precisely so a hard delete moves the token
// without moving any timestamp, and that makes ordering meaningless. Empty
// tables produce values like `'0:0'` / `'0'`, so a token is never SQL null.
//
// Only the `vela` workspace-context source has a hub to ask, so a dev daemon
// pointed at anything else resolves to null rather than dialing production —
// the same gate `startHubEventsSubscriber`'s endpoint resolver uses.

import { readVelaControlApiContext } from '../integrations/vela.js';

/** The two faces whose payloads are big enough (and change rarely enough) to be
 *  worth reusing from a local snapshot. Workspace context and billing are
 *  deliberately absent: they are cheap and must always read live. */
export type SyncDigestFace = 'catalog' | 'members';

export interface SyncDigest {
  catalogToken: string;
  membersToken: string;
  contextToken: string;
  billingToken: string;
}

/**
 * One digest read, carried together with the identity it was read under.
 *
 * Account + workspace travel WITH the tokens on purpose: a snapshot keyed by a
 * different account than the token it is compared against would let one signed-
 * in user read another's cached data. Keeping them in one object makes that
 * mismatch unrepresentable.
 */
export interface SyncDigestReading {
  /** Vela user id — the account half of the snapshot key. Never empty. */
  accountId: string;
  /** Active workspace id — the workspace half of the snapshot key. Never empty. */
  workspaceId: string;
  digest: SyncDigest;
}

export type SyncDigestReader = () => Promise<SyncDigestReading | null>;

export interface SyncDigestReaderOptions {
  env?: NodeJS.ProcessEnv;
  getWorkspaceId: () => string | null | undefined;
  fetchImpl?: typeof fetch;
  /** Injectable session read for tests; defaults to the vela control-key session. */
  readSession?: typeof readVelaControlApiContext;
  /** Abort a hung digest so it can never outlast the real fetch it is saving. */
  timeoutMs?: number;
  /** How long to stop asking after the endpoint failed to answer. */
  failureCooldownMs?: number;
  now?: () => number;
  onError?: (error: unknown) => void;
}

// The digest exists to REPLACE a slow read, so it must never become a slow read
// itself. Two seconds is already longer than the query it stands in for.
const DEFAULT_TIMEOUT_MS = 2_000;
// After a failure — transport error, 5xx, or a 404 because this B deployment
// predates the endpoint — asking again on the very next read would add a round
// trip to every catalog and member load for nothing. Park briefly instead; the
// caller degrades to a real fetch either way.
const DEFAULT_FAILURE_COOLDOWN_MS = 60_000;

/** Pick the token that governs one face. */
export function tokenForFace(digest: SyncDigest, face: SyncDigestFace): string {
  return face === 'catalog' ? digest.catalogToken : digest.membersToken;
}

/**
 * Validate a digest response body.
 *
 * All four fields must be present and be strings. `billingToken` is allowed to
 * be empty (no subscription row); the others are not validated for content
 * because their content is opaque by contract.
 */
export function parseSyncDigest(value: unknown): SyncDigest | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const { catalogToken, membersToken, contextToken, billingToken } = record;
  if (
    typeof catalogToken !== 'string' ||
    typeof membersToken !== 'string' ||
    typeof contextToken !== 'string' ||
    typeof billingToken !== 'string'
  ) {
    return null;
  }
  return { catalogToken, membersToken, contextToken, billingToken };
}

/**
 * A digest reader with in-flight coalescing.
 *
 * Catalog and members are refreshed by the same page load milliseconds apart,
 * so without coalescing one navigation costs two identical digest round-trips.
 * Deliberately in-flight only — no TTL — so a settled reading is never reused:
 * the whole point of the token is that it is compared against a freshly read
 * one, and a cached token could green-light a snapshot the cloud has already
 * moved past.
 */
export function createSyncDigestReader(options: SyncDigestReaderOptions): SyncDigestReader {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const readSession = options.readSession ?? readVelaControlApiContext;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const failureCooldownMs = options.failureCooldownMs ?? DEFAULT_FAILURE_COOLDOWN_MS;
  const now = options.now ?? Date.now;
  let inflight: Promise<SyncDigestReading | null> | null = null;
  let cooldownUntil = 0;

  async function read(): Promise<SyncDigestReading | null> {
    // Same gate as the hub events subscriber: no vela source, no hub.
    if (env.OD_WORKSPACE_CONTEXT_SOURCE?.trim() !== 'vela') return null;
    if (now() < cooldownUntil) return null;
    const session = readSession(env);
    if (!session?.controlKey || !session.apiUrl) return null;
    const accountId = session.user?.id?.trim() ?? '';
    const workspaceId = options.getWorkspaceId()?.trim() ?? '';
    // No account or no workspace means no safe cache key. Reporting null keeps
    // the caller on a real fetch instead of letting it invent a shared key.
    if (!accountId || !workspaceId) return null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    timer.unref?.();
    try {
      const response = await fetchImpl(
        new URL('/api/v1/collab/sync-digest', session.apiUrl).toString(),
        {
          headers: {
            authorization: `Bearer ${session.controlKey}`,
            'x-vela-workspace-id': workspaceId,
            accept: 'application/json',
          },
          signal: controller.signal,
        },
      );
      if (!response.ok) {
        cooldownUntil = now() + failureCooldownMs;
        return null;
      }
      const digest = parseSyncDigest(await response.json());
      if (!digest) {
        cooldownUntil = now() + failureCooldownMs;
        return null;
      }
      cooldownUntil = 0;
      return { accountId, workspaceId, digest };
    } finally {
      clearTimeout(timer);
    }
  }

  return () => {
    if (inflight) return inflight;
    const pending = read()
      .catch((error) => {
        cooldownUntil = now() + failureCooldownMs;
        options.onError?.(error);
        return null;
      })
      .finally(() => {
        if (inflight === pending) inflight = null;
      });
    inflight = pending;
    return pending;
  };
}
