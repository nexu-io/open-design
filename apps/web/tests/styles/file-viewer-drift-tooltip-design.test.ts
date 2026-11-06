import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const css = postcss.parse(readFileSync(resolve(here, '../../src/styles/viewer/core.css'), 'utf8'));

describe('main comment anchor tooltip appearance', () => {
  it('uses the native title without a board-only portal skin', () => {
    const selectors: string[] = [];
    css.walkRules(rule => { selectors.push(...rule.selectors); });
    expect(selectors).not.toContain('.od-tooltip-layer.tipd');
    expect(selectors).not.toContain('.comment-saved-marker--lost .comment-saved-pin');
  });
});
