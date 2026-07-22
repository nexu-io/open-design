import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Regression guard for #4468: the home context picker (the surface above the
// prompt with the Design files / Plugins / Skills / MCP / Connectors tabs) drew
// its secondary text — per-tab counts, section labels, option meta, and the
// hover-card kicker and meta row — in `--text-faint`. In dark mode that token (#4e4b46) sits
// at ~1.8:1 against the picker panel, far below the WCAG AA threshold, so the
// labels read as unreadable bleed-through (the reported theme). This test
// resolves each selector's color token from the real stylesheets and asserts
// the contrast clears AA for normal text in dark mode, so the picker's
// secondary tier stays legible. The same fix also lifts the light theme from
// ~2:1 toward AA, but light-mode legibility is gated by the shared `--bg-subtle`
// tabs-bar surface (the inactive tab label already sits at ~4.46:1 there), which
// is outside this fix's scope.

const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');
const tokensCss = stripComments(
  readFileSync(new URL('../../src/styles/tokens.css', import.meta.url), 'utf8'),
);
const homeHeroCss = stripComments(
  readFileSync(new URL('../../src/styles/home/home-hero.css', import.meta.url), 'utf8'),
);

const AA_NORMAL = 4.5;

/** Pull the declaration body of a `selector { ... }` block out of the source. */
function homeHeroDeclarations(selector: string): string {
  const blocks: string[] = [];
  const rulePattern = /([^{}]+)\{([^}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = rulePattern.exec(homeHeroCss)) !== null) {
    const selectors = (match[1] ?? '').split(',').map((item) => item.trim());
    if (selectors.includes(selector)) blocks.push(match[2] ?? '');
  }
  if (blocks.length === 0) throw new Error(`Missing CSS block for ${selector}`);
  return blocks.join('\n');
}

function ruleValue(block: string, property: string): string {
  const matches = [...block.matchAll(new RegExp(`(?:^|[;\\n])\\s*${property}:\\s*([^;]+);`, 'g'))];
  const match = matches.at(-1);
  if (!match) throw new Error(`Missing CSS property ${property}`);
  return match[1]!.trim();
}

/** Resolve a CSS custom property from a `:root`-style block in tokens.css. */
function tokenMap(blockSelector: string): Map<string, string> {
  const rulePattern = /([^{}]+)\{([^}]*)\}/g;
  let match: RegExpExecArray | null;
  const map = new Map<string, string>();
  while ((match = rulePattern.exec(tokensCss)) !== null) {
    const selectors = (match[1] ?? '').split(',').map((item) => item.trim());
    if (!selectors.includes(blockSelector)) continue;
    for (const decl of (match[2] ?? '').split(';')) {
      const [name, value] = decl.split(':');
      if (name && value && name.trim().startsWith('--')) map.set(name.trim(), value.trim());
    }
  }
  if (map.size === 0) throw new Error(`Missing token block for ${blockSelector}`);
  return map;
}

function varName(value: string): string {
  const m = /var\((--[a-z0-9-]+)\)/i.exec(value);
  if (!m) throw new Error(`Expected a var() color, got: ${value}`);
  return m[1]!;
}

type Rgb = { r: number; g: number; b: number };

function parseHex(hex: string): Rgb {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) throw new Error(`Not a hex color: ${hex}`);
  const int = parseInt(m[1]!, 16);
  return { r: (int >> 16) & 0xff, g: (int >> 8) & 0xff, b: int & 0xff };
}

function mix(a: Rgb, b: Rgb, weightA: number): Rgb {
  return {
    r: a.r * weightA + b.r * (1 - weightA),
    g: a.g * weightA + b.g * (1 - weightA),
    b: a.b * weightA + b.b * (1 - weightA),
  };
}

/** Gamma-corrected sRGB relative luminance (WCAG 2.x). */
function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(fg: Rgb, bg: Rgb): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const [light, dark] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (light + 0.05) / (dark + 0.05);
}

// Each picker secondary-text selector paired with the picker surface it renders
// on (verified against HomeHero.tsx nesting): tab counts sit in the tabs bar
// (`--bg-subtle`); section labels and option meta sit in the results area
// (`--bg-panel`); the hover-card kicker and meta row both sit on the 72/28
// subtle→panel hover card.
const SECONDARY_TEXT = [
  { selector: '.home-hero__mention-tab span:last-child', background: '--bg-subtle' as const },
  { selector: '.home-hero__mention-section-label', background: '--bg-panel' as const },
  { selector: '.home-hero__plugin-option-meta', background: '--bg-panel' as const },
  { selector: '.home-hero__plugin-hover-kicker', background: 'hover-card' as const },
  { selector: '.home-hero__plugin-hover-meta', background: 'hover-card' as const },
];

describe('Home context picker secondary-text contrast (#4468)', () => {
  for (const theme of ['[data-theme="dark"]'] as const) {
    const tokens = tokenMap(theme);
    const resolve = (name: string): Rgb => {
      const value = tokens.get(name);
      if (!value) throw new Error(`Token ${name} missing in ${theme}`);
      return parseHex(value);
    };
    const surface = (key: (typeof SECONDARY_TEXT)[number]['background']): Rgb =>
      key === 'hover-card'
        ? mix(resolve('--bg-subtle'), resolve('--bg-panel'), 0.72)
        : resolve(key);

    for (const { selector, background } of SECONDARY_TEXT) {
      it(`${selector} clears AA contrast in ${theme}`, () => {
        const color = resolve(varName(ruleValue(homeHeroDeclarations(selector), 'color')));
        const ratio = contrastRatio(color, surface(background));
        expect(ratio, `${selector} on ${background} in ${theme} = ${ratio.toFixed(2)}:1`)
          .toBeGreaterThanOrEqual(AA_NORMAL);
      });
    }
  }
});
