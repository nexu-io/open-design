import { expect, test } from '@/playwright/suite';
import { ACTIVE_ARTIFACT_PREVIEW_SELECTOR } from '@/playwright/artifact-preview';
import { expectStableCount } from '@/playwright/assertions';
import { applyStandardMocks, routeAgents, routeSuccessfulRuns } from '@/playwright/mock-factory';
import { clickDeckNextSlide, openAllProjectFiles } from '@/playwright/workspace';
import type { Page } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { T } from '@/timeouts';

const STORAGE_KEY = 'open-design:config';
test.describe.configure({ timeout: T.xlong });

function artifactPreview(page: Page) {
  return page.locator(ACTIVE_ARTIFACT_PREVIEW_SELECTOR).first();
}

function artifactPreviewFrame(page: Page) {
  return page.frameLocator(ACTIVE_ARTIFACT_PREVIEW_SELECTOR);
}

test.beforeEach(async ({ page }) => {
  await applyStandardMocks(page);
});

test('[P0] manual edit inspector previews and persists page and selected element styles', async ({ page }) => {
  await routeMockAgents(page);
  const projectId = await createEmptyProject(page, 'Manual edit smoke');
  await seedHtmlArtifact(page, projectId, 'manual-edit.html', manualEditHtml());
  await page.goto(`/projects/${projectId}/files/manual-edit.html`);
  await openDesignFile(page, 'manual-edit.html');

  await expect(artifactPreview(page)).toBeVisible();
  const frame = artifactPreviewFrame(page);
  await expect(frame.getByRole('heading', { name: 'Original Hero' })).toBeVisible();
  await expect.poll(() => previewCss(page, '[data-od-id="responsive-pair"]', 'flexDirection')).toBe('row');

  await page.getByTestId('manual-edit-mode-toggle').click();
  await expect(frame.locator('html[data-od-edit-mode]')).toHaveCount(1);
  await expect.poll(() => previewCss(page, '[data-od-id="responsive-pair"]', 'flexDirection')).toBe('row');

  await frame.locator('body').evaluate(() => {
    window.parent.postMessage({ type: 'od-edit-background' }, '*');
  });
  await expect(page.locator('.manual-edit-modal')).toContainText('PAGE');
  await expect(page.locator('.manual-edit-tabs')).toHaveCount(0);
  await expect(page.locator('.manual-edit-layer-row')).toHaveCount(0);

  await inspectorRow(page, 'Background').locator('input').fill('#eef2ff');
  await inspectorRow(page, 'Font').locator('select').selectOption('Georgia, serif');
  await inspectorRow(page, 'Base size').locator('input').fill('18');
  await expect(inspectorRow(page, 'Background').locator('input:not([type="color"])')).toHaveValue('#eef2ff');
  await expect(inspectorRow(page, 'Font').locator('select')).toHaveValue('Georgia, serif');
  await expect(inspectorRow(page, 'Base size').locator('input')).toHaveValue('18');

  await selectPreviewElementThroughBridge(page, frame, '[data-od-id="hero-title"]', 'Parameters');
  const selectedTitleMarker = frame.locator('[data-od-id="hero-title"][data-od-edit-selected="true"]');
  await expect(selectedTitleMarker).toHaveCount(1);
  const parameters = inspectorSection(page, 'Parameters');
  const fontSizeInput = parameters.locator('.cc-row').filter({ hasText: 'Font size' }).locator('input');
  await fontSizeInput.click();
  await expect(selectedTitleMarker).toHaveCount(1);
  await expect(fontSizeInput).not.toHaveValue('');
  await expect(fontSizeInput).not.toHaveValue(/px/i);
  await expect(parameters.locator('.cc-row').filter({ hasText: 'Text color' }).locator('input:not([type="color"])')).toHaveValue(/^#[0-9a-f]{6}$/);
  const lineInput = parameters.locator('.cc-row').filter({ hasText: 'Line height' }).locator('input');
  await lineInput.click();
  await lineInput.blur();
  await expect(page.locator('.manual-edit-error')).toHaveCount(0);
  await frame.locator('body').evaluate(() => {
    window.parent.postMessage({ type: 'od-edit-targets', targets: [] }, '*');
  });
  await expect(page.locator('.manual-edit-modal')).toContainText('Parameters');
  await expect(page.locator('.manual-edit-modal')).not.toContainText('PAGE');
  await frame.locator('body').evaluate(() => {
    (window as Window & typeof globalThis & { __manualEditSmokeMarker?: string }).__manualEditSmokeMarker = 'stable-frame';
  });

  await fontSizeInput.fill('48');
  await parameters.locator('.cc-row').filter({ hasText: 'Text color' }).locator('input:not([type="color"])').fill('#ef4444');
  await expect(fontSizeInput).toHaveValue('48');

  const title = frame.getByRole('heading', { name: 'Original Hero' });
  await expect.poll(async () => title.evaluate((el) => getComputedStyle(el).fontSize)).toBe('48px');
  await expect(title).toHaveCSS('color', 'rgb(239, 68, 68)');
  await inspectSaveButton(page).click({ force: true });
  await expectFileSource(page, projectId, 'manual-edit.html', [
    'font-size: 48px',
    'color:',
  ]);
  await expectFileSourceExcludes(page, projectId, 'manual-edit.html', ['data-od-edit-selected']);
  await expect(page.locator('.manual-edit-error')).toHaveCount(0);

  await page.getByTestId('manual-edit-mode-toggle').click();
  await expect(frame.getByRole('heading', { name: 'Original Hero' })).toBeVisible();
  const viewMode = page.getByRole('tablist', { name: 'View mode' });
  await expect(viewMode).toBeVisible();
  await expect(viewMode.getByRole('tab', { name: 'Preview', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(viewMode.getByRole('tab', { name: 'Code', exact: true })).toBeVisible();
  await expect(artifactPreview(page)).toBeVisible();

  await page.getByTestId('board-mode-toggle').click();
  await expect(page.getByRole('button', { name: /^Comment$/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Share$/ })).toBeVisible();
  const actionMenu = await openShareExportMenu(page);
  await expect(actionMenu.getByRole('menuitem', { name: /Export as PDF/i })).toBeVisible();
});

test('[P0] manual edit mode preserves the current page in a multi-page mobile app', async ({ page }) => {
  await routeMockAgents(page);
  const projectId = await createEmptyProject(page, 'Multi-page mobile edit');
  await seedHtmlArtifact(page, projectId, 'mobile-app.html', multiPageMobileHtml());
  await page.goto(`/projects/${projectId}/files/mobile-app.html`);
  await openDesignFile(page, 'mobile-app.html');

  const preview = artifactPreviewFrame(page);
  await expect(preview.getByTestId('mobile-page-home')).toBeVisible();

  await page.getByRole('tab', { name: 'Code', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Code', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'Preview', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Preview', exact: true })).toHaveAttribute('aria-selected', 'true');
  const prewarmedSrcDoc = page.frameLocator('iframe[data-testid="artifact-preview-frame-srcdoc"]');
  await expect(prewarmedSrcDoc.getByTestId('mobile-page-home')).toBeAttached();
  await waitForUrlPreviewRefreshToSettle(page);

  await preview.getByRole('button', { name: 'Profile' }).click();
  await expect(preview.getByTestId('mobile-page-profile')).toBeVisible();
  await expect(preview.getByTestId('mobile-page-home')).toBeHidden();

  await page.getByTestId('manual-edit-mode-toggle').click();

  await expect(page.getByTestId('manual-edit-mode-toggle')).toHaveAttribute('aria-pressed', 'true');
  await expect(preview.getByTestId('mobile-page-profile')).toBeVisible();
  await expect(preview.getByTestId('mobile-page-home')).toBeHidden();

  await page.getByTestId('manual-edit-mode-toggle').click();
  await expect(page.getByTestId('manual-edit-mode-toggle')).toHaveAttribute('aria-pressed', 'false');
  await expect(preview.locator('html[data-od-edit-mode]')).toHaveCount(0);
  await expect(preview.getByTestId('mobile-page-profile')).toBeVisible();
  await preview.getByRole('button', { name: 'Home' }).click();
  await expect(preview.getByTestId('mobile-page-home')).toBeVisible();
  await expect(preview.getByTestId('mobile-page-profile')).toBeHidden();

  await page.getByTestId('manual-edit-mode-toggle').click();
  await expect(page.getByTestId('manual-edit-mode-toggle')).toHaveAttribute('aria-pressed', 'true');
  await preview.locator('[data-od-id="mobile-page-home"]').evaluate((element) => {
    element.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      view: window,
    }));
  });

  const selectedHtml = page.locator('.manual-edit-modal label')
    .filter({ hasText: 'Selected element HTML' })
    .locator('textarea');
  await expect(selectedHtml).toBeVisible();
  const currentHtml = await selectedHtml.inputValue();
  const editedHtml = currentHtml.replace(
    'data-page="home"',
    'data-page="home" data-edit-revision="fresh"',
  );
  expect(editedHtml).not.toBe(currentHtml);
  await selectedHtml.fill(editedHtml);
  await inspectSaveButton(page).click();

  // Saving rebuilds the srcDoc transport. The consumed Profile snapshot must
  // not replay over the newer Home navigation when that later load completes.
  await expectFileSource(page, projectId, 'mobile-app.html', ['data-edit-revision="fresh"']);
  await expect(preview.locator('[data-edit-revision="fresh"]')).toBeVisible();
  await expect(preview.getByTestId('mobile-page-home')).toBeVisible();
  await expect(preview.getByTestId('mobile-page-profile')).toBeHidden();
});

