import { expect, test } from '@/playwright/suite';
import { ensureRailOpen } from '@/playwright/rail';
import { routeAgents } from '@/playwright/mock-factory';
import type { Page } from '@playwright/test';
import { T } from '@/timeouts';

const STORAGE_KEY = 'open-design:config';
const ACTIVE_ARTIFACT_PREVIEW_SELECTOR = '[data-testid="artifact-preview-frame"]:visible, [data-testid="artifact-preview-frame-url-load"]:visible, [data-testid="artifact-preview-frame-srcdoc"]:visible, [data-testid="live-artifact-preview-frame"]:visible';

test.describe.configure({ timeout: T.long });

function artifactPreview(page: Page) {
  return page.locator(ACTIVE_ARTIFACT_PREVIEW_SELECTOR).first();
}

function artifactPreviewFrame(page: Page) {
  return page.frameLocator(ACTIVE_ARTIFACT_PREVIEW_SELECTOR);
}

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

test('[P0] manual edit inspector previews and persists page and selected element styles', async ({ page }) => {
  await routeMockAgents(page);
  const projectId = await createEmptyProject(page, 'Manual edit smoke');
  await seedHtmlArtifact(page, projectId, 'manual-edit.html', manualEditHtml());
  await page.goto(`/projects/${projectId}/files/manual-edit.html`);
  await openDesignFile(page, 'manual-edit.html');

  await expect(artifactPreview(page)).toBeVisible();
  const frame = artifactPreviewFrame(page);
  await expect(frame.getByRole('heading', { name: 'Original Hero' })).toBeVisible();
  const responsivePair = frame.locator('[data-od-id="responsive-pair"]');
  await expect.poll(async () => responsivePair.evaluate((el) => getComputedStyle(el).flexDirection)).toBe('row');

  await page.getByTestId('manual-edit-mode-toggle').click();
  await expect(frame.locator('html[data-od-edit-mode]')).toHaveCount(1);
  await expect.poll(async () => responsivePair.evaluate((el) => getComputedStyle(el).flexDirection)).toBe('row');

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

  await selectPreviewElementThroughBridge(page, frame, '[data-od-id="hero-title"]', 'TYPOGRAPHY');
  const selectedTitleMarker = frame.locator('[data-od-id="hero-title"][data-od-edit-selected="true"]');
  await expect(selectedTitleMarker).toHaveCount(1);
  const fontSizeInput = inspectorSection(page, 'TYPOGRAPHY').locator('.cc-row').filter({ hasText: 'Size' }).locator('input');
  await fontSizeInput.click();
  await expect(selectedTitleMarker).toHaveCount(1);
  await expect(fontSizeInput).not.toHaveValue('');
  await expect(fontSizeInput).not.toHaveValue(/px/i);
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

  await expect(page.getByRole('button', { name: /^Share$/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Download$/ })).toBeVisible();
});

test('[P0] manual edit mode preserves preview actions after style edits', async ({ page }) => {
  await routeMockAgents(page);
  const projectId = await createEmptyProject(page, 'Manual edit smoke');
  await seedHtmlArtifact(page, projectId, 'manual-edit.html', manualEditHtml());
  await page.goto(`/projects/${projectId}/files/manual-edit.html`);
  await openDesignFile(page, 'manual-edit.html');

  await expect(artifactPreview(page)).toBeVisible();
  const frame = artifactPreviewFrame(page);
  await expect(frame.getByRole('heading', { name: 'Original Hero' })).toBeVisible();

  await page.getByTestId('manual-edit-mode-toggle').click();
  await selectPreviewElementThroughBridge(page, frame, '[data-od-id="hero-title"]', 'TYPOGRAPHY');
  const fontSizeInput = await selectStyleRowInput(page, frame, '[data-od-id="hero-title"]', 'TYPOGRAPHY', 'Size');
  await fontSizeInput.fill('48');
  await inspectSaveButton(page).click({ force: true });
  await expectFileSource(page, projectId, 'manual-edit.html', ['font-size: 48px']);

  await page.getByTestId('manual-edit-mode-toggle').click();
  await expect(frame.getByRole('heading', { name: 'Original Hero' })).toBeVisible();

  await page.getByTestId('board-mode-toggle').click();
  await expect(page.getByRole('button', { name: /^Comment$/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Share$/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Download$/ })).toBeVisible();
});

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

