// OPEND-3111: the shared top chrome (Home / community / all-projects entry
// pages and the project page's chrome row) is 44px tall per the design, not
// the 52px the tab-bar rhythm used to reserve. Three declarations have to move
// together — the `.workspace-shell` grid row that hosts the header, the
// header's own height, and the `--workspace-tabs-chrome-height` token that
// positions popovers under it — and the desktop traffic-light offset
// (apps/desktop/tests/main/window-chrome.test.ts) is derived from the same 44.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const shellCss = readFileSync(new URL('../../src/styles/shell.css', import.meta.url), 'utf8');
const routinesCss = readFileSync(new URL('../../src/styles/viewer/routines.css', import.meta.url), 'utf8');

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

function ruleValue(block: string, property: string): string {
  const matches = [...block.matchAll(new RegExp(`(?:^|[;\\n])\\s*${property}:\\s*([^;]+);`, 'g'))];
  const match = matches.at(-1);
  if (!match) throw new Error(`Missing CSS property ${property}`);
  return match[1]!.trim();
}

describe('top chrome height (OPEND-3111)', () => {
  it('sizes the workspace-shell chrome row at 44px', () => {
    const projectChrome = cssDeclarations(
      routinesCss,
      '.workspace-shell .workspace-tabs-chrome.app-chrome-header',
    );
    expect(ruleValue(projectChrome, 'height')).toBe('44px');
    expect(ruleValue(projectChrome, 'min-height')).toBe('44px');
    expect(ruleValue(projectChrome, '--workspace-tabs-chrome-height')).toBe('44px');
  });

  it('reserves a 44px grid row for the chrome so the body starts right under it', () => {
    const shell = cssDeclarations(routinesCss, '.workspace-shell');
    expect(ruleValue(shell, 'grid-template-rows')).toBe('44px minmax(0, 1fr)');
    const sharedShell = cssDeclarations(shellCss, '.workspace-shell');
    expect(ruleValue(sharedShell, '--workspace-tabs-chrome-height')).toBe('44px');
  });

  it('keeps the 32px controls centred: 6px above and below inside the 44px row', () => {
    const sharedChrome = cssDeclarations(shellCss, '.workspace-tabs-chrome.app-chrome-header');
    expect(ruleValue(sharedChrome, 'height')).toBe('44px');
    const homeChrome = cssDeclarations(routinesCss, '.workspace-tabs-home-chrome');
    expect(ruleValue(homeChrome, 'height')).toBe('32px');
    const tab = cssDeclarations(routinesCss, '.workspace-shell .workspace-tab');
    expect(ruleValue(tab, 'height')).toBe('32px');
    expect(ruleValue(tab, 'align-self')).toBe('center');
  });

  it('brings the generic app chrome header to the same 44px', () => {
    const header = cssDeclarations(shellCss, '.app-chrome-header');
    expect(ruleValue(header, 'min-height')).toBe('44px');
    expect(ruleValue(header, 'padding')).toBe('0 14px');
  });
});
