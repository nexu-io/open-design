import type { RunTelemetryTimestamps } from './run-analytics-observability.js';
import type { TrackingFirstModelEventType } from '@open-design/contracts/analytics';

export type RunLifecycleMark =
  | 'start_requested'
  | 'chat_run_started'
  | 'prompt_build_start'
  | 'prompt_build_end'
  | 'launch_preflight_start'
  | 'launch_preflight_end'
  | 'process_spawn_start'
  | 'process_spawned'
  | 'model_call_start'
  | 'stdin_write_start'
  | 'stdin_write_end'
  | 'first_model_event'
  | 'first_token'
  | 'first_visible_output'
  | 'first_artifact_write'
  | 'finalize_start';

const MARK_TO_FIELD: Record<RunLifecycleMark, keyof RunTelemetryTimestamps> = {
  start_requested: 'startRequestedAt',
  chat_run_started: 'startChatRunStartedAt',
  prompt_build_start: 'promptBuildStartAt',
  prompt_build_end: 'promptBuildEndAt',
  launch_preflight_start: 'launchPreflightStartAt',
  launch_preflight_end: 'launchPreflightEndAt',
  process_spawn_start: 'processSpawnStartedAt',
  process_spawned: 'processSpawnedAt',
  model_call_start: 'modelCallStartAt',
  stdin_write_start: 'stdinWriteStartAt',
  stdin_write_end: 'stdinWriteEndAt',
  first_model_event: 'firstModelEventAt',
  first_token: 'firstTokenAt',
  first_visible_output: 'firstVisibleOutputAt',
  first_artifact_write: 'firstArtifactWriteAt',
  finalize_start: 'finalizeStartAt',
};

export interface RunWithLifecycleTelemetry {
  analyticsTelemetry?: RunTelemetryTimestamps | null;
}

export interface RunLifecycleStreamEventMarkers {
  firstModelEventType?: TrackingFirstModelEventType;
  firstVisibleOutput: boolean;
  firstArtifactWrite: boolean;
}

export function runLifecycleMarkersForStreamEvent(
  event: string,
  data: unknown,
): RunLifecycleStreamEventMarkers {
  const type =
    data && typeof data === 'object' && 'type' in data
      ? (data as { type?: unknown }).type
      : undefined;
  if (event === 'agent') {
    const firstModelEventType =
      type === 'text_delta' ||
      type === 'thinking_delta' ||
      type === 'tool_use' ||
      type === 'artifact'
        ? type
        : undefined;
    return {
      ...(firstModelEventType ? { firstModelEventType } : {}),
      firstVisibleOutput:
        type === 'text_delta' ||
        type === 'thinking_delta' ||
        type === 'artifact',
      firstArtifactWrite: type === 'artifact' || type === 'live_artifact',
    };
  }
  return {
    firstVisibleOutput: false,
    firstArtifactWrite: event === 'live_artifact',
  };
}

export function createRunLifecycleTracer(run: RunWithLifecycleTelemetry): {
  mark(mark: RunLifecycleMark, timestamp?: number): void;
  markFirstModelEvent(type: TrackingFirstModelEventType, timestamp?: number): void;
  resetForAttempt(attemptIndex: number, timestamp?: number): void;
} {
  const mark = (lifecycleMark: RunLifecycleMark, timestamp = Date.now()) => {
    const field = MARK_TO_FIELD[lifecycleMark];
    const current = run.analyticsTelemetry ?? {};
    if (current[field] !== undefined) return;
    run.analyticsTelemetry = {
      ...current,
      [field]: timestamp,
    };
  };

  return {
    mark,
    markFirstModelEvent(type: TrackingFirstModelEventType, timestamp = Date.now()) {
      const current = run.analyticsTelemetry ?? {};
      if (current.firstModelEventAt !== undefined) return;
      run.analyticsTelemetry = {
        ...current,
        firstModelEventAt: timestamp,
        firstModelEventType: type,
      };
    },
    resetForAttempt(attemptIndex: number, timestamp = Date.now()) {
      run.analyticsTelemetry = {
        attemptIndex,
        attemptStartedAt: timestamp,
        ...(run.analyticsTelemetry?.startRequestedAt !== undefined
          ? { startRequestedAt: run.analyticsTelemetry.startRequestedAt }
          : {}),
      };
    },
  };
}
