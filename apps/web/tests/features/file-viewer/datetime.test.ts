import { describe, expect, it } from 'vitest';

import {
  formatAbsoluteDateTime,
  formatRelativeTime,
  formatDurationMs,
  formatVersionDateTime,
  formatCommentTime,
} from '../../../src/features/file-viewer/formatters';
import type { Locale } from '../../../src/i18n/types';
import type { TranslateFn } from '../../../src/features/file-viewer/types';

// A translate stub that echoes the key + any vars so tests can assert which
// dict entry a formatter chose without depending on the real locale bundle.
const t: TranslateFn = (key, vars) =>
  vars ? `${key}:${JSON.stringify(vars)}` : String(key);

describe('formatAbsoluteDateTime', () => {
  it('returns null for missing input', () => {
    expect(formatAbsoluteDateTime(undefined)).toBeNull();
    expect(formatAbsoluteDateTime(null as unknown as undefined)).toBeNull();
  });

  it('returns null for an unparseable date', () => {
    expect(formatAbsoluteDateTime('not a date')).toBeNull();
  });

  it('formats a numeric epoch and an ISO string to a non-empty string', () => {
    expect(typeof formatAbsoluteDateTime(1_710_000_000_000)).toBe('string');
    expect(typeof formatAbsoluteDateTime('2024-03-09T12:00:00Z')).toBe('string');
  });
});

describe('formatRelativeTime', () => {
  it('returns null for missing or unparseable input', () => {
    expect(formatRelativeTime(undefined)).toBeNull();
    expect(formatRelativeTime('nope')).toBeNull();
  });

  it('says "just now" within 5s, translated when a t is supplied', () => {
    expect(formatRelativeTime(1_000, 1_000)).toBe('just now');
    expect(formatRelativeTime(1_000, 2_000, 'en', t)).toBe('liveArtifact.refresh.justNow');
  });

  it('buckets past deltas into seconds/minutes/hours/days/months/years', () => {
    expect(formatRelativeTime(0, 30_000)).toContain('30');
    expect(formatRelativeTime(0, 5 * 60_000)).toContain('5');
    expect(formatRelativeTime(0, 3 * 3_600_000)).toContain('3');
    expect(formatRelativeTime(0, 4 * 86_400_000)).toContain('4');
    expect(formatRelativeTime(0, 3 * 30 * 86_400_000)).toContain('3');
    expect(formatRelativeTime(0, 2 * 365 * 86_400_000)).toContain('2');
  });

  it('handles a future delta (positive value)', () => {
    const out = formatRelativeTime(60_000, 0);
    expect(out).toBeTruthy();
  });

  it('reads a millisecond value from an ISO string', () => {
    const out = formatRelativeTime('2024-01-01T00:00:00Z', Date.parse('2024-01-01T00:01:00Z'));
    expect(out).toContain('1');
  });

  it('falls back to the en formatter when the locale is invalid', () => {
    const out = formatRelativeTime(0, 30_000, 'not-a-locale!!' as Locale);
    expect(out).toContain('30');
  });
});

describe('formatDurationMs', () => {
  it('returns null for missing or NaN input', () => {
    expect(formatDurationMs(undefined)).toBeNull();
    expect(formatDurationMs(Number.NaN)).toBeNull();
  });

  it('formats sub-second durations in ms (clamped to >= 0)', () => {
    expect(formatDurationMs(250)).toBe('250ms');
    expect(formatDurationMs(-5)).toBe('0ms');
  });

  it('formats seconds with 1 decimal under 10s and 0 decimals otherwise', () => {
    expect(formatDurationMs(1_500)).toBe('1.5s');
    expect(formatDurationMs(42_000)).toBe('42s');
  });

  it('formats minutes, omitting the seconds when they round to zero', () => {
    expect(formatDurationMs(120_000)).toBe('2m');
    expect(formatDurationMs(150_000)).toBe('2m 30s');
  });
});

describe('formatVersionDateTime', () => {
  it('formats a numeric value under the given locale', () => {
    expect(typeof formatVersionDateTime(1_710_000_000_000, 'en')).toBe('string');
  });

  it('falls back to now for an undefined value', () => {
    expect(typeof formatVersionDateTime(undefined, 'en')).toBe('string');
  });

  it('falls back to a default locale string when the locale is invalid', () => {
    expect(typeof formatVersionDateTime(1_710_000_000_000, 'bad!!' as Locale)).toBe('string');
  });
});

describe('formatCommentTime', () => {
  it('buckets the age relative to now via the translate function', () => {
    const now = Date.now();
    expect(formatCommentTime(now - 30_000, t)).toBe('common.justNow');
    expect(formatCommentTime(now - 5 * 60_000, t)).toBe('common.minutesAgo:{"n":5}');
    expect(formatCommentTime(now - 3 * 3_600_000, t)).toBe('common.hoursAgo:{"n":3}');
    expect(formatCommentTime(now - 3 * 86_400_000, t)).toBe('common.daysAgo:{"n":3}');
    expect(formatCommentTime(now - 3 * 7 * 86_400_000, t)).toBe('common.weeksAgo:{"n":3}');
  });

  it('renders an absolute date for ages beyond ~5 weeks', () => {
    expect(typeof formatCommentTime(0, t)).toBe('string');
  });
});
