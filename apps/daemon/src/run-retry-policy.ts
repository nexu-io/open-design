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
}

export type RunRetryPolicyDecision =
  | {
      shouldRetry: true;
      retryAttemptIndex: number;
      retryMaxAttempts: number;
      retryStrategy: TrackingRunRetryStrategy;
      retryReason: 'transient_failure';
    }
  | {
      shouldRetry: false;
      retryAttemptIndex: number;
      retryMaxAttempts: number;
      retryStrategy: TrackingRunRetryStrategy;
      retrySuppressedReason: TrackingRunRetrySuppressedReason;
    };

function normalizeAttemptCount(attemptCount: number): number {
  if (!Number.isFinite(attemptCount) || attemptCount < 0) return 0;
  return Math.floor(attemptCount);
}

function normalizeMaxAttempts(maxAttempts: number | undefined): number {
  if (maxAttempts === undefined) return DEFAULT_SAFE_RUN_RETRY_MAX_ATTEMPTS;
  if (!Number.isFinite(maxAttempts) || maxAttempts < 0) return 0;
  return Math.floor(maxAttempts);
}

function isTransientRetryCategory(
  category: TrackingRunFailureCategory | undefined,
  detail: TrackingRunFailureDetail | undefined,
  stage: TrackingRunFailureStage | undefined,
): boolean {
  if (category === 'rate_limit') return detail !== 'hard_quota';
  if (category === 'upstream_unavailable') return true;
  if (category === 'empty_output') return stage === undefined || stage === 'first_token_wait';
  if (category === 'timeout') return stage === 'first_token_wait';
  return false;
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
  if (failure?.failure_detail === 'hard_quota') return suppress('hard_quota');
  if (
    failure?.failure_category !== undefined &&
    !isTransientRetryCategory(
      failure.failure_category,
      failure.failure_detail,
      failure.failure_stage,
    )
  ) {
    return suppress('unsupported_category');
  }
  if (!failure?.retryable) return suppress('not_retryable');
  if (
    !isTransientRetryCategory(
      failure.failure_category,
      failure.failure_detail,
      failure.failure_stage,
    )
  ) {
    return suppress('unsupported_category');
  }
  if (attemptCount >= retryMaxAttempts) return suppress('attempt_limit_reached');
  if (sideEffects.userVisibleOutputSeen) return suppress('user_visible_output_seen');
  if (sideEffects.toolCallSeen) return suppress('tool_call_seen');
  if (sideEffects.artifactWriteSeen) return suppress('artifact_write_seen');
  if (sideEffects.liveArtifactSeen) return suppress('live_artifact_seen');

  return {
    ...base,
    shouldRetry: true,
    retryReason: 'transient_failure',
  };
}