test('[P0] manual edit mode preserves a runtime-rendered mobile app page', async ({ page }) => {
  await routeMockAgents(page);
  const projectId = await createEmptyProject(page, 'Runtime-rendered mobile edit');
  await seedHtmlArtifact(page, projectId, 'mobile-app.html', runtimeRenderedMobileHtml());
  await page.goto(`/projects/${projectId}/files/mobile-app.html`);
  await openDesignFile(page, 'mobile-app.html');

  const preview = artifactPreviewFrame(page);
  await expect(preview.getByTestId('mobile-page-today')).toBeVisible();
  await page.getByRole('tab', { name: 'Code', exact: true }).click();
  await page.getByRole('tab', { name: 'Preview', exact: true }).click();
  await expect(page.frameLocator('iframe[data-testid="artifact-preview-frame-srcdoc"]')
    .getByTestId('mobile-page-today')).toBeAttached();
  await waitForUrlPreviewRefreshToSettle(page);

  await preview.getByRole('button', { name: 'Profile' }).click();
  await expect(preview.getByTestId('mobile-page-profile')).toBeVisible();
  await expect(preview.getByRole('heading', { name: 'Profile page' })).toBeVisible();
  await expect(preview.getByTestId('mobile-page-today')).toHaveCount(0);

  await page.getByTestId('manual-edit-mode-toggle').click();

  await expect(page.getByTestId('manual-edit-mode-toggle')).toHaveAttribute('aria-pressed', 'true');
  await expect(preview.getByTestId('mobile-page-profile')).toBeVisible();
  await expect(preview.getByRole('heading', { name: 'Profile page' })).toBeVisible();
  await expect(preview.getByRole('heading', { name: 'Today page' })).toHaveCount(0);
  await expect(preview.getByTestId('mobile-page-today')).toHaveCount(0);
  await preview.locator('[data-od-id="profile-screen"]').hover();
  await expect(preview.locator('[data-od-edit-guides-layer]')).toHaveCount(1);
  await expect(preview.locator('[data-od-edit-guides-layer] > *')).not.toHaveCount(0);
  await selectPreviewElementThroughBridge(
    page,
    preview,
    '[data-od-id="profile-screen"]',
    'CONTENT',
  );

  await page.getByTestId('manual-edit-mode-toggle').click();
  await expect(page.getByTestId('manual-edit-mode-toggle')).toHaveAttribute('aria-pressed', 'false');
  await expect(preview.locator('html[data-od-edit-mode]')).toHaveCount(0);
  await preview.getByRole('button', { name: 'Today' }).click();
  await expect(preview.getByTestId('mobile-page-today')).toBeVisible();
  await expect(preview.getByTestId('mobile-page-profile')).toHaveCount(0);

  await page.getByTestId('manual-edit-mode-toggle').click();
  await expect(page.getByTestId('manual-edit-mode-toggle')).toHaveAttribute('aria-pressed', 'true');
  await expect(preview.getByTestId('mobile-page-today')).toBeVisible();
  await expect(preview.getByTestId('mobile-page-profile')).toHaveCount(0);
  await preview.locator('[data-od-id="today-screen"]').hover();
  await expect(preview.locator('[data-od-edit-guides-layer] > *')).not.toHaveCount(0);
});

test('[P0] srcDoc page navigation keeps manual edit hover guides across files and re-entry', async ({ page }) => {
  await routeMockAgents(page);
  const projectId = await createEmptyProject(page, 'Cross-file mobile edit');
  await seedHtmlArtifact(
    page,
    projectId,
    'today.html',
    linkedMobilePageHtml('Today page', 'today-screen', 'profile.html', 'Profile'),
  );
  await seedHtmlArtifact(
    page,
    projectId,
    'profile.html',
    linkedMobilePageHtml('Profile page', 'profile-screen', 'today.html', 'Today'),
  );
  await page.goto(`/projects/${projectId}/files/today.html`);
  await openDesignFile(page, 'today.html');

  const preview = artifactPreviewFrame(page);
  await expect(preview.getByRole('heading', { name: 'Today page' })).toBeVisible();
  await page.getByTestId('manual-edit-mode-toggle').click();
  await expect(page.getByTestId('manual-edit-mode-toggle')).toHaveAttribute('aria-pressed', 'true');
  await preview.locator('[data-od-id="today-screen"]').hover();
  await expect(preview.locator('[data-od-edit-guides-layer] > *')).not.toHaveCount(0);

  await page.getByTestId('manual-edit-mode-toggle').click();
  await expect(page.getByTestId('manual-edit-mode-toggle')).toHaveAttribute('aria-pressed', 'false');
  await expect(preview.locator('html[data-od-edit-mode]')).toHaveCount(0);
  await preview.getByRole('link', { name: 'Profile' }).click();

  await expect(tabBySuffix(page, 'profile.html')).toHaveAttribute('aria-selected', 'true');
  await expect(preview.getByRole('heading', { name: 'Profile page' })).toBeVisible();
  await page.getByTestId('manual-edit-mode-toggle').click();
  await expect(page.getByTestId('manual-edit-mode-toggle')).toHaveAttribute('aria-pressed', 'true');
  await preview.locator('[data-od-id="profile-screen"]').hover();
  await expect(preview.locator('[data-od-edit-guides-layer] > *')).not.toHaveCount(0);

  await page.getByTestId('manual-edit-mode-toggle').click();
  await expect(preview.locator('html[data-od-edit-mode]')).toHaveCount(0);
  await page.getByTestId('manual-edit-mode-toggle').click();
  await expect(preview.locator('html[data-od-edit-mode]')).toHaveCount(1);
  await preview.locator('[data-od-id="profile-screen"]').hover();
  await expect(preview.locator('[data-od-edit-guides-layer] > *')).not.toHaveCount(0);
});

