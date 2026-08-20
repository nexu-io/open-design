import { useCallback, useEffect, useRef, useState } from 'react';
import { useT } from '../i18n';
import { useAnalytics } from '../analytics/provider';
import { trackGoNavEntryClick, trackGoNavEntrySurfaceView } from '../analytics/events';
import { getResolvedDeviceId } from '../analytics/client';
import {
  amrHandoffDeviceId,
  attributedAmrUrl,
  recordAmrEntry,
} from '../analytics/amr-attribution';
import { GO_CAMPAIGN_ID, GO_CAMPAIGN_START, isGoCampaignActive } from './GoUpsellModal';

/**
 * Persistent Go plan entry in the nav rail's account area — marketing
 * touchpoint #4 (「工作台右上角入口」).
 *
 * AUDIENCE: unpaid workspaces only, the same split as the home modal. A paying
 * customer keeps the DeepSeek entry that is already live; showing them a
 * cheaper plan here would be an ad against our own revenue.
 *
 * WHY IT IS SEPARATE FROM THE MODAL: the modal is a one-shot interrupt, this is
 * standing chrome the user can come back to. Sharing a component would force one
 * frequency rule onto both; sharing the CAMPAIGN WINDOW (imported from the
 * modal) is the part that must not drift, so that is what is imported.
 *
 * THE NEW DOT is a separate, weaker piece of state than "seen": it survives the
 * modal being dismissed, and is cleared only by clicking THIS entry. That way a
 * user who closed the modal still gets one visual cue that the entry is new,
 * and a user who used the entry is never nagged by it again.
 */

/** localStorage key recording that the NEW dot has been spent on this browser. */
export const GO_NAV_ENTRY_SEEN_KEY = 'od.goBadge.clicked';

function hasClickedGoNavEntry(): boolean {
  try {
    return window.localStorage.getItem(GO_NAV_ENTRY_SEEN_KEY) === '1';
  } catch {
    // Storage blocked: treat the dot as already spent rather than showing an
    // attention cue that can never be dismissed.
    return true;
  }
}

function markGoNavEntryClicked(): void {
  try {
    window.localStorage.setItem(GO_NAV_ENTRY_SEEN_KEY, '1');
  } catch {
    // Nothing to do — see hasClickedGoNavEntry.
  }
}

interface Props {
  /**
   * Console plan chooser deep link from `workspaceUpgradeUrl`. Null when the
   * caller cannot authorize billing (team member/admin), in which case the
   * entry does not render at all — an entry that cannot convert is just noise
   * in the rail.
   */
  upgradeUrl: string | null;
  /** False for any paying workspace; the entry is unpaid-only. */
  isUnpaid: boolean;
  metricsConsent: boolean;
  installationId: string | null | undefined;
}

export function GoNavEntry({
  upgradeUrl,
  isUnpaid,
  metricsConsent,
  installationId,
}: Props): JSX.Element | null {
  const t = useT();
  const analytics = useAnalytics();
  const impressionSent = useRef(false);

  /*
   * 常驻入口，不随营销窗口下线（需求文档 GMK-013）。
   *
   * 另外三个触点（官网 Banner、Pricing Banner、工作台弹窗）是限时的，窗口一
   * 过就整体不渲染、不上报。这个入口不一样：它是 Go 唯一的长期入口，窗口结束
   * 后才是它主要的转化来源，断掉就再也看不到这条路径的数据。
   *
   * 窗口只决定 NEW 角标在不在，不决定组件在不在。
   */
  // 起始时间仍要判：Go 在 8/20 才上线，之前挂出「Go 首月 $5」是在卖一个
  // 还不存在的套餐。窗口结束时间则不判——见上面的常驻说明。
  // 和另外两个触点一样，只在活动窗口内展示：窗口一过整体下线，
  // 不渲染也不上报（产品决策 2026-08-18，覆盖需求文档 GMK-013 里
  // 「角标常驻、仅摘 NEW」的旧口径）。
  const active = isUnpaid && Boolean(upgradeUrl) && isGoCampaignActive();


  useEffect(() => {
    if (!active) return;
    // One impression per mount — this is persistent chrome, so re-firing on
    // every render would measure re-renders, not exposure. The ref also guards
    // StrictMode's double effect in dev.
    if (impressionSent.current) return;
    impressionSent.current = true;
    trackGoNavEntrySurfaceView(analytics.track, {
      page_name: 'home',
      area: 'go_badge',
      audience: 'unpaid',
      campaign_id: GO_CAMPAIGN_ID,
    });
  }, [active, analytics]);

  const open = useCallback(() => {
    if (!upgradeUrl) return;
    trackGoNavEntryClick(analytics.track, {
      page_name: 'home',
      area: 'go_badge',
      element: 'badge',
      audience: 'unpaid',
      campaign_id: GO_CAMPAIGN_ID,
    });
    // Same attribution handshake as every other Cloud handoff, under this
    // touchpoint's own entry source so its conversions stay separable from the
    // modal's.
    const attribution = recordAmrEntry(analytics.track, 'home_go_badge', new Date(), {
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
  }, [analytics, upgradeUrl, metricsConsent, installationId]);

  if (!active) return null;

  return (
    <button
      type="button"
      className="entry-nav-rail__go-entry"
      onClick={open}
      data-testid="entry-nav-go-entry"
      aria-label={t('home.goBadge.aria')}
    >
      <span className="entry-nav-rail__go-entry-label">
        {/* 活动期才提「无限用」：这个入口活动结束后仍常驻，
            写死会在 9/3 之后变成假承诺。 */}
        {t('home.goBadge.labelPromo')}
      </span>
      <span className="entry-nav-rail__go-entry-arrow" aria-hidden="true">→</span>
    </button>
  );
}
