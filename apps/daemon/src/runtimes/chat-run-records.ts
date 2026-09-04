// Shapes and narrowing guards for the loosely-typed rows the run routes and
// the run analytics lifecycle both read.
//
// These live outside `routes/runs.ts` so the analytics lifecycle can consume
// them without importing the route module back — a run's project row and its
// touched-artifact list are facts about the run, not about HTTP.
//
// Each guard takes the narrowest shape it actually reads rather than the full
// `ChatRun`, so a caller can hand over any object that carries those fields.

import type {
  ChatRunStatus,
  ChatRunStatusResponse,
  ProjectMetadata as ContractProjectMetadata,
  StrategyTaskProjectionV2,
} from '@open-design/contracts';
import type { AnalyticsContext } from '../analytics.js';
import type { RunArtifactBaseline } from '../run-artifact-fs.js';
import type {
  RunEventForAnalyticsObservability,
  RunTelemetryTimestamps,
} from '../run-analytics-observability.js';
import type { RunArtifactDiff } from '../run-artifact-fs.js';
import type {
  RunDiagnosticsAnalytics,
  RunEventForDiagnostics,
} from '../run-diagnostics.js';
import type { RunEventForFailureClassification } from '../run-failure-classification.js';
import type { RunWorkspaceScope } from './project-amr-trace-env.js';
import type { OdNextRolloutDecision } from '../strategies/od-next/rollout.js';
import type { OdNextTaskInputSnapshotDescriptor } from '../strategies/od-next/task-input-snapshot.js';
import type { RunTerminalLifecycleV1 } from '../observability/run-terminal-lifecycle.js';

import { getProject } from '../db.js';
import {
  validateRunDeliverable,
  type RunDeliverableValidationResult,
} from '../run-deliverable-validation.js';

export type JsonRecord = Record<string, unknown>;
export type ProjectMetadata = (Partial<ContractProjectMetadata> & JsonRecord) | null | undefined;

export interface ProjectRecord {
  id: string;
  name: string;
  createdAt?: number;
  updatedAt?: number;
  skillId?: string | null;
  designSystemId?: string | null;
  metadata?: ProjectMetadata;
  appliedPluginSnapshotId?: string | null;
}

export function toJsonRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

export function toProjectRecord(value: unknown): ProjectRecord | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as JsonRecord;
  return typeof record.id === 'string'
    ? value as ProjectRecord
    : null;
}

/** The run facts `validateChatRunDeliverable` reads. */
export interface RunForDeliverableValidation {
  projectId: string | null;
  projectMetadata?: ProjectMetadata;
}

export async function validateChatRunDeliverable(input: {
  db: Parameters<typeof getProject>[0];
  projectsRoot: string;
  run: RunForDeliverableValidation;
  runStatus: Parameters<typeof validateRunDeliverable>[0]['runStatus'];
  artifactCount: number;
  touchedPaths?: string[];
}): Promise<RunDeliverableValidationResult> {
  const project = input.run.projectId
    ? toProjectRecord(getProject(input.db, input.run.projectId))
    : null;
  return validateRunDeliverable({
    projectsRoot: input.projectsRoot,
    projectId: input.run.projectId,
    projectMetadata:
      project?.metadata ?? input.run.projectMetadata ?? null,
    runStatus: input.runStatus,
    artifactCount: input.artifactCount,
    ...(input.touchedPaths ? { touchedPaths: input.touchedPaths } : {}),
  });
}

/** The run facts `runTouchedArtifactPaths` reads. */
export interface RunForTouchedArtifactPaths {
  artifactOutcome?: { diff?: { touchedPaths?: unknown } } | undefined;
}

export function runTouchedArtifactPaths(
  run: RunForTouchedArtifactPaths,
): string[] | undefined {
  const diff = (
    run.artifactOutcome as
      | { diff?: { touchedPaths?: unknown } }
      | undefined
  )?.diff;
  return Array.isArray(diff?.touchedPaths)
    ? diff.touchedPaths.filter(
        (value): value is string => typeof value === 'string' && value.length > 0,
      )
    : undefined;
}

export interface RunEventRecord
  extends RunEventForAnalyticsObservability,
    RunEventForDiagnostics,
    RunEventForFailureClassification {
  id: number;
  event: string;
  data: unknown;
  timestamp?: number;
}

export interface SseClient {
  send(event: string, data: unknown, id?: number): void;
  end(): void;
  cleanup?(): void;
}

