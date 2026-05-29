import type { VelaLoginStatus } from '../providers/daemon';

export const AMR_LOGIN_POLL_INTERVAL_MS = 2000;
export const AMR_LOGIN_TIMEOUT_MS = 5 * 60 * 1000;
export const AMR_LOGIN_STARTUP_SETTLE_MS = 3000;
export const AMR_LOGIN_STATUS_EVENT = 'od:amr-login-status-change';

export type AmrLoginPollOutcome = 'pending' | 'signed-in' | 'stopped' | 'timed-out';
export type AmrLoginStatusEventReason =
  | 'login-started'
  | 'login-canceled'
  | 'status-changed';

export function amrLoginPollOutcome(
  status: VelaLoginStatus | null,
  startedAt: number,
  now: number = Date.now(),
): AmrLoginPollOutcome {
  if (status?.loggedIn) return 'signed-in';
  if (
    status?.loginInFlight === false &&
    now - startedAt >= AMR_LOGIN_STARTUP_SETTLE_MS
  ) {
    return 'stopped';
  }
  if (now - startedAt >= AMR_LOGIN_TIMEOUT_MS) return 'timed-out';
  return 'pending';
}

export function notifyAmrLoginStatusChanged(
  reason: AmrLoginStatusEventReason = 'status-changed',
) {
  window.dispatchEvent(
    new CustomEvent(AMR_LOGIN_STATUS_EVENT, { detail: { reason } }),
  );
}

export function amrLoginStatusEventReason(
  event: Event,
): AmrLoginStatusEventReason {
  if (event instanceof CustomEvent) {
    const reason = (event.detail as { reason?: unknown } | null)?.reason;
    if (
      reason === 'login-started' ||
      reason === 'login-canceled' ||
      reason === 'status-changed'
    ) {
      return reason;
    }
  }
  return 'status-changed';
}
