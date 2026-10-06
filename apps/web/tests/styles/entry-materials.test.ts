// Measurement spec for the entry surface's MATERIALS (OPEND-2553 PR-C1, ported
// from upstream #7635): the one app scrim, the flat rail column, the content
// card, the 38px rail rows, and the scrolling 最近项目 list. Values are pinned
// to the Demo's, so a drift in either direction fails here before it reaches a
// screenshot.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

const materialCss = read('../../src/styles/material.css');
const entryLayoutCss = read('../../src/styles/home/entry-layout.css');
const routinesCss = read('../../src/styles/viewer/routines.css');
const dialogModuleCss = read('../../../../packages/components/src/dialog.module.css');

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

/** The declarations of `selector` inside the at-rule blocks whose prelude
 *  contains `atRule` (a file may carry several such blocks). */
function declarationsInside(css: string, atRule: string, selector: string): string {
  const cssWithoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const bodies: string[] = [];
  let start = cssWithoutComments.indexOf(atRule);
  if (start === -1) throw new Error(`Missing at-rule ${atRule}`);
  while (start !== -1) {
    const open = cssWithoutComments.indexOf('{', start);
    let depth = 0;
    let end = open;
    for (let index = open; index < cssWithoutComments.length; index += 1) {
      const char = cssWithoutComments[index];
      if (char === '{') depth += 1;
      if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          end = index;
          break;
        }
      }
    }
    bodies.push(cssWithoutComments.slice(open + 1, end));
    start = cssWithoutComments.indexOf(atRule, end);
  }
  const matches = bodies.flatMap((body) => {
    try {
      return [declarations(body, selector)];
    } catch {
      return [];
    }
  });
  if (matches.length === 0) throw new Error(`Missing CSS block for ${selector} inside ${atRule}`);
  return matches.join('\n');
}

