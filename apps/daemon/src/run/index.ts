/** @module run — Public API for agent run execution: results, analytics, diagnostics, artifacts, and tools. */

// core — result types and retry policy
export { runResultFromStatus, deriveRunErrorCode } from './core/index.js';
export type { RunResult, RunStatusForAnalytics } from './core/index.js';

export {
  DEFAULT_SAFE_RUN_RETRY_MAX_ATTEMPTS,
  SAFE_RUN_RETRY_STRATEGY,
  RATE_LIMIT_RETRY_BASE_DELAY_MS,
  TRANSIENT_RETRY_BASE_DELAY_MS,
  RETRY_BACKOFF_MULTIPLIER,
  MAX_RETRY_BACKOFF_DELAY_MS,
  computeRetryBackoffMs,
  decideSafeRunRetry,
} from './core/index.js';
export type {
  RunRetryFailureSignal,
  RunRetrySideEffectState,
  RunRetryPolicyInput,
  RunRetryPolicyDecision,
} from './core/index.js';

// analytics — timing, usage, and runtime-type observability
export {
  runtimeTypeForRunAnalytics,
  agentProviderIdForRunAnalytics,
  amrUserIdForRunAnalytics,
  hasExplicitRequestedModelForAnalytics,
  scanRunEventsForUsageAnalytics,
  summarizeRunTimingAnalytics,
} from './analytics/index.js';
export type {
  RunEventForAnalyticsObservability,
  RunTelemetryTimestamps,
  RunUsageAnalytics,
  RunTimingAnalytics,
} from './analytics/index.js';

// diagnostics — failure classification and stream tail summaries
export {
  stderrLineCountBucket,
  collectStderrTailSummary,
  collectStdoutTailSummary,
  summarizeRunDiagnosticsForAnalytics,
  isResumableFailure,
  classifyRunFailure,
} from './diagnostics/index.js';
export type {
  RunEventForDiagnostics,
  RunDiagnosticSource,
  StderrLineCountBucket,
  RunCloseReason,
  RunDiagnosticsAnalytics,
  StreamTailSummary,
  StderrTailSummary,
  StdoutTailSummary,
  RunEventForFailureClassification,
  RunFailureClassificationInput,
  RunFailureClassification,
} from './diagnostics/index.js';

// artifacts — filesystem snapshot and diff utilities
export {
  snapshotProjectArtifacts,
  diffRunArtifacts,
  createRunArtifactBaselines,
} from './artifacts/index.js';
export type {
  ArtifactFingerprint,
  ArtifactSnapshot,
  RunArtifactDiff,
  RunArtifactBaseline,
} from './artifacts/index.js';

// tools — MCP tool bundle parsing and resolution
export {
  normalizeRunToolBundleForRun,
  parseRunToolBundleForRequest,
  summarizeRunToolBundle,
  validateRunToolBundleForAgent,
  resolveExternalMcpServersForRun,
} from './tools/index.js';
export type {
  RunToolBundle,
  RunToolBundleSummary,
  ExternalMcpSelection,
  RunToolBundleParseResult,
  RunToolBundleValidationResult,
  RunToolBundleDeliveryTarget,
  RunToolBundleValidationOptions,
} from './tools/index.js';
