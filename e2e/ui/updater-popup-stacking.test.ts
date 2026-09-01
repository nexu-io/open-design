import { expect, test } from '@/playwright/suite';
import {
  applyStandardMocks,
  routeSignedOutVelaStatus,
} from '@/playwright/mock-factory';
import { mockAmrPersonalWorkspace } from '@/playwright/amr';
import { T } from '@/timeouts';

const RECENT_PROJECTS = Array.from({ length: 6 }, (_, i) => ({
  id: `proj-${i}`,
  name: `Project ${i}`,
  skillId: null,
  designSystemId: null,
  createdAt: 1700000000000 + i,
  updatedAt: 1700000000000 + i,
}));

// Regression boundary: the desktop update-ready prompt and the home composer's
// model picker can be open at the same time. The updater lives in the shared
// top-right cluster for both signed-in and signed-out shells. Signed-in keeps
// the prompt within the viewport; signed-out stays clear of the raised composer
// card and its popover in a compact window.

test.beforeEach(async ({ page }) => {
  await applyStandardMocks(page);
  await page.route('**/api/projects', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({ json: { projects: RECENT_PROJECTS } });
  });
  // Fake the packaged-desktop host bridge with a fully-downloaded update so
  // the nav rail shows the updater indicator and its ready prompt.
  await page.addInitScript(() => {
    const downloadedStatus = {
      arch: 'arm64',
      availableVersion: '0.14.1-prerelease.2',
      capabilities: {
        canApplyInPlace: false,
        canDownload: true,
        canOpenInstaller: true,
        requiresManualInstall: true,
      },
      channel: 'prerelease',
      currentVersion: '0.14.1-prerelease.1',
      downloadPath: '/tmp/open-design-update.dmg',
      enabled: true,
      mode: 'package-launcher',
      platform: 'darwin',
      state: 'downloaded',
      supported: true,
    };
    (window as unknown as { __od__?: unknown }).__od__ = {
      version: 2,
      client: { type: 'desktop', platform: 'darwin', osLocale: 'en-US' },
      browser: { clearData: async () => ({ ok: true }) },
      capture: { page: async () => ({ ok: false, reason: 'not mocked' }) },
      pdf: { print: async () => ({ ok: true }) },
      pet: { setVisible: () => {} },
      project: {
        pickAndImport: async () => ({ ok: false, canceled: true }),
        pickAndReplaceWorkingDir: async () => ({ ok: false, canceled: true }),
      },
      shell: {
        openExternal: async () => ({ ok: true }),
        openPath: async () => ({ ok: true }),
      },
      updater: {
        status: async () => downloadedStatus,
        check: async () => downloadedStatus,
        'clear-cache': async () => downloadedStatus,
        download: async () => downloadedStatus,
        install: async () => downloadedStatus,
        quit: async () => ({ ok: true }),
        setMenuLabels: async () => ({ ok: true }),
        subscribe: () => () => {},
        subscribeOpenDialog: () => () => {},
      },
    };
  });
});

