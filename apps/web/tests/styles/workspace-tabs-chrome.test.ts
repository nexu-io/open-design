import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const shellCss = readFileSync(new URL('../../src/styles/shell.css', import.meta.url), 'utf8');
const routinesCss = readFileSync(new URL('../../src/styles/viewer/routines.css', import.meta.url), 'utf8');
const entryLayoutCss = readFileSync(new URL('../../src/styles/home/entry-layout.css', import.meta.url), 'utf8');

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

describe('workspace tabs chrome styles', () => {
  it('keeps only a small intentional inset before the first tab', () => {
    const chrome = cssDeclarations(shellCss, '.workspace-tabs-chrome.app-chrome-header');
    const traffic = cssDeclarations(shellCss, '.workspace-tabs-chrome .workspace-tabs-traffic');
    const projectChrome = cssDeclarations(
      routinesCss,
      '.workspace-shell .workspace-tabs-chrome.app-chrome-header',
    );
    const projectStrip = cssDeclarations(routinesCss, '.workspace-shell .workspace-tabs-strip');

    expect(ruleValue(chrome, 'padding')).toBe('0 8px 0 6px');
    expect(ruleValue(traffic, 'margin-right')).toBe('var(--app-chrome-traffic-margin)');
    expect(ruleValue(projectChrome, 'padding')).toBe('0 8px 0 0');
    expect(ruleValue(projectStrip, 'align-items')).toBe('center');
  });

  it('keeps the project composer input inset and focus ring polished', () => {
    const composerShell = cssDeclarations(routinesCss, '.app .composer-shell');
    const focusedComposerShell = cssDeclarations(routinesCss, '.app .composer-shell:focus-within');

    expect(ruleValue(composerShell, 'padding')).toBe('7px');
    expect(ruleValue(composerShell, 'border-color')).toBe('color-mix(in srgb, var(--border) 84%, var(--border-strong))');
    expect(ruleValue(composerShell, 'box-shadow')).toBe('var(--shadow-sm)');
    expect(ruleValue(focusedComposerShell, 'border-color')).toBe('color-mix(in srgb, var(--accent) 34%, var(--border-strong))');
    expect(ruleValue(focusedComposerShell, 'box-shadow')).toContain('0 0 0 1px');
  });

  it('uses hairline dividers for the tab chrome and entry rail', () => {
    const chrome = cssDeclarations(shellCss, '.workspace-tabs-chrome.app-chrome-header');
    const chromeDivider = cssDeclarations(shellCss, '.workspace-tabs-chrome.app-chrome-header::after');
    const projectChrome = cssDeclarations(
      routinesCss,
      '.workspace-shell .workspace-tabs-chrome.app-chrome-header',
    );
    const rail = cssDeclarations(entryLayoutCss, '.entry-nav-rail');
    const railDivider = cssDeclarations(entryLayoutCss, '.entry-nav-rail::after');

    const hairlineColor = 'color-mix(in srgb, var(--border) 64%, transparent)';
    expect(ruleValue(chrome, 'border-bottom')).toBe('0');
    expect(ruleValue(projectChrome, 'border-bottom')).toBe('0');
    expect(ruleValue(rail, 'border-right')).toBe('0');
    expect(ruleValue(chromeDivider, 'height')).toBe('1px');
    expect(ruleValue(chromeDivider, 'background')).toBe(hairlineColor);
    expect(ruleValue(chromeDivider, 'transform')).toBe('scaleY(0.5)');
    expect(ruleValue(railDivider, 'width')).toBe('1px');
    expect(ruleValue(railDivider, 'background')).toBe(hairlineColor);
    expect(ruleValue(railDivider, 'transform')).toBe('scaleX(0.5)');
  });

  it('keeps workspace tabs compact and centered in the top chrome', () => {
    const projectTab = cssDeclarations(routinesCss, '.workspace-shell .workspace-tab');
    const activeProjectTab = cssDeclarations(routinesCss, '.workspace-shell .workspace-tab.is-active');
    const tabSeparator = cssDeclarations(routinesCss, '.workspace-shell .workspace-tab + .workspace-tab::before');
    const main = cssDeclarations(routinesCss, '.workspace-shell .workspace-tab__main');
    const preview = cssDeclarations(shellCss, '.workspace-tab-preview');
    const projectChrome = cssDeclarations(
      routinesCss,
      '.workspace-shell .workspace-tabs-chrome.app-chrome-header',
    );
    const projectStrip = cssDeclarations(routinesCss, '.workspace-shell .workspace-tabs-strip');
    const sharedStrip = cssDeclarations(shellCss, '.workspace-tabs-strip');

    expect(ruleValue(projectTab, 'height')).toBe('26px');
    expect(ruleValue(projectTab, 'align-self')).toBe('center');
    expect(ruleValue(projectTab, 'border-radius')).toBe('7px');
    expect(ruleValue(projectTab, 'flex')).toBe('0 0 156px');
    expect(ruleValue(activeProjectTab, 'background')).toBe('color-mix(in srgb, var(--bg-panel) 94%, var(--bg-subtle))');
    expect(ruleValue(activeProjectTab, 'border-color')).toBe('var(--workspace-active-tab-border)');
    expect(ruleValue(activeProjectTab, 'box-shadow')).toContain('0 1px 2px');
    expect(ruleValue(activeProjectTab, 'box-shadow')).toContain('inset');
    expect(projectChrome).not.toContain('overflow:');
    expect(projectStrip).not.toContain('overflow:');
    expect(projectStrip).not.toContain('overflow-x:');
    expect(ruleValue(sharedStrip, 'overflow-x')).toBe('auto');
    expect(ruleValue(sharedStrip, 'overflow-y')).toBe('hidden');
    expect(ruleValue(tabSeparator, 'display')).toBe('none');
    expect(ruleValue(main, 'z-index')).toBe('2');
    expect(ruleValue(preview, 'box-sizing')).toBe('border-box');
    expect(routinesCss).not.toContain('.workspace-shell .workspace-tab.is-active::before');
    expect(routinesCss).not.toContain('.workspace-shell .workspace-tab.is-active::after');
  });

  it('uses a rounded highlight for inactive workspace tab hover', () => {
    const hoverTab = cssDeclarations(routinesCss, '.workspace-shell .workspace-tab:not(.is-active):hover');

    expect(ruleValue(hoverTab, 'border-radius')).toBe('7px');
    expect(ruleValue(hoverTab, 'background')).toContain('calc(100% - 2px)');
    expect(ruleValue(hoverTab, 'border-color')).toBe('transparent');
    expect(ruleValue(hoverTab, 'box-shadow')).toContain('inset 0 0 0 1px');
  });

  it('gives dragged tabs physical collision feedback', () => {
    const tab = cssDeclarations(shellCss, '.workspace-tab');
    const dragging = cssDeclarations(shellCss, '.workspace-tab.is-dragging');
    const dragOverBefore = cssDeclarations(shellCss, '.workspace-tab.is-drag-over-before');
    const dragOverAfter = cssDeclarations(shellCss, '.workspace-tab.is-drag-over-after');
    const projectDragging = cssDeclarations(routinesCss, '.workspace-shell .workspace-tab.is-dragging');

    expect(ruleValue(tab, 'cursor')).toBe('default');
    expect(ruleValue(tab, 'transition-property')).toContain('transform');
    expect(ruleValue(dragging, 'transform')).toBe('translateY(-2px) scale(1.015)');
    expect(ruleValue(dragging, 'z-index')).toBe('3');
    expect(ruleValue(dragOverBefore, 'border-color')).not.toContain('var(--accent)');
    expect(ruleValue(dragOverBefore, 'transform')).toBe('translateX(6px)');
    expect(ruleValue(dragOverAfter, 'transform')).toBe('translateX(-6px)');
    expect(ruleValue(projectDragging, 'box-shadow')).toContain('0 14px 30px');
    expect(shellCss).not.toContain('.workspace-tab.is-drag-over-before::after');
    expect(shellCss).not.toContain('.workspace-tab.is-drag-over-after::after');
  });
});
