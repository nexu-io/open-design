import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { composeSystemPrompt } from '../../src/prompts/system.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../../..');

describe('craft precedence', () => {
  it('lets explicit design-system visual decisions override aesthetic craft defaults', () => {
    const prompt = composeSystemPrompt({
      metadata: { kind: 'prototype' },
      designSystemBody: '# Brand\n\nUse -0.01em tracking for all text.',
      designSystemTitle: 'Brand',
      craftBody: '# Typography craft rules\n\nUse 0.02em tracking for labels.',
      craftSections: ['typography'],
    });

    expect(prompt).toContain(
      'Explicit visual decisions in the active DESIGN.md override aesthetic craft defaults',
    );
    expect(prompt).toContain(
      'legibility, contrast, focus visibility, overflow safety, and factual integrity remain binding',
    );
    expect(prompt).not.toContain(
      'craft rules still apply to anything the brand does not override (letter-spacing, accent overuse caps, anti-slop patterns)',
    );
  });

  it('does not make typography and color defaults absolute over DESIGN.md', () => {
    const typography = readFileSync(path.join(repoRoot, 'craft/typography.md'), 'utf8');
    const color = readFileSync(path.join(repoRoot, 'craft/color.md'), 'utf8');

    expect(typography).toContain(
      'Explicit typography decisions in the active `DESIGN.md` take precedence',
    );
    expect(typography).not.toContain('**No\nexceptions.**');
    expect(color).toContain(
      'Explicit palette and color-usage decisions in the active `DESIGN.md` take precedence',
    );
    expect(color).not.toContain('overuse. Hard caps:');
  });

  it('scopes the generic typography scale away from fixed-canvas decks', () => {
    const typography = readFileSync(path.join(repoRoot, 'craft/typography.md'), 'utf8');

    expect(typography).toContain('The ranges below are web and UI defaults');
    expect(typography).toContain('fixed 1920×1080 presentation canvas');
    expect(typography).toContain('body text\nat least 24 px');
  });
});
