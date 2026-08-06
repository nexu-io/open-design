import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const homeHeroCss = readFileSync(
  new URL('../../src/styles/home/home-hero.css', import.meta.url),
  'utf8',
);

function cssDeclarations(selector: string): string {
  const blocks: string[] = [];
  const rulePattern = /([^{}]+)\{([^}]*)\}/g;
  const cssWithoutComments = homeHeroCss.replace(/\/\*[\s\S]*?\*\//g, '');
  let match: RegExpExecArray | null;
  while ((match = rulePattern.exec(cssWithoutComments)) !== null) {
    const selectors = (match[1] ?? '').split(',').map((item) => item.trim());
    if (selectors.includes(selector)) blocks.push(match[2] ?? '');
  }
  if (blocks.length === 0) throw new Error(`Missing CSS block for ${selector}`);
  return blocks.join('\n');
}

function ruleValues(block: string, property: string): string[] {
  const matches = [...block.matchAll(new RegExp(`(?:^|[;\\n])\\s*${property}:\\s*([^;]+);`, 'g'))];
  if (matches.length === 0) throw new Error(`Missing CSS property ${property}`);
  return matches.map((match) => match[1]!.trim());
}

function ruleValue(block: string, property: string): string {
  return ruleValues(block, property).at(-1)!;
}

describe('HomeHero compact composer controls', () => {
  it('keeps the floating @ picker shell stable while result tabs change', () => {
    const floatingPicker = cssDeclarations(
      '.caret-floating-layer .home-hero__plugin-picker--floating',
    );
    const picker = cssDeclarations('.home-hero__plugin-picker');
    const results = cssDeclarations('.home-hero__plugin-picker-results');

    expect(ruleValue(floatingPicker, 'height')).toBe('var(--cfl-max-h, 60vh)');
    expect(ruleValue(floatingPicker, 'max-height')).toBe('var(--cfl-max-h, 60vh)');
    expect(ruleValue(picker, 'overflow')).toBe('hidden');
    expect(ruleValue(results, 'flex')).toBe('1 1 auto');
    expect(ruleValue(results, 'overflow-y')).toBe('auto');
  });

  it('sizes the execution chip to the status dot + model name (#5517 round 4)', () => {
    const switcherChip = cssDeclarations(
      '.home-hero__execution-switcher .inline-switcher__chip',
    );

    // Round 4 widened the old 36px icon square into a pill that carries a
    // connection dot + the selected model name, capped so a long model id
    // ellipsizes instead of stretching the composer foot.
    // Base rule: the 220px name-pill cap. The ≤900px media block later
    // re-collapses the chip to a 36px icon square — both ends are asserted.
    expect(ruleValue(switcherChip, 'height')).toBe('36px');
    expect(ruleValues(switcherChip, 'max-width')[0]).toBe('220px');
    expect(ruleValues(switcherChip, 'max-width').at(-1)).toBe('36px');
  });

  it('keeps the switcher from expanding beyond its content on narrow screens', () => {
    const switcher = cssDeclarations('.home-hero__execution-switcher');

    expect(ruleValue(switcher, 'flex-basis')).toBe('auto');
  });

  it('keeps the template picker search field free of the global input focus halo', () => {
    const templateSearchFocus = cssDeclarations('.home-hero__template-search input:focus');

    expect(ruleValue(templateSearchFocus, 'outline')).toBe('none');
    expect(ruleValue(templateSearchFocus, 'box-shadow')).toBe('none');
  });
});
