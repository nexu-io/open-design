import { describe, expect, it } from 'vitest';

import { sessionModeToTracking } from '../src/analytics/events.js';

describe('sessionModeToTracking', () => {
  it('maps the wire `chat` mode to the product term `ask`', () => {
    expect(sessionModeToTracking('chat')).toBe('ask');
  });

  it('keeps `design` as `design`', () => {
    expect(sessionModeToTracking('design')).toBe('design');
  });

  it('buckets unknown / null / undefined into the lighter `ask` default', () => {
    expect(sessionModeToTracking(null)).toBe('ask');
    expect(sessionModeToTracking(undefined)).toBe('ask');
    expect(sessionModeToTracking('')).toBe('ask');
    expect(sessionModeToTracking('bogus')).toBe('ask');
  });
});
