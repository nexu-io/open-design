// Playwright spec: pet overlay corner anchor positioning and bubble-tail alignment.
//
// Red-on-main signal: the bubble-tail assertion (left: 18px for left-anchored
// corners) is the regression guard. On main, .pet-overlay[data-corner='top-left']
// .pet-bubble::after has no `left` override so the tail stays right-anchored.
// The assert verifies that computed `left` is a small positive value (~18px) for
// left-anchored corners, and computed `right` is small for right-anchored corners.
//
// Run from e2e/: pnpm exec playwright test -c playwright.config.ts pet-corner-anchor
// Ports: OD_PORT=18021, OD_WEB_PORT=18022

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const STORAGE_KEY = 'open-design:config';
// Separate key from the main config to avoid poisoning other suites.
const PET_POSITION_KEY = 'open-design:pet-position';

// The 120px clamp in PetOverlay means the overlay can sit up to ~120px away
// from an edge. The viewport in Desktop Chrome is 1280x720. An overlay that
// starts 24px from its anchor edge, with a 96px sprite, has its bounding box
// well inside 200px of the anchor corner. The sprite itself is 96px wide.
const QUAD_THRESHOLD = 200;

// The bubble ::after tail is pinned at 18px from the anchor-side edge. We allow
// a small rounding budget (1px) when comparing the resolved computed value.
const TAIL_OFFSET_PX = 18;
const TAIL_TOLERANCE_PX = 2;

type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

// Seeds localStorage so the pet is adopted and visible. `corner` sets the
// initial anchor. Called via addInitScript so it runs before page load.
async function seedPet(page: Page, corner: Corner = 'bottom-right') {
  await page.addInitScript(
    ({ configKey, posKey, cfg }) => {
      window.localStorage.setItem(configKey, JSON.stringify(cfg));
      // Remove any lingering position state so each test starts at the
      // default 24px offset — prevents cross-test bleed via position storage.
      window.localStorage.removeItem(posKey);
    },
    {
      configKey: STORAGE_KEY,
      posKey: PET_POSITION_KEY,
      cfg: {
        mode: 'daemon',
        apiKey: '',
        baseUrl: 'https://api.anthropic.com',
        model: 'claude-sonnet-4-5',
        agentId: 'mock',
        skillId: null,
        designSystemId: null,
        onboardingCompleted: true,
        agentModels: {},
        pet: {
          adopted: true,
          enabled: true,
          petId: 'custom',
          corner,
          custom: {
            name: 'Corner Tester',
            glyph: '🧪',
            accent: '#c96442',
            greeting: 'Testing corners.',
          },
        },
      },
    },
  );
}

// Opens the Settings dialog and navigates to the Pets section. Returns the
// dialog locator. The app may open the dialog directly on button click (when
// onboarding is complete and agent is configured) or via an avatar popover
// menu (when it shows the profile/settings popover first). We handle both paths.
async function openPetSettings(page: Page) {
  const settingsButton = page.getByRole('button', { name: /open settings/i });
  await settingsButton.click();

  const dialog = page.getByRole('dialog');
  const settingsMenu = page.locator('.avatar-popover[role="menu"]');

  // Wait for whichever comes first: the dialog or the popover menu.
  await Promise.race([
    dialog.waitFor({ state: 'visible' }),
    settingsMenu.waitFor({ state: 'visible' }),
  ]);

  // If the popover appeared first, click Settings inside it to open the dialog.
  if (await settingsMenu.isVisible().catch(() => false)) {
    await settingsMenu.getByRole('button', { name: /^Settings$/i }).click();
    await expect(dialog).toBeVisible();
  }

  const petsNav = dialog.locator('.settings-nav-item', {
    has: page.locator('strong', { hasText: /^Pets$/i }),
  }).first();
  await petsNav.click();
  await expect(dialog.locator('.pet-corner-picker')).toBeVisible();
  return dialog;
}

