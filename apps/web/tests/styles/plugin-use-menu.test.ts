import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const indexCss = readFileSync(new URL('../../src/index.css', import.meta.url), 'utf8');
const pluginsHomeCss = readFileSync(
  new URL('../../src/styles/home/plugins-home.css', import.meta.url),
  'utf8',
);

type Specificity = [ids: number, classes: number, types: number];

function cssDeclarations(css: string, selector: string): string {
  const blocks: string[] = [];
  const rulePattern = /([^{}]+)\{([^}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = rulePattern.exec(css)) !== null) {
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

function specificity(selector: string): Specificity {
  const ids = selector.match(/#[\w-]+/g)?.length ?? 0;
  const classes =
    (selector.match(/\.[\w-]+/g)?.length ?? 0) +
    (selector.match(/\[[^\]]+\]/g)?.length ?? 0) +
    (selector.match(/:(?!:)[\w-]+(?:\([^)]*\))?/g)?.length ?? 0);
  const withoutPseudos = selector.replace(/:(?!:)[\w-]+(?:\([^)]*\))?/g, '');
  const types = withoutPseudos
    .split(/[#.:[\]\s>+~]+/)
    .filter((part) => /^[a-z][\w-]*$/i.test(part)).length;

  return [ids, classes, types];
}

function compareSpecificity(left: Specificity, right: Specificity): number {
  for (let index = 0; index < left.length; index += 1) {
    const diff = left[index]! - right[index]!;
    if (diff !== 0) return diff;
  }
  return 0;
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.trim().replace(/^#/, '');
  if (!/^(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(normalized)) {
    throw new Error(`Expected #rgb or #rrggbb, got ${hex}`);
  }
  const expanded = normalized.length === 3
    ? [...normalized].map((char) => `${char}${char}`).join('')
    : normalized;
  return [
    Number.parseInt(expanded.slice(0, 2), 16),
    Number.parseInt(expanded.slice(2, 4), 16),
    Number.parseInt(expanded.slice(4, 6), 16),
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

describe('plugin use menu contrast', () => {
  it('keeps option text readable on hover and keyboard focus', () => {
    const globalHoverSelector = 'button:hover:not(:disabled)';
    const hoverSelector = 'button.plugins-home__use-menu-item:hover:not(:disabled)';
    const focusSelector = 'button.plugins-home__use-menu-item:focus-visible';
    const globalHover = cssDeclarations(indexCss, globalHoverSelector);
    const hover = cssDeclarations(pluginsHomeCss, hoverSelector);
    const focus = cssDeclarations(pluginsHomeCss, focusSelector);

    expect(ruleValue(globalHover, 'background')).toBe('var(--bg-subtle)');
    expect(compareSpecificity(specificity(hoverSelector), specificity(globalHoverSelector))).toBeGreaterThan(0);

    for (const block of [hover, focus]) {
      const background = ruleValue(block, 'background');
      const color = ruleValue(block, 'color');

      expect(contrastRatio(color, background)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
