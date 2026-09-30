import { VisuallyHidden } from '@open-design/components';
import { Icon } from './Icon';
import { useI18n } from '../i18n';
import { useCloudSignIn } from './use-cloud-sign-in';

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

  const headBadge = (
    <div className="entry-local-mode-tip__head">
      <span className="entry-local-mode-tip__login-badge">
        <Icon name="log-in" size={14} />
        {actionLabel ?? t('settings.amrLogin')}
      </span>
    </div>
  );

  return (
    <section
      role="button"
      tabIndex={signing ? -1 : 0}
      className={`${sharePrompt ? className ?? '' : 'entry-local-mode-tip'}${signing ? ' is-signing' : ''}`}
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
      ) : sharePrompt ? (
        headBadge
      ) : (
        <>
          <p>{t('entry.cloudCalloutBody')}</p>
          {headBadge}
        </>
      )}
    </section>
  );
}
