import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const STORAGE_KEY = 'open-design:config';

type ExampleSkill = {
  id: string;
  name: string;
  description?: string;
  previewType?: string;
  hasExamplePreview?: boolean;
  scenario?: string;
  mode?: string;
  platform?: string | null;
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript((key) => {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        mode: 'daemon',
        apiKey: '',
        baseUrl: 'https://api.anthropic.com',
        model: 'claude-sonnet-4-5',
        agentId: 'mock',
        skillId: null,
        designSystemId: null,
        onboardingCompleted: true,
        agentModels: {},
      }),
    );
  }, STORAGE_KEY);

  await page.route('**/api/agents', async (route) => {
    await route.fulfill({
      json: {
        agents: [
          {
            id: 'mock',
            name: 'Mock Agent',
            bin: 'mock-agent',
            available: true,
            version: 'test',
            models: [{ id: 'default', label: 'Default' }],
          },
        ],
      },
    });
  });
});

test.describe('examples preview share and fullscreen flows', () => {
  test('opens the share menu for shipped previews and exposes export actions', async ({ page }) => {
    await routeExampleSkills(page, [
      {
        id: 'blog-post',
        name: 'Blog Post',
        description: 'Long-form article example.',
      },
    ]);
    await routeExampleHtml(page, 'blog-post', '<!doctype html><html><body><h1>Shareable preview</h1></body></html>');

    await gotoExamples(page);

    const card = page.locator('.example-card').filter({ hasText: 'Blog Post' }).first();
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: /share/i }).click();

    const menu = card.getByRole('menu');
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: /download as \.zip/i })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: /export as standalone html/i })).toBeVisible();
  });

  test('disables sharing for skills without shipped previews', async ({ page }) => {
    await routeExampleSkills(page, [
      {
        id: 'hyperframes',
        name: 'HyperFrames',
        description: 'HTML video composition skill.',
        previewType: 'html',
        hasExamplePreview: false,
        scenario: 'video',
      },
    ]);

    await gotoExamples(page);

    const card = page.locator('.example-card').filter({ hasText: 'HyperFrames' }).first();
    await expect(card).toBeVisible();
    await expect(card.getByRole('button', { name: /share/i })).toBeDisabled();
  });

  test('shows deck-specific export actions in the example card share menu', async ({ page }) => {
    await routeExampleSkills(page, [
      {
        id: 'weekly-update',
        name: 'Weekly Update',
        description: 'Deck-style example.',
        mode: 'deck',
      },
    ]);
    await routeExampleHtml(page, 'weekly-update', '<!doctype html><html><body><section class="slide">Deck preview</section></body></html>');

    await gotoExamples(page);

    const card = page.locator('.example-card').filter({ hasText: 'Weekly Update' }).first();
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: /share/i }).click();

    const menu = card.getByRole('menu');
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: /export as pdf \(all slides\)/i })).toBeVisible();
    await expect(menu.getByRole('button', { name: /export as pptx/i })).toBeDisabled();
    await expect(menu.getByRole('menuitem', { name: /download as \.zip/i })).toBeVisible();
  });

  test('closes the card share menu on Escape', async ({ page }) => {
    await routeExampleSkills(page, [
      {
        id: 'blog-post',
        name: 'Blog Post',
        description: 'Long-form article example.',
      },
    ]);
    await routeExampleHtml(page, 'blog-post', '<!doctype html><html><body><h1>Closable share menu</h1></body></html>');

    await gotoExamples(page);

    const card = page.locator('.example-card').filter({ hasText: 'Blog Post' }).first();
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: /share/i }).click();

    const menu = card.getByRole('menu');
    await expect(menu).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
  });

  test('enters fullscreen and exits it with Escape without closing the modal', async ({ page }) => {
    await routeExampleSkills(page, [
      {
        id: 'blog-post',
        name: 'Blog Post',
        description: 'Long-form article example.',
      },
    ]);
    await routeExampleHtml(page, 'blog-post', '<!doctype html><html><body><h1>Fullscreen preview</h1></body></html>');

    await gotoExamples(page);
    await openPreview(page, 'Blog Post');

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.locator('button[title=\"Fullscreen\"]').click();
    await expect(page.locator('.ds-modal.ds-modal-fullscreen')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('.ds-modal.ds-modal-fullscreen')).toHaveCount(0);
    await expect(dialog).toBeVisible();
  });

  test('opens the modal share menu and exposes open-in-new-tab', async ({ page }) => {
    await routeExampleSkills(page, [
      {
        id: 'blog-post',
        name: 'Blog Post',
        description: 'Long-form article example.',
      },
    ]);
    await routeExampleHtml(page, 'blog-post', '<!doctype html><html><body><h1>Share menu preview</h1></body></html>');

    await gotoExamples(page);
    await openPreview(page, 'Blog Post');

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: /share/i }).click();
    const menu = dialog.getByRole('menu');
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: /export as pdf/i })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: /download as \.zip/i })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: /export as standalone html/i })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: /open in new tab/i })).toBeVisible();
  });

  test('closes the modal share menu on Escape', async ({ page }) => {
    await routeExampleSkills(page, [
      {
        id: 'blog-post',
        name: 'Blog Post',
        description: 'Long-form article example.',
      },
    ]);
    await routeExampleHtml(page, 'blog-post', '<!doctype html><html><body><h1>Closable modal share</h1></body></html>');

    await gotoExamples(page);
    await openPreview(page, 'Blog Post');

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: /share/i }).click();

    const menu = dialog.getByRole('menu');
    await expect(menu).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(dialog).toBeVisible();
  });
});

async function gotoExamples(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('new-project-panel')).toBeVisible();
  await page.getByRole('tab', { name: /^Examples$/i }).click();
}

async function openPreview(page: Page, skillName: string) {
  const card = page.locator('.example-card').filter({ hasText: skillName }).first();
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: /open preview/i }).click();
}

async function routeExampleSkills(page: Page, skills: ExampleSkill[]) {
  await page.route('**/api/skills', async (route) => {
    await route.fulfill({
      json: {
        skills: skills.map((skill, index) => ({
          id: skill.id,
          name: skill.name,
          description: skill.description ?? `${skill.name} description.`,
          triggers: [],
          mode: skill.mode ?? 'prototype',
          platform: skill.platform ?? 'desktop',
          scenario: skill.scenario ?? 'product',
          previewType: skill.previewType ?? 'html',
          designSystemRequired: false,
          defaultFor: [],
          upstream: null,
          featured: index + 1,
          fidelity: null,
          speakerNotes: null,
          animations: null,
          hasBody: true,
          examplePrompt: `Use ${skill.name}.`,
          hasExamplePreview: skill.hasExamplePreview ?? true,
          aggregatesExamples: false,
        })),
      },
    });
  });
}

async function routeExampleHtml(page: Page, skillId: string, html: string) {
  await page.route(`**/api/skills/${skillId}/example`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: html,
    });
  });
}
