import type {
  TrackingRunCancelOrigin,
  TrackingRunTerminalTrigger,
} from '@open-design/contracts/analytics';

const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'canceled']);

export const RESTART_ERROR_CODE = 'DAEMON_RESTARTED';
export const RESTART_ERROR_MESSAGE =
  'Run interrupted because the daemon restarted.';

/** Whether a durable Run was ended by the daemon-restart interruption above. */
export function wasInterruptedByDaemonRestart(
  state: Pick<RestartRecoverableDurableRunState, 'errorCode' | 'terminalRecoveryReason'> | null | undefined,
): boolean {
  return state?.terminalRecoveryReason === 'daemon_restart' || state?.errorCode === RESTART_ERROR_CODE;
}

export interface RestartRecoverableDurableRunState {
  cancelOrigin?: TrackingRunCancelOrigin | null;
  error?: string | null;
  errorCode?: string | null;
  exitCode?: number | null;
  signal?: string | null;
  status: string;
  terminalTrigger?: TrackingRunTerminalTrigger | null;
  terminalRecoveryReason?: 'daemon_restart' | 'analytics_incomplete';
  terminalAt?: number | null;
  updatedAt: number;
}

/**
 * When an interrupted Run last did anything: the newest event timestamp in its
 * log, or its last persisted update when the log carries none.
 *
 * A Run cut off by a crash, a force-quit or a power loss stopped then, not when
 * the daemon next started — which can be hours later. Ending it at restart time
 * made the turn header read "14h" (P0-24 N1).
 */
export function lastRecordedRunActivityAt(
  state: Pick<RestartRecoverableDurableRunState, 'updatedAt'>,
  events: ReadonlyArray<{ timestamp?: unknown }>,
): number {
  let last = Number.isFinite(state.updatedAt) ? state.updatedAt : 0;
  for (const record of events) {
    if (typeof record.timestamp === 'number' && Number.isFinite(record.timestamp)) {
      last = Math.max(last, record.timestamp);
    }
  }
  return last;
}

export function interruptDurableRunAfterDaemonRestart(
  state: RestartRecoverableDurableRunState,
  now = Date.now(),
  /**
   * From `lastRecordedRunActivityAt`; the Run's terminal time when known.
   * Pass a function to defer reading the event log until a Run actually needs
   * interrupting — terminal Runs must not have their logs read at all.
   */
  lastRecordedAtInput?: number | (() => number),
): boolean {
  if (TERMINAL_STATUSES.has(state.status)) return false;
  const lastRecordedAt =
    typeof lastRecordedAtInput === 'function' ? lastRecordedAtInput() : lastRecordedAtInput;
  const endedAt =
    typeof lastRecordedAt === 'number' && lastRecordedAt > 0 && lastRecordedAt <= now
      ? lastRecordedAt
      : now;
  // P0-24 N1 / Q5: a Run cut off by a crash, force-quit or power loss was
  // stopped, not failed — the cause is the client going away, not the agent.
  // It is recorded and reported as canceled; the reason stays on the record
  // (`errorCode` + `terminalTrigger` + `terminalRecoveryReason`) so analytics
  // can still tell these apart from a user's stop. Product accepted the
  // resulting change in failure rate.
  state.status = 'canceled';
  // The daemon side stopped it, as on a shutdown; `terminalTrigger` below
  // still tells a crash restart apart from a graceful one. It is also what
  // lets the sidebar read it as stopped while the user was away (P12).
  state.cancelOrigin = 'daemon_shutdown';
  state.updatedAt = endedAt;
  state.terminalAt = endedAt;
  state.exitCode = null;
  state.signal = null;
  state.error = null;
  state.errorCode = RESTART_ERROR_CODE;
  state.terminalTrigger = 'daemon_restart';
  state.terminalRecoveryReason = 'daemon_restart';
  return true;
}
