import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// OPEND-2553 QA G1 — entry rail account / workspace polish. Each `describe`
// pins one ticket's rule so a regression in one area fails only its own test.

const entryLayoutCss = readFileSync(
  new URL('../../src/styles/home/entry-layout.css', import.meta.url),
  'utf8',
);
const primitivesCss = readFileSync(new URL('../../src/styles/primitives.css', import.meta.url), 'utf8');

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

function cssDeclarations(css: string, selector: string): string {
  const blocks: string[] = [];
  const rulePattern = /([^{}]+)\{([^}]*)\}/g;
  const cssWithoutComments = stripComments(css);
  let match: RegExpExecArray | null;
  while ((match = rulePattern.exec(cssWithoutComments)) !== null) {
    const selectors = (match[1] ?? '').split(',').map((item) => item.trim());
    if (selectors.includes(selector)) blocks.push(match[2] ?? '');
  }
  if (blocks.length === 0) throw new Error(`Missing CSS block for ${selector}`);
  return blocks.join('\n');
}

function hasBlock(css: string, selector: string): boolean {
  try {
    cssDeclarations(css, selector);
    return true;
  } catch {
    return false;
  }
}

function ruleValue(block: string, property: string): string {
  const matches = [...block.matchAll(new RegExp(`(?:^|[;\\n])\\s*${property}:\\s*([^;]+);`, 'g'))];
  const match = matches.at(-1);
  if (!match) throw new Error(`Missing CSS property ${property}`);
  return match[1]!.trim();
}

describe('OPEND-3113 — workspace switcher hover fill matches the selected nav item', () => {
  it('paints .entry-nav-rail__team:hover with the same fill as .entry-nav-rail__btn.is-active', () => {
    const activeFill = ruleValue(cssDeclarations(entryLayoutCss, '.entry-nav-rail__btn.is-active'), 'background');
    const teamHover = cssDeclarations(entryLayoutCss, '.entry-nav-rail__team:hover');
    expect(ruleValue(teamHover, 'background')).toBe(activeFill);
    // The old fill: a flat grey one step off the panel, not the ink veil.
    expect(teamHover).not.toMatch(/--bg-subtle/);
  });
});

describe('OPEND-3153 — account menu shows no scrollbar in a regular window', () => {
  it('keeps the hover bridge outside the menu scroll box', () => {
    // The 8px bridge over the float gap used to be `.entry-nav-rail__account-menu::before`
    // at `top: 100%` — an absolutely positioned child BELOW the box of an
    // `overflow-y: auto` container, which extends its scrollable area by 8px
    // and draws a scrollbar at every window height. The bridge now hangs off
    // the account container instead, and only while the menu is open.
    expect(hasBlock(entryLayoutCss, '.entry-nav-rail__account .entry-nav-rail__account-menu::before')).toBe(false);
    const bridge = cssDeclarations(entryLayoutCss, '.entry-nav-rail__account.is-menu-open::before');
    expect(ruleValue(bridge, 'position')).toBe('absolute');
    expect(ruleValue(bridge, 'bottom')).toBe('100%');
    expect(ruleValue(bridge, 'height')).toBe('8px');
    // The menu itself still scrolls when the rail is genuinely too short.
    const menu = cssDeclarations(entryLayoutCss, '.entry-nav-rail__account .entry-nav-rail__account-menu');
    expect(ruleValue(menu, 'overflow-y')).toBe('auto');
  });

  it('tightens the identity card so the rows below it fit without scrolling', () => {
    const head = cssDeclarations(entryLayoutCss, '.entry-nav-rail__account-head');
    expect(ruleValue(head, 'padding')).toBe('12px 12px 14px');
  });
});

describe('OPEND-3116 — rail bottom gutter is 8px', () => {
  it('insets the rail panel 8px from the bottom edge', () => {
    const panel = cssDeclarations(entryLayoutCss, '.entry-nav-rail__panel');
    expect(ruleValue(panel, 'margin')).toBe('0 12px 8px');
  });
});

describe('OPEND-3112 — hover marquee primitive', () => {
  it('ships the .od-marquee slot/text pair with a hover-triggered one-way slide', () => {
    const slot = cssDeclarations(primitivesCss, '.od-marquee');
    expect(ruleValue(slot, 'overflow')).toBe('hidden');
    const text = cssDeclarations(primitivesCss, '.od-marquee__text');
    expect(ruleValue(text, 'text-overflow')).toBe('ellipsis');
    const play = cssDeclarations(primitivesCss, "*:hover > .od-marquee[data-marquee='on'] > .od-marquee__text");
    expect(ruleValue(play, 'animation')).toMatch(/od-marquee-slide var\(--marquee-duration, 1200ms\) ease-in-out 240ms 1\s+forwards/);
    expect(stripComments(primitivesCss)).toMatch(/@keyframes od-marquee-slide/);
  });
});
