import { useAnalytics } from '../analytics/provider';
import { trackPrivacyModalClick } from '../analytics/events';
import { useT } from '../i18n';
import { Icon } from './Icon';

/**
 * Canonical location of the full privacy policy. Kept as a single named
 * constant so it can be repointed without touching markup. The hosted
 * page at open-design.ai/amr/privacy is the source of truth covering the
 * desktop app, AMR cloud service, and marketing site; the in-repo
 * `PRIVACY.md` is a snapshot of the same disclosures.
 */
const PRIVACY_POLICY_URL = 'https://open-design.ai/amr/privacy';

interface Props {
  /** Opt the user IN to telemetry (metrics + content). */
  onAccept: () => void;
  /** Opt the user OUT of telemetry. The banner closes and a
   *  `privacyDecisionAt` is recorded so this surface does not reappear. */
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
 * Binary opt-in: telemetry stays OFF until the user clicks "Share usage
 * data". "Not now" closes the banner with telemetry remaining off and
 * still records `privacyDecisionAt` so the banner does not reappear. A
 * default-on posture is not defensible under GDPR / ePrivacy / LGPD /
 * PIPA, so the only legally clean affirmative-action shape is two
 * symmetric choices with the privacy-preserving option no harder than
 * the share one.
 *
 * Stays mounted until the user picks an option — there is no neutral
 * dismiss path on purpose. The downstream telemetry gate keys off
 * `privacyDecisionAt`, so an "ambiguous not-yet-decided" state would be
 * hard to interpret.
 */
export function PrivacyConsentModal({ onAccept, onDecline }: Props): JSX.Element {
  const t = useT();
  const analytics = useAnalytics();
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
              element: 'no',
            });
            onDecline();
          }}
        >
          {t('settings.privacyConsentDecline')}
        </button>
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
          {t('settings.privacyConsentShare')}
        </button>
      </div>
    </div>
  );
}
