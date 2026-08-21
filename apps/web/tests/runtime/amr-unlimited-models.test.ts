import { describe, expect, it } from 'vitest';
import { isUnlimitedAmrModelForPlan } from '../../src/runtime/amr-unlimited-models';

describe('AMR unlimited model entitlements', () => {
  it.each([
    ['go', 'glm-5.2', true],
    ['go', 'kimi-k2.7-code', false],
    ['plus', 'kimi-k2.7-code', true],
    ['plus', 'minimax-m2.7', false],
    ['pro', 'glm-5.2', true],
    ['pro', 'mimo-v2.5-pro', true],
    ['pro', 'minimax-m2.7', false],
    ['pro', 'kimi-k2.6', false],
    ['max', 'minimax-m2.7', true],
    ['max', 'glm-5.1', true],
  ])('maps %s / %s to unlimited=%s', (plan, modelId, unlimited) => {
    expect(isUnlimitedAmrModelForPlan(plan, modelId)).toBe(unlimited);
  });
});
