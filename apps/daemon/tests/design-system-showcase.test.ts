import { describe, expect, it } from 'vitest';
import { extractColors } from '../src/design-system-showcase.js';

type Color = { name: string; value: string; role: string };

function findColor(colors: Color[], name: string): Color | undefined {
  return colors.find((c) => c.name.toLowerCase() === name.toLowerCase());
}

describe('extractColors / Pattern B', () => {
  it('parses `- **Name:** `#hex`` (colon inside bold) — agentic / warm-editorial shape', () => {
    const md = [
      '## 2. Color',
      '',
      '- **Primary:** `#FF5701` — Token from style foundations.',
      '- **Secondary:** `#F6F6F1` — Token from style foundations.',
      '- **Surface:** `#FFFFFF` — Token from style foundations.',
      '- **Text:** `#111827` — Token from style foundations.',
    ].join('\n');

    const colors = extractColors(md);

    expect(findColor(colors, 'Primary')?.value).toBe('#ff5701');
    expect(findColor(colors, 'Secondary')?.value).toBe('#f6f6f1');
    expect(findColor(colors, 'Surface')?.value).toBe('#ffffff');
    expect(findColor(colors, 'Text')?.value).toBe('#111827');
  });

  it('parses `- Name: `#hex`` bare list shape', () => {
    const md = [
      '### Buttons',
      '',
      '- Background: `#7d2ae8`',
      '- Text: `#ffffff`',
    ].join('\n');

    const colors = extractColors(md);

    expect(findColor(colors, 'Background')?.value).toBe('#7d2ae8');
    expect(findColor(colors, 'Text')?.value).toBe('#ffffff');
  });

  it('parses `**Name** `#hex`: role` (Duolingo / Canva shape with role suffix)', () => {
    const md = [
      '## Color',
      '',
      '- **Owl Green** `#58CC02`: Primary brand and CTA.',
      '- **Feather Blue** `#1CB0F6`: Secondary accent.',
    ].join('\n');

    const colors = extractColors(md);

    const owl = findColor(colors, 'Owl Green');
    expect(owl?.value).toBe('#58cc02');
    expect(owl?.role).toContain('Primary brand');

    const feather = findColor(colors, 'Feather Blue');
    expect(feather?.value).toBe('#1cb0f6');
    expect(feather?.role).toContain('Secondary accent');
  });

  it('extracts the first hex from multi-hex `**Name** (`#a` / `#b`): role` (Linear shape)', () => {
    const md = '- **Marketing Black** (`#010102` / `#08090a`): Marketing surface and dark canvas.';

    const colors = extractColors(md);

    const black = findColor(colors, 'Marketing Black');
    expect(black?.value).toBe('#010102');
    expect(black?.role).toContain('Marketing surface');
  });
});
