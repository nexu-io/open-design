import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const STORAGE_KEY = 'open-design:config';
const OPEN_SETTINGS_LABEL = /Open settings|打开设置|開啟設定/i;
const SETTINGS_MENU_LABEL = /^Settings$|^设置$|^設定$/i;

test.describe.configure({ timeout: 30_000 });

function baseConfig(): Record<string, unknown> {
  return {
    mode: 'daemon',
    apiKey: '',
    apiProtocol: 'openai',
    apiVersion: '',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    apiProviderBaseUrl: 'https://api.openai.com/v1',
    agentId: 'codex',
    skillId: null,
    designSystemId: null,
    onboardingCompleted: true,
    mediaProviders: {},
    agentModels: {},
    agentCliEnv: {},
  };
}

async function seedSettingsBase(page: Page) {
  await page.addInitScript(({ key, value }) => {
    window.localStorage.setItem(key, JSON.stringify(value));
  }, { key: STORAGE_KEY, value: baseConfig() });

  await page.route('**/api/health', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"ok":true}',
    });
  });

  await page.route('**/api/agents', async (route) => {
    await route.fulfill({
      json: {
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
      },
    });
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
  await expect(page.getByRole('button', { name: OPEN_SETTINGS_LABEL })).toBeVisible();
}

async function openSettings(page: Page) {
  await gotoEntryHome(page);
  await page.getByRole('button', { name: OPEN_SETTINGS_LABEL }).click();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  await menu.getByRole('button', { name: SETTINGS_MENU_LABEL }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  return dialog;
}

async function openMemorySettings(page: Page) {
  const dialog = await openSettings(page);
  await dialog.getByRole('button', { name: /^Memory\b/ }).click();
  await expect(dialog.getByText('MEMORY.md')).toBeVisible();
  return dialog;
}

test.describe('Settings Memory and Automations flows', () => {
  test('creates a memory entry and keeps it visible after reopening settings', async ({ page }) => {
    await seedSettingsBase(page);

    let enabled = true;
    let index = '# Memory\n';
    let entries: Array<{
      id: string;
      name: string;
      description: string;
      type: string;
      updatedAt: number;
      body?: string;
    }> = [];

    await page.route('**/api/memory', async (route) => {
      const method = route.request().method();
      if (method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            enabled,
            rootDir: '/tmp/memory',
            index,
            entries: entries.map(({ body, ...summary }) => summary),
            extraction: null,
          }),
        });
        return;
      }
      if (method === 'POST') {
        const payload = route.request().postDataJSON() as Record<string, string>;
        const entry = {
          id: 'user_ui_preferences',
          name: payload.name ?? '',
          description: payload.description ?? '',
          type: payload.type ?? 'user',
          body: payload.body ?? '',
          updatedAt: Date.now(),
        };
        entries = [entry];
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ entry }),
        });
        return;
      }
      await route.fulfill({ status: 404, body: '{}' });
    });

    await page.route('**/api/memory/extractions', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ extractions: [] }),
      });
    });

    await page.route('**/api/memory/events', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: '',
      });
    });

    await page.route('**/api/memory/config', async (route) => {
      const payload = route.request().postDataJSON() as { enabled?: boolean };
      if (typeof payload.enabled === 'boolean') enabled = payload.enabled;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ enabled, extraction: null }),
      });
    });

    const dialog = await openMemorySettings(page);

    await dialog.getByRole('button', { name: 'New memory' }).click();
    await dialog.getByPlaceholder('e.g. UI preferences').fill('UI preferences');
    await dialog.getByPlaceholder('One sentence — what is this memory about?').fill(
      'Persistent rendering preferences',
    );
    await dialog
      .getByPlaceholder(/- Rule one[\s\S]*When to apply: optional scope/)
      .fill('- Prefer dark mode');
    await dialog.getByRole('button', { name: 'Create' }).click();

    await expect(dialog.getByText('UI preferences')).toBeVisible();
    await expect(dialog.locator('.memory-flash-pill')).toContainText('Memory created');

    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    const reopened = await openMemorySettings(page);
    await expect(reopened.getByText('UI preferences')).toBeVisible();
    await expect(reopened.getByText('Persistent rendering preferences')).toBeVisible();
  });

  test('disables memory injection and keeps the disabled banner after reopening settings', async ({ page }) => {
    await seedSettingsBase(page);

    let enabled = true;

    await page.route('**/api/memory', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          enabled,
          rootDir: '/tmp/memory',
          index: '# Memory\n',
          entries: [],
          extraction: null,
        }),
      });
    });

    await page.route('**/api/memory/extractions', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ extractions: [] }),
      });
    });

    await page.route('**/api/memory/events', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: '',
      });
    });

    await page.route('**/api/memory/config', async (route) => {
      const payload = route.request().postDataJSON() as { enabled?: boolean };
      if (typeof payload.enabled === 'boolean') enabled = payload.enabled;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ enabled, extraction: null }),
      });
    });

    const dialog = await openMemorySettings(page);
    await dialog.getByLabel('Enable memory injection').uncheck();
    await expect(dialog.locator('.memory-disabled-banner')).toBeVisible();

    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    const reopened = await openMemorySettings(page);
    await expect(reopened.locator('.memory-disabled-banner')).toBeVisible();
  });

  test('keeps the memory editor open when creating a memory entry fails', async ({ page }) => {
    await seedSettingsBase(page);

    await page.route('**/api/memory', async (route) => {
      const method = route.request().method();
      if (method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            enabled: true,
            rootDir: '/tmp/memory',
            index: '# Memory\n',
            entries: [],
            extraction: null,
          }),
        });
        return;
      }
      if (method === 'POST') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'provider unavailable' }),
        });
        return;
      }
      await route.fulfill({ status: 404, body: '{}' });
    });

    await page.route('**/api/memory/extractions', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ extractions: [] }),
      });
    });

    await page.route('**/api/memory/events', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: '',
      });
    });

    const dialog = await openMemorySettings(page);

    await dialog.getByRole('button', { name: 'New memory' }).click();
    await dialog.getByPlaceholder('e.g. UI preferences').fill('UI preferences');
    await dialog.getByPlaceholder('One sentence — what is this memory about?').fill(
      'Persistent rendering preferences',
    );
    await dialog
      .getByPlaceholder(/- Rule one[\s\S]*When to apply: optional scope/)
      .fill('- Prefer dark mode');
    await dialog.getByRole('button', { name: 'Create' }).click();

    await expect(dialog.getByPlaceholder('e.g. UI preferences')).toHaveValue('UI preferences');
    await expect(dialog.locator('.memory-flash-pill')).toHaveCount(0);
    await expect(dialog.getByText('No memory yet.')).toBeVisible();
  });

  test('creates an automation from the main Automations surface and runs it now', async ({ page }) => {
    await seedSettingsBase(page);

    const projects = [{ id: 'proj-1', name: 'Routine Test Project' }];
    let routines: Array<Record<string, unknown>> = [];

    await page.route('**/api/projects', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ projects }),
      });
    });

    await page.route('**/api/routines', async (route) => {
      const method = route.request().method();
      if (method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ routines }),
        });
        return;
      }
      if (method === 'POST') {
        const payload = route.request().postDataJSON() as Record<string, unknown>;
        const routine = {
          id: 'routine-1',
          name: payload.name,
          prompt: payload.prompt,
          schedule: payload.schedule,
          target: payload.target,
          enabled: true,
          nextRunAt: Date.now() + 3600_000,
          lastRun: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        routines = [routine];
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ routine }),
        });
        return;
      }
      await route.fulfill({ status: 404, body: '{}' });
    });

    await page.route('**/api/plugins', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ plugins: [] }),
      });
    });

    await page.route('**/api/mcp/servers', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ servers: [], templates: [] }),
      });
    });

    await page.route('**/api/routines/routine-1/run', async (route) => {
      const startedAt = Date.now();
      const lastRun = {
        runId: 'run-1',
        status: 'queued',
        trigger: 'manual',
        startedAt,
        projectId: 'proj-run',
        conversationId: 'conv-run',
        agentRunId: 'agent-run-1',
      };
      routines = [{ ...routines[0], lastRun }];
      await route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({
          routine: routines[0],
          run: lastRun,
          projectId: 'proj-run',
          conversationId: 'conv-run',
          agentRunId: 'agent-run-1',
        }),
      });
    });

    await gotoEntryHome(page);
    await page.getByTestId('entry-nav-tasks').click();
    const view = page.getByTestId('tasks-view');
    await expect(view.getByRole('heading', { name: 'Automations' })).toBeVisible();

    await view.getByRole('button', { name: 'New automation' }).click();
    const modal = page.getByTestId('automation-modal');
    await modal.getByLabel('Automation title').fill('Weekly digest');
    await modal.getByTestId('automation-modal-prompt').fill('Summarize GitHub and design activity.');
    await modal.getByRole('button', { name: 'Create' }).click();

    await expect(view.getByText('Weekly digest')).toBeVisible();

    const row = view.locator('.automation-row', { hasText: 'Weekly digest' }).first();
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'Run' }).click();
    await expect(page).toHaveURL(/\/projects\/proj-run/);
  });

  test('keeps the automation modal open when creating an automation fails', async ({ page }) => {
    await seedSettingsBase(page);

    const projects = [{ id: 'proj-1', name: 'Routine Test Project' }];

    await page.route('**/api/projects', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ projects }),
      });
    });

    await page.route('**/api/routines', async (route) => {
      const method = route.request().method();
      if (method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ routines: [] }),
        });
        return;
      }
      if (method === 'POST') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'provider unavailable' }),
        });
        return;
      }
      await route.fulfill({ status: 404, body: '{}' });
    });

    await page.route('**/api/plugins', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ plugins: [] }),
      });
    });

    await page.route('**/api/mcp/servers', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ servers: [], templates: [] }),
      });
    });

    await gotoEntryHome(page);
    await page.getByTestId('entry-nav-tasks').click();
    const view = page.getByTestId('tasks-view');

    await view.getByRole('button', { name: 'New automation' }).click();
    const modal = page.getByTestId('automation-modal');
    await modal.getByLabel('Automation title').fill('Weekly digest');
    await modal.getByTestId('automation-modal-prompt').fill('Summarize GitHub and design activity.');
    await modal.getByRole('button', { name: 'Create' }).click();

    await expect(modal.getByLabel('Automation title')).toHaveValue('Weekly digest');
    await expect(modal.getByTestId('automation-modal-prompt')).toHaveValue('Summarize GitHub and design activity.');
    await expect(modal.getByText('provider unavailable')).toBeVisible();
    await expect(view.getByText('No automations yet')).toBeVisible();
  });
});
