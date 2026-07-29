import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const theaterCss = readFileSync(
  new URL('../../src/styles/viewer/theater.css', import.meta.url),
  'utf8',
);

function cssDeclarations(selector: string): string {
  const blocks: string[] = [];
  const rulePattern = /([^{}]+)\{([^}]*)\}/g;
  const cssWithoutComments = theaterCss.replace(/\/\*[\s\S]*?\*\//g, '');
  let match: RegExpExecArray | null;
  while ((match = rulePattern.exec(cssWithoutComments)) !== null) {
    const selectors = (match[1] ?? '').split(',').map((item) => item.trim());
    if (selectors.includes(selector)) blocks.push(match[2] ?? '');
  }
  if (blocks.length === 0) throw new Error(`Missing CSS block for ${selector}`);
  return blocks.join('\n');
}

describe('deck thumbnail surface fallback', () => {
  it('matches the browser default canvas without overriding explicit deck backgrounds', () => {
    const frame = cssDeclarations('.deck-thumbnail-frame');
    const iframe = cssDeclarations('.deck-thumbnail-frame iframe');
    const shadowHost = cssDeclarations(
      '.deck-thumbnail-frame .deck-thumbnail-shadow-host',
    );

    expect(frame).toContain('background: #fff;');
    expect(iframe).toContain('background: #fff;');
    expect(shadowHost).not.toMatch(/\bbackground(?:-color)?\s*:/);
  });
});
