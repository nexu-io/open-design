import { useT } from '../../i18n';
import { useCloudSignIn } from '../use-cloud-sign-in';
import { ShareButton, type ShareButtonVariant } from './ShareButton';
import styles from './ShareSignInButton.module.css';

/**
 * OD-2 (2026 refactor: item 1): a real `<button>` sign-in action for the
 * share panel, replacing `CloudSignInTip`'s `<section role="button">` (which
 * also nested a native `<button>` for cancel — two conflated interactive
 * roles). Reuses the SAME login flow via `useCloudSignIn` (extracted from
 * `CloudSignInTip` verbatim, so that component's own rendering/behavior is
 * unchanged for its other caller, the entry rail).
 *
 * Idle state renders ONLY the label — matching `signInPrimaryAction`/
 * `signInSecondaryAction`'s existing CSS, which hides the login-badge's icon
 * for the share-prompt case (`.entry-local-mode-tip__login-badge > svg {
 * display: none }`) — so idle screenshots stay identical. The signing/error
 * message now renders as a sibling BELOW the button instead of stuffed
 * inside its fixed 32px box (OD-2's flagged overflow risk); that shape is
 * new for the signing/error states, which no capture in this pass exercises.
 */
export function ShareSignInButton({ variant, actionLabel, onLoginSuccess }: {
  variant: ShareButtonVariant;
  actionLabel: string;
  onLoginSuccess?: () => void;
}) {
  const t = useT();
  const { state, status, begin, cancel } = useCloudSignIn({ onLoginSuccess });
  const signing = state === 'signing';

  return (
    <div className={styles.wrap}>
      <ShareButton
        variant={variant}
        type="button"
        disabled={signing}
        aria-busy={signing || undefined}
        className={signing ? 'is-signing' : undefined}
        data-testid="share-cloud-signin"
        onClick={() => {
          if (!signing) void begin();
        }}
      >
        {actionLabel}
      </ShareButton>
      {signing ? (
        <div className={styles.status} role="group">
          <p>{t('settings.amrSigningIn')}</p>
          {status?.activationUrl ? (
            <div className="amr-login-activation">
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
                >
                  {t('settings.amrActivationOpen')}
                </a>
              </div>
            </div>
          ) : null}
          <button type="button" className="entry-local-mode-tip__cancel" onClick={() => void cancel()}>
            {t('settings.amrCancelSignIn')}
          </button>
        </div>
      ) : state === 'error' ? (
        <p role="alert" className={styles.status}>{t('settings.amrLoginErrorCompact')}</p>
      ) : null}
    </div>
  );
}
