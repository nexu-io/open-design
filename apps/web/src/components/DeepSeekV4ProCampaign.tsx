import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, Dialog } from '@open-design/components';
import {
  DEEPSEEK_V4_PRO_CAMPAIGN as campaign,
  DEEPSEEK_V4_PRO_CAMPAIGN_REVIEW_PARAM,
  formatDeepSeekV4ProCampaignMockRemaining,
  isDeepSeekV4ProCampaignReview,
  type DeepSeekV4ProCampaignAudience,
} from '../campaigns/deepseek-v4-pro';
import { useWorkspaceContext } from '../collab/useWorkspaceContext';
import {
  amrPlansUrlForProfile,
  amrPlansUrlForWorkspace,
} from '../runtime/amr-guidance';
import { useAnalytics } from '../analytics/provider';
import { attributedAmrUrl, recordAmrEntry } from '../analytics/amr-attribution';
import {
  trackDeepSeekCampaignModalClick,
  trackDeepSeekCampaignModalSurfaceView,
} from '../analytics/events';
import { Icon } from './Icon';
import styles from './DeepSeekV4ProCampaign.module.css';
import { useI18n } from '../i18n';
import { getDeepSeekV4ProCopy } from '../campaigns/deepseek-v4-pro-copy';

const SEEN_KEY = `open-design:campaign-seen:${campaign.id}`;
const REVIEW_COUNTDOWN_DURATION_MS = 14 * 24 * 60 * 60 * 1000;

interface Props {
  /**
   * paid = an active personal/team subscription; unpaid = no active
   * subscription (including users who previously recharged their wallet).
   */
  audience: DeepSeekV4ProCampaignAudience;
}

function shouldForceCampaignReview(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('campaign')
    === DEEPSEEK_V4_PRO_CAMPAIGN_REVIEW_PARAM;
}

