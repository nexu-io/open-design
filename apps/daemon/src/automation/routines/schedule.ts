/** @module routines/schedule
 * Pure schedule computation and validation for routines: timezone-aware wall-clock
 * math (DST gap/overlap handling), next-fire calculation for each schedule kind, and
 * schedule/target validators. All functions here are pure — no timers, no I/O, no state.
 * The stateful scheduler that consumes them lives in service.ts (same subdir).
 * Depends only on core/ types.
 */

import type { RoutineProjectTarget, RoutineSchedule, Weekday } from '../core/index.js';

// ---------- timezone math ----------

// Returns the wall-clock parts of `atUtc` rendered in `timezone`. Uses
// Intl.DateTimeFormat which Node ships with full-icu by default. If the
// timezone is invalid the formatter throws — we catch upstream.
function partsInTimezone(timezone: string, atUtc: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: Weekday;
} {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
  });
  const parts = dtf.formatToParts(atUtc);
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? '0';
  const weekdayStr = get('weekday');
  const weekdayMap: Record<string, Weekday> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  let h = Number(get('hour'));
  // Intl emits "24" at midnight in some locales/zones; normalize to 0.
  if (h === 24) h = 0;
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: h,
    minute: Number(get('minute')),
    second: Number(get('second')),
    weekday: weekdayMap[weekdayStr] ?? 0,
  };
}

// Returns every UTC instant at which the wall clock in `timezone` reads
// the requested Y-M-D h:m, sorted ascending. Most days have exactly one
// match. On a fall-back transition day the requested time inside the
// repeated hour has two matches (one before the transition, one after);
// outside that hour it still has one. On a spring-forward gap the
// requested time inside the gap has zero matches — callers fall back to
// `tzWallToUtcGapFallback` to land on a post-gap instant the same day.
// Probes offsets at three reference points across the day so that both
// pre- and post-transition offsets are sampled regardless of which side
// of the transition `tentative` happens to land on. Returns [] if
// `timezone` is invalid.
function tzWallToUtcCandidates(
  timezone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date[] {
  try {
    const tentative = Date.UTC(year, month - 1, day, hour, minute, 0);
    const probeOffsetsMs = [-12, 0, 12].map((h) => h * 60 * 60_000);
    const seen = new Set<number>();
    const out: Date[] = [];
    for (const dms of probeOffsetsMs) {
      const off = tzOffsetMinutes(timezone, new Date(tentative + dms));
      const cand = new Date(tentative - off * 60_000);
      const t = cand.getTime();
      if (seen.has(t)) continue;
      if (matchesWallClock(timezone, cand, year, month, day, hour, minute)) {
        seen.add(t);
        out.push(cand);
      }
    }
    return out.sort((a, b) => a.getTime() - b.getTime());
  } catch {
    return [];
  }
}

// Spring-forward gap fallback: when the requested wall time doesn't
// exist in `timezone` on this day (clocks jumped over it), return the
// later of the two probe candidates. That instant has crossed the
// transition and renders as the first valid post-gap wall time, so a
// routine still fires today instead of firing an hour early before the
// gap. Returns null if `timezone` is invalid.
function tzWallToUtcGapFallback(
  timezone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date | null {
  try {
    const tentative = Date.UTC(year, month - 1, day, hour, minute, 0);
    const t1 = tzOffsetMinutes(timezone, new Date(tentative));
    const candidate1 = new Date(tentative - t1 * 60_000);
    const t2 = tzOffsetMinutes(timezone, candidate1);
    const candidate2 = new Date(tentative - t2 * 60_000);
    return candidate1.getTime() > candidate2.getTime() ? candidate1 : candidate2;
  } catch {
    return null;
  }
}

function matchesWallClock(
  timezone: string,
  at: Date,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): boolean {
  const p = partsInTimezone(timezone, at);
  return (
    p.year === year &&
    p.month === month &&
    p.day === day &&
    p.hour === hour &&
    p.minute === minute
  );
}

// Minutes east of UTC for `timezone` at instant `at`. e.g. Asia/Shanghai
// returns 480.
function tzOffsetMinutes(timezone: string, at: Date): number {
  const p = partsInTimezone(timezone, at);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asIfUtc - at.getTime()) / 60_000);
}

// ---------- next-fire calculation ----------

/**
 * Next instant at which the clock reads `minute` past the hour, strictly after
 * `now`. Local-clock based (hourly schedules are timezone-independent).
 */
export function nextHourlyRunAt(minute: number, now = new Date()): Date {
  const next = new Date(now);
  next.setSeconds(0, 0);
  next.setMinutes(minute);
  if (next.getTime() <= now.getTime()) {
    next.setHours(next.getHours() + 1);
  }
  return next;
}

