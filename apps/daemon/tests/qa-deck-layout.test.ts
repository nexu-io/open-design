import { describe, expect, it } from 'vitest';

import { analyseDeckLayout, assertDeckLayoutSafe } from '../src/qa/deck-layout.js';
import { validateBrand } from '../src/brands/validate.js';
import { buildBrandSystem } from '../src/brands/engine/index.js';

// The deck lays content on fixed-size 16:9 slides, so the layout guard pins
// down the structural invariants that keep brand copy from clipping. The
// real generated deck must pass; a deck missing any invariant must fail.

const VALID_BRAND = {
  name: 'Open Design',
  tagline: 'The open-source, local-first alternative to Claude Design.',
  description:
    'Open Design is the official open-source, local-first alternative to Claude Design — an agent-native design platform that turns the coding agent into a full design studio, generating on-brand artifacts from a single source of truth.',
  colors: [
    { role: 'background', hex: '#ffffff', oklch: '', name: 'White', usage: 'page' },
    { role: 'surface', hex: '#f6f6f6', oklch: '', name: 'Surface', usage: 'cards' },
    { role: 'foreground', hex: '#101010', oklch: '', name: 'Ink', usage: 'text' },
    { role: 'muted', hex: '#7a7a7a', oklch: '', name: 'Muted', usage: 'secondary text' },
    { role: 'border', hex: '#e6e6e6', oklch: '', name: 'Hairline', usage: 'borders' },
    { role: 'accent', hex: '#36ff14', oklch: '', name: 'Voltage', usage: 'CTAs' },
    { role: 'accent-secondary', hex: '#0a7d22', oklch: '', name: 'Pine', usage: 'success' },
  ],
};

function renderRealDeck(): string {
  const brand = validateBrand({ ...VALID_BRAND }, 'https://open-design.ai');
  const system = buildBrandSystem(brand);
  const deck = system.files['artifacts/deck.html'];
  if (!deck) throw new Error('expected a deck artifact in the brand system');
  return deck;
}

describe('analyseDeckLayout', () => {
  it('passes the real generated brand deck with no issues', () => {
    const report = analyseDeckLayout(renderRealDeck());
    expect(report.issues).toEqual([]);
    expect(report.slideCount).toBeGreaterThanOrEqual(10);
  });

  it('assertDeckLayoutSafe does not throw on the real generated deck', () => {
    expect(() => assertDeckLayoutSafe(renderRealDeck())).not.toThrow();
  });

  it('flags a document with no slides', () => {
    const report = analyseDeckLayout('<main><p>not a deck</p></main>');
    expect(report.issues.map((i) => i.code)).toContain('no-slides');
  });

  it('flags a frame that is not a size container', () => {
    const html = `
      <style>.frame { container-type: inline-size; } .f-fit {}</style>
      <section class="slide"><div class="frame"><div class="f-body"><div class="f-fit">hi</div></div></div></section>
      <script>/* od-deck-fit */ var x = 1;</script>
    `;
    const report = analyseDeckLayout(html);
    expect(report.issues.map((i) => i.code)).toContain('frame-not-size-container');
  });

  it('flags a deck missing the shrink-to-fit runtime', () => {
    const html = `
      <style>.frame { container-type: size; }</style>
      <section class="slide"><div class="frame"><div class="f-body"><div class="f-fit">hi</div></div></div></section>
      <script>var x = 1;</script>
    `;
    const report = analyseDeckLayout(html);
    expect(report.issues.map((i) => i.code)).toContain('fit-runtime-missing');
  });

  it('flags a slide body without a .f-fit layer', () => {
    const html = `
      <style>.frame { container-type: size; }</style>
      <section class="slide"><div class="frame"><div class="f-body">unprotected</div></div></section>
      <script>/* od-deck-fit */</script>
    `;
    const report = analyseDeckLayout(html);
    expect(report.issues.map((i) => i.code)).toContain('fit-layer-missing');
  });

  it('flags a headline/lede slot that uses a line-clamp truncation class', () => {
    const html = `
      <style>.frame { container-type: size; }</style>
      <section class="slide"><div class="frame"><div class="f-body"><div class="f-fit">
        <h2 class="s-title clamp-2">A headline that will be cut</h2>
      </div></div></div></section>
      <script>/* od-deck-fit */</script>
    `;
    const report = analyseDeckLayout(html);
    expect(report.issues.map((i) => i.code)).toContain('headline-truncation');
  });

  it('flags a funnel track that carries its value label inline', () => {
    const html = `
      <style>.frame { container-type: size; }</style>
      <section class="slide"><div class="frame"><div class="f-body"><div class="f-fit">
        <div class="s-bar"><span class="tag">SOM</span>
          <div class="track">$1.4B near-term wedge</div></div>
      </div></div></div></section>
      <script>/* od-deck-fit */</script>
    `;
    const report = analyseDeckLayout(html);
    expect(report.issues.map((i) => i.code)).toContain('funnel-label-clipped');
  });

  it('assertDeckLayoutSafe throws a descriptive error listing each blocking issue', () => {
    expect(() => assertDeckLayoutSafe('<main></main>')).toThrow(/failed layout validation/i);
  });
});
