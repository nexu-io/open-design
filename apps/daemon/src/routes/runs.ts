import type { Express, Request, Response } from 'express';
import type Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import {
  composeOdNextStrategyContinuationV2,
  defaultScenarioPluginIdForProjectMetadata,
  InstalledPluginRecordSchema,
  RUN_RESULT_PACKAGE_SCHEMA,
  type AppliedPluginSnapshot,
  type ArtifactManifest,
  type ByokChatProviderConfig,
  type ChatRunStatus,
  type ChatRunStatusResponse,
  type CompactConversationRequest,
  type CompactConversationResponse,
  type InstalledPluginRecord,
  type StrategyTaskProjectionV2,
  type ProjectMetadata as ContractProjectMetadata,
  type RunResultPackageResponse,
} from '@open-design/contracts';
import {
  buildRunCreatedV4Aliases,
  buildRunFinishedV4Aliases,
  deriveConfigureGlobals,
  harnessAnalyticsFromRolloutDecision,
  modelIdForTracking,
  sessionModeToTracking,
  type TrackingDesignSystemSource,
  type TrackingDesignSystemKind,
  type TrackingDesignSystemEditSurface,
  type RunTaskLineageProps,
  type TrackingRunRecoveryActionType,
} from '@open-design/contracts/analytics';
import type { OdNativeEvent } from '@open-design/agui-adapter';
import { newInsertId, readAnalyticsContext } from '../analytics.js';
import type { AnalyticsContext } from '../analytics.js';
import { spawnEnvForAgent } from '../agents.js';
import { agentCliEnvForAgent, readAppConfig } from '../app-config.js';
import type { AuthorizeProjectRequest } from '../collab/project-request-authority.js';
import {
  workspaceResourceContextFromRequest,
  type BoundWorkspaceResourceMutationGate,
  type WorkspaceResourceAccessInput,
} from '../collab/workspace-resource-mutation.js';
import {
  codexSessionIdFromRunEvents,
  readCodexRolloutFirstCall,
} from '../codex-rollout-usage.js';
import type { ConnectorService } from '../connectors/service.js';
import {
  conversationTurnIndexForRun,
  getAgentSession,
  getFirstProjectConversation,
  getConversation,
  getProject,
  normalizeConversationSessionMode,
  updateProject,
  upsertMessage,
} from '../db.js';
import { readVelaLoginStatus } from '../integrations/vela.js';
import {
  ensureDetectedRuntimeCapabilities,
  ensureDetectedRuntimeVersions,
  getDetectedRuntimeVersions,
} from '../runtimes/detection.js';
import {
  odNextAdvertisedCapabilityGap,
  resolveBundledOdNextRuntimeCapability,
} from '../runtimes/od-next-capability-gate.js';
import {
  deriveLangfuseDeliveryState,
  readTelemetrySinkConfig,
} from '../langfuse-trace.js';
import { parseMediaExecutionPolicyInput } from '../media/policy.js';
import { isManagedProjectCwd } from '../mcp-config.js';
import {
  normalizeExternalPluginRunAnalyticsHints,
  OPEN_DESIGN_PLUGIN_ID,
  resolvePluginGenerationSloWindowMs,
  validatePluginWorkflowId,
} from '../mcp-observability.js';
import {
  createInternalRunCreationService,
  type InternalRunCreateInput,
  type InternalRunCreationService,
} from '../services/internal-run-service.js';
import {
  projectStrategyTask,
  projectStrategyTaskByRunId,
} from '../strategies/od-next/automatic-simple-production.js';
import {
  cancelStrategyTaskExecution,
  createStrategyTaskExecution,
  getStrategyTaskExecution,
  getStrategyTaskExecutionByRunId,
  InvalidStrategyTaskRecordError,
  type StrategyTaskExecutionRecord,
  StrategyTaskTransitionConflictError,
} from '../strategies/task-store.js';
import {
  beginStrategyClarification,
  prepareStrategyIntake,
} from '../strategies/od-next/coordinator.js';
import type { FrozenSkillPackageV1 } from '../strategies/od-next/frozen-skill-package.js';
import { InvalidFrozenSkillPackageError } from '../strategies/od-next/frozen-skill-package.js';
import type { ResolvedExamplePluginRecord } from '../strategies/od-next/example-skill-source.js';
import { captureOdNextSessionSkillPackage } from '../strategies/od-next/session-skill-package.js';
import { resolveSkillCatalogScope } from '../skill-catalog-scope.js';
import type { SkillInfo } from '../skills.js';
import {
  buildOdNextTaskConfigurationV1,
  createOdNextTaskInputSnapshot,
  OdNextTaskInputSnapshotError,
  removeOdNextTaskInputSnapshotBestEffort,
  type OdNextTaskInputSnapshotDescriptor,
} from '../strategies/od-next/task-input-snapshot.js';
import {
  evaluateOdNextRollout,
  odNextTaskTypeForProjectScenarioBinding,
  readOdNextRolloutPolicy,
  readOdNextRolloutStop,
  type OdNextRolloutDecision,
} from '../strategies/od-next/rollout.js';
import { odNextRolloutAnalyticsProperties } from '../strategies/od-next/rollout-analytics.js';
import {
  buildConnectorProbe,
  automaticScenarioTaskProfile,
  getInstalledPlugin,
  readVerifiedProjectScenarioBinding,
  readVerifiedProjectStrategyBinding,
  resolvePluginFolder,
  resolvePluginSnapshot,
  type ResolveSnapshotResult,
} from '../plugins/index.js';
import { getSnapshot, linkSnapshotToRun } from '../plugins/snapshots.js';
import {
  digestExampleSkillManifest,
  readVerifiedProjectExampleBinding,
} from '../plugins/example-binding.js';
import {
  assertSandboxProjectRootAvailable,
  isSafeId,
  listFiles,
  resolveProjectDir,
  SandboxImportedProjectError,
} from '../projects.js';
import {
  amrUserIdForRunAnalytics,
  agentProviderIdForRunAnalytics,
  hasExplicitRequestedModelForAnalytics,
  runtimeTypeForRunAnalytics,
  scanRunEventsForUsageAnalytics,
  summarizeRunTimingAnalytics,
  summarizeToolAnalytics,
  type RunEventForAnalyticsObservability,
  type RunTelemetryTimestamps,
} from '../run-analytics-observability.js';
import {
  diffRunArtifacts,
  primaryArtifactChangeForRun,
  snapshotProjectArtifacts,
  supportingAssetFilesChangedForRun,
  type RunArtifactDiff,
  type RunArtifactBaseline,
} from '../run-artifact-fs.js';
import {
  validateRunDeliverable,
  type RunDeliverableValidationResult,
} from '../run-deliverable-validation.js';
import type { RunEventForDiagnostics } from '../run-diagnostics.js';
import { summarizeRunDiagnosticsForAnalytics } from '../run-diagnostics.js';
import type { RunEventForFailureClassification } from '../run-failure-classification.js';
import { classifyRunFailure } from '../run-failure-classification.js';
import { deriveRunErrorCode, runResultFromStatus } from '../run-result.js';
import type { RunStatusForAnalytics } from '../run-result.js';
import {
  parseRunToolBundleForRequest,
  validateRunToolBundleForAgent,
} from '../run-tool-bundle.js';
import type { DetectedAgent, RuntimeAgentDef } from '../runtimes/types.js';
import {
  buildOpenCodeByokProviderConfig,
  BYOK_OPENCODE_AGENT_ID,
  BYOK_OPENCODE_PROVIDER_REQUIRED_MESSAGE,
} from '../runtimes/byok-opencode.js';
import { resolveChatRunInactivityTimeoutMs } from '../runtimes/chat-run-lifecycle.js';
import { runMessageEventPersistenceAnalytics } from '../runtimes/chat-run-messages.js';
import { TERMINAL_RUN_STATUSES } from '../runtimes/runs.js';
import {
  deriveActivationMilestones,
  runAskedUserQuestion,
} from '../runtimes/run-artifacts.js';
import {
  accountScopedRunWorkspaceScopeForProject,
  pinRunWorkspaceScopeForProject,
  type RunWorkspaceScope,
} from '../runtimes/project-amr-trace-env.js';
import {
  runArtifactCountForRun,
  runDesignSystemCreatedForRun,
  runFilesWrittenForRun,
  runPreviewModuleCountForRun,
} from '../runtimes/run-lifecycle-analytics.js';
import {
  normalizeCommentAttachments,
  UPLOAD_DIR,
} from '../runtimes/chat-prompt-inputs.js';
import { createRunAnalyticsLifecycle } from '../services/run-analytics-lifecycle.js';
import {
  runTouchedArtifactPaths,
  toJsonRecord,
  toProjectRecord,
  validateChatRunDeliverable,
  type ChatRun,
  type JsonRecord,
  type RunArtifactBaselines,
  type RunCreatedFallbackInput,
  type RunProjectKindInput,
  type RunRetryAnalyticsEvent,
  type ProjectMetadata,
  type ProjectRecord,
  type RunEventRecord,
  type SseClient,
} from '../runtimes/chat-run-records.js';

// Keep in sync with the web uploader's `looksLikeImage` (apps/web registry):
// omit-pin seeds must classify the same extensions as `image` so reload chips
// match the original staged attachment kind.
const SEEDED_USER_IMAGE_EXTS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.avif',
  '.svg',
  '.bmp',
]);

type SqliteDb = Database.Database;
type ApiRequest = Request<Record<string, string>, unknown, JsonRecord>;
type ApiResponse = Response<unknown>;
type AgentCliEnv = Parameters<typeof agentCliEnvForAgent>[0];
type RunDeliveryTarget = 'managed-project' | 'external-project' | 'none';
type SeededCommentAttachment = ReturnType<typeof normalizeCommentAttachments>[number] & {
  slideIndex?: number;
};

/**
 * Deck annotations carry a zero-based `slideIndex` so reload/retry can flip the
 * preview via `queuedSlideNavTarget`. The prompt normalizer intentionally omits
 * it; re-attach from the raw request when seeding persisted messages.
 */
function seededSlideIndexFromRaw(raw: unknown): number | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const slideIndex = (raw as { slideIndex?: unknown }).slideIndex;
  if (typeof slideIndex !== 'number' || !Number.isFinite(slideIndex) || slideIndex < 0) {
    return undefined;
  }
  return Math.floor(slideIndex);
}

function withSeededSlideIndex(
  normalized: ReturnType<typeof normalizeCommentAttachments>,
  rawCommentAttachments: unknown[],
): SeededCommentAttachment[] {
  return normalized.map((item, index) => {
    const rawById = rawCommentAttachments.find(
      (entry) =>
        entry &&
        typeof entry === 'object' &&
        !Array.isArray(entry) &&
        typeof (entry as { id?: unknown }).id === 'string' &&
        (entry as { id: string }).id === item.id,
    );
    const slideIndex = seededSlideIndexFromRaw(rawById ?? rawCommentAttachments[index]);
    return slideIndex === undefined ? item : { ...item, slideIndex };
  });
}

/**
 * Map ChatRunCreateRequest attachment fields onto the ChatMessage shape used by
 * upsertMessage / listMessages. Request `attachments` are project-relative
 * path strings; persisted messages store `{ path, name, kind, order }` so the
 * UI can reload chips and annotation context after a headless omit-pin seed.
 */
function seededUserMessageAttachmentFields(meta: JsonRecord): {
  attachments?: Array<{ path: string; name: string; kind: 'image' | 'file'; order: number }>;
  commentAttachments?: SeededCommentAttachment[];
} {
  const attachments = Array.isArray(meta.attachments)
    ? meta.attachments
        .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
        .map((attachmentPath, index) => {
          const name = path.basename(attachmentPath) || attachmentPath;
          const ext = path.extname(name).toLowerCase();
          return {
            path: attachmentPath,
            name,
            kind: SEEDED_USER_IMAGE_EXTS.has(ext) ? ('image' as const) : ('file' as const),
            order: index,
          };
        })
    : [];
  const rawCommentAttachments = Array.isArray(meta.commentAttachments)
    ? meta.commentAttachments
    : [];
  const commentAttachments = withSeededSlideIndex(
    normalizeCommentAttachments(
      rawCommentAttachments as Parameters<typeof normalizeCommentAttachments>[0],
    ),
    rawCommentAttachments,
  );
  return {
    ...(attachments.length > 0 ? { attachments } : {}),
    ...(commentAttachments.length > 0 ? { commentAttachments } : {}),
  };
}

/**
 * Map request/run turn metadata onto the ChatMessage fields the web client
 * writes via PUT /messages. ChatPane and ProjectView retry both re-read
 * sessionMode / runContext / appliedPluginSnapshot from the user message after
 * reload, so omit-pin seeds must persist the same columns.
 */
function seededUserMessageTurnMetadataFields(
  meta: JsonRecord,
  appliedPluginSnapshot?: AppliedPluginSnapshot | null,
): {
  sessionMode?: string;
  runContext?: Record<string, unknown>;
  appliedPluginSnapshot?: AppliedPluginSnapshot;
} {
  const runContext =
    meta.context && typeof meta.context === 'object' && !Array.isArray(meta.context)
      ? (meta.context as Record<string, unknown>)
      : undefined;
  return {
    ...(typeof meta.sessionMode === 'string' && meta.sessionMode
      ? { sessionMode: meta.sessionMode }
      : {}),
    ...(runContext ? { runContext } : {}),
    ...(appliedPluginSnapshot ? { appliedPluginSnapshot } : {}),
  };
}




interface RunCreateMeta extends InternalRunCreateInput, JsonRecord {
  projectId?: string;
  conversationId?: string;
  userMessageId?: string;
  assistantMessageId?: string;
  clientRequestId?: string;
  requestFingerprint?: string;
  strategyRolloutDecision?: OdNextRolloutDecision;
  agentId?: string;
  pluginId?: string;
  appliedPluginSnapshotId?: string;
  message?: string;
  currentPrompt?: string;
  projectMetadata?: ProjectMetadata;
  workspaceScope?: RunWorkspaceScope | null;
  odNextTaskInputSnapshot?: OdNextTaskInputSnapshotDescriptor | null;
}

/**
 * Invariant: a conversation runs at most one design-system enrichment
 * ("AI Optimize") pass at a time.
 *
 * The enrichment turn is a hidden, seeded prompt that refines the SAME
 * registered design system in place, so two concurrent passes bill twice and
 * race on identical files. Incident 2026-07-28: one double-triggered UI
 * affordance created two enrichment runs 383 ms apart in one conversation and
 * both were billed. Ordinary chat turns are deliberately NOT gated here — the
 * web composer already queues them while the conversation is busy, and a
 * "send now" interrupt may legitimately overlap the run it is cancelling.
 *
 * Returns the non-terminal run that already owns the conversation's
 * enrichment pass, or null when the request may proceed.
 */
function activeRunBlockingDesignSystemEnrichment(
  runs: Pick<ChatRunService, 'list'>,
  input: {
    conversationId: unknown;
    analyticsHints: unknown;
    /** The optimistically created run for this request; it never blocks itself. */
    excludeRunId?: string | null;
  },
): ChatRun | null {
  const hints = input.analyticsHints;
  const isEnrichment =
    hints !== null
    && typeof hints === 'object'
    && !Array.isArray(hints)
    && (hints as Record<string, unknown>).dsEnrichment === true;
  if (!isEnrichment) return null;
  if (typeof input.conversationId !== 'string' || !input.conversationId) return null;
  const active = runs
    .list({ conversationId: input.conversationId, status: 'active' })
    .filter((run) => run.id !== input.excludeRunId);
  return active[0] ?? null;
}

interface RunListFilters {
  projectId?: unknown;
  conversationId?: unknown;
  status?: unknown;
}

interface ChatRunService {
  create(meta: RunCreateMeta): ChatRun;
  createOrReuse(meta: RunCreateMeta):
    | { kind: 'created'; run: ChatRun }
    | { kind: 'reused'; run: ChatRun }
    | { kind: 'conflict'; run: ChatRun };
  prepareRestart(run: ChatRun): ChatRun | null;
  get(id: string): ChatRun | null;
  findByPluginWorkflowId(pluginWorkflowId: string): ChatRun | null;
  list(filters: RunListFilters): ChatRun[];
  statusBody(run: ChatRun): ChatRunStatusResponse;
  stream(run: ChatRun, req: Request, res: Response): void;
  start(run: ChatRun, starter: () => Promise<unknown>): ChatRun;
  fail(run: ChatRun, code: string, message: string): void;
  wait(run: ChatRun): Promise<ChatRunStatusResponse>;
  cancel(
    run: ChatRun,
    origin?: NonNullable<ChatRunStatusResponse['cancelOrigin']>,
  ): Promise<ChatRunStatusResponse>;
  /** Undo an optimistically-created run (e.g. a failed ownership claim). */
  drop(run: ChatRun): void;
  /** Persist daemon-owned state assigned during an atomic claim hook. */
  persistState(run: ChatRun): void;
  isTerminal(status: ChatRunStatus): boolean;
  emit?(run: ChatRun, event: string, data: unknown): RunEventRecord;
  setAnalyticsRecovery?(run: ChatRun, recovery: {
    context: AnalyticsContext;
    properties: Record<string, unknown>;
    insertId: string;
  }): void;
  markAnalyticsCompleted?(run: ChatRun): void;
  setDeliverableValidation?(
    run: ChatRun,
    result: RunDeliverableValidationResult,
  ): void;
}

interface AnalyticsService {
  capture(input: {
    eventName: string;
    context: AnalyticsContext;
    appVersion: string;
    properties: Record<string, unknown>;
    insertId: string;
  }): void | Promise<void>;
}

interface RunRoutesDesignService {
  runs: ChatRunService;
  analytics: AnalyticsService;
  getAppVersion(): string;
}

/**
 * The Skill catalogue a run resolves user-selected Skills from. Same listing
 * the system-prompt composer reads, scoped through
 * `resolveSkillCatalogScope`, so a Skill admitted on one surface is
 * resolvable on the other.
 */
interface RunRoutesSkillCatalogService {
  listAllSkillLikeEntries: (options?: {
    workspaceId?: string | null;
    workspaceMemberId?: string | null;
  }) => Promise<readonly SkillInfo[]>;
}

interface ProjectFileEntry {
  name: string;
  artifactKind?: string | null;
  artifactManifest?: ArtifactManifest | JsonRecord | null;
}

interface SseResponse {
  send(event: string, data: unknown, id?: number): void;
  end(): void;
  cleanup?(): void;
}

