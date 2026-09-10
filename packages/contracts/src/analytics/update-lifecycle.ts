/** Finite, content-free stages of one persisted updater flow. */
export const UPDATE_LIFECYCLE_STAGES = [
  'install_requested', 'shutdown_started', 'shutdown_completed',
  'cleanup_daemon', 'cleanup_web', 'predecessor_wait_started',
  'predecessor_wait_completed', 'desktop_ready',
] as const;
export type UpdateLifecycleStage = typeof UPDATE_LIFECYCLE_STAGES[number];
export type UpdateLifecycleObservation = {
  stage: UpdateLifecycleStage;
  outcome: 'started' | 'completed' | 'forced' | 'failed';
  duration_ms?: number;
  repeated_quit_count?: number;
  forced_process_count?: number;
  remaining_process_count?: number;
};
export type UpdateLifecycleObservedProps = UpdateLifecycleObservation & {
  flow_id: string;
  from_version: string;
  to_version: string;
  channel: string;
  platform: string;
  arch: string;
  occurred_at: string;
  observation_version: 1;
};

/** Project only bounded metrics; never forward paths, PIDs, messages or extra keys. */
export function parseUpdateLifecycleObservation(value: unknown): UpdateLifecycleObservation | null {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (!(UPDATE_LIFECYCLE_STAGES as readonly unknown[]).includes(record.stage) ||
      !['started', 'completed', 'forced', 'failed'].includes(String(record.outcome))) return null;
  const result: UpdateLifecycleObservation = {
    stage: record.stage as UpdateLifecycleStage,
    outcome: record.outcome as UpdateLifecycleObservation['outcome'],
  };
  for (const key of ['duration_ms', 'repeated_quit_count', 'forced_process_count', 'remaining_process_count'] as const) {
    const value = record[key];
    if (value !== undefined) {
      if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 604_800_000) return null;
      result[key] = value;
    }
  }
  return result;
}