for (const direction of ['ltr', 'rtl'] as const) {
  test(`[P1] signed-in ${direction.toUpperCase()} update prompt opens below the standalone rocket within the viewport`, async ({
    page,
  }) => {
    await mockAmrPersonalWorkspace(page);
    await page.setViewportSize({ width: 700, height: 600 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.getByText('Loading OpenDesign…').waitFor({ state: 'hidden', timeout: T.long });
    await expect(page.getByTestId('entry-nav-account')).toBeVisible();
    await page.locator('html').evaluate((element, dir) => element.setAttribute('dir', dir), direction);

    const updaterButton = page.getByTestId('entry-nav-updater');
    await updaterButton.click();
    const popup = page.getByTestId('updater-popup');
    await expect(popup).toBeVisible();

    const geometry = await page.evaluate(() => {
      const rocket = document.querySelector('[data-testid="entry-nav-updater"]');
      const prompt = document.querySelector('[data-testid="updater-popup"]');
      if (rocket == null || prompt == null) return null;
      const rocketRect = rocket.getBoundingClientRect();
      const promptRect = prompt.getBoundingClientRect();
      return {
        rocketBottom: rocketRect.bottom,
        rocketRight: rocketRect.right,
        promptTop: promptRect.top,
        promptLeft: promptRect.left,
        promptRight: promptRect.right,
        viewportWidth: window.innerWidth,
      };
    });

    expect(geometry, 'standalone updater rocket and prompt must both be measurable').not.toBeNull();
    expect(geometry!.promptTop, 'prompt must open below the standalone rocket').toBeGreaterThan(
      geometry!.rocketBottom,
    );
    expect(
      Math.abs(geometry!.promptRight - geometry!.rocketRight),
      'prompt must stay right-aligned to the physically right-pinned rocket',
    ).toBeLessThanOrEqual(1);
    expect(geometry!.promptLeft, 'prompt must stay inside the viewport left edge').toBeGreaterThanOrEqual(0);
    expect(geometry!.promptRight, 'prompt must stay inside the viewport right edge').toBeLessThanOrEqual(
      geometry!.viewportWidth,
    );
  });
}

test('[P1] signed-out update prompt stays clear of the composer and its agent picker', async ({ page }) => {
  await routeSignedOutVelaStatus(page);
  await page.setViewportSize({ width: 700, height: 600 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByText('Loading OpenDesign…').waitFor({ state: 'hidden', timeout: T.long });
  await expect(page.getByTestId('home-hero')).toBeVisible();

  // Signed-out has no account capsule, but the updater keeps the same
  // top-right cluster home and remains directly actionable.
  await expect(page.getByTestId('entry-nav-account')).toHaveCount(0);
  const updaterButton = page
    .locator('.entry-top-right-cluster')
    .getByTestId('entry-nav-updater');
  await expect(updaterButton).toBeVisible();
  await updaterButton.click();
  const popup = page.getByTestId('updater-popup');
  await expect(popup).toBeVisible();

  // Open the composer's agent picker with the keyboard. The prompt dismisses
  // on outside MOUSEDOWN only, so keyboard activation keeps both surfaces
  // open at once — the state users hit when the prompt is up (e.g. while an
  // install is in flight) and they interact with the composer.
  const chip = page.getByTestId('inline-model-switcher-chip');
  await chip.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('inline-model-switcher-popover')).toBeVisible();
  await expect(popup).toBeVisible();

  await expect(page.getByTestId('inline-model-switcher-popover')).toBeVisible();
  await expect(popup).toBeVisible();

  // Moving the signed-out updater from the rail footer to the top-right cluster
  // removes the old collision altogether. Keep the geometry assertion after
  // both surfaces open so a future repositioning cannot silently put the
  // prompt back across the composer or its popover.
  const overlapAreas = await page.evaluate(() => {
    const popupEl = document.querySelector('[data-testid="updater-popup"]');
    const overlays = [
      document.querySelector('.home-hero__input-card'),
      document.querySelector('[data-testid="inline-model-switcher-popover"]'),
    ];
    if (popupEl == null || overlays.some((el) => el == null)) {
      return null;
    }
    const p = popupEl.getBoundingClientRect();
    return overlays.map((overlay) => {
      const r = (overlay as Element).getBoundingClientRect();
      const width = Math.min(p.right, r.right) - Math.max(p.left, r.left);
      const height = Math.min(p.bottom, r.bottom) - Math.max(p.top, r.top);
      return width > 0 && height > 0 ? width * height : 0;
    });
  });

  expect(
    overlapAreas,
    'popup, composer card, and agent picker must all be measurable',
  ).not.toBeNull();
  expect(overlapAreas, 'signed-out updater prompt must stay clear of composer surfaces').toEqual([0, 0]);
});
