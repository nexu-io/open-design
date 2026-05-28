import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const STORAGE_KEY = 'open-design:config';
const OPEN_SETTINGS_LABEL = /Open settings|打开设置|開啟設定/i;

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

async function seedAutomationsBase(page: Page) {
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

async function gotoAutomations(page: Page) {
  await gotoEntryHome(page);
  await page.getByTestId('entry-nav-tasks').click();
  const view = page.getByTestId('tasks-view');
  await expect(view.getByRole('heading', { name: 'Automations', exact: true })).toBeVisible();
  return view;
}

test.describe('Automations page', () => {
  test('renders the page hero, summary metrics, filters, and saved rows', async ({ page }) => {
    await seedAutomationsBase(page);

    let routines = [
      {
        id: 'routine-active-1',
        name: 'Daily digest',
        prompt: 'Summarize GitHub and design activity.',
        schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
        target: { mode: 'create_each_run' },
        enabled: true,
        nextRunAt: Date.now() + 3600_000,
        lastRun: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: 'routine-paused-1',
        name: 'Weekly release notes',
        prompt: 'Draft release notes.',
        schedule: { kind: 'weekly', weekday: 1, time: '09:00', timezone: 'UTC' },
        target: { mode: 'create_each_run' },
        enabled: false,
        nextRunAt: null,
        lastRun: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];

    await page.route('**/api/projects', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ projects: [] }),
      });
    });

    await page.route('**/api/routines', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ routines }),
      });
    });

    await page.route('**/api/automation-templates', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ templates: [] }),
      });
    });

    await page.route('**/api/automation-proposals?status=pending-review', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ proposals: [] }),
      });
    });

    await page.route('**/api/automation-source-packets?limit=3', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ packets: [] }),
      });
    });

    const view = await gotoAutomations(page);

    await expect(view.getByText('Plan recurring conversations for project work, Orbit digests, and live artifacts.')).toBeVisible();
    await expect(view.getByLabel('Automation summary')).toContainText('Active');
    await expect(view.getByLabel('Automation summary')).toContainText('Paused');
    await expect(view.getByLabel('Automation summary')).toContainText('Templates');
    await expect(view.getByLabel('Your automations')).toContainText('Daily digest');
    await expect(view.getByLabel('Your automations')).toContainText('Weekly release notes');

    const templateFilters = view.getByRole('tablist', { name: 'Template filters' });
    const allTab = templateFilters.getByRole('tab', { name: /^All/i });
    const skillsTab = templateFilters.getByRole('tab', { name: /Skills/i });
    await expect(allTab).toHaveAttribute('aria-selected', 'true');
    await skillsTab.click();
    await expect(skillsTab).toHaveAttribute('aria-selected', 'true');
    await expect(view.getByRole('status')).toContainText('No templates in this category yet.');
  });

  test('creates an automation from the page and runs it into a project conversation', async ({ page }) => {
    await seedAutomationsBase(page);

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

    await page.route('**/api/automation-templates', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ templates: [] }),
      });
    });

    await page.route('**/api/automation-proposals?status=pending-review', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ proposals: [] }),
      });
    });

    await page.route('**/api/automation-source-packets?limit=3', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ packets: [] }),
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

    const view = await gotoAutomations(page);

    await view.getByRole('button', { name: 'New automation' }).click();
    const modal = page.getByTestId('automation-modal');
    await modal.getByLabel('Automation title').fill('Weekly digest');
    await modal.getByTestId('automation-modal-prompt').fill('Summarize GitHub and design activity.');
    await modal.getByRole('button', { name: 'Create' }).click();

    await expect(view.getByText('Weekly digest')).toBeVisible();

    const row = view.locator('.automation-row', { hasText: 'Weekly digest' }).first();
    await row.getByRole('button', { name: 'Run' }).click();
    await expect(page).toHaveURL(/\/projects\/proj-run/);
  });

  test('keeps the automation modal open with the typed values when creation fails', async ({ page }) => {
    await seedAutomationsBase(page);

    await page.route('**/api/projects', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ projects: [] }),
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

    await page.route('**/api/automation-templates', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ templates: [] }),
      });
    });

    await page.route('**/api/automation-proposals?status=pending-review', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ proposals: [] }),
      });
    });

    await page.route('**/api/automation-source-packets?limit=3', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ packets: [] }),
      });
    });

    const view = await gotoAutomations(page);

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

  test('shows a page error and keeps the row usable when Run fails', async ({ page }) => {
    await seedAutomationsBase(page);

    const routines = [
      {
        id: 'routine-run-error-1',
        name: 'Daily digest',
        prompt: 'Summarize GitHub and design activity.',
        schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
        target: { mode: 'create_each_run' },
        enabled: true,
        nextRunAt: Date.now() + 3600_000,
        lastRun: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];

    await page.route('**/api/projects', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ projects: [] }),
      });
    });

    await page.route('**/api/routines', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ routines }),
      });
    });

    await page.route('**/api/automation-templates', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ templates: [] }),
      });
    });

    await page.route('**/api/automation-proposals?status=pending-review', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ proposals: [] }),
      });
    });

    await page.route('**/api/automation-source-packets?limit=3', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ packets: [] }),
      });
    });

    await page.route('**/api/routines/routine-run-error-1/run', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'provider unavailable' }),
      });
    });

    const view = await gotoAutomations(page);
    const row = view.locator('.automation-row', { hasText: 'Daily digest' }).first();

    await row.getByRole('button', { name: 'Run' }).click();

    await expect(view.getByRole('alert')).toContainText('provider unavailable');
    await expect(row.getByRole('button', { name: 'Run' })).toBeVisible();
    await expect(row.getByRole('button', { name: 'Pause' })).toBeVisible();
  });

  test('pauses, expands history, and deletes an automation from the saved list', async ({ page }) => {
    await seedAutomationsBase(page);

    let routines = [
      {
        id: 'routine-1',
        name: 'Daily digest',
        prompt: 'Summarize GitHub and design activity.',
        schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
        target: { mode: 'create_each_run' },
        enabled: true,
        nextRunAt: Date.now() + 3600_000,
        lastRun: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];

    await page.route('**/api/projects', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ projects: [] }),
      });
    });

    await page.route('**/api/routines', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ routines }),
      });
    });

    await page.route('**/api/automation-templates', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ templates: [] }),
      });
    });

    await page.route('**/api/automation-proposals?status=pending-review', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ proposals: [] }),
      });
    });

    await page.route('**/api/automation-source-packets?limit=3', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ packets: [] }),
      });
    });

    await page.route('**/api/routines/routine-1', async (route) => {
      const method = route.request().method();
      if (method === 'PATCH') {
        const payload = route.request().postDataJSON() as { enabled?: boolean };
        const routine = routines[0];
        if (!routine) throw new Error('missing routine fixture');
        const updated = { ...routine, enabled: Boolean(payload.enabled), updatedAt: Date.now() };
        routines = [updated];
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ routine: updated }),
        });
        return;
      }
      if (method === 'DELETE') {
        routines = [];
        await route.fulfill({ status: 204, body: '' });
        return;
      }
      await route.fulfill({ status: 404, body: '{}' });
    });

    await page.route('**/api/routines/routine-1/runs?limit=10', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          runs: [
            {
              id: 'run-1',
              routineId: 'routine-1',
              trigger: 'manual',
              status: 'succeeded',
              projectId: 'proj-run',
              conversationId: 'conv-run',
              agentRunId: 'agent-run-1',
              startedAt: Date.now() - 60_000,
              completedAt: Date.now() - 15_000,
              summary: 'Updated digest',
              error: null,
              errorCode: null,
            },
          ],
        }),
      });
    });

    const view = await gotoAutomations(page);
    const row = view.locator('.automation-row', { hasText: 'Daily digest' }).first();

    await row.getByRole('button', { name: 'Pause' }).click();
    await expect(row.getByRole('button', { name: 'Resume' })).toBeVisible();

    await row.getByRole('button', { name: 'History' }).click();
    await expect(page.getByLabel('Automation run history')).toBeVisible();
    await row.getByRole('button', { name: 'Hide history' }).click();
    await expect(page.getByLabel('Automation run history')).toHaveCount(0);

    page.once('dialog', (dialog) => {
      void dialog.accept();
    });
    await row.getByRole('button', { name: 'Delete automation' }).click({ force: true });

    await expect(view.getByText('No automations yet')).toBeVisible();
  });

  test('shows a page error and keeps the row usable when Pause fails', async ({ page }) => {
    await seedAutomationsBase(page);

    const routines = [
      {
        id: 'routine-pause-error-1',
        name: 'Daily digest',
        prompt: 'Summarize GitHub and design activity.',
        schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
        target: { mode: 'create_each_run' },
        enabled: true,
        nextRunAt: Date.now() + 3600_000,
        lastRun: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];

    await page.route('**/api/projects', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ projects: [] }),
      });
    });

    await page.route('**/api/routines', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ routines }),
      });
    });

    await page.route('**/api/automation-templates', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ templates: [] }),
      });
    });

    await page.route('**/api/automation-proposals?status=pending-review', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ proposals: [] }),
      });
    });

    await page.route('**/api/automation-source-packets?limit=3', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ packets: [] }),
      });
    });

    await page.route('**/api/routines/routine-pause-error-1', async (route) => {
      if (route.request().method() === 'PATCH') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'pause failed upstream' }),
        });
        return;
      }
      await route.fulfill({ status: 404, body: '{}' });
    });

    const view = await gotoAutomations(page);
    const row = view.locator('.automation-row', { hasText: 'Daily digest' }).first();

    await row.getByRole('button', { name: 'Pause' }).click();

    await expect(view.getByRole('alert')).toContainText('pause failed upstream');
    await expect(row.getByRole('button', { name: 'Pause' })).toBeVisible();
    await expect(row.getByRole('button', { name: 'Run' })).toBeVisible();
  });

  test('shows a page error and keeps the row visible when Delete fails', async ({ page }) => {
    await seedAutomationsBase(page);

    const routines = [
      {
        id: 'routine-delete-error-1',
        name: 'Daily digest',
        prompt: 'Summarize GitHub and design activity.',
        schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
        target: { mode: 'create_each_run' },
        enabled: true,
        nextRunAt: Date.now() + 3600_000,
        lastRun: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];

    await page.route('**/api/projects', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ projects: [] }),
      });
    });

    await page.route('**/api/routines', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ routines }),
      });
    });

    await page.route('**/api/automation-templates', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ templates: [] }),
      });
    });

    await page.route('**/api/automation-proposals?status=pending-review', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ proposals: [] }),
      });
    });

    await page.route('**/api/automation-source-packets?limit=3', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ packets: [] }),
      });
    });

    await page.route('**/api/routines/routine-delete-error-1', async (route) => {
      if (route.request().method() === 'DELETE') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'delete failed upstream' }),
        });
        return;
      }
      await route.fulfill({ status: 404, body: '{}' });
    });

    const view = await gotoAutomations(page);
    const row = view.locator('.automation-row', { hasText: 'Daily digest' }).first();

    page.once('dialog', (dialog) => {
      void dialog.accept();
    });
    await row.getByRole('button', { name: 'Delete automation' }).click({ force: true });

    await expect(view.getByRole('alert')).toContainText('delete failed upstream');
    await expect(row).toBeVisible();
    await expect(row.getByRole('button', { name: 'Delete automation' })).toBeVisible();
  });

  test('edits an automation title from the saved list and keeps the updated row visible', async ({ page }) => {
    await seedAutomationsBase(page);

    let routines = [
      {
        id: 'routine-edit-1',
        name: 'Daily digest',
        prompt: 'Summarize GitHub and design activity.',
        schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
        target: { mode: 'create_each_run' },
        enabled: true,
        nextRunAt: Date.now() + 3600_000,
        lastRun: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];

    await page.route('**/api/projects', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ projects: [] }),
      });
    });

    await page.route('**/api/routines', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ routines }),
      });
    });

    await page.route('**/api/automation-templates', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ templates: [] }),
      });
    });

    await page.route('**/api/automation-proposals?status=pending-review', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ proposals: [] }),
      });
    });

    await page.route('**/api/automation-source-packets?limit=3', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ packets: [] }),
      });
    });

    await page.route('**/api/routines/routine-edit-1', async (route) => {
      if (route.request().method() === 'PATCH') {
        const payload = route.request().postDataJSON() as { name?: string; prompt?: string };
        const routine = routines[0];
        if (!routine) throw new Error('missing routine fixture');
        const updated = {
          ...routine,
          name: payload.name ?? routine.name,
          prompt: payload.prompt ?? routine.prompt,
          updatedAt: Date.now(),
        };
        routines = [
          updated,
        ];
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ routine: updated }),
        });
        return;
      }
      await route.fulfill({ status: 404, body: '{}' });
    });

    const view = await gotoAutomations(page);
    const row = view.locator('.automation-row', { hasText: 'Daily digest' }).first();

    await row.getByRole('button', { name: 'Edit' }).click();
    const modal = page.getByTestId('automation-modal');
    await expect(modal.getByLabel('Automation title')).toHaveValue('Daily digest');
    await modal.getByLabel('Automation title').fill('Daily digest edited');
    await modal.getByRole('button', { name: /^Save/i }).click();

    await expect(view.getByText('Daily digest edited')).toBeVisible();
  });

  test('switches template filters and updates the visible template cards', async ({ page }) => {
    await seedAutomationsBase(page);

    await page.route('**/api/projects', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ projects: [] }),
      });
    });

    await page.route('**/api/routines', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ routines: [] }),
      });
    });

    await page.route('**/api/automation-templates', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ templates: [] }),
      });
    });

    await page.route('**/api/automation-proposals?status=pending-review', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ proposals: [] }),
      });
    });

    await page.route('**/api/automation-source-packets?limit=3', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ packets: [] }),
      });
    });

    const view = await gotoAutomations(page);
    const tabs = view.getByRole('tablist', { name: 'Template filters' });

    await expect(view.getByText(/Refresh project memory from recent work\./i)).toBeVisible();

    await tabs.getByRole('tab', { name: /Orbit/i }).click();
    await expect(view.getByRole('status')).toHaveCount(0);
    await expect(view.getByText(/Refresh project memory from recent work\./i)).toHaveCount(0);

    await tabs.getByRole('tab', { name: /Memory/i }).click();
    await expect(view.getByText(/Refresh project memory from recent work\./i)).toBeVisible();
    await expect(view.getByRole('status')).toHaveCount(0);
  });
});
