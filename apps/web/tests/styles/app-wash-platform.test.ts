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
