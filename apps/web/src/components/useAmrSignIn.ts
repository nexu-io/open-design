import { useCallback, useEffect, useRef, useState } from 'react';
import { amrHandoffDeviceId } from '../analytics/amr-attribution';
import { getResolvedDeviceId } from '../analytics/client';
import {
  fetchVelaLoginStatus,
  startVelaLogin,
  type VelaLoginStatus,
} from '../providers/daemon';
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
   *  cached account state (e.g. the nav-rail email or the popover account). */
  onStatus?: (status: VelaLoginStatus) => void;
}

/**
 * Start the Open Design (Vela) login flow and poll until the account is ready,
 * the browser window closes, or the login times out. Shared by the Home nav-rail
 * account menu and the project-page AvatarMenu popover so both surfaces expose
 * the same signed-out login affordance (#5244).
 *
 * Lifecycle guards (looper review on #6421):
 *  - a mounted flag re-armed in the effect setup body, so React Strict Mode's
 *    dev probe (setup → cleanup → setup) does not leave it permanently false;
 *  - after `startVelaLogin` resolves, and in every polling callback, bail out
 *    if the consumer unmounted so no unowned interval is spawned.
 */
export function useAmrSignIn({
  metricsConsent,
  installationId,
  onStatus,
}: UseAmrSignInOptions) {
  const [amrLoginPending, setAmrLoginPending] = useState(false);
  const amrLoginStartedAtRef = useRef<number | null>(null);
  const amrLoginPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const amrMountedRef = useRef(true);
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;

  const stopAmrLoginPolling = useCallback(() => {
    if (amrLoginPollRef.current) {
      clearInterval(amrLoginPollRef.current);
      amrLoginPollRef.current = null;
    }
    amrLoginStartedAtRef.current = null;
    setAmrLoginPending(false);
  }, []);

  const handleAmrSignIn = useCallback(async () => {
    if (amrLoginPending) return;
    const startedAt = Date.now();
    amrLoginStartedAtRef.current = startedAt;
    setAmrLoginPending(true);
    const odDeviceId = amrHandoffDeviceId({
      metricsConsent,
      resolvedDeviceId: getResolvedDeviceId(),
      installationId,
    });
    const result = await startVelaLogin(null, odDeviceId);
    if (!amrMountedRef.current) return;
    if (result.ok || result.alreadyRunning) {
      notifyAmrLoginStatusChanged('login-started');
      amrLoginPollRef.current = setInterval(() => {
        void fetchVelaLoginStatus()
          .then((status) => {
            if (!amrMountedRef.current) return;
            if (status) onStatusRef.current?.(status);
            const outcome = amrLoginPollOutcome(status, startedAt);
            if (outcome === 'signed-in') {
              stopAmrLoginPolling();
              notifyAmrLoginStatusChanged('status-changed');
            } else if (outcome === 'stopped' || outcome === 'timed-out') {
              stopAmrLoginPolling();
            }
          })
          .catch(() => {
            if (!amrMountedRef.current) return;
            stopAmrLoginPolling();
          });
      }, AMR_LOGIN_POLL_INTERVAL_MS);
    } else {
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
      if (amrLoginPollRef.current) clearInterval(amrLoginPollRef.current);
    };
  }, []);

  return { amrLoginPending, handleAmrSignIn, stopAmrLoginPolling };
}
