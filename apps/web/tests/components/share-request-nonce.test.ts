import { describe, expect, it } from 'vitest';
import { nextShareRequestNonce } from '../../src/components/share-request-nonce';

describe('Owner artifact-card Share request identity', () => {
  it('advances on same-millisecond reopen, even if wall time goes backwards', () => {
    const first = nextShareRequestNonce(undefined, 1_730_000_249_000);
    const reopened = nextShareRequestNonce(first, 1_730_000_249_000);
    const afterClockCorrection = nextShareRequestNonce(reopened, 1_730_000_240_000);
    expect(first).toBe(1_730_000_249_000);
    expect(reopened).toBe(first + 1);
    expect(afterClockCorrection).toBe(reopened + 1);
  });
});
