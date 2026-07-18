import { describe, expect, it } from 'vitest';
import { readExpandedIndexCss } from '../helpers/read-expanded-css';

describe('sketch help modal styles', () => {
  it('keeps the portal modal centered while scrolling oversized help content inside the panel', () => {
    const css = readExpandedIndexCss();

    expect(css).toContain(`.od-sketch-modal.od-sketch-help-modal .Modal {
  max-height: none;
}`);
    expect(css).toContain(`.od-sketch-modal.od-sketch-help-modal .Modal__content {
  max-height: min(82vh, calc(100vh - 80px));`);
  });
});
