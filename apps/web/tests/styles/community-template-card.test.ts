// Measurement spec for the Community gallery's card, tab row and empty state
// (OPEND-2553 阶段三). Pinned to the Demo (#7635) values:
//   • the card is surfaceless — the 16:9 plate carries the hairline stroke and
//     the 16px corners, the caption sits on the page ground under it;
//   • Remix / 做同款 are 30px frosted pills overlaid on the plate's bottom-right
//     corner, revealed on hover / focus-within, always on for touch;
//   • the type tabs are the Home type row's pills (home-hero.css owns them);
//     this sheet only lays the row out and pins no button rule of its own;
//   • the 图片 / 视频 tabs are a multicol masonry keyed on `data-layout`.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const marketplaceCss = readFileSync(
  new URL('../../src/styles/home/plugin-marketplace-demo.css', import.meta.url),
  'utf8',
);
const homeHeroCss = readFileSync(
  new URL('../../src/styles/home/home-hero.css', import.meta.url),
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

describe('community template card', () => {
  it('is a surfaceless card whose plate carries the stroke and the 16px corners', () => {
    const card = declarations(marketplaceCss, '.community-template-card');
    expect(card).toMatch(/border:\s*0;/);
    expect(card).toMatch(/background:\s*transparent;/);
    expect(card).toMatch(/box-shadow:\s*none;/);
    expect(card).toMatch(/border-radius:\s*var\(--radius-xl\);/);

    const preview = declarations(marketplaceCss, '.community-template-card__preview');
    expect(preview).toMatch(/aspect-ratio:\s*16 \/ 9;/);
    // The same hairline the projects grid draws on its covers.
    expect(preview).toMatch(/border:\s*1px solid color-mix\(in srgb, var\(--text\) 8%, transparent\);/);
    expect(preview).toMatch(/border-radius:\s*var\(--radius-xl\);/);

    // Hover is the 1px lift alone — no ring, no shadow around thin air.
    const hover = declarations(marketplaceCss, '.community-template-card.is-clickable:hover');
    expect(hover).toMatch(/transform:\s*translateY\(-1px\);/);
    expect(hover).not.toMatch(/box-shadow|border-color/);
  });

  it('hugs the caption 8px under the plate, title over a publisher byline', () => {
    const foot = declarations(marketplaceCss, '.community-template-card__foot');
    expect(foot).toMatch(/flex-direction:\s*column;/);
    expect(foot).toMatch(/gap:\s*6px;/);
    expect(foot).toMatch(/padding:\s*8px 8px 0;/);
    expect(foot).toMatch(/background:\s*transparent;/);
    expect(foot).not.toMatch(/border-top/);

    const title = declarations(marketplaceCss, '.community-template-card__title');
    expect(title).toMatch(/font-size:\s*13px;/);
    expect(title).toMatch(/font-weight:\s*600;/);
    expect(title).toMatch(/white-space:\s*nowrap;/);

    const byline = declarations(marketplaceCss, '.community-template-card__byline');
    expect(byline).toMatch(/gap:\s*6px;/);
    expect(byline).toMatch(/font-size:\s*12px;/);
    const avatar = declarations(marketplaceCss, '.community-template-card__avatar');
    expect(avatar).toMatch(/width:\s*16px;/);
    expect(avatar).toMatch(/height:\s*16px;/);
    expect(avatar).toMatch(/font-size:\s*9px;/);
    expect(declarations(marketplaceCss, '.community-template-card__meta::before')).toMatch(/content:\s*'·';/);
  });

  it('overlays 30px frosted action pills on the plate, revealed on hover / focus-within', () => {
    const actions = declarations(marketplaceCss, '.community-template-card__actions');
    expect(actions).toMatch(/position:\s*absolute;/);
    expect(actions).toMatch(/right:\s*8px;/);
    expect(actions).toMatch(/bottom:\s*8px;/);
    expect(actions).toMatch(/gap:\s*8px;/);
    expect(actions).toMatch(/opacity:\s*0;/);
    expect(actions).toMatch(/pointer-events:\s*none;/);
    const shown = declarations(marketplaceCss, '.community-template-card:hover .community-template-card__actions');
    expect(shown).toMatch(/opacity:\s*1;/);
    expect(shown).toMatch(/pointer-events:\s*auto;/);
    expect(declarations(marketplaceCss, '.community-template-card__plate')).toMatch(/position:\s*relative;/);

    const pill = declarations(marketplaceCss, '.community-template-card__actions button');
    expect(pill).toMatch(/height:\s*30px;/);
    expect(pill).toMatch(/min-height:\s*30px;/);
    expect(pill).toMatch(/padding:\s*0 calc\(8px - var\(--stroke-thin\)\);/);
    expect(pill).toMatch(/gap:\s*4px;/);
    expect(pill).toMatch(/background:\s*var\(--material-dim\);/);
    expect(pill).toMatch(/backdrop-filter:\s*var\(--material-thin-backdrop\);/);
    expect(pill).toMatch(/color:\s*var\(--vibrancy-label-on-dim\);/);
    // No repaint on hover: the rule restates the rest values.
    const pillHover = declarations(marketplaceCss, '.community-template-card__actions button:hover:not(:disabled)');
    expect(pillHover).toMatch(/background:\s*var\(--material-dim\);/);
    expect(pillHover).toMatch(/color:\s*var\(--vibrancy-label-on-dim\);/);
    // The old footer-button rules are gone with the footer they styled.
    expect(marketplaceCss).not.toMatch(/community-template-card__foot button/);
  });
});

describe('community type tabs', () => {
  it('borrows the Home type pill and pins no button rule of its own', () => {
    const row = declarations(marketplaceCss, '.community-template-view__type-tabs');
    expect(row).toMatch(/display:\s*flex;/);
    expect(row).toMatch(/gap:\s*8px;/);
    // Every button-level rule this sheet used to carry (34px flat pills, grey
    // hover, ink/green selected) is gone: the pill is home-hero.css's.
    const ownButtonRules = rules(marketplaceCss).filter((rule) =>
      rule.selectors.some((selector) => /community-template-view__(type-tabs|subtabs) button/.test(selector)),
    );
    expect(ownButtonRules).toEqual([]);
    expect(marketplaceCss).not.toMatch(/community-template-view__subtabs/);
    expect(marketplaceCss).not.toMatch(/community-template-view__search/);

    // The shared contract it consumes still exists where it is documented.
    expect(declarations(homeHeroCss, '.home-hero__type-pill')).toMatch(/border-radius:\s*var\(--radius-pill\);/);
    expect(declarations(homeHeroCss, '.home-hero__type-pill.is-active')).toMatch(/background:\s*var\(--brand-surface\);/);
    expect(homeHeroCss).toMatch(/SHARED CONTRACT[\s\S]*CommunityView/);
  });
});

describe('community masonry and empty state', () => {
  it('lays the media tabs out as a 300px multicol that tracks the grid column count', () => {
    const grid = declarations(marketplaceCss, '.community-template-grid');
    expect(grid).toMatch(/grid-template-columns:\s*repeat\(auto-fill, minmax\(300px, 1fr\)\);/);
    expect(grid).toMatch(/gap:\s*20px;/);
    const masonry = declarations(marketplaceCss, ".community-template-grid[data-layout='masonry']");
    expect(masonry).toMatch(/display:\s*block;/);
    expect(masonry).toMatch(/column-width:\s*300px;/);
    expect(masonry).toMatch(/column-gap:\s*20px;/);
    expect(masonry).toMatch(/--masonry-tile-min:\s*180px;/);
    // Multicol has no row-gap; the cards carry the 20 and never split.
    const card = declarations(marketplaceCss, ".community-template-grid[data-layout='masonry'] .community-template-card");
    expect(card).toMatch(/margin-bottom:\s*20px;/);
    expect(card).toMatch(/break-inside:\s*avoid;/);
    // The tile takes the poster's own ratio and never crops it.
    expect(declarations(marketplaceCss, ".community-template-grid[data-layout='masonry'] .plugins-home__media"))
      .toMatch(/aspect-ratio:\s*var\(--poster-ratio\);/);
    expect(declarations(marketplaceCss, ".community-template-grid[data-layout='masonry'] .plugins-home__media-img"))
      .toMatch(/object-fit:\s*contain;/);
  });

  it('centres the empty-tab copy over the blueprint mark', () => {
    const empty = declarations(marketplaceCss, '.community-template-view__no-results');
    expect(empty).toMatch(/flex-direction:\s*column;/);
    expect(empty).toMatch(/align-items:\s*center;/);
    expect(empty).toMatch(/gap:\s*20px;/);
    expect(empty).toMatch(/padding:\s*56px 0 72px;/);
    expect(empty).toMatch(/font-size:\s*14px;/);
    const mark = declarations(marketplaceCss, '.community-template-view__no-results-mark');
    expect(mark).toMatch(/width:\s*320px;/);
    expect(mark).toMatch(/max-width:\s*60%;/);
    const title = declarations(marketplaceCss, '.community-template-view__no-results-title');
    expect(title).toMatch(/font-size:\s*15px;/);
    expect(title).toMatch(/font-weight:\s*600;/);
  });
});
