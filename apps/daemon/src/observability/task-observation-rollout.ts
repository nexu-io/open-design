import { createHash } from 'node:crypto';

import {
  ChildEvidenceCoverageV1Schema,
  NormalizedAgentObservationV1Schema,
  type ChildEvidenceCoverageV1,
  type OdNextRolloutDecision,
} from '@open-design/contracts';
import type Database from 'better-sqlite3';

import type { TelemetryPrefs } from '../app-config.js';
import { buildSafeRunQualityProjectionFromDaemon } from '../langfuse-bridge.js';
import { readTelemetryEnvironment } from '../telemetry-environment.js';
import {
  HARD_BATCH_MAX_BYTES,
  describeRunTelemetrySink,
  postLegacyTelemetryBatch,
  readTelemetrySinkConfig,
  readTaskTelemetrySinkConfig,
  type LangfuseDeliveryState,
  type RunTelemetrySinkConfig,
  type TelemetrySinkConfig,
} from '../langfuse-trace.js';
import {
  scanRunEventsForUsageAnalytics,
  summarizeRunTimingAnalytics,
} from '../run-analytics-observability.js';
import {
  getStrategyTaskExecution,
  getStrategyTaskExecutionByRunId,
  type StrategyTaskExecutionRecord,
} from '../strategies/task-store.js';
import { assertOdNextExactSendPromptEvidence } from '../prompt-telemetry.js';
import {
  runTelemetryDeliveryIdempotencyKey,
  type RunTelemetryDeliveryStateV1,
  type RunTelemetryDeliveryResult,
} from './delivery-state.js';
import { buildStructuredMainRunObservationV1 } from './main-run-observation.js';
import { getDetectedRuntimeVersions } from '../runtimes/detection.js';
import { OD_NEXT_RUNTIME_PATH_DESCRIPTORS } from '../runtimes/od-next-capability-gate.js';
import {
  adaptMainRunToolObservationsV1,
  adaptRuntimeChildObservationsV1,
} from './runtime-child-observations.js';
import {
  aggregateStrategyTaskObservations,
  buildLegacyTaskObservationPayload,
  prepareLegacyTaskObservationExport,
  strategyTaskRootObservationId,
  TASK_OBSERVATION_SCHEMA_CAPABILITY_V1,
  type StrategyTaskObservationAggregateV1,
  type TaskObservationExportContextV1,
} from './task-observation-aggregation.js';
import {
  exportTaskObservationAggregate,
  readTaskObservationExporterConfig,
  type TaskObservationDeliveryState,
} from './task-observation-otlp-exporter.js';

export type TaskObservationRolloutMode = 'off' | 'observe' | 'send';

export interface TaskObservationRolloutConfig {
  requestedMode: 'auto' | 'off' | 'observe' | 'send' | 'invalid';
  mode: TaskObservationRolloutMode;
  context: TaskObservationExportContextV1 | null;
}

export interface TaskObservationRolloutDiagnostic {
  requestedMode: TaskObservationRolloutConfig['requestedMode'];
  mode: TaskObservationRolloutMode;
  effectiveMode: TaskObservationRolloutMode;
  environment: string | null;
  tag: string | null;
  effectiveSink: ReturnType<typeof describeRunTelemetrySink>;
  taskProtocol: 'none' | 'legacy-v1' | 'otlp-v4';
  readyToSend: boolean;
  schemaReady: boolean;
  blockedReason:
    | 'invalid_mode'
    | 'mode_not_send'
    | 'missing_environment_or_tag'
    | 'missing_sink'
    | null;
}

interface TaskRunLike {
  id: string;
  projectId?: string | null;
  conversationId?: string | null;
  assistantMessageId?: string | null;
  userPrompt?: string;
  exitCode?: number | null;
  signal?: string | null;
  error?: string | null;
  errorCode?: string | null;
  status: string;
  createdAt: number;
  updatedAt: number;
  events: Array<{ event: string; data: unknown; timestamp?: number }>;
  promptTelemetry?: Parameters<typeof buildStructuredMainRunObservationV1>[0]['promptTelemetry'];
  analyticsTelemetry?: Parameters<typeof summarizeRunTimingAnalytics>[0]['telemetry'];
  model?: string | null;
  resolvedModelId?: string | null;
  agentId?: string | null;
  preflightAgentCliVersion?: string | null;
  clientType?: 'desktop' | 'web' | 'unknown';
  langfuseCompletedAt?: number;
  telemetryDelivery?: RunTelemetryDeliveryStateV1;
  strategyRolloutDecision?: OdNextRolloutDecision | null;
}

type PersistedDeliveryStatus =
  | 'observed'
  | 'compatibility'
  | 'pending'
  | 'in_flight'
  | 'accepted'
  | 'not_expected';

interface TaskObservationDeliveryRow {
  taskExecutionId: string;
  mode: 'observe' | 'send';
  environment: string;
  tag: string;
  aggregateDigest: string | null;
  observationCount: number;
  coverageJson: string | null;
  status: PersistedDeliveryStatus;
  idempotencyKey: string | null;
  attemptCount: number;
  crashWindow: number;
  startedAt: number;
  dropReason: string | null;
  finalizedAt: number | null;
  updatedAt: number;
}

export interface TaskObservationRolloutResult {
  mode: TaskObservationRolloutMode;
  action:
    | 'compatibility'
    | 'waiting_for_task_terminal'
    | 'observed'
    | 'sent'
    | 'already_in_flight'
    | 'already_finalized'
    | 'not_expected'
    | 'failed';
  taskExecutionId?: string;
  delivery?: RunTelemetryDeliveryStateV1;
}

export interface TaskObservationRolloutService {
  readonly config: TaskObservationRolloutConfig;
  diagnostic(): TaskObservationRolloutDiagnostic;
  modeForRun(runId: string): TaskObservationRolloutMode;
  representationForRun(runId: string):
    | 'single_run'
    | 'task_pending'
    | 'task_accepted'
    | 'task_not_expected';
  notExpectedReasonForRun(runId: string): string | null;
  seedRepresentationFromRunFact(
    runId: string,
    fact: Pick<TaskRunLike, 'langfuseCompletedAt' | 'telemetryDelivery'>,
  ): Promise<void>;
  beginFinalizeForRun(runId: string): TaskObservationFinalizationHandle;
  finalizeForRun(runId: string): Promise<TaskObservationRolloutResult>;
  reconcileCrashWindows(): Promise<number>;
}

export interface TaskObservationFinalizationHandle {
  durableTaskTruth: boolean;
  suppressSingleRun: boolean;
  completion: Promise<TaskObservationRolloutResult>;
}

