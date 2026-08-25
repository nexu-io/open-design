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
import type { DeepSeekV4FlashCampaignAudience } from '../campaigns/deepseek-v4-flash';
import { goPlanPricingUrl } from '../campaigns/go-plan';
import { useI18n } from '../i18n';
import { Icon } from './Icon';

export function WorkbenchCampaignBadge({
  audience,
  page,
  metricsConsent,
  installationId,
}: {
  audience: Exclude<DeepSeekV4FlashCampaignAudience, 'unknown'>;
  page: 'home' | 'project';
  metricsConsent: boolean;
  installationId?: string | null;
}) {
  const { locale, t } = useI18n();
  const analytics = useAnalytics();

  useEffect(() => {
    // The current campaign analytics contract scopes badge impressions to
    // Home. Project-detail visibility is intentionally UI-only until that
    // contract gains a project page variant.
    if (page !== 'home') return;
    trackDeepSeekCampaignBadgeSurfaceView(analytics.track, {
      page_name: 'home',
      area: 'campaign_badge',
      element: 'deepseek_v4_pro',
      campaign_id: 'deepseek_v4_pro',
      user_state: audience,
    });
  }, [analytics.track, audience, page]);

  const openCampaignPricing = useCallback(() => {
    const pricingUrl = goPlanPricingUrl(locale);
    if (page === 'home') {
      trackDeepSeekCampaignBadgeClick(analytics.track, {
        page_name: 'home',
        area: 'campaign_badge',
        element: 'open_pricing',
        campaign_id: 'deepseek_v4_pro',
        user_state: audience,
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
  }, [analytics.track, audience, installationId, locale, metricsConsent, page]);

  return (
    <button
      type="button"
      className="entry-deepseek-campaign-badge"
      onClick={openCampaignPricing}
      aria-label={t('campaign.deepseekV4Flash.workbenchBadgeAria')}
      data-testid="deepseek-campaign-pricing-badge"
    >
      <span>{t('campaign.deepseekV4Flash.workbenchBadge')}</span>
      <Icon name="arrow-right" size={13} />
    </button>
  );
}
