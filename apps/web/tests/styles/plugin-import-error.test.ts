import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const pluginsViewCss = readFileSync(
  new URL('../../src/styles/home/plugins-view.css', import.meta.url),
  'utf8',
);

function cssBlock(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(pluginsViewCss);
  if (!match) throw new Error(`Missing CSS block for ${selector}`);
  return match[1] ?? '';
}

function ruleValue(block: string, property: string): string {
  const match = new RegExp(`(?:^|;)\\s*${property}:\\s*([^;]+);`).exec(block);
  if (!match) throw new Error(`Missing CSS property ${property}`);
  return match[1]!.trim();
}

describe('plugin import error styles', () => {
  it('keeps invalid-drop feedback prominent over generic install-card copy', () => {
    const error = cssBlock('.plugins-view__install-card .plugins-import-modal__file-error');

    expect(ruleValue(error, 'margin')).toBe('2px 0 0');
    expect(ruleValue(error, 'padding')).toBe('8px 10px');
    expect(ruleValue(error, 'border')).toBe('1px solid var(--red-border)');
    expect(ruleValue(error, 'border-radius')).toBe('var(--radius-sm)');
    expect(ruleValue(error, 'background')).toBe('var(--red-bg)');
    expect(ruleValue(error, 'color')).toBe('var(--red)');
    expect(ruleValue(error, 'font-size')).toBe('12.5px');
    expect(ruleValue(error, 'font-weight')).toBe('600');
  });
});
