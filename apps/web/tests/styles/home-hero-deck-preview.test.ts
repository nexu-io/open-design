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
  it('center-crops baked 1.31 posters through a 16:9 media frame', () => {
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
    expect(ruleValue(preview, 'display')).toBe('flex');
    expect(ruleValue(preview, 'align-items')).toBe('center');
    expect(ruleValue(preview, 'justify-content')).toBe('center');

    expect(ruleValue(media, 'position')).toBe('relative');
    expect(ruleValue(media, 'width')).toBe('100%');
    expect(ruleValue(media, 'height')).toBe('auto');
    expect(ruleValue(media, 'aspect-ratio')).toBe('16 / 9');

    expect(ruleValue(image, 'object-position')).toBe('center');
    expect(ruleValue(video, 'object-position')).toBe('center');
    expect(ruleValue(image, 'transform')).toBe('none');
    expect(ruleValue(video, 'transform')).toBe('none');
  });
});
