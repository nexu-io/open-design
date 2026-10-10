import { expect, test } from '@/playwright/suite';
import { applyStandardMocks, STORAGE_KEY } from '@/playwright/mock-factory';
import { ensureRailOpen } from '@/playwright/rail';
import { T } from '@/timeouts';

test.describe.configure({ timeout: T.xlong });

for (const mode of ['daemon', 'api'] as const) {
  test(`[P1] empty ${mode === 'daemon' ? 'CLI' : 'BYOK'} Home keeps its top reachable and scrolls overflowing content`, async ({ page }, testInfo) => {
    await applyStandardMocks(page);
    await page.addInitScript(({ key, mode }) => {
      const config = JSON.parse(localStorage.getItem(key) ?? '{}');
      localStorage.setItem(key, JSON.stringify({
        ...config,
        mode,
        ...(mode === 'api' ? {
          apiKey: 'layout-test-key',
          apiProtocol: 'openai',
          baseUrl: 'https://provider.example.test/v1',
        } : {}),
      }));
    }, { key: STORAGE_KEY, mode });
    await page.route('**/api/projects', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ json: { projects: [] } });
      } else {
        await route.fallback();
      }
    });
    await page.setViewportSize({ width: 1200, height: 480 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.getByText('Loading OpenDesign…').waitFor({ state: 'hidden', timeout: T.long });
    await expect(page.getByTestId('home-view')).toHaveClass(/home-view--centered/);
    await ensureRailOpen(page);

    // Cover the entry and hero breakpoint boundaries, the report's window
    // proportions, and a tall window where the empty Home should still center.
    for (const size of [
      { width: 1200, height: 480 },
      { width: 1365, height: 833 },
      { width: 901, height: 480 },
      { width: 899, height: 480 },
      { width: 761, height: 480 },
      { width: 759, height: 480 },
      { width: 375, height: 667 },
      { width: 1280, height: 1000 },
    ]) {
      await page.setViewportSize(size);
      const scroll = page.locator('.entry-main--scroll');
      await scroll.evaluate((element) => { element.scrollTop = 0; });
      const geometry = () => page.evaluate(() => {
        const scroll = document.querySelector('.entry-main--scroll')!;
        const hero = document.querySelector('.home-view > .home-hero')!;
        const home = document.querySelector('.home-view')!.getBoundingClientRect();
        const viewport = scroll.getBoundingClientRect();
        const content = hero.getBoundingClientRect();
        return {
          top: content.top - viewport.top,
          bottom: content.bottom - viewport.bottom,
          scrollTop: scroll.scrollTop,
          overflow: scroll.scrollHeight - scroll.clientHeight,
          horizontalOverflow: scroll.scrollWidth - scroll.clientWidth,
          centerOffset: (content.top + content.bottom - home.top - home.bottom) / 2,
        };
      });
      await testInfo.attach(`home-${mode}-${size.width}x${size.height}`, {
        body: await page.screenshot(), contentType: 'image/png',
      });
      await expect.poll(async () => (await geometry()).top,
        { message: `Home's header must remain reachable at ${size.width}x${size.height}` },
      ).toBeGreaterThanOrEqual(0);
      expect((await geometry()).horizontalOverflow).toBe(0);

      if ((await geometry()).overflow > 1) {
        const box = await scroll.boundingBox();
        if (!box) throw new Error('Home scroll viewport is missing');
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.wheel(0, 3000);
        await expect.poll(async () => (await geometry()).scrollTop).toBeGreaterThan(0);
        await expect.poll(async () => (await geometry()).bottom).toBeLessThanOrEqual(1);
        await page.mouse.wheel(0, -3000);
        await expect.poll(async () => (await geometry()).scrollTop).toBe(0);
        expect((await geometry()).top).toBeGreaterThanOrEqual(0);
      } else {
        expect((await geometry()).bottom).toBeLessThanOrEqual(0);
        expect(Math.abs((await geometry()).centerOffset)).toBeLessThanOrEqual(1);
      }
    }
  });
}
