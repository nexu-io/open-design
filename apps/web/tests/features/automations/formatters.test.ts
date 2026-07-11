import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  describeRoutineSchedule,
  describeRoutineScheduleParts,
  detectLocalTimezone,
  formatAutomationTimestamp,
  formatRunDuration,
  listSupportedTimezones,
  tzCityLabel,
  weekdayLongLabel,
  weekdayShortLabel,
} from '../../../src/features/automations/formatters';

const t = ((key: string, vars?: Record<string, string | number>) =>
  vars ? `${key}:${JSON.stringify(vars)}` : key) as Parameters<typeof weekdayShortLabel>[1];

describe('formatters: weekday labels', () => {
  it('interpolates the weekday index into the i18n key', () => {
    expect(weekdayShortLabel(0, t)).toBe('routines.weekday.short.0');
    expect(weekdayLongLabel(6, t)).toBe('routines.weekday.long.6');
  });
});

describe('formatters: timezone helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('detectLocalTimezone returns the resolved IANA zone', () => {
    expect(typeof detectLocalTimezone()).toBe('string');
    expect(detectLocalTimezone().length).toBeGreaterThan(0);
  });

  it('detectLocalTimezone falls back to UTC when Intl throws', () => {
    const spy = vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
      throw new Error('boom');
    });
    expect(detectLocalTimezone()).toBe('UTC');
    spy.mockRestore();
  });

  it('detectLocalTimezone falls back to UTC when resolvedOptions has no timeZone', () => {
    const spy = vi.spyOn(Intl, 'DateTimeFormat').mockReturnValue({
      resolvedOptions: () => ({ timeZone: '' }),
    } as unknown as Intl.DateTimeFormat);
    expect(detectLocalTimezone()).toBe('UTC');
    spy.mockRestore();
  });

  it('listSupportedTimezones prepends UTC to the supported list when missing', () => {
    const list = listSupportedTimezones();
    expect(list).toContain('UTC');
    expect(list.length).toBeGreaterThan(1);
  });

  it('listSupportedTimezones does not duplicate UTC when the platform list already includes it', () => {
    const spy = vi.spyOn(Intl, 'supportedValuesOf').mockReturnValue(['UTC', 'America/New_York']);
    expect(listSupportedTimezones()).toEqual(['UTC', 'America/New_York']);
    spy.mockRestore();
  });

  it('listSupportedTimezones falls back to the fixed list when supportedValuesOf is unavailable', () => {
    const original = (Intl as { supportedValuesOf?: unknown }).supportedValuesOf;
    delete (Intl as { supportedValuesOf?: unknown }).supportedValuesOf;
    expect(listSupportedTimezones()).toContain('UTC');
    expect(listSupportedTimezones().length).toBeGreaterThan(0);
    (Intl as { supportedValuesOf?: unknown }).supportedValuesOf = original;
  });

  it('listSupportedTimezones falls back when supportedValuesOf throws', () => {
    const spy = vi
      .spyOn(Intl, 'supportedValuesOf')
      .mockImplementation(() => {
        throw new Error('boom');
      });
    expect(listSupportedTimezones()).toContain('UTC');
    spy.mockRestore();
  });

  it('listSupportedTimezones falls back when supportedValuesOf returns an empty list', () => {
    const spy = vi.spyOn(Intl, 'supportedValuesOf').mockReturnValue([]);
    expect(listSupportedTimezones()).toContain('UTC');
    spy.mockRestore();
  });

  it('tzCityLabel formats UTC and city-style zone names', () => {
    expect(tzCityLabel('UTC')).toBe('UTC');
    expect(tzCityLabel('America/New_York')).toBe('New York');
    expect(tzCityLabel('Etc')).toBe('Etc');
    expect(tzCityLabel('')).toBe('');
  });
});

