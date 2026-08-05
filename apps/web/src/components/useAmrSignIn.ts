import { useCallback, useEffect, useRef, useState } from 'react';
import { amrHandoffDeviceId } from '../analytics/amr-attribution';
import { getResolvedDeviceId } from '../analytics/client';
import {
  cancelVelaLogin,
  fetchVelaLoginStatus,
  startVelaLogin,
  type VelaLoginStatus,
} from '../providers/daemon';
import {
  notifyTeamProjectsChanged,
  notifyWorkspaceBillingRefresh,
  notifyWorkspaceContextRefresh,
} from '../collab/useWorkspaceContext';
import {
  AMR_LOGIN_POLL_INTERVAL_MS,
  AMR_LOGIN_STATUS_EVENT,
  amrLoginPollOutcome,
  amrLoginStatusEventReason,
  notifyAmrLoginStatusChanged,
} from './amrLoginPolling';

interface UseAmrSignInOptions {
  metricsConsent: boolean;
  installationId: string | null | undefined;
  /** Fired on every polling status observation so a consumer can refresh its
   *  cached account state (e.g. the popover account). */
  onStatus?: (status: VelaLoginStatus) => void;
}

/**
 * Start the Open Design (Vela) login flow and poll until the account is ready,
 * the browser window closes, or the login times out. Used by the project-page
 * AvatarMenu popover's signed-out entry (#5244).
 *
 * Lifecycle guards (looper review on #6421 / #6438):
 *  - a mounted flag re-armed in the effect setup body, so React Strict Mode's
 *    dev probe (setup → cleanup → setup) does not leave it permanently false;
 *  - an attempt generation token, invalidated on every stop and checked after
 *    the `startVelaLogin` await and before every polling callback, so a
 *    superseded/cancelled attempt can neither install a poller nor let a
 *    delayed callback mutate a later attempt's state;
 *  - the timeout path cancels THIS attempt by authAttemptId (never a body-less
 *    "cancel whatever is latest", which could kill a newer attempt started by
 *    another surface) and surfaces a failure state if the cancel fails.
 */
