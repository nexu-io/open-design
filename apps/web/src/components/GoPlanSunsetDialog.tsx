import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, Dialog } from '@open-design/components';
import type { TrackingCampaignDeliveryMode } from '@open-design/contracts/analytics';
import { useAnalytics } from '../analytics/provider';
import {
  trackGoPlanSunsetModalClick,
  trackGoPlanSunsetModalSurfaceView,
} from '../analytics/events';
import { attributedAmrUrl, recordAmrEntry } from '../analytics/amr-attribution';
import styles from './GoPlanSunsetDialog.module.css';

interface Props {
  active: boolean;
  deliveryMode?: TrackingCampaignDeliveryMode;
  currentPlanId?: string;
  locale?: string;
  metricsConsent?: boolean;
}

const GO_PLAN_PRICING_URL =
  'https://open-design.ai/amr/dashboard?source=open_design&billing=plan';

export function isGoPlanSunsetDemo(search: string): boolean {
  return new URLSearchParams(search).get('demo') === 'go-plan-sunset';
}

export function shouldShowWhatsNewPopup(
  homeActive: boolean,
  goPlanSunsetDemo: boolean,
): boolean {
  return homeActive && !goPlanSunsetDemo;
}

type HomeCampaignModalAudience = 'unpaid' | 'paid' | 'unknown';
type TopRightCampaignKind = 'go' | 'deepseek' | null;

export function resolveGoPlanSunsetCampaigns(
  enabled: boolean,
  homeCampaignModalAudience: HomeCampaignModalAudience,
  topRightCampaignKind: TopRightCampaignKind,
): {
  homeCampaignModalAudience: HomeCampaignModalAudience;
  topRightCampaignKind: TopRightCampaignKind;
} {
  if (enabled) {
    return {
      homeCampaignModalAudience: 'unknown',
      topRightCampaignKind: null,
    };
  }
  return { homeCampaignModalAudience, topRightCampaignKind };
}

export function GoPlanSunsetDialog({
  active,
  deliveryMode = 'demo',
  currentPlanId = 'unknown',
  locale = 'zh-CN',
  metricsConsent = false,
}: Props) {
  const analytics = useAnalytics();
  const [open, setOpen] = useState(active);
  const dismissedRef = useRef(false);
  const exposureTrackedRef = useRef(false);
  const dialogId = useId();
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (active && !dismissedRef.current) {
      setOpen(true);
    } else if (!active) {
      setOpen(false);
      exposureTrackedRef.current = false;
    }
  }, [active]);

  useEffect(() => {
    if (!active || !open || exposureTrackedRef.current) return;
    exposureTrackedRef.current = true;
    trackGoPlanSunsetModalSurfaceView(analytics.track, {
      page_name: 'home',
      area: 'go_plan_sunset_modal',
      element: 'modal',
      campaign_id: 'go_plan_sunset_202608',
      announcement_version: '2026_08_25',
      delivery_mode: deliveryMode,
      current_plan_id: currentPlanId,
      locale,
    });
  }, [active, analytics.track, currentPlanId, deliveryMode, locale, open]);

  useEffect(() => {
    if (!active || !open || typeof document === 'undefined') return;
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
  }, [active, dialogId, open]);

  if (!active || !open || typeof document === 'undefined') return null;

  const viewSubscriptions = () => {
    trackGoPlanSunsetModalClick(analytics.track, {
      page_name: 'home',
      area: 'go_plan_sunset_modal',
      element: 'view_other_subscriptions',
      campaign_id: 'go_plan_sunset_202608',
      announcement_version: '2026_08_25',
      delivery_mode: deliveryMode,
      current_plan_id: currentPlanId,
      locale,
    });
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

  const dismiss = (element: 'acknowledge' | 'close') => {
    trackGoPlanSunsetModalClick(analytics.track, {
      page_name: 'home',
      area: 'go_plan_sunset_modal',
      element,
      ...(element === 'close' ? { close_method: 'unknown' as const } : {}),
      campaign_id: 'go_plan_sunset_202608',
      announcement_version: '2026_08_25',
      delivery_mode: deliveryMode,
      current_plan_id: currentPlanId,
      locale,
    });
    dismissedRef.current = true;
    setOpen(false);
  };

  return createPortal(
    <Dialog
      id={dialogId}
      role="alertdialog"
      ariaLabelledBy={titleId}
      ariaDescribedBy={descriptionId}
      onClose={() => dismiss('close')}
      closeOnEscape
      className={styles.panel}
      backdropClassName={styles.backdrop}
      data-testid="go-plan-sunset-dialog"
    >
      <header className={styles.header}>
        <h2 id={titleId} className={styles.title}>关于停售 Go 订阅的说明</h2>
      </header>

      <div id={descriptionId} className={styles.body}>
        <p>尊敬的 OpenDesign 用户：</p>
        <p>
          OpenDesign Go 上线后获得了很多用户的关注和意见反馈。这些反馈让我们意识到，
          目前在额度规则的表达、支付流程的设计和产品体验上还有很多问题与改善空间，
          对此我们深表歉意。
        </p>
        <p>为了确保给大家提供最佳设计体验，我们决定：</p>

        <ol className={styles.decisions}>
          <li>
            <span className={styles.number}>1</span>
            <div>
              <strong>即日起停售 Go 新订阅</strong>
              <p>待额度规则与产品体验完善后再重新开放。</p>
            </div>
          </li>
          <li>
            <span className={styles.number}>2</span>
            <div>
              <strong>已订阅用户将在 8 月 31 日前获得全额退款</strong>
              <p>
                退款将原路退回；退款完成同时停止 Go 权益，到账时间以支付渠道为准。
                你可以重新订阅其他计划，或使用 BYOK / 连接其他 Agent CLI 继续使用。
              </p>
            </div>
          </li>
          <li>
            <span className={styles.number}>3</span>
            <div>
              <strong>其他订阅计划不受影响</strong>
              <p>除 Go 外的其他订阅计划可继续正常使用。</p>
            </div>
          </li>
        </ol>

        <p>
          感谢你的理解和支持，也感谢所有提出批评的用户。我们将持续聚焦更智能的设计交付，
          让每个人和每个团队都能更好地交付满意的设计作品。
        </p>
        <p className={styles.signature}>
          OpenDesign 团队<br />
          2026 年 8 月 25 日
        </p>
      </div>

      <footer className={styles.footer}>
        <Button onClick={viewSubscriptions}>
          查看其他订阅
        </Button>
        <Button variant="primary" onClick={() => dismiss('acknowledge')}>
          我知道了
        </Button>
      </footer>
    </Dialog>,
    document.body,
  );
}