async function waitForUrlPreviewRefreshToSettle(page: Page) {
  const frame = page.locator(
    'iframe[data-od-render-mode="url-load"][data-od-active="true"]',
  );
  let observedSrc: string | null = null;
  let unchangedSince = Date.now();
  await expect.poll(async () => {
    const currentSrc = await frame.getAttribute('data-od-loaded-src');
    if (!currentSrc || currentSrc === 'about:blank') return 0;
    if (currentSrc !== observedSrc) {
      observedSrc = currentSrc;
      unchangedSince = Date.now();
    }
    return Date.now() - unchangedSince;
  }, {
    message: 'URL preview should stop reloading before the runtime-state interaction',
    timeout: 5_000,
  }).toBeGreaterThanOrEqual(400);
}

async function selectPreviewElementThroughBridge(
  page: Page,
  frame: ReturnType<Page['frameLocator']>,
  selector: string,
  section: string,
) {
  await expect(frame.locator('html[data-od-edit-mode]')).toHaveCount(1);
  // Entering manual-edit mode re-injects the edit bridge and re-emits its targets
  // for a beat (`setTimeout(postTargets, 0)` in edit-mode/bridge.ts), and the
  // preview iframe can still settle (srcDoc swap / target re-emit) at the moment we
  // click. That occasionally swallows the first click, which then hangs on
  // Playwright's post-click stability check until the 30s test timeout. Retry the
  // click until the element is actually marked selected, with a short per-attempt
  // timeout so a single dropped click rides through the settle window instead of
  // failing the whole run.
  await expect(async () => {
    await frame.locator(selector).click({ timeout: 5_000 });
    await expect(frame.locator(`${selector}[data-od-edit-selected="true"]`)).toHaveCount(1, { timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await expect(page.locator('.manual-edit-modal')).toContainText(section);
}

test('[P0] @critical preview toolbar keeps share, download, comment, and zoom actions reachable', async ({ page }, testInfo) => {
  await routeMockAgents(page);
  const projectId = await createEmptyProject(page, 'Preview toolbar smoke');
  const entryHtml = manualEditHtml()
    .replace('/hero.png', 'assets/offline.svg')
    .replace('</head>', '<link rel="stylesheet" href="styles/offline.css"></head>')
    .replace(
      '</body>',
      '<img id="offline-image" src="assets/offline.svg">' +
        '<script type="module" src="scripts/main.js"></script></body>',
    );
  await seedHtmlArtifact(page, projectId, 'toolbar-preview.html', entryHtml);
  await seedProjectFile(
    page,
    projectId,
    'styles/offline.css',
    'body{--offline-export-proof:ready;background-image:url("../assets/offline.svg")}',
  );
  await seedProjectFile(
    page,
    projectId,
    'scripts/main.js',
    'import { markReady } from "./motion.js"; markReady();',
  );
  await seedProjectFile(
    page,
    projectId,
    'scripts/motion.js',
    'export const markReady = () => { document.body.dataset.offlineMotion = "ready"; };',
  );
  await seedProjectFile(
    page,
    projectId,
    'assets/offline.svg',
    '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="red"/></svg>',
  );
  await page.goto(`/projects/${projectId}/files/toolbar-preview.html`);
  await openDesignFile(page, 'toolbar-preview.html');

  await expect(page.getByTestId('artifact-preview-frame')).toBeVisible();
  const viewMode = page.getByRole('tablist', { name: 'View mode' });
  await expect(viewMode).toBeVisible();
  await expect(viewMode.getByRole('tab', { name: 'Preview', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(viewMode.getByRole('tab', { name: 'Code', exact: true })).toBeVisible();

  // The three intents are top-level header controls again — Share, Export, and
  // the hand-off split button sit side by side, with no tab strip to cross.
  await expect(page.getByRole('button', { name: /^Export$/ })).toBeVisible();
  await expect(page.getByTestId('handoff-trigger')).toBeVisible();

  await page.getByRole('button', { name: /^Share$/ }).click();
  const shareMenu = page.locator('.share-menu-popover[role="menu"]');
  await expect(shareMenu).toBeVisible();
  // Share opens straight onto the link/asset-shaped rows; file formats are
  // Export's job now, so they must NOT be reachable from this panel.
  await expect(shareMenu.getByRole('menuitem', { name: /Export as PDF/i })).toHaveCount(0);
  // This local Personal fixture deliberately has neither a Team identity nor
  // an authenticated public-publish capability. Keep this toolbar smoke about
  // the stable action surface instead of requiring a workspace-specific card.
  await expect(shareMenu.getByText(/Share project in workspace/i)).toHaveCount(0);
  await expect(shareMenu.getByText(/Publish this file/i)).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(shareMenu).toHaveCount(0);

  const downloadMenu = await openShareExportMenu(page);
  await expect(downloadMenu).toBeVisible();
  await expect(downloadMenu.getByRole('menuitem', { name: /Export as PDF/ })).toBeVisible();
  await expect(downloadMenu.getByRole('menuitem', { name: /Download as \.zip/ })).toBeVisible();
  const htmlExportResponse = page.waitForResponse((response) =>
    response.url().endsWith(`/api/projects/${projectId}/export/html`),
  );
  const htmlDownload = page.waitForEvent('download');
  await downloadMenu.getByRole('menuitem', { name: /Export as standalone HTML/ }).click();
  const exportResponse = await htmlExportResponse;
  expect(exportResponse.ok(), await exportResponse.text()).toBeTruthy();
  const download = await htmlDownload;
  expect(download.suggestedFilename()).toMatch(/toolbar-preview.*\.html$/i);
  const offlinePath = testInfo.outputPath('offline-standalone.html');
  await download.saveAs(offlinePath);
  const offlinePage = await page.context().newPage();
  const failedRequests: string[] = [];
  const scriptErrors: string[] = [];
  offlinePage.on('requestfailed', (request) => failedRequests.push(request.url()));
  offlinePage.on('pageerror', (error) => scriptErrors.push(error.message));
  offlinePage.on('console', (message) => {
    if (message.type() === 'error') scriptErrors.push(message.text());
  });
  await offlinePage.goto(pathToFileURL(offlinePath).href, { waitUntil: 'load' });
  try {
    await expect.poll(() => offlinePage.locator('body').getAttribute('data-offline-motion')).toBe('ready');
  } catch {
    throw new Error(`offline module did not execute: ${scriptErrors.join(' | ') || 'no browser error reported'}`);
  }
  await expect.poll(() => offlinePage.locator('body').evaluate(
    (body) => getComputedStyle(body).getPropertyValue('--offline-export-proof').trim(),
  )).toBe('ready');
  await expect.poll(() => offlinePage.locator('#offline-image').evaluate(
    (image) => (image as HTMLImageElement).naturalWidth,
  )).toBeGreaterThan(0);
  expect(failedRequests).toEqual([]);
  await offlinePage.close();
  await expect(downloadMenu).toHaveCount(0);

  await page.getByRole('button', { name: /^Comment$/ }).click();
  await expect(page.getByTestId('board-mode-toggle')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: /^Comment$/ }).click();
  await expect(page.getByTestId('board-mode-toggle')).toHaveAttribute('aria-pressed', 'false');

  const zoomButton = page.locator('.viewer-toolbar-zoom .zoom-trigger');
  await expect(zoomButton).toHaveText(/^\d+%$/);
  await zoomButton.click();
  const zoomMenu = page.locator('.zoom-menu-popover[role="menu"]');
  await expect(zoomMenu).toBeVisible();
  await zoomMenu.getByRole('menuitem', { name: '150%' }).click();
  await expect(zoomButton).toHaveText('150%');
});

test('[P1] preview toolbar exports PDF and PPTX through the daemon contracts', async ({ page }) => {
  test.setTimeout(60_000);

  await routeMockAgents(page);
  const projectId = await createProjectViaApi(page, 'Preview export contract');

  const pdfRequests: Array<Record<string, unknown>> = [];
  await page.route(`**/api/projects/${projectId}/export/pdf`, async (route) => {
    pdfRequests.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"ok":true}',
    });
  });

  await seedHtmlArtifact(page, projectId, 'export-page.html', manualEditHtml());
  await page.goto(`/projects/${projectId}/files/export-page.html`);
  await openDesignFile(page, 'export-page.html');

  const pdfMenu = await openShareExportMenu(page);
  await pdfMenu.getByRole('menuitem', { name: /Export as PDF/ }).click();

  await expect
    .poll(() => pdfRequests.length, { timeout: 10_000 })
    .toBe(1);
  expect(pdfRequests[0]).toMatchObject({
    deck: false,
    fileName: 'export-page.html',
    title: 'export-page',
  });

  const pptxRequests: Array<Record<string, unknown>> = [];
  await page.route(`**/api/projects/${projectId}/export/pptx`, async (route) => {
    pptxRequests.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'content-disposition': 'attachment; filename="contract-deck.pptx"',
      },
      body: 'PK\u0003\u0004contract-pptx',
    });
  });

  await seedDeckArtifact(page, projectId, 'contract-deck.html', 'Contract Deck', ['Intro', 'Details']);
  await page.goto(`/projects/${projectId}/files/contract-deck.html`);
  await openDesignFile(page, 'contract-deck.html');
  await expect(artifactPreviewFrame(page).getByRole('heading', { name: 'Intro' })).toBeVisible();

  const pptxMenu = await openShareExportMenu(page);
  await pptxMenu.getByRole('menuitem', { name: /Export as PPTX/ }).click();
  const dialog = page.getByRole('dialog', { name: /Export as PPTX/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('radio', { name: /^Export as PPTX \(editable\)/i })).toBeChecked();

  const pptxDownload = page.waitForEvent('download');
  await dialog.getByRole('button', { name: /Export/i }).click();
  const download = await pptxDownload;

  expect(download.suggestedFilename()).toBe('contract-deck.pptx');
  await expect
    .poll(() => pptxRequests.length, { timeout: 10_000 })
    .toBe(1);
  expect(pptxRequests[0]).toMatchObject({
    deck: true,
    editable: true,
    fileName: 'contract-deck.html',
    title: 'contract-deck',
  });
});

test('[P1] powered WebGL HTML artifacts open through the isolated preview route', async ({ page }) => {
  test.setTimeout(60_000);

  await routeMockAgents(page);
  const projectId = await createEmptyProject(page, 'Powered WebGL preview smoke');
  await seedHtmlArtifact(page, projectId, 'powered-webgl.html', poweredWebglHtml());

  await page.goto(`/projects/${projectId}/files/powered-webgl.html`);
  await openDesignFile(page, 'powered-webgl.html');

  const preview = artifactPreview(page);
  await expect(preview).toBeVisible();
  await expect(preview).toHaveAttribute('data-od-powered', 'true');
  await expect(preview).toHaveAttribute('data-od-render-mode', 'url-load');
  await expect(preview).toHaveAttribute('src', new RegExp(`/api/projects/${projectId}/powered/powered-webgl\\.html`));

  const frame = artifactPreviewFrame(page);
  await expect(frame.getByRole('heading', { name: 'Powered WebGL Smoke' })).toBeVisible();
  await expect(frame.locator('#scene')).toBeVisible();
  await expect(frame.getByTestId('powered-status')).toContainText(/isolated|not-isolated/);
});

test('[P1] HTML preview toolbar exposes comments, mark, and edit workflows', async ({ page }) => {
  test.setTimeout(60_000);

  await page.addInitScript(() => {
    class TestClipboardItem {
      constructor(public readonly items: Record<string, Blob | Promise<Blob>>) {}
    }
    Object.defineProperty(window, 'ClipboardItem', {
      configurable: true,
      value: TestClipboardItem,
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        write: async () => undefined,
        writeText: async () => undefined,
      },
    });
  });

  await routeMockAgents(page);
  const projectId = await createEmptyProject(page, 'Preview tools smoke');
  await seedHtmlArtifact(page, projectId, 'preview-tools.html', withSnapshotBridge(manualEditHtml()));
  const conversationId = await latestConversationId(page, projectId);
  await page.goto(`/projects/${projectId}/conversations/${conversationId}/files/preview-tools.html`);
  await openDesignFile(page, 'preview-tools.html');

  await expect(artifactPreview(page)).toBeVisible();
  await expect(artifactPreviewFrame(page).getByRole('heading', { name: 'Original Hero' })).toBeVisible();

  // The screenshot step is gone: `screenshot-copy-button` no longer exists in
  // apps/web, and FileViewer's own suite asserts its absence. Comments, mark
  // and edit below are still live, so the rest of this spec stands.
  await page.getByTestId('board-mode-toggle').click();
  await expect(page.getByTestId('board-mode-toggle')).toHaveAttribute('aria-pressed', 'true');
  await artifactPreviewFrame(page).locator('[data-od-id="hero-title"]').click();
  await expect(page.getByTestId('comment-popover')).toBeVisible();
  await page.getByTestId('comment-popover-input').fill('Panel-level comment');
  await page.getByTestId('comment-popover').getByRole('button', { name: /^Comment$/ }).click();
  await expect(page.getByTestId('comment-saved-marker-hero-title')).toBeVisible();

  await expect(page.getByTestId('comment-side-panel')).toHaveCount(0);
  const commentsButton = page.getByTestId('comment-panel-toggle');
  await commentsButton.click();
  await expect(commentsButton).toHaveAttribute('aria-pressed', 'false');
  await commentsButton.click();
  await expect(page.getByTestId('comment-side-panel')).toBeVisible();
  await expect(page.getByTestId('comment-side-panel')).toContainText('Panel-level comment');
  await expect(commentsButton).toContainText('1');
  await page.getByRole('button', { name: /hide comments/i }).click();
  await expect(page.getByTestId('chat-composer')).toBeVisible();

  await holdNextRunOpen(page);
  await sendPrompt(page, 'Keep the current preview run active');
  await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();

  await page.getByTestId('draw-overlay-toggle').click();
  await expect(page.getByTestId('draw-overlay-toggle')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Box select' })).toBeVisible();
  await page.getByPlaceholder('Add a note for this mark').fill('Mark this hero crop');
  const addToInputButton = page.getByRole('button', { name: 'Add to input' });
  const queueButton = page.getByRole('button', { name: 'Queue' });
  await expect(addToInputButton).toBeEnabled();
  await expect(queueButton).toBeEnabled();

  const previewBox = await artifactPreview(page).boundingBox();
  expect(previewBox).not.toBeNull();
  await page.mouse.move(previewBox!.x + 80, previewBox!.y + 80);
  await page.mouse.down();
  await page.mouse.move(previewBox!.x + 220, previewBox!.y + 170);
  await page.mouse.up();
  await queueButton.click();
  const queuedStrip = page.getByTestId('chat-queued-send-strip');
  await expect(queuedStrip).toBeVisible();
  await expect(queuedStrip).toContainText('Mark this hero crop');
  await expect(queuedStrip).toContainText('1 mark');

  await page.getByTestId('manual-edit-mode-toggle').click();
  await expect(page.getByTestId('manual-edit-mode-toggle')).toHaveAttribute('aria-pressed', 'true');
  await selectPreviewElementThroughBridge(page, artifactPreviewFrame(page), '[data-od-id="hero-title"]', 'Parameters');
  await expect(page.locator('.manual-edit-modal')).toContainText('Hero title');
  await expect(page.locator('.manual-edit-modal')).toContainText('Parameters');
  await expect(page.getByRole('button', { name: /^Save$/ })).toBeVisible();
});

test('[P1] draw annotation composer floats near the selected mark and can be queued', async ({ page }) => {
  test.setTimeout(60_000);

  await routeMockAgents(page);
  const projectId = await createEmptyProject(page, 'Draw composer position smoke');
  await seedHtmlArtifact(page, projectId, 'draw-position.html', withSnapshotBridge(manualEditHtml()));
  const conversationId = await latestConversationId(page, projectId);
  await page.goto(`/projects/${projectId}/conversations/${conversationId}/files/draw-position.html`);
  await openDesignFile(page, 'draw-position.html');

  await page.getByTestId('board-mode-toggle').click();
  await expect(page.getByTestId('board-mode-toggle')).toHaveAttribute('aria-pressed', 'true');
  await holdNextRunOpen(page);
  await sendPrompt(page, 'Keep draw queue mode active');
  await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();

  await page.getByTestId('draw-overlay-toggle').click();
  await expect(page.getByTestId('draw-overlay-toggle')).toHaveAttribute('aria-pressed', 'true');

  const previewBox = await artifactPreview(page).boundingBox();
  expect(previewBox).not.toBeNull();
  const mark = {
    x1: previewBox!.x + 120,
    y1: previewBox!.y + 96,
    x2: previewBox!.x + 300,
    y2: previewBox!.y + 190,
  };
  await page.mouse.move(mark.x1, mark.y1);
  await page.mouse.down();
  await page.mouse.move(mark.x2, mark.y2);
  await page.mouse.up();

  const noteInput = page.locator('.preview-draw-note-input');
  await expect(noteInput).toBeVisible();
  const noteBox = await noteInput.boundingBox();
  expect(noteBox).not.toBeNull();
  expect(Math.abs(noteBox!.x - mark.x2)).toBeLessThan(260);
  expect(Math.abs(noteBox!.y - mark.y2)).toBeLessThan(220);

  await noteInput.fill('Float this note near the marked hero area');
  const queueButton = page.getByRole('button', { name: 'Queue' });
  await expect(queueButton).toBeEnabled();
  await queueButton.click();
  const queuedStrip = page.getByTestId('chat-queued-send-strip');
  await expect(queuedStrip).toBeVisible();
  await expect(queuedStrip).toContainText('Float this note near the marked hero area');
  await expect(queuedStrip).toContainText('1 mark');
});

test('[P1] first-loop onboarding completes once after a successful artifact export', async ({ page }) => {
  test.setTimeout(60_000);
  const analyticsBodies: string[] = [];
  const analyticsConfig = {
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
    telemetry: { metrics: true, content: false, artifactManifest: false },
  };
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, JSON.stringify(value));
    },
    { key: STORAGE_KEY, value: analyticsConfig },
  );
  await page.route('**/api/app-config', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { config: analyticsConfig } });
      return;
    }
    await route.continue();
  });
  await page.route('**/api/analytics/config', async (route) => {
    await route.fulfill({
      json: {
        enabled: true,
        env: 'e2e',
        key: 'phc_e2e',
        host: 'https://analytics.open-design.test',
        installationId: 'e2e-installation',
      },
    });
  });
  await page.route('https://analytics.open-design.test/**', async (route) => {
    analyticsBodies.push(route.request().postData() ?? '');
    await route.fulfill({ status: 200, json: { status: 1 } });
  });

  await routeMockAgents(page);
  const projectId = await createEmptyProject(page, 'First loop export smoke');
  await seedHtmlArtifact(page, projectId, 'first-loop-export.html', manualEditHtml());
  await page.addInitScript(
    ({ id }) => {
      window.sessionStorage.setItem(
        `open-design:first-loop-entry:${id}`,
        JSON.stringify({
          source: 'home_recommendation',
          productType: 'prototype',
          recommendationId: 'e2e-recommendation-card',
        }),
      );
      window.sessionStorage.setItem(
        `open-design:first-loop-steps:${id}`,
        JSON.stringify(['prompt_sent', 'generated', 'artifact_viewed']),
      );
    },
    { id: projectId },
  );
  await page.goto(`/projects/${projectId}/files/first-loop-export.html`);
  await openDesignFile(page, 'first-loop-export.html');

  const shareMenu = await openShareExportMenu(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    shareMenu.getByRole('menuitem', { name: /Export as standalone HTML/ }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/first-loop-export.*\.html$/i);

  await expect.poll(() => analyticsBodies.join('\n'), { timeout: 15_000 }).toContain('onboarding_completed');
  const raw = analyticsBodies.join('\n');
  expect(raw).toContain('home_recommendation');
  expect(raw).toContain('e2e-recommendation-card');
  expect(raw).toContain('prompt_sent');
  expect(raw).toContain('generated');
  expect(raw).toContain('artifact_viewed');
  expect(raw).toContain('delivered');

  await openShareExportMenu(page);
  await Promise.all([
    page.waitForEvent('download'),
    shareMenu.getByRole('menuitem', { name: /Export as standalone HTML/ }).click(),
  ]);
  await expectStableCount(
    () => analyticsBodies.join('\n').match(/onboarding_completed/g)?.length ?? 0,
    1,
    {
      timeout: 750,
      message: 're-exporting the same first-loop artifact should not emit a duplicate completion event',
    },
  );
});