class AutomaticOdNextPreparationError extends Error {
  readonly preparationCause: unknown;

  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = 'AutomaticOdNextPreparationError';
    this.preparationCause = cause;
  }
}

type SuccessfulRunSnapshotResolution = Omit<
  Extract<ResolveSnapshotResult, { ok: true }>,
  'created'
> & {
  created?: boolean;
  status?: number;
};

function removeProvisionalAutomaticSnapshot(
  db: SqliteDb,
  resolution: SuccessfulRunSnapshotResolution | null,
): boolean {
  if (
    resolution?.created !== true
    || resolution.snapshot.pluginId !== 'od-next-strategy'
  ) return false;
  const deleted = db.prepare(`
    DELETE FROM applied_plugin_snapshots
     WHERE id = ?
       AND plugin_id = 'od-next-strategy'
       AND run_id IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM projects
          WHERE applied_plugin_snapshot_id = applied_plugin_snapshots.id
       )
       AND NOT EXISTS (
         SELECT 1 FROM conversations
          WHERE applied_plugin_snapshot_id = applied_plugin_snapshots.id
       )
       AND NOT EXISTS (
         SELECT 1 FROM strategy_task_executions
          WHERE snapshot_id = applied_plugin_snapshots.id
       )
  `).run(resolution.snapshotId);
  return deleted.changes === 1;
}

function automaticOdNextFallbackDecision(
  decision: OdNextRolloutDecision,
  reasonCode: string,
): OdNextRolloutDecision {
  return {
    ...decision,
    decisionClass: 'observe',
    effectiveMode: 'observe',
    eligible: false,
    reasonCodes: [reasonCode, ...decision.reasonCodes.filter((reason) => reason !== reasonCode)],
    primaryReasonCode: reasonCode,
  };
}

export interface RegisterRunRoutesDeps {
  db: SqliteDb;
  design: RunRoutesDesignService;
  resources: RunRoutesSkillCatalogService;
  http: {
    createSseResponse: (res: Response) => SseResponse;
    sendApiError: (
      res: Response,
      status: number,
      code: string,
      message: string,
      details?: Record<string, unknown>,
    ) => Response<unknown> | void;
  };
  paths: {
    BUNDLED_PLUGINS_DIR?: string;
    PROJECTS_DIR: string;
    RUNTIME_DATA_DIR: string;
  };
  agents: {
    detectAgents: (agentCliEnv?: Record<string, unknown>) => Promise<DetectedAgent[]>;
    getAgentDef: (agentId: string) => RuntimeAgentDef | null | undefined;
  };
  chat: {
    startChatRun: (meta: RunCreateMeta, run: ChatRun) => Promise<unknown>;
    prepareOdNextInitialPromptBundle?: (input: {
      meta: RunCreateMeta;
      frozenSkillPackage: FrozenSkillPackageV1;
      taskInputSnapshot: OdNextTaskInputSnapshotDescriptor;
    }) => Promise<{
      text: string;
    }>;
  };
  lifecycle: {
    isDaemonShuttingDown: () => boolean;
  };
  plugins: {
    connectorService: ConnectorService;
    detectSkillPluginCandidateOnRunSuccess: (
      db: SqliteDb,
      runs: ChatRunService,
      run: ChatRun,
      input: JsonRecord,
      projectRoot: string,
    ) => void;
    firePipelineForRun: (args: {
      run: ChatRun;
      snapshot: AppliedPluginSnapshot;
      runs: ChatRunService;
      db: SqliteDb;
    }) => void;
    loadPluginRegistryView: (options?: {
      workspaceId?: string | null;
      workspaceMemberId?: string | null;
    }) => Promise<Parameters<typeof resolvePluginSnapshot>[0]['registry']>;
    renderPluginBriefTemplate: (template: string, inputs?: Record<string, unknown>) => string;
    /**
     * Exact local catalogue lookup, the same one `/api/plugins/:id/apply-local`
     * and project create use. Run start re-resolves a project's example
     * binding through it instead of trusting the stored path.
     */
    getLocalPluginBySource?: (
      id: string,
      source: string,
    ) => Promise<ResolvedExamplePluginRecord | null>;
    /**
     * Fail-closed request-scoped plugin lookup. The catalog API and the run
     * API must use the same Workspace/member visibility rules; otherwise a
     * caller can bypass a hidden Personal plugin by posting its id directly
     * to /api/runs.
     */
    authorizePluginRequest?: (
      req: ApiRequest,
      res: ApiResponse,
      pluginId: string,
    ) => Promise<boolean>;
  };
  telemetry: {
    reportRunCompletionTelemetryFallback: (input: RunCreatedFallbackInput) => void;
    resolveRunProjectKindForAnalytics: (input: RunProjectKindInput) => string | null;
    runArtifactBaselines: RunArtifactBaselines;
    runRetryEventsForAnalytics: (events: RunEventRecord[]) => RunRetryAnalyticsEvent[];
  };
  messages: {
    pinAssistantMessageOnRunCreate: (
      db: SqliteDb,
      run: ChatRun,
      opts?: {
        status?: string;
        beforeFreshInsert?: () => void;
        beforeClaimCommit?: () => void;
        isRunActive?: (runId: string) => boolean;
      },
    ) => { ok: boolean; reason?: 'active' | 'scope' };
    reconcileAssistantMessageOnRunEnd: (
      db: SqliteDb,
      runs: ChatRunService,
      run: ChatRun,
    ) => void;
  };
  /**
   * Process-owned physical Run seam. The composition root supplies one shared
   * instance so non-HTTP coordinators can reuse the exact create/claim/start
   * path. Route-only fixtures may omit it and receive an equivalent local
   * instance around their injected run registry.
   */
  internalRuns?: InternalRunCreationService<RunCreateMeta, ChatRun>;
  /**
   * Workspace-identity gate for POST /api/runs and POST /api/chat — this
   * file's two "create a run" entry points. Until this fix both had ZERO
   * `enforceWorkspace*` coverage: unlike rename/delete/duplicate/writeFiles
   * and comments (all gated per spec 04 §10/§11), any caller who knew a
   * projectId could spawn an agent run against it — including a project
   * bound to a TEAM workspace — with no workspace identity headers at all.
   *
   * Borrows the SAME `enforceWorkspaceProjectMutation` instance
   * `routes/project/index.ts` builds via `createEnforceWorkspaceProjectMutation`
   * (cross-checked against the daemon's own last-known membership) rather
   * than re-deriving a second, possibly-drifting copy here — see
   * `routes/project/comments.ts` for the established borrow-the-project's-
   * gate pattern this mirrors.
   *
   * Optional, and a no-op when omitted, so fixtures that only exercise run
   * creation (most of this file's existing tests, which use plain
   * non-workspace-bound projects) keep compiling and behaving exactly as
   * before — an unbound project's runs were never gated either way, since
   * `enforceWorkspaceResourceMutation` itself passes a `row === null` lookup
   * straight through regardless of ctx.
   */
  enforceWorkspaceProjectMutation?: BoundWorkspaceResourceMutationGate;
  /** Fresh exact authority for run reads/cancel after resolving run.projectId. */
  authorizeProjectRequest?: AuthorizeProjectRequest;
  /**
   * Paired with `enforceWorkspaceProjectMutation` above: the SAME
   * `workspace_projects` binding lookups project's own mutation routes
   * already use, so a run's gate reads the identical row rename/delete/
   * duplicate/comments already check instead of a second query shape.
   */
  projectStore?: {
    // `db` is typed `any` here (matching `BoundWorkspaceResourceMutationGate`'s
    // own `db: unknown` seam) purely to sidestep strict-function-type
    // contravariance: the concrete `db.ts` implementations take `SqliteDb`,
    // and this field's value is threaded straight into
    // `enforceWorkspaceProjectMutation`'s matching `db: unknown` parameters.
    getWorkspaceProject: (
      db: any,
      workspaceId: string,
      projectId: string,
    ) => WorkspaceResourceAccessInput | null | undefined;
    getWorkspaceProjectByProjectId: (
      db: any,
      projectId: string,
    ) => (WorkspaceResourceAccessInput & { workspaceId?: string | null }) | null | undefined;
    ensureWorkspaceProject?: (
      db: any,
      input: Record<string, unknown>,
    ) => (WorkspaceResourceAccessInput & { workspaceId?: string | null }) | null | undefined;
  };
  amrWorkspaceScope?: {
    isSignedIn: () => boolean | Promise<boolean>;
  };
}

const AGUI_NATIVE_EVENT_KINDS: ReadonlySet<OdNativeEvent['kind']> = new Set([
  'message_chunk',
  'tool_call',
  'state_update',
  'end',
  'run_started',
  'pipeline_stage_started',
  'pipeline_stage_completed',
  'genui_surface_request',
  'genui_surface_response',
  'genui_surface_timeout',
  'genui_state_synced',
]);

function toProjectFiles(value: unknown): ProjectFileEntry[] {
  return Array.isArray(value)
    ? value.filter((item): item is ProjectFileEntry =>
        Boolean(item && typeof item === 'object' && typeof (item as JsonRecord).name === 'string'),
      )
    : [];
}

// Intents the scenario-plugin fallback resolver is allowed to see. Mirrors the
// `ProjectMetadata['intent']` contract union so an unknown/legacy string in a
// stored project row never gets cast into the union.
const SCENARIO_PROJECT_INTENTS: readonly NonNullable<ContractProjectMetadata['intent']>[] = [
  'live-artifact',
  'web-clone',
  'document',
  'marketing',
  'hyperframes',
];

function toScenarioProjectIntent(value: unknown): ContractProjectMetadata['intent'] | undefined {
  return SCENARIO_PROJECT_INTENTS.find((intent) => intent === value);
}

function toScenarioProjectMetadata(
  metadata: ProjectMetadata,
): Pick<ContractProjectMetadata, 'kind' | 'intent'> | null {
  if (!metadata || typeof metadata.kind !== 'string') return null;
  const intent = toScenarioProjectIntent(metadata.intent);
  return {
    kind: metadata.kind as ContractProjectMetadata['kind'],
    ...(intent ? { intent } : {}),
  };
}

type DesignSystemSelectionSource = 'request' | 'plugin' | 'project' | 'app-default' | 'none';

function routeParamId(req: ApiRequest): string | null {
  return typeof req.params.id === 'string' && req.params.id.length > 0
    ? req.params.id
    : null;
}

function withoutSensitiveRunInput(body: JsonRecord): JsonRecord {
  const sanitized = { ...body };
  delete sanitized.byokProvider;
  delete sanitized.byokProfileId;
  delete sanitized.apiKey;
  delete sanitized.rechargeResumeCapability;
  // Workspace scope is a server-issued authorization fact, not a request option.
  delete sanitized.workspaceScope;
  delete sanitized.odNextTaskInputSnapshot;
  return sanitized;
}

function canonicalJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as JsonRecord)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalJsonValue(nested)]),
    );
  }
  return value;
}

function semanticPluginSnapshot(
  snapshot: AppliedPluginSnapshot | null | undefined,
): Record<string, unknown> | null {
  if (!snapshot) return null;
  const {
    snapshotId: _snapshotId,
    appliedAt: _appliedAt,
    status: _status,
    ...semantic
  } = snapshot;
  return semantic;
}

function runRequestFingerprint(
  meta: RunCreateMeta,
  appliedPluginSnapshot?: AppliedPluginSnapshot | null,
): string {
  // Fingerprint the complete execution-shaping request, not a hand-picked
  // subset that silently aliases system prompts, attachments, context,
  // research or media defaults. Exclude only transport/recovery metadata,
  // analytics-only source hints and derived mutable rows. A freshly-created
  // snapshot id is deliberately excluded; its immutable semantic content is
  // included instead so a lost-response retry neither conflicts spuriously
  // nor ignores a real plugin upgrade.
  const logicalRequest = { ...meta } as JsonRecord;
  delete logicalRequest.clientRequestId;
  delete logicalRequest.requestFingerprint;
  delete logicalRequest.resume;
  delete logicalRequest.analyticsHints;
  delete logicalRequest.userMessageId;
  delete logicalRequest.assistantMessageId;
  delete logicalRequest.projectMetadata;
  delete logicalRequest.appliedPluginSnapshotId;
  logicalRequest.appliedPluginSnapshot =
    semanticPluginSnapshot(appliedPluginSnapshot);
  return createHash('sha256')
    .update(JSON.stringify(canonicalJsonValue(logicalRequest)))
    .digest('hex');
}

const EXTERNAL_PLUGIN_ANALYTICS_KEYS = [
  'entrySurface',
  'hostProduct',
  'externalPluginId',
  'externalPluginVersion',
  'distributionMechanism',
  'publisherClass',
  'attributionQuality',
  'pluginWorkflowId',
  'logicalRequestDigest',
  'logicalRequestDigestVersion',
] as const;

function externalPluginAttributionMismatch(
  existing: Record<string, unknown> | null | undefined,
  incoming: unknown,
): boolean {
  const next =
    incoming && typeof incoming === 'object' && !Array.isArray(incoming)
      ? (incoming as Record<string, unknown>)
      : null;
  const existingIsPlugin =
    existing?.externalPluginId === OPEN_DESIGN_PLUGIN_ID;
  const nextIsPlugin = next?.externalPluginId === OPEN_DESIGN_PLUGIN_ID;
  if (!existingIsPlugin && !nextIsPlugin) return false;
  if (!existingIsPlugin || !nextIsPlugin) return true;
  return EXTERNAL_PLUGIN_ANALYTICS_KEYS.some(
    (key) => existing[key] !== next[key],
  );
}

function hasCompleteByokOpenCodeConfig(meta: JsonRecord): boolean {
  if (meta.agentId !== BYOK_OPENCODE_AGENT_ID) return true;
  return buildOpenCodeByokProviderConfig(
    meta.byokProvider as ByokChatProviderConfig | null | undefined,
    typeof meta.model === 'string' ? meta.model : null,
  ) !== null;
}

function toOdNativeEvent(record: RunEventRecord): OdNativeEvent | null {
  if (!AGUI_NATIVE_EVENT_KINDS.has(record.event as OdNativeEvent['kind'])) return null;
  return { kind: record.event, ...toJsonRecord(record.data) } as OdNativeEvent;
}

export function sendStructuredRunCreateFailure(
  res: ApiResponse,
  sendApiError: RegisterRunRoutesDeps['http']['sendApiError'],
  error: unknown,
  requestId: string = randomUUID(),
): Response<unknown> | void {
  const rawCode = (error as NodeJS.ErrnoException)?.code;
  const code = typeof rawCode === 'string' && /^[A-Z0-9_]+$/.test(rawCode)
    ? rawCode
    : 'UNKNOWN';
  console.error(`[runs] preparation failed request=${requestId} code=${code}`);
  return sendApiError(
    res,
    500,
    'INTERNAL_ERROR',
    'Run preparation failed.',
    { requestId },
  );
}

export function registerRunCreateRoute(
  app: Express,
  handleRunCreate: (req: ApiRequest, res: ApiResponse) => Promise<unknown>,
  sendApiError: RegisterRunRoutesDeps['http']['sendApiError'],
): void {
  app.post('/api/runs', async (req: ApiRequest, res: ApiResponse) => {
    try {
      return await handleRunCreate(req, res);
    } catch (error) {
      if (res.headersSent) throw error;
      return sendStructuredRunCreateFailure(res, sendApiError, error);
    }
  });
}

