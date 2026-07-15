import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (relative: string) =>
  readFileSync(new URL(relative, import.meta.url), 'utf8');

const homeHeroSource = read('../../src/components/HomeHero.tsx');
const entryNavRailSource = read('../../src/components/EntryNavRail.tsx');
const logoSvg = read('../../public/logo.svg');
const brandIconSvg = read('../../public/brand-icon.svg');

// The current Open Design brand glyph is the ink superellipse tile introduced
// with the landing-page rebrand (landing PR #3444): its outline starts with
// this path command in every export of the mark.
const CURRENT_GLYPH_PATH_PREFIX = 'M41 0.726562';
// The retired glyph was a 444x444 dark tile (#202020) whose cursor arrow was
// drawn as a separate path starting at this command.
const RETIRED_GLYPH_MARKERS = ['#202020', 'M212.059', 'width="444"'];

describe('Home logo assets', () => {
  it('ships the current brand glyph in the public logo assets', () => {
    expect(logoSvg).toContain(CURRENT_GLYPH_PATH_PREFIX);
    expect(brandIconSvg).toContain(CURRENT_GLYPH_PATH_PREFIX);
    for (const marker of RETIRED_GLYPH_MARKERS) {
      expect(logoSvg).not.toContain(marker);
      expect(brandIconSvg).not.toContain(marker);
    }
  });

  it('keeps brand-icon.svg maskable (theme color comes from CSS)', () => {
    expect(brandIconSvg).toContain('currentColor');
  });

  it('renders the brand glyph on both Home entry surfaces', () => {
    expect(homeHeroSource).toContain('od-brand-glyph');
    expect(homeHeroSource).not.toContain('src="/app-icon.svg"');

    expect(entryNavRailSource).toContain('od-brand-glyph');
    expect(entryNavRailSource).not.toContain('src="/app-icon.svg"');
  });
});
