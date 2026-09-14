import { describe, expect, it } from 'vitest';

import { byokPreflightBlockReason } from '../../src/components/byok/preflight';

const anthropicPreset = {
  apiProtocol: 'anthropic' as const,
  apiProviderBaseUrl: null,
  apiKey: 'sk-ant-test',
  baseUrl: 'https://api.anthropic.com',
};

describe('byokPreflightBlockReason default-model sentinel', () => {
  it('blocks the `default` sentinel on a built-in provider preset', () => {
    expect(byokPreflightBlockReason({ ...anthropicPreset, model: 'default' })).toBe(
      'model_default',
    );
  });

  it('accepts a literal `default` model on a custom base URL', () => {
    expect(
      byokPreflightBlockReason({
        ...anthropicPreset,
        apiProtocol: 'openai',
        baseUrl: 'https://llm.internal.example/v1',
        model: 'default',
      }),
    ).toBeNull();
  });

  it('still blocks a missing model on a custom base URL', () => {
    expect(
      byokPreflightBlockReason({
        ...anthropicPreset,
        apiProtocol: 'openai',
        baseUrl: 'https://llm.internal.example/v1',
        model: '',
      }),
    ).toBe('model_required');
  });
});
