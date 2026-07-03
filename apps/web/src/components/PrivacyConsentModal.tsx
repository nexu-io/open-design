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
  onShare: () => void;
  onDecline: () => void;
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
 * Stays mounted until the user explicitly shares or declines. The
 * downstream telemetry gate keys off `privacyDecisionAt`, so the banner
 * records a concrete privacy decision instead of a dismiss-only state.
 */
export function PrivacyConsentModal({ onShare, onDecline }: Props): JSX.Element {
  const t = useT();
  const analytics = useAnalytics();
  return (
    <div className="privacy-consent-banner" role="region" aria-labelledby="privacy-consent-title">
      <div className="privacy-consent-banner-head">
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

      <p className="hint privacy-consent-banner-footer">{t('settings.privacyConsentFooter')}</p>

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
            onDecline();
          }}
        >
          {t('settings.privacyConsentDecline')}
        </button>
        <button
          type="button"
          className="privacy-consent-action privacy-consent-action--primary"
          onClick={() => {
            trackPrivacyModalClick(analytics.track, {
              page_name: 'home',
              area: 'privacy_modal',
              element: 'yes',
            });
            onShare();
          }}
        >
          {t('settings.privacyConsentShare')}
        </button>
      </div>
    </div>
  );
}
