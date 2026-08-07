import { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, Dialog } from '@open-design/components';
import {
  DEEPSEEK_V4_FLASH_CAMPAIGN as campaign,
  formatDeepSeekV4FlashCampaignCountdown,
  type DeepSeekV4FlashCampaignAudience,
} from '../campaigns/deepseek-v4-flash';
import { useWorkspaceContext } from '../collab/useWorkspaceContext';
import {
  amrPlansUrlForProfile,
  amrPlansUrlForWorkspace,
} from '../runtime/amr-guidance';
import { useAnalytics } from '../analytics/provider';
import { getResolvedDeviceId } from '../analytics/client';
import {
  amrHandoffDeviceId,
  attributedAmrUrl,
  recordAmrEntry,
} from '../analytics/amr-attribution';
import {
  trackDeepSeekCampaignModalClick,
  trackDeepSeekCampaignModalSurfaceView,
} from '../analytics/events';
import { useT } from '../i18n';
import { Icon } from './Icon';
import styles from './DeepSeekV4FlashCampaign.module.css';

const SEEN_KEY = `open-design:campaign-seen:${campaign.id}`;

interface Props {
  /**
   * paid = an active personal/team subscription; unpaid = no active
   * subscription (including users who previously recharged their wallet).
   */
  audience: DeepSeekV4FlashCampaignAudience;
  /**
   * Whether the home view is the ACTIVE entry view. EntryShell keeps HomeView
   * permanently mounted behind `display:none` while this dialog portals to
   * `document.body`, so without this gate the campaign would escape the home
   * view and interrupt projects/tasks/plugins/... routes. The requirement is
   * explicit: the modal shows on #/home only.
   */
  active?: boolean;
  /**
   * Performs the REAL workbench switch for the paid 立即使用 CTA (产品拍板
   * D5): agent to `amr`, model to the campaign model. EntryShell provides the
   * same onAgentChange/onAgentModelChange pair the InlineModelSwitcher
   * persists through.
   */
  onUseCampaignModel?: (agentId: string, modelId: string) => void;
  /**
   * Telemetry opt-in (config.telemetry.metrics). Gates the AMR analytics
   * mirror of the recorded entry AND the od_device_id on the plans URL —
   * the same treatment the workbench badge and the model-switcher upgrade
   * already apply to this campaign's other touchpoints.
   */
  metricsConsent?: boolean;
  /** config.installationId — the preferred consent-gated AMR join key. */
  installationId?: string | null;
}

function hasSeenCampaign(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    // Fail closed: when the store is unreadable (private mode, disabled
    // localStorage) `markCampaignSeen` cannot persist either, so answering
    // "unseen" would re-open the modal on every mount. The campaign promise
    // is one appearance per window — suppress instead of spamming.
    return true;
  }
}

function markCampaignSeen(): void {
  try {
    window.localStorage.setItem(SEEN_KEY, '1');
  } catch {
    // Campaign frequency control is advisory; storage failures must not block Home.
  }
}

/**
 * Visual confirmation of the switch `onUseCampaignModel` already performed:
 * pulse the composer's model chip. Deliberately no `chip.click()` — the model
 * is switched for real, so opening the picker would only ask the user to redo
 * a choice that has already been made.
 */
function highlightModelSwitcher(): void {
  const chip = document.querySelector<HTMLButtonElement>(
    '[data-testid="inline-model-switcher-chip"]',
  );
  if (!chip) return;
  chip.setAttribute('data-campaign-highlight', 'true');
  window.setTimeout(() => chip.removeAttribute('data-campaign-highlight'), 1_500);
}

