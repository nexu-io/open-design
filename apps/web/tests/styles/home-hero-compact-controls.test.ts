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

function ruleValue(block: string, property: string): string {
  const matches = [...block.matchAll(new RegExp(`(?:^|[;\\n])\\s*${property}:\\s*([^;]+);`, 'g'))];
  const match = matches.at(-1);
  if (!match) throw new Error(`Missing CSS property ${property}`);
  return match[1]!.trim();
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

  it('keeps the session mode and execution buttons compact in the hero', () => {
    const modeTrigger = cssDeclarations(
      '.home-hero__foot-right .session-mode-toggle__trigger',
    );
    const switcherChip = cssDeclarations(
      '.home-hero__execution-switcher .inline-switcher__chip',
    );

    // The footer buttons were unified to a single 32px pill height; the
    // session-mode trigger matches the other footer controls.
    expect(ruleValue(modeTrigger, 'height')).toBe('32px');
    expect(ruleValue(modeTrigger, 'max-width')).toBe('120px');
    expect(ruleValue(switcherChip, 'height')).toBe('30px');
    expect(ruleValue(switcherChip, 'max-width')).toBe('48px');
  });

  it('prevents the compact execution switcher from expanding on narrow screens', () => {
    const switcher = cssDeclarations('.home-hero__execution-switcher');
    const switcherChip = cssDeclarations(
      '.home-hero__execution-switcher .inline-switcher__chip',
    );

    expect(ruleValue(switcher, 'flex-basis')).toBe('auto');
    expect(ruleValue(switcherChip, 'width')).toBe('auto');
    expect(ruleValue(switcherChip, 'max-width')).toBe('48px');
  });
});
