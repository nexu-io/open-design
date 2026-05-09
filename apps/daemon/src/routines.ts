// RoutineService — multi-routine scheduler. Generalizes the single-routine
// pattern in OrbitService: a list of user-defined routines, each with its
// own schedule, that fires the registered run handler. Schedule kinds
// covered: hourly (every hour at minute M), daily (HH:MM in timezone),
// weekdays (Mon-Fri at HH:MM in timezone), weekly (one weekday at HH:MM in
// timezone). The run handler (wired by server.ts) is responsible for
// project/conversation creation and dispatch into startChatRun.

import { randomUUID } from 'node:crypto';

// Local mirror of the @open-design/contracts routine types. Kept here so
// this service typechecks under NodeNext (the contracts dist re-exports are
// extension-less, which only works under bundler-mode resolution). The
// shapes must stay aligned with packages/contracts/src/api/routines.ts.

export type RoutineRunStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'canceled';

export type RoutineRunTrigger = 'manual' | 'scheduled';

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type RoutineSchedule =
  | { kind: 'hourly'; minute: number }
  | { kind: 'daily'; time: string; timezone: string }
  | { kind: 'weekdays'; time: string; timezone: string }
  | { kind: 'weekly'; time: string; timezone: string; weekday: Weekday };

export type RoutineProjectTarget =
  | { mode: 'create_each_run' }
  | { mode: 'reuse'; projectId: string };

export interface Routine {
  id: string;
  name: string;
  prompt: string;
  schedule: RoutineSchedule;
  target: RoutineProjectTarget;
  skillId: string | null;
  agentId: string | null;
  enabled: boolean;
  nextRunAt: number | null;
  lastRun: unknown;
  createdAt: number;
  updatedAt: number;
}

export interface RoutineRun {
  id: string;
  routineId: string;
  trigger: RoutineRunTrigger;
  status: RoutineRunStatus;
  projectId: string;
  conversationId: string;
  agentRunId: string;
  startedAt: number;
  completedAt: number | null;
  summary: string | null;
  error: string | null;
}

export interface RoutineRunHandlerStart {
  projectId: string;
  conversationId: string;
  agentRunId: string;
  completion: Promise<RoutineRunCompletion>;
}

export interface RoutineRunCompletion {
  status: RoutineRunStatus;
  summary?: string;
  error?: string;
}

export type RoutineRunHandler = (input: {
  routine: Routine;
  trigger: RoutineRunTrigger;
  startedAt: number;
  runId: string;
}) => Promise<RoutineRunHandlerStart>;

export interface RoutinePersistence {
  list(): Routine[];
  insertRun(run: RoutineRun): void;
  updateRun(id: string, patch: Partial<RoutineRun>): void;
  getLatestRun(routineId: string): RoutineRun | null;
}

interface ScheduledTimer {
  routineId: string;
  timer: NodeJS.Timeout;
  fireAt: Date;
}

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

// Convert wall-clock (Y-M-D h:m in `timezone`) to a UTC Date. Uses a
// two-pass approach: build a tentative UTC stamp from the wall fields,
// figure out the offset Intl reports for that instant in `timezone`, then
// adjust. Two passes are enough across DST transitions because the offset
// only depends on the instant, and the second pass uses the corrected
// instant. Returns null if `timezone` is invalid.
function tzWallToUtc(
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
    const adjusted = tentative - t1 * 60_000;
    const t2 = tzOffsetMinutes(timezone, new Date(adjusted));
    return new Date(tentative - t2 * 60_000);
  } catch {
    return null;
  }
}

// Minutes east of UTC for `timezone` at instant `at`. e.g. Asia/Shanghai
// returns 480.
function tzOffsetMinutes(timezone: string, at: Date): number {
  const p = partsInTimezone(timezone, at);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asIfUtc - at.getTime()) / 60_000);
}

// ---------- next-fire calculation ----------

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
    const candidate = tzWallToUtc(timezone, parts.year, parts.month, parts.day, hour, minute);
    if (!candidate) return null;
    if (candidate.getTime() > now.getTime()) return candidate;
  }
  return null;
}

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

export function isValidWallTime(time: string): boolean {
  const m = /^(\d{2}):(\d{2})$/.exec(time);
  if (!m) return false;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  return h >= 0 && h <= 23 && mm >= 0 && mm <= 59;
}

