import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (relative: string) =>
  readFileSync(new URL(relative, import.meta.url), 'utf8');

const homeHeroSource = read('../../src/components/HomeHero.tsx');
const entryNavRailSource = read('../../src/components/EntryNavRail.tsx');
const logoSvg = read('../../public/logo.svg');
const brandIconSvg = read('../../public/brand-icon.svg');
// #5517: the home hero header shows the full OpenDesign logotype instead of
// the small glyph + name pair; the asset must ship with the app.
const heroLogotypeSvg = read('../../public/logo-03.svg');
// Round 7: the static logotype is now driven by the WebGL pixel-scan wordmark
// (see home-hero/pixel-scan/engine.ts), which samples this SVG's alpha
// channel as the glyph mask it assembles out of coloured blocks.
const heroPixelScanSvg = read('../../public/logo-scan.svg');

// The current OpenDesign brand glyph is the ink superellipse tile introduced
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

  it('renders the brand mark on the Home hero', () => {
    // #5517: the hero renders the shipped logotype image (not the glyph pair).
    expect(heroLogotypeSvg).toContain('<svg');
    // Round 7: the hero mounts the animated PixelScanLogo component instead of
    // a plain <img>; the logotype now ships as the pixel-scan engine's sample
    // source (logo-scan.svg) rather than an inline `src="/logo-03.svg"`.
    expect(heroPixelScanSvg).toContain('<svg');
    expect(homeHeroSource).toContain('<PixelScanLogo');
    expect(homeHeroSource).not.toContain('src="/logo-03.svg"');
    expect(homeHeroSource).not.toContain('src="/app-icon.svg"');

    // #6156 cut the rail's signed-out brand header entirely — with no cloud
    // identity the rail now starts at the search box, and expand/collapse moved
    // to the workspace tabs bar's pinned Home toggle. So the rail carries no
    // brand mark at all; what still matters is that it never falls back to the
    // retired raster app icon.
    expect(entryNavRailSource).not.toContain('src="/app-icon.svg"');
  });
});