describe('formatters: schedule descriptions', () => {
  it('describeRoutineScheduleParts covers hourly, daily, weekdays, and weekly', () => {
    expect(describeRoutineScheduleParts({ kind: 'hourly', minute: 5 }, t)).toEqual({
      kind: 'hourly',
      kindLabel: 'routines.kind.hourly',
      minute: '05',
    });
    expect(describeRoutineScheduleParts({ kind: 'daily', time: '09:00', timezone: 'UTC' }, t).kind).toBe('daily');
    expect(describeRoutineScheduleParts({ kind: 'weekdays', time: '09:00', timezone: 'UTC' }, t).kind).toBe('weekdays');
    const weekly = describeRoutineScheduleParts({ kind: 'weekly', weekday: 2, time: '09:00', timezone: 'UTC' }, t);
    expect(weekly).toMatchObject({ kind: 'weekly', dayLabel: 'routines.weekday.long.2' });
  });

  it('describeRoutineScheduleParts appends the GMT offset when nextRunAt is known', () => {
    const parts = describeRoutineScheduleParts(
      { kind: 'daily', time: '09:00', timezone: 'America/New_York' },
      t,
      Date.UTC(2026, 0, 1),
    );
    expect(parts.kind).toBe('daily');
    if (parts.kind === 'daily' || parts.kind === 'weekdays') {
      expect(parts.tz).toMatch(/New York \(GMT/);
    }
  });

  it('falls back to a bare "GMT" label when the platform omits a timeZoneName part', () => {
    // `mockReturnValue` throws when the spied function is invoked with `new`
    // (gmtLabel calls `new Intl.DateTimeFormat(...)`) — a constructor-style
    // `mockImplementation` is required instead.
    const formatToParts = vi.fn(() => [{ type: 'literal', value: 'x' }]);
    class FakeDateTimeFormat {
      formatToParts = formatToParts;
    }
    const spy = vi
      .spyOn(Intl, 'DateTimeFormat')
      .mockImplementation(FakeDateTimeFormat as unknown as typeof Intl.DateTimeFormat);
    const parts = describeRoutineScheduleParts(
      { kind: 'daily', time: '09:00', timezone: 'America/New_York' },
      t,
      Date.UTC(2026, 0, 1),
    );
    // Assert the fake constructor was actually reached (not the outer catch,
    // which would produce an indistinguishable "(GMT)" string on its own).
    expect(formatToParts).toHaveBeenCalled();
    if (parts.kind === 'daily' || parts.kind === 'weekdays') {
      expect(parts.tz).toBe('New York (GMT)');
    }
    spy.mockRestore();
  });

  it('falls back to a bare "GMT" label when Intl.DateTimeFormat throws', () => {
    const spy = vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
      throw new Error('boom');
    });
    const parts = describeRoutineScheduleParts(
      { kind: 'daily', time: '09:00', timezone: 'America/New_York' },
      t,
      Date.UTC(2026, 0, 1),
    );
    if (parts.kind === 'daily' || parts.kind === 'weekdays') {
      expect(parts.tz).toContain('(GMT)');
    }
    spy.mockRestore();
  });

  it('describeRoutineScheduleParts leaves an unparsable time string unchanged', () => {
    const parts = describeRoutineScheduleParts({ kind: 'daily', time: 'not-a-time', timezone: 'UTC' }, t);
    if (parts.kind === 'daily') {
      expect(parts.time).toBe('not-a-time');
    }
  });

  it('describeRoutineSchedule covers hourly, daily, weekdays, and weekly', () => {
    expect(describeRoutineSchedule({ kind: 'hourly', minute: 5 }, t)).toContain('routines.describe.hourly');
    expect(describeRoutineSchedule({ kind: 'daily', time: '09:00', timezone: 'UTC' }, t)).toContain(
      'routines.describe.daily',
    );
    expect(describeRoutineSchedule({ kind: 'weekdays', time: '09:00', timezone: 'UTC' }, t)).toContain(
      'routines.describe.weekdays',
    );
    expect(describeRoutineSchedule({ kind: 'weekly', weekday: 4, time: '09:00', timezone: 'UTC' }, t)).toContain(
      'routines.describe.weekly',
    );
  });

  it('describeRoutineSchedule formats noon and midnight boundaries in 12h time', () => {
    expect(describeRoutineSchedule({ kind: 'daily', time: '00:00', timezone: 'UTC' }, t)).toContain('"time":"12:00');
    expect(describeRoutineSchedule({ kind: 'daily', time: '12:00', timezone: 'UTC' }, t)).toContain('"time":"12:00');
    expect(describeRoutineSchedule({ kind: 'daily', time: '13:30', timezone: 'UTC' }, t)).toContain('"time":"1:30');
  });
});

describe('formatters: automation timestamps + run duration', () => {
  it('formatAutomationTimestamp renders an em dash for a missing timestamp', () => {
    expect(formatAutomationTimestamp(null)).toBe('—');
    expect(formatAutomationTimestamp(undefined)).toBe('—');
    expect(formatAutomationTimestamp(0)).toBe('—');
  });

  it('formatAutomationTimestamp renders a locale date/time string for a real timestamp', () => {
    const formatted = formatAutomationTimestamp(Date.UTC(2026, 0, 15, 9, 30));
    expect(formatted.length).toBeGreaterThan(0);
    expect(formatted).not.toBe('—');
  });

  it('formatRunDuration reports "in progress" while the run has no completedAt', () => {
    expect(
      formatRunDuration(
        { id: 'r', routineId: 'x', trigger: 'manual', status: 'running', projectId: 'p', conversationId: 'c', agentRunId: 'a', startedAt: 0, completedAt: null, summary: null, error: null, errorCode: null },
        t,
      ),
    ).toBe('automations.runInProgress');
  });

  it('formatRunDuration formats sub-minute, whole-minute, and minute+second durations', () => {
    const base = { id: 'r', routineId: 'x', trigger: 'manual' as const, status: 'succeeded' as const, projectId: 'p', conversationId: 'c', agentRunId: 'a', summary: null, error: null, errorCode: null };
    expect(formatRunDuration({ ...base, startedAt: 0, completedAt: 30_000 }, t)).toBe('30s');
    expect(formatRunDuration({ ...base, startedAt: 0, completedAt: 120_000 }, t)).toBe('2m');
    expect(formatRunDuration({ ...base, startedAt: 0, completedAt: 125_000 }, t)).toBe('2m 5s');
  });

  it('formatRunDuration floors to at least 1 second for a sub-second run', () => {
    const base = { id: 'r', routineId: 'x', trigger: 'manual' as const, status: 'succeeded' as const, projectId: 'p', conversationId: 'c', agentRunId: 'a', summary: null, error: null, errorCode: null };
    expect(formatRunDuration({ ...base, startedAt: 0, completedAt: 200 }, t)).toBe('1s');
  });
});
