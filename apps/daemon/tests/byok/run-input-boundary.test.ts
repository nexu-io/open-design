import { describe, expect, it } from 'vitest';

import {
  __forTestHasCompleteByokOpenCodeConfig,
  __forTestWithoutSensitiveRunInput,
} from '../../src/routes/runs.js';

describe('BYOK run input boundary', () => {
  it('accepts a complete run-scoped Local BYOK provider', () => {
    expect(__forTestHasCompleteByokOpenCodeConfig({
      agentId: 'byok-opencode',
      model: 'gpt-5.4-mini',
      byokProvider: {
        protocol: 'openai',
        apiKey: 'local-only-secret',
        baseUrl: 'https://api.openai.com/v1',
      },
    })).toBe(true);
  });

  it('rejects a BYOK run without a run-scoped provider', () => {
    expect(__forTestHasCompleteByokOpenCodeConfig({
      agentId: 'byok-opencode',
    })).toBe(false);
  });

  it('accepts a keyless run-scoped provider when the protocol permits it', () => {
    expect(__forTestHasCompleteByokOpenCodeConfig({
      agentId: 'byok-opencode',
      model: 'local-model',
      byokProvider: {
        protocol: 'openai',
        baseUrl: 'http://127.0.0.1:1234/v1',
        requiresApiKey: false,
      },
    })).toBe(true);
  });

  it('removes every credential-bearing compatibility field before persistence', () => {
    const sanitized = __forTestWithoutSensitiveRunInput({
      agentId: 'byok-opencode',
      byokProfileId: 'byok-openrouter',
      byokProvider: { apiKey: 'nested-secret' },
      apiKey: 'top-level-secret',
      rechargeResumeCapability: 'capability-secret',
      message: 'Create a site',
    });

    expect(sanitized).toEqual({
      agentId: 'byok-opencode',
      message: 'Create a site',
    });
    expect(JSON.stringify(sanitized)).not.toContain('secret');
  });
});
