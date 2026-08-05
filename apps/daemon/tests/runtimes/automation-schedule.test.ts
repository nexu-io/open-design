import { describe, expect, it } from 'vitest';

import {
  describeAutomationScheduleForCli,
  parseAutomationScheduleFlag,
} from '../../src/runtimes/automation-schedule.js';

describe('automation schedule contract', () => {
  it('parses hourly, daily, and weekdays schedules', () => {
    expect(parseAutomationScheduleFlag('hourly:5')).toEqual({ kind: 'hourly', minute: 5 });
    expect(parseAutomationScheduleFlag('daily:9:07:America/New_York')).toEqual({
      kind: 'daily',
      time: '09:07',
      timezone: 'America/New_York',
    });
    expect(parseAutomationScheduleFlag('weekdays:17:30')).toEqual({
      kind: 'weekdays',
      time: '17:30',
      timezone: 'UTC',
    });
  });

  it('parses numeric and named weekly weekdays', () => {
    expect(parseAutomationScheduleFlag('weekly:0:08:00:UTC')).toEqual({
      kind: 'weekly',
      weekday: 0,
      time: '08:00',
      timezone: 'UTC',
    });
    expect(parseAutomationScheduleFlag('weekly:Thursday:08:00:Europe/London')).toEqual({
      kind: 'weekly',
      weekday: 4,
      time: '08:00',
      timezone: 'Europe/London',
    });
  });

  it('rejects missing, malformed, out-of-range, and unknown schedule input', () => {
    expect(() => parseAutomationScheduleFlag(undefined)).toThrow('--schedule is required');
    expect(() => parseAutomationScheduleFlag('hourly:60')).toThrow('0-59');
    expect(() => parseAutomationScheduleFlag('daily:24:00')).toThrow('HH:MM');
    expect(() => parseAutomationScheduleFlag('weekly:holiday:08:00')).toThrow('day must be');
    expect(() => parseAutomationScheduleFlag('monthly:08:00')).toThrow('kind must be');
  });

  it('formats canonical schedules for CLI tables', () => {
    expect(describeAutomationScheduleForCli(null)).toBe('-');
    expect(describeAutomationScheduleForCli({ kind: 'hourly', minute: 5 })).toBe('hourly:05');
    expect(describeAutomationScheduleForCli({ kind: 'weekly', weekday: 2, time: '08:00', timezone: 'UTC' })).toBe(
      'weekly:tue:08:00:UTC',
    );
  });
});
