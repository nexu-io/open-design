// Measurement spec for the type chips under the Home composer (原型 / 幻灯片 /
// 文档) and the Community type tabs that reuse them.
//
// OPEND-3103 (product, 2026-09-16, per the #7635 Demo): the chips carry NO
// per-type colour. Icons rest at currentColor with the label, and the composer
// pill that names the picked type wears the brand pair (--brand-surface /
// --brand-ink) like every other selected type. This withdraws the colour half
// of OPEND-2684 (F4, #7891); the ring contrast half of 2684 stays.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const homeHeroCss = readFileSync(
  new URL('../../src/styles/home/home-hero.css', import.meta.url),
  'utf8',
);
const tokensCss = readFileSync(
  new URL('../../src/styles/tokens.css', import.meta.url),
  'utf8',
);
const marketplaceCss = readFileSync(
  new URL('../../src/styles/home/plugin-marketplace-demo.css', import.meta.url),
  'utf8',
);

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

function rules(css: string): Array<{ selectors: string[]; body: string }> {
  const rulePattern = /([^{}]+)\{([^}]*)\}/g;
  const out: Array<{ selectors: string[]; body: string }> = [];
  let match: RegExpExecArray | null;
  const source = stripComments(css);
  while ((match = rulePattern.exec(source)) !== null) {
    out.push({
      selectors: (match[1] ?? '').split(',').map((item) => item.trim()),
      body: match[2] ?? '',
    });
  }
  return out;
}

function declarations(css: string, selector: string): string {
  return rules(css)
    .filter((rule) => rule.selectors.includes(selector))
    .map((rule) => rule.body)
    .join('\n');
}

const LEAD_CHIPS = ['prototype', 'deck', 'document'] as const;

describe('home hero — type chips are neutral (OPEND-3103)', () => {
  it('every chip keeps the clearly visible 1px ring on both themes (OPEND-2684, unchanged)', () => {
    const pill = declarations(homeHeroCss, '.home-hero__type-pill');
    expect(pill).toMatch(
      /border:\s*1px solid color-mix\(in srgb, var\(--text\) 20%, transparent\);/,
    );
    expect(pill).toMatch(/color:\s*var\(--text-strong\);/);
  });

  it('no chip keys a colour on its type — the icon rests at currentColor with the label', () => {
    const css = stripComments(homeHeroCss);
    expect(css).not.toContain('--type-pill-hue');
    for (const chipId of LEAD_CHIPS) {
      expect(declarations(homeHeroCss, `.home-hero__type-pill[data-chip='${chipId}']`), chipId).toBe('');
    }
    // No icon rule at all: the glyph inherits the pill's ink.
    expect(declarations(homeHeroCss, '.home-hero__type-pill > .od-icon')).toBe('');
    expect(rules(homeHeroCss).some((rule) => rule.selectors.some((s) => /data-chip=/.test(s)))).toBe(false);
  });

  it('the composer pill naming a picked type is the brand pair, whatever the type', () => {
    const selected = declarations(
      homeHeroCss,
      ".home-hero__footer-option--select[data-field-name='template'].has-selection",
    );
    expect(selected).toMatch(/background-color:\s*var\(--brand-surface\);/);
    expect(selected).toMatch(/color:\s*var\(--brand-ink\);/);
    expect(
      declarations(homeHeroCss, '.home-hero__template-option.has-selection .home-hero__footer-option-icon'),
    ).toMatch(/color:\s*var\(--brand-ink\);/);
    expect(
      declarations(homeHeroCss, '.home-hero__template-option.has-selection .home-hero__footer-select-label'),
    ).toMatch(/color:\s*var\(--brand-ink\);/);
    // The per-type override (10% tint + 36% ring keyed on data-chip) is gone.
    expect(stripComments(homeHeroCss)).not.toMatch(/has-selection\[data-field-name='template'\]\[data-chip=/);
  });

  it('the selected type pill (Community tabs) is the same brand pair', () => {
    const active = declarations(homeHeroCss, '.home-hero__type-pill.is-active');
    expect(active).toMatch(/background:\s*var\(--brand-surface\);/);
    expect(active).toMatch(/color:\s*var\(--brand-ink\);/);
  });

  it('the per-type hue tokens are gone from the palette', () => {
    const css = stripComments(tokensCss);
    for (const token of ['--type-prototype', '--type-deck', '--type-document']) {
      expect(css, token).not.toContain(token);
    }
  });

  it('the Community tab row pins no colour of its own', () => {
    const row = declarations(marketplaceCss, '.community-template-view__type-tabs');
    expect(row).not.toMatch(/color|background/);
  });
});
