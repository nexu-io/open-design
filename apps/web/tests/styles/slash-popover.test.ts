import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const libraryCss = readFileSync(
  new URL('../../src/styles/viewer/library.css', import.meta.url),
  'utf8',
);

function cssBlock(selector: string): string {
  const blocks: string[] = [];
  const rulePattern = /([^{}]+)\{([^}]*)\}/g;
  const cssWithoutComments = libraryCss.replace(/\/\*[\s\S]*?\*\//g, '');
  let match: RegExpExecArray | null;
  while ((match = rulePattern.exec(cssWithoutComments)) !== null) {
    const selectors = (match[1] ?? '').split(',').map((item) => item.trim());
    if (selectors.includes(selector)) blocks.push(match[2] ?? '');
  }
  if (blocks.length === 0) throw new Error(`Missing CSS block for ${selector}`);
  return blocks.join('\n');
}

function ruleValue(block: string, property: string): string {
  const match = new RegExp(`(?:^|[;\\n])\\s*${property}:\\s*([^;]+);`).exec(block);
  if (!match) throw new Error(`Missing CSS property ${property}`);
  return match[1]!.trim();
}

describe('slash popover styles', () => {
  it('bounds the shell while the inner results region owns vertical scrolling', () => {
    const popover = cssBlock('.slash-popover');
    const results = cssBlock('.slash-popover-results');

    expect(ruleValue(popover, 'max-height')).toBe('var(--cfl-max-h, 320px)');
    expect(ruleValue(popover, 'overflow')).toBe('hidden');
    expect(ruleValue(results, 'flex')).toBe('1 1 auto');
    expect(ruleValue(results, 'min-height')).toBe('0');
    expect(ruleValue(results, 'overflow-y')).toBe('auto');
  });
});
