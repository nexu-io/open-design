import { describe, expect, it } from 'vitest';

import { readExpandedIndexCss } from '../helpers/read-expanded-css';

const expandedIndexCss = readExpandedIndexCss();

function cssBlocks(css: string, selector: string): string[] {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return Array.from(
    css.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'g')),
    (match) => match[1] ?? '',
  );
}

function cssBlock(css: string, selector: string): string {
  const [block] = cssBlocks(css, selector);
  if (block === undefined) throw new Error(`Missing CSS block for ${selector}`);
  return block;
}

function optionalRuleValue(block: string, property: string): string | undefined {
  const match = new RegExp(`(?:^|;)\\s*${property}:\\s*([^;]+);`).exec(block);
  return match?.[1]?.trim();
}

function ruleValue(block: string, property: string): string {
  const value = optionalRuleValue(block, property);
  if (value === undefined) throw new Error(`Missing CSS property ${property}`);
  return value;
}

describe('design system modal layering', () => {
  it('keeps preview modals above composer floating controls', () => {
    const backdrop = cssBlock(expandedIndexCss, '.ds-modal-backdrop');
    const composerPopover = cssBlock(
      expandedIndexCss,
      '.split-chat-slot:has(.session-mode-toggle__popover),\n.split-chat-slot > .pane:has(.session-mode-toggle__popover),\n.composer:has(.session-mode-toggle__popover)',
    );

    expect(Number(ruleValue(backdrop, 'z-index'))).toBeGreaterThan(
      Number(ruleValue(composerPopover, 'z-index')),
    );
  });

  it('keeps the sidebar collapse handle above scrollable panel content (OPEND-418)', () => {
    const sidebar = cssBlock(expandedIndexCss, '.ds-modal-sidebar');
    const sidebarBody = cssBlock(expandedIndexCss, '.ds-modal-sidebar-body');
    const stageHandle = cssBlock(expandedIndexCss, '.ds-modal-stage-handle');
    const collapseHandle = cssBlock(expandedIndexCss, '.ds-modal-stage-handle.is-collapse');

    expect(ruleValue(sidebar, 'overflow')).toBe('hidden');
    expect(ruleValue(sidebarBody, 'overflow')).toBe('auto');
    expect(ruleValue(stageHandle, 'position')).toBe('absolute');
    expect(ruleValue(collapseHandle, 'left')).toBe('0');
    expect(Number(ruleValue(collapseHandle, 'z-index'))).toBeGreaterThanOrEqual(5);
  });

  it('keeps stage handle positioning independent from button press feedback', () => {
    const stageHandle = cssBlock(expandedIndexCss, '.ds-modal-stage-handle');
    const expandHandles = cssBlocks(
      expandedIndexCss,
      '.ds-modal-stage-handle.is-expand',
    );
    const collapseHandles = cssBlocks(
      expandedIndexCss,
      '.ds-modal-stage-handle.is-collapse',
    );

    expect(ruleValue(stageHandle, 'translate')).toBe('0 -50%');
    expect(optionalRuleValue(stageHandle, 'transform')).toBeUndefined();
    expect(
      expandHandles.map((block) => optionalRuleValue(block, 'translate')),
    ).toContain('50% 0');
    expect(
      collapseHandles.map((block) => optionalRuleValue(block, 'translate')),
    ).toContain('-50% 0');
  });

  it('keeps the fullscreen icon visible inside its fixed-size button', () => {
    const fullscreenButton = cssBlock(
      expandedIndexCss,
      '.ds-modal-stage-fullscreen',
    );
    const fullscreenIcon = cssBlock(
      expandedIndexCss,
      '.ds-modal-stage-fullscreen .od-icon',
    );

    expect(ruleValue(fullscreenButton, 'padding')).toBe('0');
    expect(ruleValue(fullscreenIcon, 'display')).toBe('block');
    expect(optionalRuleValue(fullscreenIcon, 'fill')).toBeUndefined();
  });
});
