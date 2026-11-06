import { describe, expect, it, vi } from 'vitest';
import { observeAnalytics } from '../../src/analytics/observe';

describe('passive analytics boundary', () => {
  it.each(['disabled', 'enabled', 'throws', 'pending'] as const)('keeps the caller result for %s', mode => {
    const emit = vi.fn(() => {
      if (mode === 'throws') throw new Error('measurement unavailable');
      if (mode === 'pending') return new Promise<void>(() => {});
    });
    const result = { status: 'queued', commentIds: ['A'] };
    const business = vi.fn(() => result);
    function action() {
      observeAnalytics(() => { if (mode !== 'disabled') emit(); });
      return business();
    }
    expect(action()).toBe(result);
    expect(business).toHaveBeenCalledOnce();
    expect(emit).toHaveBeenCalledTimes(mode === 'disabled' ? 0 : 1);
  });
  it('contains payload construction errors too', () => {
    const track = vi.fn();
    expect(() => observeAnalytics(() => {
      const value = { get id(): string { throw new Error('payload unavailable'); } };
      track({ id: value.id });
    })).not.toThrow();
    expect(track).not.toHaveBeenCalled();
  });
});
