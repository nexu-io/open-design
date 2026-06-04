import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

const STORAGE_KEY = 'open-design:config';
const OPEN_SETTINGS_LABEL = /Open settings|打开设置|開啟設定/i;

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

async function seedSettingsBase(page: Page, override?: Record<string, unknown>) {
  await page.addInitScript(({ key, value }) => {
    window.localStorage.setItem(key, JSON.stringify(value));
  }, { key: STORAGE_KEY, value: { ...baseConfig(), ...override } });
}

async function routeBootstrapApis(
  page: Page,
  options?: {
    mediaConfigGet?: (route: Route) => Promise<void>;
    mediaConfigPut?: (route: Route) => Promise<void>;
  },
) {
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
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
      return;
    }
    if (path === '/api/connectors/composio/config') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"configured":false,"apiKeyTail":""}' });
      return;
    }
    if (path === '/api/media/config' && method === 'GET') {
      if (options?.mediaConfigGet) {
        await options.mediaConfigGet(route);
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"providers":{}}' });
      return;
    }
    if (path === '/api/media/config' && method === 'PUT') {
      if (options?.mediaConfigPut) {
        await options.mediaConfigPut(route);
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
      return;
    }
    if (path === '/api/skills') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"skills":[]}' });
      return;
    }
    if (path === '/api/design-systems') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"designSystems":[]}' });
      return;
    }
    if (path === '/api/projects') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"projects":[]}' });
      return;
    }
    if (path === '/api/templates') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"templates":[]}' });
      return;
    }
    if (path === '/api/prompt-templates') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"promptTemplates":[]}' });
      return;
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
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
}

async function openMediaSettings(page: Page) {
  await gotoEntryHome(page);
  return await openMediaSettingsFromCurrentPage(page);
}

async function openMediaSettingsFromCurrentPage(page: Page) {
  await page.getByRole('button', { name: OPEN_SETTINGS_LABEL }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: /^Media providers$/ }).click();
  await expect(dialog.getByRole('heading', { name: 'Media providers' })).toBeVisible();
  return dialog;
}

async function openNewProjectImageModelPicker(page: Page) {
  await page.getByTestId('entry-nav-new-project').click();
  await expect(page.getByTestId('new-project-modal')).toBeVisible();
  await page.getByTestId('new-project-tab-media').click();
  await page.getByTestId('new-project-media-surface-image').click();
  await page.getByTestId('model-picker-trigger').click();
  return page.locator('.ds-picker-group').filter({ has: page.getByText('OpenAI', { exact: true }) });
}

test.describe('Settings media providers flows', () => {
  test('[P1] autosaves media provider edits and restores them after closing and reopening settings', async ({ page }) => {
    await seedSettingsBase(page);

    const mediaConfigWrites: Array<Record<string, unknown>> = [];
    await routeBootstrapApis(page, {
      mediaConfigPut: async (route) => {
        mediaConfigWrites.push(route.request().postDataJSON() as Record<string, unknown>);
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
      },
    });

    let dialog = await openMediaSettings(page);

    await dialog.getByLabel('FishAudio API key').fill('fish-key');
    await dialog.getByLabel('FishAudio Base URL').fill('https://fish.example.com');

    await page.waitForFunction(
      ({ key }) => {
        const raw = window.localStorage.getItem(key);
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        return parsed.mediaProviders?.fishaudio?.apiKey === 'fish-key'
          && parsed.mediaProviders?.fishaudio?.baseUrl === 'https://fish.example.com';
      },
      { key: STORAGE_KEY },
    );

    await expect(dialog.getByText('All changes saved')).toBeVisible();
    expect(mediaConfigWrites.length).toBeGreaterThan(0);

    await dialog.getByRole('button', { name: 'Close', exact: true }).click();

    dialog = await openMediaSettingsFromCurrentPage(page);
    await expect(dialog.getByLabel('FishAudio API key')).toHaveValue('fish-key');
    await expect(dialog.getByLabel('FishAudio Base URL')).toHaveValue('https://fish.example.com');
  });

  test('[P1] reloads media provider settings from daemon after an initial load failure', async ({ page }) => {
    await seedSettingsBase(page);

    let daemonMediaStatus: 'error' | 'ok' = 'error';
    await routeBootstrapApis(page, {
      mediaConfigGet: async (route) => {
        if (daemonMediaStatus === 'error') {
          await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"daemon unavailable"}' });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            providers: {
              openai: {
                configured: true,
                apiKeyTail: '9876',
                baseUrl: 'https://daemon.example/v1',
              },
            },
          }),
        });
      },
    });

    const dialog = await openMediaSettings(page);

    await expect(
      dialog.getByText('Could not load media provider settings from the local daemon. Using browser-saved settings for now.'),
    ).toBeVisible();

    daemonMediaStatus = 'ok';
    await dialog.getByRole('button', { name: 'Reload from daemon' }).click();

    await expect(dialog.getByText('Reloaded media provider settings from the local daemon.')).toBeVisible();
    await expect(dialog.getByText('Saved · ••••9876')).toBeVisible();
    await expect(dialog.getByLabel('OpenAI Base URL')).toHaveValue('https://daemon.example/v1');
  });

  test('[P1] saved media provider config is consumed by the new-project media picker across pages', async ({ page }) => {
    await seedSettingsBase(page);
    await routeBootstrapApis(page);

    const dialog = await openMediaSettings(page);
    await dialog.getByLabel('OpenAI API key').fill('sk-openai-cross-page');

    await page.waitForFunction(
      ({ key }) => {
        const raw = window.localStorage.getItem(key);
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        return parsed.mediaProviders?.openai?.apiKey === 'sk-openai-cross-page';
      },
      { key: STORAGE_KEY },
    );
    await expect(dialog.getByText('All changes saved')).toBeVisible();
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();

    const openaiGroup = await openNewProjectImageModelPicker(page);
    await expect(openaiGroup).toContainText('Configured');
    await expect(openaiGroup).not.toContainText('Integrated');
  });
});
