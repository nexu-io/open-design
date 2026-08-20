import { expect, test } from '@/playwright/suite';
import { ensureRailOpen } from '@/playwright/rail';
import type { Page } from '@playwright/test';

const STORAGE_KEY = 'open-design:config';

type UserSystem = {
  id: string;
  title: string;
  category: string;
  summary: string;
  surface: 'web' | 'image' | 'video' | 'audio';
  source: 'user';
  status: 'draft' | 'published';
  updatedAt: string;
};

type TeamShareState = {
  workspaceId: string;
  workspaceMemberId: string;
  sharedIds: Set<string>;
  shareCalls: Array<{ systemId: string; workspaceId: string | null; workspaceMemberId: string | null }>;
};

function requireSystem(system: UserSystem | undefined): UserSystem {
  if (!system) throw new Error('design system fixture missing');
  return system;
}

function baseConfig(): Record<string, unknown> {
  return {
    mode: 'daemon',
    apiKey: '',
    apiProtocol: 'anthropic',
    apiVersion: '',
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-sonnet-4-5',
    apiProviderBaseUrl: 'https://api.anthropic.com',
    agentId: 'codex',
    skillId: null,
    designSystemId: null,
    onboardingCompleted: true,
    mediaProviders: {},
    agentModels: {},
    agentCliEnv: {},
  };
}

async function seedEntryBase(page: Page, override?: Record<string, unknown>) {
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, JSON.stringify(value));
    },
    { key: STORAGE_KEY, value: { ...baseConfig(), ...override } },
  );
}

async function waitForLoadingToClear(page: Page) {
  await expect(page.getByText('Loading OpenDesign…')).toHaveCount(0, { timeout: 15_000 });
}

