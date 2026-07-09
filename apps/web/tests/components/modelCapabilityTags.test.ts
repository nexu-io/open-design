import { describe, expect, it } from 'vitest';

import {
  getModelCapabilityTag,
  getModelCostTier,
} from '../../src/components/modelCapabilityTags';

describe('model capability tags', () => {
  it('maps the nominated best-quality models to Best Quality', () => {
    for (const id of [
      'claude-fable-5',
      'claude-opus-4-8',
      'gpt5.5pro',
      'grok-4.5',
      'gemini-3.1-pro-preview',
    ]) {
      expect(getModelCapabilityTag({ id, label: id })).toBe('bestQuality');
    }
  });

  it('maps the nominated advanced models to Advanced', () => {
    for (const id of [
      'claude-opus-4.7',
      'claude-opus-4-6-thinking',
      'claude-sonnet-5',
      'openrouter/deepseek-v4-pro',
      'gpt-5.5',
      'kimi-k2.7-code',
      'opencode-go/qwen3.7-max',
      'glm-5.2',
    ]) {
      expect(getModelCapabilityTag({ id, label: id })).toBe('advanced');
    }
  });

  it('maps other real models to Standard and leaves non-model options untagged', () => {
    expect(getModelCapabilityTag({ id: 'deepseek-v4-flash', label: 'deepseek-v4-flash' }))
      .toBe('standard');
    expect(getModelCapabilityTag({ id: 'gpt-4o-mini', label: 'gpt-4o-mini' }))
      .toBe('standard');
    expect(getModelCapabilityTag({ id: 'default', label: 'Default' }))
      .toBeNull();
    expect(getModelCapabilityTag({ id: '__custom__', label: 'Custom (type below)…' }))
      .toBeNull();
  });
});

describe('model cost tiers', () => {
  it('uses input price per 1M tokens instead of model-name heuristics', () => {
    expect(getModelCostTier({
      id: 'claude-fable-5',
      label: 'claude-fable-5',
      inputPriceUsdPerMillion: 10,
    })).toBe('overFour');
    expect(getModelCostTier({
      id: 'deepseek-v4-flash',
      label: 'deepseek-v4-flash',
      inputPriceUsdPerMillion: 0.14,
    })).toBe('upToHalf');
    expect(getModelCostTier({
      id: 'flashy-expensive-model',
      label: 'flashy-expensive-model',
      inputPriceUsdPerMillion: 5,
    })).toBe('overFour');
    expect(getModelCostTier({
      id: 'opus-without-price',
      label: 'opus-without-price',
    })).toBeNull();
  });

  it('matches the four requested input-price thresholds', () => {
    expect(getModelCostTier({
      id: 'tier-0',
      label: 'tier-0',
      inputPriceUsdPerMillion: 0.5,
    })).toBe('upToHalf');
    expect(getModelCostTier({
      id: 'tier-1',
      label: 'tier-1',
      inputPriceUsdPerMillion: 1,
    })).toBe('halfToOne');
    expect(getModelCostTier({
      id: 'tier-2',
      label: 'tier-2',
      inputPriceUsdPerMillion: 4,
    })).toBe('oneToFour');
    expect(getModelCostTier({
      id: 'tier-3',
      label: 'tier-3',
      inputPriceUsdPerMillion: 4.01,
    })).toBe('overFour');
  });
});
