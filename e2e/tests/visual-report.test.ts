import { describe, expect, test } from 'vitest';

import { assertPngPixels } from '../scripts/visual-report.js';

describe('visual report PNG sizing', () => {
  test('rejects normalized diff canvases that exceed the pixel ceiling', () => {
    expect(() => assertPngPixels(4_000, 900, 'main.png')).not.toThrow();
    expect(() => assertPngPixels(900, 4_000, 'pr.png')).not.toThrow();
    expect(() => assertPngPixels(4_000, 4_000, 'main.png vs pr.png normalized diff canvas')).toThrow(
      /maximum allowed is 4000000 pixels/,
    );
  });
});
