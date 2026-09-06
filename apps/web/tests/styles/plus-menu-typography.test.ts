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
 * The entry surfaces were designed on an app-wide 600 text weight that has
 * not shipped yet; until it does, `.home-hero` and `.composer` each carry the
 * ladder locally. The "+" menu popup renders through a portal on
 * document.body, outside both of those scopes, so it needs the same stand-in
 * or its rows read lighter than the trigger that opened them.
 */
describe('ComposerPlusMenu popup typography', () => {
  it('carries the 600 ladder on the portaled popup', () => {
    expect(cssDeclarations('.plus-menu__popup')).toMatch(
      /(?:^|[;\n])\s*font-weight:\s*600\s*;/,
    );
  });

  it('keeps the button rule at element specificity so named weights still win', () => {
    expect(cssDeclarations(':where(.plus-menu__popup) button')).toMatch(
      /(?:^|[;\n])\s*font-weight:\s*600\s*;/,
    );
  });

  it('lets the rows inherit that weight instead of naming a lighter one', () => {
    expect(cssDeclarations('.plus-menu__item')).toMatch(/(?:^|[;\n])\s*font:\s*inherit\s*;/);
    expect(cssDeclarations('.plus-menu__item')).not.toMatch(/font-weight:/);
  });
});
