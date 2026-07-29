// Single-flight tracker for the AMR (vela) sign-in flow.
//
// A login attempt is observed by more than one component at once: the
// initiator (AmrLoginPill, InlineModelSwitcher, or the onboarding
// EntryShell) runs its own poll loop, and the global
// AMR_LOGIN_STATUS_EVENT wakes every mounted AmrLoginPill into polling
// too. Each observer reports the outcome it sees; without a shared gate
// one attempt would emit several amr_auth_result rows.
//
// This module is that gate: `beginAmrAuthTracking` arms a module-level
// attempt at initiation, `resolveAmrAuthTracking` fires the event for the
// first terminal outcome and disarms, and every later resolve for the
// same attempt is a no-op. Components therefore call resolve from ALL of
// their terminal branches without worrying about double counting.

import type {
  AmrAuthResultProps,
  AmrEntryAttribution,
  TrackingAmrEntrySource,
  TrackingPageName,
} from '@open-design/contracts/analytics';
import { amrEntryPageForSource } from './amr-attribution';
import { setAnalyticsUserId } from './client';
import { trackAmrAuthResult } from './events';
import { bindSignedInUserAttributionPersonProperties } from './source-attribution';

type Track = (
  event: string,
  properties: Record<string, unknown>,
  options?: { requestId?: string; insertId?: string },
) => void;

interface ActiveAmrAuthAttempt {
  startedAt: number;
  pageName: TrackingPageName;
  entryId?: string;
  sourceDetail?: TrackingAmrEntrySource;
}

let active: ActiveAmrAuthAttempt | null = null;

// Arm tracking for a new sign-in attempt. Call right before
// startVelaLogin(); a still-armed previous attempt is superseded (the
// product never runs two vela logins concurrently — a second initiation
// reuses the in-flight one, so the newest arm wins).
//
// `settings` is the fallback page: the only initiator without an
// attribution is the Settings agent-card pill.
export function beginAmrAuthTracking(
  attribution: AmrEntryAttribution | null | undefined,
  startedAt: number = Date.now(),
): void {
  active = {
    startedAt,
    pageName: attribution
      ? amrEntryPageForSource(attribution.sourceDetail)
      : 'settings',
    entryId: attribution?.entryId,
    sourceDetail: attribution?.sourceDetail,
  };
}

// Report the attempt's terminal outcome. First caller wins; later calls
// (other pollers settling on the same state) are no-ops. Safe to call
// when nothing is armed.
//
// Success callers pass `signedInUserId` from the poll status they just
// observed. The id is registered on the analytics client BEFORE the
// capture below — and before the single-flight gate, since registration
// is idempotent — so the success row itself carries `user_id` instead of
// waiting for React to commit the status and App.tsx to re-register it.
// Bound the stderr we forward. This is CLI/daemon failure text, so it is build
// and OS strings rather than anything the user typed, but it can still carry a
// home directory — scrub paths and cap the length before it leaves the client.
const AMR_ERROR_DETAIL_MAX = 300;

export function amrAuthErrorDetail(detail: string | null | undefined): string | undefined {
  const raw = typeof detail === 'string' ? detail.trim() : '';
  if (!raw) return undefined;
  const scrubbed = raw
    .replace(/([A-Za-z]:[\\/]Users[\\/])[^\\/\r\n]+/g, '$1<redacted>')
    .replace(/\/(Users|home)\/[^/\s]+/g, '/$1/<redacted>');
  return scrubbed.length > AMR_ERROR_DETAIL_MAX
    ? `${scrubbed.slice(0, AMR_ERROR_DETAIL_MAX)}…`
    : scrubbed;
}

export function resolveAmrAuthTracking(
  track: Track,
  result: AmrAuthResultProps['result'],
  errorCode?: string,
  options?: {
    signedInUserId?: string | null;
    // The daemon's HTTP status and failure text for a refused login start.
    // `StartVelaLoginResult.error` is an optional `string`, so the call sites
    // hand this an explicit `undefined`; the type matches `amrAuthErrorDetail`'s
    // own input rather than forcing every caller to strip the key first.
    errorStatus?: number | null | undefined;
    errorDetail?: string | null | undefined;
  },
): void {
  if (options && 'signedInUserId' in options) {
    setAnalyticsUserId(options.signedInUserId ?? null);
    bindSignedInUserAttributionPersonProperties(options.signedInUserId ?? null);
  }
  if (!active) return;
  const attempt = active;
  active = null;
  trackAmrAuthResult(track, {
    page_name: attempt.pageName,
    area: 'amr_auth',
    result,
    ...(errorCode ? { error_code: errorCode } : {}),
    ...(typeof options?.errorStatus === 'number'
      ? { error_status: options.errorStatus }
      : {}),
    ...(() => {
      const detail = amrAuthErrorDetail(options?.errorDetail);
      return detail ? { error_detail: detail } : {};
    })(),
    duration_ms: Math.max(0, Date.now() - attempt.startedAt),
    ...(attempt.entryId ? { entry_id: attempt.entryId } : {}),
    ...(attempt.sourceDetail ? { source_detail: attempt.sourceDetail } : {}),
  });
}
