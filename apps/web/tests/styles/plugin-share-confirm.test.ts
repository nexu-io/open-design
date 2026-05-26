import { describe, expect, it } from 'vitest';
import { readExpandedIndexCss } from '../helpers/read-expanded-css';

describe('plugin share confirmation styles', () => {
  it('keeps the publish dialog footer away from the modal edge', () => {
    const css = readExpandedIndexCss();

    expect(css).toContain('.plugin-share-confirm .plugin-details-modal__foot');
    expect(css).toContain('padding: 16px 24px 22px;');
  });
});
