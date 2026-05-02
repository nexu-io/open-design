import { describe, expect, it } from 'vitest';

import litellmData from './litellm-models.json';
import {
  effectiveMaxTokens,
  FALLBACK_MAX_TOKENS,
  modelMaxTokensDefault,
} from './maxTokens';

describe('modelMaxTokensDefault', () => {
  it('falls through to LiteLLM data for canonical Anthropic ids', () => {
    // 64k for the 4.5 line is the upstream value; this guards against the
    // sync script silently dropping or rewriting these entries.
    expect(modelMaxTokensDefault('claude-sonnet-4-5')).toBe(64000);
    expect(modelMaxTokensDefault('claude-opus-4-5')).toBe(64000);
    expect(modelMaxTokensDefault('claude-haiku-4-5')).toBe(64000);
  });

  it('lets OVERRIDES win over LiteLLM data', () => {
    // mimo-v2.5-pro is not in LiteLLM, so this asserts the OVERRIDES path
    // (not the LiteLLM path) supplied the answer.
    expect((litellmData.models as Record<string, number>)['mimo-v2.5-pro']).toBeUndefined();
    expect(modelMaxTokensDefault('mimo-v2.5-pro')).toBe(32768);
  });

  it('returns FALLBACK_MAX_TOKENS for unknown ids', () => {
    expect(modelMaxTokensDefault('definitely-not-a-real-model-x9z')).toBe(FALLBACK_MAX_TOKENS);
    expect(FALLBACK_MAX_TOKENS).toBe(8192);
  });
});

describe('effectiveMaxTokens', () => {
  it('honors an explicit user override over the model default', () => {
    expect(effectiveMaxTokens({ maxTokens: 12345, model: 'claude-sonnet-4-5' })).toBe(12345);
  });

  it('uses the model default when no override is set', () => {
    expect(effectiveMaxTokens({ model: 'mimo-v2.5-pro' })).toBe(32768);
    expect(effectiveMaxTokens({ model: 'claude-sonnet-4-5' })).toBe(64000);
  });

  it('falls back to FALLBACK_MAX_TOKENS for unknown models with no override', () => {
    expect(effectiveMaxTokens({ model: 'unknown-model' })).toBe(FALLBACK_MAX_TOKENS);
  });
});
