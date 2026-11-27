import { describe, expect, it } from 'vitest';

import { amrRunFallbackModel } from '../../src/runtimes/amr-model-cache.js';
import { rememberRemoteLiveModels } from '../../src/runtimes/models.js';

describe('amrRunFallbackModel', () => {
  it('uses the universal chat model before a remote catalog is known', () => {
    expect(amrRunFallbackModel('amr', 'fallback-cold', 'deepseek-v4-flash')).toBe('deepseek-v4.1-flash');
    expect(amrRunFallbackModel('amr', 'fallback-cold', 'deepseek-v4.1-flash')).toBeNull();
  });

  it("uses the remote catalog's default once one is known", () => {
    rememberRemoteLiveModels('amr', [
      { id: 'glm-5.3-flash', label: 'glm-5.3-flash' },
      { id: 'deepseek-v4-pro', label: 'deepseek-v4-pro', default: true },
    ], 'fallback-warm');
    expect(amrRunFallbackModel('amr', 'fallback-warm', 'deepseek-v4-flash')).toBe('deepseek-v4-pro');
    expect(amrRunFallbackModel('amr', 'fallback-warm', 'deepseek-v4-pro')).toBeNull();
  });
});