export interface ChatRun {
  id: string;
  projectId: string | null;
  conversationId: string | null;
  assistantMessageId: string | null;
  clientRequestId?: string | null;
  requestFingerprint?: string | null;
  strategyRolloutDecision?: OdNextRolloutDecision | null;
  agentId: string | null;
  workspaceScope?: RunWorkspaceScope | null;
  model?: string | null;
  status: ChatRunStatus;
  createdAt: number;
  updatedAt: number;
  cancelRequested?: boolean;
  cancelOrigin?: ChatRunStatusResponse['cancelOrigin'];
  terminalTrigger?: ChatRunStatusResponse['terminalTrigger'];
  terminalLifecycle?: RunTerminalLifecycleV1;
  runtimeGenerationId?: string | null;
  exitCode?: number | null;
  signal?: string | null;
  error?: string | null;
  errorCode?: string | null;
  failureAction?: string | null;
  projectMetadata?: ProjectMetadata;
  appliedPluginSnapshotId?: string | null;
  pluginId?: string | null;
  clientType?: 'desktop' | 'web' | 'external_mcp';
  sessionMode?: string | null;
  context?: Record<string, unknown> | null;
  events: RunEventRecord[];
  /** Latest validated prompt-budget projection; unlike events, this is not a tail ring. */
  promptBudgetDiagnostics?: Partial<RunDiagnosticsAnalytics> | null;
  clients: Set<SseClient>;
  analyticsContext?: AnalyticsContext;
  analyticsRecovery?: { context?: AnalyticsContext } | null;
  externalPluginAnalytics?: Record<string, unknown> | null;
  cumulativeRetryAttemptCount?: number;
  manualResumeAttemptCount?: number;
  rechargeWaitDurationMs?: number;
  artifactOriginStatus?:
    | 'matched'
    | 'missing_version'
    | 'digest_mismatch'
    | 'invalid_origin'
    | 'unknown';
  artifactVersionId?: string;
  deliverableValid?: boolean;
  deliverableValidation?: ChatRunStatusResponse['deliverableValidation'];
  deliverableEntryFile?: string;
  deliverableArtifactKind?: ChatRunStatusResponse['deliverableArtifactKind'];
  /** Shells staged for an OD Next prototype run, project-relative. */
  odNextStagedDeviceFrames?: string[];
  /** Run-finish observation: did the delivered entry carry the staged handset shell? */
  odNextDeviceShell?: {
    platform: 'ios' | 'android' | 'mobile-neutral';
    resolvedFrom: 'request-text' | 'project-metadata';
    entryFile: string;
    shellPresent: boolean;
  };
  /** Run-finish observation: how the delivered entry carries the staged layout primitives. */
  odNextLayoutPrimitives?: 'verbatim' | 'modified' | 'linked' | 'absent';
  analyticsTelemetry?: RunTelemetryTimestamps;
  resolvedModelId?: string | null;
  preflightAgentCliVersion?: string | null;
  // E-lite root-cause telemetry read at run_finished. `stdinBackpressure`: the
  // prompt write to child stdin was queued (pipe buffer full). `lastAgentActivityAt`:
  // the inactivity-watchdog clock, used to derive `last_progress_age_ms`.
  stdinBackpressure?: boolean;
  lastAgentActivityAt?: number;
  retryAttemptCount?: number;
  retryFinalResult?: string;
  retrySuppressedReason?: string;
  retryOriginalFailure?: {
    failure_category?: string;
    failure_detail?: string;
    failure_stage?: string;
    retryable?: boolean;
    user_action?: string;
  };
  artifactOutcome?: {
    artifactCount: number;
    artifactsCreated?: number;
    artifactsModified?: number;
    designSystemCreated: boolean;
    previewModuleCount: number;
    filesWritten?: number;
    diff?: RunArtifactDiff;
  };
  artifactPaths?: string[];
  designSystemId?: string | null;
  designSystemRequestedId?: string | null;
  designSystemSelectionSource?: string | null;
  designSystemDigest?: string | null;
  promptCache?: {
    stablePromptHash?: string;
    hit?: boolean;
    missReason?: string | null;
    changedSections?: string[] | null;
  };
  strategyTask?: StrategyTaskProjectionV2;
  odNextTaskInputSnapshot?: OdNextTaskInputSnapshotDescriptor | null;
}

/** Design-system selection provenance recorded on `run_created`. */
export type DesignSystemSelectionSource =
  | 'request'
  | 'plugin'
  | 'project'
  | 'app-default'
  | 'none';

export interface RunRetryAnalyticsEvent {
  event: string;
  data: Record<string, unknown>;
}

export interface RunArtifactBaselines {
  take(runId: string): RunArtifactBaseline | undefined;
}

export interface RunCreatedFallbackInput {
  analyticsContext: AnalyticsContext | null;
  run: ChatRun;
  status: string;
}

export interface RunProjectKindInput {
  hintProjectKind: string | null;
  projectMetadata?: ProjectMetadata;
}

/** A settled Run, as the analytics lifecycle reads it. */
export type TerminalRunStatus = {
  status: string;
  error?: string | null;
  errorCode?: string | null;
  exitCode?: number | null;
  signal?: string | null;
};
