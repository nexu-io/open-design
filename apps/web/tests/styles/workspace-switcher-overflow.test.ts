import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const entryLayoutCss = readFileSync(
  new URL('../../src/styles/home/entry-layout.css', import.meta.url),
  'utf8',
);

function declarations(selector: string): string {
  const cssWithoutComments = entryLayoutCss.replace(/\/\*[\s\S]*?\*\//g, '');
  const rulePattern = /([^{}]+)\{([^}]*)\}/g;
  const blocks: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = rulePattern.exec(cssWithoutComments)) !== null) {
    const selectors = (match[1] ?? '').split(',').map((item) => item.trim());
    if (selectors.includes(selector)) blocks.push(match[2] ?? '');
  }
  return blocks.join('\n');
}

describe('recvqtUggc1VyG — workspace switcher overflow', () => {
  it('caps the menu to the viewport while only the workspace rows scroll', () => {
    const menu = declarations('.entry-nav-rail__team-menu');
    const list = declarations('.entry-nav-rail__workspace-list');
    const actions = declarations('.entry-nav-rail__workspace-actions');

    expect(menu).toMatch(/display:\s*flex/);
    expect(menu).toMatch(/max-height:\s*min\([^;]*vh\)/);
    expect(menu).toMatch(/overflow:\s*hidden/);

    expect(list).toMatch(/max-height:\s*170px/);
    expect(list).toMatch(/overflow-y:\s*auto/);

    expect(actions).toMatch(/position:\s*sticky/);
    expect(actions).toMatch(/bottom:\s*0/);
    expect(actions).toMatch(/flex:\s*0 0 auto/);
  });
});