test('[P0] @critical preview toolbar keeps share, download, comment, and zoom actions reachable', async ({ page }) => {
  await routeMockAgents(page);
  const projectId = await createEmptyProject(page, 'Preview toolbar smoke');
  await seedHtmlArtifact(page, projectId, 'toolbar-preview.html', manualEditHtml());
  await page.goto(`/projects/${projectId}/files/toolbar-preview.html`);
  await openDesignFile(page, 'toolbar-preview.html');

  await expect(page.getByTestId('artifact-preview-frame')).toBeVisible();
  await expect(
    page.getByRole('tablist', { name: 'View mode' }).getByRole('tab', { name: 'Preview' }),
  ).toHaveAttribute('aria-selected', 'true');

  await page.getByRole('button', { name: /^Share$/ }).click();
  const shareMenu = page.locator('.share-menu-popover[role="menu"]');
  await expect(shareMenu).toBeVisible();
  await expect(shareMenu).toContainText('PUBLISH ONLINE');
  await expect(shareMenu).toContainText('SOCIAL SHARE');
  await page.keyboard.press('Escape');
  await expect(shareMenu).toHaveCount(0);

  await page.getByRole('button', { name: /^Download$/ }).click();
  const downloadMenu = page.locator('.share-menu-popover[role="menu"]');
  await expect(downloadMenu).toBeVisible();
  await expect(downloadMenu.getByRole('menuitem', { name: /Export as PDF/ })).toBeVisible();
  await expect(downloadMenu.getByRole('menuitem', { name: /Download as \.zip/ })).toBeVisible();
  const htmlDownload = page.waitForEvent('download');
  await downloadMenu.getByRole('menuitem', { name: /Export as standalone HTML/ }).click();
  const download = await htmlDownload;
  expect(download.suggestedFilename()).toMatch(/toolbar-preview.*\.html$/i);
  await expect(downloadMenu).toHaveCount(0);

  await page.getByRole('button', { name: /^Comment$/ }).click();
  await expect(page.getByTestId('board-mode-toggle')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: /^Comment$/ }).click();
  await expect(page.getByTestId('board-mode-toggle')).toHaveAttribute('aria-pressed', 'false');

  const zoomButton = page.locator('.viewer-toolbar-zoom .zoom-trigger');
  await expect(zoomButton).toHaveText('100%');
  await zoomButton.click();
  const zoomMenu = page.locator('.zoom-menu-popover[role="menu"]');
  await expect(zoomMenu).toBeVisible();
  await zoomMenu.getByRole('menuitem', { name: '150%' }).click();
  await expect(zoomButton).toHaveText('150%');
});

