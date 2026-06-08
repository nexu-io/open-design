import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const mentionHomeCss = readFileSync(
  new URL('../../src/styles/workspace/mention-home.css', import.meta.url),
  'utf8',
);

function cssBlock(selector: string): string {
  const blocks: string[] = [];
  const rulePattern = /([^{}]+)\{([^}]*)\}/g;
  const cssWithoutComments = mentionHomeCss.replace(/\/\*[\s\S]*?\*\//g, '');
  let match: RegExpExecArray | null;
  while ((match = rulePattern.exec(cssWithoutComments)) !== null) {
    const selectors = (match[1] ?? '').split(',').map((item) => item.trim());
    if (selectors.includes(selector)) blocks.push(match[2] ?? '');
  }
  if (blocks.length === 0) throw new Error(`Missing CSS block for ${selector}`);
  return blocks.join('\n');
}

function ruleValue(block: string, property: string): string {
  const match = new RegExp(`(?:^|[;\\n])\\s*${property}:\\s*([^;]+);`).exec(block);
  if (!match) throw new Error(`Missing CSS property ${property}`);
  return match[1]!.trim();
}

describe('mention popover styles', () => {
  it('keeps the panel height stable while tabs swap between long and short results', () => {
    const popover = cssBlock('.mention-popover');
    const results = cssBlock('.mention-results');

    expect(ruleValue(popover, 'height')).toBe('var(--cfl-max-h, 460px)');
    expect(ruleValue(popover, 'max-height')).toBe('var(--cfl-max-h, 460px)');
    expect(ruleValue(results, 'flex')).toBe('1 1 auto');
    expect(ruleValue(results, 'overflow-y')).toBe('auto');
  });

  it('wraps category tabs inside the panel without clipping labels', () => {
    const tabs = cssBlock('.mention-tabs');
    const tab = cssBlock('.mention-tab');

    expect(ruleValue(tabs, 'flex-wrap')).toBe('wrap');
    expect(ruleValue(tabs, 'overflow')).toBe('hidden');
    expect(ruleValue(tab, 'flex')).toBe('0 0 auto');
    expect(ruleValue(tab, 'white-space')).toBe('nowrap');
  });

  it('keeps result rows aligned with truncated text and stable meta badges', () => {
    const item = cssBlock('.mention-item');
    const icon = cssBlock('.mention-item > svg');
    const body = cssBlock('.mention-item-body');
    const description = cssBlock('.mention-meta--desc');
    const kind = cssBlock('.mention-item-kind');

    expect(ruleValue(item, 'display')).toBe('grid');
    expect(ruleValue(item, 'grid-template-columns')).toBe('24px minmax(0, 1fr) max-content');
    expect(ruleValue(icon, 'width')).toBe('24px');
    expect(ruleValue(body, 'align-items')).toBe('stretch');
    expect(ruleValue(body, 'overflow')).toBe('hidden');
    expect(ruleValue(body, 'text-align')).toBe('left');
    expect(ruleValue(description, 'align-self')).toBe('stretch');
    expect(ruleValue(description, 'text-align')).toBe('left');
    expect(ruleValue(description, 'white-space')).toBe('nowrap');
    expect(ruleValue(description, 'text-overflow')).toBe('ellipsis');
    expect(ruleValue(kind, 'border-radius')).toBe('var(--radius-pill)');
    expect(ruleValue(kind, 'white-space')).toBe('nowrap');
  });
});
