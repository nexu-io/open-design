import { describe, expect, it, vi } from 'vitest';
import { checkRateLimit } from '../src/login-rate-limit.js';

describe('login-rate-limit', () => {
  it('allows first 5 attempts from the same IP within window', () => {
    for (let i = 0; i < 5; i++) {
      const result = checkRateLimit('99.10.10.10');
      expect(result.allowed).toBe(true);
    }
  });

  it('blocks 6th attempt from the same IP', () => {
    for (let i = 0; i < 6; i++) {
      checkRateLimit('99.20.20.20');
    }
    const result = checkRateLimit('99.20.20.20');
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it('resets after window expires', () => {
    vi.useFakeTimers();
    try {
      for (let i = 0; i < 6; i++) {
        checkRateLimit('99.30.30.30');
      }
      vi.advanceTimersByTime(61_000);
      const result = checkRateLimit('99.30.30.30');
      expect(result.allowed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('tracks IPs independently', () => {
    for (let i = 0; i < 6; i++) {
      checkRateLimit('99.40.40.40');
    }
    const result = checkRateLimit('99.40.40.41');
    expect(result.allowed).toBe(true);
  });

  it('returns zero retryAfterMs when allowed', () => {
    const result = checkRateLimit('99.50.50.50');
    expect(result.allowed).toBe(true);
    expect(result.retryAfterMs).toBe(0);
  });
});
