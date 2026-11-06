import { describe, expect, it } from 'vitest';
import { BackoffController } from '../../src/lib/backoff';

describe('BackoffController', () => {
  it('produces a doubling sequence capped at maxMs (jitter off)', () => {
    const backoff = new BackoffController({
      initialMs: 1000,
      maxMs: 30_000,
      factor: 2,
      jitter: false,
    });
    const delays = Array.from({ length: 8 }, () => backoff.nextDelay());
    expect(delays).toEqual([1000, 2000, 4000, 8000, 16_000, 30_000, 30_000, 30_000]);
  });

  it('honors a custom growth factor', () => {
    const backoff = new BackoffController({
      initialMs: 100,
      maxMs: 10_000,
      factor: 3,
      jitter: false,
    });
    expect([backoff.nextDelay(), backoff.nextDelay(), backoff.nextDelay()]).toEqual([
      100, 300, 900,
    ]);
  });

  it('counts attempts and resets both depth and attempt count on reset()', () => {
    const backoff = new BackoffController({ initialMs: 1000, jitter: false });
    expect(backoff.attempt).toBe(0);
    backoff.nextDelay();
    backoff.nextDelay();
    expect(backoff.attempt).toBe(2);
    // Depth advanced: the third delay would be 4000.
    expect(backoff.nextDelay()).toBe(4000);

    backoff.reset();
    expect(backoff.attempt).toBe(0);
    // Depth returned to the initial delay.
    expect(backoff.nextDelay()).toBe(1000);
  });

  it('applies jitter as a multiplier in [0.5, 1.0) over the base sequence', () => {
    // random() = 0 → multiplier 0.5 (the low edge).
    const low = new BackoffController({ initialMs: 1000, jitter: true, random: () => 0 });
    expect(low.nextDelay()).toBe(500); // 1000 * 0.5
    expect(low.nextDelay()).toBe(1000); // base advanced to 2000, * 0.5

    // random() ≈ 1 → multiplier ≈ 1.0 (the high edge, exclusive of the base).
    const high = new BackoffController({
      initialMs: 1000,
      jitter: true,
      random: () => 0.9999,
    });
    const first = high.nextDelay();
    expect(first).toBeGreaterThan(999);
    expect(first).toBeLessThan(1000);

    // random() = 0.5 → multiplier 0.75.
    const mid = new BackoffController({ initialMs: 1000, jitter: true, random: () => 0.5 });
    expect(mid.nextDelay()).toBe(750);
  });

  it('keeps every jittered delay within [0.5, 1.0) of its base across random draws', () => {
    let seed = 0;
    // A deterministic pseudo-random walk over [0, 1) so the assertion is stable.
    const backoff = new BackoffController({
      initialMs: 1000,
      maxMs: 8000,
      jitter: true,
      random: () => {
        seed = (seed + 0.37) % 1;
        return seed;
      },
    });
    const bases = [1000, 2000, 4000, 8000, 8000];
    for (const base of bases) {
      const delay = backoff.nextDelay();
      expect(delay).toBeGreaterThanOrEqual(base * 0.5);
      expect(delay).toBeLessThan(base);
    }
  });

  it('clamps maxMs up to initialMs when misconfigured', () => {
    const backoff = new BackoffController({ initialMs: 5000, maxMs: 1000, jitter: false });
    // maxMs cannot be below initialMs, so the sequence pins at 5000.
    expect([backoff.nextDelay(), backoff.nextDelay()]).toEqual([5000, 5000]);
  });
});
