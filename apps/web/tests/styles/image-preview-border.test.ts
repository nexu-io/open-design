import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const viewerCodeCss = readFileSync(
  new URL('../../src/styles/viewer/code.css', import.meta.url),
  'utf8',
);

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

describe('OPEND-2418 — artifact image preview keeps its complete outline', () => {
  it('counts the border inside the image max-size constraints', () => {
    const image = cssDeclarations(viewerCodeCss, '.image-body img');

    expect(image).toMatch(/(?:^|[;\n])\s*box-sizing:\s*border-box\s*;/);
  });
});
