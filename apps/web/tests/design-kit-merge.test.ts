import { describe, expect, it } from 'vitest';

import { mergeBrandKitWithDesignMd } from '../src/runtime/design-kit';
import type { DesignKit } from '../src/runtime/design-kit';

/**
 * The shape a brand extraction (`brand.json`) produces: full typography,
 * imagery with harvested samples, voice, and layout. A user's DESIGN.md edit is
 * almost always a *partial* overlay (add a display font, tweak the imagery
 * style), so merging must never silently drop the untouched extracted data.
 */
function extractedKit(): DesignKit {
  return {
    name: 'Acme',
    editable: true,
    canUpload: true,
    logoSrc: null,
    logoAlternates: [],
    colors: [{ role: 'accent', name: 'Accent', hex: '#ff5a36', usage: '' }],
    typography: {
      display: { family: 'Extracted Display', fallbacks: [], weights: [700] },
      body: { family: 'Extracted Body', fallbacks: ['Georgia'], weights: [400] },
      mono: { family: 'Extracted Mono', fallbacks: ['monospace'], weights: [400] },
    },
    fonts: [],
    voice: {
      adjectives: ['bold', 'friendly'],
      tone: 'confident',
      messagingPillars: ['Ship faster'],
      vocabulary: { use: ['build'], avoid: ['leverage'] },
    },
    imagery: {
      style: 'editorial',
      subjects: ['product screenshots'],
      treatment: 'high contrast',
      avoid: ['stock photos'],
      samples: [{ url: '/imagery/hero.png', kind: 'hero', caption: 'Hero' }],
    },
    layout: {
      radius: '12px',
      borderWeight: '1px',
      spacing: '8px grid',
      postureRules: ['Generous whitespace'],
    },
  };
}

describe('mergeBrandKitWithDesignMd — partial overlay preserves extracted data', () => {
  it('keeps body/mono fonts when DESIGN.md only overrides the display font', () => {
    const kit = extractedKit();
    const designMd = `# Acme

## Typography
- **Display:** Brandon Grotesque
`;
    const merged = mergeBrandKitWithDesignMd(kit, designMd, { editable: true });

    expect(merged.typography.display?.family).toBe('Brandon Grotesque');
    // The untouched extracted body/mono fonts survive the partial edit.
    expect(merged.typography.body?.family).toBe('Extracted Body');
    expect(merged.typography.mono?.family).toBe('Extracted Mono');
    expect(merged.fonts.map((f) => f.family)).toEqual([
      'Brandon Grotesque',
      'Extracted Body',
      'Extracted Mono',
    ]);
  });

  it('keeps harvested imagery samples + sibling fields when DESIGN.md tweaks only the imagery style', () => {
    const kit = extractedKit();
    const designMd = `# Acme

## Imagery
- **Style:** moody duotone
`;
    const merged = mergeBrandKitWithDesignMd(kit, designMd, { editable: true });

    expect(merged.imagery?.style).toBe('moody duotone');
    // Extracted samples + the other imagery fields are not wiped.
    expect(merged.imagery?.samples).toEqual(kit.imagery!.samples);
    expect(merged.imagery?.subjects).toEqual(['product screenshots']);
    expect(merged.imagery?.treatment).toBe('high contrast');
  });

  it('preserves voice + layout when DESIGN.md omits those sections entirely', () => {
    const kit = extractedKit();
    const designMd = `# Acme

## Typography
- **Display:** Brandon Grotesque
`;
    const merged = mergeBrandKitWithDesignMd(kit, designMd, { editable: true });

    expect(merged.voice).toEqual(kit.voice);
    expect(merged.layout).toEqual(kit.layout);
  });

  it('returns the kit untouched when DESIGN.md is empty', () => {
    const kit = extractedKit();
    expect(mergeBrandKitWithDesignMd(kit, '   ', { editable: true })).toBe(kit);
  });
});
