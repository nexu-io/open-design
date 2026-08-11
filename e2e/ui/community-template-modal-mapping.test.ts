// Entry → template-detail-modal mapping (飞书 recvqxDuYM6Uxk).
//
// Two template detail surfaces exist and each belongs to one entry point:
//   • the Community gallery card opens the FULL plugin details modal
//     (Use split action + Share menu + close);
//   • the creation page's active template chip opens the LIGHTWEIGHT
//     community preview (header title/category + close, footer category +
//     Remix).
// Before the swap the two entries were reversed. These specs pin the
// corrected mapping end-to-end through the real entry shell.

import { expect, test } from '@/playwright/suite';
import type { Page } from '@playwright/test';
import { applyStandardMocks } from '@/playwright/mock-factory';
import { ensureRailOpen } from '@/playwright/rail';
import { T } from '@/timeouts';

const DECK_PLUGIN = {
  id: 'mapping-fundraising-deck',
  title: 'Mapping Fundraising Deck',
  version: '1.0.0',
  trust: 'trusted',
  sourceKind: 'bundled',
  source: '/tmp/mapping-fundraising-deck',
  capabilitiesGranted: ['prompt:inject'],
  fsPath: '/tmp/mapping-fundraising-deck',
  installedAt: 0,
  updatedAt: 0,
  manifest: {
    name: 'mapping-fundraising-deck',
    title: 'Mapping Fundraising Deck',
    version: '1.0.0',
    description: 'A decision-grade seed round narrative.',
    tags: ['deck'],
    od: {
      kind: 'scenario',
      taskKind: 'new-generation',
      mode: 'deck',
      category: 'fundraising-pitch',
      preview: { type: 'html', entry: './example.html' },
      useCase: { query: { en: 'Create a seed round pitch deck.' } },
    },
  },
} as const;

function makeApplyResult(pluginId: string) {
  return {
    ok: true,
    query: 'Create a seed round pitch deck.',
    contextItems: [],
    inputs: [],
    assets: [],
    mcpServers: [],
    trust: 'trusted',
    capabilitiesGranted: ['prompt:inject'],
    capabilitiesRequired: ['prompt:inject'],
    appliedPlugin: {
      snapshotId: `snap-${pluginId}`,
      pluginId,
      pluginVersion: '1.0.0',
      manifestSourceDigest: 'a'.repeat(64),
      inputs: {},
      resolvedContext: { items: [] },
      capabilitiesGranted: ['prompt:inject'],
      capabilitiesRequired: ['prompt:inject'],
      assetsStaged: [],
      taskKind: 'new-generation',
      appliedAt: 0,
      connectorsRequired: [],
      connectorsResolved: [],
      mcpServers: [],
      status: 'fresh',
    },
    projectMetadata: {},
  };
}

async function routeMappingFixtures(page: Page) {
  await page.route('**/api/plugins', async (route) => {
    await route.fulfill({ json: { plugins: [DECK_PLUGIN] } });
  });
  await page.route(`**/api/plugins/${DECK_PLUGIN.id}/preview`, async (route) => {
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/html' },
      body: '<!doctype html><html><body><h1>Deck preview</h1></body></html>',
    });
  });
  await page.route(`**/api/plugins/${DECK_PLUGIN.id}/apply`, async (route) => {
    await route.fulfill({ json: makeApplyResult(DECK_PLUGIN.id) });
  });
}

async function gotoCommunity(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByText('Loading Open Design…').waitFor({ state: 'hidden', timeout: T.long });
  const privacyDialog = page.getByRole('dialog').filter({ hasText: 'Help us improve Open Design' });
  if (await privacyDialog.isVisible().catch(() => false)) {
    await privacyDialog.getByRole('button', { name: /I get it|not now|got it|don't share/i }).click();
    await expect(privacyDialog).toHaveCount(0);
  }
  await ensureRailOpen(page);
  await page.getByTestId('entry-nav-community').click();
  await expect(page).toHaveURL(/\/community$/);
  await expect(page.locator('article.community-template-card').first()).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await applyStandardMocks(page);
  await routeMappingFixtures(page);
});

test('[P1] community template card opens the full details modal (Use split + Share), not the lightweight preview', async ({ page }) => {
  await gotoCommunity(page);

  await page.locator('article.community-template-card').first().click();

  // Full modal chrome: Use split action (main face + caret), Share menu,
  // and the ds-modal shell — the lightweight footer-Remix preview must not
  // be what this card opens.
  await expect(page.getByTestId(`plugin-details-use-${DECK_PLUGIN.id}`)).toBeVisible();
  await expect(page.getByTestId(`plugin-details-use-${DECK_PLUGIN.id}-menu`)).toBeVisible();
  await expect(page.locator('.template-share-trigger')).toBeVisible();
  await expect(page.locator('.community-template-preview')).toHaveCount(0);

  // The split dropdown actually operates: it offers the prompt-loading Use,
  // the structure-only Use, and the community Remix mapping.
  await page.getByTestId(`plugin-details-use-${DECK_PLUGIN.id}-menu`).click();
  await expect(page.getByTestId(`plugin-details-use-with-query-${DECK_PLUGIN.id}`)).toBeVisible();
  await expect(page.getByTestId(`plugin-details-use-option-${DECK_PLUGIN.id}`)).toBeVisible();
  await expect(page.getByTestId(`plugin-details-duplicate-${DECK_PLUGIN.id}`)).toBeVisible();
  await page.keyboard.press('Escape');
});

test('[P1] community Use hands into Home and the active template chip opens the lightweight preview', async ({ page }) => {
  await gotoCommunity(page);

  // Use from the community card's full modal routes the plugin as the Home
  // composer's active driver (EntryShell onUsePlugin hand-off).
  await page.locator('article.community-template-card').first().click();
  await page.getByTestId(`plugin-details-use-${DECK_PLUGIN.id}`).click();
  await expect(page.getByTestId('home-hero-active-plugin')).toBeVisible();

  // The chip's detail entry opens the LIGHTWEIGHT preview: footer category +
  // Remix, no Use split action, no Share menu.
  await page.getByTestId('home-hero-active-plugin').locator('.home-hero__active-chip-body').click();
  await expect(page.locator('.community-template-preview')).toBeVisible();
  const foot = page.locator('.community-template-preview__foot');
  await expect(foot).toContainText('Remix');
  await expect(page.getByTestId(`plugin-details-use-${DECK_PLUGIN.id}`)).toHaveCount(0);
  await expect(page.locator('.template-share-trigger')).toHaveCount(0);

  // Close chrome works and returns to the composer untouched.
  await page.getByRole('button', { name: 'Close preview' }).click();
  await expect(page.locator('.community-template-preview')).toHaveCount(0);
  await expect(page.getByTestId('home-hero-active-plugin')).toBeVisible();
});
