import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const STORAGE_KEY = 'open-design:config';

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
});

test('manual edit mode applies content, style, attribute, HTML, source, undo, and redo patches', async ({ page }) => {
  await routeMockAgents(page);
  const projectId = await createEmptyProject(page, 'Manual edit smoke');
  await seedHtmlArtifact(page, projectId, 'manual-edit.html', manualEditHtml());
  await page.goto(`/projects/${projectId}/files/manual-edit.html`);
  await openDesignFile(page, 'manual-edit.html');

  await expect(page.getByTestId('artifact-preview-frame')).toBeVisible();
  const frame = page.frameLocator('[data-testid="artifact-preview-frame"]');
  await expect(frame.getByRole('heading', { name: 'Original Hero' })).toBeVisible();

  await page.getByTestId('manual-edit-mode-toggle').click();
  await frame.getByRole('heading', { name: 'Original Hero' }).click();
  await expect(page.locator('.manual-edit-modal')).toContainText('Hero title');

  await page.locator('.manual-edit-modal textarea').first().fill('Edited Hero');
  await page.getByRole('button', { name: 'Apply Content' }).click();
  await expect(frame.getByRole('heading', { name: 'Edited Hero' })).toBeVisible();
  await expectFileSource(page, projectId, 'manual-edit.html', ['Edited Hero']);

  await page.locator('.manual-edit-tabs').getByRole('tab', { name: 'Style', exact: true }).click();
  await page.locator('.manual-edit-field').filter({ hasText: 'Font size' }).locator('input').fill('48px');
  await page.getByRole('button', { name: 'Apply Style' }).click();
  await expectFileSource(page, projectId, 'manual-edit.html', ['font-size: 48px']);

  await page.locator('.manual-edit-layer-row').filter({ hasText: 'Primary CTA' }).click();
  await page.locator('.manual-edit-tabs').getByRole('tab', { name: 'Content', exact: true }).click();
  const contentFields = page.locator('.manual-edit-tab-body');
  await contentFields.locator('textarea').fill('Launch now');
  await contentFields.locator('input').fill('/launch');
  await page.getByRole('button', { name: 'Apply Content' }).click();
  await expect(frame.getByRole('link', { name: 'Launch now' })).toHaveAttribute('href', /\/launch$/);

  await page.locator('.manual-edit-layer-row').filter({ hasText: 'Hero image' }).click();
  await contentFields.locator('input').first().fill('/edited.png');
  await contentFields.locator('input').nth(1).fill('Edited alt');
  await page.getByRole('button', { name: 'Apply Content' }).click();
  await expectFileSource(page, projectId, 'manual-edit.html', ['/edited.png', 'Edited alt']);

  await page.locator('.manual-edit-layer-row').filter({ hasText: 'Hero title' }).click();
  await page.locator('.manual-edit-tabs').getByRole('tab', { name: 'Attributes', exact: true }).click();
  await page.locator('.manual-edit-tab-body textarea').fill('{"aria-label":"Edited headline"}');
  await page.getByRole('button', { name: 'Apply Attributes' }).click();
  await expectFileSource(page, projectId, 'manual-edit.html', ['aria-label="Edited headline"', 'font-size: 48px']);

  await page.locator('.manual-edit-tabs').getByRole('tab', { name: 'Html', exact: true }).click();
  await page.locator('.manual-edit-tab-body textarea').fill('<h1 class="replacement">HTML Hero</h1>');
  await page.getByRole('button', { name: 'Apply HTML' }).click();
  await expectFileSource(page, projectId, 'manual-edit.html', ['data-od-id="hero-title"', 'HTML Hero']);

  await page.locator('.manual-edit-tabs').getByRole('tab', { name: 'Source', exact: true }).click();
  await page.locator('.manual-edit-tab-body textarea').fill(manualEditHtml().replace('Original Hero', 'Full Source Hero'));
  await page.getByRole('button', { name: 'Apply Source' }).click();
  await expect(frame.getByRole('heading', { name: 'Full Source Hero' })).toBeVisible();

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(frame.getByRole('heading', { name: 'HTML Hero' })).toBeVisible();
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(frame.getByRole('heading', { name: 'Full Source Hero' })).toBeVisible();

  await page.getByRole('button', { name: /Tweaks/ }).click();
  await expect(page.getByTestId('comment-mode-toggle')).toBeVisible();
  await frame.getByRole('heading', { name: 'Full Source Hero' }).click();
  await expect(page.getByTestId('comment-popover')).toBeVisible();

  await page.getByRole('button', { name: /^Share$/ }).click();
  await expect(page.getByRole('menuitem', { name: /Export as PDF/ })).toBeVisible();
});

