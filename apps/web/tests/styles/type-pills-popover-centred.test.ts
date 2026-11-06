// Measurement spec for the 更多 popover under the Home type row and the
// Community tab row (OPEND-3146 / OPEND-3098, product 2026-09-16): the open
// popover is centred on its row as a whole — not hung off the right edge of the
// 更多 trigger — and lays its entries out as one line (Home may wrap on a narrow
// viewport; Community never wraps).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const homeHeroCss = readFileSync(
  new URL('../../src/styles/home/home-hero.css', import.meta.url),
  'utf8',
);
const marketplaceCss = readFileSync(
  new URL('../../src/styles/home/plugin-marketplace-demo.css', import.meta.url),
  'utf8',
);

function rules(css: string): Array<{ selectors: string[]; body: string }> {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rulePattern = /([^{}]+)\{([^}]*)\}/g;
  const out: Array<{ selectors: string[]; body: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = rulePattern.exec(withoutComments)) !== null) {
    out.push({
      selectors: (match[1] ?? '').split(',').map((item) => item.trim()),
      body: match[2] ?? '',
    });
  }
  return out;
}

function declarations(css: string, selector: string): string {
  return rules(css)
    .filter((rule) => rule.selectors.includes(selector))
    .map((rule) => rule.body)
    .join('\n');
}

describe('更多 popover — centred on its row', () => {
  it('positions against the whole row, not the 更多 trigger', () => {
    // The trigger's box is no longer a containing block, so the popover's
    // `absolute` resolves against the row (Home wrap / Community tab row).
    expect(declarations(homeHeroCss, '.home-hero__type-pills-more')).not.toMatch(/position:\s*relative/);
    expect(declarations(homeHeroCss, '.home-hero__type-pills-wrap')).toMatch(/position:\s*relative/);
    expect(declarations(marketplaceCss, '.community-template-view__type-tabs')).toMatch(/position:\s*relative/);
  });

  it('is horizontally centred with a max-content width and grows from the top centre', () => {
    const popover = declarations(homeHeroCss, '.home-hero__type-pills-popover');
    expect(popover).toMatch(/position:\s*absolute/);
    expect(popover).toMatch(/left:\s*50%/);
    // `translate`, not `transform`: the pop-in animation owns `transform`.
    expect(popover).toMatch(/translate:\s*-50%/);
    expect(popover).not.toMatch(/right:\s*0/);
    expect(popover).toMatch(/width:\s*max-content/);
    expect(popover).toMatch(/transform-origin:\s*top center/);
  });

  it('Home lets the seven entries wrap on a narrow viewport; Community keeps one line', () => {
    const popover = declarations(homeHeroCss, '.home-hero__type-pills-popover');
    expect(popover).toMatch(/flex-wrap:\s*wrap/);
    // Wide enough for one line at the row's own width, capped by the viewport.
    expect(popover).toMatch(/max-width:\s*min\(820px, calc\(100vw - 32px\)\)/);

    const community = declarations(
      marketplaceCss,
      '.community-template-view__type-tabs .home-hero__type-pills-popover',
    );
    expect(community).toMatch(/flex-wrap:\s*nowrap/);
  });

  it('Community centres the line on its shrink-wrapped tab row without leaving the page', () => {
    // The row is narrower than the open line, so a symmetric 50% / -50%
    // centring would overflow the page's left edge. The panel starts on the
    // row's left edge, spans at least the row, and centres its pills inside.
    const community = declarations(
      marketplaceCss,
      '.community-template-view__type-tabs .home-hero__type-pills-popover',
    );
    expect(community).toMatch(/left:\s*0;/);
    expect(community).toMatch(/translate:\s*none;/);
    expect(community).toMatch(/min-width:\s*100%;/);
    expect(declarations(homeHeroCss, '.home-hero__type-pills-popover')).toMatch(/justify-content:\s*center/);
  });
});
