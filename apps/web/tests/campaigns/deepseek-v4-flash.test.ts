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
  it('keeps the promotion attached only to the Flash model', () => {
    expect(isDeepSeekV4FlashCampaignModel('deepseek-v4-flash')).toBe(true);
    expect(isDeepSeekV4FlashCampaignModel(' DeepSeek-V4-Flash ')).toBe(true);
    expect(isDeepSeekV4FlashCampaignModel('deepseek-v4-pro')).toBe(false);
    expect(isDeepSeekV4FlashCampaignModel('deepseek-v4')).toBe(false);
  });

  it('wires campaign copy through i18n keys in the dialog', () => {
    expect(campaignDialogSource).toContain("t('campaign.deepseekV4Flash.headline')");
    expect(campaignDialogSource).toContain("t('campaign.deepseekV4Flash.description')");
    expect(campaignDialogSource).toContain("t('campaign.deepseekV4Flash.benefit')");
  });

  it('keeps the fixed window out of the primary headline and badge', () => {
    expect(DEEPSEEK_V4_FLASH_CAMPAIGN.id).toBe('deepseek-v4-flash-unlimited-2026');
    expect(DEEPSEEK_V4_FLASH_CAMPAIGN.modelId).toBe('deepseek-v4-flash');
    expect(DEEPSEEK_V4_FLASH_CAMPAIGN.window.startAt).toContain('2026-08-06');
    expect(DEEPSEEK_V4_FLASH_CAMPAIGN.window.endAtExclusive).toContain('2026-08-13T20:00:00');
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

  it('shows a shared live countdown in both paid and unpaid campaign modals', () => {
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

  it('keeps the unpaid action on the upgrade flow without showing the paid secondary action', () => {
    expect(campaignDialogSource).toContain("t('campaign.deepseekV4Flash.unpaid.cta')");
    expect(campaignDialogSource).toContain("'deepseek_unpaid_modal'");
    expect(campaignDialogSource).toContain('attributedAmrUrl(plansUrl, attribution, deviceId)');
    expect(campaignDialogSource).toContain('metricsConsent,');
    expect(campaignDialogSource).toMatch(/\{paid \? \([\s\S]*campaign\.deepseekV4Flash\.later[\s\S]*\) : null\}/);
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

  it('opens for every paid user only inside the shared half-open window', () => {
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
    // Inside the window the plan decides the audience; outside it nothing does.
    expect(resolveDeepSeekV4FlashCampaignAudience({
      plan: 'plus', loggedIn: true, now: start,
    })).toBe('paid');
    expect(resolveDeepSeekV4FlashCampaignAudience({
      plan: 'free', loggedIn: true, now: end - 1,
    })).toBe('unpaid');
  });
});
