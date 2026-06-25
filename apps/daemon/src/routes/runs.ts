import type { Express, Request, Response } from 'express';
import type Database from 'better-sqlite3';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import {
  defaultScenarioPluginIdForProjectMetadata,
  RUN_RESULT_PACKAGE_SCHEMA,
  type AppliedPluginSnapshot,
  type ArtifactManifest,
  type ChatRunStatus,
  type ChatRunStatusResponse,
  type ProjectMetadata as ContractProjectMetadata,
  type RunResultPackageResponse,
} from '@open-design/contracts';
import {
  agentIdToTracking,
  deriveConfigureGlobals,
  modelIdForTracking,
  sessionModeToTracking,
  type TrackingDesignSystemSource,
  type TrackingDesignSystemKind,
  type TrackingDesignSystemEditSurface,
} from '@open-design/contracts/analytics';
import type { OdNativeEvent } from '@open-design/agui-adapter';
import { newInsertId, readAnalyticsContext } from '../analytics.js';
import type { AnalyticsContext } from '../analytics.js';
import { spawnEnvForAgent } from '../agents.js';
import { agentCliEnvForAgent, readAppConfig } from '../app-config.js';
import {
  codexSessionIdFromRunEvents,
  readCodexRolloutFirstCall,
} from '../codex-rollout-usage.js';
import type { ConnectorService } from '../connectors/service.js';
import { getProject, listConversations, updateProject, upsertMessage } from '../db.js';
import { readVelaLoginStatus } from '../integrations/vela.js';
import {
  deriveLangfuseDeliveryState,
  readTelemetrySinkConfig,
} from '../langfuse-trace.js';
import { parseMediaExecutionPolicyInput } from '../media/policy.js';
import { isManagedProjectCwd } from '../mcp-config.js';
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
  hasExplicitRequestedModelForAnalytics,
  runtimeTypeForRunAnalytics,
  scanRunEventsForUsageAnalytics,
  summarizeRunTimingAnalytics,
  type RunEventForAnalyticsObservability,
  type RunTelemetryTimestamps,
} from '../run-analytics-observability.js';
import {
  diffRunArtifacts,
  snapshotProjectArtifacts,
  type RunArtifactBaseline,
} from '../run-artifact-fs.js';
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
  countDesignSystemPreviewModules,
  countNewArtifacts,
  deriveActivationMilestones,
  didRunCreateDesignSystemFile,
  runAskedUserQuestion,
} from '../runtimes/run-artifacts.js';

type SqliteDb = Database.Database;
type JsonRecord = Record<string, unknown>;
type ApiRequest = Request<Record<string, string>, unknown, JsonRecord>;
type ApiResponse = Response<unknown>;
type ProjectMetadata = (Partial<ContractProjectMetadata> & JsonRecord) | null | undefined;
type AgentCliEnv = Parameters<typeof agentCliEnvForAgent>[0];
type RunDeliveryTarget = 'managed-project' | 'external-project' | 'none';

interface ProjectRecord {
  id: string;
  name: string;
  designSystemId?: string | null;
  metadata?: ProjectMetadata;
  appliedPluginSnapshotId?: string | null;
}

interface ConversationRecord {
  id: string;
  createdAt?: number;
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
  agentId: string | null;
  model?: string | null;
  status: ChatRunStatus;
  createdAt: number;
  updatedAt: number;
  cancelRequested?: boolean;
  exitCode?: number | null;
  signal?: string | null;
  error?: string | null;
  errorCode?: string | null;
  projectMetadata?: ProjectMetadata;
  appliedPluginSnapshotId?: string | null;
  pluginId?: string | null;
  clientType?: 'desktop' | 'web';
  events: RunEventRecord[];
  clients: Set<SseClient>;
  analyticsContext?: AnalyticsContext;
  analyticsTelemetry?: RunTelemetryTimestamps;
  retryAttemptCount?: number;
  retryFinalResult?: string;
  retrySuppressedReason?: string;
  designSystemId?: string | null;
  designSystemRequestedId?: string | null;
  designSystemSelectionSource?: string | null;
  designSystemDigest?: string | null;
  promptCache?: {
    stablePromptHash?: string;
    hit?: boolean;
    missReason?: string | null;
  };
}

interface RunCreateMeta extends JsonRecord {
  projectId?: string;
  conversationId?: string;
  assistantMessageId?: string;
  agentId?: string;
  pluginId?: string;
  appliedPluginSnapshotId?: string;
  message?: string;
  currentPrompt?: string;
  projectMetadata?: ProjectMetadata;
}

interface RunListFilters {
  projectId?: unknown;
  conversationId?: unknown;
  status?: unknown;
}

