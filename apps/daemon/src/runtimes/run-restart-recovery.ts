const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'canceled']);

export const RESTART_ERROR_CODE = 'DAEMON_RESTARTED';
export const RESTART_ERROR_MESSAGE =
  'Run interrupted because the daemon restarted.';

export interface RestartRecoverableDurableRunState {
  error?: string | null;
  errorCode?: string | null;
  exitCode?: number | null;
  signal?: string | null;
  status: string;
  terminalRecoveryReason?: 'daemon_restart' | 'analytics_incomplete';
  updatedAt: number;
}

export function interruptDurableRunAfterDaemonRestart(
  state: RestartRecoverableDurableRunState,
  now = Date.now(),
): boolean {
  if (TERMINAL_STATUSES.has(state.status)) return false;
  state.status = 'failed';
  state.updatedAt = now;
  state.exitCode = 1;
  state.signal = null;
  state.error = RESTART_ERROR_MESSAGE;
  state.errorCode = RESTART_ERROR_CODE;
  state.terminalRecoveryReason = 'daemon_restart';
  return true;
}
