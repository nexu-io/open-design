import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../../src/styles/design-system-flow.css', import.meta.url), 'utf8');

function cssDeclarations(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rulePattern = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'g');
  const matches = Array.from(css.matchAll(rulePattern));
  return matches.at(-1)?.[1] ?? '';
}

function firstCssDeclarations(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rulePattern = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'g');
  return Array.from(css.matchAll(rulePattern)).at(0)?.[1] ?? '';
}

describe('design-system review preview density', () => {
  it('keeps review sections as a spacious single-column stack', () => {
    const reviewMain = cssDeclarations('.ds-project-main--review');
    const group = cssDeclarations('.ds-project-section-group');
    const inlinePreview = cssDeclarations('.ds-project-review-item .ds-project-inline-preview');
    const uiKitPreview = cssDeclarations('.ds-project-review-item--ui-kit .ds-project-inline-preview');

    expect(reviewMain).toContain('width: min(1180px, 100%);');
    expect(group).toContain('grid-template-columns: minmax(0, 1fr);');
    expect(group).toContain('gap: 18px;');
    expect(inlinePreview).toContain('height: clamp(300px, 36vw, 520px);');
    expect(uiKitPreview).toContain('height: clamp(560px, 64vw, 920px);');
  });

  it('keeps the contents rail separate from the review card stack', () => {
    const layout = firstCssDeclarations('.ds-project-review-layout');
    const toc = firstCssDeclarations('.ds-project-toc');

    expect(layout).toContain('grid-template-columns: minmax(180px, 230px) minmax(0, 1fr);');
    expect(toc).toContain('position: sticky;');
    expect(toc).toContain('border-right: 1px solid var(--border);');
  });

  it('lets the contents rail scroll with the page in the single-column review layout', () => {
    const toc = cssDeclarations('.ds-project-toc');

    expect(toc).toContain('position: static;');
    expect(toc).toContain('border-bottom: 1px solid var(--border);');
  });
});
