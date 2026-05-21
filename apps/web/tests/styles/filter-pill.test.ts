import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const indexCss = readFileSync(new URL('../../src/index.css', import.meta.url), 'utf8');

function cssBlock(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(indexCss);
  if (!match) throw new Error(`Missing CSS block for ${selector}`);
  return match[1] ?? '';
}

function cssVar(block: string, name: string): string {
  const match = new RegExp(`${name}:\\s*([^;]+);`).exec(block);
  if (!match) throw new Error(`Missing CSS variable ${name}`);
  return match[1]!.trim();
}

function ruleValue(block: string, property: string): string {
  const match = new RegExp(`(?:^|;)\\s*${property}:\\s*([^;]+);`).exec(block);
  if (!match) throw new Error(`Missing CSS property ${property}`);
  return match[1]!.trim();
}

function resolveVar(value: string, variables: Record<string, string>): string {
  const match = /^var\((--[^)]+)\)$/.exec(value);
  if (!match) return value;
  const key = match[1];
  if (!key) throw new Error(`Invalid CSS variable reference ${value}`);
  const resolved = variables[key];
  if (!resolved) throw new Error(`Missing resolved value for ${match[1]}`);
  return resolved;
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.trim().replace(/^#/, '');
  if (!/^[0-9a-f]{6}$/i.test(normalized)) throw new Error(`Expected #rrggbb, got ${hex}`);
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
}

function luminance([r, g, b]: [number, number, number]): number {
  const channel = (value: number) => {
    const normalized = value / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(foreground: string, background: string): number {
  const first = luminance(hexToRgb(foreground));
  const second = luminance(hexToRgb(background));
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('filter pill hover contrast', () => {
  it('keeps hover labels readable in light and dark themes', () => {
    const rootVars = {
      '--bg-muted': cssVar(cssBlock(':root'), '--bg-muted'),
      '--text': cssVar(cssBlock(':root'), '--text'),
    };
    const darkVars = {
      '--bg-muted': cssVar(cssBlock('[data-theme="dark"]'), '--bg-muted'),
      '--text': cssVar(cssBlock('[data-theme="dark"]'), '--text'),
    };
    const hover = cssBlock('button.filter-pill:hover:not(:disabled)');
    const activeHover = cssBlock('button.filter-pill.active:hover:not(:disabled)');
    const countHover = cssBlock('button.filter-pill:hover:not(:disabled) .filter-pill-count,\n.filter-pill.active .filter-pill-count');

    for (const block of [hover, activeHover]) {
      expect(ruleValue(block, 'background')).toBe('var(--bg-muted)');
      expect(ruleValue(block, 'color')).toBe('var(--text)');
      expect(contrastRatio(
        resolveVar(ruleValue(block, 'color'), rootVars),
        resolveVar(ruleValue(block, 'background'), rootVars),
      )).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(
        resolveVar(ruleValue(block, 'color'), darkVars),
        resolveVar(ruleValue(block, 'background'), darkVars),
      )).toBeGreaterThanOrEqual(4.5);
    }

    expect(ruleValue(countHover, 'color')).toBe('currentColor');
    expect(ruleValue(countHover, 'opacity')).toBe('0.9');
  });
});
