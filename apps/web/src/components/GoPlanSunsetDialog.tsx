import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, Dialog } from '@open-design/components';

import { attributedAmrUrl, recordAmrEntry } from '../analytics/amr-attribution';
import {
  trackGoPlanSunsetModalClick,
  trackGoPlanSunsetModalSurfaceView,
} from '../analytics/events';
import { useAnalytics } from '../analytics/provider';
import { useI18n } from '../i18n';
import styles from './GoPlanSunsetDialog.module.css';

const GO_PLAN_PRICING_URL =
  'https://open-design.ai/amr/dashboard?source=open_design&billing=plan';

type DismissElement = 'acknowledge' | 'close';

interface Props {
  active: boolean;
  currentPlanId?: string;
  metricsConsent?: boolean;
  onDismiss: (element: DismissElement) => Promise<void>;
}

/** Client-owned one-off announcement. Remote message content only selects this
 * preset through its allowlisted message key; it never controls this dialog's
 * copy, destination, or analytics dimensions. */
export function GoPlanSunsetDialog({
  active,
  currentPlanId = 'unknown',
  metricsConsent = false,
  onDismiss,
}: Props) {
  const { locale, t } = useI18n();
  const analytics = useAnalytics();
  const [dismissing, setDismissing] = useState(false);
  const [dismissError, setDismissError] = useState(false);
  const exposureTrackedRef = useRef(false);
  const dialogId = useId();
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!active) {
      exposureTrackedRef.current = false;
      setDismissing(false);
      setDismissError(false);
      return;
    }
    if (exposureTrackedRef.current) return;
    exposureTrackedRef.current = true;
    trackGoPlanSunsetModalSurfaceView(analytics.track, {
      page_name: 'home',
      area: 'go_plan_sunset_modal',
      element: 'modal',
      campaign_id: 'go_plan_sunset_202608',
      announcement_version: '2026_08_25',
      delivery_mode: 'targeted',
      current_plan_id: currentPlanId,
      locale,
    });
  }, [active, analytics.track, currentPlanId, locale]);

  useEffect(() => {
    if (!active || typeof document === 'undefined') return;
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
      const focused = document.activeElement;
      if (focused === panel) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && (focused === first || !panel.contains(focused))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (focused === last || !panel.contains(focused))) {
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
  }, [active, dialogId]);

  const trackClick = useCallback((element: DismissElement | 'view_other_subscriptions') => {
    trackGoPlanSunsetModalClick(analytics.track, {
      page_name: 'home',
      area: 'go_plan_sunset_modal',
      element,
      ...(element === 'close' ? { close_method: 'unknown' as const } : {}),
      campaign_id: 'go_plan_sunset_202608',
      announcement_version: '2026_08_25',
      delivery_mode: 'targeted',
      current_plan_id: currentPlanId,
      locale,
    });
  }, [analytics.track, currentPlanId, locale]);

  const dismiss = useCallback(async (element: DismissElement) => {
    if (dismissing) return;
    trackClick(element);
    setDismissing(true);
    setDismissError(false);
    try {
      await onDismiss(element);
    } catch {
      setDismissError(true);
      setDismissing(false);
    }
  }, [dismissing, onDismiss, trackClick]);

  const viewSubscriptions = () => {
    if (dismissing) return;
    trackClick('view_other_subscriptions');
    const attribution = recordAmrEntry(
      analytics.track,
      'go_plan_sunset_modal',
      new Date(),
      {
        metricsConsent,
        campaignId: 'go_plan_sunset_202608',
        conversionSource: 'go_plan_sunset_modal',
      },
    );
    window.open(
      attributedAmrUrl(GO_PLAN_PRICING_URL, attribution),
      '_blank',
      'noopener,noreferrer',
    );
  };

  if (!active || typeof document === 'undefined') return null;

  return createPortal(
    <Dialog
      id={dialogId}
      role="alertdialog"
      ariaLabelledBy={titleId}
      ariaDescribedBy={descriptionId}
      onClose={() => void dismiss('close')}
      closeOnBackdrop={!dismissing}
      closeOnEscape={!dismissing}
      className={styles.panel}
      backdropClassName={styles.backdrop}
      data-testid="go-plan-sunset-dialog"
    >
      <Button
        aria-label={t('goPlanSunset.closeAria')}
        className={styles.closeButton}
        disabled={dismissing}
        size="icon"
        onClick={() => void dismiss('close')}
      >
        <span aria-hidden="true">×</span>
      </Button>

      <div className={styles.copyPanel}>
        <h2 id={titleId} className={styles.title}>{t('goPlanSunset.title')}</h2>
        <p id={descriptionId} className={styles.subtitle}>
          {t('goPlanSunset.subtitle')}
        </p>

        <section className={styles.announcement} aria-label={t('goPlanSunset.decisionsAria')}>
          <p className={styles.announcementIntro}>{t('goPlanSunset.decisionsIntro')}</p>
          <ol className={styles.decisions}>
          <li>
            <span className={styles.number}>1</span>
            <strong>{t('goPlanSunset.decisionStopSales')}</strong>
          </li>
          <li>
            <span className={styles.number}>2</span>
            <strong>{t('goPlanSunset.decisionRefund')}</strong>
          </li>
          <li>
            <span className={styles.number}>3</span>
            <strong>{t('goPlanSunset.decisionUnaffected')}</strong>
          </li>
          </ol>
        </section>

        <p className={styles.closing}>
          {t('goPlanSunset.closing')}
        </p>

        {dismissError ? (
          <p className={styles.error} role="alert">{t('goPlanSunset.dismissError')}</p>
        ) : null}

        <footer className={styles.actions}>
          <Button
            className={`${styles.action} ${styles.secondaryAction}`}
            disabled={dismissing}
            onClick={viewSubscriptions}
          >
            {t('goPlanSunset.viewSubscriptions')}
          </Button>
          <Button
            className={`${styles.action} ${styles.primaryAction}`}
            disabled={dismissing}
            variant="primary"
            onClick={() => void dismiss('acknowledge')}
          >
            {dismissing ? t('goPlanSunset.confirming') : t('goPlanSunset.acknowledge')}
          </Button>
        </footer>
      </div>
    </Dialog>,
    document.body,
  );
}