export function DeepSeekV4FlashCampaign({
  audience,
  active = true,
  onUseCampaignModel,
  metricsConsent = false,
  installationId = null,
}: Props) {
  const t = useT();
  const analytics = useAnalytics();
  const { context: workspaceContext } = useWorkspaceContext();
  const [modalOpen, setModalOpen] = useState(false);
  const [countdownNow, setCountdownNow] = useState(() => Date.now());
  const dialogId = useId();
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!active) {
      // Leaving home is NOT a dismissal: close without marking the campaign
      // seen, so the next return to home within the window re-opens it.
      // (Also releases the body scroll lock the open effect installed.)
      setModalOpen(false);
      return;
    }
    if (audience === 'unknown') return;
    if (!hasSeenCampaign()) setModalOpen(true);
  }, [active, audience]);

  useEffect(() => {
    if (!modalOpen) return;
    trackDeepSeekCampaignModalSurfaceView(analytics.track, {
      page_name: 'home',
      area: 'deepseek_campaign_modal',
      element: 'modal',
      campaign_id: 'deepseek_v4_flash',
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
    // The countdown always runs against the real `window.endAtExclusive`
    // boundary (via formatDeepSeekV4FlashCampaignCountdown) — there is no
    // synthetic per-open countdown.
    setCountdownNow(Date.now());
    const countdownTimer = window.setInterval(() => setCountdownNow(Date.now()), 1_000);
    return () => window.clearInterval(countdownTimer);
  }, [modalOpen]);

  const dismissModal = () => {
    markCampaignSeen();
    setModalOpen(false);
  };

  const paid = audience === 'paid';
  const presentation = paid
    ? {
        eyebrow: t('campaign.deepseekV4Flash.paid.eyebrow'),
        status: t('campaign.deepseekV4Flash.paid.status'),
        cta: t('campaign.deepseekV4Flash.paid.cta'),
      }
    : {
        eyebrow: t('campaign.deepseekV4Flash.unpaid.eyebrow'),
        status: t('campaign.deepseekV4Flash.unpaid.status'),
        cta: t('campaign.deepseekV4Flash.unpaid.cta'),
      };
  const trackModalClick = (element: 'close' | 'later' | 'use_now' | 'upgrade') => {
    trackDeepSeekCampaignModalClick(analytics.track, {
      page_name: 'home',
      area: 'deepseek_campaign_modal',
      element,
      campaign_id: 'deepseek_v4_flash',
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
      // 产品拍板 D5: 立即使用 switches the workbench to the campaign model
      // for real; the chip pulse is feedback for a switch that happened.
      onUseCampaignModel?.('amr', campaign.modelId);
      window.setTimeout(highlightModelSwitcher, 0);
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
        metricsConsent,
        campaignId: 'deepseek_v4_flash',
        conversionSource: 'deepseek_unpaid_modal',
      },
    );
    const deviceId = amrHandoffDeviceId({
      metricsConsent,
      resolvedDeviceId: getResolvedDeviceId(),
      installationId,
    });
    window.open(
      attributedAmrUrl(plansUrl, attribution, deviceId),
      '_blank',
      'noopener,noreferrer',
    );
  };

  if (!active || !modalOpen || audience === 'unknown' || typeof document === 'undefined') {
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
      data-testid="deepseek-v4-flash-campaign-dialog"
    >
      <Button
        variant="ghost"
        size="icon"
        className={styles.close}
        aria-label={t('campaign.deepseekV4Flash.closeAria')}
        onClick={closeModal}
      >
        <Icon name="close" size={17} strokeWidth={1.8} />
      </Button>

      <p className={styles.eyebrow}>{presentation.eyebrow}</p>
      <h2 id={titleId} className={styles.title}>{t('campaign.deepseekV4Flash.headline')}</h2>
      <p id={descriptionId} className={styles.lead}>{t('campaign.deepseekV4Flash.description')}</p>

      <div className={styles.modelCard}>
        <span className={styles.modelMark} aria-hidden="true">DS</span>
        <span className={styles.modelCopy}>
          <strong>{t('campaign.deepseekV4Flash.benefit')}</strong>
          <small>{presentation.status}</small>
        </span>
        <span className={paid ? styles.available : styles.locked}>
          {paid ? t('campaign.deepseekV4Flash.unlocked') : t('campaign.deepseekV4Flash.locked')}
        </span>
      </div>

      <div className={styles.countdown} aria-label={t('campaign.deepseekV4Flash.countdownLabel')}>
        <span className={styles.countdownLabel}>{t('campaign.deepseekV4Flash.countdownLabel')}</span>
        <strong data-testid="deepseek-v4-flash-campaign-countdown">
          {formatDeepSeekV4FlashCampaignCountdown(countdownNow, t)}
        </strong>
        <small>
          {t('campaign.deepseekV4Flash.windowLabel')}
          {' · '}
          {t('campaign.deepseekV4Flash.weekFreeSuffix')}
        </small>
      </div>

      <p className={styles.boundary}>{t('campaign.deepseekV4Flash.boundary')}</p>
      <div className={styles.actions}>
        {paid ? (
          <Button variant="ghost" className={styles.laterAction} onClick={postponeModal}>
            {t('campaign.deepseekV4Flash.later')}
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
