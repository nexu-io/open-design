import { describe, expect, it } from 'vitest';

import {
  isMembershipConcurrencyLimitFailure,
  readMembershipConcurrencyResetAt,
} from '../../src/runtime/membership-concurrency-limit.js';

describe('membership concurrency limit', () => {
  const productionShape =
    '[code=tier_limit_exceeded] membership concurrency limit exceeded: 3/2 resets 2026-08-25T10:42:00Z';

  it('recognizes the policy limit and preserves its reset instant', () => {
    expect(isMembershipConcurrencyLimitFailure(productionShape)).toBe(true);
    expect(readMembershipConcurrencyResetAt(productionShape)).toBe(
      '2026-08-25T10:42:00Z',
    );
  });

  it('does not claim unrelated tier or concurrency failures', () => {
    expect(isMembershipConcurrencyLimitFailure('[code=tier_limit_exceeded] tier upgrade required')).toBe(false);
    expect(isMembershipConcurrencyLimitFailure('membership concurrency limit exceeded')).toBe(false);
  });

  it('returns no reset instant when the gateway omits one', () => {
    expect(
      readMembershipConcurrencyResetAt(
        '[code=tier_limit_exceeded] membership concurrency limit exceeded: 3/2',
      ),
    ).toBeNull();
  });
});
