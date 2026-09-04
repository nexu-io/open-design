import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const entryShellSource = readFileSync(
  resolve(process.cwd(), 'src/components/EntryShell.tsx'),
  'utf8',
);
const entryNavRailSource = readFileSync(
  resolve(process.cwd(), 'src/components/EntryNavRail.tsx'),
  'utf8',
);
const appSource = readFileSync(
  resolve(process.cwd(), 'src/App.tsx'),
  'utf8',
);
const workbenchCampaignBadgeSource = readFileSync(
  resolve(process.cwd(), 'src/components/WorkbenchCampaignBadge.tsx'),
  'utf8',
);
const entryLayoutStyles = readFileSync(
  resolve(process.cwd(), 'src/styles/home/entry-layout.css'),
  'utf8',
);
const modelSwitcherSource = readFileSync(
  resolve(process.cwd(), 'src/components/InlineModelSwitcher.tsx'),
  'utf8',
);
const homeViewSource = readFileSync(
  resolve(process.cwd(), 'src/components/HomeView.tsx'),
  'utf8',
);
const campaignModalSource = readFileSync(
  resolve(process.cwd(), 'src/components/DeepSeekV4FlashCampaign.tsx'),
  'utf8',
);
const campaignModalStyles = readFileSync(
  resolve(process.cwd(), 'src/components/DeepSeekV4FlashCampaign.module.css'),
  'utf8',
);

