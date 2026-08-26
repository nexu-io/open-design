import { describe, expect, it } from 'vitest';

import { codingPlanModelDecision } from '../../src/runtime/amr-unlimited-models';

describe('codingPlanModelDecision', () => {
  it('follows the model list returned by Vela without a local allowlist', () => {
    expect(codingPlanModelDecision(['new-coding-plan-model'], 'new-coding-plan-model')).toBe(true);
    expect(codingPlanModelDecision(['new-coding-plan-model'], 'deepseek-v4-pro')).toBe(false);
  });

  it('matches provider-prefixed model ids by their public slug', () => {
    expect(codingPlanModelDecision(['DeepSeek-V4-Pro'], 'deepseek/deepseek-v4-pro')).toBe(true);
  });

  it('distinguishes an unavailable list from an authoritative empty list', () => {
    expect(codingPlanModelDecision(null, 'deepseek-v4-pro')).toBeNull();
    expect(codingPlanModelDecision(undefined, 'deepseek-v4-pro')).toBeNull();
    expect(codingPlanModelDecision([], 'deepseek-v4-pro')).toBe(false);
  });

  it('rejects an empty selected model even if the list is unavailable', () => {
    expect(codingPlanModelDecision(null, '')).toBe(false);
  });
});
