import { expect, test } from '@/playwright/suite';

// Allow unmuted autoplay, as the desktop app does. The blocked-autoplay case
// below emulates a stricter browser on top of this.
test.use({ launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } });

test('[P1] motion soundtrack starts with the preview and follows play, pause and backward seek', async ({ page }) => {
  await page.goto('/api/plugins/example-motion-showreel/preview');
  const sound = page.getByRole('button', { name: 'Mute sound' });
  await expect(sound).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.locator('audio').evaluate((el: HTMLAudioElement) => !el.paused && el.currentTime > .5)).toBe(true);
  await page.getByRole('button', { name: 'Play or pause' }).click();
  await expect.poll(() => page.locator('audio').evaluate((el: HTMLAudioElement) => el.paused)).toBe(true);
  await page.getByRole('slider').fill('0.2');
  await expect.poll(() => page.locator('audio').evaluate((el: HTMLAudioElement) => Math.abs(el.currentTime - .2))).toBeLessThan(.13);
  await sound.click();
  await expect(page.getByRole('button', { name: 'Enable sound' })).toHaveAttribute('aria-pressed', 'false');
});

test('[P1] motion soundtrack blocked by autoplay starts on the first click', async ({ page }) => {
  // Emulate a browser that refuses unmuted playback before a user gesture.
  await page.addInitScript(() => {
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      if (!navigator.userActivation.hasBeenActive) return Promise.reject(new DOMException('blocked', 'NotAllowedError'));
      return play.call(this);
    };
  });
  await page.goto('/api/plugins/example-motion-showreel/preview');
  await expect(page.getByRole('button', { name: 'Enable sound' })).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => page.locator('audio').evaluate((el: HTMLAudioElement) => el.paused)).toBe(true);
  await page.locator('[data-composition-id]').click();
  await expect(page.getByRole('button', { name: 'Mute sound' })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.locator('audio').evaluate((el: HTMLAudioElement) => !el.paused)).toBe(true);
});
