import { expect, test } from '@/playwright/suite';
import type { Locator, Page } from '@playwright/test';
import { openSettingsDialog } from '../lib/playwright/amr.js';
import { routeAgents } from '../lib/playwright/mock-factory.js';
import { T } from '@/timeouts';

const STORAGE_KEY = 'open-design:config';
const OPEN_SETTINGS_LABEL = /Open settings|打开设置|開啟設定|Account & settings/i;

test.describe.configure({ timeout: T.xlong });

type ConnectorFixture = {
  id: string;
  name: string;
  provider: 'composio';
  category: string;
  description: string;
  status: 'available' | 'connected' | 'error';
  accountLabel?: string;
  lastError?: string;
  auth: { provider: 'composio'; configured: true };
  tools: readonly unknown[];
};

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
] as const satisfies readonly ConnectorFixture[];

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
    privacyDecisionAt: 1,
    telemetry: { metrics: true, content: true },
    composio: {
      apiKey: '',
      apiKeyConfigured: true,
      apiKeyTail: '1234',
    },
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

async function waitForLoadingToClear(page: Page) {
  await expect(page.getByText('Loading Open Design…')).toHaveCount(0, { timeout: T.long });
}

async function gotoEntryHome(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  const privacyRegion = page.getByRole('region', { name: /Help us improve Open Design/i });
  if (await privacyRegion.isVisible().catch(() => false)) {
    await privacyRegion.getByRole('button', { name: /I get it|not now|got it/i }).click();
  }
  await expect(page.getByTestId('home-hero')).toBeVisible();
}

async function openSettingsDialogFromEntry(page: Page) {
  return openSettingsDialog(page);
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
    statusResponse = () => ({
      github: pendingAuthorization
        ? { status: 'error', accountLabel: undefined }
        : { status: CONNECTORS[0]?.status ?? 'available', accountLabel: undefined },
      slack: { status: 'connected', accountLabel: 'design-team' },
    }),
    pendingAuthorization = null,
    blockPopup = false,
  }: {
    connectors?: readonly ConnectorFixture[];
    onPrepare?: () => Record<string, unknown>;
    onConnect?: () => { status: number; body: Record<string, unknown> };
    onCancel?: () => { status: number; body: Record<string, unknown> };
    statusResponse?: () => Record<string, unknown>;
    pendingAuthorization?: Record<string, unknown> | null;
    blockPopup?: boolean;
  } = {},
) {
  let cancelRequestCount = 0;
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

  await page.route('**/api/app-config', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { config: baseConfig() } });
      return;
    }
    await route.fulfill({ json: { ok: true } });
  });

  await page.route('**/api/connectors', async (route) => {
    await route.fulfill({ json: { connectors } });
  });

  await page.route('**/api/connectors/status', async (route) => {
    await route.fulfill({ json: { statuses: statusResponse() } });
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

  await page.route('**/api/connectors/github/authorization/cancel*', async (route) => {
    cancelRequestCount += 1;
    const response = onCancel();
    await route.fulfill({
      status: response.status,
      contentType: 'application/json',
      body: JSON.stringify(response.body),
    });
  });

  await gotoEntryHome(page);
  const dialog = await openSettingsDialogFromEntry(page);
  await dialog.getByRole('button', { name: /Connectors|连接器/i }).click();
  await expect(dialog.getByTestId('connector-grid-wrap')).toBeVisible();
  await expect(connectorCard(dialog, 'github')).toBeVisible();
  return { dialog, getCancelRequestCount: () => cancelRequestCount };
}

test.describe('Settings connectors auth recovery', () => {
  test('[P0] keeps a pending authorization visible when the connector enters authorization-pending state', async ({ page }) => {
    const { dialog } = await openConnectorsSettings(page, {
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


  test('[P0] shows a continue-in-browser CTA for pending authorizations that include a redirect URL', async ({ page }) => {
    const { dialog } = await openConnectorsSettings(page, {
      pendingAuthorization: {
        github: {
          expiresAt: '2099-01-01T00:00:00.000Z',
          redirectUrl: 'https://example.com/oauth/github',
        },
      },
    });

    const githubCard = connectorCard(dialog, 'github');
    await expect(githubCard.getByRole('button', { name: 'Cancel' })).toBeVisible();
    await expect(githubCard.getByRole('button', { name: 'Continue in browser' })).toBeVisible();
  });

  test('[P0] settles a pending authorization into Disconnect when status polling reports the connector as connected', async ({ page }) => {
    let statusRequests = 0;
    const { dialog } = await openConnectorsSettings(page, {
      pendingAuthorization: pendingAuthorizationStorage(),
      statusResponse: () => {
        statusRequests += 1;
        return {
          github: statusRequests >= 2
            ? { status: 'connected', accountLabel: 'octo-user' }
            : { status: 'error', accountLabel: undefined },
          slack: { status: 'connected', accountLabel: 'design-team' },
        };
      },
    });

    const githubCard = connectorCard(dialog, 'github');

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

  test('[P0] returns a pending authorization to Connect and clears session storage after a successful cancel', async ({ page }) => {
    const { dialog } = await openConnectorsSettings(page, {
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
    const cancelButton = githubCard.getByRole('button', { name: 'Cancel' });
    await expect(cancelButton).toBeVisible();

    await cancelButton.click();

    await expect(githubCard.getByRole('button', { name: 'Connect' })).toBeVisible();
    await expect(githubCard.getByRole('button', { name: 'Cancel' })).toHaveCount(0);
    await expect
      .poll(async () =>
        page.evaluate(() => window.sessionStorage.getItem('od-connectors-authorization-pending')),
      )
      .toBe(null);
  });


  test('[P0] surfaces a connector error state when credentials have degraded', async ({ page }) => {
    const githubConnector = CONNECTORS[0];
    const slackConnector = CONNECTORS[1];
    if (!githubConnector || !slackConnector) throw new Error('missing connector fixtures');
    const degradedConnectors: ConnectorFixture[] = [
      {
        ...githubConnector,
        status: 'error',
        accountLabel: 'octo-user',
        lastError: 'GitHub token expired. Reconnect to continue.',
      },
      slackConnector,
    ];
    const { dialog } = await openConnectorsSettings(page, {
      connectors: degradedConnectors,
    });

    const githubCard = connectorCard(dialog, 'github');
    await expect(githubCard).toHaveClass(/status-error/);
    await expect(githubCard.locator('.connector-status-pill.status-error')).toBeVisible();
    await expect(githubCard.getByRole('button', { name: 'Disconnect' })).toHaveCount(0);
  });

});
