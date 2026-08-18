import { expect, test } from '@/playwright/suite';
import { T } from '@/timeouts';
import { openSettingsDialog } from '../lib/playwright/amr.js';

// Regression for #4509: the MCP server setup snippet renders inside a dark
// `<pre><code>` block, but the inner `<code>` used to inherit the global
// inline-`code` chip style (light background + padding + rounded corners). On
// a wrapped `claude mcp add-json` one-liner that painted a light rounded
// rectangle behind every wrapped segment — reading as permanent selection
// highlights. The inner `<code>` must stay transparent.

const STORAGE_KEY = 'open-design:config';

test.beforeEach(async ({ page }) => {
  await page.addInitScript((key) => {
    window.localStorage.setItem(key, JSON.stringify({
      mode: 'api', apiProtocol: 'openai', apiKey: 'sk-test', baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash', agentId: null, skillId: null, designSystemId: null,
      onboardingCompleted: true, agentModels: {}, privacyDecisionAt: 1,
      telemetry: { metrics: false, content: false, artifactManifest: false },
    }));
  }, STORAGE_KEY);
  await page.route('**/api/app-config', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    await route.fulfill({ json: { config: { onboardingCompleted: true, agentId: null, skillId: null, designSystemId: null, agentModels: {}, privacyDecisionAt: 1, telemetry: { metrics: false, content: false, artifactManifest: false } } } });
  });
});

test('[P1] MCP server snippet code stays transparent, not the inline-code chip (#4509)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const settings = await openSettingsDialog(page);
  await settings.getByRole('button', { name: /^MCP server\b/ }).click();

  const code = settings.locator('pre code').filter({ hasText: 'claude mcp add-json' });
  await expect(code).toBeVisible({ timeout: T.short });

  const style = await code.evaluate((element) => {
    const computed = getComputedStyle(element);
    return { background: computed.backgroundColor, padding: computed.padding };
  });

  // Transparent (Chromium reports `rgba(0, 0, 0, 0)`) — the inline-code chip
  // background must not leak in. Before the fix this was the light
  // `--bg-subtle` (e.g. `rgb(244, 245, 247)`) with `1px 5px` padding.
  expect(style.background).toBe('rgba(0, 0, 0, 0)');
  expect(style.padding).toBe('0px');
});

test('[P1] MCP OAuth connect callback updates status and supports disconnect', async ({ page }) => {
  let connected = false;
  let startRequests = 0;
  let disconnectRequests = 0;

  await page.addInitScript(() => {
    const opened: string[] = [];
    (window as Window & { __openedMcpAuthUrls?: string[] }).__openedMcpAuthUrls = opened;
    window.open = ((url?: string | URL) => {
      if (typeof url === 'string') opened.push(url);
      return null;
    }) as typeof window.open;
  });
  await page.route('**/api/mcp/servers', async (route) => {
    if (route.request().method() === 'PUT') {
      await route.fulfill({
        json: {
          servers: [
            {
              id: 'oauth-server',
              label: 'OAuth Server',
              transport: 'http',
              enabled: true,
              authMode: 'oauth',
              url: 'https://mcp.example.com/mcp',
            },
          ],
          templates: [],
        },
      });
      return;
    }
    await route.fulfill({
      json: {
        servers: [
          {
            id: 'oauth-server',
            label: 'OAuth Server',
            transport: 'http',
            enabled: true,
            authMode: 'oauth',
            url: 'https://mcp.example.com/mcp',
          },
        ],
        templates: [],
      },
    });
  });
  await page.route('**/api/mcp/oauth/status?serverId=oauth-server', async (route) => {
    await route.fulfill({ json: { connected } });
  });
  await page.route('**/api/mcp/oauth/start', async (route) => {
    startRequests += 1;
    await route.fulfill({
      json: {
        authorizeUrl: 'https://provider.example.com/authorize?state=e2e-state',
        state: 'e2e-state',
        redirectUri: 'http://127.0.0.1:62124/api/mcp/oauth/callback',
      },
    });
  });
  await page.route('**/api/mcp/oauth/disconnect', async (route) => {
    disconnectRequests += 1;
    connected = false;
    await route.fulfill({ json: { ok: true } });
  });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByText('Loading Open Design…').waitFor({ state: 'hidden', timeout: T.medium });
  const privacyDialog = page.getByRole('dialog').filter({ hasText: 'Help us improve Open Design' });
  if (await privacyDialog.isVisible()) {
    await privacyDialog.getByRole('button', { name: /I get it|not now|got it|don't share/i }).click();
  }

  await page.goto('/integrations', { waitUntil: 'domcontentloaded' });
  const integrations = page.locator('.integrations-view');
  await expect(integrations).toBeVisible({ timeout: T.medium });
  await integrations.getByTestId('integrations-tab-mcp').click();

  const row = integrations.locator('.mcp-row', { hasText: 'OAuth Server' });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Expand this MCP server' }).click();
  const oauth = page.locator('.mcp-oauth-control').first();
  await expect(oauth).toContainText('Not connected.');

  await oauth.getByRole('button', { name: 'Connect' }).click();
  await expect.poll(() => startRequests).toBe(1);
  await expect(oauth).toContainText('Waiting for authorization');
  await expect
    .poll(() => page.evaluate(() => (window as Window & { __openedMcpAuthUrls?: string[] }).__openedMcpAuthUrls ?? []))
    .toContain('https://provider.example.com/authorize?state=e2e-state');

  connected = true;
  await page.evaluate(() => {
    window.postMessage({ type: 'mcp-oauth', ok: true, serverId: 'oauth-server' }, '*');
  });
  await expect(oauth).toContainText('Connected.');
  await expect(oauth.getByRole('button', { name: 'Disconnect' })).toBeVisible();

  await oauth.getByRole('button', { name: 'Disconnect' }).click();
  await expect.poll(() => disconnectRequests).toBe(1);
  await expect(oauth).toContainText('Not connected.');
});
