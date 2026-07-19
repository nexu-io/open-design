import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const mirroredModelPickerStyles = [
  ['home', new URL('../../src/styles/home/entry-layout.css', import.meta.url)],
  ['workspace', new URL('../../src/styles/workspace/artifacts.css', import.meta.url)],
] as const;

function declarationBlock(css: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return css.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
}

describe.each(mirroredModelPickerStyles)('%s model picker layout', (_surface, stylesheet) => {
  const css = readFileSync(stylesheet, 'utf8');

  it('reserves a non-shrinking lane for lock and tier affordances', () => {
    const declarations = declarationBlock(
      css,
      '.model-select-searchable__option-affordances',
    );

    expect(declarations).toContain('display: inline-flex;');
    expect(declarations).toContain('flex: 0 0 auto;');
  });

  it('allows the long model label text to truncate before the affordances', () => {
    const declarations = declarationBlock(
      css,
      '.model-select-searchable__option-label > span',
    );

    expect(declarations).toContain('min-width: 0;');
    expect(declarations).toContain('overflow: hidden;');
    expect(declarations).toContain('text-overflow: ellipsis;');
    expect(declarations).toContain('white-space: nowrap;');
  });
});
