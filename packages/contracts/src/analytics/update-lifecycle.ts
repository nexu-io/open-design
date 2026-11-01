import { z } from 'zod';

/** Finite, content-free stages of one persisted updater flow. */
export const UPDATE_LIFECYCLE_STAGES = [
  'install_requested', 'shutdown_started', 'renderer_quiesced', 'shutdown_completed',
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

// Additive metric: legacy lifecycle/install/apply event semantics stay unchanged.
export const UPDATE_METRIC_STAGES = ['check', 'download', 'verify', 'install_verify', 'install_open', 'restart'] as const;
export const updateStageMetricFields = {
  flow_id: z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/),
  stage: z.enum(UPDATE_METRIC_STAGES),
  result: z.enum(['started', 'success', 'failed', 'cancelled', 'unknown', 'not_applied']),
  reason_code: z.enum(['check_failed', 'download_failed', 'download_incomplete', 'checksum_mismatch',
    'verification_failed', 'install_open_failed', 'operation_failed', 'version_matches', 'version_unchanged',
    'same_version_reinstall', 'identity_mismatch', 'expired', 'interrupted', 'legacy_observation', 'cancelled']).nullable(),
  from_version: z.string().max(128).regex(/^v?\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/).nullable(),
  to_version: z.string().max(128).regex(/^v?\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/).nullable(),
  update_path: z.enum(['installer', 'payload']).nullable(),
  artifact_type: z.enum(['dmg', 'installer', 'payload']).nullable(),
  trigger: z.enum(['manual', 'silent', 'unknown']),
  duration_ms: z.number().finite().nonnegative().nullable(),
};
export const updateStageMetricSchema = z.object(updateStageMetricFields);
export type UpdateStageMetric = z.infer<typeof updateStageMetricSchema>;
