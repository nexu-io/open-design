import type { Express, Request, Response } from 'express';
import type Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import {
  defaultScenarioPluginIdForProjectMetadata,
  RUN_RESULT_PACKAGE_SCHEMA,
  type AppliedPluginSnapshot,
  type ArtifactManifest,
  type ByokChatProviderConfig,
  type ChatRunStatus,
  type ChatRunStatusResponse,
  type ProjectMetadata as ContractProjectMetadata,
  type RunResultPackageResponse,
} from '@open-design/contracts';
import {
  buildRunCreatedV4Aliases,
  buildRunFinishedV4Aliases,
  deriveConfigureGlobals,
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
  type VerifyWorkspaceRequestAuthority,
  type WorkspaceResourceAccessInput,
} from '../collab/workspace-resource-mutation.js';
import {
  codexSessionIdFromRunEvents,
  readCodexRolloutFirstCall,
} from '../codex-rollout-usage.js';
import type { ConnectorService } from '../connectors/service.js';
import {
  conversationTurnIndexForRun,
  getFirstProjectConversation,
  getConversation,
  getProject,
  normalizeConversationSessionMode,
  updateProject,
  upsertMessage,
} from '../db.js';
import { readVelaLoginStatus } from '../integrations/vela.js';
import { getDetectedRuntimeVersions } from '../runtimes/detection.js';
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
  buildConnectorProbe,
  getInstalledPlugin,
  resolvePluginSnapshot,
} from '../plugins/index.js';
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
import {
  deriveActivationMilestones,
  runAskedUserQuestion,
} from '../runtimes/run-artifacts.js';
import {
  pinRunWorkspaceScopeForProject,
  type PinnedRunWorkspaceScope,
} from '../runtimes/project-amr-trace-env.js';
import {
  runArtifactCountForRun,
  runDesignSystemCreatedForRun,
  runPreviewModuleCountForRun,
} from '../runtimes/run-lifecycle-analytics.js';
import { normalizeCommentAttachments } from '../runtimes/chat-prompt-inputs.js';

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
type JsonRecord = Record<string, unknown>;
type ApiRequest = Request<Record<string, string>, unknown, JsonRecord>;
type ApiResponse = Response<unknown>;
type ProjectMetadata = (Partial<ContractProjectMetadata> & JsonRecord) | null | undefined;
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

interface ProjectRecord {
  id: string;
  name: string;
  createdAt?: number;
  updatedAt?: number;
  designSystemId?: string | null;
  metadata?: ProjectMetadata;
  appliedPluginSnapshotId?: string | null;
}

interface RunEventRecord
  extends RunEventForAnalyticsObservability,
    RunEventForDiagnostics,
    RunEventForFailureClassification {
  id: number;
  event: string;
  data: unknown;
  timestamp?: number;
}

interface SseClient {
  send(event: string, data: unknown, id?: number): void;
  end(): void;
  cleanup?(): void;
}

interface ChatRun {
  id: string;
  projectId: string | null;
  conversationId: string | null;
  assistantMessageId: string | null;
  clientRequestId?: string | null;
  requestFingerprint?: string | null;
  agentId: string | null;
  workspaceScope?: PinnedRunWorkspaceScope | null;
  model?: string | null;
  status: ChatRunStatus;
  createdAt: number;
  updatedAt: number;
  cancelRequested?: boolean;
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
  clients: Set<SseClient>;
  analyticsContext?: AnalyticsContext;
  analyticsRecovery?: { context?: AnalyticsContext } | null;
  externalPluginAnalytics?: Record<string, unknown> | null;
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
    diff?: RunArtifactDiff;
  };
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
}

interface RunCreateMeta extends JsonRecord {
  projectId?: string;
  conversationId?: string;
  userMessageId?: string;
  assistantMessageId?: string;
  clientRequestId?: string;
  requestFingerprint?: string;
  agentId?: string;
  pluginId?: string;
  appliedPluginSnapshotId?: string;
  message?: string;
  currentPrompt?: string;
  projectMetadata?: ProjectMetadata;
  workspaceScope?: PinnedRunWorkspaceScope | null;
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
  wait(run: ChatRun): Promise<ChatRunStatusResponse>;
  cancel(run: ChatRun): Promise<ChatRunStatusResponse>;
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

interface ProjectFileEntry {
  name: string;
  artifactKind?: string | null;
  artifactManifest?: ArtifactManifest | JsonRecord | null;
}

interface RunRetryAnalyticsEvent {
  event: string;
  data: Record<string, unknown>;
}

interface RunArtifactBaselines {
  take(runId: string): RunArtifactBaseline | undefined;
}

interface SseResponse {
  send(event: string, data: unknown, id?: number): void;
  end(): void;
  cleanup?(): void;
}

interface RunCreatedFallbackInput {
  analyticsContext: AnalyticsContext | null;
  run: ChatRun;
  status: string;
}

interface RunProjectKindInput {
  hintProjectKind: string | null;
  projectMetadata?: ProjectMetadata;
}

export interface RegisterRunRoutesDeps {
  db: SqliteDb;
  design: RunRoutesDesignService;
  http: {
    createSseResponse: (res: Response) => SseResponse;
    sendApiError: (
      res: Response,
      status: number,
      code: string,
      message: string,
    ) => Response<unknown> | void;
  };
  paths: {
    PROJECTS_DIR: string;
    RUNTIME_DATA_DIR: string;
  };
  agents: {
    detectAgents: (agentCliEnv?: Record<string, unknown>) => Promise<DetectedAgent[]>;
    getAgentDef: (agentId: string) => RuntimeAgentDef | null | undefined;
  };
  chat: {
    startChatRun: (meta: RunCreateMeta, run: ChatRun) => Promise<unknown>;
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
    pinAssistantMessageOnRunCreate: (db: SqliteDb, run: ChatRun) => void;
    reconcileAssistantMessageOnRunEnd: (
      db: SqliteDb,
      runs: ChatRunService,
      run: ChatRun,
    ) => void;
  };
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
    verifyWorkspaceRequestAuthority: VerifyWorkspaceRequestAuthority;
  };
}

type TerminalRunStatus = RunStatusForAnalytics & {
  status: string;
  error?: string | null;
  errorCode?: string | null;
  exitCode?: number | null;
  signal?: string | null;
};

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

function toJsonRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function toProjectRecord(value: unknown): ProjectRecord | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as JsonRecord;
  return typeof record.id === 'string'
    ? value as ProjectRecord
    : null;
}