export function useAmrSignIn({
  metricsConsent,
  installationId,
  onStatus,
}: UseAmrSignInOptions) {
  const [amrLoginPending, setAmrLoginPending] = useState(false);
  const [amrLoginError, setAmrLoginError] = useState<string | null>(null);
  const amrLoginStartedAtRef = useRef<number | null>(null);
  const amrLoginPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const amrMountedRef = useRef(true);
  // The authAttemptId of the CURRENT attempt, refreshed from every status so a
  // start that omitted it (or a 409/poll) still resolves to the right target.
  // Used for the targeted timeout cancel — never a body-less "cancel latest".
  const amrLoginAttemptIdRef = useRef<string | undefined>(undefined);
  // Attempt generation: bumped on every stop/unmount so an in-flight start or a
  // delayed poll callback from a previous attempt cannot drive a newer one.
  const amrAttemptRef = useRef(0);
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;

  const stopAmrLoginPolling = useCallback(() => {
    amrAttemptRef.current += 1;
    if (amrLoginPollRef.current) {
      clearInterval(amrLoginPollRef.current);
      amrLoginPollRef.current = null;
    }
    amrLoginStartedAtRef.current = null;
    setAmrLoginPending(false);
  }, []);

  const handleAmrSignIn = useCallback(async () => {
    if (amrLoginPending) return;
    // Capture this attempt's token so a cancel/stop that races the await cannot
    // let a superseded attempt install a poller. Setting the ref makes THIS
    // attempt current; stopAmrLoginPolling increments past it to invalidate.
    const attempt = amrAttemptRef.current + 1;
    amrAttemptRef.current = attempt;
    const startedAt = Date.now();
    amrLoginStartedAtRef.current = startedAt;
    setAmrLoginPending(true);
    setAmrLoginError(null);
    const odDeviceId = amrHandoffDeviceId({
      metricsConsent,
      resolvedDeviceId: getResolvedDeviceId(),
      installationId,
    });
    const result = await startVelaLogin(null, odDeviceId);
    if (!amrMountedRef.current || amrAttemptRef.current !== attempt) return;
    if (result.ok || result.alreadyRunning) {
      amrLoginAttemptIdRef.current = result.authAttemptId ?? amrLoginAttemptIdRef.current;
      notifyAmrLoginStatusChanged('login-started');
      amrLoginPollRef.current = setInterval(() => {
        if (amrAttemptRef.current !== attempt) return;
        void fetchVelaLoginStatus()
          .then(async (status) => {
            if (!amrMountedRef.current || amrAttemptRef.current !== attempt) return;
            if (status) {
              amrLoginAttemptIdRef.current =
                status.authAttemptId ?? amrLoginAttemptIdRef.current;
              onStatusRef.current?.(status);
            }
            const outcome = amrLoginPollOutcome(status, startedAt);
            if (outcome === 'signed-in') {
              stopAmrLoginPolling();
              // Mirror CloudSignInTip / AmrLoginPill / onboarding: surfaces that
              // subscribe to workspace state wait on these refresh events, not on
              // the AMR login-status event, so a login started here must nudge
              // the workspace catalog / billing to re-read (looper review).
              notifyAmrLoginStatusChanged('status-changed');
              notifyWorkspaceContextRefresh();
              notifyWorkspaceBillingRefresh();
              notifyTeamProjectsChanged();
            } else if (outcome === 'stopped' || outcome === 'timed-out') {
              if (outcome === 'timed-out') {
                // A timed-out attempt's `vela login` child is often still alive
                // (the daemon never self-reported loginInFlight: false). Cancel
                // THIS attempt by its id — never a body-less "cancel latest",
                // which could terminate a newer attempt owned by another
                // surface. Only report cancelled when the daemon confirms it.
                const cancel = amrLoginAttemptIdRef.current
                  ? await cancelVelaLogin(amrLoginAttemptIdRef.current)
                  : null;
                if (!amrMountedRef.current || amrAttemptRef.current !== attempt) return;
                if (!cancel?.ok || cancel.canceled !== true) {
                  setAmrLoginError('settings.amrLoginErrorCompact');
                }
                notifyAmrLoginStatusChanged(
                  cancel?.canceled === true ? 'login-canceled' : 'status-changed',
                );
              } else {
                // Browser closed without signing in — publish a terminal event so
                // app-wide caches (loginInFlight) refresh, not just this poll.
                notifyAmrLoginStatusChanged('status-changed');
              }
              stopAmrLoginPolling();
            }
          })
          .catch(() => {
            if (!amrMountedRef.current || amrAttemptRef.current !== attempt) return;
            stopAmrLoginPolling();
          });
      }, AMR_LOGIN_POLL_INTERVAL_MS);
    } else {
      if (amrAttemptRef.current === attempt) {
        setAmrLoginError(result.error || 'settings.amrLoginErrorCompact');
      }
      setAmrLoginPending(false);
      amrLoginStartedAtRef.current = null;
    }
  }, [amrLoginPending, metricsConsent, installationId, stopAmrLoginPolling]);

  // A login cancelled from another surface (e.g. Home) should stop the poll
  // here too.
  useEffect(() => {
    if (!amrLoginPending) return;
    const onLoginStatus = (event: Event) => {
      if (amrLoginStatusEventReason(event) === 'login-canceled') {
        stopAmrLoginPolling();
      }
    };
    window.addEventListener(AMR_LOGIN_STATUS_EVENT, onLoginStatus);
    return () => window.removeEventListener(AMR_LOGIN_STATUS_EVENT, onLoginStatus);
  }, [amrLoginPending, stopAmrLoginPolling]);

  // Track mount state so a pending startVelaLogin cannot spawn a new unowned
  // interval after the consumer unmounts. The setup body re-arms the flag so
  // React Strict Mode's dev effect probe doesn't leave it permanently false.
  useEffect(() => {
    amrMountedRef.current = true;
    return () => {
      amrMountedRef.current = false;
      amrAttemptRef.current += 1;
      if (amrLoginPollRef.current) clearInterval(amrLoginPollRef.current);
    };
  }, []);

  return { amrLoginPending, amrLoginError, handleAmrSignIn, stopAmrLoginPolling };
}
