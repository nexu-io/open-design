import { expect, test } from '@/playwright/suite';
import type { Locator, Page } from '@playwright/test';
import { openSettingsDialog } from '../lib/playwright/amr.js';
import { routeAgents } from '../lib/playwright/mock-factory.js';
import { T } from '@/timeouts';

const STORAGE_KEY = 'open-design:config';
const OPEN_SETTINGS_LABEL = /Open settings|打开设置|開啟設定|Account & settings/i;

test.describe.configure({ timeout: T.xlong });

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
    onDisconnect = () => ({
      status: 200,
      body: {
        connector: {
          ...CONNECTORS[0],
          status: 'available',
        },
      },
    }),
  }: {
    connectors?: typeof CONNECTORS;
    onPrepare?: () => Record<string, unknown>;
    onConnect?: () => { status: number; body: Record<string, unknown> };
    onDisconnect?: () => { status: number; body: Record<string, unknown> };
  } = {},
) {
  let githubState: Record<string, unknown> = { ...CONNECTORS[0] };
  await page.addInitScript(({ key, value }) => {
    window.localStorage.setItem(key, JSON.stringify(value));
    window.open = ((() => ({
      document: { title: '', body: { innerHTML: '' } },
      location: { replace() {} },
      close() {},
    })) as unknown) as typeof window.open;
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
    const statuses = Object.fromEntries(
      connectors.map((connector) => [
        connector.id,
        connector.id === 'github'
          ? {
              status: githubState.status,
              accountLabel: githubState.accountLabel,
            }
          : {
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
        connectors: connectors.map((connector) => (
          connector.id === 'github' ? ({ ...connector, ...githubState }) : connector
        )),
        meta: { provider: 'composio' },
      },
    });
  });

  await page.route('**/api/connectors/github**', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      json: {
        connector: {
          ...CONNECTORS[0],
          ...githubState,
        },
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
    githubState = {
      ...CONNECTORS[0],
      ...(response.body.connector ?? {}),
    };
    await route.fulfill({
      status: response.status,
      contentType: 'application/json',
      body: JSON.stringify(response.body),
    });
  });

  await page.route('**/api/connectors/github/connection', async (route) => {
    const response = onDisconnect();
    githubState = {
      ...CONNECTORS[0],
      ...(response.body.connector ?? {}),
    };
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
  return dialog;
}

test.describe('Settings connectors auth happy path', () => {
  test('[P0] shows an inline connector error when connect fails', async ({ page }) => {
    const dialog = await openConnectorsSettings(page, {
      onConnect: () => ({
        status: 500,
        body: {
          error: { message: 'Composio provider is not configured' },
        },
      }),
    });

    const githubCard = connectorCard(dialog, 'github');
    await githubCard.getByRole('button', { name: 'Connect' }).click();

    await expect(dialog.getByText('Composio provider is not configured')).toBeVisible();
    await expect(githubCard.getByRole('button', { name: 'Connect' })).toBeVisible();
  });

  test('[P0] clears the inline error when the user retries and the connector succeeds', async ({ page }) => {
    let connectAttempts = 0;
    const dialog = await openConnectorsSettings(page, {
      onConnect: () => {
        connectAttempts += 1;
        if (connectAttempts === 1) {
          return {
            status: 500,
            body: {
              error: { message: 'Composio provider is not configured' },
            },
          };
        }
        return {
          status: 200,
          body: {
            connector: {
              ...CONNECTORS[0],
              status: 'connected',
              accountLabel: 'octo-user',
            },
            auth: { kind: 'connected' },
          },
        };
      },
    });

    const githubCard = connectorCard(dialog, 'github');

    await githubCard.getByRole('button', { name: 'Connect' }).click();
    await expect(dialog.getByText('Composio provider is not configured')).toBeVisible();

    await githubCard.getByRole('button', { name: 'Connect' }).click();

    await expect.poll(() => connectAttempts).toBe(2);
    await expect(githubCard.getByRole('button', { name: 'Disconnect' })).toBeVisible();
    await expect(dialog.getByText('Composio provider is not configured')).toHaveCount(0);
  });

  test('[P0] switches from Connect to Disconnect on success, then returns to Connect after a successful disconnect', async ({ page }) => {
    let disconnectRequests = 0;
    const dialog = await openConnectorsSettings(page, {
      onConnect: () => ({
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
      onDisconnect: () => {
        disconnectRequests += 1;
        return {
          status: 200,
          body: {
            connector: {
              ...CONNECTORS[0],
              status: 'available',
            },
          },
        };
      },
    });

    const githubCard = connectorCard(dialog, 'github');
    await githubCard.getByRole('button', { name: 'Connect' }).click();

    await expect(githubCard.getByRole('button', { name: 'Disconnect' })).toBeVisible();

    await githubCard.getByRole('button', { name: 'Disconnect' }).click();

    await expect.poll(() => disconnectRequests).toBe(1);
    await expect(githubCard.getByRole('button', { name: 'Connect' })).toBeVisible();
    await expect(githubCard.getByRole('button', { name: 'Disconnect' })).toHaveCount(0);
  });

  test('[P0] disconnecting and reconnecting keeps the connector usable without stale pending state', async ({ page }) => {
    let connectAttempts = 0;
    let disconnectRequests = 0;
    const dialog = await openConnectorsSettings(page, {
      onConnect: () => {
        connectAttempts += 1;
        const accountLabel = connectAttempts === 1 ? 'octo-user' : 'octo-user-2';
        return {
          status: 200,
          body: {
            connector: {
              ...CONNECTORS[0],
              status: 'connected',
              accountLabel,
            },
            auth: { kind: 'connected' },
          },
        };
      },
      onDisconnect: () => {
        disconnectRequests += 1;
        return {
          status: 200,
          body: {
            connector: {
              ...CONNECTORS[0],
              status: 'available',
            },
          },
        };
      },
    });

    const githubCard = connectorCard(dialog, 'github');

    await githubCard.getByRole('button', { name: 'Connect' }).click();
    await expect(githubCard.getByRole('button', { name: 'Disconnect' })).toBeVisible();

    await githubCard.click();
    const drawer = page.getByTestId('connector-drawer');
    await expect(drawer).toContainText('Connected');
    await expect(drawer).not.toContainText('Authorization pending');
    await drawer.getByTestId('connector-drawer-close').click();

    await githubCard.getByRole('button', { name: 'Disconnect' }).click();
    await expect.poll(() => disconnectRequests).toBe(1);
    await expect(githubCard.getByRole('button', { name: 'Connect' })).toBeVisible();

    await githubCard.getByRole('button', { name: 'Connect' }).click();
    await expect.poll(() => connectAttempts).toBe(2);
    await expect(githubCard.getByRole('button', { name: 'Disconnect' })).toBeVisible();
    await githubCard.click();
    await expect(drawer).toContainText('Connected');
    await expect(drawer).not.toContainText('Authorization pending');
    await expect(drawer).not.toContainText("Couldn't cancel authorization");
  });
});
