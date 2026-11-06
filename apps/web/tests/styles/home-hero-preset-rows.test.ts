// Measurement spec for the home template list (the rows under the composer
// once a type is picked) and the composer's placeholder caret — OPEND-2687,
// OPEND-2705, OPEND-2698. Values are pinned so a drift fails here before it
// reaches a screenshot.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const homeHeroCss = readFileSync(
  new URL('../../src/styles/home/home-hero.css', import.meta.url),
  'utf8',
);

function declarations(selector: string): string {
  const cssWithoutComments = homeHeroCss.replace(/\/\*[\s\S]*?\*\//g, '');
  const rulePattern = /([^{}]+)\{([^}]*)\}/g;
  const blocks: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = rulePattern.exec(cssWithoutComments)) !== null) {
    const selectors = (match[1] ?? '').split(',').map((item) => item.trim());
    if (selectors.includes(selector)) blocks.push(match[2] ?? '');
  }
  return blocks.join('\n');
}

describe('home hero — template list rows', () => {
  it('OPEND-2687: the hover fill carries the same air above and below the row content', () => {
    const row = declarations('.home-hero__plugin-preset-row');
    // Symmetric vertical padding: the poster (56px) is the tallest thing in the
    // row, so equal padding on both sides is what centres it in the fill.
    expect(row).toMatch(/padding:\s*12px 16px;/);
    expect(row).toMatch(/align-items:\s*center/);
    // The row pitch is unchanged (12 + 56 + 12 = 80): the four-row viewport
    // below is cut to exactly this height and must stay in sync.
    expect(declarations('.home-hero__plugin-presets')).toMatch(/--preset-row-h:\s*80px/);
    expect(declarations('.home-hero__plugin-preset-row-thumb')).toMatch(/height:\s*56px/);
  });

  it('OPEND-2705: a light poster keeps a visible edge against the page', () => {
    // Default treatment pending product/design sign-off: a 1px hairline ring
    // over the poster, mixed down from the border token so it reads on a white
    // page in light mode without glaring in dark mode. Drawn by a pseudo
    // element ON TOP of the image (an inset box-shadow on the box itself would
    // be painted under the <img>).
    const ring = declarations('.home-hero__plugin-preset-row-thumb::after');
    expect(ring).toMatch(/content:\s*''/);
    expect(ring).toMatch(/position:\s*absolute/);
    expect(ring).toMatch(/inset:\s*0/);
    expect(ring).toMatch(/border-radius:\s*inherit/);
    expect(ring).toMatch(/pointer-events:\s*none/);
    expect(ring).toMatch(
      /box-shadow:\s*inset 0 0 0 1px color-mix\(in srgb, var\(--border\) 70%, transparent\)/,
    );
    // The thumb is the positioning context for that ring.
    expect(declarations('.home-hero__plugin-preset-row-thumb')).toMatch(/position:\s*relative/);
  });
});

describe('home hero — placeholder caret', () => {
  it('OPEND-2698: the typewriter caret matches the native caret it stands in for', () => {
    const caret = declarations('.home-hero__carousel-caret');
    // Native Chromium caret on the 14px composer text: 1px wide, 17px tall
    // (font ascent + descent), in the editor's caret-color.
    expect(caret).toMatch(/width:\s*1px/);
    expect(caret).toMatch(/height:\s*17px/);
    expect(caret).toMatch(/align-self:\s*center/);
    expect(caret).toMatch(/background:\s*var\(--accent\)/);
    // No vertical margins: the height is explicit now, not derived from the
    // line box minus a margin — the old 3px pair is what shrank it to 14px.
    expect(caret).not.toMatch(/margin:\s*3px/);
    expect(caret).not.toMatch(/align-self:\s*stretch/);
    expect(caret).not.toMatch(/width:\s*1\.5px/);
    // Square ends, like the native caret — a 1px radius on a 1px bar rounds it off.
    expect(caret).not.toMatch(/border-radius/);
  });
});

describe('home hero — template poster (OPEND-3100, supersedes OPEND-2697)', () => {
  // Product: the poster carries no eye badge at all — not at rest, not on
  // hover, not on keyboard focus — and no "Preview" tooltip. OPEND-2697 had
  // only quietened the badge to a hover-reveal; this removes it outright, so
  // no rule for it may survive in the stylesheet.
  const eyeSelectors = [
    '.home-hero__plugin-preset-row-preview',
    '.home-hero__plugin-preset-row-preview svg',
    '.home-hero__plugin-preset-row:not(:disabled):hover .home-hero__plugin-preset-row-preview',
    '.home-hero__plugin-preset-row:not(:disabled):focus-visible .home-hero__plugin-preset-row-preview',
    '.home-hero__plugin-preset-row-thumb:hover .home-hero__plugin-preset-row-preview',
  ];

  it('ships no eye-badge rule, for rest, hover, or focus', () => {
    for (const selector of eyeSelectors) {
      expect(declarations(selector), selector).toBe('');
    }
    expect(homeHeroCss).not.toContain('plugin-preset-row-preview');
  });

  it('keeps the whole poster as the preview target', () => {
    expect(declarations('.home-hero__plugin-preset-row-thumb')).toMatch(/cursor:\s*pointer/);
  });
});
