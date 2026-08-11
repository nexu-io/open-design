import { expect, test } from '@/playwright/suite';
import { routeAgents } from '@/playwright/mock-factory';
import { T } from '@/timeouts';
import type { Page } from '@playwright/test';

const STORAGE_KEY = 'open-design:config';
const AUTOMATIONS_TITLE = /Automations|自动化/i;

test.describe.configure({ timeout: T.xlong });

async function seedAutomationsBase(page: Page) {
  await page.addInitScript(({ key, value }) => {
    window.localStorage.setItem(key, JSON.stringify(value));
  }, {
    key: STORAGE_KEY,
    value: {
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
    },
  });

  await page.route('**/api/health', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });
  await routeAgents(page, [
    {
      id: 'codex',
      name: 'Codex CLI',
      bin: 'codex',
      available: true,
      version: '0.130.0',
      models: [{ id: 'default', label: 'Default' }],
    },
  ]);
  await page.route('**/api/plugins', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"plugins":[]}' });
  });
  await page.route('**/api/mcp/servers', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"servers":[],"templates":[]}',
    });
  });
  await page.route('**/api/automation-templates', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"templates":[]}' });
  });
  await page.route('**/api/automation-proposals?status=pending-review', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"proposals":[]}' });
  });
  await page.route('**/api/automation-source-packets?limit=3', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"packets":[]}' });
  });
}

async function gotoAutomations(page: Page) {
  await page.goto('/automations', { waitUntil: 'domcontentloaded' });
  await page
    .getByText('Loading Open Design…')
    .waitFor({ state: 'hidden', timeout: T.long })
    .catch(() => {});
  const view = page.getByTestId('tasks-view');
  await expect(view.getByRole('heading', { level: 1, name: AUTOMATIONS_TITLE })).toBeVisible({
    timeout: T.long,
  });
  return view;
}

test.describe('Automations page smoke', () => {
  test('[P1] creates an automation and runs it into a project conversation', async ({ page }) => {
    await seedAutomationsBase(page);

    const projects = [
      { id: 'proj-1', name: 'Routine Test Project' },
      { id: 'proj-run', name: 'Automation Run Project' },
    ];
    let routines: Array<Record<string, unknown>> = [];
    const createBodies: Array<Record<string, unknown>> = [];

    await page.route('**/api/projects', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ projects }),
      });
    });
    await page.route('**/api/routines', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ routines }),
        });
        return;
      }
      if (route.request().method() === 'POST') {
        const payload = route.request().postDataJSON() as Record<string, unknown>;
        createBodies.push(payload);
        const routine = {
          id: 'routine-1',
          ...payload,
          enabled: true,
          nextRunAt: Date.now() + 3_600_000,
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
      const lastRun = {
        runId: 'run-1',
        status: 'queued',
        trigger: 'manual',
        startedAt: Date.now(),
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

    const view = await gotoAutomations(page);
    await view.getByRole('button', { name: 'New automation' }).click();
    const modal = page.getByTestId('automation-modal');
    await modal.getByTestId('automation-modal-title').fill('Weekly digest');
    await modal.getByTestId('automation-modal-prompt').fill('Summarize GitHub and design activity.');
    await modal.getByRole('button', { name: 'Create' }).click();

    await expect(view.getByText('Weekly digest')).toBeVisible();
    expect(createBodies[0]).toMatchObject({
      name: 'Weekly digest',
      prompt: 'Summarize GitHub and design activity.',
      schedule: { kind: 'daily', time: '09:00' },
      target: { mode: 'create_each_run' },
    });

    await view.locator('.automation-row', { hasText: 'Weekly digest' }).first()
      .getByRole('button', { name: 'Run' }).click();
    await expect(page).toHaveURL(/\/projects\/proj-run/);
  });

  test('[P1] preserves the automation draft when creation fails', async ({ page }) => {
    await seedAutomationsBase(page);
    await page.route('**/api/projects', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"projects":[]}' });
    });
    await page.route('**/api/routines', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{"routines":[]}' });
        return;
      }
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: '{"error":"provider unavailable"}',
        });
        return;
      }
      await route.fulfill({ status: 404, body: '{}' });
    });

    const view = await gotoAutomations(page);
    await view.getByRole('button', { name: 'New automation' }).click();
    const modal = page.getByTestId('automation-modal');
    await modal.getByTestId('automation-modal-title').fill('Weekly digest');
    await modal.getByTestId('automation-modal-prompt').fill('Summarize GitHub and design activity.');
    await modal.getByRole('button', { name: 'Create' }).click();

    await expect(modal.getByTestId('automation-modal-title')).toHaveValue('Weekly digest');
    await expect(modal.getByTestId('automation-modal-prompt')).toHaveValue('Summarize GitHub and design activity.');
    await expect(modal.getByText('provider unavailable')).toBeVisible();
    await expect(view.getByText('No automations yet')).toBeVisible();
  });
});
