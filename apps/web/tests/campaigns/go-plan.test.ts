import { describe, expect, it } from 'vitest';
import {
  GO_PLAN_CAMPAIGN,
  GO_PLAN_PRICING_URL,
  goPlanPricingUrl,
  goPlanCampaignNextBoundary,
  isGoPlanCampaignWindowOpen,
  resolveSubscriptionAudience,
} from '../../src/campaigns/go-plan';
import { getGoPlanCampaignCopy } from '../../src/campaigns/go-plan-content';
import { LOCALES } from '../../src/i18n/types';

describe('Go plan touchpoints', () => {
  it('uses the fixed two-week NEW window while keeping a stable Pricing target', () => {
    const start = Date.parse(GO_PLAN_CAMPAIGN.window.startAt);
    const end = Date.parse(GO_PLAN_CAMPAIGN.window.endAtExclusive);

    expect(GO_PLAN_CAMPAIGN.window.startAt).toBe('2026-08-20T17:00:00+08:00');
    expect(isGoPlanCampaignWindowOpen(start - 1)).toBe(false);
    expect(isGoPlanCampaignWindowOpen(start)).toBe(true);
    expect(isGoPlanCampaignWindowOpen(end - 1)).toBe(true);
    expect(isGoPlanCampaignWindowOpen(end)).toBe(false);
    expect(goPlanCampaignNextBoundary(start - 1)).toBe(start);
    expect(goPlanCampaignNextBoundary(start)).toBe(end);
    expect(goPlanCampaignNextBoundary(end)).toBeNull();
    expect(GO_PLAN_PRICING_URL).toBe('https://open-design.ai/pricing/');
  });

  it('hands Pricing the source locale without targeting retired Landing routes', () => {
    expect(goPlanPricingUrl('en')).toBe(
      'https://open-design.ai/pricing/?od_locale=en',
    );
    expect(goPlanPricingUrl('zh-CN')).toBe(
      'https://open-design.ai/zh/pricing/?od_locale=zh',
    );
    expect(goPlanPricingUrl('zh-TW')).toBe(
      'https://open-design.ai/zh/pricing/?od_locale=zh',
    );
    expect(goPlanPricingUrl('pt-BR')).toBe(
      'https://open-design.ai/pt-br/pricing/?od_locale=pt-br',
    );
    expect(goPlanPricingUrl('es-ES')).toBe(
      'https://open-design.ai/es/pricing/?od_locale=es',
    );
    expect(goPlanPricingUrl('id')).toBe(
      'https://open-design.ai/pricing/?od_locale=en',
    );
  });

  it('resolves paid and unpaid state independently of the campaign window', () => {
    expect(resolveSubscriptionAudience({ plan: 'free', loggedIn: true })).toBe('unpaid');
    expect(resolveSubscriptionAudience({ plan: 'plus', loggedIn: true })).toBe('paid');
    expect(resolveSubscriptionAudience({ plan: null, loggedIn: false })).toBe('unpaid');
    expect(resolveSubscriptionAudience({ plan: null, loggedIn: true })).toBe('unknown');
  });

  it('keeps the confirmed Chinese lightweight-entry copy', () => {
    const chinese = getGoPlanCampaignCopy('zh-CN');
    const english = getGoPlanCampaignCopy('en');

    expect(chinese.workbenchBadge).toBe('全新 Go 套餐 · 首月 ¥5 · 模型无限用');
    expect(chinese.headline).toBe('人人可用的低成本设计方案');
    expect(chinese.description).toBe(
      '以更低成本使用专业设计模型，让每一个想法更快成为作品。',
    );
    expect(chinese.cta).toBe('查看 Go 套餐 · 限时 5 折');
    expect(english.workbenchBadge).toBe(
      'The new Go Plan · ¥5 for the first month · Unlimited model usage',
    );
    expect(english.headline).toBe('Low-cost design plan for everyone');
    expect(english.description).toBe(
      'Professional design intelligence at a lower cost—so every idea moves faster from prompt to finished work.',
    );
    expect(english.cta).toBe('View Go plan · Limited-time 50% off');
  });

  it('ships localized modal and workbench copy for every supported locale', () => {
    const english = getGoPlanCampaignCopy('en');
    const translatableFields = [
      'eyebrow',
      'headline',
      'description',
      'benefit',
      'status',
      'cta',
      'renewal',
      'boundary',
      'closeAria',
      'providersAria',
      'workbenchBadge',
      'workbenchBadgeAria',
    ] as const;

    for (const locale of LOCALES) {
      const copy = getGoPlanCampaignCopy(locale);
      for (const field of translatableFields) {
        expect(copy[field].trim(), `${locale}.${field}`).not.toBe('');
        if (locale !== 'en') {
          expect(copy[field], `${locale}.${field} silently fell back to English`).not.toBe(
            english[field],
          );
        }
      }
    }
  });
});
