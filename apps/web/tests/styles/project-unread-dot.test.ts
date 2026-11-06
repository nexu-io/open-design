// Measurement spec for the completed-project unread dot (OPEND-3133): the
// 6px #1F68FE disc at the END of a rail 最近项目 row and of a project switcher
// row. Pinned to the design's numbers so the two surfaces cannot drift apart.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

const entryLayoutCss = read('../../src/styles/home/entry-layout.css');
const routinesCss = read('../../src/styles/viewer/routines.css');

function declarations(css: string, selector: string): string {
  const cssWithoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rulePattern = /([^{}]+)\{([^}]*)\}/g;
  const blocks: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = rulePattern.exec(cssWithoutComments)) !== null) {
    const selectors = (match[1] ?? '').split(',').map((item) => item.trim());
    if (selectors.includes(selector)) blocks.push(match[2] ?? '');
  }
  if (blocks.length === 0) throw new Error(`Missing CSS block for ${selector}`);
  return blocks.join('\n');
}

describe.each([
  ['rail 最近项目 row', entryLayoutCss, '.entry-nav-rail__recent-unread'],
  ['project switcher row', routinesCss, '.workspace-tabs-dropdown__row-unread'],
])('unread dot on a %s', (_surface, css, selector) => {
  it('is a 6px blue disc pushed to the row end', () => {
    const dot = declarations(css, selector);
    expect(dot).toMatch(/width:\s*6px/);
    expect(dot).toMatch(/height:\s*6px/);
    expect(dot).toMatch(/flex:\s*0 0 6px/);
    expect(dot).toMatch(/border-radius:\s*50%/);
    expect(dot).toMatch(/background:\s*#1F68FE/i);
    // The row end, whatever the name's length: `margin-left: auto`, not a
    // measured offset.
    expect(dot).toMatch(/margin-left:\s*auto/);
  });
});
