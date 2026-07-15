import { expect, test } from '@/playwright/suite';
import { applyStandardMocks } from '@/playwright/mock-factory';
import { T } from '@/timeouts';

// Recent-project fixtures give the home page enough height to scroll the
// composer card up under the sticky topbar, matching the reported window
// state (the user had scrolled; the hero heading was off-screen).
const RECENT_PROJECTS = Array.from({ length: 6 }, (_, i) => ({
  id: `proj-${i}`,
  name: `Project ${i}`,
  skillId: null,
  designSystemId: null,
  createdAt: 1700000000000 + i,
  updatedAt: 1700000000000 + i,
}));

// Regression: the desktop "update ready" prompt (`.updater-popup`) rendered
// BELOW the home composer. The popup lives inside `.entry-main__topbar`,
// which is `position: sticky; z-index: 10; isolation: isolate` — a sealed
// stacking context — so the popup's own `z-index: 80` cannot escape it.
// Meanwhile `.home-hero__input-card:has(.inline-switcher__popover)` raises
// the composer card to `z-index: 1700`, painting the card (and its agent
// picker) over the update prompt. The fix mirrors the settings-menu
// precedent: `.entry-main__topbar:has(.updater-popup)` lifts the topbar's
// stacking context while the prompt is open.

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
  // the topbar shows the updater indicator and its ready prompt.
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
        download: async () => downloadedStatus,
        install: async () => downloadedStatus,
        quit: async () => ({ ok: true }),
        subscribe: () => () => {},
      },
    };
  });
});

test('[P1] update ready prompt paints above the composer and its agent picker', async ({ page }) => {
  // Match the reported desktop window shape (1280x900 logical). The prompt
  // anchors to the sticky topbar, so it stays pinned to the viewport top.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByText('Loading Open Design…').waitFor({ state: 'hidden', timeout: T.long });
  await expect(page.getByTestId('home-hero')).toBeVisible();

  // Scroll the entry main pane until the composer card sits at the viewport
  // top, as in the bug report: the user had scrolled the home page, so the
  // in-flow composer card slid up under the sticky-topbar prompt. Wait for
  // the recent-projects fixtures to give the pane scroll room first.
  await page.waitForFunction(() => {
    const scroller = document.querySelector('.entry-main--scroll');
    return scroller != null && scroller.scrollHeight > scroller.clientHeight + 400;
  }, undefined, { timeout: T.long });
  // Scroll-and-verify inside one poll step: late-loading home sections can
  // reset the pane's scroll position, so re-issue the scroll until the card
  // actually holds near the top.
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const scroller = document.querySelector('.entry-main--scroll');
        const card = document.querySelector('.home-hero__input-card');
        if (scroller == null || card == null) return Number.NaN;
        const top = card.getBoundingClientRect().top;
        if (top > 80) scroller.scrollBy(0, top - 24);
        return card.getBoundingClientRect().top;
      }),
    )
    .toBeLessThan(80);

  await page.getByTestId('entry-nav-updater').click();
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
