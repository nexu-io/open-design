import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const appWashCss = readFileSync(
  new URL('../../src/styles/app-wash.css', import.meta.url),
  'utf8',
);

describe('desktop app wash platform contract', () => {
  it('uses a neutral token mix only for Windows desktop hosts', () => {
    expect(appWashCss).toMatch(
      /html:has\(\.workspace-shell--desktop\[data-host-platform='win32'\]\)\s*{\s*--app-wash:\s*color-mix\(in srgb, var\(--bg-panel\) 50%, var\(--bg-subtle\)\);\s*}/,
    );
    // The web ground is flat (per product, #7635): the pastel radial blobs no
    // longer compose into the wash, so `none` is the only web-mode value.
    expect(appWashCss).toMatch(/:root\s*{[^}]*--app-wash:\s*none;/);
    expect(appWashCss).not.toMatch(/--app-wash:\s*\n?\s*radial-gradient\(/);
  });

  it('keeps the macOS scrim at a thin 20% with no focus-dependent fade (per product, #7635)', () => {
    const darwinBlock = appWashCss.replace(/\/\*[\s\S]*?\*\//g, '').match(
      /html:has\(\.workspace-shell--desktop\[data-host-platform='darwin'\]\)\s*{([^}]*)}/,
    );
    expect(darwinBlock).not.toBeNull();
    expect(darwinBlock?.[1]).toMatch(/color-mix\(in srgb, var\(--wash-base\) 20%, transparent\)/);
    expect(darwinBlock?.[1]).not.toMatch(/62%/);
    // The unfocused window used to thin the scrim to 34% opacity; the scrim now
    // holds steady, so no rule keys off `.is-window-blurred` any more.
    expect(appWashCss).not.toMatch(/html\.is-window-blurred/);
    expect(appWashCss).not.toMatch(/body::before\s*{\s*transition:\s*opacity/);
  });

  it('limits window-vibrancy material rules to macOS desktop hosts', () => {
    const macDesktopSelector =
      ":has(.workspace-shell--desktop[data-host-platform='darwin'])";
    const vibrancySelectors = appWashCss
      .match(
        /html(?:\.is-window-blurred)?:has\(\.workspace-shell--desktop[^)]*\)(?: body(?:::before)?)?/g,
      )
      ?.filter((selector) => !selector.includes("data-host-platform='win32'"));

    expect(vibrancySelectors).not.toBeNull();
    expect(vibrancySelectors).not.toHaveLength(0);
    expect(vibrancySelectors?.every((selector) => selector.includes(macDesktopSelector))).toBe(true);
  });
});
