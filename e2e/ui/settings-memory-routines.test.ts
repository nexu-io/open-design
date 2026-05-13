import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const STORAGE_KEY = 'open-design:config';

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

async function openSettings(page: Page) {
  await page.goto('/');
  await page.getByTitle('Configure execution mode').click();
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

async function openRoutinesSettings(page: Page) {
  const dialog = await openSettings(page);
  await dialog.getByRole('button', { name: /^Routines\b/ }).click();
  await expect(
    dialog.getByText('Scheduled, unattended agent sessions. Each run starts a new'),
  ).toBeVisible();
  return dialog;
}

test.describe('Settings Memory and Routines flows', () => {
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

  test('creates a routine and loads its history after Run now', async ({ page }) => {
    await seedSettingsBase(page);

    const projects = [{ id: 'proj-1', name: 'Routine Test Project' }];
    let routines: Array<Record<string, unknown>> = [];
    let runs: Array<Record<string, unknown>> = [];

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
      runs = [
        {
          id: 'run-1',
          routineId: 'routine-1',
          trigger: 'manual',
          status: 'queued',
          projectId: 'proj-run',
          conversationId: 'conv-run',
          agentRunId: 'agent-run-1',
          startedAt,
          completedAt: null,
          summary: null,
          error: null,
        },
      ];
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

    await page.route('**/api/routines/routine-1/runs?limit=10', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ runs }),
      });
    });

    const dialog = await openRoutinesSettings(page);

    await dialog.getByRole('button', { name: 'New routine' }).click();
    await dialog.getByLabel('Name').fill('Weekly digest');
    await dialog.getByLabel('Prompt').fill('Summarize GitHub and design activity.');
    await dialog.getByRole('tab', { name: 'Weekly' }).click();
    await dialog.getByRole('button', { name: 'Wed' }).click();
    await dialog.getByText('Reuse an existing project', { exact: true }).click();
    await dialog.getByRole('combobox').nth(1).selectOption('proj-1');
    await dialog.getByRole('button', { name: 'Create' }).click();

    await expect(dialog.getByText('Weekly digest')).toBeVisible();

    const row = dialog.locator('.routines-item', { hasText: 'Weekly digest' }).first();
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'Run now' }).click();
    await expect(row.getByRole('button', { name: 'Hide history' })).toBeVisible();
    await expect(dialog.getByText('manual')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Open project' })).toBeVisible();
  });
});
