import type { CSSProperties } from 'react';
import { useT } from '../i18n';

interface Props {
  /** Affirmative consent (Share usage data). */
  onShare: () => void;
  /** Decline (Don't share). */
  onDecline: () => void;
}

/**
 * First-run privacy consent banner.
 *
 * Anchored to the bottom-right of the viewport (cookie-consent style)
 * so it's prominently visible without blocking the underlying app —
 * the user can move around and read while deciding. The two action
 * buttons share an equal-prominence seg-control so the reject path
 * is not visually de-emphasised, the EDPB equal-prominence requirement
 * under GDPR.
 *
 * Stays mounted until the user picks Share or Don't share — there is
 * no dismiss-without-choice button on purpose. Telemetry decisions
 * downstream key off whether `installationId` is set, so an "ambiguous
 * not-yet-decided" state would be hard to interpret.
 */
export function PrivacyConsentModal({ onShare, onDecline }: Props): JSX.Element {
  const t = useT();
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

      <p className="hint privacy-consent-banner-footer">{t('settings.privacyConsentFooter')}</p>

      <div
        className="seg-control"
        role="group"
        aria-label={t('settings.privacyConsentKicker')}
        style={{ ['--seg-cols' as string]: 2 } as CSSProperties}
      >
        <button type="button" className="seg-btn active" onClick={onShare}>
          <span className="seg-title">{t('settings.privacyConsentShare')}</span>
        </button>
        <button type="button" className="seg-btn" onClick={onDecline}>
          <span className="seg-title">{t('settings.privacyConsentDecline')}</span>
        </button>
      </div>
    </div>
  );
}
