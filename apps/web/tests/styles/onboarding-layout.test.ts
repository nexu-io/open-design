import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const entryLayoutCss = readFileSync(
  new URL('../../src/styles/home/entry-layout.css', import.meta.url),
  'utf8',
);

function cssDeclarations(selector: string): string {
  const blocks: string[] = [];
  const rulePattern = /([^{}]+)\{([^}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = rulePattern.exec(entryLayoutCss)) !== null) {
    const selectors = (match[1] ?? '').split(',').map((item) => item.trim());
    if (selectors.includes(selector)) blocks.push(match[2] ?? '');
  }
  if (blocks.length === 0) throw new Error(`Missing CSS block for ${selector}`);
  return blocks.join('\n');
}

describe('onboarding layout styles', () => {
  it('lets AMR benefit chips wrap inside the featured card', () => {
    const asideBlock = cssDeclarations('.onboarding-view__benefit-aside');
    const benefitsBlock = cssDeclarations(
      '.onboarding-view__benefit-aside .onboarding-view__benefits',
    );

    expect(asideBlock).toMatch(/(?:^|[;\n])\s*width:\s*100%\s*;/);
    expect(asideBlock).toMatch(/(?:^|[;\n])\s*justify-self:\s*stretch\s*;/);
    expect(benefitsBlock).toMatch(/(?:^|[;\n])\s*flex-wrap:\s*wrap\s*;/);
    expect(benefitsBlock).not.toMatch(/(?:^|[;\n])\s*flex-wrap:\s*nowrap\s*;/);
  });
});
