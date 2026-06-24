import { useT } from '../i18n';

export function PrivacyTelemetryDisclosure(): JSX.Element {
  const t = useT();
  return (
    <dl className="settings-privacy-disclosure">
      <div>
        <dt>{t('settings.privacyMetrics')}</dt>
        <dd>{t('settings.privacyMetricsHint')}</dd>
      </div>
      <div>
        <dt>{t('settings.privacyContent')}</dt>
        <dd>{t('settings.privacyContentHint')}</dd>
      </div>
      <div>
        <dt>{t('settings.privacySafety')}</dt>
        <dd>{t('settings.privacySafetyHint')}</dd>
      </div>
    </dl>
  );
}

export function PrivacySafetyDisclosure(): JSX.Element {
  const t = useT();
  return (
    <div className="settings-subsection settings-privacy-safety-disclosure">
      <div className="section-head">
        <div>
          <h4>{t('settings.privacySafety')}</h4>
          <p className="hint">{t('settings.privacySafetyHint')}</p>
        </div>
      </div>
    </div>
  );
}
