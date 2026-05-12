import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

const STORAGE_KEY = 'open-design:config';

const CONNECTORS = [
  {
    id: 'github',
    name: 'GitHub',
    provider: 'composio',
    category: 'Developer tools',
    description: 'Read repository issues and pull requests.',
    status: 'available',
    auth: { provider: 'composio', configured: true },
    tools: [],
  },
  {
    id: 'slack',
    name: 'Slack',
    provider: 'composio',
    category: 'Communication',
    description: 'Search channels and messages.',
    status: 'connected',
    accountLabel: 'design-team',
    auth: { provider: 'composio', configured: true },
    tools: [],
  },
] as const;

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

function pendingAuthorizationStorage() {
  return {
    github: {
      expiresAt: '2099-01-01T00:00:00.000Z',
    },
  };
}

function connectorCard(scope: Page | Locator, id: string) {
  return scope.locator(`article.connector-card[data-connector-id="${id}"]`);
}

async function openConnectorsSettings(
  page: Page,
  {
    connectors = CONNECTORS,
    onPrepare = () => ({
      results: { github: { status: 'ready', authConfigId: 'cfg_123' } },
    }),
    onConnect = () => ({
      status: 200,
      body: {
        connector: {
          ...CONNECTORS[0],
          status: 'connected',
          accountLabel: 'octo-user',
        },
        auth: { kind: 'connected' },
      },
    }),
    onCancel = () => ({
      status: 200,
      body: {
        connector: {
          ...CONNECTORS[0],
          status: 'available',
        },
      },
    }),
    pendingAuthorization = null,
    blockPopup = false,
  }: {
    connectors?: typeof CONNECTORS;
    onPrepare?: () => Record<string, unknown>;
    onConnect?: () => { status: number; body: Record<string, unknown> };
    onCancel?: () => { status: number; body: Record<string, unknown> };
    pendingAuthorization?: Record<string, unknown> | null;
    blockPopup?: boolean;
  } = {},
) {
  await page.addInitScript(
    ({ key, value, pendingAuthorization, blockPopup }) => {
      window.localStorage.setItem(key, JSON.stringify(value));
      if (pendingAuthorization) {
        window.sessionStorage.setItem(
          'od-connectors-authorization-pending',
          JSON.stringify(pendingAuthorization),
        );
      }
      window.open = (blockPopup
        ? (() => null)
        : (() => ({
            document: { title: '', body: { innerHTML: '' } },
            location: { replace() {} },
            close() {},
          }))) as unknown as typeof window.open;
    },
    { key: STORAGE_KEY, value: baseConfig(), pendingAuthorization, blockPopup },
  );

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

  await page.route('**/api/connectors', async (route) => {
    await route.fulfill({ json: { connectors } });
  });

  await page.route('**/api/connectors/status', async (route) => {
    const statuses = Object.fromEntries(
      connectors.map((connector) => [
        connector.id,
        {
          status: connector.status,
          accountLabel: 'accountLabel' in connector ? connector.accountLabel : undefined,
        },
      ]),
    );
    await route.fulfill({ json: { statuses } });
  });

  await page.route('**/api/connectors/discovery*', async (route) => {
    await route.fulfill({
      json: {
        connectors,
        meta: { provider: 'composio' },
      },
    });
  });

  await page.route('**/api/connectors/composio/config', async (route) => {
    await route.fulfill({ json: { configured: true, apiKeyTail: '1234' } });
  });

  await page.route('**/api/connectors/auth-configs/prepare', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(onPrepare()),
    });
  });

  await page.route('**/api/connectors/github/connect', async (route) => {
    const response = onConnect();
    await route.fulfill({
      status: response.status,
      contentType: 'application/json',
      body: JSON.stringify(response.body),
    });
  });

  await page.route('**/api/connectors/github/authorization/cancel', async (route) => {
    const response = onCancel();
    await route.fulfill({
      status: response.status,
      contentType: 'application/json',
      body: JSON.stringify(response.body),
    });
  });

  await page.goto('/');
  await page.getByTitle('Configure execution mode').click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: /^Connectors\b/ }).click();
  await expect(dialog.getByTestId('connector-grid-wrap')).toBeVisible();
  await expect(connectorCard(dialog, 'github')).toBeVisible();
  return dialog;
}

