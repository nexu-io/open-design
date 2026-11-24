import postcss, { type Declaration, type Rule } from 'postcss';
import { describe, expect, it } from 'vitest';
import { readExpandedIndexCss } from '../helpers/read-expanded-css';

describe('design-system preview modal kit scrolling', () => {
  it('keeps the rich-kit stage wrapper as the Visualize tab scroll container', () => {
    const root = postcss.parse(readExpandedIndexCss(), { from: 'src/index.css' });
    const rule = root.nodes.find(
      (node): node is Rule => node.type === 'rule' && node.selector === '.ds-modal-rich-kit',
    );
    const declarations = new Map(
      rule?.nodes
        .filter((node): node is Declaration => node.type === 'decl')
        .map((declaration) => [declaration.prop, declaration.value]),
    );

    expect(declarations.get('flex')).toBe('1');
    expect(declarations.get('min-height')).toBe('0');
    expect(declarations.get('overflow')).toBe('auto');
  });
});
