import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const shellCss = readFileSync(new URL('../../src/styles/shell.css', import.meta.url), 'utf8');

function cssDeclarations(selector: string): string {
  const blocks: string[] = [];
  const rulePattern = /([^{}]+)\{([^}]*)\}/g;
  const cssWithoutComments = shellCss.replace(/\/\*[\s\S]*?\*\//g, '');
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

describe('split resize handle styles', () => {
  it('keeps the expanded hitbox out of the chat scrollbar side', () => {
    const handleHitbox = cssDeclarations('.split-resize-handle::before');

    expect(ruleValue(handleHitbox, 'inset-block')).toBe('0');
    expect(ruleValue(handleHitbox, 'inset-inline-start')).toBe('0');
    expect(ruleValue(handleHitbox, 'inset-inline-end')).toBe('-10px');
    expect(handleHitbox).not.toContain('left: -10px');
    expect(handleHitbox).not.toContain('right: -10px');
  });
});
