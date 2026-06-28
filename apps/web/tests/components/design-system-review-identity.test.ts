import { describe, expect, it } from 'vitest';

import {
  designSystemReviewInstanceId,
  designSystemReviewPreviewHeight,
} from '../../src/components/design-system-review-identity';

describe('designSystemReviewInstanceId', () => {
  it('keeps duplicate section titles unique by including their primary file path', () => {
    const first = designSystemReviewInstanceId('Components', {
      title: 'Buttons',
      files: ['preview/buttons.html', 'styles.css'],
    });
    const second = designSystemReviewInstanceId('Components', {
      title: 'Buttons',
      files: ['components/buttons.html', 'styles.css'],
    });

    expect(first).not.toBe(second);
    expect(first).toContain('Components:Buttons');
    expect(second).toContain('Components:Buttons');
  });
});

describe('designSystemReviewPreviewHeight', () => {
  it('uses the manifest viewport height for compact specimen cards', () => {
    expect(designSystemReviewPreviewHeight('820x300', 'specimen')).toBe('clamp(140px, 300px, 520px)');
  });

  it('keeps ui-kit cards within the taller full-page review bounds', () => {
    expect(designSystemReviewPreviewHeight('1280x980', 'ui-kit')).toBe('clamp(360px, 980px, 920px)');
  });

  it('ignores missing or malformed viewport strings', () => {
    expect(designSystemReviewPreviewHeight(undefined, 'specimen')).toBeUndefined();
    expect(designSystemReviewPreviewHeight('desktop', 'specimen')).toBeUndefined();
  });
});
