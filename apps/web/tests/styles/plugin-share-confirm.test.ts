import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('plugin share confirmation styles', () => {
  it('keeps the publish dialog footer away from the modal edge', () => {
    const css = readFileSync(join(process.cwd(), 'src/index.css'), 'utf8');

    expect(css).toContain('.plugin-share-confirm .plugin-details-modal__foot');
    expect(css).toContain('padding: 16px 24px 22px;');
  });
});
