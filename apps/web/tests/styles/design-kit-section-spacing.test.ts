import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const css = readFileSync(
  new URL('../../src/components/BrandPreviewCard.module.css', import.meta.url),
  'utf8',
);

function cssDeclarations(selector: string): string {
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

describe('DesignKitView section spacing', () => {
  it('keeps full detail modules inset from their card borders', () => {
    expect(cssDeclarations('.section')).toContain('padding: 18px;');
  });

  it('keeps compact picker modules inset without collapsing the three-column preview', () => {
    expect(cssDeclarations('.compact .section')).toContain('padding: 8px;');
  });
});