test('[P0] manual edit mode keeps deck navigation available for deck-shaped HTML', async ({ page }) => {
  await routeMockAgents(page);
  const projectId = await createEmptyProject(page, 'Manual edit deck smoke');
  await seedDeckArtifact(page, projectId, 'manual-deck.html', 'Manual Deck', ['Slide One', 'Slide Two']);
  await page.goto(`/projects/${projectId}/files/manual-deck.html`);
  await openDesignFile(page, 'manual-deck.html');

  const frame = artifactPreviewFrame(page);
  await expect(frame.getByText('Slide One')).toBeVisible();
  await clickDeckNextSlide(page);
  await expect(frame.getByText('Slide Two')).toBeVisible();
});

test('[P0] deck presentation host exit remains usable after the sandboxed slide takes focus', async ({ page }) => {
  await routeMockAgents(page);
  const projectId = await createEmptyProject(page, 'Deck presentation exit smoke');
  await seedDeckArtifact(page, projectId, 'present-exit.html', 'Present Exit', ['Slide One', 'Slide Two']);
  await page.goto(`/projects/${projectId}/files/present-exit.html`);
  await openDesignFile(page, 'present-exit.html');

  await page.getByRole('button', { name: 'Present', exact: true }).click();
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('menuitem', { name: /^In this tab/i }).click();
  const presenter = await popupPromise;

  const overlay = page.locator('.present-overlay');
  await expect(overlay).toBeVisible();
  const presentedSlide = overlay.frameLocator('iframe[title="present"]');
  const slideHeading = presentedSlide.getByRole('heading', { name: 'Slide One' });
  await expect(slideHeading).toBeVisible();
  await slideHeading.click();
  await expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).toBe('IFRAME');

  const presenterClosed = presenter.waitForEvent('close');
  await overlay.getByRole('button', { name: 'Exit presentation' }).click();
  await expect(overlay).toHaveCount(0);
  await presenterClosed;
  expect(presenter.isClosed()).toBe(true);
});

