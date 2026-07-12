import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const chatCss = readFileSync(
  new URL('../../src/styles/chat.css', import.meta.url),
  'utf8',
);

function cssDeclarations(selector: string): string {
  const blocks: string[] = [];
  const rulePattern = /([^{}]+)\{([^}]*)\}/g;
  const cssWithoutComments = chatCss.replace(/\/\*[\s\S]*?\*\//g, '');
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

describe('composer input placeholder', () => {
  it('does not force the placeholder onto a single clipped line', () => {
    const placeholder = cssDeclarations('.composer-input-placeholder');

    // Regression guard for #5370: white-space: nowrap forced ellipsis-clipping
    // after just a few words. It must stay wrap-friendly so it can rely on
    // the shared .composer-input-editor scroll container instead.
    expect(() => ruleValue(placeholder, 'white-space')).toThrow();
  });

  it('keeps the placeholder horizontally contained within the editor', () => {
    const placeholder = cssDeclarations('.composer-input-placeholder');

    expect(ruleValue(placeholder, 'overflow')).toBe('hidden');
    expect(ruleValue(placeholder, 'max-width')).toBe('calc(100% - 8px)');
  });
});
