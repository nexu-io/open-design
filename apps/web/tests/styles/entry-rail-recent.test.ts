// Measurement spec for the rail's 最近浏览过 rows (OPEND-2553, ported from
// upstream #7635). The values are pinned to the Demo's, so a drift in either
// direction fails here before it reaches a screenshot.
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

describe('entry rail — 最近浏览过 rows', () => {
  it('pins the shared quiet ink the heading and rows carry', () => {
    expect(declarations('.entry-nav-rail')).toMatch(/--rail-ink-quiet:\s*#5c5c5c/);
    expect(declarations('[data-theme="dark"] .entry-nav-rail')).toMatch(
      /--rail-ink-quiet:\s*color-mix\(in srgb, var\(--text\) 52%, transparent\)/,
    );
  });

  it('gives the section the destinations\' geometry: 16px above, 38px rows, 12px corners', () => {
    expect(declarations('.entry-nav-rail__recent')).toMatch(/margin-top:\s*calc\(16px - 2px\)/);

    const head = declarations('.entry-nav-rail__recent-head');
    expect(head).toMatch(/min-height:\s*38px/);
    expect(head).toMatch(/padding:\s*8px 10px 8px 16px/);
    expect(head).toMatch(/border-radius:\s*12px/);
    expect(head).toMatch(/justify-content:\s*space-between/);
    expect(head).toMatch(/color:\s*var\(--rail-ink-quiet\)/);
    expect(head).toMatch(
      /transition:\s*background-color 120ms var\(--ease-out\), color 120ms var\(--ease-out\)/,
    );

    const title = declarations('.entry-nav-rail__recent-title');
    expect(title).toMatch(/font-size:\s*13px/);
    expect(title).toMatch(/font-weight:\s*500/);

    const list = declarations('.entry-nav-rail__recent-list');
    expect(list).toMatch(/gap:\s*2px/);
    expect(list).toMatch(/padding:\s*2px 0 0/);

    const item = declarations('.entry-nav-rail__recent-item');
    expect(item).toMatch(/padding:\s*10px 10px 10px 16px/);
    expect(item).toMatch(/line-height:\s*18px/);
    expect(item).toMatch(/gap:\s*9px/);
    expect(item).toMatch(/border-radius:\s*12px/);
    expect(item).toMatch(/font-size:\s*13px/);
    expect(item).toMatch(/font-weight:\s*500/);
    expect(item).toMatch(/color:\s*var\(--rail-ink-quiet\)/);

    expect(declarations('.entry-nav-rail__recent-icon')).toMatch(/flex:\s*0 0 18px/);
  });

  it('hover paints the selected-row fill and clears room for the ⋮', () => {
    const hover = declarations('.entry-nav-rail__recent-item:hover:not(:disabled)');
    expect(hover).toMatch(/background:\s*color-mix\(in srgb, var\(--text-strong\) 10%, transparent\)/);
    expect(hover).toMatch(/color:\s*var\(--text-strong\)/);

    expect(declarations('.entry-nav-rail__recent-row:hover .entry-nav-rail__recent-item')).toMatch(
      /padding-right:\s*36px/,
    );

    const more = declarations('.entry-nav-rail__recent-more');
    expect(more).toMatch(/right:\s*6px/);
    expect(more).toMatch(/width:\s*24px/);
    expect(more).toMatch(/height:\s*24px/);
    expect(more).toMatch(/opacity:\s*0/);
    expect(more).toMatch(/transition:\s*opacity 120ms var\(--ease-out\), visibility 0s linear 120ms/);
  });

  it('floats the preview card and the row menu beside the rail on the same slot', () => {
    const preview = declarations('.entry-nav-rail__recent-preview');
    expect(preview).toMatch(/position:\s*fixed/);
    expect(preview).toMatch(/width:\s*216px/);
    expect(preview).toMatch(/padding:\s*8px/);
    expect(preview).toMatch(/border-radius:\s*var\(--radius-xxlarge\)/);
    expect(preview).toMatch(/z-index:\s*1200/);

    expect(declarations('.entry-nav-rail__recent-preview-plate')).toMatch(/aspect-ratio:\s*16 \/ 10/);
    const name = declarations('.entry-nav-rail__recent-preview-name');
    expect(name).toMatch(/-webkit-line-clamp:\s*2/);
    expect(name).toMatch(/color:\s*var\(--text-soft\)/);

    const menu = declarations('.entry-nav-rail__recent-menu');
    expect(menu).toMatch(/position:\s*fixed/);
    expect(menu).toMatch(/min-width:\s*140px/);
    expect(menu).toMatch(/border-radius:\s*var\(--radius-lg\)/);
    expect(declarations('.entry-nav-rail__recent-menu button')).toMatch(/font-size:\s*13px/);
  });

  it('keeps the inline rename inside the row box on the frosted panel', () => {
    const rename = declarations('.entry-nav-rail__recent-rename');
    expect(rename).toMatch(/height:\s*38px/);
    expect(rename).toMatch(/background:\s*transparent/);
    expect(rename).toMatch(/border-radius:\s*12px/);
    expect(declarations('.entry-nav-rail__recent-rename:focus')).toMatch(/border-color:\s*var\(--border\)/);
  });
});