export interface CreateTaskObservationRolloutServiceOptions {
  db: Database.Database;
  getRun(runId: string): TaskRunLike | null | undefined;
  dataDir?: string;
  readTelemetry(): Promise<{
    prefs: TelemetryPrefs;
    installationId?: string | null;
    appVersionInfo?: { version: string; channel: string; packaged: boolean } | null;
  }>;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  now?: () => number;
  checkpointMappedRun?: (runId: string, reason: string, finalizedAt: number) => void;
}

const CONTEXT_VALUE_RE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,63}$/;
const TERMINAL_TASK_OUTCOMES = new Set(['completed', 'blocked', 'canceled']);
const PRIVACY_DROP_REASONS = new Set(['metrics_consent_off', 'content_consent_off']);
const LOCAL_COMPATIBILITY_REASONS = new Set([
  'payload_build_error',
  'payload_too_large',
  'export_mapping_mismatch',
  'schema_capability_missing',
]);

function cleanContextValue(value: string | undefined): string | null {
  const normalized = value?.trim() ?? '';
  return CONTEXT_VALUE_RE.test(normalized) ? normalized : null;
}

export function readTaskObservationRolloutConfig(
  env: NodeJS.ProcessEnv = process.env,
): TaskObservationRolloutConfig {
  const rawMode = env.OD_NEXT_TASK_OBSERVABILITY_MODE?.trim().toLowerCase();
  const requestedMode: TaskObservationRolloutConfig['requestedMode'] =
    rawMode === undefined || rawMode === '' || rawMode === 'auto'
      ? 'auto'
      : rawMode === 'observe' || rawMode === 'send' || rawMode === 'off'
        ? rawMode
        : 'invalid';
  const mode: TaskObservationRolloutMode = rawMode === undefined || rawMode === '' || rawMode === 'auto'
    ? 'send'
    : rawMode === 'observe' || rawMode === 'send' || rawMode === 'off'
      ? rawMode
      : 'off';
  const environment = Object.prototype.hasOwnProperty.call(
    env,
    'OD_NEXT_TASK_OBSERVABILITY_ENVIRONMENT',
  )
    ? cleanContextValue(env.OD_NEXT_TASK_OBSERVABILITY_ENVIRONMENT)
    : cleanContextValue(readTelemetryEnvironment(env));
  const tag = Object.prototype.hasOwnProperty.call(env, 'OD_NEXT_TASK_OBSERVABILITY_TAG')
    ? cleanContextValue(env.OD_NEXT_TASK_OBSERVABILITY_TAG)
    : 'od-next-task-v1';
  return {
    requestedMode,
    mode,
    context: environment && tag ? { environment, tag } : null,
  };
}

export function migrateTaskObservationRolloutStore(db: Database.Database): void {
  const createV2Table = (name: string) => db.exec(`
    CREATE TABLE ${name} (
      task_execution_id TEXT PRIMARY KEY,
      mode TEXT NOT NULL CHECK (mode IN ('observe', 'send')),
      environment TEXT NOT NULL,
      tag TEXT NOT NULL,
      aggregate_digest TEXT,
      observation_count INTEGER NOT NULL DEFAULT 0 CHECK (observation_count >= 0),
      coverage_json TEXT,
      status TEXT NOT NULL CHECK (
        status IN (
          'observed', 'compatibility', 'pending', 'in_flight',
          'accepted', 'not_expected'
        )
      ),
      idempotency_key TEXT,
      attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
      crash_window INTEGER NOT NULL DEFAULT 0 CHECK (crash_window IN (0, 1)),
      started_at INTEGER NOT NULL,
      drop_reason TEXT,
      finalized_at INTEGER,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(task_execution_id) REFERENCES strategy_task_executions(task_execution_id)
        ON DELETE CASCADE
    )
  `);
  const existing = db.prepare(`
    SELECT sql FROM sqlite_master
     WHERE type = 'table' AND name = 'strategy_task_observation_delivery'
  `).get() as { sql?: string } | undefined;
  if (!existing) {
    createV2Table('strategy_task_observation_delivery');
    return;
  }
  if (existing.sql?.includes("'compatibility'") && existing.sql.includes("'pending'")) {
    return;
  }
  db.transaction(() => {
    db.exec('DROP TABLE IF EXISTS strategy_task_observation_delivery_v2');
    createV2Table('strategy_task_observation_delivery_v2');
    db.exec(`
      INSERT INTO strategy_task_observation_delivery_v2 (
        task_execution_id, mode, environment, tag,
        aggregate_digest, observation_count, coverage_json,
        status, idempotency_key, attempt_count, crash_window,
        started_at, drop_reason, finalized_at, updated_at
      )
      SELECT task_execution_id, mode, environment, tag,
             aggregate_digest, observation_count, coverage_json,
             CASE
               WHEN status = 'in_flight' THEN 'pending'
               WHEN status = 'failed' AND attempt_count = 0 AND drop_reason IN (
                 'payload_build_error', 'payload_too_large',
                 'export_mapping_mismatch', 'schema_capability_missing'
               ) THEN 'compatibility'
               WHEN status = 'failed' THEN 'pending'
               WHEN status = 'not_expected' AND drop_reason IN (
                 'missing_sink_config', 'task_rollout_context_missing',
                 'mode_not_send', 'schema_capability_missing'
               ) THEN 'compatibility'
               WHEN status = 'not_expected' AND drop_reason NOT IN (
                 'metrics_consent_off', 'content_consent_off'
               ) THEN 'pending'
               WHEN status = 'not_expected' AND drop_reason IS NULL THEN 'pending'
               ELSE status
             END,
             idempotency_key, attempt_count, 0, started_at, drop_reason,
             CASE
               WHEN status IN ('accepted', 'observed') THEN finalized_at
               WHEN status = 'not_expected' AND drop_reason IN (
                 'metrics_consent_off', 'content_consent_off'
               ) THEN finalized_at
               ELSE NULL
             END,
             updated_at
        FROM strategy_task_observation_delivery
    `);
    db.exec('DROP TABLE strategy_task_observation_delivery');
    db.exec(`
      ALTER TABLE strategy_task_observation_delivery_v2
      RENAME TO strategy_task_observation_delivery
    `);
  }).immediate();
}

