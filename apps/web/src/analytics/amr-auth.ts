// Single-flight tracker for the AMR (vela) sign-in flow.
//
// A login attempt is observed by more than one component at once: the
// initiator (AmrLoginPill, InlineModelSwitcher, or the onboarding
// EntryShell) runs its own poll loop, and the global
// AMR_LOGIN_STATUS_EVENT wakes every mounted AmrLoginPill into polling
// too. Each observer reports the outcome it sees; without a shared gate
// one attempt would emit several amr_auth_result rows.
//
// This module is that gate. Pending browser initiations remain separate until
// the daemon says which one owns the single process: a 202 activates its own
// id, while a 409 joins the daemon's existing id. `resolveAmrAuthTracking`
// fires the first terminal event for that canonical id; later pollers no-op.

import type {
  AmrAuthErrorKind,
  AmrAuthNetworkPath,
  AmrAuthResultProps,
  AmrAuthStage,
  AmrAuthStageResult,
  AmrEntryAttribution,
  TrackingAmrEntrySource,
  TrackingPageName,
} from '@open-design/contracts/analytics';
import { amrEntryPageForSource } from './amr-attribution';
import { setAnalyticsUserId } from './client';
import { trackAmrAuthResult, trackAmrAuthStage } from './events';
import { bindSignedInUserAttributionPersonProperties } from './source-attribution';

type Track = (
  event: string,
  properties: Record<string, unknown>,
  options?: { requestId?: string; insertId?: string },
) => void;

interface ActiveAmrAuthAttempt {
  authAttemptId: string;
  ownership: 'provisional' | 'owner' | 'joined_placeholder';
  trackingState: 'pending' | 'active' | 'superseded';
  startedAt: number;
  pageName: TrackingPageName;
  entryId?: string;
  sourceDetail?: TrackingAmrEntrySource;
  seenStageKeys: Set<string>;
  lastStage: AmrAuthStage;
  lastStageResult: AmrAuthStageResult;
  lastErrorKind?: AmrAuthErrorKind;
  lastStageSequence: number;
  networkPath: AmrAuthNetworkPath;
  fallbackUsed: boolean;
}

interface ObservableAmrAuthStatus {
  authAttemptId?: string;
  authRoute?: AmrAuthNetworkPath;
  fallbackUsed?: boolean;
  authStages?: Array<{
    sequence: number;
    stage: AmrAuthStage;
    result: AmrAuthStageResult;
    source: 'web' | 'daemon';
    occurredAt: string;
    route: AmrAuthNetworkPath;
    errorKind?: AmrAuthErrorKind;
  }>;
}

const attempts = new Map<string, ActiveAmrAuthAttempt>();
let pendingAttemptSequence = 0;
const SUPERSEDED_ATTEMPT_TTL_MS = 10 * 60 * 1000;
const MAX_TRACKED_ATTEMPTS = 16;

const AUTH_ATTEMPT_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

interface AuthAttemptCrypto {
  randomUUID?: () => string;
  getRandomValues?: (values: Uint8Array) => Uint8Array;
}

function pruneSupersededAttempts(now: number): void {
  for (const [id, attempt] of attempts) {
    if (
      attempt.trackingState === 'superseded'
      && now - attempt.startedAt >= SUPERSEDED_ATTEMPT_TTL_MS
    ) {
      attempts.delete(id);
    }
  }
  if (attempts.size < MAX_TRACKED_ATTEMPTS) return;
  for (const [id, attempt] of attempts) {
    if (attempt.trackingState !== 'superseded') continue;
    attempts.delete(id);
    if (attempts.size < MAX_TRACKED_ATTEMPTS) return;
  }
}

