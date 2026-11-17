import { expect, test } from '@/playwright/suite';
import { applyStandardMocks } from '@/playwright/mock-factory';
import { pickHomeTemplate } from '@/playwright/home-hero';

test('[P1] fresh checkout shows five motion covers without local or CDN bakes', async ({ page }, testInfo) => {
  await applyStandardMocks(page);
  await page.route(/\/api\/plugins(?:\?.*)?$/, async route => {
    const response = await route.fetch();
    const data = await response.json() as {
      plugins: { manifest?: { od?: { bakedPreview?: unknown } } }[];
    };
    for (const plugin of data.plugins) {
      if (plugin.manifest?.od) delete plugin.manifest.od.bakedPreview;
    }
    await route.fulfill({ response, json: data });
  });
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('home-hero')).toBeVisible();
  await pickHomeTemplate(page, 'motion-design');
  const motionOrder = ['visual-lesson', 'future', 'showreel', 'ui-morph', 'product-promo'];
  const cards = page.getByTestId('home-hero-plugin-preset');
  await expect(cards).toHaveCount(motionOrder.length);
  await expect.poll(() => cards.evaluateAll((rows) => rows.map((row) => row.getAttribute('data-plugin-id'))))
    .toEqual(motionOrder.map((name) => `example-motion-${name}`));
  await expect(cards.first()).toContainText('Bring Ideas to Life');
  for (const name of motionOrder) {
    const row = page.locator(`[data-testid="home-hero-plugin-preset"][data-plugin-id="example-motion-${name}"]`);
    const cover = row.locator('img');
    await cover.scrollIntoViewIfNeeded();
    await expect(cover).toHaveAttribute('src', `/api/plugins/example-motion-${name}/asset/assets/cover.jpg`);
    await expect.poll(() => cover.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  }
  await testInfo.attach('five-bundled-motion-covers', { body: await page.screenshot(), contentType: 'image/png' });
  const first = cards.first();
  await first.getByRole('button').click();
  await expect(page.locator('iframe[src*="/api/plugins/example-motion-visual-lesson/preview"]')).toBeVisible();
});

for (const name of ['showreel', 'ui-morph', 'future', 'product-promo', 'visual-lesson']) {
  test(`[P1] motion-${name} gallery capture contains only the composition`, async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(`/api/plugins/example-motion-${name}/preview`);
    await expect(page.locator('[data-composition-id]')).toBeVisible();
    await expect(page.locator('#controls')).toHaveCSS('opacity', '0');
    const bounds = await page.locator('[data-composition-id]').boundingBox();
    expect(bounds).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
    // The existing baker captures a taller viewport; the film must stay centered
    // so the gallery's 16:9 cover crop retains the complete composition.
    await page.setViewportSize({ width: 1440, height: 1099 });
    await expect.poll(() => page.locator('[data-composition-id]').boundingBox())
      .toEqual({ x: 0, y: 144.5, width: 1440, height: 810 });
  });

  test(`[P1] motion-${name} leaves playback controls to the project player`, async ({ page }) => {
    // Inside a project the motion source player owns playback; the film's own bar must not double it.
    await page.addInitScript(() => {
      Object.assign(window, { __odMotionSourcePlayer: true });
    });
    await page.goto(`/api/plugins/example-motion-${name}/preview`);
    await page.waitForFunction(() => Boolean((window as unknown as { __timelines?: unknown }).__timelines));
    await expect(page.locator('#controls')).toBeHidden();
  });

  test(`[P1] motion-${name} exports the full composition without preview controls`, async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    // This is the marker installed by the daemon's existing frame bridge.
    // Actual MP4 encoding is verified separately through that renderer.
    await page.addInitScript(() => {
      Object.assign(window, { __odFrameRenderer: {} });
    });
    await page.goto(`/api/plugins/example-motion-${name}/preview`);
    await expect(page.locator('html')).toHaveClass(/od-export/);
    await expect(page.locator('#controls')).toBeHidden();
    const bounds = await page.locator('[data-composition-id]').boundingBox();
    expect(bounds).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
  });
  test(`[P1] motion-${name} draws every frame from timeline time, including backward export seeks`, async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(`/api/plugins/example-motion-${name}/preview`);
    await page.waitForFunction(() => Boolean((window as unknown as { __timelines?: unknown }).__timelines));
    await page.evaluate(() => document.fonts.ready);
    const hashes = await page.evaluate(async () => {
      const tl = (window as unknown as {
        __timelines: { main: { pause(): void; duration(): number; totalTime(t: number, suppressEvents: boolean): void } };
      }).__timelines.main;
      tl.pause();
      const d = tl.duration();
      const times = [0.3, 0.45, 0.7, 0.9].map((k) => k * d);
      const sample = async (time: number) => {
        // The exporter seeks with callbacks suppressed; drawing must follow anyway.
        tl.totalTime(time, true);
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        return [...document.querySelectorAll('[data-composition-id] canvas')]
          .map((canvas) => (canvas as HTMLCanvasElement).toDataURL('image/png'))
          .join('|');
      };
      const forward = [];
      for (const time of times) forward.push(await sample(time));
      const backward = [];
      for (const time of [...times].reverse()) backward.push(await sample(time));
      return { forward, backward: backward.reverse() };
    });
    expect(new Set(hashes.forward).size).toBe(hashes.forward.length);
    expect(hashes.backward).toEqual(hashes.forward);
  });
}