// Reads the resolved pixel offset of the ::after tail from the LEFT edge. In
// Chromium, getComputedStyle always returns a resolved px value even for `auto`
// properties. When the CSS rule sets `left: 18px`, this returns ~18. When
// `left` is `auto` (right-anchored default), this returns a large value
// (roughly bubbleWidth - 18px - tailWidth, i.e. > 100px for a 240px bubble).
async function getBubbleTailLeftPx(page: Page): Promise<number> {
  return page.evaluate(() => {
    const bubble = document.querySelector('.pet-bubble');
    if (!bubble) return -1;
    const raw = window.getComputedStyle(bubble, '::after').left;
    return parseFloat(raw);
  });
}

// Reads the resolved pixel offset of the ::after tail from the RIGHT edge.
// When `right: 18px` is set, returns ~18. When `right` is `auto`, returns a
// large value.
async function getBubbleTailRightPx(page: Page): Promise<number> {
  return page.evaluate(() => {
    const bubble = document.querySelector('.pet-bubble');
    if (!bubble) return -1;
    const raw = window.getComputedStyle(bubble, '::after').right;
    return parseFloat(raw);
  });
}

// Returns the data-corner attribute on the overlay.
async function getOverlayCorner(page: Page): Promise<string> {
  return page.evaluate(() => {
    return document.querySelector('.pet-overlay')?.getAttribute('data-corner') ?? 'missing';
  });
}

// ------------------------------------------------------------------ tests ---

test.describe('pet corner anchor: quadrant positioning', () => {
  // Default corner: bottom-right
  test('bottom-right: overlay is in bottom-right viewport quadrant', async ({ page }) => {
    await seedPet(page, 'bottom-right');
    await page.goto('/');
    const overlay = page.locator('.pet-overlay');
    await expect(overlay).toBeVisible();

    const box = await overlay.boundingBox();
    const viewport = page.viewportSize()!;
    expect(box).not.toBeNull();
    // Sprite leading edge (left side) should be in the right half.
    expect(box!.x).toBeGreaterThan(viewport.width / 2);
    // Sprite top edge should be in the bottom half.
    expect(box!.y).toBeGreaterThan(viewport.height / 2);
    // Sprite trailing edge should be near the right viewport edge.
    expect(box!.x + box!.width).toBeGreaterThan(viewport.width - QUAD_THRESHOLD);
    // Sprite bottom edge should be near the bottom viewport edge.
    expect(box!.y + box!.height).toBeGreaterThan(viewport.height - QUAD_THRESHOLD);
  });

  test('top-left: overlay is in top-left viewport quadrant', async ({ page }) => {
    await seedPet(page, 'top-left');
    await page.goto('/');
    const overlay = page.locator('.pet-overlay');
    await expect(overlay).toBeVisible();

    const box = await overlay.boundingBox();
    expect(box).not.toBeNull();
    // Left edge should be near the left edge of the viewport.
    expect(box!.x).toBeLessThan(QUAD_THRESHOLD);
    // Top edge should be near the top of the viewport.
    expect(box!.y).toBeLessThan(QUAD_THRESHOLD);

    expect(await getOverlayCorner(page)).toBe('top-left');
  });

  test('top-right: overlay is in top-right viewport quadrant', async ({ page }) => {
    await seedPet(page, 'top-right');
    await page.goto('/');
    const overlay = page.locator('.pet-overlay');
    await expect(overlay).toBeVisible();

    const box = await overlay.boundingBox();
    const viewport = page.viewportSize()!;
    expect(box).not.toBeNull();
    // Right edge close to the right side.
    expect(box!.x + box!.width).toBeGreaterThan(viewport.width - QUAD_THRESHOLD);
    // Top edge close to the top.
    expect(box!.y).toBeLessThan(QUAD_THRESHOLD);

    expect(await getOverlayCorner(page)).toBe('top-right');
  });

  test('bottom-left: overlay is in bottom-left viewport quadrant', async ({ page }) => {
    await seedPet(page, 'bottom-left');
    await page.goto('/');
    const overlay = page.locator('.pet-overlay');
    await expect(overlay).toBeVisible();

    const box = await overlay.boundingBox();
    const viewport = page.viewportSize()!;
    expect(box).not.toBeNull();
    // Left edge close to the left side.
    expect(box!.x).toBeLessThan(QUAD_THRESHOLD);
    // Bottom edge close to the bottom.
    expect(box!.y + box!.height).toBeGreaterThan(viewport.height - QUAD_THRESHOLD);

    expect(await getOverlayCorner(page)).toBe('bottom-left');
  });
});

