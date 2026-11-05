import { expect, test } from '@/playwright/suite';
import { ensureRailOpen } from '@/playwright/rail';
import { settingsSurface } from '@/playwright/amr';
import { routeAgents, suppressWhatsNew } from '@/playwright/mock-factory';
import { T } from '@/timeouts';
import type { Page } from '@playwright/test';

const STORAGE_KEY = 'open-design:config';

test.describe.configure({ timeout: T.xlong });

async function waitForLoadingToClear(page: Page) {
  await expect(page.getByText('Loading OpenDesign…')).toHaveCount(0, { timeout: T.long });
}

async function gotoEntryHome(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  const privacyDialog = page.getByRole('dialog').filter({ hasText: 'Help us improve OpenDesign' });
  if (await privacyDialog.isVisible().catch(() => false)) {
    await privacyDialog.getByRole('button', { name: /I get it|not now|got it|don't share/i }).click();
  }
  // The settings button moved into the collapsed-by-default rail (#5517), so
  // the hero is the reliable "entry is ready" signal now.
  await expect(page.getByTestId('home-hero')).toBeVisible();
  await expect(page.getByTestId('home-hero-input')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  // The entry home mounts `WhatsNewPopup` (EntryShell.tsx) and its backdrop sits
  // at z-index 1500 — above the z-index 120 chrome that owns the rail/settings
  // controls this spec clicks. A live release card would swallow those clicks.
  await suppressWhatsNew(page);
  await page.addInitScript((key) => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem(
      key,
      JSON.stringify({
        mode: 'daemon',
        apiKey: '',
        baseUrl: 'https://api.anthropic.com',
        model: 'claude-sonnet-4-5',
        agentId: 'codex',
        skillId: null,
        designSystemId: null,
        onboardingCompleted: true,
        agentModels: { codex: { model: 'default', reasoning: 'default' } },
        privacyDecisionAt: 1,
        telemetry: { metrics: false, content: false, artifactManifest: false },
      }),
    );
  }, STORAGE_KEY);

  await page.route('**/api/github/open-design', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ stargazers_count: 51600 }),
    });
  });

  await routeAgents(page, [
    {
      id: 'codex',
      name: 'Codex CLI',
      bin: 'codex',
      available: true,
      version: '0.80.0',
      path: '/usr/local/bin/codex',
      models: [{ id: 'default', label: 'Default' }],
    },
    {
      id: 'mock',
      name: 'Mock Agent',
      bin: 'mock-agent',
      available: true,
      version: 'test',
      models: [{ id: 'default', label: 'Default' }],
    },
  ]);

  await page.route('**/api/app-config', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({
      json: {
        config: {
          onboardingCompleted: true,
          agentId: 'codex',
          skillId: null,
          designSystemId: null,
          mode: 'daemon',
          agentModels: { codex: { model: 'default', reasoning: 'default' } },
          privacyDecisionAt: 1,
          telemetry: { metrics: false, content: false, artifactManifest: false },
        },
      },
    });
  });
});

// #5517 deleted the entry topbar outright (`EntryShell` renders
// `entry-shell--no-header` and its comment spells this out). Everything the bar
// used to carry either moved or went away:
//   • GitHub star badge  — `GithubStarBadge` is no longer rendered anywhere
//   • Discord badge      — removed
//   • "Use everywhere"   — removed; the guide keeps its Integrations tab
//   • Settings button    — moved into the (collapsed-by-default) rail footer
//   • Execution pill     — moved into the Home composer footer
// The chip/link inventory and external-link-contract specs are therefore gone;
// what remains below pins the two controls that survived, at their new homes.

test('[P2] home chrome exposes the composer execution pill and the rail settings entry', async ({ page }) => {
  await gotoEntryHome(page);

  await expect(page.locator('.entry-main__topbar')).toHaveCount(0);
  await expect(page.getByTestId('inline-model-switcher-chip')).toBeVisible();

  await ensureRailOpen(page);
  await expect(page.getByTestId('entry-settings-button')).toBeVisible();
});