describe('app scrim material (styles/material.css)', () => {
  it('owns both halves of the one modal scrim: a 60% white tint under a 50px blur', () => {
    const root = declarations(materialCss, ':root');
    expect(root).toMatch(/--scrim-tint:\s*rgba\(255, 255, 255, 0\.6\)/);
    expect(root).toMatch(/--scrim-backdrop:\s*blur\(50px\)/);
    expect(root).not.toMatch(/--scrim-backdrop:\s*blur\(4px\)/);
  });

  it('carries the dark-over-media pair for controls that float over a thumbnail', () => {
    const root = declarations(materialCss, ':root');
    expect(root).toMatch(/--material-dim:\s*rgba\(0, 0, 0, 0\.55\)/);
    expect(root).toMatch(/--vibrancy-label-on-dim:\s*#fff/);
  });

  it('degrades the scrim to an opaque elevated ground when transparency or backdrop-filter is off', () => {
    const reduced = declarationsInside(materialCss, '@media (prefers-reduced-transparency: reduce)', 'html:root');
    expect(reduced).toMatch(/--scrim-tint:\s*var\(--bg-elevated\)/);
    expect(reduced).toMatch(/--scrim-backdrop:\s*none/);
    expect(reduced).toMatch(/--material-dim:\s*rgba\(0, 0, 0, 0\.88\)/);

    const unsupported = declarationsInside(materialCss, '@supports not ((backdrop-filter', 'html:root');
    expect(unsupported).toMatch(/--scrim-tint:\s*var\(--bg-elevated\)/);
    expect(unsupported).toMatch(/--scrim-backdrop:\s*none/);
  });

  it('is what the shared <Dialog> backdrop reads, above every piece of app chrome', () => {
    const backdrop = declarations(dialogModuleCss, '.backdrop');
    expect(backdrop).toMatch(/background:\s*var\(--scrim-tint\)/);
    expect(backdrop).toMatch(/backdrop-filter:\s*var\(--scrim-backdrop\)/);
    expect(backdrop).toMatch(/z-index:\s*1500/);
  });

  it('is what every app-owned overlay backdrop reads (no per-component tints left)', () => {
    const overlays = [
      '../../src/components/BrandPickerModal.module.css',
      '../../src/components/FigmaHelpModal.module.css',
      '../../src/components/LibraryPreviewModal.module.css',
      '../../src/components/LibraryUploadModal.module.css',
      '../../src/components/MessageCenter.module.css',
      '../../src/components/NewBrandModal.module.css',
      '../../src/components/ProjectReferenceModal.module.css',
      '../../src/components/UpdateDialog.module.css',
      '../../src/styles/home/new-project-modal.css',
      '../../src/styles/home/use-everywhere.css',
      '../../src/styles/viewer/library.css',
      '../../src/styles/workspace/drawer.css',
      '../../src/styles/workspace/mention-home.css',
    ];
    for (const overlay of overlays) {
      const css = read(overlay);
      expect(css, overlay).toMatch(/background:\s*var\(--scrim-tint\)/);
      expect(css, overlay).toMatch(/backdrop-filter:\s*var\(--scrim-backdrop\)/);
    }
    // The lightboxes are the deliberate exception: a light scrim would wash the
    // image out. They keep their own dark ground and say so.
    for (const lightbox of [
      '../../src/components/BrandPreviewCard.module.css',
      '../../src/components/DesignSystemAssetDropzone.module.css',
    ]) {
      expect(read(lightbox), lightbox).toMatch(/DELIBERATE exception to the app's one scrim/);
    }
  });
});

describe('entry layout materials (styles/home/entry-layout.css)', () => {
  it('flattens the rail column: 12px side gutters (8px bottom), no padding, no surface / rim / shadow', () => {
    const panel = declarations(entryLayoutCss, '.entry-nav-rail__panel');
    // Bottom is 8 since OPEND-3116 (design spec); the sides keep the 12px gutter.
    expect(panel).toMatch(/margin:\s*0 12px 8px/);
    expect(panel).toMatch(/padding:\s*0/);
    expect(panel).not.toMatch(/--rail-surface/);
    expect(panel).not.toMatch(/backdrop-filter/);
    expect(panel).not.toMatch(/border-radius/);
    expect(panel).not.toMatch(/box-shadow/);
    expect(entryLayoutCss).not.toContain('.entry-nav-rail__panel::after');
    expect(declarations(entryLayoutCss, '.entry-nav-rail__group')).toMatch(/padding:\s*0;/);
    // …but it stays a containing block for the fixed menu click-catchers, so
    // an open workspace switcher never swallows clicks on the content column.
    expect(panel).toMatch(/transform:\s*translateZ\(0\)/);
    expect(declarations(entryLayoutCss, '.entry-nav-rail__menu-backdrop')).toMatch(/position:\s*fixed/);
  });

  it('makes the content column the one base card: 85% white frost, 16px corner, inset ring, 12px inset', () => {
    const card = declarations(entryLayoutCss, '.entry-main--scroll');
    expect(card).toMatch(/margin:\s*0 12px 12px 0/);
    expect(card).toMatch(/--entry-content-surface:\s*rgba\(255, 255, 255, 0\.85\)/);
    expect(card).toMatch(/--entry-content-ring:\s*var\(--glass-refract-ring-edge\)/);
    expect(card).toMatch(/background:\s*var\(--entry-content-surface\)/);
    expect(card).toMatch(/backdrop-filter:\s*var\(--material-thin-backdrop\)/);
    expect(card).toMatch(/border-radius:\s*16px/);
    expect(card).toMatch(/box-shadow:\s*var\(--shadow-sm\),\s*inset 0 0 0 1px var\(--entry-content-ring\)/);
    expect(declarations(entryLayoutCss, '.entry:not(.entry--rail-open) .entry-main--scroll')).toMatch(
      /margin-left:\s*12px/,
    );
    // Narrow-window auto-collapse keeps `.entry--rail-open`, so it needs its own
    // copy of that gutter.
    expect(
      declarationsInside(
        entryLayoutCss,
        '@media (max-width: 1080px)',
        '.entry-shell--no-header .entry.entry--rail-open .entry-main--scroll',
      ),
    ).toMatch(/margin-left:\s*12px/);
  });

  it('degrades the content card to a solid surface without transparency / backdrop-filter', () => {
    const reduced = declarationsInside(entryLayoutCss, '@media (prefers-reduced-transparency: reduce)', '.entry-main--scroll');
    expect(reduced).toMatch(/--entry-content-surface:\s*var\(--bg\)/);
    expect(reduced).toMatch(/backdrop-filter:\s*none/);
    const unsupported = declarationsInside(entryLayoutCss, '@supports not ((backdrop-filter', '.entry-main--scroll');
    expect(unsupported).toMatch(/--entry-content-surface:\s*var\(--bg\)/);
    expect(unsupported).toMatch(/--entry-content-ring:\s*color-mix\(in srgb, var\(--border\) 66%, transparent\)/);
  });

  it('gives the content column one 24px gutter with the cap carrying it', () => {
    const inner = declarations(entryLayoutCss, '.entry-main__inner');
    expect(inner).toMatch(/max-width:\s*calc\(1600px \+ 48px\)/);
    expect(inner).toMatch(/padding:\s*24px 24px 48px/);
    expect(inner).not.toMatch(/padding-left:\s*35px/);
    expect(declarations(entryLayoutCss, '.entry-main__inner--wide')).toMatch(/max-width:\s*calc\(1600px \+ 48px\)/);
  });

  it('turns every rail destination into a 38px, 12px-radius row on the shared quiet ink', () => {
    const btn = declarations(entryLayoutCss, '.entry-nav-rail__btn');
    expect(btn).toMatch(/height:\s*auto/);
    expect(btn).toMatch(/padding:\s*10px 10px 10px 16px/);
    expect(btn).toMatch(/border:\s*0/);
    expect(btn).toMatch(/border-radius:\s*12px/);
    expect(btn).toMatch(/color:\s*var\(--rail-ink-quiet\)/);
    expect(declarations(entryLayoutCss, '.entry-nav-rail__btn-icon')).toMatch(/color:\s*inherit/);
    expect(declarations(entryLayoutCss, '.entry-nav-rail__btn-label')).toMatch(/font-weight:\s*600/);

    const active = declarations(entryLayoutCss, '.entry-nav-rail__btn.is-active');
    expect(active).toMatch(/background:\s*color-mix\(in srgb, var\(--text-strong\) 10%, transparent\)/);
    expect(declarations(entryLayoutCss, '.entry-nav-rail__btn.is-active .entry-nav-rail__btn-label')).toMatch(
      /color:\s*#121212/,
    );
  });

  it('paints one hover for the whole rail: destinations and the 最近项目 rows share fill and ink (OPEND-2700)', () => {
    const navHover = declarations(entryLayoutCss, '.entry-nav-rail__btn:not(.is-active):hover');
    const headHover = declarations(entryLayoutCss, '.entry-nav-rail__recent-head:hover:not(:disabled)');
    const itemHover = declarations(entryLayoutCss, '.entry-nav-rail__recent-item:hover:not(:disabled)');
    for (const block of [navHover, headHover, itemHover]) {
      expect(block).toMatch(/background:\s*color-mix\(in srgb, var\(--text-strong\) 10%, transparent\)/);
      expect(block).toMatch(/color:\s*var\(--text-strong\)/);
    }
    // Same box, same corner.
    expect(declarations(entryLayoutCss, '.entry-nav-rail__recent-head')).toMatch(/border-radius:\s*12px/);
    expect(declarations(entryLayoutCss, '.entry-nav-rail__recent-head')).toMatch(/min-height:\s*38px/);
  });

  it('gives the workspace switcher row the same 38px box, with a 24px avatar', () => {
    expect(declarations(entryLayoutCss, '.entry-nav-rail__team')).toMatch(/height:\s*38px/);
    const avatar = declarations(entryLayoutCss, '.entry-nav-rail__team-avatar');
    expect(avatar).toMatch(/width:\s*24px/);
    expect(avatar).toMatch(/flex:\s*0 0 24px/);
    expect(declarations(entryLayoutCss, '.entry-nav-rail__team-chevron')).toMatch(/flex:\s*0 0 14px/);
  });

  it('lists every recent project and scrolls the LIST past ~11 rows, shrinking with the window (OPEND-2757)', () => {
    const list = declarations(entryLayoutCss, '.entry-nav-rail__recent-list');
    expect(list).toMatch(/max-height:\s*calc\(11 \* 38px \+ 10 \* 2px \+ 2px\)/);
    expect(list).toMatch(/overflow-y:\s*auto/);
    expect(list).toMatch(/min-height:\s*0/);
    // The flex chain that lets the cap shrink with the viewport instead of
    // pushing the fixed rows below the list out of the rail.
    for (const selector of [
      '.entry-nav-rail__team-section',
      '.entry-nav-rail__recent',
      '.entry-nav-rail__recent > .accordion-collapsible',
    ]) {
      expect(declarations(entryLayoutCss, selector), selector).toMatch(/min-height:\s*0/);
      expect(declarations(entryLayoutCss, selector), selector).toMatch(/flex:\s*0 1 auto/);
    }
    expect(
      declarations(entryLayoutCss, '.entry-nav-rail__recent > .accordion-collapsible > .accordion-collapsible-inner'),
    ).toMatch(/display:\s*flex/);
  });

  it('dresses the chrome-row search + rail toggle as icon squares on the selected-row fill', () => {
    const search = declarations(entryLayoutCss, '.entry-nav-rail__search-row .entry-nav-rail__search');
    expect(search).toMatch(/width:\s*34px/);
    expect(search).toMatch(/padding:\s*0/);
    expect(declarations(entryLayoutCss, '.entry-nav-rail__search')).toMatch(/background:\s*transparent/);
    expect(declarations(entryLayoutCss, '.entry-nav-rail__collapse:hover:not(:disabled)')).toMatch(
      /background:\s*color-mix\(in srgb, var\(--text-strong\) 10%, transparent\)/,
    );
    expect(declarations(entryLayoutCss, '.entry-nav-rail__search-kbd')).toMatch(/display:\s*none/);
    expect(declarations(entryLayoutCss, '.workspace-tabs-rail-actions .entry-nav-rail__collapse')).toMatch(
      /margin-left:\s*0/,
    );
  });
});

describe('workspace tab dropdown (styles/viewer/routines.css)', () => {
  it('reserves a 14px lead slot on every row and paints the check off its own class', () => {
    const lead = declarations(routinesCss, '.workspace-tabs-dropdown__row-lead');
    expect(lead).toMatch(/flex:\s*0 0 14px/);
    expect(lead).toMatch(/width:\s*14px/);
    expect(declarations(routinesCss, '.workspace-tabs-dropdown__row-check')).toMatch(/color:\s*var\(--accent\)/);
    expect(routinesCss).not.toContain('.workspace-tabs-dropdown__row-main > svg:first-child');
  });

  it('hovers the chat Home logo on the rail\'s selected-row fill, 64px wide', () => {
    expect(declarations(routinesCss, '.workspace-tabs-home-chrome')).toMatch(/width:\s*64px/);
    expect(declarations(routinesCss, '.workspace-tabs-home-chrome:hover:not(:disabled)')).toMatch(
      /background:\s*color-mix\(in srgb, var\(--text-strong\) 10%, transparent\)/,
    );
  });
});
