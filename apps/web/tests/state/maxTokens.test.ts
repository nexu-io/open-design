import { describe, it, expect } from 'vitest';
import { modelMaxTokensDefault, effectiveMaxTokens, FALLBACK_MAX_TOKENS, MIN_MAX_TOKENS, MAX_MAX_TOKENS } from '../../src/state/maxTokens';
import litellmData from '../../src/state/litellm-models.json';

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

  it('keeps deepseek-v3.2 override intact alongside the new -cloud id', () => {
    // Regression: an earlier revision replaced this entry instead of
    // adding the new deepseek-v3.1:671b-cloud id alongside it, which
    // silently dropped deepseek-v3.2 to FALLBACK_MAX_TOKENS (8192).
    expect(modelMaxTokensDefault('deepseek-v3.2')).toBe(163840);
  });

  it('keeps recent Ollama Cloud models out of the unknown-model fallback', () => {
    expect(modelMaxTokensDefault('glm-5.2')).toBe(131072);
    expect(modelMaxTokensDefault('kimi-k2.7-code')).toBe(131072);
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
