import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const artifactsCss = readFileSync(
  new URL('../../src/styles/workspace/artifacts.css', import.meta.url),
  'utf8',
);

function cssDeclarations(selector: string): string {
  const blocks: string[] = [];
  const rulePattern = /([^{}]+)\{([^}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = rulePattern.exec(artifactsCss)) !== null) {
    const selectors = (match[1] ?? '').split(',').map((item) => item.trim());
    if (selectors.includes(selector)) blocks.push(match[2] ?? '');
  }
  if (blocks.length === 0) throw new Error(`Missing CSS block for ${selector}`);
  return blocks.join('\n');
}

describe('AMR account control workspace styles', () => {
  it('keeps settings startup errors and AMR profile badges visible', () => {
    const errorBlock = cssDeclarations('.agent-card-amr-auth .amr-account-control__error');
    const badgeBlock = cssDeclarations('.agent-card-amr-auth .amr-login-pill-badge');

    expect(errorBlock).not.toMatch(/(?:^|[;\n])\s*display:\s*none\s*;/);
    expect(badgeBlock).not.toMatch(/(?:^|[;\n])\s*display:\s*none\s*;/);
  });
});
