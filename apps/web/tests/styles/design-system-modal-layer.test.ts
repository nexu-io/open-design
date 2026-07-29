import { describe, expect, it } from 'vitest';

import { readExpandedIndexCss } from '../helpers/read-expanded-css';

const expandedIndexCss = readExpandedIndexCss();

function cssBlock(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  if (!match) throw new Error(`Missing CSS block for ${selector}`);
  return match[1] ?? '';
}

function ruleValue(block: string, property: string): string {
  const match = new RegExp(`(?:^|;)\\s*${property}:\\s*([^;]+);`).exec(block);
  if (!match) throw new Error(`Missing CSS property ${property}`);
  return match[1]!.trim();
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
});
