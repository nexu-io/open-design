import { describe, expect, it } from 'vitest';

import { composeSystemPrompt } from '../src/prompts/system.js';

describe('contracts prompt browser asset paths', () => {
  it('uses the configured base path for shared device frames', () => {
    const prompt = composeSystemPrompt({ webBasePath: '/open-design' });

    expect(prompt).toContain('/open-design/frames/iphone-15-pro.html');
    expect(prompt).not.toContain('src="/frames/iphone-15-pro.html');
  });
});
