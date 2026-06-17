import { expect, test } from '@/playwright/suite';
import { ensureRailOpen } from '@/playwright/rail';
import { routeAgents } from '@/playwright/mock-factory';
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
    await privacyDialog.getByRole('button', { name: /I get it|not now|got it|don't share/i }).click();
  }
  await expect(page.getByRole('button', { name: OPEN_SETTINGS_LABEL })).toBeVisible();
}

async function gotoAutomations(page: Page) {
  await gotoEntryHome(page);
  await ensureRailOpen(page);
  await page.getByTestId('entry-nav-tasks').click();
  const view = page.getByTestId('tasks-view');
  await expect(view.getByRole('heading', { name: 'Automations', exact: true })).toBeVisible();
  return view;
}

test.describe('Automations page', () => {
  test('[P0] renders the page hero, summary metrics, filters, and saved rows', async ({ page }) => {
    await seedAutomationsBase(page);

    let routines: Array<Record<string, unknown>> = [
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

  test('[P0] @critical creates an automation from the page and runs it into a project conversation', async ({ page }) => {
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
        createBodies.push(payload);
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
    expect(createBodies[0]).toMatchObject({
      name: 'Weekly digest',
      prompt: 'Summarize GitHub and design activity.',
      schedule: {
        kind: 'daily',
        time: '09:00',
      },
      target: {
        mode: 'create_each_run',
      },
    });
    const schedule = createBodies[0]?.schedule as { timezone?: unknown } | undefined;
    expect(typeof schedule?.timezone).toBe('string');
    expect((schedule?.timezone as string).length).toBeGreaterThan(0);

    const row = view.locator('.automation-row', { hasText: 'Weekly digest' }).first();
    await row.getByRole('button', { name: 'Run' }).click();
    await expect(page).toHaveURL(/\/projects\/proj-run/);

    await page.goto('/tasks', { waitUntil: 'domcontentloaded' });
    await waitForLoadingToClear(page);
    const refreshedView = page.getByTestId('tasks-view');
    const refreshedRow = refreshedView.locator('.automation-row', { hasText: 'Weekly digest' }).first();
    await expect(refreshedRow).toContainText(/Queued|Running|Manual/i);
    await expect(refreshedRow.getByRole('button', { name: /Open result/i })).toBeVisible();

    await page.reload();
    await waitForLoadingToClear(page);
    const reloadedRow = page.getByTestId('tasks-view').locator('.automation-row', { hasText: 'Weekly digest' }).first();
    await expect(reloadedRow).toContainText(/Queued|Running|Manual/i);
    await expect(reloadedRow.getByRole('button', { name: /Open result/i })).toBeVisible();
  });

  test('[P1] places a newly created automation at the top of the list and highlights it', async ({ page }) => {
    await seedAutomationsBase(page);

    const projects = [{ id: 'proj-1', name: 'Routine Test Project' }];
    let routines: Array<Record<string, unknown>> = [
      {
        id: 'routine-existing-1',
        name: 'Older digest',
        prompt: 'Summarize older activity.',
        schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
        target: { mode: 'create_each_run' },
        enabled: true,
        nextRunAt: Date.now() + 3600_000,
        lastRun: null,
        createdAt: Date.now() - 120_000,
        updatedAt: Date.now() - 120_000,
      },
    ];

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
        const now = Date.now();
        const routine = {
          id: 'routine-newest-1',
          name: payload.name,
          prompt: payload.prompt,
          schedule: payload.schedule,
          target: payload.target,
          enabled: true,
          nextRunAt: now + 3600_000,
          lastRun: null,
          createdAt: now,
          updatedAt: now,
        };
        routines = [...routines, routine];
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

    const view = await gotoAutomations(page);
    await expect(view.getByText('Older digest')).toBeVisible();

    await view.getByRole('button', { name: 'New automation' }).click();
    const modal = page.getByTestId('automation-modal');
    await modal.getByLabel('Automation title').fill('Newest digest');
    await modal.getByTestId('automation-modal-prompt').fill('Summarize the newest activity.');
    await modal.getByRole('button', { name: 'Create' }).click();

    const rows = view.locator('.automation-row');
    await expect(rows.first()).toContainText('Newest digest');
    await expect(view.getByTestId('automation-row-routine-newest-1')).toHaveClass(/is-focused/);
  });

  test('[P1] creates a weekly automation with edited weekday time and timezone payload', async ({ page }) => {
    await seedAutomationsBase(page);

    const projects = [{ id: 'proj-1', name: 'Routine Test Project' }];
    const createBodies: Array<Record<string, unknown>> = [];
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
        createBodies.push(payload);
        const routine = {
          id: 'routine-weekly-1',
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

    const view = await gotoAutomations(page);

    await view.getByRole('button', { name: 'New automation' }).click();
    const modal = page.getByTestId('automation-modal');
    await modal.getByLabel('Automation title').fill('Friday launch digest');
    await modal.getByTestId('automation-modal-prompt').fill('Summarize launch readiness every Friday.');
    await modal.getByRole('button', { name: /Daily/i }).click();
    await page.getByRole('tab', { name: 'Weekly' }).click();
    await page.locator('.automation-popover__weekdays').getByRole('button', { name: 'Fri' }).click();
    await page.locator('.automation-popover--schedule input[type="time"]').fill('16:45');
    await page.locator('.automation-popover--schedule select').selectOption('UTC');
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(modal.getByRole('button', { name: /Friday.*4:45 PM.*UTC/i })).toBeVisible();

    await modal.getByRole('button', { name: 'Create' }).click();
    await expect.poll(() => createBodies.length).toBe(1);
    expect(createBodies[0]).toMatchObject({
      name: 'Friday launch digest',
      prompt: 'Summarize launch readiness every Friday.',
      schedule: {
        kind: 'weekly',
        weekday: 5,
        time: '16:45',
        timezone: 'UTC',
      },
      target: {
        mode: 'create_each_run',
      },
    });
  });

  test('[P1] keeps saved automations ordered by newest createdAt first', async ({ page }) => {
    await seedAutomationsBase(page);

    const now = Date.now();
    const routines = [
      {
        id: 'routine-oldest-1',
        name: 'Oldest digest',
        prompt: 'Summarize the oldest activity.',
        schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
        target: { mode: 'create_each_run' },
        enabled: true,
        nextRunAt: now + 3600_000,
        lastRun: null,
        createdAt: now - 300_000,
        updatedAt: now - 300_000,
      },
      {
        id: 'routine-middle-1',
        name: 'Middle digest',
        prompt: 'Summarize the middle activity.',
        schedule: { kind: 'daily', time: '10:00', timezone: 'UTC' },
        target: { mode: 'create_each_run' },
        enabled: true,
        nextRunAt: now + 7200_000,
        lastRun: null,
        createdAt: now - 120_000,
        updatedAt: now - 120_000,
      },
      {
        id: 'routine-newest-1',
        name: 'Newest digest',
        prompt: 'Summarize the newest activity.',
        schedule: { kind: 'daily', time: '11:00', timezone: 'UTC' },
        target: { mode: 'create_each_run' },
        enabled: true,
        nextRunAt: now + 10_800_000,
        lastRun: null,
        createdAt: now - 10_000,
        updatedAt: now - 10_000,
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
    const rowTitles = view.locator('.automation-row .automation-row__title');
    await expect(rowTitles).toHaveText([
      'Newest digest',
      'Middle digest',
      'Oldest digest',
    ]);
  });

  test('[P0] keeps the automation modal open with the typed values when creation fails', async ({ page }) => {
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

  test('[P0] shows a page error and keeps the row usable when Run fails', async ({ page }) => {
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

  test('[P0] pauses, expands history, and deletes an automation from the saved list', async ({ page }) => {
    await seedAutomationsBase(page);

    let routines: Array<Record<string, unknown>> = [
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

  test('[P1] reviews pending automation proposals with apply and reject actions', async ({ page }) => {
    await seedAutomationsBase(page);

    let proposals: Array<Record<string, unknown>> = [
      {
        id: 'proposal-apply-1',
        title: 'Promote launch notes into memory',
        summary: 'Store the launch checklist as reusable project memory.',
        targetKind: 'memory',
        action: 'create',
        status: 'pending-review',
        reviewPolicy: 'manual',
        createdAt: new Date(Date.now() - 60_000).toISOString(),
        updatedAt: new Date(Date.now() - 60_000).toISOString(),
        sourcePacketIds: ['packet-1'],
        automationRunId: 'run-apply-1',
        targetRef: 'memory/project-launch',
        patch: { format: 'markdown', after: '# Launch checklist', diffSummary: 'Adds launch checklist memory.' },
        confidence: 0.88,
      },
      {
        id: 'proposal-reject-1',
        title: 'Create a nightly skill draft',
        summary: 'Draft a skill from the latest automation run.',
        targetKind: 'skill',
        action: 'update',
        status: 'pending-review',
        reviewPolicy: 'manual',
        createdAt: new Date(Date.now() - 30_000).toISOString(),
        updatedAt: new Date(Date.now() - 30_000).toISOString(),
        sourcePacketIds: ['packet-2'],
        automationRunId: 'run-reject-1',
        targetRef: 'skills/nightly',
        patch: { format: 'markdown', diffSummary: 'Updates the nightly skill draft.' },
        confidence: 0.72,
      },
    ];
    const applyBodies: Array<Record<string, unknown>> = [];
    const rejectBodies: Array<Record<string, unknown>> = [];

    await page.route('**/api/projects', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projects: [] }) });
    });
    await page.route('**/api/routines', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ routines: [] }) });
    });
    await page.route('**/api/automation-templates', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ templates: [] }) });
    });
    await page.route('**/api/automation-source-packets?limit=3', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ packets: [] }) });
    });
    await page.route('**/api/automation-proposals?status=pending-review', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ proposals }),
      });
    });
    await page.route('**/api/automation-proposals/*/apply', async (route) => {
      applyBodies.push(route.request().postDataJSON() as Record<string, unknown>);
      const id = route.request().url().match(/automation-proposals\/([^/]+)\/apply/)?.[1] ?? '';
      const proposal = proposals.find((item) => item.id === id);
      proposals = proposals.filter((item) => item.id !== id);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ proposal: { ...proposal, status: 'applied' } }),
      });
    });
    await page.route('**/api/automation-proposals/*/reject', async (route) => {
      rejectBodies.push(route.request().postDataJSON() as Record<string, unknown>);
      const id = route.request().url().match(/automation-proposals\/([^/]+)\/reject/)?.[1] ?? '';
      const proposal = proposals.find((item) => item.id === id);
      proposals = proposals.filter((item) => item.id !== id);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ proposal: { ...proposal, status: 'rejected' } }),
      });
    });

    const view = await gotoAutomations(page);
    const proposalSection = view.getByLabel('Automation evolution proposals');
    await expect(proposalSection).toContainText('Promote launch notes into memory');
    await expect(proposalSection).toContainText('Create a nightly skill draft');

    await proposalSection
      .locator('.automation-row', { hasText: 'Promote launch notes into memory' })
      .getByRole('button', { name: 'Apply' })
      .click();
    await expect.poll(() => applyBodies.length).toBe(1);
    await expect(proposalSection).not.toContainText('Promote launch notes into memory');
    await expect(proposalSection).toContainText('Create a nightly skill draft');

    await proposalSection
      .locator('.automation-row', { hasText: 'Create a nightly skill draft' })
      .getByRole('button', { name: 'Reject' })
      .click();
    await expect.poll(() => rejectBodies.length).toBe(1);
    expect(rejectBodies[0]?.reason).toBeTruthy();
    await expect(view.getByLabel('Automation evolution proposals')).toHaveCount(0);
  });

  test('[P1] crystallizes a successful automation run into a pending proposal entry', async ({ page }) => {
    await seedAutomationsBase(page);

    const now = Date.now();
    const routines = [
      {
        id: 'routine-crystal-1',
        name: 'Crystallize launch digest',
        prompt: 'Summarize launch readiness.',
        schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
        target: { mode: 'create_each_run' },
        enabled: true,
        nextRunAt: now + 3600_000,
        lastRun: null,
        createdAt: now,
        updatedAt: now,
      },
    ];
    let proposals: Array<Record<string, unknown>> = [];
    let crystallizeCalls = 0;

    await page.route('**/api/projects', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projects: [] }) });
    });
    await page.route('**/api/routines', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ routines }) });
    });
    await page.route('**/api/automation-templates', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ templates: [] }) });
    });
    await page.route('**/api/automation-source-packets?limit=3', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ packets: [] }) });
    });
    await page.route('**/api/automation-proposals?status=pending-review', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ proposals }),
      });
    });
    await page.route('**/api/routines/routine-crystal-1/runs?limit=10', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          runs: [
            {
              id: 'run-crystal-1',
              templateId: 'routine-crystal-1',
              status: 'succeeded',
              triggerKind: 'manual',
              trigger: 'manual',
              projectId: 'proj-crystal',
              conversationId: 'conv-crystal',
              agentRunId: 'agent-run-crystal-1',
              startedAt: new Date(now - 80_000).toISOString(),
              completedAt: new Date(now - 30_000).toISOString(),
              sourcePacketIds: ['packet-crystal-1'],
              proposalIds: [],
              summary: 'Launch readiness memory should be updated.',
            },
          ],
        }),
      });
    });
    await page.route('**/api/routines/routine-crystal-1/runs/run-crystal-1/crystallize', async (route) => {
      crystallizeCalls += 1;
      proposals = [
        {
          id: 'proposal-crystal-1',
          title: 'Update launch readiness memory',
          summary: 'Capture the successful launch digest as reusable memory.',
          targetKind: 'memory',
          action: 'update',
          status: 'pending-review',
          reviewPolicy: 'manual',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          sourcePacketIds: ['packet-crystal-1'],
          automationRunId: 'run-crystal-1',
          targetRef: 'memory/launch-readiness',
          patch: { format: 'markdown', diffSummary: 'Adds launch readiness learnings from the run.' },
          confidence: 0.9,
        },
      ];
      await route.fulfill({ status: 202, contentType: 'application/json', body: '{}' });
    });

    const view = await gotoAutomations(page);
    const row = view.locator('.automation-row', { hasText: 'Crystallize launch digest' }).first();
    await row.getByRole('button', { name: 'History' }).click();
    const history = page.getByLabel('Automation run history');
    await expect(history).toContainText('Launch readiness memory should be updated.');

    await history.getByRole('button', { name: 'Crystallize' }).click();

    await expect.poll(() => crystallizeCalls).toBe(1);
    const proposalSection = view.getByLabel('Automation evolution proposals');
    await expect(proposalSection).toContainText('Update launch readiness memory');
    await expect(proposalSection).toContainText('Adds launch readiness learnings from the run.');
  });

  test('[P1] shows a page error and keeps the row usable when Pause fails', async ({ page }) => {
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

  test('[P1] shows a page error and keeps the row visible when Delete fails', async ({ page }) => {
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

  test('[P1] edits an automation title from the saved list and keeps the updated row visible', async ({ page }) => {
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

  test('[P1] editing an automation schedule sends the updated weekly PATCH payload', async ({ page }) => {
    await seedAutomationsBase(page);

    const patchBodies: Array<Record<string, unknown>> = [];
    let routines: Array<Record<string, unknown>> = [
      {
        id: 'routine-edit-schedule-1',
        name: 'Daily launch digest',
        prompt: 'Summarize launch activity.',
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

    await page.route('**/api/routines/routine-edit-schedule-1', async (route) => {
      if (route.request().method() === 'PATCH') {
        const payload = route.request().postDataJSON() as Record<string, unknown>;
        patchBodies.push(payload);
        const current = routines[0];
        if (!current) throw new Error('missing routine fixture');
        const routine = {
          ...current,
          name: payload.name ?? current.name,
          prompt: payload.prompt ?? current.prompt,
          schedule: payload.schedule ?? current.schedule,
          target: payload.target ?? current.target,
          updatedAt: Date.now(),
        };
        routines = [routine];
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ routine }),
        });
        return;
      }
      await route.fulfill({ status: 404, body: '{}' });
    });

    const view = await gotoAutomations(page);
    const row = view.locator('.automation-row', { hasText: 'Daily launch digest' }).first();

    await row.getByRole('button', { name: 'Edit' }).click();
    const modal = page.getByTestId('automation-modal');
    await expect(modal.getByLabel('Automation title')).toHaveValue('Daily launch digest');
    await modal.getByRole('button', { name: /Daily/i }).click();
    await page.getByRole('tab', { name: 'Weekly' }).click();
    await page.locator('.automation-popover__weekdays').getByRole('button', { name: 'Tue' }).click();
    await page.locator('.automation-popover--schedule input[type="time"]').fill('08:15');
    await page.locator('.automation-popover--schedule select').selectOption('UTC');
    await page.getByRole('button', { name: 'Done' }).click();
    await modal.getByRole('button', { name: /^Save/i }).click();

    await expect.poll(() => patchBodies.length).toBe(1);
    expect(patchBodies[0]).toMatchObject({
      name: 'Daily launch digest',
      prompt: 'Summarize launch activity.',
      schedule: {
        kind: 'weekly',
        weekday: 2,
        time: '08:15',
        timezone: 'UTC',
      },
      target: {
        mode: 'create_each_run',
      },
    });
  });

  test('[P1] switches template filters and updates the visible template cards', async ({ page }) => {
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

  test('[P0] @critical creates an automation from a catalog template with derived prompt context', async ({ page }) => {
    await seedAutomationsBase(page);

    const createBodies: Array<Record<string, unknown>> = [];
    let routines: Array<Record<string, unknown>> = [];

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
          body: JSON.stringify({ routines }),
        });
        return;
      }
      if (method === 'POST') {
        const payload = route.request().postDataJSON() as Record<string, unknown>;
        createBodies.push(payload);
        const routine = {
          id: 'routine-template-1',
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
        body: JSON.stringify({
          templates: [
            {
              id: 'memory-refresh-template',
              title: 'Memory refresh template',
              description: 'Refresh project memory from selected source packets.',
              purpose: 'Keep durable memory current from recent product and design work.',
              triggerKinds: ['manual', 'schedule'],
              sourceKinds: ['artifact', 'connector'],
              stages: [
                { id: 'ingest', kind: 'ingest', title: 'Collect source packets' },
                { id: 'compress', kind: 'compress', title: 'Compact durable context' },
                { id: 'apply', kind: 'apply', title: 'Update memory' },
              ],
              outputSinks: ['memory'],
              reviewPolicy: 'optional',
              tokenCompression: 'balanced',
              tags: ['memory'],
            },
          ],
        }),
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

    await view.getByRole('button', { name: /Memory refresh template/i }).click();
    const modal = page.getByTestId('automation-modal');
    await expect(modal.getByLabel('Automation title')).toHaveValue('Memory refresh template');
    await expect(modal.getByTestId('automation-modal-prompt')).toHaveValue(/Use Automation template "memory-refresh-template"/);
    await expect(modal.getByTestId('automation-modal-prompt')).toHaveValue(/Pipeline: Collect source packets -> Compact durable context -> Update memory/);

    await modal.getByRole('button', { name: 'Create' }).click();
    await expect(view.getByTestId('automation-row-routine-template-1')).toContainText('Memory refresh template');
    expect(createBodies[0]).toMatchObject({
      name: 'Memory refresh template',
      schedule: {
        kind: 'daily',
        time: '09:00',
      },
      target: {
        mode: 'create_each_run',
      },
    });
    expect(createBodies[0]?.prompt).toContain('Use Automation template "memory-refresh-template"');
    expect(createBodies[0]?.prompt).toContain('Outputs: memory.');
  });

  test('[P1] template-created automation preserves edited schedule and existing project target payload', async ({ page }) => {
    await seedAutomationsBase(page);

    const projects = [{ id: 'proj-template-target-1', name: 'Template Target Project' }];
    const createBodies: Array<Record<string, unknown>> = [];
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
        createBodies.push(payload);
        const routine = {
          id: 'routine-template-target-1',
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
        body: JSON.stringify({
          templates: [
            {
              id: 'design-system-watch-template',
              title: 'Design system watch template',
              description: 'Watch artifacts and propose durable design-system updates.',
              purpose: 'Keep the design system aligned with accepted project artifacts.',
              triggerKinds: ['manual', 'schedule'],
              sourceKinds: ['artifact'],
              stages: [
                { id: 'collect', kind: 'ingest', title: 'Collect accepted artifacts' },
                { id: 'propose', kind: 'propose', title: 'Draft DESIGN.md updates' },
              ],
              outputSinks: ['design-system'],
              reviewPolicy: 'always',
              tokenCompression: 'balanced',
              tags: ['design-system'],
            },
          ],
        }),
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

    await view.getByRole('button', { name: /Design system watch template/i }).click();
    const modal = page.getByTestId('automation-modal');
    await expect(modal.getByLabel('Automation title')).toHaveValue('Design system watch template');
    await modal.getByRole('button', { name: /New project each run/i }).click();
    await page.getByRole('button', { name: 'Template Target Project' }).click();
    await modal.getByRole('button', { name: /Daily/i }).click();
    await page.getByRole('tab', { name: 'Weekly' }).click();
    await page.locator('.automation-popover__weekdays').getByRole('button', { name: 'Thu' }).click();
    await page.locator('.automation-popover--schedule input[type="time"]').fill('13:30');
    await page.locator('.automation-popover--schedule select').selectOption('UTC');
    await page.getByRole('button', { name: 'Done' }).click();

    await modal.getByRole('button', { name: 'Create' }).click();
    await expect.poll(() => createBodies.length).toBe(1);
    expect(createBodies[0]).toMatchObject({
      name: 'Design system watch template',
      schedule: {
        kind: 'weekly',
        weekday: 4,
        time: '13:30',
        timezone: 'UTC',
      },
      target: {
        mode: 'reuse',
        projectId: 'proj-template-target-1',
      },
    });
    expect(createBodies[0]?.prompt).toContain('Use Automation template "design-system-watch-template"');
    expect(createBodies[0]?.prompt).toContain('Outputs: design-system.');
  });

  test('[P1] renders the routine target and last-run status in the row summary', async ({ page }) => {
    await seedAutomationsBase(page);

    const projects = [{ id: 'proj-shared-1', name: 'Shared Release Project' }];
    const routines = [
      {
        id: 'routine-summary-1',
        name: 'Release digest',
        prompt: 'Summarize release issues and recent commits.',
        schedule: { kind: 'weekly', weekday: 3, time: '14:30', timezone: 'UTC' },
        target: { mode: 'reuse', projectId: 'proj-shared-1' },
        enabled: true,
        nextRunAt: Date.now() + 86_400_000,
        lastRun: {
          id: 'run-summary-1',
          status: 'failed',
          trigger: 'manual',
          startedAt: Date.now() - 7_200_000,
          error: 'Provider request timed out after 30s',
          summary: 'Provider request timed out after 30s',
        },
        createdAt: Date.now() - 300_000,
        updatedAt: Date.now() - 60_000,
      },
    ];

    await page.route('**/api/projects', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ projects }),
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
    const row = view.locator('.automation-row', { hasText: 'Release digest' }).first();

    await expect(row).toContainText('Shared Release Project');
    await expect(row).toContainText('Failed');
  });
});
