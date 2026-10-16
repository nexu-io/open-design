import { describe, expect, it } from 'vitest';

import { museAgentDef } from '../../src/runtimes/defs/muse.js';
import { installMetaForAgent } from '../../src/runtimes/metadata.js';
import { getAgentDef } from '../../src/runtimes/registry.js';

describe('Muse runtime adapter', () => {
  it('registers Muse in the agent registry', () => {
    expect(getAgentDef('muse')).toBe(museAgentDef);
  });

  it('exposes install and docs metadata for the unavailable state', () => {
    const meta = installMetaForAgent('muse');
    expect(meta.installUrl).toBe('https://dev.meta.ai/docs/muse-code');
    expect(meta.docsUrl).toBe('https://dev.meta.ai/docs/muse-code');
  });
});
