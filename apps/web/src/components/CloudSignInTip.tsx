import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { VisuallyHidden } from '@open-design/components';
import { Icon } from './Icon';
import { useI18n } from '../i18n';
import { useCloudSignIn } from './use-cloud-sign-in';
import { AmrActivationHintText } from './AmrActivationHintText';
import styles from './CloudSignInTip.module.css';

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

export function RailAccountRecoveryTip() {
  const { t } = useI18n();
  return (
    <div
      className="entry-rail-account-recovery"
      role="status"
      aria-live="polite"
      data-testid="entry-rail-account-recovery-tip"
    >
      <span className="entry-rail-account-recovery__spinner" aria-hidden />
      <span className="entry-rail-account-recovery__text">
        {t('entry.cloudRecovering')}
      </span>
    </div>
  );
}

// How long a sign-in waits for the browser before offering to reopen it.
const ACTIVATION_HINT_DELAY_MS = 5000;

/**
 * The signed-out rail's bottom callout (#5517 "OpenDesign Cloud 版" card).
 * The demo's card jumps to a mock sign-in; the product card IS the sign-in:
 * clicking it kicks off the same vela device-auth flow the onboarding/AMR
 * pill uses — pending state with a spinner + cancel + the manual activation
 * link fallback — and on success every workspace surface is nudged to
 * re-read, which swaps the rail to the signed-in form (unmounting the card).
 */
export function CloudSignInTip({ sharePrompt = false, className, onLoginSuccess, actionLabel }: { sharePrompt?: boolean; className?: string; onLoginSuccess?: () => void; actionLabel?: string } = {}) {
  const { t } = useI18n();
  // Login flow extracted to `useCloudSignIn` (2026 refactor: item 1/OD-2) so
  // `ShareSignInButton` can drive the same flow through a real button; this
  // component's own rendering/behavior below is unchanged.
  const { state, status, begin, cancel } = useCloudSignIn({ onLoginSuccess });
  const signing = state === 'signing';
  const [compactEntry, setCompactEntry] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 1100px)');
    const update = () => setCompactEntry(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);


  // The "sign-in page didn't open?" line is a fallback: it waits a few
  // seconds into the attempt (the browser usually opens on its own), unless
  // the daemon already reports the browser failed to open. Same rule as the
  // onboarding welcome screen.
  const [activationHintDue, setActivationHintDue] = useState(false);
  useEffect(() => {
    if (!signing) {
      setActivationHintDue(false);
      return;
    }
    const timer = window.setTimeout(() => setActivationHintDue(true), ACTIVATION_HINT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [signing]);

  // The pitch and the call-to-action slot stay put across states, so the
  // card neither jumps in height nor shows a second "Sign in" while one is
  // already running: the button itself turns into the pending indicator.
  const pitch = (
    <div className="entry-local-mode-tip__pitch">
      <strong className="entry-local-mode-tip__title">
        <span className="entry-local-mode-tip__title-icon" aria-hidden><Icon name="sparkles" size={14} /></span>{t('entry.cloudCreditsTitle')}
      </strong>
      <p>{t('entry.cloudCreditsBody')}</p>
    </div>
  );

  const card = (
    <section
      role="button"
      tabIndex={signing ? -1 : 0}
      className={`${sharePrompt ? className ?? '' : `entry-local-mode-tip ${styles.card}`}${signing ? ' is-signing' : ''}`}
      onClick={() => {
        if (!signing) void begin();
      }}
      onKeyDown={(event) => {
        if (signing) return;
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        void begin();
      }}
      aria-label={actionLabel ?? t(sharePrompt ? 'settings.amrLogin' : 'entry.cloudCalloutTitle')}
      data-testid={sharePrompt ? 'share-cloud-signin' : 'entry-cloud-signin-tip'}
    >
      {sharePrompt ? null : pitch}
      {state === 'error' ? (
        <p className="entry-local-mode-tip__error" role="alert">
          {t('settings.amrLoginErrorCompact')}
        </p>
      ) : null}
      <div className="entry-local-mode-tip__head">
        <span
          className={`entry-local-mode-tip__login-badge${signing ? ' is-pending' : ''}`}
          role={signing ? 'status' : undefined}
        >
          <Icon name={signing ? 'spinner' : 'log-in'} size={14} />
          <span>{signing ? t('settings.amrSigningIn') : actionLabel ?? t(sharePrompt ? 'settings.amrLogin' : 'entry.cloudCreditsCta')}</span>
        </span>
      </div>
      {signing ? (
        <>
          {status?.activationUrl && (activationHintDue || status.browserOpenFailed) ? (
            <p className="entry-local-mode-tip__activation">
              <span>
                {status.browserOpenFailed
                  ? <AmrActivationHintText browserOpenFailed />
                  : t('settings.onboardingActivationPrompt')}
              </span>
              <a
                className="entry-local-mode-tip__activation-link"
                href={status.activationUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(event) => event.stopPropagation()}
              >
                {status.browserOpenFailed
                  ? t('settings.amrActivationOpen')
                  : t('settings.onboardingActivationReopen')}
                <Icon name="external-link" size={11} />
              </a>
            </p>
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
      ) : null}
    </section>
  );
  // The compact source design keeps this entry reachable while the rail is hidden.
  return compactEntry && !sharePrompt ? createPortal(card, document.body) : card;
}
