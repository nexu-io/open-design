import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const modalCss = readFileSync(
  new URL('../../src/components/FigmaImportModal.module.css', import.meta.url),
  'utf8',
);

function cssDeclarations(selector: string): string {
  const blocks: string[] = [];
  const rulePattern = /([^{}]+)\{([^}]*)\}/g;
  const cssWithoutComments = modalCss.replace(/\/\*[\s\S]*?\*\//g, '');
  let match: RegExpExecArray | null;
  while ((match = rulePattern.exec(cssWithoutComments)) !== null) {
    const selectors = (match[1] ?? '').split(',').map((item) => item.trim());
    if (selectors.includes(selector)) blocks.push(match[2] ?? '');
  }
  if (blocks.length === 0) throw new Error(`Missing CSS block for ${selector}`);
  return blocks.join('\n');
}

const declaration = (property: string, value: string) =>
  new RegExp(`(?:^|[;\\n])\\s*${property}:\\s*${value}\\s*;`);

/**
 * The modal's chrome is styled through a CSS Module, but the global element
 * rules in styles/primitives.css still reach every `button` and `textarea`
 * inside it. Two of those defaults broke the modal: `button { padding: 0 16px }`
 * left a 34px close button with no room for its glyph (the × rendered as an
 * empty box), and `textarea { width: 100% }` plus the notes field's own side
 * margins pushed the field past the modal's clipped edge.
 */
describe('FigmaImportModal chrome', () => {
  it('gives the close control room for its glyph and rounds it into a circle', () => {
    const close = cssDeclarations('.closeBtn');
    expect(close).toMatch(declaration('padding', '0'));
    expect(close).toMatch(declaration('width', '34px'));
    expect(close).toMatch(declaration('height', '34px'));
    expect(close).toMatch(declaration('border-radius', 'var\\(--radius-pill\\)'));
  });

  it('renders the mode tabs and footer actions as pills', () => {
    expect(cssDeclarations('.tabs')).toMatch(declaration('border-radius', 'var\\(--radius-pill\\)'));
    expect(cssDeclarations('.tab')).toMatch(declaration('border-radius', 'var\\(--radius-pill\\)'));
    expect(cssDeclarations('.foot button')).toMatch(
      declaration('border-radius', 'var\\(--radius-pill\\)'),
    );
  });

  it('keeps the notes field inside the modal content width', () => {
    const notes = cssDeclarations('.notes');
    expect(notes).toMatch(declaration('margin', '0 16px'));
    expect(notes).toMatch(declaration('width', 'auto'));
  });

  it('tints the backdrop with the shared scrim token', () => {
    expect(cssDeclarations('.backdrop')).toMatch(
      declaration('background', 'var\\(--scrim-tint\\)'),
    );
  });
});
