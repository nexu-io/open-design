import { describe, expect, it } from 'vitest';

import { planUnlimitedTier } from '../../src/runtime/amr-unlimited-models';

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
      expect(planUnlimitedTier(raw)).toBeNull();
    },
  );

  it.each([null, undefined, '', '   ', 'free'])(
    'answers null for %s, which carries no Coding Plan entitlement',
    (raw) => {
      expect(planUnlimitedTier(raw)).toBeNull();
    },
  );
});