function rowFromDb(row: Record<string, unknown>): TaskObservationDeliveryRow {
  return {
    taskExecutionId: String(row['taskExecutionId']),
    mode: row['mode'] === 'observe' ? 'observe' : 'send',
    environment: String(row['environment']),
    tag: String(row['tag']),
    aggregateDigest:
      typeof row['aggregateDigest'] === 'string' ? row['aggregateDigest'] : null,
    observationCount: Number(row['observationCount']),
    coverageJson: typeof row['coverageJson'] === 'string' ? row['coverageJson'] : null,
    status: row['status'] as PersistedDeliveryStatus,
    idempotencyKey:
      typeof row['idempotencyKey'] === 'string' ? row['idempotencyKey'] : null,
    attemptCount: Number(row['attemptCount']),
    crashWindow: Number(row['crashWindow']),
    startedAt: Number(row['startedAt']),
    dropReason: typeof row['dropReason'] === 'string' ? row['dropReason'] : null,
    finalizedAt: typeof row['finalizedAt'] === 'number' ? row['finalizedAt'] : null,
    updatedAt: Number(row['updatedAt']),
  };
}

function readDeliveryRow(
  db: Database.Database,
  taskExecutionId: string,
): TaskObservationDeliveryRow | null {
  const row = db.prepare(`
    SELECT task_execution_id AS taskExecutionId,
           mode, environment, tag,
           aggregate_digest AS aggregateDigest,
           observation_count AS observationCount,
           coverage_json AS coverageJson,
           status,
           idempotency_key AS idempotencyKey,
           attempt_count AS attemptCount,
           crash_window AS crashWindow,
           started_at AS startedAt,
           drop_reason AS dropReason,
           finalized_at AS finalizedAt,
           updated_at AS updatedAt
      FROM strategy_task_observation_delivery
     WHERE task_execution_id = ?
  `).get(taskExecutionId) as Record<string, unknown> | undefined;
  return row ? rowFromDb(row) : null;
}

function deliveryState(row: TaskObservationDeliveryRow): RunTelemetryDeliveryStateV1 | undefined {
  if (
    row.status === 'observed'
    || row.status === 'compatibility'
    || row.status === 'pending'
    || !row.idempotencyKey
  ) return undefined;
  return {
    version: 1,
    idempotencyKey: row.idempotencyKey,
    status: row.status,
    attemptCount: row.attemptCount,
    crashWindow: row.crashWindow === 1,
    startedAt: row.startedAt,
    ...(row.dropReason ? { dropReason: row.dropReason } : {}),
    ...(row.finalizedAt !== null ? { finalizedAt: row.finalizedAt } : {}),
  };
}

function taskDeliveryIdentity(taskExecutionId: string): string {
  return `strategy-task:${taskExecutionId}`;
}

function aggregateDigest(aggregate: StrategyTaskObservationAggregateV1): string {
  return createHash('sha256').update(JSON.stringify(aggregate), 'utf8').digest('hex');
}

function capSinkRetries<T extends RunTelemetrySinkConfig>(config: T): T {
  return { ...config, retries: Math.min(config.retries, 1) };
}

function deliveryAction(delivery: RunTelemetryDeliveryStateV1): TaskObservationRolloutResult['action'] {
  if (delivery.status === 'accepted') return 'sent';
  if (delivery.status === 'not_expected') return 'not_expected';
  return 'failed';
}

function childEvidenceCoverageFromEvents(
  events: readonly unknown[],
  knownChildCount: number,
): ChildEvidenceCoverageV1 {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const record = events[index];
    if (!record || typeof record !== 'object' || Array.isArray(record)) continue;
    const data = (record as { data?: unknown }).data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) continue;
    const diagnostic = data as { type?: unknown; name?: unknown; coverage?: unknown };
    if (diagnostic.type !== 'diagnostic' || diagnostic.name !== 'child_evidence_coverage_v1') {
      continue;
    }
    const parsed = ChildEvidenceCoverageV1Schema.safeParse(diagnostic.coverage);
    if (!parsed.success) break;
    if (parsed.data.knownChildCount !== knownChildCount) {
      return {
        availability: 'partial',
        source: parsed.data.source,
        knownChildCount,
        explicitZero: false,
        limitations: [...new Set([
          ...parsed.data.limitations,
          'child_evidence_count_mismatch',
        ])],
        diagnosticCounts: parsed.data.diagnosticCounts,
      };
    }
    return parsed.data;
  }
  return {
    availability: 'unavailable',
    source: 'runtime',
    knownChildCount,
    explicitZero: false,
    limitations: ['child_evidence_collection_summary_unavailable'],
    diagnosticCounts: [],
  };
}

