import type { Locale } from '../i18n/types';
import type { DeepSeekV4FlashCampaignAudience } from './deepseek-v4-flash';

export const GO_PLAN_CAMPAIGN = {
  id: 'go-plan-launch-2026',
  window: {
    startAt: '2026-08-20T17:00:00+08:00',
    endAtExclusive: '2026-09-03T20:00:00+08:00',
  },
} as const;

export const GO_PLAN_PRICING_URL = 'https://open-design.ai/pricing/';

const LANDING_LOCALE_BY_APP_LOCALE: Record<Locale, string> = {
  en: 'en',
  id: 'en',
  de: 'de',
  'zh-CN': 'zh',
  'zh-TW': 'zh',
  'pt-BR': 'pt-br',
  'es-ES': 'es',
  ru: 'ru',
  fa: 'en',
  ar: 'en',
  ja: 'ja',
  ko: 'ko',
  pl: 'en',
  hu: 'en',
  fr: 'fr',
  uk: 'en',
  tr: 'tr',
  th: 'en',
  it: 'it',
};

export function goPlanPricingUrl(locale: Locale): string {
  const landingLocale = LANDING_LOCALE_BY_APP_LOCALE[locale];
  const path = landingLocale === 'en' ? '/pricing/' : `/${landingLocale}/pricing/`;
  const url = new URL(path, GO_PLAN_PRICING_URL);
  url.searchParams.set('od_locale', landingLocale);
  return url.toString();
}

export function isGoPlanCampaignWindowOpen(now: number): boolean {
  const startAt = Date.parse(GO_PLAN_CAMPAIGN.window.startAt);
  const endAtExclusive = Date.parse(GO_PLAN_CAMPAIGN.window.endAtExclusive);
  return now >= startAt && now < endAtExclusive;
}

export function goPlanCampaignNextBoundary(now: number): number | null {
  const startAt = Date.parse(GO_PLAN_CAMPAIGN.window.startAt);
  const endAtExclusive = Date.parse(GO_PLAN_CAMPAIGN.window.endAtExclusive);
  if (now < startAt) return startAt;
  if (now < endAtExclusive) return endAtExclusive;
  return null;
}

/** Resolve subscription state independently from the campaign's launch window. */
export function resolveSubscriptionAudience(input: {
  plan: string | null | undefined;
  loggedIn: boolean | null | undefined;
}): DeepSeekV4FlashCampaignAudience {
  const plan = input.plan?.trim().toLowerCase() ?? '';
  if (plan === 'free' || input.loggedIn === false) return 'unpaid';
  if (plan) return 'paid';
  return 'unknown';
}
