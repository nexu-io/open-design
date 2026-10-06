// Red spec for OPEND-3284: a selected project card in multi-select mode must
// not draw a ring around the whole card. The check badge in the corner is the
// selected state; the outline that used to float 4px outside the card (and
// -4px inside a list row) is gone, in both the grid and the list layout.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const recentProjectsCss = readFileSync(
  new URL('../../src/styles/home/recent-projects.css', import.meta.url),
  'utf8',
);

function declarations(css: string, selector: string): string {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rulePattern = /([^{}]+)\{([^}]*)\}/g;
  const blocks: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = rulePattern.exec(withoutComments)) !== null) {
    const selectors = (match[1] ?? '').split(',').map((item) => item.trim());
    if (selectors.includes(selector)) blocks.push(match[2] ?? '');
  }
  return blocks.join('\n');
}

function lastValue(block: string, property: string): string | null {
  const matches = [...block.matchAll(new RegExp(`(?:^|[;\\n])\\s*${property}:\\s*([^;]+);`, 'g'))];
  return matches.at(-1)?.[1]?.trim() ?? null;
}

describe('OPEND-3284 selected project card', () => {
  it('draws no outline around a selected grid card', () => {
    const block = declarations(recentProjectsCss, '.recent-projects__card.is-selected');
    const outline = lastValue(block, 'outline');
    expect(outline === null || outline === 'none' || outline === '0').toBe(true);
    expect(lastValue(block, 'outline-offset')).toBeNull();
    expect(lastValue(block, 'box-shadow')).toBeNull();
  });

  it('draws no outline around a selected list row either', () => {
    const block = declarations(
      recentProjectsCss,
      '.recent-projects__row--list .recent-projects__card.is-selected',
    );
    expect(lastValue(block, 'outline')).toBeNull();
    expect(lastValue(block, 'outline-offset')).toBeNull();
  });

  it('keeps the selection check badge', () => {
    expect(declarations(recentProjectsCss, '.recent-projects__select-check[aria-pressed="true"]')).not.toBe('');
  });
});