test('[P1] HTML preview toolbar exposes screenshot, comments, mark, and edit workflows', async ({ page }) => {
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

  await page.getByTestId('screenshot-copy-button').click();
  await expect(
    page.getByText(/Screenshot copied to clipboard|Browser blocked clipboard access|Could not capture the preview|Preview is still loading/),
  ).toBeVisible();

  await page.getByTestId('board-mode-toggle').click();
  await expect(page.getByTestId('board-mode-toggle')).toHaveAttribute('aria-pressed', 'true');
  await artifactPreviewFrame(page).locator('[data-od-id="hero-title"]').click();
  await expect(page.getByTestId('comment-popover')).toBeVisible();
  await page.getByTestId('comment-popover-input').fill('Panel-level comment');
  await page.getByTestId('comment-popover').getByRole('button', { name: /^Comment$/ }).click();
  await expect(page.getByTestId('comment-saved-marker-hero-title')).toBeVisible();

  await expect(page.getByTestId('comment-side-panel')).toBeVisible();
  await expect(page.getByTestId('comment-side-panel')).toContainText('Panel-level comment');
  await expect(page.getByTestId('comment-panel-toggle')).toContainText('1');
  await page.getByTestId('comment-panel-toggle').click();
  await expect(page.getByTestId('chat-composer')).toBeVisible();

  await holdNextRunOpen(page);
  await sendPrompt(page, 'Keep the current preview run active');
  await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();

  await page.getByTestId('draw-overlay-toggle').click();
  await expect(page.getByTestId('draw-overlay-toggle')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Box select' })).toBeVisible();
  await page.getByPlaceholder('Add a note for this mark').fill('Mark this hero crop');
  await expect(page.getByRole('button', { name: 'Add to input' })).toBeEnabled();

  const previewBox = await artifactPreview(page).boundingBox();
  expect(previewBox).not.toBeNull();
  await page.mouse.move(previewBox!.x + 80, previewBox!.y + 80);
  await page.mouse.down();
  await page.mouse.move(previewBox!.x + 220, previewBox!.y + 170);
  await page.mouse.up();
  const queueButton = page.getByRole('button', { name: 'Queue' });
  await expect(queueButton).toBeEnabled();
  await queueButton.click();
  const queuedStrip = page.getByTestId('chat-queued-send-strip');
  await expect(queuedStrip).toBeVisible();
  await expect(queuedStrip).toContainText('Mark this hero crop');
  await expect(queuedStrip).toContainText('1 mark');

  await page.getByTestId('manual-edit-mode-toggle').click();
  await expect(page.getByTestId('manual-edit-mode-toggle')).toHaveAttribute('aria-pressed', 'true');
  await selectPreviewElementThroughBridge(page, artifactPreviewFrame(page), '[data-od-id="hero-title"]', 'TYPOGRAPHY');
  await expect(page.locator('.manual-edit-modal')).toContainText('Hero title');
  await expect(page.locator('.manual-edit-modal')).toContainText('TYPOGRAPHY');
  await expect(page.getByRole('button', { name: /^Save$/ })).toBeVisible();
});

async function selectStyleRowInput(
  page: Page,
  frame: ReturnType<Page['frameLocator']>,
  selector: string,
  section: string,
  label: string,
) {
  await frame.locator(selector).evaluate((el) => {
    const element = el as HTMLElement;
    const rect = element.getBoundingClientRect();
    const styles = window.getComputedStyle(element);
    window.parent.postMessage({
      type: 'od-edit-select',
      target: {
        id: element.dataset.odId ?? element.id,
        kind: 'text',
        label: element.textContent?.trim() || element.tagName.toLowerCase(),
        tagName: element.tagName.toLowerCase(),
        className: typeof element.className === 'string' ? element.className : '',
        text: element.textContent?.trim() ?? '',
        rect: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
        fields: { text: element.textContent?.trim() ?? '' },
        attributes: Object.fromEntries(Array.from(element.attributes).map((attr) => [attr.name, attr.value])),
        styles: {
          fontFamily: styles.fontFamily,
          fontSize: styles.fontSize,
          fontWeight: styles.fontWeight,
          color: styles.color,
          textAlign: styles.textAlign,
          lineHeight: styles.lineHeight,
          letterSpacing: styles.letterSpacing,
          width: styles.width,
          height: styles.height,
          minHeight: styles.minHeight,
          gap: styles.gap,
          flexDirection: styles.flexDirection,
          justifyContent: styles.justifyContent,
          alignItems: styles.alignItems,
          backgroundColor: styles.backgroundColor,
          opacity: styles.opacity,
          padding: styles.padding,
          paddingTop: styles.paddingTop,
          paddingRight: styles.paddingRight,
          paddingBottom: styles.paddingBottom,
          paddingLeft: styles.paddingLeft,
          margin: styles.margin,
          marginTop: styles.marginTop,
          marginRight: styles.marginRight,
          marginBottom: styles.marginBottom,
          marginLeft: styles.marginLeft,
          border: styles.border,
          borderTopWidth: styles.borderTopWidth,
          borderRightWidth: styles.borderRightWidth,
          borderBottomWidth: styles.borderBottomWidth,
          borderLeftWidth: styles.borderLeftWidth,
          borderStyle: styles.borderStyle,
          borderColor: styles.borderColor,
          borderRadius: styles.borderRadius,
        },
        isLayoutContainer: false,
        outerHtml: element.outerHTML,
      },
    }, '*');
  });
  await expect(page.locator('.manual-edit-modal')).toContainText('TYPOGRAPHY');
  const row = inspectorSection(page, section).locator('.cc-row').filter({ hasText: label }).locator('input');
  await expect(row).toBeVisible();
  return row;
}

test('[P0] manual edit mode keeps deck navigation available for deck-shaped HTML', async ({ page }) => {
  await routeMockAgents(page);
  const projectId = await createEmptyProject(page, 'Manual edit deck smoke');
  await seedDeckArtifact(page, projectId, 'manual-deck.html', 'Manual Deck', ['Slide One', 'Slide Two']);
  await page.goto(`/projects/${projectId}/files/manual-deck.html`);
  await openDesignFile(page, 'manual-deck.html');

  const frame = artifactPreviewFrame(page);
  await expect(frame.getByText('Slide One')).toBeVisible();
  await page.getByLabel('Next slide').click();
  await expect(frame.getByText('Slide Two')).toBeVisible();
});


test('[P0] simple deck keeps the active slide stable across preview mode switches', async ({ page }) => {
  await routeMockAgents(page);
  const projectId = await createEmptyProject(page, 'Simple deck navigation state');
  await seedDeckArtifact(page, projectId, 'simple-deck.html', 'Simple Deck', ['Slide One', 'Slide Two', 'Slide Three']);
  await page.goto(`/projects/${projectId}/files/simple-deck.html`);
  await openDesignFile(page, 'simple-deck.html');

  const frame = artifactPreviewFrame(page);
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

test('[P0] @critical HTML preview stays rendered after switching from Preview to Code and back', async ({ page }) => {
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

  const previewFrame = artifactPreview(page);
  await expect(previewFrame).toBeVisible();
  await expect(
    artifactPreviewFrame(page).getByRole('heading', { name: 'Toggle Preview Stable' }),
  ).toBeVisible();

  const viewModeTabs = page.getByRole('tablist', { name: 'View mode' });
  await viewModeTabs.getByRole('tab', { name: 'Code' }).click();
  await expect(page.locator('.viewer-source')).toContainText('Toggle Preview Stable');

  await viewModeTabs.getByRole('tab', { name: 'Preview' }).click();
  await expect(previewFrame).toBeVisible();
  await expect(
    artifactPreviewFrame(page).getByRole('heading', { name: 'Toggle Preview Stable' }),
  ).toBeVisible();
  await expect(
    artifactPreviewFrame(page).getByText('Still visible after tab switches.'),
  ).toBeVisible();
});

test('[P0] @critical edited HTML file restores selected tab, source, and preview after reload', async ({ page }) => {
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

  await page
    .getByRole('tablist', { name: 'Design Files' })
    .getByRole('tab', { name: /^Design Files$/ })
    .click();
  await openDesignFile(page, 'restore-edit.html');

  const restoreTab = tabBySuffix(page, 'restore-edit.html');
  const secondaryTab = tabBySuffix(page, 'secondary-preview.html');
  await expect(restoreTab).toBeVisible();
  await expect(restoreTab).toHaveAttribute('aria-selected', 'true');
  await expect(secondaryTab).toBeVisible();
  await expect(secondaryTab).toHaveAttribute('aria-selected', 'false');

  const frame = artifactPreviewFrame(page);
  await expect(frame.getByRole('heading', { name: 'Original Hero' })).toBeVisible();
  await page.getByTestId('manual-edit-mode-toggle').click();
  await selectPreviewElementThroughBridge(page, frame, '[data-od-id="hero-title"]', 'TYPOGRAPHY');
  const fontSizeInput = inspectorSection(page, 'TYPOGRAPHY').locator('.cc-row').filter({ hasText: 'Size' }).locator('input');
  await expect(fontSizeInput).toBeVisible();
  await fontSizeInput.fill('52');
  await inspectorSection(page, 'TYPOGRAPHY').locator('.cc-row').filter({ hasText: 'Color' }).locator('input').fill('#2563eb');
  await inspectSaveButton(page).click({ force: true });
  await expectFileSource(page, projectId, 'restore-edit.html', ['font-size: 52px', 'color:']);

  await page.getByTestId('manual-edit-mode-toggle').click();
  const viewModeTabs = page.getByRole('tablist', { name: 'View mode' });
  await viewModeTabs.getByRole('tab', { name: 'Code' }).click();
  await expect(page.locator('.viewer-source')).toContainText('font-size: 52px');
  await expect(restoreTab).toHaveAttribute('aria-selected', 'true');
  await expect(secondaryTab).toHaveAttribute('aria-selected', 'false');

  await page.reload();
  await waitForLoadingToClear(page);
  await expect(page.getByTestId('file-workspace')).toBeVisible();
  const restoredTab = tabBySuffix(page, 'restore-edit.html');
  await expect(restoredTab).toBeVisible();
  await expect(restoredTab).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tablist', { name: 'View mode' }).getByRole('tab', { name: 'Code' }).click();
  await expect(page.locator('.viewer-source')).toContainText('font-size: 52px');

  await page.getByRole('tablist', { name: 'View mode' }).getByRole('tab', { name: 'Preview' }).click();
  await expect(artifactPreview(page)).toBeVisible();
  const restoredFrame = artifactPreviewFrame(page);
  const restoredTitle = restoredFrame.getByRole('heading', { name: 'Original Hero' });
  await expect(restoredTitle).toBeVisible();
  await expect.poll(async () => restoredTitle.evaluate((el) => getComputedStyle(el).fontSize)).toBe('52px');
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
    await privacyDialog.getByRole('button', { name: /I get it|not now|got it|don't share/i }).click();
    await expect(privacyDialog).toHaveCount(0);
  }
  await expect(page.getByTestId('home-hero')).toBeVisible();
  await expect(page.getByTestId('home-hero-input')).toBeVisible();
}

async function openNewProjectModal(page: Page) {
  await ensureRailOpen(page);
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
  let runCount = 0;
  await page.route('**/api/runs', async (route) => {
    runCount += 1;
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({ runId: `preview-tools-run-${runCount}` }),
    });
  });
  await page.route('**/api/runs/*/events', async () => {
    await new Promise(() => undefined);
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
  const preview = artifactPreview(page);
  const filePattern = new RegExp(fileName.replace(/\./g, '\\.'), 'i');
  const fileTabButton = page.getByRole('tab', { name: filePattern }).first();
  let tabFound = true;
  try {
    await fileTabButton.waitFor({ state: 'visible', timeout: 5_000 });
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
