// Pure date/time/schedule formatting for the automations slice. No React, no
// transport, no DOM — these test with zero doubles.
import type { RoutineRun, RoutineSchedule, Weekday } from '@open-design/contracts';

import type { Dict } from '../../i18n/types';
import { FALLBACK_TIMEZONES } from './constants';
import type { TranslateFn } from './types';

export function weekdayShortLabel(day: Weekday, t: TranslateFn): string {
  return t(`routines.weekday.short.${day}` as keyof Dict);
}

export function weekdayLongLabel(day: Weekday, t: TranslateFn): string {
  return t(`routines.weekday.long.${day}` as keyof Dict);
}

export function detectLocalTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function listSupportedTimezones(): string[] {
  try {
    const fn = (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
    if (typeof fn === 'function') {
      const list = fn('timeZone');
      if (Array.isArray(list) && list.length > 0) {
        return list.includes('UTC') ? list : ['UTC', ...list];
      }
    }
  } catch {
    /* fall through */
  }
  return FALLBACK_TIMEZONES;
}

/** The schedule picker's timezone options: the detected local zone first,
 * deduped against the full supported list. */
export function buildTimezoneOptions(): string[] {
  const local = detectLocalTimezone();
  const set = new Set<string>([local, ...listSupportedTimezones()]);
  return Array.from(set);
}

export function tzCityLabel(timezone: string): string {
  if (timezone === 'UTC') return 'UTC';
  // `split('/')` on a string always yields at least one element, so `pop()`
  // is guaranteed non-undefined here — the `| undefined` in its type is
  // Array.prototype's general signature, not a real runtime path.
  const last = timezone.split('/').pop()!;
  return last.replace(/_/g, ' ');
}

function formatTime12h(time: string, t: TranslateFn): string {
  const m = /^(\d{2}):(\d{2})$/.exec(time);
  if (!m) return time;
  const h = Number(m[1]);
  const mm = m[2];
  const suffix = h >= 12 ? t('routines.timePm') : t('routines.timeAm');
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${mm} ${suffix}`;
}

function gmtLabel(timezone: string, at: Date): string {
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'shortOffset',
    });
    const parts = dtf.formatToParts(at);
    const part = parts.find((p) => p.type === 'timeZoneName');
    if (part === undefined) {
      return 'GMT';
    }
    return part.value;
  } catch {
    return 'GMT';
  }
}

function scheduleTimezoneLabel(timezone: string, nextRunAt?: number | null): string {
  if (nextRunAt) {
    const cityLabel = tzCityLabel(timezone);
    const gmt = gmtLabel(timezone, new Date(nextRunAt));
    return `${cityLabel} (${gmt})`;
  }
  return tzCityLabel(timezone);
}

export type RoutineScheduleSummaryParts =
  | { kind: 'hourly'; kindLabel: string; minute: string }
  | { kind: 'daily' | 'weekdays'; kindLabel: string; time: string; tz: string }
  | { kind: 'weekly'; dayLabel: string; time: string; tz: string };

export function describeRoutineScheduleParts(
  schedule: RoutineSchedule,
  t: TranslateFn,
  nextRunAt?: number | null,
): RoutineScheduleSummaryParts {
  if (schedule.kind === 'hourly') {
    return {
      kind: 'hourly',
      kindLabel: t('routines.kind.hourly'),
      minute: String(schedule.minute).padStart(2, '0'),
    };
  }

  const time = formatTime12h(schedule.time, t);
  const tz = scheduleTimezoneLabel(schedule.timezone, nextRunAt);

  if (schedule.kind === 'daily') {
    return {
      kind: 'daily',
      kindLabel: t('routines.kind.daily'),
      time,
      tz,
    };
  }

  if (schedule.kind === 'weekdays') {
    return {
      kind: 'weekdays',
      kindLabel: t('routines.kind.weekdays'),
      time,
      tz,
    };
  }

  return {
    kind: 'weekly',
    dayLabel: t(`routines.weekday.long.${schedule.weekday}` as keyof Dict),
    time,
    tz,
  };
}

export function describeRoutineSchedule(
  schedule: RoutineSchedule,
  t: TranslateFn,
  nextRunAt?: number | null,
): string {
  if (schedule.kind === 'hourly') {
    return t('routines.describe.hourly', { minute: String(schedule.minute).padStart(2, '0') });
  }

  const time = formatTime12h(schedule.time, t);
  const tz = scheduleTimezoneLabel(schedule.timezone, nextRunAt);

  if (schedule.kind === 'daily') {
    return t('routines.describe.daily', { time, tz });
  }
  if (schedule.kind === 'weekdays') {
    return t('routines.describe.weekdays', { time, tz });
  }
  return t('routines.describe.weekly', {
    day: t(`routines.weekday.long.${schedule.weekday}` as keyof Dict),
    time,
    tz,
  });
}

export function formatAutomationTimestamp(ts: number | null | undefined): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function formatRunDuration(run: RoutineRun, t: TranslateFn): string {
  if (!run.completedAt) return t('automations.runInProgress');
  const seconds = Math.max(1, Math.round((run.completedAt - run.startedAt) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder > 0 ? `${minutes}m ${remainder}s` : `${minutes}m`;
}
