// The 「无限使用」 badge asks exactly one question — is this model unlimited on
// the plan the user is actually on — and the answer has to match what the
// public Pricing page promises per tier. Before this rule existed the badge
// was hard-wired to the DeepSeek V4 campaign, so a Pro subscriber saw nothing
// on Kimi K2.7 Code even though their plan covers it.
//
// The per-tier SETS themselves are covered by `amr-unlimited-models.test.ts`
// (the balance-preflight view of the same table). What is pinned here is the
// tier resolution the badge adds on top: team-namespaced ids, unknown tiers
// failing closed, and model-id normalization.

import { describe, expect, it } from 'vitest';

import {
  isUnlimitedModelForPlanTier,
  planUnlimitedTier,
} from '../../src/runtime/amr-unlimited-models';

describe('planUnlimitedTier', () => {
  it.each([
    ['go', 'go'],
    ['Plus', 'plus'],
    ['pro', 'pro'],
    ['MAX', 'max'],
  ] as const)('reads the personal tier %s', (raw, expected) => {
    expect(planUnlimitedTier(raw)).toBe(expected);
  });

  it.each(['team_plus', 'team-pro', 'team_max_yearly', 'team_basic', 'team'])(
    'refuses to read a personal tier out of the team id %s',
    (raw) => {
      // Being paid is not the question — whether the plan funds usage without
      // touching the wallet is, and for Team it does not. vela records in-plan
      // usage through the `coding_plan` billing mode, which its schema
      // constrains to personal tiers
      // (`membership_tier_snapshot = ANY (ARRAY['go','plus','pro','max'])`),
      // so no Team workspace ever gets a zero-charge call. #7187's balance
      // preflight already refuses to stand down for them; the badge must not
      // promise what the preflight then blocks.
      expect(planUnlimitedTier(raw)).toBeNull();
      expect(isUnlimitedModelForPlanTier('deepseek-v4-flash', raw)).toBe(false);
    },
  );

  it.each([null, undefined, '', '   ', 'free'])(
    'answers null for %s, which carries no unlimited set',
    (raw) => {
      expect(planUnlimitedTier(raw)).toBeNull();
      expect(isUnlimitedModelForPlanTier('deepseek-v4-flash', raw)).toBe(false);
    },
  );
});

const POPULAR_MODEL_IDS = [
  'deepseek-v4-flash-vision-exp',
  'deepseek-v4-flash',
  'deepseek-v4-pro',
  'glm-5.2',
  'kimi-k2.7-code',
  'mimo-v2.5-pro',
  'minimax-m2.7',
  'kimi-k2.6',
  'glm-5.1',
] as const;

const unlimitedOn = (tier: string) =>
  POPULAR_MODEL_IDS.filter((modelId) => isUnlimitedModelForPlanTier(modelId, tier));

describe('per-tier unlimited sets, as the badge sees them', () => {
  it('matches the model counts the Pricing page advertises per tier', () => {
    expect(unlimitedOn('go')).toHaveLength(4);
    expect(unlimitedOn('plus')).toHaveLength(5);
    expect(unlimitedOn('pro')).toHaveLength(6);
    expect(unlimitedOn('max')).toHaveLength(9);
  });

  it('keeps GLM-5.2 unlimited on Pro and MiniMax M2.7 metered', () => {
    expect(unlimitedOn('pro')).toContain('glm-5.2');
    expect(unlimitedOn('pro')).not.toContain('minimax-m2.7');
  });

  it('grows monotonically — every lower tier is a subset of the next', () => {
    for (const [lower, higher] of [
      ['go', 'plus'],
      ['plus', 'pro'],
      ['pro', 'max'],
    ] as const) {
      for (const modelId of unlimitedOn(lower)) {
        expect(unlimitedOn(higher)).toContain(modelId);
      }
    }
  });

  it('marks nothing on a team-namespaced id', () => {
    expect(unlimitedOn('team_pro')).toEqual([]);
    expect(unlimitedOn('team_max_yearly')).toEqual([]);
  });
});

describe('isUnlimitedModelForPlanTier', () => {
  it('badges DeepSeek V4 Flash Vision Exp on every personal tier only', () => {
    for (const tier of ['go', 'plus', 'pro', 'max']) {
      expect(isUnlimitedModelForPlanTier('deepseek-v4-flash-vision-exp', tier)).toBe(true);
    }
    expect(isUnlimitedModelForPlanTier('deepseek-v4-flash-vision-exp', 'free')).toBe(false);
    expect(isUnlimitedModelForPlanTier('deepseek-v4-flash-vision-exp', 'team_pro')).toBe(false);
  });

  it('badges a Pro subscriber on every model their plan covers', () => {
    for (const modelId of unlimitedOn('pro')) {
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
    expect(isUnlimitedModelForPlanTier('kimi-k2.7-code', 'team_pro')).toBe(false);
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
