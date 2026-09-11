import postcss, { type Declaration, type Rule } from 'postcss';
import { describe, expect, it } from 'vitest';

import { readExpandedIndexCss } from '../helpers/read-expanded-css';

function declarationsFor(selector: string): Map<string, string> {
  const root = postcss.parse(readExpandedIndexCss(), { from: 'src/index.css' });
  const rule = root.nodes.find(
    (node): node is Rule => node.type === 'rule' && node.selector === selector,
  );

  return new Map(
    rule?.nodes
      .filter((node): node is Declaration => node.type === 'decl')
      .map((declaration) => [declaration.prop, declaration.value]),
  );
}

describe('social share target layout', () => {
  it('normalizes link and button targets after the global button styles', () => {
    const declarations = declarationsFor('.social-share-button');

    expect(declarations.get('height')).toBe('auto');
    expect(declarations.get('min-height')).toBe('34px');
    expect(declarations.get('justify-content')).toBe('flex-start');
    expect(declarations.get('font')).toBe('inherit');
    expect(declarations.get('font-size')).toBe('13px');
  });
});
