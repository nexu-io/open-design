import { expect, test } from '@/playwright/suite';
import type { Page } from '@playwright/test';
import { routeAgents } from '@/playwright/mock-factory';
import { T } from '@/timeouts';

// Regression (0.14.1 acceptance): scroll the home view so the composer card
// slides under the sticky topbar strip, then open the composer's agent/model
// switcher. Opening any composer popover elevated the whole input card to
// z-index 1700 — far above the topbar's z-index 10 — so the card body painted
// over the topbar chips (GitHub star, Teams, Discord, settings). The sticky
// topbar is opaque chrome: content scrolling underneath must stay behind it
// in every composer state, while the composer's popovers still need to paint
// above the static home content below the card.

test.describe.configure({ timeout: T.xlong });

const STORAGE_KEY = 'open-design:config';

const HOME_CONFIG = {
  mode: 'daemon',
  apiKey: '',
  baseUrl: 'https://api.anthropic.com',
  model: 'default',
  agentId: 'codex',
  skillId: null,
  designSystemId: null,
  onboardingCompleted: true,
  agentModels: { codex: { model: 'default' } },
  privacyDecisionAt: 1,
  telemetry: { metrics: false, content: false, artifactManifest: false },
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.clear();
      window.sessionStorage.clear();
      window.localStorage.setItem(key, JSON.stringify(value));
    },
    { key: STORAGE_KEY, value: HOME_CONFIG },
  );

  await page.route('**/api/github/open-design', async (route) => {
    await route.fulfill({ json: { stargazers_count: 51600 } });
  });

  await routeAgents(page, [
    {
      id: 'codex',
      name: 'Codex CLI',
      bin: 'codex',
      available: true,
      version: '0.80.0',
      models: [{ id: 'default', label: 'Default' }],
    },
  ]);

  await page.route('**/api/app-config', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({ json: { config: HOME_CONFIG } });
  });

  await page.route('**/api/projects', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { projects: [] } });
      return;
    }
    await route.continue();
  });
});

test('[P1] sticky topbar chips stay above the composer card while its switcher popover is open', async ({
  page,
}) => {
  // Narrow enough that the centered 720px composer card horizontally overlaps
  // the right-aligned topbar chip cluster; short enough that the home view
  // scrolls. Keep width above the 900px compact-topbar breakpoint so the chip
  // cluster stays visible.
  await page.setViewportSize({ width: 1120, height: 640 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByText('Loading Open Design…').waitFor({ state: 'hidden', timeout: 15_000 });
  await expect(page.getByTestId('entry-star-badge')).toBeVisible();
  await expect(page.getByTestId('home-hero-input')).toBeVisible();

  // Reveal the community templates section (first-run gesture) so the scroll
  // container has enough content height to slide the composer under the
  // sticky topbar strip.
  await page.mouse.wheel(0, 500);

  // Scroll the entry main container until the composer card's top edge sits
  // inside the sticky topbar strip, vertically overlapping the chip row.
  await scrollComposerUnderTopbar(page);

  // Open the composer's agent/model switcher — this is the state that
  // elevates the input card's stacking context.
  await page.getByTestId('inline-model-switcher-chip').click();
  const popover = page.getByTestId('inline-model-switcher-popover');
  await expect(popover).toBeVisible();

  const probe = await page.evaluate(() => {
    const badge = document.querySelector('[data-testid="entry-star-badge"]');
    const card = document.querySelector('.home-hero__input-card');
    if (!badge || !card) return { overlap: false, hits: [] as never[] };
    const b = badge.getBoundingClientRect();
    const c = card.getBoundingClientRect();
    const left = Math.max(b.left, c.left);
    const right = Math.min(b.right, c.right);
    const top = Math.max(b.top, c.top);
    const bottom = Math.min(b.bottom, c.bottom);
    const overlap = right - left > 2 && bottom - top > 2;
    const fractions = [0.3, 0.7];
    const hits = overlap
      ? fractions.map((f) => {
          const x = Math.round(left + (right - left) * f);
          const y = Math.round(top + (bottom - top) * 0.5);
          const el = document.elementFromPoint(x, y);
          return {
            x,
            y,
            inTopbar: !!el?.closest('.entry-main__topbar'),
            hitClass:
              el instanceof HTMLElement
                ? el.className.toString().slice(0, 60) || el.tagName
                : (el?.tagName ?? 'null'),
          };
        })
      : [];
    return { overlap, hits };
  });

  expect(
    probe.overlap,
    'test setup: the composer card should overlap the GitHub star chip after scrolling',
  ).toBe(true);
  const covered = probe.hits.filter((h) => !h.inTopbar);
  expect(
    covered,
    `composer card paints over the sticky topbar chips at: ${JSON.stringify(covered)}`,
  ).toEqual([]);

  // Guard the other side of the layering contract: the switcher popover must
  // still paint above the static home content below the card.
  const popoverProbe = await popover.evaluate((el: Element) => {
    const rect = el.getBoundingClientRect();
    const x = Math.round(rect.left + rect.width * 0.5);
    return [0.35, 0.6].map((f) => {
      const y = Math.round(rect.top + rect.height * f);
      const hit = document.elementFromPoint(x, y);
      return {
        f,
        insidePopover: !!hit?.closest('.inline-switcher__popover'),
        hitClass:
          hit instanceof HTMLElement
            ? hit.className.toString().slice(0, 60) || hit.tagName
            : (hit?.tagName ?? 'null'),
      };
    });
  });
  const leaks = popoverProbe.filter((p) => !p.insidePopover);
  expect(
    leaks,
    `home content bleeds through the open switcher popover at: ${JSON.stringify(leaks)}`,
  ).toEqual([]);
});

// Scrolls `.entry-main--scroll` so the composer card's top edge lands inside
// the sticky topbar strip (which stays pinned at the container's top). Fails
// loudly when the container cannot scroll far enough to create the overlap.
async function scrollComposerUnderTopbar(page: Page) {
  const result = await page.evaluate(() => {
    const scroller = document.querySelector('.entry-main--scroll');
    const card = document.querySelector('.home-hero__input-card');
    const topbar = document.querySelector('.entry-main__topbar');
    if (!scroller || !card || !topbar) return { ok: false, reason: 'missing nodes' };
    const topbarRect = topbar.getBoundingClientRect();
    // Land the card's top edge in the middle of the topbar strip.
    const targetTop = topbarRect.top + topbarRect.height * 0.5;
    const cardTop = card.getBoundingClientRect().top;
    scroller.scrollTop += cardTop - targetTop;
    const after = card.getBoundingClientRect().top;
    return {
      ok: after <= topbarRect.bottom - 4,
      reason: `card top ${Math.round(after)} vs topbar bottom ${Math.round(topbarRect.bottom)}`,
    };
  });
  expect(result.ok, `test setup: could not scroll the composer under the topbar (${result.reason})`).toBe(
    true,
  );
}
