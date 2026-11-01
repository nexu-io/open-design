import { useEffect, useRef, useState } from 'react';
import {
  cancelVelaLogin,
  fetchVelaLoginStatus,
  startVelaLogin,
  type VelaLoginStatus,
} from '../providers/daemon';
import {
  AMR_LOGIN_POLL_INTERVAL_MS,
  amrLoginPollOutcome,
  isAmrSessionAuthenticated,
  notifyAmrLoginStatusChanged,
} from './amrLoginPolling';
import {
  notifyTeamProjectsChanged,
  notifyWorkspaceBillingRefresh,
  notifyWorkspaceContextRefresh,
} from '../collab/useWorkspaceContext';

export type CloudSignInState = 'idle' | 'signing' | 'error';

/**
 * The vela device-auth login flow (pending state with a spinner + cancel +
 * the manual activation link fallback), extracted verbatim from
 * `CloudSignInTip` (2026 refactor: item 1/OD-2) so `ShareSignInButton` can
 * drive a REAL `<button>` through the same flow instead of `CloudSignInTip`'s
 * own `<section role="button">` (which also nests a native `<button>` for
 * cancel — an accessibility issue OD-2 flags). `CloudSignInTip` itself now
 * calls this hook too; its own rendering/behavior is unchanged.
 */
export function useCloudSignIn({ onLoginSuccess }: { onLoginSuccess?: () => void } = {}) {
  const [state, setState] = useState<CloudSignInState>('idle');
  const [status, setStatus] = useState<VelaLoginStatus | null>(null);
  const cancelledRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cancelledRef.current = true;
    };
  }, []);

  async function begin() {
    if (state === 'signing') return;
    cancelledRef.current = false;
    setState('signing');
    setStatus(null);
    const current = await fetchVelaLoginStatus();
    if (cancelledRef.current || !mountedRef.current) return;
    if (isAmrSessionAuthenticated(current)) {
      finishSignedIn();
      return;
    }
    const result = await startVelaLogin();
    if (cancelledRef.current || !mountedRef.current) return;
    if (!result.ok && !result.alreadyRunning) {
      console.error('[amr-login] startVelaLogin failed', result);
      setState('error');
      return;
    }
    const startedAt = Date.now();
    while (!cancelledRef.current && mountedRef.current) {
      await new Promise((resolve) => window.setTimeout(resolve, AMR_LOGIN_POLL_INTERVAL_MS));
      if (cancelledRef.current || !mountedRef.current) return;
      const next = await fetchVelaLoginStatus();
      if (cancelledRef.current || !mountedRef.current) return;
      if (next) setStatus(next);
      const outcome = amrLoginPollOutcome(next, startedAt);
      if (outcome === 'signed-in') {
        finishSignedIn();
        return;
      }
      if (outcome === 'stopped' || outcome === 'timed-out') {
        // A timed-out attempt's `vela login` child is often still alive (the
        // daemon never self-reported loginInFlight: false) — release it, or
        // the daemon still sees a login in flight and a retry click 409s as
        // alreadyRunning instead of spawning a fresh one, so no new browser
        // tab ever opens. Mirrors AmrLoginPill / InlineModelSwitcher / EntryShell.
        if (outcome === 'timed-out') void cancelVelaLogin();
        console.error('[amr-login] poll did not reach a signed-in status', { outcome, next });
        setState('error');
        return;
      }
    }
  }

  function finishSignedIn() {
    // A requested post-login action belongs to the still-mounted caller;
    // broadcast refresh may unmount this tip before the caller can record it.
    if (mountedRef.current && !cancelledRef.current) onLoginSuccess?.();
    notifyAmrLoginStatusChanged();
    notifyWorkspaceContextRefresh();
    notifyWorkspaceBillingRefresh();
    notifyTeamProjectsChanged();
    if (mountedRef.current) setState('idle');
  }

  async function cancel() {
    cancelledRef.current = true;
    setState('idle');
    setStatus(null);
    await cancelVelaLogin();
    notifyAmrLoginStatusChanged('login-canceled');
  }

  return { state, status, begin, cancel };
}
