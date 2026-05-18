import { describe, expect, it } from 'vitest';

import { OFFICIAL_DESIGNER_PROMPT } from '../src/prompts/official-system.js';

describe('official designer prompt', () => {
  it('documents the data-od-id contract for meaningful inspectable HTML elements', () => {
    expect(OFFICIAL_DESIGNER_PROMPT).toContain('data-od-id');
    expect(OFFICIAL_DESIGNER_PROMPT).toContain('kebab-case');
    expect(OFFICIAL_DESIGNER_PROMPT).toMatch(/h1.*h6|h1.*h2.*h3.*h4.*h5.*h6/s);
    expect(OFFICIAL_DESIGNER_PROMPT).toMatch(/buttons?.*links?.*form controls?/is);
    expect(OFFICIAL_DESIGNER_PROMPT).toMatch(/cards?.*list items?/is);
    expect(OFFICIAL_DESIGNER_PROMPT).toMatch(/decorative elements|spacers?|dividers?/is);
  });
});
