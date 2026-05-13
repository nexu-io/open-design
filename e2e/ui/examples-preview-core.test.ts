import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

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
  examplePrompt?: string;
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

test.describe('examples preview core flows', () => {
  test('opens a shipped HTML example preview', async ({ page }) => {
    await routeExampleSkills(page, [
      {
        id: 'blog-post',
        name: 'Blog Post',
        description: 'Long-form article example.',
      },
    ]);
    await routeExampleHtml(page, 'blog-post', '<!doctype html><html><body><h1>Blog preview</h1></body></html>');

    await gotoExamples(page);
    await openPreview(page, 'Blog Post');

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(previewFrame(dialog)).toBeVisible();
    await expect(dialog.getByText('Blog Post', { exact: true })).toBeVisible();
  });

  test('opens a derived example card preview', async ({ page }) => {
    await routeExampleSkills(page, [
      {
        id: 'clinical-case-report:example-stemi',
        name: 'Example Stemi',
        description: 'Derived sample preview for the clinical case report skill.',
        scenario: 'healthcare',
      },
    ]);
    await routeExampleHtml(
      page,
      'clinical-case-report:example-stemi',
      '<!doctype html><html><body><article><h1>STEMI case preview</h1></article></body></html>',
    );

    await gotoExamples(page);
    await openPreview(page, 'Example Stemi');

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(previewFrame(dialog)).toBeVisible();
    await expect(dialog.getByText('Example Stemi', { exact: true })).toBeVisible();
  });

  test('shows unavailable state when a skill ships no HTML preview', async ({ page }) => {
    await routeExampleSkills(page, [
      {
        id: 'hyperframes',
        name: 'HyperFrames',
        description: 'HTML video composition skill.',
        previewType: 'markdown',
        hasExamplePreview: false,
        scenario: 'video',
      },
    ]);

    await gotoExamples(page);
    await openPreview(page, 'HyperFrames');

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId('preview-unavailable')).toBeVisible();
  });

  test('shows the unavailable placeholder on the example card for skills without shipped previews', async ({ page }) => {
    await routeExampleSkills(page, [
      {
        id: 'pptx-html-fidelity-audit',
        name: 'PPTX HTML Fidelity Audit',
        description: 'Audit skill without a shipped HTML preview.',
        previewType: 'markdown',
        hasExamplePreview: false,
        scenario: 'engineering',
      },
    ]);

    await gotoExamples(page);

    const card = page.locator('.example-card').filter({ hasText: 'PPTX HTML Fidelity Audit' }).first();
    await expect(card).toBeVisible();
    await expect(card.getByTestId('example-card-unavailable-pptx-html-fidelity-audit')).toBeVisible();
  });

  test('supports retry after a failed HTML preview fetch', async ({ page }) => {
    let attempt = 0;
    await routeExampleSkills(page, [
      {
        id: 'html-ppt',
        name: 'HTML PPT',
        description: 'Presentation template system.',
      },
    ]);
    await page.route('**/api/skills/html-ppt/example', async (route) => {
      attempt += 1;
      // The card fetches once while rendering, then opening the modal triggers
      // the second request. The first manual Retry should therefore become the
      // third request, which is where we flip the fixture to success.
      if (attempt <= 2) {
        await route.fulfill({ status: 404, body: 'not found' });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><html><body><h1>Recovered preview</h1></body></html>',
      });
    });

    await gotoExamples(page);
    await openPreview(page, 'HTML PPT');

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const retryButton = dialog.getByRole('button', { name: /retry/i });
    await expect(retryButton).toBeVisible();
    await retryButton.click();
    await expect(retryButton).toHaveCount(0);
    await expect(previewFrame(dialog)).toBeVisible();
  });

  test('closes the preview modal from the close button and Escape', async ({ page }) => {
    await routeExampleSkills(page, [
      {
        id: 'blog-post',
        name: 'Blog Post',
        description: 'Long-form article example.',
      },
    ]);
    await routeExampleHtml(page, 'blog-post', '<!doctype html><html><body><h1>Closable preview</h1></body></html>');

    await gotoExamples(page);
    await openPreview(page, 'Blog Post');

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: /^close$/i }).click();
    await expect(dialog).toHaveCount(0);

    await openPreview(page, 'Blog Post');
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });

  test('uses the example prompt to create a project and seed the chat composer', async ({ page }) => {
    await routeExampleSkills(page, [
      {
        id: 'waitlist-page',
        name: 'Waitlist Page',
        description: 'Launch waitlist example.',
        examplePrompt: 'Build a clean launch waitlist page with a bold CTA.',
      },
    ]);

    await gotoExamples(page);
    await page.getByTestId('example-use-prompt-waitlist-page').click();

    const project = await fetchCurrentProject(page);
    expect(project.skillId).toBe('waitlist-page');
    await expect(page.getByTestId('chat-composer')).toBeVisible();
    await expect(page.getByTestId('chat-composer-input')).toHaveValue(
      'Build a clean launch waitlist page with a bold CTA.',
    );
  });
});

async function gotoExamples(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('new-project-panel')).toBeVisible();
  await page.getByRole('tab', { name: /^Templates$/i }).click();
}

async function openPreview(page: Page, skillName: string) {
  const card = page.locator('.example-card').filter({ hasText: skillName }).first();
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: /open preview/i }).click();
}

function previewFrame(scope: Page | Locator) {
  return scope.locator('iframe').first();
}

async function routeExampleSkills(page: Page, skills: ExampleSkill[]) {
  await page.route('**/api/design-templates', async (route) => {
    await route.fulfill({
      json: {
        designTemplates: skills.map((skill, index) => ({
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
          examplePrompt: skill.examplePrompt ?? `Use ${skill.name}.`,
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

async function fetchCurrentProject(page: Page) {
  await expect(page).toHaveURL(/\/projects\/[^/]+/);
  const url = new URL(page.url());
  const [, projectId] = url.pathname.match(/\/projects\/([^/]+)/) ?? [];
  expect(projectId).toBeTruthy();

  const response = await page.request.get(`/api/projects/${projectId}`);
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as {
    project: {
      skillId?: string | null;
    };
  };
  return body.project;
}
