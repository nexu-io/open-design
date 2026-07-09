// @ts-nocheck
import type {
  DesktopExportArtifactInput,
  DesktopExportArtifactResult,
  DesktopExportPdfInput,
  DesktopExportPdfResult,
  DesktopRenderSlidesInput,
  DesktopRenderSlidesResult,
} from '@open-design/sidecar-proto';
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
import { executionProfileFromStreamFormat, PLUGIN_SHARE_ACTION_PLUGIN_IDS } from '@open-design/contracts';
import {
  composeSystemPrompt,
  resolveExclusiveSurface,
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
} from './plugins/plugin-preview-bakes.js';
import { userFacingAgentLabel } from './user-facing-agent-label.js';
import {
  buildBrowserUseRunState,
  collectBrowserUseDiscoveryFacts,
  isBrowserUseRequested,
  renderBrowserUseUnavailablePrompt,
} from './browser-use-diagnostics.js';
import {
  UPLOAD_DIR,
  composeLiveInstructionPrompt,
  formatDesignFilesWorkspaceHint,
  formatProjectAttachmentHint,
  normalizeCommentAttachments,
  renderCommentAttachmentHint,
  resolveChatExtraAllowedDirs,
  describeStablePromptCache,
  designSystemIdFromPluginSnapshot,
  resolveCodexGeneratedImagesDir,
  resolveEffectiveDesignSystemSelection,
  resolveGrantedCodexImagegenOverride,
  resolveResearchCommandContract,
  resolveSafeProjectAttachments,
  resolveSafePromptImagePaths,
  selectPromptImagePaths,
  validateCodexGeneratedImagesDir,
} from './runtimes/chat-prompt-inputs.js';
import {
  applyClaudeStreamJsonRunBookkeeping,
  assertValidRuntimeDefInactivityTimeoutMs,
  bufferedAntigravityGeminiFirstTokenAt,
  classifyChatRunCloseStatus,
  looksLikeGeminiJsonEventStream,
  resolveAcpStageTimeoutMs,
  resolveActiveInactivityTimeoutMs,
  resolveChatRunArtifactQuietPeriodMs,
  resolveChatRunInactivityTimeoutMs,
  resolveChatRunShutdownGraceMs,
} from './runtimes/chat-run-lifecycle.js';
import {
  normalizeRunContextSelection,
  renderRunContextPrompt,
} from './runtimes/chat-run-context.js';
import {
  daemonAgentPayloadToPersistedAgentEvent,
  persistRunEventToAssistantMessage,
  pinAssistantMessageOnRunCreate,
} from './runtimes/chat-run-messages.js';
import {
  resolveRunProjectKindForAnalytics,
  retryFinalResultForRunStatus,
  runRetryEventsForAnalytics,
  scanRunEventsForFinishedProps,
  scanRunEventsForRetrySideEffects,
} from './runtimes/run-lifecycle-analytics.js';
export {
  composeLiveInstructionPrompt,
  formatDesignFilesWorkspaceHint,
  formatProjectAttachmentHint,
  normalizeCommentAttachments,
  renderCommentAttachmentHint,
  resolveChatExtraAllowedDirs,
  describeStablePromptCache,
  designSystemIdFromPluginSnapshot,
  resolveCodexGeneratedImagesDir,
  resolveEffectiveDesignSystemSelection,
  resolveGrantedCodexImagegenOverride,
  resolveResearchCommandContract,
  resolveSafeProjectAttachments,
  resolveSafePromptImagePaths,
  selectPromptImagePaths,
  validateCodexGeneratedImagesDir,
} from './runtimes/chat-prompt-inputs.js';
export {
  applyClaudeStreamJsonRunBookkeeping,
  assertValidRuntimeDefInactivityTimeoutMs,
  bufferedAntigravityGeminiFirstTokenAt,
  classifyChatRunCloseStatus,
  looksLikeGeminiJsonEventStream,
  resolveAcpStageTimeoutMs,
  resolveActiveInactivityTimeoutMs,
  resolveChatRunArtifactQuietPeriodMs,
  resolveChatRunInactivityTimeoutMs,
} from './runtimes/chat-run-lifecycle.js';
export {
  renderRunContextPrompt,
} from './runtimes/chat-run-context.js';
export {
  daemonAgentPayloadToPersistedAgentEvent,
  persistRunEventToAssistantMessage,
  pinAssistantMessageOnRunCreate,
} from './runtimes/chat-run-messages.js';
export {
  resolveRunProjectKindForAnalytics as __forTestResolveRunProjectKindForAnalytics,
  retryFinalResultForRunStatus as __forTestRetryFinalResultForRunStatus,
  runRetryEventsForAnalytics as __forTestRunRetryEventsForAnalytics,
  scanRunEventsForFinishedProps as __forTestScanRunEventsForFinishedProps,
  scanRunEventsForRetrySideEffects as __forTestScanRunEventsForRetrySideEffects,
} from './runtimes/run-lifecycle-analytics.js';

