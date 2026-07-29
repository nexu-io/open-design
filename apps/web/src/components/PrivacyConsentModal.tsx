import { useAnalytics } from '../analytics/provider';
import { trackPrivacyModalClick } from '../analytics/events';
import { useT } from '../i18n';
import { Icon } from './Icon';

/**
 * Canonical location of the full privacy policy. Kept as a single named
 * constant so it can be repointed (e.g. to a hosted page) without touching
 * markup. `PRIVACY.md` documents the same data handling the modal discloses.
 */
const PRIVACY_POLICY_URL = 'https://github.com/nexu-io/open-design/blob/main/PRIVACY.md';

interface Props {
  /** Acknowledges the disclosure. Implies default opt-in; the host opts the
   *  user into the same telemetry surface the previous "Share usage data"
   *  button enabled. The user can flip the toggle off any time from
   *  Settings → Privacy, which the banner footer says explicitly. */
  onAccept: () => void;
}

/**
 * First-run privacy disclosure banner.
 *
 * Anchored to the bottom-right of the viewport (cookie-consent style)
 * so it's prominently visible without blocking the underlying app —
 * the user can move around and read while deciding. On narrow viewports
 * it stretches to a bottom-edge bar (see `.privacy-consent-banner` in
 * index.css) so it doesn't crowd content on phones.
 *
 * Single "I get it" action: the product runs with telemetry on by
 * default. The banner is an informed-disclosure surface, not a binary
 * consent picker — the user reads what's collected and dismisses with
 * an acknowledgement. The footer states the default explicitly and
 * points at Settings → Privacy as the off switch, so the user keeps a
 * one-click path to opt out at any time. The matching Settings UI
 * (PrivacySection.tsx) still exposes both Share and Don't share buttons
 * for users who arrive there before this banner has been shown.
 *
 * Stays mounted until the user clicks I get it — there is no
 * dismiss-without-acknowledgement button on purpose. The downstream
 * telemetry gate keys off `privacyDecisionAt`, so an "ambiguous
 * not-yet-decided" state would be hard to interpret.
 */
export function PrivacyConsentModal({ onAccept }: Props): JSX.Element {
  const t = useT();
  const analytics = useAnalytics();
  // P0 — the first-launch privacy banner ships with a single "I get it"
  // action that implicitly accepts; we map that to `yes` on the contract's
  // `privacy_modal` ui_click. The contract enum has `yes|no` but no
  // surface_view counterpart, so this is the only event the surface emits.
  return (
    <div className="privacy-consent-banner" role="region" aria-labelledby="privacy-consent-title">
      <div className="privacy-consent-banner-head">
        <span className="kicker">{t('settings.privacy')}</span>
        <h3 id="privacy-consent-title">{t('settings.privacyConsentKicker')}</h3>
      </div>

      <p className="privacy-consent-banner-lead">{t('settings.privacyConsentLead')}</p>

      <dl className="settings-privacy-disclosure">
        <div>
          <dt>{t('settings.privacyMetrics')}</dt>
          <dd>{t('settings.privacyMetricsHint')}</dd>
        </div>
        <div>
          <dt>{t('settings.privacyContent')}</dt>
          <dd>{t('settings.privacyContentHint')}</dd>
        </div>
      </dl>

      <p className="hint privacy-consent-banner-footer">{t('settings.privacyConsentBannerFooter')}</p>

      <a
        className="privacy-consent-policy-link"
        href={PRIVACY_POLICY_URL}
        target="_blank"
        rel="noopener noreferrer"
      >
        <Icon name="external-link" size={13} />
        <span>{t('settings.privacyConsentPolicyLink')}</span>
      </a>

      <div
        className="privacy-consent-actions"
        role="group"
        aria-label={t('settings.privacyConsentKicker')}
      >
        <button
          type="button"
          className="privacy-consent-action"
          onClick={() => {
            trackPrivacyModalClick(analytics.track, {
              page_name: 'home',
              area: 'privacy_modal',
              element: 'yes',
            });
            onAccept();
          }}
        >
          {t('settings.privacyConsentAccept')}
        </button>
      </div>
    </div>
  );
}
