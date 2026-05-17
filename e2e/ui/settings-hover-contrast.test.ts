import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const STORAGE_KEY = 'open-design:config';

// WCAG AA threshold for normal text. We assert against this rather than AAA
// because the codebase has historically targeted AA for muted-on-subtle
// surfaces and we do not want to bake AAA into a regression guard the team
// has not committed to.
const WCAG_AA_NORMAL = 4.5;

type Theme = 'light' | 'dark';

async function openSettings(page: Page, theme: Theme) {
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, JSON.stringify(value));
    },
    {
      key: STORAGE_KEY,
      value: {
        theme,
        accentColor: '#c96442',
        mode: 'daemon',
        onboardingCompleted: true,
        agentId: null,
        skillId: null,
        designSystemId: null,
        mediaProviders: {},
        agentModels: {},
      },
    },
  );
  await page.route('**/api/health', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });

  await page.emulateMedia({ colorScheme: theme });
  await page.goto('/');
  // The footer renders a `foot-pill-env` with title="Configure execution mode"
  // alongside the top-right `settings-icon-btn` with title="Execution mode";
  // disambiguate via exact role+name so this stays stable even if the footer
  // pill comes and goes.
  await page.getByRole('button', { name: 'Execution mode', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

/**
 * Reads the composited background a user actually sees behind `selector` —
 * walks ancestors and folds rgba layers front-to-back until an opaque layer
 * is reached. Raw `getComputedStyle(...).backgroundColor` returns the
 * element's own background (often `rgba(0, 0, 0, 0)` for transparent
 * controls) which would massively overstate text contrast.
 */
async function measureContrast(page: Page, selector: string): Promise<{
  ratio: number;
  fg: [number, number, number];
  bg: [number, number, number];
  bgRaw: string;
}> {
  return page.evaluate((sel) => {
    function srgb(v: number) {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    }
    function lum(c: [number, number, number]) {
      return 0.2126 * srgb(c[0]) + 0.7152 * srgb(c[1]) + 0.0722 * srgb(c[2]);
    }
    function parse(s: string): number[] | null {
      const m = s.match(/rgba?\(([^)]+)\)/);
      if (!m || !m[1]) return null;
      return m[1].split(',').map((x) => parseFloat(x.trim()));
    }
    function ratio(a: [number, number, number], b: [number, number, number]) {
      const L1 = lum(a);
      const L2 = lum(b);
      const [lo, hi] = L1 < L2 ? [L1, L2] : [L2, L1];
      return (hi + 0.05) / (lo + 0.05);
    }
    function resolveBg(n: Element): [number, number, number] {
      const layers: Array<{ r: number; g: number; b: number; a: number }> = [];
      let c: Element | null = n;
      while (c) {
        const cs = getComputedStyle(c);
        const p = parse(cs.backgroundColor);
        if (p && p[0] !== undefined && p[1] !== undefined && p[2] !== undefined) {
          const a = p.length === 4 && p[3] !== undefined ? p[3] : 1;
          if (a > 0) layers.push({ r: p[0], g: p[1], b: p[2], a });
          if (a === 1) break;
        }
        c = c.parentElement;
      }
      if (!layers.length) return [255, 255, 255];
      const base = layers[layers.length - 1];
      if (!base) return [255, 255, 255];
      let r = base.r;
      let g = base.g;
      let b = base.b;
      for (let i = layers.length - 2; i >= 0; i--) {
        const l = layers[i];
        if (!l) continue;
        r = l.r * l.a + r * (1 - l.a);
        g = l.g * l.a + g * (1 - l.a);
        b = l.b * l.a + b * (1 - l.a);
      }
      return [Math.round(r), Math.round(g), Math.round(b)];
    }

    const el = document.querySelector(sel);
    if (!el) throw new Error(`selector matched nothing: ${sel}`);
    const cs = getComputedStyle(el);
    const fgRaw = parse(cs.color);
    if (!fgRaw || fgRaw[0] === undefined || fgRaw[1] === undefined || fgRaw[2] === undefined) {
      throw new Error(`unparseable color on ${sel}: ${cs.color}`);
    }
    const fg: [number, number, number] = [
      Math.round(fgRaw[0]),
      Math.round(fgRaw[1]),
      Math.round(fgRaw[2]),
    ];
    const bg = resolveBg(el);
    return { ratio: +ratio(fg, bg).toFixed(2), fg, bg, bgRaw: cs.backgroundColor };
  }, selector);
}

async function hoverAndMeasure(page: Page, selector: string) {
  const el = page.locator(selector).first();
  await el.waitFor({ state: 'visible' });
  await el.scrollIntoViewIfNeeded();
  await el.hover();
  // Let CSS transitions settle so the measurement reflects the steady-state
  // hover style. The hover rule for .subtab-pill uses a background-only
  // change with no transition, so 120ms is comfortably enough.
  await page.waitForTimeout(150);
  return measureContrast(page, selector);
}

// Regression guard for #1795: hover backgrounds in Settings should not blow
// out text contrast in either theme. The original bug (filed against 0.6.0)
// used `rgba(255, 255, 255, 0.6)` for `.subtab-pill button:hover` which read
// as a near-white wash in dark mode and dropped contrast to ~1.87 — well
// below the 4.5 WCAG AA threshold. We assert WCAG AA across both themes so
// it cannot silently regress for either set of users.
const THEMES: Theme[] = ['dark', 'light'];

test.describe('Settings hover contrast (regression guard for #1795)', () => {
  for (const theme of THEMES) {
    test(`Pets source tabs hover stays readable in ${theme} theme`, async ({ page }) => {
      await openSettings(page, theme);
      const petsNav = page
        .locator('.settings-nav-item', { has: page.locator('strong', { hasText: /^Pets$/i }) })
        .first();
      await petsNav.click();
      // Pet tabs render once the section is mounted; no daemon round-trip is
      // required for the tab pills themselves.
      await page.waitForSelector('.pet-tabs .subtab-pill button');

      const inactive = '.pet-tabs .subtab-pill button:not(.active)';
      const measurement = await hoverAndMeasure(page, inactive);
      expect(
        measurement.ratio,
        `Pets source tab hover contrast ${measurement.ratio} below WCAG AA (${WCAG_AA_NORMAL}) in ${theme}. ` +
          `fg=rgb(${measurement.fg.join(',')}) bg=rgb(${measurement.bg.join(',')}) bgRaw=${measurement.bgRaw}`,
      ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
    });

    test(`seg-btn surfaces (BYOK / Appearance / Notifications) hover stays readable in ${theme} theme`, async ({
      page,
    }) => {
      await openSettings(page, theme);

      // Configure execution mode is the default landing — BYOK seg-btn lives
      // here. Hovering the inactive tab is enough to exercise the seg-btn
      // hover rule that covers BYOK + Appearance + Notifications.
      const execMeasurement = await hoverAndMeasure(
        page,
        '.seg-control .seg-btn:not(.active):not(:disabled)',
      );
      expect(
        execMeasurement.ratio,
        `BYOK seg-btn hover ${execMeasurement.ratio} (${theme})`,
      ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);

      const appearanceNav = page
        .locator('.settings-nav-item', { has: page.locator('strong', { hasText: /^Appearance$/i }) })
        .first();
      await appearanceNav.click();
      await page.waitForSelector('.seg-control .seg-btn');
      const themeMeasurement = await hoverAndMeasure(
        page,
        '.seg-control .seg-btn:not(.active)',
      );
      expect(
        themeMeasurement.ratio,
        `Appearance theme hover ${themeMeasurement.ratio} (${theme})`,
      ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);

      const notifNav = page
        .locator('.settings-nav-item', { has: page.locator('strong', { hasText: /^Notifications$/i }) })
        .first();
      await notifNav.click();
      await page.waitForSelector('.seg-control .seg-btn');
      const notifMeasurement = await hoverAndMeasure(
        page,
        '.seg-control .seg-btn:not(.active):not(:disabled)',
      );
      expect(
        notifMeasurement.ratio,
        `Notifications seg-btn hover ${notifMeasurement.ratio} (${theme})`,
      ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
    });
  }
});