export function registerRunRoutes(app: Express, ctx: RegisterRunRoutesDeps) {
  const { db, design } = ctx;
  const { createSseResponse, sendApiError } = ctx.http;
  const { BUNDLED_PLUGINS_DIR, PROJECTS_DIR, RUNTIME_DATA_DIR } = ctx.paths;
  const taskInputSnapshotsRoot = path.join(RUNTIME_DATA_DIR, 'od-next-task-inputs');
  const { detectAgents, getAgentDef } = ctx.agents;
  const { startChatRun } = ctx.chat;
  const prepareOdNextInitialPromptBundle = ctx.chat.prepareOdNextInitialPromptBundle
    ?? (async () => {
      throw new Error('OD Next Prompt Bundle preparation service is unavailable.');
    });
  const {
    connectorService,
    detectSkillPluginCandidateOnRunSuccess,
    firePipelineForRun,
    loadPluginRegistryView,
    renderPluginBriefTemplate,
  } = ctx.plugins;
  const {
    reportRunCompletionTelemetryFallback,
    resolveRunProjectKindForAnalytics,
    runArtifactBaselines,
    runRetryEventsForAnalytics,
  } = ctx.telemetry;
  const {
    pinAssistantMessageOnRunCreate,
    reconcileAssistantMessageOnRunEnd,
  } = ctx.messages;
  const internalRuns = ctx.internalRuns ?? createInternalRunCreationService({
    runs: design.runs,
    claimAssistantMessage: (run, options) =>
      pinAssistantMessageOnRunCreate(db, run, options),
    analyticsLifecycle: createRunAnalyticsLifecycle({
      db,
      design,
      paths: { PROJECTS_DIR, RUNTIME_DATA_DIR },
      agents: { detectAgents },
      telemetry: ctx.telemetry,
    }),
  });
  const strategyTaskForRun = (run: ChatRun): StrategyTaskExecutionRecord | null => {
    const task = getStrategyTaskExecutionByRunId(db, run.id);
    if (!task && run.odNextTaskInputSnapshot) {
      throw new InvalidStrategyTaskRecordError(
        'OD Next Run retains an immutable input owner but has no persisted task mapping.',
      );
    }
    if (
      task
      && (
        !run.odNextTaskInputSnapshot
        || run.odNextTaskInputSnapshot.taskExecutionId !== task.taskExecutionId
        || run.odNextTaskInputSnapshot.manifestSha256
          !== task.frozenInputIdentity.taskInputManifestSha256
        || run.projectId !== task.projectId
        || run.conversationId !== task.conversationId
        || run.agentId !== task.selectedAgentId
        || run.appliedPluginSnapshotId !== task.snapshotId
      )
    ) {
      throw new InvalidStrategyTaskRecordError(
        'OD Next Run and immutable input owner do not match the persisted task scope.',
      );
    }
    return task;
  };
  const statusWithStrategyTask = (run: ChatRun): ChatRunStatusResponse => {
    try {
      const strategyTask = strategyTaskForRun(run);
      const projection = strategyTask ? projectStrategyTask(strategyTask, run.id) : null;
      if (projection) run.strategyTask = projection;
    } catch (error) {
      if (
        !(error instanceof InvalidFrozenSkillPackageError)
        && !(error instanceof InvalidStrategyTaskRecordError)
      ) throw error;
      delete run.strategyTask;
      if (!['succeeded', 'failed', 'canceled'].includes(run.status)) {
        design.runs.fail(
          run,
          error instanceof InvalidFrozenSkillPackageError
            ? 'OD_NEXT_SKILL_SNAPSHOT_INVALID'
            : 'OD_NEXT_TASK_STATE_INVALID',
          error.message,
        );
      }
    }
    return design.runs.statusBody(run);
  };

  type ClarificationContinuation = {
    task: StrategyTaskExecutionRecord;
    sourceRunId: string;
    taskRunIndex: number;
    answer: string;
    retry: boolean;
    snapshot: AppliedPluginSnapshot;
  };

  type ClarificationResolution =
    | { kind: 'ordinary' }
    | { kind: 'error'; status: number; code: string; message: string }
    | { kind: 'continuation'; value: ClarificationContinuation };

  /**
   * Resolve only an explicit daemon-issued task handle. Conversation order is
   * never an ownership signal: an ordinary follow-up in a conversation that
   * happens to contain an awaiting strategy task must stay an ordinary Run.
   */
  function resolveClarificationContinuation(
    requestBody: JsonRecord,
  ): ClarificationResolution {
    if (requestBody.taskExecutionId === undefined) return { kind: 'ordinary' };
    if (
      typeof requestBody.taskExecutionId !== 'string'
      || !requestBody.taskExecutionId.trim()
      || !isSafeId(requestBody.taskExecutionId)
    ) {
      return {
        kind: 'error',
        status: 400,
        code: 'BAD_REQUEST',
        message: 'taskExecutionId must be a non-empty safe id',
      };
    }
    const task = getStrategyTaskExecution(db, requestBody.taskExecutionId);
    if (!task) {
      return {
        kind: 'error',
        status: 404,
        code: 'STRATEGY_TASK_NOT_FOUND',
        message: 'strategy task execution not found',
      };
    }
    if (
      requestBody.projectId !== task.projectId
      || requestBody.conversationId !== task.conversationId
    ) {
      return {
        kind: 'error',
        status: 409,
        code: 'STRATEGY_TASK_SCOPE_MISMATCH',
        message: 'strategy continuation must use the task\'s locked project and conversation',
      };
    }
    if (
      typeof requestBody.agentId === 'string'
      && requestBody.agentId
      && requestBody.agentId !== task.selectedAgentId
    ) {
      return {
        kind: 'error',
        status: 409,
        code: 'STRATEGY_TASK_AGENT_MISMATCH',
        message: 'strategy continuation must use the task\'s locked agent',
      };
    }
    if (
      typeof requestBody.appliedPluginSnapshotId === 'string'
      && requestBody.appliedPluginSnapshotId
      && requestBody.appliedPluginSnapshotId !== task.snapshotId
    ) {
      return {
        kind: 'error',
        status: 409,
        code: 'STRATEGY_TASK_SNAPSHOT_MISMATCH',
        message: 'strategy continuation must use the task\'s locked snapshot',
      };
    }
    if (
      typeof requestBody.pluginId === 'string'
      && requestBody.pluginId
      && requestBody.pluginId !== task.strategyId
    ) {
      return {
        kind: 'error',
        status: 409,
        code: 'STRATEGY_TASK_PLUGIN_MISMATCH',
        message: 'strategy continuation must use the task\'s locked strategy',
      };
    }
    const snapshot = getSnapshot(db, task.snapshotId);
    if (
      !snapshot
      || snapshot.pluginId !== task.strategyId
      || snapshot.strategy?.id !== task.strategyId
      || snapshot.strategy.version !== task.strategyVersion
      || snapshot.strategy.packageHash !== task.strategyPackageHash
    ) {
      return {
        kind: 'error',
        status: 409,
        code: 'STRATEGY_TASK_SNAPSHOT_INVALID',
        message: 'strategy task snapshot identity is unavailable or has drifted',
      };
    }
    const answer = typeof requestBody.currentPrompt === 'string'
      ? requestBody.currentPrompt
      : typeof requestBody.message === 'string'
        ? requestBody.message
        : '';
    if (!answer.trim()) {
      return {
        kind: 'error',
        status: 400,
        code: 'STRATEGY_CLARIFICATION_ANSWER_MISSING',
        message: 'clarification continuation requires a non-empty answer',
      };
    }
    const existingClientRun =
      typeof requestBody.clientRequestId === 'string' && requestBody.clientRequestId
        ? design.runs.list({
            projectId: task.projectId,
            conversationId: task.conversationId,
          }).find((candidate) => candidate.clientRequestId === requestBody.clientRequestId) ?? null
        : null;
    const existingMapping = existingClientRun
      ? task.runs.find((mapping) => mapping.runId === existingClientRun.id)
      : undefined;
    const exactRetry = Boolean(
      existingClientRun
      && existingMapping?.inputStage === 'clarification'
      && task.latestRunId === existingClientRun.id
      && task.activeRunId === existingClientRun.id
      && task.outcome === 'running',
    );
    if (existingClientRun && !exactRetry) {
      return {
        kind: 'error',
        status: 409,
        code: 'STRATEGY_TASK_RETRY_MISMATCH',
        message: 'clientRequestId is not bound to this task clarification',
      };
    }
    if (exactRetry && existingMapping) {
      return {
        kind: 'continuation',
        value: {
          task,
          sourceRunId: existingMapping.sourceRunId!,
          taskRunIndex: existingMapping.taskRunIndex,
          answer,
          retry: true,
          snapshot,
        },
      };
    }
    const latestMapping = task.runs.at(-1);
    if (
      task.route !== 'full_plan'
      || task.inputStage !== 'request'
      || task.outcome !== 'clarification_required'
      || task.activeRunId !== null
      || task.terminalRunId !== null
      || task.clarificationCount !== 0
      || !latestMapping
      || latestMapping.runId !== task.latestRunId
      || latestMapping.inputStage !== 'request'
    ) {
      return {
        kind: 'error',
        status: 409,
        code: 'STRATEGY_TASK_STATE_MISMATCH',
        message: 'strategy task is not awaiting its first clarification answer',
      };
    }
    const sourceRun = design.runs.get(task.latestRunId);
    if (
      !sourceRun
      || sourceRun.status !== 'succeeded'
      || sourceRun.projectId !== task.projectId
      || sourceRun.conversationId !== task.conversationId
      || sourceRun.agentId !== task.selectedAgentId
      || sourceRun.appliedPluginSnapshotId !== task.snapshotId
    ) {
      return {
        kind: 'error',
        status: 409,
        code: 'STRATEGY_TASK_SOURCE_RUN_INVALID',
        message: 'strategy clarification source Run is unavailable or does not match the locked task',
      };
    }
    return {
      kind: 'continuation',
      value: {
        task,
        sourceRunId: task.latestRunId,
        taskRunIndex: latestMapping.taskRunIndex + 1,
        answer,
        retry: false,
        snapshot,
      },
    };
  }

  function applyClarificationContinuationMeta(
    meta: RunCreateMeta,
    continuation: ClarificationContinuation,
  ): void {
    const { task, answer, sourceRunId, taskRunIndex } = continuation;
    const instruction = composeOdNextStrategyContinuationV2({
      stage: 'clarification',
      nativeSessionResume: true,
      taskExecutionId: task.taskExecutionId,
      taskRunIndex,
      answer,
    });
    meta.taskExecutionId = task.taskExecutionId;
    meta.agentId = task.selectedAgentId;
    meta.appliedPluginSnapshotId = task.snapshotId;
    meta.pluginId = task.strategyId;
    meta.message = instruction;
    meta.currentPrompt = instruction;
    meta.titleGeneration = undefined;
    meta.analyticsHints = {
      ...(meta.analyticsHints && typeof meta.analyticsHints === 'object'
        ? meta.analyticsHints
        : {}),
      taskExecutionId: task.taskExecutionId,
      initialRunId: task.initialRunId,
      sourceRunId,
      taskRunIndex,
    };
    // A continuation is a second physical Run of the same logical task, and the
    // rollout is only evaluated on the branch that resolves a project — which
    // this path skips. Without inheriting, every answered clarification would
    // report no harness at all, quietly dropping the OD Next runs that asked a
    // question from the comparison the dimension exists for.
    //
    // Inherited from the source Run rather than re-read from settings on
    // purpose: the user may have flipped the switch while the question was on
    // screen, and this Run belongs to the decision its task started under.
    // `resolveClarificationContinuation` already verified that source against
    // the locked task, so it is the trustworthy copy.
    const sourceDecision = design.runs.get(sourceRunId)?.strategyRolloutDecision;
    if (sourceDecision) meta.strategyRolloutDecision = sourceDecision;
  }

  /** Authorize every bound run mutation before plugin or snapshot resolution. */
  async function authorizeRunProjectBeforePluginResolution(
    req: ApiRequest,
    res: ApiResponse,
    projectId: string,
  ): Promise<{ ok: true; authorizedBoundMutation: boolean } | { ok: false }> {
    if (!ctx.projectStore || !ctx.authorizeProjectRequest) {
      return { ok: true, authorizedBoundMutation: false };
    }
    const binding = ctx.projectStore.getWorkspaceProjectByProjectId(db, projectId);
    if (!binding) return { ok: true, authorizedBoundMutation: false };

    const requestContext = workspaceResourceContextFromRequest(req);
    const mustAuthorize = binding.visibility === 'team' || requestContext !== null;
    if (!mustAuthorize) {
      // Headerless local CLI/BYOK calls keep the legacy Personal-project path.
      return { ok: true, authorizedBoundMutation: false };
    }
    if (!await ctx.authorizeProjectRequest(
      req,
      res,
      projectId,
      { mode: 'write', capability: 'writeFiles' },
    )) {
      return { ok: false };
    }
    return { ok: true, authorizedBoundMutation: true };
  }

  function requestedSnapshotBelongsToProject(
    res: ApiResponse,
    projectId: string,
    snapshotId: unknown,
  ): boolean {
    if (typeof snapshotId !== 'string' || snapshotId.trim().length === 0) {
      return true;
    }
    const normalizedSnapshotId = snapshotId.trim();
    const row = db
      .prepare('SELECT project_id AS projectId FROM applied_plugin_snapshots WHERE id = ?')
      .get(normalizedSnapshotId) as { projectId?: unknown } | undefined;
    if (row?.projectId === projectId) return true;
    sendApiError(
      res,
      404,
      'snapshot-not-found',
      `Applied plugin snapshot ${normalizedSnapshotId} not found`,
    );
    return false;
  }

  /**
   * Pin a run to its persisted project binding. The sole adoption branch is a
   * signed-in AMR request for a truly unbound historical project: an explicitly
   * Personal local attribution becomes the persisted creator witness. Vela
   * remains the final membership and billing authority when the run reaches
   * the cloud; local run creation never probes the Workspace directory.
   */
  async function prepareRunWorkspaceScope(
    req: ApiRequest,
    res: ApiResponse,
    projectId: string,
    agentId: unknown,
    authorizedBoundMutation = false,
  ): Promise<
    | { ok: true; workspaceScope: RunWorkspaceScope | null }
    | { ok: false }
  > {
    if (!ctx.projectStore) return { ok: true, workspaceScope: null };
    const binding = ctx.projectStore.getWorkspaceProjectByProjectId(db, projectId);
    const requestContext = workspaceResourceContextFromRequest(req);
    if (binding) {
      // A shared Team project is a single-writer resource. Billing still uses
      // the persisted Workspace binding below, but starting an agent can write
      // project files and conversation state, so the caller must separately
      // prove project-owner mutation standing. Explicitly scoped Personal
      // requests use the same exact creator gate before plugin/snapshot
      // resolution; only headerless local Personal callers keep legacy access.
      if (
        binding.visibility === 'team'
        && !authorizedBoundMutation
        && ctx.authorizeProjectRequest
        && !await ctx.authorizeProjectRequest(
          req,
          res,
          projectId,
          { mode: 'write', capability: 'writeFiles' },
        )
      ) {
        return { ok: false };
      }
      // Run billing scope is the persisted project binding. On the Personal
      // lane a headerless local caller remains valid; Vela/AMR receives the
      // signed-in account plus this exact binding and makes the membership/
      // balance decision.
      const workspaceScope = pinRunWorkspaceScopeForProject(db, projectId);
      if (!workspaceScope || workspaceScope.workspaceId !== binding.workspaceId) {
        sendApiError(
          res,
          409,
          'AMR_WORKSPACE_SCOPE_CONFLICT',
          'the project Workspace binding changed before the run could be pinned',
        );
        return { ok: false };
      }
      if (requestContext === null) return { ok: true, workspaceScope };
      if (requestContext === 'missing') {
        sendApiError(
          res,
          400,
          'WORKSPACE_CONTEXT_INCOMPLETE',
          'both workspace and member identity are required',
        );
        return { ok: false };
      }
      if (requestContext.workspaceId !== binding.workspaceId) {
        sendApiError(
          res,
          403,
          'WORKSPACE_PROJECT_PERMISSION_DENIED',
          'run workspace does not match the persisted project workspace',
        );
        return { ok: false };
      }
      return { ok: true, workspaceScope };
    }

    // This migration guard is deliberately AMR-only. Local CLIs, BYOK
    // providers, and every other runtime retain the legacy unbound path and do
    // not even probe AMR login or Workspace authority.
    if (agentId !== 'amr' || !ctx.amrWorkspaceScope) {
      return { ok: true, workspaceScope: null };
    }
    if (!await ctx.amrWorkspaceScope.isSignedIn()) {
      return { ok: true, workspaceScope: null };
    }

    if (requestContext === null) {
      // A headerless, genuinely unbound project is the local/account-scoped
      // compatibility lane. Home may create it before Workspace discovery
      // settles, after already running the account balance gate; requiring a
      // later identity here would turn that accepted first prompt into a 409.
      // Explicitly bound projects still pin their persisted Workspace above.
      return {
        ok: true,
        workspaceScope: accountScopedRunWorkspaceScopeForProject(projectId),
      };
    }
    if (requestContext === 'missing') {
      sendApiError(
        res,
        400,
        'WORKSPACE_CONTEXT_INCOMPLETE',
        'both workspace and member identity are required',
      );
      return { ok: false };
    }

    if (requestContext.workspaceTypeAsserted === 'team') {
      sendApiError(
        res,
        409,
        'AMR_PERSONAL_WORKSPACE_REQUIRED',
        'historical projects can only be adopted into a Personal Workspace',
      );
      return { ok: false };
    }
    if (requestContext.workspaceTypeAsserted !== 'personal') {
      return {
        ok: true,
        workspaceScope: accountScopedRunWorkspaceScopeForProject(projectId),
      };
    }
    const ensureWorkspaceProject = ctx.projectStore.ensureWorkspaceProject;
    if (!ensureWorkspaceProject) {
      sendApiError(
        res,
        409,
        'AMR_WORKSPACE_SCOPE_REQUIRED',
        'the project must be migrated into a Personal Workspace before running AMR Cloud',
      );
      return { ok: false };
    }

    const project = toProjectRecord(getProject(db, projectId));
    if (!project) {
      sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
      return { ok: false };
    }
    const { getWorkspaceProjectByProjectId } = ctx.projectStore;
    const bindPersonal = db.transaction(() => {
      const existing = getWorkspaceProjectByProjectId(db, projectId);
      if (existing) return existing;
      ensureWorkspaceProject(db, {
        projectId,
        workspaceId: requestContext.workspaceId,
        visibility: 'personal',
        resourceState: 'active',
        createdByWorkspaceMemberId: requestContext.workspaceMemberId,
        updatedByWorkspaceMemberId: requestContext.workspaceMemberId,
        syncState: 'local_only',
        resourceHubResourceId: null,
        cloudTombstonedAt: null,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      });
      return getWorkspaceProjectByProjectId(db, projectId);
    });
    const adopted = bindPersonal();
    if (adopted?.workspaceId !== requestContext.workspaceId) {
      sendApiError(
        res,
        409,
        'AMR_WORKSPACE_SCOPE_CONFLICT',
        'the project was bound to another Workspace before AMR could start',
      );
      return { ok: false };
    }
    const workspaceScope = pinRunWorkspaceScopeForProject(db, projectId);
    if (!workspaceScope || workspaceScope.workspaceId !== requestContext.workspaceId) {
      sendApiError(
        res,
        409,
        'AMR_WORKSPACE_SCOPE_CONFLICT',
        'the project Workspace binding changed before the run could be pinned',
      );
      return { ok: false };
    }
    return { ok: true, workspaceScope };
  }

  async function authorizeRunProject(
    req: ApiRequest,
    res: ApiResponse,
    run: ChatRun,
    options: { mode: 'read'; allowNavigationQuery?: boolean } | {
      mode: 'write';
      capability: 'writeFiles';
    },
  ): Promise<boolean> {
    if (!run.projectId || !ctx.authorizeProjectRequest) return true;

    // Once a run exists, status/stream/cancel are local lifecycle operations.
    // Headerless CLI/MCP/browser callers must not lose access merely because
    // the Workspace directory is stale or offline, regardless of which agent
    // created the run. Explicitly asserted identity still goes through the
    // local project gate so conflicting or partial scope cannot be ignored.
    const requestContext = workspaceResourceContextFromRequest(req);
    const carriesNavigationScope =
      options.mode === 'read'
      && options.allowNavigationQuery
      && (
        (typeof req.query?.workspaceId === 'string'
          && req.query.workspaceId.trim().length > 0)
        || (typeof req.query?.workspaceMemberId === 'string'
          && req.query.workspaceMemberId.trim().length > 0)
      );
    if (
      requestContext === null
      && !carriesNavigationScope
    ) {
      return true;
    }

    return ctx.authorizeProjectRequest(req, res, run.projectId, options);
  }

  function runToolBundleDeliveryTargetForProject(
    projectId: unknown,
    metadata: ProjectMetadata,
  ): RunDeliveryTarget {
    if (typeof projectId !== 'string' || !projectId || !isSafeId(projectId)) {
      return 'none';
    }
    try {
      const cwd = resolveProjectDir(PROJECTS_DIR, projectId, metadata, {
        allowUnavailableSandboxImportedProject: true,
      });
      return isManagedProjectCwd(cwd, PROJECTS_DIR) ? 'managed-project' : 'external-project';
    } catch {
      return 'none';
    }
  }

  // ---- Manual context compaction -------------------------------------------
  // Starts a short agent run that delivers the runtime's own context-compaction
  // command (`RuntimeAgentDef.manualCompact.prompt`, e.g. claude `/compact`)
  // into the conversation's stored CLI session, riding the normal run pipeline
  // so status/events/streaming/reattach behave like any other turn. Fast-fails
  // when the runtime cannot compact or the conversation has no stored session
  // yet; the race-safe resumability authority stays in startChatRun
  // (COMPACT_NO_SESSION covers a session invalidated between check and spawn).
  // No user message row is persisted: the command must never enter the
  // rendered transcript, or a later session reseed would replay it as text.
  app.post(
    '/api/projects/:id/conversations/:cid/compact',
    async (req: ApiRequest, res: ApiResponse) => {
      if (ctx.lifecycle.isDaemonShuttingDown()) {
        return sendApiError(res, 503, 'UPSTREAM_UNAVAILABLE', 'daemon is shutting down');
      }
      const projectId = routeParamId(req);
      const conversationId =
        typeof req.params.cid === 'string' && req.params.cid.length > 0
          ? req.params.cid
          : null;
      if (!projectId || !conversationId) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'projectId and conversationId required');
      }
      const project = toProjectRecord(getProject(db, projectId));
      if (!project) {
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
      }
      // Mirror the ownership guard POST /api/runs enforces: a compact run
      // keyed to a conversation owned by another project would resume and
      // rewrite that project's session state.
      const conversation = getConversation(db, conversationId);
      if (!conversation || conversation.projectId !== projectId) {
        return sendApiError(res, 404, 'CONVERSATION_NOT_FOUND', 'conversation not found for project');
      }
      const authorization = await authorizeRunProjectBeforePluginResolution(
        req,
        res,
        projectId,
      );
      if (!authorization.ok) return;
      const body = toJsonRecord(req.body) as CompactConversationRequest;
      let agentId = typeof body.agentId === 'string' && body.agentId ? body.agentId : null;
      if (!agentId) {
        const appCfg = await readAppConfig(RUNTIME_DATA_DIR).catch(
          () => ({} as Record<string, unknown>),
        );
        agentId = typeof appCfg.agentId === 'string' && appCfg.agentId ? appCfg.agentId : null;
      }
      if (!agentId) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'agentId required');
      }
      const preparedWorkspaceScope = await prepareRunWorkspaceScope(
        req,
        res,
        projectId,
        agentId,
        authorization.authorizedBoundMutation,
      );
      if (!preparedWorkspaceScope.ok) return;
      const def = getAgentDef(agentId);
      if (!def) {
        return sendApiError(res, 400, 'AGENT_UNAVAILABLE', `unknown agent: ${agentId}`);
      }
      if (typeof def.manualCompact?.prompt !== 'string') {
        return sendApiError(
          res,
          409,
          'COMPACT_UNSUPPORTED',
          `agent ${def.id} does not support manual context compaction`,
        );
      }
      if (!getAgentSession(db, conversationId, agentId)) {
        return sendApiError(
          res,
          409,
          'COMPACT_NO_SESSION',
          'no stored agent session for this conversation - send a message first',
        );
      }
      const meta: RunCreateMeta = {
        projectId,
        conversationId,
        agentId,
        assistantMessageId: randomUUID(),
        message: def.manualCompact.prompt,
        currentPrompt: def.manualCompact.prompt,
        model: typeof body.model === 'string' && body.model ? body.model : null,
        sessionMode: normalizeConversationSessionMode(conversation.sessionMode),
        manualCompact: true,
        workspaceScope: preparedWorkspaceScope.workspaceScope,
      };
      if (project.metadata) {
        meta.projectMetadata = project.metadata;
      }
      const run = design.runs.create(meta);
      try {
        pinAssistantMessageOnRunCreate(db, run);
      } catch (err) {
        console.warn('[runs] compact message pin failed', err);
      }
      const declaredClient = String(req.get('x-od-client') ?? '').toLowerCase();
      if (declaredClient === 'desktop' || declaredClient === 'web') {
        run.clientType = declaredClient;
      } else {
        const ua = String(req.get('user-agent') ?? '');
        run.clientType = ua.includes('Electron/') ? 'desktop' : 'web';
      }
      const response: CompactConversationResponse = {
        runId: run.id,
        conversationId,
        assistantMessageId: run.assistantMessageId ?? null,
      };
      res.status(202).json(response);
      reconcileAssistantMessageOnRunEnd(db, design.runs, run);
      internalRuns.start(
        run,
        {
          body: toJsonRecord(req.body),
          requestAnalyticsContext: readAnalyticsContext(req),
          creationKind: 'created',
          resumed: false,
        },
        () => startChatRun(meta, run),
      );
    },
  );

  const handleRunCreate = async (req: ApiRequest, res: ApiResponse) => {
    if (ctx.lifecycle.isDaemonShuttingDown()) {
      return sendApiError(res, 503, 'UPSTREAM_UNAVAILABLE', 'daemon is shutting down');
    }
    const requestBody = toJsonRecord(req.body);
    const requestAnalyticsContext = readAnalyticsContext(req);
    const mediaExecution = parseMediaExecutionPolicyInput(requestBody.mediaExecution);
    if (!mediaExecution.ok) {
      return sendApiError(res, 400, 'BAD_REQUEST', mediaExecution.message);
    }
    const toolBundle = parseRunToolBundleForRequest(requestBody.toolBundle);
    if (!toolBundle.ok) {
      return sendApiError(res, 400, 'BAD_REQUEST', toolBundle.message);
    }
    if (!hasCompleteByokOpenCodeConfig(requestBody)) {
      return sendApiError(
        res,
        400,
        'VALIDATION_FAILED',
        BYOK_OPENCODE_PROVIDER_REQUIRED_MESSAGE,
      );
    }
    // Reject a client-supplied conversationId that is missing a projectId or
    // not owned by that projectId before plugin snapshot resolve (which links
    // the snapshot to the conversation and would FK-fail / 500) and before
    // omit-pin mint/seed (which would return 202 with an unpersisted
    // assistantMessageId, or write messages without owning-project context).
    if (typeof requestBody.conversationId === 'string' && requestBody.conversationId) {
      const requestConversation = getConversation(db, requestBody.conversationId);
      if (
        !requestConversation ||
        typeof requestBody.projectId !== 'string' ||
        !requestBody.projectId ||
        requestConversation.projectId !== requestBody.projectId
      ) {
        return sendApiError(res, 404, 'CONVERSATION_NOT_FOUND', 'conversation not found for project');
      }
    }
    let authorizedBoundMutation = false;
    if (typeof requestBody.projectId === 'string' && requestBody.projectId) {
      const authorization = await authorizeRunProjectBeforePluginResolution(
        req,
        res,
        requestBody.projectId,
      );
      if (!authorization.ok) return;
      authorizedBoundMutation = authorization.authorizedBoundMutation;
    }
    let clarificationResolution;
    try {
      clarificationResolution = resolveClarificationContinuation(requestBody);
    } catch (error) {
      if (
        error instanceof InvalidFrozenSkillPackageError
        || error instanceof InvalidStrategyTaskRecordError
      ) {
        return sendApiError(
          res,
          409,
          error instanceof InvalidFrozenSkillPackageError
            ? 'OD_NEXT_SKILL_SNAPSHOT_INVALID'
            : 'OD_NEXT_TASK_STATE_INVALID',
          error.message,
        );
      }
      throw error;
    }
    if (clarificationResolution.kind === 'error') {
      return sendApiError(
        res,
        clarificationResolution.status,
        clarificationResolution.code,
        clarificationResolution.message,
      );
    }
    const clarificationContinuation = clarificationResolution.kind === 'continuation'
      ? clarificationResolution.value
      : null;
    const clarificationTask = clarificationContinuation?.task ?? null;
    let effectiveAgentId =
      clarificationTask
        ? clarificationTask.selectedAgentId
        : typeof requestBody.agentId === 'string' && requestBody.agentId
        ? requestBody.agentId
        : null;
    if (!effectiveAgentId) {
      try {
        const appCfg = await readAppConfig(RUNTIME_DATA_DIR);
        const cfgAgent = typeof appCfg.agentId === 'string' && appCfg.agentId
          ? appCfg.agentId
          : null;
        const agents = await detectAgents(
          toJsonRecord(appCfg.agentCliEnv),
        ).catch((): DetectedAgent[] => []);
        const cfgAgentAvailable = cfgAgent
          ? agents.some((agent) => agent.id === cfgAgent && agent.available)
          : false;
        effectiveAgentId = cfgAgent && cfgAgentAvailable
          ? cfgAgent
          : agents.find((agent) => agent.available)?.id ?? null;
      } catch (err) {
        console.warn('[runs] agent id fallback failed', err);
      }
    }
    let preparedWorkspaceScope: RunWorkspaceScope | null = null;
    if (typeof requestBody.projectId === 'string' && requestBody.projectId) {
      const prepared = await prepareRunWorkspaceScope(
        req,
        res,
        requestBody.projectId,
        effectiveAgentId,
        authorizedBoundMutation,
      );
      if (!prepared.ok) return;
      preparedWorkspaceScope = prepared.workspaceScope;
    }
    let resolvedSnapshot: SuccessfulRunSnapshotResolution | null = null;
    let strategyRolloutDecision: OdNextRolloutDecision | null = null;
    let rolloutCapabilitySnapshot: ReturnType<
      typeof resolveBundledOdNextRuntimeCapability
    >['snapshot'] = null;
    let resolveAutomaticOrdinaryFallback: (() => ResolveSnapshotResult) | null = null;
    let automaticOrdinaryFallbackPluginId: string | null = null;
    let automaticSnapshotPreparationError: Error | null = null;
    let idempotentStrategyRetry = null;
    try {
      idempotentStrategyRetry = typeof requestBody.clientRequestId === 'string'
        && requestBody.clientRequestId
        ? design.runs.list({
            projectId: typeof requestBody.projectId === 'string'
              ? requestBody.projectId
              : undefined,
            conversationId: typeof requestBody.conversationId === 'string'
              ? requestBody.conversationId
              : undefined,
          }).find((candidate) => (
            candidate.clientRequestId === requestBody.clientRequestId
            && Boolean(strategyTaskForRun(candidate))
          )) ?? null
        : null;
    } catch (error) {
      if (
        error instanceof InvalidFrozenSkillPackageError
        || error instanceof InvalidStrategyTaskRecordError
      ) {
        return sendApiError(
          res,
          409,
          error instanceof InvalidFrozenSkillPackageError
            ? 'OD_NEXT_SKILL_SNAPSHOT_INVALID'
            : 'OD_NEXT_TASK_STATE_INVALID',
          error.message,
        );
      }
      throw error;
    }
    if (clarificationContinuation) {
      const internalStrategyContinuation = Boolean(
        clarificationTask?.strategyId === 'od-next-strategy'
        && clarificationContinuation.snapshot.pluginId === clarificationTask.strategyId
        && clarificationContinuation.snapshot.strategy?.id === clarificationTask.strategyId,
      );
      if (
        !internalStrategyContinuation
        && ctx.plugins.authorizePluginRequest
        && !await ctx.plugins.authorizePluginRequest(
          req,
          res,
          clarificationTask!.strategyId,
        )
      ) return;
      resolvedSnapshot = {
        ok: true,
        status: 200,
        snapshotId: clarificationTask!.snapshotId,
        snapshot: clarificationContinuation.snapshot,
      };
    } else if (idempotentStrategyRetry?.appliedPluginSnapshotId) {
      const retrySnapshot = getSnapshot(db, idempotentStrategyRetry.appliedPluginSnapshotId);
      if (retrySnapshot) {
        resolvedSnapshot = {
          ok: true,
          status: 200,
          snapshotId: retrySnapshot.snapshotId,
          snapshot: retrySnapshot,
          created: false,
        };
      }
    } else if (typeof requestBody.projectId === 'string' && requestBody.projectId) {
      let runResolveBody: JsonRecord = requestBody;
      let synthesizedAutomaticDefault = false;
      const rolloutProject = toProjectRecord(getProject(db, requestBody.projectId));
      const snapshotConversationId =
        typeof requestBody.conversationId === 'string' && requestBody.conversationId
          ? requestBody.conversationId
          : getFirstProjectConversation(db, requestBody.projectId)?.id ?? null;
      const defaultPluginId = defaultScenarioPluginIdForProjectMetadata(
        toScenarioProjectMetadata(rolloutProject?.metadata),
      );
      const suppliedSnapshotWasNamed = typeof requestBody.appliedPluginSnapshotId === 'string'
        && requestBody.appliedPluginSnapshotId.trim().length > 0;
      const suppliedPluginWasNamed = typeof requestBody.pluginId === 'string'
        && requestBody.pluginId.trim().length > 0;
      const projectHasExplicitPin = Boolean(rolloutProject?.appliedPluginSnapshotId);
      const verifiedScenarioBinding = rolloutProject
        ? readVerifiedProjectScenarioBinding(db, {
            projectId: rolloutProject.id,
            appliedPluginSnapshotId: rolloutProject.appliedPluginSnapshotId,
            metadata: rolloutProject.metadata as ContractProjectMetadata,
          })
        : null;
      const verifiedStrategyBinding = readVerifiedProjectStrategyBinding(
        rolloutProject?.metadata as ContractProjectMetadata | null | undefined,
      );
      const verifiedExampleBinding = readVerifiedProjectExampleBinding(
        rolloutProject?.metadata as ContractProjectMetadata | null | undefined,
      );
      let selectedExamplePlugin: InstalledPluginRecord | null = null;
      if (verifiedExampleBinding) {
        try {
          const candidate = await ctx.plugins.getLocalPluginBySource?.(
            verifiedExampleBinding.pluginId,
            verifiedExampleBinding.pluginSource,
          );
          const parsed = InstalledPluginRecordSchema.safeParse(candidate);
          if (
            !parsed.success
            || parsed.data.id !== verifiedExampleBinding.pluginId
            || parsed.data.source !== verifiedExampleBinding.pluginSource
            || await digestExampleSkillManifest(parsed.data.fsPath)
              !== verifiedExampleBinding.manifestSourceDigest
          ) {
            throw new Error('the bound example no longer resolves to its frozen identity');
          }
          selectedExamplePlugin = parsed.data;
        } catch (error) {
          console.warn(
            `[plugins] selected example ${verifiedExampleBinding.pluginId} is unavailable for ordinary fallback: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
      const projectPinIsAutomaticDefault = Boolean(
        projectHasExplicitPin
        && verifiedScenarioBinding?.provenance === 'automatic_default'
        && verifiedScenarioBinding.pluginId === defaultPluginId,
      );
      const suppressAutomaticDefaultPinFallback = Boolean(
        projectPinIsAutomaticDefault
        && verifiedExampleBinding
        && !selectedExamplePlugin,
      );
      const suppliedContextPluginWasNamed = Boolean(
        Array.isArray((rolloutProject?.metadata as ContractProjectMetadata | undefined)?.contextPlugins)
        && (rolloutProject?.metadata as ContractProjectMetadata).contextPlugins!.length > 0
      );
      const explicitExecutablePlugin = Boolean(
        suppliedSnapshotWasNamed
        || suppliedPluginWasNamed
        || (projectHasExplicitPin && !projectPinIsAutomaticDefault)
      );
      // A named Skill is deliberately absent here. Naming one — the composer's
      // @-mention, `od run --skill`, a Skill persisted on the project — refines
      // the task; it does not claim the route away from a task type OD Next
      // already owns. An admitted strategy carries the Skill in
      // `session_skills/user_selected_skills` (see
      // `captureOdNextSessionSkillPackage`), where the strategy's conflict
      // order already ranks a user-selected Skill above its own. A context
      // plugin still claims authority: that is an executable surface the
      // strategy has no slot for.
      const explicitUserPlugin = Boolean(
        explicitExecutablePlugin
        || suppliedContextPluginWasNamed
      );
      // Read per request, not at boot: `odNextStrategyMode` is how a user opts
      // this installation into OD Next, and "configure it and it takes effect"
      // has to mean the next run, not the next daemon restart.
      //
      // Deliberately uncaught. `readAppConfig` already answers `{}` for the
      // states that mean "nothing configured" — no file, unparseable file — and
      // only throws when the daemon genuinely cannot read its own config. That
      // is not the same as an opt-out, and swallowing it would silently run the
      // ordinary route (with no `agentCliEnv` either) while telling the
      // operator the installation was never opted in.
      const rolloutAppConfig = await readAppConfig(RUNTIME_DATA_DIR);
      const rolloutPolicy = readOdNextRolloutPolicy(process.env, rolloutAppConfig);
      const rolloutTaskType = odNextTaskTypeForProjectScenarioBinding(
        verifiedStrategyBinding ?? verifiedScenarioBinding,
      );
      const routeApplicability = explicitUserPlugin
        ? 'explicit_user' as const
        : rolloutTaskType
          ? 'eligible' as const
          : 'not_applicable' as const;
      const rolloutMayObserve = routeApplicability === 'eligible'
        && rolloutPolicy.requestedMode !== 'off'
        && rolloutPolicy.contentEnabled
        && rolloutPolicy.behaviorEnabled;
      const rolloutFolder = rolloutMayObserve && BUNDLED_PLUGINS_DIR
        ? path.join(BUNDLED_PLUGINS_DIR, 'scenarios', 'od-next-strategy')
        : null;
      let automaticAdmissionPreparationFailed = false;
      let rolloutResolved: Awaited<ReturnType<typeof resolvePluginFolder>> | null = null;
      if (rolloutFolder) {
        try {
          rolloutResolved = await resolvePluginFolder({
            folder: rolloutFolder,
            folderId: 'od-next-strategy',
            sourceKind: 'bundled',
            source: rolloutFolder,
            trust: 'bundled',
          });
        } catch (error) {
          automaticAdmissionPreparationFailed = true;
          console.warn('[od-next-rollout] automatic strategy package preparation failed; using ordinary default', error);
        }
      }
      const rolloutPlugin = rolloutResolved?.ok ? rolloutResolved.record : null;
      let rolloutVersions: Awaited<ReturnType<typeof ensureDetectedRuntimeVersions>> | null = null;
      let rolloutCapability: ReturnType<typeof resolveBundledOdNextRuntimeCapability> | null = null;
      let advertisedCapabilityGap: string[] = [];
      if (routeApplicability === 'eligible' && rolloutPlugin) {
        try {
          if (effectiveAgentId) {
            const agentCliEnv = agentCliEnvForAgent(
              (rolloutAppConfig as { agentCliEnv?: AgentCliEnv }).agentCliEnv,
              effectiveAgentId,
            );
            // Both probes read the same resolved launch path. The `--version`
            // read establishes invocability; the `--help` read establishes
            // which optional flags this installed build advertises. OD Next
            // needs both, because the fixture registry below only proves what
            // the runtime *path* can do, not what the user's build exposes.
            const [versions, advertised] = await Promise.all([
              ensureDetectedRuntimeVersions(effectiveAgentId, agentCliEnv),
              ensureDetectedRuntimeCapabilities(effectiveAgentId, agentCliEnv),
            ]);
            rolloutVersions = versions;
            advertisedCapabilityGap = odNextAdvertisedCapabilityGap({
              agentId: effectiveAgentId,
              advertised,
            });
          }
          rolloutCapability = effectiveAgentId
            ? resolveBundledOdNextRuntimeCapability({
                agentId: effectiveAgentId,
                ...(rolloutVersions?.agentCliVersion
                  ? { agentCliVersion: rolloutVersions.agentCliVersion }
                  : {}),
                ...(rolloutVersions?.runtimeCompanionName
                  ? { runtimeCompanionName: rolloutVersions.runtimeCompanionName }
                  : {}),
                ...(rolloutVersions?.runtimeCompanionVersion
                  ? { runtimeCompanionVersion: rolloutVersions.runtimeCompanionVersion }
                  : {}),
              })
            : null;
        } catch (error) {
          automaticAdmissionPreparationFailed = true;
          console.warn('[od-next-rollout] automatic capability preparation failed; using ordinary default', error);
        }
      }
      const nativeSubagents = rolloutCapability?.snapshot?.nativeSubagents;
      const runtimeCapabilityVerified = Boolean(
        (rolloutVersions as ({ invocable?: boolean } | null))?.invocable === true
        && rolloutCapability?.reason === 'capability_resolved'
        && rolloutCapability.snapshot?.nativeSessionContinuation.support === 'verified'
        && nativeSubagents?.support === 'verified'
        && (nativeSubagents.evidenceLevel === 'L2' || nativeSubagents.evidenceLevel === 'L3')
        && advertisedCapabilityGap.length === 0
      );
      // An installed CLI that does not advertise what OD Next will demand at
      // launch must lose admission here, not fail the user's Run at spawn.
      const advertisedCapabilityReason = advertisedCapabilityGap.length > 0
        ? 'advertised_capability_missing'
        : null;
      strategyRolloutDecision = evaluateOdNextRollout({
        policy: rolloutPolicy,
        assignmentIdentity: `${requestBody.projectId}:${snapshotConversationId ?? ''}`,
        taskType: rolloutTaskType,
        agentId: effectiveAgentId,
        agentVersion: rolloutVersions?.agentCliVersion ?? null,
        sourceKind: rolloutPlugin?.sourceKind ?? null,
        runtimeCapabilityVerified,
        runtimeCapabilityReason: advertisedCapabilityReason
          ?? rolloutCapability?.reason
          ?? 'runtime_out_of_scope',
        stoppedMode: readOdNextRolloutStop(db)?.mode ?? null,
        routeApplicability,
      });
      if (
        automaticAdmissionPreparationFailed
        && strategyRolloutDecision.effectiveMode === 'active'
      ) {
        strategyRolloutDecision = automaticOdNextFallbackDecision(
          strategyRolloutDecision,
          'od_next_rollout_prestart_preparation_failed',
        );
      }
      if (strategyRolloutDecision.effectiveMode === 'active') {
        rolloutCapabilitySnapshot = rolloutCapability?.snapshot ?? null;
      }
      console.info('[od-next-rollout]', {
        decisionClass: strategyRolloutDecision.decisionClass,
        requestedMode: strategyRolloutDecision.requestedMode,
        effectiveMode: strategyRolloutDecision.effectiveMode,
        taskType: strategyRolloutDecision.taskType,
        agentId: effectiveAgentId,
        agentVersion: rolloutVersions?.agentCliVersion ?? null,
        sourceKind: rolloutPlugin?.sourceKind ?? null,
        assignmentClass: strategyRolloutDecision.eligible ? 'included' : 'not_included',
        primaryReasonCode: strategyRolloutDecision.primaryReasonCode,
        ...(advertisedCapabilityGap.length > 0
          ? { advertisedCapabilityGap }
          : {}),
      });
      if (!explicitExecutablePlugin) {
        const projectRow = rolloutProject;
        const hasPin =
          typeof projectRow?.appliedPluginSnapshotId === 'string'
          && projectRow.appliedPluginSnapshotId.length > 0;
        if (strategyRolloutDecision?.effectiveMode === 'active') {
          runResolveBody = {
            ...requestBody,
            pluginId: 'od-next-strategy',
            appliedPluginSnapshotId: undefined,
          };
        } else if (!hasPin || (projectPinIsAutomaticDefault && selectedExamplePlugin)) {
          // An official example card is the user's concrete choice inside this
          // task type. When OD Next is not active, execute that exact example
          // on the ordinary route instead of silently substituting the
          // project-kind default (for decks, the unrelated simple-deck/COO
          // template). A stale/unavailable binding deliberately yields no
          // plugin rather than a different template.
          const fallbackPluginId = selectedExamplePlugin?.id
            ?? (verifiedExampleBinding ? null : defaultPluginId);
          if (
            fallbackPluginId
            && (selectedExamplePlugin || getInstalledPlugin(db, fallbackPluginId))
          ) {
            runResolveBody = { ...requestBody, pluginId: fallbackPluginId };
            synthesizedAutomaticDefault = !selectedExamplePlugin;
          }
        }
      }
      const activatingStrategy = strategyRolloutDecision?.effectiveMode === 'active'
        && runResolveBody.pluginId === 'od-next-strategy'
        && rolloutPlugin;
      // Authorize the final plugin id, not only the literal request field.
      // Project-kind fallback may synthesize a pluginId, and it must not gain
      // a bypass around the same scoped catalog resolver.
      if (
        typeof runResolveBody.pluginId === 'string'
        && runResolveBody.pluginId.length > 0
        && !activatingStrategy
        && ctx.plugins.authorizePluginRequest
        && !await ctx.plugins.authorizePluginRequest(
          req,
          res,
          runResolveBody.pluginId,
        )
      ) return;
      let registryView: Parameters<typeof resolvePluginSnapshot>[0]['registry'];
      try {
        const projectBinding = ctx.projectStore?.getWorkspaceProjectByProjectId(
          db,
          requestBody.projectId,
        );
        registryView = await loadPluginRegistryView(
          projectBinding?.workspaceId
            ? {
                workspaceId: String(projectBinding.workspaceId),
                workspaceMemberId:
                  typeof projectBinding.createdByWorkspaceMemberId === 'string'
                    ? projectBinding.createdByWorkspaceMemberId
                    : null,
              }
            : undefined,
        );
      } catch (err) {
        return res.status(500).json({ error: String(err) });
      }
      if (!explicitUserPlugin && strategyRolloutDecision?.effectiveMode === 'active') {
        automaticOrdinaryFallbackPluginId = selectedExamplePlugin?.id
          ?? (verifiedExampleBinding ? null : defaultPluginId);
        const fallbackBody = (
          !projectHasExplicitPin
          || (projectPinIsAutomaticDefault && selectedExamplePlugin)
        )
          && automaticOrdinaryFallbackPluginId
          && (selectedExamplePlugin || getInstalledPlugin(db, automaticOrdinaryFallbackPluginId))
          ? { ...requestBody, pluginId: automaticOrdinaryFallbackPluginId }
          : requestBody;
        resolveAutomaticOrdinaryFallback = () => resolvePluginSnapshot({
          db,
          body: fallbackBody,
          projectId: requestBody.projectId as string,
          conversationId: snapshotConversationId,
          registry: registryView,
          connectorProbe: buildConnectorProbe(connectorService),
          requireSnapshotProjectMatch: true,
          allowProjectPinFallback: !suppressAutomaticDefaultPinFallback,
          ...(selectedExamplePlugin ? { plugin: selectedExamplePlugin } : {}),
          ...(selectedExamplePlugin ? { runScopedActivation: true } : {}),
          ...(!selectedExamplePlugin && defaultPluginId
            ? {
                projectBinding: {
                  provenance: 'automatic_default' as const,
                  taskProfile: verifiedScenarioBinding?.taskProfile
                    ?? automaticScenarioTaskProfile({
                      metadata: rolloutProject?.metadata as ContractProjectMetadata,
                      pluginId: defaultPluginId,
                    }),
                },
              }
            : {}),
        });
      }
      const resolved = resolvePluginSnapshot({
        db,
        body: runResolveBody,
        projectId: requestBody.projectId,
        conversationId: snapshotConversationId,
        registry: registryView,
        connectorProbe: buildConnectorProbe(connectorService),
        requireSnapshotProjectMatch: true,
        allowProjectPinFallback: !suppressAutomaticDefaultPinFallback,
        ...(selectedExamplePlugin ? { plugin: selectedExamplePlugin } : {}),
        ...(selectedExamplePlugin && runResolveBody.pluginId === selectedExamplePlugin.id
          ? { runScopedActivation: true }
          : {}),
        ...(!activatingStrategy && !explicitExecutablePlugin
          && (projectPinIsAutomaticDefault || synthesizedAutomaticDefault)
          && defaultPluginId
          ? {
              projectBinding: {
                provenance: 'automatic_default' as const,
                taskProfile: verifiedScenarioBinding?.taskProfile
                  ?? automaticScenarioTaskProfile({
                    metadata: rolloutProject?.metadata as ContractProjectMetadata,
                    pluginId: defaultPluginId,
                  }),
              },
            }
          : {}),
        ...(activatingStrategy && strategyRolloutDecision?.taskType
          ? {
              internalStrategyActivation: {
                taskType: strategyRolloutDecision.taskType,
                plugin: rolloutPlugin,
              },
            }
          : {}),
      });
      if (resolved && !resolved.ok) {
        if (!explicitExecutablePlugin) {
          console.warn(
            `[plugins] default-scenario fallback skipped for run on project ${requestBody.projectId}: ${resolved.body?.error?.code ?? 'unknown'}`,
          );
          if (strategyRolloutDecision?.effectiveMode === 'active') {
            automaticSnapshotPreparationError = new Error(
              `OD Next snapshot preparation failed: ${resolved.body?.error?.code ?? 'unknown'}`,
            );
          }
        } else {
          return res.status(resolved.status).json(resolved.body);
        }
      } else {
        resolvedSnapshot = resolved;
      }
    }
    const meta: RunCreateMeta = {
      ...withoutSensitiveRunInput(requestBody),
      mediaExecution: mediaExecution.policy,
      toolBundle: toolBundle.bundle,
      ...(effectiveAgentId ? { agentId: effectiveAgentId } : {}),
      // Always replace any untrusted request field, including with null for an
      // unbound project.
      workspaceScope: preparedWorkspaceScope,
      ...(strategyRolloutDecision ? { strategyRolloutDecision } : {}),
      ...(strategyRolloutDecision?.effectiveMode === 'active' && rolloutCapabilitySnapshot
        ? { runtimeCapabilitySnapshot: rolloutCapabilitySnapshot }
        : {}),
    };
    if (resolvedSnapshot?.ok) {
      meta.appliedPluginSnapshotId = resolvedSnapshot.snapshotId;
      if (!meta.pluginId) meta.pluginId = resolvedSnapshot.snapshot.pluginId;
      if (typeof meta.message !== 'string' || meta.message.trim().length === 0) {
        const renderedQuery = renderPluginBriefTemplate(
          resolvedSnapshot.snapshot.query ?? '',
          resolvedSnapshot.snapshot.inputs,
        ).trim();
        if (renderedQuery.length > 0) meta.message = renderedQuery;
      }
    }
    if (clarificationContinuation) {
      applyClarificationContinuationMeta(meta, clarificationContinuation);
      meta.odNextTaskInputSnapshot = design.runs.get(
        clarificationContinuation.sourceRunId,
      )?.odNextTaskInputSnapshot ?? null;
    } else if (idempotentStrategyRetry?.strategyRolloutDecision) {
      // Same skipped-evaluation shape as the continuation above. A retry is the
      // same logical request, so it reports the decision that request already
      // made rather than making a fresh one.
      meta.strategyRolloutDecision = idempotentStrategyRetry.strategyRolloutDecision;
    }
    let runProject: ProjectRecord | null = null;
    if (typeof meta.projectId === 'string' && meta.projectId) {
      try {
        runProject = toProjectRecord(getProject(db, meta.projectId));
        assertSandboxProjectRootAvailable(runProject?.metadata);
      } catch (err) {
        if (err instanceof SandboxImportedProjectError) {
          return sendApiError(res, 400, 'BAD_REQUEST', err.message);
        }
        throw err;
      }
    }
    if (typeof meta.agentId !== 'string' || !meta.agentId) {
      try {
        const appCfg = await readAppConfig(RUNTIME_DATA_DIR);
        const cfgAgent = typeof appCfg.agentId === 'string' && appCfg.agentId
          ? appCfg.agentId
          : null;
        const agents = await detectAgents(
          toJsonRecord(appCfg.agentCliEnv),
        ).catch((): DetectedAgent[] => []);
        const cfgAgentAvailable = cfgAgent
          ? agents.some((agent) => agent.id === cfgAgent && agent.available)
          : false;
        if (cfgAgent && cfgAgentAvailable) {
          meta.agentId = cfgAgent;
        } else {
          const firstAvailable = agents.find((agent) => agent.available)?.id ?? null;
          if (firstAvailable) meta.agentId = firstAvailable;
        }
      } catch (err) {
        console.warn('[runs] agent id fallback failed', err);
      }
    }
    if (!hasCompleteByokOpenCodeConfig({
      ...meta,
      ...(requestBody.byokProvider !== undefined
        ? { byokProvider: requestBody.byokProvider }
        : {}),
    })) {
      return sendApiError(
        res,
        400,
        'VALIDATION_FAILED',
        BYOK_OPENCODE_PROVIDER_REQUIRED_MESSAGE,
      );
    }
    const toolBundleSupport = validateRunToolBundleForAgent(
      toolBundle.bundle,
      typeof meta.agentId === 'string' ? getAgentDef(meta.agentId) : null,
      {
        deliveryTarget: runToolBundleDeliveryTargetForProject(
          meta.projectId,
          runProject?.metadata,
        ),
      },
    );
    if (!toolBundleSupport.ok) {
      return sendApiError(res, 400, 'BAD_REQUEST', toolBundleSupport.message);
    }
    if (runProject?.metadata) {
      meta.projectMetadata = runProject.metadata;
    }
    const requestAnalyticsHints =
      meta.analyticsHints
      && typeof meta.analyticsHints === 'object'
      && !Array.isArray(meta.analyticsHints)
        ? (meta.analyticsHints as Record<string, unknown>)
        : null;
    const hasExternalPluginHints = Boolean(
      requestAnalyticsHints
      && (
        requestAnalyticsHints.externalPluginId !== undefined
        || requestAnalyticsHints.externalPluginVersion !== undefined
        || requestAnalyticsHints.pluginWorkflowId !== undefined
        || requestAnalyticsHints.logicalRequestDigest !== undefined
        || requestAnalyticsHints.logicalRequestDigestVersion !== undefined
      ),
    );
    if (hasExternalPluginHints) {
      let normalizedExternalPluginHints;
      try {
        normalizedExternalPluginHints =
          normalizeExternalPluginRunAnalyticsHints(requestAnalyticsHints, {
            clientRequestId: meta.clientRequestId,
            analyticsContext: requestAnalyticsContext,
          });
      } catch (error) {
        return sendApiError(
          res,
          400,
          'PLUGIN_CONTRACT_REJECTED',
          error instanceof Error ? error.message : String(error),
        );
      }
      const runtimeDef =
        typeof meta.agentId === 'string' ? getAgentDef(meta.agentId) : null;
      const inactivityTimeoutMs = resolveChatRunInactivityTimeoutMs(
        runtimeDef?.inactivityTimeoutMs,
      );
      meta.analyticsHints = {
        ...requestAnalyticsHints,
        ...normalizedExternalPluginHints,
        generationSloWindowMs: resolvePluginGenerationSloWindowMs({
          inactivityTimeoutMs,
          configuredValue: process.env.OD_PLUGIN_GENERATION_SLO_WINDOW_MS,
        }),
      };
      const existingWorkflowRun = design.runs.findByPluginWorkflowId(
        normalizedExternalPluginHints.pluginWorkflowId,
      );
      if (
        existingWorkflowRun
        && existingWorkflowRun.clientRequestId !== meta.clientRequestId
      ) {
        return sendApiError(
          res,
          409,
          'PLUGIN_WORKFLOW_CONFLICT',
          'pluginWorkflowId is already bound to a different logical run request',
        );
      }
    }
    // Headless / MCP clients often omit conversationId; bind the project's
    // earliest conversation so the run has a chat home.
    let conversationFallbackBound = false;
    if (
      typeof meta.projectId === 'string' &&
      meta.projectId &&
      (typeof meta.conversationId !== 'string' || !meta.conversationId)
    ) {
      try {
        const defaultConv = getFirstProjectConversation(db, meta.projectId);
        if (defaultConv && typeof defaultConv.id === 'string' && defaultConv.id) {
          meta.conversationId = defaultConv.id;
          conversationFallbackBound = true;
        }
      } catch (err) {
        console.warn('[runs] mcp conversation fallback failed', err);
      }
    }
    const conversationSession =
      typeof meta.conversationId === 'string' && meta.conversationId
        ? getConversation(db, meta.conversationId)
        : null;
    // Re-check after optional headless conversation bind: a run may only attach
    // to a conversation that exists and is owned by its project. Covers both
    // client-supplied ids (already validated above) and fallback-bound ids.
    // Require a string projectId so omit-pin never seeds without owning-project
    // context. Must run before omit-pin mint/seed so a missing conversation
    // never yields a 202 with an assistantMessageId that was never persisted.
    if (typeof meta.conversationId === 'string' && meta.conversationId) {
      if (
        !conversationSession ||
        typeof meta.projectId !== 'string' ||
        !meta.projectId ||
        conversationSession.projectId !== meta.projectId
      ) {
        return sendApiError(res, 404, 'CONVERSATION_NOT_FOUND', 'conversation not found for project');
      }
    }
    // Resolve session mode before omit-pin seed so the user turn stores the
    // same mode the run will use (matches web PUT /messages persistence).
    meta.sessionMode =
      meta.sessionMode === 'chat' || meta.sessionMode === 'design' || meta.sessionMode === 'plan'
        ? normalizeConversationSessionMode(meta.sessionMode)
        : normalizeConversationSessionMode(conversationSession?.sessionMode);
    // Web always mints assistantMessageId client-side. API clients that already
    // know conversationId (eval runners, scripts, MCP after the bind above) may
    // omit it. Without a server-side pin, pinAssistantMessageOnRunCreate no-ops,
    // lastMessageId stays null, and multi-turn native session resume is skipped
    // (missing_cursor / resume_skipped). Ownership is validated above first.
    // A web client also supplies userMessageId so this route can pin the user
    // row before the assistant row. Its separate best-effort PUT may arrive
    // later; upserting the same id then preserves the position established
    // here. Headless fallback keeps its existing generated-id behavior.
    //
    // Prepare seed payload before createOrReuse, but only persist when the run
    // is newly created so lost-response retries with clientRequestId do not
    // duplicate user turns.
    const missingClientPin =
      typeof meta.assistantMessageId !== 'string' || !meta.assistantMessageId;
    const clientUserMessageId =
      typeof meta.userMessageId === 'string' && meta.userMessageId
        ? meta.userMessageId
        : null;
    if (clientUserMessageId && !isSafeId(clientUserMessageId)) {
      return sendApiError(res, 400, 'BAD_REQUEST', 'userMessageId is invalid');
    }
    if (clientUserMessageId && typeof meta.conversationId === 'string') {
      const existingUserPin = db
        .prepare(`SELECT role, conversation_id AS conversationId FROM messages WHERE id = ?`)
        .get(clientUserMessageId) as
        | { role?: unknown; conversationId?: unknown }
        | undefined;
      if (existingUserPin && existingUserPin.role !== 'user') {
        return sendApiError(
          res,
          409,
          'INVALID_USER_MESSAGE',
          'userMessageId must reference a user message',
        );
      }
      if (
        existingUserPin
        && existingUserPin.conversationId !== meta.conversationId
      ) {
        return sendApiError(
          res,
          409,
          'IDEMPOTENCY_CONFLICT',
          'userMessageId belongs to a different conversation',
        );
      }
    }
    // The run's assistantMessageId must reference an assistant message in THIS
    // conversation, or the run would pin/append/finalize a row it does not own
    // (a user row in the same conversation, or an assistant row in another
    // conversation). Without this check, `pinAssistantMessageOnRunCreate` only
    // skips the pin and the run still mutates the foreign row via the id-only
    // writers (#6418 review).
    const clientAssistantMessageId =
      typeof meta.assistantMessageId === 'string' && meta.assistantMessageId
        ? meta.assistantMessageId
        : null;
    if (clientAssistantMessageId && !isSafeId(clientAssistantMessageId)) {
      return sendApiError(res, 400, 'BAD_REQUEST', 'assistantMessageId is invalid');
    }
    if (
      clientUserMessageId
      && clientAssistantMessageId
      && clientUserMessageId === clientAssistantMessageId
    ) {
      return sendApiError(
        res,
        400,
        'BAD_REQUEST',
        'userMessageId and assistantMessageId must be distinct',
      );
    }
    if (clientAssistantMessageId) {
      // Without a resolvable conversation there is nothing to validate the
      // assistantMessageId against — the run would mutate a row it does not
      // own via the id-only writers. Reject rather than guess (nettee).
      if (typeof meta.conversationId !== 'string' || !meta.conversationId) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'assistantMessageId requires a conversation');
      }
      const chatConversation = getConversation(db, meta.conversationId);
      if (
        !chatConversation
        || (
          typeof meta.projectId === 'string'
          && meta.projectId
          && chatConversation.projectId !== meta.projectId
        )
      ) {
        return sendApiError(res, 404, 'CONVERSATION_NOT_FOUND', 'conversation not found for project');
      }
      const existingAssistantPin = db
        .prepare(
          `SELECT role, conversation_id AS conversationId, run_id AS runId, run_status AS runStatus FROM messages WHERE id = ?`,
        )
        .get(clientAssistantMessageId) as
        | { role?: unknown; conversationId?: unknown; runId?: unknown; runStatus?: unknown }
        | undefined;
      if (existingAssistantPin && existingAssistantPin.role !== 'assistant') {
        return sendApiError(
          res,
          409,
          'INVALID_ASSISTANT_MESSAGE',
          'assistantMessageId must reference an assistant message',
        );
      }
      if (
        existingAssistantPin
        && existingAssistantPin.conversationId !== meta.conversationId
      ) {
        return sendApiError(
          res,
          409,
          'IDEMPOTENCY_CONFLICT',
          'assistantMessageId belongs to a different conversation',
        );
      }
    }
    let runUserSeed: {
      id: string;
      conversationId: string;
      content: string;
      attachments: ReturnType<typeof seededUserMessageAttachmentFields>;
      turnMetadata: ReturnType<typeof seededUserMessageTurnMetadataFields>;
    } | null = null;
    if (
      typeof meta.conversationId === 'string' &&
      meta.conversationId &&
      (clientUserMessageId || missingClientPin || conversationFallbackBound)
    ) {
      if (missingClientPin) {
        meta.assistantMessageId = randomUUID();
      }
      // Prefer original request currentPrompt (latest turn) whenever it is a
      // string — including empty for attachments-only sends. Plugin resolution
      // may replace meta.message with a rendered scenario brief for the run
      // (see above); seed visible chat content from requestBody so that
      // internal brief never appears as user-authored content. message may be
      // a full flattened ChatRequest transcript. Minimal MCP requests set both
      // equal. Only fall back to message when currentPrompt is absent. Empty
      // message is still seedable when attachment metadata is present so
      // chips/annotations survive reload for omit-pin clients that leave
      // currentPrompt unset.
      const seededAttachments = seededUserMessageAttachmentFields(meta);
      const hasSeedableAttachmentMetadata =
        (seededAttachments.attachments?.length ?? 0) > 0 ||
        (seededAttachments.commentAttachments?.length ?? 0) > 0;
      const originalCurrentPrompt = requestBody.currentPrompt;
      const originalMessage = requestBody.message;
      const promptForUserMessage =
        typeof originalCurrentPrompt === 'string'
          ? originalCurrentPrompt
          : typeof originalMessage === 'string' &&
              (originalMessage.trim().length > 0 || hasSeedableAttachmentMetadata)
            ? originalMessage
            : null;
      if (promptForUserMessage !== null) {
        runUserSeed = {
          id: clientUserMessageId ?? randomUUID(),
          conversationId: meta.conversationId,
          content: promptForUserMessage,
          attachments: seededAttachments,
          turnMetadata: seededUserMessageTurnMetadataFields(
            meta,
            resolvedSnapshot?.ok ? resolvedSnapshot.snapshot : null,
          ),
        };
      }
    }
    const seedRunUserMessage = () => {
      if (!runUserSeed) return;
      const now = Date.now();
      upsertMessage(db, runUserSeed.conversationId, {
        id: runUserSeed.id,
        role: 'user',
        content: runUserSeed.content,
        startedAt: now,
        endedAt: now,
        // Same turn metadata the web client writes via PUT /messages so
        // reload/retry keep sessionMode, runContext, and applied plugin.
        ...runUserSeed.turnMetadata,
        // Preserve request attachments/commentAttachments on the seeded user
        // turn so reload/listMessages still show chips and annotation context
        // for omit-pin / headless clients (same columns as PUT /messages).
        ...runUserSeed.attachments,
      });
      // Bump parent project updatedAt so listProjects reorders (same as
      // PUT /messages). Headless/API turns that never hit that route would
      // otherwise leave the project buried under more recent activity.
      if (typeof meta.projectId === 'string' && meta.projectId) {
        updateProject(db, meta.projectId, {});
      }
    };
    const fallbackAutomaticBeforeStart = async (error: unknown): Promise<boolean> => {
      if (
        !strategyRolloutDecision
        || strategyRolloutDecision.effectiveMode !== 'active'
        || !resolveAutomaticOrdinaryFallback
      ) return false;
      const provisionalSnapshot = resolvedSnapshot;
      if (provisionalSnapshot?.created === true) {
        if (!removeProvisionalAutomaticSnapshot(db, provisionalSnapshot)) {
          throw new Error(
            'Automatic strategy snapshot became referenced before Run claim; refusing fallback cleanup.',
          );
        }
        resolvedSnapshot = null;
      }
      if (
        automaticOrdinaryFallbackPluginId
        && ctx.plugins.authorizePluginRequest
        && !await ctx.plugins.authorizePluginRequest(
          req,
          res,
          automaticOrdinaryFallbackPluginId,
        )
      ) return false;

      const fallbackResolved = resolveAutomaticOrdinaryFallback();
      if (fallbackResolved && !fallbackResolved.ok) {
        console.warn(
          `[od-next-rollout] ordinary fallback snapshot unavailable for project ${String(meta.projectId)}: ${fallbackResolved.body.error.code}`,
        );
        resolvedSnapshot = null;
      } else {
        resolvedSnapshot = fallbackResolved;
      }
      strategyRolloutDecision = automaticOdNextFallbackDecision(
        strategyRolloutDecision,
        'od_next_rollout_prestart_preparation_failed',
      );
      rolloutCapabilitySnapshot = null;
      meta.strategyRolloutDecision = strategyRolloutDecision;
      delete meta.runtimeCapabilitySnapshot;
      delete meta.odNextTaskInputSnapshot;
      delete meta.appliedPluginSnapshotId;
      delete meta.pluginId;
      if (typeof requestBody.message === 'string') {
        meta.message = requestBody.message;
      } else {
        delete meta.message;
      }
      if (resolvedSnapshot?.ok) {
        meta.appliedPluginSnapshotId = resolvedSnapshot.snapshotId;
        meta.pluginId = resolvedSnapshot.snapshot.pluginId;
        if (typeof meta.message !== 'string' || meta.message.trim().length === 0) {
          const renderedQuery = renderPluginBriefTemplate(
            resolvedSnapshot.snapshot.query ?? '',
            resolvedSnapshot.snapshot.inputs,
          ).trim();
          if (renderedQuery.length > 0) meta.message = renderedQuery;
        }
      }
      if (runUserSeed) {
        runUserSeed.turnMetadata = seededUserMessageTurnMetadataFields(
          meta,
          resolvedSnapshot?.ok ? resolvedSnapshot.snapshot : null,
        );
      }
      const fallbackFingerprintMeta = { ...meta };
      delete fallbackFingerprintMeta.strategyRolloutDecision;
      delete fallbackFingerprintMeta.runtimeCapabilitySnapshot;
      meta.requestFingerprint = runRequestFingerprint(
        fallbackFingerprintMeta,
        resolvedSnapshot?.ok ? resolvedSnapshot.snapshot : null,
      );
      console.warn(
        `[od-next-rollout] automatic preparation failed before Run claim; using ordinary default: ${error instanceof Error ? error.message : String(error)}`,
      );
      return true;
    };
    if (
      automaticSnapshotPreparationError
      && !await fallbackAutomaticBeforeStart(automaticSnapshotPreparationError)
    ) return;
    let frozenSkillPackage: FrozenSkillPackageV1 | undefined;
    if (
      !clarificationContinuation
      && !idempotentStrategyRetry
      && strategyRolloutDecision?.effectiveMode === 'active'
    ) {
      // Everything the session selected inside this task type — an @-mentioned
      // Skill, an official example card — is frozen into one package here and
      // read back as `session_skills/user_selected_skills`. A task with no
      // selection still persists the empty package, which is what keeps
      // restart/continuation identity deterministic.
      const runProjectMetadata =
        runProject?.metadata as ContractProjectMetadata | null | undefined;
      frozenSkillPackage = await captureOdNextSessionSkillPackage({
        metadata: runProjectMetadata,
        getLocalPluginBySource: ctx.plugins.getLocalPluginBySource,
        selection: {
          // Mirror the ordinary route's own resolution order
          // (`composeDaemonSystemPrompt`): the request's Skill, else the one
          // persisted on the project, plus this turn's @-mentions.
          skillId: typeof requestBody.skillId === 'string' && requestBody.skillId
            ? requestBody.skillId
            : runProject?.skillId,
          skillIds: requestBody.skillIds,
        },
        listSkillCatalog: () => ctx.resources.listAllSkillLikeEntries(
          resolveSkillCatalogScope({
            metadata: runProjectMetadata,
            workspaceBinding: typeof requestBody.projectId === 'string' && requestBody.projectId
              ? ctx.projectStore?.getWorkspaceProjectByProjectId(db, requestBody.projectId)
              : null,
          }) ?? undefined,
        ),
      });
    }
    const fingerprintSnapshot = clarificationTask
      ? getSnapshot(db, clarificationTask.snapshotId)
      : resolvedSnapshot?.ok
        ? resolvedSnapshot.snapshot
        : null;
    const fingerprintMeta = { ...meta };
    delete fingerprintMeta.strategyRolloutDecision;
    delete fingerprintMeta.runtimeCapabilitySnapshot;
    meta.requestFingerprint = runRequestFingerprint(fingerprintMeta, fingerprintSnapshot);
    let createdTaskInputSnapshot: OdNextTaskInputSnapshotDescriptor | null = null;
    let preparedPromptBundleText: string | null = null;
    if (
      !clarificationContinuation
      && !idempotentStrategyRetry
      && strategyRolloutDecision?.effectiveMode === 'active'
    ) {
      const taskType = strategyRolloutDecision.taskType;
      if (!taskType || !meta.agentId) {
        return sendApiError(
          res,
          400,
          'OD_NEXT_INPUT_SNAPSHOT_INVALID',
          'OD Next task inputs require a resolved task type and selected agent.',
        );
      }
      // This snapshot is prepared before the SQLite claim so prompt assembly
      // never runs inside the claim transaction. Use an attempt-unique owner:
      // a daemon crash can leave an orphaned immutable directory, but a retry
      // must never collide with that orphan. Concurrent duplicate requests
      // likewise prepare independently; the losing claim removes its own
      // provisional snapshot below.
      const taskExecutionId = `odnext_${randomUUID().replaceAll('-', '')}`;
      try {
        const projectRoot = resolveProjectDir(
          PROJECTS_DIR,
          meta.projectId!,
          runProject?.metadata,
        );
        const contextValue = requestBody.context
          && typeof requestBody.context === 'object'
          && !Array.isArray(requestBody.context)
            ? requestBody.context as Record<string, unknown>
            : {};
        const mcpIds = Array.isArray(contextValue.mcpServerIds)
          ? contextValue.mcpServerIds.filter((value) => typeof value === 'string')
          : [];
        const runToolServers = toolBundle.bundle
          && typeof toolBundle.bundle === 'object'
          && Array.isArray((toolBundle.bundle as { mcpServers?: unknown }).mcpServers)
            ? (toolBundle.bundle as { mcpServers: unknown[] }).mcpServers
            : [];
        const taskConfiguration = buildOdNextTaskConfigurationV1({
          taskType,
          locale: meta.locale,
          selectedAgentId: meta.agentId,
          sessionMode: meta.sessionMode,
          model: meta.model,
          reasoning: meta.reasoning,
          serviceTier: meta.serviceTier,
          mediaExecution: mediaExecution.policy,
          route: 'full_plan',
          mode: 'unresolved',
        });
        createdTaskInputSnapshot = createOdNextTaskInputSnapshot({
          snapshotsRoot: taskInputSnapshotsRoot,
          taskExecutionId,
          taskConfiguration,
          projectRoot,
          projectAttachments: Array.isArray(requestBody.attachments)
            ? requestBody.attachments.filter(
                (value): value is string => typeof value === 'string' && value.length > 0,
              )
            : [],
          uploadRoot: UPLOAD_DIR,
          imagePaths: Array.isArray(requestBody.imagePaths)
            ? requestBody.imagePaths.filter(
                (value): value is string => typeof value === 'string' && value.length > 0,
              )
            : [],
          commentCount: Array.isArray(requestBody.commentAttachments)
            ? requestBody.commentAttachments.length
            : 0,
          linkedDirectoryCount: Array.isArray(runProject?.metadata?.linkedDirs)
            ? runProject.metadata.linkedDirs.length
            : 0,
          mcpServerCount: mcpIds.length + runToolServers.length,
        });
        meta.odNextTaskInputSnapshot = createdTaskInputSnapshot;
        const preparedPrompt = await prepareOdNextInitialPromptBundle({
          meta,
          frozenSkillPackage: frozenSkillPackage!,
          taskInputSnapshot: createdTaskInputSnapshot,
        });
        preparedPromptBundleText = preparedPrompt.text;
      } catch (error) {
        removeOdNextTaskInputSnapshotBestEffort(
          createdTaskInputSnapshot,
          taskInputSnapshotsRoot,
          'initial-bundle',
        );
        createdTaskInputSnapshot = null;
        preparedPromptBundleText = null;
        frozenSkillPackage = undefined;
        if (!await fallbackAutomaticBeforeStart(error)) return;
      }
    }
    let preparedRun;
    try {
      preparedRun = internalRuns.prepare({
        meta,
        ...((runUserSeed || clarificationTask || strategyRolloutDecision?.effectiveMode === 'active')
          ? {
              beforeClaimCommit: (candidate) => {
                if (!clarificationContinuation && createdTaskInputSnapshot) {
                  candidate.odNextTaskInputSnapshot = createdTaskInputSnapshot;
                  // `createOrReuse` persisted the optimistic Run before the
                  // claim hook ran. Persist the daemon-owned descriptor now,
                  // while the frozen bytes already exist and before the
                  // assistant/task claim can commit, so daemon restart never
                  // falls back to mutable request paths.
                  design.runs.persistState(candidate);
                }
                seedRunUserMessage();
                if (clarificationContinuation && !clarificationContinuation.retry) {
                  beginStrategyClarification(db, {
                    taskExecutionId: clarificationContinuation.task.taskExecutionId,
                    sourceRunId: clarificationContinuation.sourceRunId,
                    nextRunId: candidate.id,
                    answer: clarificationContinuation.answer,
                  });
                }
                if (
                  !clarificationContinuation
                  && strategyRolloutDecision?.effectiveMode === 'active'
                  && resolvedSnapshot?.ok
                  && resolvedSnapshot.snapshot.strategy
                ) {
                  try {
                    const initialTaskInputSnapshot = createdTaskInputSnapshot;
                    const taskExecutionId = initialTaskInputSnapshot?.taskExecutionId;
                    if (!taskExecutionId || !preparedPromptBundleText || !frozenSkillPackage) {
                      throw new OdNextTaskInputSnapshotError(
                        'OD Next immutable inputs and Prompt Bundle were not prepared before claim.',
                      );
                    }
                    createStrategyTaskExecution(db, {
                      taskExecutionId,
                      projectId: candidate.projectId!,
                      conversationId: candidate.conversationId!,
                      snapshotId: resolvedSnapshot.snapshotId,
                      selectedAgentId: candidate.agentId!,
                      initialRunId: candidate.id,
                      frozenSkillPackage,
                      promptBundleText: preparedPromptBundleText,
                      taskInputManifestSha256: initialTaskInputSnapshot.manifestSha256,
                    });
                    // The route stays unlocked through the request turn so the
                    // main Agent can choose Direct Edit or Full Plan from the
                    // request itself (product spec 3.1). The daemon cannot make
                    // that call here: four of the five eligibility facts depend
                    // on reading what the user asked for, which only happens
                    // once the Bundle reaches the Agent.
                    const preparedStrategy = prepareStrategyIntake(db, {
                      taskExecutionId,
                      intake: {
                        inputRefs: [{ id: 'request', accessible: true }],
                        selectedAgentAvailable: true,
                        nativeContinuation: strategyRolloutDecision.syntheticCanary
                          ? 'verified'
                          : rolloutCapabilitySnapshot?.nativeSessionContinuation.support
                            ?? 'unknown',
                        taskProfileAvailable: true,
                        dependencies: [],
                      },
                    });
                    if (!preparedStrategy.ok) {
                      throw new Error(
                        `OD Next rollout preflight blocked: ${preparedStrategy.reasonCodes.join(',')}`,
                      );
                    }
                  } catch (error) {
                    throw new AutomaticOdNextPreparationError(error);
                  }
                }
              },
            }
          : {}),
        resume: {
          requested: requestBody.resume === true,
          canResume: (candidate) =>
            candidate.status === 'failed'
            && candidate.agentId === 'amr'
            && (
              candidate.failureAction === 'recharge'
              || candidate.errorCode === 'AMR_INSUFFICIENT_BALANCE'
            ),
        },
      });
    } catch (error) {
      removeOdNextTaskInputSnapshotBestEffort(
        createdTaskInputSnapshot,
        taskInputSnapshotsRoot,
        'run-claim',
      );
      createdTaskInputSnapshot = null;
      if (error instanceof AutomaticOdNextPreparationError) {
        preparedPromptBundleText = null;
        frozenSkillPackage = undefined;
        if (!await fallbackAutomaticBeforeStart(error.preparationCause)) return;
        preparedRun = internalRuns.prepare({
          meta,
          ...(runUserSeed ? { beforeClaimCommit: () => seedRunUserMessage() } : {}),
          resume: {
            requested: requestBody.resume === true,
            canResume: (candidate) =>
              candidate.status === 'failed'
              && candidate.agentId === 'amr'
              && (
                candidate.failureAction === 'recharge'
                || candidate.errorCode === 'AMR_INSUFFICIENT_BALANCE'
              ),
          },
        });
      } else {
      if (error instanceof OdNextTaskInputSnapshotError) {
        return sendApiError(res, 400, error.code, error.message);
      }
      if (error instanceof InvalidStrategyTaskRecordError) {
        return sendApiError(res, 409, 'OD_NEXT_TASK_STATE_INVALID', error.message);
      }
      if (clarificationTask) {
        return sendApiError(
          res,
          409,
          'STRATEGY_TASK_TRANSITION_CONFLICT',
          error instanceof Error ? error.message : String(error),
        );
      }
      throw error;
      }
    }
    if (preparedRun.kind !== 'ready') {
      removeOdNextTaskInputSnapshotBestEffort(
        createdTaskInputSnapshot,
        taskInputSnapshotsRoot,
        'non-ready',
      );
      if (
        resolvedSnapshot?.created === true
        && resolvedSnapshot.snapshot.pluginId === 'od-next-strategy'
        && !removeProvisionalAutomaticSnapshot(db, resolvedSnapshot)
      ) {
        console.warn(
          `[od-next-rollout] retained referenced strategy snapshot ${resolvedSnapshot.snapshotId} after non-ready Run preparation`,
        );
      }
    }
    if (preparedRun.kind === 'idempotency_conflict') {
      return sendApiError(
        res,
        409,
        'IDEMPOTENCY_CONFLICT',
        'clientRequestId is already associated with a different logical run request',
      );
    }
    if (preparedRun.kind === 'ready' && preparedRun.creationKind === 'created') {
      const blockingRun = activeRunBlockingDesignSystemEnrichment(design.runs, {
        conversationId: meta.conversationId,
        analyticsHints: meta.analyticsHints,
        excludeRunId: preparedRun.run.id,
      });
      if (blockingRun) {
        design.runs.drop(preparedRun.run);
        return sendApiError(
          res,
          409,
          'DESIGN_SYSTEM_ENRICHMENT_IN_PROGRESS',
          'a design-system enrichment run is already active for this conversation',
          {
            details: {
              kind: 'design_system_enrichment_in_progress',
              runId: blockingRun.id,
              conversationId: blockingRun.conversationId ?? '',
            },
          },
        );
      }
    }
    const run = preparedRun.run;
    const analyticsAttributionMismatch =
      (preparedRun.kind !== 'ready' || preparedRun.creationKind === 'reused')
      && externalPluginAttributionMismatch(
        run.externalPluginAnalytics,
        meta.analyticsHints,
      );
    if (preparedRun.kind === 'reused') {
      let strategyTask;
      try {
        const task = strategyTaskForRun(run);
        strategyTask = task ? projectStrategyTask(task, run.id) : null;
      } catch (error) {
        if (
          error instanceof InvalidFrozenSkillPackageError
          || error instanceof InvalidStrategyTaskRecordError
        ) {
          return sendApiError(
            res,
            409,
            error instanceof InvalidFrozenSkillPackageError
              ? 'OD_NEXT_SKILL_SNAPSHOT_INVALID'
              : 'OD_NEXT_TASK_STATE_INVALID',
            error.message,
          );
        }
        throw error;
      }
      return res.status(202).json({
        runId: run.id,
        conversationId: run.conversationId ?? null,
        assistantMessageId: run.assistantMessageId ?? null,
        clientRequestId: run.clientRequestId ?? null,
        reused: true,
        resumed: false,
        ...(analyticsAttributionMismatch
          ? { analyticsAttributionMismatch: true }
          : {}),
        ...(run.appliedPluginSnapshotId
          ? { appliedPluginSnapshotId: run.appliedPluginSnapshotId }
          : {}),
        ...(run.pluginId ? { pluginId: run.pluginId } : {}),
        ...(strategyTask ? { taskExecutionId: strategyTask.taskExecutionId } : {}),
        ...(strategyTask ? { strategyTask } : {}),
      });
    }
    if (preparedRun.kind === 'resume_not_allowed') {
      return sendApiError(
        res,
        409,
        'RUN_NOT_RECHARGE_RESUMABLE',
        'Only a failed OpenDesign Cloud run waiting for recharge can be resumed with the same request',
      );
    }
    if (preparedRun.kind === 'assistant_claim_conflict') {
      return sendApiError(
        res,
        409,
        'RUN_IN_PROGRESS',
        'assistantMessageId is already bound to an active run',
      );
    }
    const resumed = preparedRun.resumed;
    const declaredClient = String(req.get('x-od-client') ?? '').toLowerCase();
    if (requestAnalyticsContext?.clientType === 'external_mcp') {
      run.clientType = 'external_mcp';
    } else if (declaredClient === 'desktop' || declaredClient === 'web') {
      run.clientType = declaredClient;
    } else {
      const ua = String(req.get('user-agent') ?? '');
      run.clientType = ua.includes('Electron/') ? 'desktop' : 'web';
    }
    if (resolvedSnapshot?.ok || clarificationTask) {
      try {
        linkSnapshotToRun(
          db,
          clarificationTask?.snapshotId ?? resolvedSnapshot!.snapshotId,
          run.id,
        );
      } catch {
        // Linking is best-effort here; in-memory run still carries the id.
      }
    }
    let strategyTask;
    try {
      const task = strategyTaskForRun(run);
      strategyTask = task ? projectStrategyTask(task, run.id) : null;
    } catch (error) {
      if (
        !(error instanceof InvalidFrozenSkillPackageError)
        && !(error instanceof InvalidStrategyTaskRecordError)
      ) throw error;
      design.runs.fail(
        run,
        error instanceof InvalidFrozenSkillPackageError
          ? 'OD_NEXT_SKILL_SNAPSHOT_INVALID'
          : 'OD_NEXT_TASK_STATE_INVALID',
        error.message,
      );
      return res.status(202).json({
        runId: run.id,
        conversationId: run.conversationId ?? null,
        assistantMessageId: run.assistantMessageId ?? null,
        clientRequestId: run.clientRequestId ?? null,
        reused: false,
        resumed: false,
      });
    }
    if (strategyTask) run.strategyTask = strategyTask;
    const body = {
      runId: run.id,
      conversationId: run.conversationId ?? null,
      assistantMessageId: run.assistantMessageId ?? null,
      clientRequestId: run.clientRequestId ?? null,
      reused: preparedRun.creationKind === 'reused',
      resumed,
      ...(analyticsAttributionMismatch
        ? { analyticsAttributionMismatch: true }
        : {}),
      ...(run.appliedPluginSnapshotId
        ? { appliedPluginSnapshotId: run.appliedPluginSnapshotId }
        : {}),
      ...(run.pluginId ? { pluginId: run.pluginId } : {}),
      ...(strategyTask ? { taskExecutionId: strategyTask.taskExecutionId } : {}),
      ...(strategyTask ? { strategyTask } : {}),
    };
    res.status(202).json(body);
    if (
      !clarificationTask
      && !resumed
      && resolvedSnapshot?.ok
      && resolvedSnapshot.snapshot.pipeline
    ) {
      firePipelineForRun({
        run,
        snapshot: resolvedSnapshot.snapshot,
        runs: design.runs,
        db,
      });
    }
    reconcileAssistantMessageOnRunEnd(db, design.runs, run);
    if (run.projectId && run.conversationId) {
      try {
        const project = toProjectRecord(getProject(db, run.projectId));
        const projectRoot = resolveProjectDir(PROJECTS_DIR, run.projectId, project?.metadata);
        detectSkillPluginCandidateOnRunSuccess(db, design.runs, run, requestBody, projectRoot);
      } catch (err) {
        console.warn('[plugins] skill candidate hook setup failed', err);
      }
    }
    const executionMeta: RunCreateMeta = {
      ...meta,
      ...(requestBody.byokProvider !== undefined
        ? { byokProvider: requestBody.byokProvider }
        : {}),
    };
    internalRuns.start(
      run,
      {
        body: requestBody,
        requestAnalyticsContext,
        snapshot: resolvedSnapshot,
        // The decision this request evaluated, not the one stamped on the Run:
        // an idempotent retry reuses a Run that already carries an earlier
        // decision, and `run_created`'s rollout dimensions have always
        // described the request. See `harnessAnalyticsFromRolloutDecision`,
        // which deliberately reads the Run instead.
        rolloutDecision: strategyRolloutDecision,
        creationKind: preparedRun.creationKind,
        resumed,
        attributionMismatch: analyticsAttributionMismatch,
      },
      () => startChatRun(executionMeta, run),
    );
  };

  registerRunCreateRoute(app, handleRunCreate, sendApiError);

  app.get('/api/runs', async (req: ApiRequest, res: ApiResponse) => {
    const { projectId, conversationId, status } = req.query;
    const runs = design.runs.list({ projectId, conversationId, status });
    let visibleRuns = runs;
    if (typeof projectId === 'string' && projectId) {
      const binding =
        ctx.projectStore?.getWorkspaceProjectByProjectId(db, projectId);
      if (binding) {
        const requestContext = workspaceResourceContextFromRequest(req);
        if (requestContext === null) {
          // Headerless local CLI/MCP callers may list only the runs whose
          // persisted runtime is known not to use AMR's Workspace billing
          // plane. Filtering the whole set avoids both insertion-order bugs:
          // an AMR first row cannot block local runs, and a non-AMR first row
          // cannot accidentally reveal AMR or unknown-runtime runs.
          visibleRuns = runs.filter(
            (run) =>
              typeof run.agentId === 'string'
              && run.agentId.length > 0
              && run.agentId !== 'amr',
          );
        } else if (
          ctx.authorizeProjectRequest
          && !await ctx.authorizeProjectRequest(
            req,
            res,
            projectId,
            { mode: 'read' },
          )
        ) {
          return;
        }
      }
    } else if (
      ctx.projectStore
      && runs.some(
        (run) =>
          run.projectId
          && ctx.projectStore?.getWorkspaceProjectByProjectId(db, run.projectId),
      )
    ) {
      return sendApiError(
        res,
        400,
        'PROJECT_SCOPE_REQUIRED',
        'projectId is required when listing Workspace-bound runs',
      );
    }
    const body = { runs: visibleRuns.map(statusWithStrategyTask) };
    res.json(body);
  });

  app.get('/api/runs/by-plugin-workflow/:workflowId', (req: ApiRequest, res: ApiResponse) => {
    let pluginWorkflowId: string;
    try {
      pluginWorkflowId = validatePluginWorkflowId(req.params.workflowId);
    } catch {
      return sendApiError(
        res,
        400,
        'PLUGIN_CONTRACT_REJECTED',
        'pluginWorkflowId must be a canonical UUID or ULID',
      );
    }
    const run = design.runs.findByPluginWorkflowId(pluginWorkflowId);
    const analytics =
      run?.externalPluginAnalytics
      && run.externalPluginAnalytics.externalPluginId
        === OPEN_DESIGN_PLUGIN_ID
        ? run.externalPluginAnalytics
        : null;
    if (!run || !analytics) {
      return sendApiError(
        res,
        404,
        'NOT_FOUND',
        'plugin workflow run not found',
      );
    }
    res.json({
      runId: run.id,
      projectId: run.projectId,
      pluginWorkflowId,
      logicalRequestDigest: analytics.logicalRequestDigest,
      logicalRequestDigestVersion: analytics.logicalRequestDigestVersion,
      externalPluginContext: {
        id: analytics.externalPluginId,
        version: analytics.externalPluginVersion,
        distributionMechanism: analytics.distributionMechanism,
        publisherClass: analytics.publisherClass,
      },
    });
  });

  app.get('/api/runs/:id/result-package', async (req: ApiRequest, res: ApiResponse) => {
    const runId = routeParamId(req);
    if (!runId) return sendApiError(res, 400, 'BAD_REQUEST', 'run id missing');
    const requestedRun = design.runs.get(runId);
    let task;
    try {
      task = getStrategyTaskExecutionByRunId(db, runId);
    } catch (error) {
      if (error instanceof InvalidStrategyTaskRecordError) {
        return sendApiError(res, 409, 'OD_NEXT_TASK_STATE_INVALID', error.message);
      }
      if (error instanceof InvalidFrozenSkillPackageError) {
        return sendApiError(res, 409, 'OD_NEXT_SKILL_SNAPSHOT_INVALID', error.message);
      }
      throw error;
    }
    const resultRunId = task?.terminalRunId ?? task?.latestRunId ?? runId;
    const run = design.runs.get(resultRunId);
    if (!requestedRun || !run) return sendApiError(res, 404, 'NOT_FOUND', 'run not found');
    if (!await authorizeRunProject(req, res, run, { mode: 'read' })) return;
    const status = statusWithStrategyTask(run);
    const project = run.projectId ? toProjectRecord(getProject(db, run.projectId)) : null;
    let files: ProjectFileEntry[] = [];
    if (project) {
      const packageMetadata = run.projectMetadata ?? null;
      try {
        if (status.workspace?.storage?.kind === 'folder-backed') {
          const projectRoot = resolveProjectDir(PROJECTS_DIR, project.id, packageMetadata);
          const projectRootStat = await fs.promises.stat(projectRoot);
          if (!projectRootStat.isDirectory()) {
            throw new Error('workspace root is not a directory');
          }
        }
        files = toProjectFiles(await listFiles(PROJECTS_DIR, project.id, { metadata: packageMetadata }));
      } catch (err) {
        return sendApiError(
          res,
          500,
          'WORKSPACE_ENUMERATION_FAILED',
          err instanceof Error ? err.message : String(err),
        );
      }
    }
    const artifacts = files
      .filter((file): file is ProjectFileEntry & { artifactManifest: ArtifactManifest } =>
        Boolean(file.artifactManifest && typeof file.artifactManifest === 'object'),
      )
      .map((file) => ({
        file: file.name,
        kind: typeof file.artifactManifest.kind === 'string'
          ? file.artifactManifest.kind
          : file.artifactKind ?? null,
        renderer: typeof file.artifactManifest.renderer === 'string'
          ? file.artifactManifest.renderer
          : null,
        title: typeof file.artifactManifest.title === 'string'
          ? file.artifactManifest.title
          : file.name,
        status: typeof file.artifactManifest.status === 'string'
          ? file.artifactManifest.status
          : null,
        manifest: file.artifactManifest,
      }));
    const body: RunResultPackageResponse = {
      schema: RUN_RESULT_PACKAGE_SCHEMA,
      run: {
        id: status.id,
        status: status.status,
        projectId: status.projectId,
        conversationId: status.conversationId,
        assistantMessageId: status.assistantMessageId,
        agentId: status.agentId,
        createdAt: status.createdAt,
        updatedAt: status.updatedAt,
        ...(status.cancelRequested !== undefined
          ? { cancelRequested: status.cancelRequested }
          : {}),
        ...(status.exitCode !== undefined ? { exitCode: status.exitCode } : {}),
        ...(status.signal !== undefined ? { signal: status.signal } : {}),
        ...(status.error !== undefined ? { error: status.error } : {}),
        ...(status.errorCode !== undefined ? { errorCode: status.errorCode } : {}),
      },
      ...(status.strategyTask ? { strategyTask: status.strategyTask } : {}),
      workspace: status.workspace ?? {
        storage: { kind: 'od-owned', baseDir: null },
        provenance: null,
      },
      events: {
        logPath: status.eventsLogPath ?? null,
      },
      project: project
        ? {
            id: project.id,
            name: project.name,
            fileCount: files.length,
          }
        : null,
      artifacts,
    };
    res.json(body);
  });

  app.get('/api/runs/:id', async (req: ApiRequest, res: ApiResponse) => {
    const runId = routeParamId(req);
    if (!runId) return sendApiError(res, 400, 'BAD_REQUEST', 'run id missing');
    const run = design.runs.get(runId);
    if (!run) return sendApiError(res, 404, 'NOT_FOUND', 'run not found');
    if (!await authorizeRunProject(req, res, run, { mode: 'read' })) return;
    const status = statusWithStrategyTask(run);
    if (!design.runs.isTerminal(run.status)) {
      res.json(status);
      return;
    }
    if (
      typeof status.deliverableValid === 'boolean'
      && typeof status.deliverableValidation === 'string'
    ) {
      res.json(status);
      return;
    }
    const touchedArtifactPaths = runTouchedArtifactPaths(run);
    const deliverable = await validateChatRunDeliverable({
      db,
      projectsRoot: PROJECTS_DIR,
      run,
      runStatus: run.status,
      artifactCount:
        typeof status.artifactCount === 'number' ? status.artifactCount : 0,
      ...(touchedArtifactPaths
        ? { touchedPaths: touchedArtifactPaths }
        : {}),
    });
    design.runs.setDeliverableValidation?.(run, deliverable);
    res.json({
      ...status,
      deliverableValid: deliverable.valid,
      deliverableValidation: deliverable.validation,
      ...(deliverable.entryFile
        ? { deliverableEntryFile: deliverable.entryFile }
        : {}),
      ...(deliverable.artifactKind
        ? { deliverableArtifactKind: deliverable.artifactKind }
        : {}),
    });
  });

  app.get('/api/runs/:id/events', async (req: ApiRequest, res: ApiResponse) => {
    const runId = routeParamId(req);
    if (!runId) return sendApiError(res, 400, 'BAD_REQUEST', 'run id missing');
    const run = design.runs.get(runId);
    if (!run) return sendApiError(res, 404, 'NOT_FOUND', 'run not found');
    if (!await authorizeRunProject(
      req,
      res,
      run,
      { mode: 'read', allowNavigationQuery: true },
    )) return;
    design.runs.stream(run, req, res);
  });

  app.get('/api/runs/:id/agui', async (req: ApiRequest, res: ApiResponse) => {
    const runId = routeParamId(req);
    if (!runId) return sendApiError(res, 400, 'BAD_REQUEST', 'run id missing');
    const run = design.runs.get(runId);
    if (!run) return sendApiError(res, 404, 'NOT_FOUND', 'run not found');
    if (!await authorizeRunProject(
      req,
      res,
      run,
      { mode: 'read', allowNavigationQuery: true },
    )) return;
    const { encodeOdEventForAgui } = await import('@open-design/agui-adapter');
    const sse = createSseResponse(res);
    const lastEventId = Number(req.get('Last-Event-ID') || req.query.after || 0);
    const emitMapped = (record: RunEventRecord) => {
      const nativeEvent = toOdNativeEvent(record);
      if (!nativeEvent) return;
      const mapped = encodeOdEventForAgui(
        nativeEvent,
        { runId: run.id, seq: record.id, now: Date.now() },
      );
      if (mapped) sse.send(mapped.kind, mapped, record.id);
    };
    for (const record of run.events) {
      if (!Number.isFinite(lastEventId) || record.id > lastEventId) emitMapped(record);
    }
    if (design.runs.isTerminal(run.status)) {
      sse.end();
      return;
    }
    const adapterClient = {
      send: (event: string, data: unknown, id?: number) => {
        const nativeEvent = toOdNativeEvent({
          id: id ?? 0,
          event,
          data,
          timestamp: Date.now(),
        });
        if (!nativeEvent) return;
        const ctx = id === undefined
          ? { runId: run.id, now: Date.now() }
          : { runId: run.id, seq: id, now: Date.now() };
        const mapped = encodeOdEventForAgui(nativeEvent, ctx);
        if (mapped) sse.send(mapped.kind, mapped, id);
      },
      end:     () => sse.end(),
      cleanup: () => sse.cleanup?.(),
    };
    run.clients.add(adapterClient);
    res.on('close', () => {
      run.clients.delete(adapterClient);
      sse.cleanup?.();
    });
  });

  app.post('/api/runs/:id/cancel', async (req: ApiRequest, res: ApiResponse) => {
    const runId = routeParamId(req);
    if (!runId) return sendApiError(res, 400, 'BAD_REQUEST', 'run id missing');
    const run = design.runs.get(runId);
    if (!run) return sendApiError(res, 404, 'NOT_FOUND', 'run not found');
    if (!await authorizeRunProject(
      req,
      res,
      run,
      { mode: 'write', capability: 'writeFiles' },
    )) return;
    let task;
    try {
      task = getStrategyTaskExecutionByRunId(db, runId);
    } catch (error) {
      if (error instanceof InvalidStrategyTaskRecordError) {
        return sendApiError(res, 409, 'OD_NEXT_TASK_STATE_INVALID', error.message);
      }
      if (error instanceof InvalidFrozenSkillPackageError) {
        return sendApiError(res, 409, 'OD_NEXT_SKILL_SNAPSHOT_INVALID', error.message);
      }
      throw error;
    }
    const activeRun = task?.activeRunId ? design.runs.get(task.activeRunId) : null;
    let cancelRun = activeRun ?? run;
    let taskForCancel = task;
    if (taskForCancel && !['completed', 'blocked', 'canceled'].includes(taskForCancel.outcome)) {
      let canceled = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const physicalRunId = taskForCancel.activeRunId ?? cancelRun.id;
        try {
          canceled = cancelStrategyTaskExecution(db, {
            taskExecutionId: taskForCancel.taskExecutionId,
            expectedRevision: taskForCancel.revision,
          });
          cancelRun = design.runs.get(physicalRunId) ?? cancelRun;
          break;
        } catch (error) {
          if (!(error instanceof StrategyTaskTransitionConflictError)) throw error;
          const latest = getStrategyTaskExecutionByRunId(db, cancelRun.id)
            ?? getStrategyTaskExecutionByRunId(db, runId);
          if (!latest) throw error;
          taskForCancel = latest;
          if (['completed', 'blocked', 'canceled'].includes(latest.outcome)) {
            canceled = latest;
            break;
          }
        }
      }
      if (!canceled || !['completed', 'blocked', 'canceled'].includes(canceled.outcome)) {
        return sendApiError(
          res,
          409,
          'STRATEGY_TASK_CANCEL_CONFLICT',
          'strategy task changed while cancellation was being applied',
        );
      }
      cancelRun.strategyTask = projectStrategyTask(canceled, cancelRun.id);
    }
    // Logical CAS wins before physical finish: the emitted end frame therefore
    // carries the terminal task projection and can never advertise a running
    // task after the cancel response already succeeded.
    await design.runs.cancel(cancelRun, 'user_stop');
    const body = { ok: true, run: statusWithStrategyTask(cancelRun) };
    res.json(body);
  });

  app.post('/api/chat', async (req: ApiRequest, res: ApiResponse) => {
    if (ctx.lifecycle.isDaemonShuttingDown()) {
      return sendApiError(res, 503, 'UPSTREAM_UNAVAILABLE', 'daemon is shutting down');
    }
    const requestBody = toJsonRecord(req.body);
    const mediaExecution = parseMediaExecutionPolicyInput(requestBody.mediaExecution);
    if (!mediaExecution.ok) {
      return sendApiError(res, 400, 'BAD_REQUEST', mediaExecution.message);
    }
    const toolBundle = parseRunToolBundleForRequest(requestBody.toolBundle);
    if (!toolBundle.ok) {
      return sendApiError(res, 400, 'BAD_REQUEST', toolBundle.message);
    }
    let chatProject: ProjectRecord | null = null;
    if (typeof requestBody.projectId === 'string' && requestBody.projectId) {
      try {
        chatProject = toProjectRecord(getProject(db, requestBody.projectId));
        assertSandboxProjectRootAvailable(chatProject?.metadata);
      } catch (err) {
        if (err instanceof SandboxImportedProjectError) {
          return sendApiError(res, 400, 'BAD_REQUEST', err.message);
        }
        throw err;
      }
    }
    // A chat run may only attach to a conversation owned by its own project.
    // Without this guard, pairing projectId=A with a conversationId owned by
    // project B runs in A's cwd but pins messages and the native session under
    // B — corrupting B's history and resume identity. Mirror the ownership
    // check the sibling routes already enforce (handoff.ts, terminal.ts).
    if (typeof requestBody.projectId === 'string' && requestBody.projectId &&
        typeof requestBody.conversationId === 'string' && requestBody.conversationId) {
      const chatConversation = getConversation(db, requestBody.conversationId);
      if (chatConversation && chatConversation.projectId !== requestBody.projectId) {
        return sendApiError(res, 404, 'CONVERSATION_NOT_FOUND', 'conversation not found for project');
      }
    }
    let authorizedBoundMutation = false;
    if (typeof requestBody.projectId === 'string' && requestBody.projectId) {
      const authorization = await authorizeRunProjectBeforePluginResolution(
        req,
        res,
        requestBody.projectId,
      );
      if (!authorization.ok) return;
      authorizedBoundMutation = authorization.authorizedBoundMutation;
    }
    let clarificationResolution;
    try {
      clarificationResolution = resolveClarificationContinuation(requestBody);
    } catch (error) {
      if (
        error instanceof InvalidFrozenSkillPackageError
        || error instanceof InvalidStrategyTaskRecordError
      ) {
        return sendApiError(
          res,
          409,
          error instanceof InvalidFrozenSkillPackageError
            ? 'OD_NEXT_SKILL_SNAPSHOT_INVALID'
            : 'OD_NEXT_TASK_STATE_INVALID',
          error.message,
        );
      }
      throw error;
    }
    if (clarificationResolution.kind === 'error') {
      return sendApiError(
        res,
        clarificationResolution.status,
        clarificationResolution.code,
        clarificationResolution.message,
      );
    }
    const clarificationContinuation = clarificationResolution.kind === 'continuation'
      ? clarificationResolution.value
      : null;
    const clarificationTask = clarificationContinuation?.task ?? null;
    if (!hasCompleteByokOpenCodeConfig({
      ...requestBody,
      ...(clarificationTask ? { agentId: clarificationTask.selectedAgentId } : {}),
    })) {
      return sendApiError(
        res,
        400,
        'VALIDATION_FAILED',
        BYOK_OPENCODE_PROVIDER_REQUIRED_MESSAGE,
      );
    }
    const meta: RunCreateMeta = {
      ...withoutSensitiveRunInput(requestBody),
      mediaExecution: mediaExecution.policy,
      toolBundle: toolBundle.bundle,
      ...(chatProject?.metadata ? { projectMetadata: chatProject.metadata } : {}),
      workspaceScope: null,
    };
    if (clarificationContinuation) {
      applyClarificationContinuationMeta(meta, clarificationContinuation);
      meta.odNextTaskInputSnapshot = design.runs.get(
        clarificationContinuation.sourceRunId,
      )?.odNextTaskInputSnapshot ?? null;
    }
    const toolBundleSupport = validateRunToolBundleForAgent(
      toolBundle.bundle,
      typeof meta.agentId === 'string' ? getAgentDef(meta.agentId) : null,
      {
        deliveryTarget: runToolBundleDeliveryTargetForProject(
          meta.projectId,
          chatProject?.metadata,
        ),
      },
    );
    if (!toolBundleSupport.ok) {
      return sendApiError(res, 400, 'BAD_REQUEST', toolBundleSupport.message);
    }
    // Mirror the POST /api/runs ownership check: the assistantMessageId must
    // reference an assistant message in THIS conversation, or the run mutates a
    // row it does not own via the id-only writers (#6418 review).
    const chatAssistantMessageId =
      typeof meta.assistantMessageId === 'string' && meta.assistantMessageId
        ? meta.assistantMessageId
        : null;
    if (chatAssistantMessageId) {
      // Without a resolvable conversation there is nothing to validate the
      // assistantMessageId against — the run would mutate a row it does not
      // own via the id-only writers (nettee on #6418).
      if (typeof meta.conversationId !== 'string' || !meta.conversationId) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'assistantMessageId requires a conversation');
      }
      const chatConversation = getConversation(db, meta.conversationId);
      if (
        !chatConversation
        || (
          typeof meta.projectId === 'string'
          && meta.projectId
          && chatConversation.projectId !== meta.projectId
        )
      ) {
        return sendApiError(res, 404, 'CONVERSATION_NOT_FOUND', 'conversation not found for project');
      }
      const existingAssistantPin = db
        .prepare(
          `SELECT role, conversation_id AS conversationId, run_id AS runId, run_status AS runStatus FROM messages WHERE id = ?`,
        )
        .get(chatAssistantMessageId) as
        | { role?: unknown; conversationId?: unknown; runId?: unknown; runStatus?: unknown }
        | undefined;
      if (existingAssistantPin && existingAssistantPin.role !== 'assistant') {
        return sendApiError(
          res,
          409,
          'INVALID_ASSISTANT_MESSAGE',
          'assistantMessageId must reference an assistant message',
        );
      }
      if (
        existingAssistantPin
        && existingAssistantPin.conversationId !== meta.conversationId
      ) {
        return sendApiError(
          res,
          409,
          'IDEMPOTENCY_CONFLICT',
          'assistantMessageId belongs to a different conversation',
        );
      }
    }
    if (typeof meta.projectId === 'string' && meta.projectId) {
      const preparedWorkspaceScope =
        await prepareRunWorkspaceScope(
          req,
          res,
          meta.projectId,
          meta.agentId,
          authorizedBoundMutation,
        );
      if (!preparedWorkspaceScope.ok) return;
      meta.workspaceScope = preparedWorkspaceScope.workspaceScope;
    }
    const chatPluginId = clarificationTask?.strategyId
      ?? (typeof requestBody.pluginId === 'string' ? requestBody.pluginId : null);
    if (
      chatPluginId
      && ctx.plugins.authorizePluginRequest
      && !await ctx.plugins.authorizePluginRequest(req, res, chatPluginId)
    ) return;
    if (
      typeof meta.projectId === 'string'
      && meta.projectId
      && !requestedSnapshotBelongsToProject(
        res,
        meta.projectId,
        meta.appliedPluginSnapshotId,
      )
    ) return;
    meta.requestFingerprint = runRequestFingerprint(
      meta,
      clarificationContinuation?.snapshot,
    );
    let preparedRun;
    try {
      preparedRun = internalRuns.prepare({
        meta,
        ...(clarificationContinuation && !clarificationContinuation.retry
          ? {
              beforeClaimCommit: (candidate) => {
                beginStrategyClarification(db, {
                  taskExecutionId: clarificationContinuation.task.taskExecutionId,
                  sourceRunId: clarificationContinuation.sourceRunId,
                  nextRunId: candidate.id,
                  answer: clarificationContinuation.answer,
                });
              },
            }
          : {}),
      });
    } catch (error) {
      if (error instanceof InvalidStrategyTaskRecordError) {
        return sendApiError(res, 409, 'OD_NEXT_TASK_STATE_INVALID', error.message);
      }
      if (clarificationContinuation) {
        return sendApiError(
          res,
          409,
          'STRATEGY_TASK_TRANSITION_CONFLICT',
          error instanceof Error ? error.message : String(error),
        );
      }
      throw error;
    }
    if (preparedRun.kind === 'idempotency_conflict') {
      return sendApiError(
        res,
        409,
        'IDEMPOTENCY_CONFLICT',
        'clientRequestId is already associated with a different logical run request',
      );
    }
    if (preparedRun.kind === 'ready' && preparedRun.creationKind === 'created') {
      const blockingRun = activeRunBlockingDesignSystemEnrichment(design.runs, {
        conversationId: meta.conversationId,
        analyticsHints: meta.analyticsHints,
        excludeRunId: preparedRun.run.id,
      });
      if (blockingRun) {
        design.runs.drop(preparedRun.run);
        return sendApiError(
          res,
          409,
          'DESIGN_SYSTEM_ENRICHMENT_IN_PROGRESS',
          'a design-system enrichment run is already active for this conversation',
          {
            details: {
              kind: 'design_system_enrichment_in_progress',
              runId: blockingRun.id,
              conversationId: blockingRun.conversationId ?? '',
            },
          },
        );
      }
    }
    const run = preparedRun.run;
    if (preparedRun.kind === 'reused') {
      let strategyTask;
      try {
        const task = strategyTaskForRun(run);
        strategyTask = task ? projectStrategyTask(task, run.id) : null;
      } catch (error) {
        if (
          error instanceof InvalidFrozenSkillPackageError
          || error instanceof InvalidStrategyTaskRecordError
        ) {
          return sendApiError(
            res,
            409,
            error instanceof InvalidFrozenSkillPackageError
              ? 'OD_NEXT_SKILL_SNAPSHOT_INVALID'
              : 'OD_NEXT_TASK_STATE_INVALID',
            error.message,
          );
        }
        throw error;
      }
      if (strategyTask) run.strategyTask = strategyTask;
      design.runs.stream(run, req, res);
      return;
    }
    if (preparedRun.kind === 'assistant_claim_conflict') {
      return sendApiError(
        res,
        409,
        'RUN_IN_PROGRESS',
        'assistantMessageId is already bound to an active run',
      );
    }
    if (preparedRun.kind === 'resume_not_allowed') {
      return sendApiError(
        res,
        409,
        'RUN_NOT_RECHARGE_RESUMABLE',
        'Only a failed Open Design Cloud run waiting for recharge can be resumed with the same request',
      );
    }
    if (clarificationContinuation) {
      try {
        linkSnapshotToRun(db, clarificationContinuation.task.snapshotId, run.id);
      } catch {
        // The locked snapshot remains on the in-memory Run; linking is best-effort.
      }
    }
    let strategyTask;
    try {
      const task = strategyTaskForRun(run);
      strategyTask = task ? projectStrategyTask(task, run.id) : null;
    } catch (error) {
      if (
        error instanceof InvalidFrozenSkillPackageError
        || error instanceof InvalidStrategyTaskRecordError
      ) {
        design.runs.fail(
          run,
          error instanceof InvalidFrozenSkillPackageError
            ? 'OD_NEXT_SKILL_SNAPSHOT_INVALID'
            : 'OD_NEXT_TASK_STATE_INVALID',
          error.message,
        );
        design.runs.stream(run, req, res);
        return;
      }
      throw error;
    }
    if (strategyTask) run.strategyTask = strategyTask;
    design.runs.stream(run, req, res);
    reconcileAssistantMessageOnRunEnd(db, design.runs, run);
    const executionMeta: RunCreateMeta = {
      ...meta,
      ...(requestBody.byokProvider !== undefined
        ? { byokProvider: requestBody.byokProvider }
        : {}),
    };
    internalRuns.start(
      run,
      { body: requestBody, requestAnalyticsContext: readAnalyticsContext(req) },
      () => startChatRun(executionMeta, run),
    );
  });
}

export const __forTestHasCompleteByokOpenCodeConfig = hasCompleteByokOpenCodeConfig;
export const __forTestWithoutSensitiveRunInput = withoutSensitiveRunInput;
