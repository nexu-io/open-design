import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, Dialog } from '@open-design/components';
import { useT } from '../i18n';
import { useAnalytics } from '../analytics/provider';
import { trackGoUpsellModalClick, trackGoUpsellModalSurfaceView } from '../analytics/events';
import { getResolvedDeviceId } from '../analytics/client';
import {
  amrHandoffDeviceId,
  attributedAmrUrl,
  recordAmrEntry,
} from '../analytics/amr-attribution';
import { Icon } from './Icon';
import styles from './AmrBalanceDialog.module.css';

/**
 * Go plan launch modal on the workbench home — marketing touchpoint #3.
 *
 * AUDIENCE: unpaid workspaces only. A paid workspace keeps the DeepSeek
 * campaign modal that is already live, so this component is never mounted for
 * them (the caller decides) and therefore emits no events at all. That is the
 * whole point of the split: a paying customer must not be shown an ad for a
 * cheaper plan (requirement doc, GMK-010).
 *
 * FREQUENCY: at most once per account for the whole campaign. Every dismissal
 * path — the × button, the backdrop, Esc — counts as "shown", because the user
 * has seen the offer either way; re-opening it on the next visit would read as
 * nagging, not as a second chance.
 *
 * The visuals deliberately reuse `AmrBalanceDialog.module.css`: same bleeding
 * banner image, centred title, benefits card and vertical action stack. Two
 * upgrade surfaces that look unrelated make the product feel assembled by
 * different teams.
 */

/** One row of the "what you get" card. */
const BENEFIT_KEYS = [
  'home.goUpsell.benefit1',
  'home.goUpsell.benefit2',
  'home.goUpsell.benefit3',
  'home.goUpsell.benefit4',
] as const;

interface Props {
  /**
   * Workbench Pricing deep link — `.../cloud/dashboard?workspaceId=…&billing=plan`,
   * built by `workspaceUpgradeUrl` so this CTA lands on exactly the plan
   * chooser every other upgrade affordance uses. Null when the caller cannot
   * authorize billing (team admin/member); the CTA is hidden rather than dead.
   */
  upgradeUrl: string | null;
  metricsConsent: boolean;
  installationId: string | null | undefined;
  /** Dismissal — the caller records "already shown" and unmounts. */
  onClose: (method: 'close_button' | 'backdrop' | 'esc') => void;
}

