// @ts-nocheck
import type { DesktopExportPdfInput, DesktopExportPdfResult } from '@open-design/sidecar-proto';
import express from 'express';
import multer from 'multer';
import JSZip from 'jszip';
import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import {
  defaultScenarioPluginIdForProjectMetadata,
  type OpenDesignDiscordPresenceResponse,
  type OpenDesignGithubLatestReleaseResponse,
  type OpenDesignGithubRepoResponse,
  PLUGIN_SHARE_ACTION_PLUGIN_IDS,
  RUN_RESULT_PACKAGE_SCHEMA,
} from '@open-design/contracts';
import {
  composeSystemPrompt,
  renderCodexImagegenOverride,
  resolveCodexImagegenModelId,
  resolveExclusiveSurface,
  shouldRenderCodexImagegenOverride,
} from './prompts/system.js';
import { emittedRenderableQuestionForm } from './question-form-detect.js';
import { resolveProjectRoot } from './project-root.js';
import {
  resolveDaemonCliPath,
  resolveDaemonPluginPreviewsDir,
  resolveDaemonResourceDir,
  resolveDaemonResourceRoot,
  resolveDataDir,
  resolveProcessResourcesPath,
} from './daemon-paths.js';
export {
  resolveDaemonCliPath,
  resolveDaemonPluginPreviewsDir,
  resolveDaemonResourceRoot,
  resolveDataDir,
} from './daemon-paths.js';
import {
  isStaticSpaFallbackRequest,
  registerStaticSpaFallback,
  resolveStaticSpaFallbackPath,
} from './static-spa.js';
export {
  isStaticSpaFallbackRequest,
  resolveStaticSpaFallbackPath,
} from './static-spa.js';
import {
  createCompatApiError,
  createCompatApiErrorResponse,
  sendApiError,
} from './http/api-errors.js';
export {
  createCompatApiError,
  createCompatApiErrorResponse,
} from './http/api-errors.js';
import {
  applyBakedPreviews,
  resolvePluginPreviewsDir,
  PLUGIN_PREVIEWS_ROUTE,
} from './plugin-preview-bakes.js';
import { userFacingAgentLabel } from './user-facing-agent-label.js';
import {
  buildBrowserUseRunState,
  collectBrowserUseDiscoveryFacts,
  isBrowserUseRequested,
  renderBrowserUseUnavailablePrompt,
} from './browser-use-diagnostics.js';

export { resolveProjectRoot };
import { createCommandInvocation } from '@open-design/platform';
import { SIDECAR_DEFAULTS, SIDECAR_ENV } from '@open-design/sidecar-proto';
import {
  buildLiveArtifactsMcpServersForAgent,
  checkPromptArgvBudget,
  checkWindowsCmdShimCommandLineBudget,
  checkWindowsDirectExeCommandLineBudget,
  detectAgents,
  getAgentDef,
  isKnownModel,
  openDesignAmrTraceEnv,
  applyAgentLaunchEnv,
  resolveAgentLaunch,
  sanitizeCustomModel,
  spawnEnvForAgent,
} from './agents.js';
import {
  getRememberedLiveModels,
  preferFreshLiveModels,
  rememberLiveModels,
  resolveModelForAgent,
} from './runtimes/models.js';
import { loadMmdRouteLaunchEnv } from './runtimes/mmd-routes.js';
import { preparePromptFileForAgent } from './runtimes/prompt-file.js';
import {
  readVelaCredentialRevision,
  readVelaLoginStatus,
  resolveAmrProfile,
} from './integrations/vela.js';
import {
  amrAccountFailureDetails,
  classifyAmrAccountFailure,
} from './integrations/vela-errors.js';
import { amrModelLoadingCache } from './runtimes/amr-model-cache.js';
import {
  fetchVelaPresetModels,
  fetchVelaRemoteModelsWithRetry,
} from './runtimes/defs/amr.js';
import { migrateLegacyDataDirSync } from './legacy-data-migrator.js';
import {
  consumedImportNonces,
  getDesktopAuthSecret,
  isDesktopAuthGateActive,
  isDesktopAuthRegistered,
  pruneExpiredImportNonces,
  resetDesktopAuthForTests,
  setDesktopAuthSecret,
  signDesktopImportToken,
  verifyDesktopImportToken,
} from './desktop-auth.js';
import { normalizeDaemonBindHost } from './daemon-startup.js';
export {
  isDesktopAuthGateActive,
  isDesktopAuthRegistered,
  resetDesktopAuthForTests,
  setDesktopAuthSecret,
  signDesktopImportToken,
  verifyDesktopImportToken,
} from './desktop-auth.js';
import {
  findSkillById,
  listSkills,
  resolveSkillId,
  splitDerivedSkillId,
} from './skills.js';
import { validateLinkedDirs } from './linked-dirs.js';
import { installFromTarget, uninstallById, sanitizeRepoName } from './library-install.js';
import { buildWindowsFolderDialogCommand, parseFolderDialogStdout } from './native-folder-dialog.js';
import {
  AssetCacheError,
  assetCacheRewriteUrl,
  createPluginAssetCache,
  isCacheableExternalUrl,
} from './plugin-asset-cache.js';
import { defaultMediaExecutionPolicy, parseMediaExecutionPolicyInput } from './media/policy.js';
import {
  applySandboxRuntimeEnv,
  ensureSandboxRuntimeDirs,
  isSandboxModeEnabled,
  resolveSandboxRuntimeConfig,
} from './sandbox-mode.js';
import {
  createUserDesignSystem,
  deleteUserDesignSystem,
  LEGACY_DESIGN_SYSTEM_ARTIFACTS,
  linkUserDesignSystemProject,
  listDesignSystems,
  listUserDesignSystemFiles,
  listUserDesignSystemRevisions,
  readDesignSystem,
  readDesignSystemPackageInfo,
  readUserDesignSystemFile,
  resolveDesignSystemAssets,
  updateUserDesignSystem,
  updateUserDesignSystemRevisionStatus,
} from './design-systems/index.js';
import { createDesignSystemGenerationJobStore } from './design-systems/generation-jobs.js';
import { prepareDesignTokenContractRebuild } from './design-systems/token-contract-rebuild.js';
import {
  applyDiffReviewDecisionToCwd,
  applyPlugin,
  buildConnectorProbe,
  defaultBundledRoot,
  detectSkillPluginCandidate,
  dismissSkillPluginCandidate,
  doctorPlugin,
  FIRST_PARTY_ATOMS,
  generateSkillPluginDraft,
  getInstalledPlugin,
  getSnapshot,
  installFromLocalFolder,
  installPlugin,
  insertSkillPluginCandidate,
  isDiffReviewSurfaceId,
  listSkillPluginCandidates,
  listInstalledPlugins,
  listIterationsForRun,
  MissingInputError,
  pluginPromptBlock,
  pruneExpiredSnapshots,
  readPluginLockfile,
  registerBuiltInAtomWorkers,
  registerBundledPlugins,
  registryRootsForDataDir,
  restoreProjectSnapshotLink,
  resolvePluginSnapshot,
  runPipelineForRun,
  runStageWithRegistry,
  startSnapshotGc,
  uninstallPlugin,
} from './plugins/index.js';
import {
  marketplaceManifestUrlForRegistry,
  marketplaceRegistryIdFromUrl,
} from './plugins/marketplaces.js';
import { composeMemoryBody, extractFromMessage } from './memory.js';
import { attachAcpSession } from './acp.js';
import { attachPiRpcSession } from './pi-rpc.js';
import { stageAmrImagePaths } from './media/amr-image-staging.js';
import { ingestRoutineConnectorEvolution } from './automation-routine-evolution.js';
import { createClaudeStreamHandler } from './runtimes/claude-stream.js';
import { createAgentTitleMarkerStripper } from './title-marker.js';
import { createRoleMarkerGuard } from './role-marker-guard.js';
import { diagnoseClaudeCliFailure } from './claude-diagnostics.js';
import { loadCritiqueConfigFromEnv } from './critique/config.js';
import { reconcileStaleRuns } from './critique/persistence.js';
import { runOrchestrator } from './critique/orchestrator.js';
import { createRunRegistry } from './critique/run-registry.js';
import { handleCritiqueInterrupt } from './critique/interrupt-handler.js';
import { handleCritiqueArtifact } from './critique/artifact-handler.js';
import { getCritiqueMetrics, register } from './metrics/index.js';
import { readConformanceHistory } from './critique/conformance-history.js';
import { evaluateRollout } from './critique/ratchet.js';
import {
  isCritiqueEnabled,
  parseEnvEnabled,
  parseRolloutPhase,
  type SkillCritiquePolicy,
} from './critique/rollout.js';
import { narrowProjectCritiqueOverride } from './critique/spawn-inputs.js';
import { createCopilotStreamHandler } from './copilot-stream.js';
import { createJsonEventStreamHandler } from './runtimes/json-event-stream.js';
import {
  antigravityAuthGuidance,
  antigravityQuotaGuidance,
  classifyAgentAuthFailure,
  classifyAgentServiceFailure,
  cursorAuthGuidance,
} from './runtimes/auth.js';
import { readOpenCodeServiceFailure } from './runtimes/opencode-log.js';
import { createAgentStderrVisibilityFilter } from './amr-stderr-filter.js';
import { createQoderStreamHandler } from './runtimes/qoder-stream.js';
import { subscribe as subscribeFileEvents } from './project-watchers.js';
import { renderDesignSystemPreview } from './design-systems/preview.js';
import { renderDesignSystemShowcase } from './design-systems/showcase.js';
import { createChatRunService } from './runtimes/runs.js';
import { deriveRunErrorCode, runResultFromStatus } from './run-result.js';
import { classifyRunFailure, isResumableFailure } from './run-failure-classification.js';
import { decideSafeRunRetry } from './run-retry-policy.js';
import {
  amrUserIdForRunAnalytics,
  hasExplicitRequestedModelForAnalytics,
  runtimeTypeForRunAnalytics,
  scanRunEventsForUsageAnalytics,
  summarizeRunTimingAnalytics,
} from './run-analytics-observability.js';
import { summarizeRunDiagnosticsForAnalytics } from './run-diagnostics.js';
import {
  countDesignSystemPreviewModules,
  countNewArtifacts,
  deriveActivationMilestones,
  didRunCreateDesignSystemFile,
  runAskedUserQuestion,
} from './runtimes/run-artifacts.js';
import {
  createRunArtifactBaselines,
  diffRunArtifacts,
  snapshotProjectArtifacts,
} from './run-artifact-fs.js';
import {
  reportRunCompletedFromDaemon,
  reportRunFeedbackFromDaemon,
} from './langfuse-bridge.js';
import {
  deriveLangfuseDeliveryState,
  readTelemetrySinkConfig,
} from './langfuse-trace.js';
import { buildPromptStackTelemetry } from './prompt-telemetry.js';
import {
  createAnalyticsService,
  newInsertId,
  readAnalyticsContext,
  readPublicConfigResponse,
} from './analytics.js';
import { observePendingInstallerApplyAttempts } from './update-apply-observations.js';
import {
  agentIdToTracking,
  deriveConfigureGlobals,
  modelIdForTracking,
  projectKindToTracking,
  sessionModeToTracking,
  type ObservabilityEventRequest,
} from '@open-design/contracts/analytics';
import {
  mergeNoProxyWithLoopbackDefaults,
  redactSecrets,
  testAgentConnection,
  testProviderConnection,
  validateBaseUrl,
  validateBaseUrlResolved,
} from './connectionTest.js';
import { listProviderModels } from './integrations/provider-models.js';
import { importClaudeDesignZip } from './claude-design-import.js';
import {
  defaultBaseUrlForFinalizeProtocol,
  finalizeDesignPackage,
  FinalizePackageLockedError,
  FinalizeUpstreamError,
  isFinalizeProviderProtocol,
} from './finalize-design.js';
import { buildDocumentPreview } from './document-preview.js';
import { lintArtifact, renderFindingsForAgent } from './lint-artifact.js';
import { loadCraftSections } from './craft.js';
import { skillCwdAliasSegment, stageActiveSkill } from './cwd-aliases.js';
import { buildDesktopPdfExportInput } from './pdf-export.js';
import { generateMedia } from './media/index.js';
import { listElevenLabsVoiceOptions } from './integrations/elevenlabs-voices.js';
import { searchResearch, ResearchError } from './research/index.js';
import { renderResearchCommandContract } from './prompts/research-contract.js';
import { openBrowser } from './browser-open.js';
import {
  AUDIO_DURATIONS_SEC,
  AUDIO_MODELS_BY_KIND,
  IMAGE_MODELS,
  MEDIA_ASPECTS,
  MEDIA_PROVIDERS,
  VIDEO_LENGTHS_SEC,
  VIDEO_MODELS,
} from './media/models.js';
import { readMaskedConfig, writeConfig } from './media/config.js';
import {
  deleteMediaTask,
  getMediaTask,
  insertMediaTask,
  listMediaTasksByProject,
  listRecentMediaTasks,
  reconcileMediaTasksOnBoot,
  updateMediaTask,
} from './media/tasks.js';
import {
  MCP_TEMPLATES,
  buildAcpMcpServers,
  buildClaudeMcpJson,
  buildOpenCodeMcpConfigContent,
  isManagedProjectCwd,
  readMcpConfig,
  writeMcpConfig,
} from './mcp-config.js';
import {
  parseRunToolBundleForRequest,
  resolveExternalMcpServersForRun,
  validateRunToolBundleForAgent,
} from './run-tool-bundle.js';
import {
  beginAuth,
  exchangeCodeForToken,
  PendingAuthCache,
  refreshAccessToken,
} from './mcp-oauth.js';
import {
  clearToken,
  getToken,
  isTokenExpired,
  readAllTokens,
  setToken,
} from './mcp-tokens.js';
import { agentCliEnvForAgent, readAppConfig, readPluginEnvKnobs, writeAppConfig } from './app-config.js';
import { OrbitService, formatLocalProjectTimestamp, renderOrbitTemplateSystemPrompt } from './orbit.js';
import { buildOrbitNoLiveArtifactSummary } from './orbit-agent-summary.js';
import {
  RoutineService,
  validateSchedule as validateRoutineSchedule,
  validateTarget as validateRoutineTarget,
} from './routines.js';
import { buildMcpInstallPayload } from './mcp-install-info.js';
import { createDiagnosticsExportHandler } from './diagnostics-export.js';
import { DIAGNOSTICS_EXPORT_PATH } from '@open-design/diagnostics';
import {
  buildProjectArchive,
  buildBatchArchive,
  createProjectFolder,
  decodeMultipartFilename,
  deleteProjectFile,
  assertSandboxProjectRootAvailable,
  deleteProjectFolder,
  detectEntryFile,
  ensureProject,
  ensureProjectSubdir,
  isRunTouchedProjectFile,
  isSafeId,
  listFiles,
  listProjectFolders,
  mimeFor,
  parseByteRange,
  projectDir,
  readProjectFile,
  renameProjectFile,
  removeProjectDir,
  resolveProjectDir,
  SandboxImportedProjectError,
  sanitizeName,
  searchProjectFiles,
  resolveProjectDir,
  resolveProjectFilePath,
  writeProjectFile,
  reconcileHtmlArtifactManifest,
} from './projects.js';
import { validateArtifactManifestInput } from './artifacts/manifest.js';
import { ArtifactPublicationBlockedError } from './artifacts/publication-guard.js';
import { readCurrentAppVersionInfo } from './app-version.js';
import {
  appendMessageAgentEvent,
  appendMessageStatusEvent,
  deleteConversation,
  deletePreviewComment,
  deleteProject as dbDeleteProject,
  deleteTemplate,
  getConversation,
  getDeployment,
  getDeploymentById,
  getMessageTelemetryFinalizationState,
  getProject,
  getTemplate,
  insertConversation,
  insertProject,
  insertRoutine,
  insertRoutineRun,
  insertScheduledRoutineRun,
  insertTemplate,
  findTemplateByNameAndProject,
  updateTemplate,
  listProjectsAwaitingInput,
  listConversations,
  listDeployments,
  listLatestProjectRunStatuses,
  listMessages,
  listPreviewComments,
  listProjects,
  listRoutines,
  listRoutineRuns,
  listTabs,
  listTemplates,
  getLatestRoutineRun,
  getRoutine,
  normalizeConversationSessionMode,
  deleteRoutine as dbDeleteRoutine,
  openDatabase,
  setTabs,
  updateConversation,
  updatePreviewCommentStatus,
  updateProject,
  updateRoutine,
  updateRoutineRun,
  clearAgentSession,
  updateAgentSessionStableHash,
  upsertAgentSession,
  upsertDeployment,
  upsertMessage,
  upsertPreviewComment,
} from './db.js';
import {
  computeIncludeStable,
  hashStableInstructions,
  isClaudeResumeFailure,
  persistCapturedAgentSession,
  resolveAgentResumeContext,
} from './agent-session-resume.js';
import {
  createLiveArtifact,
  deleteLiveArtifact,
  ensureLiveArtifactPreview,
  getLiveArtifact,
  LiveArtifactRefreshLockError,
  LiveArtifactStoreValidationError,
  listLiveArtifacts,
  listLiveArtifactRefreshLogEntries,
  readLiveArtifactCode,
  recoverStaleLiveArtifactRefreshes,
  updateLiveArtifact,
} from './live-artifacts/store.js';
import { LiveArtifactRefreshUnavailableError, refreshLiveArtifact } from './live-artifacts/refresh-service.js';
import { LiveArtifactRefreshAbortError } from './live-artifacts/refresh.js';
import { registerConnectorRoutes } from './connectors/routes.js';
import { registerActiveContextRoutes } from './routes/active-context.js';
import { registerAutomationRoutes } from './routes/automation.js';
import { registerGenuiRoutes } from './routes/genui.js';
import { registerDesignSystemRoutes } from './routes/design-systems.js';
import { registerHostToolsRoutes } from './routes/host-tools.js';
import { registerPluginAssetRoutes } from './routes/plugins/assets.js';
import { registerPluginMarketplaceRoutes } from './routes/plugins/marketplaces.js';
import { registerPluginEventRoutes, registerPluginRoutes, registerProjectPluginRoutes } from './routes/plugins/index.js';
import { registerMcpRoutes } from './mcp-routes.js';
import { registerXaiRoutes } from './routes/xai.js';
import { registerLiveArtifactRoutes } from './routes/live-artifact.js';
import { registerDesignSystemToolRoutes } from './routes/design-system-tool.js';
import { registerDeployRoutes, registerDeploymentCheckRoutes } from './routes/deploy.js';
import { registerMediaRoutes } from './routes/media.js';
import { registerProjectRoutes, registerProjectArtifactRoutes, registerProjectFileRoutes, registerProjectUploadRoutes } from './project-routes.js';
import { registerVelaRoutes } from './routes/vela.js';
import { registerFinalizeRoutes, registerImportRoutes, registerProjectExportRoutes } from './import-export-routes.js';
import { registerHandoffRoutes } from './routes/handoff.js';
import { EmptyTranscriptError, synthesizeHandoffPrompt } from './handoff-design.js';
import { TranscriptExportLockedError } from './transcript-export.js';
import { registerChatRoutes } from './routes/chat.js';
import { registerTerminalRoutes } from './routes/terminal.js';
import { createTerminalService } from './terminals.js';
import { registerSocialShareRoutes } from './routes/social-share.js';
import { registerMemoryRoutes } from './routes/memory.js';
import { registerAtomRoutes, registerStaticResourceRoutes } from './routes/static-resource.js';
import { registerRoutineRoutes, routineDbRowToContract } from './routes/routine.js';
import { createPluginInstallationHelpers, normalizeProjectPluginFolderPath, resolveProjectChildDirectory } from './services/plugin-installation.js';
import { createPluginShareTaskStore } from './services/plugin-share-tasks.js';
import { getRouteRegistrationInventory, installRouteRegistrationGuard } from './route-registration-guard.js';
import { assertServerContextSatisfiesRoutes } from './route-context-contract.js';
import { configureConnectorCredentialStore, connectorService, ConnectorServiceError, FileConnectorCredentialStore } from './connectors/service.js';
import { composioConnectorProvider } from './connectors/composio.js';
import { configureComposioConfigStore } from './connectors/composio-config.js';
import { CHAT_TOOL_ENDPOINTS, CHAT_TOOL_OPERATIONS, toolTokenRegistry } from './tool-tokens.js';
import {
  aggregateCloudflarePagesStatus,
  buildDeployFileSet,
  checkDeploymentUrl,
  CLOUDFLARE_PAGES_PROVIDER_ID,
  cloudflarePagesProjectNameForProject,
  DeployError,
  deployToCloudflarePages,
  deployToVercel,
  isDeployProviderId,
  listCloudflarePagesZones,
  prepareDeployPreflight,
  publicDeployConfigForProvider,
  readDeployConfig,
  readCloudflarePagesDomain,
  VERCEL_PROVIDER_ID,
  writeDeployConfig,
} from './deploy.js';
import {
  allowedBrowserPorts,
  configuredAllowedOrigins,
  isAllowedBrowserOrigin,
  isLocalSameOrigin,
} from './origin-validation.js';
import { apiTokenFromEnv, isApiAuthDisabled, isApiTokenMiddlewareEnabled } from './api-token-auth.js';

/** @typedef {import('@open-design/contracts').ApiErrorCode} ApiErrorCode */
/** @typedef {import('@open-design/contracts').ApiError} ApiError */
/** @typedef {import('@open-design/contracts').ApiErrorResponse} ApiErrorResponse */
/** @typedef {import('@open-design/contracts').ChatRequest} ChatRequest */
/** @typedef {import('@open-design/contracts').ChatSseEvent} ChatSseEvent */
/** @typedef {import('@open-design/contracts').ProxyStreamRequest} ProxyStreamRequest */
/** @typedef {import('@open-design/contracts').ProxySseEvent} ProxySseEvent */
/** @typedef {import('@open-design/contracts').ProjectConversationCreatedSsePayload} ProjectConversationCreatedSsePayload */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = resolveProjectRoot(__dirname);
const RESOURCE_ROOT_ENV = 'OD_RESOURCE_ROOT';

export function composeLiveInstructionPrompt({
  daemonSystemPrompt,
  runtimeToolPrompt,
  clientSystemPrompt,
  finalPromptOverride,
}) {
  const override =
    typeof finalPromptOverride === 'string'
      ? finalPromptOverride.trim()
      : '';
  const parts = [daemonSystemPrompt, runtimeToolPrompt, clientSystemPrompt]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .map((part) =>
      override && part.includes(override)
        ? part.split(override).join('').trim()
        : part,
    )
    .filter(Boolean);
  if (override) {
    parts.push(override);
  }
  return parts.join('\n\n---\n\n');
}

function renderPluginBriefTemplate(template, inputs = {}) {
  if (typeof template !== 'string' || template.length === 0) return '';
  return template.replace(/\{\{\s*([a-zA-Z_][\w-]*)\s*\}\}/g, (full, key) => {
    if (!Object.hasOwn(inputs, key)) return full;
    const value = inputs[key];
    if (value === undefined || value === null || value === '') return full;
    return String(value);
  });
}

export function resolveResearchCommandContract(research, message) {
  if (!research || !research.enabled) return '';
  const researchQuery =
    typeof research.query === 'string' && research.query.trim()
      ? research.query
      : message;
  return renderResearchCommandContract({
    query: researchQuery,
    maxSources:
      typeof research.maxSources === 'number' ? research.maxSources : undefined,
  });
}

export function resolveCodexGeneratedImagesDir(
  agentId,
  metadata,
  env = process.env,
  homeDir = os.homedir(),
  mediaExecution: any = undefined,
) {
  if (!shouldAllowCodexImagegenForMediaPolicy(metadata, mediaExecution)) return null;
  if (!shouldRenderCodexImagegenOverride(agentId, metadata)) return null;
  const rawCodexHome =
    typeof env?.CODEX_HOME === 'string' && env.CODEX_HOME.trim().length > 0
      ? env.CODEX_HOME.trim()
      : path.join(homeDir, '.codex');
  const codexHome = rawCodexHome.startsWith('~/')
    ? path.join(homeDir, rawCodexHome.slice(2))
    : rawCodexHome;
  return path.resolve(codexHome, 'generated_images');
}

type DirectoryStat = {
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
};

type CodexGeneratedImagesDirValidationOptions = {
  protectedDirs?: Array<string | null | undefined>;
  mkdirSync?: (target: string, options: { recursive: true }) => unknown;
  lstatSync?: (target: string) => DirectoryStat;
  statSync?: (target: string) => DirectoryStat;
  realpathSync?: (target: string) => string;
  warn?: (message: string) => void;
};

function isMissingPathError(err: unknown): boolean {
  return (
    err &&
    typeof err === 'object' &&
    'code' in err &&
    err.code === 'ENOENT'
  );
}

function collectProtectedDirRoots(
  protectedDirs: Array<string | null | undefined>,
  {
    realpathSync,
    statSync,
  }: {
    realpathSync: (target: string) => string;
    statSync: (target: string) => DirectoryStat;
  },
): string[] {
  const roots = [];
  for (const raw of Array.isArray(protectedDirs) ? protectedDirs : []) {
    if (typeof raw !== 'string' || raw.trim().length === 0) continue;
    const resolved = path.resolve(raw);
    roots.push(resolved);
    try {
      const canonical = realpathSync(resolved);
      try {
        if (statSync(canonical).isDirectory()) roots.push(canonical);
      } catch {
        roots.push(canonical);
      }
    } catch {
      // A missing protected root cannot be the canonical target of a symlink.
    }
  }
  return Array.from(new Set(roots));
}

function findContainingProtectedRoot(
  candidate: string,
  protectedRoots: string[],
): string | null {
  return protectedRoots.find((root) => isPathWithin(root, candidate)) ?? null;
}

export function validateCodexGeneratedImagesDir(
  codexGeneratedImagesDir: string | null | undefined,
  {
    protectedDirs = [],
    mkdirSync = fs.mkdirSync,
    lstatSync = fs.lstatSync,
    statSync = fs.statSync,
    realpathSync = fs.realpathSync.native,
    warn = console.warn,
  }: CodexGeneratedImagesDirValidationOptions = {},
): string | null {
  if (
    typeof codexGeneratedImagesDir !== 'string' ||
    codexGeneratedImagesDir.trim().length === 0
  ) {
    return null;
  }

  const resolved = path.resolve(codexGeneratedImagesDir);
  const protectedRoots = collectProtectedDirRoots(protectedDirs, {
    realpathSync,
    statSync,
  });
  const warnSkipped = (reason: string) =>
    warn(`[od] codex generated_images allowlist skipped: ${reason}`);

  const protectedRoot = findContainingProtectedRoot(resolved, protectedRoots);
  if (protectedRoot) {
    warnSkipped(`${resolved} is inside protected root ${protectedRoot}`);
    return null;
  }

  try {
    let existingTargetStat = null;
    try {
      existingTargetStat = lstatSync(resolved);
    } catch (err) {
      if (!isMissingPathError(err)) throw err;
    }
    if (existingTargetStat?.isSymbolicLink()) {
      warnSkipped(`${resolved} is a symlink`);
      return null;
    }
    if (existingTargetStat && !existingTargetStat.isDirectory()) {
      warnSkipped(`${resolved} is not a directory`);
      return null;
    }

    const parent = path.dirname(resolved);
    const protectedParentRoot = findContainingProtectedRoot(
      parent,
      protectedRoots,
    );
    if (protectedParentRoot) {
      warnSkipped(`${parent} is inside protected root ${protectedParentRoot}`);
      return null;
    }

    mkdirSync(parent, { recursive: true });
    const canonicalParent = realpathSync(parent);
    const canonicalCandidate = path.join(
      canonicalParent,
      path.basename(resolved),
    );
    const protectedCanonicalParentRoot = findContainingProtectedRoot(
      canonicalCandidate,
      protectedRoots,
    );
    if (protectedCanonicalParentRoot) {
      warnSkipped(
        `${canonicalCandidate} resolves inside protected root ${protectedCanonicalParentRoot}`,
      );
      return null;
    }

    mkdirSync(resolved, { recursive: true });
    if (lstatSync(resolved).isSymbolicLink()) {
      warnSkipped(`${resolved} is a symlink`);
      return null;
    }
    if (!statSync(resolved).isDirectory()) {
      warnSkipped(`${resolved} is not a directory`);
      return null;
    }
    const canonicalDir = realpathSync(resolved);
    const protectedCanonicalRoot = findContainingProtectedRoot(
      canonicalDir,
      protectedRoots,
    );
    if (protectedCanonicalRoot) {
      warnSkipped(
        `${canonicalDir} resolves inside protected root ${protectedCanonicalRoot}`,
      );
      return null;
    }

    return canonicalDir;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : String(err ?? 'unknown error');
    warn(`[od] codex generated_images allowlist mkdir failed: ${message}`);
    return null;
  }
}

export function resolveChatExtraAllowedDirs({
  agentId,
  skillsDir,
  designSystemsDir,
  linkedDirs = [],
  codexGeneratedImagesDir,
  existsSync = fs.existsSync,
}: {
  agentId?: string | null;
  skillsDir?: string | null;
  designSystemsDir?: string | null;
  linkedDirs?: Array<string | null | undefined>;
  codexGeneratedImagesDir?: string | null;
  existsSync?: (path: string) => boolean;
}): string[] {
  const isCodex =
    typeof agentId === 'string' && agentId.trim().toLowerCase() === 'codex';
  const candidates = isCodex
    ? [codexGeneratedImagesDir]
    : [
        skillsDir,
        designSystemsDir,
        ...(Array.isArray(linkedDirs) ? linkedDirs : []),
      ];
  return Array.from(
    new Set(
      candidates.filter(
        (d) =>
          typeof d === 'string' && d.length > 0 && existsSync(d),
      ),
    ),
  );
}

export function resolveGrantedCodexImagegenOverride({
  agentId,
  metadata,
  codexGeneratedImagesDir,
  extraAllowedDirs = [],
  mediaExecution,
}: {
  agentId?: string | null;
  metadata?: unknown;
  codexGeneratedImagesDir?: string | null;
  extraAllowedDirs?: string[];
  mediaExecution?: unknown;
}): string | null {
  if (!shouldAllowCodexImagegenForMediaPolicy(metadata, mediaExecution)) {
    return null;
  }
  if (
    typeof codexGeneratedImagesDir !== 'string' ||
    codexGeneratedImagesDir.length === 0 ||
    !Array.isArray(extraAllowedDirs) ||
    !extraAllowedDirs.includes(codexGeneratedImagesDir)
  ) {
    return null;
  }
  return renderCodexImagegenOverride(agentId, metadata);
}

function shouldAllowCodexImagegenForMediaPolicy(metadata, mediaExecution) {
  const mode = mediaExecution?.mode ?? 'enabled';
  if (mode !== 'enabled') return false;
  if (
    Array.isArray(mediaExecution?.allowedSurfaces) &&
    mediaExecution.allowedSurfaces.length > 0 &&
    !mediaExecution.allowedSurfaces.includes('image')
  ) {
    return false;
  }
  const model = resolveCodexImagegenModelId(metadata);
  if (
    model &&
    Array.isArray(mediaExecution?.allowedModels) &&
    mediaExecution.allowedModels.length > 0 &&
    !mediaExecution.allowedModels.includes(model)
  ) {
    return false;
  }
  return true;
}

export function normalizeCommentAttachments(input) {
  if (!Array.isArray(input)) return [];
  return input
    .map((raw, index) => {
      if (!raw || typeof raw !== 'object') return null;
      const filePath = cleanString(raw.filePath);
      const elementId = cleanString(raw.elementId);
      const selector = cleanString(raw.selector);
      const label = cleanString(raw.label);
      const screenshotPath = cleanString(raw.screenshotPath);
      const markKind = normalizeVisualMarkKind(raw.markKind);
      const intent = compactString(raw.intent, 220);
      const imageAttachments = normalizePreviewCommentImageAttachments(raw.imageAttachments);
      const commentContext = raw.commentContext === 'query' ? 'query' : 'context';
      const comment = commentContext === 'query'
        ? ''
        : cleanString(raw.comment) || intent || imageOnlyCommentFallback(imageAttachments.length);
      const selectionKind =
        raw.selectionKind === 'visual' ? 'visual' : raw.selectionKind === 'pod' ? 'pod' : 'element';
      if (!filePath || !elementId) return null;
      if (selectionKind !== 'visual' && !selector) return null;
      if (selectionKind === 'visual' && !screenshotPath) return null;
      const podMembers = selectionKind === 'pod' ? normalizeAttachmentPodMembers(raw.podMembers) : [];
      const memberCount =
        selectionKind === 'pod'
          ? (podMembers.length > 0
              ? podMembers.length
              : Number.isFinite(raw.memberCount)
                ? Math.max(0, Math.round(raw.memberCount))
                : 0)
          : 0;
      return {
        id: cleanString(raw.id) || `comment-${index + 1}`,
        order: Number.isFinite(raw.order)
          ? Math.max(1, Math.round(raw.order))
          : index + 1,
        filePath,
        elementId,
        selector,
        label,
        comment,
        currentText: compactString(raw.currentText, 160),
        pagePosition: normalizeAttachmentPosition(raw.pagePosition),
        htmlHint: compactString(raw.htmlHint, 180),
        style: normalizeAnnotationStyle(raw.style),
        selectionKind,
        memberCount,
        podMembers,
        screenshotPath: selectionKind === 'visual' ? screenshotPath : undefined,
        markKind: selectionKind === 'visual' ? markKind : undefined,
        intent: selectionKind === 'visual'
          ? intent || visualAnnotationIntent(markKind)
          : undefined,
        imageAttachments: imageAttachments.length > 0 ? imageAttachments : undefined,
        commentContext,
        source: raw.source === 'board-batch' ? 'board-batch' : 'saved-comment',
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.order - b.order);
}

export function renderCommentAttachmentHint(commentAttachments) {
  if (!commentAttachments.length) return '';
  const lines = [
    '',
    '',
    '<attached-preview-comments>',
    "Hard scope: change ONLY the elements identified below by selector / position / pod members. Do NOT modify sibling sub-pages, parent layout, global CSS, design tokens, or unrelated rules even if you notice issues there — surface those as a follow-up note in your reply instead of editing them. If the user's request cannot be satisfied without touching outside this scope, ask the user before proceeding. For visual marks, inspect the screenshot and modify the marked region first.",
  ];
  for (const item of commentAttachments) {
    const targetKind =
      item.selectionKind === 'visual' ? 'visual' : item.selectionKind === 'pod' ? 'pod' : 'element';
    lines.push(
      '',
      `${item.order}. ${item.elementId}`,
      `targetKind: ${targetKind}`,
      `file: ${item.filePath}`,
      `label: ${item.label || '(unlabeled)'}`,
      `position: ${formatAttachmentPosition(item.pagePosition)}`,
      `currentText: ${item.currentText || '(empty)'}`,
      `htmlHint: ${item.htmlHint || '(none)'}`,
      `computedStyle: ${formatAnnotationStyle(item.style) || '(none)'}`,
    );
    if (item.comment && item.commentContext !== 'query') {
      lines.push(`comment: ${item.comment}`);
    }
    if (targetKind === 'visual') {
      lines.push(
        `screenshot: ${item.screenshotPath}`,
        `markKind: ${item.markKind || 'stroke'}`,
        `intent: ${item.intent || visualAnnotationIntent(item.markKind || 'stroke')}`,
      );
      if (item.selector) lines.push(`selector: ${item.selector}`);
    } else {
      lines.splice(lines.length - 4, 0, `selector: ${item.selector}`);
    }
    if (targetKind === 'pod') {
      lines.push(`memberCount: ${item.memberCount || item.podMembers.length || 0}`);
      item.podMembers.slice(0, 8).forEach((member, memberIndex) => {
        lines.push(
          `member.${memberIndex + 1}: ${member.elementId} | ${member.label || '(unlabeled)'} | ${member.selector}`,
        );
        const memberStyle = formatAnnotationStyle(member.style);
        if (memberStyle) lines.push(`member.${memberIndex + 1}.computedStyle: ${memberStyle}`);
      });
    }
    const imageAttachments = normalizePreviewCommentImageAttachments(item.imageAttachments);
    if (imageAttachments.length > 0) {
      lines.push(`imageAttachments: ${imageAttachments.length}`);
      imageAttachments.forEach((attachment, attachmentIndex) => {
        lines.push(`image.${attachmentIndex + 1}: ${attachment.path} | ${attachment.name}`);
      });
    }
  }
  lines.push('</attached-preview-comments>');
  return lines.join('\n');
}

function cleanString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizePreviewCommentImageAttachments(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  const seen = new Set();
  for (const item of input) {
    if (!item || typeof item !== 'object') continue;
    const path = cleanString(item.path);
    if (!path || seen.has(path)) continue;
    seen.add(path);
    const name = cleanString(item.name) || path.split('/').pop() || path;
    out.push({ path, name });
    if (out.length >= 20) break;
  }
  return out;
}

function imageOnlyCommentFallback(count) {
  if (count <= 0) return '';
  return count > 1
    ? `Use the ${count} attached images as the comment reference.`
    : 'Use the attached image as the comment reference.';
}

function normalizeVisualMarkKind(value) {
  return value === 'click' || value === 'click+stroke' || value === 'stroke'
    ? value
    : 'stroke';
}

function visualAnnotationIntent(markKind) {
  if (markKind === 'click') {
    return 'The screenshot has a blue focus box around the picked element; modify that picked part first.';
  }
  if (markKind === 'click+stroke') {
    return 'The screenshot has a blue focus box and red strokes; together they identify the part the user wants changed.';
  }
  return 'The screenshot has red strokes that identify the visual region the user wants changed.';
}

function compactString(value, max) {
  const text = cleanString(value).replace(/\s+/g, ' ');
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function normalizeAttachmentPosition(input) {
  const value = input && typeof input === 'object' ? input : {};
  return {
    x: finiteAttachmentNumber(value.x),
    y: finiteAttachmentNumber(value.y),
    width: finiteAttachmentNumber(value.width),
    height: finiteAttachmentNumber(value.height),
  };
}

function normalizeAttachmentPodMembers(input) {
  if (!Array.isArray(input)) return [];
  return input
    .map((member) => {
      if (!member || typeof member !== 'object') return null;
      const elementId = cleanString(member.elementId);
      const selector = cleanString(member.selector);
      const label = cleanString(member.label);
      if (!elementId || !selector) return null;
      return {
        elementId,
        selector,
        label,
        text: compactString(member.text, 160),
        position: normalizeAttachmentPosition(member.position),
        htmlHint: compactString(member.htmlHint, 180),
        style: normalizeAnnotationStyle(member.style),
      };
    })
    .filter(Boolean);
}

function normalizeAnnotationStyle(input) {
  if (!input || typeof input !== 'object') return undefined;
  const style = {};
  for (const key of ANNOTATION_STYLE_KEYS) {
    const value = input[key];
    if (typeof value !== 'string') continue;
    const trimmed = value.replace(/\s+/g, ' ').trim();
    if (trimmed) style[key] = trimmed.slice(0, 120);
  }
  return Object.keys(style).length > 0 ? style : undefined;
}

function formatAnnotationStyle(style) {
  if (!style || typeof style !== 'object') return '';
  return ANNOTATION_STYLE_KEYS
    .map((key) => {
      const value = style[key];
      return value ? `${key}: ${value}` : null;
    })
    .filter(Boolean)
    .join('; ');
}

const ANNOTATION_STYLE_KEYS = [
  'color',
  'backgroundColor',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'textAlign',
  'fontFamily',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'borderRadius',
];

function finiteAttachmentNumber(value) {
  return Number.isFinite(value) ? Math.round(value) : 0;
}

const DESIGN_FILES_HINT_FOLDER_LIMIT = 40;
const DESIGN_FILES_HINT_FILE_LIMIT = 80;
type DesignFilesHintEntry = {
  name?: string;
  path?: string;
  kind?: string;
  type?: string;
  size?: number;
};

function formatAttachmentPosition(position) {
  return `x=${position.x}, y=${position.y}, width=${position.width}, height=${position.height}`;
}

function isPathWithin(base, target) {
  const relativePath = path.relative(path.resolve(base), path.resolve(target));
  return (
    relativePath === '' ||
    (relativePath.length > 0 &&
      !relativePath.startsWith('..') &&
      !path.isAbsolute(relativePath))
  );
}

export function resolveSafeProjectAttachments(cwd, attachments, opts = {}) {
  if (!cwd || !Array.isArray(attachments)) return [];
  const pathImpl = opts.pathImpl ?? path;
  const existsSync = opts.existsSync ?? fs.existsSync;
  const root = pathImpl.resolve(cwd);
  const out = [];

  for (const attachment of attachments) {
    if (typeof attachment !== 'string' || attachment.length === 0) continue;
    try {
      const abs = pathImpl.resolve(root, attachment);
      const relativePath = pathImpl.relative(root, abs);
      const withinRoot =
        relativePath === '' ||
        (relativePath.length > 0 &&
          !relativePath.startsWith('..') &&
          !pathImpl.isAbsolute(relativePath));
      if (withinRoot && existsSync(abs)) out.push(attachment);
    } catch {
      // Drop malformed paths; attachments are advisory prompt context.
    }
  }

  return out;
}

export function formatProjectAttachmentHint(attachments) {
  if (!Array.isArray(attachments) || attachments.length === 0) return '';
  return [
    '',
    '',
    'Attached project files in user-visible order:',
    ...attachments.map((p, index) => `${index + 1}. \`${p}\``),
    '',
    'When the user says "first attachment", "second file", or similar, map those references to the numbered list above.',
  ].join('\n');
}

function formatProjectEntrySize(size: number) {
  if (!Number.isFinite(size) || size <= 0) return '';
  if (size < 1024) return `${Math.round(size)} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDesignFilesEntryLine(entry: DesignFilesHintEntry | null | undefined, fallbackKind?: string) {
  const entryPath =
    typeof entry?.path === 'string' && entry.path
      ? entry.path
      : typeof entry?.name === 'string'
        ? entry.name
        : '';
  if (!entryPath) return null;
  const kind = fallbackKind || entry.kind || entry.type || 'file';
  const size = kind === 'folder' ? '' : formatProjectEntrySize(Number(entry.size));
  return `- \`${entryPath}\` (${[kind, size].filter(Boolean).join(', ')})`;
}

export function formatDesignFilesWorkspaceHint(
  cwd: string | null | undefined,
  files: DesignFilesHintEntry[] = [],
  folders: DesignFilesHintEntry[] = [],
) {
  if (typeof cwd !== 'string' || cwd.trim().length === 0) return '';
  const safeFolders = Array.isArray(folders) ? folders : [];
  const safeFiles = Array.isArray(files) ? files : [];
  const folderLines = safeFolders
    .slice(0, DESIGN_FILES_HINT_FOLDER_LIMIT)
    .map((folder) => formatDesignFilesEntryLine(folder, 'folder'))
    .filter(Boolean);
  const fileLines = safeFiles
    .slice(0, DESIGN_FILES_HINT_FILE_LIMIT)
    .map((file) => formatDesignFilesEntryLine(file, file?.kind || 'file'))
    .filter(Boolean);
  const totalFolders = safeFolders.length;
  const totalFiles = safeFiles.length;
  const omittedFolders = Math.max(0, totalFolders - folderLines.length);
  const omittedFiles = Math.max(0, totalFiles - fileLines.length);

  const lines = [
    '',
    '',
    '## Design Files workspace',
    `The Design Files panel is backed by your current working directory: \`${cwd}\`. Write project files relative to this directory (for example \`index.html\` or \`assets/x.png\`). The user can browse these files in real time.`,
    'The selected/attached files for a turn are only a shortcut for priority and ordering. If the user did not attach any file, do not assume there are no relevant Design Files.',
    'When the request refers to existing files, asks you to choose a file, says "current", "this design", "the deck", "the image", "the folder", or depends on project state, inspect/search/read this workspace before answering or editing. Prefer project-relative paths, use the active workspace context as the default target, and ask only if multiple plausible targets remain after inspection.',
    'For non-trivial inspection or edits, surface progress through visible planning/status/tool events instead of silently guessing.',
    '',
    `Current Design Files snapshot: ${totalFolders} folder${totalFolders === 1 ? '' : 's'}, ${totalFiles} file${totalFiles === 1 ? '' : 's'}.`,
  ];

  if (folderLines.length > 0) {
    lines.push('', 'Folders:', ...folderLines);
    if (omittedFolders > 0) lines.push(`- ... ${omittedFolders} more folder${omittedFolders === 1 ? '' : 's'} omitted`);
  }

  if (fileLines.length > 0) {
    lines.push('', 'Files:', ...fileLines);
    if (omittedFiles > 0) lines.push(`- ... ${omittedFiles} more file${omittedFiles === 1 ? '' : 's'} omitted`);
  }

  if (folderLines.length === 0 && fileLines.length === 0) {
    lines.push('', 'No user-visible Design Files exist yet. Create clear project-relative files when the task requires output.');
  }

  return lines.join('\n');
}

export function resolveSafePromptImagePaths(imagePaths, opts = {}) {
  if (!Array.isArray(imagePaths) || imagePaths.length === 0) {
    return { safeImages: [], oversizedImages: [], failedImages: [] };
  }
  const pathImpl = opts.pathImpl ?? path;
  const existsSync = opts.existsSync ?? fs.existsSync;
  const statSync = opts.statSync ?? fs.statSync;
  const uploadDir = pathImpl.resolve(opts.uploadDir ?? UPLOAD_DIR);
  const maxBytes = Number.isFinite(opts.maxBytes)
    ? Number(opts.maxBytes)
    : MAX_CHAT_IMAGE_BYTES;
  const safeImages = [];
  const oversizedImages = [];
  const failedImages = [];

  for (const inputPath of imagePaths) {
    if (typeof inputPath !== 'string' || inputPath.length === 0) continue;
    let resolved;
    try {
      resolved = pathImpl.resolve(inputPath);
    } catch {
      // Drop malformed path input; we cannot even resolve it to a location.
      continue;
    }
    if (!isPathWithin(uploadDir, resolved) || !existsSync(resolved)) continue;
    // Past the within-UPLOAD_DIR + existence gate the path points at a real
    // upload. A statSync failure here (EACCES/EPERM, a file that vanished
    // mid-run) is an infrastructure error, not bad input — surface it so the
    // run fails loudly instead of silently dropping required prompt context.
    let stat;
    try {
      stat = statSync(resolved);
    } catch (err) {
      failedImages.push({
        path: inputPath,
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }
    if (!stat.isFile()) continue;
    if (typeof stat.size === 'number' && stat.size > maxBytes) {
      oversizedImages.push({ path: inputPath, sizeBytes: stat.size });
      continue;
    }
    safeImages.push(inputPath);
  }

  return { safeImages, oversizedImages, failedImages };
}

const DAEMON_RESOURCE_ROOT = resolveDaemonResourceRoot({
  safeBases: [
    PROJECT_ROOT,
    resolveProcessResourcesPath(),
    process.env.OD_INSTALLATION_DIR,
  ],
});
// Built web app lives in `out/` — that's where Next.js writes the static
// export configured in next.config.ts. The folder name used to be `dist/`
// when this project shipped with Vite; the daemon serves whatever the
// frontend toolchain emits, no further config needed.
const STATIC_DIR = path.join(PROJECT_ROOT, 'apps', 'web', 'out');
// Baked plugin preview clips (scripts/bake-plugin-previews.mjs). Served at
// PLUGIN_PREVIEWS_ROUTE; their manifest rewrites html plugins' previews to a
// cheap poster + hover-play video in the home gallery.
const PLUGIN_PREVIEWS_DIR = resolveDaemonPluginPreviewsDir({
  resourceRoot: DAEMON_RESOURCE_ROOT,
  projectRoot: PROJECT_ROOT,
});
const OD_BIN = resolveDaemonCliPath();
const OD_NODE_BIN = process.execPath;
const SKILLS_DIR = resolveDaemonResourceDir(
  DAEMON_RESOURCE_ROOT,
  'skills',
  path.join(PROJECT_ROOT, 'skills'),
);
const DESIGN_SYSTEMS_DIR = resolveDaemonResourceDir(
  DAEMON_RESOURCE_ROOT,
  'design-systems',
  path.join(PROJECT_ROOT, 'design-systems'),
);
// Renderable templates pulled out of `skills/` by the skills/design-templates
// split (PR #955) so the EntryView Templates tab gets the large rendering
// catalogue and Settings → Skills only carries functional skills the agent
// invokes mid-task. See specs/current/skills-and-design-templates.md.
const DESIGN_TEMPLATES_DIR = resolveDaemonResourceDir(
  DAEMON_RESOURCE_ROOT,
  'design-templates',
  path.join(PROJECT_ROOT, 'design-templates'),
);
const CRAFT_DIR = resolveDaemonResourceDir(
  DAEMON_RESOURCE_ROOT,
  'craft',
  path.join(PROJECT_ROOT, 'craft'),
);
// User-installed skills and design systems live under the runtime data dir
// so they respect OD_DATA_DIR overrides (test isolation, packaged runs).
// Defined after RUNTIME_DATA_DIR is resolved below.
const FRAMES_DIR = resolveDaemonResourceDir(
  DAEMON_RESOURCE_ROOT,
  'frames',
  path.join(PROJECT_ROOT, 'assets', 'frames'),
);
// Curated pets baked into the repo via `scripts/bake-community-pets.ts`.
// `listCodexPets` scans this in addition to `~/.codex/pets/` so the
// "Recently hatched" grid is non-empty out-of-the-box and users do not
// need to hit the "Download community pets" button to try a few pets.
const BUNDLED_PETS_DIR = resolveDaemonResourceDir(
  DAEMON_RESOURCE_ROOT,
  'community-pets',
  path.join(PROJECT_ROOT, 'assets', 'community-pets'),
);
const PROMPT_TEMPLATES_DIR = resolveDaemonResourceDir(
  DAEMON_RESOURCE_ROOT,
  'prompt-templates',
  path.join(PROJECT_ROOT, 'prompt-templates'),
);
const BUNDLED_PLUGINS_DIR = resolveDaemonResourceDir(
  DAEMON_RESOURCE_ROOT,
  path.join('plugins', '_official'),
  defaultBundledRoot(PROJECT_ROOT),
);
const PLUGIN_REGISTRY_DIR = resolveDaemonResourceDir(
  DAEMON_RESOURCE_ROOT,
  'plugins/registry',
  path.join(PROJECT_ROOT, 'plugins', 'registry'),
);
const OFFICIAL_MARKETPLACE_ID = 'official';
const OFFICIAL_PLUGIN_SOURCE_REPO = 'github:nexu-io/open-design@main';

function defaultMarketplaceSeedConfig(id) {
  return {
    trust: id === OFFICIAL_MARKETPLACE_ID ? 'official' : 'restricted',
    url:   marketplaceManifestUrlForRegistry(id),
  };
}

function bundledPluginRegistrySource(sourcePath) {
  if (isPathWithin(BUNDLED_PLUGINS_DIR, sourcePath)) {
    const rel = path.relative(BUNDLED_PLUGINS_DIR, sourcePath).split(path.sep).join('/');
    return `${OFFICIAL_PLUGIN_SOURCE_REPO}/plugins/_official/${rel}`;
  }
  const rel = path.relative(PROJECT_ROOT, sourcePath).split(path.sep).join('/');
  if (!rel || rel.startsWith('..')) return sourcePath;
  return `${OFFICIAL_PLUGIN_SOURCE_REPO}/${rel}`;
}

function mergeMarketplaceEntries(manifestText, entries) {
  try {
    const parsed = JSON.parse(manifestText);
    const plugins = Array.isArray(parsed.plugins) ? parsed.plugins : [];
    const seen = new Set(plugins.map((entry) => String(entry?.name ?? '').toLowerCase()));
    const generated = entries.filter((entry) => {
      const key = String(entry.name ?? '').toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return JSON.stringify({
      ...parsed,
      metadata: {
        ...(parsed.metadata && typeof parsed.metadata === 'object' ? parsed.metadata : {}),
        bundledPreinstallCount: entries.length,
      },
      plugins: [...plugins, ...generated],
    });
  } catch {
    return manifestText;
  }
}

async function marketplaceSeedManifestText(id, bundledMarketplaceEntries) {
  const manifestPath = path.join(PLUGIN_REGISTRY_DIR, id, 'open-design-marketplace.json');
  if (!fs.existsSync(manifestPath)) return null;
  let manifestText = await fs.promises.readFile(manifestPath, 'utf8');
  if (id === OFFICIAL_MARKETPLACE_ID && bundledMarketplaceEntries.length > 0) {
    manifestText = mergeMarketplaceEntries(manifestText, bundledMarketplaceEntries);
  }
  return manifestText;
}

function createMarketplaceFetcher(seedId, bundledMarketplaceEntries) {
  return async (url) => {
    const registryId = marketplaceRegistryIdFromUrl(url);
    if (registryId && (!seedId || registryId === seedId)) {
      const manifestText = await marketplaceSeedManifestText(registryId, bundledMarketplaceEntries);
      if (manifestText != null) {
        return {
          ok:     true,
          status: 200,
          text:   async () => manifestText,
        };
      }
    }
    const response = await fetch(url, { redirect: 'follow' });
    return {
      ok:     response.ok,
      status: response.status,
      text:   () => response.text(),
    };
  };
}

const SANDBOX_MODE_ENABLED = isSandboxModeEnabled(process.env);
const RUNTIME_DATA_DIR = resolveDataDir(process.env.OD_DATA_DIR, PROJECT_ROOT, {
  requireExplicit: SANDBOX_MODE_ENABLED,
});
const SANDBOX_RUNTIME = resolveSandboxRuntimeConfig(SANDBOX_MODE_ENABLED, RUNTIME_DATA_DIR);
ensureSandboxRuntimeDirs(SANDBOX_RUNTIME);
const PLUGIN_LOCKFILE_PATH = path.join(RUNTIME_DATA_DIR, 'od-plugin-lock.json');
// Canonical (realpath-resolved) form of RUNTIME_DATA_DIR for the few callers
// that compare it against a user-supplied realpath() result. On macOS, /var
// is a symlink to /private/var, so an import realpath lands in /private/var
// and would never start-with the raw RUNTIME_DATA_DIR. Keep RUNTIME_DATA_DIR
// itself as the stable, user-shaped path so OD_DATA_DIR resolution stays
// predictable; only this canonical alias is used for symlink-aware checks.
const RUNTIME_DATA_DIR_CANONICAL = (() => {
  try {
    return fs.realpathSync(RUNTIME_DATA_DIR);
  } catch {
    return RUNTIME_DATA_DIR;
  }
})();
// One-shot legacy data migration. When OD_LEGACY_DATA_DIR is set and the
// new data root is fresh (no app.sqlite), copy the 0.3.x .od/ payload
// across before SQLite opens. Synchronous on purpose: openDatabase below
// would race an async copy. See apps/daemon/src/legacy-data-migrator.ts
// and https://github.com/nexu-io/open-design/issues/710.
migrateLegacyDataDirSync({
  legacyDir: process.env.OD_LEGACY_DATA_DIR,
  dataDir: RUNTIME_DATA_DIR,
});
const ARTIFACTS_DIR = path.join(RUNTIME_DATA_DIR, 'artifacts');
// Critique Theater artifacts intentionally live outside the static
// `/artifacts` tree. The per-run artifact endpoint is the sanctioned
// read path so project-membership, size, and CSP guards cannot be bypassed.
const CRITIQUE_ARTIFACTS_DIR = path.join(RUNTIME_DATA_DIR, 'critique-artifacts');
const PROJECTS_DIR = path.join(RUNTIME_DATA_DIR, 'projects');
const USER_SKILLS_DIR = path.join(RUNTIME_DATA_DIR, 'skills');
const USER_DESIGN_SYSTEMS_DIR = path.join(RUNTIME_DATA_DIR, 'design-systems');
const PLUGIN_REGISTRY_ROOTS = registryRootsForDataDir(RUNTIME_DATA_DIR);
// Disk cache + same-origin proxy for external preview media (cross-border CDN
// images/videos referenced by plugin example.html). See plugin-asset-cache.ts.
const pluginAssetCache = createPluginAssetCache({
  cacheDir: path.join(RUNTIME_DATA_DIR, 'plugin-asset-cache'),
});
// User-imported design templates mirror USER_SKILLS_DIR but are scanned
// against DESIGN_TEMPLATES_DIR rather than SKILLS_DIR so the EntryView
// Templates surface and the Settings → Skills surface stay decoupled.
const USER_DESIGN_TEMPLATES_DIR = path.join(RUNTIME_DATA_DIR, 'design-templates');
// Multi-root tuples used everywhere the daemon resolves a skill / template
// id without knowing which surface it came from. SKILL_ROOTS drives
// Settings → Skills; DESIGN_TEMPLATE_ROOTS drives the EntryView Templates
// gallery; ALL_SKILL_LIKE_ROOTS spans both for chat run system-prompt
// composition and the orbit template resolver, where stored project ids
// can resolve to either root after the split.
const SKILL_ROOTS = [USER_SKILLS_DIR, SKILLS_DIR];
const DESIGN_TEMPLATE_ROOTS = [USER_DESIGN_TEMPLATES_DIR, DESIGN_TEMPLATES_DIR];
const ALL_SKILL_LIKE_ROOTS = [
  USER_SKILLS_DIR,
  USER_DESIGN_TEMPLATES_DIR,
  SKILLS_DIR,
  DESIGN_TEMPLATES_DIR,
];
fs.mkdirSync(PROJECTS_DIR, { recursive: true });
for (const dir of [USER_SKILLS_DIR, USER_DESIGN_SYSTEMS_DIR, USER_DESIGN_TEMPLATES_DIR, PLUGIN_REGISTRY_ROOTS.userPluginsRoot]) {
  fs.mkdirSync(dir, { recursive: true });
}
fs.mkdirSync(CRITIQUE_ARTIFACTS_DIR, { recursive: true });
const orbitService = new OrbitService(RUNTIME_DATA_DIR);
const designSystemGenerationJobs = createDesignSystemGenerationJobStore({
  root: USER_DESIGN_SYSTEMS_DIR,
});
let routineService = null;

// In-memory OAuth state cache. Lives for the daemon process's lifetime.
// Maps the OAuth `state` parameter we generated in /api/mcp/oauth/start
// to the verifier + endpoint info needed to finish the exchange when the
// browser hits /api/mcp/oauth/callback.
const mcpPendingAuth = new PendingAuthCache();

/**
 * Resolve the daemon's public base URL — the origin the user's browser
 * (or the OAuth provider) reaches us at. Order of precedence:
 *
 *   1. `OD_PUBLIC_BASE_URL` env var. Cloud and packaged-electron deployments
 *      set this to the externally-routable URL (e.g. `https://app.example.com`).
 *   2. `req.protocol://req.get('host')` from the inbound request. Works in
 *      local dev and most reverse-proxy setups (Express respects
 *      `trust proxy` so X-Forwarded-* headers are honored).
 *
 * The OAuth callback URI is derived from this — it MUST be reachable from
 * the user's browser, otherwise the redirect after auth lands on
 * ERR_CONNECTION_REFUSED. Misconfiguration is loud: the OAuth provider
 * will reject `redirect_uri` mismatches.
 */
function getPublicBaseUrl(req) {
  const env = process.env.OD_PUBLIC_BASE_URL;
  if (env && /^https?:\/\//i.test(env)) {
    return env.replace(/\/+$/u, '');
  }
  const proto = req.protocol || 'http';
  const host = req.get('host');
  if (!host) return `http://localhost:${process.env.OD_PORT ?? '7456'}`;
  return `${proto}://${host}`;
}

function mcpOAuthCallbackUrl(req) {
  return `${getPublicBaseUrl(req)}/api/mcp/oauth/callback`;
}

/**
 * Refresh an expired token using the OAuth client context that the original
 * authorization-code exchange persisted alongside the token. Refresh tokens
 * are bound (RFC 6749 §6) to the client that received them, so we MUST
 * refresh against the same `tokenEndpoint` / `clientId` / `clientSecret`
 * pair — re-running discovery with a different redirect URI would risk
 * registering a new client_id that the upstream then rejects the refresh
 * for. Tokens persisted before that context was recorded can't be safely
 * refreshed; the caller treats `null` as "needs reconnect".
 */
async function refreshAndPersistToken(dataDir, serverId, current) {
  if (!current.refreshToken) return null;
  if (!current.tokenEndpoint || !current.clientId) return null;
  const tokenResp = await refreshAccessToken({
    tokenEndpoint: current.tokenEndpoint,
    clientId: current.clientId,
    clientSecret: current.clientSecret,
    refreshToken: current.refreshToken,
    scope: current.scope,
    resource: current.resourceUrl,
  });
  const next = {
    accessToken: tokenResp.access_token,
    refreshToken: tokenResp.refresh_token ?? current.refreshToken,
    tokenType: tokenResp.token_type ?? 'Bearer',
    scope: tokenResp.scope ?? current.scope,
    expiresAt:
      typeof tokenResp.expires_in === 'number'
        ? Date.now() + tokenResp.expires_in * 1000
        : undefined,
    savedAt: Date.now(),
    tokenEndpoint: current.tokenEndpoint,
    clientId: current.clientId,
    clientSecret: current.clientSecret,
    authServerIssuer: current.authServerIssuer,
    redirectUri: current.redirectUri,
    resourceUrl: current.resourceUrl,
  };
  await setToken(dataDir, serverId, next);
  return next;
}

const activeChatAgentEventSinks = new Map();
const activeProjectEventSinks = new Map();
// Per-chat-run handles, keyed by runId. Lets non-stream side effects
// (live-artifact create, project events) reach back into the chat
// run's local state — currently used by the artifact quiet-period
// shortcut (#1451) so a successful artifact registration can shorten
// the inactivity watchdog without the chat path having to poll a
// store.
const activeChatRunHandles = new Map();

function emitChatAgentEvent(runId, payload) {
  const sink = activeChatAgentEventSinks.get(runId);
  if (!sink) return false;
  return sink(payload);
}

// Exported for tests covering the artifact quiet-period plumbing
// (#1451). The chat run path is a deep closure inside startServer, so
// pin the hook contract at the emit/handle boundary instead of
// driving a full fake-agent e2e for every invariant.
export const __forTestChatRunHandles = activeChatRunHandles;

export function __forTestEmitLiveArtifactEvent(
  grant: { runId?: string; projectId?: string },
  action: 'created' | 'updated' | 'deleted',
  artifact: { id: string; projectId?: string; title?: string; refreshStatus?: string },
) {
  return emitLiveArtifactEvent(grant, action, artifact);
}

function emitLiveArtifactEvent(grant, action, artifact) {
  if (!artifact?.id) return false;
  const payload = {
    type: 'live_artifact',
    action,
    projectId: artifact.projectId ?? grant.projectId,
    artifactId: artifact.id,
    title: artifact.title ?? artifact.id,
    refreshStatus: artifact.refreshStatus,
  };
  let emitted = emitProjectEvent(payload.projectId, payload);
  if (grant?.runId) emitted = emitChatAgentEvent(grant.runId, payload) || emitted;
  // After the deliverable exists, switch the chat run into a shorter
  // "quiet period" watchdog: agents sometimes keep their child process
  // alive after a successful artifact write (post-write reasoning, log
  // flushes, claude-code stream-json's idle stdin) and the 10-minute
  // default leaves the UI parked on Working until the watchdog fires
  // an unrelated "stalled" error. See #1451.
  if (action === 'created' && grant?.runId) {
    const handle = activeChatRunHandles.get(grant.runId);
    if (handle?.noteArtifactRegistered) {
      try { handle.noteArtifactRegistered(); } catch {}
    }
  }
  return emitted;
}

function emitLiveArtifactRefreshEvent(grant, payload) {
  if (!payload?.artifactId) return false;
  const event = {
    type: 'live_artifact_refresh',
    projectId: grant.projectId,
    ...payload,
  };
  let emitted = emitProjectEvent(grant.projectId, event);
  if (grant?.runId) emitted = emitChatAgentEvent(grant.runId, event) || emitted;
  return emitted;
}

// Broadcast an event to every SSE subscriber currently watching the given
// project's `/api/projects/:id/events` stream. The payload's `type` field
// becomes the SSE event name (see project-routes.ts). Used for live-artifact
// events and `conversation-created` events emitted by routine runs (#1361).
function emitProjectEvent(projectId, payload) {
  const sinks = activeProjectEventSinks.get(projectId);
  if (!sinks || sinks.size === 0) return false;
  for (const sink of Array.from(sinks)) {
    try {
      sink(payload);
    } catch {
      sinks.delete(sink);
    }
  }
  if (sinks.size === 0) activeProjectEventSinks.delete(projectId);
  return true;
}

// Windows ENAMETOOLONG mitigation constants
const CMD_BAT_RE = /\.(cmd|bat)$/i;
const PROMPT_TEMP_FILE = () =>
  '.od-prompt-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.md';
const promptFileBootstrap = (fp) =>
  `Your full instructions are stored in the file: ${fp.replace(/\\/g, '/')}. ` +
  'Open that file first and follow every instruction in it exactly — ' +
  'it contains the system prompt, design system, skill workflow, and user request. ' +
  'Do not begin your response until you have read the entire file.';

// Load Critique Theater config once at startup so a bad OD_CRITIQUE_* value
// surfaces immediately as a boot-time RangeError instead of silently at
// run time. Default: enabled=false (M0 dark launch).
const critiqueCfg = loadCritiqueConfigFromEnv();
// Per-run baselines of the project's artifact files, captured before the agent
// runs and diffed at run-finish to derive `artifact_count` agent-agnostically
// (see `run-artifact-fs.ts`). Keyed by run id because the run-start scope and
// the run-finished analytics scope are different closures. The registry also
// flags runs that overlapped another run in the same cwd as `contended`; those
// must not trust the whole-tree diff (it would cross-attribute writes) and fall
// back to the per-run tool-stream count.
const runArtifactBaselines = createRunArtifactBaselines();
// Tracks adapter streamFormat values that have already received a one-time
// warning explaining why the Critique Theater orchestrator was bypassed.
// Adapter denylist for orchestrator routing is implicit: anything that is
// not the 'plain' streamFormat falls through to legacy single-pass.
const critiqueWarnedAdapters = new Set<string>();

// In-process registry of in-flight critique runs so the interrupt endpoint
// can cascade an AbortController to the matching orchestrator invocation.
// Created once per process; not persisted across daemon restarts.
const critiqueRunRegistry = createRunRegistry();
export const SSE_KEEPALIVE_INTERVAL_MS = 25_000;

export function createAgentRuntimeEnv(
  baseEnv: NodeJS.ProcessEnv | Record<string, string | undefined>,
  daemonUrl: string,
  toolTokenGrant: { token?: string } | null = null,
  nodeBin: string = process.execPath,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = applySandboxRuntimeEnv(
    {
      ...baseEnv,
      OD_DATA_DIR: RUNTIME_DATA_DIR,
      OD_DAEMON_URL: daemonUrl,
      OD_NODE_BIN: nodeBin,
    },
    SANDBOX_RUNTIME,
  );
  const sidecarIpcPath = baseEnv[SIDECAR_ENV.IPC_PATH];
  if (typeof sidecarIpcPath === 'string' && sidecarIpcPath.length > 0) {
    env[SIDECAR_ENV.IPC_PATH] = sidecarIpcPath;
  }
  if (SANDBOX_RUNTIME.enabled) {
    const noProxy = mergeNoProxyWithLoopbackDefaults(env.NO_PROXY ?? env.no_proxy);
    if (noProxy) {
      env.NO_PROXY = noProxy;
      if (process.platform !== 'win32') env.no_proxy = noProxy;
    }
  }

  // Ensure the node binary directory is on PATH so agent sub-processes —
  // in particular npm .cmd shims on Windows that run `"node" script.js` —
  // can find the same node binary that runs the daemon even when the daemon
  // was launched with a full path to node and the directory was not on PATH.
  const nodeBinDir = path.dirname(nodeBin);
  if (nodeBinDir) {
    // On Windows, process.env spreads with the search path under 'Path' rather
    // than 'PATH'. Locate the key case-insensitively so we read and write the
    // same entry that child_process.spawn consults. If we blindly write a new
    // 'PATH' key alongside an existing 'Path', Node's case-insensitive env
    // de-duplication on Windows lets the new key win — dropping all inherited
    // directories (git, npm, agent shims, etc.) from the child's search path.
    const pathKey = Object.keys(env).find((k) => k.toLowerCase() === 'path') ?? 'PATH';
    const existingPath = typeof env[pathKey] === 'string' ? (env[pathKey] as string) : '';
    const parts = existingPath.split(path.delimiter).filter((p) => p.length > 0);
    const normalize = (p: string) => p.replace(/[/\\]+$/, '');
    const normalizedDir = normalize(nodeBinDir);
    const alreadyIncluded = parts.some((p) => {
      const n = normalize(p);
      return process.platform === 'win32'
        ? n.toLowerCase() === normalizedDir.toLowerCase()
        : n === normalizedDir;
    });
    if (!alreadyIncluded) {
      env[pathKey] = [nodeBinDir, ...parts].join(path.delimiter);
    }
  }

  if (toolTokenGrant?.token) {
    env.OD_TOOL_TOKEN = toolTokenGrant.token;
  } else {
    delete env.OD_TOOL_TOKEN;
  }

  return env;
}

export function createAgentRuntimeToolPrompt(
  daemonUrl: string,
  toolTokenGrant: { token?: string } | null = null,
): string {
  const tokenLine = toolTokenGrant?.token
    ? '- `OD_TOOL_TOKEN` is available in your environment for this run. Use it only through project wrapper commands; do not print, persist, or override it.'
    : '- `OD_TOOL_TOKEN` is not available for this run, so `/api/tools/*` wrapper commands may be unavailable.';

  return [
    '## Runtime tool environment',
    '',
    `- Daemon URL: \`${daemonUrl}\` (also available as \`OD_DAEMON_URL\`).`,
    '- `OD_NODE_BIN` is the absolute path to the Node-compatible runtime that started the daemon; packaged desktop installs provide this even when the user has no system `node` on PATH.',
    '- `OD_BIN` is the absolute path to the Open Design CLI script. On POSIX shells run wrappers with `"$OD_NODE_BIN" "$OD_BIN" tools ...`; do not call bare `od`, which may resolve to the system octal-dump command on Unix-like systems.',
    '- On PowerShell use `& $env:OD_NODE_BIN $env:OD_BIN tools ...`; on cmd.exe use `"%OD_NODE_BIN%" "%OD_BIN%" tools ...`.',
    tokenLine,
    '- Prefer project wrapper commands through `OD_NODE_BIN` + `OD_BIN` over raw HTTP. The wrappers read these environment values automatically.',
  ].join('\n');
}

const WORKSPACE_CONTEXT_KINDS = new Set([
  'design-files',
  'design-system',
  'file',
  'folder',
  'browser',
  'terminal',
  'side-chat',
  'live-artifact',
]);

function normalizeWorkspaceContextItems(items) {
  if (!Array.isArray(items)) return [];
  const out = [];
  const seen = new Set();
  const cleanString = (value, max = 500) => {
    if (typeof value !== 'string') return '';
    return value.trim().slice(0, max);
  };
  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const kind = cleanString(record.kind, 64);
    if (!WORKSPACE_CONTEXT_KINDS.has(kind)) continue;
    const id = cleanString(record.id, 240);
    const label = cleanString(record.label, 240);
    if (!id || !label) continue;
    const dedupeKey = `${kind}:${id}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    const normalized: Record<string, string> = { id, kind, label };
    const tabId = cleanString(record.tabId, 240);
    const pathValue = cleanString(record.path, 500);
    const absolutePath = cleanString(record.absolutePath, 1000);
    const url = cleanString(record.url, 1000);
    const title = cleanString(record.title, 500);
    if (tabId) normalized.tabId = tabId;
    if (pathValue) normalized.path = pathValue;
    if (absolutePath) normalized.absolutePath = absolutePath;
    if (url) normalized.url = url;
    if (title) normalized.title = title;
    out.push(normalized);
  }
  return out;
}

function normalizeRunContextSelection(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const stringList = (items) => {
    if (!Array.isArray(items)) return [];
    const out = [];
    const seen = new Set();
    for (const item of items) {
      if (typeof item !== 'string') continue;
      const trimmed = item.trim();
      if (!trimmed || seen.has(trimmed)) continue;
      seen.add(trimmed);
      out.push(trimmed);
    }
    return out;
  };
  return {
    skillIds: stringList(value.skillIds),
    pluginIds: stringList(value.pluginIds),
    mcpServerIds: stringList(value.mcpServerIds),
    connectorIds: stringList(value.connectorIds),
    workspaceItems: normalizeWorkspaceContextItems(value.workspaceItems),
  };
}

function mergeRunContextSelections(...contexts) {
  const merged = { skillIds: [], pluginIds: [], mcpServerIds: [], connectorIds: [], workspaceItems: [] };
  const listKeys = ['skillIds', 'pluginIds', 'mcpServerIds', 'connectorIds'];
  const workspaceSeen = new Set();
  for (const context of contexts) {
    const normalized = normalizeRunContextSelection(context);
    for (const key of listKeys) {
      const seen = new Set(merged[key]);
      for (const id of normalized[key] ?? []) {
        if (!seen.has(id)) {
          seen.add(id);
          merged[key].push(id);
        }
      }
    }
    for (const item of normalized.workspaceItems ?? []) {
      const key = `${item.kind}:${item.id}`;
      if (workspaceSeen.has(key)) continue;
      workspaceSeen.add(key);
      merged.workspaceItems.push(item);
    }
  }
  return Object.fromEntries(
    Object.entries(merged).filter(([, ids]) => ids.length > 0),
  );
}

function projectMetadataContextSelection(metadata) {
  if (!metadata || typeof metadata !== 'object') return {};
  return {
    pluginIds: Array.isArray(metadata.contextPlugins)
      ? metadata.contextPlugins.map((item) => item?.id).filter((id) => typeof id === 'string')
      : [],
    mcpServerIds: Array.isArray(metadata.contextMcpServers)
      ? metadata.contextMcpServers.map((item) => item?.id).filter((id) => typeof id === 'string')
      : [],
    connectorIds: Array.isArray(metadata.contextConnectors)
      ? metadata.contextConnectors.map((item) => item?.id).filter((id) => typeof id === 'string')
      : [],
  };
}

function formatContextRefList(ids, refs, titleKey = 'title') {
  const byId = new Map();
  if (Array.isArray(refs)) {
    for (const ref of refs) {
      if (ref && typeof ref.id === 'string') byId.set(ref.id, ref);
    }
  }
  return ids
    .map((id) => {
      const ref = byId.get(id);
      const label =
        typeof ref?.[titleKey] === 'string' && ref[titleKey].trim()
          ? ref[titleKey].trim()
          : typeof ref?.label === 'string' && ref.label.trim()
            ? ref.label.trim()
            : typeof ref?.name === 'string' && ref.name.trim()
              ? ref.name.trim()
              : id;
      const meta = [
        ref?.provider,
        ref?.transport,
        ref?.status,
        ref?.accountLabel,
      ].filter((value) => typeof value === 'string' && value.trim()).join(' · ');
      return `- ${label} (\`${id}\`)${meta ? ` — ${meta}` : ''}`;
    })
    .join('\n');
}

function formatWorkspaceContextList(items) {
  if (!Array.isArray(items)) return '';
  return items
    .map((item, index) => {
      const details = [
        item.path ? `path: \`${item.path}\`` : null,
        item.absolutePath ? `absolute: \`${item.absolutePath}\`` : null,
        item.url ? `url: ${item.url}` : null,
        item.title ? `title: ${item.title}` : null,
        item.tabId ? `tab: \`${item.tabId}\`` : null,
      ].filter(Boolean).join(' | ');
      return `${index + 1}. ${item.kind}: ${item.label} (\`${item.id}\`)${details ? ` — ${details}` : ''}`;
    })
    .join('\n');
}

function renderWorkspaceContextToolHints(items) {
  if (!Array.isArray(items) || items.length === 0) return '';
  const kinds = new Set(items.map((item) => item?.kind).filter(Boolean));
  const hints = [];
  if (kinds.has('browser')) {
    hints.push(
      '- Browser tabs: use the selected browser tab URL/title as the target for requests about logos, fonts, images, colors, motion code, element/page screenshots, accessibility, OG/meta tags, or page structure. Prefer mounted browser automation / browser-use style tools when available (DOM snapshot, page screenshot, element screenshot, accessibility tree, evaluated JavaScript). If only URL/title context is available and no inspection tool is mounted, say that explicitly and do not invent page internals.',
    );
  }
  if (kinds.has('terminal')) {
    hints.push(
      '- Terminal tabs: treat the selected terminal tab as the target shell/session. If the exact scrollback is not included in the prompt, run safe project-local read-only commands or ask for the terminal transcript instead of guessing hidden output.',
    );
  }
  if (kinds.has('file') || kinds.has('folder') || kinds.has('design-files')) {
    hints.push(
      '- File and Design Files tabs: use project-relative paths exactly as shown. Read before editing, and keep generated screenshots/briefs/assets in Design Files when the user asks to capture or extract references.',
    );
  }
  if (kinds.has('live-artifact')) {
    hints.push(
      '- Live artifact tabs: treat the selected live artifact as the preview target. Inspect or modify its source files rather than editing generated runtime output when possible.',
    );
  }
  return hints.join('\n');
}

function renderRunContextPrompt(selection, metadata) {
  const context = mergeRunContextSelections(projectMetadataContextSelection(metadata), selection);
  const lines = [];
  if (Array.isArray(context.workspaceItems) && context.workspaceItems.length > 0) {
    lines.push('### Active workspace context');
    lines.push(
      'The user did not manually choose this context; Open Design selected the currently focused workspace tab. Use it as the default target for phrases like "this", "current", "the browser", "the terminal", or "that file" unless the user says otherwise. Use project-relative paths exactly when reading or editing project files.',
    );
    lines.push(formatWorkspaceContextList(context.workspaceItems));
    const toolHints = renderWorkspaceContextToolHints(context.workspaceItems);
    if (toolHints) lines.push(toolHints);
  }
  if (Array.isArray(context.pluginIds) && context.pluginIds.length > 0) {
    lines.push('### Selected plugins');
    lines.push(
      'The user selected these plugins as run context. When an active plugin snapshot is pinned, follow that executable plugin block; otherwise combine these plugins as requested references.',
    );
    lines.push(formatContextRefList(context.pluginIds, metadata?.contextPlugins ?? [], 'title'));
  }
  if (Array.isArray(context.mcpServerIds) && context.mcpServerIds.length > 0) {
    lines.push('### Selected MCP servers');
    lines.push(
      'The user selected these MCP servers for this run. Prefer their tools when they are mounted and relevant before asking where data should come from.',
    );
    lines.push(formatContextRefList(context.mcpServerIds, metadata?.contextMcpServers ?? [], 'label'));
  }
  if (Array.isArray(context.connectorIds) && context.connectorIds.length > 0) {
    lines.push('### Selected connectors');
    lines.push(
      'The user selected these connectors for this run. Discover available read-only connector tools first with `"$OD_NODE_BIN" "$OD_BIN" tools connectors list --format compact`, then execute relevant tools through `tools connectors execute`; do not ask for a data source that is already selected.',
    );
    lines.push(formatContextRefList(context.connectorIds, metadata?.contextConnectors ?? [], 'name'));
  }
  if (lines.length === 0) return '';
  return ['## Selected run context', ...lines].join('\n');
}

export function normalizeProjectDisplayStatus(status) {
  return status === 'starting' || status === 'queued' ? 'running' : status;
}

export function composeProjectDisplayStatus(
  baseStatus,
  awaitingInputProjects,
  projectId,
) {
  if (
    baseStatus.value === 'succeeded' &&
    awaitingInputProjects.has(projectId)
  ) {
    return { ...baseStatus, value: 'awaiting_input' };
  }
  return {
    ...baseStatus,
    value: normalizeProjectDisplayStatus(baseStatus.value),
  };
}

/**
 * @param {ApiErrorCode} code
 * @param {string} message
 * @param {Omit<ApiError, 'code' | 'message'>} [init]
 * @returns {ApiError}
 */
function execFileBuffered(command, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(command, args, { timeout: 120_000, maxBuffer: 1024 * 1024, ...opts }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        code: error?.code,
        stdout: String(stdout ?? '').trim(),
        stderr: String(stderr ?? '').trim(),
        error,
      });
    });
  });
}

function quotePosixShellArg(value) {
  const text = String(value ?? '');
  return `'${text.replace(/'/g, `'\\''`)}'`;
}

function buildGhShellCommand(args) {
  return ['gh', ...args].map(quotePosixShellArg).join(' ');
}

function buildCommandShellCommand(command, args) {
  return [command, ...args].map(quotePosixShellArg).join(' ');
}

function buildLoginShellCommand(innerCommand) {
  // Use a non-login shell and re-export PATH so test fakes and agent wrappers
  // remain visible; login shells often reset PATH from profile scripts.
  return `export PATH=${quotePosixShellArg(process.env.PATH ?? '')}; ${innerCommand}`;
}

function execGhBuffered(args, opts = {}) {
  if (process.platform === 'win32') return execFileBuffered('gh', args, opts);
  const shell = process.env.SHELL && process.env.SHELL.trim() ? process.env.SHELL.trim() : '/bin/zsh';
  return execFileBuffered(shell, ['-c', buildLoginShellCommand(buildGhShellCommand(args))], {
    env: process.env,
    ...opts,
  });
}

function execCommandViaLoginShell(command, args, opts = {}) {
  if (process.platform === 'win32') return execFileBuffered(command, args, opts);
  const shell = process.env.SHELL && process.env.SHELL.trim() ? process.env.SHELL.trim() : '/bin/zsh';
  return execFileBuffered(shell, ['-c', buildLoginShellCommand(buildCommandShellCommand(command, args))], {
    env: process.env,
    ...opts,
  });
}

async function readProjectPluginManifest(folder) {
  const raw = await fs.promises.readFile(path.join(folder, 'open-design.json'), 'utf8');
  const manifest = JSON.parse(raw);
  const name = typeof manifest.name === 'string' && manifest.name.trim()
    ? manifest.name.trim()
    : path.basename(folder);
  if (/[/\\]/.test(name) || /^\.+$/.test(name)) {
    throw new Error(
      `open-design.json in ${folder}: name "${name}" must not contain path separators or consist only of dots`,
    );
  }
  return {
    name,
    title: typeof manifest.title === 'string' ? manifest.title : name,
    version: typeof manifest.version === 'string' ? manifest.version : '0.1.0',
    manifest,
  };
}

export const __forTestReadProjectPluginManifest = readProjectPluginManifest;

function resolveRunProjectKindForAnalytics({
  hintProjectKind,
  projectMetadata,
}) {
  if (typeof hintProjectKind === 'string') return hintProjectKind;
  if (projectMetadata?.importedFrom === 'design-system') return 'design_system';
  // Pass videoModel so a HyperFrames project (kind=video + videoModel=
  // hyperframes-html) is reported as project_kind=hyperframes, not generic
  // video. The web-supplied `hintProjectKind` already encodes this when set.
  return projectKindToTracking(projectMetadata?.kind, projectMetadata?.videoModel);
}

export function __forTestResolveRunProjectKindForAnalytics(args) {
  return resolveRunProjectKindForAnalytics(args);
}

// Scans run.events newest→oldest to extract usage token counts and the
// agent-reported model name. The scan must not short-circuit on usage
// before reaching the model signal: usage is a terminal event while
// status:initializing/model is emitted at the very start of the run, so
// in reverse iteration usage is seen first. The loop continues until both
// usage tokens are found AND (the caller already has a model from reqBody
// OR the agent-reported model has been found).
function scanRunEventsForFinishedProps(events, reqBodyModel) {
  const usage = scanRunEventsForUsageAnalytics(events, reqBodyModel, 0);
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    agentReportedModel: usage.agent_reported_model,
  };
}

export function __forTestScanRunEventsForFinishedProps(events, reqBodyModel) {
  return scanRunEventsForFinishedProps(events, reqBodyModel);
}

function scanRunEventsForRetrySideEffects(events) {
  const sideEffects = {
    userVisibleOutputSeen: false,
    toolCallSeen: false,
    artifactWriteSeen: false,
    liveArtifactSeen: false,
  };
  for (const rec of Array.isArray(events) ? events : []) {
    if (rec?.event === 'stdout') {
      const chunk = rec.data?.chunk;
      if (typeof chunk === 'string' ? chunk.length > 0 : chunk !== undefined) {
        sideEffects.userVisibleOutputSeen = true;
      }
    }
    const data = rec?.data;
    if (!data || typeof data !== 'object') continue;
    if (data.type === 'text_delta' || data.type === 'thinking_delta') {
      const delta = typeof data.delta === 'string' ? data.delta : '';
      if (delta.length > 0) sideEffects.userVisibleOutputSeen = true;
    }
    if (data.type === 'tool_use') sideEffects.toolCallSeen = true;
    if (data.type === 'artifact') sideEffects.artifactWriteSeen = true;
    if (data.type === 'live_artifact' || rec.event === 'live_artifact') {
      sideEffects.liveArtifactSeen = true;
    }
  }
  if (
    countNewArtifacts(events) > 0 ||
    didRunCreateDesignSystemFile(events) ||
    countDesignSystemPreviewModules(events) > 0
  ) {
    sideEffects.artifactWriteSeen = true;
  }
  return sideEffects;
}

export function __forTestScanRunEventsForRetrySideEffects(events) {
  return scanRunEventsForRetrySideEffects(events);
}

function retryFinalResultForRunStatus(status, retryAttemptCount) {
  const result = runResultFromStatus(status);
  if ((retryAttemptCount ?? 0) <= 0) {
    return result === 'failed' ? 'suppressed' : 'not_attempted';
  }
  if (result === 'success') return 'success';
  if (result === 'failed') return 'failed';
  return 'suppressed';
}

export function __forTestRetryFinalResultForRunStatus(status, retryAttemptCount) {
  return retryFinalResultForRunStatus(status, retryAttemptCount);
}

function runRetryEventsForAnalytics(events) {
  return (Array.isArray(events) ? events : []).filter((rec) =>
    rec?.event === 'run_retry_attempted' || rec?.event === 'run_retry_finished'
  );
}

export function __forTestRunRetryEventsForAnalytics(events) {
  return runRetryEventsForAnalytics(events);
}

function githubRepoNameFromPluginName(name) {
  const slug = String(name)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/(^[-._]+|[-._]+$)/g, '');
  return slug || 'open-design-plugin';
}

const PLUGIN_SHARE_ACTION_LABELS = {
  'publish-github': 'Publish to GitHub',
  'contribute-open-design': 'Contribute to Open Design',
};

const USER_PLUGIN_SOURCE_KINDS = new Set([
  'user',
  'project',
  'marketplace',
  'github',
  'url',
  'local',
]);

const PLUGIN_CONTEXT_SKIP_DIRS = new Set([
  '.git',
  '.next',
  '.nuxt',
  '.od',
  '.output',
  '.tmp',
  '.turbo',
  '.venv',
  '__pycache__',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'target',
  'vendor',
]);

const PLUGIN_CONTEXT_SKIP_FILES = new Set([
  '.DS_Store',
  'Thumbs.db',
]);

function normalizePluginShareAction(input) {
  const value = typeof input === 'string' ? input.trim() : '';
  return Object.prototype.hasOwnProperty.call(PLUGIN_SHARE_ACTION_PLUGIN_IDS, value)
    ? value
    : null;
}

function renderPluginSharePrompt({ action, sourcePlugin, stagedPath }) {
  const title = sourcePlugin.title || sourcePlugin.id;
  if (action === 'publish-github') {
    return [
      `Publish the local Open Design plugin "${title}" as a new public GitHub repository.`,
      '',
      `The plugin source files have been copied into this project at \`${stagedPath}\`.`,
      'Use the local daemon share endpoint so the publish flow runs through Open Design\'s validated GitHub path:',
      '',
      '```bash',
      `curl -sS -X POST "$OD_DAEMON_URL/api/projects/$OD_PROJECT_ID/plugins/publish-github" \\`,
      `  -H 'content-type: application/json' \\`,
      `  -d '${JSON.stringify({ path: stagedPath })}'`,
      '```',
      '',
      'Read the JSON response. If `ok` is true, report the final repository URL and any validation/log summary. If it fails, report the `message`, `code`, and the useful log lines. The endpoint checks `gh` auth and performs the repository creation; do not hand-roll a second GitHub flow unless you are explaining a daemon endpoint failure.',
      '',
      'Do not rewrite the plugin unless publishing requires a small metadata fix. If you make any fix, explain it before publishing.',
    ].join('\n');
  }
  return [
    `Open a pull request to add the local Open Design plugin "${title}" to the Open Design repository.`,
    '',
    `The plugin source files have been copied into this project at \`${stagedPath}\`.`,
    'Use the local daemon share endpoint so the contribution flow runs through Open Design\'s validated GitHub path:',
    '',
    '```bash',
    `curl -sS -X POST "$OD_DAEMON_URL/api/projects/$OD_PROJECT_ID/plugins/contribute-open-design" \\`,
    `  -H 'content-type: application/json' \\`,
    `  -d '${JSON.stringify({ path: stagedPath })}'`,
    '```',
    '',
    'Read the JSON response. If `ok` is true, report the PR URL, branch, and any validation/log summary. If it fails, report the `message`, `code`, and the useful log lines. The endpoint checks `gh` auth, forks/clones, pushes, and opens the PR; do not hand-roll a second GitHub flow unless you are explaining a daemon endpoint failure.',
    '',
    'Keep the PR focused on this plugin. Report the PR URL and any validation you ran.',
  ].join('\n');
}

async function copyPluginFolderForProjectContext(sourceRoot, destRoot) {
  const rootReal = await fs.promises.realpath(sourceRoot);
  const stat = await fs.promises.stat(rootReal);
  if (!stat.isDirectory()) {
    const err = new Error('plugin source path is not a directory');
    err.code = 'ENOTDIR';
    throw err;
  }
  await copyPluginContextDir(rootReal, destRoot, rootReal);
}

async function copyPluginContextDir(src, dest, rootReal) {
  await fs.promises.mkdir(dest, { recursive: true });
  const entries = await fs.promises.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    if (shouldSkipPluginContextEntry(entry.name)) continue;
    if (entry.isSymbolicLink()) continue;

    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      const childReal = await fs.promises.realpath(from).catch(() => null);
      if (!childReal || (childReal !== rootReal && !childReal.startsWith(rootReal + path.sep))) {
        continue;
      }
      await copyPluginContextDir(childReal, to, rootReal);
      continue;
    }
    if (!entry.isFile()) continue;
    await fs.promises.mkdir(path.dirname(to), { recursive: true });
    await fs.promises.copyFile(from, to);
  }
}

function shouldSkipPluginContextEntry(name) {
  return PLUGIN_CONTEXT_SKIP_DIRS.has(name) || PLUGIN_CONTEXT_SKIP_FILES.has(name);
}

export function selectPromptImagePaths(
  agentId,
  safeImages,
  amrStagedImages,
) {
  return agentId === 'amr' ? amrStagedImages : safeImages;
}

async function ensureGhReady() {
  const version = await execGhBuffered(['--version'], { timeout: 10_000 });
  if (!version.ok) {
    return {
      ok: false,
      code: 'gh-not-installed',
      message: 'GitHub CLI is not installed. Install it, then click this action again.',
      url: 'https://cli.github.com/',
      log: [version.stderr || version.stdout || 'gh --version failed'],
    };
  }
  const auth = await execGhBuffered(['auth', 'status', '--hostname', 'github.com'], { timeout: 10_000 });
  if (!auth.ok) {
    return {
      ok: false,
      code: 'gh-not-authenticated',
      message: 'GitHub CLI is installed but not authenticated. Run `gh auth login --web`, finish browser authorization, then click this action again.',
      url: 'https://github.com/login/device',
      log: [auth.stderr || auth.stdout || 'gh auth status failed'],
    };
  }
  return { ok: true, log: [version.stdout, auth.stderr || auth.stdout].filter(Boolean) };
}

const TERMINAL_RUN_STATUSES = new Set(['succeeded', 'failed', 'canceled']);
const LANGFUSE_TERMINAL_FALLBACK_DELAY_MS = 15_000;

function reconcileAssistantMessageOnRunEnd(db, runs, run) {
  if (!run.assistantMessageId) return;
  void runs
    .wait(run)
    .then((finalStatus) => {
      db.prepare(
        `UPDATE messages
            SET run_status = ?, ended_at = COALESCE(ended_at, ?)
          WHERE id = ? AND run_status IN ('queued', 'running')`,
      ).run(finalStatus.status, Date.now(), run.assistantMessageId);
    })
    .catch((err) => {
      console.warn('[runs] message reconciliation failed', err);
    });
}


function isPluginAuthoringRun(db, run) {
  if (run?.pluginId === 'od-plugin-authoring') return true;
  if (
    typeof run?.appliedPluginSnapshotId === 'string'
    && run.appliedPluginSnapshotId.length > 0
  ) {
    const snapshot = getSnapshot(db, run.appliedPluginSnapshotId);
    return snapshot?.pluginId === 'od-plugin-authoring';
  }
  return false;
}

async function hasGeneratedPluginArtifacts(projectRoot) {
  if (!projectRoot || typeof projectRoot !== 'string') return false;
  const required = [
    path.join(projectRoot, 'generated-plugin', 'open-design.json'),
    path.join(projectRoot, 'generated-plugin', 'SKILL.md'),
  ];
  try {
    await Promise.all(required.map((file) => fs.promises.access(file, fs.constants.F_OK)));
    return true;
  } catch {
    return false;
  }
}

// Renderable `<question-form>`/`<ask-question>` detection now lives in
// `./question-form-detect.ts` so the missing-artifacts guard, awaiting-input
// status, and run analytics all share ONE renderable-form check. See
// `emittedRenderableQuestionForm` imported above.

function assistantMessageEmittedQuestionForm(db, assistantMessageId) {
  if (!assistantMessageId) return false;
  const row = db.prepare(`SELECT content FROM messages WHERE id = ?`).get(assistantMessageId);
  return emittedRenderableQuestionForm(row?.content);
}

function deferredSkillPluginCandidateForRun(db, run) {
  if (!run.projectId || !run.conversationId) return null;
  return listSkillPluginCandidates(db, run.projectId)
    .find((candidate) =>
      candidate.status !== 'dismissed' &&
      !candidate.assistantMessageId &&
      candidate.conversationId === run.conversationId,
    ) ?? null;
}

export function detectSkillPluginCandidateOnRunSuccess(db, runs, run, input, projectRoot) {
  if (!run.projectId || !run.conversationId) return;
  void runs
    .wait(run)
    .then(async (finalStatus) => {
      if (finalStatus.status !== 'succeeded') return;
      const pausedForQuestion = assistantMessageEmittedQuestionForm(db, run.assistantMessageId);
      const detected = await detectSkillPluginCandidate({
        projectId: run.projectId,
        runId: run.id,
        conversationId: run.conversationId,
        assistantMessageId: null,
        message: input?.message ?? input?.currentPrompt,
        attachments: input?.attachments,
        projectRoot,
      });
      const candidate = detected ? insertSkillPluginCandidate(db, detected) : null;
      if (pausedForQuestion) return;
      const candidateToShow = candidate ?? deferredSkillPluginCandidateForRun(db, run);
      if (!candidateToShow || candidateToShow.status === 'dismissed') return;
      upsertSkillPluginCandidateAssistantMessage(db, run, candidateToShow);
    })
    .catch((err) => {
      console.warn('[plugins] skill candidate detection failed', err);
    });
}

export function upsertSkillPluginCandidateAssistantMessage(db, run, candidate) {
  const currentMessagePosition = run.assistantMessageId
    ? (db.prepare(`SELECT position FROM messages WHERE id = ?`).get(run.assistantMessageId)?.position ?? null)
    : null;
  const existingMessagePosition = candidate.assistantMessageId
    ? (db.prepare(`SELECT position FROM messages WHERE id = ?`).get(candidate.assistantMessageId)?.position ?? null)
    : null;
  if (
    typeof currentMessagePosition === 'number' &&
    typeof existingMessagePosition === 'number' &&
    existingMessagePosition > currentMessagePosition
  ) {
    return null;
  }
  const canReuseExistingMessage =
    candidate.assistantMessageId &&
    candidate.assistantMessageId !== run.assistantMessageId &&
    typeof existingMessagePosition === 'number';
  const messageId = canReuseExistingMessage ? candidate.assistantMessageId : randomUUID();
  const shouldMoveReusedMessage =
    canReuseExistingMessage &&
    typeof currentMessagePosition === 'number' &&
    typeof existingMessagePosition === 'number' &&
    existingMessagePosition <= currentMessagePosition;
  if (
    candidate.assistantMessageId &&
    candidate.assistantMessageId !== messageId &&
    candidate.assistantMessageId !== run.assistantMessageId
  ) {
    db.prepare(`DELETE FROM messages WHERE id = ?`).run(candidate.assistantMessageId);
  }
  const now = Date.now();
  upsertMessage(db, run.conversationId, {
    id: messageId,
    role: 'assistant',
    content: `Open Design found reusable skill material that can become a plugin: ${candidate.title}`,
    agentId: run.agentId ?? undefined,
    events: [{
      kind: 'plugin_candidate',
      candidateId: candidate.id,
      title: candidate.title,
      description: candidate.description,
      confidence: candidate.confidence,
      draftPath: candidate.draftPath ?? null,
    }],
    createdAt: now,
    endedAt: now,
  });
  if (shouldMoveReusedMessage) {
    const max = db
      .prepare(`SELECT COALESCE(MAX(position), -1) AS m FROM messages WHERE conversation_id = ?`)
      .get(run.conversationId)?.m ?? -1;
    db.prepare(`UPDATE messages SET position = ? WHERE id = ?`).run(Number(max) + 1, messageId);
  }
  db.prepare(
    `UPDATE skill_plugin_candidates
        SET assistant_message_id = ?, updated_at = ?
      WHERE id = ?`,
  ).run(messageId, now, candidate.id);
  return messageId;
}

function persistRunEventToAssistantMessage(db, run, event, data) {
  if (!run.assistantMessageId) return;
  const persisted = runSseEventToPersistedAgentEvent(event, data);
  if (!persisted) return;
  try {
    appendMessageAgentEvent(db, run.assistantMessageId, persisted);
  } catch (err) {
    console.warn('[runs] message event persistence failed', err);
  }
}

function runSseEventToPersistedAgentEvent(event, data) {
  if (event === 'start') {
    return {
      kind: 'status',
      label: 'starting',
      ...(typeof data?.bin === 'string' ? { detail: data.bin } : {}),
    };
  }
  if (event === 'stdout') {
    const chunk = typeof data?.chunk === 'string' ? data.chunk : '';
    return chunk ? { kind: 'text', text: chunk } : null;
  }
  if (event === 'error') {
    const message = typeof data?.error?.message === 'string'
      ? data.error.message
      : typeof data?.message === 'string'
        ? data.message
        : '';
    return {
      kind: 'status',
      label: 'error',
      ...(message ? { detail: message } : {}),
    };
  }
  if (event !== 'agent') return null;
  return daemonAgentPayloadToPersistedAgentEvent(data);
}

function daemonAgentPayloadToPersistedAgentEvent(data) {
  const type = data?.type;
  if (type === 'status' && typeof data.label === 'string') {
    const detail =
      typeof data.detail === 'string'
        ? data.detail
        : typeof data.model === 'string'
          ? data.model
          : typeof data.ttftMs === 'number'
            ? `first token in ${Math.round(data.ttftMs / 100) / 10}s`
            : undefined;
    return { kind: 'status', label: data.label, ...(detail ? { detail } : {}) };
  }
  if (type === 'text_delta' && typeof data.delta === 'string') {
    return { kind: 'text', text: data.delta };
  }
  if (type === 'conversation_title' && typeof data.title === 'string') {
    return { kind: 'conversation_title', title: data.title };
  }
  if (type === 'thinking_delta' && typeof data.delta === 'string') {
    return { kind: 'thinking', text: data.delta };
  }
  if (type === 'thinking_start') return { kind: 'status', label: 'thinking' };
  if (type === 'live_artifact') {
    return {
      kind: 'live_artifact',
      action: data.action,
      projectId: data.projectId,
      artifactId: data.artifactId,
      title: data.title,
      ...(data.refreshStatus ? { refreshStatus: data.refreshStatus } : {}),
    };
  }
  if (type === 'live_artifact_refresh') {
    return {
      kind: 'live_artifact_refresh',
      phase: data.phase,
      projectId: data.projectId,
      artifactId: data.artifactId,
      ...(data.refreshId ? { refreshId: data.refreshId } : {}),
      ...(data.title ? { title: data.title } : {}),
      ...(typeof data.refreshedSourceCount === 'number'
        ? { refreshedSourceCount: data.refreshedSourceCount }
        : {}),
      ...(data.error ? { error: data.error } : {}),
    };
  }
  if (type === 'tool_use' && typeof data.id === 'string' && typeof data.name === 'string') {
    return { kind: 'tool_use', id: data.id, name: data.name, input: normalizePersistedToolInput(data.input) };
  }
  // Live-only incremental tool-input fragments are for real-time display only.
  // Returning null skips persistence so history replay isn't polluted with
  // mid-token JSON shards; the full `tool_use` above is the persisted record.
  if (type === 'tool_input_delta') return null;
  if (type === 'tool_result' && typeof data.toolUseId === 'string') {
    return {
      kind: 'tool_result',
      toolUseId: data.toolUseId,
      content: String(data.content ?? ''),
      isError: Boolean(data.isError),
    };
  }
  if (type === 'usage') {
    const usage = data.usage && typeof data.usage === 'object' ? data.usage : {};
    return {
      kind: 'usage',
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      ...(typeof data.costUsd === 'number' ? { costUsd: data.costUsd } : {}),
      ...(typeof data.durationMs === 'number' ? { durationMs: data.durationMs } : {}),
    };
  }
  if (type === 'fabricated_role_marker' && typeof data.marker === 'string') {
    return {
      kind: 'status',
      label: 'warning',
      detail: `Model emitted fabricated role marker ("${data.marker}"). Response was truncated at this point to prevent unauthorized instruction injection. See issue #3247.`,
    };
  }
  if (type === 'raw' && typeof data.line === 'string') return { kind: 'raw', line: data.line };
  return null;
}

function normalizePersistedToolInput(input) {
  if (!input || typeof input !== 'object') return input;
  if ('filePath' in input && typeof input.filePath === 'string') {
    return { ...input, file_path: input.filePath };
  }
  return input;
}

function pinAssistantMessageOnRunCreate(db, run) {
  if (!run.conversationId || !run.assistantMessageId) return;
  const existing = db
    .prepare(`SELECT id FROM messages WHERE id = ?`)
    .get(run.assistantMessageId);
  if (existing) {
    db.prepare(
      `UPDATE messages
          SET run_id = ?,
              run_status = CASE
                WHEN run_status IN ('succeeded', 'failed', 'canceled') THEN run_status
                ELSE ?
              END,
              started_at = COALESCE(started_at, ?)
        WHERE id = ?`,
    ).run(run.id, run.status, run.createdAt, run.assistantMessageId);
    return;
  }
  upsertMessage(db, run.conversationId, {
    id: run.assistantMessageId,
    role: 'assistant',
    content: '',
    agentId: run.agentId ?? undefined,
    events: [],
    runId: run.id,
    runStatus: run.status,
    startedAt: run.createdAt,
  });
}

export function shouldReportRunCompletedFromMessage(saved, body = {}) {
  return Boolean(
    saved &&
      saved.runId &&
      typeof saved.runStatus === 'string' &&
      TERMINAL_RUN_STATUSES.has(saved.runStatus) &&
      body?.telemetryFinalized === true,
  );
}

export function telemetryPromptFromRunRequest(message, currentPrompt) {
  return typeof currentPrompt === 'string' ? currentPrompt : message;
}

const FORM_ANSWERS_HEADER_RE = /^\s*\[form answers\s+(?:\u2014|-)\s*([^\]\r\n]+)\]/i;

// Aggressive OVERRIDE for weak / medium-strength plain agents (e.g.
// GPT-OSS-120B Medium, Gemini 3.5 Flash) that otherwise echo RULE 1's
// fenced form example back at the user on follow-up turns even when
// they correctly understand the form is answered. Strong models
// (Claude Sonnet 4.6, Gemini 3.1 Pro) already handle a shorter
// OVERRIDE; enumerating the anti-patterns is a no-op for them and a
// strong suppressor for the weaker ones. RULE 1 itself stays in the
// system prompt so turn 1 can still emit a valid form.
//
// Exported so tests pin both the trigger condition and the literal
// anti-patterns we ask the model to skip \u2014 silently weakening the
// list (e.g. dropping the markdown-fence ban) would reintroduce the
// form-echo regression on GPT-OSS / Gemini Flash.
export const FORM_ANSWERED_SYSTEM_OVERRIDE = `## OVERRIDE \u2014 form already answered (this is turn 2 or later)

The user already submitted their form answers (see # User request below).
RULE 1 documents the turn-1 ask flow; that flow is finished. Treat RULE 1
as read-only documentation for this turn \u2014 do not execute any of it.

Forbidden output for this turn:
- A \`<question-form>\` tag of any id, including \`discovery\` or \`task-type\`.
- A markdown \`\`\`json fenced block echoing the form schema or example.
- Form-asking prose such as "Got it \u2014 tell me the following" or
  "\u8bf7\u544a\u8bc9\u6211\u4ee5\u4e0b\u4fe1\u606f".
- Narrating fake system events such as "subagents stopped" or
  "server restart".

Required output for this turn:
- Open with a brief prose confirmation of what the brief is.
- Then proceed to RULE 2 (branch on the submitted \`brand\` value) and
  RULE 3 (emit the \`<artifact>\` block with the full HTML document).

`;

// Smaller override for non-discovery / non-task-type form ids. These
// forms are not artifact-build transitions, so we only need to suppress
// the form re-ask without directing the model toward RULE 2 / RULE 3.
// Exported so tests can pin the literal content independently.
export const FORM_ANSWERED_GENERIC_OVERRIDE = `## OVERRIDE \u2014 form already answered (this is turn 2 or later)

The user already submitted their form answers (see # User request below).
Do not ask the same form again. Treat the submitted answers as the active
user instruction and respond accordingly.

`;

function formAnswerTransitionForCurrentPrompt(currentPrompt) {
  if (typeof currentPrompt !== 'string') return null;
  const trimmed = currentPrompt.trim();
  if (!trimmed) return null;
  const match = FORM_ANSWERS_HEADER_RE.exec(trimmed);
  if (!match) return null;
  const rawFormId = (match[1] || 'form').trim() || 'form';
  const formId = rawFormId.replace(/[^\w.-]/g, '') || 'form';
  const lines = [
    '## Latest user turn - form answers submitted',
    trimmed,
    '',
    // Keep the wording in lock-step with main — the stronger "do not
    // emit any `<question-form>`" suppression now lives in the
    // system-prompt `FORM_ANSWERED_SYSTEM_OVERRIDE` block, which
    // every plain / stream-json adapter sees. Diverging the
    // user-request transition string here breaks `chat-route.test
    // marks submitted discovery form answers ...` which asserts on
    // the exact main wording.
    `The user has answered the ${formId} form. Do not emit another ${formId} form.`,
  ];
  if (formId.toLowerCase() === 'discovery' || formId.toLowerCase() === 'task-type') {
    lines.push(
      'Continue with RULE 2 / RULE 3 now. For Branch B answers, build now instead of asking another brief.',
    );
  } else {
    lines.push(
      'Treat these form answers as the active user turn instead of replaying the transcript as a fresh request.',
    );
  }
  return lines.join('\n');
}

export function composeChatUserRequestForAgent(
  message,
  currentPrompt,
  options: { skipTranscript?: boolean } = {},
) {
  // When the adapter resumes its own session (today: `agy -c`), the
  // daemon-rendered `## user` / `## assistant` transcript is a duplicate
  // of what the upstream CLI already has in memory — and the embedded
  // copy carries the literal `<question-form>` markup the agent emitted
  // on turn 1, which the model then re-emits on turn 2. Send only the
  // latest user turn (`currentPrompt`) in that case; the upstream
  // session memory provides the rest. See
  // `RuntimeAgentDef.resumesSessionViaCli`.
  const skip = options.skipTranscript === true;
  const bodySource = skip ? currentPrompt : message;
  const body =
    typeof bodySource === 'string' && bodySource.trim()
      ? bodySource
      : '(No extra typed instruction.)';
  const transition = formAnswerTransitionForCurrentPrompt(currentPrompt);
  if (!transition) return body;
  if (skip) {
    return [transition, body].join('\n\n');
  }
  return [
    transition,
    '## Full conversation transcript',
    body,
  ].join('\n\n');
}

export function createFinalizedMessageTelemetryReporter({
  design,
  db,
  dataDir,
  reportedRuns,
  getAppVersion = () => null,
  report = reportRunCompletedFromDaemon,
}: {
  design: any;
  db: unknown;
  dataDir: string;
  reportedRuns: Set<string>;
  getAppVersion?: () => any;
  report?: typeof reportRunCompletedFromDaemon;
}) {
  const appVersionForCapture = () => {
    const appVersion = getAppVersion();
    if (typeof appVersion === 'string') return appVersion;
    if (appVersion && typeof appVersion.version === 'string') return appVersion.version;
    if (typeof design?.getAppVersion === 'function') return design.getAppVersion();
    return 'unknown';
  };
  const captureResult = ({
    analyticsContext,
    conversationId,
    delivery,
    durationMs,
    projectId,
    reportResult,
    reportTrigger = 'final_message',
    run,
    runId,
    skipReason,
    status,
  }) => {
    const context = analyticsContext ?? run?.analyticsContext ?? null;
    if (!context || !design?.analytics?.capture || !runId || !delivery) return;
    const terminalResult = status ? runResultFromStatus(status) : undefined;
    design.analytics.capture({
      eventName: 'langfuse_report_result',
      context,
      appVersion: appVersionForCapture(),
      properties: {
        page_name: 'chat_panel',
        area: 'chat_panel',
        project_id: run?.projectId ?? projectId ?? null,
        conversation_id: run?.conversationId ?? conversationId ?? null,
        run_id: runId,
        langfuse_trace_id: runId,
        langfuse_expected: delivery.langfuse_expected,
        langfuse_delivery_status: delivery.langfuse_delivery_status,
        ...(delivery.langfuse_drop_reason
          ? { langfuse_drop_reason: delivery.langfuse_drop_reason }
          : {}),
        langfuse_report_result: reportResult,
        langfuse_report_trigger: reportTrigger,
        ...(skipReason ? { langfuse_report_skip_reason: skipReason } : {}),
        ...(durationMs !== undefined ? { report_duration_ms: durationMs } : {}),
        ...(terminalResult ? { result: terminalResult } : {}),
        ...(run?.errorCode ? { error_code: run.errorCode } : {}),
        ...(run?.agentId ? { agent_provider_id: agentIdToTracking(run.agentId) } : {}),
        ...(run?.model !== undefined ? { model_id: modelIdForTracking(run.model) } : {}),
      },
      insertId: `${runId}-langfuse-report-${reportTrigger}-${reportResult}${skipReason ? `-${skipReason}` : ''}`,
    });
  };
  return (saved, body = {}, options = {}) => {
    if (!shouldReportRunCompletedFromMessage(saved, body)) return;
    const runId = saved.runId;
    const run = design.runs.get(runId);
    if (!run) {
      captureResult({
        analyticsContext: options.analyticsContext,
        conversationId: options.conversationId ?? saved.conversationId,
        delivery: {
          langfuse_expected: true,
          langfuse_delivery_status: 'failed',
          langfuse_drop_reason: 'network_error',
        },
        projectId: options.projectId,
        reportTrigger: options.reportTrigger,
        reportResult: 'skipped',
        runId,
        skipReason: 'run_not_found',
        status: saved.runStatus,
      });
      return;
    }
    const reportTrigger = options.reportTrigger ?? 'final_message';
    if (reportedRuns.has(run.id)) {
      captureResult({
        analyticsContext: options.analyticsContext,
        conversationId: options.conversationId ?? saved.conversationId,
        delivery: {
          langfuse_expected: true,
          langfuse_delivery_status: 'failed',
          langfuse_drop_reason: 'network_error',
        },
        projectId: options.projectId,
        reportTrigger: options.reportTrigger,
        reportResult: 'skipped',
        run,
        runId: run.id,
        skipReason: 'duplicate_run',
        status: saved.runStatus,
      });
      return;
    }
    if (reportTrigger !== 'terminal_fallback') {
      reportedRuns.add(run.id);
    }
    void (async () => {
      const start = Date.now();
      const delivery = await report({
        db,
        dataDir,
        run,
        persistedRunStatus: saved.runStatus,
        persistedEndedAt: saved.endedAt,
        appVersion: getAppVersion(),
      });
      const state = delivery ?? {
        langfuse_expected: true,
        langfuse_delivery_status: 'accepted',
      };
      captureResult({
        analyticsContext: options.analyticsContext,
        conversationId: options.conversationId ?? saved.conversationId,
        delivery: state,
        durationMs: Date.now() - start,
        projectId: options.projectId,
        reportTrigger,
        reportResult: state.langfuse_expected === false
          ? 'skipped'
          : state.langfuse_delivery_status === 'accepted'
            ? 'accepted'
            : state.langfuse_delivery_status === 'failed'
              ? 'failed'
              : 'skipped',
        run,
        runId: run.id,
        skipReason: state.langfuse_expected === false ? 'not_expected' : undefined,
        status: saved.runStatus,
      });
    })();
  };
}

export function shouldReportRunCompletionTelemetryFallbackStatus(status: unknown): boolean {
  return status === 'failed' || status === 'canceled';
}

const CLOUDFLARE_PAGES_PROJECT_METADATA_KEY = 'cloudflarePagesProjectName';

function cloudflarePagesDeploymentMetadata(projectName) {
  const normalized = typeof projectName === 'string' ? projectName.trim() : '';
  return normalized
    ? { [CLOUDFLARE_PAGES_PROJECT_METADATA_KEY]: normalized }
    : undefined;
}

function cloudflarePagesProjectNameFromDeployment(deployment) {
  const value = deployment?.providerMetadata?.[CLOUDFLARE_PAGES_PROJECT_METADATA_KEY];
  if (typeof value === 'string' && value.trim()) return value.trim();
  return cloudflarePagesProjectNameFromUrl(deployment?.url);
}

function cloudflarePagesProjectNameFromUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return '';
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    if (!host.endsWith('.pages.dev')) return '';
    const labels = host.slice(0, -'.pages.dev'.length).split('.').filter(Boolean);
    return labels.at(-1) || '';
  } catch {
    return '';
  }
}

function cloudflarePagesProjectNameForDeploy(db, projectId, projectName, prior) {
  const priorName = cloudflarePagesProjectNameFromDeployment(prior);
  if (priorName) return priorName;

  for (const deployment of listDeployments(db, projectId)) {
    if (deployment.providerId !== CLOUDFLARE_PAGES_PROVIDER_ID) continue;
    const stableName = cloudflarePagesProjectNameFromDeployment(deployment);
    if (stableName) return stableName;
  }

  return cloudflarePagesProjectNameForProject(projectId, projectName);
}

function publicDeployment(deployment) {
  if (!deployment || typeof deployment !== 'object') return deployment;
  const { providerMetadata: _providerMetadata, ...publicShape } = deployment;
  return publicShape;
}

function publicDeployments(deployments) {
  return (deployments || []).map(publicDeployment);
}

async function checkCloudflarePagesDeploymentLinks(existing) {
  const current = existing.cloudflarePages || {};
  const projectName = current.projectName || cloudflarePagesProjectNameFromDeployment(existing);
  const config = await readDeployConfig(CLOUDFLARE_PAGES_PROVIDER_ID);
  const pagesDevUrl = current.pagesDev?.url || existing.url;
  const pagesDevResult = await checkDeploymentUrl(pagesDevUrl);
  const pagesDev = {
    ...(current.pagesDev || {}),
    url: pagesDevUrl,
    status: pagesDevResult.reachable ? 'ready' : pagesDevResult.status || 'link-delayed',
    statusMessage: pagesDevResult.reachable
      ? 'Public link is ready.'
      : pagesDevResult.statusMessage || current.pagesDev?.statusMessage || 'Cloudflare Pages is still preparing the pages.dev link.',
    reachableAt: pagesDevResult.reachable ? Date.now() : current.pagesDev?.reachableAt,
  };
  let customDomain = current.customDomain;
  if (customDomain?.url && customDomain.status !== 'conflict') {
    let pagesDomain = null;
    if (config?.token && config?.accountId && projectName) {
      try {
        pagesDomain = await readCloudflarePagesDomain({ ...config, projectName }, customDomain.hostname);
      } catch {
        pagesDomain = null;
      }
    }
    const customResult = await checkDeploymentUrl(customDomain.url);
    const pagesDomainStatus = pagesDomain?.status || customDomain.pagesDomainStatus;
    const failedByApi = ['error', 'blocked', 'deactivated'].includes(String(pagesDomainStatus || '').toLowerCase());
    const activeByApi = String(pagesDomainStatus || '').toLowerCase() === 'active';
    const readyByReachability = customResult.reachable && activeByApi;
    customDomain = {
      ...customDomain,
      domainStatus: pagesDomain
        ? pagesDomain.status === 'active'
          ? 'active'
          : failedByApi
            ? 'failed'
            : 'pending'
        : customDomain.domainStatus,
      pagesDomainStatus,
      validationData: pagesDomain?.validation_data ?? customDomain.validationData,
      verificationData: pagesDomain?.verification_data ?? customDomain.verificationData,
      status: readyByReachability
        ? 'ready'
        : customDomain.status === 'failed' || failedByApi
          ? 'failed'
          : 'pending',
      statusMessage: readyByReachability
        ? 'Custom domain is ready.'
        : failedByApi
          ? 'Cloudflare Pages reported a custom-domain error.'
        : customResult.statusMessage || customDomain.statusMessage || 'Custom domain is still being prepared.',
    };
  }
  const cloudflarePages = {
    ...current,
    projectName,
    pagesDev,
    ...(customDomain ? { customDomain } : {}),
  };
  const aggregate = aggregateCloudflarePagesStatus(pagesDev, customDomain);
  return {
    url: pagesDev.url,
    status: aggregate.status,
    statusMessage: aggregate.statusMessage,
    cloudflarePages,
    providerMetadata: {
      ...(existing.providerMetadata || {}),
      cloudflarePages,
    },
  };
}

// Filename slug for the Content-Disposition header on archive downloads.
// Browsers reject quotes and control bytes; we keep Unicode letters/digits
// so a project name with non-ASCII characters (e.g. "café-design")
// survives instead of becoming a row of underscores.
function sanitizeArchiveFilename(raw) {
  const cleaned = String(raw ?? '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return cleaned;
}

function sendLiveArtifactRouteError(res, err) {
  if (err instanceof LiveArtifactStoreValidationError) {
    return sendApiError(res, 400, 'LIVE_ARTIFACT_INVALID', err.message, {
      details: { kind: 'validation', issues: err.issues },
    });
  }
  if (err instanceof LiveArtifactRefreshLockError) {
    return sendApiError(res, 409, 'REFRESH_LOCKED', err.message, {
      details: { artifactId: err.artifactId },
    });
  }
  if (err instanceof LiveArtifactRefreshUnavailableError) {
    return sendApiError(res, 400, 'LIVE_ARTIFACT_REFRESH_UNAVAILABLE', err.message);
  }
  if (err instanceof LiveArtifactRefreshAbortError) {
    return sendApiError(res, err.kind === 'cancelled' ? 499 : 504, 'LIVE_ARTIFACT_REFRESH_TIMEOUT', err.message, {
      details: { kind: err.kind, timeoutMs: err.timeoutMs ?? null, step: err.step ?? null },
    });
  }
  if (err instanceof ConnectorServiceError) {
    return sendApiError(res, err.status, err.code, err.message, err.details === undefined ? {} : { details: err.details });
  }
  if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') {
    return sendApiError(res, 404, 'LIVE_ARTIFACT_NOT_FOUND', 'live artifact not found');
  }
  return sendApiError(res, 500, 'LIVE_ARTIFACT_STORAGE_FAILED', String(err));
}

function normalizeLocalAuthority(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || /[\s/@]/.test(trimmed) || trimmed.includes(',')) return null;

  try {
    const parsed = new URL(`http://${trimmed}`);
    const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
    if (!hostname || parsed.username || parsed.password || parsed.pathname !== '/') return null;
    return { hostname, port: parsed.port };
  } catch {
    return null;
  }
}

function isLoopbackHostname(hostname) {
  const normalized = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (normalized === 'localhost') return true;
  if (normalized === '::1' || normalized === '0:0:0:0:0:0:0:1') return true;
  if (net.isIP(normalized) === 4) return normalized === '127.0.0.1' || normalized.startsWith('127.');
  return false;
}

function isLoopbackPeerAddress(address) {
  if (typeof address !== 'string') return false;
  const normalized = address.trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!normalized) return false;
  if (normalized.startsWith('::ffff:')) return isLoopbackPeerAddress(normalized.slice('::ffff:'.length));
  if (normalized === '::1' || normalized === '0:0:0:0:0:0:0:1') return true;
  if (net.isIP(normalized) === 4) return normalized === '127.0.0.1' || normalized.startsWith('127.');
  return false;
}

const PROJECT_PREVIEW_SCOPE_TTL_MS = 60 * 60 * 1000;
const PROJECT_PREVIEW_ASSET_PATH_RE = /^\/projects\/([^/]+)\/preview\/([^/]+)\/.+$/u;

function createProjectPreviewScopeRegistry() {
  const scopes = new Map();

  function pruneExpired(now = Date.now()) {
    for (const [scope, entry] of scopes) {
      if (entry.expiresAt <= now) scopes.delete(scope);
    }
  }

  return {
    mint(projectId) {
      pruneExpired();
      const scope = randomUUID();
      scopes.set(scope, {
        projectId: String(projectId),
        expiresAt: Date.now() + PROJECT_PREVIEW_SCOPE_TTL_MS,
      });
      return scope;
    },
    validate(projectId, scope) {
      const key = String(scope || '');
      const entry = scopes.get(key);
      if (!entry) return false;
      if (entry.expiresAt <= Date.now()) {
        scopes.delete(key);
        return false;
      }
      return entry.projectId === String(projectId);
    },
  };
}

function parseProjectPreviewAssetPath(pathname) {
  const match = PROJECT_PREVIEW_ASSET_PATH_RE.exec(String(pathname || ''));
  if (!match) return null;
  try {
    return {
      projectId: decodeURIComponent(match[1]),
      scope: match[2],
    };
  } catch {
    return null;
  }
}

function localOriginFromHeader(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === 'null' || trimmed.includes(',')) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (parsed.pathname !== '/' || parsed.search || parsed.hash || parsed.username || parsed.password) return null;
    if (!isLoopbackHostname(parsed.hostname)) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function validateLocalDaemonRequest(req) {
  if (!isLoopbackPeerAddress(req.socket?.remoteAddress)) {
    return {
      ok: false,
      message: 'request peer must be a loopback address',
      details: { peer: 'remoteAddress' },
    };
  }

  const host = normalizeLocalAuthority(req.get('host'));
  if (!host || !isLoopbackHostname(host.hostname)) {
    return {
      ok: false,
      message: 'request host must be a loopback daemon address',
      details: { header: 'host' },
    };
  }

  const originHeader = req.get('origin');
  if (originHeader !== undefined && !localOriginFromHeader(originHeader)) {
    return {
      ok: false,
      message: 'request origin must be a loopback daemon origin',
      details: { header: 'origin' },
    };
  }

  return { ok: true, origin: localOriginFromHeader(originHeader) };
}

function requireLocalDaemonRequest(req, res, next) {
  const validation = validateLocalDaemonRequest(req);
  if (!validation.ok) {
    return sendApiError(res, 403, 'FORBIDDEN', validation.message, validation.details ? { details: validation.details } : {});
  }

  res.setHeader('Vary', 'Origin');
  if (validation.origin) {
    res.setHeader('Access-Control-Allow-Origin', validation.origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '600');
  next();
}

/**
 * Render the small HTML page that the OAuth callback returns to the
 * user's browser tab. It posts a message back to the opener (the
 * Settings dialog window) and offers a manual close button. We keep
 * the markup pure HTML/CSS — no external scripts, no React — so the
 * page works even if the opener was closed and the user just sees a
 * static success/failure screen.
 */
function renderOAuthResultPage(opts) {
  const ok = Boolean(opts.ok);
  const title = ok ? 'Connected' : 'Authorization failed';
  const heading = ok ? '✅ Connected' : '⚠️ Authorization failed';
  const body = ok
    ? `Your MCP server <code>${escapeHtml(opts.serverId ?? '')}</code> is now connected. You can close this tab and return to Open Design.`
    : escapeHtml(opts.message ?? 'Authorization could not be completed.');
  const accent = ok ? '#1a7f37' : '#cf222e';
  const payload = ok
    ? { type: 'mcp-oauth', ok: true, serverId: opts.serverId ?? null }
    : { type: 'mcp-oauth', ok: false, message: opts.message ?? null };
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)} — Open Design</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  :root { color-scheme: light dark; }
  html, body { height: 100%; margin: 0; }
  body {
    display: flex; align-items: center; justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, sans-serif;
    background: #f6f7f9; color: #1f2328; padding: 24px;
  }
  @media (prefers-color-scheme: dark) {
    body { background: #0d1117; color: #e6edf3; }
    .card { background: #161b22; border-color: #30363d; }
    code { background: #1f242c; }
  }
  .card {
    max-width: 420px; width: 100%; padding: 28px 28px 22px; border-radius: 12px;
    background: white; border: 1px solid #d0d7de; box-shadow: 0 8px 24px rgba(0,0,0,.06);
    text-align: left;
  }
  h1 { margin: 0 0 8px; font-size: 18px; color: ${accent}; }
  p  { margin: 0 0 16px; font-size: 14px; line-height: 1.55; }
  code { background: #f3f4f6; padding: 1px 6px; border-radius: 4px; font-size: 12.5px; }
  button {
    appearance: none; border: 1px solid #d0d7de; background: white;
    border-radius: 8px; padding: 8px 14px; font-size: 13px; cursor: pointer;
  }
  button:hover { background: #f6f8fa; }
  @media (prefers-color-scheme: dark) {
    button { background: #21262d; border-color: #30363d; color: #e6edf3; }
    button:hover { background: #30363d; }
  }
</style>
</head>
<body>
  <div class="card">
    <h1>${escapeHtml(heading)}</h1>
    <p>${body}</p>
    <button type="button" onclick="window.close()">Close this tab</button>
  </div>
  <script>
    try {
      var payload = ${JSON.stringify(payload)};
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(payload, '*');
      }
      if (window.BroadcastChannel) {
        var bc = new BroadcastChannel('open-design-mcp-oauth');
        bc.postMessage(payload);
        bc.close();
      }
    } catch (e) { /* ignore postMessage failures */ }
  </script>
</body>
</html>`;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function setLiveArtifactPreviewHeaders(res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'none'",
      "base-uri 'none'",
      "script-src 'none'",
      "object-src 'none'",
      "connect-src 'none'",
      "form-action 'none'",
      "frame-ancestors 'self'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "style-src 'unsafe-inline'",
      'sandbox allow-same-origin',
    ].join('; '),
  );
}

function setLiveArtifactCodeHeaders(res) {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
}

const OPEN_DESIGN_GITHUB_REPO_API = 'https://api.github.com/repos/nexu-io/open-design';
const OPEN_DESIGN_GITHUB_RELEASE_LATEST_API = 'https://api.github.com/repos/nexu-io/open-design/releases/latest';
const OPEN_DESIGN_GITHUB_CACHE_TTL_MS = 60 * 60 * 1000;
const OPEN_DESIGN_GITHUB_TIMEOUT_MS = 4_000;
const OPEN_DESIGN_DISCORD_INVITE_CODE = '9ptkbbqRu';
const OPEN_DESIGN_DISCORD_INVITE_URL = `https://discord.gg/${OPEN_DESIGN_DISCORD_INVITE_CODE}`;
const OPEN_DESIGN_DISCORD_INVITE_API = `https://discord.com/api/v10/invites/${OPEN_DESIGN_DISCORD_INVITE_CODE}?with_counts=true`;
const OPEN_DESIGN_DISCORD_CACHE_TTL_MS = 5 * 60 * 1000;
const OPEN_DESIGN_DISCORD_TIMEOUT_MS = 4_000;

let openDesignGithubRepoCache = null;
let openDesignGithubRepoInflight = null;
let openDesignGithubLatestReleaseCache = null;
let openDesignGithubLatestReleaseInflight = null;
let openDesignDiscordPresenceCache = null;
let openDesignDiscordPresenceInflight = null;

async function readOpenDesignGithubRepoStats() {
  const now = Date.now();
  if (
    openDesignGithubRepoCache &&
    now - openDesignGithubRepoCache.fetchedAt < OPEN_DESIGN_GITHUB_CACHE_TTL_MS
  ) {
    return { ...openDesignGithubRepoCache, stale: false };
  }

  if (openDesignGithubRepoInflight) {
    return openDesignGithubRepoInflight;
  }

  openDesignGithubRepoInflight = (async () => {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), OPEN_DESIGN_GITHUB_TIMEOUT_MS);
    try {
      const response = await fetch(OPEN_DESIGN_GITHUB_REPO_API, {
        headers: {
          accept: 'application/vnd.github+json',
          'user-agent': 'open-design-daemon',
        },
        signal: ctrl.signal,
      });
      if (!response.ok) {
        throw new Error(`GitHub repo metadata request failed with HTTP ${response.status}`);
      }
      const payload = await response.json();
      const count = payload && typeof payload.stargazers_count === 'number'
        ? payload.stargazers_count
        : null;
      if (!Number.isFinite(count) || count == null || count < 0) {
        throw new Error('GitHub repo metadata did not include a numeric stargazers_count');
      }
      openDesignGithubRepoCache = {
        stargazersCount: count,
        fetchedAt: Date.now(),
      };
      return { ...openDesignGithubRepoCache, stale: false };
    } catch (error) {
      if (openDesignGithubRepoCache) {
        return { ...openDesignGithubRepoCache, stale: true };
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      openDesignGithubRepoInflight = null;
    }
  })();

  return openDesignGithubRepoInflight;
}

async function readOpenDesignLatestReleaseInfo() {
  const now = Date.now();
  if (
    openDesignGithubLatestReleaseCache &&
    now - openDesignGithubLatestReleaseCache.fetchedAt < OPEN_DESIGN_GITHUB_CACHE_TTL_MS
  ) {
    return { ...openDesignGithubLatestReleaseCache, stale: false };
  }

  if (openDesignGithubLatestReleaseInflight) {
    return openDesignGithubLatestReleaseInflight;
  }

  openDesignGithubLatestReleaseInflight = (async () => {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), OPEN_DESIGN_GITHUB_TIMEOUT_MS);
    try {
      const response = await fetch(OPEN_DESIGN_GITHUB_RELEASE_LATEST_API, {
        headers: {
          accept: 'application/vnd.github+json',
          'user-agent': 'open-design-daemon',
        },
        signal: ctrl.signal,
      });
      if (!response.ok) {
        throw new Error(`GitHub latest release request failed with HTTP ${response.status}`);
      }
      const payload = await response.json();
      const tagName = payload && typeof payload.tag_name === 'string' ? payload.tag_name : null;
      const htmlUrl = payload && typeof payload.html_url === 'string' ? payload.html_url : null;
      if (!tagName || !htmlUrl) {
        throw new Error('GitHub latest release metadata did not include tag_name/html_url');
      }
      openDesignGithubLatestReleaseCache = {
        tagName,
        htmlUrl,
        fetchedAt: Date.now(),
      };
      return { ...openDesignGithubLatestReleaseCache, stale: false };
    } catch (error) {
      if (openDesignGithubLatestReleaseCache) {
        return { ...openDesignGithubLatestReleaseCache, stale: true };
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      openDesignGithubLatestReleaseInflight = null;
    }
  })();

  return openDesignGithubLatestReleaseInflight;
}

async function readOpenDesignDiscordPresence() {
  const now = Date.now();
  if (
    openDesignDiscordPresenceCache &&
    now - openDesignDiscordPresenceCache.fetchedAt < OPEN_DESIGN_DISCORD_CACHE_TTL_MS
  ) {
    return { ...openDesignDiscordPresenceCache, stale: false };
  }

  if (openDesignDiscordPresenceInflight) {
    return openDesignDiscordPresenceInflight;
  }

  openDesignDiscordPresenceInflight = (async () => {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), OPEN_DESIGN_DISCORD_TIMEOUT_MS);
    try {
      const response = await fetch(OPEN_DESIGN_DISCORD_INVITE_API, {
        headers: {
          accept: 'application/json',
          'user-agent': 'open-design-daemon',
        },
        signal: ctrl.signal,
      });
      if (!response.ok) {
        throw new Error(`Discord invite metadata request failed with HTTP ${response.status}`);
      }
      const payload = await response.json();
      const profile = payload && typeof payload.profile === 'object' ? payload.profile : null;
      const onlineCount =
        typeof payload?.approximate_presence_count === 'number'
          ? payload.approximate_presence_count
          : typeof profile?.online_count === 'number'
            ? profile.online_count
            : null;
      const memberCount =
        typeof payload?.approximate_member_count === 'number'
          ? payload.approximate_member_count
          : typeof profile?.member_count === 'number'
            ? profile.member_count
            : null;

      if (
        !Number.isFinite(onlineCount) ||
        onlineCount == null ||
        onlineCount < 0 ||
        !Number.isFinite(memberCount) ||
        memberCount == null ||
        memberCount < 0
      ) {
        throw new Error('Discord invite metadata did not include numeric member counts');
      }

      openDesignDiscordPresenceCache = {
        onlineCount,
        memberCount,
        fetchedAt: Date.now(),
      };
      return { ...openDesignDiscordPresenceCache, stale: false };
    } catch (error) {
      if (openDesignDiscordPresenceCache) {
        return { ...openDesignDiscordPresenceCache, stale: true };
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      openDesignDiscordPresenceInflight = null;
    }
  })();

  return openDesignDiscordPresenceInflight;
}

function bearerTokenFromRequest(req) {
  const header = req.get('authorization');
  if (typeof header !== 'string') return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1];
}

function authorizeToolRequest(req, res, operation) {
  const endpoint = req.path;
  const validation = toolTokenRegistry.validate(bearerTokenFromRequest(req), { endpoint, operation });
  if (!validation.ok) {
    const status = validation.code === 'TOOL_ENDPOINT_DENIED' || validation.code === 'TOOL_OPERATION_DENIED' ? 403 : 401;
    sendApiError(res, status, validation.code, validation.message, {
      details: { endpoint, operation },
    });
    return null;
  }
  return validation.grant;
}

function optionalToolGrantFromRequest(req, options = {}) {
  const validation = toolTokenRegistry.validate(bearerTokenFromRequest(req), options);
  return validation.ok ? validation.grant : null;
}

function requestProjectOverride(projectId, tokenProjectId) {
  return typeof projectId === 'string' && projectId.length > 0 && projectId !== tokenProjectId;
}

function requestRunOverride(runId, tokenRunId) {
  return typeof runId === 'string' && runId.length > 0 && runId !== tokenRunId;
}

function openNativeFolderDialog() {
  return new Promise((resolve) => {
    const platform = process.platform;
    if (platform === 'darwin') {
      // `choose folder` is handled specially by the system: it presents a fully
      // interactive standard navigation panel that reliably takes key focus
      // (unlike a JXA-driven NSOpenPanel from background-only osascript, which
      // renders but can't be clicked). That standard panel already includes a
      // "New Folder" button in the bottom-left, so users can create a folder
      // inline without any extra wiring.
      execFile(
        'osascript',
        ['-e', 'POSIX path of (choose folder with prompt "Select a code folder to link")'],
        { timeout: 120_000 },
        (err, stdout) => {
          if (err) return resolve(null);
          const p = stdout.trim().replace(/\/$/, '');
          resolve(p || null);
        },
      );
    } else if (platform === 'linux') {
      execFile(
        'zenity',
        ['--file-selection', '--directory', '--title=Select a code folder to link'],
        { timeout: 120_000 },
        (err, stdout) => {
          if (err) return resolve(null);
          const p = stdout.trim();
          resolve(p || null);
        },
      );
    } else if (platform === 'win32') {
      const command = buildWindowsFolderDialogCommand();
      execFile(command.command, command.args, { timeout: 120_000 }, (err, stdout) => {
        resolve(parseFolderDialogStdout(err, stdout));
      });
    } else {
      resolve(null);
    }
  });
}

/**
 * @param {ApiErrorCode} code
 * @param {string} message
 * @param {Omit<ApiError, 'code' | 'message'>} [init]
 */
function createSseErrorPayload(code, message, init = {}) {
  return { message, error: createCompatApiError(code, message, init) };
}

const MAX_CHAT_IMAGE_BYTES = 1024 * 1024;

function rewriteKnownAgentStreamError(agentId, message, failureText = '') {
  const rawMessage =
    typeof message === 'string' && message.trim()
      ? message.trim()
      : 'Agent stream error';
  const combined = `${rawMessage}\n${failureText}`;
  if (
    /bufio\.scanner:\s*token too long/i.test(combined) &&
    /opencode/i.test(combined) &&
    (agentId === 'opencode' || agentId === 'amr' || /json-rpc id \d+/i.test(combined))
  ) {
    return 'The run failed due to an unknown upstream streaming error. Please retry.';
  }
  return rawMessage;
}

function createAmrModelUnavailablePayload(model, init = {}) {
  const modelText = typeof model === 'string' && model.trim()
    ? `"${model.trim()}"`
    : 'the selected model';
  return createSseErrorPayload(
    'AMR_MODEL_UNAVAILABLE',
    `AMR model ${modelText} is not available from Vela. Refresh the AMR model list, choose a supported model, and retry this run.`,
    {
      retryable: false,
      details: {
        kind: 'amr_model',
        action: 'choose_model',
        ...(typeof model === 'string' && model.trim() ? { model: model.trim() } : {}),
        ...init,
      },
    },
  );
}

const UPLOAD_DIR = path.join(os.tmpdir(), 'od-uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => {
      file.originalname = decodeMultipartFilename(file.originalname);
      const safe = sanitizeName(file.originalname);
      cb(
        null,
        `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`,
      );
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
});

const importUpload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => {
      file.originalname = decodeMultipartFilename(file.originalname);
      const safe = sanitizeName(file.originalname);
      cb(
        null,
        `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`,
      );
    },
  }),
  limits: { fileSize: 100 * 1024 * 1024 },
});

const PLUGIN_UPLOAD_MAX_BYTES = 50 * 1024 * 1024;
const pluginUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: PLUGIN_UPLOAD_MAX_BYTES,
    files: 500,
    fieldSize: 2 * 1024 * 1024,
  },
});

const pluginShareTaskStore = createPluginShareTaskStore({
  randomUUID,
  execCommandViaLoginShell,
  OD_NODE_BIN,
  OD_BIN,
});

// Project-scoped multi-file upload. Lands files directly in the project
// folder (flat — same shape FileWorkspace expects), so the composer's
// pasted/dropped/picked images become referenceable filenames the agent
// can Read or @-mention without any cross-folder gymnastics.
// Bridge between the multer upload-storage destination (built at module
// init) and the per-process project DB (instantiated inside startServer).
// startServer() sets this so the upload destination can route attachments
// into the right project root, including folder-imported projects whose
// files live under metadata.baseDir.
let projectMetadataLookup: ((id: string) => Record<string, unknown> | null) | null = null;

const projectUpload = multer({
  storage: multer.diskStorage({
    destination: async (req, _file, cb) => {
      try {
        // Route uploads into the project's actual root: for folder-imported
        // projects (metadata.baseDir set) attachments need to land alongside
        // the user's files so the agent can read them via the same path
        // it sees. projectMetadataLookup is populated at startServer() boot
        // and keyed by project id; null fallback gives the standard
        // .od/projects/<id>/ behavior for non-imported projects.
        const meta = projectMetadataLookup?.(req.params.id) ?? null;
        // Optional `dir` form field (sent BEFORE the file parts by the web
        // client) routes uploads into a subfolder, so files dropped/picked
        // while viewing a folder land there instead of the project root. The
        // sanitized relative dir is stashed on the request so the route can
        // report each file's true project-relative path.
        const subdir = typeof req.body?.dir === 'string' ? req.body.dir : '';
        const { absDir, relDir } = await ensureProjectSubdir(
          PROJECTS_DIR,
          req.params.id,
          subdir,
          meta,
        );
        (req as any)._uploadRelDir = relDir;
        cb(null, absDir);
      } catch (err) {
        cb(err, '');
      }
    },
    filename: (_req, file, cb) => {
      // multer@1 hands us latin1-decoded multipart filenames; restore the
      // original UTF-8 so the response (and the on-disk name) preserves
      // non-ASCII characters instead of mangling them. Then run the
      // shared sanitiser and prepend a base36 timestamp so multiple
      // uploads with the same original name don't clobber each other.
      file.originalname = decodeMultipartFilename(file.originalname);
      const safe = sanitizeName(file.originalname);
      cb(null, `${Date.now().toString(36)}-${safe}`);
    },
  }),
  limits: { fileSize: 200 * 1024 * 1024 },  // 200MB — covers the largest design assets we expect (PPTX/PDF/raw images)
});

function handleProjectUpload(req, res, next) {
  projectUpload.array('files', 12)(req, res, (err) => {
    if (err) {
      return sendMulterError(res, err);
    }
    next();
  });
}

function sendMulterError(res, err) {
  if (err instanceof multer.MulterError) {
    const code = err.code || 'UPLOAD_ERROR';
    const statusByCode = {
      LIMIT_FILE_SIZE: 413,
      LIMIT_FILE_COUNT: 400,
      LIMIT_UNEXPECTED_FILE: 400,
      LIMIT_PART_COUNT: 400,
      LIMIT_FIELD_KEY: 400,
      LIMIT_FIELD_VALUE: 400,
      LIMIT_FIELD_COUNT: 400,
      MISSING_FIELD_NAME: 400,
    };
    const errorByCode = {
      LIMIT_FILE_SIZE: 'file too large',
      LIMIT_FILE_COUNT: 'too many files',
      LIMIT_UNEXPECTED_FILE: 'unexpected file field',
      LIMIT_PART_COUNT: 'too many form parts',
      LIMIT_FIELD_KEY: 'field name too long',
      LIMIT_FIELD_VALUE: 'field value too long',
      LIMIT_FIELD_COUNT: 'too many form fields',
      MISSING_FIELD_NAME: 'missing field name',
    };
    const status = statusByCode[code] ?? 400;
    const message = errorByCode[code] ?? 'upload failed';
    return sendApiError(
      res,
      status,
      code === 'LIMIT_FILE_SIZE' ? 'PAYLOAD_TOO_LARGE' : 'BAD_REQUEST',
      message,
      { details: { legacyCode: code } },
    );
  }

  if (err) {
    return sendApiError(res, 500, 'INTERNAL_ERROR', 'upload failed');
  }

  return sendApiError(res, 500, 'INTERNAL_ERROR', 'upload failed');
}

const mediaTasks = new Map();
const TASK_TTL_AFTER_DONE_MS = 10 * 60 * 1000;
const MEDIA_TERMINAL_STATUSES = new Set(['done', 'failed', 'interrupted']);

function hydrateMediaTask(row) {
  const task = {
    id: row.id,
    projectId: row.projectId,
    status: row.status,
    surface: row.surface,
    model: row.model,
    progress: Array.isArray(row.progress) ? row.progress.slice() : [],
    file: row.file ?? null,
    error: row.error ?? null,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    waiters: new Set(),
  };
  mediaTasks.set(task.id, task);
  return task;
}

function getLiveMediaTask(db, taskId) {
  const cached = mediaTasks.get(taskId);
  if (cached) return cached;
  const row = getMediaTask(db, taskId);
  return row ? hydrateMediaTask(row) : null;
}

function createMediaTask(db, taskId, projectId, info = {}) {
  const task = {
    id: taskId,
    projectId,
    status: 'queued',
    surface: info.surface,
    model: info.model,
    progress: [],
    file: null,
    error: null,
    startedAt: Date.now(),
    endedAt: null,
    waiters: new Set(),
  };
  mediaTasks.set(taskId, task);
  insertMediaTask(db, {
    id: taskId,
    projectId,
    status: task.status,
    surface: task.surface,
    model: task.model,
    progress: task.progress,
    file: task.file,
    error: task.error,
    startedAt: task.startedAt,
    endedAt: task.endedAt,
  });
  return task;
}

function persistMediaTask(db, task) {
  updateMediaTask(db, task.id, {
    status: task.status,
    surface: task.surface,
    model: task.model,
    progress: task.progress,
    file: task.file,
    error: task.error,
    startedAt: task.startedAt,
    endedAt: task.endedAt,
  });
}

function appendTaskProgress(db, task, line) {
  task.progress.push(line);
  persistMediaTask(db, task);
  notifyTaskWaiters(db, task);
}

function notifyTaskWaiters(db, task) {
  const wakers = Array.from(task.waiters);
  for (const w of wakers) {
    try {
      w();
    } catch {
      // Never let one bad waiter block the rest.
    }
  }
  if (
    MEDIA_TERMINAL_STATUSES.has(task.status) &&
    !task._gcScheduled
  ) {
    task._gcScheduled = true;
    setTimeout(() => {
      if (task.waiters.size === 0) {
        mediaTasks.delete(task.id);
        deleteMediaTask(db, task.id);
      }
    }, TASK_TTL_AFTER_DONE_MS).unref?.();
  }
}

function mediaTaskSnapshot(task, since = 0) {
  const snapshot = {
    taskId: task.id,
    status: task.status,
    startedAt: task.startedAt,
    endedAt: task.endedAt,
    progress: task.progress.slice(since),
    nextSince: task.progress.length,
  };
  if (task.status === 'done') snapshot.file = task.file;
  if (task.status === 'failed' || task.status === 'interrupted') {
    snapshot.error = task.error;
  }
  return snapshot;
}

export function createSseResponse(
  res,
  { keepAliveIntervalMs = SSE_KEEPALIVE_INTERVAL_MS } = {},
) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const canWrite = () => !res.destroyed && !res.writableEnded;
  const writeKeepAlive = () => {
    if (canWrite()) {
      res.write(': keepalive\n\n');
      return true;
    }
    return false;
  };

  let heartbeat = null;
  if (keepAliveIntervalMs > 0) {
    heartbeat = setInterval(writeKeepAlive, keepAliveIntervalMs);
    heartbeat.unref?.();
  }

  const cleanup = () => {
    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
  };

  res.on('close', cleanup);
  res.on('finish', cleanup);

  return {
    /** @param {ChatSseEvent['event'] | ProxySseEvent['event'] | string} event */
    send(event, data, id: string | number | null | undefined = null) {
      if (!canWrite()) return false;
      // Assemble the full SSE event into a single write so id/event/data land
      // in one TCP chunk. Three separate writes would let `event: <type>` flush
      // ahead of the `data:` payload, which produces partial events for
      // consumers that read chunk-by-chunk (e.g. tests using a Response body
      // reader with a substring marker).
      const idLine = id !== null && id !== undefined ? `id: ${id}\n` : '';
      res.write(`${idLine}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      return true;
    },
    writeKeepAlive,
    cleanup,
    end() {
      cleanup();
      if (canWrite()) {
        res.end();
      }
    },
  };
}

export type DesktopPdfExporter = (input: DesktopExportPdfInput) => Promise<DesktopExportPdfResult>;

// Loosely typed shape — we only access `namespace`, `base`, `mode`, and
// `source` from the runtime context when building the diagnostics export.
// Anything richer would force a dependency from server.ts into the sidecar
// package, which the boundary checks explicitly forbid.
export interface DaemonRuntimeContext {
  namespace: string;
  base: string;
  mode?: string;
  source?: string;
}

export interface StartServerOptions {
  desktopPdfExporter?: DesktopPdfExporter | null;
  host?: string;
  port?: number;
  returnServer?: boolean;
  runtime?: DaemonRuntimeContext | null;
}

export interface StartServerResult {
  url: string;
  server: import('node:http').Server;
  shutdown: () => Promise<void> | void;
  routeInventory: import('./route-registration-guard.js').RouteRegistration[];
}

const DEFAULT_CHAT_RUN_INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_CHAT_RUN_INACTIVITY_TIMEOUT_MS = 24 * 60 * 60 * 1000;
// After a successful live-artifact registration the daemon switches the
// chat-run inactivity watchdog from the long pre-artifact ceiling
// (DEFAULT_CHAT_RUN_INACTIVITY_TIMEOUT_MS) down to a much shorter
// "quiet period" — the deliverable exists, so further silence almost
// always means the agent is winding down or hanging. See #1451.
const DEFAULT_CHAT_RUN_ARTIFACT_QUIET_PERIOD_MS = 60 * 1000;

// Resolve the chat-run inactivity watchdog ceiling. Priority order:
//   1. `OD_CHAT_RUN_INACTIVITY_TIMEOUT_MS` (operator escape hatch).
//   2. The agent runtime def's `inactivityTimeoutMs` recommendation —
//      lets agents whose CLIs go silent for long stretches during
//      legitimate work (e.g. Copilot from #2467) raise the ceiling
//      without every operator having to set an env var.
//   3. The 10-minute global default.
//
// The env path is lenient (silently normalizes / falls back) because it
// comes from a runtime knob an operator can mis-type at any time. The
// def path is strict (throws on non-finite or negative) because the
// value lives in checked-in source — a typo like `inactivityTimeoutMs: -1`
// should crash loudly at chat-run time rather than silently disable the
// watchdog for that agent. Both paths still pass through the 24-hour
// clamp because Node silently downgrades signed-32-bit-overflowing
// setTimeout delays to 1ms.
//
// Order matters: validate the def hint *before* checking the env
// override. Otherwise a finite env value would hide a bad checked-in
// value (e.g. `inactivityTimeoutMs: -1`) from ever tripping the
// fast-fail — the typo could sit unnoticed in source until someone
// removed the override. Validation now runs on every call regardless
// of which branch ultimately wins.
export function assertValidRuntimeDefInactivityTimeoutMs(agentDefault?: number): void {
  // Strict checked-in-config guard for `RuntimeAgentDef.inactivityTimeoutMs`.
  // Exported (and called by `resolveChatRunInactivityTimeoutMs` below)
  // so that chat-run startup can invoke this immediately after the
  // runtime def is selected — before any filesystem or
  // prompt-building work happens — and abort with a loud RangeError
  // when a checked-in def carries an invalid value. That keeps a
  // typo from leaving partial setup state (e.g. a `.mcp.json` write
  // / unlink, a freshly-composed system prompt) on disk when the
  // run then aborts later at watchdog-arm time.
  if (agentDefault === undefined) return;
  if (!Number.isFinite(agentDefault) || agentDefault < 0 || !Number.isInteger(agentDefault)) {
    throw new RangeError(
      `RuntimeAgentDef.inactivityTimeoutMs must be a non-negative integer, got ${String(agentDefault)}. ` +
        'Fix the runtime def — invalid values used to silently disable the watchdog.',
    );
  }
}

export function resolveChatRunInactivityTimeoutMs(agentDefault?: number) {
  assertValidRuntimeDefInactivityTimeoutMs(agentDefault);
  const env = Number(process.env.OD_CHAT_RUN_INACTIVITY_TIMEOUT_MS);
  if (Number.isFinite(env)) {
    return Math.min(MAX_CHAT_RUN_INACTIVITY_TIMEOUT_MS, Math.max(0, Math.floor(env)));
  }
  if (agentDefault !== undefined) {
    return Math.min(MAX_CHAT_RUN_INACTIVITY_TIMEOUT_MS, agentDefault);
  }
  return DEFAULT_CHAT_RUN_INACTIVITY_TIMEOUT_MS;
}

// Resolve the post-artifact quiet-period window. Same clamp as the outer
// inactivity watchdog so an oversized override doesn't get Node-downgraded
// to a 1ms timer. Exported so tests can pin the env behavior without
// reaching into chat-run internals.
export function resolveChatRunArtifactQuietPeriodMs() {
  const raw = Number(process.env.OD_CHAT_RUN_ARTIFACT_QUIET_PERIOD_MS);
  if (!Number.isFinite(raw)) return DEFAULT_CHAT_RUN_ARTIFACT_QUIET_PERIOD_MS;
  return Math.min(MAX_CHAT_RUN_INACTIVITY_TIMEOUT_MS, Math.max(0, Math.floor(raw)));
}

// Pure resolver for the chat run's *currently active* inactivity
// ceiling. Used by both `noteAgentActivity` and `noteArtifactRegistered`
// to pick between the pre-artifact watchdog and the shortened quiet
// period. Extracted so the `OD_CHAT_RUN_ARTIFACT_QUIET_PERIOD_MS=0`
// "disable the quiet period" semantics can be pinned with focused unit
// tests (#1451 review: a 0-value override must not strand the pre-artifact
// timer or stop further reschedules — it has to fall back to the
// pre-artifact ceiling so subsequent activity keeps refreshing the timer).
export function resolveActiveInactivityTimeoutMs(params: {
  inactivityTimeoutMs: number;
  artifactQuietPeriodMs: number;
  artifactRegistered: boolean;
}): number {
  if (params.artifactRegistered && params.artifactQuietPeriodMs > 0) {
    return params.artifactQuietPeriodMs;
  }
  return params.inactivityTimeoutMs;
}

// Pure final-status classifier for the chat run's child-close handler.
// Extracted so the per-branch invariants can be unit-tested without
// driving a full child process — in particular:
//   - cancel always wins over success/failure classification.
//   - the ACP forced-shutdown override is scoped to SIGTERM + clean
//     completion only (signed-32-bit-overflow SIGKILL or non-clean ACP
//     state still report `failed`).
//   - the artifact quiet-period override is gated on a daemon-initiated
//     flag, NOT on `artifactRegistered` alone — see #1451 review:
//     an external `kill -9` after the artifact write must still report
//     `failed`, only the watchdog-initiated SIGTERM/SIGKILL escalation
//     is allowed to flip the status to `succeeded`.
//   - the artifact-produced carve-out is EXIT-CODE ONLY (code != null &&
//     code !== 0): a non-zero *normal* exit that nonetheless wrote a
//     confirmed artifact this run is teardown noise, not a generation
//     failure. It deliberately never overrides a signal kill (code ===
//     null) — an OOM / external `kill` / container shutdown after an
//     artifact write stays `failed`, same guard as the quiet-period
//     branch above.
export function classifyChatRunCloseStatus(params: {
  cancelRequested: boolean;
  code: number | null;
  signal: NodeJS.Signals | string | null;
  acpCleanCompletion: boolean;
  artifactQuietShutdownRequested: boolean;
  turnCompletedCleanly: boolean;
  artifactProducedThisRun: boolean;
}): 'canceled' | 'succeeded' | 'failed' {
  if (params.cancelRequested) return 'canceled';
  if (params.code === 0) return 'succeeded';
  const acpForcedShutdown =
    params.acpCleanCompletion &&
    (
      (params.code === null && params.signal === 'SIGTERM') ||
      // Vela's ACP bridge can surface the daemon-triggered post-completion
      // teardown as a normal exit code 130 instead of a SIGTERM signal. Once
      // the ACP prompt already resolved cleanly, that is shutdown noise rather
      // than an agent execution failure.
      (params.code === 130 && params.signal === null)
    );
  if (acpForcedShutdown) return 'succeeded';
  const artifactQuietShutdown =
    params.artifactQuietShutdownRequested &&
    params.code === null &&
    (params.signal === 'SIGTERM' || params.signal === 'SIGKILL');
  if (artifactQuietShutdown) return 'succeeded';
  // Artifact-aware NORMAL-exit carve-out. A non-zero exit that still
  // produced a confirmed artifact this run (a SessionEnd hook or a late
  // stdin/stream error dragging the CLI to exit 1 *after* the deliverable
  // landed) is teardown noise, not a generation failure — reproduced by
  // project c92897e1: a 31KB HTML + .artifact.json on disk, status='failed'.
  // CRITICAL: gated on `code != null && code !== 0` so a signal kill
  // (code === null, SIGKILL/SIGTERM) is NEVER flipped by an artifact,
  // preserving the OOM / external-kill / container-shutdown guard.
  if (params.code != null && params.code !== 0 && params.artifactProducedThisRun) {
    return 'succeeded';
  }
  // Post-completion teardown carve-out (#3372). When the model already
  // emitted a clean terminal turn (a `turn_end`/`usage` event with no
  // outstanding host answer, the same condition that closes the child's
  // stdin), a later non-zero exit or kill signal is a teardown artifact,
  // not a generation failure: a SessionEnd hook the agent runs on its way
  // out (e.g. the Honcho memory plugin) can exit non-zero and drag the
  // whole `claude` process to `exit 1` long after the deliverable was
  // produced. Treating that as `failed` surfaces a red banner and halts
  // the flow for work that already succeeded. Same family as the ACP and
  // artifact-quiet-shutdown carve-outs above: the work completed; the odd
  // exit is teardown noise. This deliberately does NOT cover non-zero
  // exits *before* a clean turn — those stay `failed` (real CLI bug,
  // model error, mid-turn crash), and the agent-specific auth/quota/AMR
  // guards in the close handler run before this classifier so a genuine
  // post-turn auth failure is still surfaced with its specific code.
  if (params.turnCompletedCleanly) return 'succeeded';
  return 'failed';
}

type ClaudeStreamJsonBookkeepingRun = {
  stdinOpen?: boolean;
  turnCompletedCleanly?: boolean;
  child?: {
    stdin?: {
      destroyed?: boolean;
      end: () => void;
    } | null;
  } | null;
};

// Stream-json input mode keeps the child's stdin open across the turn so the
// daemon can stream further user messages mid-conversation. The child has no
// other way to know the turn is over, though — without an EOF it idles until
// the inactivity watchdog kills it. So when a turn terminates cleanly we close
// stdin to let the child exit.
export function applyClaudeStreamJsonRunBookkeeping(
  run: ClaudeStreamJsonBookkeepingRun,
  ev: unknown,
) {
  if (!ev || typeof ev !== 'object') return;
  const event = ev as {
    type?: unknown;
    name?: unknown;
    id?: unknown;
    stopReason?: unknown;
  };

  const cleanTerminalTurn =
    (event.type === 'turn_end' &&
      // `stop_reason: tool_use` means the model paused to wait for tool
      // execution (claude-code is about to run an internal tool). The
      // conversation is still in flight.
      event.stopReason !== 'tool_use') ||
    (event.type === 'usage' && event.stopReason !== 'tool_use');
  if (!cleanTerminalTurn) return;

  // Record clean completion even if stdin was already closed. The
  // close-status classifier reads this to ignore late SessionEnd hook
  // failures after the final assistant turn completed.
  run.turnCompletedCleanly = true;
  if (run.stdinOpen) {
    if (run.child?.stdin && !run.child.stdin.destroyed) {
      try { run.child.stdin.end(); } catch {}
    }
    run.stdinOpen = false;
  }
}

function resolveChatRunShutdownGraceMs() {
  const raw = Number(process.env.OD_CHAT_RUN_SHUTDOWN_GRACE_MS);
  if (!Number.isFinite(raw)) return 3_000;
  return Math.max(0, Math.floor(raw));
}

function resolveAcpStageTimeoutMs(): number | undefined {
  // Per-stage silence watchdog for ACP chat sessions. Defaults are owned by
  // `attachAcpSession` in acp.ts; this resolver only applies when an operator
  // sets `OD_ACP_STAGE_TIMEOUT_MS`. Bounded to the same 24h ceiling as the
  // outer chat inactivity watchdog so an oversized override doesn't get
  // clamped to 1ms by Node's signed-32-bit delay limit.
  const raw = Number(process.env.OD_ACP_STAGE_TIMEOUT_MS);
  if (!Number.isFinite(raw)) return undefined;
  return Math.min(MAX_CHAT_RUN_INACTIVITY_TIMEOUT_MS, Math.max(0, Math.floor(raw)));
}

type GeminiJsonEventStreamEvent = Record<string, unknown>;
type BufferedStdoutChunk = { text: string; receivedAt: number };

function parseGeminiJsonEventStreamEvents(text: string): GeminiJsonEventStreamEvent[] | null {
  const lines = text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return null;
  const events: GeminiJsonEventStreamEvent[] = [];
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
      events.push(obj as GeminiJsonEventStreamEvent);
    } catch {
      return null;
    }
  }
  return events;
}

function isGeminiJsonEventStream(events: GeminiJsonEventStreamEvent[] | null): boolean {
  if (!events || events.length === 0) return false;
  const [firstEvent] = events;
  if (
    !firstEvent ||
    firstEvent.type !== 'init' ||
    typeof firstEvent.session_id !== 'string' ||
    firstEvent.session_id.length === 0 ||
    typeof firstEvent.model !== 'string' ||
    firstEvent.model.length === 0
  ) {
    return false;
  }
  return events.every((event) => {
    const type = event?.type;
    return (
      type === 'init' ||
      type === 'message' ||
      type === 'tool_use' ||
      type === 'tool_result' ||
      type === 'error' ||
      type === 'result'
    );
  });
}

function geminiJsonEventStreamHasVisibleAssistantText(
  events: GeminiJsonEventStreamEvent[] | null,
): boolean {
  if (!events) return false;
  return events.some((event) => (
    event.type === 'message' &&
    event.role === 'assistant' &&
    typeof event.content === 'string' &&
    event.content.length > 0
  ));
}

export function bufferedAntigravityGeminiFirstTokenAt(
  chunks: readonly BufferedStdoutChunk[],
): number | null {
  if (chunks.length === 0) return null;
  const text = chunks.map((chunk) => chunk.text).join('');
  const events = parseGeminiJsonEventStreamEvents(text);
  if (!isGeminiJsonEventStream(events)) return null;
  if (!geminiJsonEventStreamHasVisibleAssistantText(events)) return null;

  let offset = 0;
  for (const line of text.split(/(\r?\n)/u)) {
    const nextOffset = offset + line.length;
    if (line.length > 0 && line.trim().length > 0) {
      try {
        const event = JSON.parse(line) as GeminiJsonEventStreamEvent;
        if (
          event?.type === 'message' &&
          event.role === 'assistant' &&
          typeof event.content === 'string' &&
          event.content.length > 0
        ) {
          let consumed = 0;
          for (const chunk of chunks) {
            consumed += chunk.text.length;
            if (consumed >= nextOffset) return chunk.receivedAt;
          }
          return chunks.at(-1)?.receivedAt ?? null;
        }
      } catch {
        return null;
      }
    }
    offset = nextOffset;
  }
  return null;
}

export async function startServer({
  port = 7456,
  host = normalizeDaemonBindHost(process.env.OD_BIND_HOST),
  returnServer = false,
  desktopPdfExporter = null,
  runtime = null,
}: StartServerOptions = {}) {
  host = normalizeDaemonBindHost(host);
  let resolvedPort = port;
  let daemonShuttingDown = false;
  const extraAllowedOrigins = configuredAllowedOrigins();

  // Plan §3.K1 / spec §15.7 — bound-API-token guard.
  //
  // The daemon refuses to bind to a public interface unless an
  // OD_API_TOKEN is set. This is the spec §16 Phase 5 safety floor:
  // a hosted operator can no longer accidentally publish an unsecured
  // daemon by setting OD_BIND_HOST=0.0.0.0 without a token.
  //
  // Loopback hosts (127.0.0.1 / ::1 / localhost) are always allowed —
  // the desktop / dev flow remains unchanged. Setting OD_API_TOKEN is
  // purely additive: when present, every /api/* request must carry a
  // matching `Authorization: Bearer <token>` header (loopback origins
  // are exempted so the desktop UI keeps working).
  const apiToken = apiTokenFromEnv();
  const apiAuthDisabled = isApiAuthDisabled();
  if (!isLoopbackHostname(host) && apiToken.length === 0 && !apiAuthDisabled) {
    throw new Error(
      `OD_BIND_HOST=${host} requires OD_API_TOKEN to be set. ` +
      `Generate one with \`openssl rand -hex 32\` and re-launch. ` +
      `(Loopback hosts 127.0.0.1 / ::1 / localhost do not need a token.) ` +
      `Set OD_DISABLE_API_AUTH=1 only when a trusted reverse proxy already authenticates every request.`,
    );
  }

  const app = express();
  installRouteRegistrationGuard(app);
  app.use(express.json({ limit: '4mb' }));
  const projectPreviewScopes = createProjectPreviewScopeRegistry();

  // Plan §3.K1 — bearer-token middleware.
  //
  // Active only when OD_API_TOKEN is set and API auth is not disabled.
  // Loopback origins skip the
  // check (the desktop UI / local CLI never carry a bearer); every
  // other request must present `Authorization: Bearer <token>` with a
  // value matching `OD_API_TOKEN`. Health / readiness / version remain
  // open so monitoring probes don't need the token. Server-minted
  // project preview asset scopes are also accepted for GETs so sandboxed
  // browser iframes can load HTML/CSS/JS without privileged headers.
  // Rich daemon status stays authenticated because it includes local
  // runtime paths.
  if (isApiTokenMiddlewareEnabled()) {
    const openProbePaths = new Set([
      '/health',
      '/api/health',
      '/ready',
      '/api/ready',
      '/version',
      '/api/version',
    ]);
    app.use('/api', (req, res, next) => {
      if (openProbePaths.has(req.path)) return next();
      if (req.method === 'GET') {
        const previewAsset = parseProjectPreviewAssetPath(req.path);
        if (
          previewAsset &&
          projectPreviewScopes.validate(previewAsset.projectId, previewAsset.scope)
        ) {
          return next();
        }
      }
      // Loopback short-circuit. We ignore the proxied X-Forwarded-For
      // header here because a reverse proxy MUST always forward the
      // bearer; the loopback bypass exists for the localhost desktop
      // UI which has no proxy in the path.
      if (isLoopbackPeerAddress(req.socket?.remoteAddress)) return next();
      const auth = req.get('authorization') ?? '';
      const match = /^Bearer\s+(\S+)\s*$/i.exec(auth);
      if (!match || match[1] !== apiToken) {
        return res.status(401).json({
          error: { code: 'API_TOKEN_REQUIRED', message: 'Authorization: Bearer <OD_API_TOKEN> required' },
        });
      }
      return next();
    });
  }

  // Multi-directory scanning shared by every skill / template surface. The
  // helpers delegate to listSkills(roots) which walks roots in priority
  // order, tags each entry with the SkillSource ('user' for the user
  // root, 'built-in' for the bundled root) the contracts package
  // declares, and lets a user-imported entry shadow a built-in one of
  // the same id without erasing the built-in copy.
  async function listAllSkills() {
    return listSkills(SKILL_ROOTS);
  }

  async function listAllDesignTemplates() {
    return listSkills(DESIGN_TEMPLATE_ROOTS);
  }

  // Spans both roots so chat run system-prompt composition and the orbit
  // template resolver can resolve a stored project.skillId regardless of
  // which surface created the project after the skills/design-templates
  // split. Keep in sync with SKILL_ROOTS + DESIGN_TEMPLATE_ROOTS above.
  async function listAllSkillLikeEntries() {
    return listSkills(ALL_SKILL_LIKE_ROOTS);
  }

  async function listAllDesignSystems() {
    const builtIn = (await listDesignSystems(DESIGN_SYSTEMS_DIR)).map((s) => ({
      ...s,
      source: 'built-in',
      isEditable: false,
      status: 'published',
    }));
    let installed = [];
    try {
      installed = await listDesignSystems(USER_DESIGN_SYSTEMS_DIR, {
        idPrefix: 'user:',
        source: 'user',
        isEditable: true,
        defaultStatus: 'draft',
      });
    } catch {
      // User directory may not exist yet or be unreadable.
    }
    const seen = new Set(builtIn.map((s) => s.id));
    return [
      ...installed
        .filter((s) => s.source === 'user')
        .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')),
      ...builtIn,
      ...installed.filter((s) => s.source !== 'user' && !seen.has(s.id)),
    ];
  }

  async function readAvailableDesignSystem(id) {
    if (typeof id === 'string' && id.startsWith('user:')) {
      return readDesignSystem(USER_DESIGN_SYSTEMS_DIR, id, { idPrefix: 'user:' });
    }
    return (
      (await readDesignSystem(DESIGN_SYSTEMS_DIR, id))
      ?? (await readDesignSystem(USER_DESIGN_SYSTEMS_DIR, id))
    );
  }

  async function readAvailableDesignSystemPackageInfo(id) {
    if (typeof id === 'string' && id.startsWith('user:')) {
      return readDesignSystemPackageInfo(USER_DESIGN_SYSTEMS_DIR, id, { idPrefix: 'user:' });
    }
    return (
      (await readDesignSystemPackageInfo(DESIGN_SYSTEMS_DIR, id))
      ?? (await readDesignSystemPackageInfo(USER_DESIGN_SYSTEMS_DIR, id))
    );
  }

  function isProjectUsableDesignSystem(summary) {
    return summary?.status !== 'draft';
  }

  async function validateProjectDesignSystemId(id) {
    if (id === undefined || id === null || id === '') return { ok: true, id: null };
    if (typeof id !== 'string') {
      return {
        ok: false,
        code: 'INVALID_DESIGN_SYSTEM',
        message: 'designSystemId must be a string or null',
      };
    }
    const systems = await listAllDesignSystems();
    const summary = systems.find((system) => system.id === id);
    if (!summary) {
      return {
        ok: false,
        code: 'DESIGN_SYSTEM_NOT_FOUND',
        message: 'design system not found',
      };
    }
    if (!isProjectUsableDesignSystem(summary)) {
      return {
        ok: false,
        code: 'DESIGN_SYSTEM_NOT_PUBLISHED',
        message: 'draft design systems cannot be used by projects',
      };
    }
    return { ok: true, id };
  }

  async function validateProjectSkillId(id) {
    if (id === undefined || id === null || id === '') {
      return { ok: true, id: null };
    }
    if (typeof id !== 'string') {
      return {
        ok: false,
        code: 'INVALID_SKILL_ID',
        message: 'skillId must be a string or null',
      };
    }
    const skills = await listAllSkillLikeEntries();
    const resolved = findSkillById(skills, id);
    if (!resolved) {
      return {
        ok: false,
        code: 'SKILL_NOT_FOUND',
        message: 'skill not found',
      };
    }
    return { ok: true, id: resolved.id };
  }

  function userDesignSystemWorkspaceProjectId(id) {
    if (typeof id !== 'string' || !id.startsWith('user:')) return null;
    const dirId = id.slice('user:'.length);
    if (!/^[A-Za-z0-9._-]{1,120}$/.test(dirId)) return null;
    return `ds-${dirId}`.slice(0, 128);
  }

  function projectBackedDesignSystemProjectId(id, summary) {
    if (typeof summary?.projectId === 'string' && isSafeId(summary.projectId)) {
      return summary.projectId;
    }
    return userDesignSystemWorkspaceProjectId(id);
  }

  async function ensureUserDesignSystemWorkspaceProject(db, id) {
    const systems = await listAllDesignSystems();
    const summary = systems.find((s) => s.id === id && s.source === 'user');
    if (!summary) return null;
    const projectId = projectBackedDesignSystemProjectId(id, summary);
    if (!projectId) return null;

    const now = Date.now();
    const metadata = {
      kind: 'other',
      importedFrom: 'design-system',
      entryFile: 'DESIGN.md',
      sourceFileName: id,
    };
    const existing = getProject(db, projectId);
    const project = existing
      ? updateProject(db, projectId, {
          name: summary.title,
          designSystemId: id,
          metadata: { ...existing.metadata, ...metadata },
          updatedAt: now,
        })
      : insertProject(db, {
          id: projectId,
          name: summary.title,
          skillId: null,
          designSystemId: id,
          pendingPrompt: null,
          metadata,
          createdAt: now,
          updatedAt: now,
        });
    if (!project) return null;

    const files = await listUserDesignSystemFiles(USER_DESIGN_SYSTEMS_DIR, id);
    if (!files) return null;
    for (const file of files) {
      if (file.kind === 'folder') continue;
      const detail = await readUserDesignSystemFile(USER_DESIGN_SYSTEMS_DIR, id, file.path);
      if (!detail) continue;
      if (existing) {
        try {
          const existingFile = await readProjectFile(PROJECTS_DIR, projectId, detail.path, project.metadata);
          if (!isReplaceableDesignSystemWorkspaceFile(detail.path, existingFile)) continue;
        } catch (err) {
          if (!err || err.code !== 'ENOENT') throw err;
        }
      }
      await writeProjectFile(
        PROJECTS_DIR,
        projectId,
        detail.path,
        Buffer.from(detail.content, 'utf8'),
        {},
        project.metadata,
      );
    }
    await removeLegacyDesignSystemWorkspaceArtifacts(project);
    await linkUserDesignSystemProject(USER_DESIGN_SYSTEMS_DIR, id, project.id);
    const projectFiles = await listFiles(PROJECTS_DIR, projectId, { metadata: project.metadata });
    return { project, files: projectFiles };
  }

  function isReplaceableDesignSystemWorkspaceFile(filePath, file) {
    const buffer = file?.buffer;
    if (!Buffer.isBuffer(buffer)) return false;
    const text = buffer.toString('utf8');
    if (/^ui_kits\/app\/components\/.+\.(jsx|tsx|js|ts|css|html)$/u.test(filePath)) {
      return buffer.length < 700 && /od-ui-kit-[a-z-]+/u.test(text);
    }
    if (!/^(DESIGN\.md|README\.md|SKILL\.md|ui_kits\/app\/README\.md)$/u.test(filePath)) {
      return false;
    }
    return hasLegacyDesignSystemPackageReferences(text);
  }

  function hasLegacyDesignSystemPackageReferences(text) {
    return /preview\/(colors-node-types|colors-ui-palette|typography-scale|spacing-system|logo-variants)\.html|ui_kits\/generated_interface(?:\/index\.html|\/)?/u.test(text);
  }

  async function removeLegacyDesignSystemWorkspaceArtifacts(project) {
    if (project?.metadata?.importedFrom !== 'design-system') return;
    const dir = resolveProjectDir(PROJECTS_DIR, project.id, project.metadata);
    for (const artifact of LEGACY_DESIGN_SYSTEM_ARTIFACTS) {
      const replacementReady = await Promise.all(
        artifact.replacementPaths.map(async (replacementPath) => {
          try {
            const stats = await fs.promises.stat(path.join(dir, ...replacementPath.split('/')));
            return stats.isFile();
          } catch (err) {
            if (!err || (err.code !== 'ENOENT' && err.code !== 'ENOTDIR')) throw err;
            return false;
          }
        }),
      );
      if (!replacementReady.every(Boolean)) continue;
      await fs.promises.rm(path.join(dir, ...artifact.legacyPath.split('/')), {
        recursive: artifact.removeDirectory === true,
        force: true,
      });
    }
  }

  async function readDesignSystemWorkspaceTextFile(db, summary, filePath) {
    if (!summary?.projectId || !isSafeId(summary.projectId)) return null;
    const project = getProject(db, summary.projectId);
    if (!project) return null;
    try {
      const file = await readProjectFile(
        PROJECTS_DIR,
        project.id,
        filePath,
        project.metadata,
      );
      const text = file.buffer.toString('utf8');
      if (text.includes('\0')) return null;
      return text;
    } catch {
      return null;
    }
  }

  // Chrome may strip the port from the Origin header on same-origin GET
  // requests. Only use this as a fallback for safe, idempotent GET requests;
  // mutating routes always require an exact origin/host match.
  function isPortlessLoopbackOrigin(origin) {
    return /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])$/.test(origin);
  }

  // Routes that serve content to sandboxed iframes (Origin: null) for
  // read-only purposes.  All other /api routes reject Origin: null.
  const _NULL_ORIGIN_SAFE_GET_RE =
    /^\/projects\/[^/]+\/(?:raw|preview)\/|^\/codex-pets\/[^/]+\/spritesheet$|^\/asset-cache$/;

  // Reject cross-origin requests to API endpoints.
  // Health/version remain open for monitoring probes.
  // Non-browser clients (no Origin header) are always allowed.
  app.use('/api', (req, res, next) => {
    // Live artifact previews have stricter local-daemon validation and
    // loopback CORS handling on the route itself. Let that middleware produce
    // the structured error shape and preflight headers for preview embeds.
    if (/^\/live-artifacts\/[^/]+\/preview$/.test(req.path)) return next();

    const origin = req.headers.origin;
    // Non-browser client → allow.
    if (origin == null || origin === '') return next();

    // Origin: null (sandboxed iframes).  Only allowed for safe, read-only
    // routes that set their own CORS headers for canvas drawing.
    if (origin === 'null') {
      const isSafeReadOnly =
        req.method === 'GET' && _NULL_ORIGIN_SAFE_GET_RE.test(req.path);
      if (!isSafeReadOnly) {
        return res.status(403).json({ error: 'Origin: null not allowed for this route' });
      }
      return next();
    }

    // Fail-closed: block all browser origins until port is resolved.
    if (!resolvedPort) {
      return res.status(403).json({ error: 'Server initializing' });
    }

    const ports = allowedBrowserPorts(resolvedPort);
    if (!isAllowedBrowserOrigin(origin, req.headers.host, ports, host, extraAllowedOrigins)) {
      if (req.method !== 'GET' || !isPortlessLoopbackOrigin(String(origin))) {
        return res.status(403).json({ error: 'Cross-origin requests are not allowed' });
      }
    }
    next();
  });
  const db = openDatabase(PROJECT_ROOT, { dataDir: RUNTIME_DATA_DIR });
  const pluginInstallation = createPluginInstallationHelpers({
    db,
    installFromLocalFolder,
    PLUGIN_REGISTRY_ROOTS,
    PLUGIN_LOCKFILE_PATH,
    PLUGIN_UPLOAD_MAX_BYTES,
  });
  // Wire the upload-destination bridge to this db so multer can route
  // file uploads into baseDir-rooted projects' actual folders.
  projectMetadataLookup = (id) => {
    try { return getProject(db, id)?.metadata ?? null; } catch { return null; }
  };
  configureConnectorCredentialStore(new FileConnectorCredentialStore(RUNTIME_DATA_DIR));
  configureComposioConfigStore(RUNTIME_DATA_DIR);
  composioConnectorProvider.configureCatalogCache(RUNTIME_DATA_DIR);
  composioConnectorProvider.startCatalogRefreshLoop();

  // RoutineService persistence is a thin adapter over the SQLite helpers.
  // Routines are stored as DB rows; the service holds in-memory timers and
  // delegates "list me everything" / "record a run" back to SQLite.
  routineService = new RoutineService({
    list: () => listRoutines(db).map((row) => routineDbRowToContract(row, null)),
    insertRun: (run, options) => {
      const row = {
        id: run.id,
        routineId: run.routineId,
        trigger: run.trigger,
        status: run.status,
        projectId: run.projectId,
        conversationId: run.conversationId,
        agentRunId: run.agentRunId,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        summary: run.summary,
        error: run.error,
        errorCode: run.errorCode,
      };
      if (options?.scheduledSlotAt != null) {
        return Boolean(insertScheduledRoutineRun(db, row, options.scheduledSlotAt));
      }
      insertRoutineRun(db, row);
      return true;
    },
    updateRun: (id, patch) => {
      updateRoutineRun(db, id, patch);
    },
    getLatestRun: (routineId) => getLatestRoutineRun(db, routineId),
  });
  let daemonUrl = `http://127.0.0.1:${port}`;

  // Boot reconcile: any critique_runs row left in 'running' state by a prior
  // daemon crash gets flipped to 'interrupted' with rounds_json.recoveryReason
  // = 'daemon_restart' so the spec's daemon-restart-mid-run failure mode is
  // honored on every boot. staleAfterMs comes from CritiqueConfig, not a
  // hardcoded constant.
  const reconciledStaleRuns = reconcileStaleRuns(db, { staleAfterMs: critiqueCfg.totalTimeoutMs });
  if (reconciledStaleRuns > 0) {
    console.warn(`[critique] reconcileStaleRuns flipped ${reconciledStaleRuns} stale running row(s) to interrupted`);
  }
  const mediaReconcile = reconcileMediaTasksOnBoot(db, {
    terminalTtlMs: TASK_TTL_AFTER_DONE_MS,
  });
  if (mediaReconcile.interrupted > 0 || mediaReconcile.deleted > 0) {
    console.warn(
      `[media] reconcileMediaTasksOnBoot interrupted ${mediaReconcile.interrupted} task(s), ` +
        `deleted ${mediaReconcile.deleted} expired terminal task(s)`,
    );
  }
  mediaTasks.clear();
  for (const row of listRecentMediaTasks(db, { terminalTtlMs: TASK_TTL_AFTER_DONE_MS })) {
    hydrateMediaTask(row);
  }

  if (process.env.OD_CODEX_DISABLE_PLUGINS === '1') {
    console.log('[od] Codex plugins disabled via OD_CODEX_DISABLE_PLUGINS=1');
  }

  let bundledMarketplaceEntries = [];
  // Plan §3.I3 / spec §23.3.5 — register every plugin under
  // <resourceRoot>/plugins/_official/** in packaged runs, or
  // <projectRoot>/plugins/_official/** in workspace runs, as bundled plugins. The walker
  // is idempotent (upserts on every boot) so a daemon upgrade rotates
  // the bundled set in lockstep with the code. ENOENT is silent —
  // running the daemon outside the dev tree just skips this step.
  try {
    const result = await registerBundledPlugins({
      db,
      bundledRoot: BUNDLED_PLUGINS_DIR,
      marketplaceProvenance: {
        sourceMarketplaceId: OFFICIAL_MARKETPLACE_ID,
        marketplaceTrust:    'official',
        entryNamePrefix:     'open-design',
      },
    });
    bundledMarketplaceEntries = result.registered.map((plugin) => ({
      name:        `open-design/${plugin.id}`,
      title:       plugin.title,
      title_i18n:  plugin.manifest.title_i18n,
      description: plugin.manifest.description,
      description_i18n: plugin.manifest.description_i18n,
      version:     plugin.version,
      source:      bundledPluginRegistrySource(plugin.source),
      publisher:   { id: 'open-design', url: 'https://open-design.ai' },
      homepage:    plugin.manifest.homepage,
      license:     plugin.manifest.license,
      tags:        plugin.manifest.tags,
      capabilitiesSummary: Array.isArray(plugin.manifest.od?.capabilities)
        ? plugin.manifest.od.capabilities
        : undefined,
    }));
    if (result.registered.length > 0) {
      console.log(`[plugins] registered ${result.registered.length} bundled plugin(s)`);
    }
    if (result.warnings.length > 0) {
      for (const w of result.warnings) console.warn(`[plugins] bundled warn: ${w}`);
    }
  } catch (err) {
    console.warn(`[plugins] bundled registration failed: ${(err)?.message ?? err}`);
  }

  try {
    const seedDirs = await fs.promises.readdir(PLUGIN_REGISTRY_DIR, { withFileTypes: true }).catch((err) => {
      if (err?.code === 'ENOENT') return [];
      throw err;
    });
    const { ensureMarketplaceManifest } = await import('./plugins/marketplaces.js');
    for (const dirent of seedDirs) {
      if (!dirent.isDirectory()) continue;
      const id = dirent.name;
      const manifestText = await marketplaceSeedManifestText(id, bundledMarketplaceEntries);
      if (!manifestText) continue;
      const configured = defaultMarketplaceSeedConfig(id);
      const result = ensureMarketplaceManifest(db, {
        id,
        url: configured.url,
        trust: configured.trust,
        manifestText,
      });
      if (result.ok) {
        console.log(`[plugins] seeded ${id} registry source (${result.row.manifest.plugins.length} plugin(s))`);
      } else {
        console.warn(`[plugins] ${id} registry seed failed: ${result.message}`);
      }
    }
  } catch (err) {
    console.warn(`[plugins] registry seed failed: ${(err)?.message ?? err}`);
  }

  // Plan §3.A5 / spec §16 Phase 5 / PB2: periodic snapshot GC. Disabled
  // when OD_SNAPSHOT_GC_INTERVAL_MS is 0; otherwise one-time bootstrap
  // sweep + interval. The function returns a NOOP_HANDLE when disabled
  // so we don't have to branch on the result.
  const snapshotGc = startSnapshotGc({ db });
  // One immediate sweep so a daemon that just gained the ALTER doesn't
  // wait the full interval before reaping pre-existing expired rows.
  try {
    const initialSweep = pruneExpiredSnapshots(db);
    if (initialSweep.removed > 0) {
      console.log(`[plugins] snapshot GC startup sweep removed ${initialSweep.removed} row(s)`);
    }
  } catch (err) {
    console.warn(`[plugins] snapshot GC startup sweep failed: ${(err)?.message ?? err}`);
  }
  void snapshotGc; // keep handle alive for the daemon's lifetime

  // Warm agent-capability probes (e.g. whether the installed Claude Code
  // build advertises --include-partial-messages) so the first /api/chat
  // hits a populated cache even if /api/agents hasn't been called yet.
  void readAppConfig(RUNTIME_DATA_DIR)
    .then((config) => {
      orbitService.configure(config.orbit);
      return detectAgents(config.agentCliEnv ?? {});
    })
    .catch(() => detectAgents().catch(() => {}));

  await recoverStaleLiveArtifactRefreshes({ projectsRoot: PROJECTS_DIR }).catch((error) => {
    console.warn('[od] Failed to recover stale live artifact refreshes:', error);
  });

  if (fs.existsSync(STATIC_DIR)) {
    app.use(express.static(STATIC_DIR));
  }

  app.get('/api/health', async (_req, res) => {
    const versionInfo = await readCurrentAppVersionInfo();
    res.json({ ok: true, version: versionInfo.version });
  });

  app.get('/api/ready', async (_req, res) => {
    const versionInfo = await readCurrentAppVersionInfo();
    const ready = !daemonShuttingDown;
    res.status(ready ? 200 : 503).json({
      ok: ready,
      ready,
      version: versionInfo.version,
    });
  });

  app.get('/api/version', async (_req, res) => {
    const version = await readCurrentAppVersionInfo();
    res.json({ version });
  });

  app.get('/api/github/open-design', async (_req, res) => {
    try {
      const stats = await readOpenDesignGithubRepoStats();
      const payload = /** @type {OpenDesignGithubRepoResponse} */ ({
        repo: 'nexu-io/open-design',
        stargazers_count: stats.stargazersCount,
        fetchedAt: stats.fetchedAt,
        stale: stats.stale,
      });
      res.json(payload);
    } catch (error) {
      res.status(502).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.get('/api/github/open-design/releases/latest', async (_req, res) => {
    try {
      const release = await readOpenDesignLatestReleaseInfo();
      const payload = /** @type {OpenDesignGithubLatestReleaseResponse} */ ({
        repo: 'nexu-io/open-design',
        tag_name: release.tagName,
        html_url: release.htmlUrl,
        fetchedAt: release.fetchedAt,
        stale: release.stale,
      });
      res.json(payload);
    } catch (error) {
      res.status(502).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.get('/api/community/discord', async (_req, res) => {
    try {
      const presence = await readOpenDesignDiscordPresence();
      const payload = /** @type {OpenDesignDiscordPresenceResponse} */ ({
        inviteCode: OPEN_DESIGN_DISCORD_INVITE_CODE,
        inviteUrl: OPEN_DESIGN_DISCORD_INVITE_URL,
        onlineCount: presence.onlineCount,
        memberCount: presence.memberCount,
        fetchedAt: presence.fetchedAt,
        stale: presence.stale,
      });
      res.json(payload);
    } catch (error) {
      res.status(502).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Plan §3.F2 / spec §11.7 — daemon lifecycle status. Returns the
  // host / port the server is bound to plus the data dir,
  // so `od daemon status --json` can render a one-shot health snapshot
  // without depending on /api/version's content shape.
  app.get('/api/daemon/status', async (_req, res) => {
    const versionInfo = await readCurrentAppVersionInfo();
    res.json({
      ok: true,
      version: versionInfo.version,
      bindHost: host,
      port: resolvedPort,
      dataDir: RUNTIME_DATA_DIR,
      mediaConfigDir: process.env.OD_MEDIA_CONFIG_DIR ?? null,
      sandboxMode: SANDBOX_RUNTIME.enabled,
      sandbox: SANDBOX_RUNTIME.enabled
        ? { enabled: true, roots: SANDBOX_RUNTIME.roots }
        : { enabled: false },
      pid: process.pid,
      shuttingDown: daemonShuttingDown,
      installedPlugins: (() => {
        try {
          return (db.prepare('SELECT COUNT(*) AS n FROM installed_plugins').get())?.n ?? 0;
        } catch {
          return 0;
        }
      })(),
    });
  });

  // Plan §3.GG1 — `od daemon db status`. Inventory of the SQLite
  // backend: file path, size on disk (primary + WAL + SHM), schema
  // version (the user_version PRAGMA we use for migrations), and
  // per-table row counts. Useful for ops sanity-checking
  // deployments + comparing 'expected' vs. 'actual' table rosters.
  app.get('/api/daemon/db', async (_req, res) => {
    try {
      const { inspectSqliteDatabase } = await import('./storage/db-inspect.js');
      const file = path.join(RUNTIME_DATA_DIR, 'app.sqlite');
      const report = await inspectSqliteDatabase({ db, file });
      res.json(report);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  registerPluginEventRoutes(app, {
    http: { requireLocalDaemonRequest },
  });

  // Plan §3.NN1 — `od plugin events purge`. Operator escape
  // hatch for resetting the in-memory ring buffer. Loopback-only
  // because clearing the buffer drops audit history; an operator
  // with shell access to the daemon machine should be the only
  // one allowed to invoke. Returns the pre-purge stats so the
  // caller can confirm what they discarded.
  // PR #3157: surface the Antigravity OAuth flow as a one-click action
  // in the chat's AGENT_AUTH_REQUIRED banner. agy's `-p` print mode
  // can't complete the Google Sign-In flow on its own (no input field
  // for the auth code), so OD opens a system Terminal running `agy`
  // for the user; they finish OAuth there, then retry the chat. The
  // endpoint is loopback-gated and only supports antigravity because
  // (a) we hardcode `agy` as the command, and (b) opening a new
  // Terminal window is a visible side effect we don't want anyone
  // hand-rolling for every agent that ships a CLI.
  app.post('/api/agents/:agentId/oauth-launch', requireLocalDaemonRequest, async (req, res) => {
    const agentId = req.params.agentId;
    if (agentId !== 'antigravity') {
      return res.status(400).json({
        ok: false,
        error: `oauth-launch is only supported for antigravity, got ${agentId}`,
      });
    }
    try {
      const { launchAgentInSystemTerminal } = await import('./runtimes/terminal-launch.js');
      const result = await launchAgentInSystemTerminal('agy');
      if (result.ok) {
        return res.json({ ok: true, platform: result.platform, via: result.via });
      }
      return res.status(500).json({
        ok: false,
        platform: result.platform,
        error: result.reason,
      });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: String(err),
      });
    }
  });


  // Plan §3.LL1 — `od daemon db verify`. Runs SQLite
  // PRAGMA integrity_check (or quick_check when ?quick=1) +
  // PRAGMA foreign_key_check, returns a structured issues[]
  // report. Loopback-only via requireLocalDaemonRequest because
  // the result reveals storage-layer state.
  app.post('/api/daemon/db/verify', requireLocalDaemonRequest, async (req, res) => {
    try {
      const { verifySqliteIntegrity } = await import('./storage/db-inspect.js');
      const quick = String(req.query.quick ?? '').toLowerCase();
      const report = verifySqliteIntegrity({ db, quick: quick === '1' || quick === 'true' });
      res.json(report);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Plan §3.HH2 — `od daemon db vacuum`. Runs SQLite VACUUM to
  // reclaim space after large delete batches (snapshot prune,
  // plugin uninstall, etc.). Reports before / after sizes so the
  // operator sees the reclamation, plus elapsed ms so a slow
  // VACUUM on a big DB is visible.
  app.post('/api/daemon/db/vacuum', requireLocalDaemonRequest, async (_req, res) => {
    try {
      const { inspectSqliteDatabase } = await import('./storage/db-inspect.js');
      const file = path.join(RUNTIME_DATA_DIR, 'app.sqlite');
      const before = await inspectSqliteDatabase({ db, file });
      const startedAt = Date.now();
      // VACUUM cannot run inside an active transaction; better-sqlite3
      // exposes it as a regular pragma exec.
      db.exec('VACUUM');
      const elapsedMs = Date.now() - startedAt;
      const after = await inspectSqliteDatabase({ db, file });
      res.json({
        ok: true,
        beforeBytes: before.sizeBytes,
        afterBytes:  after.sizeBytes,
        reclaimedBytes: Math.max(0, before.sizeBytes - after.sizeBytes),
        elapsedMs,
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Plan §3.F2 — graceful shutdown. The CLI calls this from
  // `od daemon stop`; the actual close path goes through the same
  // SIGTERM-equivalent flow as a parent-process kill (the boot wrapper
  // in cli.ts wires the process listeners). 202 Accepted because the
  // shutdown completes after the response flush.
  app.post('/api/daemon/shutdown', requireLocalDaemonRequest, (_req, res) => {
    res.status(202).json({ ok: true, scheduled: true });
    setImmediate(() => {
      try {
        process.emit('SIGTERM');
      } catch {
        // Best-effort; if the listener was removed (or the process is
        // mid-shutdown already) the kernel SIGTERM falls back below.
      }
    });
  });

  // Prometheus scrape endpoint (Phase 12). Returns the full exposition
  // format string. Operators put this behind their existing auth proxy;
  // there is no built-in authn on the daemon HTTP server. To disable
  // the endpoint entirely (air-gapped installs, regulatory contexts),
  // set `OD_METRICS_ENDPOINT=disabled`; the route is registered only
  // when that env value is not the literal string 'disabled'.
  if (process.env.OD_METRICS_ENDPOINT !== 'disabled') {
    app.get('/api/metrics', async (_req, res) => {
      res.setHeader('Content-Type', register.contentType);
      res.send(await getCritiqueMetrics());
    });
  }

  // Phase 16 ratchet endpoint. Returns the rolling conformance window
  // and the ratchet's current recommendation. Operator-driven by
  // design: the recommendation does not flip OD_CRITIQUE_ROLLOUT_PHASE
  // automatically, it surfaces so a deploy-pipeline follow-up can
  // consume it. Tunables come from query string; defaults are the
  // spec values (14 days, 0.90 shipped, 0.95 clean-parse).
  // Codex + lefarcen P1 on PR #1499: clamp query inputs before the
  // evaluator sees them so a request like `?windowDays=0` falls back to
  // the spec default rather than producing a zero-evidence promotion.
  // The evaluator also defends at its own entry; both are intentional
  // (belt + suspenders) so a future caller that bypasses this route
  // cannot reach an unguarded code path either.
  const parsePositiveInt = (raw: unknown, fallback: number): number => {
    if (typeof raw !== 'string' || raw.length === 0) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
  };
  const parseRate = (raw: unknown, fallback: number): number => {
    if (typeof raw !== 'string' || raw.length === 0) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 && n <= 1 ? n : fallback;
  };
  app.get('/api/critique/conformance', async (req, res) => {
    try {
      const windowDays = parsePositiveInt(req.query.windowDays, 14);
      const shippedThreshold = parseRate(req.query.shippedThreshold, 0.90);
      const cleanParseThreshold = parseRate(req.query.cleanParseThreshold, 0.95);
      const history = await readConformanceHistory(RUNTIME_DATA_DIR, windowDays);
      const decision = evaluateRollout({
        current: parseRolloutPhase(process.env.OD_CRITIQUE_ROLLOUT_PHASE),
        history,
        windowDays,
        shippedThreshold,
        cleanParseThreshold,
      });
      res.json({ window: { days: windowDays, history }, decision });
    } catch (err) {
      sendApiError(res, 500, 'INTERNAL_ERROR', err instanceof Error ? err.message : String(err));
    }
  });

  registerConnectorRoutes(app, {
    sendApiError,
    authorizeToolRequest,
    projectsRoot: PROJECTS_DIR,
    requireLocalDaemonRequest,
    composio: composioConnectorProvider,
  });

  // Gate the diagnostics export behind requireLocalDaemonRequest so it stays
  // unreachable when daemon binds to a non-loopback address (Tailscale,
  // 0.0.0.0, etc.). The bundle contains daemon/web/desktop logs, host
  // metadata, and crash reports — same threat tier as connector / live-
  // artifact endpoints, which all use the same guard.
  app.get(
    DIAGNOSTICS_EXPORT_PATH,
    requireLocalDaemonRequest,
    createDiagnosticsExportHandler({
      runtime,
      projectRoot: PROJECT_ROOT,
      runsDir: path.join(RUNTIME_DATA_DIR, 'runs'),
      dataDir: RUNTIME_DATA_DIR,
    }),
  );

  // ---- Projects (DB-backed) -------------------------------------------------


  registerMemoryRoutes(app, {
    http: { createSseResponse, requireLocalDaemonRequest },
    paths: { RUNTIME_DATA_DIR, PROJECT_ROOT, PROJECTS_DIR },
    appConfig: { readAppConfig },
  });

  registerAutomationRoutes(app, {
    paths: { RUNTIME_DATA_DIR },
  });

  // Reconcile follow-up — the inline POST /api/projects body that lived
  // on garnet (with baseDir privilege check, linkedDirs validation,
  // template snapshot seeding, plugin snapshot resolution with default
  // scenario fallback) is intentionally dropped here. main moved project
  // route registration into `./project-routes.js` via PR #1043, so the
  // simple project-create surface is wired through `registerProjectRoutes`
  // further down. Plugin-snapshot-resolution / default-scenario-fallback
  // from garnet need to be re-integrated into project-routes.ts as a
  // follow-up — see reconcile decision log.
  // (legacy POST /api/projects body deleted — see registerProjectRoutes below.)

  const analyticsService = createAnalyticsService({ dataDir: RUNTIME_DATA_DIR });
  const design = {
    runs: createChatRunService({
      createSseResponse,
      createSseErrorPayload,
      runsLogDir: path.join(RUNTIME_DATA_DIR, 'runs'),
    }),
    analytics: analyticsService,
    getAppVersion: () => cachedAppVersion?.version ?? '0.0.0',
    readAnalyticsContext,
  };

  // Interactive Terminal sessions (node-pty). In-memory, process-local, and
  // killed on daemon shutdown — see shutdownDaemonRuns below.
  const terminalService = createTerminalService();

  // PostHog runtime config.
  //
  // - `enabled` reflects ONLY the user's consent toggle (Privacy → "Share
  //   usage data"). When false, posthog-js's full autocapture/$pageview/
  //   $autocapture pipeline must stay off — that's the privacy contract.
  //
  // - `key` and `host` are populated whenever the server has a build-time
  //   POSTHOG_KEY, regardless of consent. The error-tracking module
  //   (apps/web/src/analytics/error-tracking.ts) reads them to ship
  //   `$exception` events directly to the ingest endpoint, bypassing the
  //   consent gate. Product decision: error reports always flow so we
  //   don't lose ground truth on stability — see the privacy section of
  //   Settings → Privacy for the user-facing copy.
  //
  // - When the build itself has no POSTHOG_KEY (forks, PR builds, OSS
  //   contributors), `key` and `host` are null and even the error
  //   pipeline becomes a no-op.
  app.get('/api/analytics/config', async (_req, res) => {
    const baseline = readPublicConfigResponse();
    if (!baseline.enabled) {
      // No build-time key → nothing to report on, consent or not.
      res.json(baseline);
      return;
    }
    try {
      const appCfg = await readAppConfig(RUNTIME_DATA_DIR);
      const consentGranted = appCfg.telemetry?.metrics === true;
      // Echo the installationId so the web client uses the same anonymous
      // id PostHog already saw on prior runs (and that Langfuse uses too).
      const installationId =
        typeof appCfg.installationId === 'string' && appCfg.installationId
          ? appCfg.installationId
          : null;
      res.json({
        enabled: consentGranted,
        env: baseline.env,
        key: baseline.key,
        host: baseline.host,
        installationId,
      });
    } catch {
      // If the config file is unreadable, fail closed for analytics but
      // still let the error tracker run — exception reports are the most
      // valuable signal in a degraded-state scenario.
      res.json({
        enabled: false,
        env: baseline.env,
        key: baseline.key,
        host: baseline.host,
        installationId: null,
      });
    }
  });

  // Cross-process safety-event bridge. Used by:
  //   - Electron main process (renderer crash via render-process-gone)
  //   - Any future helper / sidecar that needs to report a safety event
  //     without owning its own posthog-node client
  //
  // The route DOES NOT check the user's analytics consent: this is the
  // same "safety telemetry always flows" contract the web error-tracking
  // module relies on. If POSTHOG_KEY is not set on the daemon (fork
  // builds), captureSafety is a no-op on NOOP_SERVICE.
  app.post('/api/observability/event', express.json({ limit: '64kb' }), (req, res) => {
    const body = (req.body ?? {}) as Partial<ObservabilityEventRequest>;
    const eventName = typeof body.event === 'string' ? body.event.trim() : '';
    if (!eventName) {
      res.status(400).json({ error: 'missing or invalid `event` field' });
      return;
    }
    const properties =
      body.properties != null && typeof body.properties === 'object' && !Array.isArray(body.properties)
        ? (body.properties as Record<string, unknown>)
        : {};
    analyticsService.captureSafety({
      eventName,
      appVersion: cachedAppVersion?.version ?? '0.0.0',
      properties,
    });
    res.json({ ok: true });
  });

  // Daemon-side uncaught errors. Without these, a crash in any daemon
  // request handler or background task leaves no PostHog signal — the
  // user sees a 500 (or worse, a connection drop) and we see nothing.
  // Both listeners install AFTER the analyticsService is created so the
  // captureSafety dispatch path is guaranteed to be ready.
  //
  // IMPORTANT — these handlers MUST keep Node's fatal-exit semantics.
  // Installing an `uncaughtException` listener silences Node's default
  // crash/exit path, and Node 15+ does the same for `unhandledRejection`
  // when a listener is present (the `--unhandled-rejections=throw` mode
  // only fires when nothing has subscribed). We bounded-flush posthog-
  // node and then call `process.exit(1)` explicitly so the supervisor
  // (pm2, packaged updater, dev `tools-dev`) gets a fresh process and
  // we don't leave a half-broken daemon answering requests with state
  // corruption. See codex review on PR #2527 (Siri-Ray).
  const FATAL_FLUSH_TIMEOUT_MS = 1000;
  let fatalShuttingDown = false;
  const triggerFatalShutdown = (
    eventName: string,
    properties: Record<string, unknown>,
  ): void => {
    if (fatalShuttingDown) return;
    fatalShuttingDown = true;
    // CRITICAL — wait for captureSafety to ENQUEUE the event in
    // posthog-node's local buffer before starting shutdown(). The
    // captureSafety implementation does an `await readInstallationIdSafe()`
    // before calling `client.capture()`; a sync fire-and-forget here would
    // race shutdown() ahead of that await, drain an empty queue, and lose
    // the crash event itself. See codex review on PR #2527 (Siri-Ray).
    const flushSequence = (async () => {
      try {
        await analyticsService.captureSafety({
          eventName,
          appVersion: cachedAppVersion?.version ?? '0.0.0',
          properties,
        });
      } catch {
        // capture must never block the exit path
      }
      await analyticsService.shutdown();
    })();
    // Race the enqueue+shutdown sequence against a bounded timeout. If
    // posthog-node hangs on a slow flush (or the installationId read
    // hangs on the filesystem) we still die in bounded time — the
    // supervisor will restart us, which is the whole point.
    void Promise.race([
      flushSequence,
      new Promise<void>((resolve) => {
        const handle = setTimeout(resolve, FATAL_FLUSH_TIMEOUT_MS);
        handle.unref?.();
      }),
    ]).finally(() => {
      process.exitCode = 1;
      process.exit(1);
    });
  };
  process.on('uncaughtException', (error) => {
    triggerFatalShutdown('daemon_uncaught_exception', {
      error_message: error?.message ?? String(error),
      error_name: error?.name ?? 'Error',
      // Stack truncation: 8 KB ceiling to keep the ingest payload bounded
      // even when the stack contains huge native frames. Most actionable
      // stacks fit in well under 2 KB.
      error_stack: typeof error?.stack === 'string' ? error.stack.slice(0, 8192) : undefined,
    });
  });
  process.on('unhandledRejection', (reason) => {
    const asError = reason instanceof Error ? reason : null;
    triggerFatalShutdown('daemon_unhandled_rejection', {
      error_message: asError?.message ?? (typeof reason === 'string' ? reason : String(reason)),
      error_name: asError?.name ?? 'NonErrorRejection',
      error_stack: typeof asError?.stack === 'string' ? asError.stack.slice(0, 8192) : undefined,
    });
  });

  // Tracks runs whose finalized assistant message has already been forwarded
  // to Langfuse so repeated message updates only emit one final trace per run.
  // Terminal fallback reports intentionally do not claim this set; a delayed
  // telemetry-finalized message can still replace the synthetic fallback.
  const reportedRuns = new Set();

  // App-version snapshot read once at server start for Langfuse trace metadata.
  let cachedAppVersion = null;
  void (async () => {
    try {
      cachedAppVersion = await readCurrentAppVersionInfo();
      await observePendingInstallerApplyAttempts({
        analytics: analyticsService,
        appVersion: cachedAppVersion.version,
        currentChannel: cachedAppVersion.channel,
        currentVersion: cachedAppVersion.version,
        dataRoot: RUNTIME_DATA_DIR,
        logger: console,
        namespace: process.env[SIDECAR_ENV.NAMESPACE] ?? SIDECAR_DEFAULTS.namespace,
      });
    } catch {
      // Telemetry is best-effort; appVersion is omitted when unavailable.
    }
  })();

  const reportFinalizedMessage = createFinalizedMessageTelemetryReporter({
    design,
    db,
    dataDir: RUNTIME_DATA_DIR,
    reportedRuns,
    getAppVersion: () => cachedAppVersion,
  });
  const reportRunCompletionTelemetryFallback = ({
    analyticsContext,
    run,
    status,
  }: {
    analyticsContext: any;
    run: any;
    status: string;
  }) => {
    if (!shouldReportRunCompletionTelemetryFallbackStatus(status)) return;
    const timer = setTimeout(() => {
      if (reportedRuns.has(run.id)) return;
      if (run.assistantMessageId) {
        const messageTelemetry = getMessageTelemetryFinalizationState(db, run.assistantMessageId);
        if (messageTelemetry.finalizedAt !== null) return;
      }
      reportFinalizedMessage(
        {
          id: run.assistantMessageId ?? `${run.id}-terminal`,
          conversationId: run.conversationId,
          endedAt: run.updatedAt,
          role: 'assistant',
          runId: run.id,
          runStatus: status,
        },
        { telemetryFinalized: true },
        {
          analyticsContext,
          conversationId: run.conversationId,
          projectId: run.projectId,
          reportTrigger: 'terminal_fallback',
        },
      );
    }, LANGFUSE_TERMINAL_FALLBACK_DELAY_MS);
    timer.unref?.();
  };

  const reportFeedback = (req: {
    runId: string;
    rating: 'positive' | 'negative';
    reasonCodes: string[];
    hasCustomReason: boolean;
    customReason: string;
    scoreMetadata?: Record<string, unknown>;
  }) =>
    reportRunFeedbackFromDaemon({
      dataDir: RUNTIME_DATA_DIR,
      ...req,
    });

  // DNS-aware wrapper. The sync `validateBaseUrl` only inspects the literal
  // hostname string, so a public DNS name pointing at an internal address
  // (`internal.example.com → 10.0.0.5`) still passes. We delegate to
  // `validateBaseUrlResolved` here so every proxy and finalize handler runs
  // the same resolved-IP check before issuing the upstream request.
  const validateExternalApiBaseUrl = (baseUrl) => validateBaseUrlResolved(baseUrl);

  const resolvedPortRef = {
    get current() {
      return resolvedPort;
    },
  };
  const daemonUrlRef = {
    get current() {
      return daemonUrl;
    },
  };
  const httpDeps = {
    sendApiError,
    sendMulterError,
    sendLiveArtifactRouteError,
    createSseResponse,
    getPublicBaseUrl,
    requireLocalDaemonRequest,
    isLocalSameOrigin,
    resolvedPortRef,
  };
  const pathDeps = {
    PROJECT_ROOT,
    PROJECTS_DIR,
    ARTIFACTS_DIR,
    RUNTIME_DATA_DIR,
    RUNTIME_DATA_DIR_CANONICAL,
    DESIGN_SYSTEMS_DIR,
    USER_DESIGN_SYSTEMS_DIR,
    DESIGN_TEMPLATES_DIR,
    USER_DESIGN_TEMPLATES_DIR,
    CRAFT_DIR,
    SKILLS_DIR,
    USER_SKILLS_DIR,
    PROMPT_TEMPLATES_DIR,
    BUNDLED_PETS_DIR,
    OD_BIN,
  };
  const nodeDeps = { fs, path };
  const idDeps = { randomId, randomUUID };
  const uploadDeps = { upload, importUpload, handleProjectUpload };
  const projectStoreDeps = {
    getProject,
    insertProject,
    updateProject,
    dbDeleteProject,
    removeProjectDir,
    validateLinkedDirs,
  };
  const projectFileDeps = {
    ensureProject,
    listFiles,
    listProjectFolders,
    createProjectFolder,
    deleteProjectFolder,
    searchProjectFiles,
    readProjectFile,
    resolveProjectDir,
    resolveProjectFilePath,
    parseByteRange,
    renameProjectFile,
    deleteProjectFile,
    writeProjectFile,
    sanitizeName,
    listTabs,
    setTabs,
  };
  const conversationDeps = {
    insertConversation,
    getConversation,
    listConversations,
    updateConversation,
    deleteConversation,
    listMessages,
    upsertMessage,
    listPreviewComments,
    upsertPreviewComment,
    updatePreviewCommentStatus,
    deletePreviewComment,
  };
  const templateDeps = { getTemplate, listTemplates, deleteTemplate, insertTemplate, findTemplateByNameAndProject, updateTemplate };
  const projectStatusDeps = {
    listLatestProjectRunStatuses,
    listProjectsAwaitingInput,
    normalizeProjectDisplayStatus,
    composeProjectDisplayStatus,
    listProjects,
  };
  const projectEventDeps = { subscribeFileEvents, activeProjectEventSinks };
  const importDeps = { importClaudeDesignZip, projectDir, detectEntryFile };
  const projectExportDeps = {
    buildProjectArchive,
    buildBatchArchive,
    buildDesktopPdfExportInput,
    desktopPdfExporter,
    daemonUrlRef,
    sanitizeArchiveFilename,
  };
  const artifactDeps = {
    sanitizeSlug,
    lintArtifact,
    renderFindingsForAgent,
    validateArtifactManifestInput,
  };
  const deployDeps = {
    VERCEL_PROVIDER_ID,
    CLOUDFLARE_PAGES_PROVIDER_ID,
    isDeployProviderId,
    publicDeployConfigForProvider,
    readDeployConfig,
    writeDeployConfig,
    listCloudflarePagesZones,
    DeployError,
    listDeployments,
    publicDeployments,
    getDeployment,
    getDeploymentById,
    buildDeployFileSet,
    cloudflarePagesProjectNameForDeploy,
    cloudflarePagesProjectNameFromDeployment,
    checkCloudflarePagesDeploymentLinks,
    checkDeploymentUrl,
    deployToCloudflarePages,
    deployToVercel,
    upsertDeployment,
    publicDeployment,
    cloudflarePagesDeploymentMetadata,
    prepareDeployPreflight,
  };
  const mediaDeps = {
    MEDIA_PROVIDERS,
    IMAGE_MODELS,
    VIDEO_MODELS,
    AUDIO_MODELS_BY_KIND,
    MEDIA_ASPECTS,
    VIDEO_LENGTHS_SEC,
    AUDIO_DURATIONS_SEC,
    readMaskedConfig,
    writeConfig,
    generateMedia,
    mediaTasks,
    createMediaTask: (taskId, projectId, info) => createMediaTask(db, taskId, projectId, info),
    persistMediaTask: (task) => persistMediaTask(db, task),
    appendTaskProgress: (task, line) => appendTaskProgress(db, task, line),
    notifyTaskWaiters: (task) => notifyTaskWaiters(db, task),
    getLiveMediaTask: (taskId) => getLiveMediaTask(db, taskId),
    mediaTaskSnapshot,
    listMediaTasksByProject,
    listElevenLabsVoiceOptions,
  };
  const appConfigDeps = { readAppConfig, writeAppConfig };
  const orbitDeps = { orbitService };
  const nativeDialogDeps = { openBrowser, openNativeFolderDialog };
  const researchDeps = { searchResearch, ResearchError };
  const liveArtifactDeps = {
    createLiveArtifact,
    listLiveArtifacts,
    updateLiveArtifact,
    refreshLiveArtifact,
    emitLiveArtifactEvent,
    emitLiveArtifactRefreshEvent,
    readLiveArtifactCode,
    setLiveArtifactCodeHeaders,
    ensureLiveArtifactPreview,
    setLiveArtifactPreviewHeaders,
    getLiveArtifact,
    listLiveArtifactRefreshLogEntries,
    deleteLiveArtifact,
  };
  const authDeps = {
    authorizeToolRequest,
    consumedImportNonces,
    desktopAuthSecret: getDesktopAuthSecret,
    isDesktopAuthGateActive,
    pruneExpiredImportNonces,
    optionalToolGrantFromRequest,
    requestProjectOverride,
    requestRunOverride,
    verifyDesktopImportToken,
  };
  const finalizeDeps = {
    defaultBaseUrlForFinalizeProtocol,
    finalizeDesignPackage,
    FinalizePackageLockedError,
    FinalizeUpstreamError,
    isFinalizeProviderProtocol,
    redactSecrets,
  };
  const handoffDeps = {
    synthesizeHandoffPrompt,
    FinalizeUpstreamError,
    TranscriptExportLockedError,
    EmptyTranscriptError,
    redactSecrets,
  };
  const validationDeps = { isSafeId, validateExternalApiBaseUrl, validateBaseUrl, validateProjectDesignSystemId, validateProjectSkillId };
  const agentDeps = {
    listProviderModels,
    testProviderConnection,
    testAgentConnection,
    getAgentDef,
    isKnownModel,
    sanitizeCustomModel,
  };
  const critiqueDeps = {
    handleCritiqueArtifact,
    handleCritiqueInterrupt,
    critiqueArtifactsRoot: CRITIQUE_ARTIFACTS_DIR,
    critiqueResponseCapBytes: critiqueCfg.parserMaxBlockBytes,
    critiqueRunRegistry,
  };

  // External services
  registerMcpRoutes(app, {
    http: httpDeps,
    paths: pathDeps,
    mcp: { pendingAuth: mcpPendingAuth, daemonUrlRef },
  });
  registerXaiRoutes(app, {
    http: httpDeps,
    paths: pathDeps,
  });
  // Project workspace
  registerActiveContextRoutes(app, {
    db,
    http: httpDeps,
    projectStore: projectStoreDeps,
  });
  registerHostToolsRoutes(app, {
    db,
    http: httpDeps,
    paths: pathDeps,
    projectStore: projectStoreDeps,
    projectFiles: projectFileDeps,
  });
  registerSocialShareRoutes(app, { http: httpDeps });
  registerProjectRoutes(app, {
    db,
    design,
    http: httpDeps,
    paths: pathDeps,
    projectStore: projectStoreDeps,
    projectFiles: projectFileDeps,
    conversations: conversationDeps,
    templates: templateDeps,
    status: projectStatusDeps,
    events: projectEventDeps,
    ids: idDeps,
    telemetry: { reportFinalizedMessage },
    appConfig: appConfigDeps,
    validation: validationDeps,
  });
  registerTerminalRoutes(app, {
    db,
    http: httpDeps,
    paths: pathDeps,
    projectStore: projectStoreDeps,
    projectFiles: projectFileDeps,
    terminals: terminalService,
  });
  registerImportRoutes(app, {
    db,
    http: httpDeps,
    uploads: uploadDeps,
    node: nodeDeps,
    ids: idDeps,
    paths: pathDeps,
    imports: importDeps,
    auth: authDeps,
    projectStore: projectStoreDeps,
    conversations: conversationDeps,
    projectFiles: projectFileDeps,
    validation: validationDeps,
  });

  // Resource catalog
  registerStaticResourceRoutes(app, {
    http: httpDeps,
    paths: pathDeps,
    resources: {
      listAllSkills,
      listAllDesignTemplates,
      listAllSkillLikeEntries,
      listAllDesignSystems,
      mimeFor,
    },
    tokenContractRebuild: {
      maybeStartForImportedDesignSystem: async (designSystemId) => {
        const preparation = await prepareDesignTokenContractRebuild(
          USER_DESIGN_SYSTEMS_DIR,
          designSystemId,
        );
        if (!preparation.revision) return { decision: preparation.decision };
        const job = designSystemGenerationJobs.rebuildTokenContract({
          designSystemId,
          decision: preparation.decision,
          ...preparation.revision,
        });
        return { decision: preparation.decision, job };
      },
    },
  });
  registerDesignSystemRoutes(app, {
    db,
    paths: pathDeps,
    projectStore: projectStoreDeps,
    projectFiles: projectFileDeps,
    designSystems: {
      createUserDesignSystem,
      deleteUserDesignSystem,
      ensureUserDesignSystemWorkspaceProject,
      listAllDesignSystems,
      listUserDesignSystemFiles,
      listUserDesignSystemRevisions,
      prepareDesignTokenContractRebuild,
      readAvailableDesignSystem,
      readAvailableDesignSystemPackageInfo,
      readDesignSystemWorkspaceTextFile,
      readUserDesignSystemFile,
      renderDesignSystemPreview,
      renderDesignSystemShowcase,
      updateUserDesignSystem,
      updateUserDesignSystemRevisionStatus,
    },
    generationJobs: designSystemGenerationJobs,
  });
  registerProjectArtifactRoutes(app, {
    http: httpDeps,
    uploads: uploadDeps,
    paths: pathDeps,
    node: nodeDeps,
    artifacts: artifactDeps,
  });
  registerLiveArtifactRoutes(app, {
    db,
    http: httpDeps,
    paths: pathDeps,
    auth: authDeps,
    liveArtifacts: liveArtifactDeps,
    projectStore: projectStoreDeps,
  });
  registerDesignSystemToolRoutes(app, {
    auth: authDeps,
    http: httpDeps,
    paths: pathDeps,
    projects: { getProject: (id: string) => getProject(db, id) },
  });
  app.use('/artifacts', express.static(ARTIFACTS_DIR));
  app.use(
    PLUGIN_PREVIEWS_ROUTE,
    express.static(PLUGIN_PREVIEWS_DIR, { maxAge: '1d', immutable: false }),
  );
  registerDeployRoutes(app, {
    db,
    http: httpDeps,
    paths: pathDeps,
    ids: idDeps,
    deploy: deployDeps,
    projectStore: projectStoreDeps,
  });
  registerFinalizeRoutes(app, {
    db,
    http: httpDeps,
    paths: pathDeps,
    projectStore: projectStoreDeps,
    validation: validationDeps,
    finalize: finalizeDeps,
  });
  registerHandoffRoutes(app, {
    db,
    http: httpDeps,
    paths: pathDeps,
    projectStore: projectStoreDeps,
    conversations: conversationDeps,
    validation: validationDeps,
    handoff: handoffDeps,
  });
  registerDeploymentCheckRoutes(app, { db, http: httpDeps, deploy: deployDeps });
  app.use('/frames', express.static(FRAMES_DIR));
  registerProjectExportRoutes(app, {
    db,
    http: httpDeps,
    paths: pathDeps,
    projectStore: projectStoreDeps,
    exports: projectExportDeps,
    projectFiles: projectFileDeps,
    validation: validationDeps,
  });
  registerProjectFileRoutes(app, {
    db,
    http: httpDeps,
    paths: pathDeps,
    uploads: uploadDeps,
    node: nodeDeps,
    projectStore: projectStoreDeps,
    projectFiles: projectFileDeps,
    documents: { buildDocumentPreview },
    artifacts: artifactDeps,
    projectPreviewScopes,
  });

  registerMediaRoutes(app, {
    db,
    design,
    http: httpDeps,
    paths: pathDeps,
    ids: idDeps,
    auth: authDeps,
    media: mediaDeps,
    appConfig: appConfigDeps,
    orbit: orbitDeps,
    nativeDialogs: nativeDialogDeps,
    projectStore: projectStoreDeps,
    projectFiles: projectFileDeps,
    conversations: conversationDeps,
    research: researchDeps,
  });

  app.delete('/api/projects/:id', async (req, res) => {
    try {
      dbDeleteProject(db, req.params.id);
      await removeProjectDir(PROJECTS_DIR, req.params.id).catch(() => {});
      /** @type {import('@open-design/contracts').OkResponse} */
      const body = { ok: true };
      res.json(body);
    } catch (err) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err));
    }
  });

  // SSE stream of file-changed events for a project. Drives preview live-reload.
  // Receipt of a `file-changed` event triggers a file-list refresh, which
  // propagates new mtimes through to FileViewer iframes (the URL-load
  // `?v=${mtime}` cache-bust from PR #384 then reloads the iframe automatically).
  // Subscribers come and go as users open/close project tabs; the underlying
  // chokidar watcher is refcounted in project-watchers.ts so we never hold
  // descriptors for projects no UI is looking at.
  app.get('/api/projects/:id/events', (req, res) => {
    if (!getProject(db, req.params.id)) {
      return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'not found');
    }
    let sub;
    try {
      const sse = createSseResponse(res);
      const projectEventSink = (payload) => {
        sse.send(payload.type, payload);
      };
      let sinks = activeProjectEventSinks.get(req.params.id);
      if (!sinks) {
        sinks = new Set();
        activeProjectEventSinks.set(req.params.id, sinks);
      }
      sinks.add(projectEventSink);
      const watchProject = getProject(db, req.params.id);
      sub = subscribeFileEvents(PROJECTS_DIR, req.params.id, (evt) => {
        sse.send('file-changed', evt);
      }, { metadata: watchProject?.metadata });
      sub.ready.then(() => sse.send('ready', { projectId: req.params.id })).catch(() => {});
      const cleanup = () => {
        if (sub) {
          const { unsubscribe } = sub;
          sub = null;
          Promise.resolve(unsubscribe()).catch(() => {});
        }
        const currentSinks = activeProjectEventSinks.get(req.params.id);
        currentSinks?.delete(projectEventSink);
        if (currentSinks?.size === 0) activeProjectEventSinks.delete(req.params.id);
      };
      res.on('close', cleanup);
      res.on('finish', cleanup);
    } catch (err) {
      if (sub) Promise.resolve(sub.unsubscribe()).catch(() => {});
      if (!res.headersSent) sendApiError(res, 400, 'BAD_REQUEST', String(err?.message || err));
    }
  });

  // ---- Conversations --------------------------------------------------------

  app.get('/api/projects/:id/conversations', (req, res) => {
    if (!getProject(db, req.params.id)) {
      return res.status(404).json({ error: 'project not found' });
    }
    res.json({ conversations: listConversations(db, req.params.id) });
  });

  app.post('/api/projects/:id/conversations', (req, res) => {
    if (!getProject(db, req.params.id)) {
      return res.status(404).json({ error: 'project not found' });
    }
    const { title, seedFromConversationId, forkAfterMessageId } = req.body || {};
    const now = Date.now();
    const hasExplicitSessionMode = Boolean(
      req.body && Object.prototype.hasOwnProperty.call(req.body, 'sessionMode'),
    );
    const requestedForkMessageId =
      typeof forkAfterMessageId === 'string' && forkAfterMessageId
        ? forkAfterMessageId
        : null;
    const sourceConversation =
      typeof seedFromConversationId === 'string' && seedFromConversationId
        ? getConversation(db, seedFromConversationId)
        : null;
    let seedMessages = [];
    if (sourceConversation && sourceConversation.projectId === req.params.id) {
      seedMessages = listMessages(db, seedFromConversationId);
      if (requestedForkMessageId) {
        const forkIndex = seedMessages.findIndex((message) => message.id === requestedForkMessageId);
        if (forkIndex < 0) {
          return res.status(404).json({ error: 'fork message not found' });
        }
        seedMessages = seedMessages.slice(0, forkIndex + 1);
      }
    } else if (requestedForkMessageId) {
      return res.status(404).json({ error: 'fork source conversation not found' });
    }
    const sessionMode =
      hasExplicitSessionMode
        ? normalizeConversationSessionMode(req.body.sessionMode)
        : sourceConversation && sourceConversation.projectId === req.params.id
          ? normalizeConversationSessionMode(sourceConversation.sessionMode)
          : 'design';
    const conv = insertConversation(db, {
      id: randomId(),
      projectId: req.params.id,
      title: typeof title === 'string' ? title.trim() || null : null,
      sessionMode,
      createdAt: now,
      updatedAt: now,
    });
    if (conv && seedMessages.length > 0) {
      for (const m of seedMessages) {
        upsertMessage(db, conv.id, {
          ...m,
          id: randomId(),
          runId: undefined,
          runStatus: undefined,
          lastRunEventId: undefined,
        });
      }
    }
    res.json({ conversation: conv });
  });

  app.patch('/api/projects/:id/conversations/:cid', (req, res) => {
    const conv = getConversation(db, req.params.cid);
    if (!conv || conv.projectId !== req.params.id) {
      return res.status(404).json({ error: 'not found' });
    }
    const updated = updateConversation(db, req.params.cid, req.body || {});
    res.json({ conversation: updated });
  });

  app.delete('/api/projects/:id/conversations/:cid', (req, res) => {
    const conv = getConversation(db, req.params.cid);
    if (!conv || conv.projectId !== req.params.id) {
      return res.status(404).json({ error: 'not found' });
    }
    deleteConversation(db, req.params.cid);
    res.json({ ok: true });
  });

  // ---- Messages -------------------------------------------------------------

  app.get('/api/projects/:id/conversations/:cid/messages', (req, res) => {
    const conv = getConversation(db, req.params.cid);
    if (!conv || conv.projectId !== req.params.id) {
      return res.status(404).json({ error: 'conversation not found' });
    }
    res.json({ messages: listMessages(db, req.params.cid) });
  });

  app.put('/api/projects/:id/conversations/:cid/messages/:mid', (req, res) => {
    const conv = getConversation(db, req.params.cid);
    if (!conv || conv.projectId !== req.params.id) {
      return res.status(404).json({ error: 'conversation not found' });
    }
    const m = req.body || {};
    if (m.id && m.id !== req.params.mid) {
      return res.status(400).json({ error: 'id mismatch' });
    }
    const saved = upsertMessage(db, req.params.cid, {
      ...m,
      id: req.params.mid,
    });
    // Bump the parent project's updatedAt so the project list re-orders.
    updateProject(db, req.params.id, {});
    reportFinalizedMessage(saved, m, {
      analyticsContext: readAnalyticsContext(req),
      projectId: req.params.id,
      conversationId: req.params.cid,
    });
    res.json({ message: saved });
  });

  // ---- Preview comments ----------------------------------------------------

  app.get('/api/projects/:id/conversations/:cid/comments', (req, res) => {
    const conv = getConversation(db, req.params.cid);
    if (!conv || conv.projectId !== req.params.id) {
      return res.status(404).json({ error: 'conversation not found' });
    }
    res.json({
      comments: listPreviewComments(db, req.params.id, req.params.cid),
    });
  });

  app.post('/api/projects/:id/conversations/:cid/comments', (req, res) => {
    const conv = getConversation(db, req.params.cid);
    if (!conv || conv.projectId !== req.params.id) {
      return res.status(404).json({ error: 'conversation not found' });
    }
    try {
      const comment = upsertPreviewComment(
        db,
        req.params.id,
        req.params.cid,
        req.body || {},
      );
      updateProject(db, req.params.id, {});
      res.json({ comment });
    } catch (err) {
      res.status(400).json({ error: String(err?.message || err) });
    }
  });

  app.patch(
    '/api/projects/:id/conversations/:cid/comments/:commentId',
    (req, res) => {
      const conv = getConversation(db, req.params.cid);
      if (!conv || conv.projectId !== req.params.id) {
        return res.status(404).json({ error: 'conversation not found' });
      }
      try {
        const comment = updatePreviewCommentStatus(
          db,
          req.params.id,
          req.params.cid,
          req.params.commentId,
          req.body?.status,
        );
        if (!comment)
          return res.status(404).json({ error: 'comment not found' });
        updateProject(db, req.params.id, {});
        res.json({ comment });
      } catch (err) {
        res.status(400).json({ error: String(err?.message || err) });
      }
    },
  );

  app.delete(
    '/api/projects/:id/conversations/:cid/comments/:commentId',
    (req, res) => {
      const conv = getConversation(db, req.params.cid);
      if (!conv || conv.projectId !== req.params.id) {
        return res.status(404).json({ error: 'conversation not found' });
      }
      const ok = deletePreviewComment(
        db,
        req.params.id,
        req.params.cid,
        req.params.commentId,
      );
      if (!ok) return res.status(404).json({ error: 'comment not found' });
      updateProject(db, req.params.id, {});
      res.json({ ok: true });
    },
  );

  async function resolveAmrModelProbe() {
    const appConfig = await readAppConfig(RUNTIME_DATA_DIR);
    const configuredEnv = agentCliEnvForAgent(appConfig.agentCliEnv, 'amr');
    const def = getAgentDef('amr');
    if (!def) throw new Error('AMR runtime definition is missing');
    const agentLaunch = resolveAgentLaunch(def, configuredEnv);
    const launchPath = agentLaunch.launchPath ?? agentLaunch.selectedPath;
    if (!launchPath) throw new Error('AMR vela binary could not be resolved');
    const env = applyAgentLaunchEnv(
      spawnEnvForAgent(
        def.id,
        {
          ...process.env,
          ...(def.env || {}),
        },
        configuredEnv,
        undefined,
      ),
      agentLaunch,
    );
    const credentialRevision = readVelaCredentialRevision(process.env, configuredEnv);
    const cacheKey = JSON.stringify({
      launchPath,
      home: env.HOME ?? env.USERPROFILE ?? '',
      openDesignAmrProfile: env.OPEN_DESIGN_AMR_PROFILE ?? '',
      velaProfile: env.VELA_PROFILE ?? '',
      velaLinkUrl: env.VELA_LINK_URL ?? '',
      velaRuntimeKey: env.VELA_RUNTIME_KEY ?? '',
      velaOpencodeBin: env.VELA_OPENCODE_BIN ?? '',
      credentialRevision,
    });
    return { launchPath, env, configuredEnv, cacheKey };
  }

  registerVelaRoutes(app, {
    paths: { RUNTIME_DATA_DIR },
    appConfig: { readAppConfig },
    http: { getPublicBaseUrl },
    env: process.env,
  });

  const pluginRouteHelpers = {
    PLUGIN_PREVIEWS_DIR,
    applyBakedPreviews,
    pluginUpload,
    pluginInstallation,
    sendMulterError,
    decodeMultipartFilename,
    connectorService,
    buildConnectorProbe,
    loadPluginRegistryView,
    requireLocalDaemonRequest,
    getProject,
    sendApiError,
    isLocalSameOrigin,
    resolvedPortRef,
    pluginShareTaskStore,
    installOrUpgradePlugin: async (req, res, mode) => {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const id = req.params.id;
      let source = '';
      let marketplaceResolution = null;
      if (mode === 'upgrade') {
        const policy = body.policy === 'pinned' ? 'pinned' : 'latest';
        const plugin = getInstalledPlugin(db, id);
        if (!plugin) return res.status(404).json({ error: { code: 'plugin-not-found', message: `No installed plugin with id "${id}".`, data: { id } } });
        if (plugin.sourceKind === 'bundled') return res.status(409).json({ error: { code: 'bundled-plugin', message: `Plugin "${id}" was shipped bundled with the daemon and upgrades only via daemon-image upgrade. The bundled boot walker re-registers bundled plugins on every boot.`, data: { id, sourceKind: plugin.sourceKind } } });
        source = plugin.source;
        if (policy === 'latest' && plugin.sourceMarketplaceEntryName) {
          const { resolvePluginInMarketplaces } = await import('./plugins/marketplaces.js');
          marketplaceResolution = resolvePluginInMarketplaces(db, plugin.sourceMarketplaceEntryName);
          if (marketplaceResolution) source = marketplaceResolution.source;
        }
        if (!source) return res.status(409).json({ error: { code: 'missing-source', message: `Plugin "${id}" has no recorded install source — cannot upgrade. Reinstall via 'od plugin install --source <...>' to set one.`, data: { id } } });
      } else {
        source = typeof body.source === 'string' ? body.source : '';
        if (!source) return res.status(400).json({ error: 'source is required' });
        const looksAbsolute = source.startsWith('/') || source.startsWith('./') || source.startsWith('~');
        const looksGithub = source.startsWith('github:');
        const looksHttps = /^https:\/\//i.test(source);
        if (!looksAbsolute && !looksGithub && !looksHttps) {
          const { resolvePluginInMarketplaces } = await import('./plugins/marketplaces.js');
          let lookupName = source;
          const lockfile = await readPluginLockfile(PLUGIN_LOCKFILE_PATH);
          const locked = lockfile.plugins[source];
          if (locked?.version && !source.includes('@')) lookupName = `${source}@${locked.version}`;
          const resolved = resolvePluginInMarketplaces(db, lookupName);
          if (!resolved) return res.status(404).json({ error: { code: 'plugin-not-found', message: `No marketplace plugin named "${source}". Add a marketplace via 'od marketplace add <url>' or pass a github: / https:// / local source.`, data: { name: source } } });
          marketplaceResolution = resolved;
          source = resolved.source;
        }
      }
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();
      const writeEvent = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      if (mode === 'upgrade') writeEvent('progress', { kind: 'progress', phase: 'resolving', message: `Upgrading ${id} from ${source} (policy=${body.policy === 'pinned' ? 'pinned' : 'latest'})` });
      try {
        const basePlugin = mode === 'upgrade' ? getInstalledPlugin(db, id) : null;
        for await (const ev of installPlugin(db, {
          source,
          roots: PLUGIN_REGISTRY_ROOTS,
          ...(mode === 'upgrade' ? { eventKind: 'upgraded' } : {}),
          sourceMarketplaceId: marketplaceResolution?.marketplaceId ?? basePlugin?.sourceMarketplaceId,
          sourceMarketplaceEntryName: marketplaceResolution?.pluginName ?? basePlugin?.sourceMarketplaceEntryName,
          sourceMarketplaceEntryVersion: marketplaceResolution?.pluginVersion ?? basePlugin?.sourceMarketplaceEntryVersion,
          marketplaceTrust: marketplaceResolution?.marketplaceTrust ?? basePlugin?.marketplaceTrust,
          resolvedSource: marketplaceResolution?.source ?? basePlugin?.resolvedSource,
          resolvedRef: marketplaceResolution?.ref ?? basePlugin?.resolvedRef,
          manifestDigest: marketplaceResolution?.manifestDigest ?? basePlugin?.manifestDigest,
          archiveIntegrity: marketplaceResolution?.archiveIntegrity ?? basePlugin?.archiveIntegrity,
          lockfilePath: PLUGIN_LOCKFILE_PATH,
        })) {
          writeEvent(ev.kind, ev);
          if (ev.kind === 'success' || ev.kind === 'error') break;
        }
      } catch (err) {
        writeEvent('error', { kind: 'error', message: String(err), warnings: [] });
      } finally {
        res.end();
      }
    },
    handleShareProject: async (req, res) => {
      try {
        const sourcePlugin = getInstalledPlugin(db, req.params.id);
        if (!sourcePlugin) return sendApiError(res, 404, 'NOT_FOUND', 'plugin not found');
        if (!USER_PLUGIN_SOURCE_KINDS.has(sourcePlugin.sourceKind)) return res.status(409).json({ ok: false, code: 'plugin-not-shareable', message: 'Only user-installed plugins can start a share project.' });
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const action = normalizePluginShareAction(body.action);
        if (!action) return sendApiError(res, 400, 'BAD_REQUEST', 'action must be publish-github or contribute-open-design');
        const actionPluginId = PLUGIN_SHARE_ACTION_PLUGIN_IDS[action];
        const actionPlugin = getInstalledPlugin(db, actionPluginId);
        if (!actionPlugin) return res.status(409).json({ ok: false, code: 'share-action-plugin-missing', message: `The bundled action plugin "${actionPluginId}" is not installed. Restart the daemon so bundled plugins are registered.` });
        const now = Date.now(); const id = randomId(); const cid = randomId(); const sourceSlug = githubRepoNameFromPluginName(sourcePlugin.id); const stagedPath = `plugin-source/${sourceSlug}`; const prompt = renderPluginSharePrompt({ action, sourcePlugin, stagedPath }); const metadata = { kind: 'prototype' }; const projectRoot = await ensureProject(PROJECTS_DIR, id, metadata); await copyPluginFolderForProjectContext(sourcePlugin.fsPath, path.join(projectRoot, 'plugin-source', sourceSlug));
        insertProject(db, { id, name: `${PLUGIN_SHARE_ACTION_LABELS[action]}: ${sourcePlugin.title || sourcePlugin.id}`, skillId: null, designSystemId: null, pendingPrompt: prompt, metadata, createdAt: now, updatedAt: now });
        insertConversation(db, { id: cid, projectId: id, title: null, createdAt: now, updatedAt: now });
        const registry = await loadPluginRegistryView(); const connectorProbe = buildConnectorProbe(connectorService); const resolved = resolvePluginSnapshot({ db, body: { pluginId: actionPluginId, pluginInputs: { source_plugin_id: sourcePlugin.id, source_plugin_title: sourcePlugin.title || sourcePlugin.id, source_plugin_version: sourcePlugin.version, source_plugin_path: sourcePlugin.fsPath, plugin_context_path: stagedPath }, locale: typeof body.locale === 'string' ? body.locale : undefined }, projectId: id, conversationId: cid, registry, connectorProbe });
        if (resolved && !resolved.ok) return res.status(resolved.status).json(resolved.body);
        const project = getProject(db, id); if (!project) return sendApiError(res, 500, 'INTERNAL_ERROR', 'created project could not be loaded');
        res.json({ ok: true, project, conversationId: cid, ...(resolved?.ok ? { appliedPluginSnapshotId: resolved.snapshotId } : {}), actionPluginId, sourcePluginId: sourcePlugin.id, stagedPath, prompt, message: `Created a ${PLUGIN_SHARE_ACTION_LABELS[action]} task for ${sourcePlugin.title || sourcePlugin.id}.` });
      } catch (err) { res.status(400).json({ ok: false, message: String(err?.message || err) }); }
    },
    handlePluginTrust: async (req, res) => {
      try {
        const plugin = getInstalledPlugin(db, req.params.id); if (!plugin) return res.status(404).json({ error: 'plugin not found' });
        const body = req.body && typeof req.body === 'object' ? req.body : {}; const action = body.action === 'revoke' ? 'revoke' : 'grant';
        const { validateCapabilityList, grantCapabilities, revokeCapabilities } = await import('./plugins/trust.js');
        const { accepted, rejected } = validateCapabilityList(body.capabilities);
        if (rejected.length > 0) return res.status(400).json({ error: { code: 'invalid-capability', message: `Capability validation failed: ${rejected.map((r) => r.capability).join(', ')}`, data: { rejected } } });
        if (accepted.length === 0) return res.status(400).json({ error: { code: 'no-capabilities', message: 'capabilities[] is required and must contain at least one entry' } });
        const next = action === 'revoke' ? revokeCapabilities({ db, pluginId: req.params.id, capabilities: accepted }) : grantCapabilities({ db, pluginId: req.params.id, capabilities: accepted });
        const updated = getInstalledPlugin(db, req.params.id);
        try { const { recordPluginEvent } = await import('./plugins/events.js'); recordPluginEvent({ kind: 'plugin.trust-changed', pluginId: req.params.id, details: { action, capabilities: accepted, total: next.length } }); } catch {}
        res.status(action === 'grant' ? 201 : 200).json({ ok: true, id: req.params.id, action, capabilitiesGranted: next, plugin: updated });
      } catch (err) { res.status(500).json({ error: String(err) }); }
    },
    handlePluginStats: async (res) => {
      try { const { pluginInventoryStats, snapshotInventoryStats } = await import('./plugins/stats.js'); const installed = listInstalledPlugins(db); const inventoryRows = db.prepare(`SELECT status, project_id, run_id, applied_at FROM applied_plugin_snapshots`).all(); res.json({ plugins: pluginInventoryStats(installed), snapshots: snapshotInventoryStats(inventoryRows), generatedAt: Date.now() }); } catch (err) { res.status(500).json({ error: String(err) }); }
    },
    handleAppliedPluginExport: async (req, res) => {
      try { const body = req.body && typeof req.body === 'object' ? req.body : {}; const target = body.target === 'od' || body.target === 'claude-plugin' || body.target === 'agent-skill' ? body.target : null; if (!target) return res.status(400).json({ error: 'target must be one of: od, claude-plugin, agent-skill' }); const outDir = typeof body.outDir === 'string' && body.outDir.length > 0 ? body.outDir : null; if (!outDir) return res.status(400).json({ error: 'outDir is required' }); const { exportPlugin, ExportError } = await import('./plugins/export.js'); try { const result = await exportPlugin({ db, target, outDir, ...(typeof body.snapshotId === 'string' ? { snapshotId: body.snapshotId } : {}), ...(typeof body.projectId === 'string' ? { projectId: body.projectId } : {}) }); res.json({ ok: true, ...result }); } catch (err) { if (err instanceof ExportError) return res.status(404).json({ error: err.message }); throw err; } } catch (err) { res.status(500).json({ error: String(err) }); }
    },
    handleProjectInstallFolder: async (req, res) => {
      try { const project = getProject(db, req.params.id); if (!project) return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found'); const body = req.body && typeof req.body === 'object' ? req.body : {}; const relativePath = normalizeProjectPluginFolderPath(body.path); const projectRoot = resolveProjectDir(PROJECTS_DIR, req.params.id, project.metadata); const folder = await resolveProjectChildDirectory(projectRoot, relativePath); const warnings = []; const log = []; let plugin = null; let message = 'Install finished.'; for await (const ev of installPlugin(db, { source: folder, roots: PLUGIN_REGISTRY_ROOTS })) { if (ev.message) log.push(ev.message); if (Array.isArray(ev.warnings)) warnings.splice(0, warnings.length, ...ev.warnings); if (ev.kind === 'success') { plugin = ev.plugin; message = `Installed ${ev.plugin.title}.`; break; } if (ev.kind === 'error') { message = ev.message; break; } } res.status(plugin ? 200 : 400).json({ ok: Boolean(plugin), plugin, warnings, message, log }); } catch (err) { const code = err && err.code; const status = code === 'ENOENT' || code === 'ENOTDIR' ? 404 : 400; sendApiError(res, status, status === 404 ? 'PLUGIN_FOLDER_NOT_FOUND' : 'BAD_REQUEST', String(err?.message || err)); }
    },
    handleProjectPluginCli: async (req, res, action) => {
      try { const project = getProject(db, req.params.id); if (!project) return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found'); const body = req.body && typeof req.body === 'object' ? req.body : {}; const relativePath = normalizeProjectPluginFolderPath(body.path); const projectRoot = resolveProjectDir(PROJECTS_DIR, req.params.id, project.metadata); const folder = await resolveProjectChildDirectory(projectRoot, relativePath); const subcommand = action === 'publish-github' ? 'publish-repo' : 'open-design-pr'; const timeout = action === 'publish-github' ? 240_000 : 300_000; const result = await execCommandViaLoginShell(OD_NODE_BIN, [OD_BIN, 'plugin', subcommand, folder, '--json'], { timeout }); const payload = result.stdout ? JSON.parse(result.stdout) : null; if (!result.ok || !payload?.ok) return res.status(500).json({ ok: false, code: payload?.error?.label || (action === 'publish-github' ? 'publish-repo-failed' : 'open-design-pr-failed'), message: payload?.error?.stderr || payload?.error?.stdout || (action === 'publish-github' ? 'GitHub repo publish failed.' : 'Open Design PR creation failed.'), log: payload?.steps?.map((step) => step.stderr || step.stdout || step.command).filter(Boolean) ?? [result.stderr || result.stdout || `${subcommand} failed`] }); res.json({ ok: true, message: action === 'publish-github' ? (payload.repoUrl ? `Published plugin to ${payload.repoUrl}.` : 'Published plugin to GitHub.') : (payload.prUrl ? `Opened Open Design PR flow at ${payload.prUrl}.` : 'Opened Open Design PR flow.'), ...(payload.repoUrl ? { url: payload.repoUrl } : {}), ...(payload.prUrl ? { url: payload.prUrl } : {}), log: payload.steps?.map((step) => step.stderr || step.stdout || step.command).filter(Boolean) ?? [] }); } catch (err) { res.status(400).json({ ok: false, message: String(err?.message || err), log: [] }); }
    },
    handleCandidateDraft: async (req, res) => {
      if (!isLocalSameOrigin(req, resolvedPort)) return res.status(403).json({ error: 'cross-origin request rejected' });
      try { const project = getProject(db, req.params.id); if (!project) return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found'); const projectRoot = resolveProjectDir(PROJECTS_DIR, req.params.id, project.metadata); const result = await generateSkillPluginDraft(db, projectRoot, req.params.id, req.params.candidateId); if (!result) return sendApiError(res, 404, 'NOT_FOUND', 'plugin candidate not found'); res.status(result.ok ? 200 : 422).json(result); } catch (err) { res.status(400).json({ ok: false, message: String(err?.message || err) }); }
    },
    handleCandidateShareTask: async (req, res) => {
      if (!isLocalSameOrigin(req, resolvedPort)) return res.status(403).json({ error: 'cross-origin request rejected' });
      try { const project = getProject(db, req.params.id); if (!project) return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found'); const body = req.body && typeof req.body === 'object' ? req.body : {}; const action = body.action === 'publish-github' || body.action === 'contribute-open-design' ? body.action : null; if (!action) return sendApiError(res, 400, 'BAD_REQUEST', 'plugin share action is required'); const projectRoot = resolveProjectDir(PROJECTS_DIR, req.params.id, project.metadata); const draft = await generateSkillPluginDraft(db, projectRoot, req.params.id, req.params.candidateId); if (!draft) return sendApiError(res, 404, 'NOT_FOUND', 'plugin candidate not found'); if (!draft.validation.ok) return res.status(422).json({ ok: false, code: 'plugin-draft-invalid', message: 'Generated plugin draft is invalid.', draft }); const task = pluginShareTaskStore.createAndStart(req.params.id, { action, path: draft.draftPath }, draft.folder); res.status(202).json({ taskId: task.id, action, path: draft.draftPath, status: task.status, startedAt: task.startedAt, draft }); } catch (err) { res.status(400).json({ ok: false, message: String(err?.message || err) }); }
    },
    handleProjectShareTask: async (req, res) => {
      if (!isLocalSameOrigin(req, resolvedPort)) return res.status(403).json({ error: 'cross-origin request rejected' });
      try { const project = getProject(db, req.params.id); if (!project) return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found'); const body = req.body && typeof req.body === 'object' ? req.body : {}; const action: PluginShareAction | null = body.action === 'publish-github' || body.action === 'contribute-open-design' ? body.action : null; if (!action) return sendApiError(res, 400, 'BAD_REQUEST', 'plugin share action is required'); const relativePath = normalizeProjectPluginFolderPath(body.path); const projectRoot = resolveProjectDir(PROJECTS_DIR, req.params.id, project.metadata); const folder = await resolveProjectChildDirectory(projectRoot, relativePath); const task = pluginShareTaskStore.createAndStart(req.params.id, { action, path: relativePath }, folder); res.status(202).json({ taskId: task.id, action, path: relativePath, status: task.status, startedAt: task.startedAt }); } catch (err) { const code = err && err.code; const status = code === 'ENOENT' || code === 'ENOTDIR' ? 404 : 400; sendApiError(res, status, status === 404 ? 'PLUGIN_FOLDER_NOT_FOUND' : 'BAD_REQUEST', String(err?.message || err)); }
    },
  };

  // Plan §3.A1: shared helper used by every endpoint that has to resolve
  // plugin context against the live registry. Skills + design systems are
  // walked from disk; craft is empty in v1; atoms come from the
  // first-party catalog. Project-scoped overrides arrive in Phase 4.
  async function loadPluginRegistryView() {
    const [skills, designSystems] = await Promise.all([
      listAllSkills(),
      listAllDesignSystems(),
    ]);
    // Spec §23.3.3: surface the bundled scenario plugins so apply()
    // can fall back to the matching scenario's pipeline when the
    // consumer plugin omits od.pipeline. Each scenario carries a
    // `taskKind` that picks the match.
    const scenarios = collectBundledScenarios();
    return {
      skills: skills.map((s) => ({ id: s.id, title: s.name, description: s.description })),
      designSystems: designSystems.map((d) => ({ id: d.id, title: d.title })),
      craft: [],
      atoms: FIRST_PARTY_ATOMS.map((a) => ({ id: a.id, label: a.label })),
      scenarios,
    };
  }

  // Pure read off `installed_plugins`: rows whose source_kind='bundled'
  // AND od.kind='scenario' AND od.pipeline is non-empty become entries
  // the apply path can fall back to. Scenario plugins from third-party
  // sources are intentionally NOT trusted as defaults — the bundled
  // boot walker (apps/daemon/src/plugins/bundled.ts) is the only writer
  // of source_kind='bundled', so this function never grants the
  // privilege to user-installed scenarios.
  //
  // Plan §3.O1 / §C-stage of plugin-driven-flow-plan: more than one
  // bundled scenario may share a `taskKind` (e.g. `od-media-generation`
  // also claims `new-generation` so the kind → scenario map can route
  // image / video / audio projects to it). The pipeline-fallback
  // resolver expects ONE scenario per taskKind, so this function
  // dedupes and prefers the canonical id `od-<taskKind>` as the
  // pipeline-fallback winner. Non-canonical scenarios still install
  // and run through their explicit pluginId path; they just don't get
  // to hijack a consumer plugin that omitted `od.pipeline`.
  function collectBundledScenarios() {
    type ScenarioEntry = {
      id: string;
      taskKind: 'new-generation' | 'figma-migration' | 'code-migration' | 'tune-collab';
      pipeline: NonNullable<NonNullable<import('@open-design/contracts').PluginManifest['od']>['pipeline']>;
    };
    const byTaskKind = new Map<ScenarioEntry['taskKind'], ScenarioEntry>();
    try {
      const all = listInstalledPlugins(db);
      for (const row of all) {
        if (row.sourceKind !== 'bundled') continue;
        const od = row.manifest.od;
        if (!od || od.kind !== 'scenario') continue;
        if (!od.pipeline || !Array.isArray(od.pipeline.stages) || od.pipeline.stages.length === 0) continue;
        const taskKind = (od.taskKind ?? 'new-generation') as ScenarioEntry['taskKind'];
        if (taskKind !== 'new-generation' && taskKind !== 'figma-migration' &&
            taskKind !== 'code-migration' && taskKind !== 'tune-collab') continue;
        const entry: ScenarioEntry = { id: row.id, taskKind, pipeline: od.pipeline };
        const existing = byTaskKind.get(taskKind);
        if (!existing || entry.id === `od-${taskKind}`) {
          byTaskKind.set(taskKind, entry);
        }
      }
    } catch {
      // On a fresh install the table may not exist yet; surface no
      // scenarios rather than crash the apply path.
      return [];
    }
    return Array.from(byTaskKind.values());
  }

  registerPluginRoutes(app, {
    db,
    paths: { PROJECTS_DIR, PLUGIN_REGISTRY_ROOTS, PLUGIN_LOCKFILE_PATH },
    plugins: {
      listInstalledPlugins,
      getInstalledPlugin,
      installPlugin,
      uninstallPlugin,
      installFromLocalFolder,
      applyPlugin,
      doctorPlugin,
      getSnapshot,
      pruneExpiredSnapshots,
      readPluginLockfile,
      resolvePluginSnapshot,
      MissingInputError,
      pluginPromptBlock,
      listSkillPluginCandidates,
      dismissSkillPluginCandidate,
      generateSkillPluginDraft,
      FIRST_PARTY_ATOMS,
    },
    helpers: pluginRouteHelpers,
  });
  registerAtomRoutes(app, {
    db,
    resources: { FIRST_PARTY_ATOMS },
  });
  registerPluginMarketplaceRoutes(app, {
    db,
    bundledMarketplaceEntries,
    createMarketplaceFetcher,
    marketplaceRegistryIdFromUrl,
  });
  registerPluginAssetRoutes(app, {
    db,
    pluginAssetCache,
    AssetCacheError,
    assetCacheRewriteUrl,
    isCacheableExternalUrl,
    assembleExample,
  });

  registerGenuiRoutes(app, {
    db,
    design,
    paths: { PROJECTS_DIR },
  });

  registerProjectPluginRoutes(app, {
    db,
    paths: { PROJECTS_DIR, PLUGIN_REGISTRY_ROOTS, PLUGIN_LOCKFILE_PATH },
    plugins: {
      listInstalledPlugins,
      getInstalledPlugin,
      installPlugin,
      uninstallPlugin,
      installFromLocalFolder,
      applyPlugin,
      doctorPlugin,
      getSnapshot,
      pruneExpiredSnapshots,
      readPluginLockfile,
      resolvePluginSnapshot,
      MissingInputError,
      pluginPromptBlock,
      listSkillPluginCandidates,
      dismissSkillPluginCandidate,
      generateSkillPluginDraft,
      FIRST_PARTY_ATOMS,
    },
    helpers: pluginRouteHelpers,
  });
  registerProjectUploadRoutes(app, { http: httpDeps, uploads: uploadDeps, node: nodeDeps });

  const composeDaemonSystemPrompt = async ({
    agentId,
    projectId,
    skillId,
    skillIds,
    designSystemId,
    streamFormat,
    locale,
    sessionMode,
    connectedExternalMcp,
    appliedPluginSnapshotId,
    mediaExecution,
  }) => {
    const project =
      typeof projectId === 'string' && projectId
        ? getProject(db, projectId)
        : null;
    const effectiveSkillId =
      typeof skillId === 'string' && skillId ? skillId : project?.skillId;
    const effectiveDesignSystemId =
      typeof designSystemId === 'string' && designSystemId
        ? designSystemId
        : project?.designSystemId;
    const metadata = project?.metadata;
    let allSkillsPromise: ReturnType<typeof listAllSkillLikeEntries> | null = null;
    const loadAllSkills = async () => {
      allSkillsPromise ??= listAllSkillLikeEntries();
      return await allSkillsPromise;
    };

    // Per-turn skills picked via the composer's @-mention popover. They
    // never persist on the project — we just append their bodies after the
    // primary skill so the agent sees one combined block this turn.
    const effectiveCanonicalSkillId =
      typeof effectiveSkillId === 'string' && effectiveSkillId
        ? resolveSkillId(effectiveSkillId)
        : null;
    const adHocSkillIds = Array.isArray(skillIds)
      ? skillIds
          .map((s) => (typeof s === 'string' ? s.trim() : ''))
          .filter(Boolean)
          .filter((id) => resolveSkillId(id) !== effectiveCanonicalSkillId)
      : [];

    let skillBody;
    let skillName;
    let skillMode;
    const skillModes = new Set<NonNullable<Parameters<typeof composeSystemPrompt>[0]['skillMode']>>();
    let skillCraftRequires = [];
    let activeSkillDir = null;
    const activeSkillDirs: string[] = [];
    // Per-skill Critique Theater override sourced from
    // `od.critique.policy` in the resolved skill's SKILL.md frontmatter.
    // `null` means the skill has no opinion and the lower-priority tiers
    // (project override, env override, rollout phase default) decide.
    let skillCritiquePolicy: SkillCritiquePolicy = null;
    let critiqueSkillId = effectiveCanonicalSkillId;
    const registerSkillMode = (
      mode: NonNullable<Parameters<typeof composeSystemPrompt>[0]['skillMode']> | null | undefined,
    ) => {
      if (!mode) return;
      skillModes.add(mode);
    };
    const registerPrimarySkillMode = (
      mode: NonNullable<Parameters<typeof composeSystemPrompt>[0]['skillMode']> | null | undefined,
    ) => {
      if (!mode) return;
      skillMode ??= mode;
      registerSkillMode(mode);
    };
    const registerSkillDir = (dir: string | null | undefined) => {
      if (typeof dir !== 'string' || dir.length === 0) return;
      if (!activeSkillDir) activeSkillDir = dir;
      if (!activeSkillDirs.includes(dir)) activeSkillDirs.push(dir);
    };
    const mergeSkillCritiquePolicy = (
      current: SkillCritiquePolicy,
      next: SkillCritiquePolicy,
    ): SkillCritiquePolicy => {
      if (next === 'opt-out') return 'opt-out';
      if (next === 'required') return current === 'opt-out' ? current : 'required';
      if (next === 'opt-in') {
        return current === 'required' || current === 'opt-out' ? current : 'opt-in';
      }
      return current;
    };
    if (effectiveSkillId) {
      // Span both functional skills and design templates so a project
      // saved against either surface keeps its system prompt after the
      // skills/design-templates split. See specs/current/skills-and-design-templates.md.
      const allSkills = await loadAllSkills();
      const skill = findSkillById(allSkills, effectiveSkillId);
      if (skill) {
        skillBody = skill.body;
        skillName = skill.name;
        registerPrimarySkillMode(skill.mode);
        registerSkillDir(skill.dir);
        skillCritiquePolicy = mergeSkillCritiquePolicy(
          skillCritiquePolicy,
          skill.critiquePolicy,
        );
        if (Array.isArray(skill.craftRequires))
          skillCraftRequires = skill.craftRequires;
      }
    }
    let composedSkillBlocks = '';
    if (adHocSkillIds.length > 0) {
      const allSkills = await loadAllSkills();
      const seen = new Set(
        effectiveCanonicalSkillId ? [String(effectiveCanonicalSkillId)] : [],
      );
      const blocks = [];
      const baseBody = skillBody && skillBody.trim().length > 0 ? skillBody : '';
      for (const id of adHocSkillIds) {
        const canonicalId = resolveSkillId(id);
        if (typeof canonicalId !== 'string' || canonicalId.length === 0) continue;
        if (seen.has(canonicalId)) continue;
        seen.add(canonicalId);
        const extra = findSkillById(allSkills, id);
        if (!extra) continue;
        registerSkillDir(extra.dir);
        registerSkillMode(extra.mode);
        if (!effectiveCanonicalSkillId && adHocSkillIds.length === 1) {
          registerPrimarySkillMode(extra.mode);
        }
        if (!critiqueSkillId || extra.critiquePolicy !== null) critiqueSkillId = canonicalId;
        skillCritiquePolicy = mergeSkillCritiquePolicy(
          skillCritiquePolicy,
          extra.critiquePolicy,
        );
        if (Array.isArray(extra.craftRequires)) {
          for (const craft of extra.craftRequires) {
            if (!skillCraftRequires.includes(craft)) skillCraftRequires.push(craft);
          }
        }
        blocks.push(
          `\n\n---\n\n## Composed skill — ${extra.name || id}\n\n${(extra.body || '').trim()}`,
        );
      }
      if (blocks.length > 0) {
        composedSkillBlocks = blocks.join('');
        skillBody = baseBody + composedSkillBlocks;
        if (!skillName) {
          skillName = adHocSkillIds.length === 1
            ? findSkillById(allSkills, adHocSkillIds[0])?.name ?? null
            : 'composed';
        }
      }
    }

    // Stage A of plugin-driven-flow-plan: when the run is bound to a
    // plugin snapshot, prefer the plugin's local SKILL.md (declared via
    // `od.context.skills[{ path: './SKILL.md' }]`) over the global
    // skill. Without this override the agent loses the plugin's
    // template / token / layout rules and falls back to generic prompt
    // behaviour even though the user explicitly applied the plugin.
    if (
      typeof appliedPluginSnapshotId === 'string'
      && appliedPluginSnapshotId.length > 0
    ) {
      try {
        const snap = getSnapshot(db, appliedPluginSnapshotId);
        if (snap?.pluginId) {
          const { getSnapshotContextCraft } = await import('./plugins/context-craft.js');
          for (const craft of getSnapshotContextCraft(snap)) {
            if (!skillCraftRequires.includes(craft)) skillCraftRequires.push(craft);
          }
          const plugin = getInstalledPlugin(db, snap.pluginId);
          if (plugin) {
            const { loadPluginLocalSkill } = await import('./plugins/local-skill.js');
            const local = await loadPluginLocalSkill(plugin);
            if (local) {
              skillBody = local.body + composedSkillBlocks;
              skillName = local.name;
              activeSkillDir = local.dir;
              registerSkillDir(local.dir);
            }
          }
        }
      } catch (err) {
        console.warn(
          `[plugins] pluginSkillBody load failed: ${err?.message ?? err}`,
        );
      }
    }

    let craftBody;
    let craftSections;

    // Personal-memory body is always recomputed at compose time so a
    // memory the user just edited in settings shows up on the very next
    // run. composeMemoryBody returns '' when memory is disabled or
    // empty; the composer drops the block on a falsy value.
    let memoryBody = '';
    try {
      memoryBody = await composeMemoryBody(RUNTIME_DATA_DIR);
    } catch (err) {
      console.warn('[memory] composeMemoryBody failed', err);
    }

    // User-level custom instructions from app-config.json.
    let userInstructions = '';
    try {
      const appCfg = await readAppConfig(RUNTIME_DATA_DIR);
      if (appCfg.customInstructions) userInstructions = appCfg.customInstructions;
    } catch (err) {
      console.warn('[custom-instructions] readAppConfig failed', err);
    }

    let designSystemBody;
    let designSystemTitle;
    // Compiled (tokens.css + components manifest / components.html)
    // form of the active brand.
    // Default-on as of PR-D — every chat that picks a brand with
    // `tokens.css` + `components.html` siblings (today: `default` and
    // `kami`; every other brand falls through silently because the
    // files are absent) gets the structured token contract appended to
    // the system prompt automatically.
    //
    // `OD_DESIGN_TOKEN_CHANNEL=0` is the kill switch: it forces the
    // daemon back to the pre-PR-C DESIGN.md-only path for every brand,
    // including the structured ones. Any other value (unset, `1`,
    // `true`, etc.) keeps the new default. Drift on prose-only brands
    // is pinned by `scripts/check-design-system-flag-parity.ts`.
    let designSystemUsageMd;
    let designSystemTokensCss;
    let designSystemComponentsManifest;
    let designSystemFixtureHtml;
    let designSystemPullIndex;
    let designSystemImportMode;
    let designSystemCraftApplies = [];
    let designSystemCraftExemptions = [];
    if (effectiveDesignSystemId) {
      let systems = await listAllDesignSystems();
      let summary = systems.find((s) => s.id === effectiveDesignSystemId);
      if (summary?.source === 'user') {
        await ensureUserDesignSystemWorkspaceProject(db, effectiveDesignSystemId);
        systems = await listAllDesignSystems();
        summary = systems.find((s) => s.id === effectiveDesignSystemId);
      }
      const editingOwnDraftDesignSystem =
        project?.metadata?.importedFrom === 'design-system'
        && project.designSystemId === effectiveDesignSystemId;
      designSystemTitle = summary?.title;
      if (summary && (isProjectUsableDesignSystem(summary) || editingOwnDraftDesignSystem)) {
        const workspaceBody = await readDesignSystemWorkspaceTextFile(db, summary, 'DESIGN.md');
        const registryBody = await readAvailableDesignSystem(effectiveDesignSystemId);
        designSystemBody = (workspaceBody ?? registryBody) ?? undefined;
        // Single seam: env gate + built-in→user-installed fallback chain
        // live together inside `resolveDesignSystemAssets` so the whole
        // server-side asset-resolution path can be tested end-to-end
        // from real disk fixtures (see `tests/design-system-assets.test.ts`).
        const assets = await resolveDesignSystemAssets(
          effectiveDesignSystemId,
          DESIGN_SYSTEMS_DIR,
          USER_DESIGN_SYSTEMS_DIR,
        );
        designSystemUsageMd = assets.usageMd;
        designSystemTokensCss = assets.tokensCss;
        designSystemComponentsManifest = assets.componentsManifest;
        designSystemFixtureHtml = assets.fixtureHtml;
        designSystemPullIndex = assets.pullIndex;
        designSystemImportMode = assets.importMode;
        designSystemCraftApplies = Array.isArray(assets.craftApplies) ? assets.craftApplies : [];
        designSystemCraftExemptions = Array.isArray(assets.craftExemptions) ? assets.craftExemptions : [];
      }
    }

    const excludedCraft = new Set(designSystemCraftExemptions);
    const requestedCraft = Array.from(
      new Set([...skillCraftRequires, ...designSystemCraftApplies]),
    ).filter((slug) => !excludedCraft.has(slug));
    if (requestedCraft.length > 0) {
      const loaded = await loadCraftSections(CRAFT_DIR, requestedCraft);
      if (loaded.body) {
        craftBody = loaded.body;
        craftSections = loaded.sections;
      }
    }

    const template =
      metadata?.kind === 'template' && typeof metadata.templateId === 'string'
        ? (getTemplate(db, metadata.templateId) ?? undefined)
        : undefined;
    let audioVoiceOptions = [];
    let audioVoiceOptionsError;
    if (
      metadata?.kind === 'audio' &&
      metadata?.audioKind === 'speech' &&
      metadata?.audioModel === 'elevenlabs-v3' &&
      !metadata?.voice
    ) {
      try {
        audioVoiceOptions = await listElevenLabsVoiceOptions(PROJECT_ROOT, { limit: 100 });
      } catch (err) {
        audioVoiceOptionsError = err && err.message ? err.message : String(err);
        console.warn('[elevenlabs] voice option lookup failed:', audioVoiceOptionsError);
      }
    }

    // Thread the critique config plus the active design-system / skill data
    // into the composer when critique is enabled. Without this the spawned
    // child receives the legacy single-pass prompt and the parser waits for
    // <CRITIQUE_RUN> tags the model was never told to emit. The composer
    // itself ignores these fields when the top-line gate is false, so the
    // legacy path stays untouched.
    //
    // Top-line gate (post-Phase-15 wireup): the daemon now routes every
    // candidate run through the rollout resolver instead of reading the
    // env-var flag directly. The resolver carries the full priority
    // matrix: skill `od.critique.policy` veto > project override > env
    // override > rollout phase default. On a fresh install with M0
    // dark-launch defaults the resolver returns `false`, so prod traffic
    // is unchanged until an operator flips the env var or a project
    // opts in. The skill-policy input is sourced from
    // `od.critique.policy` in the active skill's SKILL.md frontmatter
    // (parsed in `skills.ts:normalizeCritiquePolicy`). The project
    // override input is sourced from the `critiqueTheaterEnabled`
    // field on the project's metadata blob, which is what the M1
    // Settings toggle writes through the existing settings endpoint.
    // Both inputs collapse to `null` when the skill / project has
    // not expressed an opinion, which is the resolver's "fall through
    // to env / phase default" signal.
    // Per-project override: the M1 Settings toggle writes
    // `critiqueTheaterEnabled` onto the project's metadata blob via
    // the existing settings round-trip. A boolean wins outright; any
    // other type (missing key, malformed value) collapses to `null`
    // so the resolver falls through to the env / phase tiers exactly
    // the way it did when the toggle had never been touched.
    const projectCritiqueOverride = narrowProjectCritiqueOverride(metadata);
    const critiqueEnabledForRun = isCritiqueEnabled({
      phase: parseRolloutPhase(process.env.OD_CRITIQUE_ROLLOUT_PHASE),
      skillPolicy: skillCritiquePolicy,
      projectOverride: projectCritiqueOverride,
      envOverride: parseEnvEnabled(process.env.OD_CRITIQUE_ENABLED),
    });
    const critiqueBrand = critiqueEnabledForRun
      && typeof designSystemTitle === 'string'
      && typeof designSystemBody === 'string'
      ? { name: designSystemTitle, design_md: designSystemBody }
      : undefined;
    const critiqueSkill = critiqueEnabledForRun && typeof critiqueSkillId === 'string'
      ? { id: critiqueSkillId }
      : undefined;
    // Single-source-of-truth eligibility check. The composer downstream
    // appends <CRITIQUE_RUN> instructions only when this check passes, and
    // the spawn path routes runs through runOrchestrator(...) only when the
    // SAME flag is true, so prompt and orchestrator stay in lockstep.
    //
    // Non-plain adapters (claude-stream-json, copilot-stream-json,
    // json-event-stream, acp-json-rpc, pi-rpc) emit their own wrapper
    // protocol; the v1 critique parser only understands plain stdout. The
    // spawn path falls through to legacy generation for those, so the
    // panel addendum has to be suppressed here too: otherwise the model
    // is instructed to emit Critique Theater tags that no orchestrator
    // consumes.
    const resolvedExclusiveSurface = resolveExclusiveSurface({
      metadata,
      skillMode,
      skillModes: skillModes.size > 0 ? Array.from(skillModes) : undefined,
    });
    const isMediaSurface =
      resolvedExclusiveSurface === 'image'
      || resolvedExclusiveSurface === 'video'
      || resolvedExclusiveSurface === 'audio';
    const isPlainAdapter = (streamFormat ?? 'plain') === 'plain';
    const critiqueShouldRun = critiqueEnabledForRun
      && critiqueBrand !== undefined
      && critiqueSkill !== undefined
      && !isMediaSurface
      && isPlainAdapter;
    // Only thread the critique fields when the run is actually eligible;
    // otherwise the composer's own internal eligibility check (cfg.enabled
    // && brand && skill && !isMediaSurface) might still fire on
    // non-plain adapters and we'd emit the panel for a run the orchestrator
    // skips. Gating the threading itself keeps composer + orchestrator in
    // exact lockstep regardless of which side enforces eligibility.
    let pluginBlock;
    if (
      typeof appliedPluginSnapshotId === 'string'
      && appliedPluginSnapshotId.length > 0
    ) {
      try {
        const snap = getSnapshot(db, appliedPluginSnapshotId);
        if (snap) pluginBlock = pluginPromptBlock(snap);
      } catch (err) {
        console.warn(
          `[plugins] pluginBlock build failed: ${err?.message ?? err}`,
        );
      }
    }

    // Plan §3.M2 / §3.V1 / spec §23.4 — render each stage's atoms[]
    // into `## Active stage` blocks via the contracts helper when
    // the run carries a snapshot with a pipeline. Default is now ON
    // (flipped in §3.V1 once the bundled SKILL.md fragments covered
    // every Phase 6/7/8 atom); set OD_BUNDLED_ATOM_PROMPTS=0 to opt
    // out (the runs that need pre-§3.V1 byte-equal prompts: snapshot
    // replay against an older daemon, regression-bisects).
    let activeStageBlocks;
    const bundledAtomPromptsEnabled = process.env.OD_BUNDLED_ATOM_PROMPTS !== '0';
    if (
      bundledAtomPromptsEnabled
      && typeof appliedPluginSnapshotId === 'string'
      && appliedPluginSnapshotId.length > 0
    ) {
      try {
        const snap = getSnapshot(db, appliedPluginSnapshotId);
        const stages = snap?.pipeline?.stages ?? [];
        if (stages.length > 0) {
          const { loadAtomBodies } = await import('./plugins/atom-bodies.js');
          const { renderActiveStageBlock } = await import('@open-design/contracts');
          const blocks = [];
          for (const stage of stages) {
            const bodies = await loadAtomBodies(db, stage.atoms ?? []);
            const block = renderActiveStageBlock({ stageId: stage.id, bodies });
            if (block.trim().length > 0) blocks.push(block);
          }
          if (blocks.length > 0) activeStageBlocks = blocks;
        }
      } catch (err) {
        console.warn(`[plugins] activeStageBlocks build failed: ${(err)?.message ?? err}`);
      }
    }

    const prompt = composeSystemPrompt({
      agentId,
      includeCodexImagegenOverride: false,
      skillBody,
      skillName,
      skillMode,
      skillModes: skillModes.size > 0 ? Array.from(skillModes) : undefined,
      designSystemBody,
      designSystemTitle,
      designSystemUsageMd,
      designSystemTokensCss,
      designSystemComponentsManifest,
      designSystemFixtureHtml,
      designSystemPullIndex,
      designSystemImportMode,
      craftBody,
      craftSections,
      memoryBody,
      metadata,
      template,
      audioVoiceOptions,
      audioVoiceOptionsError,
      // critiqueCfg.enabled is loaded from OD_CRITIQUE_ENABLED only, so a
      // run that the resolver enabled via phase / project / skill (env
      // unset) would have critiqueShouldRun = true while critiqueCfg.enabled
      // remains false. Without this override the composer's own gate
      // (cfg.enabled) drops the panel addendum, the orchestrator still
      // launches, and the parser waits for <CRITIQUE_RUN> tags the model
      // was never told to emit (codex P2 on PR #1338). Build a derived
      // config that pins enabled to the resolver decision so the composer
      // and the orchestrator agree on every eligibility input.
      critique: critiqueShouldRun ? { ...critiqueCfg, enabled: true } : undefined,
      critiqueBrand: critiqueShouldRun ? critiqueBrand : undefined,
      critiqueSkill: critiqueShouldRun ? critiqueSkill : undefined,
      locale: typeof locale === 'string' ? locale : undefined,
      sessionMode: normalizeConversationSessionMode(sessionMode),
      mediaExecution,
      streamFormat,
      connectedExternalMcp: Array.isArray(connectedExternalMcp)
        ? connectedExternalMcp
        : undefined,
      ...(pluginBlock ? { pluginBlock } : {}),
      ...(activeStageBlocks ? { activeStageBlocks } : {}),
      userInstructions,
    });
    // The chat handler also needs to know where the active skill lives
    // on disk so it can stage a per-project copy of its side files
    // before spawning the agent. Returning that here avoids a second
    // `listSkills()` scan in `startChatRun`. critiqueShouldRun threads
    // the same panel-eligibility decision down to the spawn-path
    // orchestrator gate so prompt and orchestrator stay in lockstep.
    return {
      prompt,
      activeSkillDir,
      activeSkillDirs,
      critiqueShouldRun,
      promptTelemetryParts: {
        skillPrompt: skillBody ?? '',
        designSystemPrompt: designSystemBody ?? '',
        pluginStagePrompt: [pluginBlock, ...(activeStageBlocks ?? [])]
          .filter((part) => typeof part === 'string' && part.trim().length > 0)
          .join('\n\n---\n\n'),
      },
    };
  };

  // Plan §3.I1 / §3.D / spec §10.1: fire the pipeline schedule on a
  // run's SSE stream. Synchronous first emit (the first
  // pipeline_stage_started event lands before the agent process
  // starts) + async tail. Stage D wires the atom-worker registry as
  // the default stage runner; set OD_PIPELINE_RUNNER=stub to fall
  // back to the canned v1 stub for diagnostic bisection or replay
  // of pre-Stage-D runs. Errors are swallowed (logged) so a bad
  // pipeline never blocks the agent run.
  const firePipelineForRun = (args) => {
    const { run, snapshot, runs, db: dbHandle } = args;
    if (!snapshot?.pipeline?.stages?.length) return;
    const env = { maxIterations: readPluginEnvKnobs().maxDevloopIterations };
    const emitPipeline = (evt) => {
      try { runs.emit(run, evt.kind, evt); } catch {/* ignore */}
    };
    const emitGenui = (evt) => {
      try { runs.emit(run, evt.kind, evt); } catch {/* ignore */}
    };
    const projectIdForRun = run.projectId
      ?? snapshot.resolvedContext?.items?.[0]?.id
      ?? 'project-unknown';
    const runnerMode = process.env.OD_PIPELINE_RUNNER === 'stub'
      ? 'stub'
      : 'registry';
    let runStage;
    if (runnerMode === 'stub') {
      runStage = ({ iteration }) => ({
        signals: {
          'critique.score':  iteration >= 0 ? 4 : 0,
          'preview.ok':      true,
          'user.confirmed':  true,
        },
      });
    } else {
      registerBuiltInAtomWorkers();
      runStage = async ({ stage, iteration, snapshot: stageSnapshot }) => {
        const outcome = await runStageWithRegistry({
          db:             dbHandle,
          runId:          run.id,
          projectId:      projectIdForRun,
          conversationId: run.conversationId ?? null,
          stage,
          iteration,
          snapshot:       stageSnapshot,
        });
        return {
          signals:         outcome.signals,
          critiqueSummary: outcome.critiqueSummary,
        };
      };
    }
    void runPipelineForRun({
      db: dbHandle,
      runId:           run.id,
      projectId:       projectIdForRun,
      conversationId:  run.conversationId ?? null,
      snapshot,
      pipeline:        snapshot.pipeline,
      env,
      runStage,
      emitPipeline,
      emitGenui,
    }).catch((err) => {
      try {
        runs.emit(run, 'pipeline_stage_failed', {
          runId:      run.id,
          snapshotId: snapshot.snapshotId,
          message:    String(err?.message ?? err),
        });
      } catch { /* ignore */ }
    });
  };

  const startChatRun = async (chatBody, run) => {
    run.analyticsTelemetry = {
      ...(run.analyticsTelemetry ?? {}),
      startChatRunStartedAt: Date.now(),
    };
    /** @type {Partial<ChatRequest> & { imagePaths?: string[] }} */
    chatBody = chatBody || {};
    const {
      agentId,
      message,
      currentPrompt,
      systemPrompt,
      imagePaths = [],
      projectId,
      conversationId,
      assistantMessageId,
      clientRequestId,
      skillId,
      skillIds,
      designSystemId,
      sessionMode,
      attachments = [],
      commentAttachments = [],
      model,
      reasoning,
      locale,
      research,
      context,
      titleGeneration,
    } = chatBody;
    run.analyticsTelemetry = {
      ...(run.analyticsTelemetry ?? {}),
      promptBuildStartAt: Date.now(),
    };
    if (typeof projectId === 'string' && projectId) run.projectId = projectId;
    if (typeof conversationId === 'string' && conversationId)
      run.conversationId = conversationId;
    if (typeof assistantMessageId === 'string' && assistantMessageId)
      run.assistantMessageId = assistantMessageId;
    if (typeof clientRequestId === 'string' && clientRequestId)
      run.clientRequestId = clientRequestId;
    if (typeof agentId === 'string' && agentId) run.agentId = agentId;
    // Stash the original user prompt + per-turn config so the
    // langfuse-bridge report path can include them without reaching back
    // into chatBody across the createChatRunService boundary. Each field
    // is optional and only set when the chat body actually carried it.
    const telemetryPrompt = telemetryPromptFromRunRequest(message, currentPrompt);
    if (typeof telemetryPrompt === 'string') run.userPrompt = telemetryPrompt;
    if (typeof model === 'string' && model) run.model = model;
    if (typeof reasoning === 'string' && reasoning) run.reasoning = reasoning;
    if (typeof skillId === 'string' && skillId) run.skillId = skillId;
    if (typeof designSystemId === 'string' && designSystemId)
      run.designSystemId = designSystemId;
    const conversationSession =
      typeof conversationId === 'string' && conversationId
        ? getConversation(db, conversationId)
        : null;
    const runSessionMode =
      sessionMode === 'chat' || sessionMode === 'design'
        ? normalizeConversationSessionMode(sessionMode)
        : normalizeConversationSessionMode(conversationSession?.sessionMode);
    const def = getAgentDef(agentId);
    if (!def)
      return design.runs.fail(
        run,
        'AGENT_UNAVAILABLE',
        `unknown agent: ${agentId}`,
      );
    if (!def.bin)
      return design.runs.fail(run, 'AGENT_UNAVAILABLE', 'agent has no binary');
    // Validate the checked-in `inactivityTimeoutMs` hint immediately
    // after the runtime def is selected and before any side-effectful
    // setup (auto-memory extract, `.mcp.json` write/unlink,
    // composeSystemPrompt, prompt persistence). A bad def value would
    // otherwise abort the run only at watchdog-arm time, after that
    // setup has already mutated local state, leaving confusing partial
    // residue behind (issue #2467 review on PR #2579).
    //
    // Catch is intentionally narrowed to `RangeError`, the only kind
    // `assertValidRuntimeDefInactivityTimeoutMs` is allowed to throw
    // for invalid checked-in values. Anything else (a regression that
    // makes the helper throw on a valid value, an unrelated bug
    // introduced while touching this path) should bubble up to the
    // outer chat-run starter — which surfaces it as
    // `AGENT_EXECUTION_FAILED` — rather than being misreported as
    // "the runtime def is bad" and burying the real failure.
    try {
      assertValidRuntimeDefInactivityTimeoutMs(def.inactivityTimeoutMs);
    } catch (err) {
      if (err instanceof RangeError) {
        return design.runs.fail(run, 'AGENT_RUNTIME_DEF_INVALID', err.message);
      }
      throw err;
    }
    const safeCommentAttachments =
      normalizeCommentAttachments(commentAttachments);
    if (
      (typeof message !== 'string' || !message.trim()) &&
      safeCommentAttachments.length === 0
    ) {
      return design.runs.fail(run, 'BAD_REQUEST', 'message required');
    }
    const browserUseRunState = buildBrowserUseRunState({
      requested: isBrowserUseRequested(message, currentPrompt, systemPrompt),
      agentId: def.id,
    });
    if (browserUseRunState) {
      run.browserUse = browserUseRunState;
      design.runs.emit(run, 'diagnostic', {
        type: 'browser_use_unavailable',
        ...browserUseRunState,
      });
    }
    if (run.cancelRequested || design.runs.isTerminal(run.status)) return;
    const runId = run.id;

    // Auto-memory hook. Pulls explicit "remember:" / "我是 X" / "I prefer Y"
    // markers out of the just-arrived user message and writes them as MD
    // files under <dataDir>/memory/. We await so the very next
    // composeSystemPrompt() call (a few lines below) re-reads memory from
    // disk and a marker inside this turn's message is reflected in this
    // turn's prompt. Failures are swallowed — memory is best-effort and
    // must never block the agent run.
    if (
      (run.retryAttemptCount ?? 0) === 0 &&
      typeof message === 'string' &&
      message.trim().length > 0
    ) {
      try {
        await extractFromMessage(RUNTIME_DATA_DIR, message);
      } catch (err) {
        console.warn('[memory] extractFromMessage failed', err);
      }
    }

    // Resolve the project working directory (creating the folder if it
    // doesn't exist yet). Without one we don't pass cwd to spawn — the
    // agent then runs in whatever inherited dir, which still lets API
    // mode work but loses file-tool addressability.
    // Project directory resolution lives in projects.ts so sandbox mode can
    // consistently reject imported-folder metadata that has no managed copy.
    let cwd = null;
    let existingProjectFiles = [];
    let existingProjectFolders = [];
    if (typeof projectId === 'string' && projectId) {
      try {
        const chatProject = getProject(db, projectId);
        const chatMeta = chatProject?.metadata;
        // ensureProject/resolveProjectDir now resolve external baseDir folders
        // internally (and assertSandboxProjectRootAvailable rejects imported
        // folders with no managed copy in sandbox mode), so we pass chatMeta
        // through instead of branching on baseDir here.
        assertSandboxProjectRootAvailable(chatMeta);
        cwd = await ensureProject(PROJECTS_DIR, projectId, chatMeta);
        existingProjectFiles = await listFiles(PROJECTS_DIR, projectId, { metadata: chatMeta });
        existingProjectFolders = await listProjectFolders(PROJECTS_DIR, projectId, { metadata: chatMeta });
      } catch (err) {
        if (err instanceof SandboxImportedProjectError) {
          return design.runs.fail(run, 'BAD_REQUEST', err.message);
        }
        cwd = null;
        existingProjectFiles = [];
        existingProjectFolders = [];
      }
    }
    if (run.cancelRequested || design.runs.isTerminal(run.status)) return;

    // Sanitise supplied image paths: must live under UPLOAD_DIR and stay
    // below the prompt-image safety cap.
    const { safeImages, oversizedImages, failedImages } =
      resolveSafePromptImagePaths(imagePaths);
    if (oversizedImages.length > 0) {
      return design.runs.fail(
        run,
        'BAD_REQUEST',
        'Image attachments must be 1 MB or smaller.',
      );
    }
    if (failedImages.length > 0) {
      return design.runs.fail(
        run,
        'INTERNAL_ERROR',
        'Failed to read one or more image attachments.',
      );
    }
    const amrStagedImages =
      def.id === 'amr'
        ? await stageAmrImagePaths(cwd ?? PROJECT_ROOT, safeImages, UPLOAD_DIR)
        : safeImages;

    // Project-scoped attachments: project-relative paths inside cwd. Each
    // is run through the same path-traversal guard the file CRUD endpoints
    // use, then existence-checked. Whatever survives shows up as an
    // explicit list at the bottom of the user message so the agent knows
    // to Read it.
    const safeAttachments = cwd
      ? resolveSafeProjectAttachments(cwd, attachments)
      : [];
    run.projectAttachmentPaths = safeAttachments;

    // Local code agents don't accept a separate "system" channel the way the
    // Messages API does — we fold the skill + design-system prompt into the
    // user message. The <artifact> wrapping instruction comes from
    // systemPrompt. We also stitch in the cwd hint so the agent knows
    // where its file tools should write, and the attachment list so it
    // doesn't have to guess what the user just dropped in.
    const projectRecord =
      typeof projectId === 'string' && projectId
        ? getProject(db, projectId)
        : null;
    const runContextPrompt = renderRunContextPrompt(context, projectRecord?.metadata);
    const linkedDirs = (() => {
      if (!Array.isArray(projectRecord?.metadata?.linkedDirs)) return [];
      const v = validateLinkedDirs(projectRecord.metadata.linkedDirs);
      return v.dirs ?? [];
    })();
    const cwdHint = cwd
      ? formatDesignFilesWorkspaceHint(cwd, existingProjectFiles, existingProjectFolders)
      : '';
    const linkedDirsHint = linkedDirs.length > 0
      ? `\n\nLinked code folders (read-only reference code the user wants you to see):\n${
          linkedDirs.map((d) => `- \`${d}\``).join('\n')
        }`
      : '';
    const attachmentHint = formatProjectAttachmentHint(safeAttachments);
    // Plan §3.A3 / spec §9: thread plugin context onto every tool token
    // so the connector execute route can re-validate the §5.3
    // capability gate without re-reading the SQLite snapshot row.
    let pluginGrantContext = null;
    if (cwd && typeof projectId === 'string' && projectId && run?.appliedPluginSnapshotId) {
      const snap = getSnapshot(db, run.appliedPluginSnapshotId);
      if (snap) {
        const installed = getInstalledPlugin(db, snap.pluginId);
        pluginGrantContext = {
          pluginSnapshotId: snap.snapshotId,
          pluginTrust: installed?.trust ?? 'restricted',
          pluginCapabilitiesGranted: snap.capabilitiesGranted ?? [],
        };
      }
    }
    const toolTokenGrant = cwd && typeof projectId === 'string' && projectId
      ? toolTokenRegistry.mint({
          runId,
          projectId,
          allowedEndpoints: CHAT_TOOL_ENDPOINTS,
          allowedOperations: CHAT_TOOL_OPERATIONS,
          ...(pluginGrantContext ?? {}),
        })
      : null;
    let toolTokenRevoked = false;
    const revokeToolToken = (reason) => {
      if (toolTokenRevoked || !toolTokenGrant) return;
      toolTokenRevoked = true;
      toolTokenRegistry.revokeToken(toolTokenGrant.token, reason);
    };
    const runtimeToolPrompt = createAgentRuntimeToolPrompt(daemonUrl, toolTokenGrant);
    const commentHint = renderCommentAttachmentHint(safeCommentAttachments);

    // Resolve external MCP config + stored OAuth tokens up-front so the
    // system prompt can warn the model away from Claude Code's synthetic
    // `*_authenticate` / `*_complete_authentication` tools for any
    // server the daemon already holds a valid Bearer for. We re-use both
    // values further down at .mcp.json write time — see the spawn block
    // below — instead of re-reading.
    let externalMcpConfig = { servers: [] };
    if (!SANDBOX_RUNTIME.enabled) {
      try {
        externalMcpConfig = await readMcpConfig(RUNTIME_DATA_DIR);
      } catch (err) {
        console.warn(
          '[mcp-config] read failed:',
          err && err.message ? err.message : err,
        );
      }
    }
    const runScopedMcpServers = Array.isArray(run?.toolBundle?.mcpServers)
      ? run.toolBundle.mcpServers
      : [];
    const {
      enabledServers: enabledExternalMcp,
      persistedTokenServerIds,
    } = resolveExternalMcpServersForRun({
      persistedServers: externalMcpConfig.servers,
      runScopedServers: runScopedMcpServers,
      sandboxMode: SANDBOX_RUNTIME.enabled,
    });
    const oauthTokensForSpawn = {};
    if (persistedTokenServerIds.size > 0) {
      try {
        const stored = await readAllTokens(RUNTIME_DATA_DIR);
        for (const [serverId, tok] of Object.entries(stored)) {
          if (!persistedTokenServerIds.has(serverId)) continue;
          // Default to the persisted access token; null it out if expired so
          // we never inject a stale `Authorization: Bearer …` header. The
          // model treats a server with a Bearer pinned as connected and
          // discourages re-auth, which is the worst possible UX when the
          // token is going to 401 every call.
          let access = isTokenExpired(tok) ? null : tok.accessToken;
          if (isTokenExpired(tok) && tok.refreshToken) {
            try {
              const refreshed = await refreshAndPersistToken(
                RUNTIME_DATA_DIR,
                serverId,
                tok,
              );
              if (refreshed) access = refreshed.accessToken;
            } catch (err) {
              console.warn(
                '[mcp-oauth] refresh failed for',
                serverId,
                err && err.message ? err.message : err,
              );
            }
          }
          if (access) {
            oauthTokensForSpawn[serverId] = access;
          } else {
            console.warn(
              '[mcp-oauth] skipping expired token for',
              serverId,
              '— reconnect required',
            );
          }
        }
      } catch (err) {
        console.warn(
          '[mcp-tokens] read failed:',
          err && err.message ? err.message : err,
        );
      }
    }
    const connectedExternalMcp = enabledExternalMcp
      .filter((s) => typeof oauthTokensForSpawn[s.id] === 'string')
      .map((s) => ({ id: s.id, label: s.label }));

    const {
      prompt: daemonSystemPrompt,
      activeSkillDirs,
      critiqueShouldRun,
      promptTelemetryParts,
    } =
      await composeDaemonSystemPrompt({
        agentId,
        projectId,
        skillId,
        skillIds,
        designSystemId,
        streamFormat: def?.streamFormat ?? 'plain',
        locale,
        sessionMode: runSessionMode,
        connectedExternalMcp,
        mediaExecution: run?.mediaExecution,
        // Plan §3.M2 / §3.V1 — forward the run's snapshot id so the
        // prompt composer can splice in `## Active stage` blocks.
        // Default ON; set OD_BUNDLED_ATOM_PROMPTS=0 to opt out.
        appliedPluginSnapshotId: run?.appliedPluginSnapshotId ?? null,
      });

    // Make skill side files reachable through three layers, in order of
    // preference. The skill preamble emitted by `withSkillRootPreamble()`
    // advertises both the cwd-relative path (1) and the absolute path
    // (2/3) so the agent can pick whichever works.
    //
    //   1. CWD-relative copy. Stage every active/composed skill into
    //      `<cwd>/.od-skills/<folder>/` so any agent CLI — not just the
    //      ones that honour `--add-dir` — can reach those files via a
    //      path inside its working directory. We copy (not symlink) so
    //      each staged directory is a true write barrier — agents cannot
    //      mutate the shipped repo resource through their cwd.
    //   2. `--add-dir` allowlist. For non-Codex agents, pass `SKILLS_DIR`
    //      and `DESIGN_SYSTEMS_DIR` so the absolute fallback path in the
    //      preamble is reachable when staging fails (e.g. the project has
    //      no on-disk cwd, or fs.cp errored). Codex treats `--add-dir`
    //      entries as writable, so Codex receives only the narrow
    //      `${CODEX_HOME:-$HOME/.codex}/generated_images` output folder
    //      for allowlisted gpt-image image projects.
    //   3. PROJECT_ROOT cwd. When `cwd` is null, the agent runs with
    //      `cwd: PROJECT_ROOT` — there the absolute path is already an
    //      in-cwd path, so neither (1) nor (2) is required for it to
    //      resolve.
    //
    // Design systems are *not* staged here. Their bodies are read by the
    // daemon and folded into the system prompt directly (see
    // `readDesignSystem`), so an agent never has to open them via the
    // filesystem.
    if (cwd && activeSkillDirs.length > 0) {
      for (const skillDir of activeSkillDirs) {
        const result = await stageActiveSkill(
          cwd,
          skillCwdAliasSegment(skillDir),
          skillDir,
          (msg) => console.warn(msg),
        );
        if (!result.staged) {
          console.warn(
            `[od] skill-stage skipped: ${result.reason ?? 'unknown reason'}; falling back to absolute paths`,
          );
        }
      }
    }
    // Resolve the agent's effective working directory once and use it
    // everywhere the agent could read it (buildArgs runtimeContext, spawn
    // cwd, ACP session new). Falling back to PROJECT_ROOT — rather than
    // letting `spawn` inherit the daemon process cwd — is what makes the
    // absolute-path fallback in the skill preamble actually in-cwd for
    // no-project runs (packaged daemons / service launches do not start
    // their working directory from the workspace root).
    const effectiveCwd = cwd ?? PROJECT_ROOT;
    // Baseline the project's artifact files before the agent runs, so the
    // run-finished handler can diff against them and report `artifact_count`
    // for ANY agent (not just claude_code). Only for real project runs: a
    // null `cwd` means a no-project run rooted at PROJECT_ROOT, whose churn is
    // not the user's artifacts — those fall back to the tool-stream count.
    if (run?.id && cwd) {
      try {
        runArtifactBaselines.remember(run.id, cwd, snapshotProjectArtifacts(cwd));
      } catch {
        // Snapshotting is best-effort; finish falls back to the tool-stream count.
      }
    }
    let codexGeneratedImagesDir = resolveCodexGeneratedImagesDir(
      agentId,
      projectRecord?.metadata,
      process.env,
      os.homedir(),
      run?.mediaExecution,
    );
    if (codexGeneratedImagesDir) {
      codexGeneratedImagesDir = validateCodexGeneratedImagesDir(
        codexGeneratedImagesDir,
        {
          protectedDirs: [SKILLS_DIR, DESIGN_SYSTEMS_DIR, ...linkedDirs],
        },
      );
    }
    const extraAllowedDirs = resolveChatExtraAllowedDirs({
      agentId,
      skillsDir: SKILLS_DIR,
      designSystemsDir: DESIGN_SYSTEMS_DIR,
      linkedDirs,
      codexGeneratedImagesDir,
    });
    const codexImagegenOverride = resolveGrantedCodexImagegenOverride({
      agentId,
      metadata: projectRecord?.metadata,
      codexGeneratedImagesDir,
      extraAllowedDirs,
      mediaExecution: run?.mediaExecution,
    });
    const researchCommandContract = resolveResearchCommandContract(
      research,
      message,
    );
    // Resume-capable adapters continue their own upstream session so they
    // keep working memory across turns. Decide once per run; reuse for the
    // prompt-composition skipTranscript choice, the buildArgs flags, and the
    // create-turn persistence below.
    const agentSupportsSessionResume =
      def.resumesSessionViaCli === true || def.streamFormat === 'pi-rpc';
    const agentResumeCtx =
      agentSupportsSessionResume && run.conversationId
        ? resolveAgentResumeContext(db, {
            conversationId: run.conversationId,
            agentId: def.id,
          })
        : { resumeSessionId: null as string | null, newSessionId: undefined as string | undefined, isResuming: false, storedStablePromptHash: null as string | null };
    const userRequestPrompt = composeChatUserRequestForAgent(
      message,
      currentPrompt,
      // Only trim to the latest turn when we are actually resuming an
      // existing session. A create turn still sends the full transcript so
      // a brand-new session (incl. first turn after another agent)
      // is seeded with prior context.
      { skipTranscript: agentResumeCtx.isResuming },
    );
    // The stable instruction slice (daemon prompt + tool contract + system
    // prompt = design system / skills / memory) is identical across turns of
    // a conversation in the common case. A resumed Claude session already
    // holds it, so on resume turns we skip it unless it changed since the
    // session was seeded — keyed by a hash stored on agent_sessions. Create
    // turns and changed-hash turns send the full block (byte-identical to the
    // previous behavior); non-resume agents have isResuming === false and so
    // always send the full block.
    const stableInstructionFingerprint = [daemonSystemPrompt, runtimeToolPrompt, systemPrompt]
      .map((part) => (typeof part === 'string' ? part.trim() : ''))
      .join('\n\n---\n\n');
    const currentStableHash = hashStableInstructions(stableInstructionFingerprint);
    // `runtimeToolPrompt` is part of the fingerprint and varies only when the
    // tool-token grant's presence flips between turns (rare cwd/projectId edge
    // cases); any such change correctly forces a full re-send that turn.
    const includeStableInstructions = computeIncludeStable(
      agentResumeCtx.isResuming,
      agentResumeCtx.storedStablePromptHash,
      currentStableHash,
    );
    const browserUsePromptGuard = renderBrowserUseUnavailablePrompt(run.browserUse ?? null);
    const titleGenerationRequested =
      titleGeneration &&
      typeof titleGeneration === 'object' &&
      titleGeneration.enabled === true &&
      !agentResumeCtx.isResuming;
    const titleGenerationPrompt = titleGenerationRequested
      ? [
          'Internal title task:',
          'Before answering the user request, emit exactly one short title marker:',
          '<od-title>Title Here</od-title>',
          'Rules: 2-6 words, preserve the user request language, no quotes, no markdown, no punctuation unless necessary.',
          'Do not mention this title task to the user. Continue with the normal answer after the title marker.',
        ].join('\n')
      : '';
    const clientInstructionParts = includeStableInstructions
      ? [researchCommandContract, runContextPrompt, browserUsePromptGuard, titleGenerationPrompt, systemPrompt]
      : [researchCommandContract, runContextPrompt, browserUsePromptGuard, titleGenerationPrompt];
    const clientInstructionPrompt = clientInstructionParts
      .map((part) => (typeof part === 'string' ? part.trim() : ''))
      .filter(Boolean)
      .join('\n\n---\n\n');
    const instructionPrompt = composeLiveInstructionPrompt({
      daemonSystemPrompt: includeStableInstructions ? daemonSystemPrompt : '',
      runtimeToolPrompt: includeStableInstructions ? runtimeToolPrompt : '',
      clientSystemPrompt: clientInstructionPrompt,
      finalPromptOverride: codexImagegenOverride,
    });
    // Some models (notably claude-opus-4-7 with --include-partial-messages)
    // start their reply by echoing the top of the user message verbatim,
    // so the rendered chat shows a "# Instructions ..." block ahead of the
    // real answer. Closing every Instructions block with an explicit
    // "do not echo" line cuts the regression in practice without changing
    // the turn-shape every agent CLI expects (user message carrying both
    // instructions and request) — see server.ts:9920 composer notes.
    const ECHO_GUARD =
      '\n\n(Do not quote, restate, or echo the # Instructions block above in your reply. Begin your response with the answer to the # User request below.)';
    const formAnswerMatch = FORM_ANSWERS_HEADER_RE.exec(
      typeof currentPrompt === 'string' ? currentPrompt : '',
    );
    const formIdForOverride = formAnswerMatch
      ? ((formAnswerMatch[1] || 'form').trim().replace(/[^\w.-]/g, '') || 'form').toLowerCase()
      : null;
    const formOverride =
      formIdForOverride === 'discovery' || formIdForOverride === 'task-type'
        ? FORM_ANSWERED_SYSTEM_OVERRIDE
        : formIdForOverride !== null
          ? FORM_ANSWERED_GENERIC_OVERRIDE
          : '';
    const promptImagePaths = selectPromptImagePaths(
      def.id,
      safeImages,
      amrStagedImages,
    );
    const composed = [
      instructionPrompt
        ? `# Instructions (read first)\n\n${formOverride}${instructionPrompt}${cwdHint}${linkedDirsHint}${ECHO_GUARD}\n\n---\n`
        : cwdHint
          ? `# Instructions\n\n${formOverride}${cwdHint}${linkedDirsHint}${ECHO_GUARD}\n\n---\n`
          : linkedDirsHint
            ? `# Instructions\n\n${formOverride}${linkedDirsHint}${ECHO_GUARD}\n\n---\n`
            : formOverride
              ? `# Instructions\n\n${formOverride}${ECHO_GUARD}\n\n---\n`
              : '',
      `# User request\n\n${userRequestPrompt}${attachmentHint}${commentHint}`,
      promptImagePaths.length
        ? `\n\n${promptImagePaths.map((p) => `@${p}`).join(' ')}`
        : '',
    ].join('');
    run.promptTelemetry = buildPromptStackTelemetry({
      composedPrompt: composed,
      sections: [
        { kind: 'formOverride', content: formOverride },
        // Phase 1 explicitly needs redactedContent for these aggregate prompts:
        // they are the quickest way to inspect the system context sent to the
        // model when diagnosing Langfuse traces.
        { kind: 'daemonSystemPrompt', content: daemonSystemPrompt },
        { kind: 'runtimeToolPrompt', content: runtimeToolPrompt },
        { kind: 'researchCommandContract', content: researchCommandContract },
        { kind: 'runContextPrompt', content: runContextPrompt },
        { kind: 'browserUsePromptGuard', content: browserUsePromptGuard },
        { kind: 'clientSystemPrompt', content: clientInstructionPrompt },
        { kind: 'echoGuard', content: ECHO_GUARD },
        { kind: 'userRequest', content: userRequestPrompt },
        { kind: 'skillPrompt', content: promptTelemetryParts?.skillPrompt },
        {
          kind: 'designSystemPrompt',
          content: promptTelemetryParts?.designSystemPrompt,
        },
        {
          kind: 'pluginStagePrompt',
          content: promptTelemetryParts?.pluginStagePrompt,
        },
        { kind: 'cwdHint', content: cwdHint, metadata: cwd ? [cwd] : [] },
        {
          kind: 'linkedDirsHint',
          content: linkedDirsHint,
          metadata: linkedDirs,
        },
        {
          kind: 'attachments',
          content: attachmentHint,
          metadata: safeAttachments,
        },
        {
          kind: 'commentAttachments',
          content: commentHint,
          metadata: safeCommentAttachments,
        },
        {
          kind: 'promptImagePaths',
          content: promptImagePaths.join('\n'),
          metadata: promptImagePaths,
        },
      ],
    });
    run.analyticsTelemetry = {
      ...(run.analyticsTelemetry ?? {}),
      promptBuildEndAt: Date.now(),
    };
    let configuredAgentEnv = {};
    try {
      const appConfig = await readAppConfig(RUNTIME_DATA_DIR);
      configuredAgentEnv = agentCliEnvForAgent(appConfig.agentCliEnv, def.id);
    } catch {
      configuredAgentEnv = {};
    }
    // Per-agent model + reasoning the user picked in the model menu.
    // Trust the value when it matches the most recent /api/agents listing
    // (live or fallback). Otherwise allow it through if it passes a
    // permissive sanitizer — that's the path for user-typed custom model
    // ids the CLI's listing didn't surface yet.
    const requestedLiveModelScope = def.id === 'amr'
      ? resolveAmrProfile({
          ...process.env,
          ...(def.env || {}),
          ...configuredAgentEnv,
        })
      : null;
    let safeModel = resolveModelForAgent(
      def,
      typeof model === 'string'
        ? isKnownModel(def, model, requestedLiveModelScope)
          ? model
          : sanitizeCustomModel(model)
        : null,
      process.env,
      requestedLiveModelScope,
    );
    const safeReasoning =
      typeof reasoning === 'string' && Array.isArray(def.reasoningOptions)
        ? (def.reasoningOptions.find((r) => r.id === reasoning)?.id ?? null)
        : null;
    const agentOptions = { model: safeModel, reasoning: safeReasoning };
    // Accumulates the agent's visible text this run so the close handler can
    // tell whether the turn ended on a clarifying question form. The
    // `od-plugin-authoring` plugin's turn-1 flow is to emit a
    // `<question-form>` collecting the plugin brief, then STOP and wait for
    // the user to answer (see the `discovery-question-form` atom in
    // `plugins/scaffold.ts`). That turn legitimately closes with `code === 0`
    // and no `generated-plugin/` artifacts yet, so the missing-artifacts
    // guard must not treat it as a failure. We buffer the streamed text
    // rather than read the persisted message because the assistant message
    // row may not be wired up at close time. The buffer is capped because a
    // discovery form streams near the top of the turn; we only need enough to
    // validate the first complete form block (see
    // `emittedRenderableQuestionForm`).
    const CLARIFYING_QUESTION_BUFFER_CAP = 256 * 1024;
    let clarifyingQuestionText = '';
    const send = (event, data) => {
      if (
        event === 'agent' &&
        data &&
        data.type === 'text_delta' &&
        typeof data.delta === 'string' &&
        clarifyingQuestionText.length < CLARIFYING_QUESTION_BUFFER_CAP
      ) {
        clarifyingQuestionText = (clarifyingQuestionText + data.delta).slice(
          0,
          CLARIFYING_QUESTION_BUFFER_CAP,
        );
      }
      persistRunEventToAssistantMessage(db, run, event, data);
      design.runs.emit(run, event, data);
    };
    const retryAnalyticsBase = (decision, failure, errorCode) => {
      const runProjectKind = resolveRunProjectKindForAnalytics({
        hintProjectKind: null,
        projectMetadata: projectRecord?.metadata,
      });
      const isDesignSystemRun =
        runProjectKind === 'design_system' ||
        (typeof designSystemId === 'string' && designSystemId.length > 0);
      return {
        page_name: isDesignSystemRun ? 'design_system_project' : 'chat_panel',
        area: isDesignSystemRun ? 'design_system_generation' : 'chat_panel',
        project_id: typeof projectId === 'string' ? projectId : run.projectId,
        conversation_id:
          typeof conversationId === 'string' ? conversationId : run.conversationId ?? null,
        run_id: run.id,
        retry_of_run_id: run.id,
        retry_attempt_index: decision.retryAttemptIndex,
        retry_max_attempts: decision.retryMaxAttempts,
        retry_strategy: decision.retryStrategy,
        agent_provider_id: agentIdToTracking(agentId),
        model_id: modelIdForTracking(safeModel ?? model),
        ...(failure?.failure_category ? { failure_category: failure.failure_category } : {}),
        ...(failure?.failure_detail ? { failure_detail: failure.failure_detail } : {}),
        ...(failure?.failure_stage ? { failure_stage: failure.failure_stage } : {}),
        ...(errorCode ? { error_code: errorCode } : {}),
      };
    };
    const destroyChildStdio = (child) => {
      // Best-effort cleanup of stdio streams on a child process we're about
      // to drop. The daemon-sidecar (apps/daemon) keeps listeners attached
      // to child.stdout / child.stderr / child.stdin across the run
      // lifecycle (line ~12890..~13500+ in this file). Those listeners hold
      // the Stream objects alive, and the Stream objects own the read side
      // of the OS pipes — so dropping the child reference via
      // `run.child = null` without destroying the streams leaks the pipe
      // file descriptors. After a few hundred retries the daemon
      // accumulates 10k+ FDs and posix_spawn returns EBADF.
      //
      // See: https://github.com/nexu-io/open-design/issues/4100
      if (!child) return;
      const destroyStream = (stream) => {
        if (!stream || stream.destroyed) return;
        try { stream.removeAllListeners(); } catch {}
        try { stream.destroy(); } catch {}
      };
      destroyStream(child.stdout);
      destroyStream(child.stderr);
      destroyStream(child.stdin);
    };
    const restartSameRunAfterRetry = () => {
      // Release the previous child's stdio streams before letting the
      // reference drop — see destroyChildStdio for rationale.
      destroyChildStdio(run.child);
      if (
        run.child &&
        typeof run.child.kill === 'function' &&
        run.child.exitCode === null &&
        !run.child.killed
      ) {
        try { run.child.kill('SIGTERM'); } catch {}
      }
      run.status = 'queued';
      run.updatedAt = Date.now();
      run.child = null;
      run.acpSession = null;
      run.exitCode = null;
      run.signal = null;
      run.error = null;
      run.errorCode = null;
      run.stdinOpen = false;
      run.analyticsTelemetry = {
        startRequestedAt: run.analyticsTelemetry?.startRequestedAt ?? run.createdAt,
      };
      void startChatRun(chatBody, run).catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        design.runs.emit(
          run,
          'error',
          createSseErrorPayload('AGENT_EXECUTION_FAILED', message),
        );
        // Route the retried-start failure through the same finalizer as child
        // close/error so it emits terminal retry telemetry (run_retry_finished
        // with retry_result: 'failed') and sets run.retryFinalResult, instead
        // of finishing directly and leaving run_finished to report the fallback
        // retry_final_result: 'not_attempted'. retryAttemptCount is already 1
        // here, so decideSafeRunRetry suppresses with attempt_limit_reached and
        // cannot trigger another restart loop.
        finishWithRetryDecision('failed', 1, null);
      });
    };
    const finalizeRetryTelemetry = (status, decision, failure, errorCode) => {
      const attemptCount = run.retryAttemptCount ?? 0;
      const result = runResultFromStatus(status);
      if (attemptCount <= 0 && result !== 'failed') {
        run.retryFinalResult = 'not_attempted';
        run.retrySuppressedReason = undefined;
        return;
      }
      const retryResult =
        attemptCount > 0
          ? result === 'success'
            ? 'success'
            : result === 'failed'
              ? 'failed'
              : 'suppressed'
          : 'suppressed';
      const retrySuppressedReason =
        retryResult === 'suppressed'
          ? run.cancelRequested
            ? 'cancel_requested'
            : decision?.retrySuppressedReason
          : undefined;
      const eventDecision =
        attemptCount > 0
          ? { ...decision, retryAttemptIndex: attemptCount }
          : decision;
      run.retryFinalResult = retryResult;
      run.retrySuppressedReason = retrySuppressedReason;
      design.runs.emit(run, 'run_retry_finished', {
        ...retryAnalyticsBase(eventDecision, failure, errorCode),
        retry_result: retryResult,
        ...(retrySuppressedReason
          ? { retry_suppressed_reason: retrySuppressedReason }
          : {}),
      });
    };
    let pendingRpcCloseReason = null;
    const markRpcCloseReason = (reason) => {
      pendingRpcCloseReason = reason;
    };
    const deriveRpcCloseReason = (status, code, signal) => {
      if (pendingRpcCloseReason) return pendingRpcCloseReason;
      if (run.cancelRequested || status === 'canceled') return 'cancel_requested';
      if (signal) return 'signal';
      if (typeof code === 'number') return code === 0 ? 'exit_0' : 'exit_nonzero';
      return 'unknown';
    };
    const finishWithRetryDecision = (status, code = null, signal = null) => {
      run.analyticsTelemetry = {
        ...(run.analyticsTelemetry ?? {}),
        finalizeStartAt: run.analyticsTelemetry?.finalizeStartAt ?? Date.now(),
      };
      const result = runResultFromStatus(status);
      const errorCode = deriveRunErrorCode({
        status,
        error: run.error,
        errorCode: run.errorCode,
        exitCode: code,
        signal,
      });
      const failure = classifyRunFailure({
        result,
        status: {
          status,
          error: run.error,
          errorCode: run.errorCode,
          exitCode: code,
          signal,
        },
        ...(errorCode ? { errorCode } : {}),
        agentId: run.agentId,
        events: run.events,
      });
      const sideEffects = {
        ...scanRunEventsForRetrySideEffects(run.events),
        cancelRequested: !!run.cancelRequested,
      };
      const decision = decideSafeRunRetry({
        result,
        failure,
        attemptCount: run.retryAttemptCount ?? 0,
        sideEffects,
      });
      if (decision.shouldRetry && !design.runs.isTerminal(run.status)) {
        run.retryAttemptCount = decision.retryAttemptIndex;
        run.retryFinalResult = undefined;
        run.retrySuppressedReason = undefined;
        design.runs.emit(run, 'run_retry_attempted', {
          ...retryAnalyticsBase(decision, failure, errorCode),
          retry_reason: decision.retryReason,
        });
        restartSameRunAfterRetry();
        return true;
      }
      // Resume-on-failure: a terminal *resumable* failure (transient mid-stream
      // drop / inactivity) on a session-resuming runtime is not a dead end.
      // Persist the live CLI session so the next turn in this conversation
      // continues it (`--resume <id>`) instead of opening a fresh session, and
      // flag the run so the chat can surface a Continue affordance. The session
      // id is the one we actually drove this attempt with: the resumed id when
      // continuing, otherwise the freshly minted id we passed via --session-id.
      //
      // Gate on a real *committed* boundary this attempt, not merely on bytes
      // having reached the UI. A completed tool_use / artifact / live-artifact
      // corresponds to a block the agent has committed to its session (Claude
      // commits a tool_use block before running the tool), so `--resume` has
      // something concrete to pick up. We deliberately EXCLUDE
      // `userVisibleOutputSeen`: it flips true on the first streamed text
      // delta, but a single-turn drop can stream a few tokens with
      // `output_tokens == 0` and never commit a text block — resuming that
      // continues from the prior user turn (nothing to pick up), which is
      // exactly the "resume something with nothing to continue" case this
      // feature is meant to avoid. A text-only turn that is cut therefore stays
      // a from-scratch restart (auto-retry above or a manual Retry).
      // NOTE: `userVisibleOutputSeen` cannot by itself distinguish "half a text
      // block, zero commit" from "a committed text block then more streaming";
      // until the stream exposes a committed-text signal, tool/artifact blocks
      // are the only reliable resume boundary.
      const committedWorkSeen = !!(
        sideEffects.toolCallSeen ||
        sideEffects.artifactWriteSeen ||
        sideEffects.liveArtifactSeen
      );
      const liveSessionId = agentResumeCtx.isResuming
        ? agentResumeCtx.resumeSessionId
        : agentResumeCtx.newSessionId;
      const resumableFailure =
        result === 'failed' &&
        def.resumesSessionViaCli === true &&
        !!run.conversationId &&
        !!liveSessionId &&
        committedWorkSeen &&
        isResumableFailure(failure);
      run.resumable = resumableFailure;
      if (resumableFailure) {
        upsertAgentSession(db, {
          conversationId: run.conversationId,
          agentId: def.id,
          sessionId: liveSessionId,
          stablePromptHash: currentStableHash,
        });
      }
      finalizeRetryTelemetry(status, decision, failure, errorCode);
      const rpcCloseReason = deriveRpcCloseReason(status, code, signal);
      design.runs.emit(run, 'diagnostic', {
        type: 'runtime_close',
        rpc_close_reason: rpcCloseReason,
        status,
        ...(typeof code === 'number' ? { exit_code: code } : {}),
        ...(signal ? { signal } : {}),
      });
      pendingRpcCloseReason = null;
      design.runs.finish(run, status, code, signal);
      return false;
    };
    const mcpServers = buildLiveArtifactsMcpServersForAgent(def, {
      enabled: Boolean(toolTokenGrant?.token),
      command: process.execPath,
      argsPrefix: [OD_BIN],
    });

    // External MCP servers configured by the user in Settings → External MCP.
    // Open Design relays them to the agent so the model can call those tools.
    // Two delivery shapes today:
    //   - Claude Code: write a `.mcp.json` into the project cwd. Claude Code
    //     auto-loads that file at spawn (same format the CLI accepts via
    //     `claude mcp add` + Claude Desktop's config). Fire-and-forget; we
    //     deliberately do NOT block spawn on a write failure since the agent
    //     can still run without external tools — log a warning and continue.
    //   - ACP agents (Hermes/Kimi): merge stdio entries into the existing
    //     `mcpServers` array; SSE/HTTP entries are skipped because ACP's
    //     stdio-only descriptor can't represent them yet.
    // Other agents (Codex, Gemini, OpenCode, Cursor, Qwen, Qoder, Copilot,
    // Pi, DeepSeek) inherit the user's per-CLI MCP config from their own
    // home dir for now — a future change can grow this list.
    //
    // The MCP config + OAuth tokens were resolved earlier (above
    // composeDaemonSystemPrompt) so the system prompt could mention any
    // already-authenticated servers; we reuse `enabledExternalMcp` and
    // `oauthTokensForSpawn` here for the Claude `.mcp.json` write +
    // ACP merge so we don't pay for a second filesystem read.
    //
    // Claude Code: write `.mcp.json` to the daemon-managed project cwd before
    // spawn so Claude Code auto-loads the user's external MCP servers. Strict
    // gating is essential here:
    //   - cwd must be set (no project → no `.mcp.json` write).
    //   - cwd must live UNDER PROJECTS_DIR. We never write to a git-linked
    //     baseDir (= the user's own repo), since that would silently overwrite
    //     a hand-crafted .mcp.json the user already keeps in their source tree.
    // We also unlink a stale `.mcp.json` we previously wrote when the user has
    // since disabled all servers, so removing a server actually takes effect
    // on the next run.
    // Dispatch on `def.externalMcpInjection` rather than hard-coding agent
    // id / stream-format checks. The three branches are functionally
    // equivalent to the previous shape (claude/acp), with the OpenCode
    // env-content branch added to fix #2142. Runtimes that leave the field
    // undefined fall through unchanged — the settings UI surfaces an
    // explicit "external MCP is not forwarded to <agent>" banner for them
    // so the previous silent-failure UX is gone.
    if (
      def.externalMcpInjection === 'claude-mcp-json' &&
      isManagedProjectCwd(cwd, PROJECTS_DIR)
    ) {
      {
        const target = path.join(cwd, '.mcp.json');
        if (enabledExternalMcp.length > 0) {
          try {
            const claudeMcp = buildClaudeMcpJson(
              enabledExternalMcp,
              oauthTokensForSpawn,
            );
            if (claudeMcp) {
              await fs.promises.mkdir(path.dirname(target), { recursive: true });
              await fs.promises.writeFile(
                target,
                JSON.stringify(claudeMcp, null, 2),
                'utf8',
              );
            }
          } catch (err) {
            console.warn(
              '[mcp-config] failed to write project .mcp.json:',
              err && err.message ? err.message : err,
            );
          }
        } else {
          try {
            await fs.promises.unlink(target);
          } catch (err) {
            if ((err && err.code) !== 'ENOENT') {
              console.warn(
                '[mcp-config] failed to remove stale .mcp.json:',
                err && err.message ? err.message : err,
              );
            }
          }
        }
      }
    }
    if (
      enabledExternalMcp.length > 0 &&
      def.externalMcpInjection === 'acp-merge'
    ) {
      const acpExternal = buildAcpMcpServers(enabledExternalMcp);
      mcpServers.push(...acpExternal);
    }
    // OpenCode: serialise enabled MCP servers into its `mcp` config schema
    // and hand the JSON to the child via `OPENCODE_CONFIG_CONTENT`. The env
    // var is *merged* with the user's saved `~/.config/opencode/opencode
    // .json` (per OpenCode's documented config layering), so adding a
    // server here does not erase whatever the user already has in their
    // global config. We deliberately leave the env unset when no servers
    // are enabled — overwriting with `{}` would wipe the user's saved
    // mcp section for this single invocation, which is exactly the kind
    // of surprise the previous silent-failure UX taught us to avoid.
    let opencodeConfigContent: string | null = null;
    if (def.externalMcpInjection === 'opencode-env-content') {
      try {
        opencodeConfigContent = buildOpenCodeMcpConfigContent(
          enabledExternalMcp,
          oauthTokensForSpawn,
          {
            allowedDirectories: [effectiveCwd, ...extraAllowedDirs],
          },
        );
      } catch (err) {
        console.warn(
          '[mcp-config] failed to build OPENCODE_CONFIG_CONTENT:',
          err && err.message ? err.message : err,
        );
      }
    }

    // Pre-flight the composed prompt against any argv-byte budget the
    // adapter declared (only DeepSeek TUI today — its CLI doesn't accept
    // a `-` stdin sentinel, so the prompt has to ride argv). Doing this
    // before bin resolution means the test harness pins the guard
    // independently of whether the adapter binary happens to be on PATH
    // in the CI environment, and the user gets the actionable
    // adapter-named error even if /api/agents hadn't refreshed yet.
    const promptBudgetError = checkPromptArgvBudget(def, composed);
    if (promptBudgetError) {
      design.runs.emit(
        run,
        'error',
        createSseErrorPayload(
          promptBudgetError.code,
          promptBudgetError.message,
          { retryable: false },
        ),
      );
      return design.runs.finish(run, 'failed', 1, null);
    }

    let mmdRouteLaunchEnv = null;
    if (def.id === 'claude' && safeModel) {
      mmdRouteLaunchEnv = await loadMmdRouteLaunchEnv(
        {
          ...process.env,
          ...(def.env || {}),
          ...configuredAgentEnv,
        },
        safeModel,
      ).catch(() => null);
    }

    const agentLaunch = resolveAgentLaunch(def, configuredAgentEnv);
    const resolvedBin = agentLaunch.selectedPath;

    // Hoisted above the AMR catalog preflight: the empty-catalog branch
    // below calls `sendAmrAccountFailure(...)` to surface AMR_AUTH_REQUIRED
    // for signed-out users, and a `const` declared later in the same outer
    // function scope would hit a TDZ ReferenceError before initialization.
    const sendAmrAccountFailure = (failure) => {
      send('error', createSseErrorPayload(
        failure.code,
        failure.message,
        {
          retryable: true,
          details: amrAccountFailureDetails(failure),
        },
      ));
    };

    if (def.id === 'amr' && resolvedBin && agentLaunch.launchPath) {
      const launchPath = agentLaunch.launchPath ?? resolvedBin;
      const modelProbeEnv = launchPath
        ? applyAgentLaunchEnv(
            spawnEnvForAgent(
              def.id,
              {
                ...createAgentRuntimeEnv(process.env, daemonUrl, toolTokenGrant),
                ...(def.env || {}),
              },
              configuredAgentEnv,
              undefined,
              { resolvedBin: agentLaunch.selectedPath },
            ),
            agentLaunch,
          )
        : null;
      const amrModelScope = resolveAmrProfile(modelProbeEnv ?? process.env);
      // Resolve the AMR model catalog through the SAME shared cache the UI's
      // `/api/amr/models` endpoint serves (AmrModelLoadingCache): a cached
      // authoritative `vela model list` when it is hot, otherwise the offline
      // `vela model preset` seed while a remote refresh runs in the background.
      //
      // Why not a fresh `vela model list` per run: that authoritative call
      // needs network reachability to the AMR gateway AND `$HOME` (the offline
      // `preset`/`--version` calls need neither), takes up to ~10s, and only
      // retries a narrow set of network errors. Running it blocking on every
      // turn turned any transient gateway/timeout/HOME hiccup into a hard
      // "AMR model … is not available from Vela" — even for a logged-in user
      // who already picked a real model the picker surfaced from the preset
      // seed. Under CorpLink/飞连 the call routinely exceeded the timeout, so
      // AMR became unusable in packaged nightlies. Reusing the cache keeps that
      // blocking probe off the per-run hot path and degrades to preset instead
      // of fail-closing; vela's own `session/set_model` remains the final gate.
      let liveModels = [];
      try {
        const probe = await resolveAmrModelProbe();
        const catalog = await amrModelLoadingCache.get(probe.cacheKey, {
          fetchPreset: () => fetchVelaPresetModels(probe.launchPath, probe.env),
          fetchRemote: () => fetchVelaRemoteModelsWithRetry(probe.launchPath, probe.env),
        });
        liveModels = catalog.models ?? [];
      } catch (error) {
        // Do not swallow silently: a probe failure here is exactly what made
        // the packaged AMR breakage undiagnosable (the old `catch {}` left no
        // trace in any log or diagnostics bundle). Record it and degrade to the
        // remembered catalog below.
        console.warn('[amr] model catalog preflight probe failed', error);
        liveModels = [];
      }
      const rememberedLiveModels = getRememberedLiveModels(def.id, amrModelScope);
      if (liveModels.length > 0) {
        rememberLiveModels(def.id, liveModels, amrModelScope);
      }
      liveModels = preferFreshLiveModels(liveModels, rememberedLiveModels);
      const liveModelIds = new Set(
        liveModels.map((candidate) => candidate?.id).filter(Boolean),
      );
      // A request that came in as 'default'/empty is normally pre-resolved to a
      // concrete id via the agent-wide cached model order; if it still is not,
      // adopt the first catalog entry so the spawn layer always has a real id.
      const userAskedForDefault =
        typeof model !== 'string' ||
        !model.trim() ||
        model.trim().toLowerCase() === 'default';
      if (
        !safeModel ||
        safeModel === 'default' ||
        (userAskedForDefault && !liveModelIds.has(safeModel))
      ) {
        safeModel = liveModels[0]?.id ?? safeModel ?? null;
        agentOptions.model = safeModel;
      }
      if (liveModelIds.size === 0) {
        // The catalog is genuinely empty: even the offline preset seed could
        // not be read, which almost always means the user is signed out (`vela`
        // catalog calls 401) or the CLI is unrunnable. Prefer the relogin
        // affordance over a misleading "choose a model".
        if (def.id === 'amr') {
          const loginStatus = readVelaLoginStatus(
            modelProbeEnv ?? process.env,
            configuredAgentEnv,
          );
          if (!loginStatus.loggedIn) {
            sendAmrAccountFailure({
              code: 'AMR_AUTH_REQUIRED',
              message:
                'AMR sign-in is required. Sign in to AMR Cloud again, then retry this run.',
              action: 'relogin',
            });
            return design.runs.finish(run, 'failed', 1, null);
          }
        }
        // Logged in but no catalog at all AND no resolvable model: only now is
        // there nothing safe to forward, so surface the model error.
        if (!safeModel) {
          send('error', createAmrModelUnavailablePayload(safeModel, {
            reason: 'model_catalog_unavailable',
          }));
          return design.runs.finish(run, 'failed', 1, null);
        }
        // Otherwise fall through with the user's selected model and let vela's
        // `session/set_model` be the authoritative gate.
      } else if (!safeModel) {
        // Catalog known but we could not resolve any model id to forward.
        send('error', createAmrModelUnavailablePayload(
          typeof model === 'string' && model.trim() ? model : safeModel,
          { availableModels: [...liveModelIds] },
        ));
        return design.runs.finish(run, 'failed', 1, null);
      }
      // NOTE: when the selected model is absent from the (possibly preset-only
      // or stale) catalog we intentionally do NOT fail-close. The cached/preset
      // catalog can lag the live one, and a logged-in user picked a concrete
      // id; vela rejects a truly unsupported model at `session/set_model` with
      // a precise error, which beats a pre-emptive block on a flaky metadata read.
    }

    // Plain-streaming adapters that own a "continue most recent
    // conversation" CLI flag (today: only `agy -c`) read this signal
    // to resume upstream session state on follow-up turns. The query
    // matches any persisted assistant message in the same conversation
    // EXCEPT the placeholder row this run just inserted (it's still
    // `pending` and has no body — counting it as prior would always
    // force `-c` on the very first turn). Adapters that don't consume
    // this field ignore it.
    const hasPriorAssistantTurn = run.conversationId
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

    // Antigravity's `agy` is silent on stdout/stderr in print mode for
    // both auth-missing and quota-exhausted failures — the actual
    // RESOURCE_EXHAUSTED / "not logged in" payload only surfaces in
    // its `--log-file`. We allocate a per-run temp path, pipe agy's
    // log to it via buildArgs, then read it in the empty-output guard
    // to disambiguate the silent-failure cause. Other adapters ignore
    // this field.
    const agentLogFilePath =
      def.id === 'antigravity'
        ? path.join(os.tmpdir(), `od-agy-${run.id}.log`)
        : undefined;
    const promptFile = await preparePromptFileForAgent(def, composed, run.id);
    const cleanupPromptFile = () => {
      if (promptFile) promptFile.cleanup().catch(() => {});
    };

    // Codex CLI parses config.toml before processing any -c overrides. A
    // stale `service_tier = "priority"` (written by the Codex app's fast-mode
    // toggle before the value was renamed to "fast") causes an immediate parse
    // error and exit-1 before any work starts. Normalize it in-place so the
    // launch succeeds. Errors are silently swallowed — a missing or read-only
    // config.toml is fine, and the Codex CLI still surfaces the original error
    // if the write fails. See issue #4276.
    if (def.id === 'codex') {
      const { normalizeCodexConfigFile } = await import('./codex-config-normalize.js');
      // Route through spawnEnvForAgent so resolveCodexConfigPath sees the same
      // fully-expanded CODEX_HOME the Codex child process will see. In
      // particular, spawnEnvForAgent calls expandConfiguredEnv which expands
      // `~/` / `~\` prefixes — a user-configured CODEX_HOME="~/.codex-alt"
      // would otherwise resolve to the literal path "~/.codex-alt/config.toml"
      // in the normalizer while the child resolves it to the absolute path,
      // leaving the real config untouched. Mirrors the diagnostics-export.ts
      // `envFor('codex')` pattern. See issue #4276.
      await normalizeCodexConfigFile(
        spawnEnvForAgent('codex', process.env, configuredAgentEnv),
      );
    }

    // Serialize antigravity spawns whose buildArgs writes a concrete
    // model into settings.json. Two concurrent runs with different
    // models would otherwise race the file: A writes model A, B writes
    // model B, then A's agy reads model B. The lock is acquired BEFORE
    // buildArgs (which performs the write) and released asynchronously
    // AFTER agy's --log-file confirms the model was propagated. See
    // `antigravity.ts` for the chain implementation.
    let antigravityModelLockRelease: (() => void) | null = null;
    const antigravityConcreteModel =
      def.id === 'antigravity'
      && typeof agentOptions.model === 'string'
      && agentOptions.model.length > 0
      && agentOptions.model !== 'default'
        ? agentOptions.model
        : null;
    if (antigravityConcreteModel) {
      const { acquireAntigravityModelLock } = await import(
        './runtimes/defs/antigravity.js'
      );
      antigravityModelLockRelease = await acquireAntigravityModelLock();
    }

    let args;
    try {
      args = def.buildArgs(
        composed,
        safeImages,
        extraAllowedDirs,
        agentOptions,
        {
          cwd: effectiveCwd,
          hasPriorAssistantTurn,
          agentLogFilePath,
          promptFilePath: promptFile?.path,
          resumeSessionId: agentResumeCtx.resumeSessionId,
          newSessionId: agentResumeCtx.newSessionId,
        },
      );
    } catch (err) {
      cleanupPromptFile();
      throw err;
    }
    // Second-pass budget check that knows about the Windows `.cmd` shim
    // wrap. The pre-buildArgs `checkPromptArgvBudget` only looks at the
    // raw composed prompt; on Windows an npm-installed adapter resolves
    // to e.g. `deepseek.cmd`, the spawn path goes through `cmd.exe /d /s
    // /c "<inner>"`, and `quoteForWindowsCmdShim` doubles every embedded
    // `"` plus wraps any whitespace/special-char arg in outer quotes —
    // so a quote-heavy prompt that fit under `maxPromptArgBytes` can
    // still expand past CreateProcess's 32_767-char cap. Fail fast with
    // the same `AGENT_PROMPT_TOO_LARGE` shape so the SSE error path
    // doesn't have to special-case it.
    const cmdShimBudgetError = checkWindowsCmdShimCommandLineBudget(
      def,
      agentLaunch.launchPath ?? resolvedBin,
      args,
    );
    if (cmdShimBudgetError) {
      cleanupPromptFile();
      design.runs.emit(
        run,
        'error',
        createSseErrorPayload(
          cmdShimBudgetError.code,
          cmdShimBudgetError.message,
          { retryable: false },
        ),
      );
      return design.runs.finish(run, 'failed', 1, null);
    }

    // Companion guard for non-shim Windows installs (e.g. a cargo-built
    // `deepseek.exe` rather than the npm `.cmd` shim). Direct `.exe`
    // spawns skip the cmd.exe wrap above, but Node/libuv still composes
    // a CreateProcess `lpCommandLine` by walking each argv element
    // through `quote_cmd_arg`, which escapes every embedded `"` as `\"`
    // and doubles backslashes adjacent to quotes. A quote-heavy prompt
    // under `maxPromptArgBytes` can expand past the 32_767-char kernel
    // cap there too, so the cmd-shim early-return alone would let those
    // users hit a generic `spawn ENAMETOOLONG`.
    const directExeBudgetError = checkWindowsDirectExeCommandLineBudget(
      def,
      agentLaunch.launchPath ?? resolvedBin,
      args,
    );
    if (directExeBudgetError) {
      cleanupPromptFile();
      design.runs.emit(
        run,
        'error',
        createSseErrorPayload(
          directExeBudgetError.code,
          directExeBudgetError.message,
          { retryable: false },
        ),
      );
      return design.runs.finish(run, 'failed', 1, null);
    }

    let persistDeliveredAgentSessionState = () => {};
    if (def.resumesSessionViaCli === true && run.conversationId) {
      let persisted = false;
      persistDeliveredAgentSessionState = () => {
        if (persisted) return;
        persisted = true;
        if (!agentResumeCtx.isResuming && agentResumeCtx.newSessionId) {
          upsertAgentSession(db, {
            conversationId: run.conversationId,
            agentId: def.id,
            sessionId: agentResumeCtx.newSessionId,
            stablePromptHash: currentStableHash,
          });
          return;
        }
        if (agentResumeCtx.isResuming && includeStableInstructions) {
          updateAgentSessionStableHash(db, run.conversationId, def.id, currentStableHash);
        }
      };
    }

    // `runStartTimeMs` is consumed by the run-end artifact-manifest
    // reconciler (#2893 / #3110) to skip artifacts whose mtime predates
    // this run. The original main-side hunk also re-declared `const send`
    // here; on this branch `send` was hoisted into the AMR preflight
    // earlier, so we keep only the new `runStartTimeMs` declaration.
    const runStartTimeMs = Date.now();
    const inactivityTimeoutMs = resolveChatRunInactivityTimeoutMs(def.inactivityTimeoutMs);
    const artifactQuietPeriodMs = resolveChatRunArtifactQuietPeriodMs();
    const inactivityKillGraceMs = 3_000;
    let inactivityTimer = null;
    let childStdoutSeen = false;
    let lastAgentEventPhase = 'spawn pending';
    let lastToolResultChars = 0;
    // Becomes true once any live-artifact create has been registered for
    // this run. Subsequent watchdog scheduling uses the shorter quiet
    // period, and a watchdog trip after this point is treated as
    // "agent finished the deliverable and went idle" rather than
    // "agent stalled with nothing to show" (issue #1451).
    let artifactRegistered = false;
    // Only daemon-initiated quiet-period termination should be treated
    // as `succeeded` in the close handler. A later unrelated SIGTERM /
    // SIGKILL (external `kill`, OOM, container shutdown) must keep its
    // existing `failed` classification even when `artifactRegistered`
    // is true — those signals don't mean the agent finished cleanly,
    // they just terminated the process. Set strictly inside
    // `failForInactivity`'s quiet-period branch.
    let artifactQuietShutdownRequested = false;
    // Set when the no-output inactivity watchdog routed this attempt through
    // the same-run retry finalizer AND that finalizer restarted the run on a
    // fresh child. The stalled child is then SIGTERM'd, so its later `close`
    // must NOT finalize the run a second time or unregister the new attempt's
    // event sink / run handle (both keyed by the shared runId). The close
    // handler bails early when this is true, revoking only this attempt's own
    // tool token.
    let watchdogRetryRestarted = false;
    const summarizeAgentEventForInactivity = (payload) => {
      const type = payload?.type ? String(payload.type) : 'unknown';
      if (type === 'tool_result') {
        const content = typeof payload.content === 'string' ? payload.content : '';
        lastToolResultChars = Math.max(lastToolResultChars, content.length);
        return `tool_result:${content.length} chars`;
      }
      if (type === 'tool_use') {
        const name = payload?.name ? String(payload.name) : 'unknown';
        return `tool_use:${name}`;
      }
      if (type === 'text_delta' || type === 'thinking_delta') {
        const text = typeof payload.delta === 'string'
          ? payload.delta
          : typeof payload.text === 'string'
            ? payload.text
            : '';
        return `${type}:${text.length} chars`;
      }
      if (type === 'status') {
        const label = payload?.label ? String(payload.label) : 'unknown';
        return `status:${label}`;
      }
      return type;
    };
    const clearInactivityWatchdog = () => {
      if (inactivityTimer) {
        clearTimeout(inactivityTimer);
        inactivityTimer = null;
      }
    };
    let forcedChildShutdownTimers = [];
    const clearForcedChildShutdown = () => {
      for (const timer of forcedChildShutdownTimers) clearTimeout(timer);
      forcedChildShutdownTimers = [];
    };
    const scheduleForcedChildShutdown = () => {
      if (!child) return;
      clearForcedChildShutdown();
      forcedChildShutdownTimers = [
        setTimeout(() => {
          if (child) design.runs.signalChild(run, 'SIGTERM');
        }, inactivityKillGraceMs),
        setTimeout(() => {
          if (child) design.runs.signalChild(run, 'SIGKILL');
        }, inactivityKillGraceMs * 2),
      ];
    };
    const failForInactivity = () => {
      if (run.cancelRequested || design.runs.isTerminal(run.status)) return;
      clearInactivityWatchdog();
      if (artifactRegistered) {
        // The deliverable already exists. The agent process is either
        // genuinely idle (claude-code's stream-json child sitting on an
        // open stdin) or wedged in post-write reasoning that never
        // emits stdout. Either way, finishing the run via the normal
        // child-exit path (status decision in child.on('close') below)
        // is safer than tearing it down with a failure banner — the
        // tool token, cancel state, and exit-code classification stay
        // owned by the existing lifecycle. SIGTERM the child and let
        // the close handler classify the run as succeeded (via the
        // artifactQuietShutdown branch). Mark this termination as
        // daemon-initiated so an unrelated later signal (external
        // kill, OOM) is NOT silently reclassified to `succeeded` —
        // only signals from this watchdog branch should be.
        artifactQuietShutdownRequested = true;
        if (acpSession?.abort) {
          acpSession.abort();
        }
        if (child && !child.killed) design.runs.signalChild(run, 'SIGTERM');
        scheduleForcedChildShutdown();
        return;
      }
      // OpenCode retries a 429 usage-limit silently and emits nothing on
      // stdout/stderr, so the watchdog is the first signal we get. The real
      // reason is recorded only in OpenCode's own session log — recover it
      // and surface it HERE, before finish() tears down the live SSE
      // clients, so a viewer sees "usage limit reached" instead of the
      // generic stall message. Bound to this run via `since` so a stale or
      // concurrent session's error can't be misattributed. See issue #982.
      let stallPayload = null;
      if (agentId === 'opencode') {
        const logFailure = readOpenCodeServiceFailure(spawnedAgentEnv, {
          since: run.createdAt,
        });
        if (logFailure) {
          stallPayload = createSseErrorPayload(
            logFailure.code,
            logFailure.message,
            { retryable: true },
          );
        }
      }
      if (!stallPayload) {
        const message =
          `Agent stalled without emitting any new output for ${Math.round(inactivityTimeoutMs / 1000)}s. ` +
          'The model or CLI likely hung while generating. ' +
          `Phase details: spawned agent ${userFacingAgentLabel(agentId, resolvedBin)}; stdout arrived: ${childStdoutSeen ? 'yes' : 'no'}; ` +
          `last agent event: ${lastAgentEventPhase}; largest tool result observed: ${lastToolResultChars} chars. ` +
          'Retry the turn, pick a different model, or start a new conversation if the prior context is very large.';
        stallPayload = createSseErrorPayload('AGENT_EXECUTION_FAILED', message, { retryable: true });
      }
      send('error', stallPayload);
      // A silent first-token hang is one of the safe transient failure shapes
      // this run is allowed to recover: classifyRunFailure maps the stall text
      // to a retryable `timeout` at `first_token_wait`, and decideSafeRunRetry
      // permits the same-run retry when no output/tools/artifacts were seen.
      // Route through the shared finalizer (after surfacing stallPayload) so
      // the watchdog path gets the same run_retry_attempted/run_retry_finished
      // telemetry as child close/error — not a bare terminal failure.
      const retried = finishWithRetryDecision('failed', 1, null);
      if (retried) {
        watchdogRetryRestarted = true;
      }
      if (acpSession?.abort) {
        acpSession.abort();
      }
      if (child && !child.killed) design.runs.signalChild(run, 'SIGTERM');
      scheduleForcedChildShutdown();
    };
    const activeInactivityTimeoutMs = () =>
      resolveActiveInactivityTimeoutMs({
        inactivityTimeoutMs,
        artifactQuietPeriodMs,
        artifactRegistered,
      });
    const noteAgentActivity = () => {
      const delay = activeInactivityTimeoutMs();
      if (delay <= 0) return;
      clearInactivityWatchdog();
      inactivityTimer = setTimeout(failForInactivity, delay);
      inactivityTimer.unref?.();
    };
    const noteArtifactRegistered = () => {
      if (artifactRegistered) return;
      artifactRegistered = true;
      // Switch the watchdog to the shorter quiet-period window
      // immediately so we don't have to wait for the next agent event
      // before the new ceiling takes effect. Call unconditionally:
      // an earlier `if (inactivityTimer)` gate left the run in limbo
      // when `OD_CHAT_RUN_INACTIVITY_TIMEOUT_MS=0` but
      // `OD_CHAT_RUN_ARTIFACT_QUIET_PERIOD_MS>0` — noteAgentActivity()
      // had returned early at run start (pre-artifact delay = 0,
      // no timer set), so the guard then skipped the re-arm and the
      // newly-positive quiet-period delay never armed a timer at all.
      // `noteAgentActivity` itself is the one that decides whether to
      // schedule (it bails when the active delay is 0), so leaving the
      // decision there keeps the behavior coherent across all four
      // combinations of pre / quiet timeouts.
      noteAgentActivity();
    };
    const unregisterChatAgentEventSink = () => {
      const sinkRunId = toolTokenGrant?.runId ?? runId;
      activeChatAgentEventSinks.delete(sinkRunId);
      activeChatRunHandles.delete(sinkRunId);
    };
    if (toolTokenGrant?.runId) {
      activeChatAgentEventSinks.set(toolTokenGrant.runId, (payload) => {
        lastAgentEventPhase = summarizeAgentEventForInactivity(payload);
        noteAgentActivity();
        send('agent', payload);
      });
      activeChatRunHandles.set(toolTokenGrant.runId, { noteArtifactRegistered });
    }
    // If detection can't find the binary, surface a friendly SSE error
    // pointing at /api/agents instead of silently falling back to
    // spawn(def.bin) — that fallback re-introduces the exact ENOENT symptom
    // from issue #10.
    if (!resolvedBin || !agentLaunch.launchPath) {
      cleanupPromptFile();
      revokeToolToken('child_exit');
      unregisterChatAgentEventSink();
      send('error', createSseErrorPayload(
        'AGENT_UNAVAILABLE',
        `Agent "${def.name}" (\`${def.bin}\`) is not installed or not on PATH. ` +
          'Install it and refresh the agent list (GET /api/agents) before retrying.',
        { retryable: true },
      ));
      return design.runs.finish(run, 'failed', 1, null);
    }
    const browserUseRuntimeEnv = run.browserUse
      ? {
          OD_BROWSER_USE_REQUESTED: run.browserUse.requested ? '1' : '0',
          OD_BROWSER_USE_AVAILABLE: run.browserUse.available ? '1' : '0',
          ...(run.browserUse.reason ? { OD_BROWSER_USE_UNAVAILABLE_REASON: run.browserUse.reason } : {}),
          OD_BROWSER_USE_REGISTRY_PATH: run.browserUse.diagnostics?.registryPath ?? '',
        }
      : {};
    const agentSpawnEnv = spawnEnvForAgent(
      def.id,
      {
        ...createAgentRuntimeEnv(process.env, daemonUrl, toolTokenGrant),
        ...(def.env || {}),
        ...browserUseRuntimeEnv,
      },
      configuredAgentEnv,
      undefined,
      { resolvedBin: agentLaunch.selectedPath },
    );
    if (def.id === 'amr') {
      const loginStatus = readVelaLoginStatus(agentSpawnEnv, configuredAgentEnv);
      if (!loginStatus.loggedIn) {
        cleanupPromptFile();
        revokeToolToken('child_exit');
        unregisterChatAgentEventSink();
        sendAmrAccountFailure({
          code: 'AMR_AUTH_REQUIRED',
          message: 'AMR sign-in is required. Sign in to AMR Cloud again, then retry this run.',
          action: 'relogin',
        });
        return design.runs.finish(run, 'failed', 1, null);
      }
    }
    const odMediaEnv = {
      OD_BIN,
      OD_NODE_BIN,
      OD_DAEMON_URL: daemonUrl,
      ...(typeof projectId === 'string' && projectId && cwd
        ? {
            OD_PROJECT_ID: projectId,
            OD_PROJECT_DIR: cwd,
          }
        : {}),
    };
    if (run.cancelRequested || design.runs.isTerminal(run.status)) {
      cleanupPromptFile();
      revokeToolToken('child_exit');
      unregisterChatAgentEventSink();
      return;
    }

    run.status = 'running';
    run.updatedAt = Date.now();
    send('start', {
      runId,
      agentId,
      bin: userFacingAgentLabel(agentId, resolvedBin),
      streamFormat: def.streamFormat ?? 'plain',
      projectId: typeof projectId === 'string' ? projectId : null,
      cwd,
      model: safeModel,
      reasoning: safeReasoning,
      toolTokenExpiresAt: toolTokenGrant?.expiresAt ?? null,
    });
    noteAgentActivity();

    let child;
    let acpSession = null;
    let writePromptToChildStdin = false;
    let spawnedAgentEnv = null;
    let agentStdoutTail = '';
    let agentStderrTail = '';
    const agentStderrFilter = createAgentStderrVisibilityFilter(agentId);
    const emitVisibleAgentStderr = (chunk: unknown) => {
      const visibleChunk = agentStderrFilter.write(chunk);
      if (!visibleChunk) return;
      agentStderrTail = `${agentStderrTail}${visibleChunk}`.slice(-2000);
      send('stderr', { chunk: visibleChunk });
    };
    const flushVisibleAgentStderr = () => {
      const visibleChunk = agentStderrFilter.flush();
      if (!visibleChunk) return;
      agentStderrTail = `${agentStderrTail}${visibleChunk}`.slice(-2000);
      send('stderr', { chunk: visibleChunk });
    };
    try {
      // Prompt delivery via stdin is now the universal default. This bypasses
      // both the cmd.exe 8KB limit and the CreateProcess 32KB limit.
      const stdinMode =
        def.promptViaStdin || def.streamFormat === 'acp-json-rpc'
          ? 'pipe'
          : 'ignore';
      const env = applyAgentLaunchEnv({
        ...agentSpawnEnv,
        ...(mmdRouteLaunchEnv || {}),
        ...odMediaEnv,
        ...openDesignAmrTraceEnv({
          agentId: def.id,
          runId: run.id,
          conversationId: run.conversationId,
          runAttempt: run.retryAttemptCount ?? 0,
        }),
        // OpenCode external-MCP injection (issue #2142). Layered AFTER
        // spawnEnvForAgent / odMediaEnv / configuredAgentEnv so the
        // daemon-built MCP config wins over a stale value the user
        // might have exported in their shell — that would let an
        // outdated content string suppress the user's freshly-saved
        // MCP servers, which is exactly the bug we are fixing.
        // `opencodeConfigContent === null` means "no enabled servers";
        // we deliberately leave the env unset in that case so the
        // user's saved `~/.config/opencode/opencode.json` continues
        // to apply as-is.
        ...(opencodeConfigContent
          ? { OPENCODE_CONFIG_CONTENT: opencodeConfigContent }
          : {}),
      }, agentLaunch);
      spawnedAgentEnv = env;
      const invocation = createCommandInvocation({
        command: agentLaunch.launchPath,
        args,
        env,
      });
      run.analyticsTelemetry = {
        ...(run.analyticsTelemetry ?? {}),
        processSpawnStartedAt: Date.now(),
      };
      child = spawn(invocation.command, invocation.args, {
        env,
        stdio: [stdinMode, 'pipe', 'pipe'],
        cwd: effectiveCwd,
        shell: false,
        detached: process.platform !== 'win32',
        // Required when invocation wraps a Windows .cmd/.bat shim through
        // cmd.exe; without this, Node re-escapes the inner command line and
        // breaks paths containing spaces (issue #315).
        windowsVerbatimArguments: invocation.windowsVerbatimArguments,
      });
      run.analyticsTelemetry = {
        ...(run.analyticsTelemetry ?? {}),
        processSpawnedAt: Date.now(),
      };
      run.child = child;
      run.childPid = typeof child.pid === 'number' ? child.pid : null;
      run.processGroupId =
        process.platform !== 'win32' && typeof child.pid === 'number'
          ? child.pid
          : null;
      // Schedule release of the antigravity model lock once agy's
      // --log-file confirms the chosen model was propagated to the
      // backend (the upstream signal that settings.json was read).
      // The watcher's `false` return (timeout) deliberately does NOT
      // release — looper review at 263fd2fe7 flagged that releasing
      // on timeout reopens the slow-cold-start race: a >15s agy
      // startup that hadn't yet read settings.json would let run B
      // rewrite the file and run A would then read run B's model.
      // The exit handler is the canonical fallback that releases the
      // lock no matter what (crashed agy, fast exit, etc.) so the
      // queue can never starve permanently.
      if (
        antigravityModelLockRelease
        && antigravityConcreteModel
        && agentLogFilePath
      ) {
        const releaseOnce = (() => {
          let fired = false;
          return () => {
            if (fired) return;
            fired = true;
            antigravityModelLockRelease?.();
          };
        })();
        const watcherAbort = new AbortController();
        const { waitForAgyToReadModel } = await import(
          './runtimes/defs/antigravity.js'
        );
        void waitForAgyToReadModel(
          agentLogFilePath,
          antigravityConcreteModel,
          { abortSignal: watcherAbort.signal },
        )
          .then((found) => {
            // Only release on TRUE confirmation; a `false` return means
            // the watcher ran out of its polling window without seeing
            // the propagation line. We hold the lock until child exit
            // so a slow-cold-start agy can't be pre-empted by a
            // concurrent settings.json rewrite from run B.
            if (found) releaseOnce();
          })
          .catch(() => undefined);
        child.once('exit', () => {
          // Stop the watcher so its pending readFile / setTimeout
          // chain does not outlive the run and leak into subsequent
          // antigravity spawns (or test cases).
          watcherAbort.abort();
          releaseOnce();
        });
      }
      if (def.promptViaStdin && child.stdin && def.streamFormat !== 'pi-rpc') {
        // EPIPE from a fast-exiting CLI (bad auth, missing model, exit on
        // launch) would otherwise surface as an unhandled stream error and
        // crash the daemon. Swallow it — the regular exit/close handlers
        // below already route the underlying failure to SSE via stderr.
        child.stdin.on('error', (err) => {
          // EPIPE = Unix broken-pipe when child closes its stdin read end
          // early. 'write EOF' (err.code 'EOF') = Windows equivalent of
          // the same condition via UV_EOF. Both mean the child exited before
          // reading stdin — the process exit/close handlers already route
          // the underlying failure to SSE via stderr, so swallow these here.
          if (err.code !== 'EPIPE' && err.code !== 'EOF' && err.message !== 'write EOF') {
            send(
              'error',
              createSseErrorPayload(
                'AGENT_EXECUTION_FAILED',
                `stdin: ${err.message}`,
              ),
            );
          }
        });
        writePromptToChildStdin = true;
      }
    } catch (err) {
      cleanupPromptFile();
      revokeToolToken('child_exit');
      unregisterChatAgentEventSink();
      send('error', createSseErrorPayload('AGENT_EXECUTION_FAILED', `spawn failed: ${err.message}`));
      design.runs.finish(run, 'failed', 1, null);
      return;
    }

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    // Reset the inactivity watchdog on every raw stdout byte so that
    // structured adapters that buffer partial lines (Codex item.completed,
    // pi-rpc session/prompt, ACP agent messages) and models that spend a
    // long time in non-streamed reasoning still keep the run alive.
    child.stdout.on('data', (chunk) => {
      childStdoutSeen = true;
      noteAgentActivity();
      agentStdoutTail = `${agentStdoutTail}${chunk}`.slice(-2000);
    });

    // ---- Memory: assistant-reply buffer for LLM extraction --------------
    // Capture up to 32 KiB of raw stdout. The LLM extractor (fired in the
    // close handler) trims further; we only need enough to ground the
    // model. Multiple `on('data')` listeners coexist — the wrapper-stream
    // handlers below also subscribe and that's fine.
    const MEMORY_BUFFER_CAP = 32 * 1024;
    let memoryAssistantBuffer = '';
    child.stdout.on('data', (chunk) => {
      if (memoryAssistantBuffer.length >= MEMORY_BUFFER_CAP) return;
      memoryAssistantBuffer += String(chunk);
      if (memoryAssistantBuffer.length > MEMORY_BUFFER_CAP) {
        memoryAssistantBuffer = memoryAssistantBuffer.slice(0, MEMORY_BUFFER_CAP);
      }
    });
    child.on('close', () => {
      const captured = memoryAssistantBuffer;
      const userMsg = typeof message === 'string' ? message : '';
      // Forward the chat agent id so memory-llm.pickProvider can
      // constrain its auto-pick to the chat protocol's family — keeps
      // a Claude Code (anthropic) chat from triggering OpenAI/gpt-4o-
      // mini extraction in the background just because the user has
      // an OpenAI key parked in media-config.
      void import('./memory-llm.js')
        .then(({ extractWithLLM }) =>
          extractWithLLM(
            RUNTIME_DATA_DIR,
            {
              userMessage: userMsg,
              assistantMessage: captured,
            },
              {
                projectRoot: PROJECT_ROOT,
                chatAgentId: typeof agentId === 'string' ? agentId : null,
                chatModel: typeof safeModel === 'string' ? safeModel : null,
              },
            ),
        )
        .catch((err) => console.warn('[memory-llm] background failed', err));
    });

    // Critique Theater branch (M0 dark launch, default disabled).
    // Only plain-stream adapters are routed through runOrchestrator in v1.
    // Adapters that emit structured wrappers (claude-stream-json,
    // qoder-stream-json, copilot-stream-json, json-event-stream,
    // acp-json-rpc, pi-rpc) fall
    // through to the legacy single-pass code path below with a one-time
    // stderr warning so the parser never sees wrapper bytes. Per-format
    // decoding into the orchestrator is a v2 concern.
    //
    // Use critiqueShouldRun (computed in the prompt builder) instead of
    // just the env var or the rollout resolver so the orchestrator gate
    // is in lockstep with the panel addendum. Media surfaces and runs
    // missing brand/skill context never get the panel prompt, so they
    // must also skip the orchestrator and fall through to legacy
    // generation; otherwise the parser waits for <CRITIQUE_RUN> tags
    // the model was never told to emit.
    if (critiqueShouldRun) {
      const adapterStreamFormat: string = def.streamFormat ?? 'plain';
      if (adapterStreamFormat !== 'plain') {
        if (!critiqueWarnedAdapters.has(adapterStreamFormat)) {
          critiqueWarnedAdapters.add(adapterStreamFormat);
          console.warn(`[critique] adapter format=${adapterStreamFormat} is not plain-stream; skipping orchestrator and falling through to legacy generation`);
        }
      } else {
        const critiqueRunId = run.id;
        // Per-run artifact directory keeps concurrent or sequential runs in the
        // same project from overwriting each other's transcript or final HTML.
        // Spec: artifacts/<projectId>/<runId>/transcript.ndjson(.gz).
        const critiqueProjectKey = typeof projectId === 'string' && projectId ? projectId : critiqueRunId;
        const critiqueArtifactDir = path.join(ARTIFACTS_DIR, critiqueProjectKey, critiqueRunId);
        const stdoutIterable = (async function* () {
          for await (const chunk of child.stdout) yield String(chunk);
        })();
        // Forward each CritiqueSseEvent on its own contract-defined channel
        // (critique.run_started, critique.ship, critique.failed, ...) rather
        // than wrapping the frame inside the legacy 'agent' channel. Clients
        // that subscribe to the new event names see them directly with the
        // contract payload as event.data.
        //
        // Critique events go to TWO sinks (codex P1 on PR #1338):
        //
        //   1. `design.runs.emit(...)` via `send(...)`, which fans out on
        //      `/api/runs/:runId/events`. Existing transport, unchanged.
        //   2. The per-project event-sinks map, which fans out on
        //      `/api/projects/:projectId/events`. This is the transport the
        //      web `CritiqueTheaterMount` actually subscribes to (the mount
        //      is project-scoped, not run-scoped, because it lives at the
        //      project workspace level and follows the user across runs).
        //      Without this second sink the mount sees no frames in
        //      production and only the e2e tests' stubbed routes deliver
        //      anything to the reducer.
        //
        // The project-events route emits via `sse.send(payload.type,
        // payload)`, so we pack the SSE channel name onto `payload.type`
        // and let the sink push the right channel name. The web's
        // `sseToPanelEvent` overwrites `type` from the channel name on the
        // way back into a PanelEvent, so this round-trip stays correct.
        const critiqueProjectIdForBus =
          typeof projectId === 'string' && projectId ? projectId : null;
        const critiqueBus = {
          emit: (e) => {
            // Two transports for every critique event: the run-scoped
            // SSE send back to the originating chat run, plus the
            // project-scoped fan-out so the Theater mount (subscribed
            // to /api/projects/:id/events) sees it too. Route the
            // project fan-out through emitProjectEvent so empty-sink
            // cleanup and any future broadcast policy (rate limiting,
            // schema validation, telemetry) apply uniformly across
            // every project emitter (PerishCode P3 on PR #1338).
            send(e.event, e.data);
            if (critiqueProjectIdForBus) {
              emitProjectEvent(critiqueProjectIdForBus, { ...e.data, type: e.event });
            }
          },
        };

        // Register this run with the in-process registry so the interrupt
        // endpoint can cascade an AbortController to the orchestrator. The
        // register call must run BEFORE runOrchestrator is invoked, so a
        // request that arrives between spawn and orchestrator-start cannot
        // miss a runId that already has a live child process.
        const critiqueAbort = new AbortController();
        critiqueRunRegistry.register({
          runId: critiqueRunId,
          projectId: critiqueProjectKey,
          abort: critiqueAbort,
          startedAt: Date.now(),
        });

        // Stderr forwarding and child.on('error') must be wired BEFORE the
        // orchestrator awaits stdout. Otherwise a CLI that floods stderr can
        // fill the OS pipe and deadlock the run until the total timeout, and
        // an early child error fired before the orchestrator returns has no
        // listener. Both registrations are idempotent and the run lifecycle
        // is owned solely by the orchestrator's awaited result below.
        child.stderr.on('data', (chunk) => {
          noteAgentActivity();
          emitVisibleAgentStderr(chunk);
        });
        child.on('error', (err) => {
          flushVisibleAgentStderr();
          send('error', createSseErrorPayload('AGENT_EXECUTION_FAILED', err.message));
        });

        // Wrap the child's close event so the orchestrator can race child
        // exit against parser completion, abort, and timeouts in one awaited
        // flow. Without this the orchestrator can't tell a non-zero exit
        // apart from a clean ship and may misclassify failures.
        const childExitPromise = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
          child.once('close', (code, signal) => {
            flushVisibleAgentStderr();
            resolve({ code, signal });
          });
        });
        try {
          const orchestratorResult = await runOrchestrator({
            runId: critiqueRunId,
            projectId: typeof projectId === 'string' ? projectId : '',
            conversationId: typeof conversationId === 'string' ? conversationId : null,
            artifactId: critiqueRunId,
            artifactDir: critiqueArtifactDir,
            adapter: typeof agentId === 'string' ? agentId : 'unknown',
            // Codex P2 on PR #1485: thread the resolved skill id into the
            // orchestrator so the Phase 12 metrics carry the real label
            // instead of falling through to 'unknown' for every live run.
            // `effectiveSkillId` was already computed above (line ~2951) as
            // the request skillId with a project-row fallback; pass it
            // through verbatim, and leave the orchestrator's own default
            // of 'unknown' for runs that genuinely have no skill assigned.
            skill: typeof effectiveSkillId === 'string' && effectiveSkillId
              ? effectiveSkillId
              : undefined,
            cfg: critiqueCfg,
            db,
            bus: critiqueBus,
            stdout: stdoutIterable,
            child,
            childExitPromise,
            signal: critiqueAbort.signal,
          });
          // Map the critique terminal status to the chat run lifecycle.
          // 'shipped' and 'below_threshold' both ran to a ship decision and
          // finalize as 'succeeded'; every other status (timed_out,
          // interrupted, degraded, failed, legacy) is a failure path so the
          // run reflects the real outcome instead of a misleading success.
          const succeeded = orchestratorResult.status === 'shipped'
            || orchestratorResult.status === 'below_threshold';
          if (run.cancelRequested) {
            design.runs.finish(run, 'canceled', 1, null);
          } else if (succeeded) {
            design.runs.finish(run, 'succeeded', 0, null);
          } else {
            design.runs.finish(run, 'failed', 1, null);
          }
        } catch (err) {
          flushVisibleAgentStderr();
          send('error', createSseErrorPayload('AGENT_EXECUTION_FAILED', err instanceof Error ? err.message : String(err)));
          design.runs.finish(run, 'failed', 1, null);
        } finally {
          critiqueRunRegistry.unregister(critiqueProjectKey, critiqueRunId);
        }
        return;
      }
    }

    // Structured streams (Claude Code) go through a line-delimited JSON
    // parser that turns stream_event objects into UI-friendly events. For
    // plain streams (most other CLIs) we forward raw chunks unchanged so
    // the browser can append them to the assistant's text buffer.
    let agentStreamError = null;
    // Holds buffered plain-text stdout chunks for agents (currently
    // antigravity) where we need to inspect the full output at close
    // time before deciding whether to forward it. The auth-prompt guard
    // in the close handler suppresses the buffer when the output is an
    // OAuth prompt; otherwise the flush below sends the chunks in order.
    const plaintextStdoutBuffer: BufferedStdoutChunk[] = [];
    // Arrival time of the first buffered plain-text stdout chunk
    // (antigravity). First-token timing is stamped from this value only
    // when the buffer is actually flushed to the client at close time. If
    // the auth-prompt guard suppresses the buffer (the OAuth login URL is
    // printed to stdout), no token ever reaches the user, so TTFT must not
    // be recorded for that failure mode. See PR #3412.
    let firstBufferedStdoutAt: number | null = null;
    // Tracks whether any stream the run is using actually emitted user-
    // visible content. Only the streams routed through `sendAgentEvent`
    // contribute to this flag; ACP sessions and plain stdout streams are
    // covered by their own success/failure paths and the empty-output
    // guard below skips them via `trackingSubstantiveOutput`.
    let agentProducedOutput = false;
    let trackingSubstantiveOutput = false;
    const looksLikeGeminiJsonEventStream = (text: string) => (
      isGeminiJsonEventStream(parseGeminiJsonEventStreamEvents(text))
    );
    // Event types that count as "the agent actually produced something the
    // user can see." Lifecycle markers (`status`) and meter readings
    // (`usage`) deliberately do NOT count — a model can emit token-usage
    // numbers for an empty completion (issue #691), and a `status:running`
    // banner without any follow-up is exactly the silent-failure shape we
    // want to surface as failed instead of succeeded.
    const SUBSTANTIVE_AGENT_EVENT_TYPES = new Set([
      'text_delta',
      'thinking_delta',
      'tool_use',
      'tool_result',
      'artifact',
    ]);
    // First-token timing must reflect when the user actually starts seeing
    // model output, so only token-producing events qualify. `tool_use` is
    // deliberately excluded: a run that opens with a Read/Glob/MCP call would
    // otherwise stamp `firstTokenAt` before any `text_delta` streamed,
    // making `time_to_first_token_ms` / `spawn_to_first_token_ms` under-report
    // TTFT for tool-first runs. `thinking_delta` stays in because it is the
    // first visible model activity the user perceives.
    const FIRST_TOKEN_AGENT_EVENT_TYPES = new Set([
      'text_delta',
      'thinking_delta',
    ]);
    const noteFirstTokenAt = (timestamp = Date.now()) => {
      if (run.analyticsTelemetry?.firstTokenAt) return;
      run.analyticsTelemetry = {
        ...(run.analyticsTelemetry ?? {}),
        firstTokenAt: timestamp,
      };
    };
    const noteFirstTokenFromAgentEvent = (ev) => {
      if (ev?.type && FIRST_TOKEN_AGENT_EVENT_TYPES.has(ev.type)) {
        noteFirstTokenAt();
      }
    };

    // Per-run role-marker guard for non-Claude structured streams (#3247).
    // Claude has its own per-message guards in claude-stream.ts.
    const runGuard = createRoleMarkerGuard('run');
    let runWarned = false;
    const titleMarkerStripper = createAgentTitleMarkerStripper({
      enabled: Boolean(titleGenerationRequested),
      emitTitle: (title) => send('agent', { type: 'conversation_title', title }),
    });

    function flushAgentTitleMarkerBuffer() {
      const visible = titleMarkerStripper.flush();
      if (visible) emitGuardedTextDelta(visible);
    }

    function guardTextDelta(delta) {
      return runGuard.feedText(delta);
    }

    // Shared helper for emitting guarded text deltas across all agent
    // stream handlers (sendAgentEvent, copilot, ACP).
    function emitGuardedTextDelta(delta: string) {
      const safe = guardTextDelta(delta);
      if (safe.length > 0) {
        send('agent', { type: 'text_delta', delta: safe });
      }
      if (runGuard.contaminated && !runWarned) {
        runWarned = true;
        const warn = runGuard.warningEvent();
        if (warn) {
          send('agent', warn);
          abortForRoleMarker(warn.marker);
        }
      }
    }

    function emitTitleFilteredGuardedTextDelta(delta: string) {
      const visibleDelta = titleMarkerStripper.strip(delta);
      if (!visibleDelta) return false;
      emitGuardedTextDelta(visibleDelta);
      return true;
    }

    // Detection-only is necessary but not sufficient: by the time we see
    // the role marker the model has already burned tokens, and the
    // subprocess will keep generating downstream tokens (including
    // `tool_use` blocks built on the fabricated context) until it exits
    // on its own. We terminate the child immediately so:
    //   1. Token billing stops at the detection point, not at the
    //      model's natural completion of the contaminated response.
    //   2. `tool_use` content blocks emitted AFTER the marker cannot
    //      reach the daemon's tool-call dispatcher. Blocks emitted
    //      BEFORE the marker have already been dispatched; this guard
    //      can't help with those — they're a separate hardening.
    //   3. The UI distinguishes "completed" from "killed by safety
    //      guard" through a structured SSE error rather than seeing a
    //      `fabricated_role_marker` warning followed by an eventual
    //      normal turn-end.
    // Idempotent — multiple guard paths (per-message Claude, run-scoped
    // non-Claude, plain stdout) can all call it.
    let roleMarkerAbortFired = false;
    function abortForRoleMarker(marker: string) {
      if (roleMarkerAbortFired) return;
      roleMarkerAbortFired = true;
      send(
        'error',
        createSseErrorPayload(
          'ROLE_MARKER_HALLUCINATION',
          `Run terminated: model emitted fabricated role marker (\`${marker}\`). ` +
            'No further tokens or tool calls accepted from this turn. ' +
            'See https://github.com/nexu-io/open-design/issues/3247.',
          { retryable: true },
        ),
      );
      // ACP sessions (Hermes, Kimi, Devin, Kiro, etc.) need explicit
      // abort because their I/O is multiplexed and they won't
      // necessarily exit on child SIGTERM alone.
      if (acpSession?.abort) {
        try {
          acpSession.abort();
        } catch {
          // ignore — best-effort
        }
      }
      if (child && !child.killed) design.runs.signalChild(run, 'SIGTERM');
      scheduleForcedChildShutdown();
    }

    const sendAgentEvent = (ev) => {
      if (ev?.type === 'error') {
        if (agentStreamError) return;
        flushVisibleAgentStderr();
        const failureText = [
          String(ev.message || 'Agent stream error'),
          typeof ev.raw === 'string' ? ev.raw : '',
          agentStdoutTail,
          agentStderrTail,
        ].join('\n');
        agentStreamError = rewriteKnownAgentStreamError(
          agentId,
          String(ev.message || 'Agent stream error'),
          failureText,
        );
        clearInactivityWatchdog();
        const authFailure = classifyAgentAuthFailure(agentId, failureText);
        if (authFailure?.status === 'missing') {
          send('error', createSseErrorPayload(
            'AGENT_AUTH_REQUIRED',
            authFailure.message ?? cursorAuthGuidance(),
            { retryable: true },
          ));
          return;
        }
        // Recover the specific model-service failure class (auth / quota /
        // upstream) for agents without a tailored probe (Claude Code, codex,
        // …), so the chat shows an accurate reason instead of the generic
        // execution-failed bucket.
        const serviceCode = classifyAgentServiceFailure(failureText);
        if (serviceCode) {
          send('error', createSseErrorPayload(serviceCode, agentStreamError, {
            details: ev.raw ? { raw: ev.raw } : undefined,
            retryable: true,
          }));
          return;
        }
        send('error', createSseErrorPayload('AGENT_EXECUTION_FAILED', agentStreamError, {
          details: ev.raw ? { raw: ev.raw } : undefined,
          retryable: false,
        }));
        return;
      }
      lastAgentEventPhase = summarizeAgentEventForInactivity(ev);
      noteAgentActivity();
      // Role-marker guard for qoder / json-event-stream / pi-rpc (#3247).
      if (ev?.type === 'text_delta' && typeof ev.delta === 'string') {
        if (emitTitleFilteredGuardedTextDelta(ev.delta)) {
          noteFirstTokenAt();
          agentProducedOutput = true;
        }
        return;
      }
      noteFirstTokenFromAgentEvent(ev);
      if (ev?.type && SUBSTANTIVE_AGENT_EVENT_TYPES.has(ev.type)) {
        agentProducedOutput = true;
      }
      send('agent', ev);
    };
    const parseBufferedAntigravityGeminiJsonEventStream = () => {
      if (
        def.id !== 'antigravity' ||
        plaintextStdoutBuffer.length === 0
      ) {
        return false;
      }
      const bufferedStdout = plaintextStdoutBuffer.map((chunk) => chunk.text).join('');
      if (!looksLikeGeminiJsonEventStream(bufferedStdout)) return false;
      trackingSubstantiveOutput = true;
      const firstTokenAt = bufferedAntigravityGeminiFirstTokenAt(plaintextStdoutBuffer);
      if (firstTokenAt !== null) noteFirstTokenAt(firstTokenAt);
      const handler = createJsonEventStreamHandler('gemini', sendAgentEvent);
      handler.feed(bufferedStdout);
      handler.flush();
      plaintextStdoutBuffer.length = 0;
      return true;
    };

    if (def.streamFormat === 'claude-stream-json') {
      const claude = createClaudeStreamHandler((ev) => {
        if (ev?.type === 'error') {
          if (agentStreamError) return;
          flushVisibleAgentStderr();
          const message = String((ev as any).message || 'Claude Code stream error');
          const failureText = [
            message,
            typeof (ev as any).code === 'string' ? (ev as any).code : '',
            agentStdoutTail,
            agentStderrTail,
          ].join('\n');
          clearInactivityWatchdog();
          // Claude surfaces a connection drop / reset as an in-stream `error`
          // frame (assistant `error:"unknown"` + the raw SDK string), which
          // would otherwise reach the UI verbatim as a non-retryable
          // AGENT_EXECUTION_FAILED. Run the same per-agent diagnostic used at
          // child-exit so this path emits the specific class
          // (AGENT_CONNECTION_DROPPED) — retryable, with copy the web can
          // localize and triage can count by code.
          const diagnostic = diagnoseClaudeCliFailure({
            agentId: def.id,
            exitCode: 1,
            stderrTail: agentStderrTail,
            stdoutTail: failureText,
            env: spawnedAgentEnv,
            resolvedBin: agentLaunch.selectedPath,
          });
          const serviceCode = classifyAgentServiceFailure(failureText);
          agentStreamError = diagnostic?.message
            ?? rewriteKnownAgentStreamError(agentId, message, failureText);
          send('error', createSseErrorPayload(
            diagnostic?.code ?? serviceCode ?? 'AGENT_EXECUTION_FAILED',
            agentStreamError,
            {
              retryable: diagnostic?.retryable
                ?? (serviceCode === 'AGENT_AUTH_REQUIRED' || serviceCode === 'RATE_LIMITED'),
              ...(diagnostic ? { details: { detail: diagnostic.detail } } : {}),
            },
          ));
          return;
        }
        lastAgentEventPhase = summarizeAgentEventForInactivity(ev);
        noteAgentActivity();
        if (ev?.type === 'text_delta' && typeof ev.delta === 'string') {
          const visibleDelta = titleMarkerStripper.strip(ev.delta);
          if (visibleDelta) {
            noteFirstTokenAt();
            send('agent', { ...ev, delta: visibleDelta });
          }
          return;
        }
        noteFirstTokenFromAgentEvent(ev);
        send('agent', ev);
        // Claude uses per-message guards (claude-stream.ts) rather than the
        // run-scoped guard above, so its `fabricated_role_marker` events
        // surface here directly from the stream handler, not via
        // emitGuardedTextDelta. Same abort semantics apply.
        if (ev && (ev as any).type === 'fabricated_role_marker') {
          const m = (ev as any).marker;
          abortForRoleMarker(typeof m === 'string' ? m : 'role marker');
        }
        // Stream-json input mode keeps the child's stdin open across the
        // turn so the daemon can stream further user messages mid-turn. The
        // child has no other way to know the turn is over, though — without
        // an EOF it sits idle until the inactivity watchdog kills it.
        // Bookkeeping here closes stdin on a clean terminal turn:
        //   - turn_end (per-turn synthesized from `stop_reason`): fire on
        //     `end_turn` etc. but NOT on `tool_use` — that stop reason
        //     means the model paused mid-tool, not "turn complete".
        //   - usage (session result at EOF in single-shot mode).
        try {
          applyClaudeStreamJsonRunBookkeeping(run, ev);
        } catch {}
      }, { suppressHtmlArtifactsAfterFileWrite: def.id === 'claude' });
      child.stdout.on('data', (chunk) => claude.feed(chunk));
      child.on('close', () => claude.flush());
    } else if (def.streamFormat === 'qoder-stream-json') {
      trackingSubstantiveOutput = true;
      const qoder = createQoderStreamHandler(sendAgentEvent);
      child.stdout.on('data', (chunk) => qoder.feed(chunk));
      child.on('close', () => qoder.flush());
    } else if (def.streamFormat === 'copilot-stream-json') {
      const copilot = createCopilotStreamHandler((ev) => {
        lastAgentEventPhase = summarizeAgentEventForInactivity(ev);
        noteAgentActivity();
        if (ev?.type === 'text_delta' && typeof ev.delta === 'string') {
          if (emitTitleFilteredGuardedTextDelta(ev.delta)) {
            noteFirstTokenAt();
          }
          return;
        }
        noteFirstTokenFromAgentEvent(ev);
        send('agent', ev);
      });
      child.stdout.on('data', (chunk) => copilot.feed(chunk));
      child.on('close', () => copilot.flush());
    } else if (def.streamFormat === 'pi-rpc') {
      // Route through sendAgentEvent so that pi-rpc's error events
      // (extension_error, auto_retry_end with success=false, and the
      // message_update error delta) set agentStreamError and flip the
      // run to `failed` on close — same path as qoder-stream-json and
      // json-event-stream after issue #691. Also enables the
      // substantive-output guard (agentProducedOutput) so a pi run
      // that exits 0 without producing visible content is caught.
      //
      // attachPiRpcSession invokes its send callback with the two-arg
      // channel/payload shape: send('agent', payload) for normal events
      // and send('error', {message}) from fail(). sendAgentEvent
      // expects a single event object, so we adapt at the call site:
      //   - 'agent' channel → relay payload through sendAgentEvent
      //   - 'error' channel → route through the daemon's error path
      //     (createSseErrorPayload + send SSE + set agentStreamError)
      trackingSubstantiveOutput = true;
      acpSession = attachPiRpcSession({
        child,
        prompt: composed,
        cwd: effectiveCwd,
        model: safeModel,
        parentSession: agentResumeCtx.isResuming && agentResumeCtx.resumeSessionId
          ? agentResumeCtx.resumeSessionId
          : undefined,
        send: (channel, payload) => {
          if (channel === 'agent') {
            sendAgentEvent(payload);
          } else if (channel === 'error') {
            if (agentStreamError) return;
            flushVisibleAgentStderr();
            agentStreamError = String(payload?.message || 'Pi session error');
            const piErrorCode = typeof payload?.code === 'string' ? payload.code : null;
            if (piErrorCode) {
              run.errorCode = piErrorCode;
            }
            if (piErrorCode === 'PI_PARENT_SESSION_FAILED' && run.conversationId) {
              clearAgentSession(db, run.conversationId, def.id);
            }
            clearInactivityWatchdog();
            send('error', createSseErrorPayload(
              'AGENT_EXECUTION_FAILED',
              agentStreamError,
              { retryable: false },
            ));
          } else {
            noteAgentActivity();
            send(channel, payload);
          }
        },
        imagePaths: def.supportsImagePaths ? amrStagedImages : [],
        uploadRoot: UPLOAD_DIR,
      });
    } else if (def.streamFormat === 'acp-json-rpc') {
      const acpStageTimeoutMs = resolveAcpStageTimeoutMs();
      acpSession = attachAcpSession({
        child,
        prompt: composed,
        cwd: effectiveCwd,
        model: safeModel,
        imagePaths: def.supportsImagePaths ? amrStagedImages : [],
        mcpServers,
        envFormat: def.acpMcpEnvFormat ?? 'array',
        ...(def.id === 'amr' ? { modelUnavailableErrorCode: 'AMR_MODEL_UNAVAILABLE' } : {}),
        send: (event, data) => {
          if (event === 'agent') {
            lastAgentEventPhase = summarizeAgentEventForInactivity(data);
          }
          noteAgentActivity();
          if (event === 'error') flushVisibleAgentStderr();
          if (def.id === 'amr' && event === 'error') {
            const failure = classifyAmrAccountFailure(
              [
                typeof data?.message === 'string' ? data.message : '',
                typeof data?.error?.message === 'string' ? data.error.message : '',
                typeof data?.error?.code === 'string' ? data.error.code : '',
                agentStdoutTail,
                agentStderrTail,
              ].join('\n'),
            );
            if (failure) {
              sendAmrAccountFailure(failure);
              return;
            }
          }
          if (event === 'agent' && data?.type === 'text_delta' && typeof data.delta === 'string') {
            if (emitTitleFilteredGuardedTextDelta(data.delta)) {
              noteFirstTokenAt();
            }
            return;
          }
          if (event === 'agent') noteFirstTokenFromAgentEvent(data);
          send(event, data);
        },
        ...(acpStageTimeoutMs !== undefined ? { stageTimeoutMs: acpStageTimeoutMs } : {}),
      });
    } else if (def.streamFormat === 'json-event-stream') {
      // Pipe through sendAgentEvent so the OpenCode `type:'error'` frame
      // (now emitted as a real error event by json-event-stream.ts after
      // #691) actually triggers `agentStreamError` instead of being
      // forwarded as a no-op `agent` SSE event. This also wires the
      // substantive-output tracking the close handler reads below.
      trackingSubstantiveOutput = true;
      const handler = createJsonEventStreamHandler(
        def.eventParser || def.id,
        sendAgentEvent,
      );
      child.stdout.on('data', (chunk) => handler.feed(chunk));
      child.on('close', () => handler.flush());
    } else if (def.id === 'antigravity') {
      // Buffer stdout until close so the auth-prompt guard can suppress
      // the OAuth URL before forwarding it to the client as assistant
      // text. agy exits 0 after printing the auth URL on stdout, so the
      // chunks would otherwise arrive before the close-time classifier
      // detects them as an auth prompt. First-token timing is deliberately
      // NOT stamped here — only the first chunk's arrival time is recorded,
      // and `firstTokenAt` is stamped from it at flush time so the
      // suppressed OAuth-prompt path never reports a TTFT (PR #3412).
      child.stdout.on('data', (chunk) => {
        noteAgentActivity();
        const receivedAt = Date.now();
        if (firstBufferedStdoutAt === null) firstBufferedStdoutAt = receivedAt;
        plaintextStdoutBuffer.push({ text: String(chunk), receivedAt });
      });
    } else {
      // Plain / BYOK mode: guard raw stdout chunks (#3247).
      child.stdout.on('data', (chunk) => {
        noteAgentActivity();
        const text = typeof chunk === 'string' ? chunk : String(chunk);
        const visibleText = titleMarkerStripper.strip(text);
        const safe = guardTextDelta(visibleText);
        if (safe.length > 0) {
          noteFirstTokenAt();
          send('stdout', { chunk: safe });
        }
        if (runGuard.contaminated && !runWarned) {
          runWarned = true;
          const warn = runGuard.warningEvent();
          if (warn) {
            send('agent', warn);
            abortForRoleMarker(warn.marker);
          }
        }
      });
    }
    // Wire the acpSession onto the run so cancel() can call abort()
    // instead of raw SIGTERM (applies to pi-rpc and acp-json-rpc).
    run.acpSession = acpSession;
    child.stderr.on('data', (chunk) => {
      noteAgentActivity();
      emitVisibleAgentStderr(chunk);
    });

    child.on('error', (err) => {
      clearInactivityWatchdog();
      cleanupPromptFile();
      flushVisibleAgentStderr();
      revokeToolToken('child_exit');
      unregisterChatAgentEventSink();
      send('error', createSseErrorPayload('AGENT_EXECUTION_FAILED', err.message));
      finishWithRetryDecision('failed', 1, null);
    });
    child.on('close', async (code, signal) => {
      try {
      clearInactivityWatchdog();
      clearForcedChildShutdown();
      flushVisibleAgentStderr();
      if (watchdogRetryRestarted) {
        // The inactivity watchdog already failed this attempt and the same-run
        // retry restarted on a fresh child. Finalization and event-sink / run-
        // handle ownership (keyed by the shared runId) now belong to the new
        // attempt, so this stalled child's close must not re-run them — doing
        // so would re-finalize the run and delete the new attempt's sink.
        // Revoke only THIS attempt's tool token (idempotent, keyed by its own
        // token string) and bail; the `finally` block still cleans up logs.
        revokeToolToken('child_exit');
        return;
      }
      revokeToolToken('child_exit');
      unregisterChatAgentEventSink();
      if (acpSession?.hasFatalError()) {
        markRpcCloseReason('fatal_rpc_error');
        return finishWithRetryDecision('failed', code ?? 1, signal ?? null);
      }
      parseBufferedAntigravityGeminiJsonEventStream();
      flushAgentTitleMarkerBuffer();
      if (agentStreamError) {
        markRpcCloseReason('stream_error');
        return finishWithRetryDecision('failed', code === 0 ? 1 : (code ?? 1), signal ?? null);
      }
      if (
        code !== 0 &&
        !run.cancelRequested
      ) {
        if (def.id === 'amr') {
          const amrFailure = classifyAmrAccountFailure(
            `${agentStderrTail}\n${agentStdoutTail}`,
          );
          if (amrFailure) {
            sendAmrAccountFailure(amrFailure);
            return finishWithRetryDecision('failed', code ?? 1, signal ?? null);
          }
        }
        const authFailure = classifyAgentAuthFailure(
          agentId,
          `${agentStderrTail}\n${agentStdoutTail}`,
        );
        if (authFailure?.status === 'missing') {
          send('error', createSseErrorPayload(
            'AGENT_AUTH_REQUIRED',
            authFailure.message ?? cursorAuthGuidance(),
            { retryable: true },
          ));
          return finishWithRetryDecision('failed', code ?? 1, signal ?? null);
        }
      }
      if (
        code !== 0 &&
        !run.cancelRequested &&
        def.resumesSessionViaCli === true &&
        agentResumeCtx.isResuming &&
        run.conversationId &&
        isClaudeResumeFailure(`${agentStderrTail}\n${agentStdoutTail}`)
      ) {
        // The stored session id no longer resolves (pruned / machine moved
        // / ~/.claude cleared). Drop it so the next turn starts a fresh
        // session seeded with the full transcript, and surface a retryable
        // error rather than a confusing hard failure.
        clearAgentSession(db, run.conversationId, def.id);
        send('error', createSseErrorPayload(
          'AGENT_EXECUTION_FAILED',
          'The previous Claude session could not be resumed (it may have expired). Resend your message to continue with a fresh session.',
          { retryable: true },
        ));
        return design.runs.finish(run, 'failed', code ?? 1, signal ?? null);
      }
      // Empty-output guard: a clean `code === 0` exit with no visible
      // output means the run silently finished without producing anything.
      // Surface an explicit failure so the chat shows a clear reason.
      if (
        code === 0 &&
        !run.cancelRequested &&
        trackingSubstantiveOutput &&
        !agentProducedOutput
      ) {
        markRpcCloseReason('empty_output');
        send('error', createSseErrorPayload(
          'AGENT_EXECUTION_FAILED',
          'Agent completed without producing any output. The model or provider may have returned an empty response — check the agent logs for upstream errors.',
          { retryable: true },
        ));
        return finishWithRetryDecision('failed', code, signal);
      }
      if (
        code === 0 &&
        !run.cancelRequested &&
        isPluginAuthoringRun(db, run) &&
        !(await hasGeneratedPluginArtifacts(cwd)) &&
        !emittedRenderableQuestionForm(clarifyingQuestionText)
      ) {
        send('error', createSseErrorPayload(
          'AGENT_EXECUTION_FAILED',
          'Plugin authoring ended before generating the required generated-plugin artifacts.',
          { retryable: true },
        ));
        return finishWithRetryDecision('failed', code, signal);
      }
      // Plain-stream auth-failure guard: plain adapters (today
      // antigravity, deepseek's TUI variants) may exit cleanly with
      // visible stdout that's actually an auth prompt — agy prints
      // "Authentication required. Please visit the URL to log in:
      // <URL>" + "Error: authentication timed out." rather than
      // failing with a non-zero exit. Without this guard the chat
      // shows that raw prompt as the agent's "reply", and the user
      // has no way to actually complete OAuth from inside the chat.
      // Override the apparent success with a proper
      // AGENT_AUTH_REQUIRED error carrying actionable guidance.
      if (
        code === 0 &&
        !run.cancelRequested &&
        !trackingSubstantiveOutput &&
        childStdoutSeen
      ) {
        const authFailure = classifyAgentAuthFailure(
          agentId,
          `${agentStderrTail}\n${agentStdoutTail}`,
        );
        if (authFailure?.status === 'missing') {
          send('error', createSseErrorPayload(
            'AGENT_AUTH_REQUIRED',
            authFailure.message ?? `${def.name} authentication required. Please re-authenticate and retry.`,
            { retryable: true },
          ));
          return finishWithRetryDecision('failed', 0, signal);
        }
      }
      // Plain-stream empty-output guard: plain agents send raw stdout
      // chunks without structured event tracking. Detect auth failures
      // and quota / upstream errors when exit 0 but no stdout was
      // seen. agy in print mode is silent on stdout/stderr for both
      // missing-auth AND quota-exhausted failures; the daemon piped
      // agy's `--log-file` to `agentLogFilePath` precisely so this
      // guard can grep the upstream error code (RESOURCE_EXHAUSTED 429
      // for quota, "not logged into Antigravity" for auth) and route
      // to the right user-facing guidance.
      if (
        code === 0 &&
        !run.cancelRequested &&
        !trackingSubstantiveOutput &&
        !childStdoutSeen
      ) {
        markRpcCloseReason('empty_output');
        let combinedDetail = `${agentStderrTail}\n${agentStdoutTail}`;
        if (def.id === 'antigravity' && agentLogFilePath) {
          try {
            const logContent = await fs.promises.readFile(agentLogFilePath, 'utf8');
            // Keep the last 8 KB — quota / auth lines all land near the
            // tail (after the spawn / model-config preamble).
            combinedDetail = `${combinedDetail}\n${logContent.slice(-8192)}`;
          } catch {
            // Missing log file (agy didn't write it, mounted tmpfs is
            // read-only, etc.) is fine — fall through to the generic
            // empty-output message.
          }
        }
        const authFailure = classifyAgentAuthFailure(agentId, combinedDetail);
        const serviceFailure = !authFailure
          ? classifyAgentServiceFailure(combinedDetail)
          : null;
        const isAntigravityQuota =
          def.id === 'antigravity' && serviceFailure === 'RATE_LIMITED';
        // Antigravity-only fallback: if neither classifier matched but
        // the run was silent, lean on the empirical observation that
        // an empty agy print-mode exit almost always means
        // missing-OAuth (the only other silent path is quota, which
        // the log-file check above already caught).
        const useAntigravityAuthFallback =
          !authFailure && !serviceFailure && def.id === 'antigravity';
        const errorCode =
          authFailure || useAntigravityAuthFallback
            ? 'AGENT_AUTH_REQUIRED'
            : isAntigravityQuota
              ? 'RATE_LIMITED'
              : 'AGENT_EXECUTION_FAILED';
        const msg = authFailure
          ? authFailure.message ?? `${def.name} authentication expired. Please re-authenticate and retry.`
          : isAntigravityQuota
            ? antigravityQuotaGuidance()
            : useAntigravityAuthFallback
              ? antigravityAuthGuidance()
              : `${def.name} returned an empty response. This may indicate an expired session — try re-authenticating the agent.`;
        send('error', createSseErrorPayload(
          errorCode,
          msg,
          { retryable: true },
        ));
        return finishWithRetryDecision('failed', 0, signal);
      }
      // ACP agents that don't shut down on stdin.end() (e.g. Devin for
      // Terminal) are forced to exit via SIGTERM from attachAcpSession after
      // a clean prompt completion. Without an override, the chat run would
      // be marked `failed` because `code === 0` fails (code is null on a
      // signal exit). `completedSuccessfully()` reports whether the ACP
      // session resolved without a fatal error or abort.
      //
      // Scope the override narrowly to the exact forced-shutdown shape this
      // PR introduces: code is null AND signal is SIGTERM AND the ACP
      // session reported clean completion. Any other post-response failure
      // (non-zero exit code, SIGKILL, SIGSEGV, etc.) still propagates as
      // `failed`, preserving the existing close-status behavior for genuine
      // post-response process problems.
      const acpCleanCompletion =
        typeof acpSession?.completedSuccessfully === 'function' &&
        acpSession.completedSuccessfully();
      const runArtifactSideEffects = scanRunEventsForRetrySideEffects(run.events);
      const status = classifyChatRunCloseStatus({
        cancelRequested: !!run.cancelRequested,
        code,
        signal,
        acpCleanCompletion,
        artifactQuietShutdownRequested,
        turnCompletedCleanly: !!run.turnCompletedCleanly,
        artifactProducedThisRun:
          runArtifactSideEffects.artifactWriteSeen ||
          runArtifactSideEffects.liveArtifactSeen,
      });
      // Skip the close-handler failure emit when the run is already
      // terminal: the inactivity watchdog (failForInactivity) finishes the
      // run — sending its error and clearing run.clients/eventsLogStream —
      // before SIGTERM, so re-emitting here would double-send the error and
      // reopen the closed events-log stream. The run is finalized below
      // regardless (finish() no-ops once terminal).
      if (status === 'failed' && !design.runs.isTerminal(run.status)) {
        const diagnostic = diagnoseClaudeCliFailure({
          agentId: def.id,
          exitCode: code,
          signal,
          stderrTail: agentStderrTail,
          stdoutTail: agentStdoutTail,
          env: spawnedAgentEnv,
          resolvedBin: agentLaunch.selectedPath,
        });
        // A non-zero exit whose output reads as an auth / quota / upstream
        // problem (typical of Claude Code, codex, …) gets the specific code
        // rather than the generic execution-failed bucket; the human-readable
        // message still prefers the richer CLI diagnostic when we have one.
        const serviceCode = classifyAgentServiceFailure(
          `${agentStderrTail}\n${agentStdoutTail}`,
        );
        if (diagnostic) {
          send('error', createSseErrorPayload(
            // A diagnostic that named its own failure class (e.g.
            // AGENT_CONNECTION_DROPPED) wins over the generic service-failure
            // sniff so the UI can localize by code and triage can count it.
            diagnostic.code ?? serviceCode ?? 'AGENT_EXECUTION_FAILED',
            diagnostic.message,
            { retryable: diagnostic.retryable, details: { detail: diagnostic.detail } },
          ));
        } else if (serviceCode) {
          const detail = (agentStderrTail || agentStdoutTail || '').trim();
          send('error', createSseErrorPayload(
            serviceCode,
            detail || 'The model service returned an error.',
            { retryable: true },
          ));
        } else {
          // OpenCode swallows provider failures in headless mode: a 429
          // usage-limit is marked retryable and retried silently with
          // nothing on stdout/stderr, so the run only dies via the
          // inactivity watchdog and the checks above find no signal. The
          // real reason is recorded only in OpenCode's own session log,
          // so recover it before falling back to the generic rewrite.
          // See issue #982.
          const openCodeFailure =
            def.id === 'opencode'
              ? readOpenCodeServiceFailure(spawnedAgentEnv, { since: run.createdAt })
              : null;
          if (openCodeFailure) {
            send('error', createSseErrorPayload(
              openCodeFailure.code,
              openCodeFailure.message,
              { retryable: true },
            ));
          } else {
            const rewritten = rewriteKnownAgentStreamError(
              def.id,
              (agentStderrTail || agentStdoutTail || '').trim(),
              `${agentStderrTail}\n${agentStdoutTail}`,
            );
            if (rewritten !== 'Agent stream error') {
              send('error', createSseErrorPayload(
                'AGENT_EXECUTION_FAILED',
                rewritten,
                { retryable: true },
              ));
            }
          }
        }
      }
      // Reconcile any HTML artifacts that were written during this run
      // without a manifest sidecar (e.g. agent used write_file instead of
      // create_artifact, or the run terminated between HTML write and
      // sidecar write). Only files modified after the run started are
      // touched — pre-existing HTML in imported-folder projects must not
      // receive spurious manifests. Best-effort; must not block finalisation.
      // See issue #2893.
      if (run.projectId) {
        (async () => {
          try {
            const project = getProject(db, run.projectId);
            const files = await listFiles(PROJECTS_DIR, run.projectId, {
              metadata: project?.metadata,
            });
            const dir = resolveProjectDir(PROJECTS_DIR, run.projectId, project?.metadata);
            for (const f of files) {
              const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase();
              if (ext !== '.html' && ext !== '.htm') continue;
              try {
                const filePath = path.join(dir, f.name);
                const st = await fs.promises.stat(filePath);
                if (!isRunTouchedProjectFile(st.mtimeMs, runStartTimeMs)) continue;
                await reconcileHtmlArtifactManifest(
                  PROJECTS_DIR,
                  run.projectId,
                  f.name,
                  project?.metadata,
                );
              } catch { /* per-file best-effort */ }
            }
          } catch { /* project-level best-effort */ }
        })();
      }
      // Flush buffered plain-text stdout (antigravity) that was not
      // suppressed by the auth-prompt guard above. Send each chunk in
      // order before finishing so the assistant text arrives before the
      // run's `finished` event. Stamp first-token timing here — and only
      // here — using the first chunk's arrival time, so the OAuth-prompt
      // path (which returns before this flush) never records a TTFT for
      // output the user never saw (PR #3412).
      if (plaintextStdoutBuffer.length > 0 && firstBufferedStdoutAt !== null) {
        noteFirstTokenAt(firstBufferedStdoutAt);
      }
      for (const chunk of plaintextStdoutBuffer) {
        const visibleText = titleMarkerStripper.strip(chunk.text);
        if (visibleText) send('stdout', { chunk: visibleText });
      }
      const flushedTitleMarkerText = titleMarkerStripper.flush();
      if (flushedTitleMarkerText) send('stdout', { chunk: flushedTitleMarkerText });
      // Capture the pi session file path for conversational continuity.
      // The session path is discovered by attachPiRpcSession when it
      // processes agent_end; persist it under (conversationId, agentId) so
      // another conversation in the same cwd cannot inherit this history.
      if (acpSession && typeof acpSession.getLastSessionPath === 'function') {
        const sessionPath = acpSession.getLastSessionPath();
        if (status === 'succeeded' && def.streamFormat === 'pi-rpc') {
          persistCapturedAgentSession(db, {
            conversationId: run.conversationId,
            agentId: def.id,
            sessionId: sessionPath,
            stablePromptHash: currentStableHash,
          });
        }
      }
      if (status === 'succeeded') {
        persistDeliveredAgentSessionState();
      }
      finishWithRetryDecision(status, code, signal);
      } finally {
        // Best-effort cleanup of the per-run agy log file on every close
        // path — successful, failed, cancelled, or non-zero exit — so
        // /tmp doesn't accumulate one file per Antigravity run. The log
        // is read inside the empty-output guard above before this finally
        // runs, so the read always happens before the unlink.
        if (agentLogFilePath) {
          fs.promises.unlink(agentLogFilePath).catch(() => {});
        }
        cleanupPromptFile();
      }
    });
    if (writePromptToChildStdin && child.stdin) {
      const promptInputFormat = def.promptInputFormat ?? 'text';
      run.analyticsTelemetry = {
        ...(run.analyticsTelemetry ?? {}),
        modelCallStartAt: Date.now(),
      };
      if (promptInputFormat === 'stream-json') {
        // Wrap the prompt as an Anthropic user message and write it as one
        // JSONL line. Do NOT close stdin: claude-code keeps reading further
        // messages until EOF, which is what lets the daemon stream more user
        // messages into the same turn. The stdin is closed on a clean terminal
        // turn (see applyClaudeStreamJsonRunBookkeeping) or when the child
        // exits (run terminates, user cancels).
        const userMessage = JSON.stringify({
          type: 'user',
          message: {
            role: 'user',
            content: [{ type: 'text', text: composed }],
          },
        });
        try {
          child.stdin.write(`${userMessage}\n`, 'utf8');
        } catch (err) {
          // Swallow EPIPE here for the same reason as the listener above —
          // a fast-exiting child has already routed its failure through
          // stderr / exit handlers.
          if (err && err.code !== 'EPIPE') throw err;
        }
        run.stdinOpen = true;
      } else {
        child.stdin.end(composed, 'utf8');
      }
    }
  };

  orbitService.setRunHandler(async ({
    trigger,
    startedAt,
    prompt,
    systemPrompt,
    template,
  }) => {
    // Each Orbit run gets its own project so the conversation, messages, and
    // live artifact are isolated. The handler does the synchronous prep here
    // (insert project/conversation/run rows, kick off the chat run) and
    // returns immediately with the new project id; the daemon endpoint
    // resolves the HTTP request with that id so the client can navigate to
    // the new project before the agent has finished. Anything that depends
    // on the agent's final status (live artifact discovery, lastRun summary
    // metadata) lives inside the `completion` promise.
    const appConfig = await readAppConfig(RUNTIME_DATA_DIR);
    let agentId = typeof appConfig.agentId === 'string' && appConfig.agentId
      ? appConfig.agentId
      : null;
    if (!agentId) {
      const agents = await detectAgents(appConfig.agentCliEnv ?? {}).catch(() => []);
      agentId = agents.find((agent) => agent.available)?.id ?? null;
    }
    if (!agentId) throw new Error('No available agent is configured for Orbit. Choose an agent in Settings first.');

    const now = Date.now();
    const projectId = `orbit-${randomUUID()}`;
    const conversationId = `orbit-conv-${randomUUID()}`;
    const assistantMessageId = `orbit-assistant-${randomUUID()}`;
    const projectName = `Orbit · ${formatLocalProjectTimestamp(startedAt)}`;

    const orbitDesignSystemId = template?.designSystemRequired === false
      ? null
      : appConfig.designSystemId ?? null;

    insertProject(db, {
      id: projectId,
      name: projectName,
      skillId: 'live-artifact',
      designSystemId: orbitDesignSystemId,
      pendingPrompt: null,
      metadata: { kind: 'orbit', trigger },
      createdAt: now,
      updatedAt: now,
    });
    insertConversation(db, {
      id: conversationId,
      projectId,
      title: projectName,
      createdAt: now,
      updatedAt: now,
    });

    const run = design.runs.create({
      projectId,
      conversationId,
      assistantMessageId,
      clientRequestId: `orbit-${trigger}-${randomUUID()}`,
      agentId,
      mediaExecution: defaultMediaExecutionPolicy(),
    });
    upsertMessage(db, conversationId, {
      id: `orbit-user-${run.id}`,
      role: 'user',
      content: prompt,
    });
    upsertMessage(db, conversationId, {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      agentId,
      agentName: getAgentDef(agentId)?.name ?? agentId,
      runId: run.id,
      runStatus: 'queued',
      startedAt: now,
    });

    if (template?.dir) {
      const cwd = await ensureProject(PROJECTS_DIR, projectId);
      const result = await stageActiveSkill(
        cwd,
        skillCwdAliasSegment(template.dir),
        template.dir,
        (msg) => console.warn(msg),
      );
      if (!result.staged) {
        console.warn(
          `[od] orbit template skill-stage skipped: ${result.reason ?? 'unknown reason'}; falling back to prompt-embedded instructions`,
        );
      }
    }

    const modelPrefs = appConfig.agentModels?.[agentId] ?? {};
    design.runs.start(run, () => startChatRun({
      agentId,
      projectId,
      conversationId: run.conversationId,
      assistantMessageId: run.assistantMessageId,
      clientRequestId: run.clientRequestId,
      skillId: 'live-artifact',
      designSystemId: orbitDesignSystemId,
      model: modelPrefs.model ?? null,
      reasoning: modelPrefs.reasoning ?? null,
      message: prompt,
      systemPrompt: [
        renderOrbitTemplateSystemPrompt(template),
        systemPrompt,
        'You are Orbit, an autonomous activity-summary agent inside Open Design.',
        'You must discover connectors and connector tools yourself through the OD CLI; the daemon has not chosen tools for you.',
        'You must create and register a Live Artifact as the final deliverable. Do not merely describe what you would do.',
        'Do not ask follow-up questions, do not emit <question-form>, and do not wait for user input. This run is unattended; pick reasonable defaults and complete the artifact.',
        'Keep connector credentials and OD_TOOL_TOKEN private; never print or persist secrets.',
      ].join('\n'),
    }, run));

    const completion = (async () => {
      const finalStatus = await design.runs.wait(run);
      db.prepare(
        `UPDATE messages SET run_status = ?, ended_at = ? WHERE id = ?`,
      ).run(finalStatus.status, Date.now(), assistantMessageId);
      const artifacts = await listLiveArtifacts({ projectsRoot: PROJECTS_DIR, projectId });
      const artifact = artifacts.find((candidate) => candidate.createdByRunId === run.id);
      const status = finalStatus.status === 'succeeded' && !artifact ? 'failed' : finalStatus.status;
      return {
        agentRunId: run.id,
        status,
        ...(artifact?.id ? { artifactId: artifact.id, artifactProjectId: projectId } : {}),
        summary: artifact?.id
          ? `Agent ${finalStatus.status} and registered live artifact ${artifact.title}.`
          : finalStatus.status === 'succeeded'
            ? buildOrbitNoLiveArtifactSummary(run.events)
            : `Agent ${finalStatus.status} but did not register a live artifact for this Orbit run.`,
      };
    })();

    return { projectId, agentRunId: run.id, completion };
  });

  orbitService.setTemplateResolver(async (skillId) => {
    // Orbit templates (live-artifact, etc.) live under design-templates after
    // the split, but earlier projects may still point at functional-skill
    // ids for the same purpose — search both roots so a stored project id
    // keeps resolving through one or the other.
    const skills = await listAllSkillLikeEntries();
    const skill = findSkillById(skills, skillId);
    if (!skill || skill.scenario !== 'orbit') return null;
    return {
      id: skill.id,
      name: skill.name,
      examplePrompt: skill.examplePrompt,
      dir: skill.dir,
      body: skill.body,
      designSystemRequired: skill.designSystemRequired !== false,
    };
  });

  function runToolBundleDeliveryTargetForProject(projectId, metadata) {
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

  app.post('/api/runs', async (req, res) => {
    if (daemonShuttingDown) {
      return sendApiError(res, 503, 'UPSTREAM_UNAVAILABLE', 'daemon is shutting down');
    }
    const requestBody = req.body && typeof req.body === 'object' ? req.body : {};
    const mediaExecution = parseMediaExecutionPolicyInput(requestBody.mediaExecution);
    if (!mediaExecution.ok) {
      return sendApiError(res, 400, 'BAD_REQUEST', mediaExecution.message);
    }
    const toolBundle = parseRunToolBundleForRequest(requestBody.toolBundle);
    if (!toolBundle.ok) {
      return sendApiError(res, 400, 'BAD_REQUEST', toolBundle.message);
    }
    // Plan §3.A1 / spec §11.5: resolve any pluginId / appliedPluginSnapshotId
    // before the run is created. The resolver returns null when the body
    // does not mention a plugin (legacy runs unchanged), an error envelope
    // for missing-input / capability / not-found / stale, or an ok result
    // whose `snapshotId` is pinned onto the run object so downstream
    // code (system prompt block, tool tokens, replay) can reach it.
    //
    // Stage A of plugin-driven-flow-plan: when neither the body nor the
    // project carries plugin info we fall back to the bundled scenario
    // plugin for the project's metadata kind/intent so direct callers
    // (CLI / SDK / agent-headless runs) get the same auto-binding the
    // web create flow already produces. The fallback is silent — a
    // bundled scenario that is not installed leaves the run plugin-less,
    // which matches the legacy path.
    let resolvedSnapshot = null;
    if (typeof requestBody.projectId === 'string' && requestBody.projectId) {
      let registryView;
      try {
        registryView = await loadPluginRegistryView();
      } catch (err) {
        return res.status(500).json({ error: String(err) });
      }
      const explicitPlugin =
        requestBody.pluginId || requestBody.appliedPluginSnapshotId;
      let runResolveBody = requestBody;
      if (!explicitPlugin) {
        const projectRow = getProject(db, requestBody.projectId);
        const hasPin =
          typeof projectRow?.appliedPluginSnapshotId === 'string'
          && projectRow.appliedPluginSnapshotId.length > 0;
        if (!hasPin) {
          const fallbackPluginId = defaultScenarioPluginIdForProjectMetadata(projectRow?.metadata);
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
    const meta = {
      ...requestBody,
      mediaExecution: mediaExecution.policy,
      toolBundle: toolBundle.bundle,
    };
    if (resolvedSnapshot?.ok) {
      meta.appliedPluginSnapshotId = resolvedSnapshot.snapshotId;
      if (!meta.pluginId) meta.pluginId = resolvedSnapshot.snapshot.pluginId;
      if (typeof meta.message !== 'string' || meta.message.trim().length === 0) {
        const renderedQuery = renderPluginBriefTemplate(
          resolvedSnapshot.snapshot.query,
          resolvedSnapshot.snapshot.inputs,
        ).trim();
        if (renderedQuery.length > 0) meta.message = renderedQuery;
      }
    }
    let runProject = null;
    if (typeof meta.projectId === 'string' && meta.projectId) {
      try {
        runProject = getProject(db, meta.projectId);
        assertSandboxProjectRootAvailable(runProject?.metadata);
      } catch (err) {
        if (err instanceof SandboxImportedProjectError) {
          return sendApiError(res, 400, 'BAD_REQUEST', err.message);
        }
        throw err;
      }
    }
    // MCP / SDK callers may omit agentId. Resolve it before any run-create
    // side effects so unsupported run-scoped tool bundles can fail cleanly.
    if (typeof meta.agentId !== 'string' || !meta.agentId) {
      try {
        const appCfg = await readAppConfig(RUNTIME_DATA_DIR);
        const cfgAgent = typeof appCfg.agentId === 'string' && appCfg.agentId
          ? appCfg.agentId
          : null;
        const agents = await detectAgents(appCfg.agentCliEnv ?? {}).catch(() => []);
        const cfgAgentAvailable = cfgAgent
          ? agents.some((agent) => agent.id === cfgAgent && agent.available)
          : false;
        if (cfgAgent && cfgAgentAvailable) {
          meta.agentId = cfgAgent;
        } else {
          const firstAvailable = agents.find((a) => a.available)?.id ?? null;
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
    // MCP / SDK callers POST /api/runs with just a projectId — no
    // conversationId, no pre-created assistantMessageId — because they
    // don't know about OD's chat-row lifecycle. The web flow
    // (POST /api/chat) on the other hand creates both client-side and
    // passes them in. Without binding the run to a conversation and
    // pre-pinning an assistant message row, the OD studio page for
    // the project shows an empty chat panel — the user has no way to
    // see what the outer agent asked or what the inner agent replied,
    // even though the run finished and produced files.
    //
    // Fall back here: pick the project's default conversation (the
    // one create_project seeded), write a user message with the
    // prompt as content, and synthesize an assistantMessageId so the
    // pin helper below will insert the empty assistant row. From that
    // point on, the existing appendMessageAgentEvent path accumulates
    // every text_delta into the assistant row's content — same as web
    // chat.
    if (
      typeof meta.projectId === 'string' &&
      meta.projectId &&
      (typeof meta.conversationId !== 'string' || !meta.conversationId)
    ) {
      try {
        const convs = listConversations(db, meta.projectId);
        // listConversations is ordered for the UI by recent activity; this
        // fallback must bind to the seeded default conversation instead.
        const defaultConv = Array.isArray(convs) && convs.length > 0
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
    // Capture clientType for downstream telemetry (Langfuse uses it on
    // run-completed metadata; PostHog gets it via the request header
    // bridge). Prefer the explicit `x-od-client` header from desktop /
    // web sidecars, fall back to user-agent detection. Without this the
    // run object's `clientType` stays undefined and Langfuse traces lose
    // the surface dimension.
    const declaredClient = String(req.get('x-od-client') ?? '').toLowerCase();
    if (declaredClient === 'desktop' || declaredClient === 'web') {
      run.clientType = declaredClient;
    } else {
      const ua = String(req.get('user-agent') ?? '');
      run.clientType = ua.includes('Electron/') ? 'desktop' : 'web';
    }
    if (resolvedSnapshot?.ok) {
      try {
        const { linkSnapshotToRun } = await import('./plugins/snapshots.js');
        linkSnapshotToRun(db, resolvedSnapshot.snapshotId, run.id);
      } catch {
        // Linking is best-effort here; in-memory run still carries the id.
      }
    }
    /** @type {import('@open-design/contracts').ChatRunCreateResponse} */
    const body = {
      runId: run.id,
      // Surface the bound conversation/message so MCP / SDK callers
      // who did not provide them get back the daemon-resolved values
      // (used for building studio deep links and threading chat
      // history). Always nullable so the contract stays additive.
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
    // Plan §3.I1 / spec §10.1 — fire the pipeline schedule on the run's
    // SSE stream BEFORE the agent process is started. The first
    // pipeline_stage_started event is emitted synchronously (before
    // the first await inside runPipelineForRun), so any SSE consumer
    // that subscribes between create() and start() sees a stage event
    // ahead of the agent's message_chunk stream — exactly what §8 e2e-3
    // expects. The stub stage runner returns immediately so a
    // non-loop pipeline walks through every stage in O(stages) time;
    // the audit row in `run_devloop_iterations` records the timeline.
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
        const project = getProject(db, run.projectId);
        const projectRoot = resolveProjectDir(PROJECTS_DIR, run.projectId, project?.metadata);
        detectSkillPluginCandidateOnRunSuccess(db, design.runs, run, req.body || {}, projectRoot);
      } catch (err) {
        console.warn('[plugins] skill candidate hook setup failed', err);
      }
    }
    design.runs.start(run, () => startChatRun(meta, run));

    // Analytics v2: emit run_created (daemon-side authoritative) and
    // schedule run_finished on terminal state. The matching `chat-routes.ts`
    // handler is shadowed by this earlier registration in Express; emit
    // here so PostHog actually receives the event. Both fire under the
    // same insert_id prefix so any web-side mirror dedupes by $insert_id.
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
    }).catch(() => {
      // wait() can't reject in current runs.ts impl, but guard anyway.
    });
    if (analyticsContext) {
      const reqBody = (req.body || {}) as Record<string, unknown>;
      const runInsertId = newInsertId();
      // Configure-state triplet — v2 schema requires every event to carry
      // these so PostHog dashboards can split run lifecycle by execution
      // setup. Web-side captures inherit them from a PostHog global
      // register, but daemon-side captures (run_created/run_finished) need
      // to populate them at capture time. Best-effort derivation from
      // `detectAgents()` + the request's `agentId`:
      //   - has_available_configure_cli: any CLI on PATH appears installed
      //   - configure_type: 'local_cli' when the run targets an installed
      //     CLI, otherwise 'unknown' (BYOK keys live in the web client
      //     storage and are not visible to the daemon at this layer)
      //   - configure_availability: 'available' when the requested CLI is
      //     installed; 'unavailable' when it's known but not installed;
      //     'unknown' otherwise
      const appCfgForAnalytics = await readAppConfig(RUNTIME_DATA_DIR).catch(
        () => ({} as Record<string, unknown>),
      );
      const detectedAgentsForAnalytics = await detectAgents(
        (appCfgForAnalytics as { agentCliEnv?: Record<string, unknown> }).agentCliEnv ?? {},
      ).catch(() => [] as Array<{ id: string; available: boolean }>);
      // BYOK credentials live in the web client (localStorage / store) and
      // are not visible to the daemon at this layer, so we pass
      // `byokConfigured: undefined` and let the helper fall back to the
      // installed-CLI signal. Web-side captures use the same helper with
      // the full credential view to keep dashboards aligned.
      //
      // `mode: 'daemon'` pins the call into the helper's daemon branch so
      // `configure_availability` is judged from the requested agent's
      // install status (not the cohort-wide "any CLI installed?" fallback).
      // Without it, a run for an uninstalled agent would still report
      // `available` whenever any unrelated CLI was on PATH — see PR #2285
      // review.
      // AMR sign-in state is daemon-visible (vela's config file or the
      // Settings-backed VELA_RUNTIME_KEY/VELA_LINK_URL env config), so the
      // server-side captures can fill `amrAuthorized` even though BYOK
      // stays web-only. Merge the configured AMR env exactly like the
      // /api/integrations/vela/status route and the run launcher do —
      // env-configured users are signed in to the UI, and dropping the
      // configured env here would keep reporting them as 'none'.
      const velaStatusForAnalytics = (() => {
        try {
          const configuredAmrEnv = agentCliEnvForAgent(
            (appCfgForAnalytics as {
              agentCliEnv?: Parameters<typeof agentCliEnvForAgent>[0];
            }).agentCliEnv,
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
      // Optional analytics context the client may attach to a run.
      // Used to thread the DS run variant (`design_system_project` /
      // `design_system_generation` page+area, `project_kind=design_system`,
      // entry_from values like `design_system_create`) plus per-source
      // counts onto run_created / run_finished. Behavior never depends on
      // these; only PostHog props do.
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
      // Session-dimension hints (client-computed, behavior-irrelevant): the
      // 0-based run turn index within the browser analytics session, whether
      // it's the session's first run, and whether the project already had a
      // generated artifact (run is an edit, not a first creation).
      const hintTurnIndex = typeof analyticsHints.turnIndex === 'number'
        ? analyticsHints.turnIndex
        : undefined;
      const hintIsFirstRun = typeof analyticsHints.isFirstRun === 'boolean'
        ? analyticsHints.isFirstRun
        : undefined;
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
      const runProject = requestProjectId ? getProject(db, requestProjectId) : null;
      const runProjectKind = resolveRunProjectKindForAnalytics({
        hintProjectKind,
        projectMetadata: runProject?.metadata,
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
      // Only fields the current `/api/runs` create payload actually
      // sends. The v2 schema documents extended context props
      // (entry_from / project_kind / target_platforms / fidelity /
      // companion_surfaces / connectors / use_speaker_notes /
      // include_animations / reference_template / aspect /
      // project_source) — most aren't on the wire yet, but
      // project_kind falls back to the stored project metadata so ordinary
      // project runs are classified even when callers do not send
      // `analyticsHints`. Other dimensions stay omitted until follow-up PRs
      // thread them through.
      // Per-turn capability sets: MCP servers live under the nested
      // `context` selection; skills are sent top-level. Both are arrays of
      // ids on the wire; coerce defensively so a malformed payload never
      // throws inside the capture path.
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
      // `skill_ids` is the full per-send skill context, so fold in the
      // project-bound persistent `skillId` (also reported singularly as
      // `skill_id`) alongside the staged one-turn skills — otherwise a normal
      // project run with a persisted skill but no staged skills would emit
      // `skill_ids=[]` and undercount in dashboards that read the array.
      const runSkillIds = [
        ...new Set(
          [reqBody.skillId, ...runTurnSkillIds].filter(
            (id): id is string => typeof id === 'string' && id.length > 0,
          ),
        ),
      ];
      const baseProps: Record<string, unknown> = {
        page_name: isDesignSystemRun ? 'design_system_project' : 'chat_panel',
        area: isDesignSystemRun ? 'design_system_generation' : 'chat_composer',
        ...configureGlobals,
        // Override the BYOK-blind derived runtime_type with the client's
        // authoritative per-run value when supplied — the daemon can't see a
        // saved BYOK key, so a BYOK run would otherwise report as local_cli/amr.
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
        design_system_id:
          typeof reqBody.designSystemId === 'string'
            ? reqBody.designSystemId
            : undefined,
        // `design_system_source` is required in the v2 contract
        // (RunCreatedProps / RunFinishedProps). The daemon doesn't see
        // whether the chosen design system was the workspace default,
        // a user pick, or template-inherited — that signal lives only
        // in the web client. Derive what we honestly know from the
        // wire payload: 'not_applicable' when no design system was
        // selected, 'unknown' otherwise. A follow-up that threads
        // `designSystemSource` through `CreateRunRequest` can replace
        // this with the precise value. See PR #2285 review 2026-05-20
        // 04:35 for the rationale.
        design_system_source:
          typeof reqBody.designSystemId === 'string' && reqBody.designSystemId
            ? 'unknown'
            : 'not_applicable',
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
        // `modelIdForTracking` buckets null/empty into `'default'` so the
        // PostHog `model_id` column always has an analysable value. The
        // user-picked model only lands here on `run_created` (the agent
        // hasn't initialised yet); `run_finished` below upgrades this to
        // the agent-reported model when available.
        model_id: modelIdForTracking(
          typeof reqBody.model === 'string' ? reqBody.model : null,
        ),
        agent_provider_id: agentIdToTracking(
          typeof reqBody.agentId === 'string' ? reqBody.agentId : null,
        ),
        skill_id: typeof reqBody.skillId === 'string' ? reqBody.skillId : null,
        // Per-send composer context (v2 spec: every prompt records mode +
        // which model/cli/mcp/skill/plugin/design-system it ran with). Mode,
        // plugin, and the MCP/skill sets weren't on `run_created` before; the
        // values are all on the create payload, so populate them here. The
        // legacy singular `mcp_id` becomes the first enabled server for
        // back-compat; `mcp_ids` carries the full set.
        // Only composer-originated runs have an ask/design mode. DS-generation
        // runs never go through the composer, so omit `session_mode` for them
        // rather than defaulting them to `ask` and polluting mode dashboards.
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
      design.runs.wait(run).then(async (status: {
        status: string;
        error?: string | null;
        errorCode?: string | null;
        exitCode?: number | null;
        signal?: string | null;
      }) => {
        // Langfuse eligibility must be re-derived at completion time, not
        // reused from a launch-time snapshot. A long-running run can have the
        // user flip telemetry consent or the relay config mid-flight; the
        // Langfuse sink (`reportRunCompletedFromDaemon`) re-reads app config
        // when the run ends, so PostHog's `langfuse_expected` /
        // `langfuse_delivery_status` / `langfuse_drop_reason` must read the
        // same completion-time eligibility to stay aligned. See PR #3412
        // review.
        const appCfgAtFinish = await readAppConfig(RUNTIME_DATA_DIR).catch(
          () => ({} as Record<string, unknown>),
        );
        const langfuseDeliveryForAnalytics = deriveLangfuseDeliveryState(
          (appCfgAtFinish as { telemetry?: Record<string, unknown> }).telemetry ?? {},
          readTelemetrySinkConfig(),
        );
        // `deriveRunErrorCode` is the invariant: when `result === 'failed'`
        // it always returns a non-empty string so dashboards keyed on
        // `error_code` never see a blank cell. Live in `run-result.ts`
        // with unit coverage for the fall-through cases (ACP fatal,
        // child close without error event, etc.).
        const result = runResultFromStatus(status.status);
        const errorCode = deriveRunErrorCode(status);
        const failure = classifyRunFailure({
          result,
          status,
          ...(errorCode ? { errorCode } : {}),
          agentId: run.agentId,
          events: run.events,
        });
        // ACP reports { type:'status', label:'model', model:<id> } after
        // session/new; stream adapters report { type:'status',
        // label:'initializing', model:<id> } at run start. The scan must
        // not short-circuit on usage before reaching the model signal —
        // see `scanRunEventsForFinishedProps` for the invariant.
        const usageAnalytics = scanRunEventsForUsageAnalytics(
          run.events,
          reqBody.model,
          userQueryTokens,
        );
        const analyticsCapturedAt = Date.now();
        const timingAnalytics = summarizeRunTimingAnalytics({
          runCreatedAt: run.createdAt,
          runUpdatedAt: run.updatedAt,
          analyticsCapturedAt,
          telemetry: run.analyticsTelemetry,
          events: run.events,
        });
        // Agent-agnostic artifact count: diff the project's artifact files
        // against the baseline captured at run start. A created OR modified
        // file counts (an edit-only turn still reports >0). Falls back to the
        // tool-stream counter when no baseline was captured (no-project runs,
        // or runs that started before this code shipped) — that path is
        // claude-accurate and was the previous behaviour for everyone.
        // Tool-stream fallbacks for the no-baseline path (no-project runs, or
        // runs that started before this code shipped). These are claude-accurate
        // and were the previous behaviour for every agent.
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
        // Skip the whole-tree diff when this run overlapped another run in the
        // same cwd: the snapshot cannot tell which run wrote a file, so a
        // contended diff would cross-attribute artifacts / design_system /
        // preview / activation milestones. Fall back to the per-run tool-stream
        // count instead (claude-accurate; a non-claude contended run is a rare
        // undercount, which beats misattribution).
        if (artifactBaseline && !artifactBaseline.contended) {
          // Diff the project's tracked files against the run-start baseline so
          // artifact_count / design_system_created / preview_module_count are
          // derived agent-agnostically (not just for claude_code).
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
        // First-touch activation milestones (first-artifact / first-design-
        // system observed since this stamp shipped — NOT first-ever; see
        // `deriveActivationMilestones`) written to the PostHog person record
        // via `$set_once` below. Derived from this same run-outcome snapshot so
        // the milestone lands at the exact success moment without a second
        // event; `$set_once` keeps it pinned to the first qualifying run.
        const activationMilestones = deriveActivationMilestones({
          result,
          artifactCount,
          designSystemCreated,
          // Gate the DS milestone on the same `isDesignSystemRun` condition the
          // `run_finished.design_system_created` field uses below, so a plain
          // chat run that writes a `DESIGN.md` doesn't overstate DS activation.
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
            // `area` flips on run_finished: chat_panel runs publish
            // under `chat_panel`, DS runs stay on
            // `design_system_generation` to match the run_created shape.
            area: isDesignSystemRun ? 'design_system_generation' : 'chat_panel',
            result,
            // PostHog person-property milestones. `$set_once` only writes a
            // key that doesn't already exist, so the timestamp pins to the
            // user's FIRST qualifying run observed since rollout (true
            // first-ever only for users who onboard after rollout; the
            // installed base gets their next qualifying run — see
            // `deriveActivationMilestones`). Omitted when no milestone crossed.
            ...(activationMilestones ? { $set_once: activationMilestones } : {}),
            // `model_id` upgrades the request-side value with the
            // agent-reported model on terminal state; see
            // `finishedModelId` derivation above.
            model_id: finishedModelId,
            // Distinct artifact files this run produced OR edited, measured by
            // a filesystem snapshot diff (`run-artifact-fs.ts`) so it works for
            // every agent — not just claude_code, the only one whose tool
            // stream the legacy counter recognized. Falls back to the
            // tool-stream count for no-project runs. An edit-only turn (file
            // count unchanged) still reports >0.
            artifact_count: artifactCount,
            // Breakdown of `artifact_count` when a filesystem baseline existed:
            // created ≈ activation (new artifact), modified ≈ iteration on an
            // existing one. Omitted on the tool-stream fallback path.
            ...(artifactsCreated !== undefined ? { artifacts_created: artifactsCreated } : {}),
            ...(artifactsModified !== undefined ? { artifacts_modified: artifactsModified } : {}),
            // True when the run raised a `<question-form>` clarification.
            // Clarification turns inherently produce no artifact, so the
            // dashboard excludes them from the "run finished -> has artifact"
            // funnel instead of counting them as failures. See
            // `run-artifacts.ts`; tested in `tests/run-artifacts.test.ts`.
            asked_user_question: runAskedUserQuestion(run.events),
            retry_attempt_count: run.retryAttemptCount ?? 0,
            retry_final_result: run.retryFinalResult ?? 'not_attempted',
            ...(run.retrySuppressedReason
              ? { retry_suppressed_reason: run.retrySuppressedReason }
              : {}),
            ...(isDesignSystemRun ? {
              // DS runs land a `DESIGN.md` write when generation
              // succeeded; the run-artifacts inspector reuses the
              // same Write/Edit pairing it already does for HTML
              // artifact counts, just keyed on `DESIGN.md`.
              design_system_created: designSystemCreated,
              preview_module_count: previewModuleCount,
              // `missing_font_count` defaults to 0 — the agent flow
              // doesn't emit a structured "missing fonts" signal yet.
              // Kept on the wire so the dashboard has the column from
              // day one; can be sourced later from a font-audit hook.
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
            cache_token_source: usageAnalytics.cache_token_source,
            token_count_source: usageAnalytics.token_count_source,
          },
          insertId: `${runInsertId}-finish`,
        });
      }).catch(() => {
        // wait() can't reject in current runs.ts impl, but guard anyway.
      });
    }
  });

  app.get('/api/runs', (req, res) => {
    const { projectId, conversationId, status } = req.query;
    const runs = design.runs.list({ projectId, conversationId, status });
    /** @type {import('@open-design/contracts').ChatRunListResponse} */
    const body = { runs: runs.map(design.runs.statusBody) };
    res.json(body);
  });

  app.get('/api/runs/:id/result-package', async (req, res) => {
    const run = design.runs.get(req.params.id);
    if (!run) return sendApiError(res, 404, 'NOT_FOUND', 'run not found');
    const status = design.runs.statusBody(run);
    const project = run.projectId ? getProject(db, run.projectId) : null;
    let files: any[] = [];
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
        files = await listFiles(PROJECTS_DIR, project.id, { metadata: packageMetadata });
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
      .filter((file) => file?.artifactManifest && typeof file.artifactManifest === 'object')
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
    res.json({
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
        cancelRequested: status.cancelRequested,
        exitCode: status.exitCode,
        signal: status.signal,
        error: status.error,
        errorCode: status.errorCode,
      },
      workspace: status.workspace,
      events: {
        logPath: status.eventsLogPath,
      },
      project: project
        ? {
            id: project.id,
            name: project.name,
            fileCount: files.length,
          }
        : null,
      artifacts,
    });
  });

  app.get('/api/runs/:id', (req, res) => {
    const run = design.runs.get(req.params.id);
    if (!run) return sendApiError(res, 404, 'NOT_FOUND', 'run not found');
    res.json(design.runs.statusBody(run));
  });

  app.get('/api/runs/:id/events', (req, res) => {
    const run = design.runs.get(req.params.id);
    if (!run) return sendApiError(res, 404, 'NOT_FOUND', 'run not found');
    design.runs.stream(run, req, res);
  });

  // Phase 4 / spec §10.3.5 — AG-UI canonical stream.
  //
  // Same data plane as /api/runs/:id/events but every record passes
  // through `encodeOdEventForAgui` first so an external CopilotKit /
  // AG-UI client can consume the run unmodified. Events the encoder
  // can't map are dropped; the SSE stream stays canonical even when
  // OD adds internal-only events later.
  app.get('/api/runs/:id/agui', async (req, res) => {
    const run = design.runs.get(req.params.id);
    if (!run) return sendApiError(res, 404, 'NOT_FOUND', 'run not found');
    const { encodeOdEventForAgui } = await import('@open-design/agui-adapter');
    const sse = createSseResponse(res);
    const lastEventId = Number(req.get('Last-Event-ID') || req.query.after || 0);
    const emitMapped = (record) => {
      const mapped = encodeOdEventForAgui(
        { kind: record.event, ...(record.data ?? {}) },
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
    // Mirror runs.stream's subscriber pattern but route through the
    // adapter. We attach a thin wrapper to run.clients so the existing
    // emit() loop reaches us; the wrapper only implements the
    // {send,end,cleanup} surface the runs service uses.
    const adapterClient = {
      send: (event, data, id) => {
        const mapped = encodeOdEventForAgui(
          { kind: event, ...(data ?? {}) },
          { runId: run.id, seq: id, now: Date.now() },
        );
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

  app.post('/api/runs/:id/cancel', async (req, res) => {
    const run = design.runs.get(req.params.id);
    if (!run) return sendApiError(res, 404, 'NOT_FOUND', 'run not found');
    const status = await design.runs.cancel(run);
    /** @type {import('@open-design/contracts').ChatRunCancelResponse} */
    const body = { ok: true, run: status };
    res.json(body);
  });

  app.post('/api/chat', (req, res) => {
    if (daemonShuttingDown) {
      return sendApiError(res, 503, 'UPSTREAM_UNAVAILABLE', 'daemon is shutting down');
    }
    const requestBody = req.body && typeof req.body === 'object' ? req.body : {};
    const mediaExecution = parseMediaExecutionPolicyInput(requestBody.mediaExecution);
    if (!mediaExecution.ok) {
      return sendApiError(res, 400, 'BAD_REQUEST', mediaExecution.message);
    }
    const toolBundle = parseRunToolBundleForRequest(requestBody.toolBundle);
    if (!toolBundle.ok) {
      return sendApiError(res, 400, 'BAD_REQUEST', toolBundle.message);
    }
    let chatProject = null;
    if (typeof requestBody.projectId === 'string' && requestBody.projectId) {
      try {
        chatProject = getProject(db, requestBody.projectId);
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

  // Each routine fire resolves an agent, prepares project/conversation state,
  // and dispatches into the same chat runner used by manual runs.
  routineService.setRunHandler(async ({ routine, trigger, startedAt, runId }) => {
    const appConfig = await readAppConfig(RUNTIME_DATA_DIR);
    let agentId = routine.agentId
      || (typeof appConfig.agentId === 'string' && appConfig.agentId ? appConfig.agentId : null);
    if (!agentId) {
      const agents = await detectAgents(appConfig.agentCliEnv ?? {}).catch(() => []);
      agentId = agents.find((agent) => agent.available)?.id ?? null;
    }
    if (!agentId) {
      throw new Error('No available agent is configured. Choose an agent in Settings first.');
    }

    const now = startedAt;
    const routineContext = normalizeRunContextSelection(routine.context);
    const routineSkillId = routine.skillId ?? routineContext.skillIds?.[0] ?? null;
    const contextMetadata = {
      ...(routineContext.pluginIds?.length
        ? {
            contextPlugins: routineContext.pluginIds.map((id) => {
              const plugin = getInstalledPlugin(db, id);
              return {
                id,
                title: plugin?.title ?? id,
                ...(plugin?.manifest?.description ? { description: plugin.manifest.description } : {}),
              };
            }),
          }
        : {}),
      ...(routineContext.mcpServerIds?.length
        ? { contextMcpServers: routineContext.mcpServerIds.map((id) => ({ id })) }
        : {}),
      ...(routineContext.connectorIds?.length
        ? { contextConnectors: routineContext.connectorIds.map((id) => ({ id, name: id })) }
        : {}),
    };
    const stamp = formatLocalProjectTimestamp(new Date(now).toISOString());
    let projectId;
    let projectName;
    const scheduledPlaceholderProjectId = `routine-pending-project-${runId}`;
    const scheduledPlaceholderConversationId = `routine-pending-conv-${runId}`;
    let createdProjectId: string | null = null;
    let createdConversationId: string | null = null;
    let previousProjectSnapshotId: string | null = null;
    const createRoutineProject = () => {
      if (createdProjectId) return;
      projectId = `routine-${randomUUID()}`;
      projectName = `${routine.name} · ${stamp}`;
      insertProject(db, {
        id: projectId,
        name: projectName,
        skillId: routineSkillId,
        designSystemId: appConfig.designSystemId ?? null,
        pendingPrompt: null,
        metadata: {
          kind: 'other',
          intent: 'automation',
          automationId: routine.id,
          routineId: routine.id,
          trigger,
          ...contextMetadata,
        },
        createdAt: now,
        updatedAt: now,
      });
      createdProjectId = projectId;
    };
    if (routine.target.mode === 'reuse') {
      const project = getProject(db, routine.target.projectId);
      if (!project) throw new Error(`Routine target project ${routine.target.projectId} not found`);
      assertSandboxProjectRootAvailable(project.metadata);
      projectId = project.id;
      projectName = project.name;
      previousProjectSnapshotId = project.appliedPluginSnapshotId ?? null;
    }

    let conversationId = `routine-conv-${randomUUID()}`;
    let conversationCreatedEvent: ProjectConversationCreatedSsePayload | null = null;
    const routineConversationTitle = () => routine.target.mode === 'reuse'
      ? `${routine.name} · ${stamp}`
      : projectName;
    const createRoutineConversation = () => {
      if (createdConversationId) return;
      if (!projectId) createRoutineProject();
      if (!projectId) throw new Error('Routine project could not be prepared');
      conversationId = `routine-conv-${randomUUID()}`;
      insertConversation(db, {
        id: conversationId,
        projectId,
        title: routineConversationTitle(),
        createdAt: now,
        updatedAt: now,
      });
      createdConversationId = conversationId;
      conversationCreatedEvent = {
        type: 'conversation-created',
        projectId,
        conversationId,
        title: routineConversationTitle(),
        createdAt: now,
      };
    };

    const assistantMessageId = `routine-assistant-${randomUUID()}`;
    let resolvedRoutineSnapshot = null;
    // Tracks any snapshot id that `resolvePluginSnapshot()` already pinned
    // to the reused project before the resolver threw on a later linking
    // step. `finalizeOk()` performs `linkSnapshotToProject()` BEFORE
    // `linkSnapshotToConversation()` / `linkSnapshotToRun()`, so a failure
    // mid-resolve can leave `projects.applied_plugin_snapshot_id` repointed
    // at a snapshot the routine never durably claimed. The rollback path in
    // `discard()` falls back to this id when `resolvedRoutineSnapshot` is
    // still null so the reused project pin is restored either way.
    let partiallyAppliedSnapshotId: string | null = null;
    const primaryPluginId = routineContext.pluginIds?.[0] ?? null;
    const resolveRoutinePluginSnapshot = async () => {
      if (!primaryPluginId || resolvedRoutineSnapshot) return;
      const registry = await loadPluginRegistryView();
      const projectSnapshotBefore = routine.target.mode === 'reuse'
        ? getProject(db, routine.target.projectId)?.appliedPluginSnapshotId ?? null
        : null;
      let resolved;
      try {
        resolved = resolvePluginSnapshot({
          db,
          body: {
            pluginId: primaryPluginId,
            pluginInputs: { prompt: routine.prompt },
          },
          projectId,
          conversationId,
          registry,
          activeProjectDesignSystem:
            typeof appConfig.designSystemId === 'string' && appConfig.designSystemId.length > 0
              ? { id: appConfig.designSystemId }
              : undefined,
        });
      } catch (resolverError) {
        // `resolvePluginSnapshot()` may have already updated the reused
        // project's pin via `linkSnapshotToProject()` before throwing on
        // `linkSnapshotToConversation()` (or `linkSnapshotToRun()`). Capture
        // whatever pin it left behind so `discard()` can roll it back even
        // though `resolvedRoutineSnapshot` will stay null.
        if (routine.target.mode === 'reuse') {
          const after = getProject(db, routine.target.projectId)?.appliedPluginSnapshotId ?? null;
          if (after && after !== projectSnapshotBefore) {
            partiallyAppliedSnapshotId = after;
          }
        }
        throw resolverError;
      }
      if (resolved && !resolved.ok) {
        // Non-throwing resolver failures cannot have called `finalizeOk()`,
        // so the project pin is still the previous one — nothing to roll
        // back beyond the loser cleanup the caller will perform.
        throw new Error(`Automation plugin ${primaryPluginId} could not be applied: ${JSON.stringify(resolved.body)}`);
      }
      resolvedRoutineSnapshot = resolved;
    };
    const run = design.runs.create({
      projectId: projectId ?? scheduledPlaceholderProjectId,
      conversationId: createdConversationId ? conversationId : scheduledPlaceholderConversationId,
      assistantMessageId,
      clientRequestId: `routine-${trigger}-${randomUUID()}`,
      agentId,
      mediaExecution: defaultMediaExecutionPolicy(),
      ...(resolvedRoutineSnapshot?.ok
        ? {
            appliedPluginSnapshotId: resolvedRoutineSnapshot.snapshotId,
            pluginId: resolvedRoutineSnapshot.snapshot.pluginId,
          }
        : {}),
    });
    const persistPreparedRun = async (routineRun = null) => {
      if (!projectId) {
        createRoutineProject();
      }
      if (projectId) {
        run.projectId = projectId;
        if (routineRun) {
          routineRun.projectId = projectId;
        }
      }
      createRoutineConversation();
      run.conversationId = conversationId;
      if (routineRun) {
        routineRun.conversationId = conversationId;
        routineRun.agentRunId = run.id;
      }
      await resolveRoutinePluginSnapshot();
      if (resolvedRoutineSnapshot?.ok) {
        run.appliedPluginSnapshotId = resolvedRoutineSnapshot.snapshotId;
        run.pluginId = resolvedRoutineSnapshot.snapshot.pluginId;
        const { linkSnapshotToRun } = await import('./plugins/snapshots.js');
        linkSnapshotToRun(db, resolvedRoutineSnapshot.snapshotId, run.id);
      }
      upsertMessage(db, conversationId, {
        id: `routine-user-${run.id}`,
        role: 'user',
        content: routine.prompt,
      });
      upsertMessage(db, conversationId, {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        agentId,
        agentName: getAgentDef(agentId)?.name ?? agentId,
        runId: run.id,
        runStatus: 'queued',
        startedAt: now,
      });
    };

    const modelPrefs = appConfig.agentModels?.[agentId] ?? {};
    const start = () => {
      // Notify any open `ProjectView` only after the routine run row has
      // been accepted and preparation has completed, so failed setup does not
      // surface phantom conversations (#1361).
      if (conversationCreatedEvent) emitProjectEvent(projectId, conversationCreatedEvent);
      design.runs.start(run, () => startChatRun({
        agentId,
        projectId,
        conversationId: run.conversationId,
        assistantMessageId: run.assistantMessageId,
        clientRequestId: run.clientRequestId,
        skillId: routineSkillId,
        designSystemId: appConfig.designSystemId ?? null,
        context: routineContext,
        model: modelPrefs.model ?? null,
        reasoning: modelPrefs.reasoning ?? null,
        message: routine.prompt,
        systemPrompt: [
          `You are running an unattended scheduled routine named "${routine.name}".`,
          'Do not ask follow-up questions, do not emit <question-form>, and do not wait for user input. Pick reasonable defaults and finish the task.',
        ].join('\n'),
      }, run));
    };

    // Tear-down for the case where the durable routine_run row was never
    // inserted (sibling daemon won the slot, or insertRun threw). The
    // in-memory chat run was created speculatively above, but the deferred
    // `persistPreparedRun()` has not run yet — so no project / conversation
    // / snapshot writes have to be rolled back. Dropping the run keeps it
    // off `/api/runs` instead of leaving a phantom canceled entry there.
    const discardUnstarted = () => {
      design.runs.drop(run);
    };

    const discard = () => {
      if (typeof run.projectId === 'string' && run.projectId.startsWith('routine-pending-')) {
        run.projectId = null;
      }
      if (typeof run.conversationId === 'string' && run.conversationId.startsWith('routine-pending-')) {
        run.conversationId = null;
      }
      design.runs.finish(run, 'canceled');
      if (routine.target.mode === 'reuse') {
        // Prefer the fully-resolved snapshot id; fall back to whatever id
        // `resolvePluginSnapshot()` left pinned on the project if it threw
        // partway through linking — see the comment on
        // `partiallyAppliedSnapshotId` above.
        const snapshotIdToDiscard =
          resolvedRoutineSnapshot?.ok
            ? resolvedRoutineSnapshot.snapshotId
            : partiallyAppliedSnapshotId;
        if (snapshotIdToDiscard) {
          restoreProjectSnapshotLink(
            db,
            projectId,
            snapshotIdToDiscard,
            previousProjectSnapshotId,
            run.id,
          );
        }
      }
      if (createdConversationId) {
        deleteConversation(db, createdConversationId);
      }
      if (createdProjectId) {
        dbDeleteProject(db, createdProjectId);
      }
    };

    const completion = (async () => {
      const finalStatus = await design.runs.wait(run);
      const failureError = finalStatus.status === 'failed'
        ? (typeof finalStatus.error === 'string' && finalStatus.error.trim() ? finalStatus.error.trim() : null)
        : null;
      const failureErrorCode = finalStatus.status === 'failed'
        ? (typeof finalStatus.errorCode === 'string' && finalStatus.errorCode.trim() ? finalStatus.errorCode.trim() : null)
        : null;
      if (failureError) {
        appendMessageStatusEvent(db, assistantMessageId, {
          label: 'error',
          detail: failureError,
        });
      }
      db.prepare(`UPDATE messages SET run_status = ?, ended_at = ? WHERE id = ?`)
        .run(finalStatus.status, Date.now(), assistantMessageId);
      let evolutionSummary = '';
      if (finalStatus.status === 'succeeded' && routineContext.connectorIds?.length) {
        try {
          const evolution = await ingestRoutineConnectorEvolution(RUNTIME_DATA_DIR, {
            routine,
            runId,
            trigger,
            status: finalStatus.status,
            projectId,
            conversationId,
            agentRunId: run.id,
            summary: `Routine "${routine.name}" ${finalStatus.status}.`,
            connectorIds: routineContext.connectorIds,
            messages: listMessages(db, conversationId),
          });
          if (evolution?.proposals?.length) {
            evolutionSummary = ` Created ${evolution.proposals.length} self-evolution proposal(s) from connector context.`;
          }
        } catch (error) {
          evolutionSummary = ` Connector self-evolution ingestion failed: ${error instanceof Error ? error.message : String(error)}.`;
        }
      }
      return {
        status: finalStatus.status,
        summary: failureError
          ? `Routine "${routine.name}" failed: ${failureError}`
          : `Routine "${routine.name}" ${finalStatus.status}.${evolutionSummary}`,
        error: failureError ?? undefined,
        errorCode: failureErrorCode ?? undefined,
      };
    })();

    return {
      projectId: run.projectId,
      conversationId: run.conversationId,
      agentRunId: run.id,
      completion,
      prepare: persistPreparedRun,
      start,
      discard,
      discardUnstarted,
    };
  });
  routineService.start();

  assertServerContextSatisfiesRoutes({
    db,
    design,
    http: httpDeps,
    paths: pathDeps,
    ids: idDeps,
    uploads: uploadDeps,
    node: nodeDeps,
    projectStore: projectStoreDeps,
    projectFiles: projectFileDeps,
    conversations: conversationDeps,
    templates: templateDeps,
    status: projectStatusDeps,
    events: projectEventDeps,
    imports: importDeps,
    exports: projectExportDeps,
    artifacts: artifactDeps,
    documents: { buildDocumentPreview },
    auth: authDeps,
    liveArtifacts: liveArtifactDeps,
    deploy: deployDeps,
    media: mediaDeps,
    appConfig: appConfigDeps,
    orbit: orbitDeps,
    nativeDialogs: nativeDialogDeps,
    research: researchDeps,
    mcp: { pendingAuth: mcpPendingAuth, daemonUrlRef },
    resources: {
      listAllSkills,
      listAllDesignTemplates,
      listAllSkillLikeEntries,
      listAllDesignSystems,
      mimeFor,
    },
    routines: { routineService },
    projectPreviewScopes,
    validation: validationDeps,
    finalize: finalizeDeps,
    handoff: handoffDeps,
    chat: { startChatRun },
    agents: agentDeps,
    critique: critiqueDeps,
    lifecycle: { isDaemonShuttingDown: () => daemonShuttingDown },
  });

  registerRoutineRoutes(app, {
    db,
    paths: { RUNTIME_DATA_DIR },
    routines: { routineService },
  });

  // proxy routes (anthropic / openai / azure / google / ollama) live
  // in chat-routes.ts now — garnet had a partial duplicate here that
  // referenced helpers (rejectPluginInProxyBody, extractGeminiText, …)
  // dropped during the reconcile merge. Deleted to fix the BYOK crash.
  // Restore the plugin-runs-must-go-through-daemon gate by adding it
  // to chat-routes.ts if needed.


  registerChatRoutes(app, {
    db,
    design,
    http: httpDeps,
    paths: pathDeps,
    chat: { startChatRun },
    agents: agentDeps,
    critique: critiqueDeps,
    validation: validationDeps,
    lifecycle: { isDaemonShuttingDown: () => daemonShuttingDown },
    telemetry: { reportFinalizedMessage, reportFeedback },
  });

  registerStaticSpaFallback(app, STATIC_DIR);

  // Wait for `listen` to bind so callers always see the resolved URL —
  // critical when port=0 (ephemeral port) and when the embedding sidecar
  // needs to advertise the port to a parent process before any request
  // can flow. Three callers depend on this contract:
  //   - `apps/daemon/src/cli.ts`            → expects `{ url, server, shutdown }`
  //   - `apps/daemon/sidecar/server.ts`     → expects `{ url, server }`
  //   - `apps/daemon/tests/version-route.test.ts` → expects `{ url, server }`
  return await new Promise((resolve, reject) => {
    let daemonShutdownStarted = false;
    const cleanupDaemonBackgroundWork = () => {
      composioConnectorProvider.stopCatalogRefreshLoop();
      orbitService.stop();
      routineService?.stop();
    };
    const shutdownDaemonRuns = async () => {
      if (daemonShutdownStarted) return;
      daemonShutdownStarted = true;
      daemonShuttingDown = true;
      await design.runs.shutdownActive({ graceMs: resolveChatRunShutdownGraceMs() });
      await terminalService.shutdownActive();
      await design.analytics.shutdown();
    };
    let server;
    try {
      server = app.listen(port, host);
      server.once('listening', () => {
        // Widen the between-request idle window so kept-alive sockets
        // belonging to chat/SSE clients survive the gaps between bursts.
        //
        // Node's `keepAliveTimeout` (default 5s) only arms *after* a
        // response finishes writing, bounding the idle gap before the next
        // request on the same socket — it does not fire while an SSE
        // response is still streaming. A streaming `/api/runs/:id/events`
        // response stays open until the agent finishes, so middlebox idle
        // timers (nginx, socat/docker bridges, EC2 SG NAT) are typically
        // the proximate cause when an SSE stream drops; this listener-
        // side change cannot extend a connection past those middleboxes.
        //
        // What it *does* fix: chat clients that pipeline multiple requests
        // on the same TCP socket (status polls, run-status fetches, the
        // initial GET before the SSE upgrade). With the default 5s window
        // a sluggish client can lose the connection between two normal
        // calls and reconnect-storm. 120s aligns with the in-band
        // SSE_KEEPALIVE_INTERVAL_MS (25s) so kept-alive sockets used
        // around an SSE stream stay warm across reasonable client pauses.
        //
        // `headersTimeout` must exceed `keepAliveTimeout` per the Node
        // docs; otherwise a slow-loris client can stall request parsing.
        server.keepAliveTimeout = 120_000;
        server.headersTimeout = 125_000;
        const address = server.address();
        // `address()` can in theory return `string | AddressInfo | null`. For
        // a TCP listener it's always `AddressInfo` with a `.port` — the guard
        // is belt-and-braces so an unexpected null never silently produces a
        // `http://127.0.0.1:0` URL that callers would then try to fetch.
        const boundPort =
          address && typeof address === 'object' ? address.port : null;
        if (!boundPort) {
          reject(
            new Error(
              `[od] daemon failed to resolve listening port (address=${JSON.stringify(address)})`,
            ),
          );
          return;
        }
        resolvedPort = boundPort;
        // When binding to all interfaces report localhost for local callers;
        // when binding to a specific address (e.g. a Tailscale IP) report that
        // address so remote callers and the sidecar use the correct URL.
        const reportHost = host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host;
        const url = `http://${reportHost}:${resolvedPort}`;
        if (!returnServer) {
          console.log(`[od] daemon listening on ${url}`);
        }
        daemonUrl = url;
        resolve(returnServer ? {
          url,
          server,
          shutdown: shutdownDaemonRuns,
          routeInventory: getRouteRegistrationInventory(app),
        } : url);
      });
    } catch (error) {
      cleanupDaemonBackgroundWork();
      reject(error);
      return;
    }
    server.once('close', () => {
      void shutdownDaemonRuns().finally(cleanupDaemonBackgroundWork);
    });
    // `app.listen` throws synchronously when the port is already in use on
    // some Node versions, but emits an `error` event on others (and for
    // EACCES / EADDRNOTAVAIL even on the same Node). Wire the event so the
    // returned Promise always settles instead of hanging forever.
    server.on('error', (error) => {
      cleanupDaemonBackgroundWork();
      reject(error);
    });
  });
}

function randomId() {
  return randomUUID();
}

function sanitizeSlug(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function assembleExample(templateHtml, slidesHtml, title) {
  return templateHtml
    .replace('<!-- SLIDES_HERE -->', slidesHtml)
    .replace(
      /<title>.*?<\/title>/,
      `<title>${title} | Open Design Example</title>`,
    );
}

// Skill example HTML often references shipped images via relative paths
// like `./assets/hero.png`. Those resolve correctly when the file is
// opened from disk, but the web app loads the example into a sandboxed
// iframe via `srcdoc`, where the document URL is `about:srcdoc` and
// relative URLs cannot find the assets. Rewriting them to an absolute
// `/api/skills/<id>/assets/...` URL lets the same HTML render in both
// places — the disk preview keeps working, and the in-app preview now
// fetches assets through the matching route below.
export function rewriteSkillAssetUrls(html: string, skillId: string): string {
  if (typeof html !== 'string' || html.length === 0) return html;
  // Match src/href attributes whose values point at the current skill's
  // assets (`./assets/...` or `assets/...`) or a sibling skill's assets
  // (`../other-skill/assets/...`). Quote style is preserved so we do not
  // disturb the surrounding markup.
  return html.replace(
    /(\s(?:src|href)\s*=\s*)(['"])((?:\.\.\/([^/'"#?]+)\/)?(?:\.\/)?assets\/([^'"#?]+))(\2)/gi,
    (_match, attr, openQuote, _fullPath, siblingSkillId, relPath, closeQuote) => {
      const resolvedSkillId = siblingSkillId || skillId;
      const prefix = `/api/skills/${encodeURIComponent(resolvedSkillId)}/assets/`;
      return `${attr}${openQuote}${prefix}${relPath}${closeQuote}`;
    },
  );
}
