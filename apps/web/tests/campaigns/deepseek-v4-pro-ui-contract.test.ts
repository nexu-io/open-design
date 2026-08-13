import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const entryShellSource = readFileSync(
  resolve(process.cwd(), 'src/components/EntryShell.tsx'),
  'utf8',
);
const entryLayoutStyles = readFileSync(
  resolve(process.cwd(), 'src/styles/home/entry-layout.css'),
  'utf8',
);
const homeHeroStyles = readFileSync(
  resolve(process.cwd(), 'src/styles/home/home-hero.css'),
  'utf8',
);
const modelSwitcherSource = readFileSync(
  resolve(process.cwd(), 'src/components/InlineModelSwitcher.tsx'),
  'utf8',
);

describe('DeepSeek V4 Pro workbench campaign entry', () => {
  it('shows a top-right pricing badge for explicit campaign audiences', () => {
    expect(entryShellSource).toContain('deepseek-campaign-pricing-badge');
    expect(entryShellSource).toContain('deepSeekCampaignCopy.topBadge');
    expect(entryShellSource).toContain('deepSeekV4ProCampaignAudience !== \'unknown\'');
  });

  it('opens the Cloud console Pricing view in a separate browser context', () => {
    expect(entryShellSource).toContain('amrPlansUrlForWorkspace(');
    expect(entryShellSource).toContain('amrPlansUrlForProfile(undefined)');
    expect(entryShellSource).not.toContain('https://open-design.ai/zh/pricing/?source=desktop_campaign_badge');
    expect(entryShellSource).toContain("'deepseek_workbench_badge'");
    expect(entryShellSource).toContain('attributedAmrUrl(plansUrl, attribution)');
    expect(entryShellSource).toContain("'noopener,noreferrer'");
  });

  it('uses a restrained green campaign treatment from shared brand tokens', () => {
    const badgeRule = entryLayoutStyles.match(
      /\.entry-deepseek-campaign-badge\s*\{([^}]*)\}/,
    )?.[1];

    expect(badgeRule).toContain('color: var(--brand-text)');
    expect(badgeRule).toContain('border: 1px solid color-mix(in srgb, var(--brand) 42%, var(--border))');
    expect(badgeRule).toContain('background: color-mix(in srgb, var(--brand-soft) 82%, var(--bg-panel))');
    expect(badgeRule).toContain('border-radius: var(--radius-pill)');
    expect(entryLayoutStyles).toContain('.entry-deepseek-campaign-badge::before');
    expect(entryLayoutStyles).toContain('background: var(--brand-text)');
    expect(entryLayoutStyles).toContain('.entry-deepseek-campaign-badge svg');
    expect(badgeRule).not.toContain('color: var(--green)');
    expect(badgeRule).not.toContain('background: transparent');
  });

  it('models the unpaid review URL as a signed-in user with existing models', () => {
    expect(modelSwitcherSource).toContain('DEEPSEEK_CAMPAIGN_REVIEW_MODELS');
    expect(modelSwitcherSource).toContain(
      "{ id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro' }",
    );
    expect(modelSwitcherSource).toContain(
      "{ id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash' }",
    );
    expect(modelSwitcherSource.indexOf("id: 'deepseek-v4-pro'")).toBeLessThan(
      modelSwitcherSource.indexOf("id: 'deepseek-v4-flash'"),
    );
    expect(modelSwitcherSource).toContain('DEEPSEEK_UNPAID_REVIEW_DEFAULT_MODEL_ID');
    expect(modelSwitcherSource).toContain("campaignAudienceOverride === 'unpaid'");
    expect(modelSwitcherSource).toContain('isDeepSeekV4ProCampaignModel(modelId)');
    expect(modelSwitcherSource).toContain('isDeepSeekV4ProCampaignModel(model.id)');
    expect(modelSwitcherSource).toContain('const selectableInCampaign =');
    expect(modelSwitcherSource).toContain('campaignVisibility.visible &&');
    expect(modelSwitcherSource).toContain('selectableInCampaign ||');
    expect(modelSwitcherSource).toContain(
      'isDeepSeekV4ProCampaignModel(model.id)\n            ? true',
    );
    expect(modelSwitcherSource).toContain(': campaignCopy.badge;');
    expect(modelSwitcherSource).not.toContain('? campaignCopy.locked');
    expect(modelSwitcherSource).not.toContain("? ' is-unpaid'");
    expect(entryLayoutStyles).not.toContain('.inline-switcher__campaign-badge.is-unpaid');
    expect(modelSwitcherSource).toContain('data-campaign-review');
    expect(homeHeroStyles).toContain('.inline-switcher[data-campaign-review]');
    expect(homeHeroStyles).toContain('max-width: 220px');
  });

  it('carries a campaign-specific attribution id into the model upgrade flow', () => {
    expect(modelSwitcherSource).toContain("'deepseek_model_switcher_upgrade'");
    expect(modelSwitcherSource).toContain('attributedAmrUrl(');
    expect(modelSwitcherSource).toContain('campaignNeedsUpgrade');
  });

  it('tracks campaign discovery surfaces without replacing model-selection events', () => {
    expect(entryShellSource).toContain('trackDeepSeekCampaignBadgeSurfaceView');
    expect(entryShellSource).toContain('trackDeepSeekCampaignBadgeClick');
    expect(modelSwitcherSource).toContain('trackDeepSeekCampaignModelBenefitSurfaceView');
    expect(modelSwitcherSource).toContain("element: 'deepseek_v4_pro_benefit'");
    expect(modelSwitcherSource).toContain("campaign_id: 'deepseek_v4_pro'");
    expect(modelSwitcherSource).toContain("model_id: 'deepseek-v4-pro'");
    expect(modelSwitcherSource).toContain("element: 'deepseek_v4_flash_benefit'");
    expect(modelSwitcherSource).toContain("campaign_id: 'deepseek_v4_flash'");
    expect(modelSwitcherSource).toContain("model_id: 'deepseek-v4-flash'");
    expect(modelSwitcherSource).toContain('trackExecutionSettingsPopoverClick');
  });
});
