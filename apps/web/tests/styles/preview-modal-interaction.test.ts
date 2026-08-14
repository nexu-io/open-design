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
  // Strip CSS comments before parsing so a leading comment doesn't break the
  // (?:^|;) prefix requirement on the first property declaration.
  const stripped = block.replace(/\/\*[\s\S]*?\*\//g, '');
  const match = new RegExp(`(?:^|;)\\s*${property}:\\s*([^;]+);`).exec(stripped);
  if (!match) throw new Error(`Missing CSS property ${property}`);
  return match[1]!.trim();
}

describe('preview modal interaction regressions (OPEND-6791)', () => {
  it('restores the global button:active press transform (regression fix)', () => {
    const buttonActive = cssBlock(expandedIndexCss, 'button:active:not(:disabled)');
    expect(ruleValue(buttonActive, 'transform')).toBe('translateY(1px)');
  });

  it('removes padding from the fullscreen button icon frame', () => {
    const fullscreen = cssBlock(expandedIndexCss, '.ds-modal-stage-fullscreen');
    expect(ruleValue(fullscreen, 'padding')).toBe('0');
  });

  it('disables the press transform for the fullscreen button to prevent dropped clicks', () => {
    const fullscreenActive = cssBlock(expandedIndexCss, '.ds-modal-stage-fullscreen:active:not(:disabled)');
    expect(ruleValue(fullscreenActive, 'transform')).toBe('translateY(0)');
  });

  it('keeps the sidebar handle centered during press to prevent dropped clicks', () => {
    const handleActive = cssBlock(expandedIndexCss, '.ds-modal-stage-handle:active:not(:disabled)');
    // Must keep its top:50% vertical centering transform and ignore the global 1px translate
    expect(ruleValue(handleActive, 'transform')).toMatch(/translateY\(-50%\)/);
  });
});
