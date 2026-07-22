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
      models: [
        { id: 'default', label: 'Default (CLI config)' },
        { id: 'gpt-5.6-sol', label: 'GPT-5.6-Sol' },
        { id: 'gpt-5.6-terra', label: 'GPT-5.6-Terra' },
        { id: 'gpt-5.6-luna', label: 'GPT-5.6-Luna' },
        { id: 'gpt-5.5', label: 'GPT-5.5' },
        { id: 'gpt-5.4', label: 'GPT-5.4' },
        { id: 'gpt-5.4-mini', label: 'GPT-5.4-Mini' },
        { id: 'gpt-5.3-codex-spark', label: 'GPT-5.3-Codex-Spark' },
        { id: 'codex-auto-review', label: 'Codex Auto Review' },
      ],
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
  await revealCommunityTemplates(page);

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

test('[P1] nested model picker stays inside the visible area below the sticky topbar', async ({
  page,
}) => {
  await openNestedModelPicker(page);

  const geometry = await page.evaluate(() => {
    const topbar = document.querySelector('.entry-main__topbar');
    const popover = document.querySelector('[data-testid="inline-model-switcher-agent-model-popover"]');
    if (topbar == null || popover == null) return null;
    const topbarRect = topbar.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();
    return {
      popoverBottom: popoverRect.bottom,
      popoverTop: popoverRect.top,
      topbarBottom: topbarRect.bottom,
      viewportHeight: window.innerHeight,
    };
  });

  expect(geometry, 'topbar and nested model picker must both be present').not.toBeNull();
  expect(geometry!.popoverTop).toBeGreaterThanOrEqual(geometry!.topbarBottom + 6);
  expect(geometry!.popoverBottom).toBeLessThanOrEqual(geometry!.viewportHeight - 8);
});

test('[P1] nested model picker follows the visible anchor and closes after it exits', async ({
  page,
}) => {
  await openNestedModelPicker(page);

  const modelPopover = page.getByTestId('inline-model-switcher-agent-model-popover');
  const switcherPopover = page.getByTestId('inline-model-switcher-popover');
  const modelList = modelPopover.locator('.model-select-searchable__list');

  const listCanScroll = await modelList.evaluate((element) => {
    element.scrollTop = 48;
    element.dispatchEvent(new Event('scroll'));
    return element.scrollHeight > element.clientHeight;
  });
  expect(listCanScroll, 'test setup: compact model list must have internal scroll room').toBe(true);
  await expect(modelPopover).toBeVisible();
  await expect(switcherPopover).toBeVisible();

  const beforeScroll = await modelAnchorGeometry(page);
  await page.locator('.entry-main--scroll').evaluate((element) => {
    element.scrollTop += 48;
    element.dispatchEvent(new Event('scroll'));
  });

  await expect(modelPopover).toBeVisible();
  await expect(switcherPopover).toBeVisible();
  const afterScroll = await modelAnchorGeometry(page);
  expect(afterScroll.placement).toBe(beforeScroll.placement);
  expect(afterScroll.gap).toBeGreaterThanOrEqual(5);
  expect(afterScroll.gap).toBeLessThanOrEqual(7);
  expect(afterScroll.popoverTop).toBeGreaterThanOrEqual(afterScroll.topbarBottom + 6);
  expect(afterScroll.popoverBottom).toBeLessThanOrEqual(afterScroll.viewportHeight - 8);

  await page.locator('.entry-main--scroll').evaluate((element) => {
    const chip = document.querySelector('[data-testid="inline-model-switcher-chip"]');
    const topbar = document.querySelector('.entry-main__topbar');
    if (chip == null || topbar == null) throw new Error('missing anchor geometry');
    const distanceToOcclusion =
      chip.getBoundingClientRect().bottom - topbar.getBoundingClientRect().bottom;
    element.scrollTop += Math.max(1, distanceToOcclusion + 12);
    element.dispatchEvent(new Event('scroll'));
  });

  await expect(modelPopover).toBeHidden();
  await expect(switcherPopover).toBeHidden();
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

async function openNestedModelPicker(page: Page) {
  // Keep the outer switcher's model field reachable without scrolling while
  // leaving too little room below it for the full nested model list.
  await page.setViewportSize({ width: 546, height: 640 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByText('Loading Open Design…').waitFor({ state: 'hidden', timeout: T.long });
  await expect(page.getByTestId('home-hero-input')).toBeVisible();
  await revealCommunityTemplates(page);

  await page.getByTestId('inline-model-switcher-chip').click();
  await expect(page.getByTestId('inline-model-switcher-popover')).toBeVisible();
  await page.getByTestId('inline-model-switcher-agent-model').click();
  await expect(page.getByTestId('inline-model-switcher-agent-model-popover')).toBeVisible();
}

async function modelAnchorGeometry(page: Page) {
  return page.evaluate(() => {
    const trigger = document.querySelector(
      '[data-testid="inline-model-switcher-agent-model"]',
    );
    const popover = document.querySelector(
      '[data-testid="inline-model-switcher-agent-model-popover"]',
    );
    const topbar = document.querySelector('.entry-main__topbar');
    if (trigger == null || popover == null || topbar == null) {
      throw new Error('missing model picker geometry');
    }
    const triggerRect = trigger.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();
    const placement = popoverRect.bottom <= triggerRect.top ? 'above' : 'below';
    return {
      gap:
        placement === 'above'
          ? triggerRect.top - popoverRect.bottom
          : popoverRect.top - triggerRect.bottom,
      placement,
      popoverBottom: popoverRect.bottom,
      popoverTop: popoverRect.top,
      topbarBottom: topbar.getBoundingClientRect().bottom,
      viewportHeight: window.innerHeight,
    };
  });
}

async function revealCommunityTemplates(page: Page) {
  await expect(page.getByTestId('home-templates-hint')).toBeVisible();
  await page.evaluate(() => {
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: 500 }));
  });
  await expect(page.locator('.home-templates-reveal')).toHaveClass(/is-revealed/);
  await page.locator('.entry-main--scroll').evaluate((element) => {
    element.scrollTop = 0;
    element.dispatchEvent(new Event('scroll'));
  });
}
