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

  await page.route('**/api/connectors/github/connection', async (route) => {
    const response = onDisconnect();
    await route.fulfill({
      status: response.status,
      contentType: 'application/json',
      body: JSON.stringify(response.body),
    });
  });

  await page.goto('/');
  await page.getByRole('button', { name: /Configure execution mode|配置执行模式/i }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: /Connectors|连接器/i }).click();
  await expect(dialog.getByTestId('connector-grid-wrap')).toBeVisible();
  await expect(connectorCard(dialog, 'github')).toBeVisible();
  return dialog;
}

test.describe('Settings connectors auth happy path', () => {
  test('shows an inline connector error when connect fails', async ({ page }) => {
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

    await expect(githubCard.getByRole('alert')).toContainText(
      'Composio provider is not configured',
    );
    await expect(githubCard.getByRole('button', { name: 'Connect' })).toBeVisible();
  });

  test('clears the inline error when the user retries and the connector succeeds', async ({ page }) => {
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
    await expect(githubCard.getByRole('alert')).toContainText(
      'Composio provider is not configured',
    );

    await githubCard.getByRole('button', { name: 'Connect' }).click();

    await expect.poll(() => connectAttempts).toBe(2);
    await expect(githubCard.getByRole('button', { name: 'Disconnect' })).toBeVisible();
    await expect(githubCard.getByRole('alert')).toHaveCount(0);
  });

  test('switches from Connect to Disconnect on success, then returns to Connect after a successful disconnect', async ({ page }) => {
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
});