export function createAmrAuthAttemptId(
  cryptoApi: AuthAttemptCrypto | null | undefined = globalThis.crypto,
): string | null {
  try {
    const generated = cryptoApi?.randomUUID?.();
    if (generated && AUTH_ATTEMPT_ID_RE.test(generated)) return generated;
  } catch {
    // Fall through to getRandomValues for browsers where randomUUID exists but
    // is disabled outside a secure context.
  }
  try {
    if (!cryptoApi?.getRandomValues) return null;
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
    bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
    bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
    const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0'));
    return [
      hex.slice(0, 4).join(''),
      hex.slice(4, 6).join(''),
      hex.slice(6, 8).join(''),
      hex.slice(8, 10).join(''),
      hex.slice(10, 16).join(''),
    ].join('-');
  } catch {
    return null;
  }
}

// Arm tracking for a new sign-in request. Do not emit attempt_started yet:
// another surface may win the daemon race and make this request a 409 join.
// Keeping the provisional request silent prevents orphan stage rows.
//
// `settings` is the fallback page: the only initiator without an
// attribution is the Settings agent-card pill.
export function beginAmrAuthTracking(
  attribution: AmrEntryAttribution | null | undefined,
  startedAt: number = Date.now(),
): string {
  // The pending id is browser-local only: providers omit it from the request,
  // the daemon generates the canonical UUID, and reconcileAmrAuthAttemptId
  // replaces it before any stage/terminal event. This keeps auth functional in
  // non-secure HTTP contexts with no Web Crypto support.
  const authAttemptId = createAmrAuthAttemptId()
    ?? `pending-amr-auth-${Date.now().toString(36)}-${(++pendingAttemptSequence).toString(36)}`;
  pruneSupersededAttempts(Date.now());
  for (const attempt of attempts.values()) {
    // A confirmed daemon attempt stays eligible while another surface asks to
    // join it. Only unresolved browser requests supersede one another.
    if (attempt.trackingState === 'pending') {
      attempt.trackingState = 'superseded';
    }
  }
  const attempt: ActiveAmrAuthAttempt = {
    authAttemptId,
    ownership: 'provisional',
    trackingState: 'pending',
    startedAt,
    pageName: attribution
      ? amrEntryPageForSource(attribution.sourceDetail)
      : 'settings',
    entryId: attribution?.entryId,
    sourceDetail: attribution?.sourceDetail,
    seenStageKeys: new Set(),
    lastStage: 'attempt_started',
    lastStageResult: 'started',
    lastStageSequence: 0,
    networkPath: 'direct',
    fallbackUsed: false,
  };
  attempts.set(authAttemptId, attempt);
  return authAttemptId;
}

export function confirmAmrAuthTracking(
  track: Track,
  authAttemptId: string,
  options: { joinedExisting?: boolean } = {},
): void {
  const attempt = attempts.get(authAttemptId);
  if (!attempt) return;
  for (const other of attempts.values()) {
    if (other !== attempt) other.trackingState = 'superseded';
  }
  attempt.ownership = options.joinedExisting
    ? attempt.ownership === 'owner' ? 'owner' : 'joined_placeholder'
    : 'owner';
  attempt.trackingState = 'active';
  const startKey = 'attempt_started:started:direct';
  if (
    !options.joinedExisting
    && AUTH_ATTEMPT_ID_RE.test(authAttemptId)
    && !attempt.seenStageKeys.has(startKey)
  ) {
    trackAmrAuthStage(track, {
      page_name: attempt.pageName,
      area: 'amr_auth',
      auth_attempt_id: authAttemptId,
      stage: 'attempt_started',
      stage_result: 'started',
      stage_source: 'web',
      duration_ms: 0,
      network_path: 'direct',
      fallback_used: false,
      ...(attempt.entryId ? { entry_id: attempt.entryId } : {}),
      ...(attempt.sourceDetail ? { source_detail: attempt.sourceDetail } : {}),
    }, { insertId: `amr-auth-stage:${authAttemptId}:web-start` });
    attempt.seenStageKeys.add(startKey);
  }
  if (!options.joinedExisting) {
    for (const [id, other] of attempts) {
      if (other !== attempt && other.trackingState === 'superseded') {
        attempts.delete(id);
      }
    }
  }
}

