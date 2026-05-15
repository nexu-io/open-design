import { describe, expect, it } from 'vitest';

import {
  nextRunAtForSchedule,
  validateSchedule,
  validateTarget,
} from '../src/routines.js';

function partsIn(timezone: string, at: Date): Record<string, string> {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const out: Record<string, string> = {};
  for (const part of dtf.formatToParts(at)) {
    if (part.type !== 'literal') out[part.type] = part.value;
  }
  if (out.hour === '24') out.hour = '00';
  return out;
}

describe('nextRunAtForSchedule DST handling', () => {
  it('does not fire before the requested wall time on a spring-forward gap day', () => {
    // 2026-03-08 in America/New_York: clocks jump 02:00 EST → 03:00 EDT, so
    // a daily routine scheduled at 02:30 has no valid wall clock that day.
    // Prior to the fix, tzWallToUtc returned 06:30Z which renders back as
    // 01:30 EST — an hour before the requested time. The fixed scheduler
    // must instead advance to a valid post-gap instant on the same day.
    const now = new Date('2026-03-08T05:00:00Z');
    const next = nextRunAtForSchedule(
      { kind: 'daily', time: '02:30', timezone: 'America/New_York' },
      now,
    );
    expect(next).not.toBeNull();
    if (!next) return;

    const parts = partsIn('America/New_York', next);
    expect(parts.year).toBe('2026');
    expect(parts.month).toBe('03');
    expect(parts.day).toBe('08');

    const wallMinutes = Number(parts.hour) * 60 + Number(parts.minute);
    expect(wallMinutes).toBeGreaterThanOrEqual(2 * 60 + 30);
  });

  it('still fires the second occurrence when the wall time itself is in the repeated hour', () => {
    // 2026-11-01 in America/New_York: 01:30 happens twice — first at
    // 05:30Z (EDT) and again at 06:30Z (EST) after clocks fall back.
    // If the daemon checks at 05:45Z (between the two occurrences),
    // a daily routine at 01:30 must still fire today at 06:30Z, not
    // skip to 2026-11-02 because the EDT instance is already past.
    const now = new Date('2026-11-01T05:45:00Z');
    const next = nextRunAtForSchedule(
      { kind: 'daily', time: '01:30', timezone: 'America/New_York' },
      now,
    );
    expect(next).not.toBeNull();
    if (!next) return;

    expect(next.getTime()).toBe(Date.UTC(2026, 10, 1, 6, 30));
    const parts = partsIn('America/New_York', next);
    expect(parts.year).toBe('2026');
    expect(parts.month).toBe('11');
    expect(parts.day).toBe('01');
    expect(parts.hour).toBe('01');
    expect(parts.minute).toBe('30');
  });

  it('returns the first occurrence in the repeated hour when now is before either instance', () => {
    // Before 05:30Z on the fall-back day, the next 01:30 NY is the
    // first (EDT) occurrence at 05:30Z.
    const now = new Date('2026-11-01T05:00:00Z');
    const next = nextRunAtForSchedule(
      { kind: 'daily', time: '01:30', timezone: 'America/New_York' },
      now,
    );
    expect(next).not.toBeNull();
    if (!next) return;
    expect(next.getTime()).toBe(Date.UTC(2026, 10, 1, 5, 30));
  });

  it('selects the post-fall-back instance on a fall-back day with ambiguous wall times', () => {
    // 2026-11-01 in America/New_York: 01:30 happens twice (EDT and EST).
    // For a daily routine at 02:30, the only valid instance is 02:30 EST,
    // which renders to 07:30Z. Make sure we pick that one regardless of
    // candidate ordering inside tzWallToUtc.
    const now = new Date('2026-11-01T05:00:00Z');
    const next = nextRunAtForSchedule(
      { kind: 'daily', time: '02:30', timezone: 'America/New_York' },
      now,
    );
    expect(next).not.toBeNull();
    if (!next) return;

    const parts = partsIn('America/New_York', next);
    expect(parts.year).toBe('2026');
    expect(parts.month).toBe('11');
    expect(parts.day).toBe('01');
    expect(parts.hour).toBe('02');
    expect(parts.minute).toBe('30');
  });

  it('returns the requested wall time on non-transition days', () => {
    const now = new Date('2026-05-01T00:00:00Z');
    const next = nextRunAtForSchedule(
      { kind: 'daily', time: '02:30', timezone: 'America/New_York' },
      now,
    );
    expect(next).not.toBeNull();
    if (!next) return;

    const parts = partsIn('America/New_York', next);
    expect(parts.hour).toBe('02');
    expect(parts.minute).toBe('30');
  });

  it('returns the next hourly slot strictly after now', () => {
    const now = new Date('2026-05-13T10:45:30Z');
    const next = nextRunAtForSchedule({ kind: 'hourly', minute: 15 }, now);
    expect(next).not.toBeNull();
    if (!next) return;
    expect(next.toISOString()).toBe('2026-05-13T11:15:00.000Z');
  });

  it('returns the next weekday occurrence for weekday schedules', () => {
    const now = new Date('2026-05-16T00:00:00Z'); // Saturday
    const next = nextRunAtForSchedule(
      { kind: 'weekdays', time: '09:00', timezone: 'UTC' },
      now,
    );
    expect(next).not.toBeNull();
    if (!next) return;

    const parts = partsIn('UTC', next);
    expect(parts.year).toBe('2026');
    expect(parts.month).toBe('05');
    expect(parts.day).toBe('18');
    expect(parts.hour).toBe('09');
    expect(parts.minute).toBe('00');
  });

  it('returns the next requested weekday for weekly schedules', () => {
    const now = new Date('2026-05-13T10:00:00Z'); // Wednesday
    const next = nextRunAtForSchedule(
      { kind: 'weekly', weekday: 5, time: '08:30', timezone: 'UTC' },
      now,
    );
    expect(next).not.toBeNull();
    if (!next) return;

    const parts = partsIn('UTC', next);
    expect(parts.year).toBe('2026');
    expect(parts.month).toBe('05');
    expect(parts.day).toBe('15');
    expect(parts.hour).toBe('08');
    expect(parts.minute).toBe('30');
  });
});

describe('routine validation', () => {
  it('accepts valid schedule and target shapes', () => {
    expect(() =>
      validateSchedule({ kind: 'weekly', weekday: 1, time: '09:00', timezone: 'UTC' }),
    ).not.toThrow();
    expect(() => validateTarget({ mode: 'create_each_run' })).not.toThrow();
    expect(() => validateTarget({ mode: 'reuse', projectId: 'proj-1' })).not.toThrow();
  });

  it('rejects invalid wall times and timezones', () => {
    expect(() =>
      validateSchedule({ kind: 'daily', time: '25:00', timezone: 'UTC' }),
    ).toThrow(/Invalid time/);
    expect(() =>
      validateSchedule({ kind: 'daily', time: '09:00', timezone: 'Mars\/Olympus' }),
    ).toThrow(/Invalid timezone/);
  });

  it('rejects invalid weekday and unsupported target mode', () => {
    expect(() =>
      validateSchedule({ kind: 'weekly', weekday: 9 as 0, time: '09:00', timezone: 'UTC' }),
    ).toThrow(/weekly\.weekday/);
    expect(() =>
      validateTarget({ mode: 'teleport' } as unknown as Parameters<typeof validateTarget>[0]),
    ).toThrow(/Unsupported routine target mode/);
  });

  it('rejects reuse targets without a project id', () => {
    expect(() =>
      validateTarget({ mode: 'reuse', projectId: '' }),
    ).toThrow(/projectId/);
  });
});