interface ChatRunService {
  create(meta: RunCreateMeta): ChatRun;
  get(id: string): ChatRun | null;
  list(filters: RunListFilters): ChatRun[];
  statusBody(run: ChatRun): ChatRunStatusResponse;
  stream(run: ChatRun, req: Request, res: Response): void;
  start(run: ChatRun, starter: () => Promise<unknown>): ChatRun;
  wait(run: ChatRun): Promise<ChatRunStatusResponse>;
  cancel(run: ChatRun): Promise<ChatRunStatusResponse>;
  isTerminal(status: ChatRunStatus): boolean;
  emit?(run: ChatRun, event: string, data: unknown): RunEventRecord;
}

interface AnalyticsService {
  capture(input: {
    eventName: string;
    context: AnalyticsContext;
    appVersion: string;
    properties: Record<string, unknown>;
    insertId: string;
  }): void;
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
    loadPluginRegistryView: () => Promise<Parameters<typeof resolvePluginSnapshot>[0]['registry']>;
    renderPluginBriefTemplate: (template: string, inputs?: Record<string, unknown>) => string;
  };
  telemetry: {
    reportRunCompletionTelemetryFallback: (input: RunCreatedFallbackInput) => void;
    resolveRunProjectKindForAnalytics: (input: RunProjectKindInput) => string;
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

function toConversationRecords(value: unknown): ConversationRecord[] {
  return Array.isArray(value)
    ? value.filter((item): item is ConversationRecord =>
        Boolean(item && typeof item === 'object' && typeof (item as JsonRecord).id === 'string'),
      )
    : [];
}

function toProjectFiles(value: unknown): ProjectFileEntry[] {
  return Array.isArray(value)
    ? value.filter((item): item is ProjectFileEntry =>
        Boolean(item && typeof item === 'object' && typeof (item as JsonRecord).name === 'string'),
      )
    : [];
}

function toScenarioProjectMetadata(
  metadata: ProjectMetadata,
): Pick<ContractProjectMetadata, 'kind' | 'intent'> | null {
  if (!metadata || typeof metadata.kind !== 'string') return null;
  return {
    kind: metadata.kind as ContractProjectMetadata['kind'],
    ...(metadata.intent === 'live-artifact' ? { intent: metadata.intent } : {}),
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
  allowAppDefault = true,
}: {
  requestDesignSystemId?: unknown;
  pluginDesignSystemId?: unknown;
  projectDesignSystemId?: unknown;
  appDefaultDesignSystemId?: unknown;
  allowAppDefault?: boolean;
}): { id: string | null; source: DesignSystemSelectionSource } {
  const requestId = normalizedDesignSystemId(requestDesignSystemId);
  if (requestId) return { id: requestId, source: 'request' };

  const pluginId = normalizedDesignSystemId(pluginDesignSystemId);
  if (pluginId) return { id: pluginId, source: 'plugin' };

  const projectId = normalizedDesignSystemId(projectDesignSystemId);
  if (projectId) return { id: projectId, source: 'project' };

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
    const mediaExecution = parseMediaExecutionPolicyInput(requestBody.mediaExecution);
    if (!mediaExecution.ok) {
      return sendApiError(res, 400, 'BAD_REQUEST', mediaExecution.message);
    }
    const toolBundle = parseRunToolBundleForRequest(requestBody.toolBundle);
    if (!toolBundle.ok) {
      return sendApiError(res, 400, 'BAD_REQUEST', toolBundle.message);
    }
    let resolvedSnapshot = null;
    if (typeof requestBody.projectId === 'string' && requestBody.projectId) {
      let registryView: Parameters<typeof resolvePluginSnapshot>[0]['registry'];
      try {
        registryView = await loadPluginRegistryView();
      } catch (err) {
        return res.status(500).json({ error: String(err) });
      }
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
      const resolved = resolvePluginSnapshot({
        db,
        body: runResolveBody,
        projectId: requestBody.projectId,
        conversationId: typeof requestBody.conversationId === 'string'
          ? requestBody.conversationId
          : null,
        registry: registryView,
        connectorProbe: buildConnectorProbe(connectorService),
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
      ...requestBody,
      mediaExecution: mediaExecution.policy,
      toolBundle: toolBundle.bundle,
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
    if (
      typeof meta.projectId === 'string' &&
      meta.projectId &&
      (typeof meta.conversationId !== 'string' || !meta.conversationId)
    ) {
      try {
        const convs = toConversationRecords(listConversations(db, meta.projectId));
        const defaultConv = convs.length > 0
          ? [...convs].sort((a, b) => {
              const aCreated = Number(a?.createdAt);
              const bCreated = Number(b?.createdAt);
              if (Number.isFinite(aCreated) && Number.isFinite(bCreated) && aCreated !== bCreated) {
                return aCreated - bCreated;
              }
              return String(a?.id ?? '').localeCompare(String(b?.id ?? ''));
            })[0]
          : null;
        if (defaultConv && typeof defaultConv.id === 'string' && defaultConv.id) {
          meta.conversationId = defaultConv.id;
          if (typeof meta.assistantMessageId !== 'string' || !meta.assistantMessageId) {
            meta.assistantMessageId = randomUUID();
          }
          const promptForUserMessage =
            typeof meta.message === 'string' && meta.message.trim().length > 0
              ? meta.message
              : null;
          if (promptForUserMessage) {
            upsertMessage(db, defaultConv.id, {
              id: randomUUID(),
              role: 'user',
              content: promptForUserMessage,
              startedAt: Date.now(),
              endedAt: Date.now(),
            });
          }
        }
      } catch (err) {
        console.warn('[runs] mcp conversation fallback failed', err);
      }
    }
    const run = design.runs.create(meta);
    try {
      pinAssistantMessageOnRunCreate(db, run);
    } catch (err) {
      console.warn('[runs] message create pin failed', err);
    }
    const declaredClient = String(req.get('x-od-client') ?? '').toLowerCase();
    if (declaredClient === 'desktop' || declaredClient === 'web') {
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
      ...(resolvedSnapshot?.ok
        ? {
            appliedPluginSnapshotId: resolvedSnapshot.snapshotId,
            pluginId: resolvedSnapshot.snapshot.pluginId,
          }
        : {}),
    };
    res.status(202).json(body);
    if (resolvedSnapshot?.ok && resolvedSnapshot.snapshot.pipeline) {
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
    design.runs.start(run, () => startChatRun(meta, run));

    const analyticsContext = readAnalyticsContext(req);
    if (analyticsContext) {
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
      const reqBody = requestBody;
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
      const analyticsHints =
        (reqBody as { analyticsHints?: Record<string, unknown> | null }).analyticsHints
          && typeof (reqBody as { analyticsHints?: unknown }).analyticsHints === 'object'
          ? ((reqBody as { analyticsHints?: Record<string, unknown> }).analyticsHints ?? {})
          : {};
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
      // Marks the AI-optimize (deep enrichment) run so completion can emit
      // design_system_enrich_result + flag the DS ai_refined (C14/C15).
      const hintDsEnrichment = analyticsHints.dsEnrichment === true;
      const hintHasExistingArtifact = typeof analyticsHints.hasExistingArtifact === 'boolean'
        ? analyticsHints.hasExistingArtifact
        : undefined;
      const sessionDimensionProps = {
        ...(hintTurnIndex !== undefined ? { turn_index: hintTurnIndex } : {}),
        ...(hintIsFirstRun !== undefined ? { is_first_run: hintIsFirstRun } : {}),
        ...(hintHasExistingArtifact !== undefined
          ? { has_existing_artifact: hintHasExistingArtifact }
          : {}),
      };
      const requestProjectId = typeof reqBody.projectId === 'string' ? reqBody.projectId : null;
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
        agent_provider_id: agentIdToTracking(
          typeof reqBody.agentId === 'string' ? reqBody.agentId : null,
        ),
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
      };
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
        // result event and, on success, flag the DS ai_refined so the
        // programmatic-vs-refined cohorts are comparable (tracking spec §6).
        if (hintDsEnrichment) {
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
          if (result === 'success' && requestProjectId) {
            try {
              const enrichedProject = getProject(db, requestProjectId);
              if (enrichedProject) {
                updateProject(db, requestProjectId, {
                  metadata: {
                    ...(enrichedProject.metadata ?? {}),
                    enrichmentStatus: 'ai_refined',
                    enrichmentCompletedAt: Date.now(),
                  },
                });
              }
            } catch {
              // Best-effort flag; the enrich_result event already recorded the outcome.
            }
          }
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
          first_call_cache_read_input_tokens?: number;
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
              return await readCodexRolloutFirstCall({ codexHome, sessionId });
            } catch {
              return null;
            }
          }
          if (usageAnalytics.first_call_input_tokens === undefined) return null;
          return {
            first_call_input_tokens: usageAnalytics.first_call_input_tokens,
            ...(usageAnalytics.first_call_cache_read_input_tokens !== undefined
              ? {
                  first_call_cache_read_input_tokens:
                    usageAnalytics.first_call_cache_read_input_tokens,
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
        const toolStreamArtifactCount = (): number => countNewArtifacts(run.events);
        const toolStreamDesignSystemCreated = (): boolean =>
          didRunCreateDesignSystemFile(run.events);
        const toolStreamPreviewModuleCount = (): number =>
          countDesignSystemPreviewModules(run.events);
        const artifactBaseline = runArtifactBaselines.take(run.id);
        let artifactCount: number;
        let artifactsCreated: number | undefined;
        let artifactsModified: number | undefined;
        let designSystemCreated: boolean;
        let previewModuleCount: number;
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
          : modelIdForTracking(usageAnalytics.agent_reported_model);
        for (const [index, retryEvent] of runRetryEventsForAnalytics(run.events).entries()) {
          design.analytics.capture({
            eventName: retryEvent.event,
            context: analyticsContext,
            appVersion: design.getAppVersion(),
            properties: retryEvent.data,
            insertId: `${runInsertId}-${retryEvent.event}-${index}`,
          });
        }
        design.analytics.capture({
          eventName: 'run_finished',
          context: analyticsContext,
          appVersion: design.getAppVersion(),
          properties: {
            ...baseProps,
            design_system_id: run.designSystemId ?? undefined,
            design_system_digest: run.designSystemDigest ?? undefined,
            design_system_selection_source: run.designSystemSelectionSource ?? 'none',
            stable_prompt_hash: run.promptCache?.stablePromptHash,
            stable_prompt_cache_hit: run.promptCache?.hit,
            stable_prompt_cache_miss_reason: run.promptCache?.missReason,
            area: isDesignSystemRun ? 'design_system_generation' : 'chat_panel',
            result,
            ...(activationMilestones ? { $set_once: activationMilestones } : {}),
            model_id: finishedModelId,
            artifact_count: artifactCount,
            ...(artifactsCreated !== undefined ? { artifacts_created: artifactsCreated } : {}),
            ...(artifactsModified !== undefined ? { artifacts_modified: artifactsModified } : {}),
            asked_user_question: runAskedUserQuestion(run.events),
            retry_attempt_count: run.retryAttemptCount ?? 0,
            retry_final_result: run.retryFinalResult ?? 'not_attempted',
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
            token_count_source: usageAnalytics.token_count_source,
          },
          insertId: `${runInsertId}-finish`,
        });
      }).catch(() => {});
    }
  });

  app.get('/api/runs', (req: ApiRequest, res: ApiResponse) => {
    const { projectId, conversationId, status } = req.query;
    const runs = design.runs.list({ projectId, conversationId, status });
    const body = { runs: runs.map(design.runs.statusBody) };
    res.json(body);
  });

  app.get('/api/runs/:id/result-package', async (req: ApiRequest, res: ApiResponse) => {
    const runId = routeParamId(req);
    if (!runId) return sendApiError(res, 400, 'BAD_REQUEST', 'run id missing');
    const run = design.runs.get(runId);
    if (!run) return sendApiError(res, 404, 'NOT_FOUND', 'run not found');
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

  app.get('/api/runs/:id', (req: ApiRequest, res: ApiResponse) => {
    const runId = routeParamId(req);
    if (!runId) return sendApiError(res, 400, 'BAD_REQUEST', 'run id missing');
    const run = design.runs.get(runId);
    if (!run) return sendApiError(res, 404, 'NOT_FOUND', 'run not found');
    res.json(design.runs.statusBody(run));
  });

  app.get('/api/runs/:id/events', (req: ApiRequest, res: ApiResponse) => {
    const runId = routeParamId(req);
    if (!runId) return sendApiError(res, 400, 'BAD_REQUEST', 'run id missing');
    const run = design.runs.get(runId);
    if (!run) return sendApiError(res, 404, 'NOT_FOUND', 'run not found');
    design.runs.stream(run, req, res);
  });

  app.get('/api/runs/:id/agui', async (req: ApiRequest, res: ApiResponse) => {
    const runId = routeParamId(req);
    if (!runId) return sendApiError(res, 400, 'BAD_REQUEST', 'run id missing');
    const run = design.runs.get(runId);
    if (!run) return sendApiError(res, 404, 'NOT_FOUND', 'run not found');
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
    const status = await design.runs.cancel(run);
    const body = { ok: true, run: status };
    res.json(body);
  });

  app.post('/api/chat', (req: ApiRequest, res: ApiResponse) => {
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
    const meta = {
      ...requestBody,
      mediaExecution: mediaExecution.policy,
      toolBundle: toolBundle.bundle,
      ...(chatProject?.metadata ? { projectMetadata: chatProject.metadata } : {}),
    };
    const run = design.runs.create(meta);
    design.runs.stream(run, req, res);
    design.runs.start(run, () => startChatRun(meta, run));
  });
}
