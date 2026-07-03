import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const designFilesCss = readFileSync(
  new URL('../../src/styles/workspace/design-files.css', import.meta.url),
  'utf8',
);
const routinesCss = readFileSync(
  new URL('../../src/styles/viewer/routines.css', import.meta.url),
  'utf8',
);

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

describe('Design Files preview list styles', () => {
  it('keeps preview-mode rows readable instead of collapsing the name cell', () => {
    const previewNameCell = cssDeclarations(
      routinesCss,
      '.app .df-panel:not(.no-preview) .df-cell-name',
    );
    const rowSub = cssDeclarations(designFilesCss, '.df-row-sub');
    const rowSubPart = cssDeclarations(designFilesCss, '.df-row-sub > span');

    expect(ruleValue(previewNameCell, 'max-width')).toBe('none');
    expect(ruleValue(rowSub, 'flex-wrap')).toBe('nowrap');
    expect(ruleValue(rowSub, 'overflow')).toBe('hidden');
    expect(ruleValue(rowSubPart, 'text-overflow')).toBe('ellipsis');
  });

  it('keeps the preview split from squeezing the file list toolbar', () => {
    const previewGrid = cssDeclarations(routinesCss, '.app .df-panel:not(.no-preview)');
    const topbar = cssDeclarations(designFilesCss, '.df-topbar');
    const actions = cssDeclarations(designFilesCss, '.df-actions');
    const topbarLeft = cssDeclarations(designFilesCss, '.df-topbar-left');

    const cols = ruleValue(previewGrid, 'grid-template-columns');
    // The file list keeps a usable minimum so its toolbar + names stay
    // clickable on a narrow split…
    expect(cols).toContain('minmax(280px, 1fr)');
    // …while the preview pane YIELDS (minmax(0, …)) instead of pinning a
    // rigid track, so the two columns never sum past the panel width and
    // push the toolbar / preview off-screen.
    expect(cols).toMatch(/minmax\(0,\s*\d+px\)/);
    // The toolbar stays on a single row: it does NOT wrap; instead the
    // breadcrumb (the growable/shrinkable side) yields while the action
    // cluster holds its place on the right.
    expect(ruleValue(topbar, 'flex-wrap')).toBe('nowrap');
    expect(ruleValue(actions, 'flex-wrap')).toBe('nowrap');
    expect(ruleValue(actions, 'flex-shrink')).toBe('0');
    expect(ruleValue(topbarLeft, 'min-width')).toBe('0');
  });

  it('collapses toolbar actions to icons-only on a narrow list column', () => {
    const main = cssDeclarations(designFilesCss, '.df-main');
    // The list column is its own query container so the toolbar reacts to
    // the column width (chat/preview split), not the viewport.
    expect(ruleValue(main, 'container-type')).toBe('inline-size');
    // Below the labelled-actions wrap threshold the button text is hidden
    // (icons remain) so the toolbar stays on one row instead of wrapping
    // the actions below the breadcrumb.
    expect(designFilesCss).toMatch(
      /@container[^{]*max-width:\s*470px[^{]*\{[\s\S]*?\.df-actions button\s*>\s*span\s*\{\s*display:\s*none/,
    );
  });

  it('keeps selection actions sticky and renders rounded row checkboxes', () => {
    const batchBar = cssDeclarations(designFilesCss, '.df-batch-bar');
    const row = cssDeclarations(designFilesCss, '.df-row');
    const selectedRow = cssDeclarations(designFilesCss, '.df-row.selected');
    const rowCheck = cssDeclarations(designFilesCss, '.df-row-check');
    const rowCheckBox = cssDeclarations(designFilesCss, '.df-row-check-box');
    const rowSize = cssDeclarations(designFilesCss, '.df-row-size');

    expect(ruleValue(batchBar, 'position')).toBe('sticky');
    expect(ruleValue(batchBar, 'top')).toBe('0');
    expect(ruleValue(row, 'grid-template-columns')).toContain('minmax(56px, auto)');
    expect(ruleValue(selectedRow, 'border-radius')).toBe('8px');
    expect(ruleValue(rowCheck, 'border-radius')).toBe('7px');
    expect(ruleValue(rowCheckBox, 'border-radius')).toBe('5px');
    expect(ruleValue(rowSize, 'text-align')).toBe('right');
  });

  it('opens the working directory menu below the top chrome instead of behind it', () => {
    const menu = cssDeclarations(routinesCss, '.app .working-dir-pill-menu');

    expect(ruleValue(menu, 'top')).toBe('calc(100% + 6px)');
    expect(ruleValue(menu, 'right')).toBe('0');
    expect(ruleValue(menu, 'z-index')).toBe('220');
  });

  it('flips the working directory menu upward when hosted in the composer toolbar', () => {
    // The pill now lives in the composer's bottom toolbar, so the base
    // "open downward" rule would drop the menu off the bottom of the viewport.
    // The composer-row override anchors it above the trigger and left-aligned.
    const override = cssDeclarations(routinesCss, '.app .composer-row .working-dir-pill-menu');

    expect(ruleValue(override, 'bottom')).toBe('calc(100% + 6px)');
    expect(ruleValue(override, 'top')).toBe('auto');
    expect(ruleValue(override, 'left')).toBe('0');
    expect(ruleValue(override, 'right')).toBe('auto');
  });
});
