import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { T } from '@/timeouts';

const STORAGE_KEY = 'open-design:config';

test.describe.configure({ timeout: 30_000 });

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
        privacyDecisionAt: 1,
        telemetry: { metrics: false, content: false, artifactManifest: false },
      }),
    );
  }, STORAGE_KEY);

  await page.route('**/api/app-config', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({
      json: {
        config: {
          onboardingCompleted: true,
          agentId: 'mock',
          skillId: null,
          designSystemId: null,
          agentModels: {},
          privacyDecisionAt: 1,
          telemetry: { metrics: false, content: false, artifactManifest: false },
        },
      },
    });
  });
});

test('manual edit inspector previews and persists page and selected element styles', async ({ page }) => {
  await routeMockAgents(page);
  const projectId = await createEmptyProject(page, 'Manual edit smoke');
  await seedHtmlArtifact(page, projectId, 'manual-edit.html', manualEditHtml());
  await page.goto(`/projects/${projectId}/files/manual-edit.html`);
  await openDesignFile(page, 'manual-edit.html');

  await expect(page.getByTestId('artifact-preview-frame')).toBeVisible();
  const frame = page.frameLocator('[data-testid="artifact-preview-frame"]');
  await expect(frame.getByRole('heading', { name: 'Original Hero' })).toBeVisible();
  const responsivePair = frame.locator('[data-od-id="responsive-pair"]');
  await expect.poll(async () => responsivePair.evaluate((el) => getComputedStyle(el).flexDirection)).toBe('row');

  await page.getByTestId('manual-edit-mode-toggle').click();
  await expect.poll(async () => responsivePair.evaluate((el) => getComputedStyle(el).flexDirection)).toBe('row');

  await expect(page.locator('.manual-edit-modal')).toContainText('PAGE');
  await expect(page.locator('.manual-edit-tabs')).toHaveCount(0);
  await expect(page.locator('.manual-edit-layer-row')).toHaveCount(0);

  await inspectorRow(page, 'Background').locator('input').fill('#eef2ff');
  await inspectorRow(page, 'Font').locator('select').selectOption('Georgia, serif');
  await inspectorRow(page, 'Base size').locator('input').fill('18');
  await expect
    .poll(async () => frame.locator('body').evaluate((el) => getComputedStyle(el).backgroundColor))
    .toBe('rgb(238, 242, 255)');
  await expectFileSource(page, projectId, 'manual-edit.html', [
    'background-color:',
    'font-family: Georgia, serif',
    'font-size: 18px',
    'letter-spacing: 0.01em',
  ]);

  await frame.getByRole('heading', { name: 'Original Hero' }).click();
  await expect(page.locator('.manual-edit-modal')).toContainText('TYPOGRAPHY');
  await expect(page.locator('.manual-edit-modal')).toContainText('SIZE');
  await expect(page.locator('.manual-edit-modal')).toContainText('LAYOUT');
  await expect(page.locator('.manual-edit-modal')).toContainText('BOX');
  const selectedTitleMarker = frame.locator('[data-od-id="hero-title"][data-od-edit-selected="true"]');
  await expect(selectedTitleMarker).toHaveCount(1);
  const fontSizeInput = inspectorSection(page, 'TYPOGRAPHY').locator('.cc-row').filter({ hasText: 'Size' }).locator('input');
  await fontSizeInput.click();
  await expect(selectedTitleMarker).toHaveCount(1);
  await expect(fontSizeInput).not.toHaveValue('');
  await expect(fontSizeInput).not.toHaveValue(/px/i);
  await page.getByRole('button', { name: 'Show page inspector' }).click();
  await expect(page.locator('.manual-edit-modal')).toContainText('PAGE');
  await expect(page.locator('.manual-edit-modal')).not.toContainText('TYPOGRAPHY');
  await expect(selectedTitleMarker).toHaveCount(0);
  await frame.getByRole('heading', { name: 'Original Hero' }).click();
  await expect(page.locator('.manual-edit-modal')).toContainText('TYPOGRAPHY');
  await expect(selectedTitleMarker).toHaveCount(1);
  await expect(inspectorSection(page, 'TYPOGRAPHY').locator('.cc-row').filter({ hasText: 'Color' }).locator('input')).toHaveValue(/^#[0-9a-f]{6}$/);
  const lineInput = inspectorSection(page, 'TYPOGRAPHY').locator('.cc-row').filter({ hasText: 'Line' }).locator('input');
  await lineInput.click();
  await lineInput.blur();
  await expect(page.locator('.manual-edit-error')).toHaveCount(0);
  await frame.locator('body').evaluate(() => {
    window.parent.postMessage({ type: 'od-edit-targets', targets: [] }, '*');
  });
  await expect(page.locator('.manual-edit-modal')).toContainText('TYPOGRAPHY');
  await expect(page.locator('.manual-edit-modal')).not.toContainText('PAGE');
  await frame.locator('body').evaluate(() => {
    (window as Window & typeof globalThis & { __manualEditSmokeMarker?: string }).__manualEditSmokeMarker = 'stable-frame';
  });

  await fontSizeInput.fill('48');
  await inspectorSection(page, 'TYPOGRAPHY').locator('.cc-row').filter({ hasText: 'Color' }).locator('input').fill('#ef4444');
  await inspectorSection(page, 'BOX').locator('.cc-row').filter({ hasText: 'Fill' }).locator('input').fill('#f97316');
  const paddingTopInput = inspectorSection(page, 'BOX').locator('.cc-quad').filter({ hasText: 'Padding' }).locator('input').first();
  await paddingTopInput.fill('12');
  await inspectorSection(page, 'BOX').locator('.cc-row').filter({ hasText: 'Radius' }).locator('input').fill('8');
  await expect(fontSizeInput).toHaveValue('48');
  await expect(paddingTopInput).toHaveValue('12');

  const title = frame.getByRole('heading', { name: 'Original Hero' });
  await expect.poll(async () => title.evaluate((el) => getComputedStyle(el).fontSize)).toBe('48px');
  await expect(title).toHaveCSS('color', 'rgb(239, 68, 68)');
  await expect(title).toHaveCSS('background-color', 'rgb(249, 115, 22)');
  await expect(title).toHaveCSS('padding-top', '12px');
  await expect(title).toHaveCSS('border-radius', '8px');
  await expectFileSource(page, projectId, 'manual-edit.html', [
    'font-size: 48px',
    'color:',
    'background-color:',
    'padding-top: 12px',
    'border-radius: 8px',
  ]);
  await expectFileSourceExcludes(page, projectId, 'manual-edit.html', ['data-od-edit-selected']);
  await expect(page.locator('.manual-edit-modal')).toContainText('TYPOGRAPHY');
  await expect(page.locator('.manual-edit-modal')).not.toContainText('PAGE');
  await expect(selectedTitleMarker).toHaveCount(1);
  await expect(page.locator('.manual-edit-error')).toHaveCount(0);
  await expect.poll(async () => frame.locator('body').evaluate(() => (
    window as Window & typeof globalThis & { __manualEditSmokeMarker?: string }
  ).__manualEditSmokeMarker)).toBe('stable-frame');

  await page.getByRole('button', { name: /^Export$/ }).click();
  await expect(page.getByRole('menuitem', { name: /Export as PDF/ })).toBeVisible();
});

test('manual edit mode preserves preview actions after style edits', async ({ page }) => {
  await routeMockAgents(page);
  const projectId = await createEmptyProject(page, 'Manual edit smoke');
  await seedHtmlArtifact(page, projectId, 'manual-edit.html', manualEditHtml());
  await page.goto(`/projects/${projectId}/files/manual-edit.html`);
  await openDesignFile(page, 'manual-edit.html');

  await expect(page.getByTestId('artifact-preview-frame')).toBeVisible();
  const frame = page.frameLocator('[data-testid="artifact-preview-frame"]');
  await expect(frame.getByRole('heading', { name: 'Original Hero' })).toBeVisible();

  await page.getByTestId('manual-edit-mode-toggle').click();
  const fontSizeInput = await selectStyleRowInput(page, frame, '[data-od-id="hero-title"]', 'TYPOGRAPHY', 'Size');
  await fontSizeInput.fill('48');
  await expectFileSource(page, projectId, 'manual-edit.html', ['font-size: 48px']);

  await page.getByTestId('manual-edit-mode-toggle').click();
  await expect(frame.getByRole('heading', { name: 'Original Hero' })).toBeVisible();

  await page.getByTestId('board-mode-toggle').click();
  await expect(page.getByTestId('comment-mode-toggle')).toBeVisible();
  await frame.getByRole('heading', { name: 'Original Hero' }).click();
  await expect(page.getByTestId('comment-popover')).toBeVisible();

  await page.getByRole('button', { name: /^Export$/ }).click();
  await expect(page.getByRole('menuitem', { name: /Export as PDF/ })).toBeVisible();
});

async function selectStyleRowInput(
  page: Page,
  frame: ReturnType<Page['frameLocator']>,
  selector: string,
  section: string,
  label: string,
) {
  await frame.locator(selector).click();
  await expect(page.locator('.manual-edit-modal')).toContainText('TYPOGRAPHY');
  const row = inspectorSection(page, section).locator('.cc-row').filter({ hasText: label }).locator('input');
  await expect(row).toBeVisible();
  return row;
}

test('manual edit mode keeps deck navigation available for deck-shaped HTML', async ({ page }) => {
  await routeMockAgents(page);
  const projectId = await createEmptyProject(page, 'Manual edit deck smoke');
  await seedDeckArtifact(page, projectId, 'manual-deck.html', 'Manual Deck', ['Slide One', 'Slide Two']);
  await page.goto(`/projects/${projectId}/files/manual-deck.html`);
  await openDesignFile(page, 'manual-deck.html');

  const frame = page.frameLocator('[data-testid="artifact-preview-frame"]');
  await expect(frame.getByText('Slide One')).toBeVisible();
  await page.getByLabel('Next slide').click();
  await expect(frame.getByText('Slide Two')).toBeVisible();
});


test('simple deck keeps the active slide stable across preview mode switches', async ({ page }) => {
  await routeMockAgents(page);
  const projectId = await createEmptyProject(page, 'Simple deck navigation state');
  await seedDeckArtifact(page, projectId, 'simple-deck.html', 'Simple Deck', ['Slide One', 'Slide Two', 'Slide Three']);
  await page.goto(`/projects/${projectId}/files/simple-deck.html`);
  await openDesignFile(page, 'simple-deck.html');

  const frame = page.frameLocator('[data-testid="artifact-preview-frame"]');
  const viewModeTabs = page.getByRole('tablist', { name: 'View mode' });

  await expect(frame.getByText('Slide One')).toBeVisible();
  await page.getByLabel('Next slide').click();
  await expect(frame.getByText('Slide Two')).toBeVisible();

  await viewModeTabs.getByRole('tab', { name: 'Code' }).click();
  await expect(page.locator('.viewer-source')).toContainText('Slide Three');
  await viewModeTabs.getByRole('tab', { name: 'Preview' }).click();

  await expect(frame.getByText('Slide Two')).toBeVisible();
  await page.getByLabel('Next slide').click();
  await expect(frame.getByText('Slide Three')).toBeVisible();
});

test('HTML preview stays rendered after switching from Preview to Code and back', async ({ page }) => {
  await routeMockAgents(page);
  const projectId = await createEmptyProject(page, 'HTML preview toggle regression');
  await seedHtmlArtifact(
    page,
    projectId,
    'toggle-preview.html',
    '<!doctype html><html><body><main><h1>Toggle Preview Stable</h1><p>Still visible after tab switches.</p></main></body></html>',
  );
  await page.goto(`/projects/${projectId}`);
  await openDesignFile(page, 'toggle-preview.html');

  const previewFrame = page.getByTestId('artifact-preview-frame');
  await expect(previewFrame).toBeVisible();
  await expect(
    page.frameLocator('[data-testid="artifact-preview-frame"]').getByRole('heading', { name: 'Toggle Preview Stable' }),
  ).toBeVisible();

  const viewModeTabs = page.getByRole('tablist', { name: 'View mode' });
  await viewModeTabs.getByRole('tab', { name: 'Code' }).click();
  await expect(page.locator('.viewer-source')).toContainText('Toggle Preview Stable');

  await viewModeTabs.getByRole('tab', { name: 'Preview' }).click();
  await expect(previewFrame).toBeVisible();
  await expect(
    page.frameLocator('[data-testid="artifact-preview-frame"]').getByRole('heading', { name: 'Toggle Preview Stable' }),
  ).toBeVisible();
  await expect(
    page.frameLocator('[data-testid="artifact-preview-frame"]').getByText('Still visible after tab switches.'),
  ).toBeVisible();
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
  await gotoEntryHome(page);
  await openNewProjectModal(page);
  await page.getByTestId('new-project-name').fill(name);
  await page.getByTestId('create-project').click();
  await waitForLoadingToClear(page);
  await expect(page).toHaveURL(/\/projects\//);
  const current = new URL(page.url());
  const [, projects, projectId] = current.pathname.split('/');
  if (projects !== 'projects' || !projectId) throw new Error(`unexpected project route: ${current.pathname}`);
  return projectId;
}

async function gotoEntryHome(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  const privacyDialog = page.getByRole('dialog').filter({ hasText: 'Help us improve Open Design' });
  if (await privacyDialog.isVisible()) {
    await privacyDialog.getByRole('button', { name: /not now/i }).click();
    await expect(privacyDialog).toHaveCount(0);
  }
  await expect(page.getByTestId('home-hero')).toBeVisible();
  await expect(page.getByTestId('home-hero-input')).toBeVisible();
}

async function openNewProjectModal(page: Page) {
  await page.getByTestId('entry-nav-new-project').click();
  await expect(page.getByTestId('new-project-modal')).toBeVisible();
  await expect(page.getByTestId('new-project-panel')).toBeVisible();
}

async function seedHtmlArtifact(page: Page, projectId: string, fileName: string, content: string) {
  const resp = await page.request.post(
    `/api/projects/${projectId}/files`,
    {
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
      timeout: 15_000,
    },
  );
  expect(resp.ok()).toBeTruthy();
}

async function seedDeckArtifact(
  page: Page,
  projectId: string,
  fileName: string,
  title: string,
  slides: string[],
) {
  const slideHtml = slides
    .map((slide, index) => `<section class="slide" data-od-id="slide-${index + 1}"${index === 0 ? '' : ' hidden'}><h1>${slide}</h1></section>`)
    .join('\n');
  const resp = await page.request.post(
    `/api/projects/${projectId}/files`,
    {
      data: {
        name: fileName,
        content: `<!doctype html><html><body>${slideHtml}</body></html>`,
        artifactManifest: {
          version: 1,
          kind: 'deck',
          title,
          entry: fileName,
          renderer: 'deck-html',
          exports: ['html', 'pptx'],
        },
      },
      timeout: 15_000,
    },
  );
  expect(resp.ok()).toBeTruthy();
}

async function openDesignFile(page: Page, fileName: string) {
  const preview = page.getByTestId('artifact-preview-frame');
  try {
    await preview.waitFor({ state: 'visible', timeout: 5_000 });
    return;
  } catch {
    // Not yet visible; try opening via tab or file list
  }

  const filePattern = new RegExp(fileName.replace(/\./g, '\\.'), 'i');
  const fileTabButton = page
    .locator('.workspace-tab')
    .filter({ hasText: filePattern })
    .locator('.workspace-tab__main')
    .first();
  let tabFound = true;
  try {
    await fileTabButton.waitFor({ state: 'visible', timeout: 2_000 });
  } catch {
    tabFound = false;
  }

  if (tabFound) {
    await fileTabButton.click();
  } else {
    const fileButton = page.getByRole('button', { name: filePattern });
    await fileButton.click();
    await page.getByTestId('design-file-preview').getByRole('button', { name: 'Open' }).click();
  }
  await expect(preview).toBeVisible();
}

async function waitForLoadingToClear(page: Page) {
  await page.getByText('Loading Open Design…').waitFor({ state: 'hidden', timeout: T.medium });
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

async function expectFileSourceExcludes(page: Page, projectId: string, fileName: string, snippets: string[]) {
  await expect
    .poll(async () => {
      const resp = await page.request.get(`/api/projects/${projectId}/files/${fileName}`);
      if (!resp.ok()) return false;
      const source = await resp.text();
      return snippets.every((snippet) => !source.includes(snippet));
    })
    .toBe(true);
}

function inspectorRow(page: Page, label: string) {
  return page.locator('.manual-edit-modal .cc-row').filter({ hasText: label }).first();
}

function inspectorSection(page: Page, title: string) {
  return page.locator('.manual-edit-modal .cc-section').filter({ hasText: title }).first();
}

function manualEditHtml(): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Manual Edit</title>
    <style>
      .responsive-pair { display: flex; gap: 24px; }
      .responsive-pair > div { flex: 1 1 0; min-height: 40px; }
      @media (max-width: 700px) {
        .responsive-pair { flex-direction: column; }
      }
    </style>
  </head>
  <body style="font-family: Inter, system-ui, sans-serif; font-size: 16px; letter-spacing: 0.01em;">
    <main>
      <section data-od-id="responsive-pair" data-od-label="Responsive pair" class="responsive-pair">
        <div data-od-id="pair-a">Left panel</div>
        <div data-od-id="pair-b">Right panel</div>
      </section>
      <section data-od-id="hero" data-od-label="Hero section" style="display:flex;gap:8px;align-items:center;">
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
