import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const shellCss = readFileSync(new URL('../../src/styles/shell.css', import.meta.url), 'utf8');

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
  const matches = [
    ...block.matchAll(new RegExp(`(?:^|[;\\n])\\s*${property}:\\s*([^;]+);`, 'g')),
  ];
  const match = matches.at(-1);
  if (!match) throw new Error(`Missing CSS property ${property}`);
  return match[1]!.trim();
}

function pxValue(value: string): number {
  const trimmed = value.trim();
  if (trimmed === '0') return 0; // CSS lengths may drop the unit on zero.
  const match = /^(-?\d+(?:\.\d+)?)px$/.exec(trimmed);
  if (!match) throw new Error(`Expected a px length, got "${value}"`);
  return Number(match[1]);
}

describe('split resize handle hit area', () => {
  // Regression for #4797: dragging the chat pane's scrollbar resized the
  // chat <> workspace split instead of scrolling. The chat log's scrollbar is
  // flush against the resize divider's left (chat-side) edge, so the handle's
  // pointer-capturing ::before (z-index: 45) must not overhang into the chat
  // pane — a negative `left` parks the grab area on top of the scrollbar.
  it('does not overhang the chat pane where the scrollbar sits', () => {
    const hitArea = cssDeclarations(shellCss, '.split-resize-handle::before');
    expect(pxValue(ruleValue(hitArea, 'left'))).toBeGreaterThanOrEqual(0);
  });

  // The grab area may still extend toward the workspace side, which has no
  // edge scrollbar at this boundary, so resizing stays comfortable to start.
  it('keeps a generous grab area on the workspace side', () => {
    const hitArea = cssDeclarations(shellCss, '.split-resize-handle::before');
    expect(pxValue(ruleValue(hitArea, 'right'))).toBeLessThanOrEqual(0);
  });
});
