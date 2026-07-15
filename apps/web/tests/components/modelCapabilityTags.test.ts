import { describe, expect, it } from 'vitest';

import {
  getModelCapabilityTag,
  getModelCostTier,
} from '../../src/components/modelCapabilityTags';

describe('model capability tags', () => {
  it('maps provider metadata capability to picker tags', () => {
    expect(getModelCapabilityTag({
      id: 'provider/best',
      metadata: { capability: 'best_quality' },
    })).toBe('bestQuality');
    expect(getModelCapabilityTag({
      id: 'provider/advanced',
      metadata: { capability: 'advanced' },
    })).toBe('advanced');
    expect(getModelCapabilityTag({
      id: 'provider/standard',
      metadata: { capability: 'standard' },
    })).toBe('standard');
  });

  it('does not infer capability from model names and leaves non-model options untagged', () => {
    expect(getModelCapabilityTag({ id: 'deepseek-v4-flash' })).toBeNull();
    expect(getModelCapabilityTag({ id: 'claude-opus-4.8' })).toBeNull();
    expect(getModelCapabilityTag({
      id: 'default',
      metadata: { capability: 'standard' },
    }))
      .toBeNull();
    expect(getModelCapabilityTag({
      id: '__custom__',
      metadata: { capability: 'advanced' },
    }))
      .toBeNull();
  });
});

describe('model cost tiers', () => {
  it('uses provider metadata cost instead of model-name or price heuristics', () => {
    expect(getModelCostTier({
      id: 'claude-fable-5',
      metadata: { cost: 'very_high' },
    })).toBe('very_high');
    expect(getModelCostTier({
      id: 'deepseek-v4-flash',
      metadata: { cost: 'low' },
    })).toBe('low');
    expect(getModelCostTier({ id: 'flashy-expensive-model' })).toBeNull();
    expect(getModelCostTier({
      id: 'opus-without-price',
    })).toBeNull();
  });

  it('maps all four provider metadata cost values', () => {
    expect(getModelCostTier({
      id: 'tier-0',
      metadata: { cost: 'low' },
    })).toBe('low');
    expect(getModelCostTier({
      id: 'tier-1',
      metadata: { cost: 'medium' },
    })).toBe('medium');
    expect(getModelCostTier({
      id: 'tier-2',
      metadata: { cost: 'high' },
    })).toBe('high');
    expect(getModelCostTier({
      id: 'tier-3',
      metadata: { cost: 'very_high' },
    })).toBe('very_high');
  });
});
