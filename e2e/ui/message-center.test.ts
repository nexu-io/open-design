import { expect, test } from '@/playwright/suite';
import { routeAgents } from '@/playwright/mock-factory';
import type { Page } from '@playwright/test';

const STORAGE_KEY = 'open-design:config';
const READ_KEY = 'open-design.message-center.anonymous-read-ids.v1';
const OPEN_SETTINGS_LABEL = /Open settings|打开设置|開啟設定/i;

test.describe.configure({ timeout: 30_000 });

async function seedEntryHome(page: Page, options?: { locale?: string }) {
  await page.addInitScript(({ key, locale }) => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    if (locale) {
      window.localStorage.setItem('open-design:locale', locale);
      window.localStorage.setItem('open-design:locale-source', 'manual');
    }
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
  }, { key: STORAGE_KEY, locale: options?.locale ?? null });

  await page.route('**/api/github/open-design', async (route) => {
    await route.fulfill({ json: { stargazers_count: 80300 } });
  });

  await routeAgents(page, [
    {
      id: 'codex',
      name: 'Codex CLI',
      bin: 'codex',
      available: true,
      version: '0.130.0',
      path: '/usr/local/bin/codex',
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
}

async function gotoEntryHome(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Loading Open Design…')).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByRole('button', { name: OPEN_SETTINGS_LABEL })).toBeVisible();
}

test('[P1] message center shows anonymous platform messages and keeps read state locally', async ({ page }) => {
  await seedEntryHome(page);

  await page.route('**/api/integrations/vela/status', async (route) => {
    await route.fulfill({ json: { loggedIn: false } });
  });
  await page.route('**/api/integrations/vela/api-proxy/api/v1/message-center/messages**', async (route) => {
    await route.fulfill({
      json: {
        messages: [
          {
            id: 'msg-prerelease-update',
            audienceType: 'global',
            typeName: 'Release',
            title: 'Prerelease update recovered',
            body: 'The prerelease updater can apply a payload update without requiring account sign-in.',
            ctaLabel: 'Open release notes',
            ctaUrl: 'https://open-design.example.test/releases/prerelease',
            publishedAt: '2026-07-21T08:00:00.000Z',
            readAt: null,
          },
        ],
        nextCursor: null,
        unreadCount: 1,
      },
    });
  });

  await gotoEntryHome(page);

  const trigger = page.getByTestId('message-center-trigger');
  await expect(trigger).toHaveAccessibleName(/Open message center.*1 unread/i);
  await trigger.click();

  const dialog = page.getByTestId('message-center-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Message center' })).toBeVisible();
  await expect(dialog.getByText('Prerelease update recovered')).toBeVisible();
  await expect(dialog.getByText('The prerelease updater can apply a payload update')).toBeVisible();

  await dialog.getByRole('button', { name: /Prerelease update recovered/i }).click();
  await expect(dialog.getByRole('button', { name: 'Open release notes' })).toBeVisible();
  await expect(trigger).toHaveAccessibleName('Open message center');
  await expect
    .poll(() => page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? '[]') as string[], READ_KEY))
    .toEqual(['msg-prerelease-update']);

  await dialog.getByRole('button', { name: 'Unread' }).click();
  await expect(dialog.getByText('All caught up')).toBeVisible();

  await dialog.getByRole('button', { name: 'Read', exact: true }).click();
  await expect(dialog.getByText('Prerelease update recovered')).toBeVisible();
});

