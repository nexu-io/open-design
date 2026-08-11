import { useEffect, useRef, useState } from 'react';
import { VisuallyHidden } from '@open-design/components';
import { Icon } from './Icon';
import { useI18n } from '../i18n';
import {
  cancelVelaLogin,
  fetchVelaLoginStatus,
  startVelaLogin,
  type VelaLoginStatus,
} from '../providers/daemon';
import {
  AMR_LOGIN_POLL_INTERVAL_MS,
  amrLoginPollOutcome,
  notifyAmrLoginStatusChanged,
} from './amrLoginPolling';
import {
  notifyTeamProjectsChanged,
  notifyWorkspaceBillingRefresh,
  notifyWorkspaceContextRefresh,
} from '../collab/useWorkspaceContext';

const DISMISSED_KEY = 'od.entry.cloudSignInTip.dismissed';

/**
 * recvqbkcLqIFH7: a user who ever closed this card (back when it had a close
 * button) had that dismissal persist in localStorage FOREVER — including
 * through a later real sign-in and sign-out. Since this card is the rail's
 * only visible sign-in entry point once `context` goes back to null, that
 * stale flag silently deleted the user's only way back in: the rail footer
 * rendered empty, with no error and no other affordance.
 *
 * The card no longer has a close button (nothing sets this key anymore), so
 * this is now legacy cleanup for accounts that dismissed it before that
 * change shipped — EntryNavRail still calls it on every real sign-out so a
 * pre-existing stale flag can't resurface the bug.
 */
export function resetCloudSignInTipDismissal(): void {
  try {
    window.localStorage.removeItem(DISMISSED_KEY);
  } catch {
    // best-effort persistence
  }
}

type TipState = 'idle' | 'signing' | 'error';

/**
 * recvqgpXSYFNTq: the rail's bottom-left callout slot goes visibly blank
 * between "sign-in just succeeded" and "the workspace context resolved" —
 * `CloudSignInTip` unmounts the instant `finishSignedIn()` fires (see
 * `useWorkspaceContext`'s `markLoading`), but the account row above only
 * appears once `GET /api/workspace/context` answers, which is a real vela
 * round trip and not instantaneous. `EntryShell` renders THIS in the exact
 * same footer slot for that one window (`!workspaceContext && workspaceLoading`)
 * so the callout hands off to a loading state instead of disappearing into
 * nothing. Deliberately inert (no button semantics, no dismiss, no click
 * handler) — this is a status readout, not another affordance to interact
 * with while the real re-read is already in flight.
 *
 * Shaped as a skeleton of the account row it is standing in for
 * (`.entry-nav-rail__account-trigger`'s avatar + name, see entry-layout.css)
 * rather than as its own callout card — product feedback (2026-07-24) was
 * that the previous spinner+"Loading…" card read as a distinct, separate
 * notification, and visibly jumped in size/position once the real avatar
 * row landed. Matching the real row's footprint keeps the loading→loaded
 * swap reading as one continuous element filling in, not two different
 * elements trading places. The "Loading" text survives for assistive tech
 * via `VisuallyHidden` — sighted users read the shimmer itself as the status.
 */
export function RailAccountSyncTip() {
  const { t } = useI18n();
  return (
    <div
      className="entry-rail-account-skeleton"
      role="status"
      aria-live="polite"
      data-testid="entry-rail-account-sync-tip"
    >
      <span className="entry-rail-account-skeleton__avatar" aria-hidden />
      <span className="entry-rail-account-skeleton__name" aria-hidden />
      <VisuallyHidden>
        {t('entry.cloudCalloutTitle')} {t('common.loading')}
      </VisuallyHidden>
    </div>
  );
}

/**
 * The signed-out rail's bottom callout (#5517 "Open Design Cloud 版" card).
 * The demo's card jumps to a mock sign-in; the product card IS the sign-in:
 * clicking it kicks off the same vela device-auth flow the onboarding/AMR
 * pill uses — pending state with a spinner + cancel + the manual activation
 * link fallback — and on success every workspace surface is nudged to
 * re-read, which swaps the rail to the signed-in form (unmounting the card).
 */
