import { describe, it, expect } from 'vitest';
import { modelMaxTokensDefault } from '../../src/state/maxTokens';

describe('modelMaxTokensDefault', () => {
  it('returns correct default for cloud-suffixed models from OVERRIDES', () => {
    expect(modelMaxTokensDefault('gpt-oss:20b-cloud')).toBe(131072);
    expect(modelMaxTokensDefault('gpt-oss:120b-cloud')).toBe(131072);
    expect(modelMaxTokensDefault('deepseek-v3.1:671b-cloud')).toBe(163840);
    expect(modelMaxTokensDefault('qwen3-coder:480b-cloud')).toBe(262144);
  });

  it('falls back to FALLBACK_MAX_TOKENS for unknown cloud models', () => {
    expect(modelMaxTokensDefault('unknown-model-cloud')).toBe(8192);
  });
});
