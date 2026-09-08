import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const homeHeroCss = readFileSync(
  new URL('../../src/styles/home/home-hero.css', import.meta.url),
  'utf8',
);

function cssDeclarations(selector: string): string {
  const blocks: string[] = [];
  const rulePattern = /([^{}]+)\{([^}]*)\}/g;
  const cssWithoutComments = homeHeroCss.replace(/\/\*[\s\S]*?\*\//g, '');
  let match: RegExpExecArray | null;
  while ((match = rulePattern.exec(cssWithoutComments)) !== null) {
    const selectors = (match[1] ?? '').split(',').map((item) => item.trim());
    if (selectors.includes(selector)) blocks.push(match[2] ?? '');
  }
  if (blocks.length === 0) throw new Error(`Missing CSS block for ${selector}`);
  return blocks.join('\n');
}

function ruleValue(block: string, property: string): string {
  const matches = [
    ...block.matchAll(new RegExp(`(?:^|[;\\n])\\s*${property}:\\s*([^;]+);`, 'g')),
  ];
  const match = matches.at(-1);
  if (!match) throw new Error(`Missing CSS property ${property}`);
  return match[1]!.trim();
}

describe('HomeHero deck preset previews', () => {
  it('center-crops baked 1.31 posters through a 16:9 media frame that fills the tile', () => {
    const frame = cssDeclarations(
      '.home-hero__plugin-preset[data-od-mode="deck"] .home-hero__plugin-preset-preview',
    );
    const preview = cssDeclarations(
      '.home-hero__plugin-preset[data-od-mode="deck"] .plugins-home__preview--media',
    );
    const media = cssDeclarations(
      '.home-hero__plugin-preset[data-od-mode="deck"] .plugins-home__media',
    );
    const image = cssDeclarations(
      '.home-hero__plugin-preset[data-od-mode="deck"] .plugins-home__media-img',
    );
    const video = cssDeclarations(
      '.home-hero__plugin-preset[data-od-mode="deck"] .plugins-home__media-video',
    );

    expect(ruleValue(frame, 'background')).toBe('var(--bg-panel)');
    expect(ruleValue(preview, 'background')).toBe('var(--bg-panel)');

    // The 16:9 stage COVERS the (wider) preview cell — full height, overflowing
    // width, centered — so no card-coloured band is left above or below it.
    expect(ruleValue(media, 'position')).toBe('absolute');
    expect(ruleValue(media, 'inset')).toBe('0 auto 0 50%');
    expect(ruleValue(media, 'width')).toBe('auto');
    expect(ruleValue(media, 'height')).toBe('100%');
    expect(ruleValue(media, 'aspect-ratio')).toBe('16 / 9');
    expect(ruleValue(media, 'transform')).toBe('translateX(-50%)');

    expect(ruleValue(image, 'object-position')).toBe('center');
    expect(ruleValue(video, 'object-position')).toBe('center');
    expect(ruleValue(image, 'transform')).toBe('none');
    expect(ruleValue(video, 'transform')).toBe('none');
  });
});