test.describe('pet corner anchor: bubble-tail side (regression guard for left-anchor alignment)', () => {
  // The left-anchor CSS fix is the critical regression guard.
  //
  // On main (without the fix):
  //   .pet-overlay[data-corner='top-left'] .pet-bubble::after has NO left override.
  //   getComputedStyle '::after' left resolves to a LARGE pixel value (bubble
  //   width minus the fixed right offset, roughly 200+px).
  //
  // On the branch (with the fix):
  //   .pet-overlay[data-corner='top-left'] .pet-bubble::after { right:auto; left:18px }
  //   getComputedStyle '::after' left resolves to ~18px — small, near the left edge.
  //
  // We assert `left < TAIL_OFFSET_PX + TAIL_TOLERANCE_PX` for left-anchored
  // corners. This goes RED on main because computed left would be ~200px there.

  for (const corner of ['top-left', 'bottom-left'] as const) {
    test(`${corner}: bubble tail is on the LEFT side (~18px from left)`, async ({ page }) => {
      await seedPet(page, corner);
      await page.goto('/');
      // The bubble auto-opens on mount; wait for it.
      await expect(page.locator('.pet-bubble')).toBeVisible();

      const tailLeftPx = await getBubbleTailLeftPx(page);
      // Left-anchored: the fix places the tail at left:18px. This value is
      // small. On main, no override means computed left is a large value (the
      // bubble is ~240px wide; computed left would be ~240 - 18 - 12 = ~210px).
      expect(tailLeftPx).toBeGreaterThanOrEqual(0);
      expect(tailLeftPx).toBeLessThanOrEqual(TAIL_OFFSET_PX + TAIL_TOLERANCE_PX);

      // Conversely, right should be a large resolved value (not 18px) because
      // right:auto resolves to the complement of left in a fixed box.
      const tailRightPx = await getBubbleTailRightPx(page);
      expect(tailRightPx).toBeGreaterThan(TAIL_OFFSET_PX + TAIL_TOLERANCE_PX);
    });
  }

  for (const corner of ['top-right', 'bottom-right'] as const) {
    test(`${corner}: bubble tail is on the RIGHT side (~18px from right)`, async ({ page }) => {
      await seedPet(page, corner);
      await page.goto('/');
      await expect(page.locator('.pet-bubble')).toBeVisible();

      // Right-anchored: the default CSS has right:18px on .pet-bubble::after.
      const tailRightPx = await getBubbleTailRightPx(page);
      expect(tailRightPx).toBeGreaterThanOrEqual(0);
      expect(tailRightPx).toBeLessThanOrEqual(TAIL_OFFSET_PX + TAIL_TOLERANCE_PX);

      // Left should be the large resolved complement.
      const tailLeftPx = await getBubbleTailLeftPx(page);
      expect(tailLeftPx).toBeGreaterThan(TAIL_OFFSET_PX + TAIL_TOLERANCE_PX);
    });
  }
});

