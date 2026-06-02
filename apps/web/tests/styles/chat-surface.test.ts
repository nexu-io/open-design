import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const codeCss = readFileSync(new URL('../../src/styles/viewer/code.css', import.meta.url), 'utf8');
const chatCss = readFileSync(new URL('../../src/styles/chat.css', import.meta.url), 'utf8');
const tokensCss = readFileSync(new URL('../../src/styles/tokens.css', import.meta.url), 'utf8');

function cssBlock(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  if (!match) throw new Error(`Missing CSS block for ${selector}`);
  return match[1] ?? '';
}

function ruleValue(block: string, property: string): string {
  const match = new RegExp(`(?:^|;)\\s*${property}:\\s*([^;]+);`).exec(block);
  if (!match) throw new Error(`Missing CSS property ${property}`);
  return match[1]!.trim();
}

describe('chat surface styling', () => {
  it('renders status separators visually without changing status text', () => {
    const separator = cssBlock(codeCss, '.chat-surface-status.op-status::before');

    expect(ruleValue(separator, 'content')).toBe('"·"');
    expect(ruleValue(separator, 'color')).toBe('var(--text-faint)');
    expect(ruleValue(separator, 'margin-right')).toBe('var(--chat-row-gap)');
  });

  it('uses the shared compact row gap for assistant provider and model identity', () => {
    const tokens = cssBlock(tokensCss, ':root');
    const identity = cssBlock(chatCss, '.assistant-identity');
    const separator = cssBlock(chatCss, '.assistant-identity-separator');

    expect(ruleValue(tokens, '--chat-row-gap')).toBe('3px');
    expect(ruleValue(identity, 'column-gap')).toBe('var(--chat-row-gap)');
    expect(ruleValue(separator, 'color')).toBe('var(--text-faint)');
  });
});
