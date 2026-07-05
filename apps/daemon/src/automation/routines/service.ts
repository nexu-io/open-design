/** @module routines/service
 * RoutineService — the multi-routine scheduler. Generalizes the single-routine
 * pattern in OrbitService: a list of user-defined routines, each with its own
 * schedule, that fires the registered run handler. Schedule kinds covered: hourly
 * (every hour at minute M), daily (HH:MM in timezone), weekdays (Mon-Fri at HH:MM
 * in timezone), weekly (one weekday at HH:MM in timezone). The run handler (wired
 * by server.ts) is responsible for project/conversation creation and dispatch into
 * startChatRun. Pure next-fire math lives in schedule.ts (same subdir); shared types
 * live in core/.
 */

import { randomUUID } from 'node:crypto';

import type {
  Routine,
  RoutinePersistence,
  RoutineRun,
  RoutineRunHandler,
  RoutineRunHandlerStart,
  RoutineRunTrigger,
} from '../core/index.js';
import { nextRunAtForSchedule } from './schedule.js';

interface ScheduledTimer {
  routineId: string;
  timer: NodeJS.Timeout;
  fireAt: Date;
}

function clearRoutinePlaceholderId(value: string): string {
  return value.startsWith('routine-pending-') ? '' : value;
}

class ScheduledRunPersistenceError extends Error {
  constructor(
    readonly routineId: string,
    readonly slotAt: number,
    readonly originalError: unknown,
  ) {
    super(`Routine ${routineId} scheduled slot ${slotAt} could not be persisted`);
    this.name = 'ScheduledRunPersistenceError';
  }
}

function isScheduledRunPersistenceError(error: unknown): error is ScheduledRunPersistenceError {
  return error instanceof ScheduledRunPersistenceError;
}

/**
 * Stateful multi-routine scheduler. Holds one timer per enabled routine, fires the
 * registered {@link RoutineRunHandler}, and reconciles the durable run row through the
 * injected {@link RoutinePersistence} — including scheduled-slot claim/loss, prepare
 * failure tear-down, and completion finalization. All next-fire math is delegated to
 * schedule.ts; this class owns only timing and the run lifecycle.
 */
export class RoutineService {
  private timers = new Map<string, ScheduledTimer>();
  private inflight = new Map<string, Promise<RoutineRunHandlerStart>>();
  private runHandler: RoutineRunHandler | null = null;
  private started = false;

  constructor(private readonly persistence: RoutinePersistence) {}

  /** Register the callback that launches a routine's chat run. Must be set before `start()`. */
  setRunHandler(handler: RoutineRunHandler): void {
    this.runHandler = handler;
  }