// Returns the next instant at which the wall-clock in `timezone` reads
// "HH:MM" on a day where `predicate(weekday)` holds. Walks forward at most
// 14 calendar days as a safety bound (covers any weekday-based pattern).
function nextWallTimeMatching(
  timezone: string,
  time: string,
  predicate: (weekday: Weekday) => boolean,
  now: Date,
): Date | null {
  const m = /^(\d{2}):(\d{2})$/.exec(time);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return null;
  if (!Number.isFinite(minute) || minute < 0 || minute > 59) return null;

  // Walk day by day in the target timezone.
  for (let offset = 0; offset < 14; offset += 1) {
    const probe = new Date(now.getTime() + offset * 24 * 60 * 60_000);
    const parts = partsInTimezone(timezone, probe);
    if (!predicate(parts.weekday)) continue;
    const candidates = tzWallToUtcCandidates(
      timezone, parts.year, parts.month, parts.day, hour, minute,
    );
    if (candidates.length === 0) {
      // Spring-forward gap: no valid wall instant exists today; pick the
      // synthesized post-gap fallback so the routine still fires today.
      const fallback = tzWallToUtcGapFallback(
        timezone, parts.year, parts.month, parts.day, hour, minute,
      );
      if (!fallback) return null;
      if (fallback.getTime() > now.getTime()) return fallback;
      continue;
    }
    // Iterate candidates in ascending order so that on a fall-back overlap
    // day, when `now` already passed the first occurrence (EDT), we still
    // pick the second one (EST) before walking to the next day.
    for (const candidate of candidates) {
      if (candidate.getTime() > now.getTime()) return candidate;
    }
  }
  return null;
}

/**
 * The next UTC instant a routine on `schedule` should fire after `now`, or `null`
 * when the schedule can never match (invalid time/timezone). Dispatches by kind
 * and handles DST gap/overlap days via the timezone helpers above.
 */
export function nextRunAtForSchedule(
  schedule: RoutineSchedule,
  now = new Date(),
): Date | null {
  if (schedule.kind === 'hourly') {
    return nextHourlyRunAt(schedule.minute, now);
  }
  if (schedule.kind === 'daily') {
    return nextWallTimeMatching(schedule.timezone, schedule.time, () => true, now);
  }
  if (schedule.kind === 'weekdays') {
    // Mon=1 .. Fri=5
    return nextWallTimeMatching(
      schedule.timezone,
      schedule.time,
      (w) => w >= 1 && w <= 5,
      now,
    );
  }
  if (schedule.kind === 'weekly') {
    return nextWallTimeMatching(
      schedule.timezone,
      schedule.time,
      (w) => w === schedule.weekday,
      now,
    );
  }
  return null;
}

// ---------- validation ----------

/** True when `time` is a well-formed 24-hour "HH:MM" wall-clock string. */
export function isValidWallTime(time: string): boolean {
  const m = /^(\d{2}):(\d{2})$/.exec(time);
  if (!m) return false;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  return h >= 0 && h <= 23 && mm >= 0 && mm <= 59;
}

/** True when `tz` is an IANA timezone the runtime's Intl data can resolve. */
export function isValidTimezone(tz: string): boolean {
  if (!tz || typeof tz !== 'string') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Throws if `schedule` is malformed (bad minute, time, timezone, weekday, or kind). */
export function validateSchedule(schedule: RoutineSchedule): void {
  if (!schedule || typeof schedule !== 'object') {
    throw new Error('schedule is required');
  }
  if (schedule.kind === 'hourly') {
    const m = schedule.minute;
    if (!Number.isInteger(m) || m < 0 || m > 59) {
      throw new Error('hourly.minute must be an integer 0-59');
    }
    return;
  }
  if (
    schedule.kind === 'daily' ||
    schedule.kind === 'weekdays' ||
    schedule.kind === 'weekly'
  ) {
    if (!isValidWallTime(schedule.time)) {
      throw new Error(`Invalid time: ${schedule.time}`);
    }
    if (!isValidTimezone(schedule.timezone)) {
      throw new Error(`Invalid timezone: ${schedule.timezone}`);
    }
    if (schedule.kind === 'weekly') {
      const w = schedule.weekday;
      if (!Number.isInteger(w) || w < 0 || w > 6) {
        throw new Error('weekly.weekday must be 0-6');
      }
    }
    return;
  }
  throw new Error(`Unsupported schedule kind: ${(schedule as { kind: string }).kind}`);
}

/** Throws if `target` is malformed (unknown mode, or `reuse` without a projectId). */
export function validateTarget(target: RoutineProjectTarget): void {
  if (!target || typeof target !== 'object') {
    throw new Error('target is required');
  }
  if (target.mode === 'create_each_run') return;
  if (target.mode === 'reuse') {
    if (!target.projectId || typeof target.projectId !== 'string') {
      throw new Error('Reuse target requires a projectId');
    }
    return;
  }
  throw new Error(
    `Unsupported routine target mode: ${(target as { mode: string }).mode}`,
  );
}
