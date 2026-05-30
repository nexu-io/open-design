import postcss, { type Rule } from 'postcss';
import { describe, expect, it } from 'vitest';
import { readExpandedIndexCss } from '../helpers/read-expanded-css';

describe('plugin info preview pane styles', () => {
  it('keeps plugin preview sidebar content away from the pane edges', () => {
    const css = readExpandedIndexCss();
    const root = postcss.parse(css, { from: 'src/index.css' });
    const topLevelRules = root.nodes.filter(
      (node): node is Rule => node.type === 'rule',
    );
    const topLevelSelectors = topLevelRules.map((rule) => rule.selector);

    expect(css).toContain('.ds-modal-sidebar');
    expect(css).toContain('scrollbar-gutter: stable;');
    expect(topLevelSelectors).toContain('.plugin-info-pane');
    expect(css).toContain('padding: 22px 28px 28px 32px;');
    expect(topLevelSelectors).toContain('.plugin-design-sidebar__spec');
    expect(css).toContain('padding: 18px 28px 28px 32px;');
    expect(topLevelSelectors).not.toContain(
      '.plugin-details-modal__stage-num .plugin-info-pane',
    );
  });
});
