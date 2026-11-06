import { describe, expect, it } from 'vitest';

import { modelProviderIconSrc } from '../../src/components/modelProviderIcon';

describe('modelProviderIconSrc', () => {
  it('maps AMR-style provider/model ids to their bundled brand mark', () => {
    expect(modelProviderIconSrc('anthropic/claude-sonnet-4-5')).toBe('/agent-icons/claude.svg');
    expect(modelProviderIconSrc('openai/gpt-5')).toBe('/model-icons/openai.svg');
    expect(modelProviderIconSrc('google/gemini-2.5-pro')).toBe('/model-icons/google-gemini.svg');
    expect(modelProviderIconSrc('xai/grok-4')).toBe('/model-icons/x.svg');
    expect(modelProviderIconSrc('deepseek/deepseek-chat')).toBe('/agent-icons/deepseek.svg');
    expect(modelProviderIconSrc('qwen/qwen3-max')).toBe('/agent-icons/qwen.svg');
    expect(modelProviderIconSrc('openrouter/anthropic/claude-sonnet-4-5')).toBe(
      '/model-icons/openrouter.svg',
    );
  });

  it('matches on provider-name substrings so aliased prefixes still resolve', () => {
    // Some catalogs prefix with the vendor's brand name rather than the bare
    // provider slug (e.g. a "claude" or "gpt" prefix instead of "anthropic"/"openai").
    expect(modelProviderIconSrc('claude/claude-opus-4-5')).toBe('/agent-icons/claude.svg');
    expect(modelProviderIconSrc('gpt/gpt-4.1')).toBe('/model-icons/openai.svg');
    expect(modelProviderIconSrc('gemini/gemini-2.5-flash')).toBe('/model-icons/google-gemini.svg');
    expect(modelProviderIconSrc('grok/grok-4')).toBe('/model-icons/x.svg');
  });

  it('returns null for ids with no provider prefix', () => {
    // The CLI-config default and other bare model ids carry no `provider/`
    // segment — callers must fall back to a neutral/agent mark themselves.
    expect(modelProviderIconSrc('default')).toBeNull();
    expect(modelProviderIconSrc('sonnet')).toBeNull();
    expect(modelProviderIconSrc('custom-codex-model')).toBeNull();
  });

  it('returns null for an unrecognized provider prefix', () => {
    expect(modelProviderIconSrc('mistral/mistral-large')).toBeNull();
  });

  it('returns null for empty or missing input', () => {
    expect(modelProviderIconSrc(null)).toBeNull();
    expect(modelProviderIconSrc(undefined)).toBeNull();
    expect(modelProviderIconSrc('')).toBeNull();
  });
});
