import { describe, expect, it } from 'vitest';

import {
  CLAUDE_DESIGN_IMPORT_MAX_BYTES,
  GROUNDED_PPTX_UPLOAD_MAX_BYTES,
} from '../../src/pptx-grounded/upload-limits.js';

describe('grounded PPTX upload limits', () => {
  it('preserves the shared Claude import at 100 MiB and grounds PPTX at 50 MiB', () => {
    expect(CLAUDE_DESIGN_IMPORT_MAX_BYTES).toBe(100 * 1024 * 1024);
    expect(GROUNDED_PPTX_UPLOAD_MAX_BYTES).toBe(50 * 1024 * 1024);
  });
});
