// Measurement spec for the project page's chat PANE MATERIAL and SHELL
// (OPEND-3090 / OPEND-2553 S6, ported from upstream #8113 @877980fb17): the
// transparent chat card over the app wash, the 4px resize gutter with no
// painted strip in any state, the Home-style design-system trigger in the
// composer, and the agent popover pinned inside the composer shell. Values are
// pinned to the Demo's, so a drift in either direction fails here before it
// reaches a screenshot.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

const shellCss = read('../../src/styles/shell.css');
const routinesCss = read('../../src/styles/viewer/routines.css');
const homeHeroCss = read('../../src/styles/home/home-hero.css');
const projectViewSource = read('../../src/components/ProjectView.tsx');
const avatarMenuSource = read('../../src/components/AvatarMenu.tsx');

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

describe('project chat pane material (styles/viewer/routines.css)', () => {
  it('keeps the 8px bottom/left inset slot painted with the page veil', () => {
    const slot = declarations(routinesCss, '.app .split-chat-slot');
    expect(slot).toMatch(/padding:\s*0 0 8px 8px;/);
    expect(slot).toMatch(/background:\s*var\(--veil-page, transparent\);/);
  });

  it('lets the app wash show through the card: transparent, no backdrop blur, rounded and clipped', () => {
    const pane = declarations(routinesCss, '.app .split-chat-slot > .pane');
    expect(pane).toMatch(/background:\s*transparent;/);
    expect(pane).toMatch(/-webkit-backdrop-filter:\s*none;/);
    expect(pane).toMatch(/(^|[^-])backdrop-filter:\s*none;/);
    expect(pane).not.toMatch(/color-mix\(in srgb, #fff 85%, transparent\)/);
    expect(pane).not.toMatch(/var\(--material-regular-backdrop\)/);
    expect(pane).toMatch(/border:\s*none;/);
    expect(pane).toMatch(/border-radius:\s*var\(--radius-lg\);/);
    expect(pane).toMatch(/box-shadow:\s*none;/);
    expect(pane).toMatch(/overflow:\s*hidden;/);
  });

  it('still flattens the card to a solid surface when transparency is reduced or unsupported', () => {
    expect(
      declarationsInside(routinesCss, '@media (prefers-reduced-transparency: reduce)', '.app .split-chat-slot > .pane'),
    ).toMatch(/background:\s*var\(--bg-elevated\);/);
    expect(
      declarationsInside(
        routinesCss,
        '@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))',
        '.app .split-chat-slot > .pane',
      ),
    ).toMatch(/background:\s*var\(--bg-elevated\);/);
  });
});

describe('project chat resize gutter (styles/shell.css + routines.css + ProjectView.tsx)', () => {
  it('registers and seeds the handle track at 4px', () => {
    expect(declarations(shellCss, '@property --project-chat-handle-width')).toMatch(
      /initial-value:\s*4px;/,
    );
    expect(declarations(shellCss, '.split')).toMatch(/--project-chat-handle-width:\s*4px;/);
  });

  it('sizes the handle from the track variable so focus mode can animate it to 0', () => {
    const shellHandle = declarations(shellCss, '.split-resize-handle');
    expect(shellHandle).toMatch(/width:\s*var\(--project-chat-handle-width, 4px\);/);
    expect(shellHandle).toMatch(/min-width:\s*0;/);
    expect(shellHandle).toMatch(/background:\s*transparent;/);

    const appHandle = declarations(routinesCss, '.app .split-resize-handle');
    expect(appHandle).toMatch(/width:\s*var\(--project-chat-handle-width, 4px\);/);
    expect(appHandle).toMatch(/min-width:\s*0;/);
    expect(appHandle).toMatch(/background:\s*transparent;/);
    expect(appHandle).not.toMatch(/width:\s*8px/);
  });

  it('paints no strip on the gutter at rest, on hover, or while dragging', () => {
    expect(declarations(routinesCss, '.app .split-resize-handle::after')).toMatch(/display:\s*none;/);
    const hover = declarations(routinesCss, '.app .split-resize-handle:hover');
    expect(hover).toMatch(/background:\s*transparent;/);
    expect(declarations(routinesCss, '.app .split.is-resizing-chat .split-resize-handle')).toMatch(
      /background:\s*transparent;/,
    );
  });

  it('keeps the layout math in ProjectView on the same 4px', () => {
    expect(projectViewSource).toMatch(/const SPLIT_RESIZE_HANDLE_WIDTH = 4;/);
  });
});

describe('project composer design-system trigger (ProjectView.tsx)', () => {
  it('renders the Home-style palette trigger in the chat composer, not the icon-button variant', () => {
    const start = projectViewSource.indexOf('designSystemPicker={(');
    expect(start).toBeGreaterThan(-1);
    const picker = projectViewSource.slice(start, projectViewSource.indexOf('/>', start));
    expect(picker).toMatch(/<DesignSystemPicker\s+variant="home"/);
    expect(picker).not.toMatch(/variant="icon"/);
  });

  it('gives the composer-row trigger the upload disc\'s 36px circle, the same as on Home', () => {
    const trigger = declarations(homeHeroCss, '.composer-row .home-hero__ds-row-trigger');
    expect(trigger).toMatch(/min-height:\s*36px;/);
    expect(trigger).toMatch(/border-radius:\s*var\(--radius-pill\);/);
    expect(trigger).toMatch(/background:\s*var\(--bg-panel\);/);
    expect(trigger).toMatch(/box-shadow:\s*none;/);
    const iconOnly = declarations(homeHeroCss, '.composer-row .home-hero__ds-row-trigger.is-icon-only');
    expect(iconOnly).toMatch(/width:\s*36px;/);
    expect(iconOnly).toMatch(/min-width:\s*36px;/);
    expect(iconOnly).toMatch(/height:\s*36px;/);
    expect(iconOnly).toMatch(/border-radius:\s*var\(--radius-circular, 50%\);/);
    expect(
      declarations(homeHeroCss, '.composer-row .home-hero__ds-row-trigger[aria-expanded="true"]'),
    ).toMatch(/background:\s*var\(--bg-subtle\);/);
  });
});

describe('composer agent popover (AvatarMenu.tsx + styles/shell.css)', () => {
  it('pins the popover between the composer shell edges and re-measures when the shell resizes', () => {
    expect(avatarMenuSource).toMatch(/closest\('\.composer-shell'\)/);
    expect(avatarMenuSource).toMatch(/new ResizeObserver\(updatePosition\)/);
    expect(avatarMenuSource).toMatch(/resizeObserver\?\.disconnect\(\)/);
    expect(avatarMenuSource).toMatch(/Math\.min\(208, Math\.max\(0, maxRight - minLeft\)\)/);
    expect(avatarMenuSource).not.toMatch(/Math\.min\(208, window\.innerWidth - margin \* 2\)/);
  });

  it('is a flat elevated surface: solid --bg, no glass backdrop', () => {
    const popover = declarations(shellCss, '.avatar-popover');
    expect(popover).toMatch(/background:\s*var\(--bg\);/);
    expect(popover).toMatch(/-webkit-backdrop-filter:\s*none;/);
    expect(popover).toMatch(/(^|[^-])backdrop-filter:\s*none;/);
    expect(popover).not.toMatch(/var\(--glass-regular\)/);
    expect(popover).not.toMatch(/var\(--glass-backdrop\)/);
  });
});
