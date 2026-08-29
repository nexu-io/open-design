import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const drawerCss = readFileSync(
  new URL('../../src/styles/workspace/drawer.css', import.meta.url),
  'utf8',
);

function cssDeclarations(css: string, selector: string): string {
  const blocks: string[] = [];
  const rulePattern = /([^{}]+)\{([^}]*)\}/g;
  const cssWithoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let match: RegExpExecArray | null;
  while ((match = rulePattern.exec(cssWithoutComments)) !== null) {
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

describe('Projects card preview fill', () => {
  it('uses the Home card 16:9 desktop preview treatment', () => {
    const projectThumb = cssDeclarations(drawerCss, '.project-thumb');
    const projectIframe = cssDeclarations(drawerCss, '.project-thumb .thumb-iframe');
    const media = cssDeclarations(drawerCss, '.design-card-thumb .thumb-media');

    expect(ruleValue(projectThumb, 'aspect-ratio')).toBe('16 / 9');
    expect(ruleValue(projectThumb, 'container-type')).toBe('inline-size');
    expect(ruleValue(projectThumb, 'overflow')).toBe('hidden');
    expect(ruleValue(projectIframe, 'width')).toBe('1280px');
    expect(ruleValue(projectIframe, 'height')).toBe('720px');
    expect(ruleValue(projectIframe, 'transform')).toBe('scale(calc(100cqw / 1280px))');
    expect(ruleValue(projectIframe, 'transform-origin')).toBe('top left');
    expect(ruleValue(media, 'object-fit')).toBe('cover');
  });

  it('keeps the shared iframe treatment for non-project cards', () => {
    const sharedIframe = cssDeclarations(drawerCss, '.design-card-thumb .thumb-iframe');

    expect(ruleValue(sharedIframe, 'width')).toBe('250%');
    expect(ruleValue(sharedIframe, 'height')).toBe('250%');
    expect(ruleValue(sharedIframe, 'transform')).toBe('scale(calc(0.4 * var(--thumb-zoom)))');
  });
});