async function taskAggregate(
  task: StrategyTaskExecutionRecord,
  options: CreateTaskObservationRolloutServiceOptions,
  telemetry: {
    prefs: TelemetryPrefs;
    installationId?: string | null;
    appVersionInfo?: { version: string; channel: string; packaged: boolean } | null;
  },
): Promise<StrategyTaskObservationAggregateV1> {
  const observationGroups = await Promise.all(task.runs.map(async (mapping) => {
    const run = options.getRun(mapping.runId);
    if (!run) return [];
    const usage = scanRunEventsForUsageAnalytics(
      run.events,
      run.resolvedModelId ?? run.model,
      0,
    );
    const timing = summarizeRunTimingAnalytics({
      runCreatedAt: run.createdAt,
      runUpdatedAt: run.updatedAt,
      analyticsCapturedAt: run.updatedAt,
      ...(run.analyticsTelemetry ? { telemetry: run.analyticsTelemetry } : {}),
      events: run.events,
    });
    const detectedVersions = getDetectedRuntimeVersions(run.agentId);
    const runtimeAdapterVersion = OD_NEXT_RUNTIME_PATH_DESCRIPTORS.find(
      (descriptor) => descriptor.agentId === run.agentId,
    )?.runtimeAdapterVersion;
    if (run.promptTelemetry && !run.promptTelemetry.odNextExactSend) {
      throw new Error(
        'Mapped OD Next Run is missing mandatory exact-send Prompt evidence.',
      );
    }
    if (run.promptTelemetry?.odNextExactSend) {
      assertOdNextExactSendPromptEvidence({
        telemetry: run.promptTelemetry,
        persisted: mapping.finalText,
        stage: mapping.inputStage,
      });
    }
    const quality = options.dataDir
      ? await buildSafeRunQualityProjectionFromDaemon({
          db: options.db,
          dataDir: options.dataDir,
          run: {
            ...run,
            projectId: task.projectId,
            conversationId: task.conversationId,
            assistantMessageId: run.assistantMessageId ?? null,
            agentId: run.agentId ?? null,
            exitCode: run.exitCode ?? null,
            signal: run.signal ?? null,
            error: run.error ?? null,
            errorCode: run.errorCode ?? null,
            events: run.events.map((event, index) => ({ id: index + 1, ...event })),
          },
          prefs: telemetry.prefs,
          ...(telemetry.installationId !== undefined
            ? { installationId: telemetry.installationId }
            : {}),
          ...(options.env ? { env: options.env } : {}),
          ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
        })
      : undefined;
    const modelId = run.resolvedModelId ?? run.model ?? undefined;
    const taskRunObservationBase = buildStructuredMainRunObservationV1({
      taskExecutionId: task.taskExecutionId,
      runId: run.id,
      taskRunIndex: mapping.taskRunIndex,
      parentObservationId: strategyTaskRootObservationId(task.taskExecutionId),
      stage: mapping.inputStage,
      status: run.status,
      ...(modelId ? { modelId } : {}),
      ...(run.agentId ? { agentId: run.agentId } : {}),
      ...(run.promptTelemetry ? { promptTelemetry: run.promptTelemetry } : {}),
      usage,
      timing,
      startedAtMs: run.createdAt,
      endedAtMs: run.updatedAt,
      ...(quality ? { quality } : {}),
      ...(run.preflightAgentCliVersion || detectedVersions?.agentCliVersion
        ? {
            agentCliVersion:
              run.preflightAgentCliVersion ?? detectedVersions!.agentCliVersion!,
          }
        : {}),
      ...(detectedVersions?.runtimeCompanionName
        ? { runtimeCompanionName: detectedVersions.runtimeCompanionName }
        : {}),
      ...(detectedVersions?.runtimeCompanionVersion
        ? { runtimeCompanionVersion: detectedVersions.runtimeCompanionVersion }
        : {}),
      ...(runtimeAdapterVersion ? { runtimeAdapterVersion } : {}),
    });
    const mainToolObservations = adaptMainRunToolObservationsV1({
      events: run.events,
      taskExecutionId: task.taskExecutionId,
      runId: run.id,
      taskRunIndex: mapping.taskRunIndex,
      taskRunObservationId: taskRunObservationBase.identity.observationId,
      stage: mapping.inputStage,
      ...(run.preflightAgentCliVersion || detectedVersions?.agentCliVersion
        ? {
            agentCliVersion:
              run.preflightAgentCliVersion ?? detectedVersions!.agentCliVersion!,
          }
        : {}),
      ...(detectedVersions?.runtimeCompanionVersion
        ? { runtimeCompanionVersion: detectedVersions.runtimeCompanionVersion }
        : {}),
      ...(runtimeAdapterVersion ? { runtimeAdapterVersion } : {}),
    });
    const childObservations = adaptRuntimeChildObservationsV1({
      events: run.events,
      taskExecutionId: task.taskExecutionId,
      runId: run.id,
      taskRunIndex: mapping.taskRunIndex,
      taskRunObservationId: taskRunObservationBase.identity.observationId,
      stage: mapping.inputStage,
      includeChildTools: true,
      mainToolObservationIds: new Set(
        mainToolObservations.map((observation) => observation.identity.observationId),
      ),
      ...(run.preflightAgentCliVersion || detectedVersions?.agentCliVersion
        ? {
            agentCliVersion:
              run.preflightAgentCliVersion ?? detectedVersions!.agentCliVersion!,
          }
        : {}),
      ...(detectedVersions?.runtimeCompanionVersion
        ? { runtimeCompanionVersion: detectedVersions.runtimeCompanionVersion }
        : {}),
    });
    const knownChildCount = new Set(childObservations
      .filter((observation) => observation.kind === 'child_agent')
      .map((observation) => observation.identity.observationId)).size;
    const taskRunObservation = NormalizedAgentObservationV1Schema.parse({
      ...taskRunObservationBase,
      childEvidenceCoverage: childEvidenceCoverageFromEvents(run.events, knownChildCount),
    });
    return [taskRunObservation, ...mainToolObservations, ...childObservations];
  }));
  const strategyRolloutDecision = options.getRun(task.initialRunId)?.strategyRolloutDecision;
  return aggregateStrategyTaskObservations({
    task,
    observations: observationGroups.flat(),
    ...(strategyRolloutDecision ? { strategyRolloutDecision } : {}),
  });
}

function nonNetworkResult(reason: string): RunTelemetryDeliveryResult {
  return {
    langfuse_expected: false,
    langfuse_delivery_status: 'not_expected',
    langfuse_drop_reason: reason,
    langfuse_attempt_count: 0,
  };
}

function resultTerminalStatus(result: RunTelemetryDeliveryResult): 'accepted' | 'not_expected' | 'failed' {
  if (result.langfuse_expected === false) return 'not_expected';
  return result.langfuse_delivery_status === 'accepted' ? 'accepted' : 'failed';
}

function resultAttempts(result: RunTelemetryDeliveryResult): number {
  return Number.isSafeInteger(result.langfuse_attempt_count)
    && result.langfuse_attempt_count! >= 0
    ? result.langfuse_attempt_count!
    : result.langfuse_expected === false
      ? 0
      : 1;
}

