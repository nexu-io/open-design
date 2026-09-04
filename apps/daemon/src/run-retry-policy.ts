import type {
  TrackingRunFailureCategory,
  TrackingRunFailureDetail,
  TrackingRunFailureStage,
  TrackingRunRetryStrategy,
  TrackingRunRetrySuppressedReason,
  TrackingRunResult,
} from '@open-design/contracts/analytics';

// Counts automatic same-run retry attempts, not the initial run. Issue #3543
// scopes the first implementation to at most one automatic same-run retry, so
// the default caps retries at a single attempt (attemptCount >= 1 suppresses
// with attempt_limit_reached).
export const DEFAULT_SAFE_RUN_RETRY_MAX_ATTEMPTS = 1;
export const SAFE_RUN_RETRY_STRATEGY: TrackingRunRetryStrategy = 'same_run_transient';
export const NATIVE_SESSION_CONTINUE_STRATEGY: TrackingRunRetryStrategy =
  'native_session_continue';
export const POST_TOOL_RESUME_CONTINUATION_PROMPT =
  'Continue the interrupted turn from the current native session. ' +
  'Treat every tool result already committed in this session as completed and do not repeat those tool calls. ' +
  'Continue from the latest tool result and finish the original user request.';

// Backoff before a same-run retry restart. An immediate retry of a transient
// failure — especially a 429 — tends to re-hit the same limit, so the policy
// waits before restarting. `rate_limit` gets a larger base than other
// transient classes because the upstream is explicitly asking us to slow down.
// The delay grows exponentially by attempt index and is capped, then equal
// jitter (half fixed + half random) is applied to avoid synchronized retries
// across concurrent runs.
export const RATE_LIMIT_RETRY_BASE_DELAY_MS = 1_000;
export const TRANSIENT_RETRY_BASE_DELAY_MS = 500;
export const RETRY_BACKOFF_MULTIPLIER = 2;
export const MAX_RETRY_BACKOFF_DELAY_MS = 8_000;

function backoffBaseDelayMs(category: TrackingRunFailureCategory | undefined): number {
  return category === 'rate_limit'
    ? RATE_LIMIT_RETRY_BASE_DELAY_MS
    : TRANSIENT_RETRY_BASE_DELAY_MS;
}

// Pure, deterministic when `random` is supplied. `attemptIndex` is 1-based (the
// index of the attempt about to be scheduled), so the first retry uses the base
// delay and each subsequent attempt doubles it up to the cap. Equal jitter
// returns a value in [delay/2, delay].
export function computeRetryBackoffMs(
  attemptIndex: number,
  category: TrackingRunFailureCategory | undefined,
  random: () => number = Math.random,
): number {
  const exponent = Math.max(0, Math.floor(attemptIndex) - 1);
  const raw = backoffBaseDelayMs(category) * RETRY_BACKOFF_MULTIPLIER ** exponent;
  const capped = Math.min(raw, MAX_RETRY_BACKOFF_DELAY_MS);
  const half = capped / 2;
  const sample = random();
  const jitter = Number.isFinite(sample) ? Math.min(1, Math.max(0, sample)) : 0;
  return Math.round(half + jitter * half);
}

export interface RunRetryFailureSignal {
  failure_category?: TrackingRunFailureCategory;
  failure_detail?: TrackingRunFailureDetail;
  failure_stage?: TrackingRunFailureStage;
  retryable?: boolean;
}

export interface RunRetrySideEffectState {
  cancelRequested?: boolean;
  userVisibleOutputSeen?: boolean;
  toolCallSeen?: boolean;
  artifactWriteSeen?: boolean;
  liveArtifactSeen?: boolean;
}

export interface RunRetryPolicyInput {
  result: TrackingRunResult;
  failure?: RunRetryFailureSignal;
  attemptCount: number;
  maxAttempts?: number;
  sideEffects?: RunRetrySideEffectState;
  // Injectable jitter source for deterministic tests; defaults to Math.random.
  random?: () => number;
}

export type RunRetryPolicyDecision =
  | {
      shouldRetry: true;
      retryAttemptIndex: number;
      retryMaxAttempts: number;
      retryStrategy: TrackingRunRetryStrategy;
      retryReason: 'transient_failure' | 'post_tool_resume';
      retryDelayMs: number;
    }
  | {
      shouldRetry: false;
      retryAttemptIndex: number;
      retryMaxAttempts: number;
      retryStrategy: TrackingRunRetryStrategy;
      retrySuppressedReason: TrackingRunRetrySuppressedReason;
    };

export interface PostToolResumeRecoveryInput {
  result: TrackingRunResult;
  failure?: RunRetryFailureSignal;
  continuationAttemptCount: number;
  totalRetryAttemptCount: number;
  maxAttempts?: number;
  sideEffects?: RunRetrySideEffectState;
  supportsNativeSessionContinue: boolean;
  hasNativeSession: boolean;
}

