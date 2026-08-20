import { useId } from 'react';
import { Button, VisuallyHidden } from '@open-design/components';
import { useAnalytics } from '../analytics/provider';
import { getResolvedDeviceId } from '../analytics/client';
import {
  amrHandoffDeviceId,
  attributedAmrUrl,
  recordAmrEntry,
} from '../analytics/amr-attribution';
import { useT } from '../i18n';
import { amrPlansUrlForProfile } from '../runtime/amr-guidance';
import { Icon } from './Icon';
import styles from './AmrArtifactUpgradeHomeCard.module.css';

interface Props {
  profile: string | null;
  metricsConsent: boolean;
  installationId: string | null | undefined;
  onDismiss: () => void;
  onViewArtifact: () => void;
}

export function AmrArtifactUpgradeHomeCard({
  profile,
  metricsConsent,
  installationId,
  onDismiss,
  onViewArtifact,
}: Props) {
  const t = useT();
  const analytics = useAnalytics();
  const titleId = useId();
  const descriptionId = useId();

  const openPlans = () => {
    const attribution = recordAmrEntry(
      analytics.track,
      'home_artifact_upgrade',
      new Date(),
      { metricsConsent },
    );
    const deviceId = amrHandoffDeviceId({
      metricsConsent,
      resolvedDeviceId: getResolvedDeviceId(),
      installationId,
    });
    window.open(
      attributedAmrUrl(amrPlansUrlForProfile(profile), attribution, deviceId),
      '_blank',
      'noopener,noreferrer',
    );
    onDismiss();
  };

  const viewArtifact = () => {
    onViewArtifact();
    onDismiss();
  };

  return (
    <section
      className={styles.card}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      data-testid="amr-artifact-upgrade-home-card"
    >
      <span className={styles.icon} aria-hidden="true">
        <Icon name="sparkles" size={16} strokeWidth={1.7} />
      </span>
      <div className={styles.copy}>
        <h2 id={titleId} className={styles.title}>
          {t('chat.amrArtifactUpgrade.homeTitle')}
        </h2>
        <p id={descriptionId} className={styles.message}>
          {t('chat.amrArtifactUpgrade.homeMessage')}
        </p>
      </div>
      <div className={styles.actions}>
        <Button
          variant="ghost"
          className={styles.secondaryCta}
          onClick={viewArtifact}
          data-testid="amr-artifact-upgrade-home-artifact"
        >
          {t('chat.amrArtifactUpgrade.homeArtifactCta')}
        </Button>
        <Button
          variant="primary"
          className={styles.cta}
          onClick={openPlans}
          data-testid="amr-artifact-upgrade-home-plans"
        >
          {t('chat.amrArtifactUpgrade.homePlansCta')}
          <VisuallyHidden>{` (${t('common.openInNewTab')})`}</VisuallyHidden>
        </Button>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className={styles.close}
        aria-label={t('common.close')}
        onClick={onDismiss}
      >
        <Icon name="close" size={12} strokeWidth={1.8} />
      </Button>
    </section>
  );
}
