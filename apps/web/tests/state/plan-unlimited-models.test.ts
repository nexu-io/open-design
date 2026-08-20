// The 「无限使用」 badge asks exactly one question — is this model unlimited on
// the plan the user is actually on — and the answer has to match what the
// public Pricing page promises per tier. Before this table existed the badge
// was hard-wired to the DeepSeek V4 campaign, so a Pro subscriber saw nothing
// on Kimi K2.7 Code even though their plan covers it.

import { describe, expect, it } from 'vitest';

import {
  PLAN_UNLIMITED_MODEL_IDS,
  isUnlimitedModelForPlanTier,
  planUnlimitedTier,
  unlimitedModelIdsForPlanTier,
} from '../../src/state/plan-unlimited-models';

describe('planUnlimitedTier', () => {
  it.each([
    ['go', 'go'],
    ['Plus', 'plus'],
    ['pro', 'pro'],
    ['MAX', 'max'],
  ] as const)('reads the personal tier %s', (raw, expected) => {
    expect(planUnlimitedTier(raw)).toBe(expected);
  });

  it.each([
    ['team_plus', 'plus'],
    ['team-pro', 'pro'],
    ['team_max_yearly', 'max'],
  ] as const)('reads the tier segment out of the team id %s', (raw, expected) => {
    expect(planUnlimitedTier(raw)).toBe(expected);
  });

  it.each([null, undefined, '', '   ', 'free', 'team_basic'])(
    'answers null for %s, which carries no unlimited set',
    (raw) => {
      expect(planUnlimitedTier(raw)).toBeNull();
      expect(unlimitedModelIdsForPlanTier(raw)).toEqual([]);
    },
  );
});

describe('PLAN_UNLIMITED_MODEL_IDS', () => {
  it('matches the model counts the Pricing page advertises per tier', () => {
    expect(PLAN_UNLIMITED_MODEL_IDS.go).toHaveLength(3);
    expect(PLAN_UNLIMITED_MODEL_IDS.plus).toHaveLength(4);
    expect(PLAN_UNLIMITED_MODEL_IDS.pro).toHaveLength(5);
    expect(PLAN_UNLIMITED_MODEL_IDS.max).toHaveLength(8);
  });

  it('keeps GLM-5.2 unlimited on Pro and MiniMax M2.7 metered', () => {
    expect(PLAN_UNLIMITED_MODEL_IDS.pro).toContain('glm-5.2');
    expect(PLAN_UNLIMITED_MODEL_IDS.pro).not.toContain('minimax-m2.7');
  });

  it('grows monotonically — every lower tier is a subset of the next', () => {
    for (const [lower, higher] of [
      ['go', 'plus'],
      ['plus', 'pro'],
      ['pro', 'max'],
    ] as const) {
      for (const modelId of PLAN_UNLIMITED_MODEL_IDS[lower]) {
        expect(PLAN_UNLIMITED_MODEL_IDS[higher]).toContain(modelId);
      }
    }
  });
});

describe('isUnlimitedModelForPlanTier', () => {
  it('badges a Pro subscriber on every model their plan covers', () => {
    for (const modelId of PLAN_UNLIMITED_MODEL_IDS.pro) {
      expect(isUnlimitedModelForPlanTier(modelId, 'pro')).toBe(true);
    }
  });

  it('leaves a metered model unbadged on that same plan', () => {
    expect(isUnlimitedModelForPlanTier('minimax-m2.7', 'pro')).toBe(false);
    expect(isUnlimitedModelForPlanTier('kimi-k2.6', 'pro')).toBe(false);
    expect(isUnlimitedModelForPlanTier('glm-5.1', 'pro')).toBe(false);
  });

  it('badges Kimi K2.7 Code on Plus and above but not on Go', () => {
    expect(isUnlimitedModelForPlanTier('kimi-k2.7-code', 'go')).toBe(false);
    expect(isUnlimitedModelForPlanTier('kimi-k2.7-code', 'plus')).toBe(true);
    expect(isUnlimitedModelForPlanTier('kimi-k2.7-code', 'team_pro')).toBe(true);
  });

  it('fails closed while the plan is unknown or free', () => {
    expect(isUnlimitedModelForPlanTier('deepseek-v4-pro', null)).toBe(false);
    expect(isUnlimitedModelForPlanTier('deepseek-v4-pro', '')).toBe(false);
    expect(isUnlimitedModelForPlanTier('deepseek-v4-pro', 'free')).toBe(false);
  });

  it('compares the model slug, not the provider prefix or casing', () => {
    expect(isUnlimitedModelForPlanTier('DeepSeek-V4-Pro', 'go')).toBe(true);
    expect(isUnlimitedModelForPlanTier('deepseek/deepseek-v4-pro', 'go')).toBe(true);
    expect(isUnlimitedModelForPlanTier('  glm-5.2  ', 'plus')).toBe(true);
  });

  it('says nothing about a model the plan table does not list', () => {
    expect(isUnlimitedModelForPlanTier('claude-opus-5', 'max')).toBe(false);
    expect(isUnlimitedModelForPlanTier('', 'max')).toBe(false);
  });
});