async function validateChatRunDeliverable(input: {
  db: SqliteDb;
  projectsRoot: string;
  run: ChatRun;
  runStatus: ChatRunStatus;
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

function runTouchedArtifactPaths(run: ChatRun): string[] | undefined {
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

function isProjectEnrichableDesignSystem(project: ProjectRecord): boolean {
  if (typeof project.designSystemId === 'string' && project.designSystemId.length > 0) {
    return true;
  }
  const metadata = project.metadata;
  return metadata?.importedFrom === 'brand-extraction' || metadata?.importedFrom === 'design-system';
}

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

function normalizedDesignSystemId(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function resolveEffectiveDesignSystemSelection({
  requestDesignSystemId,
  pluginDesignSystemId,
  projectDesignSystemId,
  appDefaultDesignSystemId,
  disabledDesignSystemIds,
  allowAppDefault = true,
}: {
  requestDesignSystemId?: unknown;
  pluginDesignSystemId?: unknown;
  projectDesignSystemId?: unknown;
  appDefaultDesignSystemId?: unknown;
  disabledDesignSystemIds?: unknown;
  allowAppDefault?: boolean;
}): { id: string | null; source: DesignSystemSelectionSource } {
  const requestId = normalizedDesignSystemId(requestDesignSystemId);
  if (requestId) return { id: requestId, source: 'request' };

  const pluginId = normalizedDesignSystemId(pluginDesignSystemId);
  if (pluginId) return { id: pluginId, source: 'plugin' };

  const disabledIds = Array.isArray(disabledDesignSystemIds)
    ? disabledDesignSystemIds.map(normalizedDesignSystemId).filter(
        (value): value is string => value !== null,
      )
    : [];
  const projectId = normalizedDesignSystemId(projectDesignSystemId);
  if (projectId && !disabledIds.includes(projectId)) {
    return { id: projectId, source: 'project' };
  }

  if (allowAppDefault) {
    const appDefaultId = normalizedDesignSystemId(appDefaultDesignSystemId);
    if (appDefaultId) return { id: appDefaultId, source: 'app-default' };
  }

  return { id: null, source: 'none' };
}

function designSystemIdFromPluginSnapshot(snapshot: unknown): string | null {
  const items = (snapshot as { resolvedContext?: { items?: unknown } } | null | undefined)
    ?.resolvedContext?.items;
  if (!Array.isArray(items)) return null;
  const designSystemItems = items.filter(
    (item): item is { kind: string; id?: unknown; primary?: unknown } =>
      item !== null &&
      typeof item === 'object' &&
      (item as { kind?: unknown }).kind === 'design-system',
  );
  const primary = designSystemItems.find((item) => item.primary === true);
  return normalizedDesignSystemId(primary?.id ?? designSystemItems[0]?.id);
}

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

export function registerRunRoutes(app: Express, ctx: RegisterRunRoutesDeps) {
  const { db, design } = ctx;
  const { createSseResponse, sendApiError } = ctx.http;
  const { PROJECTS_DIR, RUNTIME_DATA_DIR } = ctx.paths;
  const { detectAgents, getAgentDef } = ctx.agents;
  const { startChatRun } = ctx.chat;
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
   * signed-in AMR request for a truly unbound historical project: a freshly
   * verified exact Personal identity becomes the persisted creator witness.
   * Every other runtime keeps its legacy local path and never reads Workspace
   * authority here.
   */
  async function prepareRunWorkspaceScope(
    req: ApiRequest,
    res: ApiResponse,
    projectId: string,
    agentId: unknown,
    authorizedBoundMutation = false,
  ): Promise<
    | { ok: true; workspaceScope: PinnedRunWorkspaceScope | null }
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
      sendApiError(
        res,
        409,
        'AMR_WORKSPACE_SCOPE_REQUIRED',
        'open the project from your Personal Workspace before running AMR Cloud',
      );
      return { ok: false };
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

    const verified =
      await ctx.amrWorkspaceScope.verifyWorkspaceRequestAuthority(req);
    if (!verified.ok) {
      sendApiError(res, verified.status, verified.code, verified.message);
      return { ok: false };
    }
    if (
      verified.context.workspaceId !== requestContext.workspaceId
      || verified.context.workspaceMemberId !== requestContext.workspaceMemberId
    ) {
      sendApiError(
        res,
        403,
        'WORKSPACE_ACCESS_DENIED',
        'the verified Workspace identity does not match the run request',
      );
      return { ok: false };
    }
    if (verified.context.workspaceType !== 'personal') {
      sendApiError(
        res,
        409,
        'AMR_PERSONAL_WORKSPACE_REQUIRED',
        'historical projects can only be adopted into a Personal Workspace',
      );
      return { ok: false };
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
        workspaceId: verified.context.workspaceId,
        visibility: 'personal',
        resourceState: 'active',
        createdByWorkspaceMemberId: verified.context.workspaceMemberId,
        updatedByWorkspaceMemberId: verified.context.workspaceMemberId,
        syncState: 'local_only',
        resourceHubResourceId: null,
        cloudTombstonedAt: null,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      });
      return getWorkspaceProjectByProjectId(db, projectId);
    });
    const adopted = bindPersonal();
    if (adopted?.workspaceId !== verified.context.workspaceId) {
      sendApiError(
        res,
        409,
        'AMR_WORKSPACE_SCOPE_CONFLICT',
        'the project was bound to another Workspace before AMR could start',
      );
      return { ok: false };
    }
    const workspaceScope = pinRunWorkspaceScopeForProject(db, projectId);
    if (!workspaceScope || workspaceScope.workspaceId !== verified.context.workspaceId) {
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

    // Local CLI/MCP callers predate Workspace transport headers. Once a run
    // exists, its persisted agentId is the reliable runtime discriminator:
    // non-AMR runtimes do not call the Workspace billing plane, so their
    // headerless status/stream/cancel lifecycle must not depend on Workspace
    // membership authority. AMR remains exact-authority-only. Likewise, any
    // caller that explicitly asserts a Workspace identity still goes through
    // the normal gate so a conflicting or partial scope cannot be ignored.
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
      typeof run.agentId === 'string'
      && run.agentId.length > 0
      && run.agentId !== 'amr'
      && requestContext === null
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

  app.post('/api/runs', async (req: ApiRequest, res: ApiResponse) => {
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
    let effectiveAgentId =
      typeof requestBody.agentId === 'string' && requestBody.agentId
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
    let preparedWorkspaceScope: PinnedRunWorkspaceScope | null = null;
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
    let resolvedSnapshot = null;
    if (typeof requestBody.projectId === 'string' && requestBody.projectId) {
      const explicitPlugin =
        requestBody.pluginId || requestBody.appliedPluginSnapshotId;
      let runResolveBody: JsonRecord = requestBody;
      if (!explicitPlugin) {
        const projectRow = toProjectRecord(getProject(db, requestBody.projectId));
        const hasPin =
          typeof projectRow?.appliedPluginSnapshotId === 'string'
          && projectRow.appliedPluginSnapshotId.length > 0;
        if (!hasPin) {
          const fallbackPluginId = defaultScenarioPluginIdForProjectMetadata(
            toScenarioProjectMetadata(projectRow?.metadata),
          );
          if (fallbackPluginId && getInstalledPlugin(db, fallbackPluginId)) {
            runResolveBody = { ...requestBody, pluginId: fallbackPluginId };
          }
        }
      }
      // Authorize the final plugin id, not only the literal request field.
      // Project-kind fallback may synthesize a pluginId, and it must not gain
      // a bypass around the same scoped catalog resolver.
      if (
        typeof runResolveBody.pluginId === 'string'
        && runResolveBody.pluginId.length > 0
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
      const resolved = resolvePluginSnapshot({
        db,
        body: runResolveBody,
        projectId: requestBody.projectId,
        conversationId: typeof requestBody.conversationId === 'string'
          ? requestBody.conversationId
          : null,
        registry: registryView,
        connectorProbe: buildConnectorProbe(connectorService),
        requireSnapshotProjectMatch: true,
      });
      if (resolved && !resolved.ok) {
        if (!explicitPlugin) {
          console.warn(
            `[plugins] default-scenario fallback skipped for run on project ${requestBody.projectId}: ${resolved.body?.error?.code ?? 'unknown'}`,
          );
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
      ...(preparedWorkspaceScope ? { workspaceScope: preparedWorkspaceScope } : {}),
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
        .prepare(`SELECT conversation_id AS conversationId FROM messages WHERE id = ?`)
        .get(clientUserMessageId) as { conversationId?: unknown } | undefined;
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
    meta.requestFingerprint = runRequestFingerprint(
      meta,
      resolvedSnapshot?.ok ? resolvedSnapshot.snapshot : null,
    );
    const creation = design.runs.createOrReuse(meta);
    if (creation.kind === 'conflict') {
      return sendApiError(
        res,
        409,
        'IDEMPOTENCY_CONFLICT',
        'clientRequestId is already associated with a different logical run request',
      );
    }
    const run = creation.run;
    const analyticsAttributionMismatch =
      creation.kind === 'reused'
      && externalPluginAttributionMismatch(
        run.externalPluginAnalytics,
        meta.analyticsHints,
      );
    let resumed = false;
    if (creation.kind === 'reused') {
      const resumeRequested = requestBody.resume === true;
      const rechargeFailure =
        run.status === 'failed'
        && run.agentId === 'amr'
        && (
          run.failureAction === 'recharge'
          || run.errorCode === 'AMR_INSUFFICIENT_BALANCE'
        );
      if (!resumeRequested) {
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
        });
      }
      if (!rechargeFailure || !design.runs.prepareRestart(run)) {
        return sendApiError(
          res,
          409,
          'RUN_NOT_RECHARGE_RESUMABLE',
          'Only a failed Open Design Cloud run waiting for recharge can be resumed with the same request',
        );
      }
      resumed = true;
    }
    if (creation.kind === 'created' && runUserSeed) {
      try {
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
      } catch (err) {
        console.warn('[runs] api client user message pin failed', err);
      }
    }
    try {
      pinAssistantMessageOnRunCreate(db, run);
    } catch (err) {
      console.warn('[runs] message create pin failed', err);
    }
    const declaredClient = String(req.get('x-od-client') ?? '').toLowerCase();
    if (requestAnalyticsContext?.clientType === 'external_mcp') {
      run.clientType = 'external_mcp';
    } else if (declaredClient === 'desktop' || declaredClient === 'web') {
      run.clientType = declaredClient;
    } else {
      const ua = String(req.get('user-agent') ?? '');
      run.clientType = ua.includes('Electron/') ? 'desktop' : 'web';
    }
    if (resolvedSnapshot?.ok) {
      try {
        const { linkSnapshotToRun } = await import('../plugins/snapshots.js');
        linkSnapshotToRun(db, resolvedSnapshot.snapshotId, run.id);
      } catch {
        // Linking is best-effort here; in-memory run still carries the id.
      }
    }
    const body = {
      runId: run.id,
      conversationId: run.conversationId ?? null,
      assistantMessageId: run.assistantMessageId ?? null,
      clientRequestId: run.clientRequestId ?? null,
      reused: creation.kind === 'reused',
      resumed,
      ...(analyticsAttributionMismatch
        ? { analyticsAttributionMismatch: true }
        : {}),
      ...(resolvedSnapshot?.ok
        ? {
            appliedPluginSnapshotId: resolvedSnapshot.snapshotId,
            pluginId: resolvedSnapshot.snapshot.pluginId,
          }
        : {}),
    };
    res.status(202).json(body);
    if (!resumed && resolvedSnapshot?.ok && resolvedSnapshot.snapshot.pipeline) {
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
    design.runs.start(run, () => startChatRun(executionMeta, run));

    const reqBody = requestBody;
    const analyticsHints =
      (reqBody as { analyticsHints?: Record<string, unknown> | null }).analyticsHints
        && typeof (reqBody as { analyticsHints?: unknown }).analyticsHints === 'object'
        ? ((reqBody as { analyticsHints?: Record<string, unknown> }).analyticsHints ?? {})
        : {};
    // Marks the AI-optimize (deep enrichment) run so completion can flag the DS
    // ai_refined even when analytics is unavailable or disabled.
    const hintDsEnrichment = analyticsHints.dsEnrichment === true;
    const requestProjectId = typeof reqBody.projectId === 'string' ? reqBody.projectId : null;
    if (hintDsEnrichment && requestProjectId) {
      design.runs.wait(run).then((status: TerminalRunStatus) => {
        if (runResultFromStatus(status.status) !== 'success') return;
        try {
          const enrichedProject = toProjectRecord(getProject(db, requestProjectId));
          if (enrichedProject && isProjectEnrichableDesignSystem(enrichedProject)) {
            updateProject(db, requestProjectId, {
              metadata: {
                ...(enrichedProject.metadata ?? {}),
                enrichmentStatus: 'ai_refined',
                enrichmentCompletedAt: Date.now(),
              },
            });
          }
        } catch {
          // Best-effort flag; do not fail run completion if metadata refresh fails.
        }
      }).catch(() => {});
    }

    const recoveredAnalyticsContext =
      run.analyticsRecovery
      && typeof run.analyticsRecovery === 'object'
      && (run.analyticsRecovery as { context?: unknown }).context
      && typeof (run.analyticsRecovery as { context?: unknown }).context === 'object'
        ? ((run.analyticsRecovery as { context: AnalyticsContext }).context)
        : null;
    // Source/identity is first-write immutable for a logical run. A retry or
    // recharge resume cannot relabel a prior ordinary request as Plugin (or
    // vice versa) by changing analytics-only headers.
    const analyticsContext =
      run.analyticsContext
      ?? recoveredAnalyticsContext
      ?? requestAnalyticsContext;
    if (!run.analyticsContext && analyticsContext) {
      run.analyticsContext = analyticsContext;
    }
    design.runs.wait(run).then((status: { status: string }) => {
      reportRunCompletionTelemetryFallback({
        analyticsContext: analyticsContext ?? null,
        run,
        status: status.status,
      });
    }).catch(() => {});
    if (analyticsContext) {
      const runInsertId = newInsertId();
      const appCfgForAnalytics = await readAppConfig(RUNTIME_DATA_DIR).catch(
        () => ({} as Record<string, unknown>),
      );
      const detectedAgentsForAnalytics = await detectAgents(
        toJsonRecord((appCfgForAnalytics as { agentCliEnv?: unknown }).agentCliEnv),
      ).catch((): Array<{ id: string; available: boolean }> => []);
      const velaStatusForAnalytics = (() => {
        try {
          const configuredAmrEnv = agentCliEnvForAgent(
            (appCfgForAnalytics as { agentCliEnv?: AgentCliEnv }).agentCliEnv,
            'amr',
          );
          return readVelaLoginStatus(process.env, configuredAmrEnv);
        } catch {
          return null;
        }
      })();
      const configureGlobals = deriveConfigureGlobals({
        mode: 'daemon',
        agentId: typeof reqBody.agentId === 'string' ? reqBody.agentId : null,
        agents: detectedAgentsForAnalytics,
        amrAuthorized: velaStatusForAnalytics?.loggedIn === true,
      });
      const promptText =
        typeof reqBody.currentPrompt === 'string'
          ? reqBody.currentPrompt
          : typeof reqBody.message === 'string'
            ? reqBody.message
            : '';
      const userQueryTokens = promptText.length > 0
        ? Math.ceil(promptText.length / 4)
        : 0;
      const hintEntryFrom = typeof analyticsHints.entryFrom === 'string'
        ? analyticsHints.entryFrom
        : undefined;
      const hintProjectKind = typeof analyticsHints.projectKind === 'string'
        ? analyticsHints.projectKind
        : null;
      const hintTurnIndex = typeof analyticsHints.turnIndex === 'number'
        ? analyticsHints.turnIndex
        : undefined;
      const hintIsFirstRun = typeof analyticsHints.isFirstRun === 'boolean'
        ? analyticsHints.isFirstRun
        : undefined;
      const hintHasExistingArtifact = typeof analyticsHints.hasExistingArtifact === 'boolean'
        ? analyticsHints.hasExistingArtifact
        : undefined;
      const hintProjectTurnIndex = typeof analyticsHints.projectTurnIndex === 'number'
        ? analyticsHints.projectTurnIndex
        : undefined;
      const taskExecutionId = typeof analyticsHints.taskExecutionId === 'string'
        && analyticsHints.taskExecutionId.length > 0
        ? analyticsHints.taskExecutionId
        : run.clientRequestId ?? run.id;
      const initialRunId = typeof analyticsHints.initialRunId === 'string'
        && analyticsHints.initialRunId.length > 0
        ? analyticsHints.initialRunId
        : run.id;
      const taskRunIndex = typeof analyticsHints.taskRunIndex === 'number'
        && Number.isInteger(analyticsHints.taskRunIndex)
        && analyticsHints.taskRunIndex >= 0
        ? analyticsHints.taskRunIndex
        : 0;
      const recoveryActionTypes: ReadonlySet<TrackingRunRecoveryActionType> = new Set([
        'manual_retry',
        'resume_run',
        'authorize_and_retry',
        'switch_model_retry',
        'switch_runtime_retry',
        'question_answer',
      ]);
      const recoveryActionType = typeof analyticsHints.recoveryActionType === 'string'
        && recoveryActionTypes.has(
          analyticsHints.recoveryActionType as TrackingRunRecoveryActionType,
        )
        ? analyticsHints.recoveryActionType as TrackingRunRecoveryActionType
        : undefined;
      const taskLineage: RunTaskLineageProps = {
        task_execution_id: taskExecutionId,
        initial_run_id: initialRunId,
        task_run_index: taskRunIndex,
        ...(typeof analyticsHints.sourceRunId === 'string' && analyticsHints.sourceRunId.length > 0
          ? { source_run_id: analyticsHints.sourceRunId }
          : {}),
        ...(recoveryActionType ? { recovery_action_type: recoveryActionType } : {}),
        ...(typeof analyticsHints.recoveryActionInstanceId === 'string'
          && analyticsHints.recoveryActionInstanceId.length > 0
          ? { recovery_action_instance_id: analyticsHints.recoveryActionInstanceId }
          : {}),
      };
      const conversationTurnIndex = run.conversationId
        ? conversationTurnIndexForRun(db, run.conversationId, run.id)
        : null;
      const sessionDimensionProps = {
        ...(hintTurnIndex !== undefined ? { turn_index: hintTurnIndex } : {}),
        ...(hintIsFirstRun !== undefined ? { is_first_run: hintIsFirstRun } : {}),
        ...(hintProjectTurnIndex !== undefined
          ? { project_turn_index: hintProjectTurnIndex }
          : {}),
        ...(conversationTurnIndex !== null
          ? { conversation_turn_index: conversationTurnIndex }
          : {}),
        ...(hintHasExistingArtifact !== undefined
          ? { has_existing_artifact: hintHasExistingArtifact }
          : {}),
      };
      const runProjectForAnalytics = requestProjectId
        ? toProjectRecord(getProject(db, requestProjectId))
        : null;
      const analyticsDesignSystemSelection = resolveEffectiveDesignSystemSelection({
        requestDesignSystemId: reqBody.designSystemId,
        pluginDesignSystemId: resolvedSnapshot?.ok
          ? designSystemIdFromPluginSnapshot(resolvedSnapshot.snapshot)
          : null,
        projectDesignSystemId: runProjectForAnalytics?.designSystemId,
        appDefaultDesignSystemId: (appCfgForAnalytics as { designSystemId?: unknown }).designSystemId,
        disabledDesignSystemIds: (appCfgForAnalytics as { disabledDesignSystems?: unknown }).disabledDesignSystems,
        allowAppDefault: runProjectForAnalytics === null,
      });
      const runProjectKind = resolveRunProjectKindForAnalytics({
        hintProjectKind,
        projectMetadata: runProjectForAnalytics?.metadata,
      });
      const dsRunContext =
        analyticsHints.designSystemRunContext
          && typeof analyticsHints.designSystemRunContext === 'object'
          ? (analyticsHints.designSystemRunContext as Record<string, unknown>)
          : {};
      const isDesignSystemRun =
        runProjectKind === 'design_system'
        || hintEntryFrom === 'design_system_create'
        || hintEntryFrom === 'onboarding_design_system'
        || hintEntryFrom === 'regenerate_from_review';
      const reqContext =
        reqBody.context && typeof reqBody.context === 'object'
          ? (reqBody.context as Record<string, unknown>)
          : {};
      const runMcpServerIds = Array.isArray(reqContext.mcpServerIds)
        ? (reqContext.mcpServerIds as unknown[]).filter(
            (id): id is string => typeof id === 'string',
          )
        : [];
      const runTurnSkillIds = Array.isArray(reqBody.skillIds)
        ? (reqBody.skillIds as unknown[]).filter(
            (id): id is string => typeof id === 'string',
          )
        : [];
      const runSkillIds = [
        ...new Set(
          [reqBody.skillId, ...runTurnSkillIds].filter(
            (id): id is string => typeof id === 'string' && id.length > 0,
          ),
        ),
      ];
      // Map the internal DS selection source -> the wire `design_system_source`
      // enum (previously hard-wired to unknown/not_applicable). And derive
      // official-vs-custom from the id shape (`user:<id>` => custom). See the
      // design-system tracking spec §3.5 (U3/U4).
      const dsSelectedId = analyticsDesignSystemSelection.id;
      const designSystemSourceForRun: TrackingDesignSystemSource = (() => {
        switch (analyticsDesignSystemSelection.source) {
          case 'request':
            return 'user_selected';
          case 'plugin':
            return 'template_inherited';
          case 'project':
            return 'project_saved';
          case 'app-default':
            return 'default';
          case 'none':
          default:
            return dsSelectedId ? 'unknown' : 'not_applicable';
        }
      })();
      const designSystemKindForRun: TrackingDesignSystemKind | undefined = dsSelectedId
        ? dsSelectedId.startsWith('user:')
          ? 'custom'
          : 'official'
        : undefined;
      const designSystemSlugForRun =
        dsSelectedId && !dsSelectedId.startsWith('user:') ? dsSelectedId : undefined;
      // E1 (tracking spec §3.4): a DS-project run that edits an EXISTING design
      // system carries which surface drove it. comment/mark ride their own
      // entry_from; everything else editing an existing DS is the chat surface.
      // First-generation runs (no existing artifact) get no edit_surface.
      const editSurfaceForRun: TrackingDesignSystemEditSurface | undefined =
        runProjectKind === 'design_system' && hintHasExistingArtifact === true
          ? hintEntryFrom === 'comment'
            ? 'comment'
            : hintEntryFrom === 'mark'
              ? 'mark'
              : 'chat'
          : undefined;
      const baseProps: Record<string, unknown> = {
        page_name: isDesignSystemRun ? 'design_system_project' : 'chat_panel',
        area: isDesignSystemRun ? 'design_system_generation' : 'chat_composer',
        ...configureGlobals,
        runtime_type: runtimeTypeForRunAnalytics({
          derived: configureGlobals.runtime_type,
          hint: analyticsHints.runtimeType,
        }),
        ...amrUserIdForRunAnalytics(velaStatusForAnalytics),
        project_id: requestProjectId,
        conversation_id:
          typeof reqBody.conversationId === 'string' ? reqBody.conversationId : null,
        run_id: run.id,
        project_kind: runProjectKind,
        ...(hintEntryFrom ? { entry_from: hintEntryFrom } : {}),
        ...sessionDimensionProps,
        design_system_id: dsSelectedId ?? undefined,
        design_system_selection_source: analyticsDesignSystemSelection.source,
        design_system_source: designSystemSourceForRun,
        ...(designSystemKindForRun ? { design_system_kind: designSystemKindForRun } : {}),
        ...(designSystemSlugForRun ? { design_system_slug: designSystemSlugForRun } : {}),
        ...(editSurfaceForRun ? { edit_surface: editSurfaceForRun } : {}),
        ...(isDesignSystemRun ? {
          ds_source_origin: typeof dsRunContext.origin === 'string'
            ? dsRunContext.origin
            : undefined,
          source_count: typeof dsRunContext.sourceCount === 'number'
            ? dsRunContext.sourceCount
            : undefined,
          has_brand_description: typeof dsRunContext.hasBrandDescription === 'boolean'
            ? dsRunContext.hasBrandDescription
            : undefined,
          brand_description_length_bucket:
            typeof dsRunContext.brandDescriptionLengthBucket === 'string'
              ? dsRunContext.brandDescriptionLengthBucket
              : undefined,
          github_repo_count: typeof dsRunContext.githubRepoCount === 'number'
            ? dsRunContext.githubRepoCount
            : undefined,
          local_folder_count: typeof dsRunContext.localFolderCount === 'number'
            ? dsRunContext.localFolderCount
            : undefined,
          fig_file_count: typeof dsRunContext.figFileCount === 'number'
            ? dsRunContext.figFileCount
            : undefined,
          asset_file_count: typeof dsRunContext.assetFileCount === 'number'
            ? dsRunContext.assetFileCount
            : undefined,
        } : {}),
        has_attachment: Array.isArray(reqBody.attachments)
          ? (reqBody.attachments as unknown[]).length > 0
          : false,
        user_query_tokens: userQueryTokens,
        model_id: modelIdForTracking(
          typeof reqBody.model === 'string' ? reqBody.model : null,
        ),
        agent_provider_id: agentProviderIdForRunAnalytics({
          agentId: reqBody.agentId,
          byokProvider: reqBody.byokProvider,
        }),
        skill_id: typeof reqBody.skillId === 'string' ? reqBody.skillId : null,
        ...(!isDesignSystemRun && typeof reqBody.sessionMode === 'string'
          ? { session_mode: sessionModeToTracking(reqBody.sessionMode) }
          : {}),
        plugin_id: resolvedSnapshot?.ok
          ? resolvedSnapshot.snapshot.pluginId
          : typeof reqBody.pluginId === 'string'
            ? reqBody.pluginId
            : null,
        mcp_ids: runMcpServerIds,
        mcp_id: runMcpServerIds[0] ?? null,
        skill_ids: runSkillIds,
        token_count_source: userQueryTokens > 0 ? 'estimated' : 'unknown',
        ...(run.externalPluginAnalytics
          ? {
              entry_surface:
                run.externalPluginAnalytics.entrySurface,
              host_product:
                run.externalPluginAnalytics.hostProduct,
              external_plugin_id:
                run.externalPluginAnalytics.externalPluginId,
              external_plugin_version:
                run.externalPluginAnalytics.externalPluginVersion,
              distribution_mechanism:
                run.externalPluginAnalytics.distributionMechanism,
              publisher_class:
                run.externalPluginAnalytics.publisherClass,
              attribution_quality:
                run.externalPluginAnalytics.attributionQuality,
              plugin_workflow_id:
                run.externalPluginAnalytics.pluginWorkflowId,
              logical_request_digest:
                run.externalPluginAnalytics.logicalRequestDigest,
              logical_request_digest_version:
                run.externalPluginAnalytics.logicalRequestDigestVersion,
              brief_state:
                run.externalPluginAnalytics.briefState,
              generation_slo_window_ms:
                run.externalPluginAnalytics.generationSloWindowMs,
              deduplicated: creation.kind === 'reused',
              resume: resumed,
              attempt_count: (run.manualResumeAttemptCount ?? 0) + 1,
              recharge_wait_duration_ms:
                run.rechargeWaitDurationMs ?? 0,
              ...(analyticsAttributionMismatch
                ? { source_metadata_mismatch: true }
                : {}),
            }
          : {}),
      };
      Object.assign(baseProps, buildRunCreatedV4Aliases(baseProps, taskLineage));
      design.runs.setAnalyticsRecovery?.(run, {
        context: analyticsContext,
        properties: baseProps,
        insertId: runInsertId,
      });
      design.analytics.capture({
        eventName: 'run_created',
        context: analyticsContext,
        appVersion: design.getAppVersion(),
        properties: baseProps,
        insertId: runInsertId,
      });
      design.runs.wait(run).then(async (status: TerminalRunStatus) => {
        const appCfgAtFinish = await readAppConfig(RUNTIME_DATA_DIR).catch(
          () => ({} as Record<string, unknown>),
        );
        const langfuseDeliveryForAnalytics = deriveLangfuseDeliveryState(
          (appCfgAtFinish as { telemetry?: Record<string, unknown> }).telemetry ?? {},
          readTelemetrySinkConfig(),
        );
        const result = runResultFromStatus(status.status);
        const errorCode = deriveRunErrorCode(status);
        // C14/C15: AI-optimize (enrichment) run settled. Emit the dedicated
        // result event; the success metadata flag runs outside this analytics gate.
        if (hintDsEnrichment && analyticsContext) {
          design.analytics.capture({
            eventName: 'design_system_enrich_result',
            context: analyticsContext,
            appVersion: design.getAppVersion(),
            properties: {
              page_name: 'design_system_project',
              area: 'design_system_enrich',
              result,
              design_system_id: dsSelectedId ?? undefined,
              project_id: requestProjectId,
              run_id: run.id,
              ...(errorCode ? { error_code: errorCode } : {}),
              duration_ms: Math.max(0, Date.now() - run.createdAt),
            },
            insertId: newInsertId(),
          });
        }
        const failure = classifyRunFailure({
          result,
          status,
          ...(errorCode ? { errorCode } : {}),
          agentId: run.agentId,
          events: run.events,
        });
        const usageAnalytics = scanRunEventsForUsageAnalytics(
          run.events,
          reqBody.model,
          userQueryTokens,
        );
        // Whether this run is a non-first turn in its conversation — i.e. a
        // prior completed assistant turn exists (excluding this run's own
        // placeholder). The session-reuse cache win only applies to follow-up
        // turns, so slicing `first_call_cache_hit_ratio` by this flag is the
        // baseline-vs-optimized comparison. Mirrors server.ts hasPriorAssistantTurn.
        const isFollowupTurn = run.conversationId
          ? Boolean(
              db
                .prepare(
                  `SELECT 1 FROM messages
                     WHERE conversation_id = ?
                       AND role = 'assistant'
                       AND COALESCE(content, '') <> ''
                       AND id <> COALESCE(?, '')
                     LIMIT 1`,
                )
                .get(run.conversationId, run.assistantMessageId ?? ''),
            )
          : false;
        // Resolve the turn's first-call usage (cache-hit of the OPENING model
        // call — the signal session reuse moves). Every coding agent except
        // codex reports per-call usage on the stream, so the forward-scanned
        // first usage event IS the opening call. codex reports only a single
        // cumulative `turn.completed` usage on the stream, so its first stream
        // event is the whole-session aggregate; its real per-call number lives
        // in the rollout `last_token_usage`, read here best-effort.
        const firstCallUsage = await (async (): Promise<{
          first_call_input_tokens?: number;
          first_call_input_tokens_effective?: number;
          first_call_cache_read_input_tokens?: number;
          first_call_cache_creation_input_tokens?: number;
          first_call_cache_hit_ratio?: number;
        } | null> => {
          if (run.agentId === 'codex') {
            // Best-effort: a throw anywhere here (env resolution, rollout read)
            // must degrade to "no codex first-call fields", never bubble to the
            // outer run_finished .catch and drop the whole completion event.
            try {
              const sessionId = codexSessionIdFromRunEvents(run.events);
              const codexHome = spawnEnvForAgent(
                'codex',
                { ...process.env, OD_DATA_DIR: RUNTIME_DATA_DIR },
                agentCliEnvForAgent(
                  (appCfgAtFinish as { agentCliEnv?: AgentCliEnv }).agentCliEnv,
                  'codex',
                ),
              ).CODEX_HOME;
              const codexUsage = await readCodexRolloutFirstCall({ codexHome, sessionId });
              return codexUsage
                ? {
                    ...codexUsage,
                    first_call_input_tokens_effective:
                      codexUsage.first_call_input_tokens,
                  }
                : null;
            } catch {
              return null;
            }
          }
          if (usageAnalytics.first_call_input_tokens === undefined) return null;
          return {
            first_call_input_tokens: usageAnalytics.first_call_input_tokens,
            ...(usageAnalytics.first_call_input_tokens_effective !== undefined
              ? {
                  first_call_input_tokens_effective:
                    usageAnalytics.first_call_input_tokens_effective,
                }
              : {}),
            ...(usageAnalytics.first_call_cache_read_input_tokens !== undefined
              ? {
                  first_call_cache_read_input_tokens:
                    usageAnalytics.first_call_cache_read_input_tokens,
                }
              : {}),
            ...(usageAnalytics.first_call_cache_creation_input_tokens !== undefined
              ? {
                  first_call_cache_creation_input_tokens:
                    usageAnalytics.first_call_cache_creation_input_tokens,
                }
              : {}),
            ...(usageAnalytics.first_call_cache_hit_ratio !== undefined
              ? { first_call_cache_hit_ratio: usageAnalytics.first_call_cache_hit_ratio }
              : {}),
          };
        })();
        const analyticsCapturedAt = Date.now();
        const timingAnalytics = summarizeRunTimingAnalytics({
          runCreatedAt: run.createdAt,
          runUpdatedAt: run.updatedAt,
          analyticsCapturedAt,
        ...(run.analyticsTelemetry ? { telemetry: run.analyticsTelemetry } : {}),
          events: run.events,
        });
        const toolAnalytics = summarizeToolAnalytics(run.events);
        const toolStreamArtifactCount = (): number => runArtifactCountForRun(run);
        const toolStreamDesignSystemCreated = (): boolean =>
          runDesignSystemCreatedForRun(run);
        const toolStreamPreviewModuleCount = (): number =>
          runPreviewModuleCountForRun(run);
        let artifactCount: number;
        let artifactsCreated: number | undefined;
        let artifactsModified: number | undefined;
        let designSystemCreated: boolean;
        let previewModuleCount: number;
        let artifactDiff: RunArtifactDiff | undefined;
        const artifactOutcome = run.artifactOutcome;
        if (artifactOutcome) {
          artifactCount = artifactOutcome.artifactCount;
          artifactsCreated = artifactOutcome.artifactsCreated;
          artifactsModified = artifactOutcome.artifactsModified;
          designSystemCreated = artifactOutcome.designSystemCreated;
          previewModuleCount = artifactOutcome.previewModuleCount;
          artifactDiff = artifactOutcome.diff;
        } else {
          const artifactBaseline = runArtifactBaselines.take(run.id);
          if (artifactBaseline && !artifactBaseline.contended) {
            let diff: ReturnType<typeof diffRunArtifacts> | null = null;
            try {
              diff = diffRunArtifacts(
                artifactBaseline.before,
                snapshotProjectArtifacts(artifactBaseline.cwd),
              );
            } catch {
              diff = null;
            }
            if (diff) {
              artifactDiff = diff;
              artifactCount = diff.touched;
              artifactsCreated = diff.created;
              artifactsModified = diff.modified;
              designSystemCreated = diff.designSystemCreated;
              previewModuleCount = diff.previewModuleCount;
            } else {
              artifactCount = toolStreamArtifactCount();
              designSystemCreated = toolStreamDesignSystemCreated();
              previewModuleCount = toolStreamPreviewModuleCount();
            }
          } else {
            artifactCount = toolStreamArtifactCount();
            designSystemCreated = toolStreamDesignSystemCreated();
            previewModuleCount = toolStreamPreviewModuleCount();
          }
        }
        const touchedArtifactPaths = runTouchedArtifactPaths(run);
        const deliverable = run.externalPluginAnalytics
          ? await validateChatRunDeliverable({
              db,
              projectsRoot: PROJECTS_DIR,
              run,
              runStatus: run.status,
              artifactCount,
              ...(touchedArtifactPaths
                ? { touchedPaths: touchedArtifactPaths }
                : {}),
            })
          : null;
        if (deliverable) {
          design.runs.setDeliverableValidation?.(run, deliverable);
        }
        const activationMilestones = deriveActivationMilestones({
          result,
          artifactCount,
          designSystemCreated,
          isDesignSystemRun,
          capturedAtIso: new Date(analyticsCapturedAt).toISOString(),
        });
        const diagnosticsAnalytics = summarizeRunDiagnosticsForAnalytics({
          events: run.events,
          exitCode: status.exitCode ?? null,
          signal: status.signal ?? null,
          cancelRequested: !!run.cancelRequested,
          firstTokenSeen: Boolean(run.analyticsTelemetry?.firstTokenAt),
          artifactWriteSeen: artifactCount > 0 || designSystemCreated || previewModuleCount > 0,
        });
        const finishedModelId = hasExplicitRequestedModelForAnalytics(reqBody.model)
          ? modelIdForTracking(reqBody.model)
          : modelIdForTracking(
              usageAnalytics.agent_reported_model ?? run.resolvedModelId,
            );
        const runtimeVersions = getDetectedRuntimeVersions(run.agentId);
        const agentCliVersion =
          run.preflightAgentCliVersion ?? runtimeVersions?.agentCliVersion;
        for (const [index, retryEvent] of runRetryEventsForAnalytics(run.events).entries()) {
          design.analytics.capture({
            eventName: retryEvent.event,
            context: analyticsContext,
            appVersion: design.getAppVersion(),
            properties: retryEvent.data,
            insertId: `${runInsertId}-${retryEvent.event}-${index}`,
          });
        }
        const clarificationRequested = runAskedUserQuestion(run.events);
        const interactionMode = typeof reqBody.sessionMode === 'string'
          ? sessionModeToTracking(reqBody.sessionMode)
          : undefined;
        const primaryArtifactChange = artifactDiff
          ? primaryArtifactChangeForRun({
              diff: artifactDiff,
              projectKind: runProjectKind,
              hadExistingArtifacts: hintHasExistingArtifact === true,
              ...(interactionMode ? { interactionMode } : {}),
              clarificationRequested,
            })
          : undefined;
        const supportingAssetFilesChanged = artifactDiff
          ? supportingAssetFilesChangedForRun(artifactDiff, runProjectKind)
          : undefined;
        const finishedProperties: Record<string, unknown> = {
            ...baseProps,
            design_system_id: run.designSystemId ?? undefined,
            design_system_digest: run.designSystemDigest ?? undefined,
            design_system_selection_source: run.designSystemSelectionSource ?? 'none',
            stable_prompt_hash: run.promptCache?.stablePromptHash,
            stable_prompt_cache_hit: run.promptCache?.hit,
            stable_prompt_cache_miss_reason: run.promptCache?.missReason,
            // Which stable-prefix input drifted, for miss_reason
            // 'stable-prompt-changed' only. `unattributed` means the prefix
            // moved but no tracked section did — a coverage gap in
            // prompts/stable-sections.ts, not a cause.
            stable_prompt_changed_sections: run.promptCache?.changedSections ?? undefined,
            area: isDesignSystemRun ? 'design_system_generation' : 'chat_panel',
            result,
            ...(activationMilestones ? { $set_once: activationMilestones } : {}),
            model_id: finishedModelId,
            artifact_count: artifactCount,
            ...(run.externalPluginAnalytics
              ? {
                  deliverable_valid: deliverable?.valid === true,
                  deliverable_validation:
                    deliverable?.valid === true ? 'valid' : 'invalid',
                  artifact_origin_status:
                    run.artifactOriginStatus ?? 'missing_version',
                  ...(run.artifactVersionId
                    ? { artifact_version_id: run.artifactVersionId }
                    : {}),
                  resume: (run.manualResumeAttemptCount ?? 0) > 0,
                  attempt_count: (run.manualResumeAttemptCount ?? 0) + 1,
                  recharge_wait_duration_ms:
                    run.rechargeWaitDurationMs ?? 0,
                }
              : {}),
            ...(artifactsCreated !== undefined ? { artifacts_created: artifactsCreated } : {}),
            ...(artifactsModified !== undefined ? { artifacts_modified: artifactsModified } : {}),
            asked_user_question: clarificationRequested,
            retry_attempt_count: run.retryAttemptCount ?? 0,
            retry_final_result: run.retryFinalResult ?? 'not_attempted',
            ...(agentCliVersion
              ? { agent_cli_version: agentCliVersion }
              : {}),
            ...(runtimeVersions?.runtimeCompanionName
              ? { runtime_companion_name: runtimeVersions.runtimeCompanionName }
              : {}),
            ...(runtimeVersions?.runtimeCompanionVersion
              ? { runtime_companion_version: runtimeVersions.runtimeCompanionVersion }
              : {}),
            ...(run.retryOriginalFailure?.failure_category
              ? {
                  retry_original_failure_category:
                    run.retryOriginalFailure.failure_category,
                }
              : {}),
            ...(run.retryOriginalFailure?.failure_detail
              ? {
                  retry_original_failure_detail:
                    run.retryOriginalFailure.failure_detail,
                }
              : {}),
            ...(run.retryOriginalFailure?.failure_stage
              ? {
                  retry_original_failure_stage:
                    run.retryOriginalFailure.failure_stage,
                }
              : {}),
            ...(run.retrySuppressedReason
              ? { retry_suppressed_reason: run.retrySuppressedReason }
              : {}),
            ...(isDesignSystemRun ? {
              design_system_created: designSystemCreated,
              preview_module_count: previewModuleCount,
              missing_font_count: 0,
            } : {}),
            ...timingAnalytics,
            ...diagnosticsAnalytics,
            // E-lite: `approval_requested`/`tool_result_sent` ride in via
            // `...diagnosticsAnalytics`; these two come off the run object.
            stdin_backpressure: run.stdinBackpressure === true,
            ...(typeof run.lastAgentActivityAt === 'number'
              ? { last_progress_age_ms: Math.max(0, analyticsCapturedAt - run.lastAgentActivityAt) }
              : {}),
            langfuse_trace_id: run.id,
            ...langfuseDeliveryForAnalytics,
            ...(errorCode ? { error_code: errorCode } : {}),
            ...(failure ?? {}),
            ...(usageAnalytics.input_tokens !== undefined
              ? { input_tokens: usageAnalytics.input_tokens }
              : {}),
            ...(usageAnalytics.input_tokens_provider !== undefined
              ? { input_tokens_provider: usageAnalytics.input_tokens_provider }
              : {}),
            ...(usageAnalytics.input_tokens_effective !== undefined
              ? { input_tokens_effective: usageAnalytics.input_tokens_effective }
              : {}),
            ...(usageAnalytics.output_tokens !== undefined
              ? { output_tokens: usageAnalytics.output_tokens }
              : {}),
            ...(usageAnalytics.total_tokens !== undefined
              ? { total_tokens: usageAnalytics.total_tokens }
              : {}),
            ...(usageAnalytics.thought_tokens !== undefined
              ? { thought_tokens: usageAnalytics.thought_tokens }
              : {}),
            ...(usageAnalytics.cache_read_input_tokens !== undefined
              ? { cache_read_input_tokens: usageAnalytics.cache_read_input_tokens }
              : {}),
            ...(usageAnalytics.cache_creation_input_tokens !== undefined
              ? {
                  cache_creation_input_tokens:
                    usageAnalytics.cache_creation_input_tokens,
                }
              : {}),
            ...(usageAnalytics.uncached_input_tokens !== undefined
              ? { uncached_input_tokens: usageAnalytics.uncached_input_tokens }
              : {}),
            ...(usageAnalytics.estimated_context_tokens !== undefined
              ? { estimated_context_tokens: usageAnalytics.estimated_context_tokens }
              : {}),
            ...(usageAnalytics.cache_hit_ratio !== undefined
              ? { cache_hit_ratio: usageAnalytics.cache_hit_ratio }
              : {}),
            // First-call cache-hit of the turn's opening model call (per-call
            // usage for claude/opencode/codebuddy/pi from the stream; codex from
            // its rollout). Sliced by is_followup_turn, this isolates the
            // session-reuse cache win on non-first turns.
            ...(firstCallUsage ?? {}),
            is_followup_turn: isFollowupTurn,
            cache_token_source: usageAnalytics.cache_token_source,
            // Prefer provider scan over run_created baseProps (`estimated`).
            token_count_source: usageAnalytics.token_count_source,
            tool_error_count: toolAnalytics.tool_error_count,
            tool_name_count: toolAnalytics.tool_name_count,
            tool_names: toolAnalytics.tool_names_csv,
          };
        Object.assign(
          finishedProperties,
          buildRunFinishedV4Aliases(finishedProperties, taskLineage, {
            inputAccountingMode: usageAnalytics.input_accounting_mode,
            ...(firstCallUsage
              ? {
                  firstModelCall: {
                    ...(firstCallUsage.first_call_input_tokens !== undefined
                      ? { provider_input_tokens: firstCallUsage.first_call_input_tokens }
                      : {}),
                    ...(firstCallUsage.first_call_input_tokens_effective !== undefined
                      ? { effective_input_tokens: firstCallUsage.first_call_input_tokens_effective }
                      : {}),
                    ...(firstCallUsage.first_call_cache_read_input_tokens !== undefined
                      ? { cache_read_tokens: firstCallUsage.first_call_cache_read_input_tokens }
                      : {}),
                    ...(firstCallUsage.first_call_cache_creation_input_tokens !== undefined
                      ? { cache_write_tokens: firstCallUsage.first_call_cache_creation_input_tokens }
                      : {}),
                  },
                }
              : {}),
            ...(primaryArtifactChange
              ? { primaryArtifactChange }
              : {}),
            ...(artifactDiff
              ? {
                  artifactFiles: {
                    changed_file_count: artifactDiff.contentTouched,
                    created_file_count: artifactDiff.contentCreated,
                    modified_file_count: artifactDiff.contentModified,
                    ...(supportingAssetFilesChanged !== undefined
                      ? {
                          supporting_asset_files_changed_count:
                            supportingAssetFilesChanged,
                        }
                      : {}),
                  },
                }
              : {}),
            ...(isDesignSystemRun
              ? {
                  designSystemChangeType: designSystemCreated
                    ? hintHasExistingArtifact === true ? 'modified' : 'created'
                    : 'none',
                }
              : {}),
          }),
        );
        // Refresh local recovery snapshot so crash recovery matches PostHog
        // `run_finished` (usage/timing/tools), not only run_created baseProps.
        // Keep the base insertId here: reconcileDurableRunTerminals appends
        // `-finish` when replaying. Storing `${runInsertId}-finish` would
        // produce `…-finish-finish` and can duplicate PostHog events.
        design.runs.setAnalyticsRecovery?.(run, {
          context: analyticsContext,
          properties: finishedProperties,
          insertId: runInsertId,
        });
        await Promise.resolve(design.analytics.capture({
          eventName: 'run_finished',
          context: analyticsContext,
          appVersion: design.getAppVersion(),
          properties: finishedProperties,
          insertId: `${runInsertId}-finish`,
        }));
        design.runs.markAnalyticsCompleted?.(run);
      }).catch(() => {});
    }
  });

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
    const body = { runs: visibleRuns.map(design.runs.statusBody) };
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
    const run = design.runs.get(runId);
    if (!run) return sendApiError(res, 404, 'NOT_FOUND', 'run not found');
    if (!await authorizeRunProject(req, res, run, { mode: 'read' })) return;
    const status = design.runs.statusBody(run);
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
    const status = design.runs.statusBody(run);
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
    const status = await design.runs.cancel(run);
    const body = { ok: true, run: status };
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
    const toolBundleSupport = validateRunToolBundleForAgent(
      toolBundle.bundle,
      typeof requestBody.agentId === 'string' ? getAgentDef(requestBody.agentId) : null,
      {
        deliveryTarget: runToolBundleDeliveryTargetForProject(
          requestBody.projectId,
          chatProject?.metadata,
        ),
      },
    );
    if (!toolBundleSupport.ok) {
      return sendApiError(res, 400, 'BAD_REQUEST', toolBundleSupport.message);
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
    if (!hasCompleteByokOpenCodeConfig(requestBody)) {
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
    };
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
    if (
      typeof requestBody.pluginId === 'string'
      && requestBody.pluginId.length > 0
      && ctx.plugins.authorizePluginRequest
      && !await ctx.plugins.authorizePluginRequest(
        req,
        res,
        requestBody.pluginId,
      )
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
    meta.requestFingerprint = runRequestFingerprint(meta);
    const creation = design.runs.createOrReuse(meta);
    if (creation.kind === 'conflict') {
      return sendApiError(
        res,
        409,
        'IDEMPOTENCY_CONFLICT',
        'clientRequestId is already associated with a different logical run request',
      );
    }
    const run = creation.run;
    if (creation.kind === 'reused') {
      design.runs.stream(run, req, res);
      return;
    }
    try {
      pinAssistantMessageOnRunCreate(db, run);
    } catch (err) {
      console.warn('[chat] message create pin failed', err);
    }
    design.runs.stream(run, req, res);
    reconcileAssistantMessageOnRunEnd(db, design.runs, run);
    const executionMeta: RunCreateMeta = {
      ...meta,
      ...(requestBody.byokProvider !== undefined
        ? { byokProvider: requestBody.byokProvider }
        : {}),
    };
    design.runs.start(run, () => startChatRun(executionMeta, run));
  });
}

export const __forTestHasCompleteByokOpenCodeConfig = hasCompleteByokOpenCodeConfig;
export const __forTestWithoutSensitiveRunInput = withoutSensitiveRunInput;
