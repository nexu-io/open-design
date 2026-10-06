import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// OPEND-3180 — the account dock's social row (Discord / X / mail) is icon
// only: three equal square targets, left-aligned on the identity row's edge,
// with no label rules left to re-grow them.

const entryLayoutCss = readFileSync(
  new URL('../../src/styles/home/entry-layout.css', import.meta.url),
  'utf8',
);

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

function cssDeclarations(css: string, selector: string): string {
  const blocks: string[] = [];
  const rulePattern = /([^{}]+)\{([^}]*)\}/g;
  const cssWithoutComments = stripComments(css);
  let match: RegExpExecArray | null;
  while ((match = rulePattern.exec(cssWithoutComments)) !== null) {
    const selectors = (match[1] ?? '').split(',').map((item) => item.trim());
    if (selectors.includes(selector)) blocks.push(match[2] ?? '');
  }
  if (blocks.length === 0) throw new Error(`Missing CSS block for ${selector}`);
  return blocks.join('\n');
}

function hasBlock(css: string, selector: string): boolean {
  try {
    cssDeclarations(css, selector);
    return true;
  } catch {
    return false;
  }
}

describe('OPEND-3180 icon-only social row', () => {
  it('pins each link to a square icon target the size of the message-centre bell', () => {
    const btn = cssDeclarations(entryLayoutCss, '.entry-nav-rail__menu-social-btn');
    expect(btn).toMatch(/width:\s*28px/);
    expect(btn).toMatch(/height:\s*28px/);
    expect(btn).toMatch(/padding:\s*0;/);
    expect(btn).not.toMatch(/gap:\s*5px/);
  });

  it('lays the three icons out left-aligned at one equal gap, not spread across the dock', () => {
    const row = cssDeclarations(entryLayoutCss, '.entry-nav-rail__menu-social');
    expect(row).toMatch(/gap:\s*4px/);
    const dockRow = cssDeclarations(
      entryLayoutCss,
      '.entry-nav-rail__account-dock .entry-nav-rail__menu-social',
    );
    expect(dockRow).toMatch(/justify-content:\s*flex-start/);
    expect(dockRow).not.toMatch(/space-between/);
  });

  it('drops the label rules, so no cascade can bring the names back', () => {
    expect(hasBlock(entryLayoutCss, '.entry-nav-rail__menu-social-label')).toBe(false);
    expect(stripComments(entryLayoutCss)).not.toMatch(/entry-nav-rail__menu-social-label/);
  });
});