describe('DeepSeek V4 Flash workbench campaign entry', () => {
  it('removes the Go-only media branch from the active campaign modal', () => {
    expect(campaignModalSource).not.toContain('unpkg.com');
    expect(campaignModalSource).not.toContain('/go-plan/');
    expect(campaignModalSource).not.toContain('styles.goWelcome');
  });

  it('uses the top-right campaign slot only for the active DeepSeek audience', () => {
    expect(entryShellSource).toContain('<WorkbenchCampaignBadge');
    expect(workbenchCampaignBadgeSource).toContain('deepseek-campaign-pricing-badge');
    expect(workbenchCampaignBadgeSource).not.toContain("kind === 'go'");
    expect(workbenchCampaignBadgeSource).not.toContain('goPlanCopy.workbenchBadge');
    expect(workbenchCampaignBadgeSource).toContain("t('campaign.deepseekV4Flash.workbenchBadge')");
    expect(workbenchCampaignBadgeSource).toContain("t('campaign.deepseekV4Flash.workbenchBadgeAria')");
    expect(entryShellSource).not.toContain("subscriptionAudience === 'unpaid'");
    expect(entryShellSource).not.toContain('goPlanCampaignVisibility.visible');
    expect(entryShellSource).toContain("deepSeekV4FlashCampaignAudience === 'unknown'");
  });

  it('keeps the top-right campaign entry visible across entry tabs and project detail', () => {
    expect(entryShellSource).toMatch(
      /topRightSlot=\{\s*topRightCampaignAudience \? \(/,
    );
    expect(entryShellSource).not.toMatch(
      /topRightSlot=\{\s*view === 'home'/,
    );
    expect(entryNavRailSource).toMatch(
      /export function WorkspaceTopRightAccountCluster[\s\S]*?leadingSlot=\{campaignAudience \? \([\s\S]*?<WorkbenchCampaignBadge[\s\S]*?audience=\{campaignAudience\}[\s\S]*?page="project"/,
    );
    expect(appSource).toMatch(
      /<WorkspaceTopRightAccountCluster[\s\S]*?amrLoggedIn=\{amrLoginStatus\?\.loggedIn \?\? null\}[\s\S]*?metricsConsent=\{config\.telemetry\?\.metrics === true\}/,
    );
  });

  it('sends both Go and paid DeepSeek badges to public Pricing', () => {
    expect(entryShellSource).not.toContain('amrPlansUrlForWorkspace');
    expect(workbenchCampaignBadgeSource).toContain('goPlanPricingUrl(locale)');
    expect(workbenchCampaignBadgeSource).toContain("'deepseek_workbench_badge'");
    expect(workbenchCampaignBadgeSource).toContain("'noopener,noreferrer'");
    // The destination comes from the active app locale rather than pinning one
    // language into a link shown to every locale.
    expect(workbenchCampaignBadgeSource).not.toContain('open-design.ai/zh/pricing');
  });

  it('reuses the existing DeepSeek badge treatment without Go-only chrome', () => {
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
    expect(workbenchCampaignBadgeSource).toContain('className="entry-deepseek-campaign-badge"');
    expect(entryLayoutStyles).not.toContain('.entry-go-campaign-new');
    expect(entryLayoutStyles).not.toContain('.entry-go-campaign-badge');
    expect(badgeRule).not.toContain('color: var(--green)');
    expect(badgeRule).not.toContain('background: transparent');
  });

  it('carries a campaign-specific attribution id into the model upgrade flow', () => {
    expect(modelSwitcherSource).toContain("'deepseek_model_switcher_upgrade'");
    expect(modelSwitcherSource).toContain('attributedAmrUrl(');
    expect(modelSwitcherSource).toContain('campaignNeedsUpgrade');
  });

  it('mounts the campaign modal gated on the active home view only', () => {
    // EntryShell hides inactive entry views with display:none while the
    // Dialog portals to document.body, so visibility CSS alone cannot stop
    // the modal from interrupting projects/tasks/... routes. The home-view
    // activity signal must reach the modal as a prop.
    expect(entryShellSource).toContain("isActive={view === 'home'}");
    expect(homeViewSource).toMatch(
      /<DeepSeekV4FlashCampaign[\s\S]*?active=\{isActive\}/,
    );
    expect(campaignModalSource).toMatch(/if \(!active\)/);
  });

  it('re-arms the unseen modal when the user returns to the home view', () => {
    // Leaving home closes the dialog WITHOUT marking it seen; the open
    // effect must therefore re-run on the activity flip, not only on the
    // audience settling.
    expect(campaignModalSource).toMatch(/\}, \[active, activeCampaignId, audience\]\);/);
    expect(campaignModalSource).toMatch(
      /if \(!active \|\| !modalOpen \|\| audience === 'unknown'/,
    );
  });

  it('wires the paid use_now CTA to the real agent/model switch (D5)', () => {
    // The modal's callback must reach EntryShell's persistence pair — the
    // same onAgentChange/onAgentModelChange the InlineModelSwitcher writes
    // through — so 立即使用 changes the workbench, not just the UI.
    // Mode must flip to daemon first: a paid BYOK user (mode === 'api')
    // would otherwise keep the BYOK provider after agent/model ids change.
    expect(entryShellSource).toContain('applyDeepSeekCampaignModel');
    expect(entryShellSource).toMatch(
      /onModeChange\('daemon'\);\s*onAgentChange\(agentId\);\s*onAgentModelChange\(agentId, \{ model: modelId \}\)/,
    );
    expect(entryShellSource).toMatch(
      /\[onAgentChange, onAgentModelChange, onModeChange\]/,
    );
    expect(homeViewSource).toContain('onUseCampaignModel={onDeepSeekV4FlashCampaignUseNow}');
    expect(campaignModalSource).toContain("onUseCampaignModel?.('amr', campaign.modelId)");
  });

  it('keeps every campaign surface free of URL-parameter reads (product decision)', () => {
    const campaignLibSource = readFileSync(
      resolve(process.cwd(), 'src/campaigns/deepseek-v4-flash.ts'),
      'utf8',
    );
    // The former URL review backdoors (campaign / audience / usage override
    // parameters) were removed for good. Campaign visibility comes from the
    // real window and the real audience only; pre-launch review happens by
    // temporarily overriding the startAt constant, never through a URL.
    for (const source of [campaignLibSource, campaignModalSource, modelSwitcherSource]) {
      expect(source).not.toContain('URLSearchParams');
      expect(source).not.toContain('location.search');
    }
    // The remaining reserved presentation branch stays, but without any
    // trigger that could be driven from a URL.
    expect(modelSwitcherSource).toContain('const campaignNeedsUpgrade = false;');
  });

  it('keeps DeepSeek analytics for paid and unpaid campaign audiences', () => {
    expect(workbenchCampaignBadgeSource).toContain('trackDeepSeekCampaignBadgeSurfaceView');
    expect(workbenchCampaignBadgeSource).toContain('trackDeepSeekCampaignBadgeClick');
    expect(workbenchCampaignBadgeSource).toContain('attributedAmrUrl(pricingUrl, attribution, deviceId)');
    expect(workbenchCampaignBadgeSource).toContain('user_state: audience');
    expect(workbenchCampaignBadgeSource).toContain("page !== 'home'");
    expect(modelSwitcherSource).toContain('trackDeepSeekCampaignModelBenefitSurfaceView');
    expect(modelSwitcherSource).toContain('trackExecutionSettingsPopoverClick');
  });
});
