import type { VelaLoginStatus } from '../providers/daemon';

export const AMR_LOGIN_POLL_INTERVAL_MS = 2000;
// The AMR device request lives 15 minutes server-side and `vela login` exits on
// its own when it expires. The client must not give up earlier: a new user can
// still be registering in the browser, and an early cancel turns their finished
// registration into "登录已取消" (OPEND-4588). This is only a backstop past the
// server deadline for a child that never reports back.
export const AMR_DEVICE_AUTH_TTL_MS = 15 * 60 * 1000;
export const AMR_LOGIN_TIMEOUT_MS = AMR_DEVICE_AUTH_TTL_MS + 60 * 1000;
export const AMR_LOGIN_STARTUP_SETTLE_MS = 3000;
export const AMR_LOGIN_STATUS_EVENT = 'od:amr-login-status-change';

export type AmrLoginPollOutcome = 'pending' | 'signed-in' | 'stopped' | 'timed-out' | 'cancelled';
export type AmrLoginStatusEventReason =
  | 'login-started'
  | 'login-canceled'
  | 'status-changed';

export function isAmrSessionAuthenticated(
  status: VelaLoginStatus | null | undefined,
): boolean {
  return status?.loggedIn === true && status.sessionState !== 'reauth_required';
}

export function amrLoginPollOutcome(
  status: VelaLoginStatus | null,
  startedAt: number,
  now: number = Date.now(),
): AmrLoginPollOutcome {
  if (isAmrSessionAuthenticated(status)) return 'signed-in';
  if (status?.loginError === 'login_cancelled') return 'cancelled';
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