test.describe('Settings connectors auth recovery', () => {
test('clears pending authorization when OAuth launch is blocked after redirect_required', async ({ page }) => {
    const dialog = await openConnectorsSettings(page, {
      blockPopup: true,
      onConnect: () => ({
        status: 200,
        body: {
          connector: {
            ...CONNECTORS[0],
            status: 'available',
          },
          auth: {
            kind: 'redirect_required',
            redirectUrl: 'https://example.com/oauth/start',
            expiresAt: '2099-01-01T00:00:00.000Z',
          },
        },
      }),
    });

    const githubCard = connectorCard(dialog, 'github');
    await githubCard.getByRole('button', { name: 'Connect' }).click();
    await expect(githubCard.getByRole('button', { name: 'Cancel' })).toHaveCount(0);
    await expect(githubCard.getByRole('alert')).toContainText(
      'Popup blocked. Allow popups for Open Design and try again.',
    );
    await expect
      .poll(async () =>
        page.evaluate(() => window.sessionStorage.getItem('od-connectors-authorization-pending')),
      )
      .toBe(null);
  });

  test('keeps a pending authorization visible when the connector enters authorization-pending state', async ({ page }) => {
    const dialog = await openConnectorsSettings(page, {
      pendingAuthorization: pendingAuthorizationStorage(),
    });

    const githubCard = connectorCard(dialog, 'github');
    await expect(githubCard.getByRole('button', { name: 'Cancel' })).toBeVisible();
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const raw = window.sessionStorage.getItem('od-connectors-authorization-pending');
          if (!raw) return false;
          const parsed = JSON.parse(raw) as Record<string, { expiresAt?: string }>;
          return typeof parsed.github?.expiresAt === 'string' && parsed.github.expiresAt.length > 0;
        }),
      )
      .toBe(true);
  });

  test('keeps pending authorization visible when daemon cancellation fails', async ({ page }) => {
    const dialog = await openConnectorsSettings(page, {
      pendingAuthorization: pendingAuthorizationStorage(),
      onCancel: () => ({
        status: 500,
        body: {
          error: { message: "Couldn't cancel authorization. Try again." },
        },
      }),
    });

    const githubCard = connectorCard(dialog, 'github');
    await expect(githubCard.getByRole('button', { name: 'Cancel' })).toBeVisible();

    await githubCard.getByRole('button', { name: 'Cancel' }).click();

    await expect(githubCard.getByRole('button', { name: 'Cancel' })).toBeVisible();
    await expect(githubCard.getByRole('alert')).toContainText(
      "Couldn't cancel authorization. Try again.",
    );
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const raw = window.sessionStorage.getItem('od-connectors-authorization-pending');
          if (!raw) return false;
          const parsed = JSON.parse(raw) as Record<string, { expiresAt?: string }>;
          return typeof parsed.github?.expiresAt === 'string' && parsed.github.expiresAt.length > 0;
        }),
      )
      .toBe(true);
  });

  test('restores a pending authorization after a full page reload', async ({ page }) => {
    const dialog = await openConnectorsSettings(page, {
      pendingAuthorization: pendingAuthorizationStorage(),
    });

    const githubCard = connectorCard(dialog, 'github');
    await expect(githubCard.getByRole('button', { name: 'Cancel' })).toBeVisible();

    await page.reload();
    await page.getByTitle('Configure execution mode').click();

    const reloadedDialog = page.getByRole('dialog');
    await expect(reloadedDialog).toBeVisible();
    await reloadedDialog.getByRole('button', { name: /^Connectors\b/ }).click();

    const reloadedGithubCard = connectorCard(reloadedDialog, 'github');
    await expect(reloadedGithubCard.getByRole('button', { name: 'Cancel' })).toBeVisible();
    await expect(reloadedGithubCard.getByRole('button', { name: 'Connect' })).toHaveCount(0);
  });

  test('settles a pending authorization into Disconnect when status polling reports the connector as connected', async ({ page }) => {
    let statusRequests = 0;
    const dialog = await openConnectorsSettings(page, {
      pendingAuthorization: pendingAuthorizationStorage(),
    });

    await page.unroute('**/api/connectors/status');
    await page.route('**/api/connectors/status', async (route) => {
      statusRequests += 1;
      const githubStatus =
        statusRequests >= 2
          ? { status: 'connected', accountLabel: 'octo-user' }
          : { status: 'available', accountLabel: undefined };
      await route.fulfill({
        json: {
          statuses: {
            github: githubStatus,
            slack: { status: 'connected', accountLabel: 'design-team' },
          },
        },
      });
    });

    const githubCard = connectorCard(dialog, 'github');
    await expect(githubCard.getByRole('button', { name: 'Cancel' })).toBeVisible();

    await expect
      .poll(async () => statusRequests, { timeout: 5000 })
      .toBeGreaterThanOrEqual(2);
    await expect(githubCard.getByRole('button', { name: 'Disconnect' })).toBeVisible();
    await expect(githubCard.getByRole('button', { name: 'Cancel' })).toHaveCount(0);
    await expect
      .poll(async () =>
        page.evaluate(() => window.sessionStorage.getItem('od-connectors-authorization-pending')),
      )
      .toBe(null);
  });

  test('returns a pending authorization to Connect and clears session storage after a successful cancel', async ({ page }) => {
    const dialog = await openConnectorsSettings(page, {
      pendingAuthorization: pendingAuthorizationStorage(),
      onCancel: () => ({
        status: 200,
        body: {
          connector: {
            ...CONNECTORS[0],
            status: 'available',
          },
        },
      }),
    });

    const githubCard = connectorCard(dialog, 'github');
    await expect(githubCard.getByRole('button', { name: 'Cancel' })).toBeVisible();

    await githubCard.getByRole('button', { name: 'Cancel' }).click();

    await expect(githubCard.getByRole('button', { name: 'Connect' })).toBeVisible();
    await expect(githubCard.getByRole('button', { name: 'Cancel' })).toHaveCount(0);
    await expect
      .poll(async () =>
        page.evaluate(() => window.sessionStorage.getItem('od-connectors-authorization-pending')),
      )
      .toBe(null);
  });

  test('restores a pending authorization from session storage after reopening settings', async ({ page }) => {
    const dialog = await openConnectorsSettings(page, {
      pendingAuthorization: pendingAuthorizationStorage(),
    });

    const githubCard = connectorCard(dialog, 'github');
    await expect(githubCard.getByRole('button', { name: 'Cancel' })).toBeVisible();
    await expect(githubCard.getByRole('button', { name: 'Connect' })).toHaveCount(0);
  });
});
