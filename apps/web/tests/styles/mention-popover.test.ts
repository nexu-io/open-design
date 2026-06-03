import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const mentionHomeCss = readFileSync(
  new URL('../../src/styles/workspace/mention-home.css', import.meta.url),
  'utf8',
);

function cssBlock(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(mentionHomeCss);
  if (!match) throw new Error(`Missing CSS block for ${selector}`);
  return match[1] ?? '';
}

function ruleValue(block: string, property: string): string {
  const match = new RegExp(`(?:^|;)\\s*${property}:\\s*([^;]+);`).exec(block);
  if (!match) throw new Error(`Missing CSS property ${property}`);
  return match[1]!.trim();
}

describe('mention popover styles', () => {
  it('keeps category tabs responsive without wrapping labels', () => {
    const tabs = cssBlock('.mention-tabs');
    const tab = cssBlock('.mention-tab');

    expect(ruleValue(tabs, 'overflow-x')).toBe('auto');
    expect(ruleValue(tabs, 'overflow-y')).toBe('hidden');
    expect(ruleValue(tab, 'flex')).toBe('0 0 auto');
    expect(ruleValue(tab, 'white-space')).toBe('nowrap');
  });
});
