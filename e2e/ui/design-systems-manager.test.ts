import { expect, test } from '@playwright/test';
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
  await expect(page.getByText('Loading Open Design…')).toHaveCount(0, { timeout: 15_000 });
}

async function gotoEntryHome(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  const privacyDialog = page.getByRole('dialog').filter({ hasText: 'Help us improve Open Design' });
  if (await privacyDialog.isVisible().catch(() => false)) {
    await privacyDialog.getByRole('button', { name: /not now/i }).click();
  }
  await expect(page.getByTestId('home-hero')).toBeVisible();
}

async function routeDesignSystemsManager(
  page: Page,
  systems: UserSystem[],
  {
    initialConfig,
  }: {
    initialConfig?: Partial<Record<string, unknown>>;
  } = {},
) {
  const persistedConfigs: Array<{ designSystemId?: string | null }> = [];
  let currentConfig = { ...baseConfig(), ...(initialConfig ?? {}) };

  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    const path = url.pathname;

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
  await page.getByTestId('entry-nav-design-systems').click();
  await expect(page).toHaveURL(/\/design-systems$/);
  await page.getByRole('tab', { name: 'Your systems' }).click();

  const manager = page.locator('section[aria-label="Your design systems"]');
  const alphaRow = manager.locator('.ds-user-row').filter({ hasText: 'Brand Alpha' });

  await expect(alphaRow.getByRole('button', { name: 'Make default' })).toHaveCount(0);
  await alphaRow.locator('.ds-status-toggle').click();
  await expect(alphaRow.locator('.ds-status-toggle')).toContainText('Published');
  await expect(alphaRow.getByText('Default')).toBeVisible();
  await expect
    .poll(() => persistedConfigs.at(-1)?.designSystemId)
    .toBe('brand-alpha');
});

test('[P1] filters user design systems by draft and published status in the manager', async ({ page }) => {
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
  await routeDesignSystemsManager(page, systems);

  await gotoEntryHome(page);
  await page.getByTestId('entry-nav-design-systems').click();
  await expect(page).toHaveURL(/\/design-systems$/);
  await page.getByRole('tab', { name: 'Your systems' }).click();

  const manager = page.locator('section[aria-label="Your design systems"]');
  const filter = manager.getByRole('combobox', { name: 'Filter design systems' });

  await filter.selectOption('published');
  await expect(manager.getByText('Brand Beta')).toBeVisible();
  await expect(manager.getByText('Brand Alpha')).toHaveCount(0);

  await filter.selectOption('draft');
  await expect(manager.getByText('Brand Alpha')).toBeVisible();
  await expect(manager.getByText('Brand Beta')).toHaveCount(0);
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
  await page.getByTestId('entry-nav-design-systems').click();
  await expect(page).toHaveURL(/\/design-systems$/);
  await page.getByRole('tab', { name: 'Your systems' }).click();

  page.once('dialog', (dialog) => dialog.accept());

  const manager = page.locator('section[aria-label="Your design systems"]');
  const alphaRow = manager.locator('.ds-user-row').filter({ hasText: 'Brand Alpha' });
  await alphaRow.getByRole('button', { name: 'Delete Brand Alpha' }).click();

  await expect(alphaRow).toHaveCount(0);
  await expect
    .poll(() => persistedConfigs.at(-1)?.designSystemId)
    .toBe('brand-beta');
  const betaRow = manager.locator('.ds-user-row').filter({ hasText: 'Brand Beta' });
  await expect(betaRow.getByText('Default')).toBeVisible();
});