function hasSeenCampaign(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function markCampaignSeen(): void {
  try {
    window.localStorage.setItem(SEEN_KEY, '1');
  } catch {
    // Campaign frequency control is advisory; storage failures must not block Home.
  }
}

function focusModelSwitcher(): void {
  const chip = document.querySelector<HTMLButtonElement>(
    '[data-testid="inline-model-switcher-chip"]',
  );
  if (!chip) return;
  chip.click();
  chip.setAttribute('data-campaign-highlight', 'true');
  window.setTimeout(() => chip.removeAttribute('data-campaign-highlight'), 1_500);
}

export function DeepSeekV4ProCampaign({ audience }: Props) {
  const { locale } = useI18n();
  const copy = getDeepSeekV4ProCopy(locale);
  const analytics = useAnalytics();
  const { context: workspaceContext } = useWorkspaceContext();
  const [modalOpen, setModalOpen] = useState(false);
  const [countdownNow, setCountdownNow] = useState(() => Date.now());
  const countdownEndsAtRef = useRef(Date.now() + REVIEW_COUNTDOWN_DURATION_MS);
  const dialogId = useId();
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (audience === 'unknown') return;
    if (shouldForceCampaignReview() || !hasSeenCampaign()) setModalOpen(true);
  }, [audience]);

  useEffect(() => {
    if (!modalOpen) return;
    trackDeepSeekCampaignModalSurfaceView(analytics.track, {
      page_name: 'home',
      area: 'deepseek_campaign_modal',
      element: 'modal',
      campaign_id: 'deepseek_v4_pro',
      user_state: audience === 'paid' ? 'paid' : 'unpaid',
    });
    const panel = document.getElementById(dialogId);
    if (!panel) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousBodyOverflow = document.body.style.overflow;
    panel.tabIndex = -1;
    panel.focus({ preventScroll: true });
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [analytics.track, audience, dialogId, modalOpen]);

  useEffect(() => {
    if (!modalOpen) return;
    const openedAt = Date.now();
    const search = typeof window === 'undefined' ? null : window.location.search;
    countdownEndsAtRef.current = isDeepSeekV4ProCampaignReview(search)
      ? openedAt + REVIEW_COUNTDOWN_DURATION_MS
      : Date.parse(campaign.window.endAtExclusive);
    setCountdownNow(openedAt);
    const countdownTimer = window.setInterval(() => setCountdownNow(Date.now()), 1_000);
    return () => window.clearInterval(countdownTimer);
  }, [modalOpen]);

  const dismissModal = () => {
    markCampaignSeen();
    setModalOpen(false);
  };

  const paid = audience === 'paid';
  const presentation = paid
    ? { eyebrow: copy.paidEyebrow, status: copy.paidStatus, cta: copy.paidCta }
    : { eyebrow: copy.unpaidEyebrow, status: copy.unpaidStatus, cta: copy.unpaidCta };
  const trackModalClick = (element: 'close' | 'later' | 'use_now' | 'upgrade') => {
    trackDeepSeekCampaignModalClick(analytics.track, {
      page_name: 'home',
      area: 'deepseek_campaign_modal',
      element,
      campaign_id: 'deepseek_v4_pro',
      user_state: paid ? 'paid' : 'unpaid',
    });
  };
  const closeModal = () => {
    trackModalClick('close');
    dismissModal();
  };
  const postponeModal = () => {
    trackModalClick('later');
    dismissModal();
  };
  const takeAction = () => {
    trackModalClick(paid ? 'use_now' : 'upgrade');
    dismissModal();
    if (paid) {
      window.setTimeout(focusModelSwitcher, 0);
      return;
    }
    const plansUrl =
      amrPlansUrlForWorkspace(undefined, workspaceContext?.workspaceId)
      ?? amrPlansUrlForProfile(undefined);
    const attribution = recordAmrEntry(
      analytics.track,
      'deepseek_unpaid_modal',
      new Date(),
      {
        campaignId: 'deepseek_v4_pro',
        conversionSource: 'deepseek_unpaid_modal',
      },
    );
    window.open(
      attributedAmrUrl(plansUrl, attribution),
      '_blank',
      'noopener,noreferrer',
    );
  };

  if (!modalOpen || audience === 'unknown' || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <Dialog
      id={dialogId}
      ariaLabelledBy={titleId}
      ariaDescribedBy={descriptionId}
      onClose={closeModal}
      closeOnEscape
      className={styles.panel}
      backdropClassName={styles.backdrop}
      data-testid="deepseek-v4-pro-campaign-dialog"
    >
      <Button
        variant="ghost"
        size="icon"
        className={styles.close}
        aria-label={copy.close}
        onClick={closeModal}
      >
        <Icon name="close" size={17} strokeWidth={1.8} />
      </Button>

      <p className={styles.eyebrow}>{presentation.eyebrow}</p>
      <h2 id={titleId} className={styles.title}>{copy.headline}</h2>
      <p id={descriptionId} className={styles.lead}>{copy.description}</p>

      <div className={styles.modelCard}>
        <span className={styles.modelMark} aria-hidden="true">DS</span>
        <span className={styles.modelCopy}>
          <strong>{copy.benefit}</strong>
          <small>{presentation.status}</small>
        </span>
        <span className={paid ? styles.available : styles.locked}>
          {paid ? copy.unlocked : copy.locked}
        </span>
      </div>

      <div className={styles.countdown} aria-label={copy.countdown}>
        <span className={styles.countdownLabel}>{copy.countdown}</span>
        <strong data-testid="deepseek-v4-pro-campaign-countdown">
          {formatDeepSeekV4ProCampaignMockRemaining(
            countdownEndsAtRef.current - countdownNow,
          )}
        </strong>
        <small>{copy.week}</small>
      </div>

      <p className={styles.boundary}>{copy.boundary}</p>
      <div className={styles.actions}>
        {paid ? (
          <Button variant="ghost" className={styles.laterAction} onClick={postponeModal}>
            {copy.later}
          </Button>
        ) : null}
        <Button className={styles.primaryAction} onClick={takeAction}>
          {presentation.cta}
        </Button>
      </div>
    </Dialog>,
    document.body,
  );
}