export function CloudSignInTip() {
  const { t } = useI18n();
  const [state, setState] = useState<TipState>('idle');
  const [status, setStatus] = useState<VelaLoginStatus | null>(null);
  const cancelledRef = useRef(false);
  const mountedRef = useRef(true);
  // Set by `cancel()` when the user cancels BEFORE the card has observed any
  // attempt id (the spawn POST is still pending, or no status read has carried
  // one yet). In that window the daemon's canonical id is only knowable once
  // `startVelaLogin()` resolves, so the intent is preserved and the spawn
  // continuation issues `cancelVelaLogin(result.authAttemptId)` — instead of
  // the legacy no-body cancellation, which cannot target the just-spawned
  // child and can terminate a newer login on another surface. Stores the run
  // token of the `begin()` the cancel targeted, so a spawn continuation for a
  // different run (a re-click after the cancel) cannot consume this intent.
  const cancelRequestedRunRef = useRef<number | null>(null);
  // Monotonic identity of the current `begin()` run. `cancelledRef` alone is
  // not an ownership guard: a cancel sets it true, but a re-click resets it to
  // false before a stale continuation's await resolves — so the old run would
  // pass the check and write over the newer login (setStatus, a second spawn,
  // a stale timeout cancel, a false signed-in broadcast). Every continuation
  // captures the token at start and bails once a newer `begin()`/`cancel()`
  // bumped it, mirroring the attempt/generation guards of the other surfaces.
  const loginRunRef = useRef(0);
  // The attempt id this tip has observed from status reads. Kept in a ref
  // (not `status` state) because `finishSignedIn()`/`cancel()` run in the
  // same synchronous tick as `setStatus(next)` — the state still holds the
  // previous frame, which is null on a first success or an older attempt.
  // Every cancel/timeout path targets this id and every broadcast carries
  // it, so a superseded card can never cancel or reset a newer login.
  const authAttemptIdRef = useRef<string | null>(null);

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
    // Own this run: a newer `begin()` (re-click after cancel) or `cancel()`
    // bumps the token, so every continuation of THIS run bails post-await.
    const loginRun = ++loginRunRef.current;
    setState('signing');
    setStatus(null);
    const current = await fetchVelaLoginStatus();
    // Keep this run's observed id LOCAL until ownership is validated below —
    // writing the shared ref before the token check would let a superseded
    // run overwrite the current attempt's identity with its own stale read.
    const observedCurrentId = current?.authAttemptId ?? null;
    if (cancelledRef.current || !mountedRef.current || loginRun !== loginRunRef.current) return;
    if (observedCurrentId) authAttemptIdRef.current = observedCurrentId;
    if (current?.loggedIn) {
      finishSignedIn(observedCurrentId);
      return;
    }
    const result = await startVelaLogin();
    // The daemon's canonical attempt id may not be observable from a status
    // read until the first poll tick (2s later). Record it the moment the
    // spawn resolves — including the alreadyRunning/409 response. The id is
    // kept local so a Cancel that landed while the POST was pending still lets
    // this continuation issue the targeted cancellation below without first
    // mutating the shared ref.
    const spawnId = result.authAttemptId ?? null;
    if (cancelledRef.current || !mountedRef.current || loginRun !== loginRunRef.current) {
      // Cancel intent preserved (spawn was pending when `cancel()` ran): issue
      // the canonical cancel for the just-resolved attempt now that we know
      // its id, and broadcast with it — never the legacy no-body form. Only
      // consume the intent when it was targeted at THIS run (a re-click after
      // the cancel belongs to a newer run and must not reset it).
      if (cancelRequestedRunRef.current === loginRun && spawnId) {
        cancelRequestedRunRef.current = null;
        void cancelVelaLogin(spawnId);
        notifyAmrLoginStatusChanged('login-canceled', spawnId);
      }
      return;
    }
    if (spawnId) authAttemptIdRef.current = spawnId;
    if (!result.ok && !result.alreadyRunning) {
      console.error('[amr-login] startVelaLogin failed', result);
      setState('error');
      return;
    }
    // Announce the started login so App and other AMR surfaces can adopt the
    // attempt synchronously (their `login-canceled` id gates and retry
    // lifecycle depend on observing it). This card keeps polling on its own
    // run token and does not re-adopt the broadcast.
    if (spawnId) {
      notifyAmrLoginStatusChanged('login-started', spawnId);
    }
    const startedAt = Date.now();
    while (!cancelledRef.current && mountedRef.current) {
      await new Promise((resolve) => window.setTimeout(resolve, AMR_LOGIN_POLL_INTERVAL_MS));
      if (cancelledRef.current || !mountedRef.current || loginRun !== loginRunRef.current) return;
      const next = await fetchVelaLoginStatus();
      // Same ordering as above: validate ownership before adopting this read's
      // id into the shared ref.
      const nextId = next?.authAttemptId ?? null;
      if (cancelledRef.current || !mountedRef.current || loginRun !== loginRunRef.current) return;
      if (nextId) authAttemptIdRef.current = nextId;
      if (next) setStatus(next);
      const outcome = amrLoginPollOutcome(next, startedAt);
      if (outcome === 'signed-in') {
        finishSignedIn(nextId);
        return;
      }
      if (outcome === 'stopped' || outcome === 'timed-out') {
        // A timed-out attempt's `vela login` child is often still alive (the
        // daemon never self-reported loginInFlight: false) — release it, or
        // the daemon still sees a login in flight and a retry click 409s as
        // alreadyRunning instead of spawning a fresh one, so no new browser
        // tab ever opens. Mirrors AmrLoginPill / InlineModelSwitcher / EntryShell.
        // Target this run's attempt (captured — the mutable ref may have moved
        // on to a newer login while the read was in flight). Only cancel when
        // an id is known: the legacy no-body form would hit an unspecified
        // child and could terminate a newer login on another surface.
        const observedAttemptId = authAttemptIdRef.current;
        if (outcome === 'timed-out' && observedAttemptId) {
          void cancelVelaLogin(observedAttemptId);
        }
        console.error('[amr-login] poll did not reach a signed-in status', { outcome, next });
        setState('error');
        return;
      }
    }
  }

  function finishSignedIn(attemptId: string | null) {
    // Broadcast the attempt this run observed (passed in by the caller after
    // ownership was validated) — never the mutable ref, so a stale run cannot
    // attribute its success to a newer login's id.
    notifyAmrLoginStatusChanged('status-changed', attemptId);
    notifyWorkspaceContextRefresh();
    notifyWorkspaceBillingRefresh();
    notifyTeamProjectsChanged();
    if (mountedRef.current) setState('idle');
  }

  async function cancel() {
    // Terminate every in-flight `begin()` continuation of this card: a
    // re-click after this must start a fresh run, never resume the old one.
    const cancelRun = loginRunRef.current;
    loginRunRef.current += 1;
    cancelledRef.current = true;
    // Target the attempt this tip observed (ref, never `status` state — the
    // state may still hold the previous frame). When no attempt has been
    // observed yet (the spawn POST is still pending), preserve the cancel
    // intent for the run being canceled so the spawn continuation issues the
    // targeted cancel + broadcast — never the legacy no-body form.
    const authAttemptId = authAttemptIdRef.current;
    setState('idle');
    setStatus(null);
    if (authAttemptId) {
      await cancelVelaLogin(authAttemptId);
      // This run may have been superseded while the cancel was in flight (a
      // re-click started a new run). Only broadcast if no newer run started —
      // a stale `login-canceled` for an attempt App has not yet adopted
      // would otherwise clear the newer login's retry.
      if (loginRunRef.current === cancelRun + 1) {
        notifyAmrLoginStatusChanged('login-canceled', authAttemptId);
      }
      return;
    }
    cancelRequestedRunRef.current = cancelRun;
  }

  const signing = state === 'signing';

  const headBadge = (
    <div className="entry-local-mode-tip__head">
      <span className="entry-local-mode-tip__login-badge">
        <Icon name="log-in" size={14} />
        {t('settings.amrLogin')}
      </span>
    </div>
  );

  return (
    <section
      role="button"
      tabIndex={signing ? -1 : 0}
      className={`entry-local-mode-tip${signing ? ' is-signing' : ''}`}
      onClick={() => {
        if (!signing) void begin();
      }}
      onKeyDown={(event) => {
        if (signing) return;
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        void begin();
      }}
      aria-label={t('entry.cloudCalloutTitle')}
      data-testid="entry-cloud-signin-tip"
    >
      {signing ? (
        <>
          {headBadge}
          <p>{t('settings.amrSigningIn')}</p>
          {status?.activationUrl ? (
            <div className="amr-login-activation" role="group">
              <span className="amr-login-activation__hint">
                {status.browserOpenFailed
                  ? t('settings.amrActivationBrowserFailed')
                  : t('settings.amrActivationHint')}
              </span>
              <div className="amr-login-activation__actions">
                <a
                  className="amr-login-activation__open"
                  href={status.activationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(event) => event.stopPropagation()}
                >
                  {t('settings.amrActivationOpen')}
                </a>
              </div>
            </div>
          ) : null}
          <button
            type="button"
            className="entry-local-mode-tip__cancel"
            onClick={(event) => {
              event.stopPropagation();
              void cancel();
            }}
          >
            {t('settings.amrCancelSignIn')}
          </button>
        </>
      ) : state === 'error' ? (
        <>
          {headBadge}
          <p role="alert">{t('settings.amrLoginErrorCompact')}</p>
        </>
      ) : (
        <>
          <p>{t('entry.cloudCalloutBody')}</p>
          {headBadge}
        </>
      )}
    </section>
  );
}