test('manual edit mode keeps deck navigation available for deck-shaped HTML', async ({ page }) => {
  await routeMockAgents(page);
  const projectId = await createEmptyProject(page, 'Manual edit deck smoke');
  await seedHtmlArtifact(page, projectId, 'manual-deck.html', deckHtml());
  await page.goto(`/projects/${projectId}/files/manual-deck.html`);
  await openDesignFile(page, 'manual-deck.html');

  const frame = page.frameLocator('[data-testid="artifact-preview-frame"]');
  await expect(frame.getByText('Slide One')).toBeVisible();
  await page.getByLabel('Next slide').click();
  await expect(frame.getByText('Slide Two')).toBeVisible();
});

async function routeMockAgents(page: Page) {
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
}

async function createEmptyProject(page: Page, name: string): Promise<string> {
  await page.goto('/');
  await expect(page.getByTestId('new-project-panel')).toBeVisible();
  await page.getByTestId('new-project-name').fill(name);
  await page.getByTestId('create-project').click();
  await expect(page).toHaveURL(/\/projects\//);
  const current = new URL(page.url());
  const [, projects, projectId] = current.pathname.split('/');
  if (projects !== 'projects' || !projectId) throw new Error(`unexpected project route: ${current.pathname}`);
  return projectId;
}

async function seedHtmlArtifact(page: Page, projectId: string, fileName: string, content: string) {
  const resp = await page.request.post(`/api/projects/${projectId}/files`, {
    data: {
      name: fileName,
      content,
      artifactManifest: {
        version: 1,
        kind: 'html',
        title: fileName,
        entry: fileName,
        renderer: 'html',
        exports: ['html'],
      },
    },
  });
  expect(resp.ok()).toBeTruthy();
}

async function openDesignFile(page: Page, fileName: string) {
  await page.getByRole('button', { name: new RegExp(fileName.replace('.', '\\.')) }).click();
  await page.getByTestId('design-file-preview').getByRole('button', { name: 'Open' }).click();
}

async function expectFileSource(page: Page, projectId: string, fileName: string, snippets: string[]) {
  await expect
    .poll(async () => {
      const resp = await page.request.get(`/api/projects/${projectId}/files/${fileName}`);
      if (!resp.ok()) return false;
      const source = await resp.text();
      return snippets.every((snippet) => source.includes(snippet));
    })
    .toBe(true);
}

function manualEditHtml(): string {
  return `<!doctype html>
<html>
  <head><meta charset="utf-8"><title>Manual Edit</title></head>
  <body>
    <main>
      <section data-od-id="hero" data-od-label="Hero section">
        <h1 data-od-id="hero-title" data-od-label="Hero title">Original Hero</h1>
        <a data-od-id="cta" data-od-label="Primary CTA" href="/start">Start now</a>
        <img data-od-id="hero-image" data-od-label="Hero image" src="/hero.png" alt="Hero" style="width:64px;height:64px;">
      </section>
    </main>
  </body>
</html>`;
}

function deckHtml(): string {
  return `<!doctype html>
<html>
  <body>
    <section class="slide" data-od-id="slide-1"><h1>Slide One</h1></section>
    <section class="slide" data-od-id="slide-2" hidden><h1>Slide Two</h1></section>
    <script>
      let active = 0;
      const slides = Array.from(document.querySelectorAll('.slide'));
      function render() { slides.forEach((slide, index) => { slide.hidden = index !== active; }); }
      window.addEventListener('message', (event) => {
        if (!event.data || event.data.type !== 'od:slide') return;
        if (event.data.action === 'next') active = Math.min(slides.length - 1, active + 1);
        if (event.data.action === 'prev') active = Math.max(0, active - 1);
        render();
        window.parent.postMessage({ type: 'od:slide-state', active, count: slides.length }, '*');
      });
      render();
      window.parent.postMessage({ type: 'od:slide-state', active, count: slides.length }, '*');
    </script>
  </body>
</html>`;
}