test('[P1] OPEND-4452 project tabs omit the duplicate invitation button while shell invitation remains usable', async ({ page }, info) => {
  const scope = { workspaceId: 'invite-project-tabs', workspaceMemberId: 'invite-project-owner',
    workspaceName: 'Project tabs', workspaceType: 'team', role: 'owner', memberStatus: 'active', lifecycleState: 'active',
    billingState: 'active', planId: 'max', permissions: { canInviteMembers: true, canShareProjects: true, canManageSharedResources: true, canViewWorkspaceSettings: true } };
  await page.route('**/api/integrations/vela/status*', route => route.fulfill({ json: {
    loggedIn: true, profile: 'test', user: { id: 'project-invite-user', email: 'projects@example.invalid' },
  } }));
  await page.route('**/api/workspace/context', route => route.fulfill({ json: { context: scope } }));
  await page.route('**/api/workspace/directory', route => route.fulfill({ json: { items: [scope], activeWorkspaceId: scope.workspaceId } }));
  await page.route('**/api/projects*', route => route.fulfill({ json: { projects: [{
    id: 'opend-4452-project', name: 'Invitation entry review', skillId: null, designSystemId: null,
    createdAt: 1, updatedAt: 2, status: { value: 'not_started' },
  }] } }));
  await page.route('**/api/workspaces/*/projects*', route => route.fulfill({ json: { projects: [{
    workspaceId: scope.workspaceId, visibility: 'private', project: {
      id: 'opend-4452-project', name: 'Invitation entry review', skillId: null, designSystemId: null,
      createdAt: 1, updatedAt: 2, status: { value: 'not_started' },
    },
  }] } }));
  await gotoEntryHome(page);
  await ensureRailOpen(page);
  await page.getByTestId('entry-nav-drafts').click();
  for (const collection of ['recent', 'personalProjects', 'teamProjects']) {
    const tab = page.getByTestId(`recent-projects-collection-${collection}`);
    await tab.click();
    await expect(tab).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('.recent-projects__controls').getByRole('button', { name: 'Invite teammates', exact: true })).toHaveCount(0);
  }
  await info.attach('projects-without-duplicate-invite', { body: await page.screenshot(), contentType: 'image/png' });
  const invite = page.getByRole('button', { name: 'Invite', exact: true });
  await expect(invite).toBeVisible();
  await invite.click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('[P1] OPEND-4440 unresolved workspace stays neutral before switching to a known Max plan', async ({ page }, info) => {
  const scopes = ['unknown', 'max'].map(plan => ({
    workspaceId: `plan-${plan}`, workspaceMemberId: `member-${plan}`,
    workspaceName: `Plan ${plan}`, workspaceType: 'team', role: 'owner',
    memberStatus: 'active', lifecycleState: 'active',
  }));
  let active = scopes[0]!;
  const context = () => ({ ...active, billingState: 'active',
    planId: active === scopes[1] ? 'max' : null,
    permissions: { canViewWorkspaceSettings: true, canInviteMembers: true, canManageBilling: true } });
  await page.route('**/api/integrations/vela/status*', route => route.fulfill({ json: {
    loggedIn: true, profile: 'test', user: { id: 'plan-user', email: 'plan@example.invalid' },
  } }));
  await page.route('**/api/projects*', route => route.fulfill({ json: { projects: [] } }));
  await page.route('**/api/workspace/directory', route => route.fulfill({ json: { items: scopes, activeWorkspaceId: active.workspaceId } }));
  await page.route('**/api/workspace/context', route => route.fulfill({ json: { context: context() } }));
  await page.route('**/api/workspace/active', route => {
    active = scopes.find(scope => scope.workspaceId === route.request().postDataJSON().workspaceId)!;
    return route.fulfill({ json: { activeWorkspaceId: active.workspaceId, context: context() } });
  });
  await page.route('**/api/workspace/billing?*', route => route.fulfill({ json: {
    summary: null,
    workspaceBalance: { ...active, balanceUsd: '0', billingScopeVersion: 2, updatedAt: new Date().toISOString(), expiresAt: null },
  } }));
  await gotoEntryHome(page);
  const pill = page.getByTestId('entry-top-right-credits');
  await expect(pill).toBeVisible();
  await expect(pill).toHaveAttribute('aria-busy', 'true');
  await expect(pill.locator('.plan-wordmark')).toHaveCount(0);
  await pill.hover();
  const panel = page.getByTestId('entry-top-right-credits-panel');
  await expect(panel).toBeVisible();
  await expect(panel.locator('.entry-nav-rail__menu-credits-plan')).not.toContainText(/Team|团队/);
  await info.attach('unresolved-plan-neutral', { body: await page.screenshot(), contentType: 'image/png' });
  await ensureRailOpen(page);
  await page.getByTestId('workspace-switcher').click();
  await page.getByTestId('workspace-switcher-list').getByText('Plan max', { exact: true }).click();
  await expect(pill).not.toHaveAttribute('aria-busy', 'true');
  await expect(pill.locator('.plan-wordmark')).toHaveCount(1);
  await pill.hover();
  await expect(panel.getByRole('img', { name: 'max', exact: true })).toBeVisible();
  await info.attach('known-plan-max', { body: await page.screenshot(), contentType: 'image/png' });
});

test('[P1] home execution pill reflects the selected Local CLI agent and opens the switcher', async ({ page }) => {
  await gotoEntryHome(page);

  // The composer pill is icon-only now: the selected agent + model live on its
  // accessible name / tooltip rather than in visible text.
  const pill = page.getByTestId('inline-model-switcher-chip');
  await expect(pill).toHaveAttribute('aria-label', /Codex CLI/i);
  await expect(pill).toHaveAttribute('aria-label', /default/i);

  await pill.click();

  const popover = page.getByTestId('inline-model-switcher-popover');
  await expect(popover).toBeVisible();
  // The composer's switcher is the compact variant: it drops the Local CLI /
  // BYOK segmented control and the full agent list, opening straight on the
  // CURRENT agent's models plus an entry into the execution settings where a
  // different agent is chosen.
  await expect(popover.getByTestId('inline-model-switcher-compact-model-default')).toBeVisible();
  await expect(popover.getByTestId('inline-model-switcher-mode-daemon')).toHaveCount(0);
  await expect(popover.getByTestId('inline-model-switcher-agent-codex')).toHaveCount(0);
  await expect(popover.getByTestId('inline-model-switcher-open-settings')).toBeVisible();
});

test('[P1] rail settings entry opens settings and closes the execution popover', async ({ page }) => {
  await gotoEntryHome(page);

  const pill = page.getByTestId('inline-model-switcher-chip');
  const popover = page.getByTestId('inline-model-switcher-popover');

  await pill.click();
  await expect(popover).toBeVisible();

  // Settings is a rail nav item now, so the rail has to be expanded before it
  // is interactive (collapsed the rail is `inert`).
  await ensureRailOpen(page);
  await page.getByTestId('entry-settings-button').click();
  await expect(settingsSurface(page)).toBeVisible();
  await expect(popover).toHaveCount(0);
});

test('[P2] returning from another entry view via the home nav reaches the home hero', async ({ page }) => {
  await gotoEntryHome(page);

  await ensureRailOpen(page);
  await page.getByTestId('entry-nav-design-systems').click();
  await expect(page).toHaveURL(/\/design-systems$/);

  // The logo doubles as a hover-to-collapse control now, so home is reached
  // through the explicit Home nav item rather than clicking the brand mark.
  await ensureRailOpen(page);
  await page.getByTestId('entry-nav-home').click();
  await expect(page.getByTestId('home-hero')).toBeVisible();
  await expect(page.getByTestId('home-hero-input')).toBeVisible();
  await expect(page.getByTestId('home-hero-template-picker')).toBeVisible();
});
