import { useCallback, useEffect } from 'react';
import {
  trackDeepSeekCampaignBadgeClick,
  trackDeepSeekCampaignBadgeSurfaceView,
} from '../analytics/events';
import {
  amrHandoffDeviceId,
  attributedAmrUrl,
  recordAmrEntry,
} from '../analytics/amr-attribution';
import { getResolvedDeviceId } from '../analytics/client';
import { useAnalytics } from '../analytics/provider';
import { goPlanPricingUrl } from '../campaigns/go-plan';
import { getGoPlanCampaignCopy } from '../campaigns/go-plan-content';
import { useI18n } from '../i18n';
import { Icon } from './Icon';

export type WorkbenchCampaignKind = 'go' | 'deepseek';

export function WorkbenchCampaignBadge({
  kind,
  page,
  metricsConsent,
  installationId,
}: {
  kind: WorkbenchCampaignKind;
  page: 'home' | 'project';
  metricsConsent: boolean;
  installationId?: string | null;
}) {
  const { locale, t } = useI18n();
  const analytics = useAnalytics();
  const goPlanCopy = getGoPlanCampaignCopy(locale);

  useEffect(() => {
    // The current campaign analytics contract scopes badge impressions to
    // Home. Project-detail visibility is intentionally UI-only until that
    // contract gains a project page variant.
    if (kind !== 'deepseek' || page !== 'home') return;
    trackDeepSeekCampaignBadgeSurfaceView(analytics.track, {
      page_name: 'home',
      area: 'campaign_badge',
      element: 'deepseek_v4_pro',
      campaign_id: 'deepseek_v4_pro',
      user_state: 'paid',
    });
  }, [analytics.track, kind, page]);

  const openCampaignPricing = useCallback(() => {
    const pricingUrl = goPlanPricingUrl(locale);
    if (kind === 'go') {
      window.open(pricingUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    if (page === 'home') {
      trackDeepSeekCampaignBadgeClick(analytics.track, {
        page_name: 'home',
        area: 'campaign_badge',
        element: 'open_pricing',
        campaign_id: 'deepseek_v4_pro',
        user_state: 'paid',
      });
    }
    const attribution = recordAmrEntry(
      analytics.track,
      'deepseek_workbench_badge',
      new Date(),
      {
        metricsConsent,
        campaignId: 'deepseek_v4_pro',
        conversionSource: 'deepseek_workbench_badge',
      },
    );
    const deviceId = amrHandoffDeviceId({
      metricsConsent,
      resolvedDeviceId: getResolvedDeviceId(),
      installationId,
    });
    window.open(
      attributedAmrUrl(pricingUrl, attribution, deviceId),
      '_blank',
      'noopener,noreferrer',
    );
  }, [analytics.track, installationId, kind, locale, metricsConsent, page]);

  return (
    <button
      type="button"
      className="entry-deepseek-campaign-badge"
      onClick={openCampaignPricing}
      aria-label={kind === 'go'
        ? goPlanCopy.workbenchBadgeAria
        : t('campaign.deepseekV4Flash.workbenchBadgeAria')}
      data-testid="deepseek-campaign-pricing-badge"
    >
      <span>{kind === 'go'
        ? goPlanCopy.workbenchBadge
        : t('campaign.deepseekV4Flash.workbenchBadge')}</span>
      <Icon name="arrow-right" size={13} />
    </button>
  );
}
