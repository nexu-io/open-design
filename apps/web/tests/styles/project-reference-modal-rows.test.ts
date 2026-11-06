// Measurement spec for the 引用其他项目 dialog's project rows (OPEND-2787).
//
// Each row is a <button>, so the global primitive (styles/primitives.css) hands
// it `height: 36px; line-height: 1; white-space: nowrap`. Two lines of text
// beside a 28px icon need more than that, and a box shorter than its content
// overflows evenly above and below: the selected border framed only the title
// band and the overflow drew over the neighbouring rows' meta text. These pins
// hold the row to its content and keep hover / selected from touching the box.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const moduleCss = readFileSync(
  new URL('../../src/components/ProjectReferenceModal.module.css', import.meta.url),
  'utf8',
);

function declarations(selector: string): string {
  const cssWithoutComments = moduleCss.replace(/\/\*[\s\S]*?\*\//g, '');
  const rulePattern = /([^{}]+)\{([^}]*)\}/g;
  const blocks: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = rulePattern.exec(cssWithoutComments)) !== null) {
    const selectors = (match[1] ?? '').split(',').map((item) => item.trim());
    if (selectors.includes(selector)) blocks.push(match[2] ?? '');
  }
  return blocks.join('\n');
}

describe('project reference modal — rows', () => {
  it('sizes the row to its two lines instead of the 36px button primitive', () => {
    const item = declarations('.item');
    expect(item).toMatch(/height:\s*auto/);
    expect(item).toMatch(/min-height:\s*0/);
    expect(item).toMatch(/line-height:\s*normal/);
    expect(item).toMatch(/padding:\s*8px 10px/);
    expect(item).toMatch(/align-items:\s*center/);
    // The border is always drawn (transparent at rest) so selecting a row
    // recolours it rather than adding 1px to the box.
    expect(item).toMatch(/border:\s*1px solid transparent/);
  });

  it('never lets the scrolling list shrink a row below its content (OPEND-2787, second pass)', () => {
    // `.list` is a column flexbox capped at 380px. With `min-height: 0` on the
    // row (needed against the button primitive) every row became a shrinkable
    // flex item, so a list of 15 projects squeezed each row to ~31px — the
    // two lines overflowed the box and the selected border cut through them
    // again, exactly the 09-15 QA capture. The row must opt out of shrinking
    // and let the list scroll instead.
    const item = declarations('.item');
    expect(item).toMatch(/flex(?:-shrink)?:\s*(?:0 0 auto|0)\s*;/);
    expect(declarations('.list')).toMatch(/overflow:\s*auto/);
  });

  it('keeps hover and selected on the same box as the resting row', () => {
    for (const selector of ['.item:hover', '.item:focus-visible', '.itemSelected']) {
      const state = declarations(selector);
      expect(state, selector).not.toMatch(/(?<![a-z-])(?:min-|max-)?height\s*:/);
      expect(state, selector).not.toMatch(/\bpadding(?:-[a-z]+)?\s*:/);
      expect(state, selector).not.toMatch(/\bmargin(?:-[a-z]+)?\s*:/);
      expect(state, selector).not.toMatch(/\bborder-width\s*:/);
      expect(state, selector).not.toMatch(/\bborder\s*:/);
      expect(state, selector).not.toMatch(/\btransform\s*:/);
    }
    expect(declarations('.itemSelected')).toMatch(/border-color:/);
    expect(declarations('.itemSelected')).toMatch(/background:/);
  });

  it('pins the two text lines and the 已选 tag so the row height is stable', () => {
    expect(declarations('.itemTitle')).toMatch(/line-height:\s*18px/);
    expect(declarations('.itemTitle')).toMatch(/white-space:\s*nowrap/);
    expect(declarations('.itemTitle')).toMatch(/text-overflow:\s*ellipsis/);
    expect(declarations('.itemMeta')).toMatch(/line-height:\s*16px/);
    expect(declarations('.itemMeta')).toMatch(/white-space:\s*nowrap/);
    expect(declarations('.itemText')).toMatch(/gap:\s*2px/);
    const tag = declarations('.currentTag');
    expect(tag).toMatch(/line-height:\s*16px/);
    expect(tag).toMatch(/white-space:\s*nowrap/);
    expect(tag).not.toMatch(/(?<![a-z-])(?:min-)?height\s*:/);
  });

  it('separates rows with a fixed gap so no row can paint over its neighbour', () => {
    const list = declarations('.list');
    expect(list).toMatch(/gap:\s*4px/);
    expect(list).toMatch(/flex-direction:\s*column/);
  });
});