test.describe('pet corner anchor: settings picker changes corner live', () => {
  test('switching to top-left via Pet Settings moves overlay to top-left', async ({ page }) => {
    // Start with the default bottom-right so we can observe the change.
    await seedPet(page, 'bottom-right');

    await page.goto('/');
    await expect(page.locator('.pet-overlay')).toBeVisible();

    // Verify starting position is bottom-right.
    expect(await getOverlayCorner(page)).toBe('bottom-right');

    const dialog = await openPetSettings(page);

    // Click the top-left radio button inside the corner picker.
    await dialog
      .locator('.pet-corner-picker')
      .getByRole('radio', { name: /top.?left/i })
      .click();

    // The overlay must now carry data-corner='top-left'.
    await expect(page.locator('.pet-overlay[data-corner="top-left"]')).toBeVisible();

    // Verify bounding box is in the top-left quadrant.
    const box = await page.locator('.pet-overlay').boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeLessThan(QUAD_THRESHOLD);
    expect(box!.y).toBeLessThan(QUAD_THRESHOLD);

    // Close the dialog and verify the tail is now on the left.
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(dialog).toHaveCount(0);

    // Wait for bubble; it may have auto-closed — click sprite to reopen.
    const bubbleVisible = await page.locator('.pet-bubble').isVisible().catch(() => false);
    if (!bubbleVisible) {
      await page.locator('.pet-sprite').click();
      await expect(page.locator('.pet-bubble')).toBeVisible();
    }

    const tailLeftPx = await getBubbleTailLeftPx(page);
    expect(tailLeftPx).toBeLessThanOrEqual(TAIL_OFFSET_PX + TAIL_TOLERANCE_PX);
  });
});

test.describe('pet corner anchor: persistence across reload', () => {
  test('corner choice survives a full page reload', async ({ page }) => {
    // Start with bottom-right. Use addInitScript so the first page.goto picks
    // it up. On reload, we need the UPDATED corner (top-right) to survive — so
    // we verify localStorage was written by the app, then seed a fresh
    // localStorage evaluate-side before the reload to simulate what the app
    // already persisted (avoiding addInitScript re-running on reload).
    const initialCfg = {
      mode: 'daemon',
      apiKey: '',
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-sonnet-4-5',
      agentId: 'mock',
      skillId: null,
      designSystemId: null,
      onboardingCompleted: true,
      agentModels: {},
      pet: {
        adopted: true,
        enabled: true,
        petId: 'custom',
        corner: 'bottom-right',
        custom: {
          name: 'Corner Tester',
          glyph: '🧪',
          accent: '#c96442',
          greeting: 'Testing corners.',
        },
      },
    };

    // Seed the initial config before the first load.
    await page.addInitScript(
      ({ configKey, posKey, cfg }) => {
        // Only seed if not already set to a non-bottom-right corner, so
        // addInitScript does not clobber state written during this test.
        const existing = (() => {
          try {
            return JSON.parse(window.localStorage.getItem(configKey) ?? '{}');
          } catch { return {}; }
        })();
        if (!existing.pet || existing.pet.corner === 'bottom-right' || !existing.pet.corner) {
          window.localStorage.setItem(configKey, JSON.stringify(cfg));
          window.localStorage.removeItem(posKey);
        }
      },
      { configKey: STORAGE_KEY, posKey: PET_POSITION_KEY, cfg: initialCfg },
    );

    await page.goto('/');
    await expect(page.locator('.pet-overlay')).toBeVisible();

    const dialog = await openPetSettings(page);
    await dialog
      .locator('.pet-corner-picker')
      .getByRole('radio', { name: /top.?right/i })
      .click();

    await expect(page.locator('.pet-overlay[data-corner="top-right"]')).toBeVisible();

    // Close the dialog — the app should have persisted the new corner choice.
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(dialog).toHaveCount(0);

    // Verify the app actually wrote the new corner to localStorage before reload.
    const storedCorner = await page.evaluate((key) => {
      try {
        const cfg = JSON.parse(window.localStorage.getItem(key) ?? '{}');
        return cfg.pet?.corner ?? 'not-found';
      } catch { return 'error'; }
    }, STORAGE_KEY);
    expect(storedCorner).toBe('top-right');

    await page.reload();
    await expect(page.locator('.pet-overlay')).toBeVisible();

    // The corner must survive the reload — addInitScript skips re-seeding
    // because the stored corner is now 'top-right' (not bottom-right).
    expect(await getOverlayCorner(page)).toBe('top-right');

    const box = await page.locator('.pet-overlay').boundingBox();
    const viewport = page.viewportSize()!;
    expect(box).not.toBeNull();
    // top-right: top edge near top, right edge near right.
    expect(box!.y).toBeLessThan(QUAD_THRESHOLD);
    expect(box!.x + box!.width).toBeGreaterThan(viewport.width - QUAD_THRESHOLD);
  });
});
