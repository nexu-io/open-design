import { describe, expect, it } from 'vitest';
import { readExpandedIndexCss } from '../helpers/read-expanded-css';

function cssRule(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
}

describe('chat code styles', () => {
  it('keeps assistant chat code text free of filled backgrounds', () => {
    const css = readExpandedIndexCss();

    expect(cssRule(css, '.prose-block .md-inline-code')).toContain('background: transparent');
    expect(cssRule(css, '.prose-block .md-code-block')).toContain('background: transparent');
    expect(cssRule(css, '.live-code-pre')).toContain('background: transparent');
    expect(cssRule(css, '.app .live-code-box')).toContain('background: transparent');
  });
});