test('[P1] message center uses account read APIs when Vela is signed in', async ({ page }) => {
  await seedEntryHome(page);

  const readMessageIds: string[] = [];
  let readAllCalls = 0;
  await page.route('**/api/integrations/vela/status', async (route) => {
    await route.fulfill({ json: { loggedIn: true } });
  });
  await page.route('**/api/integrations/vela/message-center/messages**', async (route) => {
    await route.fulfill({
      json: {
        messages: [
          {
            id: 'msg-account-build',
            audienceType: 'account',
            typeName: 'Build',
            title: 'Build output recovered',
            body: 'The generated landing page assets are available again.',
            publishedAt: '2026-07-21T09:00:00.000Z',
            readAt: null,
          },
          {
            id: 'msg-account-release',
            audienceType: 'account',
            typeName: 'Release',
            title: 'Prerelease channel ready',
            body: 'The prerelease channel has a new package available.',
            publishedAt: '2026-07-21T08:30:00.000Z',
            readAt: null,
          },
        ],
        nextCursor: null,
        unreadCount: 2,
      },
    });
  });
  await page.route('**/api/integrations/vela/message-center/messages/*/read', async (route) => {
    const match = route.request().url().match(/\/messages\/([^/]+)\/read$/);
    readMessageIds.push(match?.[1] ?? '');
    await route.fulfill({ json: { ok: true } });
  });
  await page.route('**/api/integrations/vela/message-center/read-all', async (route) => {
    readAllCalls += 1;
    await route.fulfill({ json: { ok: true } });
  });

  await gotoEntryHome(page);

  const trigger = page.getByTestId('message-center-trigger');
  await expect(trigger).toHaveAccessibleName(/Open message center.*2 unread/i);
  await trigger.click();

  const dialog = page.getByTestId('message-center-dialog');
  await expect(dialog.getByText('Build output recovered')).toBeVisible();
  await dialog.getByRole('button', { name: /Build output recovered/i }).click();
  await expect.poll(() => readMessageIds).toEqual(['msg-account-build']);
  await expect(trigger).toHaveAccessibleName(/Open message center.*1 unread/i);
  await expect
    .poll(() => page.evaluate((key) => window.localStorage.getItem(key), READ_KEY))
    .toBeNull();

  await dialog.getByRole('button', { name: 'Mark all read' }).click();
  await expect.poll(() => readAllCalls).toBe(1);
  await expect(trigger).toHaveAccessibleName('Open message center');

  await dialog.getByRole('button', { name: 'Unread' }).click();
  await expect(dialog.getByText('All caught up')).toBeVisible();

  await dialog.getByRole('button', { name: 'Read', exact: true }).click();
  await expect(dialog.getByText('Build output recovered')).toBeVisible();
  await expect(dialog.getByText('Prerelease channel ready')).toBeVisible();
});

test('[P1] message center keeps the close affordance visible and dismisses the panel', async ({ page }) => {
  await seedEntryHome(page);

  await page.route('**/api/integrations/vela/status', async (route) => {
    await route.fulfill({ json: { loggedIn: false } });
  });
  await page.route('**/api/integrations/vela/api-proxy/api/v1/message-center/messages**', async (route) => {
    await route.fulfill({
      json: {
        messages: [
          {
            id: 'msg-close-affordance',
            audienceType: 'global',
            typeName: 'Release',
            title: 'Close button stays visible',
            body: 'The panel can be dismissed without hunting for hover-only controls.',
            publishedAt: '2026-07-21T08:00:00.000Z',
            readAt: null,
          },
        ],
        nextCursor: null,
        unreadCount: 1,
      },
    });
  });

  await gotoEntryHome(page);
  const trigger = page.getByTestId('message-center-trigger');
  await trigger.click();

  const dialog = page.getByTestId('message-center-dialog');
  await expect(dialog).toBeVisible();
  const closeButton = dialog.getByRole('button', { name: 'Close message center' });
  await expect(closeButton).toBeVisible();

  const closeMetrics = await closeButton.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const style = window.getComputedStyle(node);
    return {
      width: rect.width,
      height: rect.height,
      borderTopWidth: style.borderTopWidth,
      backgroundColor: style.backgroundColor,
    };
  });
  expect(closeMetrics.width).toBeGreaterThanOrEqual(32);
  expect(closeMetrics.height).toBeGreaterThanOrEqual(32);
  expect(closeMetrics.borderTopWidth).not.toBe('0px');
  expect(closeMetrics.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');

  await closeButton.click();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
});

test('[P1] message center formats published dates with the selected zh-CN locale', async ({ page }) => {
  const publishedAt = '2026-07-21T08:00:00.000Z';
  const expectedDate = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(
    new Date(publishedAt),
  );
  const enDate = new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(publishedAt));

  await seedEntryHome(page, { locale: 'zh-CN' });

  await page.route('**/api/integrations/vela/status', async (route) => {
    await route.fulfill({ json: { loggedIn: false } });
  });
  await page.route('**/api/integrations/vela/api-proxy/api/v1/message-center/messages**', async (route) => {
    await route.fulfill({
      json: {
        messages: [
          {
            id: 'msg-localized-date',
            audienceType: 'global',
            typeName: 'Release',
            title: 'Localized release date',
            body: 'Message dates follow the selected application language.',
            publishedAt,
            readAt: null,
          },
        ],
        nextCursor: null,
        unreadCount: 1,
      },
    });
  });

  await gotoEntryHome(page);
  await page.getByTestId('message-center-trigger').click();

  const dialog = page.getByTestId('message-center-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Localized release date')).toBeVisible();
  await expect(dialog.getByText(expectedDate)).toBeVisible();
  if (enDate !== expectedDate) {
    await expect(dialog.getByText(enDate)).toHaveCount(0);
  }
});