test('[P1] deck thumbnail rail keeps complete 16:9 slides separated and aligned', async ({ page }) => {
  await routeMockAgents(page);
  const projectId = await createEmptyProject(page, 'Deck thumbnail rail layout');
  await seedDeckArtifact(
    page,
    projectId,
    'thumbnail-rail.html',
    'Thumbnail Rail',
    ['Slide One', 'Slide Two', 'Slide Three'],
    { frameworkDeck: true },
  );
  await page.goto(`/projects/${projectId}/files/thumbnail-rail.html`);
  await openDesignFile(page, 'thumbnail-rail.html');

  const rail = page.locator('.deck-thumbnail-rail');
  const frames = rail.locator('.deck-thumbnail-frame');
  const numbers = rail.locator('.deck-thumbnail-number');
  await expect(rail).toBeVisible();
  await expect(frames).toHaveCount(3);

  const [railBox, firstFrame, secondFrame, firstNumber] = await Promise.all([
    rail.boundingBox(),
    frames.nth(0).boundingBox(),
    frames.nth(1).boundingBox(),
    numbers.nth(0).boundingBox(),
  ]);
  expect(railBox).not.toBeNull();
  expect(firstFrame).not.toBeNull();
  expect(secondFrame).not.toBeNull();
  expect(firstNumber).not.toBeNull();
  if (!railBox || !firstFrame || !secondFrame || !firstNumber) return;

  expect(firstFrame.width / firstFrame.height).toBeCloseTo(16 / 9, 1);
  expect(secondFrame.width / secondFrame.height).toBeCloseTo(16 / 9, 1);
  expect(secondFrame.y).toBeGreaterThanOrEqual(firstFrame.y + firstFrame.height + 8);
  expect(firstNumber.y).toBeGreaterThanOrEqual(firstFrame.y);
  expect(firstNumber.y).toBeLessThan(firstFrame.y + firstFrame.height);
  expect(firstFrame.x + firstFrame.width).toBeLessThanOrEqual(
    railBox.x + railBox.width,
  );
});

