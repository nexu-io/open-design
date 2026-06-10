import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { reachScore } from '../scripts/youtube-tutorials/lib.ts';

describe('reachScore', () => {
  it('maps view counts to 0-5 tiers', () => {
    assert.equal(reachScore(0), 0);
    assert.equal(reachScore(undefined), 0);
    assert.equal(reachScore(99), 0);
    assert.equal(reachScore(100), 1);
    assert.equal(reachScore(799), 1);
    assert.equal(reachScore(800), 2);
    assert.equal(reachScore(2999), 2);
    assert.equal(reachScore(3000), 3);
    assert.equal(reachScore(9999), 3);
    assert.equal(reachScore(10000), 4);
    assert.equal(reachScore(49999), 4);
    assert.equal(reachScore(50000), 5);
    assert.equal(reachScore(1_000_000), 5);
  });

  it('is monotonic non-decreasing in views', () => {
    const samples = [0, 100, 800, 3000, 10000, 50000, 200000];
    for (let i = 1; i < samples.length; i++) {
      assert.ok(reachScore(samples[i]) >= reachScore(samples[i - 1]));
    }
  });
});
