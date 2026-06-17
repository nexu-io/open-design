import { expect, test } from '@/playwright/suite';
import { ensureRailOpen } from '@/playwright/rail';
import {
  captureVisual,
  configureVisualPage,
  gotoVisualHome,
  scrollVisualLocatorIntoStableView,
  VISUAL_AMR_AGENT,
  VISUAL_CLI_AGENTS,
  waitForVisualFonts,
  waitForVisualProjects,
} from '@/playwright/visual';

test('[P2] captures the onboarding runtime selection surface', async ({ page }) => {
  await configureVisualPage(page, {
    projects: [],
    agents: [VISUAL_AMR_AGENT, ...VISUAL_CLI_AGENTS],
    config: {
      onboardingCompleted: false,
      agentId: 'amr',
      agentModels: { amr: { model: 'deepseek-v4-flash', reasoning: 'default' } },
    },
  });

  await page.goto('/onboarding', { waitUntil: 'domcontentloaded' });
  await expect(
    page.getByRole('heading', { name: /Choose a runtime|选择运行方式/i }),
  ).toBeVisible();
  await expect(page.getByText(/Open Design AMR/i)).toBeVisible();
  await expect(
    page
      .locator('.onboarding-view__amr-cloud-card .onboarding-view__model-picker')
      .getByRole('button'),
  ).toContainText(
    'DeepSeek V4 Flash',
  );
  await waitForVisualFonts(page);

  await captureVisual(page, 'visual-onboarding-runtime');
});

test('[P2] captures the visual home harness', async ({ page }) => {
  await configureVisualPage(page, { projects: [] });
  await gotoVisualHome(page);

  await expect(page.getByTestId('home-hero')).toBeVisible();
  await expect(page.getByTestId('home-hero-input')).toBeVisible();
  await waitForVisualProjects(page, []);

  await captureVisual(page, 'visual-home');
});

test('[P2] captures the home plugin catalog surface', async ({ page }) => {
  test.setTimeout(60_000);

  await configureVisualPage(page);
  await gotoVisualHome(page);

  // The redesigned entry shell keeps every view mounted (only the active one
  // is visible) so tab switches don't reload thumbnails. That means
  // `plugins-home-section` exists in both the home and plugins views, so
  // scope the lookup to the home view to keep these strict-mode locators
  // unambiguous.
  const home = page.getByTestId('entry-view-home');
  await expect(page.getByTestId('recent-projects-strip')).toBeVisible();
  const community = home.getByTestId('plugins-home-section');
  await expect(community).toBeVisible();
  await scrollVisualLocatorIntoStableView(page, community);
  await expect(home.locator('article.plugins-home__card--gallery').first()).toBeVisible();
  await expect(home.getByTestId('plugins-home-search')).toBeVisible();

  await captureVisual(page, 'visual-home-catalog');
});

test('[P2] captures the home plugin filtered surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);

  const home = page.getByTestId('entry-view-home');
  await home.getByTestId('plugins-home-pill-category-deck').click();
  await expect(home.locator('article.plugins-home__card[data-plugin-id="visual-deck-writer"]')).toBeVisible();

  await captureVisual(page, 'visual-home-plugin-filter');
});

test('[P2] captures the home plugin detail surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);

  const home = page.getByTestId('entry-view-home');
  await home.getByTestId('plugins-home-pill-category-deck').click();
  const card = home.locator('article.plugins-home__card[data-plugin-id="visual-deck-writer"]');
  await expect(card).toBeVisible();
  await card.hover();
  await home.getByTestId('plugins-home-details-visual-deck-writer').click({ force: true });
  await expect(page.getByRole('dialog', { name: /Deck Writer preview/i })).toBeVisible();
  await expect(page.getByTestId('plugin-details-use-visual-deck-writer')).toBeVisible();
  await expect(page.locator('.ds-modal-stage-iframe-scaler iframe')).toBeVisible();

  await captureVisual(page, 'visual-plugin-details');
});

test('[P2] captures the plugin detail share menu surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);

  const home = page.getByTestId('entry-view-home');
  await home.getByTestId('plugins-home-pill-category-deck').click();
  const card = home.locator('article.plugins-home__card[data-plugin-id="visual-deck-writer"]');
  await expect(card).toBeVisible();
  await card.hover();
  await home.getByTestId('plugins-home-details-visual-deck-writer').click({ force: true });
  await expect(page.getByRole('dialog', { name: /Deck Writer preview/i })).toBeVisible();
  await page.locator('.template-share-trigger').click();
  await expect(page.locator('.template-share-popover[role="menu"]')).toBeVisible();

  await captureVisual(page, 'visual-plugin-share-menu');
});

test('[P2] captures the home context picker surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);

  await page.getByTestId('home-hero-input').fill('@visual');
  await expect(page.getByTestId('home-hero-plugin-picker')).toBeVisible();
  await expect(page.getByRole('option', { name: /Prototype Starter/i })).toBeVisible();

  await captureVisual(page, 'visual-home-context-picker');
});

test('[P2] captures the home staged attachment surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);

  await page.getByTestId('home-hero-file-input').setInputFiles({
    name: 'visual-brief.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Visual regression fixture for staged home attachments.\n', 'utf8'),
  });
  await expect(page.getByTestId('home-hero-staged-files')).toContainText('visual-brief.txt');

  await captureVisual(page, 'visual-home-staged-attachment');
});

test('[P2] captures the home plugin use staged surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);

  const home = page.getByTestId('entry-view-home');
  await home.getByTestId('plugins-home-details-visual-prototype-starter').click({ force: true });
  await expect(page.getByRole('dialog', { name: /Prototype Starter details/i })).toBeVisible();
  await page.getByTestId('plugin-details-use-visual-prototype-starter').click();
  await expect(page.getByTestId('home-hero-active-plugin')).toContainText('Prototype Starter');
  await expect(page.getByTestId('home-hero-input')).toBeVisible();

  await captureVisual(page, 'visual-home-plugin-use-staged');
});

test('[P2] captures the home plugin use with query surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);

  const home = page.getByTestId('entry-view-home');
  await home.getByTestId('plugins-home-pill-category-deck').click();
  const card = home.locator('article.plugins-home__card[data-plugin-id="visual-deck-writer"]');
  await expect(card).toBeVisible();
  // Community gallery tiles carry no inline Use actions — use-with-query
  // lives behind the detail modal's split Use button.
  await home.getByTestId('plugins-home-details-visual-deck-writer').click({ force: true });
  // Deck Writer ships a previewEntry, so its detail surface is the
  // PreviewModal (aria-label "Deck Writer preview"), not the scenario
  // detail's "... details" dialog. Match on the plugin name only.
  await expect(page.getByRole('dialog', { name: /Deck Writer/i })).toBeVisible();
  await page.getByTestId('plugin-details-use-visual-deck-writer-menu').click();
  await page.getByTestId('plugin-details-use-with-query-visual-deck-writer').click();
  // use-with-query now seeds the rendered preset text (placeholders filled in),
  // not the raw `{{...}}` query — matching the example-prompt card path.
  await expect(page.getByTestId('home-hero-input')).toContainText('Draft a topic deck.');

  await captureVisual(page, 'visual-home-plugin-use-with-query');
});

test('[P2] captures the new project modal surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);

  await ensureRailOpen(page);
  await page.getByTestId('entry-nav-new-project').click();
  await expect(page.getByTestId('new-project-modal')).toBeVisible();
  await expect(page.getByTestId('new-project-panel')).toBeVisible();
  await expect(page.getByTestId('new-project-name')).toBeVisible();

  await captureVisual(page, 'visual-new-project-modal');
});
