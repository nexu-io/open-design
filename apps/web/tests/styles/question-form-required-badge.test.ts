import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const composioCss = readFileSync(new URL('../../src/styles/viewer/composio.css', import.meta.url), 'utf8');

function declarations(css: string, selector: string): string {
  const escaped = selector.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  // Anchor on the start of a rule so `.qf-label` does not match `.qf-field-visual .qf-label`.
  const match = css.match(new RegExp(`(?:^|[}\\n])\\s*${escaped}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`Missing CSS block for ${selector}`);
  return match[1] ?? '';
}

describe('question form required badge', () => {
  it('keeps the required badge at its intrinsic size', () => {
    const required = declarations(composioCss, '.qf-required');
    expect(required).toContain('flex: 0 0 auto');
    expect(required).toContain('white-space: nowrap');
  });

  it('aligns the label row on the text baseline so a wrapped label keeps the badge in line', () => {
    const label = declarations(composioCss, '.qf-label');
    expect(label).toContain('align-items: baseline');
    expect(label).not.toContain('align-items: center');
  });

  it('lets the label shrink and break so the non-shrinking badge stays inside the card', () => {
    // Without these the label's min-content width (an unbreakable URL, or wide
    // non-Latin marker copy) pushes the nowrap badge past the card's right edge.
    const label = declarations(composioCss, '.qf-label');
    expect(label).toContain('min-width: 0');
    expect(label).toContain('overflow-wrap: anywhere');
  });
});