  /** Begin scheduling. Idempotent; schedules a timer for every enabled routine. */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.rescheduleAll();
  }

  /** Clear all timers and stop scheduling. In-flight runs are left to complete. */
  stop(): void {
    for (const entry of this.timers.values()) clearTimeout(entry.timer);
    this.timers.clear();
    this.started = false;
  }

  /** Rebuild every routine's timer from current persistence (call after bulk changes). */
  rescheduleAll(): void {
    for (const entry of this.timers.values()) clearTimeout(entry.timer);
    this.timers.clear();
    if (!this.started) return;
    for (const routine of this.persistence.list()) {
      this.scheduleRoutine(routine);
    }
  }

  /** Rebuild a single routine's timer (call after that routine changes). */
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

  /** Drop a routine's timer without rescheduling (call on delete/disable). */
  unschedule(routineId: string): void {
    const existing = this.timers.get(routineId);
    if (existing) {
      clearTimeout(existing.timer);
      this.timers.delete(routineId);
    }
  }

  /** @internal Schedule the next fire for one enabled routine, if its schedule resolves. */
  private scheduleRoutine(routine: Routine): void {
    if (!routine.enabled) return;
    const fireAt = nextRunAtForSchedule(routine.schedule);
    if (!fireAt) return;
    this.scheduleRoutineAt(routine, fireAt);
  }

  /** @internal Re-arm the same slot after a transient persistence failure lost the claim. */
  private retryScheduledSlot(routineId: string, fireAt: Date): void {
    if (!this.started) return;
    const routine = this.persistence.list().find((candidate) => candidate.id === routineId);
    if (!routine?.enabled) return;
    this.scheduleRoutineAt(routine, fireAt);
  }

  /** @internal Arm a capped, unref'd timer that fires the run and re-schedules the cadence. */
  private scheduleRoutineAt(routine: Routine, fireAt: Date): void {
    // setTimeout can't carry past 2^31 ms (~24.8 days); we cap and use
    // a chained re-schedule. Routines fire within hours/days, but a
    // misconfigured "next month" weekly value could otherwise overflow.
    const delay = Math.max(1_000, Math.min(2_000_000_000, fireAt.getTime() - Date.now()));
    const timer = setTimeout(() => {
      this.timers.delete(routine.id);
      const slotAt = fireAt.getTime();
      this.start_(routine.id, 'scheduled', { scheduledSlotAt: slotAt })
        .then(() => {
          // Always reschedule so a single fire keeps the cadence alive.
          this.rescheduleOne(routine.id);
        })
        .catch((error) => {
          console.error(
            `[od] routine ${routine.id} scheduled run failed:`,
            error instanceof ScheduledRunPersistenceError
              ? error.originalError instanceof Error
                ? error.originalError.message
                : error.originalError
              : error instanceof Error ? error.message : error,
          );
          if (isScheduledRunPersistenceError(error)) {
            this.retryScheduledSlot(routine.id, fireAt);
          } else {
            this.rescheduleOne(routine.id);
          }
        });
    }, delay);
    if (typeof timer.unref === 'function') timer.unref();
    this.timers.set(routine.id, { routineId: routine.id, timer, fireAt });
  }

  /** The scheduled fire time for a routine, or `null` if it has no armed timer. */
  nextRunAt(routineId: string): Date | null {
    return this.timers.get(routineId)?.fireAt ?? null;
  }

  /** Fire a routine immediately (manual trigger), returning the run's start handle. */
  async runNow(routineId: string): Promise<RoutineRunHandlerStart> {
    return this.start_(routineId, 'manual');
  }

  /**
   * @internal
   * Core run lifecycle shared by manual and scheduled triggers: dedupes in-flight runs,
   * builds the run row, claims the scheduled slot (with loser/error tear-down), drives
   * prepare → start, and finalizes status via the persistence layer on completion.
   */
  private async start_(
    routineId: string,
    trigger: RoutineRunTrigger,
    options: { scheduledSlotAt?: number } = {},
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
      const run: RoutineRun = {
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
        errorCode: null,
      };
      const scheduledSlotAt = options.scheduledSlotAt;
      const wasScheduled = scheduledSlotAt != null;
      const publicProjectId = () => clearRoutinePlaceholderId(run.projectId);
      const publicConversationId = () => clearRoutinePlaceholderId(run.conversationId);
      const publicAgentRunId = () => clearRoutinePlaceholderId(run.agentRunId);
      const scrubRoutinePlaceholders = () => {
        run.projectId = publicProjectId();
        run.conversationId = publicConversationId();
        run.agentRunId = publicAgentRunId();
      };
      // Tear-down to use when the durable routine_run row was never
      // inserted (insertRun threw, or another daemon already won the slot).
      // Prefer the explicit `discardUnstarted` callback when the handler
      // distinguishes the two cases — that one drops the in-memory chat run
      // entirely instead of finalizing it as `canceled`, so duplicate
      // scheduled losers do not surface phantom runs on `/api/runs`.
      // Handlers that do not implement the split still see `discard`.
      const discardUnstarted = handlerStart.discardUnstarted ?? handlerStart.discard;
      let inserted = true;
      try {
        inserted = this.persistence.insertRun(run, options) !== false;
      } catch (error) {
        try {
          discardUnstarted?.();
        } catch (discardError) {
          if (wasScheduled) {
            throw new ScheduledRunPersistenceError(routine.id, scheduledSlotAt, discardError);
          }
          throw discardError;
        }
        if (wasScheduled) {
          throw new ScheduledRunPersistenceError(routine.id, scheduledSlotAt, error);
        }
        throw error;
      }
      if (!inserted) {
        try {
          discardUnstarted?.();
        } catch (discardError) {
          if (wasScheduled) {
            throw new ScheduledRunPersistenceError(routine.id, scheduledSlotAt, discardError);
          }
          throw discardError;
        }
        return handlerStart;
      }
      try {
        await handlerStart.prepare?.(run);
        const preparedIdsChanged =
          run.projectId !== handlerStart.projectId
          || run.conversationId !== handlerStart.conversationId
          || run.agentRunId !== handlerStart.agentRunId;
        handlerStart.projectId = run.projectId;
        handlerStart.conversationId = run.conversationId;
        handlerStart.agentRunId = run.agentRunId;
        if (wasScheduled || preparedIdsChanged) {
          this.persistence.updateRun(runId, {
            projectId: run.projectId,
            conversationId: run.conversationId,
            agentRunId: run.agentRunId,
          });
        }
      } catch (error) {
        // Terminate the in-memory chat run created by `handler(...)` so its
        // `completion` promise resolves instead of waiting forever on a
        // run that will never start. Surface any cleanup failure rather
        // than swallow it, but still finalize the persisted row.
        let discardError: unknown = null;
        try {
          handlerStart.discard?.();
        } catch (err) {
          discardError = err;
        }
        if (discardError != null) {
          console.error(
            `[od] routine ${routine.id} prepare cleanup failed:`,
            discardError instanceof Error ? discardError.message : discardError,
          );
        }
        // Persist IDs only after `prepare()` has replaced routine
        // placeholders with real resources. If preparation failed before
        // enrichment, clear the sentinels so the terminal row does not point
        // at fabricated project/conversation IDs. For scheduled runs the
        // slot claim was already accepted at `insertRun()`, so retrying the
        // same slot is not appropriate — let the error propagate so the
        // scheduler advances to the next cadence.
        scrubRoutinePlaceholders();
        this.persistence.updateRun(runId, {
          status: 'failed',
          completedAt: Date.now(),
          summary: null,
          error: error instanceof Error ? error.message : String(error),
          errorCode: null,
          projectId: run.projectId,
          conversationId: run.conversationId,
          agentRunId: run.agentRunId,
        });
        throw error;
      }
      handlerStart.completion
        .then((completion) => {
          this.persistence.updateRun(runId, {
            status: completion.status,
            completedAt: Date.now(),
            summary: completion.summary ?? null,
            error: completion.error ?? null,
            errorCode: completion.errorCode ?? null,
          });
        })
        .catch((error) => {
          this.persistence.updateRun(runId, {
            status: 'failed',
            completedAt: Date.now(),
            summary: null,
            error: error instanceof Error ? error.message : String(error),
            errorCode: null,
          });
        });
      try {
        handlerStart.start?.();
      } catch (error) {
        this.persistence.updateRun(runId, {
          status: 'failed',
          completedAt: Date.now(),
          summary: null,
          error: error instanceof Error ? error.message : String(error),
          errorCode: null,
        });
        throw error;
      }
      return handlerStart;
    })();
    this.inflight.set(routineId, promise);
    // The trailing `finally(...)` returns a new promise that mirrors the
    // original rejection; without `.catch` it would surface as an
    // unhandled rejection (fatal in modern Node) when the handler rejects
    // before producing a start handle. The original `promise` is still
    // returned to callers, who handle the rejection there.
    promise
      .finally(() => {
        this.inflight.delete(routineId);
      })
      .catch(() => {});
    return promise;
  }
}
