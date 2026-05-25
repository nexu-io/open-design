import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const entryLayoutCss = readFileSync(new URL('../../src/styles/home/entry-layout.css', import.meta.url), 'utf8');

function cssDeclarations(selector: string): string {
  const blocks: string[] = [];
  const rulePattern = /([^{}]+)\{([^}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = rulePattern.exec(entryLayoutCss)) !== null) {
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

describe('InlineModelSwitcher styles', () => {
  it('clips long model labels inside the compact chip', () => {
    const chip = cssDeclarations('.inline-switcher__chip');
    expect(ruleValue(chip, 'overflow')).toBe('hidden');

    for (const selector of [
      '.inline-switcher__chip-mode',
      '.inline-switcher__chip-primary',
      '.inline-switcher__chip-model',
    ]) {
      const block = cssDeclarations(selector);
      expect(ruleValue(block, 'min-width'), selector).toBe('0');
      expect(ruleValue(block, 'overflow'), selector).toBe('hidden');
      expect(ruleValue(block, 'text-overflow'), selector).toBe('ellipsis');
      expect(ruleValue(block, 'white-space'), selector).toBe('nowrap');
    }
  });
});
