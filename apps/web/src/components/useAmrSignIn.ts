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
 * Lifecycle/state-machine guards (looper review on #6421 / #6438):
 *  - a mounted flag re-armed in the effect setup body, so React Strict Mode's
 *    dev probe does not leave it permanently false;
 *  - an attempt generation token, invalidated on every stop/unmount and checked
 *    after the `startVelaLogin` await and before every polling callback, so a
 *    superseded attempt can neither install a poller nor let a delayed callback
 *    mutate a newer attempt's state;
 *  - the attempt's authAttemptId is scoped per attempt (reset on every start,
 *    adopted from the start result or a matching status read), so a timeout
 *    never cancels a NEWER attempt owned by another surface;
 *  - on timeout the daemon's child is cancelled by that id; the hook then stays
 *    in a reconcile phase — keeping pending true and the consumer's action
 *    disabled — until a status poll confirms `loginInFlight === false`, so a
 *    retry during the child's drain window does not 409 as alreadyRunning;
 *  - the error state is cleared once the daemon is idle, so a transient
 *    spawn/cancel failure does not permanently disable the entry.
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
  // Attempt-scoped cancellation target. Reset on every start so a retry never
  // reuses a stale id from a previous attempt; updated from the start result or
  // a matching status read.
  const amrLoginAttemptIdRef = useRef<string | undefined>(undefined);
  // Attempt generation: bumped on every stop/unmount so an in-flight start or a
  // delayed poll callback from a previous attempt cannot drive a newer one.
  const amrAttemptRef = useRef(0);
  // Set once a timeout has cancelled; polling continues (pending stays true)
  // until the daemon reports idle so a retry cannot 409 into the drain window.
  const amrReconcileRef = useRef(false);
  // True only while this hook dispatches its OWN 'login-canceled' event, so the
  // cancel listener below (meant for other surfaces' cancellations) does not
  // stop the reconcile poll it just started.
  const amrSelfCancelRef = useRef(false);
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;

  const stopAmrLoginPolling = useCallback(() => {
    amrAttemptRef.current += 1;
    if (amrLoginPollRef.current) {
      clearInterval(amrLoginPollRef.current);
      amrLoginPollRef.current = null;
    }
    amrLoginStartedAtRef.current = null;
    amrReconcileRef.current = false;
    setAmrLoginPending(false);
  }, []);

  const handleAmrSignIn = useCallback(async () => {
    if (amrLoginPending) return;
    // Capture this attempt's token; setting the ref makes THIS attempt current.
    const attempt = amrAttemptRef.current + 1;
    amrAttemptRef.current = attempt;
    // Fresh attempt id — never reuse a stale id from a previous attempt.
    amrLoginAttemptIdRef.current = undefined;
    amrReconcileRef.current = false;
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
              // Adopt a status attempt id ONLY for this attempt's poll (the
              // attempt token already guards against stale reads from an older
              // attempt overwriting the ref).
              amrLoginAttemptIdRef.current =
                status.authAttemptId ?? amrLoginAttemptIdRef.current;
              onStatusRef.current?.(status);
            }
            const outcome = amrLoginPollOutcome(status, startedAt);
            if (outcome === 'signed-in') {
              stopAmrLoginPolling();
              notifyAmrLoginStatusChanged('status-changed');
              notifyWorkspaceContextRefresh();
              notifyWorkspaceBillingRefresh();
              notifyTeamProjectsChanged();
              return;
            }
            if (outcome === 'timed-out' && !amrReconcileRef.current) {
              // A timed-out attempt's `vela login` child is often still alive.
              // Cancel THIS attempt by id — never a body-less "cancel latest",
              // which could terminate a newer attempt owned by another surface.
              amrReconcileRef.current = true;
              const cancel = amrLoginAttemptIdRef.current
                ? await cancelVelaLogin(amrLoginAttemptIdRef.current)
                : null;
              if (!amrMountedRef.current || amrAttemptRef.current !== attempt) return;
              if (!cancel?.ok || cancel.canceled !== true) {
                setAmrLoginError('settings.amrLoginErrorCompact');
              }
              if (cancel?.canceled === true) {
                // Guarded so the cancel listener (for OTHER surfaces' cancels)
                // does not stop the reconcile poll this emission starts.
                amrSelfCancelRef.current = true;
                notifyAmrLoginStatusChanged('login-canceled');
                amrSelfCancelRef.current = false;
              } else {
                notifyAmrLoginStatusChanged('status-changed');
              }
              // Keep polling (pending stays true) until the daemon reports idle.
              return;
            }
            // Daemon idle: browser closed (`stopped`) or the cancelled child has
            // drained. Publish a terminal event, clear any error, and finish.
            if (status?.loginInFlight === false) {
              if (outcome !== 'timed-out') notifyAmrLoginStatusChanged('status-changed');
              setAmrLoginError(null);
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
      if (
        amrLoginStatusEventReason(event) === 'login-canceled'
        && !amrSelfCancelRef.current
      ) {
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
