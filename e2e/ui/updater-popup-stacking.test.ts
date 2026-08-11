import { expect, test } from '@/playwright/suite';
import { applyStandardMocks } from '@/playwright/mock-factory';
import { ensureRailOpen } from '@/playwright/rail';
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
// model picker can be open at the same time. The updater now lives in the nav
// rail, but it must still paint above the raised composer card and its popover
// wherever those independently positioned surfaces overlap.

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

test('[P1] update ready prompt paints above the composer and its agent picker', async ({ page }) => {
  test.fail(
    true,
    'The rail-hosted updater prompt currently paints behind the raised Home composer in compact windows.',
  );
  // In the current rail host the prompt grows upward from the footer. A compact
  // desktop window puts it across the centered composer and model popover.
  await page.setViewportSize({ width: 700, height: 600 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByText('Loading Open Design…').waitFor({ state: 'hidden', timeout: T.long });
  await expect(page.getByTestId('home-hero')).toBeVisible();

  // The updater host moved into the nav rail footer with the entry topbar's
  // removal (#5517); the collapsed rail is inert, so expand it first. Open the
  // control with the keyboard because this stacking test intentionally models
  // the signed-out shell, whose Cloud sign-in card overlaps the footer pointer
  // target. Updater pointer actionability is covered by its component tests.
  await ensureRailOpen(page);
  const updaterButton = page.getByTestId('entry-nav-updater');
  await updaterButton.focus();
  await page.keyboard.press('Enter');
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

  // Require real overlap now that both surfaces are present so the stacking
  // assertion cannot pass on separated geometry.
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const popupEl = document.querySelector('[data-testid="updater-popup"]');
        const card = document.querySelector('.home-hero__input-card');
        const popover = document.querySelector('[data-testid="inline-model-switcher-popover"]');
        if (popupEl == null || card == null || popover == null) return Number.NaN;
        const popupRect = popupEl.getBoundingClientRect();
        return Math.max(
          ...[card, popover].map((element) => {
            const rect = element.getBoundingClientRect();
            const width = Math.min(popupRect.right, rect.right) - Math.max(popupRect.left, rect.left);
            const height = Math.min(popupRect.bottom, rect.bottom) - Math.max(popupRect.top, rect.top);
            return width > 0 && height > 0 ? width * height : 0;
          }),
        );
      }),
    )
    .toBeGreaterThan(0);
  await expect(page.getByTestId('inline-model-switcher-popover')).toBeVisible();
  await expect(popup).toBeVisible();

  // The prompt is a dialog: it must be the topmost element wherever the
  // raised composer card or its agent-picker popover overlaps it. With the
  // stacking bug, `elementFromPoint` resolves to composer/picker content
  // instead of the prompt.
  const probe = await page.evaluate(() => {
    const popupEl = document.querySelector('[data-testid="updater-popup"]');
    const overlays = [
      document.querySelector('.home-hero__input-card'),
      document.querySelector('[data-testid="inline-model-switcher-popover"]'),
    ];
    if (popupEl == null || overlays.some((el) => el == null)) {
      return { ready: false, overlapArea: 0, samples: [] };
    }
    const p = popupEl.getBoundingClientRect();
    let overlapArea = 0;
    const samples: { x: number; y: number; insidePopup: boolean; hit: string }[] = [];
    for (const overlay of overlays) {
      const r = (overlay as Element).getBoundingClientRect();
      const left = Math.max(p.left, r.left);
      const right = Math.min(p.right, r.right);
      const top = Math.max(p.top, r.top);
      const bottom = Math.min(p.bottom, r.bottom);
      if (right - left < 4 || bottom - top < 4) continue;
      overlapArea += (right - left) * (bottom - top);
      for (const fx of [0.25, 0.5, 0.75]) {
        for (const fy of [0.25, 0.5, 0.75]) {
          const x = Math.round(left + (right - left) * fx);
          const y = Math.round(top + (bottom - top) * fy);
          const hit = document.elementFromPoint(x, y);
          samples.push({
            x,
            y,
            insidePopup: hit?.closest('[data-testid="updater-popup"]') != null,
            hit:
              hit instanceof HTMLElement
                ? hit.className.toString().slice(0, 60) || hit.tagName
                : (hit?.tagName ?? 'null'),
          });
        }
      }
    }
    return { ready: true, overlapArea, samples };
  });

  expect(probe.ready, 'popup, composer card, and agent picker must all be present').toBe(true);
  // Geometry precondition: the composer surfaces actually reach under the
  // prompt — otherwise this test would pass without exercising the stack.
  expect(probe.overlapArea, 'composer must overlap the prompt area').toBeGreaterThan(0);
  const leaks = probe.samples.filter((sample) => !sample.insidePopup);
  expect(
    leaks,
    `Composer content paints over the update prompt at: ${JSON.stringify(leaks)}`,
  ).toEqual([]);
});
