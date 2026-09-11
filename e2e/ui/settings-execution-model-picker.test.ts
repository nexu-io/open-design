import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// Regression guard for #4443 / #4547: the Execution-mode CLI card model picker.
//
// #4443 reported the picker reading like an unfinished text input. Capping its
// width to 420px (the first fix attempt) instead made it read as clipped —
// noticeably narrower than the card (#4547 manual QA). It is also a <button>,
// so the global `button:hover` rule applies; that rule sets `background` as a
// shorthand, which wiped the button's chevron (a background-image) on hover,
// leaving the affordance unstable across hover/blur (#4547 QA).
//
// This guards both: the picker fills the card width, and its single chevron
// affordance survives hover.

const STORAGE_KEY = 'open-design:config';
const LOCALE_KEY = 'open-design:locale';
const OPEN_SETTINGS_LABEL = /Open settings|打开设置|開啟設定|Account & settings/i;
const SETTINGS_MENU_LABEL = /Settings|设置|設定/i;
const LOCAL_CLI_LABEL = /Local CLI|本机 CLI|本地 CLI/i;

const AGENT = {
  id: 'codex',
  name: 'Codex CLI',
  bin: 'codex',
  available: true,
  version: '0.130.0',
  models: [
    { id: 'gpt-5', label: 'gpt-5' },
    { id: 'gpt-5-mini', label: 'gpt-5-mini' },
    { id: 'o4', label: 'o4' },
  ],
};

async function openExpandedCliCard(page: Page) {
  await page.setViewportSize({ width: 1680, height: 1050 });
  await page.addInitScript(
    ({ key, value, localeKey, localeValue }) => {
      window.localStorage.setItem(key, JSON.stringify(value));
      window.localStorage.setItem(localeKey, localeValue);
    },
    {
      key: STORAGE_KEY,
      value: {
        mode: 'daemon',
        agentId: 'codex',
        onboardingCompleted: true,
        mediaProviders: {},
        agentModels: {},
        agentCliEnv: {},
      },
      localeKey: LOCALE_KEY,
      localeValue: 'en',
    },
  );
  await page.route('**/api/health', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }),
  );
  await page.route('**/api/app-config', (r) => {
    if (r.request().method() === 'GET') {
      return r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          config: {
            onboardingCompleted: true,
            agentId: 'codex',
            agentCliEnv: {},
            agentModels: {},
            skillId: null,
            designSystemId: null,
            disabledSkills: [],
            disabledDesignSystems: [],
          },
        }),
      });
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });
  await page.route('**/api/agents', (r) => r.fulfill({ json: { agents: [AGENT] } }));

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Loading Open Design…')).toHaveCount(0, { timeout: 15_000 });
  const privacy = page.getByRole('dialog').filter({ hasText: 'Help us improve Open Design' });
  if (await privacy.isVisible().catch(() => false)) {
    await privacy.getByRole('button', { name: /not now/i }).click();
  }

  await page.getByRole('button', { name: OPEN_SETTINGS_LABEL }).first().click();
  const dialog = page.getByRole('dialog');
  const menu = page.getByRole('menu');
  await expect
    .poll(async () => {
      if (await dialog.isVisible().catch(() => false)) return 'dialog';
      if (await menu.isVisible().catch(() => false)) return 'menu';
      return 'pending';
    })
    .not.toBe('pending');
  if (await menu.isVisible().catch(() => false)) {
    await menu.getByRole('menuitem', { name: SETTINGS_MENU_LABEL }).click();
  }
  await expect(dialog).toBeVisible();
  await dialog.getByRole('tab', { name: LOCAL_CLI_LABEL }).click();
  const card = dialog.getByRole('button', { name: /Codex CLI/i });
  await expect(card).toBeVisible();
  await card.click();
  return dialog;
}

test.describe('Settings Execution-mode model picker (#4443 / #4547)', () => {
  test('[P2] fills the card width instead of reading as a clipped 420px control', async ({
    page,
  }) => {
    const dialog = await openExpandedCliCard(page);
    const wrap = dialog.locator('.agent-card-config .agent-model-select-wrap').first();
    await expect(wrap).toBeVisible();

    const { wrapW, contentW } = await wrap.evaluate((el) => {
      const card = el.closest('.agent-card-config') as HTMLElement;
      const cs = getComputedStyle(card);
      const contentW =
        card.getBoundingClientRect().width -
        parseFloat(cs.paddingLeft) -
        parseFloat(cs.paddingRight);
      return { wrapW: el.getBoundingClientRect().width, contentW };
    });

    // The picker should track the card content width (the 420px cap left a
    // ~160px gap on a wide dialog, which QA read as clipped).
    expect(wrapW).toBeGreaterThan(contentW - 2);
    expect(wrapW).toBeGreaterThan(480);
  });

  test('[P2] keeps a single chevron affordance that survives hover', async ({ page }) => {
    const dialog = await openExpandedCliCard(page);
    const btn = dialog
      .locator('.agent-card-config .agent-model-select-wrap .inline-switcher__select')
      .first();
    await expect(btn).toBeVisible();

    const restBg = await btn.evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(restBg).toContain('svg');

    await btn.hover();
    await page.waitForTimeout(150);
    const hoverBg = await btn.evaluate((el) => getComputedStyle(el).backgroundImage);
    // Without the re-asserted background, the global `button:hover` shorthand
    // wipes this to `none` mid-interaction.
    expect(hoverBg).toContain('svg');
  });
});
