import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Regression for #4468: in dark mode the home context/plugin picker drew its
// secondary text (tab hints, per-section counts, option meta, and the
// hover-card kicker/meta) in `--text-faint`, which resolves to ~1.85:1 against
// the picker surface — well below the WCAG AA 4.5:1 floor for normal text.
// These selectors must use a token that clears AA on the dark picker surface.

const pluginsViewCss = readFileSync(
  new URL('../../src/styles/home/plugins-view.css', import.meta.url),
  'utf8',
);
const homeHeroCss = readFileSync(
  new URL('../../src/styles/home/home-hero.css', import.meta.url),
  'utf8',
);
const tokensCss = readFileSync(
  new URL('../../src/styles/tokens.css', import.meta.url),
  'utf8',
);

function stripComments(css: string): string {
  return css.replace(/\/\*[^]*?\*\//g, '');
}

function cssBlock(rawCss: string, selector: string): string {
  const css = stripComments(rawCss);
  const rulePattern = /([^{}]+)\{([^}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = rulePattern.exec(css)) !== null) {
    const selectors = (match[1] ?? '').split(',').map((item) => item.trim());
    if (selectors.includes(selector)) return match[2] ?? '';
  }
  throw new Error(`Missing CSS block for ${selector}`);
}

function ruleValue(block: string, property: string): string {
  const matches = [
    ...block.matchAll(new RegExp(`(?:^|[;\\n])\\s*${property}:\\s*([^;]+);`, 'g')),
  ];
  const match = matches.at(-1);
  if (!match) throw new Error(`Missing CSS property ${property}`);
  return match[1]!.trim();
}

// Resolve a design token from the explicit dark theme scope in tokens.css.
function darkToken(name: string): string {
  const scope = cssBlock(tokensCss, '[data-theme="dark"]');
  return ruleValue(scope, name);
}

// Resolve a `var(--token)` reference (or a literal hex) to a hex string.
function resolveColor(value: string): string {
  const varMatch = value.match(/^var\(\s*(--[\w-]+)\s*\)$/);
  return varMatch ? darkToken(varMatch[1]!) : value;
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.trim().replace(/^#/, '');
  if (!/^(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(normalized)) {
    throw new Error(`Expected #rgb or #rrggbb, got ${hex}`);
  }
  const expanded =
    normalized.length === 3
      ? [...normalized].map((char) => `${char}${char}`).join('')
      : normalized;
  return [
    Number.parseInt(expanded.slice(0, 2), 16),
    Number.parseInt(expanded.slice(2, 4), 16),
    Number.parseInt(expanded.slice(4, 6), 16),
  ];
}

function luminance([r, g, b]: [number, number, number]): number {
  const channel = (value: number) => {
    const normalized = value / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(foreground: string, background: string): number {
  const first = luminance(hexToRgb(resolveColor(foreground)));
  const second = luminance(hexToRgb(resolveColor(background)));
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

// Picker panel is --bg-panel; the hover card is a color-mix dominated by
// --bg-subtle, which is the lighter component (so the more conservative base
// for light-on-dark contrast).
const PICKER_SECONDARY_TEXT = [
  { css: pluginsViewCss, selector: '.plugins-view__tab-hint', surface: 'var(--bg-panel)' },
  { css: pluginsViewCss, selector: '.plugins-view__section-count', surface: 'var(--bg-panel)' },
  { css: pluginsViewCss, selector: '.plugins-view__meta', surface: 'var(--bg-panel)' },
  { css: homeHeroCss, selector: '.home-hero__plugin-hover-kicker', surface: 'var(--bg-subtle)' },
  { css: homeHeroCss, selector: '.home-hero__plugin-hover-meta', surface: 'var(--bg-subtle)' },
] as const;

describe('home picker dark-mode contrast (#4468)', () => {
  it('keeps picker secondary text at WCAG AA on the dark surface', () => {
    for (const { css, selector, surface } of PICKER_SECONDARY_TEXT) {
      const color = ruleValue(cssBlock(css, selector), 'color');
      expect(
        contrastRatio(color, surface),
        `${selector} color ${color} on ${surface}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('locks the regression: --text-faint would fail AA here', () => {
    // Guards the fix's intent — if a selector regresses back to --text-faint,
    // the AA assertion above fails, because faint is sub-AA on this surface.
    expect(contrastRatio('var(--text-faint)', 'var(--bg-panel)')).toBeLessThan(3);
  });
});
