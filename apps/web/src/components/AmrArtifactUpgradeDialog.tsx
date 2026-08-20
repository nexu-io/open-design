import { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, Dialog, VisuallyHidden } from '@open-design/components';
import { useT } from '../i18n';
import { useAnalytics } from '../analytics/provider';
import { getResolvedDeviceId } from '../analytics/client';
import {
  amrHandoffDeviceId,
  attributedAmrUrl,
  recordAmrEntry,
} from '../analytics/amr-attribution';
import { amrPlansUrlForProfile } from '../runtime/amr-guidance';
import { Icon, type IconName } from './Icon';
import styles from './AmrArtifactUpgradeDialog.module.css';

interface Props {
  profile: string | null;
  metricsConsent: boolean;
  installationId: string | null | undefined;
  onClose: () => void;
  onContinue: () => void;
}

const BENEFITS: ReadonlyArray<{
  key:
    | 'chat.amrArtifactUpgrade.benefit1'
    | 'chat.amrArtifactUpgrade.benefit2'
    | 'chat.amrArtifactUpgrade.benefit3'
    | 'chat.amrArtifactUpgrade.benefit4';
  icon: IconName;
}> = [
  { key: 'chat.amrArtifactUpgrade.benefit1', icon: 'sparkles' },
  { key: 'chat.amrArtifactUpgrade.benefit2', icon: 'blocks' },
  { key: 'chat.amrArtifactUpgrade.benefit3', icon: 'layers-filled' },
  { key: 'chat.amrArtifactUpgrade.benefit4', icon: 'star' },
];

const OFFER_CYCLE_MS = 7 * 24 * 60 * 60 * 1000;
const OFFER_CYCLE_ANCHOR_MS = Date.UTC(2026, 6, 13);

