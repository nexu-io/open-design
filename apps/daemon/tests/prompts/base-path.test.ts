import { describe, expect, it } from 'vitest';

import { renderDiscoveryAndPhilosophy, renderSharedFramesBlock } from '../../src/prompts/discovery.js';

describe('prompt browser asset paths', () => {
  it('uses the configured base path for shared frame instructions', () => {
    const prompt = renderSharedFramesBlock('/open-design');
    expect(prompt).toContain('/open-design/frames/iphone-15-pro.html');
    expect(prompt).not.toContain('src="/frames/iphone-15-pro.html');
    expect(renderDiscoveryAndPhilosophy('filesystem', '/open-design')).toContain('OD core directives');
  });

  it('keeps the extra multi-frame block aligned with the same prefix', () => {
    expect(renderSharedFramesBlock('/open-design')).toContain('/open-design/frames/browser-chrome.html');
  });
});
