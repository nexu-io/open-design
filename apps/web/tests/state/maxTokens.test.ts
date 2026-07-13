import { describe, expect, it } from 'vitest';

import litellmData from '../../src/state/litellm-models.json';
import {
  effectiveMaxTokens,
  FALLBACK_MAX_TOKENS,
  MAX_MAX_TOKENS,
  MIN_MAX_TOKENS,
  modelMaxTokensDefault,
} from '../../src/state/maxTokens';

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

  it('returns DeepSeek v4 output caps from OVERRIDES (not in LiteLLM upstream)', () => {
    // DeepSeek v4 models are not tracked by LiteLLM as of 2026-05-07,
    // so OVERRIDES must supply 384K to avoid falling back to 8192.
    expect((litellmData.models as Record<string, number>)['deepseek-v4-pro']).toBeUndefined();
    expect((litellmData.models as Record<string, number>)['deepseek-v4-flash']).toBeUndefined();
    expect(modelMaxTokensDefault('deepseek-v4-pro')).toBe(384000);
    expect(modelMaxTokensDefault('deepseek-v4-flash')).toBe(384000);
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

describe('effectiveMaxTokens override validation', () => {
  // Stale localStorage, hand-edited config, or future schema drift can put
  // anything in cfg.maxTokens. The Settings UI advertises a [1024, 200000]
  // integer-stepped range, and the daemon proxy already clamps `> 0`, so
  // we tighten this entry point to match the advertised contract.

  it('rejects negative overrides and falls back to the model default', () => {
    expect(effectiveMaxTokens({ maxTokens: -5, model: 'claude-sonnet-4-5' })).toBe(64000);
  });

  it('rejects zero', () => {
    expect(effectiveMaxTokens({ maxTokens: 0, model: 'claude-sonnet-4-5' })).toBe(64000);
  });

  it('rejects overrides below MIN_MAX_TOKENS', () => {
    expect(effectiveMaxTokens({ maxTokens: MIN_MAX_TOKENS - 1, model: 'claude-sonnet-4-5' })).toBe(64000);
  });

  it('rejects overrides above MAX_MAX_TOKENS', () => {
    expect(effectiveMaxTokens({ maxTokens: MAX_MAX_TOKENS + 1, model: 'claude-sonnet-4-5' })).toBe(64000);
    expect(effectiveMaxTokens({ maxTokens: 999_999_999, model: 'claude-sonnet-4-5' })).toBe(64000);
  });

  it('rejects non-integer overrides', () => {
    expect(effectiveMaxTokens({ maxTokens: 123.9, model: 'claude-sonnet-4-5' })).toBe(64000);
    expect(effectiveMaxTokens({ maxTokens: Number.NaN, model: 'claude-sonnet-4-5' })).toBe(64000);
    expect(effectiveMaxTokens({ maxTokens: Number.POSITIVE_INFINITY, model: 'claude-sonnet-4-5' })).toBe(64000);
  });

  it('accepts the boundary values exactly', () => {
    expect(effectiveMaxTokens({ maxTokens: MIN_MAX_TOKENS, model: 'claude-sonnet-4-5' })).toBe(MIN_MAX_TOKENS);
    expect(effectiveMaxTokens({ maxTokens: MAX_MAX_TOKENS, model: 'claude-sonnet-4-5' })).toBe(MAX_MAX_TOKENS);
  });
});