interface OfferCountdown {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

function recurringOfferCountdown(now: number): OfferCountdown {
  const elapsed =
    (((now - OFFER_CYCLE_ANCHOR_MS) % OFFER_CYCLE_MS) + OFFER_CYCLE_MS) % OFFER_CYCLE_MS;
  const remainingMs = elapsed === 0 ? OFFER_CYCLE_MS : OFFER_CYCLE_MS - elapsed;
  let remainingSeconds = Math.ceil(remainingMs / 1000);
  const days = Math.floor(remainingSeconds / 86_400);
  remainingSeconds -= days * 86_400;
  const hours = Math.floor(remainingSeconds / 3_600);
  remainingSeconds -= hours * 3_600;
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds - minutes * 60;
  return { days, hours, minutes, seconds };
}

function twoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

export function AmrArtifactUpgradeDialog({
  profile,
  metricsConsent,
  installationId,
  onClose,
  onContinue,
}: Props) {
  const t = useT();
  const analytics = useAnalytics();
  const dialogId = useId();
  const titleId = useId();
  const descriptionId = useId();
  const [offerCountdown, setOfferCountdown] = useState<OfferCountdown | null>(null);

  useEffect(() => {
    const updateCountdown = () => setOfferCountdown(recurringOfferCountdown(Date.now()));
    updateCountdown();
    const timer = window.setInterval(updateCountdown, 1_000);
    document.addEventListener('visibilitychange', updateCountdown);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', updateCountdown);
    };
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const panel = document.getElementById(dialogId);
    const backdrop = panel?.parentElement;
    if (!panel || !backdrop) return;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousBodyOverflow = document.body.style.overflow;
    const inertSiblings = Array.from(document.body.children).filter(
      (element) => element !== backdrop && !element.hasAttribute('inert'),
    );
    for (const element of inertSiblings) element.setAttribute('inert', '');
    document.body.style.overflow = 'hidden';

    panel.tabIndex = -1;
    panel.focus({ preventScroll: true });
    const handleTab = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )).filter(
        (element) => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true',
      );
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;
      if (active === panel) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }
      if (event.shiftKey && (active === first || !panel.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !panel.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleTab);

    return () => {
      document.removeEventListener('keydown', handleTab);
      for (const element of inertSiblings) element.removeAttribute('inert');
      document.body.style.overflow = previousBodyOverflow;
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [dialogId]);

  const openPlans = () => {
    const attribution = recordAmrEntry(
      analytics.track,
      'artifact_success_upgrade',
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
    onClose();
  };

  const offerDays = offerCountdown
    ? t('common.daysShort', { n: twoDigits(offerCountdown.days) })
    : '--';
  const offerTime = offerCountdown
    ? `${twoDigits(offerCountdown.hours)}:${twoDigits(offerCountdown.minutes)}:${twoDigits(offerCountdown.seconds)}`
    : '--:--:--';
  const offerAriaLabel = `${t('chat.amrArtifactUpgrade.countdownLabel')} ${offerDays} ${offerTime}`;

  const dialog = (
    <Dialog
      id={dialogId}
      role="dialog"
      ariaLabelledBy={titleId}
      ariaDescribedBy={descriptionId}
      onClose={onClose}
      closeOnEscape
      className={styles.panel}
      backdropClassName={styles.backdrop}
      data-testid="amr-artifact-upgrade-dialog"
    >
      <Button
        variant="ghost"
        size="icon"
        className={styles.closeButton}
        aria-label={t('common.close')}
        onClick={onClose}
        data-testid="amr-artifact-upgrade-close"
      >
        <Icon name="close" size={17} strokeWidth={1.8} />
      </Button>
      <div className={styles.visual} aria-hidden="true">
        <img
          className={styles.visualImage}
          src="/upgrade/creative-capacity-warm.jpg"
          alt=""
          width={575}
          height={900}
          decoding="async"
          draggable={false}
          data-testid="amr-artifact-upgrade-art"
        />
      </div>
      <div className={styles.content}>
        <div className={styles.offerBanner} data-testid="amr-artifact-upgrade-offer">
          <strong className={styles.offerTitle}>
            {t('chat.amrArtifactUpgrade.promoBanner')}
          </strong>
          <time
            className={styles.offerTimer}
            role="timer"
            aria-live="off"
            aria-label={offerAriaLabel}
          >
            <span className={styles.offerTimerLabel}>
              {t('chat.amrArtifactUpgrade.countdownLabel')}
            </span>
            <span className={styles.offerTimerValue} dir="ltr">
              <span data-testid="amr-artifact-upgrade-offer-days">{offerDays}</span>{' '}
              <span data-testid="amr-artifact-upgrade-offer-time">{offerTime}</span>
            </span>
          </time>
        </div>
        <h2 id={titleId} className={styles.title}>
          {t('chat.amrArtifactUpgrade.title')}
        </h2>
        <p id={descriptionId} className={styles.message}>
          {t('chat.amrArtifactUpgrade.message')}
        </p>
        <ul className={styles.benefits}>
          {BENEFITS.map(({ key, icon }) => (
            <li key={key} className={styles.benefit}>
              <span className={styles.benefitIcon} aria-hidden="true">
                <Icon name={icon} size={15} strokeWidth={1.8} />
              </span>
              <span>{t(key)}</span>
            </li>
          ))}
        </ul>
        <div className={styles.actions}>
          <Button
            variant="primary"
            className={styles.cta}
            onClick={openPlans}
            data-testid="amr-artifact-upgrade-plans"
          >
            <span>{t('chat.amrArtifactUpgrade.plansCta')}</span>
            <VisuallyHidden>
              {` (${t('common.openInNewTab')})`}
            </VisuallyHidden>
          </Button>
          <Button
            variant="ghost"
            className={styles.later}
            onClick={onContinue}
            data-testid="amr-artifact-upgrade-later"
          >
            {t('chat.amrArtifactUpgrade.laterCta')}
          </Button>
        </div>
      </div>
    </Dialog>
  );

  if (typeof document === 'undefined') return dialog;
  return createPortal(dialog, document.body);
}
