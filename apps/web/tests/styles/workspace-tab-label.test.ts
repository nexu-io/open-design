import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const drawerCss = readFileSync(
  new URL('../../src/styles/workspace/drawer.css', import.meta.url),
  'utf8',
);
const routinesCss = readFileSync(
  new URL('../../src/styles/viewer/routines.css', import.meta.url),
  'utf8',
);
const tabLabel = readFileSync(
  new URL('../../src/components/workspace/TabLabel.tsx', import.meta.url),
  'utf8',
);

function cssDeclarations(css: string, selector: string): string {
  const blocks: string[] = [];
  const rulePattern = /([^{}]+)\{([^}]*)\}/g;
  const cssWithoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let match: RegExpExecArray | null;
  while ((match = rulePattern.exec(cssWithoutComments)) !== null) {
    const selectors = (match[1] ?? '').split(',').map((item) => item.trim());
    if (selectors.includes(selector)) blocks.push(match[2] ?? '');
  }
  if (blocks.length === 0) throw new Error(`Missing CSS block for ${selector}`);
  return blocks.join('\n');
}

/**
 * The label's box is CLIPPED while it opens, which makes two things unsafe:
 * anything inside that answers the animating width re-runs its own ellipsis
 * every frame (the last character flickering between glyph and "…"), and any
 * animation that overshoots uncovers, re-covers and uncovers the last glyph
 * (the character shaking as the tab settles).
 */
describe('workspace tab label animation', () => {
  it('lays the label out at its final size and only clips it', () => {
    const inner = cssDeclarations(drawerCss, '.ws-tab .ws-tab-anim > *');
    expect(inner).toMatch(/(?:^|[;\n])\s*flex:\s*none\s*;/);
    expect(inner).toMatch(/(?:^|[;\n])\s*width:\s*max-content\s*;/);

    const wrapper = cssDeclarations(drawerCss, '.ws-tab-anim');
    expect(wrapper).toMatch(/(?:^|[;\n])\s*overflow:\s*hidden\s*;/);
    expect(wrapper).toMatch(/(?:^|[;\n])\s*white-space:\s*nowrap\s*;/);
  });

  it('animates width alone, monotonically, on the house easing', () => {
    expect(tabLabel).toMatch(/duration:\s*0\.2,\s*ease:\s*EASE_OUT/);
    expect(tabLabel).toMatch(/duration:\s*0\.14,\s*ease:\s*EASE_OUT/);
    // A spring on a clipping box shakes its last glyph.
    expect(tabLabel).not.toMatch(/type:\s*'spring'/);
    // Width is the ONLY animated property: opacity and filter both promote the
    // label to its own compositing layer, which switches text antialiasing on
    // the way in and back on the way out — that pair is the selected tab's
    // shudder. (The source still says "blur"/"opacity" in the comment that
    // explains why they are gone.)
    expect(tabLabel).not.toMatch(/filter:\s*['"]blur/);
    expect(tabLabel).not.toMatch(/opacity:\s*[01]/);
  });
});

/**
 * The strip's vertical geometry has one number in it and no slack anywhere.
 *
 * It is a grid, so its row used to take the height of its tallest child — and
 * one of those children is a portal host the open viewer fills. A taller child
 * stretched the row, the side tracks are `height: 100%`, and the tabs centred
 * inside the taller box: the 12px inset measured 16 with a page open, 12
 * without, and the tabs stepped up and down as the user changed panes.
 */
describe('workspace tab strip geometry', () => {
  it('holds its row to one tab tall, whatever gets portaled into it', () => {
    const shell = cssDeclarations(routinesCss, '.app .ws-tabs-shell');
    expect(shell).toMatch(/(?:^|[;\n])\s*grid-template-rows:\s*30px\s*;/);
    expect(shell).toMatch(/(?:^|[;\n])\s*padding:\s*12px 12px 8px\s*;/);

    const bar = cssDeclarations(routinesCss, '.app .ws-tabs-bar');
    expect(bar).toMatch(/(?:^|[;\n])\s*height:\s*30px\s*;/);
    expect(bar).toMatch(/(?:^|[;\n])\s*padding-block:\s*0\s*;/);

    // The tab it is all sized to.
    expect(cssDeclarations(routinesCss, '.app .ws-tab')).toMatch(
      /(?:^|[;\n])\s*height:\s*30px\s*;/,
    );
  });
});
