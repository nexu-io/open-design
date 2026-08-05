import type { RoutineSchedule, Weekday } from '@open-design/contracts';

const WEEKDAY_TOKENS: Record<string, Weekday> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const WEEKDAY_LABELS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

function parseClock(kind: 'daily' | 'weekdays' | 'weekly', hour: string, minute: string): string {
  const time = `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new Error(`--schedule ${kind} time must be HH:MM (24h)`);
  }
  return time;
}

/** Parse the CLI schedule grammar into the canonical routine contract. */
export function parseAutomationScheduleFlag(raw: unknown): RoutineSchedule {
  if (!raw || typeof raw !== 'string') {
    throw new Error(
      '--schedule is required. Forms: hourly:<minute> | daily:HH:MM[:TZ] | weekdays:HH:MM[:TZ] | weekly:DAY:HH:MM[:TZ]',
    );
  }

  const parts = raw.split(':');
  const kind = parts[0];
  if (kind === 'hourly') {
    const minute = Number(parts[1]);
    if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
      throw new Error('--schedule hourly requires :<minute>, 0-59');
    }
    return { kind: 'hourly', minute };
  }

  if (kind === 'daily' || kind === 'weekdays') {
    if (parts.length < 3) {
      throw new Error(`--schedule ${kind} requires :HH:MM[:TZ]`);
    }
    return {
      kind,
      time: parseClock(kind, parts[1]!, parts[2]!),
      timezone: parts.slice(3).join(':') || 'UTC',
    };
  }

  if (kind === 'weekly') {
    if (parts.length < 4) {
      throw new Error('--schedule weekly requires :DAY:HH:MM[:TZ] (DAY is 0-6 or sun/mon/...)');
    }
    const dayToken = parts[1]!.toLowerCase();
    let weekday: Weekday;
    if (/^[0-6]$/.test(dayToken)) {
      weekday = Number(dayToken) as Weekday;
    } else if (WEEKDAY_TOKENS[dayToken] !== undefined) {
      weekday = WEEKDAY_TOKENS[dayToken];
    } else {
      throw new Error(`--schedule weekly day must be 0-6 or sun..sat (got "${parts[1]}")`);
    }
    return {
      kind: 'weekly',
      weekday,
      time: parseClock('weekly', parts[2]!, parts[3]!),
      timezone: parts.slice(4).join(':') || 'UTC',
    };
  }

  throw new Error(`--schedule kind must be hourly|daily|weekdays|weekly (got "${kind}")`);
}

export function describeAutomationScheduleForCli(
  schedule: RoutineSchedule | null | undefined,
): string {
  if (!schedule) return '-';
  if (schedule.kind === 'hourly') {
    return `hourly:${String(schedule.minute).padStart(2, '0')}`;
  }
  if (schedule.kind === 'weekly') {
    return `weekly:${WEEKDAY_LABELS[schedule.weekday] ?? schedule.weekday}:${schedule.time}:${schedule.timezone}`;
  }
  return `${schedule.kind}:${schedule.time}:${schedule.timezone}`;
}
