import { describe, expect, it } from 'vitest';

import { parseDesignMd } from '../../src/runtime/design-md-parse';

// The brand-generated emitter shape (apps/daemon/src/brands/design-md.ts):
// YAML frontmatter + `## Color Palette` table + `## Typography` font lines +
// `## Voice & Tone` / `## Imagery` / `## Layout`. The web parser must round-trip
// this so a brand-derived design system renders its modules.
const BRAND_EMITTER_MD = [
  '---',
  'name: "The Economist"',
  'category: Brands',
  'surface: web',
  'colors:',
  '  economist-red: "#e3120b"',
  '  ink: "#0d0d0d"',
  '---',
  '',
  '# The Economist',
  '> Category: Brands',
  '> Surface: web',
  '*Go beyond breaking news*',
  'The Economist is a weekly newspaper covering world politics and economics.',
  '',
  '## Color Palette',
  '',
  '| Role | Name | Hex | Usage |',
  '| --- | --- | --- | --- |',
  '| accent | Economist Red | `#E3120B` | masthead, links, CTAs |',
  '| foreground | Ink | `#0D0D0D` | primary text |',
  '',
  '## Typography',
  '',
  '- **Display:** EconomistSans — weights 400, 700 — fallbacks: Source Sans 3, system-ui',
  '- **Body:** EconomistSerif — weights 400 — fallbacks: Georgia, serif',
  '',
  '## Voice & Tone',
  '',
  '- **Adjectives:** authoritative, incisive, witty',
  '- **Tone:** Plain, confident and analytical with a dry wit.',
  '',
  '### Messaging pillars',
  '- Go beyond breaking news',
  '- A single, coherent editorial voice',
  '',
  '### Vocabulary',
  '- **Use:** leader, why it matters',
  '- **Avoid:** clickbait, emoji',
  '',
  '## Imagery',
  '',
  '- **Style:** Bold conceptual editorial illustration.',
  '- **Subjects:** world leaders, markets',
  '- **Treatment:** flat colour over ink line',
  '- **Avoid:** stock-photo clichés',
  '',
  '## Layout',
  '',
  '- **Radius:** 0px',
  '- **Border weight:** 1px',
  '- **Spacing:** 8px baseline grid',
  '',
  '### Posture rules',
  '- White ground, near-black text, thin grey hairlines.',
].join('\n');

// A bundled preset shape (design-systems/*/DESIGN.md): numbered headings, bullet
// palette + `Families: primary=…` typography, no Voice/Imagery sections.
const PRESET_MD = [
  '# Design System Inspired by Agentic',
  '',
  '> Category: Themed & Unique',
  '> Conversational AI-first interface.',
  '',
  '## 2. Color',
  '',
  '- **Primary:** `#FF5701` — Token from style foundations.',
  '- **Surface:** `#FFFFFF` — Large backgrounds and cards.',
  '- **Text:** `#111827` — Body copy.',
  '',
  '## 3. Typography',
  '',
  '- **Families:** primary=Playfair Display, display=Playfair Display, mono=JetBrains Mono',
  '- **Weights:** 400, 600, 700',
].join('\n');

describe('parseDesignMd', () => {
  it('round-trips the brand emitter DESIGN.md shape', () => {
    const parsed = parseDesignMd(BRAND_EMITTER_MD);

    expect(parsed.name).toBe('The Economist');
    expect(parsed.tagline).toBe('Go beyond breaking news');
    expect(parsed.description).toContain('weekly newspaper');

    // Color table wins over frontmatter; hexes normalize to lowercase.
    const accent = parsed.colors.find((c) => c.hex === '#e3120b');
    expect(accent?.name).toBe('Economist Red');
    expect(accent?.usage).toContain('masthead');
    expect(parsed.colors.some((c) => c.hex === '#0d0d0d')).toBe(true);

    expect(parsed.typography.display?.family).toBe('EconomistSans');
    expect(parsed.typography.display?.weights).toContain(400);
    expect(parsed.typography.display?.fallbacks).toContain('Source Sans 3');
    expect(parsed.typography.body?.family).toBe('EconomistSerif');

    expect(parsed.voice.adjectives).toContain('authoritative');
    expect(parsed.voice.tone).toContain('dry wit');
    expect(parsed.voice.messagingPillars).toContain('Go beyond breaking news');
    expect(parsed.voice.vocabulary.use).toContain('leader');
    expect(parsed.voice.vocabulary.avoid).toContain('emoji');

    expect(parsed.imagery.style).toContain('editorial illustration');
    expect(parsed.imagery.subjects).toContain('markets');

    expect(parsed.layout.radius).toBe('0px');
    expect(parsed.layout.spacing).toContain('baseline grid');
    expect(parsed.layout.postureRules.length).toBeGreaterThan(0);
  });

  it('falls back to frontmatter colors when no palette table exists', () => {
    const md = ['---', 'name: "Acme"', 'colors:', '  brand: "#123456"', '---', '', '# Acme'].join('\n');
    const parsed = parseDesignMd(md);
    expect(parsed.colors).toHaveLength(1);
    expect(parsed.colors[0]?.hex).toBe('#123456');
  });

  it('parses the bundled preset DESIGN.md shape (numbered headings, bullet palette)', () => {
    const parsed = parseDesignMd(PRESET_MD);

    expect(parsed.name).toBe('Design System Inspired by Agentic');
    expect(parsed.category).toBe('Themed & Unique');

    expect(parsed.colors.map((c) => c.hex)).toEqual(
      expect.arrayContaining(['#ff5701', '#ffffff', '#111827']),
    );
    const primary = parsed.colors.find((c) => c.hex === '#ff5701');
    expect(primary?.role).toBe('accent');

    expect(parsed.typography.display?.family).toBe('Playfair Display');
    expect(parsed.typography.mono?.family).toBe('JetBrains Mono');
    expect(parsed.typography.display?.weights).toEqual(expect.arrayContaining([400, 600, 700]));
  });

  it('returns empty modules for an empty document without throwing', () => {
    const parsed = parseDesignMd('');
    expect(parsed.colors).toEqual([]);
    expect(parsed.typography.display).toBeUndefined();
    expect(parsed.voice.adjectives).toEqual([]);
  });
});