export function isValidTimezone(tz: string): boolean {
  if (!tz || typeof tz !== 'string') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

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

// ---------- service ----------

export class RoutineService {
  private timers = new Map<string, ScheduledTimer>();
  private inflight = new Map<string, Promise<RoutineRunHandlerStart>>();
  private runHandler: RoutineRunHandler | null = null;
  private started = false;

  constructor(private readonly persistence: RoutinePersistence) {}

  setRunHandler(handler: RoutineRunHandler): void {
    this.runHandler = handler;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.rescheduleAll();
  }

  stop(): void {
    for (const entry of this.timers.values()) clearTimeout(entry.timer);
    this.timers.clear();
    this.started = false;
  }

  rescheduleAll(): void {
    for (const entry of this.timers.values()) clearTimeout(entry.timer);
    this.timers.clear();
    if (!this.started) return;
    for (const routine of this.persistence.list()) {
      this.scheduleRoutine(routine);
    }
  }

  rescheduleOne(routineId: string): void {
    const existing = this.timers.get(routineId);
    if (existing) {
      clearTimeout(existing.timer);
      this.timers.delete(routineId);
    }
    if (!this.started) return;
    const routine = this.persistence.list().find((r) => r.id === routineId);
    if (routine) this.scheduleRoutine(routine);
  }

  unschedule(routineId: string): void {
    const existing = this.timers.get(routineId);
    if (existing) {
      clearTimeout(existing.timer);
      this.timers.delete(routineId);
    }
  }

  private scheduleRoutine(routine: Routine): void {
    if (!routine.enabled) return;
    const fireAt = nextRunAtForSchedule(routine.schedule);
    if (!fireAt) return;
    // setTimeout can't carry past 2^31 ms (~24.8 days); we cap and use
    // a chained re-schedule. Routines fire within hours/days, but a
    // misconfigured "next month" weekly value could otherwise overflow.
    const delay = Math.max(1_000, Math.min(2_000_000_000, fireAt.getTime() - Date.now()));
    const timer = setTimeout(() => {
      this.timers.delete(routine.id);
      this.start_(routine.id, 'scheduled')
        .catch((error) => {
          console.error(
            `[od] routine ${routine.id} scheduled run failed:`,
            error instanceof Error ? error.message : error,
          );
        })
        .finally(() => {
          // Always reschedule so a single fire keeps the cadence alive.
          this.rescheduleOne(routine.id);
        });
    }, delay);
    if (typeof timer.unref === 'function') timer.unref();
    this.timers.set(routine.id, { routineId: routine.id, timer, fireAt });
  }

  nextRunAt(routineId: string): Date | null {
    return this.timers.get(routineId)?.fireAt ?? null;
  }

  async runNow(routineId: string): Promise<RoutineRunHandlerStart> {
    return this.start_(routineId, 'manual');
  }

  private async start_(
    routineId: string,
    trigger: RoutineRunTrigger,
  ): Promise<RoutineRunHandlerStart> {
    if (!this.runHandler) throw new Error('Routine run handler is not configured');
    const inflight = this.inflight.get(routineId);
    if (inflight) return inflight;

    const routine = this.persistence.list().find((r) => r.id === routineId);
    if (!routine) throw new Error(`Routine ${routineId} not found`);

    const startedAt = Date.now();
    const runId = `routine-run-${randomUUID()}`;
    const promise = (async () => {
      const handler = this.runHandler;
      if (!handler) throw new Error('Routine run handler is not configured');
      const handlerStart = await handler({ routine, trigger, startedAt, runId });
      this.persistence.insertRun({
        id: runId,
        routineId: routine.id,
        trigger,
        status: 'running',
        projectId: handlerStart.projectId,
        conversationId: handlerStart.conversationId,
        agentRunId: handlerStart.agentRunId,
        startedAt,
        completedAt: null,
        summary: null,
        error: null,
      });
      handlerStart.completion
        .then((completion) => {
          this.persistence.updateRun(runId, {
            status: completion.status,
            completedAt: Date.now(),
            summary: completion.summary ?? null,
            error: completion.error ?? null,
          });
        })
        .catch((error) => {
          this.persistence.updateRun(runId, {
            status: 'failed',
            completedAt: Date.now(),
            summary: null,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      return handlerStart;
    })();
    this.inflight.set(routineId, promise);
    promise.finally(() => {
      this.inflight.delete(routineId);
    });
    return promise;
  }
}
