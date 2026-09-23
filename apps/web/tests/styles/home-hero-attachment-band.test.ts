import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const homeHeroCss = readFileSync(
  new URL('../../src/styles/home/home-hero.css', import.meta.url),
  'utf8',
);

function cssDeclarations(selector: string): string {
  const blocks: string[] = [];
  const rulePattern = /([^{}]+)\{([^}]*)\}/g;
  const cssWithoutComments = homeHeroCss.replace(/\/\*[\s\S]*?\*\//g, '');
  let match: RegExpExecArray | null;
  while ((match = rulePattern.exec(cssWithoutComments)) !== null) {
    const selectors = (match[1] ?? '').split(',').map((item) => item.trim());
    if (selectors.includes(selector)) blocks.push(match[2] ?? '');
  }
  if (blocks.length === 0) throw new Error(`Missing CSS block for ${selector}`);
  return blocks.join('\n');
}

/**
 * The staged-attachment band and the prompt sit in the same block
 * (`.home-hero__prompt-flow`), and only ONE of them may scroll. When the flow
 * owned the scroll, a prompt long enough to overflow carried the band up and
 * out of the card with it — the user lost sight of the file they had just
 * attached exactly while they were writing about it.
 */
describe('HomeHero staged attachment band', () => {
  it('scrolls the prompt, never the band above it', () => {
    const flow = cssDeclarations('.home-hero__prompt-flow');
    expect(flow).not.toMatch(/overflow-y:\s*(auto|scroll)/);
    expect(flow).not.toMatch(/max-height:/);

    const surface = cssDeclarations('.home-hero__prompt-surface');
    expect(surface).toMatch(/(?:^|[;\n])\s*overflow-y:\s*auto\s*;/);
    expect(surface).toMatch(/max-height:\s*var\(--home-hero-prompt-max-height/);
  });

  // The lead chip is taken out of flow to sit beside the prompt's first line.
  // Its containing block has to BE the scroller, or it would pin itself to the
  // top of the box while the line it leads scrolled away underneath.
  it('keeps the out-of-flow lead chip inside the prompt scroller', () => {
    expect(cssDeclarations('.home-hero__prompt-surface')).toMatch(
      /(?:^|[;\n])\s*position:\s*relative\s*;/,
    );
    expect(cssDeclarations('.home-hero__prompt-flow.is-chip-inline .home-hero__lead-chip')).toMatch(
      /(?:^|[;\n])\s*position:\s*absolute\s*;/,
    );
  });
});
