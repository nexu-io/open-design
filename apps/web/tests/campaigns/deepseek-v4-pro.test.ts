import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DEEPSEEK_V4_PRO_CAMPAIGN,
  formatDeepSeekV4ProCampaignCountdown,
  formatDeepSeekV4ProCampaignMockRemaining,
  isDeepSeekV4ProCampaignWindowOpen,
  isDeepSeekV4ProCampaignVisible,
  resolveDeepSeekV4ProCampaignAudience,
  isDeepSeekV4ProCampaignModel,
} from '../../src/campaigns/deepseek-v4-pro';
import { DEEPSEEK_V4_PRO_COPY } from '../../src/campaigns/deepseek-v4-pro-copy';
import { LOCALES } from '../../src/i18n/types';

const entryLayoutStyles = readFileSync(
  new URL('../../src/styles/home/entry-layout.css', import.meta.url),
  'utf8',
);
const campaignDialogSource = readFileSync(
  new URL('../../src/components/DeepSeekV4ProCampaign.tsx', import.meta.url),
  'utf8',
);
const campaignDialogStyles = readFileSync(
  new URL('../../src/components/DeepSeekV4ProCampaign.module.css', import.meta.url),
  'utf8',
);

describe('DeepSeek V4 Pro campaign', () => {
  it('ships explicit campaign copy for every supported workbench locale', () => {
    expect(Object.keys(DEEPSEEK_V4_PRO_COPY).sort()).toEqual([...LOCALES].sort());
    for (const locale of LOCALES) {
      for (const value of Object.values(DEEPSEEK_V4_PRO_COPY[locale])) {
        expect(value.trim()).not.toBe('');
      }
      expect(DEEPSEEK_V4_PRO_COPY[locale].benefit).toContain('V4 Flash');
      expect(DEEPSEEK_V4_PRO_COPY[locale].benefit).toContain('V4 Pro');
      expect(DEEPSEEK_V4_PRO_COPY[locale].benefit.indexOf('V4 Pro')).toBeLessThan(
        DEEPSEEK_V4_PRO_COPY[locale].benefit.indexOf('V4 Flash'),
      );
    }
  });

  it('states the unlimited-free benefit in the workbench campaign badge', () => {
    for (const locale of LOCALES) {
      expect(DEEPSEEK_V4_PRO_COPY[locale].topBadge).toContain('DeepSeek V4 Pro + V4 Flash');
      expect(DEEPSEEK_V4_PRO_COPY[locale].topBadge).not.toBe('DeepSeek V4 Pro + V4 Flash');
    }
    expect(DEEPSEEK_V4_PRO_COPY['zh-CN'].topBadge).toBe(
      'DeepSeek V4 Pro + V4 Flash 无限免费用',
    );
  });

  it('keeps model-card status concise because campaign dates live in the countdown', () => {
    for (const locale of LOCALES) {
      expect(DEEPSEEK_V4_PRO_COPY[locale].paidStatus).not.toMatch(/\d/);
      expect(DEEPSEEK_V4_PRO_COPY[locale].unpaidStatus).not.toMatch(/\d/);
    }
    expect(DEEPSEEK_V4_PRO_COPY['zh-CN'].paidStatus).toBe('已解锁');
    expect(DEEPSEEK_V4_PRO_COPY['zh-CN'].unpaidStatus).toBe('升级后可用');
    expect(DEEPSEEK_V4_PRO_CAMPAIGN.paid.status).toBe('已解锁');
    expect(DEEPSEEK_V4_PRO_CAMPAIGN.unpaid.status).toBe('升级后可用');
  });

  it('attaches the shared promotion to both DeepSeek V4 models', () => {
    expect(isDeepSeekV4ProCampaignModel('deepseek-v4-pro')).toBe(true);
    expect(isDeepSeekV4ProCampaignModel(' DeepSeek-V4-Pro ')).toBe(true);
    expect(isDeepSeekV4ProCampaignModel('deepseek-v4-flash')).toBe(true);
    expect(isDeepSeekV4ProCampaignModel('deepseek-v4')).toBe(false);
  });

  it('uses the approved cross-surface campaign explanation', () => {
    expect(DEEPSEEK_V4_PRO_CAMPAIGN.description).toBe(
      '落地页、网站、幻灯片、图片，无限做，做到满意',
    );
  });

  it('keeps the fixed window out of the primary headline and badge', () => {
    expect(DEEPSEEK_V4_PRO_CAMPAIGN.headline).toBe('这次，顶级智能无限用。');
    expect(DEEPSEEK_V4_PRO_COPY['zh-CN'].headline).toBe('这次，顶级智能无限用。');
    expect(DEEPSEEK_V4_PRO_COPY['zh-TW'].headline).toBe('這次，頂級智能無限用。');
    expect(DEEPSEEK_V4_PRO_CAMPAIGN.badge).toBe('无限使用');
    expect(DEEPSEEK_V4_PRO_CAMPAIGN.timing).toContain('8 月 13 日至 8 月 27 日');
    expect(DEEPSEEK_V4_PRO_CAMPAIGN.timing).not.toContain('权益生效后');
    expect(DEEPSEEK_V4_PRO_CAMPAIGN.ruleSummary).not.toContain('20:00');
    expect(DEEPSEEK_V4_PRO_CAMPAIGN.window.startAt).toBe('2026-08-13T20:00:00+08:00');
    expect(DEEPSEEK_V4_PRO_CAMPAIGN.window.endAtExclusive).toBe('2026-08-27T20:00:00+08:00');
    expect(DEEPSEEK_V4_PRO_CAMPAIGN.window.label).toBe('8 月 13 日—8 月 27 日');
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
    const activeAt = Date.parse(DEEPSEEK_V4_PRO_CAMPAIGN.window.startAt);
    expect(DEEPSEEK_V4_PRO_CAMPAIGN.paid.cta).toBe('立即使用');
    expect(DEEPSEEK_V4_PRO_CAMPAIGN.unpaid.cta).toContain('升级套餐');
    expect(DEEPSEEK_V4_PRO_CAMPAIGN.paid.modelBadge).toBe('无限使用');
    expect(DEEPSEEK_V4_PRO_CAMPAIGN.unpaid.modelBadge).toBe('升级可用');
    expect(DEEPSEEK_V4_PRO_CAMPAIGN.unpaid.tooltip).toContain('8 月 27 日');
    expect(DEEPSEEK_V4_PRO_CAMPAIGN.restricted.modelBadge).toBe('已暂停');
    expect(DEEPSEEK_V4_PRO_CAMPAIGN.restricted.tooltip).toContain('异常的大规模使用');
    expect(DEEPSEEK_V4_PRO_CAMPAIGN.boundary).toBe(
      '套餐内的无限制模型额度与免费生成次数，仅可通过Open Design使用；无法在MCP/CLI/API及其他场景使用。部分模型高峰期需要排队。解释权归官方所有。',
    );
    expect(DEEPSEEK_V4_PRO_COPY.en.boundary).toContain(
      'Some models may require queuing during peak hours.',
    );
    expect(DEEPSEEK_V4_PRO_CAMPAIGN.audienceDefinition.paid).toContain(
      '当前存在有效个人或团队订阅',
    );
    expect(DEEPSEEK_V4_PRO_CAMPAIGN.audienceDefinition.unpaid).toContain(
      '曾经充值但没有订阅',
    );

    expect(resolveDeepSeekV4ProCampaignAudience({
      plan: 'plus',
      loggedIn: true,
      now: activeAt,
    })).toBe('paid');
    expect(resolveDeepSeekV4ProCampaignAudience({
      plan: 'team_pro',
      loggedIn: true,
      now: activeAt,
    })).toBe('paid');
    // A positive wallet balance or historical recharge is intentionally absent
    // from the resolver: backend-confirmed `free` still routes to the unpaid
    // modal because only an active subscription counts as paid.
    expect(resolveDeepSeekV4ProCampaignAudience({
      plan: 'free',
      loggedIn: true,
      now: activeAt,
    })).toBe('unpaid');
    expect(resolveDeepSeekV4ProCampaignAudience({
      plan: null,
      loggedIn: null,
      now: activeAt,
    })).toBe('unknown');
    expect(resolveDeepSeekV4ProCampaignAudience({
      plan: 'plus',
      loggedIn: true,
      search: '?campaignAudience=unpaid',
    })).toBe('unpaid');
  });

  it('keeps the paid modal actions on the final approved interaction', () => {
    expect(campaignDialogSource).toContain('{presentation.cta}');
    expect(campaignDialogSource).toContain('{copy.later}');
    expect(campaignDialogSource).toContain('styles.modelCard');
    expect(campaignDialogSource).toContain('styles.boundary');
    expect(campaignDialogSource).toContain('styles.laterAction');
    expect(campaignDialogSource).toContain('<Icon name="close"');
    expect(campaignDialogSource).not.toContain('deepseek-v4-pro-free-week-poster-v5.png');
    expect(campaignDialogSource).toMatch(/onClick=\{closeModal\}/);
    expect(campaignDialogSource.indexOf('{copy.later}')).toBeLessThan(
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
    const start = Date.parse(DEEPSEEK_V4_PRO_CAMPAIGN.window.startAt);
    const end = Date.parse(DEEPSEEK_V4_PRO_CAMPAIGN.window.endAtExclusive);

    expect(formatDeepSeekV4ProCampaignCountdown(start - 1_000)).toBe('0天 00:00:01');
    expect(formatDeepSeekV4ProCampaignCountdown(start - 1_000)).not.toContain('距开始');
    expect(formatDeepSeekV4ProCampaignCountdown(start)).toBe('14天 00:00:00');
    expect(formatDeepSeekV4ProCampaignCountdown(end)).toBe('活动已结束');
    expect(formatDeepSeekV4ProCampaignMockRemaining(14 * 24 * 60 * 60 * 1000)).toBe(
      '14天 00:00:00',
    );
    expect(campaignDialogSource).toContain('deepseek-v4-pro-campaign-countdown');
    expect(campaignDialogSource).toContain('{copy.week}');
    expect(campaignDialogSource).toContain('REVIEW_COUNTDOWN_DURATION_MS');
    expect(campaignDialogSource).not.toContain('formatDeepSeekV4ProCampaignCountdown(countdownNow)');
    expect(campaignDialogSource.indexOf('styles.countdown')).toBeLessThan(
      campaignDialogSource.indexOf('styles.actions'),
    );
    expect(campaignDialogSource).toContain('styles.modelCard');
    expect(campaignDialogSource).toContain('styles.boundary');
  });

  it('keeps the unpaid action on the upgrade flow without showing the paid secondary action', () => {
    expect(DEEPSEEK_V4_PRO_CAMPAIGN.unpaid.cta).toBe('升级套餐，立即使用');
    expect(campaignDialogSource).toContain("'deepseek_unpaid_modal'");
    expect(campaignDialogSource).toContain('attributedAmrUrl(plansUrl, attribution)');
    expect(campaignDialogSource).toMatch(/\{paid \? \([\s\S]*\{copy\.later\}[\s\S]*\) : null\}/);
  });

  it('opens for every paid user only inside the shared half-open window', () => {
    const start = Date.parse(DEEPSEEK_V4_PRO_CAMPAIGN.window.startAt);
    const end = Date.parse(DEEPSEEK_V4_PRO_CAMPAIGN.window.endAtExclusive);

    expect(isDeepSeekV4ProCampaignWindowOpen(start - 1)).toBe(false);
    expect(isDeepSeekV4ProCampaignWindowOpen(start)).toBe(true);
    expect(isDeepSeekV4ProCampaignWindowOpen(end - 1)).toBe(true);
    expect(isDeepSeekV4ProCampaignWindowOpen(end)).toBe(false);
    expect(isDeepSeekV4ProCampaignVisible({ now: start - 1 })).toBe(false);
    expect(isDeepSeekV4ProCampaignVisible({ now: start })).toBe(true);
    expect(isDeepSeekV4ProCampaignVisible({ now: end })).toBe(false);
    expect(isDeepSeekV4ProCampaignVisible({
      now: end,
      search: '?campaign=deepseek-v4-pro',
    })).toBe(true);
    expect(resolveDeepSeekV4ProCampaignAudience({
      plan: 'plus', loggedIn: true, now: start - 1,
    })).toBe('unknown');
    expect(resolveDeepSeekV4ProCampaignAudience({
      plan: 'plus', loggedIn: true, now: end,
    })).toBe('unknown');
  });
});
