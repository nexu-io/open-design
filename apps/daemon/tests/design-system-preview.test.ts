// Tests for `apps/daemon/src/design-system-preview.ts`. This module exports
// a single public function — `renderDesignSystemPreview` — but its behavior is
// driven by several internal extractors (color/font parsers, neutral filter,
// hint-based color picker). We exercise those extractors through the public
// API by crafting DESIGN.md fixtures that pin each branch.
//
// Approach: feed a permissive DESIGN.md-shaped string into the renderer and
// assert on the produced HTML. Each test isolates one extractor concern so a
// regression points at the right helper.

import { describe, expect, it } from 'vitest';
import { renderDesignSystemPreview } from '../src/design-systems/preview.js';

// Pull every `background:<hex>;` chip style out of the palette block. Order is
// preserved, which lets us check the extractColors output ordering.
function paletteHexes(html: string): string[] {
  return Array.from(html.matchAll(/<div class="chip" style="background:(#[0-9a-fA-F]{3,8});">/g)).map(
    (m) => (m[1] ?? '').toLowerCase(),
  );
}

// Pull every swatch's visible name (the .name span content) for ordering checks.
function paletteNames(html: string): string[] {
  return Array.from(html.matchAll(/<span class="name">([^<]+)<\/span>/g)).map((m) => m[1] ?? '');
}

// The accent color drives `--accent` in the inline :root block.
function cssVar(html: string, name: string): string | null {
  const re = new RegExp(`--${name}:\\s*([^;]+);`);
  const m = re.exec(html);
  return m ? (m[1] ?? '').trim() : null;
}

describe('renderDesignSystemPreview — extractColors (color section parsing)', () => {
  it('parses Form A `- **Name**: `#hex`` entries and preserves order', () => {
    // Form A regex: bold around the name, colon outside the bold.
    const md = [
      '# Acme Brand',
      '',
      '## Color',
      '',
      '- **Background**: `#FAFAFA`',
      '- **Heading**: `#0B0B0F`',
      '- **Primary**: `#FF5701`',
    ].join('\n');

    const html = renderDesignSystemPreview('acme', md);
    const hexes = paletteHexes(html);
    const names = paletteNames(html);

    expect(hexes).toEqual(['#fafafa', '#0b0b0f', '#ff5701']);
    expect(names).toEqual(['Background', 'Heading', 'Primary']);
  });

  it('parses Form B `**Name** (`#hex`)` entries common in awesome-design-md', () => {
    const md = [
      '# Stripe',
      '',
      '## Palette',
      '',
      '- **Stripe Purple** (`#533afd`) — primary brand color.',
      '- **Slate Ink** (`#0a2540`) — headings.',
    ].join('\n');

    const html = renderDesignSystemPreview('stripe', md);
    const hexes = paletteHexes(html);

    expect(hexes).toContain('#533afd');
    expect(hexes).toContain('#0a2540');
  });

  it('normalizes shorthand 3-digit hex to 6-digit form', () => {
    const md = ['# Tiny', '', '## Color', '', '- **Accent**: `#abc`'].join('\n');

    const html = renderDesignSystemPreview('tiny', md);

    // #abc → #aabbcc per CSS hex shorthand expansion.
    expect(paletteHexes(html)).toEqual(['#aabbcc']);
  });

  it('deduplicates entries with the same name+value', () => {
    const md = [
      '# Dup',
      '',
      '## Color',
      '',
      '- **Primary**: `#ff0000`',
      '- **Primary**: `#ff0000`',
    ].join('\n');

    const html = renderDesignSystemPreview('dup', md);

    expect(paletteHexes(html)).toEqual(['#ff0000']);
  });

  it('returns an empty palette when no color section is present', () => {
    const md = ['# Bare', '', 'No colors here, just prose.'].join('\n');

    const html = renderDesignSystemPreview('bare', md);

    // No swatch chips rendered, but the palette section still exists.
    expect(paletteHexes(html)).toEqual([]);
    expect(html).toContain('class="palette"');
  });
});

describe('renderDesignSystemPreview — pickColor (hint-based selection)', () => {
  it('picks the brand/primary color into --accent', () => {
    const md = [
      '# Brand',
      '',
      '## Color',
      '',
      '- **Background**: `#ffffff`',
      '- **Primary**: `#7d2ae8`',
    ].join('\n');

    const html = renderDesignSystemPreview('brand', md);

    expect(cssVar(html, 'accent')).toBe('#7d2ae8');
  });

  it('picks the background hint into --bg', () => {
    const md = [
      '# Bg',
      '',
      '## Color',
      '',
      '- **Page Background**: `#101014`',
      '- **Text**: `#fefefe`',
    ].join('\n');

    const html = renderDesignSystemPreview('bg', md);

    expect(cssVar(html, 'bg')).toBe('#101014');
  });

  it('falls back to default --accent when no colors are declared', () => {
    const md = '# Empty\n\nNo color section at all.';

    const html = renderDesignSystemPreview('empty', md);

    // The renderer hard-coded fallback for accent is #2f6feb.
    expect(cssVar(html, 'accent')).toBe('#2f6feb');
    expect(cssVar(html, 'bg')).toBe('#ffffff');
    expect(cssVar(html, 'fg')).toBe('#111111');
  });
});