export { resolveProjectRoot };
import { createCommandInvocation } from '@open-design/platform';
import { SIDECAR_ENV } from '@open-design/sidecar-proto';
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
  resolveDefaultModelFromOptions,
  resolveModelForAgent,
} from './runtimes/models.js';
import { loadMmdRouteLaunchEnv } from './runtimes/mmd-routes.js';
import { preparePromptFileForAgent } from './runtimes/prompt-file.js';
import { TerminalControlSequenceStripper } from './runtimes/terminal-control.js';
import { buildOpenCodeByokProviderConfig } from './runtimes/byok-opencode.js';
import {
  persistPlainStreamArtifacts,
  plainStdoutFromRunEvents,
} from './runtimes/plain-stream.js';
import {
  readVelaLoginStatus,
  resolveAmrProfile,
} from './integrations/vela.js';
import {
  amrAccountFailureDetails,
  classifyAmrAccountFailureSignal,
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
import { readCurrentAppVersionInfo } from './app-version.js';
import {
  findSkillById,
  listSkills,
  resolveSkillId,
  splitDerivedSkillId,
} from './skills.js';
import { validateLinkedDirs } from './linked-dirs.js';
import { installFromTarget, uninstallById, sanitizeRepoName } from './library-install.js';
import {
  buildWindowsFolderDialogCommand,
  parseFolderDialogStdout,
  parseLinuxFolderDialogResult,
} from './native-folder-dialog.js';
import {
  AssetCacheError,
  assetCacheRewriteUrl,
  createPluginAssetCache,
  isCacheableExternalUrl,
} from './plugins/plugin-asset-cache.js';
import { defaultMediaExecutionPolicy, parseMediaExecutionPolicyInput } from './media/policy.js';
import {
  applySandboxRuntimeEnv,
  ensureSandboxRuntimeDirs,
  isSandboxModeEnabled,
  resolveSandboxRuntimeConfig,
} from './sandbox-mode.js';
import {
  buildUserDesignSystemArchive,
  createUserDesignSystem,
  deleteUserDesignSystem,
  digestDesignSystemContext,
  LEGACY_DESIGN_SYSTEM_ARTIFACTS,
  linkUserDesignSystemProject,
  listDesignSystems,
  listUserDesignSystemFiles,
  listUserDesignSystemRevisions,
  readDesignSystem,
  readDesignSystemPackageInfo,
  readDesignSystemStaticFile,
  readUserDesignSystemFile,
  resolveDesignSystemAssets,
  updateUserDesignSystem,
  updateUserDesignSystemRevisionStatus,
} from './design-systems/index.js';
import { createDesignSystemGenerationJobStore } from './design-systems/generation-jobs.js';
import { createDesignSystemServerServices } from './design-systems/server-services.js';
import { prepareDesignTokenContractRebuild } from './design-systems/token-contract-rebuild.js';
import { registerBrandRoutes } from './brand-routes.js';
import {
  applyDiffReviewDecisionToCwd,
  applyPlugin,
  buildConnectorProbe,
  defaultBundledRoot,
  dismissSkillPluginCandidate,
  doctorPlugin,
  FIRST_PARTY_ATOMS,
  generateSkillPluginDraft,
  getInstalledPlugin,
  getSnapshot,
  installFromLocalFolder,
  installPlugin,
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
import {
  composeMemoryBody,
  extractFromMessage,
  listActiveRuleEntries,
  readMemoryConfig,
} from './memory.js';
import { attachAcpSession } from './agent-protocol/index.js';
import { attachPiRpcSession } from './agent-protocol/index.js';
import { stageAmrImagePaths } from './media/amr-image-staging.js';
import { ingestRoutineConnectorEvolution } from './automation-routine-evolution.js';
import { createClaudeStreamHandler } from './runtimes/claude-stream.js';
import { createAgentTitleMarkerStripper } from './title-marker.js';
import { createRoleMarkerGuard } from './role-marker-guard.js';
import { createToolLoopGuard, resolveToolLoopMode, type ToolLoopVerdict } from './tool-loop-guard.js';
import { diagnoseClaudeCliFailure } from './claude-diagnostics.js';
import { loadCritiqueConfigFromEnv } from './critique/config.js';
import { reconcileStaleRuns } from './critique/persistence.js';
import { runOrchestrator } from './critique/orchestrator.js';
import { createRunRegistry } from './critique/run-registry.js';
import { handleCritiqueInterrupt } from './critique/interrupt-handler.js';
import { handleCritiqueArtifact } from './critique/artifact-handler.js';
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
import { importFigmaFromBytes } from './figma/figma-import.js';
import { renderDesignSystemPreview } from './design-systems/preview.js';
import { renderDesignSystemShowcase } from './design-systems/showcase.js';
import { createChatRunService } from './runtimes/runs.js';
import {
  createRunLifecycleTracer,
  runLifecycleMarkersForStreamEvent,
} from './run-lifecycle-tracer.js';
import { deriveRunErrorCode, runResultFromStatus } from './run-result.js';
import { classifyRunFailure, isResumableFailure } from './run-failure-classification.js';
import { decideSafeRunRetry } from './run-retry-policy.js';
import {
  amrUserIdForRunAnalytics,
} from './run-analytics-observability.js';
import {
  createRunArtifactBaselines,
  diffRunArtifacts,
  snapshotProjectArtifacts,
} from './run-artifact-fs.js';
import {
  AiHtmlVersionSnapshotError,
  snapshotAiHtmlVersionsForRun,
} from './run-html-version-snapshots.js';
import { reportRunCompletedFromDaemon } from './langfuse-bridge.js';
import { buildPromptStackTelemetry } from './prompt-telemetry.js';
import { readAnalyticsContext } from './analytics.js';
import {
  agentIdToTracking,
  modelIdForTracking,
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
import { buildDesktopArtifactExportInput, buildDesktopPdfExportInput } from './pdf-export.js';
import { generateMedia } from './media/index.js';
import { listElevenLabsVoiceOptions } from './integrations/elevenlabs-voices.js';
import { searchResearch, ResearchError } from './research/index.js';
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
  listMediaTasksByProject,
  listRecentMediaTasks,
  reconcileMediaTasksOnBoot,
} from './media/tasks.js';
import { TASK_TTL_AFTER_DONE_MS, createMediaTaskStore } from './media/task-store.js';
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
  resolveExternalMcpServersForRun,
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
  sanitizePath,
  searchProjectFiles,
  resolveProjectDir,
  resolveProjectFilePath,
  writeProjectFile,
  reconcileHtmlArtifactManifest,
} from './projects.js';
import { validateArtifactManifestInput } from './artifacts/manifest.js';
import { ArtifactPublicationBlockedError } from './artifacts/publication-guard.js';
import {
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
  upsertAgentSession,
  upsertDeployment,
  upsertMessage,
  upsertPreviewComment,
} from './db.js';
import {
  computeIncludeStable,
  hashStableInstructions,
  isAgentResumeFailure,
  persistCapturedAgentSession,
  resolveAgentResumeContext,
} from './agent-session-resume.js';
import {
  createLiveArtifact,
  deleteLiveArtifact,
  ensureLiveArtifactPreview,
  getLiveArtifact,
  listLiveArtifacts,
  listLiveArtifactRefreshLogEntries,
  readLiveArtifactCode,
  recoverStaleLiveArtifactRefreshes,
  updateLiveArtifact,
} from './live-artifacts/store.js';
import { refreshLiveArtifact } from './live-artifacts/refresh-service.js';
import {
  sendLiveArtifactRouteError,
  setLiveArtifactCodeHeaders,
  setLiveArtifactPreviewHeaders,
} from './live-artifacts/http-helpers.js';
import { registerConnectorRoutes } from './connectors/routes.js';
import { registerActiveContextRoutes } from './routes/active-context.js';
import { registerAutomationRoutes } from './routes/automation.js';
import { registerDaemonRoutes } from './routes/daemon.js';
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
import { registerProjectRoutes, registerProjectArtifactRoutes, registerProjectFileRoutes, registerProjectUploadRoutes } from './routes/project/index.js';
import { registerVelaRoutes } from './routes/vela.js';
import { registerFinalizeRoutes, registerImportRoutes, registerProjectExportRoutes } from './import-export-routes.js';
import { registerHandoffRoutes } from './routes/handoff.js';
import { EmptyTranscriptError, synthesizeHandoffPrompt } from './handoff-design.js';
import { TranscriptExportLockedError } from './transcript-export.js';
import { registerChatRoutes } from './routes/chat.js';
import { registerRunRoutes } from './routes/runs.js';
import { registerTerminalRoutes } from './routes/terminal.js';
import { createTerminalService } from './terminals.js';
import { registerSocialShareRoutes } from './routes/social-share.js';
import { registerOpenDesignPublicMetadataRoutes } from './routes/open-design-public-metadata.js';
import { registerMemoryRoutes } from './routes/memory.js';
import { registerTelemetryRoutes } from './routes/telemetry.js';
import {
  assembleExample,
  registerAtomRoutes,
  registerStaticResourceRoutes,
  rewriteSkillAssetUrls,
} from './routes/static-resource.js';
export { rewriteSkillAssetUrls } from './routes/static-resource.js';
import { registerRoutineRoutes, routineDbRowToContract } from './routes/routine.js';
import { resolveAmrModelProbe } from './runtimes/amr-model-probe.js';
import { createPluginInstallationHelpers, normalizeProjectPluginFolderPath, resolveProjectChildDirectory } from './services/plugin-installation.js';
import { createPluginShareTaskStore } from './services/plugin-share-tasks.js';
import { getRouteRegistrationInventory, installRouteRegistrationGuard } from './route-registration-guard.js';
import { assertServerContextSatisfiesRoutes } from './route-context-contract.js';
import { configureConnectorCredentialStore, connectorService, FileConnectorCredentialStore } from './connectors/service.js';
import { composioConnectorProvider } from './connectors/composio.js';
import { configureComposioConfigStore } from './connectors/composio-config.js';
import { CHAT_TOOL_ENDPOINTS, CHAT_TOOL_OPERATIONS, toolTokenRegistry } from './tool-tokens.js';
import {
  buildDeployFileSet,
  checkDeploymentUrl,
  CLOUDFLARE_PAGES_PROVIDER_ID,
  DeployError,
  deployToCloudflarePages,
  deployToVercel,
  isDeployProviderId,
  listCloudflarePagesZones,
  prepareDeployPreflight,
  publicDeployConfigForProvider,
  readDeployConfig,
  VERCEL_PROVIDER_ID,
  writeDeployConfig,
} from './deploy.js';
import {
  checkCloudflarePagesDeploymentLinks,
  cloudflarePagesDeploymentMetadata,
  cloudflarePagesProjectNameForDeploy,
  cloudflarePagesProjectNameFromDeployment,
  publicDeployment,
  publicDeployments,
} from './deploy/cloudflare-pages-helpers.js';
import {
  allowedBrowserPorts,
  configuredAllowedOrigins,
  isAllowedBrowserOrigin,
  isLocalSameOrigin,
  isZeroConfigClipperLibraryRequest,
  parseHostHeader,
} from './origin-validation.js';
import { registerLibraryRoutes } from './routes/library.js';
import {
  libraryExtensionAllowedOrigins,
  seedLibraryExtensionOrigins,
} from './library-tokens.js';
import { listLibraryTokenOrigins } from './library-store.js';
import { apiTokenFromEnv, isApiAuthDisabled, isApiTokenMiddlewareEnabled } from './api-token-auth.js';
import { createOpenDesignPublicMetadataService } from './services/open-design-public-metadata.js';
import { execCommandViaLoginShell } from './services/login-shell.js';
import {
  OFFICIAL_MARKETPLACE_ID,
  createMarketplaceSeedHelpers,
} from './plugins/marketplace-seed.js';
import {
  PLUGIN_SHARE_ACTION_LABELS,
  USER_PLUGIN_SOURCE_KINDS,
  copyPluginFolderForProjectContext,
  detectSkillPluginCandidateOnRunSuccess,
  ensureGhReady,
  githubRepoNameFromPluginName,
  hasGeneratedPluginArtifacts,
  isPluginAuthoringRun,
  normalizePluginShareAction,
  reconcileAssistantMessageOnRunEnd,
  renderPluginBriefTemplate,
  renderPluginSharePrompt,
} from './plugins/share-helpers.js';
import { sanitizeArchiveFilename } from './projects/archive-filename.js';
import {
  isLoopbackHostname,
  isLoopbackPeerAddress,
  requireLocalDaemonRequest,
} from './http/local-daemon-request.js';
import { renderOAuthResultPage } from './http/oauth-result-page.js';
import { createToolRequestAuth } from './http/tool-request-auth.js';

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
const {
  bundledPluginRegistrySource,
  createMarketplaceFetcher,
  defaultMarketplaceSeedConfig,
  marketplaceSeedManifestText,
} = createMarketplaceSeedHelpers({
  bundledPluginsDir: BUNDLED_PLUGINS_DIR,
  projectRoot: PROJECT_ROOT,
  pluginRegistryDir: PLUGIN_REGISTRY_DIR,
  marketplaceManifestUrlForRegistry,
  marketplaceRegistryIdFromUrl,
});

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
// Brand metadata (brand.json + meta.json per brand) lives here; each brand
// also registers a `user:<id>` design system under USER_DESIGN_SYSTEMS_DIR.
const BRANDS_DIR = path.join(RUNTIME_DATA_DIR, 'brands');
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
// Global OD Library data root — owned, content-addressed assets captured by
// the clipper / `od library import`. Derived from RUNTIME_DATA_DIR per the
// daemon data directory contract.
const LIBRARY_DIR = path.join(RUNTIME_DATA_DIR, 'library');
fs.mkdirSync(PROJECTS_DIR, { recursive: true });
for (const dir of [USER_SKILLS_DIR, USER_DESIGN_SYSTEMS_DIR, BRANDS_DIR, USER_DESIGN_TEMPLATES_DIR, PLUGIN_REGISTRY_ROOTS.userPluginsRoot, LIBRARY_DIR]) {
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
// becomes the SSE event name (see routes/project/index.ts). Used for live-artifact
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

const TERMINAL_RUN_STATUSES = new Set(['succeeded', 'failed', 'canceled']);
const LANGFUSE_TERMINAL_FALLBACK_DELAY_MS = 15_000;

function fileNameFromToolInputPath(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/\\/g, '/');
  return normalized.split('/').filter(Boolean).at(-1) ?? trimmed;
}

function filesystemWriteFileNamesFromRunEvents(events) {
  const names = [];
  const seen = new Set();
  for (const rec of Array.isArray(events) ? events : []) {
    const data = rec?.data;
    if (!data || typeof data !== 'object') continue;
    if (data.type !== 'tool_use' && data.type !== 'artifact') continue;

    const toolName = typeof data.name === 'string' ? data.name : '';
    const isFileTool =
      data.type === 'artifact' ||
      /^(Write|Edit|MultiEdit|write_file|edit_file|replace_file)$/i.test(toolName);
    if (!isFileTool) continue;

    const input = data.input && typeof data.input === 'object' ? data.input : {};
    const candidate =
      fileNameFromToolInputPath(input.file_path) ||
      fileNameFromToolInputPath(input.filePath) ||
      fileNameFromToolInputPath(input.path) ||
      fileNameFromToolInputPath(input.filename) ||
      fileNameFromToolInputPath(data.path) ||
      fileNameFromToolInputPath(data.filePath) ||
      fileNameFromToolInputPath(data.name);
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    names.push(candidate);
  }
  return names;
}

export function __forTestFilesystemWriteFileNamesFromRunEvents(events) {
  return filesystemWriteFileNamesFromRunEvents(events);
}

function filesystemEmptyAnswerFallbackText(fileNames) {
  if (!Array.isArray(fileNames) || fileNames.length === 0) {
    return 'Wrote project files.';
  }
  const shown = fileNames.slice(0, 3);
  if (fileNames.length === 1) {
    return `Wrote ${shown[0]}.`;
  }
  if (fileNames.length <= 3) {
    const last = shown.at(-1);
    const first = shown.slice(0, -1).join(', ');
    return `Wrote ${first} and ${last}.`;
  }
  return `Wrote ${shown.join(', ')}, and ${fileNames.length} files total.`;
}

export function __forTestFilesystemEmptyAnswerFallbackText(fileNames) {
  return filesystemEmptyAnswerFallbackText(fileNames);
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

function openNativeFolderDialog() {
  return new Promise((resolve, reject) => {
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
        (err, stdout, stderr) => {
          try {
            resolve(parseLinuxFolderDialogResult(err, stdout, stderr));
          } catch (folderDialogError) {
            reject(folderDialogError);
          }
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

function rewriteKnownAgentStreamError(agentId, message, failureText = '') {
  const rawMessage =
    typeof message === 'string' && message.trim()
      ? message.trim()
      : 'Agent stream error';
  const combined = `${rawMessage}\n${failureText}`;
  if (
    /bufio\.scanner:\s*token too long/i.test(combined) &&
    /opencode/i.test(combined) &&
    (agentId === 'opencode' || agentId === 'mimo' || agentId === 'amr' || /json-rpc id \d+/i.test(combined))
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

// Figma `.fig` import — memory storage so the offline decoder gets the raw
// bytes without a temp-file round-trip. The decoder unzips + kiwi-decodes
// in-process and writes the snapshot under the project cwd.
const figmaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },  // community kits run large
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
        (req as any)._uploadAbsDir = absDir;
        cb(null, absDir);
      } catch (err) {
        cb(err, '');
      }
    },
    filename: (req, file, cb) => {
      // multer@1 hands us latin1-decoded multipart filenames; restore the
      // original UTF-8 so the response (and the on-disk name) preserves
      // non-ASCII characters instead of mangling them. Then run the shared
      // sanitiser and only add a suffix when that sanitized source name
      // would collide with an existing or same-batch upload.
      file.originalname = decodeMultipartFilename(file.originalname);
      const safe = sanitizeName(file.originalname);
      const uploadDir = typeof (req as any)._uploadAbsDir === 'string' ? (req as any)._uploadAbsDir : '';
      const reserved = (req as any)._uploadReservedNames instanceof Set
        ? (req as any)._uploadReservedNames
        : ((req as any)._uploadReservedNames = new Set());
      cb(null, uniqueUploadFileName(uploadDir, safe, reserved));
    },
  }),
  limits: { fileSize: 200 * 1024 * 1024 },  // 200MB — covers the largest design assets we expect (PPTX/PDF/raw images)
});

function uniqueUploadFileName(uploadDir, safeName, reserved) {
  const parsed = path.parse(safeName);
  const base = parsed.name || parsed.base || 'file';
  const ext = parsed.ext || '';
  for (let index = 0; index < 10_000; index += 1) {
    const candidate = index === 0 ? safeName : `${base}-${index}${ext}`;
    if (reserved.has(candidate)) continue;
    if (uploadDir && fs.existsSync(path.join(uploadDir, candidate))) continue;
    reserved.add(candidate);
    return candidate;
  }
  const fallback = `${base}-${Date.now().toString(36)}${ext}`;
  reserved.add(fallback);
  return fallback;
}

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
export type DesktopSlideRenderer = (input: DesktopRenderSlidesInput) => Promise<DesktopRenderSlidesResult>;
export type DesktopArtifactExporter = (input: DesktopExportArtifactInput) => Promise<DesktopExportArtifactResult>;

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
  desktopArtifactExporter?: DesktopArtifactExporter | null;
  desktopPdfExporter?: DesktopPdfExporter | null;
  desktopSlideRenderer?: DesktopSlideRenderer | null;
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

export async function startServer({
  port = 7456,
  host = normalizeDaemonBindHost(process.env.OD_BIND_HOST),
  returnServer = false,
  desktopPdfExporter = null,
  desktopSlideRenderer = null,
  desktopArtifactExporter = null,
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
  // Clipper page captures are self-contained HTML with inlined images plus a
  // Figma IR, which for an image-heavy site (The Economist, news front pages)
  // runs to tens of MB — far past a normal JSON body. Give the ingest route a
  // dedicated generous limit so a full-page capture doesn't 413; the rest of the
  // API stays at the conservative 4mb. Registered first so this parser claims
  // the ingest body before the global one (express.json is a no-op once a body
  // has already been read).
  app.use('/api/library/ingest', express.json({ limit: '128mb' }));
  // Brand extract-from-html carries the full rendered page DOM (+ collected CSS)
  // the web read out of the in-app browser tab after the user cleared an anti-bot
  // wall — well past 4mb for image/markup-heavy sites. Give it a dedicated limit
  // (registered before the global parser so it claims the body first).
  app.use('/api/brands/:id/extract-from-html', express.json({ limit: '32mb' }));
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

  const designSystemServices = createDesignSystemServerServices({
    roots: { SKILL_ROOTS, DESIGN_TEMPLATE_ROOTS, ALL_SKILL_LIKE_ROOTS },
    paths: { PROJECTS_DIR, DESIGN_SYSTEMS_DIR, USER_DESIGN_SYSTEMS_DIR },
    skills: { listSkills, findSkillById },
    designSystems: {
      listDesignSystems,
      readDesignSystem,
      readDesignSystemPackageInfo,
      readDesignSystemStaticFile,
      listUserDesignSystemFiles,
      readUserDesignSystemFile,
      linkUserDesignSystemProject,
      LEGACY_DESIGN_SYSTEM_ARTIFACTS,
    },
    projects: {
      getProject,
      insertProject,
      updateProject,
      readProjectFile,
      writeProjectFile,
      listFiles,
      resolveProjectDir,
      isSafeId,
    },
  });
  const {
    ensureUserDesignSystemWorkspaceProject,
    isProjectUsableDesignSystem,
    listAllDesignSystems,
    listAllDesignTemplates,
    listAllSkillLikeEntries,
    listAllSkills,
    readAvailableDesignSystem,
    readAvailableDesignSystemPackageInfo,
    readAvailableDesignSystemStaticFile,
    readDesignSystemWorkspaceTextFile,
    validateProjectDesignSystemId,
    validateProjectSkillId,
  } = designSystemServices;

  // Chrome may strip the port from the Origin header on same-origin GET
  // requests. Only use this as a fallback for safe, idempotent GET requests;
  // mutating routes always require an exact origin/host match.
  function isPortlessLoopbackOrigin(origin) {
    return /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])$/.test(origin);
  }

  function reportHostForPoweredPreview(): string {
    return host === '0.0.0.0' || host === '::' || host === '[::]' || host === '::1'
      ? '127.0.0.1'
      : host;
  }

  function poweredPreviewHost(): string | null {
    const reportHost = reportHostForPoweredPreview();
    if (reportHost === '127.0.0.1') return 'localhost';
    if (reportHost === 'localhost') return '127.0.0.1';
    return null;
  }

  // Routes that serve content to sandboxed iframes (Origin: null) for
  // read-only purposes.  All other /api routes reject Origin: null.
  const _NULL_ORIGIN_SAFE_GET_RE =
    /^\/projects\/[^/]+\/(?:raw|preview)\/|^\/codex-pets\/[^/]+\/spritesheet$|^\/asset-cache$/;
  const _POWERED_PREVIEW_SAFE_RE = /^\/projects\/[^/]+\/powered\/.+$/u;

  // Reject cross-origin requests to API endpoints.
  // Health/version remain open for monitoring probes.
  // Non-browser clients (no Origin header) are always allowed.
  app.use('/api', (req, res, next) => {
    // Live artifact previews have stricter local-daemon validation and
    // loopback CORS handling on the route itself. Let that middleware produce
    // the structured error shape and preflight headers for preview embeds.
    if (/^\/live-artifacts\/[^/]+\/preview$/.test(req.path)) return next();

    // Zero-config browser extension: the OD Clipper only needs a liveness probe
    // plus POST /api/library/ingest. A web page cannot forge a
    // chrome-extension:// (or moz-extension://) origin, and the daemon is
    // loopback-bound, so these two bootstrap routes are auto-trusted without a
    // pairing handshake. Library read routes still fall through to the normal
    // origin guard.
    // NOTE: `req.path` here is mount-relative (the `/api` prefix is stripped),
    // so the predicate matches `/library/ingest`, not `/api/library/ingest`.
    if (isZeroConfigClipperLibraryRequest(req.method, req.path, req.headers.origin)) {
      return next();
    }

    const poweredHost = poweredPreviewHost();
    if (poweredHost && resolvedPort) {
      const requestHost = parseHostHeader(req.headers.host);
      const fetchMetadataPresent =
        req.headers['sec-fetch-site'] != null ||
        req.headers['sec-fetch-mode'] != null ||
        req.headers['sec-fetch-dest'] != null;
      const poweredReferer = (() => {
        const raw = Array.isArray(req.headers.referer) ? req.headers.referer[0] : req.headers.referer;
        if (typeof raw !== 'string' || raw.length === 0) return false;
        try {
          const parsed = new URL(raw);
          return parsed.hostname === poweredHost &&
            (parsed.port || (parsed.protocol === 'https:' ? '443' : '80')) === String(resolvedPort) &&
            /^\/api\/projects\/[^/]+\/powered\/.+/u.test(parsed.pathname);
        } catch {
          return false;
        }
      })();
      const isPoweredPreviewBrowserRequest =
        requestHost?.hostname === poweredHost &&
        requestHost.port === String(resolvedPort) &&
        (fetchMetadataPresent || poweredReferer);
      if (isPoweredPreviewBrowserRequest && !_POWERED_PREVIEW_SAFE_RE.test(req.path)) {
        return res.status(403).json({
          error: 'Powered preview origin cannot access this API route',
        });
      }
    }

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
    // Paired browser-extension origins are persisted in library_tokens and
    // seeded into this in-memory allowlist at boot / on pairing.
    const allowedOrigins = [...extraAllowedOrigins, ...libraryExtensionAllowedOrigins()];
    if (!isAllowedBrowserOrigin(origin, req.headers.host, ports, host, allowedOrigins)) {
      if (req.method !== 'GET' || !isPortlessLoopbackOrigin(String(origin))) {
        return res.status(403).json({ error: 'Cross-origin requests are not allowed' });
      }
    }
    next();
  });
  const db = openDatabase(PROJECT_ROOT, { dataDir: RUNTIME_DATA_DIR });
  // Restore paired browser-extension origins into the in-memory allowlist the
  // /api origin middleware above consults, so a paired clipper survives daemon
  // restarts without re-pairing.
  try {
    seedLibraryExtensionOrigins(listLibraryTokenOrigins(db));
  } catch {
    // best-effort: a fresh db with no library_tokens is fine
  }
  const pluginInstallation = createPluginInstallationHelpers({
    db,
    installFromLocalFolder,
    PLUGIN_REGISTRY_ROOTS,
    PLUGIN_LOCKFILE_PATH,
    PLUGIN_UPLOAD_MAX_BYTES,
  });
  const mediaTaskStore = createMediaTaskStore(db);
  const {
    authorizeToolRequest,
    optionalToolGrantFromRequest,
    requestProjectOverride,
    requestRunOverride,
  } = createToolRequestAuth(toolTokenRegistry);
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
  mediaTaskStore.mediaTasks.clear();
  for (const row of listRecentMediaTasks(db, { terminalTtlMs: TASK_TTL_AFTER_DONE_MS })) {
    mediaTaskStore.hydrateMediaTask(row);
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
  // route registration into `./routes/project/index.js` via PR #1043, so the
  // simple project-create surface is wired through `registerProjectRoutes`
  // further down. Plugin-snapshot-resolution / default-scenario-fallback
  // from garnet need to be re-integrated into routes/project/index.ts as a
  // follow-up — see reconcile decision log.
  // (legacy POST /api/projects body deleted — see registerProjectRoutes below.)

  const telemetry = registerTelemetryRoutes(app, {
    dataDir: RUNTIME_DATA_DIR,
    readAppConfig,
  });
  const { analyticsService } = telemetry;
  const design = {
    runs: createChatRunService({
      createSseResponse,
      createSseErrorPayload,
      runsLogDir: path.join(RUNTIME_DATA_DIR, 'runs'),
    }),
    analytics: analyticsService,
    getAppVersion: () => telemetry.getCachedAppVersion()?.version ?? '0.0.0',
    readAnalyticsContext,
  };

  // Interactive Terminal sessions (node-pty). In-memory, process-local, and
  // killed on daemon shutdown — see shutdownDaemonRuns below.
  const terminalService = createTerminalService();

  // Tracks runs whose finalized assistant message has already been forwarded
  // to Langfuse so repeated message updates only emit one final trace per run.
  // Terminal fallback reports intentionally do not claim this set; a delayed
  // telemetry-finalized message can still replace the synthetic fallback.
  const reportedRuns = new Set();

  const reportFinalizedMessage = createFinalizedMessageTelemetryReporter({
    design,
    db,
    dataDir: RUNTIME_DATA_DIR,
    reportedRuns,
    getAppVersion: telemetry.getCachedAppVersion,
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

  const reportFeedback = telemetry.reportFeedback;

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
    LIBRARY_DIR,
    BRANDS_DIR,
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

  // Powered-preview isolation info. Reports the daemon's own directly-reachable
  // http origin so the web host can render WebGL/Worker/WASM/SharedArrayBuffer
  // artifacts in a cross-origin-isolated iframe (see the /powered route and
  // apps/web/src/runtime/powered-preview.ts). The web host always swaps this
  // loopback hostname before loading powered files; the /api origin middleware
  // then treats that swapped browser origin as preview-only.
  app.get('/api/preview/isolation', (_req, res) => {
    const reportHost = reportHostForPoweredPreview();
    const baseOrigin = resolvedPort ? `http://${reportHost}:${resolvedPort}` : null;
    res.setHeader('Cache-Control', 'no-store');
    /** @type {import('@open-design/contracts').ProjectPreviewIsolationResponse} */
    const body = {
      supported: Boolean(baseOrigin),
      baseOrigin,
      pathPrefix: 'powered',
    };
    res.json(body);
  });

  registerDaemonRoutes(app, {
    db,
    paths: { RUNTIME_DATA_DIR },
    http: { requireLocalDaemonRequest, sendApiError },
    host,
    getResolvedPort: () => resolvedPort,
    getDaemonShuttingDown: () => daemonShuttingDown,
    sandboxRuntime: SANDBOX_RUNTIME,
    env: process.env,
  });

  const openDesignPublicMetadata = createOpenDesignPublicMetadataService();
  registerOpenDesignPublicMetadataRoutes(app, {
    http: httpDeps,
    openDesignPublicMetadata,
  });

  registerPluginEventRoutes(app, {
    http: { requireLocalDaemonRequest },
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
    sanitizePath,
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
    buildDesktopArtifactExportInput,
    desktopPdfExporter,
    desktopSlideRenderer,
    desktopArtifactExporter,
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
    mediaTasks: mediaTaskStore.mediaTasks,
    createMediaTask: mediaTaskStore.createMediaTask,
    persistMediaTask: mediaTaskStore.persistMediaTask,
    appendTaskProgress: mediaTaskStore.appendTaskProgress,
    notifyTaskWaiters: mediaTaskStore.notifyTaskWaiters,
    getLiveMediaTask: mediaTaskStore.getLiveMediaTask,
    mediaTaskSnapshot: mediaTaskStore.mediaTaskSnapshot,
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
  // OD Library — global asset registry (clipper ingest, grid, pairing, apply).
  registerLibraryRoutes(app, {
    db,
    http: httpDeps,
    paths: pathDeps,
    projectStore: projectStoreDeps,
    projectFiles: projectFileDeps,
    conversations: conversationDeps,
    auth: authDeps,
  });
  app.post('/api/projects/:id/figma/import', (req, res) => {
    figmaUpload.single('file')(req, res, async (err) => {
      if (err) return sendMulterError(res, err);
      try {
        const project = getProject(db, req.params.id);
        if (!project) return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');

        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const figmaUrl = typeof body.figmaUrl === 'string' ? body.figmaUrl.trim() : '';
        if (!req.file) {
          if (figmaUrl) {
            return sendApiError(
              res,
              409,
              'FIGMA_URL_NEEDS_MIGRATION',
              'Figma URL imports must run through the Figma migration flow.',
              { details: { figmaUrl } },
            );
          }
          return sendApiError(res, 400, 'BAD_REQUEST', 'file is required');
        }

        const projectRoot = resolveProjectDir(PROJECTS_DIR, req.params.id, project.metadata);
        const notes = typeof body.notes === 'string' ? body.notes : undefined;
        const result = await importFigmaFromBytes(req.file.buffer, {
          cwd: projectRoot,
          label: decodeMultipartFilename(req.file.originalname || 'figma-import.fig'),
          notes,
        });
        return res.json(result);
      } catch (caught) {
        return sendApiError(
          res,
          400,
          'FIGMA_IMPORT_FAILED',
          caught instanceof Error ? caught.message : String(caught),
        );
      }
    });
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
    agents: agentDeps,
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
      buildUserDesignSystemArchive,
      createUserDesignSystem,
      deleteUserDesignSystem,
      ensureUserDesignSystemWorkspaceProject,
      listAllDesignSystems,
      listUserDesignSystemFiles,
      listUserDesignSystemRevisions,
      prepareDesignTokenContractRebuild,
      readAvailableDesignSystem,
      readAvailableDesignSystemPackageInfo,
      readAvailableDesignSystemStaticFile,
      readDesignSystemWorkspaceTextFile,
      readUserDesignSystemFile,
      renderDesignSystemPreview,
      renderDesignSystemShowcase,
      updateUserDesignSystem,
      updateUserDesignSystemRevisionStatus,
    },
    generationJobs: designSystemGenerationJobs,
  });
  registerBrandRoutes(app, {
    brandsRoot: BRANDS_DIR,
    userDesignSystemsRoot: USER_DESIGN_SYSTEMS_DIR,
    projectsRoot: PROJECTS_DIR,
    skillsRoot: SKILLS_DIR,
    dataDir: RUNTIME_DATA_DIR,
    db,
    runs: design.runs,
    randomId,
    resolveTranscriptAgent: async () => {
      const config = await readAppConfig(RUNTIME_DATA_DIR);
      let agentId = typeof config.agentId === 'string' && config.agentId
        ? config.agentId
        : null;
      let detectedAgentName: string | null = null;
      if (!agentId) {
        const agents = await detectAgents(config.agentCliEnv ?? {}).catch(() => []);
        const available = agents.find((agent) => agent.available);
        agentId = available?.id ?? null;
        detectedAgentName = available?.name ?? null;
      }
      if (!agentId) return null;
      return {
        agentId,
        agentName: getAgentDef(agentId)?.name ?? detectedAgentName ?? agentId,
      };
    },
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
    node: nodeDeps,
    ids: idDeps,
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

  registerVelaRoutes(app, {
    paths: { RUNTIME_DATA_DIR },
    appConfig: { readAppConfig },
    http: { getPublicBaseUrl },
    env: process.env,
  });

  const pluginRouteHelpers = {
    PLUGIN_PREVIEWS_DIR,
    applyBakedPreviews,
    assembleExample,
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
    ids: idDeps,
    projectStore: projectStoreDeps,
    conversations: conversationDeps,
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
    ids: idDeps,
    projectStore: projectStoreDeps,
    conversations: conversationDeps,
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
    byokMediaDefaults,
  }) => {
    const project =
      typeof projectId === 'string' && projectId
        ? getProject(db, projectId)
        : null;
    let appConfigForPrompt = null;
    try {
      appConfigForPrompt = await readAppConfig(RUNTIME_DATA_DIR);
    } catch (err) {
      console.warn('[app-config] readAppConfig failed', err);
    }
    let pluginDesignSystemId = null;
    if (
      typeof appliedPluginSnapshotId === 'string' &&
      appliedPluginSnapshotId.length > 0
    ) {
      try {
        pluginDesignSystemId = designSystemIdFromPluginSnapshot(
          getSnapshot(db, appliedPluginSnapshotId),
        );
      } catch (err) {
        console.warn(
          `[plugins] designSystem selection failed: ${err?.message ?? err}`,
        );
      }
    }
    const effectiveSkillId =
      typeof skillId === 'string' && skillId ? skillId : project?.skillId;
    const designSystemSelection = resolveEffectiveDesignSystemSelection({
      requestDesignSystemId: designSystemId,
      pluginDesignSystemId,
      projectDesignSystemId: project?.designSystemId,
      appDefaultDesignSystemId: appConfigForPrompt?.designSystemId,
      // A project row with designSystemId=null can mean the user picked
      // "No design system"; do not reapply the global default behind their back.
      allowAppDefault: project === null,
    });
    const effectiveDesignSystemId = designSystemSelection.id;
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

    // Per-hook switches for the two-loop memory feature. Read alongside the
    // memory body so the composer can gate the PRE intent-gateway brief and
    // the POST self-verify scorecard on the same config the settings panel
    // writes. Read failure falls through to undefined hooks, which the
    // composer treats as on-by-default — matching the config's default-on
    // semantics.
    let memoryHooks: { profile?: boolean; rewrite?: boolean; verify?: boolean } | undefined;
    try {
      const memCfg = await readMemoryConfig(RUNTIME_DATA_DIR);
      memoryHooks = {
        profile: memCfg.profileEnabled,
        rewrite: memCfg.rewriteEnabled,
        verify: memCfg.verifyEnabled,
      };
    } catch (err) {
      console.warn('[memory] readMemoryConfig failed', err);
    }

    // User-level custom instructions from app-config.json.
    let userInstructions = '';
    if (appConfigForPrompt?.customInstructions) {
      userInstructions = appConfigForPrompt.customInstructions;
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
    let activeDesignSystemId = null;
    let designSystemDigest = null;
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
        if (typeof designSystemBody === 'string' && designSystemBody.length > 0) {
          activeDesignSystemId = effectiveDesignSystemId;
          designSystemDigest = digestDesignSystemContext({
            id: effectiveDesignSystemId,
            title: designSystemTitle,
            body: designSystemBody,
            usageMd: designSystemUsageMd,
            tokensCss: designSystemTokensCss,
            componentsManifest: designSystemComponentsManifest,
            fixtureHtml: designSystemFixtureHtml,
            pullIndex: designSystemPullIndex,
            importMode: designSystemImportMode,
          });
        }
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
      memoryHooks,
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
      byokMediaDefaults,
      streamFormat,
      executionProfile: executionProfileFromStreamFormat(streamFormat),
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
      designSystemSelection: {
        id: activeDesignSystemId,
        requestedId: effectiveDesignSystemId,
        source: activeDesignSystemId ? designSystemSelection.source : 'none',
        digest: designSystemDigest,
      },
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
          runEvents:      run.events,
        });
        return {
          signals:         outcome.signals,
          critiqueSummary: outcome.critiqueSummary,
          tokensUsed:      outcome.tokensUsed,
        };
      };
    }
    const pipelineDone = runPipelineForRun({
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
    void Promise.all([runs.wait(run), pipelineDone])
      .then(() => {
        const tokensUsed = scanRunEventsForUsageAnalytics(run.events, null, 0).total_tokens ?? null;
        if (tokensUsed === null) return;
        dbHandle.prepare(
          'UPDATE run_devloop_iterations SET tokens_used = ? WHERE run_id = ?',
        ).run(tokensUsed, run.id);
      })
      .catch((err) => {
        console.warn('[plugins] devloop tokens_used reconciliation failed', err);
      });
  };

  const startChatRun = async (chatBody, run) => {
    const lifecycle = createRunLifecycleTracer(run);
    lifecycle.mark('chat_run_started');
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
      byokProvider,
      byokMediaDefaults,
    } = chatBody;
    lifecycle.mark('prompt_build_start');
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
      sessionMode === 'chat' || sessionMode === 'design' || sessionMode === 'plan'
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
    const byokOpenCodeProvider = def.id === 'byok-opencode'
      ? buildOpenCodeByokProviderConfig(
          byokProvider,
          typeof model === 'string' ? model : null,
        )
      : null;
    if (def.id === 'byok-opencode' && !byokOpenCodeProvider) {
      return design.runs.fail(
        run,
        'BYOK_PROVIDER_REQUIRED',
        'BYOK OpenCode requires a provider, API key, and model for this run.',
      );
    }
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
    // The async startup phase below (compose prompt, prepare prompt file,
    // probe models, …) has many awaits and no blanket try/finally; an
    // exception there finalizes the run via runs.fail() without running the
    // per-attempt cleanup wired to the child lifecycle. Register the grant +
    // sink release on the run's terminal chokepoint so any exit path — startup
    // throw included — revokes the capability token instead of leaking it for
    // the token TTL. Idempotent with the explicit pre-spawn/child-close cleanup.
    if (toolTokenGrant) {
      run.onFinalize = () => {
        revokeToolToken('run_finalized');
        const sinkRunId = toolTokenGrant.runId ?? runId;
        activeChatAgentEventSinks.delete(sinkRunId);
        activeChatRunHandles.delete(sinkRunId);
      };
    }
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
      designSystemSelection,
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
        byokMediaDefaults,
        // Plan §3.M2 / §3.V1 — forward the run's snapshot id so the
        // prompt composer can splice in `## Active stage` blocks.
        // Default ON; set OD_BUNDLED_ATOM_PROMPTS=0 to opt out.
        appliedPluginSnapshotId: run?.appliedPluginSnapshotId ?? null,
      });

    run.designSystemId = designSystemSelection?.id ?? null;
    run.designSystemRequestedId = designSystemSelection?.requestedId ?? null;
    run.designSystemSelectionSource = designSystemSelection?.source ?? 'none';
    run.designSystemDigest = designSystemSelection?.digest ?? null;

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
    const latestRunPromptForHtmlVersionSnapshot = () => {
      if (run.conversationId) {
        try {
          const row = db.prepare(
            `SELECT content
               FROM messages
              WHERE conversation_id = ?
                AND role = 'user'
                AND LENGTH(TRIM(content)) > 0
              ORDER BY COALESCE(ended_at, started_at, created_at, 0) DESC,
                       position DESC
              LIMIT 1`,
          ).get(run.conversationId);
          if (typeof row?.content === 'string' && row.content.trim()) {
            return { prompt: row.content.trim(), promptSource: 'message' as const };
          }
        } catch {
          // Version prompt provenance is best-effort.
        }
      }
      const requestPrompt =
        typeof currentPrompt === 'string' && currentPrompt.trim()
          ? currentPrompt.trim()
          : typeof message === 'string' && message.trim()
            ? message.trim()
            : null;
      return requestPrompt ? { prompt: requestPrompt, promptSource: 'message' as const } : { prompt: null };
    };
    const snapshotAiHtmlVersionsBeforeSuccess = async () => {
      if (!run?.id || !run.projectId) return;
      const artifactBaseline = runArtifactBaselines.peek(run.id);
      if (!artifactBaseline || artifactBaseline.contended) return;
      let diff;
      try {
        diff = diffRunArtifacts(
          artifactBaseline.before,
          snapshotProjectArtifacts(artifactBaseline.cwd),
        );
      } catch {
        return;
      }
      const promptInfo = latestRunPromptForHtmlVersionSnapshot();
      await snapshotAiHtmlVersionsForRun({
        projectsRoot: PROJECTS_DIR,
        projectId: run.projectId,
        projectRoot: artifactBaseline.cwd,
        diff,
        prompt: promptInfo.prompt,
        ...(promptInfo.promptSource ? { promptSource: promptInfo.promptSource } : {}),
        metadata: projectRecord?.metadata,
      });
    };
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
      def.resumesSessionViaCli === true ||
      def.streamFormat === 'pi-rpc' ||
      def.resumesSessionViaAcpLoad === true;
    // Capture-style adapters (codex) mint their OWN session id and report it on
    // the stream; the daemon captures it here and persists THAT as the resume
    // handle instead of `agentResumeCtx.newSessionId` (which such CLIs ignore).
    // Set from the `status` event's `sessionId` in `sendAgentEvent` below.
    const agentCapturesSessionId = def.capturesSessionIdFromStream === true;
    let capturedSessionId: string | null = null;
    // --- Model resolution hoisted above the resume-identity guard ---
    // The guard (and the persisted `agent_sessions.model`) must key off the
    // model identity actually requested for this turn. Explicit `default` is
    // kept as a real identity because ACP runtimes can leave model selection to
    // the upstream session's own configured default; omitted models may still
    // resolve to an available fallback below.
    let configuredAgentEnv = {};
    try {
      const appConfig = await readAppConfig(RUNTIME_DATA_DIR);
      configuredAgentEnv = agentCliEnvForAgent(appConfig.agentCliEnv, def.id);
    } catch {
      configuredAgentEnv = {};
    }
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
    const hasDefaultModelEnvOverride = Boolean(
      def.defaultModelEnvVar &&
      typeof process.env[def.defaultModelEnvVar] === 'string' &&
      process.env[def.defaultModelEnvVar]?.trim(),
    );
    const safeReasoning =
      typeof reasoning === 'string' && Array.isArray(def.reasoningOptions)
        ? (def.reasoningOptions.find((r) => r.id === reasoning)?.id ?? null)
        : null;
    const agentOptions = { model: safeModel, reasoning: safeReasoning };
    const agentLaunch = resolveAgentLaunch(def, configuredAgentEnv);
    const resolvedBin = agentLaunch.selectedPath;
    if (def.id === 'amr' && resolvedBin && agentLaunch.launchPath) {
      // Concretize omitted/default AMR model requests to the live catalog
      // default before the resume guard. The AMR preflight below applies the
      // same rewrite before spawn; keeping this earlier copy aligned prevents
      // stored concrete session models from comparing against raw `default`.
      try {
        const resumeProbe = await resolveAmrModelProbe({ dataDir: RUNTIME_DATA_DIR, env: process.env, readAppConfig });
        const resumeCatalog = await amrModelLoadingCache.get(resumeProbe.cacheKey, {
          fetchPreset: () => fetchVelaPresetModels(resumeProbe.launchPath, resumeProbe.env),
          fetchRemote: () => fetchVelaRemoteModelsWithRetry(resumeProbe.launchPath, resumeProbe.env),
        });
        const resumeLiveModels = preferFreshLiveModels(
          resumeCatalog.models ?? [],
          getRememberedLiveModels(def.id, requestedLiveModelScope),
        );
        const resumeModelIds = new Set(resumeLiveModels.map((c) => c?.id).filter(Boolean));
        const askedForDefault =
          typeof model !== 'string' || !model.trim() || model.trim().toLowerCase() === 'default';
        const defaultRunModel = resolveDefaultModelFromOptions(resumeLiveModels);
        if (
          !safeModel ||
          safeModel === 'default' ||
          (
            askedForDefault &&
            !hasDefaultModelEnvOverride &&
            defaultRunModel &&
            (!resumeModelIds.has(safeModel) || safeModel !== defaultRunModel)
          )
        ) {
          safeModel = defaultRunModel ?? safeModel ?? null;
          agentOptions.model = safeModel;
        }
      } catch {
        // Degrade silently: keep the requested value. The preflight below records
        // the probe failure and applies the identical fallback.
      }
    }
    const agentResumeCtx =
      agentSupportsSessionResume && run.conversationId
        ? resolveAgentResumeContext(db, {
            conversationId: run.conversationId,
            agentId: def.id,
            currentModel: safeModel ?? null,
            currentCwd: effectiveCwd,
            currentAssistantMessageId: run.assistantMessageId ?? null,
          })
        : { resumeSessionId: null as string | null, newSessionId: undefined as string | undefined, isResuming: false, storedStablePromptHash: null as string | null, invalidationReason: null };
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
    run.promptCache = describeStablePromptCache({
      isResuming: agentResumeCtx.isResuming,
      storedStablePromptHash: agentResumeCtx.storedStablePromptHash,
      currentStableHash,
    });
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
    lifecycle.mark('prompt_build_end');
    lifecycle.mark('launch_preflight_start');
    // (model resolution + AMR concretization hoisted above the resume guard)
    const executionProfile = executionProfileFromStreamFormat(def.streamFormat);
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
    let visibleAssistantText = '';
    // Reply text handed to the background memory extractor at child-close.
    // Captures the GUARDED, visible reply from BOTH channels a run can emit on:
    // structured agents' `agent` `text_delta` (Claude/Codex/Gemini/Copilot/ACP/
    // qoder/pi-rpc) and the plain/BYOK/antigravity family's `stdout` chunks. So
    // every agent family contributes its actual reply, and none leak raw
    // transport frames (system:init, stream_event, hooks). Kept separate from
    // `visibleAssistantText` so the filesystem empty-output guard that reads
    // that variable keeps its text_delta-only semantics. Bounded — the
    // extractor only needs the head of the reply.
    const MEMORY_REPLY_CAP = 32 * 1024;
    let memoryReplyText = '';
    const send = (event, data) => {
      const lifecycleMarkers = runLifecycleMarkersForStreamEvent(event, data);
      if (lifecycleMarkers.firstModelEventType) {
        lifecycle.markFirstModelEvent(lifecycleMarkers.firstModelEventType);
      }
      if (lifecycleMarkers.firstVisibleOutput) {
        lifecycle.mark('first_visible_output');
      }
      if (lifecycleMarkers.firstArtifactWrite) {
        lifecycle.mark('first_artifact_write');
      }
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
      if (
        event === 'agent' &&
        data &&
        data.type === 'text_delta' &&
        typeof data.delta === 'string'
      ) {
        visibleAssistantText += data.delta;
      }
      // Accumulate the visible reply for the memory extractor from whichever
      // channel this agent family uses: `agent` text_delta (structured streams)
      // or `stdout` chunks (plain/BYOK/antigravity). Both carry already-guarded,
      // user-visible text, so this never captures thinking, tool traffic, or raw
      // transport frames.
      if (memoryReplyText.length < MEMORY_REPLY_CAP) {
        const replyPiece =
          event === 'agent' && data && data.type === 'text_delta' && typeof data.delta === 'string'
            ? data.delta
            : event === 'stdout' && data && typeof data.chunk === 'string'
              ? data.chunk
              : '';
        if (replyPiece) {
          memoryReplyText = (memoryReplyText + replyPiece).slice(0, MEMORY_REPLY_CAP);
        }
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
    // Synchronously detach the failed attempt: kill the old child and move the
    // run back to `queued` *now*, even when the re-spawn is delayed by backoff.
    // This must not be deferred — leaving the old child alive during the backoff
    // window lets a follow-on signal (e.g. the inactivity watchdog's SIGTERM)
    // drive a second close-handler pass that finalizes the run as failed before
    // the retry ever spawns.
    const tearDownAttemptForRetry = () => {
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
      lifecycle.resetForAttempt(run.retryAttemptCount ?? 0);
      run.analyticsTelemetry = {
        startRequestedAt: run.analyticsTelemetry?.startRequestedAt ?? run.createdAt,
      };
    };
    const spawnRetryAttempt = () => {
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
    // Tear the failed attempt down now (moving the run to `queued`), then wait
    // out the policy's backoff before re-spawning. Stays cancel-aware: a cancel
    // or shutdown during the backoff window clears the timer (runtimes/runs.ts)
    // and finalizes the queued run, and the callback re-checks cancel/terminal
    // state in case it fires first.
    const scheduleRetryRestart = (delayMs) => {
      tearDownAttemptForRetry();
      const wait = Number.isFinite(delayMs) && delayMs > 0 ? delayMs : 0;
      if (wait <= 0) {
        spawnRetryAttempt();
        return;
      }
      run.retryRestartTimer = setTimeout(() => {
        run.retryRestartTimer = null;
        if (run.cancelRequested || design.runs.isTerminal(run.status)) return;
        spawnRetryAttempt();
      }, wait);
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
      lifecycle.mark('finalize_start');
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
          retry_delay_ms: decision.retryDelayMs,
        });
        scheduleRetryRestart(decision.retryDelayMs);
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
        : agentCapturesSessionId
          ? capturedSessionId
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
          model: safeModel ?? null,
          cwd: effectiveCwd,
          lastMessageId: run.assistantMessageId ?? null,
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
      if (executionProfile === 'filesystem' && result === 'success' && visibleAssistantText.trim().length === 0) {
        const fileNames = filesystemWriteFileNamesFromRunEvents(run.events);
        if (fileNames.length > 0) {
          send('agent', {
            type: 'diagnostic',
            name: 'filesystem_empty_answer_autofilled',
            source: 'daemon-run-finalize',
            fileCount: fileNames.length,
            files: fileNames.slice(0, 8),
          });
          send('agent', {
            type: 'text_delta',
            delta: filesystemEmptyAnswerFallbackText(fileNames),
          });
        }
      }
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
    const isOpenCodeContent = def.externalMcpInjection === 'opencode-env-content';
    const isMiMoContent = def.externalMcpInjection === 'mimo-env-content';
    if (isOpenCodeContent || isMiMoContent) {
      try {
        opencodeConfigContent = buildOpenCodeMcpConfigContent(
          enabledExternalMcp,
          oauthTokensForSpawn,
          {
            allowedDirectories: [effectiveCwd, ...extraAllowedDirs],
            ...(byokOpenCodeProvider
              ? { extraConfig: byokOpenCodeProvider.config }
              : {}),
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

    // agentLaunch / resolvedBin are resolved above the resume guard (hoisted).
    // Hoisted above the AMR catalog preflight: the empty-catalog branch
    // below calls `sendAmrAccountFailure(...)` to surface AMR_AUTH_REQUIRED
    // for signed-out users, and a `const` declared later in the same outer
    // function scope would hit a TDZ ReferenceError before initialization.
    const sendAmrAccountFailure = (failure) => {
      send('error', createSseErrorPayload(
        failure.code,
        failure.message,
        {
          retryable: false,
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
        const probe = await resolveAmrModelProbe({ dataDir: RUNTIME_DATA_DIR, env: process.env, readAppConfig });
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
      // adopt the catalog's enabled default so the spawn layer always has a
      // usable real id.
      const userAskedForDefault =
        typeof model !== 'string' ||
        !model.trim() ||
        model.trim().toLowerCase() === 'default';
      const defaultRunModel = resolveDefaultModelFromOptions(liveModels);
      if (
        !safeModel ||
        safeModel === 'default' ||
        (
          userAskedForDefault &&
          !hasDefaultModelEnvOverride &&
          defaultRunModel &&
          (!liveModelIds.has(safeModel) || safeModel !== defaultRunModel)
        )
      ) {
        safeModel = defaultRunModel ?? (safeModel === 'default' ? null : safeModel ?? null);
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

    // Codex CLI parses config.toml before processing any -c overrides. An
    // invalid `service_tier` value (the Codex app has written "priority",
    // "default", and other values the CLI rejects) causes an immediate parse
    // error and exit-1 before any work starts. Normalize it in-place — any
    // value outside {fast,flex} has its line removed so the CLI uses its
    // built-in default — so the launch succeeds. Errors are silently swallowed
    // — a missing or read-only config.toml is fine, and the Codex CLI still
    // surfaces the original error if the write fails. See issue #4276 / #3408.
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
        // The id to persist for a create turn: capture-style adapters store the
        // session id the CLI minted and reported on the stream; specify-style
        // adapters store the daemon-minted id they passed to the CLI. A
        // capture-style run that never reported an id (CLI died before
        // `thread.started`) leaves nothing to resume — correct, the next turn
        // starts fresh and re-seeds the transcript.
        const createTurnSessionId = agentCapturesSessionId
          ? capturedSessionId
          : agentResumeCtx.newSessionId;
        if (!agentResumeCtx.isResuming && createTurnSessionId) {
          upsertAgentSession(db, {
            conversationId: run.conversationId,
            agentId: def.id,
            sessionId: createTurnSessionId,
            stablePromptHash: currentStableHash,
            model: safeModel ?? null,
            cwd: effectiveCwd,
            lastMessageId: run.assistantMessageId ?? null,
          });
          return;
        }
        if (agentResumeCtx.isResuming && agentResumeCtx.resumeSessionId) {
          // Advance the resume identity guard after a successful resume turn:
          // the conversation grew by this turn, so the cursor must move to the
          // new max position (otherwise the next turn sees `cursor + 4` and
          // falsely reseeds). model/cwd are unchanged (they matched on resume);
          // refresh the stable hash to what the session now holds.
          upsertAgentSession(db, {
            conversationId: run.conversationId,
            agentId: def.id,
            sessionId: agentResumeCtx.resumeSessionId,
            stablePromptHash: currentStableHash,
            model: safeModel ?? null,
            cwd: effectiveCwd,
            lastMessageId: run.assistantMessageId ?? null,
          });
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
    // Grace before the inactivity watchdog escalates a stalled child from
    // SIGTERM to SIGKILL. Env-tunable like its OD_CHAT_RUN_* cancel-grace
    // siblings so the escalation path can be exercised deterministically.
    const inactivityKillGraceMs = (() => {
      const raw = Number(process.env.OD_CHAT_RUN_INACTIVITY_KILL_GRACE_MS);
      return Number.isFinite(raw) && raw > 0 ? raw : 3_000;
    })();
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
      // Capture THIS attempt's child and its process group. A same-run retry
      // can swap `run.child` to a fresh child within the grace window; these
      // timers must escalate the stalled child they were scheduled for, never
      // whatever now occupies `run.child` — otherwise the healthy retry gets
      // killed and this stalled child is left unreaped. See runs.ts
      // `signalChildProcess`.
      const targetChild = child;
      const targetProcessGroupId = run.processGroupId;
      forcedChildShutdownTimers = [
        setTimeout(() => {
          design.runs.signalChildProcess(targetChild, targetProcessGroupId, 'SIGTERM');
        }, inactivityKillGraceMs),
        setTimeout(() => {
          design.runs.signalChildProcess(targetChild, targetProcessGroupId, 'SIGKILL');
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
            { retryable: logFailure.retryable },
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
        ...(byokOpenCodeProvider ? byokOpenCodeProvider.env : {}),
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
          ? { [isMiMoContent ? 'MIMOCODE_CONFIG_CONTENT' : 'OPENCODE_CONFIG_CONTENT']: opencodeConfigContent }
          : {}),
      }, agentLaunch);
      spawnedAgentEnv = env;
      const invocation = createCommandInvocation({
        command: agentLaunch.launchPath,
        args,
        env,
      });
      lifecycle.mark('launch_preflight_end');
      lifecycle.mark('process_spawn_start');
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
      lifecycle.mark('process_spawned');
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

    // ---- Memory: assistant-reply capture for LLM extraction --------------
    // Hand the extractor the guarded, rendered reply (`memoryReplyText`, fed
    // through `send()` from either the `agent` text_delta or the `stdout`
    // channel), NOT the child's raw stdout. For stream-json agents (Claude Code)
    // raw stdout is JSONL transport — system:init, stream_event thinking deltas,
    // hook_started/hook_response frames — none of which is the reply; mining it
    // produced empty extractions that, near-identical across a build's re-fires,
    // caused the same turn to be re-analyzed dozens of times.
    child.on('close', () => {
      const userMsg = typeof message === 'string' ? message : '';
      // Forward the chat agent id so memory-llm.pickProvider can
      // constrain its auto-pick to the chat protocol's family — keeps
      // a Claude Code (anthropic) chat from triggering OpenAI/gpt-4o-
      // mini extraction in the background just because the user has
      // an OpenAI key parked in media-config.
      const memoryOptions = {
        projectRoot: PROJECT_ROOT,
        chatAgentId: typeof agentId === 'string' ? agentId : null,
        chatModel: typeof safeModel === 'string' ? safeModel : null,
        // Scope the extractor's duplicate-turn de-dup to this conversation, so a
        // re-fired turn collapses but an identical (message, reply) in another
        // conversation is still examined.
        conversationId: run.conversationId ?? null,
      };
      void import('./memory-llm.js')
        .then(({ extractWithLLM, distillAnnotationsToMemory }) => {
          // Read the reply HERE, in the post-import microtask, not in the
          // synchronous close handler: the Claude stream flush is a later
          // 'close' listener, so deferring the read lets flush() emit the reply's
          // final buffered frame first and a reply that ends without a trailing
          // newline isn't truncated.
          const captured = memoryReplyText;
          const generalPass = extractWithLLM(
            RUNTIME_DATA_DIR,
            {
              userMessage: userMsg,
              assistantMessage: captured,
            },
            memoryOptions,
          );
          // Auto-distill any inline preview feedback (comments / highlights /
          // drawn marks) from this turn into durable feedback + rule memory.
          // This closes the "interaction → memory" loop automatically: the
          // agent no longer has to propose a rule and the user no longer has
          // to click Keep — a review turn that carried annotations mines
          // itself in the background and writes straight to the store.
          const annotationPass =
            safeCommentAttachments.length > 0
              ? distillAnnotationsToMemory(
                  RUNTIME_DATA_DIR,
                  {
                    annotations: safeCommentAttachments,
                    userMessage: userMsg,
                    assistantMessage: captured,
                  },
                  memoryOptions,
                )
              : Promise.resolve([]);
          return Promise.allSettled([generalPass, annotationPass]);
        })
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
    // visible content or a deliverable. Only the streams routed through
    // `sendAgentEvent` contribute to this flag; ACP sessions and plain stdout
    // streams are covered by their own success/failure paths and the
    // empty-output guard below skips them via `trackingSubstantiveOutput`.
    let agentProducedOutput = false;
    let trackingSubstantiveOutput = false;
    // Event types that count as "the agent actually produced a response or a
    // deliverable." Lifecycle markers (`status`), meter readings (`usage`),
    // reasoning deltas, and tool activity deliberately do NOT count: a run can
    // think/read/call tools and still terminate before returning text/artifacts
    // to the user. Treat that as empty output instead of a silent success
    // (issues #691, #4814).
    const SUBSTANTIVE_AGENT_EVENT_TYPES = new Set([
      'text_delta',
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
      lifecycle.mark('first_token', timestamp);
      lifecycle.mark('first_visible_output', timestamp);
    };
    // Subsegment markers inside `processSpawnedAt -> firstTokenAt` (#3408 §4).
    // `cliReadyAt` is the first well-formed adapter output and is stamped for
    // every runtime family from its own decode choke point: first JSONL line
    // (claude-stream-json), first decoded stream event (json-event-stream /
    // qoder / pi-rpc), first non-empty stdout chunk (plain), or first ACP
    // JSON-RPC message (acp-json-rpc). `sessionInitDoneAt` is only observable
    // for ACP (the resume/`session/new` ack); for stream/plain families that
    // gap is folded into `spawn_to_first_token_remainder_ms` rather than
    // anchored to a fabricated marker. Both are first-write-wins like
    // `firstTokenAt` so a later chunk cannot move an already-stamped boundary.
    const noteCliReadyAt = (timestamp = Date.now()) => {
      if (run.analyticsTelemetry?.cliReadyAt) return;
      run.analyticsTelemetry = {
        ...(run.analyticsTelemetry ?? {}),
        cliReadyAt: timestamp,
      };
    };
    const noteSessionInitDoneAt = (timestamp = Date.now()) => {
      if (run.analyticsTelemetry?.sessionInitDoneAt) return;
      run.analyticsTelemetry = {
        ...(run.analyticsTelemetry ?? {}),
        sessionInitDoneAt: timestamp,
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
    const visibleStdoutControlStripper = new TerminalControlSequenceStripper();
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

    // Per-run tool-loop guard. Agents sometimes fixate on a failing tool call
    // and grind through dozens of identical attempts (e.g. re-running an Edit
    // whose `old_string` never matches, or a shell assertion against an element
    // that does not exist). Unlike the BYOK proxy path — bounded by
    // MAX_BYOK_TOOL_LOOPS — the autonomous chat agents had no such bound. This
    // guard observes the normalized tool_use/tool_result events EVERY agent
    // path emits, so one instance covers Claude, Codex/OpenCode, Copilot, ACP,
    // … It emits a one-shot `tool_loop` warning, then (in halt mode) terminates
    // the run at a hard ceiling. Mode via OD_TOOL_LOOP_GUARD (halt|warn|off).
    const toolLoopGuard = createToolLoopGuard({ mode: resolveToolLoopMode() });
    let toolLoopAbortFired = false;

    // Idempotent — both agent-event paths (sendAgentEvent, the Claude
    // stream-json callback) can route a halt verdict here.
    function abortForToolLoop(verdict: ToolLoopVerdict) {
      if (toolLoopAbortFired) return;
      toolLoopAbortFired = true;
      send(
        'error',
        createSseErrorPayload(
          'TOOL_LOOP_DETECTED',
          `Run terminated: the agent repeated a failing ${verdict.toolName} call ` +
            `${verdict.count}× without progress (\`${verdict.signature}\`). Re-check the ` +
            'actual target — the file, the element, the command — before retrying ' +
            'instead of resubmitting the same turn.',
          { retryable: true },
        ),
      );
      if (acpSession?.abort) {
        try {
          acpSession.abort();
        } catch {
          // ignore — best-effort
        }
      }
      // Route through signalChild (not a bare child.kill) so the halt escalates
      // to the whole process group when one exists, matching abortForRoleMarker,
      // cancel, and the inactivity watchdog. A bare child.kill leaves Bash/build
      // grandchildren alive to keep mutating the workspace until the forced
      // shutdown fires — exactly the loop class this guard is meant to stop.
      if (child && !child.killed) design.runs.signalChild(run, 'SIGTERM');
      scheduleForcedChildShutdown();
    }

    // Feed a normalized agent event into the loop guard and act on a verdict.
    // Safe to call for every event; non-tool events are ignored. Emit the
    // `tool_loop` warning to the UI/CLI, and on a halt verdict tear the run
    // down so it cannot keep grinding.
    function observeToolEventForLoop(ev: any) {
      if (!ev || typeof ev !== 'object') return;
      if (ev.type === 'tool_use' && typeof ev.id === 'string') {
        toolLoopGuard.observeToolUse(ev.id, typeof ev.name === 'string' ? ev.name : 'tool', ev.input);
        return;
      }
      if (ev.type === 'tool_result' && typeof ev.toolUseId === 'string') {
        const verdict = toolLoopGuard.observeToolResult(
          ev.toolUseId,
          Boolean(ev.isError),
          typeof ev.content === 'string' ? ev.content : '',
        );
        if (verdict) {
          send('agent', verdict);
          if (verdict.action === 'halt') abortForToolLoop(verdict);
        }
      }
    }

    // Single choke point for emitting an agent event to the client. EVERY
    // stream handler (sendAgentEvent, the Claude callback, Copilot, ACP, …)
    // emits through here, never via a bare send('agent', …), so the tool-loop
    // guard sees every runtime's tool activity and no handler can drift out of
    // coverage. observe runs AFTER the send so a `tool_loop` warning/halt
    // follows the result that triggered it in the stream. (PR #3375 review:
    // Copilot and ACP bypassed the guard by calling send('agent', …) directly.)
    function emitAgentEvent(ev: any) {
      send('agent', ev);
      observeToolEventForLoop(ev);
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
      // First well-formed decoded stream event = CLI ready for the
      // json-event-stream / qoder / pi-rpc families (#3408 §4 marker).
      noteCliReadyAt();
      // Capture-style resume: codex reports its own thread id on the
      // `thread.started` status event. Persist the most recent non-empty id we
      // see so the create-turn store (and the resumable-failure store) use the
      // CLI's real session handle, not the unused daemon-minted `newSessionId`.
      if (
        agentCapturesSessionId &&
        ev?.type === 'status' &&
        typeof ev.sessionId === 'string' &&
        ev.sessionId.length > 0
      ) {
        capturedSessionId = ev.sessionId;
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
      emitAgentEvent(ev);
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
        // First parsed claude-stream-json event = CLI ready (#3408 §4); the
        // init/system line arrives well before the model's first token.
        noteCliReadyAt();
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
            emitAgentEvent({ ...ev, delta: visibleDelta });
          }
          return;
        }
        noteFirstTokenFromAgentEvent(ev);
        emitAgentEvent(ev);
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
        emitAgentEvent(ev);
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
      const acpStageTimeoutMs = resolveAcpStageTimeoutMs(def.inactivityTimeoutMs);
      acpSession = attachAcpSession({
        child,
        prompt: composed,
        cwd: effectiveCwd,
        model: safeModel,
        imagePaths: def.supportsImagePaths ? amrStagedImages : [],
        mcpServers,
        envFormat: def.acpMcpEnvFormat ?? 'array',
        executionProfile,
        ...(def.id === 'amr' ? { modelUnavailableErrorCode: 'AMR_MODEL_UNAVAILABLE' } : {}),
        // Resume the prior upstream session (drives `session/load`) when the
        // resume-identity guard says it is safe; otherwise a fresh session/new.
        ...(def.resumesSessionViaAcpLoad === true && agentResumeCtx.isResuming && agentResumeCtx.resumeSessionId
          ? { resumeSessionId: agentResumeCtx.resumeSessionId }
          : {}),
        onCliReady: () => noteCliReadyAt(),
        onSessionInit: () => noteSessionInitDoneAt(),
        send: (event, data) => {
          if (event === 'agent') {
            lastAgentEventPhase = summarizeAgentEventForInactivity(data);
          }
          noteAgentActivity();
          if (event === 'error') flushVisibleAgentStderr();
          if (def.id === 'amr' && event === 'error') {
            const failure = classifyAmrAccountFailureSignal({
              details: data?.error?.details,
              message: data?.message,
              errorMessage: data?.error?.message,
              errorCode: data?.error?.code,
              stdoutTail: agentStdoutTail,
              stderrTail: agentStderrTail,
            });
            if (failure) {
              sendAmrAccountFailure(failure);
              return;
            }
          }
          // Hold back the `resume_failed` error so the same-turn reseed stays
          // transparent. When this run is resuming an upstream session via
          // `session/load` and the agent reports that session is gone, the ACP
          // bridge has already called `fail()` -> `send('error')` for the failed
          // load. The child-close handler then clears the stale handle and
          // re-runs this turn fresh (the resume-target-missing block below), so
          // forwarding this error would flash an execution failure — and trip
          // clients that treat an SSE `error` as terminal — a beat before the
          // invisible recovery. Suppress it and leave a diagnostic instead; the
          // close handler is the sole authority on whether this turn ends in an
          // error or a transparent reseed. The `resumeAutoReseeded` guard lets a
          // second resume failure in one run fall through to the explicit
          // "resend your message" affordance the close handler emits.
          if (
            event === 'error' &&
            def.resumesSessionViaAcpLoad === true &&
            agentResumeCtx.isResuming &&
            agentResumeCtx.resumeSessionId &&
            !run.resumeAutoReseeded &&
            isAgentResumeFailure(def.id, agentStderrTail, agentStdoutTail)
          ) {
            design.runs.emit(run, 'diagnostic', {
              type: 'agent_resume_failed_suppressed',
              agent_id: def.id,
              reason: 'resume_failed',
              previous_session_id: agentResumeCtx.resumeSessionId ?? null,
            });
            return;
          }
          if (event === 'agent' && data?.type === 'text_delta' && typeof data.delta === 'string') {
            if (emitTitleFilteredGuardedTextDelta(data.delta)) {
              noteFirstTokenAt();
            }
            return;
          }
          if (event === 'agent') {
            noteFirstTokenFromAgentEvent(data);
            emitAgentEvent(data);
          } else {
            send(event, data);
          }
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
        // First non-empty stdout chunk = CLI ready for the plain family
        // (#3408 §4 marker). A plain adapter has no structured preamble, so
        // this typically coincides with its first model output.
        if (text.length > 0) noteCliReadyAt();
        const strippedText = visibleStdoutControlStripper.write(text);
        const visibleText = titleMarkerStripper.strip(strippedText);
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
      // Resume-target-missing recovery runs BEFORE the generic fatal/stream-error
      // short-circuits. The signal arrives differently per adapter: codex reports
      // "no rollout found for thread id" as a stream `error` event, while AMR/vela
      // reports a structured `resume_failed` JSON-RPC error that the ACP bridge
      // turns into a FATAL. Either would otherwise be swallowed by the
      // `fatal_rpc_error` / `stream_error` paths below and leave the dead session
      // id stored — so every later turn would retry the same broken resume (#4275
      // class). Clearing the stale handle here lets the next turn start fresh +
      // re-seed the full transcript: one cold turn, never a broken conversation.
      if (
        !run.cancelRequested &&
        (def.resumesSessionViaCli === true || def.resumesSessionViaAcpLoad === true) &&
        agentResumeCtx.isResuming &&
        run.conversationId &&
        isAgentResumeFailure(def.id, agentStderrTail, agentStdoutTail)
      ) {
        // The resumed upstream session is gone (expired / pruned). Clear the dead
        // handle and TRANSPARENTLY re-run this same turn with a fresh session +
        // the full transcript rebuilt from the DB — exactly the pre-session-reuse
        // path. The user sees one (slightly slower) turn, never an error or a
        // "resend" prompt. Re-spawn reuses the same-run retry machinery; because
        // the session row is now cleared, the re-spawn resolves isResuming=false
        // (fresh session, full transcript), so it CANNOT resume-fail again — the
        // `resumeAutoReseeded` guard is belt-and-suspenders against any loop.
        clearAgentSession(db, run.conversationId, def.id);
        if (!run.resumeAutoReseeded) {
          run.resumeAutoReseeded = true;
          run.resumeAutoReseededFrom = agentResumeCtx.resumeSessionId ?? null;
          // Persisted to the per-run events.jsonl that the help → diagnostics
          // export bundles, so the whole resume → fail → auto-reseed chain is
          // visible in a support bundle without any user-facing signal.
          design.runs.emit(run, 'diagnostic', {
            type: 'agent_resume_auto_reseed',
            agent_id: def.id,
            reason: 'resume_failed',
            previous_session_id: agentResumeCtx.resumeSessionId ?? null,
            stale_session_cleared: true,
          });
          scheduleRetryRestart(0);
          return;
        }
        // Unreachable in practice (the reseed runs fresh); if a second resume
        // failure ever surfaces in one run, fall back to the explicit affordance.
        send('error', createSseErrorPayload(
          'AGENT_EXECUTION_FAILED',
          'The previous session could not be resumed (it may have expired). Resend your message to continue with a fresh session.',
          { retryable: true },
        ));
        return design.runs.finish(run, 'failed', code ?? 1, signal ?? null);
      }
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
          const amrFailure = classifyAmrAccountFailureSignal({
            stdoutTail: agentStdoutTail,
            stderrTail: agentStderrTail,
          });
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
        isPluginAuthoringRun(db, run, getSnapshot) &&
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
              { retryable: openCodeFailure.retryable },
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
        const strippedText = visibleStdoutControlStripper.write(chunk.text);
        const visibleText = titleMarkerStripper.strip(strippedText);
        if (visibleText) send('stdout', { chunk: visibleText });
      }
      const flushedControlText = visibleStdoutControlStripper.flush();
      const flushedTitleMarkerText =
        titleMarkerStripper.strip(flushedControlText) + titleMarkerStripper.flush();
      if (flushedTitleMarkerText) send('stdout', { chunk: flushedTitleMarkerText });
      if (
        status === 'succeeded' &&
        (def.streamFormat ?? 'plain') === 'plain' &&
        run.projectId
      ) {
        const plainStdout = plainStdoutFromRunEvents(run.events);
        if (plainStdout.includes('<artifact')) {
          try {
            const project = getProject(db, run.projectId);
            const persistedPlainArtifacts = await persistPlainStreamArtifacts({
              projectsRoot: PROJECTS_DIR,
              projectId: run.projectId,
              stdout: plainStdout,
              metadata: project?.metadata,
              writeProjectFile,
            });
            if (persistedPlainArtifacts.length > 0) {
              for (const artifact of persistedPlainArtifacts) {
                send('agent', {
                  type: 'artifact',
                  source: 'plain-stream',
                  name: artifact.name,
                  path: artifact.name,
                  identifier: artifact.identifier,
                  artifactType: artifact.artifactType,
                });
              }
              send('agent', {
                type: 'diagnostic',
                name: 'plain_stream_artifacts_persisted',
                source: 'daemon-run-finalize',
                fileCount: persistedPlainArtifacts.length,
                files: persistedPlainArtifacts.map((artifact) => artifact.name),
              });
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            const failureMessage = `Failed to persist plain-stream artifact(s): ${message}`;
            console.warn(`[plain-stream] failed to persist stdout artifact(s): ${message}`);
            send('agent', {
              type: 'diagnostic',
              name: 'plain_stream_artifacts_persist_failed',
              source: 'daemon-run-finalize',
              message,
            });
            send('error', createSseErrorPayload(
              'AGENT_EXECUTION_FAILED',
              failureMessage,
            ));
            return finishWithRetryDecision('failed', 1, null);
          }
        }
      }
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
            model: safeModel ?? null,
            cwd: effectiveCwd,
            lastMessageId: run.assistantMessageId ?? null,
          });
        }
      }
      // ACP session/load adapters (AMR/vela) report a durable upstream handle
      // from the ACP session; persist it (under the resume-identity guard) so
      // the next turn resumes via session/load. A missing handle clears the row
      // (so a fresh session is opened next turn), mirroring the capture-style
      // adapters.
      if (
        def.resumesSessionViaAcpLoad === true &&
        status === 'succeeded' &&
        acpSession &&
        typeof acpSession.getDurableSessionId === 'function'
      ) {
        persistCapturedAgentSession(db, {
          conversationId: run.conversationId,
          agentId: def.id,
          sessionId: acpSession.getDurableSessionId(),
          stablePromptHash: currentStableHash,
          model: safeModel ?? null,
          cwd: effectiveCwd,
          lastMessageId: run.assistantMessageId ?? null,
        });
      }
      if (status === 'succeeded') {
        try {
          await snapshotAiHtmlVersionsBeforeSuccess();
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const details = err instanceof AiHtmlVersionSnapshotError
            ? { failures: err.failures }
            : undefined;
          send('error', createSseErrorPayload(
            'HTML_VERSION_SNAPSHOT_FAILED',
            message,
            {
              retryable: false,
              ...(details ? { details } : {}),
            },
          ));
          design.runs.finish(run, 'failed', 1, signal);
          return;
        }
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
      lifecycle.mark('model_call_start');
      lifecycle.mark('stdin_write_start');
      const markStdinWriteEnd = (err?: Error | null) => {
        if (err) return;
        lifecycle.mark('stdin_write_end');
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
          child.stdin.write(`${userMessage}\n`, 'utf8', markStdinWriteEnd);
        } catch (err) {
          // Swallow EPIPE here for the same reason as the listener above —
          // a fast-exiting child has already routed its failure through
          // stderr / exit handlers.
          if (err && err.code !== 'EPIPE') throw err;
        }
        run.stdinOpen = true;
      } else {
        child.stdin.end(composed, 'utf8', markStdinWriteEnd);
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

  registerRunRoutes(app, {
    db,
    design,
    http: httpDeps,
    paths: { PROJECTS_DIR, RUNTIME_DATA_DIR },
    agents: { detectAgents, getAgentDef },
    chat: { startChatRun },
    lifecycle: { isDaemonShuttingDown: () => daemonShuttingDown },
    plugins: {
      connectorService,
      detectSkillPluginCandidateOnRunSuccess,
      firePipelineForRun,
      loadPluginRegistryView,
      renderPluginBriefTemplate,
    },
    telemetry: {
      reportRunCompletionTelemetryFallback,
      resolveRunProjectKindForAnalytics,
      runArtifactBaselines,
      runRetryEventsForAnalytics,
    },
    messages: {
      pinAssistantMessageOnRunCreate,
      reconcileAssistantMessageOnRunEnd,
    },
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
        const preparedProject = getProject(db, projectId);
        run.projectMetadata =
          preparedProject?.metadata && typeof preparedProject.metadata === 'object'
            ? preparedProject.metadata
            : null;
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
    plugins: {
      connectorService,
      detectSkillPluginCandidateOnRunSuccess,
      firePipelineForRun,
      loadPluginRegistryView,
      renderPluginBriefTemplate,
    },
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
    messages: {
      pinAssistantMessageOnRunCreate,
      reconcileAssistantMessageOnRunEnd,
    },
    agents: agentDeps,
    critique: critiqueDeps,
    openDesignPublicMetadata,
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