export function observeAmrAuthTracking(
  track: Track,
  status: ObservableAmrAuthStatus | null | undefined,
  expectedAuthAttemptId: string,
): void {
  const attempt = attempts.get(expectedAuthAttemptId);
  if (
    !attempt
    || attempt.trackingState === 'superseded'
    || status?.authAttemptId !== expectedAuthAttemptId
  ) return;
  attempt.networkPath = status.authRoute ?? attempt.networkPath;
  attempt.fallbackUsed = status.fallbackUsed ?? attempt.fallbackUsed;
  const stages = [...(status.authStages ?? [])].sort(
    (a, b) => a.sequence - b.sequence,
  );
  for (const stage of stages) {
    const key = `${stage.stage}:${stage.result}:${stage.route}`;
    if (stage.sequence >= attempt.lastStageSequence) {
      attempt.lastStage = stage.stage;
      attempt.lastStageResult = stage.result;
      attempt.lastStageSequence = stage.sequence;
      attempt.networkPath = stage.route;
      if (stage.errorKind) attempt.lastErrorKind = stage.errorKind;
      else delete attempt.lastErrorKind;
    }
    if (attempt.seenStageKeys.has(key)) continue;
    // A 409 can arrive before the local owner's 202 when WebCrypto is absent.
    // Retain the daemon state but do not emit it with the joining surface's
    // attribution; the owner's response will replace this placeholder.
    if (attempt.ownership === 'joined_placeholder') continue;
    attempt.seenStageKeys.add(key);
    const occurredAt = Date.parse(stage.occurredAt);
    const durationMs = Number.isFinite(occurredAt)
      ? Math.max(0, occurredAt - attempt.startedAt)
      : Math.max(0, Date.now() - attempt.startedAt);
    trackAmrAuthStage(track, {
      page_name: attempt.pageName,
      area: 'amr_auth',
      auth_attempt_id: attempt.authAttemptId,
      stage: stage.stage,
      stage_result: stage.result,
      stage_source: stage.source,
      duration_ms: durationMs,
      network_path: stage.route,
      fallback_used: attempt.fallbackUsed,
      ...(stage.errorKind ? { error_kind: stage.errorKind } : {}),
      ...(attempt.entryId ? { entry_id: attempt.entryId } : {}),
      ...(attempt.sourceDetail ? { source_detail: attempt.sourceDetail } : {}),
    }, {
      insertId: `amr-auth-stage:${attempt.authAttemptId}:${stage.sequence}:${stage.route}`,
    });
  }
}

