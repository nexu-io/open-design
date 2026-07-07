import { describe, expect, it } from 'vitest';

import { getModelCostTier } from '../../src/components/modelCapabilityTags';

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