async function gotoEntryHome(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  const privacyDialog = page.getByRole('dialog').filter({ hasText: 'Help us improve OpenDesign' });
  if (await privacyDialog.isVisible().catch(() => false)) {
    await privacyDialog.getByRole('button', { name: /I get it|not now|got it|don't share/i }).click();
  }
  await expect(page.getByTestId('home-hero')).toBeVisible();
}

async function routeDesignSystemsManager(
  page: Page,
  systems: UserSystem[],
  {
    initialConfig,
    teamShareState,
  }: {
    initialConfig?: Partial<Record<string, unknown>>;
    teamShareState?: TeamShareState;
  } = {},
) {
  const persistedConfigs: Array<{ designSystemId?: string | null }> = [];
  let currentConfig = { ...baseConfig(), ...(initialConfig ?? {}) };

  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    const path = url.pathname;

    if (teamShareState && path === '/api/workspace/directory' && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [{
            workspaceId: teamShareState.workspaceId,
            workspaceName: 'Design Systems QA Team',
            workspaceType: 'team',
            workspaceMemberId: teamShareState.workspaceMemberId,
            role: 'owner',
            memberStatus: 'active',
            lifecycleState: 'active',
          }],
          activeWorkspaceId: teamShareState.workspaceId,
        }),
      });
      return;
    }
    if (teamShareState && path === '/api/workspace/context' && method === 'GET') {
      const headers = route.request().headers();
      if (
        headers['x-od-workspace-id'] !== teamShareState.workspaceId
        || headers['x-od-workspace-member-id'] !== teamShareState.workspaceMemberId
      ) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: '{"error":"exact_workspace_scope_required"}',
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          context: {
            workspaceId: teamShareState.workspaceId,
            workspaceName: 'Design Systems QA Team',
            workspaceType: 'team',
            workspaceMemberId: teamShareState.workspaceMemberId,
            role: 'owner',
            memberStatus: 'active',
            lifecycleState: 'active',
            billingState: 'active',
            planId: 'team_basic',
            teamId: 'team-design-systems-qa',
            providerMode: 'platform_credits',
            seatSummary: { seatLimit: 3, usedSeats: 1, availableSeats: 2, isSeatFull: false },
            permissions: {
              canManageMembers: true,
              canManageBilling: true,
              canInviteMembers: true,
              canManageAutoRecharge: true,
              canShareProjects: true,
              canWriteSyncedFiles: true,
              canViewWorkspaceSettings: true,
              canManageSharedResources: true,
            },
          },
        }),
      });
      return;
    }
    if (teamShareState && path === '/api/workspace/design-systems/team' && method === 'GET') {
      const headers = route.request().headers();
      if (
        headers['x-od-workspace-id'] !== teamShareState.workspaceId
        || headers['x-od-workspace-member-id'] !== teamShareState.workspaceMemberId
      ) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: '{"error":"exact_workspace_scope_required"}',
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ids: [...teamShareState.sharedIds],
          resources: [...teamShareState.sharedIds].map((id) => ({
            id,
            canUnshare: true,
            ownerMemberId: teamShareState.workspaceMemberId,
          })),
        }),
      });
      return;
    }
    const teamShareMatch = path.match(/^\/api\/workspace\/design-systems\/([^/]+)\/share$/);
    if (teamShareState && teamShareMatch && method === 'POST') {
      const headers = route.request().headers();
      const systemId = decodeURIComponent(teamShareMatch[1] ?? '');
      teamShareState.shareCalls.push({
        systemId,
        workspaceId: headers['x-od-workspace-id'] ?? null,
        workspaceMemberId: headers['x-od-workspace-member-id'] ?? null,
      });
      if (
        headers['x-od-workspace-id'] !== teamShareState.workspaceId
        || headers['x-od-workspace-member-id'] !== teamShareState.workspaceMemberId
      ) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: '{"error":"exact_workspace_scope_required"}',
        });
        return;
      }
      teamShareState.sharedIds.add(systemId);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"shared":true,"version":1}',
      });
      return;
    }

    if (path === '/api/health') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
      return;
    }
    if (path === '/api/agents') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          agents: [
            {
              id: 'codex',
              name: 'Codex CLI',
              bin: 'codex',
              available: true,
              version: '0.130.0',
              models: [{ id: 'default', label: 'Default' }],
            },
          ],
        }),
      });
      return;
    }
    if (path === '/api/app-config') {
      if (method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ config: currentConfig }),
        });
        return;
      }
      if (method === 'PUT') {
        const body = route.request().postDataJSON() as { designSystemId?: string | null };
        persistedConfigs.push(body);
        currentConfig = { ...currentConfig, ...body };
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
        return;
      }
    }
    if (path === '/api/connectors/composio/config') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"configured":false,"apiKeyTail":""}',
      });
      return;
    }
    if (path === '/api/media/config' && method === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"providers":{}}' });
      return;
    }
    if (path === '/api/media/config' && method === 'PUT') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
      return;
    }
    if (path === '/api/skills') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"skills":[]}' });
      return;
    }
    if (path === '/api/design-systems' && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ designSystems: systems }),
      });
      return;
    }
    if (/^\/api\/design-systems\/[^/]+$/.test(path) && method === 'PATCH') {
      const id = decodeURIComponent(path.split('/').at(-1) ?? '');
      const body = route.request().postDataJSON() as { status?: 'draft' | 'published' };
      const system = systems.find((entry) => entry.id === id);
      if (system && body.status) {
        system.status = body.status;
      }
      const responseSystem = requireSystem(system ?? systems[0]);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          designSystem: {
            ...responseSystem,
            body: `# ${responseSystem.title}`,
          },
        }),
      });
      return;
    }
    if (/^\/api\/design-systems\/[^/]+$/.test(path) && method === 'DELETE') {
      const id = decodeURIComponent(path.split('/').at(-1) ?? '');
      const index = systems.findIndex((entry) => entry.id === id);
      if (index >= 0) systems.splice(index, 1);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"ok":true}',
      });
      return;
    }
    if (/^\/api\/design-systems\/[^/]+$/.test(path) && method === 'GET') {
      const id = decodeURIComponent(path.split('/').at(-1) ?? '');
      const system = requireSystem(systems.find((entry) => entry.id === id) ?? systems[0]);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          designSystem: {
            ...system,
            body: `# ${system.title}`,
          },
        }),
      });
      return;
    }
    if (path === '/api/projects') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"projects":[]}' });
      return;
    }
    if (path === '/api/plugins') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"plugins":[]}' });
      return;
    }
    if (path === '/api/prompt-templates') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"promptTemplates":[]}' });
      return;
    }
    if (path === '/api/templates') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"templates":[]}' });
      return;
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  return { persistedConfigs };
}

test('[P1] publishing a user design system promotes it to the default system in the manager', async ({ page }) => {
  await seedEntryBase(page);
  const systems: UserSystem[] = [
    {
      id: 'brand-alpha',
      title: 'Brand Alpha',
      category: 'Productivity & SaaS',
      summary: 'Draft internal design system.',
      surface: 'web',
      source: 'user',
      status: 'draft',
      updatedAt: '2026-05-28T01:00:00.000Z',
    },
    {
      id: 'brand-beta',
      title: 'Brand Beta',
      category: 'Productivity & SaaS',
      summary: 'Published baseline system.',
      surface: 'web',
      source: 'user',
      status: 'published',
      updatedAt: '2026-05-28T00:00:00.000Z',
    },
  ];
  const { persistedConfigs } = await routeDesignSystemsManager(page, systems);

  await gotoEntryHome(page);
  await ensureRailOpen(page);
  await page.getByTestId('entry-nav-design-systems').click();
  await expect(page).toHaveURL(/\/design-systems$/);
  await page.getByRole('tab', { name: 'Your systems' }).click();

  const alphaCard = page.getByTestId('design-system-card-brand-alpha');
  await alphaCard.click();
  const detail = page.getByTestId('design-system-detail-brand-alpha');
  const statusToggle = detail.getByRole('button', { name: 'Draft' });

  await expect(detail.getByTestId('design-kit-more-actions')).toBeVisible();
  await statusToggle.click();
  await expect(detail.getByRole('button', { name: 'Published' })).toBeVisible();
  await expect(alphaCard).toContainText(/default/i);
  await expect
    .poll(() => persistedConfigs.at(-1)?.designSystemId)
    .toBe('brand-alpha');
});