export function reconcileAmrAuthAttemptId(
  provisionalAuthAttemptId: string,
  daemonAuthAttemptId: string | undefined,
  options: { joinedExisting?: boolean } = {},
): string {
  if (!daemonAuthAttemptId || !AUTH_ATTEMPT_ID_RE.test(daemonAuthAttemptId)) {
    return provisionalAuthAttemptId;
  }
  if (daemonAuthAttemptId === provisionalAuthAttemptId) {
    const sameAttempt = attempts.get(provisionalAuthAttemptId);
    if (sameAttempt && !options.joinedExisting) sameAttempt.ownership = 'owner';
    return daemonAuthAttemptId;
  }
  const provisional = attempts.get(provisionalAuthAttemptId);
  const canonical = attempts.get(daemonAuthAttemptId);
  if (canonical) {
    if (!provisional || provisional === canonical) return daemonAuthAttemptId;
    if (options.joinedExisting) {
      attempts.delete(provisionalAuthAttemptId);
      return daemonAuthAttemptId;
    }
    // The non-409 response owns the daemon attempt. It may arrive after a 409
    // already created a canonical joined placeholder. Replace that placeholder
    // with the owner's original attribution while preserving any state a
    // concurrent observer learned before the 202 completed.
    attempts.delete(provisionalAuthAttemptId);
    provisional.authAttemptId = daemonAuthAttemptId;
    provisional.ownership = 'owner';
    provisional.trackingState = canonical.trackingState;
    provisional.networkPath = canonical.networkPath;
    provisional.fallbackUsed = canonical.fallbackUsed;
    if (canonical.lastStageSequence >= provisional.lastStageSequence) {
      provisional.lastStage = canonical.lastStage;
      provisional.lastStageResult = canonical.lastStageResult;
      provisional.lastStageSequence = canonical.lastStageSequence;
      if (canonical.lastErrorKind) {
        provisional.lastErrorKind = canonical.lastErrorKind;
      } else {
        delete provisional.lastErrorKind;
      }
    }
    for (const key of canonical.seenStageKeys) provisional.seenStageKeys.add(key);
    attempts.set(daemonAuthAttemptId, provisional);
    return daemonAuthAttemptId;
  }
  if (!provisional) return provisionalAuthAttemptId;
  attempts.delete(provisionalAuthAttemptId);
  provisional.authAttemptId = daemonAuthAttemptId;
  if (options.joinedExisting) {
    // This browser did not create the daemon attempt and has no retained local
    // context for it (for example after a reload). Do not attach the joining
    // surface's entry attribution to the older attempt.
    delete provisional.entryId;
    delete provisional.sourceDetail;
    provisional.ownership = 'joined_placeholder';
  } else {
    provisional.ownership = 'owner';
  }
  attempts.set(daemonAuthAttemptId, provisional);
  return daemonAuthAttemptId;
}

// Report the attempt's terminal outcome. First caller wins; later calls
// (other pollers settling on the same state) are no-ops. Safe to call
// when nothing is armed.
//
// Success callers pass `signedInUserId` from the poll status they just
// observed. After the single-flight id gate, the id is registered on the
// analytics client BEFORE the capture below, so the success row itself carries
// `user_id` instead of waiting for React to commit the status and App.tsx to
// re-register it. A stale poller never mutates identity.
export function resolveAmrAuthTracking(
  track: Track,
  result: AmrAuthResultProps['result'],
  errorCode: string | undefined,
  options: {
    signedInUserId?: string | null;
    authAttemptId: string;
  },
): void {
  const attempt = attempts.get(options.authAttemptId);
  if (!attempt) return;
  if (attempt.trackingState === 'superseded') {
    attempts.delete(options.authAttemptId);
    return;
  }
  if (attempt.ownership === 'joined_placeholder') return;
  if (options && 'signedInUserId' in options) {
    setAnalyticsUserId(options.signedInUserId ?? null);
    bindSignedInUserAttributionPersonProperties(options.signedInUserId ?? null);
  }
  attempts.delete(options.authAttemptId);
  for (const [id, other] of attempts) {
    if (other.trackingState === 'superseded') attempts.delete(id);
  }
  if (!AUTH_ATTEMPT_ID_RE.test(attempt.authAttemptId)) return;
  trackAmrAuthResult(track, {
    page_name: attempt.pageName,
    area: 'amr_auth',
    result,
    ...(errorCode ? { error_code: errorCode } : {}),
    duration_ms: Math.max(0, Date.now() - attempt.startedAt),
    ...(attempt.entryId ? { entry_id: attempt.entryId } : {}),
    ...(attempt.sourceDetail ? { source_detail: attempt.sourceDetail } : {}),
    auth_attempt_id: attempt.authAttemptId,
    last_stage: attempt.lastStage,
    last_stage_result: attempt.lastStageResult,
    ...(attempt.lastErrorKind ? { last_error_kind: attempt.lastErrorKind } : {}),
    network_path: attempt.networkPath,
    fallback_used: attempt.fallbackUsed,
  }, { insertId: `amr-auth-result:${attempt.authAttemptId}` });
}
