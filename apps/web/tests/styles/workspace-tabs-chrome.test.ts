import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const shellCss = readFileSync(new URL('../../src/styles/shell.css', import.meta.url), 'utf8');
const routinesCss = readFileSync(new URL('../../src/styles/viewer/routines.css', import.meta.url), 'utf8');

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

describe('workspace tabs chrome styles', () => {
  it('keeps only a small intentional inset before the first tab', () => {
    const chrome = cssDeclarations(shellCss, '.workspace-tabs-chrome.app-chrome-header');
    const traffic = cssDeclarations(shellCss, '.workspace-tabs-chrome .workspace-tabs-traffic');
    const projectChrome = cssDeclarations(
      routinesCss,
      '.workspace-shell .workspace-tabs-chrome.app-chrome-header',
    );

    expect(ruleValue(chrome, 'padding')).toBe('0 8px 0 6px');
    expect(ruleValue(traffic, 'margin-right')).toBe('var(--app-chrome-traffic-margin)');
    expect(ruleValue(projectChrome, 'padding')).toBe('0 10px 0 6px');
  });
});
