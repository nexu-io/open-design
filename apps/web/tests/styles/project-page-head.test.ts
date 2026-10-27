// Measurement spec for the project page chrome and the project list page head
// (OPEND-3258, OPEND-3201, OPEND-3108).
//
// - The project switcher trigger (folder glyph + name + chevron) sits directly
//   on the transparent pane: no white pill, no shadow (OPEND-3258, per the
//   product recording on OPEND-3178).
// - The project card's footer keeps the relative time whole: the creator
//   ellipsises, the time never shrinks (OPEND-3201).
// - The 全部项目 head is the Demo grid — title on row 1, the collection tabs
//   and the toolbar cluster on row 2, toolbar right-aligned (OPEND-3108; the
//   I2 #8186 PR noted `justify-content: flex-end` as the S-series gap).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const routinesCss = readFileSync(
  new URL('../../src/styles/viewer/routines.css', import.meta.url),
  'utf8',
);
const recentProjectsCss = readFileSync(
  new URL('../../src/styles/home/recent-projects.css', import.meta.url),
  'utf8',
);
const chatCss = readFileSync(new URL('../../src/styles/chat.css', import.meta.url), 'utf8');

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

describe('project switcher trigger over the transparent pane (OPEND-3258)', () => {
  it('paints no white pill and no shadow behind the folder + name + chevron', () => {
    const trigger = declarations(routinesCss, '.workspace-tabs-dropdown__trigger');
    expect(trigger).not.toBe('');
    expect(lastValue(trigger, 'background')).toBe('transparent');
    expect(lastValue(trigger, 'box-shadow')).toBe('none');
    expect(trigger).not.toMatch(/#fff\b/i);
  });

  it('keeps the open menu opaque — only the trigger loses its fill', () => {
    const menu = declarations(routinesCss, '.workspace-tabs-dropdown__menu');
    expect(lastValue(menu, 'background')).not.toBe('transparent');
  });
});

describe('chat card carries no project title row (OPEND-3128)', () => {
  it('drops the `.chat-project-header-title` rules with the row that used them', () => {
    expect(chatCss).not.toMatch(/\.chat-project-header-title/);
  });
});

describe('project card footer keeps the time whole (OPEND-3201)', () => {
  it('lets the creator give way and pins the time', () => {
    const creator = declarations(recentProjectsCss, '.recent-projects__card-creator');
    expect(creator).toMatch(/min-width:\s*0/);
    expect(creator).toMatch(/overflow:\s*hidden/);
    expect(creator).toMatch(/text-overflow:\s*ellipsis/);
    expect(lastValue(creator, 'flex')).toMatch(/^[01] 1 auto$/);

    const when = declarations(recentProjectsCss, '.recent-projects__card-when');
    expect(lastValue(when, 'flex')).toBe('0 0 auto');
    expect(when).toMatch(/white-space:\s*nowrap/);
  });

  it('grows the time row from a basis that only measures avatar + time, and wraps the chip under it when even that cannot fit', () => {
    const time = declarations(recentProjectsCss, '.recent-projects__card-time');
    expect(time).toMatch(/min-width:\s*0/);
    expect(lastValue(time, 'flex')).toBe('1 1 96px');
    const tag = declarations(recentProjectsCss, '.recent-projects__card-footer .design-card-tag-row');
    expect(lastValue(tag, 'flex')).toBe('0 0 auto');
    const footer = declarations(recentProjectsCss, '.recent-projects__card-footer');
    expect(lastValue(footer, 'flex-wrap')).toBe('wrap');
  });
});

describe('全部项目 page head (OPEND-3108)', () => {
  it('lays the title on row 1 and the tabs + toolbar on row 2, toolbar right-aligned', () => {
    const head = declarations(recentProjectsCss, '.recent-projects__head--personal');
    expect(lastValue(head, 'display')).toBe('grid');
    expect(lastValue(head, 'grid-template-columns')).toBe('minmax(0, 1fr) auto');

    const title = declarations(recentProjectsCss, '.recent-projects__head--personal .recent-projects__title-block');
    expect(lastValue(title, 'grid-row')).toBe('1');
    expect(lastValue(title, 'grid-column')).toBe('1 / -1');

    const tabs = declarations(recentProjectsCss, '.recent-projects__collection-switch');
    expect(lastValue(tabs, 'grid-row')).toBe('2');
    expect(lastValue(tabs, 'grid-column')).toBe('1');

    const controls = declarations(recentProjectsCss, '.recent-projects__head--personal .recent-projects__controls');
    expect(lastValue(controls, 'grid-row')).toBe('2');
    expect(lastValue(controls, 'grid-column')).toBe('2');
    expect(lastValue(controls, 'justify-self')).toBe('end');
    expect(lastValue(declarations(recentProjectsCss, '.recent-projects__controls'), 'justify-content')).toBe('flex-end');
  });

  it('draws a tab as a transparent pill that fills only when hovered or current', () => {
    const option = declarations(recentProjectsCss, '.recent-projects__collection-option');
    expect(lastValue(option, 'background')).toBe('transparent');
    // `height: auto` is load-bearing: primitives.css's bare `button { height: 36px }`
    // would otherwise pin the box and swallow the padding.
    expect(lastValue(option, 'height')).toBe('auto');
    expect(lastValue(option, 'border-radius')).toBe('var(--radius-pill)');
    const current = declarations(recentProjectsCss, '.recent-projects__collection-option[aria-checked="true"]');
    expect(lastValue(current, 'background')).toBe('var(--bg-subtle)');
  });
});
