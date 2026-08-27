import { expect, test } from '@/playwright/suite';
import { routeAgents } from '@/playwright/mock-factory';
import { ensureRailOpen } from '@/playwright/rail';
import type { Page } from '@playwright/test';

const STORAGE_KEY = 'open-design:config';
const READ_KEY = 'open-design.message-center.anonymous-read-ids.v1';

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

async function gotoEntryHome(page: Page, timeout = 10_000) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Loading OpenDesign…')).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByTestId('home-hero')).toBeVisible({ timeout });
  await ensureRailOpen(page);
}

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

  const trigger = page.getByTestId('entry-nav-message-center');
  await expect(trigger.locator('.entry-nav-rail__btn-dot')).toBeVisible();
  await trigger.click();

  const dialog = page.getByTestId('message-center-dialog');
  await expect(dialog.getByText('Build output recovered')).toBeVisible();
  await dialog.getByRole('button', { name: /Build output recovered/i }).click();
  await expect.poll(() => readMessageIds).toEqual(['msg-account-build']);
  await expect(trigger.locator('.entry-nav-rail__btn-dot')).toBeVisible();
  await expect
    .poll(() => page.evaluate((key) => window.localStorage.getItem(key), READ_KEY))
    .toBeNull();

  await dialog.getByRole('button', { name: 'Mark all read' }).click();
  await expect.poll(() => readAllCalls).toBe(1);
  await expect(trigger.locator('.entry-nav-rail__btn-dot')).toHaveCount(0);

  await dialog.getByRole('button', { name: 'Unread' }).click();
  await expect(dialog.getByText('All caught up')).toBeVisible();

  await dialog.getByRole('button', { name: 'Read', exact: true }).click();
  await expect(dialog.getByText('Build output recovered')).toBeVisible();
  await expect(dialog.getByText('Prerelease channel ready')).toBeVisible();
});

test('[P1] message center dismisses with Escape and restores the trigger state', async ({ page }) => {
  await seedEntryHome(page);

  await page.route('**/api/integrations/vela/status', async (route) => {
    await route.fulfill({ json: { loggedIn: true } });
  });
  await page.route('**/api/integrations/vela/message-center/messages**', async (route) => {
    await route.fulfill({
      json: {
        messages: [
          {
            id: 'msg-close-affordance',
            audienceType: 'account',
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

  await gotoEntryHome(page, 3_000);
  const trigger = page.getByTestId('entry-nav-message-center');
  await trigger.click();

  const dialog = page.getByTestId('message-center-dialog');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
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
    await route.fulfill({ json: { loggedIn: true } });
  });
  await page.route('**/api/integrations/vela/message-center/messages**', async (route) => {
    await route.fulfill({
      json: {
        messages: [
          {
            id: 'msg-localized-date',
            audienceType: 'account',
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

  await gotoEntryHome(page, 3_000);
  await page.getByTestId('entry-nav-message-center').click();

  const dialog = page.getByTestId('message-center-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Localized release date')).toBeVisible();
  await expect(dialog.getByText(expectedDate)).toBeVisible();
  if (enDate !== expectedDate) {
    await expect(dialog.getByText(enDate)).toHaveCount(0);
  }
});
