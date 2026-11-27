import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// #5370 — the composer placeholder truncated to one ellipsised line, which hid
// most of the longer placeholders (the design-system flow's is a full
// sentence). The fix wraps it instead, and the constraint that came with the
// scope was that it must wrap *inside* the composer rather than trading an
// ellipsis for overflow. Both halves are pinned here, plus the one thing the
// fix must NOT touch: the home-page prompt carousel is single-line on purpose.

const chatCss = readFileSync(new URL('../../src/styles/chat.css', import.meta.url), 'utf8');

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

describe('#5370 — composer placeholder shows its full text', () => {
  const placeholder = cssDeclarations(chatCss, '.composer-input-placeholder');

  it('wraps instead of truncating to one line', () => {
    expect(ruleValue(placeholder, 'white-space')).toBe('pre-wrap');
    expect(ruleValue(placeholder, 'text-overflow')).toBe('clip');
    // The two properties that produced the reported behaviour. Asserted as
    // absent rather than only asserting the replacements, because either one
    // coming back re-truncates the placeholder on its own.
    expect(placeholder).not.toMatch(/white-space:\s*nowrap/);
    expect(placeholder).not.toMatch(/text-overflow:\s*ellipsis/);
    // Long unbroken tokens (a pasted path or URL in a placeholder) must break
    // rather than push a single line past the fold.
    expect(ruleValue(placeholder, 'overflow-wrap')).toBe('anywhere');
    expect(ruleValue(placeholder, 'word-break')).toBe('break-word');
  });

  it('stays inside the editor box rather than trading ellipsis for overflow', () => {
    // The height bound comes from the inset's `bottom`, so it is whatever
    // `.composer-input-editor` currently is — the default max-height,
    // active-file mode's taller box, or a manually dragged height. A
    // max-height literal here would be a second copy of that number, free to
    // drift from the three rules that actually set it.
    const inset = ruleValue(placeholder, 'inset');
    expect(inset).toBe('8px 9px');
    expect(ruleValue(placeholder, 'position')).toBe('absolute');
    // Wrapping without this would let a long placeholder spill out of the
    // composer, which is the failure mode the scope explicitly ruled out.
    expect(ruleValue(placeholder, 'overflow')).toBe('hidden');
    // The bound is only meaningful while the editor is the containing block.
    expect(ruleValue(cssDeclarations(chatCss, '.composer-input-editor'), 'position')).toBe('relative');
  });

  it('leaves the home-page prompt carousel single-line', () => {
    // Deliberately NOT part of this fix: the carousel is a typewriter
    // animation that reads as one line by design. It is a sibling of the
    // placeholder and easy to sweep up in a "make placeholders wrap" change.
    const carousel = cssDeclarations(chatCss, '.composer-input-wrap .home-hero__carousel');
    expect(ruleValue(carousel, 'white-space')).toBe('nowrap');
    expect(ruleValue(carousel, 'overflow')).toBe('hidden');
  });
});
