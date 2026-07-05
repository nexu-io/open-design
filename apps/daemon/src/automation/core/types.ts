/** @module core/types
 * Foundation layer: the automation domain's shared type vocabulary — the routine
 * scheduling shapes (status, trigger, schedule kinds, targets, the `Routine`/`RoutineRun`
 * records, and the `RoutinePersistence`/`RoutineRunHandler` contracts).
 * This is the kernel every other subdirectory may depend on directly; core itself
 * imports no sibling subdirectory.
 *
 * Local mirror of the @open-design/contracts routine types. Kept here so the daemon
 * typechecks under NodeNext (the contracts dist re-exports are extension-less, which
 * only works under bundler-mode resolution). The shapes must stay aligned with
 * packages/contracts/src/api/routines.ts.
 */

/** Lifecycle state of a single routine run row. */
export type RoutineRunStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'canceled';

/** Whether a run was started on demand (`manual`) or by the scheduler (`scheduled`). */
export type RoutineRunTrigger = 'manual' | 'scheduled';

/** Day of week, `0` = Sunday through `6` = Saturday (matches `Date.getDay`). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * A routine's firing cadence. `hourly` fires every hour at `minute`; the
 * timezone-bound kinds fire at wall-clock `time` ("HH:MM") in `timezone`
 * (`weekdays` = Mon–Fri, `weekly` = the given `weekday`).
 */
export type RoutineSchedule =
  | { kind: 'hourly'; minute: number }
  | { kind: 'daily'; time: string; timezone: string }
  | { kind: 'weekdays'; time: string; timezone: string }
  | { kind: 'weekly'; time: string; timezone: string; weekday: Weekday };

/**
 * Where a routine run lands: `create_each_run` spins up a fresh project per
 * run; `reuse` runs inside the referenced existing project.
 */
export type RoutineProjectTarget =
  | { mode: 'create_each_run' }
  | { mode: 'reuse'; projectId: string };

/** Optional skill/plugin/MCP/connector context attached to each routine run. */
export interface RoutineContextSelection {
  skillIds?: string[];
  pluginIds?: string[];
  mcpServerIds?: string[];
  connectorIds?: string[];
}

/** A user-defined scheduled routine: what to run, when, and in which project. */
export interface Routine {
  id: string;
  name: string;
  prompt: string;
  schedule: RoutineSchedule;
  target: RoutineProjectTarget;
  skillId: string | null;
  agentId: string | null;
  context: RoutineContextSelection;
  enabled: boolean;
  nextRunAt: number | null;
  lastRun: unknown;
  createdAt: number;
  updatedAt: number;
}

/** A durable record of one execution of a routine. */
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
  errorCode: string | null;
}

/**
 * The handle a run handler returns once it has created the chat run: the live
 * resource IDs, a `completion` promise the scheduler awaits to finalize the row,
 * and optional prepare/start/tear-down callbacks the scheduler drives in order.
 */
export interface RoutineRunHandlerStart {
  projectId: string;
  conversationId: string;
  agentRunId: string;
  completion: Promise<RoutineRunCompletion>;
  prepare?: (run: RoutineRun) => void | Promise<void>;
  start?: () => void;
  // Tear-down for the case where the handler returned a start handle but
  // `RoutineService` later reached `prepare()` and it failed — i.e. the
  // routine_run row exists, prepare may have partially mutated project /
  // conversation / snapshot state, and the in-memory chat run still needs
  // to terminate as `canceled`. Callers MUST surface failures rather than
  // swallow them (the loser-retry path depends on it).
  discard?: () => void;
  // Tear-down for the case where the run was NEVER durably inserted —
  // either `insertRun()` threw, or `insertRun()` returned `false` because
  // a sibling daemon already won the scheduled slot. Prepare has not run,
  // so no project / conversation / snapshot writes need rolling back. The
  // in-memory chat run must also be removed from the registry instead of
  // being finalized as `canceled`, otherwise duplicate-loser slots would
  // surface phantom canceled runs on `/api/runs`. Falls back to `discard`
  // when the handler does not distinguish the two cases.
  discardUnstarted?: () => void;
}

/** Terminal outcome the run handler reports back through `completion`. */
export interface RoutineRunCompletion {
  status: RoutineRunStatus;
  summary?: string;
  error?: string;
  errorCode?: string | null;
}

/**
 * The callback (wired by server.ts) that actually launches a routine's chat run.
 * Given the routine and trigger, it returns a {@link RoutineRunHandlerStart}.
 */
export type RoutineRunHandler = (input: {
  routine: Routine;
  trigger: RoutineRunTrigger;
  startedAt: number;
  runId: string;
}) => Promise<RoutineRunHandlerStart>;

/**
 * The persistence surface RoutineService depends on: listing routines and the
 * insert/update/read of run rows. `insertRun` may return `false` to signal that a
 * sibling daemon already claimed the same scheduled slot.
 */
export interface RoutinePersistence {
  list(): Routine[];
  insertRun(run: RoutineRun, options?: { scheduledSlotAt?: number }): boolean | void;
  updateRun(id: string, patch: Partial<RoutineRun>): void;
  getLatestRun(routineId: string): RoutineRun | null;
}