test('[P0] @critical edited HTML file restores selected tab and preview after reload', async ({ page }) => {
  await routeMockAgents(page);
  const projectId = await createEmptyProject(page, 'File edit restore smoke');
  await seedHtmlArtifact(page, projectId, 'restore-edit.html', manualEditHtml());
  await seedHtmlArtifact(
    page,
    projectId,
    'secondary-preview.html',
    '<!doctype html><html><body><main><h1>Secondary Preview</h1></main></body></html>',
  );
  await page.goto(`/projects/${projectId}/files/secondary-preview.html`);
  await openDesignFile(page, 'secondary-preview.html');
  await expect(tabBySuffix(page, 'secondary-preview.html')).toHaveAttribute('aria-selected', 'true');

  await openAllProjectFiles(page);
  await openDesignFile(page, 'restore-edit.html');

  const restoreTab = tabBySuffix(page, 'restore-edit.html');
  const secondaryTab = tabBySuffix(page, 'secondary-preview.html');
  await expect(restoreTab).toBeVisible();
  await expect(restoreTab).toHaveAttribute('aria-selected', 'true');
  await expect(secondaryTab).toBeVisible();
  await expect(secondaryTab).toHaveAttribute('aria-selected', 'false');

  const frame = artifactPreviewFrame(page);
  await expect(frame.getByRole('heading', { name: 'Original Hero' })).toBeVisible();
  const activeEditToggle = page.locator(
    '[data-testid="file-workspace"] [data-testid="manual-edit-mode-toggle"]:visible',
  );
  await expect(activeEditToggle).toHaveCount(1);
  await activeEditToggle.click();
  await selectPreviewElementThroughBridge(page, frame, '[data-od-id="hero-title"]', 'Parameters');
  const parameters = inspectorSection(page, 'Parameters');
  const fontSizeInput = parameters.locator('.cc-row').filter({ hasText: 'Font size' }).locator('input');
  await expect(fontSizeInput).toBeVisible();
  await fontSizeInput.fill('52');
  await parameters.locator('.cc-row').filter({ hasText: 'Text color' }).locator('input:not([type="color"])').fill('#2563eb');
  await inspectSaveButton(page).click({ force: true });
  await expectFileSource(page, projectId, 'restore-edit.html', ['font-size: 52px', 'color:']);

  await activeEditToggle.click();
  const viewMode = page.getByRole('tablist', { name: 'View mode' });
  await expect(viewMode).toBeVisible();
  await expect(viewMode.getByRole('tab', { name: 'Preview', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(viewMode.getByRole('tab', { name: 'Code', exact: true })).toBeVisible();
  await expect(page.locator('.viewer-source')).toHaveCount(0);
  await expect(restoreTab).toHaveAttribute('aria-selected', 'true');
  await expect(secondaryTab).toHaveAttribute('aria-selected', 'false');

  await page.reload();
  await waitForLoadingToClear(page);
  await expect(page.getByTestId('file-workspace')).toBeVisible();
  const restoredTab = tabBySuffix(page, 'restore-edit.html');
  await expect(restoredTab).toBeVisible();
  await expect(restoredTab).toHaveAttribute('aria-selected', 'true');
  const restoredViewMode = page.getByRole('tablist', { name: 'View mode' });
  await expect(restoredViewMode).toBeVisible();
  await expect(restoredViewMode.getByRole('tab', { name: 'Preview', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(restoredViewMode.getByRole('tab', { name: 'Code', exact: true })).toBeVisible();
  await expect(page.locator('.viewer-source')).toHaveCount(0);
  await expect(artifactPreview(page)).toBeVisible();
  const restoredFrame = artifactPreviewFrame(page);
  const restoredTitle = restoredFrame.getByRole('heading', { name: 'Original Hero' });
  await expect(restoredTitle).toBeVisible();
  await expect(restoredTitle).toHaveCSS('font-size', '52px');
  await expect(restoredTitle).toHaveCSS('color', 'rgb(37, 99, 235)');
});

async function routeMockAgents(page: Page) {
  await routeAgents(page, [
    {
      id: 'mock',
      name: 'Mock Agent',
      bin: 'mock-agent',
      available: true,
      version: 'test',
      models: [{ id: 'default', label: 'Default' }],
    },
  ]);
}

async function createEmptyProject(page: Page, name: string): Promise<string> {
  const projectId = await createProjectViaApi(page, name);
  await page.goto(`/projects/${projectId}`, { waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page).catch(() => {});
  await expect(page.getByTestId('file-workspace')).toBeVisible();
  return projectId;
}

// Export is its own header button now — no Share detour, no tab strip. The
// popover shell is still shared with Share, so the locator is unchanged.
async function openShareExportMenu(page: Page): Promise<ReturnType<Page['locator']>> {
  await page.getByRole('button', { name: /^Export$/ }).click();
  const menu = page.locator('.share-menu-popover[role="menu"]');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: /^Export as/ }).first()).toBeVisible();
  return menu;
}

async function previewCss(page: Page, selector: string, property: keyof CSSStyleDeclaration): Promise<string> {
  return artifactPreviewFrame(page)
    .locator(selector)
    .evaluate((el, cssProperty) => String(getComputedStyle(el)[cssProperty as keyof CSSStyleDeclaration] ?? ''), property)
    .catch(() => '');
}

async function createProjectViaApi(page: Page, name: string): Promise<string> {
  await gotoEntryHome(page);
  const id = `playwright-export-${Date.now()}`;
  const response = await page.request.post('/api/projects', {
    data: {
      id,
      name,
      skillId: null,
      designSystemId: null,
      metadata: { kind: 'prototype' },
    },
    timeout: 15_000,
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { project?: { id?: string } };
  const projectId = body.project?.id;
  if (!projectId) throw new Error(`project create response missing id: ${JSON.stringify(body)}`);
  return projectId;
}

async function gotoEntryHome(page: Page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/ERR_ABORTED|frame was detached/i.test(message)) throw error;
    }
    await waitForLoadingToClear(page).catch(() => {});
    if (await page.getByTestId('home-hero').isVisible({ timeout: 3_000 }).catch(() => false)) break;
  }
  const privacyDialog = page.getByRole('dialog').filter({ hasText: 'Help us improve OpenDesign' });
  if (await privacyDialog.isVisible()) {
    await privacyDialog.getByRole('button', { name: /I get it|not now|got it|don't share/i }).click();
    await expect(privacyDialog).toHaveCount(0);
  }
  await expect(page.getByTestId('home-hero')).toBeVisible();
  await expect(page.getByTestId('home-hero-input')).toBeVisible();
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

async function seedProjectFile(page: Page, projectId: string, fileName: string, content: string) {
  const response = await page.request.post(`/api/projects/${projectId}/files`, {
    data: { name: fileName, content },
    timeout: 15_000,
  });
  expect(response.ok()).toBeTruthy();
}

async function latestConversationId(page: Page, projectId: string): Promise<string> {
  const response = await page.request.get(`/api/projects/${projectId}/conversations`, { timeout: 15_000 });
  expect(response.ok()).toBeTruthy();
  const { conversations } = (await response.json()) as {
    conversations: Array<{ id: string; updatedAt: number }>;
  };
  const latest = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt)[0];
  if (!latest) throw new Error(`no conversations found for project ${projectId}`);
  return latest.id;
}

async function holdNextRunOpen(page: Page) {
  await routeSuccessfulRuns(page, {
    runIdPrefix: 'preview-tools-run',
    events: 'pending',
  });
}

async function sendPrompt(page: Page, prompt: string) {
  const input = page.getByTestId('chat-composer-input');
  const sendButton = page.getByTestId('chat-send');
  await expect(input).toBeVisible({ timeout: T.short });
  await input.click();
  await input.fill(prompt);
  await expect(input).toHaveText(prompt, { timeout: T.short });
  await expect(sendButton).toBeEnabled({ timeout: T.short });
  await Promise.all([
    page.waitForResponse(isCreateRunResponse, { timeout: 5_000 }),
    sendButton.evaluate((button: HTMLButtonElement) => button.click()),
  ]);
}

function isCreateRunResponse(resp: { url(): string; request(): { method(): string } }): boolean {
  const url = new URL(resp.url());
  return url.pathname === '/api/runs' && resp.request().method() === 'POST';
}

function withSnapshotBridge(html: string): string {
  const bridge = `
<script>
window.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type !== 'od:snapshot') return;
  event.source?.postMessage({
    type: 'od:snapshot:result',
    id: data.id,
    dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
    w: 1,
    h: 1,
  }, '*');
});
</script>`;
  return html.replace('</body>', `${bridge}</body>`);
}

function poweredWebglHtml(): string {
  return `<!doctype html>
<html>
<head>
  <title>Powered WebGL Smoke</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0f172a; color: #f8fafc; font-family: sans-serif; }
    main { display: grid; gap: 12px; justify-items: center; }
    canvas { width: 160px; height: 96px; border: 1px solid #38bdf8; background: #111827; }
  </style>
</head>
<body>
  <main>
    <h1>Powered WebGL Smoke</h1>
    <canvas id="scene" width="160" height="96"></canvas>
    <p data-testid="powered-status">booting</p>
  </main>
  <script>
    document.createElement('canvas').getContext('webgl2');
    const canvas = document.getElementById('scene');
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#22c55e';
    ctx.fillRect(16, 20, 128, 56);
    ctx.fillStyle = '#0f172a';
    ctx.font = '18px sans-serif';
    ctx.fillText('OD', 66, 55);
    document.querySelector('[data-testid="powered-status"]').textContent =
      window.crossOriginIsolated ? 'isolated' : 'not-isolated';
  </script>
</body>
</html>`;
}

async function seedDeckArtifact(
  page: Page,
  projectId: string,
  fileName: string,
  title: string,
  slides: string[],
  options: {
    selfHandlesSlideMessages?: boolean;
    mentionsSlideMessageProtocol?: boolean;
    stopsSlideMessagePropagation?: boolean;
    handlesKeyboard?: boolean;
    frameworkDeck?: boolean;
  } = {},
) {
  const slideHtml = slides
    .map((slide, index) => `<section class="slide" data-od-id="slide-${index + 1}"${index === 0 ? '' : ' hidden'}><h1>${slide}</h1></section>`)
    .join('\n');
  const deckHtml = options.frameworkDeck
    ? `<div class="deck-stage" id="deck-stage">${slideHtml}</div>`
    : slideHtml;
  const deckChrome = options.stopsSlideMessagePropagation
    ? '<nav><span id="deck-cur">01</span> / <span id="deck-total">03</span></nav>'
    : '';
  const slideScript =
    options.selfHandlesSlideMessages || options.stopsSlideMessagePropagation || options.handlesKeyboard
    ? `<script>
    (() => {
      let active = 0;
      const slides = Array.from(document.querySelectorAll('.slide'));
      function render() {
        slides.forEach((slide, index) => {
          slide.style.display = index === active ? '' : 'none';
          slide.toggleAttribute('hidden', index !== active);
        });
        const cur = document.getElementById('deck-cur');
        const total = document.getElementById('deck-total');
        if (cur) cur.textContent = String(active + 1).padStart(2, '0');
        if (total) total.textContent = String(slides.length).padStart(2, '0');
      }
      window.addEventListener('message', (event) => {
        if (!event.data || event.data.type !== 'od:slide') return;
        ${options.stopsSlideMessagePropagation ? 'event.stopImmediatePropagation();' : ''}
        if (event.data.action === 'next') active = Math.min(slides.length - 1, active + 1);
        if (event.data.action === 'prev') active = Math.max(0, active - 1);
        if (event.data.action === 'first') active = 0;
        if (event.data.action === 'last') active = slides.length - 1;
        if (event.data.action === 'go' && typeof event.data.index === 'number') {
          active = Math.max(0, Math.min(slides.length - 1, event.data.index));
        }
        render();
        ${options.stopsSlideMessagePropagation ? '' : "window.parent.postMessage({ type: 'od:slide-state', active, count: slides.length }, '*');"}
      });
      ${
        options.handlesKeyboard
          ? `function onKey(event) {
        if (event.key !== 'ArrowRight') return;
        event.preventDefault();
        active = Math.min(slides.length - 1, active + 1);
        render();
      }
      window.addEventListener('keydown', onKey, true);
      document.addEventListener('keydown', onKey, true);
      document.body.setAttribute('tabindex', '-1');
      document.body.focus();`
          : ''
      }
      render();
      ${options.stopsSlideMessagePropagation ? '' : "window.parent.postMessage({ type: 'od:slide-state', active, count: slides.length }, '*');"}
    })();
    </script>`
    : '';
  const protocolText = options.mentionsSlideMessageProtocol
    ? '<p>Protocol token: od:slide</p>'
    : '';
  const resp = await page.request.post(
    `/api/projects/${projectId}/files`,
    {
      data: {
        name: fileName,
        content: `<!doctype html><html><body>${deckChrome}${deckHtml}${protocolText}${slideScript}</body></html>`,
        artifactManifest: {
          version: 1,
          kind: 'deck',
          title,
          entry: fileName,
          renderer: 'deck-html',
          exports: ['html', 'pdf'],
        },
      },
      timeout: 15_000,
    },
  );
  expect(resp.ok()).toBeTruthy();
}

async function openDesignFile(page: Page, fileName: string) {
  const preview = artifactPreview(page);
  await waitForLoadingToClear(page).catch(() => {});
  const activePath = new URL(page.url()).pathname;
  if (activePath.endsWith(`/files/${encodeURIComponent(fileName)}`)) {
    await expect(preview).toBeVisible();
    return;
  }
  const filePattern = new RegExp(fileName.replace(/\./g, '\\.'), 'i');
  const fileTabButton = page.getByRole('tab', { name: filePattern }).first();
  let tabFound = true;
  try {
    await fileTabButton.waitFor({ state: 'visible', timeout: 5_000 });
  } catch {
    tabFound = false;
  }

  if (tabFound) {
    const isSelected = await fileTabButton.getAttribute('aria-selected');
    if (isSelected !== 'true') {
      await fileTabButton.click();
    }
  } else {
    // #5517 deleted the design-file preview pane and its "Open" button: the
    // Design Files row's primary target opens the file in a workspace tab on
    // a single click, so the preview renders straight away.
    const fileRow = page
      .locator(`[data-testid^="design-file-row-"][data-testid$="${fileName}"]`)
      .first();
    await expect(fileRow).toBeVisible();
    await fileRow.getByRole('button').first().click();
  }
  await expect(preview).toBeVisible();
}

async function waitForLoadingToClear(page: Page) {
  await page.getByText('Loading OpenDesign…').waitFor({ state: 'hidden', timeout: T.long });
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

function inspectSaveButton(page: Page) {
  return page.locator('.manual-edit-modal').getByRole('button', { name: /^Save$/ });
}

function tabBySuffix(page: Page, name: string) {
  return page
    .getByRole('tab')
    .filter({
      hasText: new RegExp(`${escapeRegExp(name)}$`),
    })
    .first();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

function multiPageMobileHtml(): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      body { margin: 0; font-family: sans-serif; }
      main { min-height: 480px; padding: 32px; }
      nav { display: flex; gap: 12px; padding: 16px 32px; }
      [hidden] { display: none !important; }
    </style>
  </head>
  <body>
    <main data-testid="mobile-page-home" data-od-id="mobile-page-home" data-page="home">
      <h1>Home page</h1>
    </main>
    <main data-testid="mobile-page-profile" data-od-id="mobile-page-profile" data-page="profile" hidden>
      <h1>Profile page</h1>
    </main>
    <nav aria-label="Mobile navigation">
      <button type="button" data-target-page="home">Home</button>
      <button type="button" data-target-page="profile">Profile</button>
    </nav>
    <script>
      document.querySelectorAll('[data-target-page]').forEach((button) => {
        button.addEventListener('click', () => {
          const target = button.getAttribute('data-target-page');
          document.querySelectorAll('[data-page]').forEach((page) => {
            page.toggleAttribute('hidden', page.getAttribute('data-page') !== target);
          });
        });
      });
    </script>
  </body>
</html>`;
}

function runtimeRenderedMobileHtml(): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
  </head>
  <body>
    <div id="app"></div>
    <script>
      const app = document.querySelector('#app');
      const renderToday = () => {
        app.innerHTML =
          '<main data-testid="mobile-page-today" data-od-id="today-screen">' +
            '<h1>Today page</h1>' +
            '<button type="button" data-page-target="profile">Profile</button>' +
          '</main>';
      };
      const renderProfile = () => {
        app.innerHTML =
          '<main data-testid="mobile-page-profile" data-od-id="profile-screen">' +
            '<section><h1>Profile page</h1><p>Current page content</p></section>' +
            '<button type="button" data-page-target="today">Today</button>' +
          '</main>';
      };
      document.addEventListener('click', (event) => {
        if (event.target.closest('[data-page-target="profile"]')) renderProfile();
        if (event.target.closest('[data-page-target="today"]')) renderToday();
      });
      renderToday();
    </script>
  </body>
</html>`;
}

function linkedMobilePageHtml(
  heading: string,
  screenId: string,
  href: string,
  linkLabel: string,
): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
  </head>
  <body>
    <main data-od-id="${screenId}">
      <h1>${heading}</h1>
      <a href="${href}">${linkLabel}</a>
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