export function GoUpsellModal({
  upgradeUrl,
  metricsConsent,
  installationId,
  onClose,
}: Props): JSX.Element {
  const t = useT();
  const analytics = useAnalytics();
  const impressionSent = useRef(false);

  // One impression per mount. The ref guards React 18 StrictMode's double
  // effect in dev, which would otherwise double-count every open.
  useEffect(() => {
    if (impressionSent.current) return;
    impressionSent.current = true;
    trackGoUpsellModalSurfaceView(analytics.track, {
      page_name: 'home',
      area: 'go_upsell_modal',
      audience: 'unpaid',
      campaign_id: GO_CAMPAIGN_ID,
    });
  }, [analytics]);

  const dismiss = useCallback(
    (method: 'close_button' | 'backdrop' | 'esc') => {
      trackGoUpsellModalClick(analytics.track, {
        page_name: 'home',
        area: 'go_upsell_modal',
        element: 'close',
        audience: 'unpaid',
        method,
        campaign_id: GO_CAMPAIGN_ID,
      });
      onClose(method);
    },
    [analytics, onClose],
  );

  const openPlans = useCallback(() => {
    trackGoUpsellModalClick(analytics.track, {
      page_name: 'home',
      area: 'go_upsell_modal',
      element: 'primary_cta',
      audience: 'unpaid',
      campaign_id: GO_CAMPAIGN_ID,
    });
    // No result event here: the click IS this touchpoint's conversion, and the
    // purchase funnel downstream already reports its own steps.
    if (!upgradeUrl) return;
    // Same attribution handshake as every other Cloud handoff (balance gate,
    // avatar menu): record the amr_entry, forward the consent-gated device id,
    // then open the console. Skipping it would drop this campaign out of the
    // entry-source attribution the funnel is built on.
    const attribution = recordAmrEntry(analytics.track, 'home_go_upsell_modal', new Date(), {
      metricsConsent,
      campaignId: 'go_plan_launch',
    });
    const deviceId = amrHandoffDeviceId({
      metricsConsent,
      resolvedDeviceId: getResolvedDeviceId(),
      installationId,
    });
    window.open(
      attributedAmrUrl(upgradeUrl, attribution, deviceId),
      '_blank',
      'noopener,noreferrer',
    );
    onClose('close_button');
  }, [analytics, upgradeUrl, metricsConsent, installationId, onClose]);

  const dialog = (
    <Dialog
      role="dialog"
      ariaLabel={t('home.goUpsell.title')}
      onClose={() => dismiss('backdrop')}
      closeOnEscape
      className={styles.panel}
      data-testid="go-upsell-modal"
    >
      <button
        type="button"
        className={styles.closeButton}
        onClick={() => dismiss('close_button')}
        aria-label={t('common.close')}
      >
        <Icon name="close" size={14} />
      </button>
      <div className={styles.banner}>
        <img
          className={styles.bannerImage}
          src="/upgrade/cloud-signin-aurora.jpg"
          alt=""
          width={1680}
          height={720}
          decoding="async"
          draggable={false}
        />
      </div>
      <h2 className={styles.title}>{t('home.goUpsell.title')}</h2>
      <p className={styles.message}>{t('home.goUpsell.message')}</p>
      <div className={styles.benefitsCard}>
        <span className={styles.benefitsTitle}>{t('home.goUpsell.benefitsTitle')}</span>
        <ul className={styles.benefits}>
          {BENEFIT_KEYS.map((key) => (
            <li key={key} className={styles.benefit}>
              <span className={styles.benefitIcon} aria-hidden>
                <Icon name="check" size={14} />
              </span>
              {t(key)}
            </li>
          ))}
        </ul>
      </div>
      <div className={styles.actions}>
        {upgradeUrl ? (
          <Button variant="primary" onClick={openPlans}>
            {t('home.goUpsell.primaryCta')}
          </Button>
        ) : null}
      </div>
    </Dialog>
  );

  return createPortal(dialog, document.body);
}

/** localStorage key recording that this account has seen the campaign modal. */
export const GO_UPSELL_SEEN_KEY = 'od.goUpsell.seen';

/**
 * Campaign window, Asia/Shanghai. Outside it the modal never mounts — the Go
 * PLAN itself stays on sale, only this promo surface is time-boxed.
 */
/**
 * 本次活动的固定 ID，所有 go_* 触点必须携带（需求文档「公共维度」）。
 * 少了它，看板按活动筛选时这些触点会整体漏掉——不报错，只是查不到。
 */
export const GO_CAMPAIGN_ID = 'go_plan_launch';

export const GO_CAMPAIGN_START = Date.parse('2026-08-20T20:00:00+08:00');
export const GO_CAMPAIGN_END = Date.parse('2026-09-03T20:00:00+08:00');

/** True while the marketing window is open. Extracted so the badge (touchpoint
 *  #4) and the tests can ask the same question without duplicating dates. */
export function isGoCampaignActive(now: number = Date.now()): boolean {
  return now >= GO_CAMPAIGN_START && now < GO_CAMPAIGN_END;
}

/** Has this browser already been shown the modal for this campaign? */
export function hasSeenGoUpsell(): boolean {
  try {
    return window.localStorage.getItem(GO_UPSELL_SEEN_KEY) === '1';
  } catch {
    // Storage blocked (private mode, hardened browser): fail as "seen" so a
    // user in that mode is not shown the modal on every single navigation.
    return true;
  }
}

export function markGoUpsellSeen(): void {
  try {
    window.localStorage.setItem(GO_UPSELL_SEEN_KEY, '1');
  } catch {
    // Nothing to do — see hasSeenGoUpsell.
  }
}

/** Hook wiring the three gates (window, frequency, audience) to mount state. */
export function useGoUpsellModal(isUnpaid: boolean, isHomeActive: boolean): {
  open: boolean;
  close: () => void;
} {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isHomeActive || !isUnpaid) return;
    if (!isGoCampaignActive()) return;
    if (hasSeenGoUpsell()) return;
    setOpen(true);
  }, [isHomeActive, isUnpaid]);

  const close = useCallback(() => {
    markGoUpsellSeen();
    setOpen(false);
  }, []);

  return { open, close };
}
