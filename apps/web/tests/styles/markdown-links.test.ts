import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const codeCss = readFileSync(
  new URL('../../src/styles/viewer/code.css', import.meta.url),
  'utf8',
);

function cssDeclarations(selector: string): string {
  const cssWithoutComments = codeCss.replace(/\/\*[\s\S]*?\*\//g, '');
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rulePattern = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'g');
  let declarations = '';
  let match: RegExpExecArray | null;
  while ((match = rulePattern.exec(cssWithoutComments)) !== null) {
    declarations += match[1] ?? '';
  }
  return declarations;
}

describe('markdown link wrapping styles', () => {
  it('keeps bare URLs readable by avoiding arbitrary hostname breaks', () => {
    const bareLink = cssDeclarations('.prose-block .md-link-bare');

    expect(bareLink).toContain('word-break: normal;');
    expect(bareLink).toContain('overflow-wrap: break-word;');
    expect(bareLink).not.toContain('break-all');
    expect(bareLink).not.toContain('overflow-wrap: anywhere;');
  });
});