describe('renderDesignSystemPreview — firstNonNeutral (saturation fallback)', () => {
  it('skips low-saturation neutrals and picks the first vivid color for --accent', () => {
    // No brand/primary names → pickColor returns null, firstNonNeutral runs.
    // Greys/whites/blacks should be skipped; the vivid red should win.
    const md = [
      '# Neutral',
      '',
      '## Color',
      '',
      '- **Paper**: `#ffffff`',
      '- **Ink**: `#111111`',
      '- **Mute**: `#888888`',
      '- **Pop**: `#e63946`',
    ].join('\n');

    const html = renderDesignSystemPreview('neutral', md);

    expect(cssVar(html, 'accent')).toBe('#e63946');
  });

  it('falls back to the default accent when every color is neutral', () => {
    const md = [
      '# All Grey',
      '',
      '## Color',
      '',
      '- **Paper**: `#ffffff`',
      '- **Stone**: `#cccccc`',
      '- **Ink**: `#222222`',
    ].join('\n');

    const html = renderDesignSystemPreview('grey', md);

    expect(cssVar(html, 'accent')).toBe('#2f6feb');
  });
});

describe('renderDesignSystemPreview — extractFonts (typography parsing)', () => {
  it('parses display/body/mono font declarations into the :root block', () => {
    const md = [
      '# Fonts',
      '',
      '## Typography',
      '',
      "- **Display**: `'GT Sectra', serif`",
      "- **Body**: `'Inter', system-ui, sans-serif`",
      "- **Mono**: `'JetBrains Mono', monospace`",
    ].join('\n');

    const html = renderDesignSystemPreview('fonts', md);

    expect(cssVar(html, 'display')).toBe("'GT Sectra', serif");
    expect(cssVar(html, 'body')).toBe("'Inter', system-ui, sans-serif");
    expect(cssVar(html, 'mono')).toBe("'JetBrains Mono', monospace");
  });

  it('falls back to system stacks when no font declarations are present', () => {
    const md = '# Bare\n\nNo typography section here.';

    const html = renderDesignSystemPreview('bare', md);

    // Default display stack defined in the source.
    expect(cssVar(html, 'display')).toContain('system-ui');
    expect(cssVar(html, 'mono')).toContain('ui-monospace');
  });

  it('uses heading label as a display alias when "display" is absent', () => {
    const md = [
      '# Headings',
      '',
      '## Typography',
      '',
      "- **Heading**: `'Playfair Display', serif`",
    ].join('\n');

    const html = renderDesignSystemPreview('headings', md);

    // Heading label maps onto display via the heading regex branch.
    expect(cssVar(html, 'display')).toBe("'Playfair Display', serif");
  });
});

describe('renderDesignSystemPreview — end-to-end render', () => {
  it('produces a complete HTML document with all major sections', () => {
    const md = [
      '# Example',
      '',
      'A short subtitle describing the system.',
      '',
      '## Color',
      '',
      '- **Primary**: `#2f6feb`',
      '',
      '## Typography',
      '',
      "- **Display**: `'Inter', sans-serif`",
    ].join('\n');

    const html = renderDesignSystemPreview('example', md);

    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<title>Example — design system preview</title>');
    expect(html).toContain('class="palette"');
    expect(html).toContain('class="typo-row"');
    expect(html).toContain('class="components"');
    // The "Design system preview · <id>" badge surfaces the id.
    expect(html).toContain('Design system preview · example');
  });

  it('strips the "Design System Inspired by" title prefix', () => {
    const md = '# Design System Inspired by Linear\n\nDesc.';

    const html = renderDesignSystemPreview('linear', md);

    // cleanTitle should drop the "Design System Inspired by" prefix.
    expect(html).toContain('<title>Linear — design system preview</title>');
    expect(html).toContain('<h1>Linear</h1>');
  });

  it('escapes HTML in title, id, and subtitle to prevent injection', () => {
    // Use angle brackets in the title and subtitle to confirm escapeHtml runs
    // on every user-content position before interpolation.
    const md = [
      '# <b>Evil</b>Brand',
      '',
      'Subtitle with <img tag>.',
    ].join('\n');

    const html = renderDesignSystemPreview('id">danger', md);

    // Raw <b> should never leak into the title; only the escaped form.
    expect(html).not.toContain('<title><b>Evil</b>');
    expect(html).toContain('&lt;b&gt;Evil&lt;/b&gt;Brand');
    // The id is rendered inside the badge with escapeHtml — the closing
    // sequence `">` must be encoded so an attacker cannot break out.
    expect(html).toContain('id&quot;&gt;danger');
    // Subtitle escapes too.
    expect(html).toContain('&lt;img tag&gt;');
  });

  it('caps the palette at 12 swatches even when more colors are extracted', () => {
    const lines = ['# Many', '', '## Color', ''];
    // Generate 15 distinct colors so we hit the .slice(0, 12) cap.
    for (let i = 0; i < 15; i++) {
      const hex = `#${i.toString(16).padStart(2, '0')}${i.toString(16).padStart(2, '0')}${i.toString(16).padStart(2, '0')}`;
      lines.push(`- **Color${i}**: \`${hex}\``);
    }

    const html = renderDesignSystemPreview('many', lines.join('\n'));

    // Only the first 12 entries should make it into the palette grid.
    expect(paletteHexes(html).length).toBe(12);
  });

  it('uses the id as the title when no top-level heading is present', () => {
    const md = 'No heading at all, just body prose.';

    const html = renderDesignSystemPreview('fallback-id', md);

    expect(html).toContain('<title>fallback-id — design system preview</title>');
    expect(html).toContain('<h1>fallback-id</h1>');
  });
});