export function decidePostToolResumeRecovery(
  input: PostToolResumeRecoveryInput,
): Extract<RunRetryPolicyDecision, { shouldRetry: true }> | null {
  const continuationAttemptCount = normalizeAttemptCount(
    input.continuationAttemptCount,
  );
  const totalRetryAttemptCount = normalizeAttemptCount(
    input.totalRetryAttemptCount,
  );
  const retryMaxAttempts = normalizeMaxAttempts(input.maxAttempts);
  const failure = input.failure;
  const sideEffects = input.sideEffects ?? {};
  const isPostToolTransientFailure =
    failure?.failure_stage === 'post_tool_resume' &&
    failure.retryable === true &&
    (
      (failure.failure_category === 'timeout' &&
        failure.failure_detail === 'inactivity_timeout') ||
      (failure.failure_category === 'upstream_unavailable' &&
        (
          failure.failure_detail === 'stream_disconnected' ||
          failure.failure_detail === 'upstream_5xx' ||
          failure.failure_detail === 'provider_high_demand' ||
          failure.failure_detail === 'provider_routing_error' ||
          failure.failure_detail === 'network_error'
        ))
    );
  if (
    input.result !== 'failed' ||
    sideEffects.cancelRequested ||
    continuationAttemptCount >= retryMaxAttempts ||
    !input.supportsNativeSessionContinue ||
    !input.hasNativeSession ||
    !sideEffects.toolCallSeen ||
    !isPostToolTransientFailure
  ) {
    return null;
  }
  return {
    shouldRetry: true,
    retryAttemptIndex: totalRetryAttemptCount + 1,
    retryMaxAttempts:
      totalRetryAttemptCount + retryMaxAttempts - continuationAttemptCount,
    retryStrategy: NATIVE_SESSION_CONTINUE_STRATEGY,
    retryReason: 'post_tool_resume',
    retryDelayMs: 0,
  };
}

function normalizeAttemptCount(attemptCount: number): number {
  if (!Number.isFinite(attemptCount) || attemptCount < 0) return 0;
  return Math.floor(attemptCount);
}

function normalizeMaxAttempts(maxAttempts: number | undefined): number {
  if (maxAttempts === undefined) return DEFAULT_SAFE_RUN_RETRY_MAX_ATTEMPTS;
  if (!Number.isFinite(maxAttempts) || maxAttempts < 0) return 0;
  return Math.floor(maxAttempts);
}

function transientSuppressedReason(
  category: TrackingRunFailureCategory | undefined,
  detail: TrackingRunFailureDetail | undefined,
  stage: TrackingRunFailureStage | undefined,
): TrackingRunRetrySuppressedReason | null {
  if (category === undefined) return 'missing_failure_signal';
  if (category === 'rate_limit') {
    return detail === 'rate_limit_429' ? null : 'non_retryable_category';
  }
  if (category === 'upstream_unavailable') {
    return detail === 'stream_disconnected' ||
      detail === 'upstream_5xx' ||
      detail === 'provider_high_demand' ||
      detail === 'provider_routing_error' ||
      detail === 'network_error'
      ? null
      : 'non_retryable_category';
  }
  if (category === 'empty_output') {
    return stage === undefined || stage === 'first_token_wait'
      ? null
      : 'unsafe_failure_stage';
  }
  if (category === 'timeout') {
    return stage === 'first_token_wait'
      ? null
      : 'unsafe_failure_stage';
  }
  if (category === 'process_exit') {
    // An `agent_protocol_error` raised while the session was still being
    // opened (`session_init`) is deterministic: the agent CLI refused the
    // handshake, so nothing streamed and re-running the identical request
    // against the identical CLI build only reproduces the same rejection.
    // Every other protocol failure reaches `child_close` — after a session
    // existed — and stays transient. Scoped to this one detail so the other
    // process-exit shapes (and a resume-expired session, which recovers by
    // reseeding) keep retrying at any stage.
    if (detail === 'agent_protocol_error') {
      return stage === 'session_init' ? 'unsafe_failure_stage' : null;
    }
    return detail === 'qoder_stop_sequence' ||
      detail === 'session_resume_expired' ||
      detail === 'stream_error' ||
      detail === 'fatal_rpc_error'
      ? null
      : 'non_retryable_category';
  }
  return 'non_retryable_category';
}

export function decideSafeRunRetry(
  input: RunRetryPolicyInput,
): RunRetryPolicyDecision {
  const attemptCount = normalizeAttemptCount(input.attemptCount);
  const retryMaxAttempts = normalizeMaxAttempts(input.maxAttempts);
  const retryAttemptIndex = attemptCount + 1;
  const base = {
    retryAttemptIndex,
    retryMaxAttempts,
    retryStrategy: SAFE_RUN_RETRY_STRATEGY,
  };
  const suppress = (
    retrySuppressedReason: TrackingRunRetrySuppressedReason,
  ): RunRetryPolicyDecision => ({
    ...base,
    shouldRetry: false,
    retrySuppressedReason,
  });

  if (input.result !== 'failed') return suppress('not_failed');

  const sideEffects = input.sideEffects ?? {};
  if (sideEffects.cancelRequested) return suppress('cancel_requested');

  const failure = input.failure;
  if (!failure) return suppress('missing_failure_signal');
  if (failure?.failure_detail === 'hard_quota') return suppress('hard_quota');
  const transientReason = transientSuppressedReason(
    failure.failure_category,
    failure.failure_detail,
    failure.failure_stage,
  );
  if (transientReason === 'non_retryable_category') return suppress(transientReason);
  if (!failure?.retryable) return suppress('not_retryable');
  if (transientReason) return suppress(transientReason);
  if (attemptCount >= retryMaxAttempts) return suppress('attempt_limit_reached');
  if (sideEffects.userVisibleOutputSeen) return suppress('user_visible_output_seen');
  if (sideEffects.toolCallSeen) return suppress('tool_call_seen');
  if (sideEffects.artifactWriteSeen) return suppress('artifact_write_seen');
  if (sideEffects.liveArtifactSeen) return suppress('live_artifact_seen');

  return {
    ...base,
    shouldRetry: true,
    retryReason: 'transient_failure',
    retryDelayMs: computeRetryBackoffMs(
      retryAttemptIndex,
      failure.failure_category,
      input.random,
    ),
  };
}
