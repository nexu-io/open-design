import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DEEPSEEK_V4_FLASH_CAMPAIGN,
  formatDeepSeekV4FlashCampaignCountdown,
  isDeepSeekV4FlashCampaignWindowOpen,
  isDeepSeekV4FlashCampaignVisible,
  resolveDeepSeekV4FlashCampaignAudience,
  isDeepSeekV4FlashCampaignModel,
} from '../../src/campaigns/deepseek-v4-flash';

const entryLayoutStyles = readFileSync(
  new URL('../../src/styles/home/entry-layout.css', import.meta.url),
  'utf8',
);
const campaignDialogSource = readFileSync(
  new URL('../../src/components/DeepSeekV4FlashCampaign.tsx', import.meta.url),
  'utf8',
);
const campaignDialogStyles = readFileSync(
  new URL('../../src/components/DeepSeekV4FlashCampaign.module.css', import.meta.url),
  'utf8',
);

describe('DeepSeek V4 Flash campaign', () => {
  // The campaign now covers BOTH V4 models on one shared window. Pro is the
  // headline benefit and Flash rides along; a promotion that reached only one
  // of them would contradict every surface, which advertises the pair.
  it('attaches the promotion to both V4 campaign models', () => {
    expect(isDeepSeekV4FlashCampaignModel('deepseek-v4-pro')).toBe(true);
    expect(isDeepSeekV4FlashCampaignModel('deepseek-v4-flash')).toBe(true);
    expect(isDeepSeekV4FlashCampaignModel(' DeepSeek-V4-Pro ')).toBe(true);
    expect(isDeepSeekV4FlashCampaignModel(' DeepSeek-V4-Flash ')).toBe(true);
  });

  // …and to nothing else. A prefix match would sweep in every future V4 model.
  it('leaves non-campaign models alone', () => {
    expect(isDeepSeekV4FlashCampaignModel('deepseek-v4')).toBe(false);
    expect(isDeepSeekV4FlashCampaignModel('deepseek-v4-pro-max')).toBe(false);
    expect(isDeepSeekV4FlashCampaignModel('deepseek-v3.2')).toBe(false);
    expect(isDeepSeekV4FlashCampaignModel('')).toBe(false);
    expect(isDeepSeekV4FlashCampaignModel(null)).toBe(false);
  });

  it('wires campaign copy through i18n keys in the dialog', () => {
    expect(campaignDialogSource).toContain("t('campaign.deepseekV4Flash.headline')");
    expect(campaignDialogSource).toContain("t('campaign.deepseekV4Flash.description')");
    expect(campaignDialogSource).toContain("t('campaign.deepseekV4Flash.benefit')");
  });

  it('keeps the fixed window out of the primary headline and badge', () => {
    // The id is what the modal's "already seen" record is keyed on, so it MUST
    // differ from the finished free week: a returning user who dismissed that
    // one has never seen this campaign and is owed its single showing.
    expect(DEEPSEEK_V4_FLASH_CAMPAIGN.id).toBe('deepseek-v4-dual-unlimited-2026');
    expect(DEEPSEEK_V4_FLASH_CAMPAIGN.id).not.toBe('deepseek-v4-flash-unlimited-2026');
    // Pro is what 「立即使用」 switches a paid user to.
    expect(DEEPSEEK_V4_FLASH_CAMPAIGN.modelId).toBe('deepseek-v4-pro');
    expect(DEEPSEEK_V4_FLASH_CAMPAIGN.modelIds).toEqual([
      'deepseek-v4-pro',
      'deepseek-v4-flash',
    ]);
    // Opens the instant the free week closes — the two windows abut exactly.
    expect(DEEPSEEK_V4_FLASH_CAMPAIGN.window.startAt).toContain('2026-08-13T20:00:00');
    expect(DEEPSEEK_V4_FLASH_CAMPAIGN.window.endAtExclusive).toContain('2026-08-27T20:00:00');
  });

  it('uses a neutral gray restricted badge for anti-abuse fallback', () => {
    const restrictedBadgeRule = entryLayoutStyles.match(
      /\.inline-switcher__campaign-badge\.is-restricted\s*\{([^}]*)\}/,
    )?.[1];

    expect(restrictedBadgeRule).toContain('color: #5f645d');
    expect(restrictedBadgeRule).toContain('background: #e4e7e2');
    expect(restrictedBadgeRule).not.toMatch(/#ffd79a|#713a00/);
  });

  it('keeps the campaign promise stable while routing actions by entitlement', () => {
    const activeAt = Date.parse(DEEPSEEK_V4_FLASH_CAMPAIGN.window.startAt);
    // Copy lives in i18n; keep product CTA keys wired in the dialog source.

    expect(resolveDeepSeekV4FlashCampaignAudience({
      plan: 'plus',
      loggedIn: true,
      now: activeAt,
    })).toBe('paid');
    expect(resolveDeepSeekV4FlashCampaignAudience({
      plan: 'team_pro',
      loggedIn: true,
      now: activeAt,
    })).toBe('paid');
    // A positive wallet balance or historical recharge is intentionally absent
    // from the resolver: backend-confirmed `free` still routes to the unpaid
    // modal because only an active subscription counts as paid.
    expect(resolveDeepSeekV4FlashCampaignAudience({
      plan: 'free',
      loggedIn: true,
      now: activeAt,
    })).toBe('unpaid');
    expect(resolveDeepSeekV4FlashCampaignAudience({
      plan: null,
      loggedIn: null,
      now: activeAt,
    })).toBe('unknown');
  });

  it('keeps the paid modal actions on the final approved interaction', () => {
    expect(campaignDialogSource).toContain('{presentation.cta}');
    expect(campaignDialogSource).toContain("t('campaign.deepseekV4Flash.later')");
    expect(campaignDialogSource).toContain('styles.modelCard');
    expect(campaignDialogSource).toContain('styles.boundary');
    expect(campaignDialogSource).toContain('styles.laterAction');
    expect(campaignDialogSource).toContain('<Icon name="close"');
    expect(campaignDialogSource).not.toContain('deepseek-v4-flash-free-week-poster-v5.png');
    expect(campaignDialogSource).toMatch(/onClick=\{closeModal\}/);
    expect(campaignDialogSource.indexOf("t('campaign.deepseekV4Flash.later')")).toBeLessThan(
      campaignDialogSource.indexOf('{presentation.cta}'),
    );
    expect(campaignDialogStyles).toMatch(
      /\.actions\s*\{[\s\S]*?justify-content:\s*flex-end;[\s\S]*?\}/,
    );
    expect(campaignDialogStyles).not.toMatch(
      /\.actions\s*\{[^}]*flex-direction:\s*column;/,
    );
  });

  it('keeps the DeepSeek live countdown on the paid campaign modal', () => {
    const start = Date.parse(DEEPSEEK_V4_FLASH_CAMPAIGN.window.startAt);
    const end = Date.parse(DEEPSEEK_V4_FLASH_CAMPAIGN.window.endAtExclusive);
    const t = (key: string, vars?: Record<string, string | number>) => {
      if (key === 'campaign.deepseekV4Flash.countdownEnded') return 'Campaign ended';
      if (key === 'campaign.deepseekV4Flash.countdownRemaining') {
        return `${vars?.days}d ${vars?.hms}`;
      }
      return key;
    };

    expect(formatDeepSeekV4FlashCampaignCountdown(start - 1_000, t)).toBe('0d 00:00:01');
    expect(formatDeepSeekV4FlashCampaignCountdown(start - 1_000, t)).not.toContain('until start');
    const windowSeconds = Math.floor((end - start) / 1000);
    const windowLabel = `${Math.floor(windowSeconds / 86400)}d ${String(Math.floor((windowSeconds % 86400) / 3600)).padStart(2, '0')}:${String(Math.floor((windowSeconds % 3600) / 60)).padStart(2, '0')}:${String(windowSeconds % 60).padStart(2, '0')}`;
    expect(formatDeepSeekV4FlashCampaignCountdown(start, t)).toBe(windowLabel);
    expect(formatDeepSeekV4FlashCampaignCountdown(end, t)).toBe('Campaign ended');
    expect(campaignDialogSource).toContain('deepseek-v4-flash-campaign-countdown');
    expect(campaignDialogSource).toContain("t('campaign.deepseekV4Flash.weekFreeSuffix')");
    expect(campaignDialogSource).toContain('formatDeepSeekV4FlashCampaignCountdown(countdownNow, t)');
    expect(campaignDialogSource.indexOf('styles.countdown')).toBeLessThan(
      campaignDialogSource.indexOf('styles.actions'),
    );
    expect(campaignDialogSource).toContain('styles.modelCard');
    expect(campaignDialogSource).toContain('styles.boundary');
  });

  it('keeps the unpaid DeepSeek upgrade on Pricing without rendering Go', () => {
    expect(campaignDialogSource).toContain('goPlanPricingUrl');
    expect(campaignDialogSource).toContain("'deepseek_unpaid_modal'");
    expect(campaignDialogSource).toContain("t('campaign.deepseekV4Flash.unpaid.cta')");
    expect(campaignDialogSource).not.toContain('styles.goWelcome');
  });

  it('keeps campaign visibility free of every URL review backdoor (product decision)', () => {
    const campaignLibSource = readFileSync(
      new URL('../../src/campaigns/deepseek-v4-flash.ts', import.meta.url),
      'utf8',
    );
    // The former ?campaign= / audience / usage overrides are gone for good:
    // no campaign module or surface may read URL parameters. Acceptance for
    // pre-launch review is a temporary startAt override, not a URL.
    expect(campaignLibSource).not.toContain('URLSearchParams');
    expect(campaignLibSource).not.toContain('location.search');
    expect(campaignDialogSource).not.toContain('URLSearchParams');
    expect(campaignDialogSource).not.toContain('location.search');
  });

  it('opens for paid and unpaid users only inside the shared half-open window', () => {
    const start = Date.parse(DEEPSEEK_V4_FLASH_CAMPAIGN.window.startAt);
    const end = Date.parse(DEEPSEEK_V4_FLASH_CAMPAIGN.window.endAtExclusive);

    expect(isDeepSeekV4FlashCampaignWindowOpen(start - 1)).toBe(false);
    expect(isDeepSeekV4FlashCampaignWindowOpen(start)).toBe(true);
    expect(isDeepSeekV4FlashCampaignWindowOpen(end - 1)).toBe(true);
    expect(isDeepSeekV4FlashCampaignWindowOpen(end)).toBe(false);
    expect(isDeepSeekV4FlashCampaignVisible(start - 1)).toBe(false);
    expect(isDeepSeekV4FlashCampaignVisible(start)).toBe(true);
    expect(isDeepSeekV4FlashCampaignVisible(end)).toBe(false);
    expect(resolveDeepSeekV4FlashCampaignAudience({
      plan: 'plus', loggedIn: true, now: start - 1,
    })).toBe('unknown');
    expect(resolveDeepSeekV4FlashCampaignAudience({
      plan: 'plus', loggedIn: true, now: end,
    })).toBe('unknown');
    expect(resolveDeepSeekV4FlashCampaignAudience({
      plan: 'free', loggedIn: true, now: end,
    })).toBe('unknown');
    // Inside the window the plan decides the audience; outside it nothing does.
    expect(resolveDeepSeekV4FlashCampaignAudience({
      plan: 'plus', loggedIn: true, now: start,
    })).toBe('paid');
    expect(resolveDeepSeekV4FlashCampaignAudience({
      plan: 'free', loggedIn: true, now: end - 1,
    })).toBe('unpaid');
  });
});
