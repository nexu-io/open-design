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

  it.each([['team_plus', 'plus'], ['team-pro', 'pro'], ['team_max_yearly', 'max']] as const)(
    'reads the team seat tier %s for display only', (raw, expected) => {
      expect(planUnlimitedTier(raw)).toBe(expected);
    },
  );

  it.each([null, undefined, '', '   ', 'free', 'team_basic', 'team'])(
    'answers null for %s, which carries no Coding Plan entitlement',
    (raw) => {
      expect(planUnlimitedTier(raw)).toBeNull();
    },
  );
});
