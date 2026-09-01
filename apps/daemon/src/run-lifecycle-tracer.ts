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
  // When the producer says this event's work actually began, on the daemon's
  // clock. Present when a payload carries `startedAt`, which ACP does: it
  // accumulates tool_call frames and emits the canonical `tool_use` only once
  // the call is terminal, so the arrival time of that event is the tool's END.
  // Stamping the anchor from arrival would measure a tool-only ACP turn as
  // runtime init, which is the case this whole boundary change exists for.
  firstModelEventAt?: number;
  // True when THIS event is user-visible model output leaving the daemon.
  // Callers mark `first_visible_output` from it at the single emission choke
  // point, so the mark lands after every filter that can withhold bytes
  // (`<od-title>` stripping, the fabricated-role-marker guard, close-time
  // buffering) rather than when the daemon first recognised a token.
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
    // `artifact` is deliberately absent. Agent `artifact` events are emitted
    // from exactly one place -- the daemon's close-time persistence of
    // plain-stream stdout -- and never by a runtime relaying model output.
    // Marking one would stamp a daemon action taken at the END of the run as
    // the moment the model started responding, which is both wrong on its own
    // terms and would push every phase boundary to the end of the run. Re-add
    // it only if a runtime starts emitting a model-authored artifact event.
    const firstModelEventType =
      type === 'text_delta' || type === 'thinking_delta' || type === 'tool_use'
        ? type
        : undefined;
    const startedAt =
      data && typeof data === 'object' && 'startedAt' in data
        ? (data as { startedAt?: unknown }).startedAt
        : undefined;
    const firstModelEventAt =
      typeof startedAt === 'number' && Number.isFinite(startedAt)
        ? startedAt
        : undefined;
    return {
      ...(firstModelEventType ? { firstModelEventType } : {}),
      ...(firstModelEventType && firstModelEventAt !== undefined
        ? { firstModelEventAt }
        : {}),
      firstVisibleOutput:
        type === 'text_delta' ||
        type === 'thinking_delta' ||
        type === 'artifact',
      firstArtifactWrite: type === 'artifact' || type === 'live_artifact',
    };
  }
  return {
    // The plain / BYOK / antigravity family has no structured `agent` stream —
    // its reply reaches the user as `stdout` chunks, already control-stripped,
    // title-stripped and role-guarded by the time they are sent. Without this,
    // those runs would report no visible output at all and fall back to the
    // first token, which is exactly wrong for antigravity: it buffers stdout
    // until close, so its first token and its first visible byte can be a whole
    // run apart. `stderr` stays out — it is a diagnostic channel, not the
    // model's answer.
    firstVisibleOutput: event === 'stdout',
    firstArtifactWrite: event === 'live_artifact',
  };
}

export function createRunLifecycleTracer(run: RunWithLifecycleTelemetry): {
  mark(mark: RunLifecycleMark, timestamp?: number): void;
  markFirstModelEvent(
    type: TrackingFirstModelEventType,
    producerStartedAt?: number,
  ): void;
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
    markFirstModelEvent(
      type: TrackingFirstModelEventType,
      producerStartedAt?: number,
    ) {
      const arrivedAt = Date.now();
      const current = run.analyticsTelemetry ?? {};
      const next = { ...current };
      let changed = false;

      // `firstModelEventAt` is when we SAW the first model event. It is already
      // published as `time_to_first_model_event_ms`, so it stays first-write-
      // wins on arrival -- a producer-supplied start must not silently move it.
      if (current.firstModelEventAt === undefined) {
        next.firstModelEventAt = arrivedAt;
        next.firstModelEventType = type;
        changed = true;
      }

      // `firstModelResponseAt` is when the model actually began responding, and
      // is what phase boundaries anchor on. Two reasons it differs from
      // arrival: ACP holds each toolCallId until terminal status, so the
      // canonical `tool_use` arrives when the tool ENDS while its payload
      // carries the real start; and parallel calls can terminate in the
      // opposite order they began, so earliest-wins rather than first-wins.
      // Clamped to arrival so a producer clock running ahead cannot claim the
      // model responded in the future.
      const responseAt =
        typeof producerStartedAt === 'number' && Number.isFinite(producerStartedAt)
          ? Math.min(producerStartedAt, arrivedAt)
          : arrivedAt;
      if (
        current.firstModelResponseAt === undefined ||
        responseAt < current.firstModelResponseAt
      ) {
        next.firstModelResponseAt = responseAt;
        changed = true;
      }

      if (changed) run.analyticsTelemetry = next;
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
