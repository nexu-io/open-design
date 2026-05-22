import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const homeHeroCss = readFileSync(new URL('../../src/styles/home/home-hero.css', import.meta.url), 'utf8');

function cssDeclarations(selector: string): string {
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

function optionalRuleValue(block: string, property: string): string | null {
  try {
    return ruleValue(block, property);
  } catch {
    return null;
  }
}

describe('HomeHero prompt overlay metrics', () => {
  it('keeps the highlight overlay and textarea text-flow metrics in lockstep', () => {
    const highlight = cssDeclarations('.home-hero__prompt-highlight');
    const input = cssDeclarations('.home-hero__input');

    for (const property of [
      'font',
      'font-size',
      'font-weight',
      'line-height',
      'letter-spacing',
      'word-spacing',
      'font-kerning',
      'font-feature-settings',
      'font-variant-ligatures',
      'text-rendering',
      'tab-size',
      'padding',
      'box-sizing',
      'white-space',
      'overflow-wrap',
      'text-align',
    ]) {
      expect(ruleValue(highlight, property), property).toBe(ruleValue(input, property));
    }

    expect(ruleValue(highlight, 'pointer-events')).toBe('none');
  });

  it('keeps prompt scroll compensation off the transform compositor path', () => {
    const inner = cssDeclarations('.home-hero__prompt-highlight-inner');

    expect(optionalRuleValue(inner, 'transform')).toBeNull();
    expect(ruleValue(inner, 'top')).toBe('calc(-1 * var(--home-hero-prompt-scroll, 0px))');
  });
});
