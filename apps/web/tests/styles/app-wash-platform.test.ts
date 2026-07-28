import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const appWashCss = readFileSync(
  new URL('../../src/styles/app-wash.css', import.meta.url),
  'utf8',
);

describe('desktop app wash platform contract', () => {
  it('limits window-vibrancy material rules to macOS desktop hosts', () => {
    const macDesktopSelector =
      ":has(.workspace-shell--desktop[data-host-platform='darwin'])";
    const vibrancySelectors = appWashCss.match(
      /html(?:\.is-window-blurred)?:has\(\.workspace-shell--desktop[^)]*\)(?: body(?:::before)?)?/g,
    );

    expect(vibrancySelectors).not.toBeNull();
    expect(vibrancySelectors).not.toHaveLength(0);
    expect(vibrancySelectors?.every((selector) => selector.includes(macDesktopSelector))).toBe(true);
  });
});
