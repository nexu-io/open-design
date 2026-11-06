import postcss, { type Declaration, type Rule } from 'postcss';
import { describe, expect, it } from 'vitest';
import { readExpandedIndexCss } from '../helpers/read-expanded-css';

describe('plugin detail page scrolling', () => {
  it('owns vertical overflow inside the fixed-height workspace shell', () => {
    const root = postcss.parse(readExpandedIndexCss(), { from: 'src/index.css' });
    const rule = root.nodes.find(
      (node): node is Rule => node.type === 'rule' && node.selector === '.plugin-suite-detail',
    );
    const declarations = new Map(
      rule?.nodes
        .filter((node): node is Declaration => node.type === 'decl')
        .map((declaration) => [declaration.prop, declaration.value]),
    );

    expect(declarations.get('height')).toBe('100%');
    expect(declarations.get('min-height')).toBe('0');
    expect(declarations.get('overflow-x')).toBe('hidden');
    expect(declarations.get('overflow-y')).toBe('auto');
    expect(declarations.get('scrollbar-gutter')).toBe('stable');
  });
});
