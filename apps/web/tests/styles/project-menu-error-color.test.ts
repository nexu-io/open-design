// OPEND-4710: a failed move to the team space is reported in the project card
// menu and in the rail row menu. Both must use the error colour; the card menu
// used to have no rule at all and inherited the menu's dark grey text.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function read(path: string): string {
  return readFileSync(new URL(`../../src/styles/home/${path}`, import.meta.url), 'utf8');
}

function colorOf(css: string, selector: string): string | null {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rulePattern = /([^{}]+)\{([^}]*)\}/g;
  let color: string | null = null;
  let match: RegExpExecArray | null;
  while ((match = rulePattern.exec(withoutComments)) !== null) {
    const selectors = (match[1] ?? '').split(',').map((item) => item.trim());
    if (!selectors.includes(selector)) continue;
    const value = /(?:^|[;\n])\s*color:\s*([^;]+);/.exec(match[2] ?? '')?.[1]?.trim();
    if (value) color = value;
  }
  return color;
}

describe('OPEND-4710 project menu error colour', () => {
  it('uses the same error colour in the card menu and the rail row menu', () => {
    const rail = colorOf(read('entry-layout.css'), '.entry-nav-rail__recent-menu-error');
    const card = colorOf(read('recent-projects.css'), '.recent-projects__card-menu-error');
    expect(rail).toBe('var(--red, #f04142)');
    expect(card).toBe(rail);
  });
});