export function createTaskObservationRolloutService(
  options: CreateTaskObservationRolloutServiceOptions,
): TaskObservationRolloutService {
  migrateTaskObservationRolloutStore(options.db);
  options.db.prepare(`
    UPDATE strategy_task_observation_delivery
       SET status = 'pending', crash_window = 0, finalized_at = NULL
     WHERE status = 'in_flight' AND crash_window = 1
  `).run();
  const env = options.env ?? process.env;
  const config = readTaskObservationRolloutConfig(env);
  const now = options.now ?? Date.now;
  const attemptedTaskIds = new Set<string>();
  const taskOutcomeWaiters = new Map<
    string,
    Array<(result: TaskObservationRolloutResult) => void>
  >();
  const taskAttemptOutcomes = new Map<string, TaskObservationRolloutResult>();

  const effectiveSink = (): RunTelemetrySinkConfig | null => {
    const sink = readTaskTelemetrySinkConfig(env);
    return sink ? capSinkRetries(sink) : null;
  };

  const effectiveFallbackSink = (): TelemetrySinkConfig | null => {
    const sink = readTelemetrySinkConfig(env);
    return sink ? capSinkRetries(sink) : null;
  };

  const persistInitialDecision = (
    taskExecutionId: string,
    status: 'observed' | 'compatibility' | 'pending' | 'not_expected',
    reason: string | null,
  ): TaskObservationDeliveryRow => options.db.transaction(() => {
    const existing = readDeliveryRow(options.db, taskExecutionId);
    if (existing) return existing;
    const at = now();
    const context = config.context ?? {
      environment: 'unconfigured',
      tag: 'unconfigured',
    };
    const terminal = status === 'observed' || status === 'not_expected';
    options.db.prepare(`
      INSERT INTO strategy_task_observation_delivery (
        task_execution_id, mode, environment, tag,
        aggregate_digest, observation_count, coverage_json,
        status, idempotency_key, attempt_count, crash_window,
        started_at, drop_reason, finalized_at, updated_at
      ) VALUES (?, ?, ?, ?, NULL, 0, NULL, ?, ?, 0, 0, ?, ?, ?, ?)
    `).run(
      taskExecutionId,
      status === 'observed' ? 'observe' : 'send',
      context.environment,
      context.tag,
      status,
      status === 'pending' || status === 'not_expected'
        ? runTelemetryDeliveryIdempotencyKey(taskDeliveryIdentity(taskExecutionId))
        : null,
      at,
      reason,
      terminal ? at : null,
      at,
    );
    return readDeliveryRow(options.db, taskExecutionId)!;
  }).immediate();

  const singleRunFactDecision = (
    run: Pick<TaskRunLike, 'langfuseCompletedAt' | 'telemetryDelivery'> | null | undefined,
  ): { status: 'compatibility' | 'not_expected'; reason: string } | null => {
    if (!run) return null;
    const dropReason = run.telemetryDelivery?.dropReason;
    if (
      run.telemetryDelivery?.status === 'not_expected'
      && dropReason
      && PRIVACY_DROP_REASONS.has(dropReason)
    ) {
      return { status: 'not_expected', reason: dropReason };
    }
    if (
      run.telemetryDelivery?.status === 'not_expected'
      && dropReason === 'task_hierarchy_rollout'
    ) {
      return null;
    }
    if (run.telemetryDelivery || typeof run.langfuseCompletedAt === 'number') {
      return { status: 'compatibility', reason: 'single_run_delivery_observed' };
    }
    return null;
  };

  const siblingFactDecision = (
    task: StrategyTaskExecutionRecord,
  ): { status: 'compatibility' | 'not_expected'; reason: string } | null => {
    const decisions = task.runs.flatMap((mapping) => {
      try {
        const decision = singleRunFactDecision(options.getRun(mapping.runId));
        return decision ? [decision] : [];
      } catch {
        // A local Run read fault is classified later by the pre-network
        // compatibility path. It must not prevent the provisional privacy gate.
        return [];
      }
    });
    return decisions.find((decision) => decision.status === 'not_expected')
      ?? decisions[0]
      ?? null;
  };

  const ensureRepresentation = (
    runId: string,
  ): { task: StrategyTaskExecutionRecord; row: TaskObservationDeliveryRow } | null => {
    const task = getStrategyTaskExecutionByRunId(options.db, runId);
    if (!task) return null;
    const existing = readDeliveryRow(options.db, task.taskExecutionId);
    if (existing) return { task, row: existing };
    return {
      task,
      // Privacy is asynchronous. Persist a provisional pending row first so
      // neither Task nor single-Run can cross a network boundary until the
      // current preferences have selected a tombstone or an eligible path.
      row: persistInitialDecision(task.taskExecutionId, 'pending', 'eligibility_pending'),
    };
  };

  const seedRepresentationFromRunFact = async (
    runId: string,
    fact: Pick<TaskRunLike, 'langfuseCompletedAt' | 'telemetryDelivery'>,
  ): Promise<void> => {
    const task = getStrategyTaskExecutionByRunId(options.db, runId);
    if (!task) return;
    let decision = singleRunFactDecision(fact);
    if (!decision) return;
    if (decision.status === 'compatibility') {
      const telemetry = await options.readTelemetry();
      const privacyReason = telemetry.prefs.metrics !== true
        ? 'metrics_consent_off'
        : telemetry.prefs.content !== true
          ? 'content_consent_off'
          : null;
      if (privacyReason) {
        decision = { status: 'not_expected', reason: privacyReason };
      }
    }
    const existing = readDeliveryRow(options.db, task.taskExecutionId);
    if (existing) {
      if (
        decision.status === 'compatibility'
        && existing.status === 'pending'
        && existing.dropReason === 'eligibility_pending'
      ) {
        options.db.prepare(`
          UPDATE strategy_task_observation_delivery
             SET status = 'compatibility', crash_window = 0,
                 drop_reason = ?, finalized_at = NULL, updated_at = ?
           WHERE task_execution_id = ?
             AND status = 'pending' AND drop_reason = 'eligibility_pending'
        `).run(decision.reason, now(), task.taskExecutionId);
        return;
      }
      if (decision.status !== 'not_expected') return;
      const at = now();
      options.db.prepare(`
        UPDATE strategy_task_observation_delivery
           SET mode = 'send', status = 'not_expected',
               idempotency_key = COALESCE(idempotency_key, ?),
               crash_window = 0, drop_reason = ?, finalized_at = ?, updated_at = ?
         WHERE task_execution_id = ?
           AND status IN ('observed', 'compatibility', 'pending')
      `).run(
        runTelemetryDeliveryIdempotencyKey(taskDeliveryIdentity(task.taskExecutionId)),
        decision.reason,
        at,
        at,
        task.taskExecutionId,
      );
      return;
    }
    persistInitialDecision(task.taskExecutionId, decision.status, decision.reason);
  };

  const diagnostic = (): TaskObservationRolloutDiagnostic => {
    const sink = effectiveSink();
    const directExporter = sink?.kind === 'langfuse'
      ? readTaskObservationExporterConfig(sink, env)
      : null;
    const taskProtocol = sink === null
      ? 'none' as const
      : directExporter?.mode === 'otlp'
        ? 'otlp-v4' as const
        : 'legacy-v1' as const;
    const blockedReason = config.requestedMode === 'invalid'
      ? 'invalid_mode' as const
      : config.mode !== 'send'
        ? 'mode_not_send' as const
      : config.context === null
        ? 'missing_environment_or_tag' as const
        : sink === null
          ? 'missing_sink' as const
          : null;
    return {
      requestedMode: config.requestedMode,
      mode: config.mode,
      effectiveMode: blockedReason === null
        ? 'send'
        : config.mode === 'observe'
          ? 'observe'
          : 'off',
      environment: config.context?.environment ?? null,
      tag: config.context?.tag ?? null,
      effectiveSink: describeRunTelemetrySink(sink),
      taskProtocol,
      readyToSend: blockedReason === null,
      schemaReady: true,
      blockedReason,
    };
  };

  const claimSend = (
    taskExecutionId: string,
  ): { claimed: boolean; row: TaskObservationDeliveryRow } => {
    const claim = options.db.transaction(() => {
      const existing = readDeliveryRow(options.db, taskExecutionId);
      if (!existing) throw new Error('Task observation ownership must exist before claim.');
      if (existing.status !== 'pending' || attemptedTaskIds.has(taskExecutionId)) {
        return { claimed: false, row: existing };
      }
      options.db.prepare(`
        UPDATE strategy_task_observation_delivery
           SET status = 'in_flight', crash_window = 1, updated_at = ?
         WHERE task_execution_id = ? AND status = 'pending'
      `).run(now(), taskExecutionId);
      return { claimed: true, row: readDeliveryRow(options.db, taskExecutionId)! };
    });
    const result = claim.immediate();
    if (result.claimed) attemptedTaskIds.add(taskExecutionId);
    return result;
  };

  const recordAggregate = (
    taskExecutionId: string,
    aggregate: StrategyTaskObservationAggregateV1,
  ): void => {
    options.db.prepare(`
      UPDATE strategy_task_observation_delivery
         SET aggregate_digest = ?, observation_count = ?, coverage_json = ?, updated_at = ?
       WHERE task_execution_id = ? AND status = 'in_flight'
    `).run(
      aggregateDigest(aggregate),
      aggregate.observations.length,
      JSON.stringify(aggregate.coverage),
      now(),
      taskExecutionId,
    );
  };

  const recordAttempt = (taskExecutionId: string): void => {
    options.db.prepare(`
      UPDATE strategy_task_observation_delivery
         SET attempt_count = attempt_count + 1, updated_at = ?
       WHERE task_execution_id = ? AND status = 'in_flight'
    `).run(now(), taskExecutionId);
  };

  const finalizeDelivery = (
    taskExecutionId: string,
    result: RunTelemetryDeliveryResult,
  ): TaskObservationDeliveryRow => {
    const at = now();
    const resultStatus = resultTerminalStatus(result);
    const current = readDeliveryRow(options.db, taskExecutionId);
    const dropReason = result.langfuse_drop_reason
      ?? (resultStatus === 'failed' ? 'network_error' : null);
    const status: PersistedDeliveryStatus = resultStatus === 'failed'
      ? resultAttempts(result) === 0
        && (current?.attemptCount ?? 0) === 0
        && dropReason !== null
        && LOCAL_COMPATIBILITY_REASONS.has(dropReason)
        ? 'compatibility'
        : 'pending'
      : resultStatus;
    const terminal = status === 'accepted' || status === 'not_expected';
    options.db.prepare(`
      UPDATE strategy_task_observation_delivery
         SET status = ?,
             attempt_count = MAX(attempt_count, ?),
             crash_window = 0,
             drop_reason = ?,
             finalized_at = ?,
             updated_at = ?
       WHERE task_execution_id = ? AND status = 'in_flight'
    `).run(
      status,
      resultAttempts(result),
      dropReason,
      terminal ? at : null,
      at,
      taskExecutionId,
    );
    return readDeliveryRow(options.db, taskExecutionId)!;
  };

  const recordObserved = (
    taskExecutionId: string,
    context: TaskObservationExportContextV1,
    aggregate: StrategyTaskObservationAggregateV1,
  ): void => {
    const at = now();
    options.db.prepare(`
      UPDATE strategy_task_observation_delivery
         SET aggregate_digest = ?, observation_count = ?, coverage_json = ?, updated_at = ?
       WHERE task_execution_id = ? AND status = 'observed'
    `).run(
      aggregateDigest(aggregate),
      aggregate.observations.length,
      JSON.stringify(aggregate.coverage),
      at,
      taskExecutionId,
    );
  };

  const finalizePrivacyTombstone = (
    task: StrategyTaskExecutionRecord,
    reason: string,
  ): TaskObservationDeliveryRow => {
    const at = now();
    options.db.prepare(`
      UPDATE strategy_task_observation_delivery
         SET status = 'not_expected', crash_window = 0,
             drop_reason = ?, finalized_at = ?, updated_at = ?
       WHERE task_execution_id = ? AND status IN ('pending', 'in_flight')
    `).run(reason, at, at, task.taskExecutionId);
    for (const mapping of task.runs) {
      options.checkpointMappedRun?.(mapping.runId, reason, at);
    }
    return readDeliveryRow(options.db, task.taskExecutionId)!;
  };

  const checkpointAcceptedTask = (task: StrategyTaskExecutionRecord): void => {
    const row = readDeliveryRow(options.db, task.taskExecutionId);
    if (!row || row.status !== 'accepted' || row.finalizedAt === null) return;
    for (const mapping of task.runs) {
      options.checkpointMappedRun?.(
        mapping.runId,
        'task_hierarchy_rollout',
        row.finalizedAt,
      );
    }
  };

  const deliver = async (
    aggregate: StrategyTaskObservationAggregateV1,
    context: TaskObservationExportContextV1,
    prefs: TelemetryPrefs,
    installationId: string | null | undefined,
    sink: RunTelemetrySinkConfig,
    idempotencyKey: string,
    onAttempt: () => void,
  ): Promise<TaskObservationDeliveryState | LangfuseDeliveryState> => {
    if (sink.kind === 'langfuse') {
      const direct = readTaskObservationExporterConfig(sink, env);
      if (direct) {
        return exportTaskObservationAggregate(aggregate, {
          prefs,
          config: { ...direct, retries: Math.min(direct.retries, 1) },
          ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
          deliveryIdempotencyKey: idempotencyKey,
          onDeliveryAttempt: onAttempt,
          context,
        });
      }
    }
    const plan = prepareLegacyTaskObservationExport({
      aggregate,
      prefs,
      hasEffectiveSink: true,
      context,
    });
    if (!plan.expectation.expected) {
      return {
        langfuse_expected: false,
        langfuse_delivery_status: 'not_expected',
        langfuse_drop_reason: plan.expectation.reason,
        langfuse_attempt_count: 0,
      };
    }
    const batch = buildLegacyTaskObservationPayload(aggregate, context);
    if (Buffer.byteLength(JSON.stringify({ batch }), 'utf8') > HARD_BATCH_MAX_BYTES) {
      return {
        langfuse_expected: true,
        langfuse_delivery_status: 'failed',
        langfuse_drop_reason: 'payload_too_large',
        langfuse_attempt_count: 0,
      };
    }
    let attemptCount = 0;
    const result = await postLegacyTelemetryBatch(sink, batch, {
      ...(installationId !== undefined ? { installationId } : {}),
      ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
      deliveryIdempotencyKey: idempotencyKey,
      fallbackConfig: effectiveFallbackSink(),
      maxTotalAttempts: 2,
      onAttempt: () => {
        attemptCount += 1;
        onAttempt();
      },
    });
    return { ...result, langfuse_attempt_count: attemptCount };
  };

  const retryableDeliveryState = (
    row: TaskObservationDeliveryRow,
  ): RunTelemetryDeliveryStateV1 => ({
    version: 1,
    idempotencyKey: row.idempotencyKey
      ?? runTelemetryDeliveryIdempotencyKey(taskDeliveryIdentity(row.taskExecutionId)),
    status: 'failed',
    attemptCount: row.attemptCount,
    crashWindow: false,
    startedAt: row.startedAt,
    ...(row.dropReason ? { dropReason: row.dropReason } : {}),
  });

  const finalizeTask = async (
    task: StrategyTaskExecutionRecord,
  ): Promise<TaskObservationRolloutResult> => {
    let row = readDeliveryRow(options.db, task.taskExecutionId);
    if (!row) {
      throw new Error('Task observation representation is missing.');
    }
    if (row.status === 'compatibility') {
      return { mode: 'off', action: 'compatibility', taskExecutionId: task.taskExecutionId };
    }
    if (row.status === 'observed') {
      if (TERMINAL_TASK_OUTCOMES.has(task.outcome)) {
        try {
          const telemetry = await options.readTelemetry();
          const aggregate = await taskAggregate(task, options, telemetry);
          recordObserved(task.taskExecutionId, {
            environment: row.environment,
            tag: row.tag,
          }, aggregate);
        } catch {
          return { mode: 'observe', action: 'failed', taskExecutionId: task.taskExecutionId };
        }
      }
      return { mode: 'observe', action: 'observed', taskExecutionId: task.taskExecutionId };
    }
    if (row.status === 'accepted') {
      checkpointAcceptedTask(task);
      return {
        mode: 'send',
        action: 'already_finalized',
        taskExecutionId: task.taskExecutionId,
        delivery: deliveryState(row)!,
      };
    }
    if (row.status === 'not_expected') {
      const finalizedAt = row.finalizedAt ?? now();
      for (const mapping of task.runs) {
        options.checkpointMappedRun?.(
          mapping.runId,
          row.dropReason ?? 'task_hierarchy_rollout',
          finalizedAt,
        );
      }
      return {
        mode: 'send',
        action: 'already_finalized',
        taskExecutionId: task.taskExecutionId,
        delivery: deliveryState(row)!,
      };
    }

    const telemetry = await options.readTelemetry();
    const privacyReason = telemetry.prefs.metrics !== true
      ? 'metrics_consent_off'
      : telemetry.prefs.content !== true
        ? 'content_consent_off'
        : null;
    if (privacyReason) {
      row = finalizePrivacyTombstone(task, privacyReason);
      return {
        mode: 'send',
        action: 'not_expected',
        taskExecutionId: task.taskExecutionId,
        delivery: deliveryState(row)!,
      };
    }
    if (row.status === 'pending' && row.dropReason === 'eligibility_pending') {
      const siblingFact = siblingFactDecision(task);
      if (siblingFact?.status === 'not_expected') {
        row = finalizePrivacyTombstone(task, siblingFact.reason);
        return {
          mode: 'send',
          action: 'not_expected',
          taskExecutionId: task.taskExecutionId,
          delivery: deliveryState(row)!,
        };
      }
      if (siblingFact?.status === 'compatibility') {
        options.db.prepare(`
          UPDATE strategy_task_observation_delivery
             SET status = 'compatibility', drop_reason = ?, updated_at = ?
           WHERE task_execution_id = ?
             AND status = 'pending' AND drop_reason = 'eligibility_pending'
        `).run(siblingFact.reason, now(), task.taskExecutionId);
        return finalizeTask(task);
      }
      const eligibility = config.mode === 'observe'
        ? { status: 'observed' as const, reason: null }
        : config.mode !== 'send'
          ? { status: 'compatibility' as const, reason: 'mode_not_send' }
          : config.context === null
            ? {
                status: 'compatibility' as const,
                reason: 'task_rollout_context_missing',
              }
            : TASK_OBSERVATION_SCHEMA_CAPABILITY_V1.schema
                !== 'open-design.task-observation-schema-capability/v1'
              ? {
                  status: 'compatibility' as const,
                  reason: 'schema_capability_missing',
                }
              : effectiveSink() === null
                ? { status: 'compatibility' as const, reason: 'missing_sink_config' }
                : { status: 'pending' as const, reason: null };
      options.db.prepare(`
        UPDATE strategy_task_observation_delivery
           SET status = ?, mode = ?, drop_reason = ?,
               finalized_at = CASE WHEN ? = 'observed' THEN ? ELSE NULL END,
               updated_at = ?
         WHERE task_execution_id = ?
           AND status = 'pending' AND drop_reason = 'eligibility_pending'
      `).run(
        eligibility.status,
        eligibility.status === 'observed' ? 'observe' : 'send',
        eligibility.reason,
        eligibility.status,
        now(),
        now(),
        task.taskExecutionId,
      );
      row = readDeliveryRow(options.db, task.taskExecutionId)!;
      if (row.status === 'observed' || row.status === 'compatibility') {
        return finalizeTask(task);
      }
    }
    if (!TERMINAL_TASK_OUTCOMES.has(task.outcome)) {
      return {
        mode: 'send',
        action: 'waiting_for_task_terminal',
        taskExecutionId: task.taskExecutionId,
      };
    }
    if (row.status === 'pending' && attemptedTaskIds.has(task.taskExecutionId)) {
      return {
        mode: 'send',
        action: 'failed',
        taskExecutionId: task.taskExecutionId,
        delivery: retryableDeliveryState(row),
      };
    }
    if (row.status === 'in_flight') {
      return {
        mode: 'send',
        action: 'already_in_flight',
        taskExecutionId: task.taskExecutionId,
      };
    }
    const claim = claimSend(task.taskExecutionId);
    if (!claim.claimed) {
      const claimDelivery = deliveryState(claim.row);
      return {
        mode: 'send',
        action: claim.row.status === 'pending' || claim.row.status === 'in_flight'
          ? 'already_in_flight'
          : 'already_finalized',
        taskExecutionId: task.taskExecutionId,
        ...(claimDelivery ? { delivery: claimDelivery } : {}),
      };
    }

    let result: RunTelemetryDeliveryResult | undefined;
    let aggregate: StrategyTaskObservationAggregateV1 | undefined;
    let sink: RunTelemetrySinkConfig | null = null;
    let exportContext: TaskObservationExportContextV1 | undefined;
    try {
      aggregate = await taskAggregate(task, options, telemetry);
      recordAggregate(task.taskExecutionId, aggregate);
      sink = effectiveSink();
      exportContext = {
        environment: claim.row.environment,
        tag: claim.row.tag,
        ...(telemetry.installationId !== undefined
          ? { installationId: telemetry.installationId }
          : {}),
        ...(telemetry.appVersionInfo
          ? {
              appVersion: telemetry.appVersionInfo.version,
              appChannel: telemetry.appVersionInfo.channel,
              packaged: telemetry.appVersionInfo.packaged,
            }
          : {}),
        clientType: task.runs
          .map((mapping) => options.getRun(mapping.runId)?.clientType)
          .find((value): value is 'desktop' | 'web' | 'unknown' => value !== undefined)
          ?? 'unknown',
      };
    } catch {
      result = {
        langfuse_expected: true,
        langfuse_delivery_status: 'failed',
        langfuse_drop_reason: 'payload_build_error',
        langfuse_attempt_count: 0,
      };
    }
    if (!result) {
      if (sink === null || !aggregate || !exportContext) {
        result = {
          langfuse_expected: true,
          langfuse_delivery_status: 'failed',
          langfuse_drop_reason: 'missing_sink_config',
          langfuse_attempt_count: 0,
        };
      } else {
        try {
          result = await deliver(
            aggregate,
            exportContext,
            telemetry.prefs,
            telemetry.installationId,
            sink,
            claim.row.idempotencyKey!,
            () => recordAttempt(task.taskExecutionId),
          );
        } catch {
          const persisted = readDeliveryRow(options.db, task.taskExecutionId);
          result = {
            langfuse_expected: true,
            langfuse_delivery_status: 'failed',
            langfuse_drop_reason: 'network_error',
            langfuse_attempt_count: persisted?.attemptCount ?? 0,
          };
        }
      }
    }
    const finalized = finalizeDelivery(task.taskExecutionId, result);
    if (finalized.status === 'accepted') checkpointAcceptedTask(task);
    if (finalized.status === 'compatibility') {
      return {
        mode: 'off',
        action: 'compatibility',
        taskExecutionId: task.taskExecutionId,
      };
    }
    if (finalized.status === 'pending') {
      return {
        mode: 'send',
        action: 'failed',
        taskExecutionId: task.taskExecutionId,
        delivery: retryableDeliveryState(finalized),
      };
    }
    const persisted = deliveryState(finalized)!;
    return {
      mode: 'send',
      action: deliveryAction(persisted),
      taskExecutionId: task.taskExecutionId,
      delivery: persisted,
    };
  };

  const waitForTaskOutcome = (
    taskExecutionId: string,
  ): Promise<TaskObservationRolloutResult> => new Promise((resolve) => {
    const waiters = taskOutcomeWaiters.get(taskExecutionId) ?? [];
    waiters.push(resolve);
    taskOutcomeWaiters.set(taskExecutionId, waiters);
  });

  const settleTaskOutcome = (
    taskExecutionId: string,
    result: TaskObservationRolloutResult,
  ): void => {
    const waiters = taskOutcomeWaiters.get(taskExecutionId);
    if ((waiters?.length ?? 0) > 0) {
      taskAttemptOutcomes.set(taskExecutionId, result);
      queueMicrotask(() => {
        if (taskAttemptOutcomes.get(taskExecutionId) === result) {
          taskAttemptOutcomes.delete(taskExecutionId);
        }
      });
    }
    if (!waiters) return;
    taskOutcomeWaiters.delete(taskExecutionId);
    for (const resolve of waiters) resolve(result);
  };

  const completeTask = async (
    task: StrategyTaskExecutionRecord,
  ): Promise<TaskObservationRolloutResult> => {
    const cached = taskAttemptOutcomes.get(task.taskExecutionId);
    if (cached) return cached;
    const result = await finalizeTask(task);
    if (
      result.action === 'waiting_for_task_terminal'
      || result.action === 'already_in_flight'
    ) {
      const settledWhileWaiting = taskAttemptOutcomes.get(task.taskExecutionId);
      if (settledWhileWaiting) return settledWhileWaiting;
      return waitForTaskOutcome(task.taskExecutionId);
    }
    settleTaskOutcome(task.taskExecutionId, result);
    return result;
  };

  const beginFinalizeForRun = (runId: string): TaskObservationFinalizationHandle => {
    const representation = ensureRepresentation(runId);
    if (!representation) {
      return {
        durableTaskTruth: false,
        suppressSingleRun: false,
        completion: Promise.resolve({ mode: config.mode, action: 'compatibility' }),
      };
    }
    const suppressSingleRun = representation.row.status === 'pending'
      || representation.row.status === 'in_flight'
      || representation.row.status === 'accepted'
      || representation.row.status === 'not_expected';
    return {
      durableTaskTruth: true,
      suppressSingleRun,
      completion: completeTask(representation.task),
    };
  };

  return {
    config,
    diagnostic,
    modeForRun(runId) {
      const representation = ensureRepresentation(runId);
      if (!representation) return 'off';
      if (representation.row.status === 'observed') return 'observe';
      if (representation.row.status === 'compatibility') return 'off';
      return 'send';
    },
    representationForRun(runId) {
      const representation = ensureRepresentation(runId);
      if (!representation) return 'single_run';
      if (
        representation.row.status === 'observed'
        || representation.row.status === 'compatibility'
      ) return 'single_run';
      if (representation.row.status === 'accepted') return 'task_accepted';
      if (representation.row.status === 'not_expected') return 'task_not_expected';
      return 'task_pending';
    },
    notExpectedReasonForRun(runId) {
      const task = getStrategyTaskExecutionByRunId(options.db, runId);
      if (!task) return null;
      const row = readDeliveryRow(options.db, task.taskExecutionId);
      return row?.status === 'not_expected' ? row.dropReason : null;
    },
    seedRepresentationFromRunFact,
    beginFinalizeForRun,
    finalizeForRun(runId) {
      return beginFinalizeForRun(runId).completion;
    },
    async reconcileCrashWindows() {
      const rows = options.db.prepare(`
        SELECT task_execution_id AS taskExecutionId
          FROM strategy_task_observation_delivery
         WHERE status = 'pending'
         ORDER BY started_at ASC, task_execution_id ASC
      `).all() as Array<{ taskExecutionId: string }>;
      let recovered = 0;
      for (const row of rows) {
        const task = getStrategyTaskExecution(options.db, row.taskExecutionId);
        if (!task || !TERMINAL_TASK_OUTCOMES.has(task.outcome)) continue;
        await finalizeTask(task);
        recovered += 1;
      }
      return recovered;
    },
  };
}