test('[P1] deleting the active design system falls back to another user system', async ({ page }) => {
  await seedEntryBase(page, { designSystemId: 'brand-alpha' });
  const systems: UserSystem[] = [
    {
      id: 'brand-alpha',
      title: 'Brand Alpha',
      category: 'Productivity & SaaS',
      summary: 'Primary published system.',
      surface: 'web',
      source: 'user',
      status: 'published',
      updatedAt: '2026-05-28T01:00:00.000Z',
    },
    {
      id: 'brand-beta',
      title: 'Brand Beta',
      category: 'Productivity & SaaS',
      summary: 'Fallback published system.',
      surface: 'web',
      source: 'user',
      status: 'published',
      updatedAt: '2026-05-28T00:00:00.000Z',
    },
  ];
  const { persistedConfigs } = await routeDesignSystemsManager(page, systems, {
    initialConfig: { designSystemId: 'brand-alpha' },
  });

  await gotoEntryHome(page);
  await ensureRailOpen(page);
  await page.getByTestId('entry-nav-design-systems').click();
  await expect(page).toHaveURL(/\/design-systems$/);
  await page.getByRole('tab', { name: 'Your systems' }).click();

  page.once('dialog', (dialog) => dialog.accept());

  const alphaCard = page.getByTestId('design-system-card-brand-alpha');
  await alphaCard.click();
  const detail = page.getByTestId('design-system-detail-brand-alpha');
  await detail.getByTestId('design-kit-more-actions').click();
  await page.getByRole('menuitem', { name: 'Delete Brand Alpha' }).click();

  await expect(alphaCard).toHaveCount(0);
  await expect
    .poll(() => persistedConfigs.at(-1)?.designSystemId)
    .toBe('brand-beta');
  await expect(page.getByTestId('design-system-card-brand-beta')).toContainText(/default/i);
});

test('[P1] sharing a personal design system moves it exclusively to Team and survives reload', async ({ page }) => {
  await seedEntryBase(page);
  const systems: UserSystem[] = [
    {
      id: 'brand-team-share',
      title: 'Brand Team Share',
      category: 'Productivity & SaaS',
      summary: 'Personal system promoted into the team scope.',
      surface: 'web',
      source: 'user',
      status: 'draft',
      updatedAt: '2026-08-01T00:00:00.000Z',
    },
  ];
  const teamShareState: TeamShareState = {
    workspaceId: 'ws-design-systems-qa',
    workspaceMemberId: 'mem-design-systems-owner',
    sharedIds: new Set(),
    shareCalls: [],
  };
  await routeDesignSystemsManager(page, systems, { teamShareState });

  await gotoEntryHome(page);
  await ensureRailOpen(page);
  await page.getByTestId('entry-nav-design-systems').click();
  await expect(page).toHaveURL(/\/design-systems$/);

  const personalTab = page.getByRole('tab', { name: /Your systems/i });
  const teamTab = page.getByRole('tab', { name: /Team/i });
  const systemCard = page.getByTestId('design-system-card-brand-team-share');

  await personalTab.click();
  await expect(systemCard).toBeVisible();
  await expect(teamTab).toContainText('0');

  await systemCard.click();
  await page.getByTestId('design-kit-more-actions').click();
  const shareResponse = page.waitForResponse((response) => {
    const request = response.request();
    const url = new URL(response.url());
    return request.method() === 'POST'
      && url.pathname === '/api/workspace/design-systems/brand-team-share/share';
  });
  await page.getByRole('menuitem', { name: 'Share to team' }).click();
  expect((await shareResponse).ok()).toBe(true);

  await expect(systemCard).toHaveCount(0);
  await teamTab.click();
  await expect(systemCard).toBeVisible();
  await expect(page.getByTestId('design-system-card-brand-team-share')).toHaveCount(1);
  expect(teamShareState.shareCalls).toEqual([{
    systemId: 'brand-team-share',
    workspaceId: teamShareState.workspaceId,
    workspaceMemberId: teamShareState.workspaceMemberId,
  }]);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  await expect(page).toHaveURL(/\/design-systems$/);
  await personalTab.click();
  await expect(systemCard).toHaveCount(0);
  await teamTab.click();
  await expect(systemCard).toBeVisible();
  await expect(page.getByTestId('design-system-card-brand-team-share')).toHaveCount(1);
});
