import { expect, test } from '@/playwright/suite';
import { T } from '@/timeouts';

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
      model: 'deepseek-chat', agentId: null, skillId: null, designSystemId: null,
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
  await page.getByText('Loading Open Design…').waitFor({ state: 'hidden', timeout: T.medium });
  const privacyDialog = page.getByRole('dialog').filter({ hasText: 'Help us improve Open Design' });
  if (await privacyDialog.isVisible()) {
    await privacyDialog.getByRole('button', { name: /I get it|not now|got it|don't share/i }).click();
  }

  const shortcut = process.platform === 'darwin' ? 'Meta+Comma' : 'Control+Comma';
  await page.keyboard.press(shortcut);
  await expect(page.locator('.modal-backdrop .modal-settings')).toBeVisible({ timeout: T.short });

  // Open the "MCP server" section — Claude Code is the default client, so its
  // `claude mcp add-json` snippet renders without further interaction.
  await page.locator('.settings-nav-item', { hasText: 'MCP server' }).click();

  const code = page.locator('.modal-settings pre code').first();
  await expect(code).toBeVisible({ timeout: T.short });

  const style = await code.evaluate((el: Element) => {
    const cs = getComputedStyle(el);
    return { background: cs.backgroundColor, padding: cs.padding };
  });

  // Transparent (Chromium reports `rgba(0, 0, 0, 0)`) — the inline-code chip
  // background must not leak in. Before the fix this was the light
  // `--bg-subtle` (e.g. `rgb(244, 245, 247)`) with `1px 5px` padding.
  expect(style.background).toBe('rgba(0, 0, 0, 0)');
  expect(style.padding).toBe('0px');
});
