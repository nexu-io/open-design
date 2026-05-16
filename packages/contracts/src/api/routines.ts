// Routines: scheduled, unattended agent sessions. Each routine fires on a
// schedule, mints a conversation (in either an existing project or a freshly
// created one), and runs the configured prompt as an agent task.

export type RoutineScheduleKind =
  | 'hourly'
  | 'daily'
  | 'weekdays'
  | 'weekly';

// Sunday=0 .. Saturday=6, mirroring JS Date.getDay().
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface RoutineHourlySchedule {
  kind: 'hourly';
  // 0-59. The minute of every hour at which the routine fires (UTC-equivalent
  // since hour boundaries are universal — we don't take a timezone here).
  minute: number;
}

export interface RoutineDailySchedule {
  kind: 'daily';
  // 24h "HH:MM" wall-clock time in `timezone`.
  time: string;
  // IANA timezone identifier (e.g. "Asia/Shanghai", "UTC").
  timezone: string;
}

export interface RoutineWeekdaysSchedule {
  kind: 'weekdays';
  // 24h "HH:MM" wall-clock time in `timezone`. Fires Mon-Fri only.
  time: string;
  timezone: string;
}

export interface RoutineWeeklySchedule {
  kind: 'weekly';
  // 24h "HH:MM" wall-clock time in `timezone`. Fires once a week.
  time: string;
  timezone: string;
  weekday: Weekday;
}

export type RoutineSchedule =
  | RoutineHourlySchedule
  | RoutineDailySchedule
  | RoutineWeekdaysSchedule
  | RoutineWeeklySchedule;

export type RoutineProjectMode = 'create_each_run' | 'reuse';

export interface RoutineCreateEachRunTarget {
  mode: 'create_each_run';
}

export interface RoutineReuseProjectTarget {
  mode: 'reuse';
  projectId: string;
}

export type RoutineProjectTarget =
  | RoutineCreateEachRunTarget
  | RoutineReuseProjectTarget;

export type RoutineRunStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'canceled';

export type RoutineRunTrigger = 'manual' | 'scheduled';

export interface RoutineLastRunSummary {
  runId: string;
  status: RoutineRunStatus;
  trigger: RoutineRunTrigger;
  startedAt: number;
  completedAt?: number;
  projectId: string;
  conversationId: string;
  agentRunId: string;
  summary?: string;
}

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
  lastRun: RoutineLastRunSummary | null;
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

export interface CreateRoutineRequest {
  name: string;
  prompt: string;
  schedule: RoutineSchedule;
  target: RoutineProjectTarget;
  skillId?: string | null;
  agentId?: string | null;
  enabled?: boolean;
}

export interface UpdateRoutineRequest {
  name?: string;
  prompt?: string;
  schedule?: RoutineSchedule;
  target?: RoutineProjectTarget;
  skillId?: string | null;
  agentId?: string | null;
  enabled?: boolean;
}

export interface RoutinesResponse {
  routines: Routine[];
}

export interface RoutineResponse {
  routine: Routine;
}

export interface RoutineRunResponse {
  routine: Routine;
  run: RoutineRun;
}

export interface RoutineRunsResponse {
  runs: RoutineRun[];
}
