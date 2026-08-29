import { expect, test } from '@/playwright/suite';
import { applyStandardMocks } from '@/playwright/mock-factory';
import { openSettingsDialog, settingsSurface } from '../lib/playwright/amr.js';
import type { Page } from '@playwright/test';

// Regression boundary for the Settings > About update row.
//
// `.settings-about-update-actions` holds two sibling buttons — the primary
// update action and "View release notes". JSX emits no whitespace text node
// between adjacent elements, so the row's spacing has to come from the
// container. #6142 (workspace-team + the #5517 redesign) dropped the whole
// `.settings-about-update-actions` / `.settings-about-update-button` /
// `.settings-about-release-link` rule group while keeping the class names in
// SettingsDialog.tsx, which left the container at `display: block` with no
// gap. The two inline-flex buttons then rendered with their borders touching
// at exactly 0px — the spacing QA reported against 0.20.0-prerelease.13.
//
// The row must read as two separate controls, so we assert both the declared
// gap (the 8px the settings surface uses everywhere else) and the distance the
// buttons actually end up at. The measured value is checked against a looser
// floor than 8 because sub-pixel button widths round the edge-to-edge distance
// down slightly (7.84px was observed at 8px gap); the point of the measurement
// is that the borders are not touching, which the declared gap alone would not
// prove if a later rule re-flowed the row.
const DECLARED_BUTTON_GAP = '8px';
const MIN_MEASURED_GAP_PX = 6;

/**
 * Stub the packaged-desktop host bridge with a fully downloaded update, and
 * report the app as packaged. Both are required for the About row to render
 * its primary action next to the release-notes link: `deriveAboutUpdateControl`
 * returns a null primary action for a development build or a non-desktop
 * environment, which would leave the row with a single button and hide the
 * spacing defect entirely.
 */
async function stubPackagedDesktopWithReadyUpdate(page: Page) {
  await page.route('**/api/version', async (route) => {
    await route.fulfill({
      json: {
        version: {
          version: '0.20.0-prerelease.13',
          channel: 'prerelease',
          packaged: true,
          platform: 'darwin',
          arch: 'arm64',
        },
      },
    });
  });

  await page.addInitScript(() => {
    const downloadedStatus = {
      arch: 'arm64',
      availableVersion: '0.20.1-prerelease.3',
      capabilities: {
        canApplyInPlace: true,
        canDownload: true,
        canOpenInstaller: true,
        requiresManualInstall: false,
      },
      channel: 'prerelease',
      currentVersion: '0.20.0-prerelease.13',
      downloadPath: '/tmp/open-design-update.zip',
      enabled: true,
      mode: 'package-launcher',
      platform: 'darwin',
      state: 'downloaded',
      supported: true,
      updateKind: 'payload',
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
}

test('[P2] Settings > About keeps the update action and release-notes link visually separated', async ({ page }) => {
  await applyStandardMocks(page);
  await stubPackagedDesktopWithReadyUpdate(page);

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await openSettingsDialog(page);

  await settingsSurface(page)
    .locator('.settings-nav-item', { has: page.locator('strong', { hasText: /^(About|关于)$/i }) })
    .first()
    .click();

  const actions = page.locator('.settings-about-update-actions');
  await expect(actions).toBeVisible();
  // Guard the fixture itself: a single-button row cannot show the defect, so a
  // regression in the stub must fail loudly instead of passing vacuously.
  await expect(actions.locator('> button')).toHaveCount(2);

  const layout = await actions.evaluate((el) => {
    const style = getComputedStyle(el);
    const [first, second] = [...el.children] as HTMLElement[];
    if (!first || !second) throw new Error('expected two update action controls');
    return {
      display: style.display,
      columnGap: style.columnGap,
      gapPx: second.getBoundingClientRect().left - first.getBoundingClientRect().right,
    };
  });

  expect(
    layout.display,
    'the update actions row must lay its two buttons out as a flex row so the container owns their spacing',
  ).toBe('flex');
  expect(
    layout.columnGap,
    'the update actions row must declare the settings surface control gap',
  ).toBe(DECLARED_BUTTON_GAP);
  expect(
    layout.gapPx,
    `update action and release-notes link sit ${layout.gapPx}px apart; their borders collide below ${MIN_MEASURED_GAP_PX}px`,
  ).toBeGreaterThanOrEqual(MIN_MEASURED_GAP_PX);
});
