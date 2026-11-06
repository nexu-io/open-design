import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const plusMenuCss = readFileSync(
  new URL('../../src/styles/home/plus-menu.css', import.meta.url),
  'utf8',
);

function cssDeclarations(selector: string): string {
  const blocks: string[] = [];
  const rulePattern = /([^{}]+)\{([^}]*)\}/g;
  const cssWithoutComments = plusMenuCss.replace(/\/\*[\s\S]*?\*\//g, '');
  let match: RegExpExecArray | null;
  while ((match = rulePattern.exec(cssWithoutComments)) !== null) {
    const selectors = (match[1] ?? '').split(',').map((item) => item.trim());
    if (selectors.includes(selector)) blocks.push(match[2] ?? '');
  }
  if (blocks.length === 0) throw new Error(`Missing CSS block for ${selector}`);
  return blocks.join('\n');
}

/**
 * The "+" menu popup renders through a portal on document.body, outside the
 * hero and the composer. It reads at the app-wide 600 default from base.css /
 * primitives.css (see font-weight-normalization.test.ts); the popup must not
 * re-declare that ladder locally, nor name a lighter weight on its rows.
 */
describe('ComposerPlusMenu popup typography', () => {
  it('inherits the app-wide ladder instead of carrying its own', () => {
    expect(() => cssDeclarations(':where(.plus-menu__popup) button')).toThrow(
      /Missing CSS block/,
    );
    expect(plusMenuCss).not.toMatch(/Typography ladder stand-in/);
  });

  it('lets the rows inherit that weight instead of naming a lighter one', () => {
    expect(cssDeclarations('.plus-menu__item')).toMatch(/(?:^|[;\n])\s*font:\s*inherit\s*;/);
    expect(cssDeclarations('.plus-menu__item')).not.toMatch(/font-weight:/);
  });
});
