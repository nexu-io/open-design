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
import { isTodoWriteToolName, stopReasonIsTruncation, todoItemsFromTodoWriteInput } from '@open-design/contracts';
import type {
  CollabCloudMemberDirectoryEntry,
  TeamProject,
  WorkspaceCollabContext,
} from '@open-design/contracts';
import {
  composeSystemPrompt,
  detectDeckIntentSignal,
  detectMediaIntentSignal,
  detectPlatformIntentSignal,
  extractUserAuthoredSignalText,
  renderConnectedExternalMcpDirective,
  resolveExclusiveSurface,
} from './prompts/system.js';
import {
  computeStableSectionHashes,
  serializeStableSections,
  type StableSectionHashes,
} from './prompts/stable-sections.js';
import { emittedRenderableQuestionForm } from './question-form-detect.js';
import { runHadFailedDesignSystemWrapper } from './runtimes/run-artifacts.js';
import { resolveProjectRoot } from './project-root.js';
import { OPEN_DESIGN_PLUGIN_ID } from './mcp-observability.js';
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
} from './browser/index.js';
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
  resolveEffectiveDesignSystemSelection,
  resolveResearchCommandContract,
  resolveSafeProjectAttachments,
  resolveSafePromptImagePaths,
  selectPromptImagePaths,
} from './runtimes/chat-prompt-inputs.js';
import {
  writePromptAndEndStdin,
  applyClaudeStreamJsonRunBookkeeping,
  assertValidRuntimeDefFirstOutputTimeoutMs,
  assertValidRuntimeDefInactivityTimeoutMs,
  bufferedAntigravityGeminiFirstTokenAt,
  classifyChatRunCloseStatus,
  looksLikeGeminiJsonEventStream,
  resolveAcpStageTimeoutMs,
  resolveActiveInactivityTimeoutMs,
  resolveChatRunArtifactQuietPeriodMs,
  resolveChatRunFirstOutputTimeoutMs,
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
  flushRunMessageEvents,
  persistRunFailureClassification,
  pinAssistantMessageOnRunCreate,
} from './runtimes/chat-run-messages.js';
import {
  createRunSideEffectLedger,
  foldEventIntoRunSideEffectLedger,
  resolveRunProjectKindForAnalytics,
  retryFinalResultForRunStatus,
  runArtifactCountForRun,
  runDesignSystemCreatedForRun,
  runPreviewModuleCountForRun,
  runRetryEventsForAnalytics,
  runSideEffectsForRun,
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
  resolveEffectiveDesignSystemSelection,
  resolveResearchCommandContract,
  resolveSafeProjectAttachments,
  resolveSafePromptImagePaths,
  selectPromptImagePaths,
} from './runtimes/chat-prompt-inputs.js';
export {
  applyClaudeStreamJsonRunBookkeeping,
  assertValidRuntimeDefFirstOutputTimeoutMs,
  assertValidRuntimeDefInactivityTimeoutMs,
  bufferedAntigravityGeminiFirstTokenAt,
  classifyChatRunCloseStatus,
  looksLikeGeminiJsonEventStream,
  resolveAcpStageTimeoutMs,
  resolveActiveInactivityTimeoutMs,
  resolveChatRunArtifactQuietPeriodMs,
  resolveChatRunFirstOutputTimeoutMs,
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
  isKnownReasoningEffort,
  isKnownServiceTier,
  openDesignAmrRunAttempt,
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
  resolveModelForServiceTier,
} from './runtimes/models.js';
import { loadMmdRouteLaunchEnv } from './runtimes/mmd-routes.js';
import { preflightCodexDefaultModel } from './runtimes/codex-model-preflight.js';
import { preparePromptFileForAgent } from './runtimes/prompt-file.js';
import { TerminalControlSequenceStripper } from './runtimes/terminal-control.js';
import {
  buildOpenCodeByokProviderConfig,
  BYOK_OPENCODE_PROVIDER_REQUIRED_MESSAGE,
} from './runtimes/byok-opencode.js';
import {
  extractPlainStreamArtifacts,
  persistPlainStreamArtifactList,
  plainStdoutFromRunEvents,
} from './runtimes/plain-stream.js';
import {
  readVelaLoginStatus,
  resolveAmrProfile,
} from './integrations/vela.js';
import { projectResourceIdFor } from './integrations/vela-team-projects.js';
import {
  getTeamProjectMaterialization,
  latestTeamProjectMaterializationVersion,
  materializePulledTeamMirror,
  teamProjectMaterializationMatches,
  teamProjectMaterializationSupersedes,
} from './collab/team-mirror-materializer.js';
import { recoverAuthorizedTeamProjectPromotions } from './collab/team-mirror-promotion.js';
import {
  amrAccountFailureDetails,
  classifyAmrAccountFailureSignal,
} from './integrations/vela-errors.js';
import { amrModelLoadingCache } from './runtimes/amr-model-cache.js';
import {
  fetchVelaPresetModels,
  fetchVelaRemoteModelsWithRetry,
} from './runtimes/defs/amr.js';
import { migrateLegacyDataDirSync } from './migration/index.js';
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
import {
  activateWorkspaceTeamSkillIfStillShared,
  resolveAndActivateWorkspaceTeamSkill,
  skillIdFromWorkspaceTeamBinding,
  workspaceTeamSkillBindingActivationFence,
  workspaceTeamSkillBindingResourceId,
} from './skills/workspace-team-binding.js';
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
  backfillDesignSystemWorkspaceResources,
  buildUserDesignSystemArchive,
  createUserDesignSystem,
  deleteUserDesignSystem,
  digestDesignSystemContext,
  isDesignTokenChannelEnabled,
  isTeamSyncedUserDesignSystem,
  LEGACY_DESIGN_SYSTEM_ARTIFACTS,
  linkUserDesignSystemProject,
  listDesignSystems,
  listUserDesignSystemFiles,
  listUserDesignSystemRevisions,
  readDesignSystem,
  readDesignSystemPackageInfo,
  readDesignSystemStaticFile,
  readUserDesignSystemFile,
  readUserDesignSystemFileBytes,
  resolveDesignSystemAssets,
  resolveDesignSystemRuntimePromptContext,
  stripPrefixAndValidateId,
  syncUserDesignSystemAssetsFromFiles,
  updateUserDesignSystem,
  updateUserDesignSystemRevisionStatus,
  type UserDesignSystemInput,
} from './design-systems/index.js';
import {
  createWorkspaceOwnedDesignSystem as persistWorkspaceOwnedDesignSystem,
  deleteWorkspaceOwnedDesignSystem as removeWorkspaceOwnedDesignSystem,
} from './design-systems/workspace-owned-create.js';
import { createDesignSystemGenerationJobStore } from './design-systems/generation-jobs.js';
import {
  pinRunDesignSystemScope,
  resolvePinnedRunDesignSystemScope,
} from './design-systems/run-scope.js';
import { createDesignSystemServerServices } from './design-systems/server-services.js';
import {
  designSystemIdFromWorkspaceTeamBinding,
  designSystemLogicalResourceId,
  workspaceTeamDesignSystemBindingResourceId,
} from './design-systems/workspace-team-binding.js';
import { ownedDesignSystemSourceIsReady } from './design-systems/team-owner-materialization.js';
import {
  createDesignSystemBackingProjectPreparer,
  createLinkedProjectTeamResourceShareService,
} from './design-systems/team-project-share.js';
import { prepareDesignTokenContractRebuild } from './design-systems/token-contract-rebuild.js';
import { registerBrandRoutes } from './brand-routes.js';
import {
  authorizeCreatedProjectWorkspace,
  bindCreatedProjectToWorkspace,
  createCreatedProjectWorkspaceResolver,
  sendCreatedProjectWorkspaceError,
} from './collab/created-project-workspace.js';
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
  resolveLocalPluginBySource,
  restoreProjectSnapshotLink,
  resolvePluginSnapshot,
  runPipelineForRun,
  isSafePluginId,
  runStageWithRegistry,
  startSnapshotGc,
  uninstallPlugin,
} from './plugins/index.js';
import {
  activateWorkspaceTeamPluginIfStillShared,
  pluginIdFromWorkspaceTeamPluginBinding,
  resolveAndActivateWorkspaceTeamPlugin,
  resolvePluginFolder,
  resolveWorkspaceTeamPluginWithBindingGate,
  workspaceTeamPluginBindingActivationFence,
  workspaceTeamPluginBindingAllowsRead,
  workspaceTeamPluginBindingResourceId,
} from './plugins/registry.js';
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
import { runAutoExtractionCleanup } from './memory-cleanup.js';
import { attachAcpSession } from './agent-protocol/index.js';
import { attachPiRpcSession } from './agent-protocol/index.js';
import { attachDshProfileSession } from './agent-protocol/index.js';
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
  normalizeDeepSeekHarnessFailure,
} from './runtimes/auth.js';
import { readOpenCodeServiceFailure } from './runtimes/opencode-log.js';
import { createAgentStderrVisibilityFilter } from './amr-stderr-filter.js';
import { createQoderStreamHandler } from './runtimes/qoder-stream.js';
import { subscribe as subscribeFileEvents } from './project-watchers.js';
import { importFigmaFromBytes } from './figma/figma-import.js';
import { renderDesignSystemPreview } from './design-systems/preview.js';
import { renderDesignSystemShowcase } from './design-systems/showcase.js';
import { createChatRunService } from './runtimes/runs.js';
import { runtimeResumesSessionById } from './runtimes/types.js';
import {
  createRunLifecycleTracer,
  runLifecycleMarkersForStreamEvent,
} from './run-lifecycle-tracer.js';
import { deriveRunErrorCode, runResultFromStatus } from './run-result.js';
import { classifyRunFailure, isResumableFailure } from './run-failure-classification.js';
import {
  POST_TOOL_RESUME_CONTINUATION_PROMPT,
  decidePostToolResumeRecovery,
  decideSafeRunRetry,
} from './run-retry-policy.js';
import {
  amrUserIdForRunAnalytics,
  scanRunEventsForUsageAnalytics,
} from './run-analytics-observability.js';
import {
  createRunArtifactBaselines,
  diffRunArtifacts,
  snapshotProjectArtifacts,
  snapshotProjectArtifactsAsync,
} from './run-artifact-fs.js';
import {
  AiHtmlVersionSnapshotError,
  artifactOriginForRun,
  snapshotAiHtmlVersionsForRun,
} from './run-html-version-snapshots.js';
import { reportRunCompletedFromDaemon } from './langfuse-bridge.js';
import { reconcileDurableRunTerminals } from './runtimes/run-terminal-reconciliation.js';
import { buildPromptStackTelemetry } from './prompt-telemetry.js';
import { newInsertId, readAnalyticsContext, type AnalyticsService } from './analytics.js';
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
import { importClaudeDesignZip } from './design/index.js';
import {
  defaultBaseUrlForFinalizeProtocol,
  finalizeDesignPackage,
  FinalizePackageLockedError,
  FinalizeUpstreamError,
  isFinalizeProviderProtocol,
} from './design/index.js';
import { buildDocumentPreview } from './document-preview.js';
import { lintArtifact, renderFindingsForAgent } from './lint-artifact.js';
import { loadCraftSections, resolveCraftRequirements } from './craft.js';
import { skillCwdAliasSegment, stageActiveSkill } from './cwd-aliases.js';
import { buildDesktopArtifactExportInput, buildDesktopPdfExportInput } from './pdf-export.js';
import { generateMedia } from './media/index.js';
import { listElevenLabsVoiceOptions } from './integrations/elevenlabs-voices.js';
import { searchResearch, ResearchError } from './research/index.js';
import { openBrowser } from './browser/index.js';
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
import {
  agentCliEnvForAgent,
  readAppConfig,
  readAppConfigSync,
  readPluginEnvKnobs,
  writeAppConfig,
} from './app-config.js';
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
  createProjectArchiveStream,
  createBatchArchiveStream,
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
  stageProjectDirsForDelete,
  resolveProjectFilePath,
  writeProjectFile,
  reconcileHtmlArtifactManifest,
} from './projects.js';
import { validateArtifactManifestInput } from './artifacts/manifest.js';
import { ArtifactPublicationBlockedError } from './artifacts/publication-guard.js';
import {
  appendMessageStatusEvent,
  confirmPreviewCommentPinSeq,
  deleteConversation,
  deletePreviewComment,
  deleteProject as dbDeleteProject,
  deleteWorkspaceProject,
  deleteWorkspaceResourceByResourceId,
  deleteTemplate,
  getConversation,
  getDeployment,
  getDeploymentById,
  getMessage,
  getMessageTelemetryFinalizationState,
  getPreviewComment,
  getProjectCommentAnchorConversationId,
  getProjectPreviewComment,
  getProject,
  countWorkspaceProjectRefs,
  findTeamWorkspaceIdForProject,
  getWorkspaceProject,
  getWorkspaceProjectByProjectId,
  listWorkspaceProjectBindings,
  getTemplate,
  ensureWorkspaceProject,
  ensureTeamProjectCommentConversations,
  ensureWorkspaceResource,
  getWorkspaceResource,
  getWorkspaceResourceByResourceId,
  insertConversation,
  insertProject,
  insertRoutine,
  insertRoutineRun,
  insertScheduledRoutineRun,
  insertTemplate,
  latchConversationIntentSignals,
  findTemplateByNameAndProject,
  updateTemplate,
  listProjectsAwaitingInput,
  listConversations,
  listDeployments,
  listLatestProjectRunStatuses,
  listMessages,
  listPreviewComments,
  listProjectPreviewComments,
  listProjects,
  listUnboundProjects,
  listTeamWorkspaceProjectShares,
  listTeamWorkspaceResourceWorkspaceIds,
  listWorkspaceProjects,
  listWorkspaceResources,
  listRoutines,
  listRoutineRuns,
  listTabs,
  listTemplates,
  getLatestRoutineRun,
  getRoutine,
  mergeSyncedPreviewComment,
  normalizeConversationSessionMode,
  deleteRoutine as dbDeleteRoutine,
  openDatabase,
  reorderPreviewComment,
  repairTeamProjectCommentAnchorConversations,
  setTabs,
  SYNC_KEEPS_UPDATED_AT,
  updateConversation,
  updatePreviewCommentAnchor,
  updatePreviewCommentStatus,
  updateProject,
  updateWorkspaceProject,
  setWorkspaceProjectMetadataRefreshPending,
  updateWorkspaceResource,
  rebindWorkspaceProject,
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
  initialNativeSessionRecoveryMetadata,
  markNativeSessionAutoReseeded,
  markNativeSessionCaptured,
} from './native-session-recovery.js';
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
import { registerAttributionRoutes } from './routes/attribution.js';
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
import { registerProjectRoutes, registerProjectArtifactRoutes, registerProjectFileRoutes, registerProjectUploadRoutes, createEnforceWorkspaceProjectMutation } from './routes/project/index.js';
import { registerVelaRoutes } from './routes/vela.js';
import { registerFinalizeRoutes, registerImportRoutes, registerProjectExportRoutes } from './import-export-routes.js';
import { registerHandoffRoutes } from './routes/handoff.js';
import { EmptyTranscriptError, synthesizeHandoffPrompt } from './design/index.js';
import { TranscriptExportLockedError } from './transcript-export.js';
import { registerChatRoutes } from './routes/chat.js';
import { registerRunRoutes } from './routes/runs.js';
import { registerTerminalRoutes } from './routes/terminal.js';
import { createTerminalService } from './terminals.js';
import { registerSocialShareRoutes } from './routes/social-share.js';
import { registerOpenDesignPublicMetadataRoutes } from './routes/open-design-public-metadata.js';
import { registerWhatsNewRoutes } from './routes/whats-new.js';
import { registerMemoryRoutes } from './routes/memory.js';
import {
  createCollabPresenceCloudClient,
  registerCollabPresenceRoutes,
} from './routes/collab-presence.js';
import {
  registerCollabSyncRoutes,
  type TeamMirrorPullScope,
} from './routes/collab-sync.js';
import {
  emitWorkspaceEventToAllScopes,
  emitWorkspaceEventToScope,
  registerCollabContextRoutes,
} from './routes/collab-context.js';
import { registerTeamResourceRoutes } from './routes/team-resources.js';
import { registerTeamResourceShareRoutes } from './routes/team-resource-share.js';
import { createCollabRuntime } from './collab/runtime.js';
import {
  createActiveWorkspaceSelectionStore,
} from './collab/active-workspace-selection.js';
import {
  headerValue,
  isWorkspaceResourceLocked,
  resolveOptionalWorkspaceRequestAuthority,
  workspaceResourceContext,
  workspaceResourceContextFromRequest,
} from './collab/workspace-resource-mutation.js';
import { createAuthorizeProjectRequest } from './collab/project-request-authority.js';
import { withLastKnownWorkspaceContext } from './collab/workspace-context.js';
import {
  createWorkspaceTypeRegistry,
  impossibleTeamShareRows,
  projectCollabScope,
} from './collab/team-share-scope.js';
import { resolveWorkspaceScope } from './collab/workspace-scope.js';
import {
  AmrWorkspaceScopeRequiredError,
  openDesignAmrTraceEnvForRun,
  pinRunWorkspaceScopeForProject,
} from './runtimes/project-amr-trace-env.js';
import {
  createWorkspaceDirectoryAuthorityBroker,
  createWorkspaceContextProviderFromEnv,
  fetchVelaWorkspaceDirectory,
  resolveVelaWorkspaceHubEventsEndpoint,
  velaWorkspaceDirectoryIdentity,
  workspaceContextFromDirectoryItem,
} from './collab/vela-workspace-context.js';
import { verifyWorkspaceRequestContext } from './collab/request-workspace-context.js';
import {
  createWorkspaceBillingRuntimeCoordinator,
  shouldEmitWorkspaceBillingRuntimeNudge,
  WorkspaceBillingAccessRevokedError,
} from './collab/workspace-billing-runtime.js';
import {
  AUTHORITATIVE_PROJECT_PRESENCE_CAPABILITY,
  startHubEventsSubscriber,
  WORKSPACE_DIRECTORY_EVENTS_CAPABILITY,
} from './collab/hub-events-subscriber.js';
import {
  createWorkspaceAuthorityHealthCoordinator,
  resolveWorkspaceAuthorityCacheMode,
} from './collab/workspace-authority-health.js';
import {
  recordWorkspaceAuthorityDecision,
  recordWorkspaceAuthorityInvalidation,
  recordWorkspaceAuthorityRealtimeTransition,
  recordWorkspaceAuthorityRevocationClear,
  recordWorkspaceAuthoritySuppressedRequest,
} from './metrics/workspace-authority.js';
import {
  createWorkspaceHubSubscriptionManager,
  type WorkspaceHubSubscriptionManager,
} from './collab/workspace-hub-subscriptions.js';
import {
  activeTeamWorkspaceIdentity,
  createProactiveContentPull,
  type ProactiveContentPullTarget,
} from './collab/proactive-content-pull.js';
import {
  backgroundPullMaxEntriesFromEnv,
  createBackgroundPullSizeGuard,
} from './collab/background-pull-size-guard.js';
import {
  inspectAuthorizedTeamProjectPull,
} from './collab/authorized-team-project-pull.js';
import { createProjectContentTransferStateStore } from './collab/project-content-transfer-state.js';
import {
  emitSharedProjectPullTiming,
  sharedProjectPullProfileEnabled,
} from './collab/pull-profile.js';
import { createSyncDigestReader } from './collab/sync-digest.js';
import {
  createCollabSyncSnapshotStore,
  parseMemberDirectorySnapshot,
  parseTeamProjectSnapshot,
} from './collab/sync-snapshot-store.js';
import { createPersistentSyncCache } from './collab/persistent-sync-cache.js';
import { createSwrCache } from './collab/swr-cache.js';
import {
  COLLAB_VELA_FANOUT_CONCURRENCY,
  ConcurrencyGate,
} from './collab/concurrency-gate.js';
import {
  createTeamResourceListCache,
  invalidateTeamResourceListingCaches,
} from './collab/team-resource-list-cache.js';
import { createVelaResourcePullBatcher } from './collab/vela-cli-resource-pull-batcher.js';
import {
  createRememberedTeamResourceScopes,
  type RememberedTeamResourceScopeLease,
} from './collab/remembered-team-resource-scopes.js';
import { readVelaControlApiContext } from './integrations/vela.js';
import {
  fetchVelaBillingSummary,
  fetchVelaWorkspaceBillingProjection,
  isVelaWorkspaceAuthorizationError,
} from './integrations/vela-billing.js';
import { createAccountBillingSummaryCache } from './collab/account-billing-summary-cache.js';
import { createEventRefreshCoordinator } from './collab/event-refresh-coordinator.js';
import { createWorkspaceExactAuthorityCache } from './collab/workspace-exact-authority-cache.js';
import { createCollabPublishWatcher } from './collab/collab-publish-watcher.js';
import {
  isUnmaterializedSharedPlaceholder,
  SHARED_PROJECT_PLACEHOLDER_METADATA_KEY,
} from './collab/shared-project-placeholder.js';
import { recoverPersistedTeamShareOwnership } from './collab/persisted-team-share.js';
import { resolveProjectShareDir } from './collab/project-share-dir.js';
import { createTeamProjectsLister } from './collab/team-projects.js';
import {
  createTeamResourceShareService,
  teamResourceRequestScopeFromContext,
  teamResourceRequestScopeForWorkspaceId,
  unshareIfCurrentlyShared,
  type TeamResourceRequestScope,
  type TeamResourceShareRecord,
  type TeamResourceSharedReadOptions,
  type TeamResourceShareService,
} from './collab/team-resource-share.js';
import {
  materializeWorkspaceScopedTeamResource,
  readTeamResourceMaterialization,
  teamResourceMaterializationDir,
  teamResourceSourceKey,
  teamResourceWorkspaceRoot,
} from './collab/team-resource-materialization.js';
import { createTeamResourceVersionStore } from './collab/team-resource-version-store.js';
import {
  contextToResourceHubPrincipal,
  type ResourceHubPrincipal,
} from './collab/resource-principal.js';
import { createCollabCloudClientFromEnv } from './integrations/collab-cloud.js';
import { createCollabCloudService } from './collab/collab-cloud-service.js';
import {
  commentRelayLocalBindingMatches,
  createCommentRelayOutboxStore,
} from './collab/comment-relay-outbox.js';
import { createWorkspaceInvalidationPoller } from './collab/workspace-invalidation-poller.js';
import { createWorkspaceExactContextCache } from './collab/workspace-exact-context-cache.js';
import {
  handleHubProjectMetadataChanged,
  handleHubTeamProjectsChanged,
  handlePolledWorkspaceInvalidation,
  reconcileWorkspaceProjectMetadataWithRemote,
  reconcileWorkspaceProjectsWithRemote,
  reconcilerRemoteTeamProjects,
  type LocalTeamProjectBinding,
  type WorkspaceProjectsReconcilerDeps,
} from './collab/workspace-projects-reconciler.js';
import {
  createWorkspaceTeamResourceEventCoordinator,
  reconcileWorkspaceResourcesWithRemote,
  type LocalTeamResourceBinding,
  type MaterializedTeamResourceRef,
  type WorkspaceTeamResourceRefreshReason,
} from './collab/workspace-resources-reconciler.js';
import { createVelaCliCollabClientFromEnv } from './collab/vela-cli-collab-client.js';
import {
  createScopedVelaTeamProjectCatalogClientCache,
  createVelaCliTeamProjectCatalogClientFromEnv,
  createVelaCliTeamProjectCatalogFromEnv,
} from './collab/vela-cli-team-projects.js';
import { createTeamProjectsChangeEmitter } from './collab/team-projects-change-emitter.js';
import { registerTelemetryRoutes } from './routes/telemetry.js';
import {
  assembleExample,
  registerAtomRoutes,
  registerStaticResourceRoutes,
  rewriteSkillAssetUrls,
} from './routes/static-resource.js';
export { rewriteSkillAssetUrls } from './routes/static-resource.js';
import { registerRoutineRoutes, routineDbRowToContract } from './routes/routine.js';
import {
  bindProjectToPersistedAutomationWorkspace,
  normalizePersistedAutomationWorkspaceScope,
} from './automations/workspace-scope.js';
import { resolveAmrModelProbe } from './runtimes/amr-model-probe.js';
import { createPluginInstallationHelpers, normalizeProjectPluginFolderPath, resolveProjectChildDirectory } from './services/plugin-installation.js';
import { createPluginShareTaskStore } from './services/plugin-share-tasks.js';
import { getRouteRegistrationInventory, installRouteRegistrationGuard } from './route-registration-guard.js';
import { assertServerContextSatisfiesRoutes } from './route-context-contract.js';
import { configureConnectorCredentialStore, connectorService, FileConnectorCredentialStore } from './connectors/service.js';
import { composioConnectorProvider } from './connectors/composio.js';
import { configureComposioConfigStore } from './connectors/composio-config.js';
import {
  CHAT_TOOL_ENDPOINTS,
  CHAT_TOOL_OPERATIONS,
  PROJECT_EXPORT_TOOL_ENDPOINT,
  resolveChatToolTokenTtlMs,
  toolTokenRegistry,
} from './tool-tokens.js';
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
import {
  API_TOKEN_BASIC_CHALLENGE,
  apiTokenAuthorizationMatches,
  apiTokenFromEnv,
  isApiAuthDisabled,
  isApiTokenMiddlewareEnabled,
} from './api-token-auth.js';
import { createOpenDesignPublicMetadataService } from './services/open-design-public-metadata.js';
import { createWhatsNewService } from './services/whats-new.js';
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
import { bearerTokenFromRequest, createToolRequestAuth } from './http/tool-request-auth.js';

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
export function resolveOpenDesignNodeBin({
  env = process.env,
  execPath = process.execPath,
  platform = process.platform,
  resourceRoot = DAEMON_RESOURCE_ROOT,
  exists = fs.existsSync,
}: {
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  execPath?: string;
  platform?: NodeJS.Platform;
  resourceRoot?: string | null;
  exists?: (path: string) => boolean;
} = {}): string {
  const configured = env.OD_NODE_BIN?.trim();
  if (configured) return configured;

  const bundledName = platform === 'win32' ? 'node.exe' : 'node';
  const bundled = resourceRoot
    ? (platform === 'win32' ? path.win32 : path).join(resourceRoot, 'bin', bundledName)
    : null;
  if (bundled && exists(bundled)) return bundled;

  return execPath;
}

const OD_NODE_BIN = resolveOpenDesignNodeBin();
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
// Collab realtime hop-2: subscribers to the WORKSPACE-scoped invalidation SSE
// (`GET /api/workspace/events`). Every connection is freshly verified for an
// exact Workspace/member pair; sinks are partitioned by Workspace so one
// daemon can safely serve tabs viewing A and B concurrently. Delivery is
// workspace-wide within a partition because roster/catalog/context/team
// billing invalidations legitimately affect every member of that Workspace.
const workspaceEventSinks =
  new Map<string, Set<(payload: unknown) => void>>();
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

// Broadcast a thin WORKSPACE-scoped invalidation only to the verified sink
// partition for `workspaceId`. There is deliberately no account-wide fallback:
// every producer below is attached to an explicit hub/poller/billing/project
// scope, and broad delivery would reveal cross-workspace activity timing.
function emitWorkspaceEvent(
  workspaceId: string,
  payload: { type: string; at?: number },
): boolean {
  return emitWorkspaceEventToScope(
    workspaceEventSinks,
    workspaceId,
    payload,
  );
}

function emitWorkspaceDirectoryChanged(): boolean {
  return emitWorkspaceEventToAllScopes(workspaceEventSinks, {
    type: 'workspace-directory-changed',
    at: Date.now(),
  });
}

function hubEventRefreshToken(event: {
  type?: string;
  revision?: string;
  revisionClock?: { epoch: string; counter: string };
  workspaceMemberId?: string;
  memberId?: string;
  projectId?: string;
  resourceId?: string;
  seq?: number;
  version?: number;
  at?: string;
}): string | undefined {
  const scope = [
    event.type ?? '',
    event.workspaceMemberId ?? '',
    event.memberId ?? '',
    event.projectId ?? '',
    event.resourceId ?? '',
  ].join(':');
  if (event.revisionClock) {
    return `${scope}:clock:${event.revisionClock.epoch}:${event.revisionClock.counter}`;
  }
  if (event.revision) return `${scope}:revision:${event.revision}`;
  if (event.seq != null) return `${scope}:seq:${event.seq}`;
  if (event.version != null) return `${scope}:version:${event.version}`;
  if (event.at) return `${scope}:at:${event.at}`;
  return undefined;
}

function accountBillingInvalidationToken(event: {
  type: 'billing-changed' | 'billing-subscription-changed' | 'wallet-balance-changed';
  revision?: string;
  revisionClock?: { epoch: string; counter: string };
  at?: string;
}): string | undefined {
  let revision: string | undefined;
  if (event.revisionClock) {
    revision = `clock:${event.revisionClock.epoch}:${event.revisionClock.counter}`;
  } else if (event.revision) {
    revision = `revision:${event.revision}`;
  } else if (event.at) {
    revision = `at:${event.at}`;
  }
  if (!revision) return undefined;
  // Current Vela producers emit a subscription mutation under both names.
  // Wallet clocks are independent and therefore need a separate domain.
  const domain = event.type === 'wallet-balance-changed' ? 'wallet' : 'billing';
  return `${domain}:${revision}`;
}

/**
 * Hub → daemon handling for the `workspace-context-changed` event (see
 * `startHubEventsSubscriber`'s `onEvent` below). Vela sends this same event
 * both for directory changes and membership changes (e.g. removal from a
 * team). Besides forwarding the thin signal to the web, this kicks one
 * immediate background reconciliation cycle. Request mutations independently
 * perform fresh exact-scope authority checks and do not depend on this poll.
 *
 * Extracted as its own named, exported step (rather than inlined in the
 * switch) so this invariant is directly unit-testable without standing up a
 * real hub connection.
 */
export function handleHubWorkspaceContextChanged(
  workspaceId: string,
  pollWorkspaceInvalidation: () => Promise<void>,
  invalidateWorkspaceDirectory: () => void = () => undefined,
): Promise<void> {
  // Retire the settled authority generation before either the web or the
  // daemon can start a refresh. A directory request that began before this
  // event is allowed to finish for its original caller, but the broker will
  // not let it repopulate the post-event generation.
  invalidateWorkspaceDirectory();
  emitWorkspaceEvent(
    workspaceId,
    { type: 'workspace-context-changed', at: Date.now() },
  );
  return pollWorkspaceInvalidation().catch(() => undefined);
}

/** Terminal counterpart to workspace-context-changed. Vela has already
 * re-derived the stream principal and is closing the connection, so local
 * directory and billing projections must be retired synchronously before any
 * reconciliation I/O starts. */
export function handleHubWorkspaceAccessRevoked(
  workspaceId: string,
  pollWorkspaceInvalidation: () => Promise<void>,
  invalidateWorkspaceDirectory: () => void,
  revokeWorkspaceBilling: (workspaceId: string) => void,
): void {
  invalidateWorkspaceDirectory();
  revokeWorkspaceBilling(workspaceId);
  emitWorkspaceEvent(
    workspaceId,
    { type: 'workspace-context-changed', at: Date.now() },
  );
  void pollWorkspaceInvalidation().catch(() => undefined);
}

/**
 * A verified hub connection is itself a freshness boundary, including the
 * daemon's very first connection. Published content and billing may already
 * have changed before the subscriber came online, so both scopes catch up
 * immediately instead of waiting for a later reconnect or poll tick.
 */
export function handleHubVerifiedConnection(
  workspaceId: string | undefined,
  catchUpPublishedHeads: (workspaceId: string) => Promise<void>,
  catchUpWorkspaceBilling: (workspaceId: string) => void,
): void {
  if (!workspaceId) return;
  void catchUpPublishedHeads(workspaceId).catch(() => undefined);
  catchUpWorkspaceBilling(workspaceId);
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
  nodeBin: string = OD_NODE_BIN,
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
  // The daemon API token authorizes the whole non-loopback API surface. Agent
  // children receive only their run-scoped tool capability, never that broad
  // credential inherited from the daemon process (including Windows casing).
  for (const key of Object.keys(env)) {
    if (key.toUpperCase() === 'OD_API_TOKEN') delete env[key];
  }
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

export function createOpenDesignToolEnv({
  daemonUrl,
  projectDir,
  projectId,
}: {
  daemonUrl: string;
  projectDir?: string | null;
  projectId?: string | null;
}): NodeJS.ProcessEnv {
  return {
    OD_BIN,
    OD_DATA_DIR: RUNTIME_DATA_DIR,
    OD_NODE_BIN,
    OD_DAEMON_URL: daemonUrl,
    ...(typeof projectId === 'string' && projectId && projectDir
      ? {
          OD_PROJECT_ID: projectId,
          OD_PROJECT_DIR: projectDir,
        }
      : {}),
  };
}

export function createDaemonDataDirConfiguredAgentEnv(
  configuredAgentEnv: Record<string, string> = {},
): Record<string, string> {
  return {
    ...configuredAgentEnv,
    OD_DATA_DIR: RUNTIME_DATA_DIR,
  };
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

// Fold per-run work-completeness signals off the agent event stream (#1247 /
// #1060). Invoked for EVERY agent event via the single emitAgentEvent choke
// point, so it covers every runtime (Claude stream, qoder, pi-rpc, ACP, …), not
// just Claude:
//   - the most recent TodoWrite snapshot's `todos` become run.lastTodoSnapshot,
//     so finish() can judge whether declared work was left unfinished;
//   - a turn-terminal event cut off by max_tokens sets run.truncatedMidTurn, so
//     a truncated generation is flagged incomplete regardless of its todos.
// Never keys off a mid-turn `tool_use` pause — only turn_end / usage terminals.
function captureRunWorkCompletenessSignals(run, ev) {
  if (!run || !ev || typeof ev !== 'object') return;
  if (ev.type === 'tool_use' && isTodoWriteToolName(ev.name)) {
    const todos = todoItemsFromTodoWriteInput(ev.input);
    if (Array.isArray(todos)) run.lastTodoSnapshot = todos;
    return;
  }
  if ((ev.type === 'turn_end' || ev.type === 'usage') && stopReasonIsTruncation(ev.stopReason)) {
    run.truncatedMidTurn = true;
  }
}

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

// Keep this header grammar aligned with parseFormAnswers in @open-design/contracts.
const FORM_ANSWERS_HEADER_RE =
  /^\s*\[form answers(?:\s*[\u2014\-:]\s*([^\]\r\n]+))?\]\s*(?:\r?\n|$)/i;

// Aggressive OVERRIDE for weak / medium-strength plain agents (e.g.
// GPT-OSS-120B Medium, Gemini 3.5 Flash) that otherwise echo RULE 1's
// fenced form example back after the user has answered it. Strong models
// (Claude Sonnet 4.6, Gemini 3.1 Pro) already handle a shorter OVERRIDE;
// enumerating the anti-patterns is a no-op for them and a strong suppressor
// for the weaker ones. RULE 1 stays conditional: a genuinely new material
// blocker may still require a new, targeted form on any turn.
//
// Exported so tests pin both the trigger condition and the literal
// anti-patterns we ask the model to skip \u2014 silently weakening the
// list (e.g. dropping the markdown-fence ban) would reintroduce the
// form-echo regression on GPT-OSS / Gemini Flash.
export const FORM_ANSWERED_SYSTEM_OVERRIDE = `## OVERRIDE \u2014 submitted form answers are authoritative

The user already submitted their form answers (see # User request below).
Apply those answers. RULE 1 does not require another form merely because its
example appears in the system prompt.

Forbidden output for this turn:
- Re-emitting the answered \`discovery\` or \`task-type\` form, or asking again
  for information the submitted answers already provide.
- A markdown \`\`\`json fenced block echoing an answered form's schema or example.
- Form-asking prose that repeats the answered questions, such as
  "Got it \u2014 tell me the following" or
  "\u8bf7\u544a\u8bc9\u6211\u4ee5\u4e0b\u4fe1\u606f".
- Narrating fake system events such as "subagents stopped" or
  "server restart".

Required output for this turn:
- Open with a brief prose confirmation of what the brief is.
- Then apply RULE 2 as relevant and proceed to RULE 3 or the matching active
  workflow.
- Only if a new, materially blocking requirement remains unresolved may you
  emit one new targeted \`<question-form>\`; never repeat answered fields.

`;

// Smaller override for non-discovery / non-task-type form ids. These
// forms are not artifact-build transitions, so we only need to suppress
// the form re-ask without directing the model toward RULE 2 / RULE 3.
// Exported so tests can pin the literal content independently.
export const FORM_ANSWERED_GENERIC_OVERRIDE = `## OVERRIDE \u2014 submitted form answers are authoritative

The user already submitted their form answers (see # User request below).
Do not ask the same form again. Treat the submitted answers as the active
user instruction and respond accordingly. Ask again only if a new, materially
blocking requirement remains unresolved.

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
    // Keep the wording in lock-step with main — the stronger answered-form
    // dedupe now lives in the system-prompt
    // `FORM_ANSWERED_SYSTEM_OVERRIDE` block, which every plain /
    // stream-json adapter sees. Diverging the
    // user-request transition string here breaks `chat-route.test
    // marks submitted discovery form answers ...` which asserts on
    // the exact main wording.
    `The user has answered the ${formId} form. Do not re-emit the answered form or repeat fields it already answered.`,
  ];
  if (formId.toLowerCase() === 'discovery' || formId.toLowerCase() === 'task-type') {
    lines.push(
      'Apply the submitted answers and continue with RULE 2 / RULE 3 or the matching active workflow. Only if a new, materially blocking requirement remains unresolved may you emit one targeted form; never repeat answered fields.',
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
  // When the adapter resumes its own session, the
  // daemon-rendered `## user` / `## assistant` transcript is a duplicate
  // of what the upstream CLI already has in memory — and the embedded
  // copy carries the literal `<question-form>` markup the agent emitted
  // on turn 1, which the model then re-emits on turn 2. Send only the
  // latest user turn (`currentPrompt`) in that case; the external runtime's
  // native session memory provides the rest.
  const skip = options.skipTranscript === true;
  // Native-session clients normally provide `currentPrompt`, but headless
  // callers such as `od run start --message` only populate `message`. On a
  // resumed session that value is the latest turn, not a rendered transcript,
  // so dropping it would send the misleading empty-turn placeholder instead.
  const bodySource = skip
    ? (typeof currentPrompt === 'string' ? currentPrompt : message)
    : message;
  const body =
    typeof bodySource === 'string' && bodySource.trim()
      ? bodySource
      : '(No extra typed instruction.)';
  const transition = formAnswerTransitionForCurrentPrompt(currentPrompt);
  if (!transition) return body;
  if (skip) {
    // The transition block already embeds the trimmed `currentPrompt`
    // (the submitted form answers). On the resume path `body` IS
    // `currentPrompt`, so appending it would ship the answers twice
    // (issue #6239); the transition alone carries the whole turn.
    return transition;
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
        ...(run?.model !== undefined || run?.resolvedModelId !== undefined
          ? { model_id: modelIdForTracking(run.resolvedModelId ?? run.model) }
          : {}),
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
      if (
        state.langfuse_expected === false
        || state.langfuse_delivery_status === 'accepted'
      ) {
        design.runs.markLangfuseCompleted?.(run);
      }
    })();
  };
}

export function shouldReportRunCompletionTelemetryFallbackStatus(status: unknown): boolean {
  return status === 'failed' || status === 'canceled';
}

const PROJECT_PREVIEW_SCOPE_TTL_MS = 60 * 60 * 1000;
const PROJECT_PREVIEW_ASSET_PATH_RE = /^\/projects\/([^/]+)\/preview\/([^/]+)\/.+$/u;
const PROJECT_RUN_SCOPED_EXPORT_PATH_RE =
  /^\/projects\/[^/]+\/export(?:\/(?:pptx|pdf-image|image))?$/u;

function createProjectPreviewScopeRegistry() {
  const scopes = new Map();

  function pruneExpired(now = Date.now()) {
    for (const [scope, entry] of scopes) {
      if (entry.expiresAt <= now) scopes.delete(scope);
    }
  }

  return {
    mint(projectId, workspace = null, options = {}) {
      pruneExpired();
      const scope = randomUUID();
      scopes.set(scope, {
        projectId: String(projectId),
        workspace,
        expiresAt: Date.now() + (options.ttlMs ?? PROJECT_PREVIEW_SCOPE_TTL_MS),
      });
      return scope;
    },
    revoke(scope) {
      scopes.delete(String(scope || ''));
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
    resolve(projectId, scope) {
      const key = String(scope || '');
      const entry = scopes.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt <= Date.now()) {
        scopes.delete(key);
        return undefined;
      }
      if (entry.projectId !== String(projectId)) return undefined;
      return entry.workspace ?? null;
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
  staticDir?: string;
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
  staticDir = STATIC_DIR,
}: StartServerOptions = {}) {
  host = normalizeDaemonBindHost(host);
  let resolvedPort = port;
  let daemonShuttingDown = false;
  const extraAllowedOrigins = configuredAllowedOrigins();
  const workspaceAuthorityCacheMode = resolveWorkspaceAuthorityCacheMode(
    process.env.OD_WORKSPACE_AUTHORITY_CACHE_MODE,
  );

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
  // matching Bearer token or browser Basic credentials (loopback origins
  // are exempted so the desktop UI keeps working).
  const apiToken = apiTokenFromEnv();
  const apiAuthDisabled = isApiAuthDisabled();
  const apiTokenAuthEnabled = apiToken.length > 0 && !apiAuthDisabled;
  const isApiTokenAuthorization = (authorization: string | undefined): boolean =>
    apiTokenAuthEnabled && apiTokenAuthorizationMatches(authorization, apiToken);
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

  // Plan §3.K1 — API-token middleware.
  //
  // Active only when OD_API_TOKEN is set and API auth is not disabled.
  // Loopback origins skip the check (the desktop UI / local CLI never carry
  // credentials); every other request must present a matching bearer token
  // (CLI / proxy) or matching HTTP Basic credentials (browser UI). A currently
  // valid run-scoped token may pass only an exact screenshot-export endpoint;
  // its route rechecks the operation and project. Health / readiness / version
  // remain open. Server-minted project preview asset scopes are also accepted
  // for GETs so sandboxed
  // browser iframes can load HTML/CSS/JS without privileged headers.
  // Rich daemon status stays authenticated because it includes local
  // runtime paths.
  if (apiTokenAuthEnabled) {
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
      // credentials; the loopback bypass exists for the localhost desktop
      // UI which has no proxy in the path.
      if (isLoopbackPeerAddress(req.socket?.remoteAddress)) return next();
      if (apiTokenAuthorizationMatches(req.get('authorization'), apiToken)) return next();
      if (
        req.method === 'POST'
        && PROJECT_RUN_SCOPED_EXPORT_PATH_RE.test(req.path)
        && toolTokenRegistry.validate(bearerTokenFromRequest(req), {
          endpoint: PROJECT_EXPORT_TOOL_ENDPOINT,
          operation: 'project:export',
        }).ok
      ) {
        return next();
      }
      res.setHeader('WWW-Authenticate', API_TOKEN_BASIC_CHALLENGE);
      return res.status(401).json({
        error: {
          code: 'API_TOKEN_REQUIRED',
          message: 'Authorization: Bearer <OD_API_TOKEN> or browser Basic authentication required',
        },
      });
    });

    // Docker Desktop forwards host-browser traffic across its bridge, so the
    // daemon correctly sees a non-loopback peer. Challenge the SPA document
    // navigation before serving any shell bytes; browsers then cache the Basic
    // credentials for same-origin /api requests. Static assets do not need a
    // separate challenge because the authenticated shell is the only entry
    // point and API routes still enforce credentials independently.
    app.use((req, res, next) => {
      if (isLoopbackPeerAddress(req.socket?.remoteAddress)) return next();
      if (resolveStaticSpaFallbackPath(req, staticDir) === null) return next();
      if (apiTokenAuthorizationMatches(req.get('authorization'), apiToken)) return next();

      res.setHeader('WWW-Authenticate', API_TOKEN_BASIC_CHALLENGE);
      return res.status(401).type('text/plain').send(
        'Open Design authentication required. Use username "open-design" and OD_API_TOKEN as the password.',
      );
    });
  }

  const designSystemServices = createDesignSystemServerServices({
    // `db` (below) is not initialized yet at this point in `startServer` —
    // pass a getter so `listAllSkills`'s workspace filter reads it lazily,
    // once the first request that needs it actually arrives.
    getDb: () => db,
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
      readUserDesignSystemFileBytes,
      linkUserDesignSystemProject,
      syncUserDesignSystemAssetsFromFiles,
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
    bindProjectToWorkspace: (projectId, createdAt, designSystem) => {
      const workspaceId = designSystem.workspaceId?.trim();
      if (!workspaceId) return;
      const binding = getWorkspaceResource(
        db,
        'design_system',
        workspaceId,
        designSystem.teamSynced === true
          ? workspaceTeamDesignSystemBindingResourceId(workspaceId, designSystem.id)
          : designSystem.id,
      );
      const memberId = binding?.createdByWorkspaceMemberId?.trim();
      if (!memberId) return;
      ensureWorkspaceProject(db, {
        projectId,
        workspaceId,
        visibility: designSystem.teamSynced === true ? 'team' : 'personal',
        resourceState: 'active',
        createdByWorkspaceMemberId: memberId,
        updatedByWorkspaceMemberId: memberId,
        syncState: 'local_only',
        resourceHubResourceId: null,
        cloudTombstonedAt: null,
        createdAt,
        updatedAt: createdAt,
      });
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
    resolveUserDesignSystemShareDirectory,
    syncUserDesignSystemAssetsFromWorkspace,
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
  const commentAnchorRepair = repairTeamProjectCommentAnchorConversations(db);
  if (commentAnchorRepair.created > 0) {
    console.warn(
      `[comments] repaired ${commentAnchorRepair.created} historical Team project comment anchor(s)`,
    );
  }
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
  const mediaTaskStore = createMediaTaskStore(db, {
    isRunActive: (runId) => toolTokenRegistry.activeRunTokenCount(runId) > 0,
  });
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

  // Memory hygiene: one-time removal of entries the retired chat
  // auto-extraction pipelines wrote (regex-pack artifacts + chat-form
  // residue in user_profile). Marker-gated inside, so this is a no-op on
  // every boot after the first. Best-effort — memory cleanup must never
  // block the daemon from serving.
  try {
    const memoryCleanup = await runAutoExtractionCleanup(RUNTIME_DATA_DIR);
    if (memoryCleanup.ran && (memoryCleanup.deletedIds.length > 0 || memoryCleanup.profilePruned)) {
      console.log(
        `[memory] auto-extraction cleanup removed ${memoryCleanup.deletedIds.length} entr(y/ies)`
        + `${memoryCleanup.profilePruned ? ' and pruned user_profile to canonical fields' : ''}`,
      );
    }
  } catch (err) {
    console.warn('[memory] auto-extraction cleanup failed:', err);
  }

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

  if (fs.existsSync(staticDir)) {
    app.use(express.static(staticDir));
  }

  // ---- Projects (DB-backed) -------------------------------------------------


  // Team collaboration subsystem: presence + author-side publish scheduler.
  // Product team workspaces publish and pull through the login-backed Vela CLI;
  // non-Vela local modes retain the in-memory adapter for isolated development.
  const describeCollabProject = (projectId: string) => {
    const project = getProject(db, projectId);
    if (!project) return null;
    return {
      name: project.name,
      skillId: project.skillId ?? null,
      designSystemId: project.designSystemId ?? null,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      ...(project.metadata ? { metadata: project.metadata } : {}),
    };
  };
  const activeWorkspace = createActiveWorkspaceSelectionStore(RUNTIME_DATA_DIR);
  const teamMirrorPromotionJournalDir = path.join(
    RUNTIME_DATA_DIR,
    'team-mirror-promotions',
  );
  await recoverAuthorizedTeamProjectPromotions({
    journalDir: teamMirrorPromotionJournalDir,
    allowedProjectsRoot: PROJECTS_DIR,
    isCommitted: (entry) => {
      const stored = getTeamProjectMaterialization(
        db,
        entry.receipt.workspaceId,
        entry.receipt.projectId,
      );
      return teamProjectMaterializationMatches(stored, entry.receipt);
    },
    isSuperseded: (entry) => {
      const stored = getTeamProjectMaterialization(
        db,
        entry.receipt.workspaceId,
        entry.receipt.projectId,
      );
      return teamProjectMaterializationSupersedes(stored, entry.receipt);
    },
    onError: (error) => {
      console.warn('[od] failed to recover authorized team mirror promotion:', error);
    },
  });
  // What this daemon has learned about each workspace's type, memoized from
  // exact directory/context reads it already performs. It is the
  // second witness behind the team-share invariant: a team share may only be
  // recorded in — and a project-scoped collab call may only be pinned to — a
  // workspace that can actually host a team plane. See collab/team-share-scope.ts.
  const workspaceTypes = createWorkspaceTypeRegistry();
  const configuredAmrEnv = () =>
    agentCliEnvForAgent(readAppConfigSync(RUNTIME_DATA_DIR).agentCliEnv, 'amr');
  const workspaceExactAuthorityCache = createWorkspaceExactAuthorityCache({
    identity: () => velaWorkspaceDirectoryIdentity(
      readVelaControlApiContext,
      configuredAmrEnv(),
    ),
  });
  const workspaceDirectoryAuthority = createWorkspaceDirectoryAuthorityBroker({
    fetchDirectory: async () => {
      const result = await fetchVelaWorkspaceDirectory({
        configuredEnv: configuredAmrEnv(),
      });
      if (result.ok) workspaceTypes.learn(result.items);
      return result;
    },
    identityKey: () => velaWorkspaceDirectoryIdentity(
      readVelaControlApiContext,
      configuredAmrEnv(),
    ),
    onDecision: (input) => recordWorkspaceAuthorityDecision({
      mode: workspaceAuthorityCacheMode,
      ...input,
    }),
    onSuppressedRequest: (input) => recordWorkspaceAuthoritySuppressedRequest({
      mode: workspaceAuthorityCacheMode,
      ...input,
    }),
    onInvalidation: (input) => recordWorkspaceAuthorityInvalidation({
      mode: workspaceAuthorityCacheMode,
      ...input,
    }),
    onAcceptedResult: (result, identity) =>
      workspaceExactAuthorityCache.observe(identity, result.items),
  });
  const fetchWorkspaceDirectory = workspaceDirectoryAuthority.read;
  const fetchFreshMutationWorkspaceDirectory =
    workspaceDirectoryAuthority.fresh;
  const fetchFreshBackgroundWorkspaceDirectory =
    workspaceDirectoryAuthority.backgroundFresh;
  let workspaceHubSubscriptions: WorkspaceHubSubscriptionManager | null = null;
  const verifyExplicitWorkspaceRequestContext = async (input: {
    req: any;
    requireTeam?: boolean;
  }, options: { fresh?: boolean; backgroundFresh?: boolean } = {}) => {
    if (process.env.OD_WORKSPACE_CONTEXT_SOURCE?.trim() === 'vela') {
      let fetchDirectory = fetchFreshMutationWorkspaceDirectory;
      if (options.fresh === false) {
        fetchDirectory = fetchWorkspaceDirectory;
      } else if (options.backgroundFresh) {
        fetchDirectory = fetchFreshBackgroundWorkspaceDirectory;
      }
      return verifyWorkspaceRequestContext({
        ...input,
        fetchWorkspaceDirectory: fetchDirectory,
      });
    }
    // Local/dev has no signed membership directory. Its explicit request
    // headers are the complete, static authority; still never consult the
    // daemon's mutable active-workspace context.
    const claimed = workspaceResourceContextFromRequest(input.req);
    if (claimed === null) {
      return {
        ok: false as const,
        status: 400 as const,
        code: 'WORKSPACE_CONTEXT_REQUIRED' as const,
        message: 'an explicit workspace context is required',
      };
    }
    if (claimed === 'missing') {
      return {
        ok: false as const,
        status: 400 as const,
        code: 'WORKSPACE_CONTEXT_INCOMPLETE' as const,
        message: 'both workspace and member identity are required',
      };
    }
    if (
      claimed.memberStatus !== 'active'
      || claimed.lifecycleState === 'deleted'
      || (input.requireTeam && claimed.workspaceType !== 'team')
    ) {
      return {
        ok: false as const,
        status: 403 as const,
        code: 'WORKSPACE_ACCESS_DENIED' as const,
        message: 'the requested workspace is not available to this member',
      };
    }
    return {
      ok: true as const,
      context: workspaceContextFromDirectoryItem({
        workspaceId: claimed.workspaceId,
        workspaceName: claimed.workspaceId,
        workspaceType: claimed.workspaceType,
        workspaceMemberId: claimed.workspaceMemberId,
        role: claimed.role,
        memberStatus: claimed.memberStatus,
        lifecycleState: claimed.lifecycleState,
      }),
    };
  };
  const verifyWorkspaceReadAuthority = (req: unknown) =>
    verifyExplicitWorkspaceRequestContext({ req }, { fresh: false });
  const verifyWorkspaceRequestAuthority = (req: unknown) =>
    verifyExplicitWorkspaceRequestContext({ req });
  const verifyPersonalProjectDeleteLeaseAuthority =
    process.env.OD_WORKSPACE_CONTEXT_SOURCE?.trim() === 'vela'
      ? (req: unknown) => verifyWorkspaceRequestContext({
          req,
          // A miss is intentionally returned as unavailable. The project gate
          // then falls through to the existing fresh authority verifier.
          fetchWorkspaceDirectory: workspaceDirectoryAuthority.cached,
        })
      : undefined;
  const enforceAuthoritativeProjectMutation = createEnforceWorkspaceProjectMutation(
    verifyWorkspaceRequestAuthority,
  );
  // Project-creation writes must be authorized by AMR in production, while
  // local/dev and explicitly anonymous clients keep their legacy behavior.
  // Keep this separate from read-side directory fetches so an unconfigured
  // daemon never turns ordinary local creation into a network-dependent path.
  const fetchProjectCreationWorkspaceDirectory =
    process.env.OD_WORKSPACE_CONTEXT_SOURCE?.trim() === 'vela'
      ? fetchFreshMutationWorkspaceDirectory
      : undefined;
  const listWorkspaceDirectory = async () => {
    const result = await fetchWorkspaceDirectory();
    return result.items;
  };
  const resolveAuthoritativeTeamWorkspaceContext = async (
    workspaceId: string | null | undefined,
    options: { fresh?: boolean; backgroundFresh?: boolean } = {},
  ): Promise<WorkspaceCollabContext | null> => {
    const requestedWorkspaceId = workspaceId?.trim() ?? '';
    if (!requestedWorkspaceId) return null;
    let fetchDirectory = fetchWorkspaceDirectory;
    if (options.fresh) {
      fetchDirectory = options.backgroundFresh
        ? fetchFreshBackgroundWorkspaceDirectory
        : fetchFreshMutationWorkspaceDirectory;
    }
    const directory = await fetchDirectory().catch(() => ({
      ok: false as const,
      items: [],
    }));
    if (!directory.ok) return null;
    const membership = directory.items.find(
      (item) =>
        item.workspaceId === requestedWorkspaceId
        && item.workspaceType === 'team'
        && item.memberStatus === 'active'
        && item.lifecycleState === 'active',
    );
    return membership ? workspaceContextFromDirectoryItem(membership) : null;
  };
  const teamResourceVersions = createTeamResourceVersionStore(RUNTIME_DATA_DIR);
  const teamProjectContentResourceId = (
    projectId: string,
    scope: { resourceTeamId: string; ownerMemberId: string },
  ) =>
    projectResourceIdFor(projectId, {
      teamId: scope.resourceTeamId,
      memberId: scope.ownerMemberId,
      role: 'member',
      lifecycleState: 'active',
      workspaceType: 'team',
    });
  /**
   * Resolve design-system ownership/filtering from this exact request.
   *
   * Catalog and create are data-plane operations. Daemon-global active/current
   * state can change between two tabs, so it is not authority for deciding
   * which Workspace a request reads or writes.
   */
  async function resolveDesignSystemWorkspaceContext(
    req: any,
  ): Promise<import('./collab/workspace-resource-mutation.js').WorkspaceResourceContext | null> {
    const claimed = workspaceResourceContextFromRequest(req);
    // A completely headerless local/signed-out request is the explicit legacy
    // lane: built-ins plus unclaimed local resources, and new resources remain
    // unbound. A half-specified identity is never that lane and is rejected by
    // the verifier below.
    if (claimed === null) return null;
    const verified = await verifyExplicitWorkspaceRequestContext({ req });
    if (!verified.ok) {
      throw Object.assign(new Error(verified.message), {
        status: verified.status,
        code: verified.code,
        ...(verified.retryable ? { retryable: true } : {}),
      });
    }
    return verified.context;
  }

  async function resolveDesignSystemWorkspaceScope(req: any): Promise<string | null> {
    const context = await resolveDesignSystemWorkspaceContext(req);
    return context?.workspaceId.trim() || null;
  }

  /**
   * Create a user design system CLAIMED by the workspace it was authored in.
   *
   * User design systems share one flat directory, so the claim written here is
   * the only thing that lets `GET /api/design-systems` keep one workspace's
   * library out of another's (#145). Stamping at creation is deliberate: it is
   * the one moment the authoring workspace is unambiguous, whereas deciding
   * ownership later (at read time, from whatever workspace happens to be
   * active) would re-home a system every time the user switched.
   *
   * Envelope double-write (spec 9.2): `metadata.json` stays the only thing
   * `listDesignSystems`'s filter reads, but a claimed system also gets a row
   * in the generic `workspace_resources` table — the same table plugin/skill
   * already bind into — so design systems stop being the one resource type
   * with zero rows there. Both writes happen from this single call site, so
   * they can never drift apart.
   */
  const reservedDesignSystemResourceIds = (): Set<string> => {
    const rows = db.prepare(
      `SELECT resource_id AS resourceId
         FROM workspace_resources
        WHERE resource_type = 'design_system'`,
    ).all() as Array<{ resourceId?: string }>;
    return new Set(rows.flatMap((row) => {
      const resourceId = row.resourceId?.trim();
      return resourceId ? [designSystemLogicalResourceId(resourceId)] : [];
    }));
  };
  const createWorkspaceOwnedDesignSystemForContext = (
    root: string,
    input: UserDesignSystemInput,
    context: import('./collab/workspace-resource-mutation.js').WorkspaceResourceContext | null,
  ) => persistWorkspaceOwnedDesignSystem(root, input, context, {
    listReservedResourceIds: reservedDesignSystemResourceIds,
    ensureWorkspaceResource: (resourceType, workspaceId, resourceId, envelope) => {
      // The filesystem allocation awaited above, so another request could
      // have claimed this logical id in the meantime. Fail before reusing its
      // envelope; the wrapper removes only the directory it just allocated.
      if (reservedDesignSystemResourceIds().has(resourceId)) {
        throw new Error('DESIGN_SYSTEM_ID_CONFLICT');
      }
      return ensureWorkspaceResource(db, resourceType, workspaceId, resourceId, envelope);
    },
  });
  const createWorkspaceOwnedDesignSystem = async (
    root: string,
    input: UserDesignSystemInput,
    req: any,
  ) => {
    const context = await resolveDesignSystemWorkspaceContext(req);
    return createWorkspaceOwnedDesignSystemForContext(root, input, context);
  };
  // Persistent half of the sync design: a cheap digest GET decides whether the
  // catalog / member payload this daemon already has on disk is still current,
  // so a cold start (or a workspace not touched in a while) can skip the real
  // round-trip entirely. Snapshots live in the daemon database, which was
  // opened from the resolved runtime data root. See collab/persistent-sync-cache.ts.
  const collabSyncSnapshots = createCollabSyncSnapshotStore(db);
  const velaCliCollabClient = createVelaCliCollabClientFromEnv(process.env);
  const velaCliTeamProjectCatalog = createVelaCliTeamProjectCatalogFromEnv();
  const velaCliWorkspaceTeamProjectCatalog =
    createVelaCliTeamProjectCatalogClientFromEnv();
  // Generic stale-while-revalidate cache (with an `invalidate()` escape hatch)
  // — see collab/swr-cache.ts.
  // Cache the workspace-scoped team catalog behind /api/workspaces/:id/projects
  // ?view=… (the "All projects"/"Recent" pages) the same way. The wrapper keeps
  // the verified request principal in both its key and its upstream call, so
  // navigation stays instant without letting an active-workspace switch retarget
  // an in-flight read.
  const workspaceTeamProjectCatalog = velaCliWorkspaceTeamProjectCatalog
    ? createScopedVelaTeamProjectCatalogClientCache(
        velaCliWorkspaceTeamProjectCatalog,
      )
    : velaCliWorkspaceTeamProjectCatalog;
  // Preserve the legacy observation API for compatibility tests and dev
  // tooling. Production data-plane routes never read current/lastKnown; they
  // verify the exact Workspace/member carried by each request.
  const workspaceContext = withLastKnownWorkspaceContext(
    createWorkspaceContextProviderFromEnv(process.env, {
      getActiveWorkspaceId: () => activeWorkspace.get(),
      setLocalSelection: (workspaceId: string) => activeWorkspace.set(workspaceId),
      // Only called after the membership directory CONFIRMS the pinned
      // workspace is gone (removed member / deleted workspace) — never on a
      // mere B outage. See resolvePinnedWorkspace in vela-workspace-context.ts.
      clearLocalSelection: () => activeWorkspace.clear(),
    }),
  );
  const workspaceExactContextCache = createWorkspaceExactContextCache({
    provider: workspaceContext,
    identity: () => velaWorkspaceDirectoryIdentity(
      readVelaControlApiContext,
      configuredAmrEnv(),
    ),
    onDecision: (input) => recordWorkspaceAuthorityDecision({
      mode: workspaceAuthorityCacheMode,
      ...input,
    }),
    onSuppressedRequest: (input) => recordWorkspaceAuthoritySuppressedRequest({
      mode: workspaceAuthorityCacheMode,
      ...input,
    }),
    onInvalidation: (input) => recordWorkspaceAuthorityInvalidation({
      mode: workspaceAuthorityCacheMode,
      ...input,
    }),
  });
  let workspaceHubAccountIdentity = velaWorkspaceDirectoryIdentity(
    readVelaControlApiContext,
    configuredAmrEnv(),
  );
  const resetWorkspaceIdentityCaches = (): void => {
    workspaceDirectoryAuthority.resetIdentity();
    workspaceExactAuthorityCache.resetIdentity();
    workspaceExactContextCache.resetIdentity();
  };
  const refreshWorkspaceHubAccountIdentity = (): void => {
    const currentIdentity = velaWorkspaceDirectoryIdentity(
      readVelaControlApiContext,
      configuredAmrEnv(),
    );
    if (currentIdentity === workspaceHubAccountIdentity) return;
    workspaceHubAccountIdentity = currentIdentity;
    resetWorkspaceIdentityCaches();
    workspaceHubSubscriptions?.refreshEndpoints();
  };
  const fetchWorkspaceDirectoryForAccountSurface = () => {
    refreshWorkspaceHubAccountIdentity();
    return fetchWorkspaceDirectory();
  };
  const workspaceContextProvider = workspaceExactContextCache.provider;
  const cachedWorkspaceContextForRequest = (
    req: unknown,
    requestedWorkspaceId?: string,
  ): WorkspaceCollabContext | null => {
    refreshWorkspaceHubAccountIdentity();
    const claimed = workspaceResourceContextFromRequest(req);
    if (!claimed || claimed === 'missing') return null;
    if (
      requestedWorkspaceId &&
      claimed.workspaceId !== requestedWorkspaceId.trim()
    ) {
      return null;
    }
    const cached = workspaceExactContextCache.cached(claimed.workspaceId);
    return cached &&
      cached.workspaceMemberId === claimed.workspaceMemberId &&
      cached.memberStatus === 'active' &&
      cached.lifecycleState !== 'deleted'
      ? cached
      : null;
  };
  const verifyWorkspaceContextReadAuthority = async (req: unknown) => {
    refreshWorkspaceHubAccountIdentity();
    const claimed = workspaceResourceContextFromRequest(req);
    if (claimed && claimed !== 'missing') {
      const cached = workspaceExactAuthorityCache.cached(
        claimed.workspaceId,
        claimed.workspaceMemberId,
      );
      if (cached) {
        return {
          ok: true as const,
          context: workspaceContextFromDirectoryItem(cached),
        };
      }
    }
    // The exact cache is directory-sourced and usable only under strict SSE
    // health. Every miss preserves the legacy directory verification.
    return verifyWorkspaceReadAuthority(req);
  };
  /**
   * Where a created project belongs for the surfaces with no authorization gate
   * of their own. An explicit pair is verified through the same fresh directory
   * authority as `POST /api/projects`; a headerless legacy/local request remains
   * unbound. No active/current/last-known Workspace is consulted.
   */
  const resolveCreatedProjectHome = createCreatedProjectWorkspaceResolver({
    ...(fetchProjectCreationWorkspaceDirectory
      ? { fetchWorkspaceDirectory: fetchProjectCreationWorkspaceDirectory }
      : {}),
  });
  function persistWorkspaceProjectSyncState(
    projectId: string,
    workspaceId: string | null | undefined,
    syncState: 'synced' | 'sync_failed',
  ) {
    if (!workspaceId) return;
    // Where a background upload got to is sync bookkeeping, not a change to the
    // project — see SYNC_KEEPS_UPDATED_AT.
    updateWorkspaceProject(db, workspaceId, projectId, {
      syncState,
      updatedAt: SYNC_KEEPS_UPDATED_AT,
    });
  }
  function persistWorkspaceProjectVisibility(
    input: {
      projectId: string;
      principal?: ResourceHubPrincipal | null;
      visibility: 'personal' | 'team';
      ownerMemberId?: string | null;
      updatedByMemberId?: string | null;
    },
  ) {
    const workspaceId = input.principal?.teamId;
    if (!workspaceId) return;
    const project = getProject(db, input.projectId);
    // Keyed on the PROJECT, not on (workspace, project): a project belongs to
    // exactly one workspace (collab/workspace-project-home.ts), so a project
    // already bound elsewhere must not gain a second row here.
    if (project && !getWorkspaceProjectByProjectId(db, input.projectId)) {
      ensureWorkspaceProject(db, {
        projectId: input.projectId,
        workspaceId,
        visibility: 'personal',
        resourceState: 'active',
        createdByWorkspaceMemberId: input.ownerMemberId ?? input.updatedByMemberId ?? null,
        updatedByWorkspaceMemberId: input.updatedByMemberId ?? input.ownerMemberId ?? null,
        resourceHubResourceId: null,
        cloudTombstonedAt: null,
        syncState: 'local_only',
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      });
    }
    const patch = input.visibility === 'team'
      ? {
          visibility: 'team',
          createdByWorkspaceMemberId: input.ownerMemberId ?? input.updatedByMemberId ?? null,
          updatedByWorkspaceMemberId: input.updatedByMemberId ?? input.ownerMemberId ?? null,
          resourceHubResourceId: projectResourceIdFor(input.projectId, input.principal),
          cloudTombstonedAt: null,
          syncState: 'synced',
        }
      : {
          visibility: 'personal',
          updatedByWorkspaceMemberId: input.updatedByMemberId ?? input.ownerMemberId ?? null,
          resourceHubResourceId: null,
          cloudTombstonedAt: Date.now(),
          syncState: 'local_only',
        };
    const persist = db.transaction(() => {
      // `rebindWorkspaceProject`, not `updateWorkspaceProject`: the row this
      // event is about can predate the share — a personal draft the user made
      // before ever joining the team it just got shared into — so it sits under
      // an unrelated, stale workspace_id. Asking for an update scoped to the
      // NEW workspaceId would find nothing and silently never migrate it.
      rebindWorkspaceProject(db, input.projectId, { ...patch, workspaceId });
      if (input.visibility === 'team') {
        ensureTeamProjectCommentConversations(db, input.projectId);
      }
    });
    persist();
  }
  /**
   * The recvqzaDvUU6B3 fresh-install wipe guard's one db-backed predicate:
   * is this project's local record still an unmaterialized shared-project
   * placeholder (see collab/shared-project-placeholder.ts)? Consulted by the
   * publish watcher's shouldPublish AND the runtime's scheduler publish gate,
   * so neither a new watch nor an already-scheduled flush can push a
   * placeholder's empty directory over the team's real hub content.
   */
  const projectIsUnmaterializedSharedPlaceholder = (projectId: string): boolean =>
    isUnmaterializedSharedPlaceholder(getProject(db, projectId));
  let invalidatePresenceReadCache = (
    _projectId: string,
    _workspaceId?: string,
  ): void => {};
  let markPresenceReadCacheStale = (
    _projectId: string,
    _workspaceId?: string,
  ): void => {};
  const collab = createCollabRuntime({
    workspaceContext: workspaceContextProvider,
    canPublishProjectContent: (projectId) =>
      !projectIsUnmaterializedSharedPlaceholder(projectId),
    resolveProjectDir: async (projectId) => {
      const project = getProject(db, projectId);
      if (project) await ensureProject(PROJECTS_DIR, projectId, project.metadata);
      return resolveProjectShareDir(PROJECTS_DIR, projectId, project, resolveProjectDir);
    },
    resolvePullDir: (projectId) => resolveProjectDir(PROJECTS_DIR, projectId),
    describeProject: describeCollabProject,
    ...(velaCliTeamProjectCatalog ? { teamProjectCatalog: velaCliTeamProjectCatalog } : {}),
    onPublished: ({ projectId, principal }) => {
      persistWorkspaceProjectSyncState(projectId, principal?.teamId, 'synced');
    },
    onError: ({ projectId, principal }) => {
      persistWorkspaceProjectSyncState(projectId, principal?.teamId, 'sync_failed');
    },
    onMetadataRefreshError: ({ projectId, principal, error }) => {
      console.warn(
        `[od] team project metadata refresh will retry (${principal.teamId}/${projectId}):`,
        error,
      );
    },
    onMetadataRefreshPending: ({ projectId, principal }) => {
      setWorkspaceProjectMetadataRefreshPending(db, principal.teamId, projectId, true);
    },
    onMetadataRefreshComplete: ({ projectId, principal }) => {
      setWorkspaceProjectMetadataRefreshPending(db, principal.teamId, projectId, false);
    },
    // Collab realtime hop-2: a member joined/left this project's presence set
    // (fires only on explicit join/leave, not on every heartbeat). Push a thin
    // `presence-changed` onto the project's existing events SSE so the open
    // project view re-fetches presence instead of waiting for its poll tick.
    onPresenceChange: ({ projectId }) => {
      markPresenceReadCacheStale(projectId);
      emitProjectEvent(projectId, { type: 'presence-changed', projectId, at: Date.now() });
    },
  });
  for (const share of listTeamWorkspaceProjectShares(db)) {
    const restored = recoverPersistedTeamShareOwnership(share);
    if (!restored) continue;
    collab.rememberTeamShare(
      restored.projectId,
      restored.principal,
      share.syncState === 'synced' || share.syncState === 'sync_failed' || share.syncState === 'pending_upload'
        ? share.syncState
        : 'pending_upload',
      { metadataRefreshPending: Boolean(share.metadataRefreshPending) },
    );
  }
  /**
   * Heal `workspace_projects` rows that already violate the team-share
   * invariant: `visibility: 'team'` pinned to a PERSONAL workspace (see
   * collab/team-share-scope.ts). Older builds let a share taken while the client
   * sat on its personal workspace persist such a row, and the code guards alone
   * leave an affected user permanently stuck — the row 403s every collab call it
   * scopes and nothing ever rewrites it.
   *
   * Reconciliation at startup rather than a schema migration: the contradiction
   * is only decidable against the workspace DIRECTORY (which ids are teams),
   * which is a signed-in network fact a migration cannot see. Demotion is
   * therefore evidence-gated — a workspace the directory does not name is left
   * exactly as-is, and `visibility: 'personal'` rows are never candidates.
   *
   * A demoted row goes back to a local draft rather than being re-pointed at
   * some team: which team was intended is not recoverable, and the user can
   * simply re-share from the team workspace, which now writes a valid row. This
   * touches local state only — no hub resource is deleted — and deliberately
   * leaves `cloudTombstonedAt` null, so a copy that genuinely exists in the team
   * catalog keeps showing up instead of being suppressed as "unshared here".
   */
  const reconcileImpossibleTeamShares = async (): Promise<number> => {
    await listWorkspaceDirectory();
    const broken = impossibleTeamShareRows(listTeamWorkspaceProjectShares(db), workspaceTypes);
    for (const row of broken) {
      console.warn(
        `[od] healing project ${row.projectId}: its team share pointed at personal workspace ` +
          `${row.workspaceId}, which has no team plane. Re-share it from a team workspace.`,
      );
      updateWorkspaceProject(db, row.workspaceId, row.projectId, {
        visibility: 'personal',
        resourceHubResourceId: null,
        cloudTombstonedAt: null,
        syncState: 'local_only',
        // A startup heal of a row that was never valid; nobody changed the
        // project — see SYNC_KEEPS_UPDATED_AT.
        updatedAt: SYNC_KEEPS_UPDATED_AT,
      });
    }
    return broken.length;
  };
  void reconcileImpossibleTeamShares().catch((error) => {
    console.warn('[od] team-share scope reconciliation failed:', error);
  });
  // Spec 9.2 one-time backfill: claim every pre-existing user design system
  // whose metadata.json already names a workspace into the generic
  // `workspace_resources` table too. Idempotent (see
  // `backfillDesignSystemWorkspaceResources`'s own doc comment), so running
  // it unconditionally on every startup is deliberate, same as
  // `reconcileImpossibleTeamShares` just above.
  void backfillDesignSystemWorkspaceResources(db, USER_DESIGN_SYSTEMS_DIR).catch((error) => {
    console.warn('[od] design-system workspace-resource backfill failed:', error);
  });
  const collabCloudClient = velaCliCollabClient ?? createCollabCloudClientFromEnv();
  const resolveBoundProjectWorkspaceContext = async (
    projectId: string,
    options: { fresh?: boolean } = {},
  ): Promise<WorkspaceCollabContext | null> => {
    const binding = getWorkspaceProjectByProjectId(db, projectId);
    const workspaceId = binding?.workspaceId?.trim();
    if (!workspaceId) return null;
    const directory = await (
      options.fresh
        // `fresh` is requested only by the durable comment-outbox recovery
        // service. It must bypass a settled success lease but share the daemon's
        // account-wide outage circuit with other background recovery work.
        ? fetchFreshBackgroundWorkspaceDirectory()
        : fetchWorkspaceDirectory()
    ).catch(() => ({
      ok: false as const,
      items: [],
    }));
    if (!directory.ok) return null;
    const membership = directory.items.find(
      (item) =>
        item.workspaceId === workspaceId
        && item.workspaceType === 'team'
        && item.memberStatus === 'active'
        && item.lifecycleState !== 'deleted',
    );
    return membership ? workspaceContextFromDirectoryItem(membership) : null;
  };

  // Uncached remote catalog authority for both comment relay delivery and the
  // later project-sharing routes. A missing row is authoritative unshare;
  // transport failure throws so the durable outbox keeps the delivery pending.
  const teamProjectsLister = createTeamProjectsLister({
    ...(velaCliTeamProjectCatalog ? { teamProjectCatalog: velaCliTeamProjectCatalog } : {}),
  });

  // Collab cloud (C-lane §D2.5/§D4): cross-daemon comment sync + member
  // directory. The client is null (all calls degrade to no-op) unless
  // OD_COLLAB_CLOUD_URL is set. The service ties it to the one workspace context
  // so a single identity drives member registration, comment push, and the
  // pull+merge poller. Kept out of collab/runtime.ts to avoid colliding with the
  // team-project-catalog work also editing that file.
  const collabCloud = collabCloudClient
    ? createCollabCloudService({
        client: collabCloudClient,
        commentOutbox: createCommentRelayOutboxStore(db),
        resolveLocalProjectRelayBinding: (projectId) => {
          const binding = getWorkspaceProjectByProjectId(db, projectId);
          const workspaceId = binding?.workspaceId?.trim() ?? '';
          const ownerMemberId = binding?.createdByWorkspaceMemberId?.trim() || null;
          if (
            !workspaceId
            || binding?.visibility !== 'team'
            || binding?.resourceState === 'deleted'
          ) return null;
          return { workspaceId, ownerMemberId };
        },
        validateCommentRelayProjectBinding: (record) =>
          commentRelayLocalBindingMatches(
            record,
            getWorkspaceProjectByProjectId(db, record.projectId),
          ),
        resolveCommentRelayWorkspaceContext: async (queuedIdentity) => {
          const context = await resolveAuthoritativeTeamWorkspaceContext(
            queuedIdentity.workspaceId,
            { fresh: true, backgroundFresh: true },
          );
          const principal = contextToResourceHubPrincipal(context);
          if (
            !context
            || !principal
            || principal.memberId !== queuedIdentity.workspaceMemberId
            || principal.teamId !== queuedIdentity.teamId
          ) return null;
          return context;
        },
        listRemoteProjectRelayBindings: async (context) =>
          (await teamProjectsLister(context.workspaceId)).map((project) => ({
            projectId: project.projectId,
            ownerMemberId: project.ownerMemberId,
          })),
        resolveRemoteProjectOwnerMemberId: async (projectId, context) =>
          (await teamProjectsLister(context.workspaceId))
            .find((project) => project.projectId === projectId)
            ?.ownerMemberId ?? null,
        workspaceContext: collab.workspaceContext,
        // Only poll comments for projects the UI is actively viewing — those
        // have a live `/api/projects/:id/events` SSE subscriber, so their id is
        // a key in activeProjectEventSinks. Polling every local project each 5s
        // cycle spawned one `vela collab comment pull` subprocess per project
        // and did not scale: a workspace with many shared projects turned every
        // tick into a spawn storm that starved the pull the open project was
        // waiting on. A member picks up a project's comments when they open it
        // (a fresh sink) and stops polling it once they navigate away.
        listProjectIds: () => [...activeProjectEventSinks.keys()],
        resolveProjectWorkspaceContext: resolveBoundProjectWorkspaceContext,
        resolveLocalConversationId: (projectId) =>
          getProjectCommentAnchorConversationId(db, projectId),
        mergeComment: ({ projectId, conversationId, comment }) =>
          mergeSyncedPreviewComment(db, projectId, conversationId, comment),
        onError: (error) => console.warn('[od] collab cloud sync error:', error),
        onCommentPushed: ({ projectId, commentId, seq }) => {
          confirmPreviewCommentPinSeq(db, projectId, commentId, seq);
        },
        // Collab realtime hop-2 (reference path): when the ~5s comment self-poll
        // merges any teammate change into local storage (a new comment, a
        // strictly-newer edit/status change, or a delete tombstone all count),
        // push a thin `comment-changed` onto the project's existing events SSE.
        // The open project view re-fetches the comment list on receipt, so the
        // owner sees a member's freshly-synced comment without waiting for the
        // web poll tick.
        onMerged: ({ projectId }) =>
          emitProjectEvent(projectId, {
            type: 'comment-changed',
            projectId,
            at: Date.now(),
          }),
      })
    : null;
  // The poller registers each open project's exact bound membership before it
  // pulls. There is deliberately no ambient startup registration: no project
  // scope exists yet, so active-workspace state is not data-plane authority.
  collabCloud?.start();
  // Server-authoritative owner lookup for register-on-pull: read the shared
  // project's owner from the team hub (the same list the discovery endpoint
  // serves) rather than trusting a client-supplied id, so a pulled project is
  // recorded read-only under its true single writer.
  type TeamProjectsDisplayScope = {
    workspaceId: string;
    workspaceMemberId: string;
  };
  const teamProjectsDisplayScopeFromContext = (
    context: WorkspaceCollabContext | null,
  ): TeamProjectsDisplayScope | null => {
    if (
      !context
      || context.workspaceType !== 'team'
      || context.memberStatus !== 'active'
      || context.lifecycleState === 'deleted'
    ) {
      return null;
    }
    const workspaceId = context.workspaceId.trim();
    const workspaceMemberId = context.workspaceMemberId.trim();
    return workspaceId && workspaceMemberId
      ? { workspaceId, workspaceMemberId }
      : null;
  };
  const teamProjectsDisplayScopeKey = (
    scope: TeamProjectsDisplayScope,
  ): string => JSON.stringify([scope.workspaceId, scope.workspaceMemberId]);
  // Persistent snapshot layer for the display catalog. Each fetcher and digest
  // reader closes over one immutable Workspace scope; no await can retarget it
  // through a later active-workspace switch.
  const teamProjectsCatalogSnapshots = new Map<
    string,
    ReturnType<typeof createPersistentSyncCache<TeamProject[]>>
  >();
  const teamProjectsCatalogSnapshotFor = (
    scope: TeamProjectsDisplayScope,
  ) => {
    const key = teamProjectsDisplayScopeKey(scope);
    let snapshot = teamProjectsCatalogSnapshots.get(key);
    if (!snapshot) {
      const capturedScope = { ...scope };
      snapshot = createPersistentSyncCache({
        face: 'catalog',
        fetch: () => teamProjectsLister(capturedScope.workspaceId),
        readDigest: createSyncDigestReader({
          env: process.env,
          getWorkspaceId: () => capturedScope.workspaceId,
          onError: (error) =>
            console.warn('[od] team projects digest error:', error),
        }),
        store: collabSyncSnapshots,
        parseSnapshot: parseTeamProjectSnapshot,
        onError: (error) =>
          console.warn('[od] team projects snapshot cache error:', error),
      });
      teamProjectsCatalogSnapshots.set(key, snapshot);
    }
    return snapshot;
  };
  // Short-TTL, single-flight cache for the read-only DISPLAY path
  // (GET /api/workspace/projects/team). Each entry is keyed by the explicit,
  // immutable workspace + member scope captured for that request, so a later
  // active-workspace switch cannot retarget an in-flight read or its cache
  // write. Deliberately NOT used by resolveSharedProject below: the pull gate
  // and comment/presence relays must observe an unshare immediately, so those
  // use the uncached exact lookup. A just-shared/unshared project shows up in
  // this list within the TTL.
  const teamProjectsDisplayCache = (() => {
    const freshMs = 3000;
    const lists = new Map<
      string,
      ReturnType<typeof createSwrCache<TeamProject[]>>
    >();
    const workspaceIds = new Map<string, string>();
    const read = (scope: TeamProjectsDisplayScope) => {
      const key = teamProjectsDisplayScopeKey(scope);
      let list = lists.get(key);
      if (!list) {
        const snapshot = teamProjectsCatalogSnapshotFor(scope);
        list = createSwrCache(
          () => snapshot(),
          () => key,
          freshMs,
        );
        lists.set(key, list);
        workspaceIds.set(key, scope.workspaceId);
      }
      return list();
    };
    return Object.assign(read, {
      invalidate(scope?: TeamProjectsDisplayScope) {
        if (scope) {
          const key = teamProjectsDisplayScopeKey(scope);
          lists.get(key)?.invalidate();
          lists.delete(key);
          workspaceIds.delete(key);
          teamProjectsCatalogSnapshots.get(key)?.invalidate();
          teamProjectsCatalogSnapshots.delete(key);
          return;
        }
        for (const list of lists.values()) list.invalidate();
        for (const snapshot of teamProjectsCatalogSnapshots.values()) {
          snapshot.invalidate();
        }
        lists.clear();
        teamProjectsCatalogSnapshots.clear();
        workspaceIds.clear();
      },
      invalidateWorkspace(workspaceIdInput: string) {
        const workspaceId = workspaceIdInput.trim();
        if (!workspaceId) return;
        for (const [key, cachedWorkspaceId] of workspaceIds) {
          if (cachedWorkspaceId !== workspaceId) continue;
          lists.get(key)?.invalidate();
          lists.delete(key);
          teamProjectsCatalogSnapshots.get(key)?.invalidate();
          teamProjectsCatalogSnapshots.delete(key);
          workspaceIds.delete(key);
        }
      },
    });
  })();
  /**
   * Drop catalog rows this member has already moved back to "personal".
   *
   * A move to personal deletes the hub catalog row in the same request, but
   * every display read above goes through a stale-while-revalidate cache, so
   * for up to one TTL the list still carries the row that was just deleted.
   * That is long enough to paint the "shared" badge back onto a project the
   * user just made private — the unshare looks like it silently reverted. It
   * would also let the publish watcher re-adopt the project as owned-and-
   * shared and republish it.
   *
   * `cloudTombstonedAt` on the local workspace row is the truth for "this
   * member unshared it"; a re-share clears it (see `workspaceProjectMovePatch`
   * in routes/project). The filter runs on the cache OUTPUT, not inside it, so
   * a value cached before the unshare is still gated. Owner scoping keeps a
   * teammate's own share of the same project id visible.
   */
  const withoutLocallyUnsharedProjects = async <
    T extends { projectId: string; ownerMemberId: string },
  >(
    projects: T[],
    explicitScope?: { workspaceId: string; workspaceMemberId: string },
  ): Promise<T[]> => {
    if (!explicitScope || projects.length === 0) return projects;
    const { workspaceId, workspaceMemberId: memberId } = explicitScope;
    const tombstoned = new Set(
      listWorkspaceProjects(db, workspaceId)
        .filter((row: any) => row.workspaceVisibility === 'personal' && row.cloudTombstonedAt != null)
        .map((row: any) => row.id),
    );
    if (tombstoned.size === 0) return projects;
    return projects.filter(
      (entry) => !(entry.ownerMemberId === memberId && tombstoned.has(entry.projectId)),
    );
  };
  const teamProjectsForDisplay = async (
    context: WorkspaceCollabContext | null,
  ): Promise<TeamProject[]> => {
    const scope = teamProjectsDisplayScopeFromContext(context);
    if (!scope) return [];
    return withoutLocallyUnsharedProjects(
      await teamProjectsDisplayCache(scope),
      scope,
    );
  };
  const teamProjectsForRequest = async (
    context: WorkspaceCollabContext,
  ): Promise<TeamProject[]> =>
    withoutLocallyUnsharedProjects(
      await teamProjectsLister(context.workspaceId),
      {
        workspaceId: context.workspaceId,
        workspaceMemberId: context.workspaceMemberId,
      },
    );
  /**
   * Non-destructive quarantine marker for a pulled Team mirror. The binding
   * state is the central data-plane gate; the project metadata marker also
   * protects legacy/raw read surfaces and records why the bytes remain on
   * disk. Only a later authorized materialization clears it.
   */
  const revokedTeamProjectMirrors = new Set(
    listProjects(db)
      .filter((project: any) => project?.metadata?.teamMirrorRevokedAt)
      .map((project: any) => project.id as string),
  );
  const setTeamProjectMirrorRevoked = (
    projectId: string,
    revoked: boolean,
  ): void => {
    const project = getProject(db, projectId);
    if (!project) return;
    const metadata: Record<string, unknown> = {
      ...((project.metadata as Record<string, unknown> | null) ?? {}),
    };
    if (revoked) {
      revokedTeamProjectMirrors.add(projectId);
      if (metadata.teamMirrorRevokedAt) return;
      metadata.teamMirrorRevokedAt = Date.now();
    } else {
      revokedTeamProjectMirrors.delete(projectId);
      if (!metadata.teamMirrorRevokedAt) return;
      delete metadata.teamMirrorRevokedAt;
    }
    updateProject(db, projectId, {
      metadata,
      updatedAt: SYNC_KEEPS_UPDATED_AT,
    });
  };
  // Collab realtime reconciliation: react to a `team-projects-changed` signal
  // (hub push OR the 15s poller's own diff, wired below) by actually
  // re-checking this daemon's `workspace_projects` rows against the remote
  // catalog, not just refreshing the display cache. See
  // `collab/workspace-projects-reconciler.ts` for the full design and its
  // relationship to `reconcileUnboundProjectBeforeMove` /
  // `reconcileLocalRowWithRemoteTeamAccess` (routes/project/index.ts), which
  // this does NOT replace.
  const workspaceProjectsReconcilerDeps = (
    requestedWorkspaceId: string,
  ): WorkspaceProjectsReconcilerDeps => {
    // Capture the trigger's Workspace before the first await. Hub events pass
    // their subscribed/event Workspace and pollers pass their persisted exact
    // subscription scope. The directory then verifies that identity once, and
    // the result is carried through every catalog/list/tombstone step below.
    const capturedWorkspaceId = requestedWorkspaceId.trim();
    return {
      getWorkspaceIdentity: async () => {
        if (!capturedWorkspaceId) return null;
        const directory = await fetchWorkspaceDirectory().catch(() => ({
          ok: false,
          items: [],
        }));
        if (!directory.ok) return null;
        const scope = teamResourceRequestScopeForWorkspaceId(
          directory.items,
          capturedWorkspaceId,
        );
        if (!scope) return null;
        return {
          workspaceId: capturedWorkspaceId,
          workspaceMemberId: scope.principal.memberId,
          principal: scope.principal,
        };
      },
      // Membership, not display: a catalog row whose latest publish failed is
      // still registered to its owner, so it must keep counting as "remote
      // lists it" here even though the display list hides it. Judging this
      // dep by the display read demoted a teammate's sync-failed mirror into
      // a self-attributed personal draft (recvqzjnshIlOe) — see
      // `reconcilerRemoteTeamProjects`'s invariant comment. Both sources run
      // through `withoutLocallyUnsharedProjects` so a row this member just
      // moved back to personal cannot be re-bound out from under the move
      // while the hub deletion is still propagating.
      // The membership read is deliberately UNCACHED (the raw catalog client,
      // not the SWR-wrapped display caches): reconciliation only runs on
      // team-projects-changed signals, and a ≤TTL-stale list here is exactly
      // the shape that misreads a just-shared row as absent.
      listRemoteTeamProjects: async (identity) => {
        // An absent row is destructive evidence only when the complete,
        // unfiltered catalog was read successfully. The display list hides
        // failed/pending publishes, so falling back to it could mistake a
        // partial view for a real unshare and revoke a valid mirror. Throwing
        // here makes the reconciler fail closed and leave every local binding
        // untouched until the authoritative transport is available again.
        if (!velaCliWorkspaceTeamProjectCatalog) {
          throw new Error('complete team project catalog unavailable');
        }
        return reconcilerRemoteTeamProjects({
          listCatalogMembership: async () =>
            (await withoutLocallyUnsharedProjects(
              await velaCliWorkspaceTeamProjectCatalog.list(identity.principal),
              {
                workspaceId: identity.workspaceId,
                workspaceMemberId: identity.workspaceMemberId,
              },
            )).map((record) => ({
              projectId: record.projectId,
              ownerMemberId: record.ownerMemberId,
              displayName: record.displayName,
              catalogRevisionAt: Number.isFinite(Date.parse(record.updatedAt))
                ? Date.parse(record.updatedAt)
                : null,
              originProjectUpdatedAt: record.originProjectUpdatedAt,
            })),
          listDisplayTeamProjects: async () => {
            throw new Error('display team project catalog is not authoritative');
          },
        });
      },
      // Materialization gate for the bind direction — see the dep's doc
      // comment in workspace-projects-reconciler.ts. `getProject` is the same
      // `projects`-table read `workspace_projects`' FOREIGN KEY points at.
      hasLocalProject: (projectId) => getProject(db, projectId) != null,
      listLocalTeamRows: (workspaceId): LocalTeamProjectBinding[] =>
        listWorkspaceProjects(db, workspaceId)
          .filter((row: any) => row.workspaceVisibility === 'team')
          .map((row: any) => ({
            projectId: row.id,
            workspaceId: row.workspaceId,
            visibility: row.workspaceVisibility,
            resourceState: row.resourceState ?? null,
            createdByWorkspaceMemberId: row.createdByWorkspaceMemberId ?? null,
            resourceHubResourceId: row.resourceHubResourceId ?? null,
          })),
      getLocalBinding: (projectId): LocalTeamProjectBinding | null => {
        const row = getWorkspaceProjectByProjectId(db, projectId) as any;
        if (!row) return null;
        return {
          projectId,
          workspaceId: row.workspaceId,
          visibility: row.visibility,
          resourceState: row.resourceState ?? null,
          createdByWorkspaceMemberId: row.createdByWorkspaceMemberId ?? null,
          resourceHubResourceId: row.resourceHubResourceId ?? null,
        };
      },
      getLocalProjectMetadata: (projectId) => {
        const project = getProject(db, projectId);
        return project
          ? { name: project.name, updatedAt: project.updatedAt }
          : null;
      },
      applyMetadataRefresh: (projectId, patch) => {
        // `patch.updatedAt` is the owner's origin project time carried in the
        // catalog metadata, never the catalog row's retry/observation time.
        updateProject(db, projectId, patch);
      },
      applyBind: (projectId, patch) => {
        // `rebindWorkspaceProject` only corrects an EXISTING row (it never
        // inserts — see its own doc comment in db.ts); a project this daemon
        // has never locally bound at all needs `ensureWorkspaceProject`
        // instead, seeded with the same patch so the fresh row is correct on
        // arrival.
        //
        // Reconciling a binding against B's catalog changes no project content,
        // so it must not restamp "last changed" — see SYNC_KEEPS_UPDATED_AT.
        const synced = { ...patch, updatedAt: SYNC_KEEPS_UPDATED_AT };
        if (rebindWorkspaceProject(db, projectId, synced)) return;
        ensureWorkspaceProject(db, { projectId, ...synced });
      },
      applyDemote: (workspaceId, projectId, patch) => updateWorkspaceProject(db, workspaceId, projectId, {
        ...patch,
        updatedAt: SYNC_KEEPS_UPDATED_AT,
      }),
      applyRevoke: (workspaceId, projectId, patch) => {
        // Write the binding denial before the metadata marker. A crash between
        // the two operations therefore fails closed, never open. The
        // transaction keeps the auditable marker and authority state aligned.
        db.transaction(() => {
          updateWorkspaceProject(db, workspaceId, projectId, {
            ...patch,
            updatedAt: SYNC_KEEPS_UPDATED_AT,
          });
          setTeamProjectMirrorRevoked(projectId, true);
        })();
      },
      onError: (error) => console.warn('[od] workspace-projects reconciliation error:', error),
    };
  };
  const reconcileWorkspaceProjectsFromRemote = (
    requestedWorkspaceId: string,
  ) => reconcileWorkspaceProjectsWithRemote(
    workspaceProjectsReconcilerDeps(requestedWorkspaceId),
  );
  const reconcileWorkspaceProjectMetadataFromRemote = (
    requestedWorkspaceId: string,
    projectId: string,
  ) => reconcileWorkspaceProjectMetadataWithRemote(
    workspaceProjectsReconcilerDeps(requestedWorkspaceId),
    projectId,
  );
  const resolveSharedProject = async (
    projectId: string,
    scope?: TeamMirrorPullScope | null,
  ) => {
    // Catalog reads are data-plane operations: never let the Vela adapter
    // substitute the daemon's mutable active Workspace.
    if (!scope?.workspaceId || !scope.viewerMemberId) return null;
    const project = velaCliTeamProjectCatalog
      ? await velaCliTeamProjectCatalog.get(projectId, scope.workspaceId)
      : (await teamProjectsLister(scope.workspaceId))
          .find((entry) => entry.projectId === projectId) ?? null;
    if (!project) return null;
    return (await withoutLocallyUnsharedProjects(
      [project],
      {
        workspaceId: scope.workspaceId,
        workspaceMemberId: scope.viewerMemberId,
      },
    ))[0] ?? null;
  };
  // Security-sensitive ownership decisions stay fresh. Pull, publish,
  // presence, and mutation paths all use this exact lookup so an unshare or
  // member revocation is observed immediately.
  const resolveSharedProjectOwner = async (
    projectId: string,
    explicitScope: { workspaceId: string; workspaceMemberId: string },
  ): Promise<string | null> => {
    const list = await withoutLocallyUnsharedProjects(
      await teamProjectsLister(explicitScope.workspaceId),
      explicitScope,
    );
    return list.find((entry) => entry.projectId === projectId)?.ownerMemberId ?? null;
  };
  // GET /collab/status is a display read whose request authority has already
  // been verified. Reuse the explicit workspace+member catalog cache here so
  // repeated project-open polls do not each wait on another Vela list process.
  // No security-sensitive caller receives this resolver.
  const resolveSharedProjectOwnerForStatus = async (
    projectId: string,
    explicitScope: { workspaceId: string; workspaceMemberId: string },
  ): Promise<string | null> => {
    const list = await withoutLocallyUnsharedProjects(
      await teamProjectsDisplayCache(explicitScope),
      explicitScope,
    );
    return list.find((entry) => entry.projectId === projectId)?.ownerMemberId ?? null;
  };
  // Presence is project-bound data. Its relay scope comes only from the
  // persisted project binding; an ambient active workspace is never a fallback.
  const authoritativePresenceWorkspaces = new Set<string>();
  const presenceScopeFor = (projectId: string): string | undefined =>
    findTeamWorkspaceIdForProject(db, projectId)?.trim() || undefined;
  const verifyPresenceWorkspaceRequest = async (
    req: any,
    projectId: string,
    options: { fresh?: boolean; backgroundFresh?: boolean } = {},
  ) => {
    const verified = await verifyExplicitWorkspaceRequestContext(
      { req },
      options,
    );
    if (!verified.ok) return verified;
    const binding = getWorkspaceProjectByProjectId(db, projectId);
    if (
      binding?.workspaceId
      && binding.workspaceId !== verified.context.workspaceId
    ) {
      return {
        ok: false as const,
        status: 403 as const,
        code: 'WORKSPACE_ACCESS_DENIED' as const,
        message: 'the requested workspace does not own this project',
      };
    }
    return verified;
  };
  const presenceRoutes = registerCollabPresenceRoutes(app, {
    collab,
    // Null when this run has no vela-cli collab transport, which is what keeps
    // the process-local presence fallback reachable. See
    // `createCollabPresenceCloudClient` for the invariant.
    cloud: createCollabPresenceCloudClient(velaCliCollabClient, presenceScopeFor),
    verifyWorkspaceRequest: (req, projectId) =>
      verifyPresenceWorkspaceRequest(req, projectId, { fresh: false }),
    verifyWorkspaceLeaveRequest: (req, projectId) =>
      verifyPresenceWorkspaceRequest(req, projectId, { fresh: true }),
    verifyWorkspaceReadRequest: (req, projectId) =>
      verifyPresenceWorkspaceRequest(req, projectId, { fresh: false }),
    isProjectShared: async (projectId, context) => {
      const projectContext =
        context ?? await resolveBoundProjectWorkspaceContext(projectId);
      if (!projectContext || projectContext.workspaceType !== 'team') return false;
      return Boolean(
        await resolveSharedProjectOwner(projectId, {
          workspaceId: projectContext.workspaceId,
          workspaceMemberId: projectContext.workspaceMemberId,
        }),
      );
    },
    cloudAuthorizesProjectPresence: (projectId) => {
      const workspaceId = findTeamWorkspaceIdForProject(db, projectId)?.trim();
      return Boolean(
        workspaceId && authoritativePresenceWorkspaces.has(workspaceId),
      );
    },
  });
  invalidatePresenceReadCache = presenceRoutes.invalidatePresence;
  markPresenceReadCacheStale = presenceRoutes.markPresenceStale;
  // Author-side publish TRIGGER (C spec §D1): watch the projects THIS daemon's
  // member owns + has shared, and coalesce every file edit into a debounced
  // publish. The read-only gate (team-shared AND owner === me) means a member's
  // pulled copy is never watched, so an inbound pull can't loop into a publish and
  // a member can't publish edits to someone else's project.
  const collabPublishWatcher = createCollabPublishWatcher({
    notifyChanged: (projectId, principal) =>
      collab.scheduler.notifyChanged(projectId, 'file-change', principal),
    listProjectIds: () => listProjects(db).map((project: { id: string }) => project.id),
    shouldPublish: async (projectId) => {
      if (projectIsUnmaterializedSharedPlaceholder(projectId)) return false;
      const workspaceId = findTeamWorkspaceIdForProject(db, projectId)?.trim();
      if (!workspaceId) return false;
      const directory = await fetchWorkspaceDirectory().catch(() => ({
        ok: false as const,
        items: [],
      }));
      if (!directory.ok) return false;
      const scope = teamResourceRequestScopeForWorkspaceId(
        directory.items,
        workspaceId,
      );
      if (!scope?.canShare) return false;
      const ownerMemberId = await resolveSharedProjectOwner(projectId, {
        workspaceId,
        workspaceMemberId: scope.principal.memberId,
      });
      if (ownerMemberId !== scope.principal.memberId) return false;
      collab.rememberTeamShare(projectId, scope.principal);
      return scope.principal;
    },
    subscribeFiles: (projectId, onChange) => {
      const watchProject = getProject(db, projectId);
      const sub = subscribeFileEvents(PROJECTS_DIR, projectId, (evt) => {
        if (evt.type === 'file-changed') onChange();
      }, { metadata: watchProject?.metadata });
      return { unsubscribe: () => sub.unsubscribe() };
    },
    onError: (error) => console.warn('[od] collab publish watcher error:', error),
  });
  collabPublishWatcher.start();
  const sharedProjectPullProfiling =
    sharedProjectPullProfileEnabled(process.env);
  const verifyProjectWorkspaceContextForRequest = async (
    req: any,
    projectId?: string,
    options: { fresh?: boolean } = {},
  ) => {
    const verified = await verifyExplicitWorkspaceRequestContext(
      { req },
      options,
    );
    if (!verified.ok) return verified;
    if (projectId) {
      const binding = getWorkspaceProjectByProjectId(db, projectId);
      if (
        binding?.workspaceId
        && binding.workspaceId !== verified.context.workspaceId
      ) {
        return {
          ok: false as const,
          status: 403 as const,
          code: 'WORKSPACE_ACCESS_DENIED' as const,
          message: 'the requested workspace does not own this project',
        };
      }
    }
    return verified;
  };
  const verifiedWorkspaceContextForRequest = (
    req: any,
    projectId?: string,
  ) => verifyProjectWorkspaceContextForRequest(req, projectId);
  const verifiedWorkspaceReadContextForRequest = (
    req: any,
    projectId?: string,
  ) => verifyProjectWorkspaceContextForRequest(
    req,
    projectId,
    { fresh: false },
  );
  const resolveProjectCommentWorkspaceContextWith = async (
    req: any,
    projectId: string,
    verify: (
      req: any,
      projectId?: string,
    ) => ReturnType<typeof verifyProjectWorkspaceContextForRequest>,
  ) => {
    const binding = getWorkspaceProjectByProjectId(db, projectId);
    if (revokedTeamProjectMirrors.has(projectId)) {
      return {
        ok: false as const,
        status: 403 as const,
        code: 'WORKSPACE_PROJECT_PERMISSION_DENIED',
        message: 'workspace project read is not allowed',
      };
    }
    if (!binding?.workspaceId) {
      return { ok: true as const, context: null };
    }
    if (binding.resourceState === 'deleted') {
      return {
        ok: false as const,
        status: 403 as const,
        code: 'WORKSPACE_PROJECT_PERMISSION_DENIED',
        message: 'workspace project read is not allowed',
      };
    }
    const verified = await verify(req, projectId);
    if (!verified.ok) return verified;
    return { ok: true as const, context: verified.context };
  };
  const resolveProjectCommentWorkspaceContext = (
    req: any,
    projectId: string,
  ) => resolveProjectCommentWorkspaceContextWith(
    req,
    projectId,
    verifiedWorkspaceContextForRequest,
  );
  const resolveProjectCommentReadWorkspaceContext = (
    req: any,
    projectId: string,
  ) => resolveProjectCommentWorkspaceContextWith(
    req,
    projectId,
    verifiedWorkspaceReadContextForRequest,
  );
  const verifiedTeamMirrorScope = async (
    scope: TeamMirrorPullScope,
  ): Promise<boolean> => {
    const directory = await fetchWorkspaceDirectory().catch(() => ({
      ok: false as const,
      items: [],
    }));
    if (!directory.ok) return false;
    return directory.items.some(
      (item) =>
        item.workspaceId === scope.workspaceId
        && item.workspaceMemberId === scope.viewerMemberId
        && item.workspaceType === 'team'
        && item.memberStatus === 'active'
        && item.lifecycleState === 'active'
        && item.workspaceId === scope.resourceTeamId,
    );
  };
  const projectContentTransferStates =
    createProjectContentTransferStateStore({
      onChange: (scope, state) => {
        emitProjectEvent(scope.projectId, {
          type: 'project-content-transfer-state',
          projectId: scope.projectId,
          at: state.updatedAt,
        });
      },
    });
  let observeLegacyTeamProjectPull = async (
    _projectId: string,
    _scope: TeamMirrorPullScope,
    _version: number,
  ): Promise<void> => {};
  const collabSyncRoutes = registerCollabSyncRoutes(app, {
    collab,
    verifyWorkspaceRequest: verifiedWorkspaceContextForRequest,
    verifyWorkspaceReadRequest: verifiedWorkspaceReadContextForRequest,
    verifyWorkspaceScope: verifiedTeamMirrorScope,
    readContentTransferState: (projectId, scope) =>
      projectContentTransferStates.read({ projectId, ...scope }),
    beginContentTransfer: (projectId, scope, version) =>
      projectContentTransferStates.begin(
        { projectId, ...scope },
        version,
      ).token,
    finishContentTransfer: (projectId, scope, token, version) => {
      projectContentTransferStates.finish(
        { projectId, ...scope },
        token,
        version,
      );
    },
    // Register-on-pull: after a member pulls a shared project, insert a local
    // project record so it appears in /api/projects and opens read-only (the
    // member is not the owner). Idempotent — an already-local project is a no-op.
    projectStore: {
      get: (projectId) => getProject(db, projectId),
      has: (projectId) => getProject(db, projectId) != null,
      register: (input) => {
        insertProject(db, {
          id: input.id,
          name: input.name,
          skillId: input.skillId,
          designSystemId: input.designSystemId,
          metadata: input.metadata,
          createdAt: input.createdAt,
          updatedAt: input.updatedAt,
        });
      },
      update: (input) => {
        updateProject(db, input.id, {
          name: input.name,
          skillId: input.skillId,
          designSystemId: input.designSystemId,
          metadata: input.metadata,
          updatedAt: input.updatedAt,
        });
      },
      materializeTeamMirror: (input, scope) => materializePulledTeamMirror(db, input, scope),
      materializeAuthorizedTeamMirror: (input, scope, receipt) =>
        materializePulledTeamMirror(db, input, scope, receipt),
    },
    resolveProjectDir: async (projectId) => {
      const project = getProject(db, projectId);
      if (project) await ensureProject(PROJECTS_DIR, projectId, project.metadata);
      return resolveProjectShareDir(PROJECTS_DIR, projectId, project, resolveProjectDir);
    },
    resolvePullDir: (projectId) => resolveProjectDir(PROJECTS_DIR, projectId),
    readMaterializedVersion: (projectId, scope) => {
      const authorized = getTeamProjectMaterialization(
        db,
        scope.workspaceId,
        projectId,
      );
      return latestTeamProjectMaterializationVersion(
        authorized,
        teamResourceVersions.get(
          scope.workspaceId,
          'project-content',
          teamProjectContentResourceId(projectId, scope),
        ),
        projectId,
        scope,
      );
    },
    authorizedTeamProjectPull: {
      journalDir: teamMirrorPromotionJournalDir,
    },
    writeMaterializedVersion: (projectId, scope, version) =>
      teamResourceVersions.set(
        scope.workspaceId,
        'project-content',
        teamProjectContentResourceId(projectId, scope),
        String(version),
      ),
    onLegacyPullMaterialized: (projectId, scope, version) =>
      observeLegacyTeamProjectPull(projectId, scope, version),
    resolveSharedProject,
    resolveSharedProjectOwner,
    resolveSharedProjectOwnerForStatus,
    isTeamProjectRevoked: (projectId) =>
      revokedTeamProjectMirrors.has(projectId),
    // Non-destructive revocation flag for a pulled team mirror: the pull gate
    // sets it when a project has left the team (files stay on disk but stop
    // being served) and clears it on a successful re-pull. Read routes refuse to
    // serve a project once this is set.
    markTeamProjectRevoked: setTeamProjectMirrorRevoked,
    // Set/clear the unmaterialized shared-project placeholder stamp (the
    // recvqzaDvUU6B3 fresh-install wipe guard) — same non-destructive
    // metadata-flag pattern as markTeamProjectRevoked above.
    markSharedProjectPlaceholder: (projectId: string, placeholder: boolean) => {
      const project = getProject(db, projectId);
      if (!project) return;
      const metadata: Record<string, unknown> = { ...((project.metadata as Record<string, unknown> | null) ?? {}) };
      if (placeholder) {
        if (metadata[SHARED_PROJECT_PLACEHOLDER_METADATA_KEY]) return;
        metadata[SHARED_PROJECT_PLACEHOLDER_METADATA_KEY] = Date.now();
      } else {
        if (!metadata[SHARED_PROJECT_PLACEHOLDER_METADATA_KEY]) return;
        delete metadata[SHARED_PROJECT_PLACEHOLDER_METADATA_KEY];
      }
      // Raised on placeholder registration and lowered the moment a pull
      // materializes real content. Both are sync steps on someone else's
      // project — see SYNC_KEEPS_UPDATED_AT. This is the flag that made a
      // member's very first open of a shared project read 「刚刚更新」.
      updateProject(db, projectId, { metadata, updatedAt: SYNC_KEEPS_UPDATED_AT });
    },
    // Retracted-share heal (飞书 recvqA6qhV7St1): delete a placeholder record
    // whose backing hub resource turned out to be tombstoned. Re-checks the
    // placeholder stamp HERE — deletion is only ever legal for a record the
    // stamp proves contentless, so a pull that materialized real content
    // between the heal's decision and this call is never destroyed. The
    // `workspace_projects` binding (if any) goes with it via ON DELETE
    // CASCADE, and the empty content directory is removed best-effort.
    retireUnmaterializedSharedPlaceholder: (projectId: string) => {
      const project = getProject(db, projectId);
      if (!isUnmaterializedSharedPlaceholder(project)) return;
      dbDeleteProject(db, projectId);
      void removeProjectDir(PROJECTS_DIR, projectId).catch(() => {});
    },
    invalidateTeamProjectCatalog: () => {
      teamProjectsDisplayCache.invalidate();
      workspaceTeamProjectCatalog?.invalidate();
    },
    onTeamShareStateChanged: persistWorkspaceProjectVisibility,
    // See `notifyFilesChanged`'s doc comment on RegisterCollabSyncRoutesDeps
    // (recvq6CIesNvWZ): a pull's directory-replace can silently orphan the
    // project's chokidar watcher, so a successful pull notifies any open
    // FileViewer directly over the existing `file-changed` SSE channel
    // instead of depending on the watcher having survived the swap.
    notifyFilesChanged: (projectId: string) =>
      emitProjectEvent(projectId, { type: 'file-changed', path: '', kind: 'change' }),
    // A pull that replaces the "共享项目" placeholder record with the real
    // project name (registerPulledProject) changed metadata the web renders
    // from its `projects` state; push the existing `project-metadata-changed`
    // thin signal so the open view re-fetches the record instead of keeping
    // the placeholder title until a page reload (recvqhwv6RPU1j).
    notifyProjectMetadataChanged: (projectId: string) =>
      emitProjectEvent(projectId, {
        type: 'project-metadata-changed',
        projectId,
        at: Date.now(),
      }),
    ...(sharedProjectPullProfiling
      ? {
          onPullTiming: emitSharedProjectPullTiming,
        }
      : {}),
    // Resolve the owner's display name + role from the collab-cloud directory so
    // /collab/status can hand the client a named "shared project" banner.
    ...(collabCloud
      ? {
          resolveOwnerDisplayName: async (
            memberId: string,
            context: WorkspaceCollabContext,
          ) => {
            const entry = await collabCloud.resolveMember(memberId, context);
            return entry ? { displayName: entry.displayName, role: entry.role } : null;
          },
        }
      : {}),
  });
  // Hub push-channel consumer for 'project-content-changed' (recvqmKQRiIlYf):
  // when a teammate publishes new content for a shared project, pull it NOW —
  // daemon-side, no open tab required — through the SAME flow the member
  // web's POST /collab/pull runs (collabSyncRoutes.pullSharedProject, which
  // also coalesces the two when they race). Every guard is fail-closed and
  // every failure degrades silently to the web's ~5s status polling, which
  // stays running untouched as the fallback; see
  // collab/proactive-content-pull.ts for the guard boundary (never pull a
  // project this member owns; an unbound first share requires an exact
  // event-workspace/active-workspace match; dedupe by hub version).
  const proactiveTeamProjectMaterializedVersion = (
    target: ProactiveContentPullTarget,
  ) => {
    const authorized = getTeamProjectMaterialization(
      db,
      target.workspaceId,
      target.projectId,
    );
    const version = latestTeamProjectMaterializationVersion(
      authorized,
      teamResourceVersions.get(
        target.workspaceId,
        'project-content',
        teamProjectContentResourceId(target.projectId, target),
      ),
      target.projectId,
      target,
    );
    return version == null ? null : String(version);
  };
  // Background pull size guard (issue #6518, incident #6512): before any
  // background lane downloads a published version, an authorize-only Vela
  // probe reads the manifest entry count; oversized versions are deferred to
  // the foreground open-project pull. Fail-closed here means PULL AS BEFORE —
  // an old CLI, a countless output, or a probe failure keeps today's
  // behavior. See collab/background-pull-size-guard.ts.
  const backgroundPullSizeGuard = createBackgroundPullSizeGuard({
    maxEntries: backgroundPullMaxEntriesFromEnv(),
    inspect: (scope, version) =>
      inspectAuthorizedTeamProjectPull({
        projectId: scope.projectId,
        scope: {
          workspaceId: scope.workspaceId,
          resourceTeamId: scope.resourceTeamId,
          viewerMemberId: scope.viewerMemberId,
          ownerMemberId: scope.ownerMemberId,
        },
        expectedVersion: version,
      }),
    onDeferred: (info) => {
      console.info(
        '[od] background shared-project pull deferred (oversized): ' +
          `projectId=${info.projectId} workspaceId=${info.workspaceId} ` +
          `version=${info.version} entries=${info.entryCount} ` +
          `maxEntries=${info.maxEntries}; opening the project pulls it on demand`,
      );
    },
    onError: (error) =>
      console.warn(
        '[od] background pull size probe failed open (pulling as before):',
        String(error),
      ),
  });
  const proactiveContentPull = createProactiveContentPull({
    assessBackgroundContentPull: (target, version) =>
      backgroundPullSizeGuard.assess(target, version),
    getLocalBinding: (projectId) => {
      const row = getWorkspaceProjectByProjectId(db, projectId) as
        | { workspaceId: string; visibility: 'personal' | 'team' }
        | null;
      if (!row) return null;
      return { workspaceId: row.workspaceId, visibility: row.visibility };
    },
    // Resolve the event/binding Workspace itself. Global active Workspace is
    // control-plane selection only and cannot retarget or cancel this pull.
    getWorkspaceIdentity: async (workspaceId) =>
      activeTeamWorkspaceIdentity(
        await resolveAuthoritativeTeamWorkspaceContext(workspaceId),
      ),
    // A witness may skip the route's pre-transport catalog gate, so only this
    // uncached authoritative lookup is allowed to mint one. The display SWR
    // owner cache remains wired everywhere else.
    resolveSharedProjectOwner: async (projectId, workspaceId) => {
      const context =
        await resolveAuthoritativeTeamWorkspaceContext(workspaceId);
      const identity = activeTeamWorkspaceIdentity(context);
      if (!context || !identity) return null;
      return resolveSharedProjectOwner(projectId, {
        workspaceId: identity.workspaceId,
        workspaceMemberId: identity.workspaceMemberId,
      });
    },
    // Catch-up reads the rich catalog exactly once per verified connection
    // (or missing-project floor). Re-check the same exact directory scope
    // after the CLI await; changing global active Workspace is irrelevant.
    listSharedProjects: async (workspaceId) => {
      if (!velaCliWorkspaceTeamProjectCatalog) return [];
      const beforeContext =
        await resolveAuthoritativeTeamWorkspaceContext(workspaceId);
      if (!beforeContext) return [];
      const principal = contextToResourceHubPrincipal(beforeContext);
      if (!principal || principal.teamId !== workspaceId) return [];
      const projects = await velaCliWorkspaceTeamProjectCatalog.list(principal);
      const afterContext =
        await resolveAuthoritativeTeamWorkspaceContext(workspaceId);
      if (!afterContext) return [];
      const afterPrincipal = contextToResourceHubPrincipal(afterContext);
      if (
        !afterPrincipal
        || afterPrincipal.teamId !== principal.teamId
        || afterPrincipal.memberId !== principal.memberId
      ) {
        return [];
      }
      return projects
        .filter((project) => project.workspaceId === workspaceId && project.access.canView)
        .map((project) => ({
          projectId: project.projectId,
          ownerMemberId: project.ownerMemberId,
        }));
    },
    hasMaterializedProject: async (projectId, target) => {
      const project = getProject(db, projectId);
      if (!project) return false;
      // Authorized Vela mirrors contain the shared project files, not the
      // local-only `.open-design/project.json`. Their exact-scope receipt is
      // the durable version proof; the live directory proves the promoted
      // namespace still exists. Both are required so a deleted tree heals,
      // while another workspace/owner's receipt can never satisfy this pull.
      if (proactiveTeamProjectMaterializedVersion(target) == null) {
        return false;
      }
      const projectDir = resolveProjectShareDir(
        PROJECTS_DIR,
        projectId,
        project,
        resolveProjectDir,
      );
      const entry = await fs.promises.lstat(projectDir).catch(() => null);
      return Boolean(
        entry &&
        entry.isDirectory() &&
        !entry.isSymbolicLink(),
      );
    },
    materializedVersion: proactiveTeamProjectMaterializedVersion,
    // The resource is owner-scoped; the same captured team/owner principal is
    // used by the shared pull below. The member session remains the transport
    // credential, while Vela authorizes this explicit target principal.
    publishedHead: (target) =>
      collab.publishedHead(target.projectId, {
        teamId: target.resourceTeamId,
        memberId: target.ownerMemberId,
        role: 'member',
        lifecycleState: 'active',
        workspaceType: 'team',
      }),
    pullSharedProject: (target, expectedVersion) =>
      collabSyncRoutes.pullSharedProject(target.projectId, {
        workspaceId: target.workspaceId,
        resourceTeamId: target.resourceTeamId,
        viewerMemberId: target.viewerMemberId,
        ownerMemberId: target.ownerMemberId,
      }, target.authorizationWitness, expectedVersion, target.authorizedStageInvocation),
    // All Projects is a list-level surface and does not subscribe to every
    // project-scoped SSE. Once an inbound pull has actually materialized the
    // tree, nudge that surface so its failed pre-pull cover scan runs again
    // immediately instead of waiting for the 15s refresh floor.
    onPulled: async (target, version) => {
      emitWorkspaceEvent(target.workspaceId, {
        type: 'team-project-content-ready',
        projectId: target.projectId,
        workspaceId: target.workspaceId,
        at: Date.now(),
      });
    },
    ...(sharedProjectPullProfiling
      ? {
          onTiming: emitSharedProjectPullTiming,
        }
      : {}),
    onError: (error) =>
      console.warn('[od] proactive shared-project pull failed (web polling remains the fallback):', String(error)),
    onCatchUp: (event) => {
      if (
        event.phase === 'retry-scheduled' ||
        event.phase === 'retry-exhausted'
      ) {
        console.info(
          `[od] shared-project content catch-up ${event.phase} mode=${event.mode} lane=${event.lane} ` +
            `workspaceId=${event.workspaceId ?? 'unknown'} ` +
            `projectId=${event.projectId ?? 'all'} attempt=${event.attempt ?? event.failures ?? 0} ` +
            `delayMs=${event.delayMs ?? 0}`,
        );
        return;
      }
      if (event.phase === 'skipped') {
        console.info(
          `[od] shared-project content catch-up skipped mode=${event.mode} lane=${event.lane} reason=${event.reason ?? 'unknown'}`,
        );
        return;
      }
      if (event.phase === 'started') {
        console.info(
          `[od] shared-project content catch-up started mode=${event.mode} lane=${event.lane} workspaceId=${event.workspaceId ?? 'unknown'}`,
        );
        return;
      }
      console.info(
        `[od] shared-project content catch-up completed mode=${event.mode} lane=${event.lane} ` +
          `workspaceId=${event.workspaceId ?? 'unknown'} scanned=${event.scanned ?? 0} ` +
          `candidates=${event.candidates ?? 0} headChecks=${event.headChecks ?? 0} ` +
          `heads=${event.heads ?? 0} ` +
          `suppressed=${event.suppressed ?? 0} complete=${event.complete === true}`,
      );
    },
  });
  observeLegacyTeamProjectPull = (projectId, scope, version) =>
    proactiveContentPull.observeMaterialized(
      { projectId, ...scope },
      version,
    );
  // Stale-while-revalidate the member directory by explicit Workspace scope.
  // The web shell re-reads members on every navigation (and several mounted
  // consumers fetch it at once); the underlying collab-cloud read is ~1.5s, so
  // without this a home/drafts load serialized 5-7 slow member reads behind the
  // 6-connection cap. SWR serves the roster instantly after the first load and
  // refreshes in the background, so a member who joins still resolves within a
  // poll tick.
  // Same two-layer split as the catalog above: the persistent snapshot answers
  // the cold read (digest token unchanged -> serve the roster off disk), the SWR
  // above it answers the burst of consumers one navigation mounts at once.
  const teamMembersCache = collabCloud
    ? (() => {
        const snapshots = new Map<
          string,
          ReturnType<typeof createPersistentSyncCache<CollabCloudMemberDirectoryEntry[]>>
        >();
        const lists = new Map<
          string,
          ReturnType<typeof createSwrCache<CollabCloudMemberDirectoryEntry[]>>
        >();
        const read = (
          context: WorkspaceCollabContext,
        ): Promise<CollabCloudMemberDirectoryEntry[]> => {
          const scope = teamProjectsDisplayScopeFromContext(context);
          if (!scope) return Promise.resolve([]);
          const key = teamProjectsDisplayScopeKey(scope);
          let snapshot = snapshots.get(key);
          if (!snapshot) {
            const capturedContext = { ...context };
            snapshot = createPersistentSyncCache({
              face: 'members',
              fetch: () => collabCloud.listMembers(capturedContext),
              readDigest: createSyncDigestReader({
                env: process.env,
                getWorkspaceId: () => scope.workspaceId,
                onError: (error) =>
                  console.warn('[od] team members digest error:', error),
              }),
              store: collabSyncSnapshots,
              parseSnapshot: parseMemberDirectorySnapshot,
              onError: (error) =>
                console.warn('[od] team members snapshot cache error:', error),
            });
            snapshots.set(key, snapshot);
          }
          let list = lists.get(key);
          if (!list) {
            const capturedSnapshot = snapshot;
            list = createSwrCache(
              () => capturedSnapshot(),
              () => key,
              3000,
            );
            lists.set(key, list);
          }
          return list();
        };
        return Object.assign(read, {
          invalidate(context?: WorkspaceCollabContext) {
            const scope = context
              ? teamProjectsDisplayScopeFromContext(context)
              : null;
            if (scope) {
              const key = teamProjectsDisplayScopeKey(scope);
              lists.get(key)?.invalidate();
              lists.delete(key);
              snapshots.get(key)?.invalidate();
              snapshots.delete(key);
              return;
            }
            for (const list of lists.values()) list.invalidate();
            for (const snapshot of snapshots.values()) snapshot.invalidate();
            lists.clear();
            snapshots.clear();
          },
        });
      })()
    : null;
  const teamMembersForDisplay = async (
    context: WorkspaceCollabContext | null,
  ): Promise<CollabCloudMemberDirectoryEntry[]> => {
    if (!teamMembersCache) return [];
    return context ? teamMembersCache(context) : [];
  };
  const accountBillingSummary = createAccountBillingSummaryCache({
    identity: () => velaWorkspaceDirectoryIdentity(
      readVelaControlApiContext,
      configuredAmrEnv(),
    ),
    fetch: () => fetchVelaBillingSummary(),
  });
  const workspaceBillingRuntime = createWorkspaceBillingRuntimeCoordinator({
    fetchProjection: async ({ workspaceId }) => {
      try {
        // The Vela CLI sends only the Bearer credential plus workspace-id
        // candidate. Vela re-derives the member principal server-side, and
        // the runtime validates the returned member id before accepting it.
        return await fetchVelaWorkspaceBillingProjection(workspaceId);
      } catch (error) {
        if (isVelaWorkspaceAuthorizationError(error)) {
          throw new WorkspaceBillingAccessRevokedError();
        }
        throw error;
      }
    },
    onAccessRevoked: ({ workspaceId }) => {
      workspaceDirectoryAuthority.invalidate('auth_reject');
      workspaceExactAuthorityCache.invalidate(workspaceId);
      workspaceExactContextCache.invalidate(workspaceId, 'auth_reject');
    },
    onStateChange: (state) => {
      // The request that created a runtime already receives this state in its
      // response. Background catch-up/retry/poll completion needs a thin nudge
      // so old and new web clients re-read the same explicit route.
      if (!shouldEmitWorkspaceBillingRuntimeNudge(state)) return;
      emitWorkspaceEvent(state.workspaceId, {
        type: 'billing-changed',
        workspaceId: state.workspaceId,
        revision: `runtime:${state.revision}`,
        at: Date.now(),
      });
    },
    onInterestSetChange: (interests) => {
      workspaceHubSubscriptions?.setBillingInterests(
        interests.map((interest) => interest.workspaceId),
      );
    },
    onPollSuppressed: () => recordWorkspaceAuthoritySuppressedRequest({
      mode: workspaceAuthorityCacheMode,
      source: 'billing',
      reason: 'safety_floor',
    }),
  });
  /**
   * Warm or revalidate both digest faces for one exact directory-verified
   * Workspace/member identity. A UI switch uses the lightweight warm path;
   * reconnect/source-gap recovery invalidates only that scope first so a
   * still-fresh SWR entry cannot hide changes that happened while disconnected.
   */
  const refreshWorkspaceDigestFaces = async (
    workspaceId: string,
    options: { revalidate?: boolean; freshAuthority?: boolean } = {},
  ): Promise<void> => {
    if (!workspaceId) return;
    const context =
      await resolveAuthoritativeTeamWorkspaceContext(workspaceId, {
        fresh: options.freshAuthority,
      });
    if (options.revalidate) {
      const scope = teamProjectsDisplayScopeFromContext(context);
      if (scope) teamProjectsDisplayCache.invalidate(scope);
      teamMembersCache?.invalidate(context ?? undefined);
    }
    await Promise.all([
      teamProjectsForDisplay(context),
      teamMembersForDisplay(context),
    ]);
  };
  const warmWorkspaceDigestFaces = (workspaceId: string) => {
    if (!workspaceId) return;
    void refreshWorkspaceDigestFaces(workspaceId, {
      freshAuthority: true,
    }).catch(() => undefined);
  };
  let workspaceAnalyticsService: AnalyticsService | null = null;
  registerCollabContextRoutes(app, {
    workspaceContext: collab.workspaceContext,
    verifyWorkspaceReadAuthority: verifyWorkspaceContextReadAuthority,
    readCachedWorkspaceAuthority: cachedWorkspaceContextForRequest,
    activeWorkspace,
    // A tab-local selection leaves this exact Workspace's scoped caches cold.
    // Warm only the directory-verified id announced by that request; the
    // daemon-global legacy pin is neither read nor updated.
    onWorkspaceSwitched: (workspaceId) => warmWorkspaceDigestFaces(workspaceId),
    fetchBilling: accountBillingSummary.read,
    billingRuntime: workspaceBillingRuntime,
    // Same directory read the route would have made on its own, wrapped so every
    // workspace type it carries is memoized for the team-share invariant.
    listWorkspaceDirectory,
    fetchWorkspaceDirectory: fetchWorkspaceDirectoryForAccountSurface,
    refreshWorkspaceDirectoryAfterMutation:
      workspaceDirectoryAuthority.refreshAfterMutation,
    // Reuse the shared team-projects lister (which holds the shared vela-cli
    // catalog adapter). Without this the endpoint built a fresh adapter per
    // request and re-ran the one-off `vela team-projects --help` capability
    // probe — an extra CLI spawn (and, on the current CLI, a blocking analytics
    // POST) on every workspace projects load.
    listTeamProjects: teamProjectsForRequest,
    // Expose the collab-cloud member directory so the web client can resolve
    // comment authors + owner names to a name + role.
    ...(teamMembersCache ? { listMembers: teamMembersForDisplay } : {}),
    // Collab realtime hop-2: the workspace-scoped invalidation SSE. The route
    // registers/deregisters its sink here; the poller below feeds them.
    createSseResponse,
    workspaceEventSinks,
    retainWorkspaceEventInterest: (workspaceId) =>
      workspaceHubSubscriptions?.retainEventInterest(workspaceId)
      ?? (() => undefined),
    observeWorkspace: async (req, context, properties) => {
      const service = workspaceAnalyticsService;
      const analyticsContext = readAnalyticsContext(req);
      if (!service || !analyticsContext) return;
      await service.identifyGroup({
        context: analyticsContext,
        groupType: 'workspace',
        groupKey: context.workspaceId,
        properties: properties ?? {},
      });
    },
  });
  // Reconnect/source-gap recovery belongs to the Workspace whose upstream
  // subscription observed the gap. Keep one signature state per Workspace so
  // recovering subscribed A while B is the UI selection neither compares A
  // against B's digest nor drops A's refresh.
  const scopedWorkspaceInvalidationPollers = new Map<
    string,
    ReturnType<typeof createWorkspaceInvalidationPoller>
  >();
  const workspaceInvalidationPollerFor = (workspaceIdInput: string) => {
    const workspaceId = workspaceIdInput.trim();
    let poller = scopedWorkspaceInvalidationPollers.get(workspaceId);
    if (!poller) {
      poller = createWorkspaceInvalidationPoller({
        getWorkspaceContext: async () => {
          const context =
            await resolveAuthoritativeTeamWorkspaceContext(workspaceId);
          workspaceTypes.learn(context);
          return context;
        },
        listTeamProjects: (context) => teamProjectsForDisplay(context),
        listMembers: (context) => teamMembersForDisplay(context),
        emit: (payload, context) => {
          handlePolledWorkspaceInvalidation(
            payload,
            (scopedPayload) =>
              emitWorkspaceEvent(workspaceId, scopedPayload),
            () => reconcileWorkspaceProjectsFromRemote(
              activeTeamWorkspaceIdentity(context)?.workspaceId ?? workspaceId,
            ),
          );
        },
        onTeamProjectsObserved: ({ workspaceId: observedWorkspaceId }) =>
          proactiveContentPull.advanceRecoveryFloor(observedWorkspaceId),
        onPollSuppressed: () => recordWorkspaceAuthoritySuppressedRequest({
          mode: workspaceAuthorityCacheMode,
          source: 'directory',
          reason: 'safety_floor',
        }),
        onError: (error) =>
          console.warn(
            `[od] workspace ${workspaceId} invalidation recovery error:`,
            error,
          ),
      });
      scopedWorkspaceInvalidationPollers.set(workspaceId, poller);
    }
    return poller;
  };
  const pollWorkspaceInvalidationForWorkspace = (
    workspaceIdInput: string,
  ): Promise<void> => {
    const workspaceId = workspaceIdInput.trim();
    if (!workspaceId) return Promise.resolve();
    return workspaceInvalidationPollerFor(workspaceId).pollOnce();
  };
  const workspaceAuthorityHealth = createWorkspaceAuthorityHealthCoordinator({
    mode: workspaceAuthorityCacheMode,
    catchUp: async (workspaceId) => {
      // A healthy transport is not enough to suppress legacy polling. First
      // cross a fresh directory boundary and close the exact Workspace gap.
      workspaceDirectoryAuthority.invalidate('catch_up');
      workspaceExactAuthorityCache.invalidate(workspaceId);
      workspaceExactContextCache.invalidate(workspaceId, 'catch_up');
      const directory = await fetchFreshBackgroundWorkspaceDirectory();
      const membership = directory.ok
        ? directory.items.find((item) =>
            item.workspaceId === workspaceId
            && item.memberStatus === 'active'
            && item.lifecycleState !== 'deleted')
        : undefined;
      if (!membership) {
        throw new Error('exact workspace directory catch-up was unavailable');
      }
      const exactContext = await workspaceExactContextCache.refresh(
        { workspaceId },
        'catch_up',
      );
      if (!exactContext || exactContext.workspaceId !== workspaceId) {
        throw new Error('exact workspace catch-up was unavailable');
      }
      await refreshWorkspaceDigestFaces(workspaceId, {
        revalidate: true,
      });
      await pollWorkspaceInvalidationForWorkspace(workspaceId);
      workspaceBillingRuntime.reconnect(workspaceId);
    },
    setDirectoryPollingHealthy: (workspaceId, healthy) =>
      workspaceInvalidationPollerFor(workspaceId).setRealtimeHealthy(healthy),
    setBillingPollingHealthy: (workspaceId, healthy) =>
      workspaceBillingRuntime.setRealtimeHealthy(workspaceId, healthy),
    setContextCachingHealthy: (workspaceId, healthy) => {
      workspaceExactAuthorityCache.setRealtimeHealthy(workspaceId, healthy);
      workspaceExactContextCache.setRealtimeHealthy(workspaceId, healthy);
    },
    onDecision: (input) => recordWorkspaceAuthorityDecision({
      mode: workspaceAuthorityCacheMode,
      ...input,
    }),
    onError: (error) => {
      console.warn(
        '[od] workspace authority catch-up failed; retaining legacy polling:',
        String(error),
      );
    },
  });
  // Collab realtime hop-1: cloud hub → daemon push channel. The hub emits the
  // same thin invalidation signals the web would otherwise discover by
  // polling. Every upstream stream comes from an explicit leased Workspace
  // interest; reconnect/source-gap handlers run one exact-scope poller cycle
  // to close the disconnect gap.
  const dirtyCommentProjects = new Set<string>();
  // Thin events are invalidation hints, so repeated events for one resource
  // may share refresh work. Authorization revocation and project content stay
  // outside this coordinator: both have immediate, domain-specific handling.
  const hubEventRefreshes = createEventRefreshCoordinator({
    onError: (error, key) => {
      console.warn(`[od] hub event refresh failed key=${key}:`, String(error));
    },
  });
  const workspaceDirectoryRefreshes = createEventRefreshCoordinator({
    // Directory events are account-wide and can be duplicated over several
    // Workspace streams. Preserve an immediate leading refresh plus the final
    // state while bounding a sustained storm to one upstream read per second.
    minIntervalMs: 1_000,
    onError: (error) => {
      console.warn('[od] workspace directory event refresh failed:', String(error));
    },
  });
  const directoryConnectionIdentities = new Map<string, string>();
  const directoryHealthyConnections = new Set<string>();
  const directoryConnectionKey = (
    workspaceId: string,
    identityKey: string,
  ) => `${identityKey}\0${workspaceId}`;
  const currentWorkspaceDirectoryIdentity = () =>
    velaWorkspaceDirectoryIdentity(
      readVelaControlApiContext,
      configuredAmrEnv(),
    );
  const syncWorkspaceDirectoryRealtimeHealth = (): void => {
    const currentIdentity = currentWorkspaceDirectoryIdentity();
    workspaceDirectoryAuthority.setRealtimeHealthy(
      [...directoryHealthyConnections].some((key) =>
        key.startsWith(`${currentIdentity}\0`)),
    );
  };
  const requestWorkspaceDirectoryRefresh = (
    reason: 'event_dirty' | 'auth_reject' | 'catch_up',
    token?: string,
    expectedIdentity = currentWorkspaceDirectoryIdentity(),
  ): void => {
    workspaceDirectoryRefreshes.request(
      'workspace-directory',
      async () => {
        if (currentWorkspaceDirectoryIdentity() !== expectedIdentity) return;
        workspaceDirectoryAuthority.invalidate(reason);
        const directory = await fetchFreshBackgroundWorkspaceDirectory();
        if (currentWorkspaceDirectoryIdentity() !== expectedIdentity) return;
        if (!directory.ok) return;
        emitWorkspaceDirectoryChanged();
      },
      token,
    );
  };
  const restoreDirtyCommentProject = (projectId: string) => {
    dirtyCommentProjects.add(projectId);
    // The upstream hub event has already proved that this project changed.
    // If the daemon's eager pull lost a transient race (for example a failed
    // Vela CLI/TLS attempt), wake the open view once so its exact-scoped list
    // read can redeem the retained dirty mark immediately. That read awaits
    // its pull before serializing comments; a failed read deliberately does
    // not signal again, avoiding a retry storm while the 30s poll remains the
    // recovery floor.
    if (activeProjectEventSinks.has(projectId)) {
      emitProjectEvent(projectId, {
        type: 'comment-changed',
        projectId,
        at: Date.now(),
      });
    }
  };
  const emitTeamProjectsChanged = createTeamProjectsChangeEmitter({
    invalidateWorkspace: (workspaceId) => {
      teamProjectsDisplayCache.invalidateWorkspace(workspaceId);
      workspaceTeamProjectCatalog?.invalidateWorkspace(workspaceId);
    },
    emit: emitWorkspaceEvent,
    warmWorkspace: async (workspaceId) => {
      const context = await resolveAuthoritativeTeamWorkspaceContext(workspaceId);
      await teamProjectsForDisplay(context);
    },
  });
  const startWorkspaceHubSubscriber = (subscribedWorkspaceId: string) =>
    startHubEventsSubscriber({
    resolveEndpoint: async () => {
      // Same gating as the workspace-context provider: only the vela source
      // has a hub to subscribe to (dev daemons must not dial production).
      if (process.env.OD_WORKSPACE_CONTEXT_SOURCE?.trim() !== 'vela') return null;
      return resolveVelaWorkspaceHubEventsEndpoint(
        subscribedWorkspaceId,
        process.env,
        configuredAmrEnv(),
      );
    },
    onStateChange: (state, connection) => {
      if (state === 'disconnected') {
        authoritativePresenceWorkspaces.delete(subscribedWorkspaceId);
        const identityKey =
          connection.identityKey
          ?? directoryConnectionIdentities.get(subscribedWorkspaceId);
        if (
          !identityKey
          || directoryConnectionIdentities.get(subscribedWorkspaceId)
            === identityKey
        ) {
          directoryConnectionIdentities.delete(subscribedWorkspaceId);
        }
        if (identityKey) {
          directoryHealthyConnections.delete(
            directoryConnectionKey(subscribedWorkspaceId, identityKey),
          );
        }
        syncWorkspaceDirectoryRealtimeHealth();
      }
      console.info(`[od] hub events channel ${state}`);
    },
    onAuthorityHealthChange: ({
      workspaceId,
      identityKey,
      healthy,
      capabilities,
      listenerStatus,
    }) => {
      if (
        identityKey
        && identityKey !== currentWorkspaceDirectoryIdentity()
      ) {
        return;
      }
      const exactWorkspaceId = workspaceId ?? subscribedWorkspaceId;
      const exactIdentityKey =
        identityKey
        ?? directoryConnectionIdentities.get(exactWorkspaceId)
        ?? currentWorkspaceDirectoryIdentity();
      if (capabilities.includes(WORKSPACE_DIRECTORY_EVENTS_CAPABILITY)) {
        directoryConnectionIdentities.set(exactWorkspaceId, exactIdentityKey);
      } else {
        directoryConnectionIdentities.delete(exactWorkspaceId);
      }
      const connectionKey = directoryConnectionKey(
        exactWorkspaceId,
        exactIdentityKey,
      );
      if (
        healthy
        && capabilities.includes(WORKSPACE_DIRECTORY_EVENTS_CAPABILITY)
      ) {
        directoryHealthyConnections.add(connectionKey);
      } else {
        directoryHealthyConnections.delete(connectionKey);
      }
      syncWorkspaceDirectoryRealtimeHealth();
      recordWorkspaceAuthorityRealtimeTransition({
        mode: workspaceAuthorityCacheMode,
        healthy,
        memberEvents: capabilities.includes('workspace-member-events-v1'),
        listenerStatus: capabilities.includes(
          'workspace-event-listener-status-v1',
        ),
        sourceGap: listenerStatus?.sourceGap === true,
      });
      void workspaceAuthorityHealth.update({
        workspaceId: exactWorkspaceId,
        healthy,
      });
    },
    onConnect: ({ reconnect, workspaceId, identityKey, capabilities }) => {
      if (
        identityKey
        && identityKey !== currentWorkspaceDirectoryIdentity()
      ) {
        return;
      }
      const verifiedWorkspaceId = workspaceId ?? subscribedWorkspaceId;
      const verifiedIdentityKey =
        identityKey ?? currentWorkspaceDirectoryIdentity();
      if (capabilities.includes(AUTHORITATIVE_PROJECT_PRESENCE_CAPABILITY)) {
        authoritativePresenceWorkspaces.add(verifiedWorkspaceId);
      } else {
        authoritativePresenceWorkspaces.delete(verifiedWorkspaceId);
      }
      if (capabilities.includes(WORKSPACE_DIRECTORY_EVENTS_CAPABILITY)) {
        const hadDirectoryCarrier = [
          ...directoryConnectionIdentities.values(),
        ].includes(verifiedIdentityKey);
        directoryConnectionIdentities.set(
          verifiedWorkspaceId,
          verifiedIdentityKey,
        );
        // One account signal is fanned to every capable stream. Only the first
        // live carrier needs a snapshot boundary; additional Workspace streams
        // would produce the same GET and are intentionally free.
        if (!hadDirectoryCarrier) {
          requestWorkspaceDirectoryRefresh(
            'catch_up',
            undefined,
            verifiedIdentityKey,
          );
        }
      }
      console.info(
        `[od] hub events workspace verified workspaceId=${workspaceId ?? 'unknown'} reconnect=${reconnect}`,
      );
      handleHubVerifiedConnection(
        verifiedWorkspaceId,
        (exactWorkspaceId) =>
          proactiveContentPull.catchUpPublishedHeads(exactWorkspaceId),
        (exactWorkspaceId) => {
          // A reconnect is closed exactly once by onReconnect below. Keep
          // this initial-connect hook from scheduling a duplicate catch-up.
          if (!reconnect) workspaceBillingRuntime.reconnect(exactWorkspaceId);
        },
      );
    },
    onDrop: ({ reason, eventName, expectedWorkspaceId, actualWorkspaceId }) => {
      console.warn(
        `[od] hub event dropped reason=${reason} event=${eventName} ` +
          `expectedWorkspaceId=${expectedWorkspaceId ?? 'unknown'} ` +
          `actualWorkspaceId=${actualWorkspaceId ?? 'unknown'}`,
      );
    },
    onAccessRevoked: ({ workspaceId, identityKey, reason }) => {
      if (
        identityKey
        && identityKey !== currentWorkspaceDirectoryIdentity()
      ) {
        return;
      }
      const revocationReceivedAt = performance.now();
      const exactWorkspaceId = workspaceId ?? subscribedWorkspaceId;
      console.info(
        `[od] hub workspace access revoked workspaceId=${exactWorkspaceId} reason=${reason ?? 'unknown'}`,
      );
      handleHubWorkspaceAccessRevoked(
        exactWorkspaceId,
        () => pollWorkspaceInvalidationForWorkspace(exactWorkspaceId),
        () => {
          workspaceDirectoryAuthority.invalidate('auth_reject');
          workspaceExactAuthorityCache.invalidate(exactWorkspaceId);
          workspaceExactContextCache.invalidate(
            exactWorkspaceId,
            'auth_reject',
          );
        },
        (revokedWorkspaceId) =>
          workspaceBillingRuntime.revokeWorkspace(
            revokedWorkspaceId,
            'vela-access-revoked',
          ),
      );
      recordWorkspaceAuthorityRevocationClear(
        workspaceAuthorityCacheMode,
        performance.now() - revocationReceivedAt,
      );
      requestWorkspaceDirectoryRefresh(
        'auth_reject',
        `revoked:${exactWorkspaceId}`,
      );
    },
    onDirectoryEvent: (event, connection) => {
      if (
        connection.identityKey
        && connection.identityKey !== currentWorkspaceDirectoryIdentity()
      ) {
        return;
      }
      requestWorkspaceDirectoryRefresh(
        'event_dirty',
        event.at
          ? [event.type, event.workspaceId, event.change, event.at].join(':')
          : undefined,
        connection.identityKey ?? currentWorkspaceDirectoryIdentity(),
      );
    },
    onEvent: (event, connection) => {
      if (
        connection.identityKey
        && connection.identityKey !== currentWorkspaceDirectoryIdentity()
      ) {
        return;
      }
      const eventWorkspaceId =
        event.workspaceId ?? subscribedWorkspaceId;
      console.info(
        `[od] hub workspace event received type=${event.type} ` +
          `workspaceId=${eventWorkspaceId} ` +
          `projectId=${event.projectId ?? 'unknown'} version=${event.version ?? 'unknown'}`,
      );
      switch (event.type) {
        case 'team-projects-changed': {
          // Catalog changed (share/unshare). Refresh the display cache and
          // signal the web, AND run a real `workspace_projects`
          // reconciliation pass — see `collab/workspace-projects-reconciler.ts`.
          hubEventRefreshes.request(
            `team-projects:${eventWorkspaceId}`,
            () => handleHubTeamProjectsChanged(
              () => emitTeamProjectsChanged(
                eventWorkspaceId,
                {
                  ...(event.projectId ? { projectId: event.projectId } : {}),
                  kind: 'catalog',
                },
              ),
              () => reconcileWorkspaceProjectsFromRemote(
                eventWorkspaceId,
              ),
            ),
            hubEventRefreshToken(event),
          );
          // Hub catalog writes carry the affected project id on current Vela
          // deployments, so keep the latency-sensitive recovery targeted. An
          // older/unscoped event still refreshes and reconciles the catalog;
          // the poller's throttled 30s bounded full recovery remains its
          // safety floor.
          if (event.workspaceId && event.projectId) {
            void proactiveContentPull.materializeMissingProjects(
              event.workspaceId,
              event.projectId,
            );
          }
          break;
        }
        case 'project-metadata-changed': {
          const targetProjectId = event.projectId?.trim() ?? '';
          const emitMetadataChanged = () => {
            emitTeamProjectsChanged(
              eventWorkspaceId,
              {
                ...(event.projectId ? { projectId: event.projectId } : {}),
                kind: 'metadata',
              },
            );
            if (event.projectId) {
              emitProjectEvent(event.projectId, {
                type: 'project-metadata-changed',
                projectId: event.projectId,
                at: Date.now(),
              });
            }
          };
          hubEventRefreshes.request(
            `project-metadata:${eventWorkspaceId}:${targetProjectId || '*'}`,
            () => handleHubProjectMetadataChanged(
              emitMetadataChanged,
              targetProjectId
                ? () => reconcileWorkspaceProjectMetadataFromRemote(
                    eventWorkspaceId,
                    targetProjectId,
                  )
                : async () => false,
            ),
            hubEventRefreshToken(event),
          );
          break;
        }
        case 'comment-changed': {
          const projectId = event.projectId;
          if (!projectId) break;
          if (activeProjectEventSinks.has(projectId)) {
            // Project is open here — pull IT now instead of waiting for the
            // next poll tick; the merge emits `comment-changed` to the web.
            // A consumed dirty mark is only redeemed by a pull that actually
            // ran; on a no-op/failed pull restore it so the next comment read
            // retries instead of losing the event outright.
            dirtyCommentProjects.delete(projectId);
            void resolveBoundProjectWorkspaceContext(projectId)
              .then((context) =>
                context?.workspaceId === eventWorkspaceId
                  ? collabCloud?.pullProject(projectId, context) ?? false
                  : false,
              )
              .then((pulled) => {
                if (!pulled) restoreDirtyCommentProject(projectId);
              })
              .catch(() => restoreDirtyCommentProject(projectId));
          } else {
            // Closed project: just mark dirty. The open-project path pulls
            // immediately, and an unopened project costs zero requests.
            dirtyCommentProjects.add(projectId);
          }
          break;
        }
        case 'presence-changed': {
          if (event.projectId) {
            const projectId = event.projectId;
            markPresenceReadCacheStale(projectId, eventWorkspaceId);
            void resolveBoundProjectWorkspaceContext(projectId)
              .then((context) => {
                if (context?.workspaceId !== eventWorkspaceId) return;
                emitProjectEvent(projectId, {
                  type: 'presence-changed',
                  projectId,
                  at: Date.now(),
                });
              })
              .catch(() => undefined);
          }
          break;
        }
        case 'project-content-changed': {
          // A teammate published a new version. Pull it daemon-side NOW so
          // the local mirror stays fresh even with no tab open; after the
          // pull lands, the existing post-pull signals (`file-changed` +
          // `project-metadata-changed`) reach any open view over the same
          // SSE path a web-triggered pull uses. All ownership/binding guards
          // live in collab/proactive-content-pull.ts — an owner daemon
          // receiving its own publish echo never pulls over its working
          // tree, and failures degrade silently to the web's status polling.
          if (sharedProjectPullProfiling) {
            const profileReceivedAtMs = Date.now();
            emitSharedProjectPullTiming({
              phase: 'event-received',
              projectId: event.projectId ?? 'unknown',
              ...(event.version != null ? { version: event.version } : {}),
              receivedAtMs: profileReceivedAtMs,
              atMs: profileReceivedAtMs,
            });
            void proactiveContentPull.handleContentChanged({
              ...event,
              workspaceId: eventWorkspaceId,
              profileReceivedAtMs,
            });
          } else {
            void proactiveContentPull.handleContentChanged({
              ...event,
              workspaceId: eventWorkspaceId,
            });
          }
          // Keep the thin nudge for an OPEN project view so its status/banner
          // refreshes immediately rather than on the next ~5s poll tick.
          if (event.projectId && activeProjectEventSinks.has(event.projectId)) {
            emitProjectEvent(event.projectId, {
              type: 'project-metadata-changed',
              projectId: event.projectId,
              at: Date.now(),
            });
          }
          break;
        }
        case 'workspace-context-changed':
          // Cache invalidation is an authorization boundary and must happen for
          // every event in the caller's turn. Only the downstream snapshot work
          // is coalesced below.
          workspaceDirectoryAuthority.invalidate('event_dirty');
          workspaceExactAuthorityCache.invalidate(eventWorkspaceId);
          workspaceExactContextCache.invalidate(
            eventWorkspaceId,
            'event_dirty',
          );
          hubEventRefreshes.request(
            `workspace-context:${eventWorkspaceId}`,
            () => handleHubWorkspaceContextChanged(
              eventWorkspaceId,
              () => pollWorkspaceInvalidationForWorkspace(eventWorkspaceId),
            ),
            hubEventRefreshToken(event),
          );
          // Revalidate exact membership before the next billing projection.
          // A removed/rebound member must clear money and entitlement state,
          // even when no billing-specific event accompanies the roster change.
          workspaceBillingRuntime.reconnect(subscribedWorkspaceId);
          break;
        case 'workspace-members-changed':
          workspaceDirectoryAuthority.invalidate('event_dirty');
          workspaceExactAuthorityCache.invalidate(eventWorkspaceId);
          workspaceExactContextCache.invalidate(
            eventWorkspaceId,
            'event_dirty',
          );
          hubEventRefreshes.request(
            `workspace-context:${eventWorkspaceId}`,
            () => handleHubWorkspaceContextChanged(
              eventWorkspaceId,
              () => pollWorkspaceInvalidationForWorkspace(eventWorkspaceId),
            ),
            hubEventRefreshToken(event),
          );
          // A role update or removal changes both authorization and the
          // billing member projection even when no billing event accompanies
          // the roster mutation.
          workspaceBillingRuntime.reconnect(subscribedWorkspaceId);
          break;
        case 'billing-changed':
          accountBillingSummary.invalidate(accountBillingInvalidationToken(event));
          workspaceBillingRuntime.invalidate({
            domain: 'legacy',
            ...(event.workspaceId ? { workspaceId: event.workspaceId } : {}),
            ...(event.revision ? { revision: event.revision } : {}),
            ...(event.revisionClock ? { revisionClock: event.revisionClock } : {}),
            reason: 'vela-billing-changed',
          });
          hubEventRefreshes.request(
            `billing-signal:${eventWorkspaceId}`,
            () => {
              emitWorkspaceEvent(eventWorkspaceId, {
                type: 'billing-changed',
                workspaceId: eventWorkspaceId,
                ...(event.revision ? { revision: event.revision } : {}),
                at: Date.now(),
              });
            },
            hubEventRefreshToken(event),
          );
          break;
        case 'billing-subscription-changed':
          if (!event.workspaceId) break;
          accountBillingSummary.invalidate(accountBillingInvalidationToken(event));
          workspaceBillingRuntime.invalidate({
            domain: 'subscription',
            workspaceId: event.workspaceId,
            ...(event.revision ? { revision: event.revision } : {}),
            ...(event.revisionClock ? { revisionClock: event.revisionClock } : {}),
            reason: 'vela-billing-subscription-changed',
          });
          hubEventRefreshes.request(
            `billing-signal:${event.workspaceId}`,
            () => {
              emitWorkspaceEvent(event.workspaceId!, {
                type: 'billing-subscription-changed',
                workspaceId: event.workspaceId!,
                ...(event.revision ? { revision: event.revision } : {}),
                at: Date.now(),
              });
            },
            hubEventRefreshToken(event),
          );
          break;
        case 'wallet-balance-changed':
          if (!event.workspaceId || !event.workspaceMemberId) break;
          accountBillingSummary.invalidate(accountBillingInvalidationToken(event));
          workspaceBillingRuntime.invalidate({
            domain: 'wallet',
            workspaceId: event.workspaceId,
            workspaceMemberId: event.workspaceMemberId,
            ...(event.revision ? { revision: event.revision } : {}),
            ...(event.revisionClock ? { revisionClock: event.revisionClock } : {}),
            reason: 'vela-wallet-balance-changed',
          });
          hubEventRefreshes.request(
            `billing-signal:${event.workspaceId}:${event.workspaceMemberId}`,
            () => {
              emitWorkspaceEvent(event.workspaceId!, {
                type: 'wallet-balance-changed',
                workspaceId: event.workspaceId!,
                workspaceMemberId: event.workspaceMemberId!,
                ...(event.revision ? { revision: event.revision } : {}),
                at: Date.now(),
              });
            },
            hubEventRefreshToken(event),
          );
          break;
        case 'team-resources-changed': {
          // Project publish/retract operations are Resource Hub mutations and
          // therefore arrive on this generic event family. Projects have their
          // own binding model and non-destructive mirror quarantine; the
          // generic resource coordinator intentionally handles only design
          // systems, plugins, and skills.
          if (event.resourceKind === 'project') {
            hubEventRefreshes.request(
              `team-projects:${eventWorkspaceId}`,
              () => handleHubTeamProjectsChanged(
                () => emitTeamProjectsChanged(
                  eventWorkspaceId,
                  {
                    ...(event.projectId ? { projectId: event.projectId } : {}),
                    kind: 'catalog',
                  },
                ),
                () => reconcileWorkspaceProjectsFromRemote(eventWorkspaceId),
              ),
              hubEventRefreshToken(event),
            );
            break;
          }
          // A design-system/plugin/skill resource was shared (moved the
          // 'published' ref) or retracted (removed) on the resource hub.
          // `resourceKind` routes to just that kind's reconciler instead of
          // re-checking all of them on every event — see
          // `reconcileTeamResourcesFromRemote` below (declared
          // later in this function; referencing it here is safe because this
          // callback only ever RUNS once an actual SSE event arrives, well
          // after the rest of `startServer`'s synchronous setup — including
          // that declaration — has completed).
          hubEventRefreshes.request(
            `team-resources:${eventWorkspaceId}:${event.resourceKind ?? '*'}`,
            () => reconcileTeamResourcesFromRemote(
              event.resourceKind,
              eventWorkspaceId,
              'push',
              event.resourceId,
            ),
            hubEventRefreshToken(event),
          );
          break;
        }
      }
    },
    onReconnect: (connection) => {
      if (
        connection.identityKey
        && connection.identityKey !== currentWorkspaceDirectoryIdentity()
      ) {
        return;
      }
      // Close the disconnect gap: one catch-up cycle over the same reads the
      // pollers watch, plus a comment pull for open projects.
      void refreshWorkspaceDigestFaces(
        subscribedWorkspaceId,
        { revalidate: true },
      )
        .then(() =>
          pollWorkspaceInvalidationForWorkspace(subscribedWorkspaceId),
        )
        .catch(() => undefined);
      void reconcileWorkspaceProjectsFromRemote(subscribedWorkspaceId)
        .catch(() => undefined);
      void proactiveContentPull.catchUpPublishedHeads(subscribedWorkspaceId)
        .catch(() => undefined);
      void collabCloud?.pollOnce().catch(() => undefined);
      workspaceBillingRuntime.reconnect(subscribedWorkspaceId);
      // Same catch-up principle for the design-system/plugin/skill resource
      // reconciler: a missed 'team-resources-changed' push during the
      // disconnect window is closed by one full re-check across every kind
      // this daemon drives it for (no resourceKind => reconcile all).
      void reconcileTeamResourcesFromRemote(undefined, subscribedWorkspaceId, 'catch-up')
        .catch(() => undefined);
    },
    onSourceGap: ({ workspaceId, identityKey, listenerEpoch }) => {
      if (
        identityKey
        && identityKey !== currentWorkspaceDirectoryIdentity()
      ) {
        return;
      }
      console.warn(
        `[od] hub source gap detected listenerEpoch=${listenerEpoch} ` +
          `workspaceId=${workspaceId ?? 'unknown'}`,
      );
      const exactWorkspaceId = workspaceId ?? subscribedWorkspaceId;
      requestWorkspaceDirectoryRefresh(
        'catch_up',
        `source-gap:${listenerEpoch}`,
        identityKey ?? currentWorkspaceDirectoryIdentity(),
      );
      void refreshWorkspaceDigestFaces(exactWorkspaceId, { revalidate: true })
        .then(() => pollWorkspaceInvalidationForWorkspace(exactWorkspaceId))
        .catch(() => undefined);
      void reconcileWorkspaceProjectsFromRemote(exactWorkspaceId)
        .catch(() => undefined);
      void proactiveContentPull.catchUpPublishedHeads(exactWorkspaceId)
        .catch(() => undefined);
      workspaceBillingRuntime.reconnect(exactWorkspaceId);
      void collabCloud?.pollOnce().catch(() => undefined);
      void reconcileTeamResourcesFromRemote(undefined, exactWorkspaceId, 'catch-up')
        .catch(() => undefined);
    },
    onError: (error) => {
      console.warn('[od] hub events channel error (will reconnect):', String(error));
    },
  });
  workspaceHubSubscriptions = createWorkspaceHubSubscriptionManager({
    start: startWorkspaceHubSubscriber,
  });
  workspaceHubSubscriptions.setBillingInterests(
    workspaceBillingRuntime.interestedKeys().map((interest) => interest.workspaceId),
  );

  registerTeamResourceRoutes(app, { teamResources: collab.teamResources });

  // Team resource sharing is request-scoped. The browser's explicit Workspace
  // headers choose a membership, then the signed-in account's authoritative
  // directory supplies the principal and permissions. Never consult the
  // daemon-wide active Workspace here: another tab may switch it while this
  // request is awaiting the hub.
  const rememberedTeamResourceScopes = createRememberedTeamResourceScopes();
  const rememberTeamResourceScope = (
    scope: TeamResourceRequestScope,
  ): TeamResourceRequestScope => {
    return rememberedTeamResourceScopes.remember(scope);
  };
  const resolveTeamResourceScope = async (req: any) => {
    const verified = await verifyExplicitWorkspaceRequestContext({
      req,
      requireTeam: true,
    });
    if (!verified.ok) return verified;
    const scope = teamResourceRequestScopeFromContext(verified.context);
    if (!scope) {
      return {
        ok: false as const,
        status: 403 as const,
        code: 'WORKSPACE_ACCESS_DENIED',
        message: 'the requested workspace is not available to this member',
      };
    }
    return {
      ok: true as const,
      scope: rememberTeamResourceScope(scope),
    };
  };
  const resolveTeamResourceScopeForWorkspaceId = async (
    workspaceId: string,
  ): Promise<TeamResourceRequestScope | null> => {
    const requestedWorkspaceId = workspaceId.trim();
    if (!requestedWorkspaceId) return null;
    const directory = await fetchWorkspaceDirectory().catch(() => ({
      ok: false,
      items: [],
    }));
    if (!directory.ok) return null;
    const scope = teamResourceRequestScopeForWorkspaceId(
      directory.items,
      requestedWorkspaceId,
    );
    return scope;
  };
  const teamResourceScopeStillAuthorized = async (
    scope: TeamResourceRequestScope,
  ): Promise<boolean> => {
    const refreshed = await resolveTeamResourceScopeForWorkspaceId(
      scope.principal.teamId,
    );
    return Boolean(
      refreshed &&
      refreshed.principal.teamId === scope.principal.teamId &&
      refreshed.principal.memberId === scope.principal.memberId &&
      refreshed.principal.lifecycleState === 'active',
    );
  };
  const teamResourceStillShared = async (
    kind: 'design_system' | 'plugin' | 'skill',
    resource: TeamResourceShareRecord,
    scope: TeamResourceRequestScope,
  ): Promise<boolean> => {
    const { runVelaResourceCommand } = await import(
      './collab/vela-cli-resource-adapter.js'
    );
    const stdout = await runVelaResourceCommand(
      ['shared', '--json'],
      scope.principal.teamId,
    );
    const idPrefix = kind === 'design_system' ? 'ds' : kind;
    const sanitizeResourceSegment = (value: string) =>
      value.replace(/[^a-zA-Z0-9_-]/g, '-');
    const expectedHubId =
      resource.hubResourceId ??
      `${idPrefix}-${sanitizeResourceSegment(scope.principal.teamId)}-${sanitizeResourceSegment(resource.id)}`;
    const parsed = JSON.parse(stdout) as {
      resources?: Array<{
        id?: unknown;
        kind?: unknown;
        deletedAt?: unknown;
        metadata?: unknown;
      }>;
    };
    return (parsed.resources ?? []).some((candidate) => {
      if (candidate.kind !== kind || candidate.deletedAt != null) return false;
      return candidate.id === expectedHubId;
    });
  };
  async function syncSharedTeamPlugin(
    resource: TeamResourceShareRecord,
    scope: TeamResourceRequestScope,
  ): Promise<void> {
    const workspaceId = scope.principal.teamId;
    const isOwnedByCurrentMember =
      typeof resource.ownerMemberId === 'string' &&
      resource.ownerMemberId === scope.principal.memberId;
    if (isOwnedByCurrentMember) return;
    const hubResourceId =
      resource.hubResourceId ??
      `plugin-${workspaceId.replace(/[^a-zA-Z0-9_-]/g, '-')}-${resource.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
    const targetDir = teamResourceMaterializationDir(
      PLUGIN_REGISTRY_ROOTS.userPluginsRoot,
      workspaceId,
      resource.id,
      resource.id,
    );
    const bindingResourceId = workspaceTeamPluginBindingResourceId(
      workspaceId,
      resource.id,
    );
    const captureActivationFence = (): string | null =>
      workspaceTeamPluginBindingActivationFence(db, workspaceId, resource.id);
    const markTeamSynced = (): boolean => {
      const existingBinding = getWorkspaceResourceByResourceId(
        db,
        'plugin',
        bindingResourceId,
      );
      if (
        existingBinding &&
        (existingBinding.workspaceId !== workspaceId ||
          existingBinding.visibility !== 'team')
      ) {
        return false;
      }
      ensureWorkspaceResource(db, 'plugin', workspaceId, bindingResourceId, {
        visibility: 'team',
        resourceState: 'active',
        createdByWorkspaceMemberId: scope.principal.memberId,
        updatedByWorkspaceMemberId: scope.principal.memberId,
        resourceHubResourceId: hubResourceId,
      });
      updateWorkspaceResource(db, 'plugin', workspaceId, bindingResourceId, {
        visibility: 'team',
        resourceState: 'active',
        updatedByWorkspaceMemberId: scope.principal.memberId,
        resourceHubResourceId: hubResourceId,
      });
      return true;
    };
    if (
      fs.existsSync(targetDir) &&
      resource.versionId &&
      teamResourceVersions.get(workspaceId, 'plugin', resource.id) === resource.versionId
    ) {
      await activateWorkspaceTeamPluginIfStillShared({
        captureActivationFence,
        stillShared: () => teamResourceStillShared('plugin', resource, scope),
        activationFenceIsCurrent: (fence) => captureActivationFence() === fence,
        activate: markTeamSynced,
      });
      return;
    }
    const existing = getInstalledPlugin(db, resource.id);
    const remoteDescription = typeof resource.description === 'string' ? resource.description.trim() : '';
    const localDescription = typeof existing?.manifest?.description === 'string'
      ? existing.manifest.description.trim()
      : '';
    if (fs.existsSync(targetDir) && !resource.versionId && (!remoteDescription || localDescription === remoteDescription)) {
      await activateWorkspaceTeamPluginIfStillShared({
        captureActivationFence,
        stillShared: () => teamResourceStillShared('plugin', resource, scope),
        activationFenceIsCurrent: (fence) => captureActivationFence() === fence,
        activate: markTeamSynced,
      });
      return;
    }

    try {
      const materialized = await materializeWorkspaceScopedTeamResource({
        kindRoot: PLUGIN_REGISTRY_ROOTS.userPluginsRoot,
        storageName: resource.id,
        identity: {
          kind: 'plugin',
          workspaceId,
          resourceId: resource.id,
          hubResourceId,
        },
        pullInto: (stagedFolder) =>
          teamResourcePullBatcher.pull({
            workspaceId,
            kind: 'plugin',
            resourceId: hubResourceId,
            dir: stagedFolder,
            ref: 'published',
          }),
        verifyWorkspaceScope: () => teamResourceScopeStillAuthorized(scope),
        verifyStillShared: () => teamResourceStillShared('plugin', resource, scope),
      });
      if (materialized.status !== 'committed') return;
      const activated = await resolveAndActivateWorkspaceTeamPlugin({
        resolve: async () => {
          const resolved = await resolvePluginFolder({
            folder: materialized.targetDir,
            folderId: resource.id,
            sourceKind: 'user',
            source: teamResourceSourceKey({
              kind: 'plugin',
              workspaceId,
              resourceId: resource.id,
            }),
          });
          if (!resolved.ok) {
            console.warn(
              `[team-resources] failed to register shared plugin ${resource.id}: ${resolved.errors.join('; ')}`,
            );
            return null;
          }
          return resolved.record;
        },
        captureActivationFence,
        stillShared: () => teamResourceStillShared('plugin', resource, scope),
        activationFenceIsCurrent: (fence) => captureActivationFence() === fence,
        activate: markTeamSynced,
      });
      if (!activated) return;
      if (resource.versionId) {
        await teamResourceVersions.set(
          workspaceId,
          'plugin',
          resource.id,
          resource.versionId,
        );
      }
    } catch (error) {
      console.warn(
        `[team-resources] failed to pull shared plugin ${resource.id}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }
  async function syncSharedTeamDesignSystem(
    resource: TeamResourceShareRecord,
    scope: TeamResourceRequestScope,
  ): Promise<void> {
    const dirId = stripPrefixAndValidateId(resource.id, 'user:');
    if (!dirId) return;
    const targetDir = teamResourceMaterializationDir(
      USER_DESIGN_SYSTEMS_DIR,
      scope.principal.teamId,
      resource.id,
      dirId,
    );
    const workspaceId = scope.principal.teamId;
    const ownerLocalSourceReady = ownedDesignSystemSourceIsReady({
      ownerMemberId: resource.ownerMemberId,
      currentMemberId: scope.principal.memberId,
      workspaceId,
      localSourceExists: fs.existsSync(path.join(USER_DESIGN_SYSTEMS_DIR, dirId)),
      binding: getWorkspaceResourceByResourceId(db, 'design_system', resource.id),
    });
    const hubResourceId =
      resource.hubResourceId ??
      `ds-${workspaceId.replace(/[^a-zA-Z0-9_-]/g, '-')}-${resource.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
    const bindingResourceId = workspaceTeamDesignSystemBindingResourceId(
      workspaceId,
      resource.id,
    );
    async function markTeamSynced(): Promise<void> {
      const metadataPath = path.join(targetDir, 'metadata.json');
      let metadata: Record<string, unknown> = {};
      try {
        const raw = await fs.promises.readFile(metadataPath, 'utf8');
        const parsed = JSON.parse(raw) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          metadata = parsed as Record<string, unknown>;
        }
      } catch {
        metadata = {};
      }
      await fs.promises.writeFile(
        metadataPath,
        // Claim the pulled copy for the workspace whose hub served it (#145).
        // A team-shared system is workspace-owned by construction, so leaving
        // it unclaimed would keep leaking one team's library into the next
        // workspace the user switches to.
        `${JSON.stringify(
          { ...metadata, teamSynced: true, ...(workspaceId ? { workspaceId } : {}) },
          null,
          2,
        )}\n`,
        'utf8',
      );
      // Envelope double-write (spec 9.2): stamp the same claim into
      // `workspace_resources` as `visibility: 'team'`, mirroring what
      // syncSharedTeamSkill's own markTeamSynced already does for skill.
      if (workspaceId) {
        ensureWorkspaceResource(db, 'design_system', workspaceId, bindingResourceId, {
          visibility: 'team',
          resourceState: 'active',
          createdByWorkspaceMemberId: resource.ownerMemberId ?? scope.principal.memberId,
          updatedByWorkspaceMemberId: scope.principal.memberId,
          resourceHubResourceId: hubResourceId,
        });
        updateWorkspaceResource(db, 'design_system', workspaceId, bindingResourceId, {
          visibility: 'team',
          resourceState: 'active',
          updatedByWorkspaceMemberId: scope.principal.memberId,
          resourceHubResourceId: hubResourceId,
        });
      }
    }
    // The hub naming this member as owner is not proof that this device still
    // has the author's local source. A fresh data root (or a second device)
    // must pull the published Team copy just like any teammate. Skip only when
    // the exact Workspace's original Personal binding and directory are both
    // present; the predicate rejects foreign, Team-mirror, and retired rows.
    if (ownerLocalSourceReady) return;
    if (
      fs.existsSync(targetDir) &&
      workspaceId &&
      resource.versionId &&
      teamResourceVersions.get(
        workspaceId,
        'design_system',
        resource.id,
      ) === resource.versionId
    ) {
      await markTeamSynced();
      return;
    }
    if (fs.existsSync(targetDir) && !resource.versionId) {
      await markTeamSynced();
      return;
    }
    try {
      const materialized = await materializeWorkspaceScopedTeamResource({
        kindRoot: USER_DESIGN_SYSTEMS_DIR,
        storageName: dirId,
        identity: {
          kind: 'design_system',
          workspaceId,
          resourceId: resource.id,
          hubResourceId,
        },
        pullInto: (stagedFolder) =>
          teamResourcePullBatcher.pull({
            workspaceId,
            kind: 'design_system',
            resourceId: hubResourceId,
            dir: stagedFolder,
            ref: 'published',
          }),
        verifyWorkspaceScope: () => teamResourceScopeStillAuthorized(scope),
        verifyStillShared: () =>
          teamResourceStillShared('design_system', resource, scope),
      });
      if (materialized.status !== 'committed') return;
      await markTeamSynced();
      if (workspaceId && resource.versionId) {
        await teamResourceVersions.set(
          workspaceId,
          'design_system',
          resource.id,
          resource.versionId,
        );
      }
    } catch (error) {
      console.warn(
        `[team-resources] failed to pull shared design system ${resource.id}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }
  async function syncSharedTeamSkill(
    resource: TeamResourceShareRecord,
    scope: TeamResourceRequestScope,
  ): Promise<void> {
    const dirId = stripPrefixAndValidateId(
      resource.id,
      resource.id.startsWith('user:') ? 'user:' : '',
    );
    if (!dirId) return;
    const targetDir = teamResourceMaterializationDir(
      USER_SKILLS_DIR,
      scope.principal.teamId,
      resource.id,
      dirId,
    );
    const workspaceId = scope.principal.teamId;
    const hubResourceId =
      resource.hubResourceId ??
      `skill-${workspaceId.replace(/[^a-zA-Z0-9_-]/g, '-')}-${resource.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
    const isOwnedByCurrentMember =
      typeof resource.ownerMemberId === 'string' &&
      resource.ownerMemberId === scope.principal.memberId;
    const bindingResourceId = workspaceTeamSkillBindingResourceId(
      workspaceId,
      resource.id,
    );
    const captureActivationFence = (): string | null =>
      workspaceTeamSkillBindingActivationFence(db, workspaceId, resource.id);
    // Claim the pulled copy for the workspace whose hub served it — a
    // team-shared skill is workspace-owned by construction, same rule
    // syncSharedTeamDesignSystem's markTeamSynced already ships (#145).
    // Fills the gap this resource type previously had no binding row at
    // all: `enforceSkillWorkspaceMutation` (routes/static-resource.ts) and
    // `listSkills`'s workspace filter (skills.ts) both read this row.
    function markTeamSynced(): boolean {
      if (isOwnedByCurrentMember || !workspaceId) return false;
      const existingBinding = getWorkspaceResourceByResourceId(
        db,
        'skill',
        bindingResourceId,
      );
      if (
        existingBinding
        && (
          existingBinding.workspaceId !== workspaceId
          || existingBinding.visibility !== 'team'
        )
      ) return false;
      ensureWorkspaceResource(db, 'skill', workspaceId, bindingResourceId, {
        visibility: 'team',
        resourceState: 'active',
        createdByWorkspaceMemberId: resource.ownerMemberId ?? scope.principal.memberId,
        updatedByWorkspaceMemberId: scope.principal.memberId,
        resourceHubResourceId: hubResourceId,
      });
      updateWorkspaceResource(db, 'skill', workspaceId, bindingResourceId, {
        visibility: 'team',
        resourceState: 'active',
        updatedByWorkspaceMemberId: scope.principal.memberId,
        resourceHubResourceId: hubResourceId,
      });
      return true;
    }
    if (isOwnedByCurrentMember) return;
    if (
      fs.existsSync(targetDir) &&
      workspaceId &&
      resource.versionId &&
      teamResourceVersions.get(workspaceId, 'skill', resource.id) === resource.versionId
    ) {
      await activateWorkspaceTeamSkillIfStillShared({
        captureActivationFence,
        stillShared: () => teamResourceStillShared('skill', resource, scope),
        activationFenceIsCurrent: (fence) => captureActivationFence() === fence,
        activate: markTeamSynced,
      });
      return;
    }
    if (fs.existsSync(targetDir) && !resource.versionId) {
      await activateWorkspaceTeamSkillIfStillShared({
        captureActivationFence,
        stillShared: () => teamResourceStillShared('skill', resource, scope),
        activationFenceIsCurrent: (fence) => captureActivationFence() === fence,
        activate: markTeamSynced,
      });
      return;
    }

    try {
      const materialized = await materializeWorkspaceScopedTeamResource({
        kindRoot: USER_SKILLS_DIR,
        storageName: dirId,
        identity: {
          kind: 'skill',
          workspaceId,
          resourceId: resource.id,
          hubResourceId,
        },
        pullInto: (stagedFolder) =>
          teamResourcePullBatcher.pull({
            workspaceId,
            kind: 'skill',
            resourceId: hubResourceId,
            dir: stagedFolder,
            ref: 'published',
          }),
        verifyWorkspaceScope: () => teamResourceScopeStillAuthorized(scope),
        verifyStillShared: () => teamResourceStillShared('skill', resource, scope),
      });
      if (materialized.status !== 'committed') return;
      const activated = await resolveAndActivateWorkspaceTeamSkill({
        resolve: async () => {
          const resolved = await listSkills([
            teamResourceWorkspaceRoot(USER_SKILLS_DIR, workspaceId),
          ]);
          return resolved.find(
            (skill) => skill.id === resource.id && skill.dir === materialized.targetDir,
          ) ?? null;
        },
        captureActivationFence,
        stillShared: () => teamResourceStillShared('skill', resource, scope),
        activationFenceIsCurrent: (fence) => captureActivationFence() === fence,
        activate: markTeamSynced,
      });
      if (!activated) return;
      if (workspaceId && resource.versionId) {
        await teamResourceVersions.set(
          workspaceId,
          'skill',
          resource.id,
          resource.versionId,
        );
      }
    } catch (error) {
      console.warn(
        `[team-resources] failed to pull shared skill ${resource.id}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }
  // Stale-while-revalidate a kind's `/team` listing (hub read + resource
  // materialization) keyed on the verified Workspace/member scope. The
  // workspace shell reads all three kinds on navigation; without this each read
  // re-hit the hub on the request path (~1.5-2.5s each) and serialized behind
  // the browser's 6-connection cap. Materialization still runs, but on the
  // background refresh rather than the hot read.
  //
  // `invalidate()` is consumed by registerTeamResourceShareRoutes' share/
  // unshare handlers below (a local mutation this daemon just made). It has to
  // drop TWO layers, not one: this cache's own parsed-and-materialized entry,
  // AND `sharedTeamResourcesCommand` underneath it — `share.sharedResources()`
  // reads the raw `vela shared --json` listing through that second SWR cache
  // (shared by all three kinds), so a bare reset of this layer alone would
  // still hand the immediate post-share/unshare refetch the pre-change hub
  // listing for up to that cache's own freshMs.
  const sharedTeamResourcesCommands = new Map<
    string,
    ReturnType<typeof createSwrCache<string>>
  >();
  const sharedTeamResourcesCommand = Object.assign(
    async (workspaceId: string): Promise<string> => {
      const key = workspaceId.trim();
      if (!key) throw new Error('explicit workspace scope is required');
      let command = sharedTeamResourcesCommands.get(key);
      if (!command) {
        command = createSwrCache(
          async () => {
            const { runVelaResourceCommand } = await import('./collab/vela-cli-resource-adapter.js');
            return runVelaResourceCommand(['shared', '--json'], key);
          },
          () => key,
          3000,
        );
        sharedTeamResourcesCommands.set(key, command);
      }
      return command();
    },
    {
      invalidate(workspaceId: string) {
        const key = workspaceId.trim();
        sharedTeamResourcesCommands.get(key)?.invalidate();
        sharedTeamResourcesCommands.delete(key);
      },
    },
  );
  // ONE materialization budget for the whole daemon, not one per resource kind.
  // Design systems, plugins, and skills are three separate listing caches that
  // a single client poll refreshes together, so a gate owned by each cache
  // would bound each kind on its own and let the real peak reach the cap times
  // three. The gate lives here, at the composition root, because here is the
  // only place that can see all three.
  const teamResourceMaterializationGate = new ConcurrencyGate(
    COLLAB_VELA_FANOUT_CONCURRENCY,
  );
  const teamResourcePullBatcher = createVelaResourcePullBatcher();
  const cachedTeamResourceList = (
    share: TeamResourceShareService,
    sync?: (
      resource: TeamResourceShareRecord,
      scope: TeamResourceRequestScope,
    ) => Promise<void>,
  ) =>
    createTeamResourceListCache({
      share,
      ...(sync ? { sync } : {}),
      gate: teamResourceMaterializationGate,
      invalidateSharedCommand: (workspaceId) =>
        sharedTeamResourcesCommand.invalidate(workspaceId),
    });
  const runTeamResourceCommand = async (
    args: string[],
    workspaceId?: string,
    readOptions?: TeamResourceSharedReadOptions,
  ) => {
    if (args.length === 2 && args[0] === 'shared' && args[1] === '--json') {
      if (!workspaceId?.trim()) throw new Error('explicit workspace scope is required');
      if (readOptions?.authoritative) {
        const { runVelaResourceCommand } = await import('./collab/vela-cli-resource-adapter.js');
        return runVelaResourceCommand(args, workspaceId);
      }
      return sharedTeamResourcesCommand(workspaceId);
    }
    const { runVelaResourceCommand } = await import('./collab/vela-cli-resource-adapter.js');
    return runVelaResourceCommand(args, workspaceId);
  };
  const designSystemsTeamResourceShare = createTeamResourceShareService({
    kind: 'design_system',
    idPrefix: 'ds',
    resolveDir: (id) => resolveUserDesignSystemShareDirectory(db, id),
    describeResource: async (id) => {
      const system = (await listAllDesignSystems()).find((candidate) => candidate.id === id);
      return {
        localId: id,
        ...(system?.title ? { title: system.title } : {}),
        ...(system?.summary ? { description: system.summary } : {}),
      };
    },
    run: runTeamResourceCommand,
  });
  const designSystemBackingProjects = new Map<string, string>();
  const designSystemBackingProjectKey = (
    workspaceId: string,
    resourceId: string,
  ) => JSON.stringify([workspaceId, resourceId]);
  const designSystemsTeamShare = createLinkedProjectTeamResourceShareService({
    resource: designSystemsTeamResourceShare,
    prepare: createDesignSystemBackingProjectPreparer({
      resolveProjectId: async (resourceId, scope) =>
        (await listAllDesignSystems({
          workspaceId: scope.principal.teamId,
          workspaceMemberId: scope.principal.memberId,
        }))
          .find((candidate) => candidate.id === resourceId)
          ?.projectId ?? null,
      ensureProjectId: async (resourceId, scope) =>
        (await ensureUserDesignSystemWorkspaceProject(db, resourceId, {
          workspaceId: scope.principal.teamId,
          workspaceMemberId: scope.principal.memberId,
        }))?.project.id ?? null,
      projectExists: (projectId) => Boolean(getProject(db, projectId)),
      getProjectBinding: (projectId) =>
        getWorkspaceProjectByProjectId(db, projectId),
      publishProject: (projectId, scope) =>
        collab.requestTeamShare(projectId, scope.principal),
      unpublishProject: (projectId, scope) =>
        collab.requestTeamUnshare(projectId, scope.principal),
      persistVisibility: ({ projectId, scope, visibility }) =>
        persistWorkspaceProjectVisibility({
          projectId,
          principal: scope.principal,
          visibility,
          ownerMemberId: scope.principal.memberId,
          updatedByMemberId: scope.principal.memberId,
        }),
      onPrepared: ({ resourceId, projectId, scope }) => {
        designSystemBackingProjects.set(
          designSystemBackingProjectKey(scope.principal.teamId, resourceId),
          projectId,
        );
      },
    }),
  });
  const designSystemsTeamList = cachedTeamResourceList(
    designSystemsTeamShare,
    syncSharedTeamDesignSystem,
  );
  const notifyDesignSystemLinkedMutation = (
    resourceId: string,
    scope: TeamResourceRequestScope,
    visibility: 'personal' | 'team',
  ) => {
    const workspaceId = scope.principal.teamId;
    const key = designSystemBackingProjectKey(workspaceId, resourceId);
    const projectId = designSystemBackingProjects.get(key);
    // The linked service already persisted the backing project before it
    // resolved. `emitTeamProjectsChanged` invalidates the exact Workspace's
    // project catalogs before emitting; the resource route invalidates its
    // own listing before it calls this helper.
    emitTeamProjectsChanged(workspaceId, {
      ...(projectId ? { projectId } : {}),
      kind: 'catalog',
    });
    emitWorkspaceEvent(workspaceId, {
      type: 'team-resources-changed',
      resourceKind: 'design_system',
      resourceId,
      at: Date.now(),
    });
    if (visibility === 'personal') designSystemBackingProjects.delete(key);
  };
  registerTeamResourceShareRoutes(app, {
    basePath: 'design-systems',
    resolveScope: resolveTeamResourceScope,
    authorizeShare: (resourceId, scope) => {
      const binding = getWorkspaceResourceByResourceId(
        db,
        'design_system',
        resourceId,
      );
      return binding?.workspaceId === scope.principal.teamId
        && binding.visibility === 'personal'
        && binding.resourceState !== 'deleted'
        && binding.createdByWorkspaceMemberId === scope.principal.memberId;
    },
    syncSharedResource: syncSharedTeamDesignSystem,
    share: designSystemsTeamShare,
    listTeam: designSystemsTeamList,
    onMutationCommitted: notifyDesignSystemLinkedMutation,
  });
  const pluginsTeamShare = createTeamResourceShareService({
    kind: 'plugin',
    idPrefix: 'plugin',
    resolveDir: (id) => {
      const plugin = getInstalledPlugin(db, id);
      if (!plugin || typeof plugin.fsPath !== 'string') throw new Error('plugin not found');
      return plugin.fsPath;
    },
    describeResource: (id) => {
      const plugin = getInstalledPlugin(db, id);
      if (!plugin) return null;
      return {
        localId: id,
        title: plugin.manifest?.title ?? plugin.manifest?.name ?? plugin.title ?? id,
        ...(plugin.manifest?.description ? { description: plugin.manifest.description } : {}),
      };
    },
    run: runTeamResourceCommand,
  });
  const pluginsTeamList = cachedTeamResourceList(
    pluginsTeamShare,
    syncSharedTeamPlugin,
  );
  registerTeamResourceShareRoutes(app, {
    basePath: 'plugins',
    resolveScope: resolveTeamResourceScope,
    authorizeShare: (id, scope) => {
      const binding = getWorkspaceResourceByResourceId(db, 'plugin', id);
      return Boolean(
        binding
        && binding.workspaceId === scope.principal.teamId
        && binding.visibility === 'personal'
        && binding.resourceState === 'active'
        && binding.createdByWorkspaceMemberId === scope.principal.memberId
      );
    },
    syncSharedResource: syncSharedTeamPlugin,
    share: pluginsTeamShare,
    listTeam: pluginsTeamList,
  });
  const skillsTeamShare = createTeamResourceShareService({
    kind: 'skill',
    idPrefix: 'skill',
    resolveDir: async (id) => {
      const skill = findSkillById(await listAllSkills(), id);
      if (!skill || typeof skill.dir !== 'string') throw new Error('skill not found');
      return skill.dir;
    },
    describeResource: async (id) => {
      const skill = findSkillById(await listAllSkills(), id);
      if (!skill) return null;
      return {
        localId: id,
        title: skill.name || id,
        ...(skill.description ? { description: skill.description } : {}),
      };
    },
    run: runTeamResourceCommand,
  });
  const skillsTeamList = cachedTeamResourceList(
    skillsTeamShare,
    syncSharedTeamSkill,
  );
  registerTeamResourceShareRoutes(app, {
    basePath: 'skills',
    resolveScope: resolveTeamResourceScope,
    authorizeShare: (id, scope) => {
      const binding = getWorkspaceResourceByResourceId(db, 'skill', id);
      return Boolean(
        binding
        && binding.workspaceId === scope.principal.teamId
        && binding.visibility === 'personal'
        && binding.resourceState === 'active'
        && binding.createdByWorkspaceMemberId === scope.principal.memberId
      );
    },
    syncSharedResource: syncSharedTeamSkill,
    share: skillsTeamShare,
    listTeam: skillsTeamList,
  });
  const teamResourceListByKind = {
    design_system: designSystemsTeamList,
    plugin: pluginsTeamList,
    skill: skillsTeamList,
  };

  // Collab realtime for design-system/plugin/skill "team resource" sharing: react
  // to a `team-resources-changed` signal (hub push, wired above, OR the
  // dedicated poll fallback below) by reconciling this workspace's
  // `workspace_resources` rows against each kind's live shared listing. See
  // `collab/workspace-resources-reconciler.ts` for the full design —
  // in particular why retraction marks `resourceState: 'deleted'` and leaves
  // `visibility: 'team'` alone, instead of demoting to `visibility:
  // 'personal'` the way `workspace-projects-reconciler.ts` does for
  // `workspace_projects` (that would misattribute a teammate's pulled copy
  // as caller-authored — the exact bug `SkillSummary.teamSynced` exists to
  // prevent).
  //
  const RECONCILED_TEAM_RESOURCE_KINDS = ['design_system', 'plugin', 'skill'] as const;
  type ReconciledTeamResourceKind = (typeof RECONCILED_TEAM_RESOURCE_KINDS)[number];
  const adoptLegacyWorkspaceTeamPluginBindings = async (
    scope: TeamResourceRequestScope,
  ): Promise<void> => {
    const workspaceId = scope.principal.teamId;
    const workspaceRoot = teamResourceWorkspaceRoot(
      PLUGIN_REGISTRY_ROOTS.userPluginsRoot,
      workspaceId,
    );
    let entries: fs.Dirent[] = [];
    try {
      entries = await fs.promises.readdir(workspaceRoot, { withFileTypes: true });
    } catch {
      return;
    }
    await Promise.all(
      entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
        const marker = await readTeamResourceMaterialization(
          PLUGIN_REGISTRY_ROOTS.userPluginsRoot,
          workspaceId,
          entry.name,
          entry.name,
        );
        if (!marker || marker.kind !== 'plugin') return;
        ensureWorkspaceResource(
          db,
          'plugin',
          workspaceId,
          workspaceTeamPluginBindingResourceId(workspaceId, marker.resourceId),
          {
            visibility: 'team',
            resourceState: 'active',
            createdByWorkspaceMemberId: scope.principal.memberId,
            updatedByWorkspaceMemberId: scope.principal.memberId,
            resourceHubResourceId: marker.hubResourceId,
          },
        );
      }),
    );
  };
  const adoptLegacyWorkspaceTeamDesignSystemBindings = async (
    scope: TeamResourceRequestScope,
  ): Promise<void> => {
    const workspaceId = scope.principal.teamId;
    const workspaceRoot = teamResourceWorkspaceRoot(
      USER_DESIGN_SYSTEMS_DIR,
      workspaceId,
    );
    let entries: fs.Dirent[] = [];
    try {
      entries = await fs.promises.readdir(workspaceRoot, { withFileTypes: true });
    } catch {
      return;
    }
    await Promise.all(
      entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
        const marker = await readTeamResourceMaterialization(
          USER_DESIGN_SYSTEMS_DIR,
          workspaceId,
          `user:${entry.name}`,
          entry.name,
        );
        if (!marker || marker.kind !== 'design_system') return;
        ensureWorkspaceResource(
          db,
          'design_system',
          workspaceId,
          workspaceTeamDesignSystemBindingResourceId(workspaceId, marker.resourceId),
          {
            visibility: 'team',
            resourceState: 'active',
            createdByWorkspaceMemberId: scope.principal.memberId,
            updatedByWorkspaceMemberId: scope.principal.memberId,
            resourceHubResourceId: marker.hubResourceId,
          },
        );
      }),
    );
  };
  const adoptLegacyWorkspaceTeamSkillBindings = async (
    scope: TeamResourceRequestScope,
  ): Promise<void> => {
    const workspaceId = scope.principal.teamId;
    const workspaceRoot = teamResourceWorkspaceRoot(USER_SKILLS_DIR, workspaceId);
    let entries: fs.Dirent[] = [];
    try {
      entries = await fs.promises.readdir(workspaceRoot, { withFileTypes: true });
    } catch {
      return;
    }
    await Promise.all(
      entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
        let marker = await readTeamResourceMaterialization(
          USER_SKILLS_DIR,
          workspaceId,
          entry.name,
          entry.name,
        );
        if (!marker) {
          marker = await readTeamResourceMaterialization(
            USER_SKILLS_DIR,
            workspaceId,
            `user:${entry.name}`,
            entry.name,
          );
        }
        if (!marker || marker.kind !== 'skill') return;
        ensureWorkspaceResource(
          db,
          'skill',
          workspaceId,
          workspaceTeamSkillBindingResourceId(workspaceId, marker.resourceId),
          {
            visibility: 'team',
            resourceState: 'active',
            createdByWorkspaceMemberId: scope.principal.memberId,
            updatedByWorkspaceMemberId: scope.principal.memberId,
            resourceHubResourceId: marker.hubResourceId,
          },
        );
      }),
    );
  };
  const reconcileTeamResourceKind = async (
    resourceType: ReconciledTeamResourceKind,
    scope: TeamResourceRequestScope,
    resources: readonly MaterializedTeamResourceRef[],
  ) => {
    if (resourceType === 'plugin') {
      await adoptLegacyWorkspaceTeamPluginBindings(scope);
    }
    if (resourceType === 'design_system') {
      await adoptLegacyWorkspaceTeamDesignSystemBindings(scope);
    }
    if (resourceType === 'skill') {
      await adoptLegacyWorkspaceTeamSkillBindings(scope);
    }
    let reconciliationError: unknown;
    const result = await reconcileWorkspaceResourcesWithRemote({
      getWorkspaceIdentity: async () => ({ workspaceId: scope.principal.teamId }),
      listRemoteTeamResources: async () => resources,
      listLocalActiveTeamRows: (workspaceId): LocalTeamResourceBinding[] =>
        listWorkspaceResources(db, resourceType, workspaceId)
          .filter((row: any) => row.visibility === 'team' && row.resourceState !== 'deleted')
          .flatMap((row: any) => {
            const logicalResourceId = resourceType === 'plugin'
              ? pluginIdFromWorkspaceTeamPluginBinding(workspaceId, row.resourceId)
              : resourceType === 'design_system'
                ? designSystemIdFromWorkspaceTeamBinding(workspaceId, row.resourceId)
                  ?? (row.resourceId.startsWith('user:') ? row.resourceId : null)
                : skillIdFromWorkspaceTeamBinding(workspaceId, row.resourceId)
                  ?? (row.resourceId.startsWith('team-mirror:') ? null : row.resourceId);
            if (!logicalResourceId) return [];
            return [
              {
                resourceId: logicalResourceId,
                workspaceId: row.workspaceId,
                visibility: row.visibility,
                resourceState: row.resourceState ?? null,
              },
            ];
          }),
      applyRetire: (workspaceId, resourceId) => {
        const bindingResourceId = resourceType === 'plugin'
          ? workspaceTeamPluginBindingResourceId(workspaceId, resourceId)
          : resourceType === 'design_system'
            ? workspaceTeamDesignSystemBindingResourceId(workspaceId, resourceId)
            : workspaceTeamSkillBindingResourceId(workspaceId, resourceId);
        updateWorkspaceResource(db, resourceType, workspaceId, bindingResourceId, {
          resourceState: 'deleted',
        });
      },
      onError: (error) => {
        reconciliationError ??= error;
        console.warn(`[od] workspace-resources (${resourceType}) reconciliation error:`, error);
      },
    });
    if (reconciliationError) throw reconciliationError;
    return result;
  };
  const teamResourceMaterializationIsReady = (
    resourceType: ReconciledTeamResourceKind,
    resource: TeamResourceShareRecord,
    scope: TeamResourceRequestScope,
  ): boolean => {
    const workspaceId = scope.principal.teamId;
    if (resourceType === 'design_system') {
      const dirId = stripPrefixAndValidateId(resource.id, 'user:');
      if (
        dirId
        && ownedDesignSystemSourceIsReady({
          ownerMemberId: resource.ownerMemberId,
          currentMemberId: scope.principal.memberId,
          workspaceId,
          localSourceExists: fs.existsSync(path.join(USER_DESIGN_SYSTEMS_DIR, dirId)),
          binding: getWorkspaceResourceByResourceId(db, 'design_system', resource.id),
        })
      ) return true;
    } else if (resource.ownerMemberId === scope.principal.memberId) {
      return true;
    }
    const bindingResourceId = resourceType === 'plugin'
      ? workspaceTeamPluginBindingResourceId(workspaceId, resource.id)
      : resourceType === 'design_system'
        ? workspaceTeamDesignSystemBindingResourceId(workspaceId, resource.id)
        : workspaceTeamSkillBindingResourceId(workspaceId, resource.id);
    const binding = getWorkspaceResourceByResourceId(
      db,
      resourceType,
      bindingResourceId,
    );
    if (
      binding?.workspaceId !== workspaceId
      || binding.visibility !== 'team'
      || binding.resourceState !== 'active'
    ) return false;
    return !resource.versionId
      || teamResourceVersions.get(workspaceId, resourceType, resource.id) === resource.versionId;
  };
  const teamResourceEventCoordinator = createWorkspaceTeamResourceEventCoordinator({
    materializeAndList: async ({ resourceKind, scope }) => {
      const listing = await teamResourceListByKind[resourceKind].authoritative(scope);
      const incomplete = listing.resources.find(
        (resource) => !teamResourceMaterializationIsReady(resourceKind, resource, scope),
      );
      if (incomplete) {
        throw new Error(
          `team resource ${resourceKind}/${incomplete.id} was not materialized`,
        );
      }
      return listing.resources.map((resource) => ({
        resourceId: resource.id,
        ...(resource.versionId ? { versionId: resource.versionId } : {}),
      }));
    },
    reconcile: ({ resourceKind, scope, resources }) =>
      reconcileTeamResourceKind(resourceKind, scope, resources),
    emit: emitWorkspaceEvent,
    onError: (error, resourceKind) =>
      console.warn(`[od] workspace-resources (${resourceKind}) refresh error:`, error),
  });
  // `resourceKind` scopes the pass to just the kind the event was about;
  // omitted (hub reconnect catch-up, the poll fallback) reconciles every
  // kind this daemon drives it for.
  const reconcileTeamResourcesFromRemote = async (
    resourceKind?: string,
    workspaceId?: string,
    reason: WorkspaceTeamResourceRefreshReason = 'poll',
    resourceId?: string,
    rememberedLease?: RememberedTeamResourceScopeLease,
  ): Promise<void> => {
    const requestedWorkspaceId = workspaceId?.trim();
    if (!requestedWorkspaceId) return;
    // Background events carry only a Workspace id, not an HTTP request. Resolve
    // that exact membership from the directory at execution time rather than
    // relying on whichever resource request happened to run first in this
    // process (or on the daemon's mutable active context).
    const scope = await resolveTeamResourceScopeForWorkspaceId(requestedWorkspaceId);
    if (!scope) return;
    // The authority read above may finish after an offscreen compatibility
    // lease expired or was LRU-evicted. Do not let that late completion keep
    // prewarming the scope. Subscribed and persisted workspace polls do not
    // carry this token and therefore retain their existing correctness floor.
    if (
      rememberedLease &&
      !rememberedTeamResourceScopes.isLeaseCurrent(rememberedLease)
    ) return;
    const kinds = resourceKind
      ? RECONCILED_TEAM_RESOURCE_KINDS.filter((kind) => kind === resourceKind)
      : RECONCILED_TEAM_RESOURCE_KINDS;
    if (kinds.length === 0) return;
    // A Team listing has two SWR layers: the per-kind parsed/materialized
    // response and the raw shared command underneath it. Drop both before the
    // authoritative reconciliation pass so the next UI read cannot keep
    // serving a pre-retraction outer response after the binding is tombstoned.
    invalidateTeamResourceListingCaches({
      ...(resourceKind ? { resourceKind } : {}),
      scope,
      providers: teamResourceListByKind,
      invalidateSharedCommand: (exactWorkspaceId) =>
        sharedTeamResourcesCommand.invalidate(exactWorkspaceId),
    });
    await teamResourceEventCoordinator.refresh({
      workspaceId: requestedWorkspaceId,
      scope,
      ...(resourceKind ? { resourceKind } : {}),
      ...(resourceId ? { resourceId } : {}),
      reason,
      ...(rememberedLease
        ? {
            isRefreshCurrent: () =>
              rememberedTeamResourceScopes.isLeaseCurrent(rememberedLease),
          }
        : {}),
    });
  };
  const persistentTeamResourceBackgroundWorkspaceIds = (): string[] => {
    const ids = new Set<string>();
    for (const workspaceId of workspaceHubSubscriptions?.activeWorkspaceIds() ?? []) {
      if (workspaceId.trim()) ids.add(workspaceId.trim());
    }
    for (const share of listTeamWorkspaceProjectShares(db)) {
      const workspaceId = String(share.workspaceId ?? '').trim();
      if (workspaceId) ids.add(workspaceId);
    }
    for (const workspaceId of listTeamWorkspaceResourceWorkspaceIds(db)) {
      if (workspaceId.trim()) ids.add(workspaceId.trim());
    }
    return [...ids];
  };
  const teamResourceBackgroundWorkspaceIds = (
    rememberedLeases = rememberedTeamResourceScopes.activeWorkspaceLeases(),
    persistentWorkspaceIds = persistentTeamResourceBackgroundWorkspaceIds(),
  ): string[] => {
    const ids = new Set(persistentWorkspaceIds);
    for (const lease of rememberedLeases) ids.add(lease.workspaceId);
    return [...ids];
  };
  // Dedicated ~15s poll fallback — the "poll-as-floor" half of the same
  // architecture principle `workspaceInvalidationPoller` follows for
  // project/member/context signals (push accelerates delivery; the poll
  // remains a floor for subscribed, persisted, or briefly prewarmed scopes).
  // Kept as its own timer rather than folded into that
  // poller's deps: `workspaceInvalidationPoller` decides whether to emit by
  // diffing a cheap SIGNATURE against the previous one (see its
  // `emitIfChanged`), and there is no equivalent cheap "did the team-shared
  // resource set change" digest in Vela's `/api/v1/collab/sync-digest`, so
  // this re-reads on its own cadence. The coordinator derives a stable
  // id+version signature after materialization and suppresses unchanged emits.
  const teamResourcesPollTimer = setInterval(() => {
    const rememberedLeases = rememberedTeamResourceScopes.activeWorkspaceLeases();
    const rememberedLeasesByWorkspace = new Map(
      rememberedLeases.map((lease) => [lease.workspaceId, lease]),
    );
    const persistentWorkspaceIds = persistentTeamResourceBackgroundWorkspaceIds();
    const persistentWorkspaceIdSet = new Set(persistentWorkspaceIds);
    for (const workspaceId of teamResourceBackgroundWorkspaceIds(
      rememberedLeases,
      persistentWorkspaceIds,
    )) {
      const rememberedLease = persistentWorkspaceIdSet.has(workspaceId)
        ? undefined
        : rememberedLeasesByWorkspace.get(workspaceId);
      void reconcileTeamResourcesFromRemote(
        undefined,
        workspaceId,
        'poll',
        undefined,
        rememberedLease,
      ).catch((error) =>
        console.warn(
          `[od] workspace ${workspaceId} resources poll error:`,
          error,
        ),
       );
    }
  }, 15_000);
  teamResourcesPollTimer.unref?.();

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
    writeAppConfig,
  });
  const { analyticsService } = telemetry;
  workspaceAnalyticsService = analyticsService;
  const design = {
    runs: createChatRunService({
      createSseResponse,
      createSseErrorPayload,
      runsLogDir: path.join(RUNTIME_DATA_DIR, 'runs'),
      // Fold committed side effects into a truncation-proof per-run ledger as
      // each event is emitted, so the finalization verdict (retry safety gate,
      // artifact_count, close-status artifactProducedThisRun) does not depend on
      // early tool_use/artifact events surviving the run.events ring buffer.
      onEventEmitted: (run, record) => {
        if (!run.sideEffectLedger) run.sideEffectLedger = createRunSideEffectLedger();
        foldEventIntoRunSideEffectLedger(run.sideEffectLedger, record);
      },
    }),
    analytics: analyticsService,
    getAppVersion: () => telemetry.getCachedAppVersion()?.version ?? '0.0.0',
    readAnalyticsContext,
  };

  // Runs are process-local, but their terminal obligations are durable. On a
  // fresh daemon boot, repair stale message rows and replay any PostHog or
  // Langfuse terminal work whose checkpoint was not committed. Network work
  // stays off the startup critical path.
  void reconcileDurableRunTerminals({
    analytics: analyticsService,
    appVersion: telemetry.getCachedAppVersion()?.version ?? '0.0.0',
    appVersionInfo: telemetry.getCachedAppVersion(),
    db,
    reportLangfuse: reportRunCompletedFromDaemon,
    runsLogDir: path.join(RUNTIME_DATA_DIR, 'runs'),
  }).then((reconciled) => {
    if (reconciled.interrupted > 0 || reconciled.messagesReconciled > 0) {
      console.warn('[runs] reconciled interrupted run terminals', reconciled);
    }
  }).catch((error) => {
    console.warn('[runs] terminal reconciliation failed', error);
  });

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
  const attributionService = registerAttributionRoutes(app, {
    analytics: analyticsService,
    appConfig: { readAppConfig },
    http: httpDeps,
    paths: { RUNTIME_DATA_DIR },
    env: process.env,
  });
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
    SKILL_ROOTS,
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
    paths: {
      PROJECT_ROOT,
      RESOURCE_ROOT: DAEMON_RESOURCE_ROOT ?? PROJECT_ROOT,
      RUNTIME_DATA_DIR,
    },
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

  registerWhatsNewRoutes(app, {
    whatsNew: createWhatsNewService(),
  });

  registerPluginEventRoutes(app, {
    http: { requireLocalDaemonRequest, sendApiError },
    verifyWorkspaceRequestAuthority,
    plugins: {
      listVisiblePluginIds: async (workspaceId, workspaceMemberId) => new Set(
        (await listWorkspacePlugins(db, workspaceId, workspaceMemberId))
          .map((plugin) => plugin.id),
      ),
    },
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
    findTeamWorkspaceIdForProject,
    getWorkspaceProject,
    getWorkspaceProjectByProjectId,
    listWorkspaceProjectBindings,
    ensureWorkspaceProject,
    listWorkspaceProjects,
    updateWorkspaceProject,
    rebindWorkspaceProject,
    deleteWorkspaceProject,
    countWorkspaceProjectRefs,
    insertProject,
    updateProject,
    dbDeleteProject,
    removeProjectDir,
    stageProjectDirsForDelete,
    validateLinkedDirs,
  };
  const authorizeProjectRequest = createAuthorizeProjectRequest({
    db,
    getWorkspaceProject,
    getWorkspaceProjectByProjectId,
    isProjectRevoked: (_db, projectId) =>
      revokedTeamProjectMirrors.has(projectId),
    verifyWorkspaceReadAuthority,
    verifyWorkspaceRequestAuthority,
    sendApiError,
  });
  const authorizeProjectToolRequest = async (
    res,
    projectId,
    options,
  ) => {
    const binding = getWorkspaceProjectByProjectId(db, projectId);
    if (!binding?.workspaceId) return { workspace: null };

    let authority;
    if (process.env.OD_WORKSPACE_CONTEXT_SOURCE?.trim() === 'vela') {
      const directory = await fetchFreshMutationWorkspaceDirectory().catch(
        () => ({ ok: false, items: [] }),
      );
      if (!directory.ok) {
        sendApiError(
          res,
          503,
          'WORKSPACE_AUTHORITY_UNAVAILABLE',
          'workspace membership authority is temporarily unavailable',
          { retryable: true },
        );
        return null;
      }
      const item = directory.items.find(
        (candidate) => candidate.workspaceId === binding.workspaceId,
      );
      if (!item) {
        sendApiError(
          res,
          403,
          'WORKSPACE_PROJECT_PERMISSION_DENIED',
          'workspace project access is not allowed',
        );
        return null;
      }
      authority = workspaceContextFromDirectoryItem(item);
    } else {
      authority = workspaceContextFromDirectoryItem({
        workspaceId: binding.workspaceId,
        workspaceName: binding.workspaceId,
        workspaceType: 'personal',
        workspaceMemberId:
          binding.createdByWorkspaceMemberId ?? 'local-user',
        role: 'owner',
        memberStatus: 'active',
        lifecycleState: 'active',
      });
    }
    const scopedAuthorize = createAuthorizeProjectRequest({
      db,
      getWorkspaceProject,
      getWorkspaceProjectByProjectId,
      isProjectRevoked: (_db, id) =>
        revokedTeamProjectMirrors.has(id),
      verifyWorkspaceRequestAuthority: async () => ({
        ok: true,
        context: authority,
      }),
      sendApiError,
    });
    const request = {
      query: {},
      get(name) {
        const normalized = name.toLowerCase();
        if (normalized === 'x-od-workspace-id') return authority.workspaceId;
        if (normalized === 'x-od-workspace-member-id') {
          return authority.workspaceMemberId;
        }
        return undefined;
      },
    };
    if (!await scopedAuthorize(request, res, projectId, options)) return null;
    return {
      workspace: {
        workspaceId: authority.workspaceId,
        workspaceMemberId: authority.workspaceMemberId,
      },
    };
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
    getMessage,
    listMessages,
    upsertMessage,
    listPreviewComments,
    listProjectPreviewComments,
    upsertPreviewComment,
    getPreviewComment,
    getProjectPreviewComment,
    updatePreviewCommentStatus,
    updatePreviewCommentAnchor,
    deletePreviewComment,
    reorderPreviewComment,
  };
  const templateDeps = { getTemplate, listTemplates, deleteTemplate, insertTemplate, findTemplateByNameAndProject, updateTemplate };
  const projectStatusDeps = {
    listLatestProjectRunStatuses,
    listProjectsAwaitingInput,
    normalizeProjectDisplayStatus,
    composeProjectDisplayStatus,
    listProjects,
    listUnboundProjects,
  };
  const projectEventDeps = { subscribeFileEvents, activeProjectEventSinks };
  const importDeps = { importClaudeDesignZip, projectDir, detectEntryFile };
  const projectExportDeps = {
    createProjectArchiveStream,
    createBatchArchiveStream,
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
  const appConfigDeps = {
    readAppConfig,
    writeAppConfig,
    onAppConfigWritten: () => {
      // AMR credentials may be overridden through Settings. Observe every
      // completed write so even an A -> B -> A transition with no intervening
      // directory/status read fences exact authority from the old A session.
      refreshWorkspaceHubAccountIdentity();
      void attributionService.processPending().catch((err: unknown) => {
        console.warn('[attribution] pending claim failed', err);
      });
    },
  };
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
    isKnownServiceTier,
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
    authorizeProjectRequest,
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
    fetchProjectCreationWorkspaceDirectory,
    enforceWorkspaceProjectMutation: enforceAuthoritativeProjectMutation,
  });
  app.post('/api/projects/:id/figma/import', (req, res) => {
    figmaUpload.single('file')(req, res, async (err) => {
      if (err) return sendMulterError(res, err);
      try {
        const project = getProject(db, req.params.id);
        if (!project) return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
        if (!await enforceAuthoritativeProjectMutation(
          req,
          res,
          sendApiError,
          getWorkspaceProject,
          getWorkspaceProjectByProjectId,
          db,
          project.id,
          'writeFiles',
        )) return;

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
    // Same provider `collab` was built with (collab.workspaceContext ===
    // workspaceContext) — see the mutation-gate cross-check note above.
    verifyWorkspaceReadAuthority,
    verifyWorkspaceRequestAuthority,
    verifyPersonalProjectDeleteLeaseAuthority,
    authorizeProjectRequest,
    isProjectRevoked: (projectId) =>
      revokedTeamProjectMirrors.has(projectId),
    fetchWorkspaceDirectory,
    fetchProjectCreationWorkspaceDirectory,
    createWorkspaceOwnedDesignSystem: createWorkspaceOwnedDesignSystemForContext,
    pluginScope: {
      loadRegistry: loadPluginRegistryView,
      getPlugin: (id, options) => getWorkspacePluginForRequest(
        db,
        id,
        options.workspaceId,
        options.workspaceMemberId,
      ),
      getLocalPluginBySource: (id, source) => getLocalPluginBySource(
        db,
        id,
        source,
      ),
    },
    events: projectEventDeps,
    ids: idDeps,
    telemetry: {
      reportFinalizedMessage,
      captureProductEvent: async (req, eventName, properties) => {
        const analyticsContext = readAnalyticsContext(req);
        if (!analyticsContext) return;
        await analyticsService.capture({
          eventName,
          context: analyticsContext,
          appVersion: telemetry.getCachedAppVersion()?.version ?? '0.0.0',
          properties,
          insertId: newInsertId(),
        });
      },
      identifyWorkspaceGroup: async (req, workspaceId, properties) => {
        const analyticsContext = readAnalyticsContext(req);
        if (!analyticsContext) return;
        await analyticsService.identifyGroup({
          context: analyticsContext,
          groupType: 'workspace',
          groupKey: workspaceId,
          properties,
        });
      },
    },
    appConfig: appConfigDeps,
    agents: agentDeps,
    validation: validationDeps,
    // C-lane sync seam for D's project-visibility routes: a personal→team move
    // calls requestTeamShare on success to publish the project for the team.
    collabSync: {
      requestTeamShare: async (projectId, ownerMemberId) => {
        const result = await collab.requestTeamShare(projectId, ownerMemberId);
        // The GET cache also contains the fallback "project is shared"
        // verdict when this Workspace has no authoritative presence stream.
        // A successful visibility mutation changes that verdict immediately.
        invalidatePresenceReadCache(projectId);
        return result;
      },
      requestTeamUnshare: async (projectId, ownerMemberId) => {
        const result = await collab.requestTeamUnshare(projectId, ownerMemberId);
        invalidatePresenceReadCache(projectId);
        return result;
      },
      materializeTeamProject: async (projectId, principal) => {
        const outcome = await collabSyncRoutes.pullSharedProject(projectId, {
          workspaceId: principal.teamId,
          resourceTeamId: principal.teamId,
          viewerMemberId: principal.memberId,
          ownerMemberId: principal.memberId,
        });
        if (outcome.status !== 'pulled') {
          throw new Error(`team project materialization ${outcome.status}`);
        }
      },
      refreshTeamProjectMetadata: (projectId) => collab.refreshTeamProjectMetadata(projectId),
      invalidateTeamProjectCatalog: () => {
        teamProjectsDisplayCache.invalidate();
        workspaceTeamProjectCatalog?.invalidate();
      },
    },
    ...(workspaceTeamProjectCatalog ? { teamProjectCatalog: workspaceTeamProjectCatalog } : {}),
    // Second witness for the team-share invariant: refuse a team share aimed at
    // a workspace the directory says is personal, even if the caller's headers
    // claim otherwise. See collab/team-share-scope.ts.
    workspaceTypes,
    // Collab-cloud comment seams (no-op off-team / when unconfigured): stamp the
    // server-authoritative author, gate status/delete on the caller vs the
    // comment author / project owner, and push the comment lifecycle (create/edit,
    // status change, tombstone) to the cross-daemon relay.
    resolveWorkspaceContext: resolveProjectCommentWorkspaceContext,
    resolveReadWorkspaceContext: resolveProjectCommentReadWorkspaceContext,
    resolveProjectOwnerMemberId: async (projectId, context) => {
      if (!context || context.workspaceType !== 'team') return null;
      return resolveSharedProjectOwner(projectId, {
        workspaceId: context.workspaceId,
        workspaceMemberId: context.workspaceMemberId,
      });
    },
    isSharedProject: async (projectId, context) => {
      if (!context || context.workspaceType !== 'team') return false;
      return Boolean(
        await resolveSharedProjectOwner(projectId, {
          workspaceId: context.workspaceId,
          workspaceMemberId: context.workspaceMemberId,
        }),
      );
    },
    ...(collabCloud
      ? {
          onCommentsRead: async (
            projectId,
            leasedContext,
            resolveFreshWorkspaceContext,
          ) => {
            // Consume the hub push channel's dirty mark: first read after
            // opening a project pulls THAT project's missed comments — a
            // targeted pull, because the poll loop only covers projects with
            // a live events subscriber and this read can arrive before (or
            // without) one.
            if (dirtyCommentProjects.delete(projectId)) {
              // The list response may use a short successful authority lease,
              // but the cloud pull mutates local state and therefore must
              // independently prove the same exact member and Workspace with
              // fresh authority. Any denial, outage, identity drift, no-op, or
              // failure restores the dirty mark for a later authorized read.
              if (!leasedContext) {
                dirtyCommentProjects.add(projectId);
                return;
              }
              try {
                const freshResolution = await resolveFreshWorkspaceContext();
                if (!freshResolution.ok || !freshResolution.context) {
                  dirtyCommentProjects.add(projectId);
                  return;
                }
                const freshContext = freshResolution.context;
                if (
                  freshContext.workspaceId !== leasedContext.workspaceId
                  || freshContext.workspaceMemberId
                    !== leasedContext.workspaceMemberId
                ) {
                  dirtyCommentProjects.add(projectId);
                  return;
                }
                if (!await collabCloud.pullProject(projectId, freshContext)) {
                  dirtyCommentProjects.add(projectId);
                }
              } catch {
                dirtyCommentProjects.add(projectId);
              }
            }
          },
          // The durable outbox also reconciles pin_seq (recvq5BVsolIxi): a genuinely
          // new comment on a team-shared project is inserted with a
          // provisional LOCAL pin_seq (pin_seq_confirmed=0 — see
          // upsertPreviewComment); once this push resolves with the
          // collab-cloud's globally-serialized seq, confirmPreviewCommentPinSeq
          // overwrites it with that authoritative value, which is what keeps
          // two devices creating a comment in the same ~5s poll window from
          // ever landing on the same number. The guard inside
          // confirmPreviewCommentPinSeq is idempotent, so a coalesced edit can
          // safely supply the first successful relay seq when the create's
          // original delivery failed.
          onCommentCreated: (comment, context) => {
            if (!context) return;
            const enqueued = collabCloud.enqueueComment(comment, context);
            if (!enqueued) {
              console.warn('[od] refused to enqueue comment without exact Team authority');
            }
            return enqueued;
          },
          onCommentUpdated: (comment, context) => {
            if (!context) return;
            const enqueued = collabCloud.enqueueComment(comment, context);
            if (!enqueued) {
              console.warn('[od] refused to enqueue comment update without exact Team authority');
            }
            return enqueued;
          },
          onCommentDeleted: (comment, context) => {
            if (!context) return;
            const enqueued = collabCloud.enqueueCommentDeletion(comment, context);
            if (!enqueued) {
              console.warn('[od] refused to enqueue comment deletion without exact Team authority');
            }
            return enqueued;
          },
        }
      : {}),
  });
  registerTerminalRoutes(app, {
    db,
    http: httpDeps,
    paths: pathDeps,
    projectStore: projectStoreDeps,
    projectFiles: projectFileDeps,
    terminals: terminalService,
    authorizeProjectRequest,
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
    fetchProjectCreationWorkspaceDirectory,
    enforceWorkspaceProjectMutation: enforceAuthoritativeProjectMutation,
  });

  // Whether the caller may mutate (edit / publish-toggle / delete) a design
  // system. A system pulled from a teammate's team share (`teamSynced` in its
  // metadata.json — see `isTeamSyncedUserDesignSystem`) is only mutable by
  // whoever `canManageSharedResource` says may manage the share — the same
  // principal check `unshare` already enforces. Anything not teamSynced is
  // the caller's own, so it stays unrestricted.
  //
  // Spec 9.2: on top of that existing rule, a workspace the caller's own
  // request marks as locked/deleted (billing lapse, deletion in progress)
  // blocks mutation unconditionally — the one real gap design system had
  // that project/plugin already closed via `enforceWorkspaceResourceMutation`.
  // Reuses that module's own `workspaceResourceContextFromRequest`/
  // `isWorkspaceResourceLocked` rather than re-deriving the header contract
  // here.
  //
  // Hoisted out of `registerDesignSystemRoutes`'s deps (recvqb6mfyqXLD) so
  // `registerStaticResourceRoutes`'s design-system LIST route can decorate
  // every teamSynced entry with the same verdict — any detail surface a
  // design system's summary reaches (not just the single-item GET) can then
  // gate its own edit/publish/delete affordances on the authority the
  // backend actually enforces, instead of re-deriving (or forgetting to
  // derive) an equivalent check per surface.
  const canMutateUserDesignSystem = async (
    root: string,
    id: string,
    req: any,
  ): Promise<boolean> => {
    const requestCtx = workspaceResourceContextFromRequest(req);
    if (requestCtx && requestCtx !== 'missing' && isWorkspaceResourceLocked(requestCtx)) {
      return false;
    }
    const synced = await isTeamSyncedUserDesignSystem(root, id);
    if (!synced) return true;
    const resolution = await resolveTeamResourceScope(req);
    if (!resolution.ok) return false;
    const resources = await designSystemsTeamShare.sharedResources(resolution.scope);
    return resources.find((resource) => resource.id === id)?.canUnshare === true;
  };

  // Resource catalog
  registerStaticResourceRoutes(app, {
    db,
    http: httpDeps,
    paths: pathDeps,
    verifyWorkspaceReadAuthority,
    verifyWorkspaceRequestAuthority,
    teamResources: collab.teamResources,
    resources: {
      listAllSkills,
      listAllDesignTemplates,
      listAllSkillLikeEntries,
      listAllDesignSystems,
      resolveWorkspaceScope: resolveDesignSystemWorkspaceScope,
      canMutateUserDesignSystem,
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
  const designSystemRouteServices = registerDesignSystemRoutes(app, {
    db,
    paths: pathDeps,
    projectStore: projectStoreDeps,
    projectFiles: projectFileDeps,
    verifyWorkspaceRequestAuthority,
    workspaceResources: { getWorkspaceResource, getWorkspaceResourceByResourceId },
    designSystems: {
      buildUserDesignSystemArchive,
      // Hoisted above (before `registerStaticResourceRoutes`) so the
      // design-system LIST route can reuse the exact same verdict.
      canMutateUserDesignSystem,
      createUserDesignSystem: createWorkspaceOwnedDesignSystem,
      deleteUserDesignSystem,
      // spec 04 §11: unshare `id` from the team hub before DELETE proceeds
      // locally, but ONLY when it is on the LIVE team share list — never
      // `isTeamSyncedUserDesignSystem` alone. That flag is
      // true only for a teammate's PULLED copy; the sharer deleting their own
      // original always reads `teamSynced: false`, so a check gated on it
      // would keep letting the sharer's own delete sail past unnoticed, which
      // is exactly how the hub index used to survive this route untouched
      // and `syncSharedTeamDesignSystem` kept re-stamping `markTeamSynced()`
      // onto every teammate forever.
      unshareTeamDesignSystemIfShared: async (id, req) => {
        const requestContext = workspaceResourceContextFromRequest(req);
        const hasWorkspaceContextHeaders = Object.keys(req.headers ?? {}).some(
          (name) => name.startsWith('x-od-workspace-') || name === 'x-od-app-user-id',
        );
        if (requestContext === null && !hasWorkspaceContextHeaders) return false;
        const verified = await verifyExplicitWorkspaceRequestContext({
          req,
          requireTeam: false,
        });
        if (!verified.ok) {
          throw Object.assign(new Error(verified.message), {
            status: verified.status,
            code: verified.code,
            ...(verified.retryable ? { retryable: true } : {}),
          });
        }
        // Personal resources have no Team hub partition to retract. Their
        // authoritative Personal scope is still verified above, then local
        // deletion proceeds without issuing a Team command.
        if (verified.context.workspaceType !== 'team') return false;
        const scope = teamResourceRequestScopeFromContext(verified.context);
        if (!scope) {
          throw Object.assign(new Error('the requested workspace is not available to this member'), {
            status: 403,
            code: 'WORKSPACE_ACCESS_DENIED',
          });
        }
        const rememberedScope = rememberTeamResourceScope(scope);
        const unshared = await unshareIfCurrentlyShared(
          designSystemsTeamShare,
          id,
          rememberedScope,
        );
        if (unshared) {
          designSystemsTeamList.invalidate(rememberedScope);
          notifyDesignSystemLinkedMutation(id, rememberedScope, 'personal');
        }
        return unshared;
      },
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
      syncUserDesignSystemAssetsFromWorkspace,
      updateUserDesignSystem,
      updateUserDesignSystemRevisionStatus,
    },
    generationJobs: designSystemGenerationJobs,
  });
  registerBrandRoutes(app, {
    resolveCreatedProjectHome,
    brandsRoot: BRANDS_DIR,
    userDesignSystemsRoot: USER_DESIGN_SYSTEMS_DIR,
    resolveDesignSystemWorkspaceId: resolveDesignSystemWorkspaceScope,
    authorizeDesignSystemRead: designSystemRouteServices.authorizeDesignSystemRead,
    deleteDesignSystemForRequest: designSystemRouteServices.deleteDesignSystemForRequest,
    isDesignSystemWorkspaceBound: (designSystemId) =>
      Boolean(getWorkspaceResourceByResourceId(db, 'design_system', designSystemId))
      || listTeamWorkspaceResourceWorkspaceIds(db).some((workspaceId) =>
        Boolean(getWorkspaceResource(
          db,
          'design_system',
          workspaceId,
          workspaceTeamDesignSystemBindingResourceId(workspaceId, designSystemId),
        )),
      ),
    authorizeProjectRequest,
    createWorkspaceOwnedDesignSystem: createWorkspaceOwnedDesignSystemForContext,
    deleteWorkspaceOwnedDesignSystem: (root, designSystemId) =>
      removeWorkspaceOwnedDesignSystem(root, designSystemId, {
        deleteUserDesignSystem,
        deleteWorkspaceResourceByResourceId: (resourceType, resourceId) =>
          deleteWorkspaceResourceByResourceId(db, resourceType, resourceId),
      }),
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
    authorizeProjectRequest,
    authorizeProjectToolRequest,
  });
  registerDesignSystemToolRoutes(app, {
    auth: authDeps,
    http: httpDeps,
    paths: {
      ...pathDeps,
      resolveUserDesignSystemsRoot: (grant, designSystemId) => {
        if (!designSystemId.startsWith('user:')) {
          return { ok: true, root: USER_DESIGN_SYSTEMS_DIR };
        }
        const resolved = resolvePinnedRunDesignSystemScope({
          db,
          scope: grant.designSystemScope,
          designSystemId,
          userRoot: USER_DESIGN_SYSTEMS_DIR,
        });
        return resolved.ok
          ? { ok: true, root: resolved.root }
          : resolved;
      },
    },
    projects: { getProject: (id: string) => getProject(db, id) },
    runs: { getRun: (id: string) => design.runs.get(id) },
    features: {
      isDesignSystemRuntimeEnabled: () => isDesignTokenChannelEnabled(process.env),
    },
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
    authorizeProjectRequest,
  });
  registerFinalizeRoutes(app, {
    db,
    http: httpDeps,
    paths: pathDeps,
    projectStore: projectStoreDeps,
    validation: validationDeps,
    finalize: finalizeDeps,
    authorizeProjectRequest,
  });
  registerHandoffRoutes(app, {
    db,
    http: httpDeps,
    paths: pathDeps,
    projectStore: projectStoreDeps,
    conversations: conversationDeps,
    validation: validationDeps,
    handoff: handoffDeps,
    authorizeProjectRequest,
  });
  registerDeploymentCheckRoutes(app, {
    db,
    http: httpDeps,
    deploy: deployDeps,
    projectStore: projectStoreDeps,
    authorizeProjectRequest,
  });
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
    auth: authDeps,
    authorizeProjectRequest,
    authorizeProjectToolRequest,
    isApiTokenAuthorization,
    projectPreviewScopes,
  });
  registerProjectFileRoutes(app, {
    db,
    http: httpDeps,
    paths: pathDeps,
    uploads: uploadDeps,
    node: nodeDeps,
    projectStore: projectStoreDeps,
    authorizeProjectRequest,
    isProjectRevoked: (projectId) =>
      revokedTeamProjectMirrors.has(projectId),
    projectFiles: projectFileDeps,
    documents: { buildDocumentPreview },
    artifacts: artifactDeps,
    projectPreviewScopes,
    verifyWorkspaceRequestAuthority,
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
    fetchWorkspaceDirectory,
    authorizeProjectRequest,
    authorizeProjectToolRequest,
  });

  registerVelaRoutes(app, {
    paths: { RUNTIME_DATA_DIR },
    appConfig: { readAppConfig },
    http: { getPublicBaseUrl },
    env: process.env,
    onCredentialStateObserved: refreshWorkspaceHubAccountIdentity,
  });

  const allowScopedPluginReplace = (
    scope: { workspaceId: string; workspaceMemberId: string } | null,
    pluginId: string,
  ): boolean | string => {
    if (!scope) return true;
    const installed = getInstalledPlugin(db, pluginId);
    if (installed?.sourceKind === 'bundled') {
      return `Bundled plugin "${pluginId}" cannot be replaced`;
    }
    const binding = getWorkspaceResourceByResourceId(db, 'plugin', pluginId);
    if (
      binding?.workspaceId === scope.workspaceId
      && binding.visibility === 'personal'
      && binding.createdByWorkspaceMemberId === scope.workspaceMemberId
    ) return true;
    return `Plugin "${pluginId}" is owned by another workspace member`;
  };

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
    installOrUpgradePlugin: async (req, res, mode, installWorkspaceContext) => {
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
      // A fresh scoped install is stamped Personal to the exact verified
      // Workspace/member. Replacement is checked before any existing bytes
      // are removed, so another member cannot overwrite a same-id Personal
      // plugin. Headerless local/CLI installs remain unbound and available on
      // that compatibility lane, but explicit Workspaces quarantine them.
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
          allowReplacePlugin: (pluginId) =>
            allowScopedPluginReplace(installWorkspaceContext, pluginId),
        })) {
          writeEvent(ev.kind, ev);
          if (ev.kind === 'success' && mode === 'install' && installWorkspaceContext && ev.plugin?.id) {
            ensureWorkspaceResource(db, 'plugin', installWorkspaceContext.workspaceId, ev.plugin.id, {
              visibility: 'personal',
              resourceState: 'active',
              createdByWorkspaceMemberId: installWorkspaceContext.workspaceMemberId,
              updatedByWorkspaceMemberId: installWorkspaceContext.workspaceMemberId,
            });
          }
          if (ev.kind === 'success' || ev.kind === 'error') break;
        }
      } catch (err) {
        writeEvent('error', { kind: 'error', message: String(err), warnings: [] });
      } finally {
        res.end();
      }
    },
    handleShareProject: async (req, res, sourcePlugin) => {
      try {
        if (!USER_PLUGIN_SOURCE_KINDS.has(sourcePlugin.sourceKind)) return res.status(409).json({ ok: false, code: 'plugin-not-shareable', message: 'Only user-installed plugins can start a share project.' });
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const action = normalizePluginShareAction(body.action);
        if (!action) return sendApiError(res, 400, 'BAD_REQUEST', 'action must be publish-github or contribute-open-design');
        const createWorkspace = await authorizeCreatedProjectWorkspace(
          req,
          fetchProjectCreationWorkspaceDirectory,
        );
        if (!createWorkspace.ok) {
          return sendCreatedProjectWorkspaceError(res, createWorkspace);
        }
        const actionPluginId = PLUGIN_SHARE_ACTION_PLUGIN_IDS[action];
        const actionPlugin = getInstalledPlugin(db, actionPluginId);
        if (!actionPlugin) return res.status(409).json({ ok: false, code: 'share-action-plugin-missing', message: `The bundled action plugin "${actionPluginId}" is not installed. Restart the daemon so bundled plugins are registered.` });
        const now = Date.now(); const id = randomId(); const cid = randomId(); const sourceSlug = githubRepoNameFromPluginName(sourcePlugin.id); const stagedPath = `plugin-source/${sourceSlug}`; const prompt = renderPluginSharePrompt({ action, sourcePlugin, stagedPath }); const metadata = { kind: 'prototype' }; const projectRoot = await ensureProject(PROJECTS_DIR, id, metadata); await copyPluginFolderForProjectContext(sourcePlugin.fsPath, path.join(projectRoot, 'plugin-source', sourceSlug));
        insertProject(db, { id, name: `${PLUGIN_SHARE_ACTION_LABELS[action]}: ${sourcePlugin.title || sourcePlugin.id}`, skillId: null, designSystemId: null, pendingPrompt: prompt, metadata, createdAt: now, updatedAt: now });
        insertConversation(db, { id: cid, projectId: id, title: null, createdAt: now, updatedAt: now });
        // The share task IS a chat project — it opens with a seeded prompt the
        // user immediately runs. `createPluginShareProject` (apps/web) mints no
        // workspace headers at all, so this was permanently unbound, not merely
        // racy: the very first turn 403s on the workspace gate.
        bindCreatedProjectToWorkspace(
          (input) => ensureWorkspaceProject(db, input),
          createWorkspace.context,
          id,
          now,
        );
        const registry = await loadPluginRegistryView(
          createWorkspace.context
            ? {
                workspaceId: createWorkspace.context.workspaceId,
                workspaceMemberId: createWorkspace.context.workspaceMemberId,
              }
            : {},
        );
        const connectorProbe = buildConnectorProbe(connectorService);
        const resolved = resolvePluginSnapshot({ db, body: { pluginId: actionPluginId, pluginInputs: { source_plugin_id: sourcePlugin.id, source_plugin_title: sourcePlugin.title || sourcePlugin.id, source_plugin_version: sourcePlugin.version, source_plugin_path: sourcePlugin.fsPath, plugin_context_path: stagedPath }, locale: typeof body.locale === 'string' ? body.locale : undefined }, projectId: id, conversationId: cid, registry, connectorProbe });
        if (resolved && !resolved.ok) return res.status(resolved.status).json(resolved.body);
        const project = getProject(db, id); if (!project) return sendApiError(res, 500, 'INTERNAL_ERROR', 'created project could not be loaded');
        res.json({ ok: true, project, conversationId: cid, ...(resolved?.ok ? { appliedPluginSnapshotId: resolved.snapshotId } : {}), actionPluginId, sourcePluginId: sourcePlugin.id, stagedPath, prompt, message: `Created a ${PLUGIN_SHARE_ACTION_LABELS[action]} task for ${sourcePlugin.title || sourcePlugin.id}.` });
      } catch (err) { res.status(400).json({ ok: false, message: String(err?.message || err) }); }
    },
    handlePluginTrust: async (req, res, plugin) => {
      try {
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
    handlePluginStats: async (res, scopedInstalled, scopedSnapshotRows) => {
      try { const { pluginInventoryStats, snapshotInventoryStats } = await import('./plugins/stats.js'); const installed = scopedInstalled ?? listInstalledPlugins(db); const inventoryRows = scopedSnapshotRows ?? db.prepare(`SELECT status, project_id, run_id, applied_at FROM applied_plugin_snapshots`).all(); res.json({ plugins: pluginInventoryStats(installed), snapshots: snapshotInventoryStats(inventoryRows), generatedAt: Date.now() }); } catch (err) { res.status(500).json({ error: String(err) }); }
    },
    handleAppliedPluginExport: async (req, res) => {
      try { const body = req.body && typeof req.body === 'object' ? req.body : {}; const target = body.target === 'od' || body.target === 'claude-plugin' || body.target === 'agent-skill' ? body.target : null; if (!target) return res.status(400).json({ error: 'target must be one of: od, claude-plugin, agent-skill' }); const outDir = typeof body.outDir === 'string' && body.outDir.length > 0 ? body.outDir : null; if (!outDir) return res.status(400).json({ error: 'outDir is required' }); const { exportPlugin, ExportError } = await import('./plugins/export.js'); try { const result = await exportPlugin({ db, target, outDir, ...(typeof body.snapshotId === 'string' ? { snapshotId: body.snapshotId } : {}), ...(typeof body.projectId === 'string' ? { projectId: body.projectId } : {}) }); res.json({ ok: true, ...result }); } catch (err) { if (err instanceof ExportError) return res.status(404).json({ error: err.message }); throw err; } } catch (err) { res.status(500).json({ error: String(err) }); }
    },
    handleProjectInstallFolder: async (req, res) => {
      try { const project = getProject(db, req.params.id); if (!project) return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found'); const projectBinding = getWorkspaceProjectByProjectId(db, req.params.id); if (!projectBinding?.workspaceId || !projectBinding.createdByWorkspaceMemberId) return sendApiError(res, 409, 'WORKSPACE_PROJECT_UNBOUND', 'project must have an exact workspace owner before installing a plugin'); const installScope = { workspaceId: String(projectBinding.workspaceId), workspaceMemberId: String(projectBinding.createdByWorkspaceMemberId) }; const body = req.body && typeof req.body === 'object' ? req.body : {}; const relativePath = normalizeProjectPluginFolderPath(body.path); const projectRoot = resolveProjectDir(PROJECTS_DIR, req.params.id, project.metadata); const folder = await resolveProjectChildDirectory(projectRoot, relativePath); const warnings = []; const log = []; let plugin = null; let message = 'Install finished.'; for await (const ev of installPlugin(db, { source: folder, roots: PLUGIN_REGISTRY_ROOTS, allowReplacePlugin: (pluginId) => allowScopedPluginReplace(installScope, pluginId) })) { if (ev.message) log.push(ev.message); if (Array.isArray(ev.warnings)) warnings.splice(0, warnings.length, ...ev.warnings); if (ev.kind === 'success') { plugin = ev.plugin; ensureWorkspaceResource(db, 'plugin', installScope.workspaceId, ev.plugin.id, { visibility: 'personal', resourceState: 'active', createdByWorkspaceMemberId: installScope.workspaceMemberId, updatedByWorkspaceMemberId: installScope.workspaceMemberId }); message = `Installed ${ev.plugin.title}.`; break; } if (ev.kind === 'error') { message = ev.message; break; } } res.status(plugin ? 200 : 400).json({ ok: Boolean(plugin), plugin, warnings, message, log }); } catch (err) { const code = err && err.code; const status = code === 'ENOENT' || code === 'ENOTDIR' ? 404 : 400; sendApiError(res, status, status === 404 ? 'PLUGIN_FOLDER_NOT_FOUND' : 'BAD_REQUEST', String(err?.message || err)); }
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
  async function loadPluginRegistryView(options: {
    workspaceId?: string | null;
    workspaceMemberId?: string | null;
  } = {}) {
    const [skills, designSystems] = await Promise.all([
      listAllSkills(options),
      listAllDesignSystems(
        options.workspaceId !== undefined
          ? {
              workspaceId: options.workspaceId,
              workspaceMemberId: options.workspaceMemberId ?? null,
            }
          : {},
      ),
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

  const readWorkspaceTeamPlugin = async (
    workspaceId: string,
    pluginId: string,
  ) => {
    const marker = await readTeamResourceMaterialization(
      PLUGIN_REGISTRY_ROOTS.userPluginsRoot,
      workspaceId,
      pluginId,
      pluginId,
    );
    if (!marker) return null;
    if (!workspaceTeamPluginBindingAllowsRead(db, workspaceId, pluginId)) {
      return null;
    }
    // Upgrade compatibility: materializations created before Team plugins
    // joined `workspace_resources` remain readable, but the first exact-scope
    // read adopts them so hub SSE/reconnect/poll retractions can tombstone
    // them from then on. Never takes over a Personal or other-Workspace row.
    const teamBindingResourceId = workspaceTeamPluginBindingResourceId(
      workspaceId,
      pluginId,
    );
    const existingBinding = getWorkspaceResourceByResourceId(
      db,
      'plugin',
      teamBindingResourceId,
    );
    if (!existingBinding) {
      ensureWorkspaceResource(
        db,
        'plugin',
        workspaceId,
        teamBindingResourceId,
        {
          visibility: 'team',
          resourceState: 'active',
          resourceHubResourceId: marker.hubResourceId,
        },
      );
    }
    return resolveWorkspaceTeamPluginWithBindingGate({
      bindingAllowsRead: () =>
        workspaceTeamPluginBindingAllowsRead(db, workspaceId, pluginId),
      resolve: async () => {
        const resolved = await resolvePluginFolder({
          folder: teamResourceMaterializationDir(
            PLUGIN_REGISTRY_ROOTS.userPluginsRoot,
            workspaceId,
            pluginId,
            pluginId,
          ),
          folderId: pluginId,
          sourceKind: 'user',
          source: marker.sourceKey,
        });
        return resolved.ok ? resolved.record : null;
      },
    });
  };
  const listWorkspacePlugins = async (
    dbHandle,
    workspaceId?: string | null,
    workspaceMemberId?: string | null,
  ) => {
    const personal = listInstalledPlugins(dbHandle, workspaceId, workspaceMemberId);
    const exactWorkspaceId = workspaceId?.trim();
    if (!exactWorkspaceId) return personal;
    const workspaceRoot = teamResourceWorkspaceRoot(
      PLUGIN_REGISTRY_ROOTS.userPluginsRoot,
      exactWorkspaceId,
    );
    let entries: fs.Dirent[] = [];
    try {
      entries = await fs.promises.readdir(workspaceRoot, { withFileTypes: true });
    } catch {
      return personal;
    }
    const team = (
      await Promise.all(
        entries
          .filter((entry) => entry.isDirectory())
          .map((entry) => readWorkspaceTeamPlugin(exactWorkspaceId, entry.name)),
      )
    ).filter((plugin): plugin is NonNullable<typeof plugin> => plugin != null);
    const teamIds = new Set(team.map((plugin) => plugin.id));
    return [...team, ...personal.filter((plugin) => !teamIds.has(plugin.id))];
  };
  const getWorkspacePluginForRequest = async (
    dbHandle,
    id: string,
    workspaceId: string | null,
    workspaceMemberId?: string | null,
  ) => {
    const exactWorkspaceId = workspaceId?.trim();
    if (exactWorkspaceId) {
      const team = await readWorkspaceTeamPlugin(exactWorkspaceId, id);
      if (team) return team;
    }
    return listInstalledPlugins(dbHandle, workspaceId, workspaceMemberId).find(
      (plugin) => plugin.id === id,
    ) ?? null;
  };
  const getLocalPluginBySource = async (
    dbHandle,
    id: string,
    source: string,
  ) => resolveLocalPluginBySource({
    db: dbHandle,
    id,
    source,
    userPluginsRoot: PLUGIN_REGISTRY_ROOTS.userPluginsRoot,
  });

  registerPluginRoutes(app, {
    db,
    authorizeProjectRequest,
    teamResources: collab.teamResources,
    paths: { PROJECTS_DIR, PLUGIN_REGISTRY_ROOTS, PLUGIN_LOCKFILE_PATH },
    ids: idDeps,
    projectStore: projectStoreDeps,
    conversations: conversationDeps,
    fetchProjectCreationWorkspaceDirectory,
    verifyWorkspaceReadAuthority,
    verifyWorkspaceRequestAuthority,
    workspaceResources: {
      getWorkspaceResource,
      getWorkspaceResourceByResourceId,
      workspaceTeamPluginBindingAllowsRead,
      getWorkspaceProjectByProjectId,
    },
    plugins: {
      listInstalledPlugins: listWorkspacePlugins,
      getInstalledPlugin,
      getWorkspacePlugin: getWorkspacePluginForRequest,
      getLocalPluginBySource,
      installPlugin,
      isSafePluginId,
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
    verifyWorkspaceRequestAuthority,
    getWorkspacePlugin: getWorkspacePluginForRequest,
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
    authorizeProjectRequest,
  });

  registerProjectPluginRoutes(app, {
    db,
    authorizeProjectRequest,
    paths: { PROJECTS_DIR, PLUGIN_REGISTRY_ROOTS, PLUGIN_LOCKFILE_PATH },
    ids: idDeps,
    projectStore: projectStoreDeps,
    conversations: conversationDeps,
    plugins: {
      listInstalledPlugins,
      getInstalledPlugin,
      installPlugin,
      isSafePluginId,
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
  registerProjectUploadRoutes(app, {
    db,
    http: httpDeps,
    uploads: uploadDeps,
    node: nodeDeps,
    paths: { PROJECTS_DIR },
    projectStore: projectStoreDeps,
    authorizeProjectRequest,
    authorizeProjectToolRequest,
    projectFiles: projectFileDeps,
    verifyWorkspaceRequestAuthority,
  });

  const composeDaemonSystemPrompt = async ({
    agentId,
    projectId,
    skillId,
    skillIds,
    designSystemId,
    streamFormat,
    locale,
    sessionMode,
    appliedPluginSnapshotId,
    mediaExecution,
    byokMediaDefaults,
    freeformDeckSignal,
    mediaHintSignal,
    platformHintSignal,
    workspaceScope,
    designSystemScope,
  }) => {
    const project =
      typeof projectId === 'string' && projectId
        ? getProject(db, projectId)
        : null;
    const projectWorkspaceId =
      typeof workspaceScope?.workspaceId === 'string'
        ? workspaceScope.workspaceId.trim()
        : '';
    const projectCreatorMemberId =
      typeof workspaceScope?.workspaceMemberId === 'string'
        ? workspaceScope.workspaceMemberId.trim()
        : '';
    const metadata = project?.metadata;
    const localCatalogScope = (value) => {
      const workspaceId = typeof value?.workspaceId === 'string'
        ? value.workspaceId.trim()
        : '';
      const workspaceMemberId = typeof value?.workspaceMemberId === 'string'
        ? value.workspaceMemberId.trim()
        : '';
      return workspaceId && workspaceMemberId
        ? { workspaceId, workspaceMemberId }
        : null;
    };
    // Resource provenance is intentionally independent from project
    // attribution. A Home selection can be staged while Workspace identity is
    // transitioning; the daemon persists the local catalogue partition so
    // the first run reads the same local record without waiting for identity
    // discovery or treating this as remote membership authority.
    const skillCatalogScope = localCatalogScope(metadata?.localCatalogScopes?.skill);
    const designSystemCatalogScope = localCatalogScope(
      metadata?.localCatalogScopes?.designSystem,
    );
    const designSystemWorkspaceId =
      designSystemCatalogScope?.workspaceId ?? projectWorkspaceId;
    const designSystemMemberId =
      designSystemCatalogScope?.workspaceMemberId ?? projectCreatorMemberId;
    const projectDesignSystemBinding = (summary) => {
      if (!designSystemWorkspaceId || summary?.source === 'built-in') return null;
      const logicalResourceId =
        typeof summary?.id === 'string' ? summary.id.trim() : '';
      if (!logicalResourceId) return null;
      if (summary?.teamSynced === true) {
        const canonicalTeamBinding = getWorkspaceResource(
          db,
          'design_system',
          designSystemWorkspaceId,
          workspaceTeamDesignSystemBindingResourceId(
            designSystemWorkspaceId,
            logicalResourceId,
          ),
        );
        if (canonicalTeamBinding) return canonicalTeamBinding;
      }
      // Keep legacy rows readable while old local data converges to the
      // Workspace-qualified Team envelope id.
      return getWorkspaceResource(
        db,
        'design_system',
        designSystemWorkspaceId,
        logicalResourceId,
      ) ?? null;
    };
    const designSystemVisibleToRun = (summary) => {
      if (summary?.source === 'built-in') return true;
      // A truly unbound local project is the legacy CLI/BYOK lane. Bound
      // projects must resolve resources from their persisted project scope;
      // shell/current Workspace state never participates.
      if (!designSystemWorkspaceId) return true;
      const binding = projectDesignSystemBinding(summary);
      if (
        !binding
        || binding.resourceState === 'deleted'
      ) {
        return false;
      }
      if (binding.visibility === 'team') return true;
      return binding.visibility === 'personal'
        && Boolean(designSystemMemberId)
        && binding.createdByWorkspaceMemberId?.trim() === designSystemMemberId;
    };
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
    // Website Clone runs reproduce someone else's site: the fidelity target
    // is the original page. Treating a project/app design system as
    // authoritative would overwrite the cloned site's palette/typography
    // with the user's brand, and universal craft rules would "improve"
    // visual decisions the clone must preserve verbatim — so both prompt
    // blocks are skipped for these runs. Step 6 of the skill (replace with
    // the user's own content) is where brand application belongs.
    const isWebCloneRun = metadata?.intent === 'web-clone';
    const designSystemSelection = isWebCloneRun
      ? { id: null, source: 'none' }
      : resolveEffectiveDesignSystemSelection({
          requestDesignSystemId: designSystemId,
          pluginDesignSystemId,
          projectDesignSystemId: project?.designSystemId,
          appDefaultDesignSystemId: appConfigForPrompt?.designSystemId,
          disabledDesignSystemIds: appConfigForPrompt?.disabledDesignSystems,
          // A project row with designSystemId=null can mean the user picked
          // "No design system"; do not reapply the global default behind their back.
          allowAppDefault: project === null,
        });
    const effectiveDesignSystemId = designSystemSelection.id;
    const skillResourceScope = skillCatalogScope ?? (
      projectWorkspaceId
        ? {
            workspaceId: projectWorkspaceId,
            workspaceMemberId: projectCreatorMemberId || null,
          }
        : null
    );
    let allSkillsPromise: ReturnType<typeof listAllSkillLikeEntries> | null = null;
    const loadAllSkills = async () => {
      allSkillsPromise ??= skillResourceScope
        ? listAllSkillLikeEntries(skillResourceScope)
        : listAllSkillLikeEntries();
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
            } else {
              // The plugin references a shared global skill by id
              // (`od.context.skills[{ ref: '<skill-id>' }]`) instead of
              // shipping its own SKILL.md — resolve it from the global
              // registry so the pinned plugin still gets the skill body AND
              // its companion dir staged into the project cwd (scripts, etc).
              // Lets many example plugins share one skill without each
              // duplicating the SKILL.md and its scripts.
              const skillRef = plugin.manifest?.od?.context?.skills?.find(
                (ref): ref is { ref: string } =>
                  typeof (ref as { ref?: unknown })?.ref === 'string'
                  && (ref as { ref: string }).ref.trim().length > 0,
              )?.ref?.trim();
              if (skillRef) {
                const allSkills = await loadAllSkills();
                const refSkill = findSkillById(allSkills, skillRef);
                if (refSkill) {
                  skillBody = refSkill.body + composedSkillBlocks;
                  skillName = refSkill.name;
                  activeSkillDir = refSkill.dir;
                  registerPrimarySkillMode(refSkill.mode);
                  registerSkillDir(refSkill.dir);
                  skillCritiquePolicy = mergeSkillCritiquePolicy(
                    skillCritiquePolicy,
                    refSkill.critiquePolicy,
                  );
                  if (Array.isArray(refSkill.craftRequires)) {
                    for (const craft of refSkill.craftRequires) {
                      if (!skillCraftRequires.includes(craft)) skillCraftRequires.push(craft);
                    }
                  }
                }
              }
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
    let designSystemIntentIndex;
    let designSystemRuntimeIssue;
    let designSystemImportMode;
    let designSystemCraftApplies = [];
    let designSystemCraftExemptions = [];
    let activeDesignSystemId = null;
    let designSystemDigest = null;
    if (effectiveDesignSystemId) {
      const userDesignSystem = effectiveDesignSystemId.startsWith('user:');
      // A run with a captured scope must resolve that exact resource even if
      // the project was later rebound. A legacy, unbound run without a
      // catalog provenance remains local. Projects created during Workspace
      // identity transitions intentionally use their immutable local catalog
      // provenance instead: it identifies a local record, not Workspace
      // membership or billing authority.
      const localCatalogDesignSystemRun =
        designSystemScope?.kind === 'local' && Boolean(designSystemCatalogScope);
      const usePinnedDesignSystemScope = userDesignSystem
        && !localCatalogDesignSystemRun
        && (
          designSystemScope !== null && designSystemScope !== undefined
          || (!designSystemCatalogScope && !projectWorkspaceId)
        );
      const effectivePinnedScope = usePinnedDesignSystemScope
        ? designSystemScope
          ?? (
            !projectWorkspaceId
              ? {
                  schemaVersion: 1,
                  kind: 'local',
                  projectId: typeof projectId === 'string' ? projectId : '',
                  designSystemId: effectiveDesignSystemId,
                }
              : null
          )
        : null;
      const pinnedResolution = usePinnedDesignSystemScope
        ? resolvePinnedRunDesignSystemScope({
            db,
            scope: effectivePinnedScope,
            designSystemId: effectiveDesignSystemId,
            userRoot: USER_DESIGN_SYSTEMS_DIR,
          })
        : null;
      const designSystemListOptions = usePinnedDesignSystemScope
        ? pinnedResolution?.ok && pinnedResolution.visibility === 'team'
          ? {
              workspaceId: pinnedResolution.workspaceId,
              workspaceMemberId: pinnedResolution.workspaceMemberId,
              exactTeam: true,
            }
          : pinnedResolution?.ok && pinnedResolution.visibility === 'personal'
            ? {
                workspaceId: pinnedResolution.workspaceId,
                workspaceMemberId: pinnedResolution.workspaceMemberId,
                exactPersonal: true,
              }
            : {}
        : designSystemWorkspaceId
          ? {
              workspaceId: designSystemWorkspaceId,
              workspaceMemberId: designSystemMemberId || null,
            }
          : {};
      const designSystemVisibleForRun = (system) => {
        if (!usePinnedDesignSystemScope) return designSystemVisibleToRun(system);
        if (system?.source === 'built-in') return true;
        if (!pinnedResolution?.ok) return false;
        return pinnedResolution.visibility === 'team'
          ? system.teamSynced === true
          : system.teamSynced !== true;
      };
      let systems = await listAllDesignSystems(designSystemListOptions);
      let summary = systems.find(
        (system) =>
          system.id === effectiveDesignSystemId
          && designSystemVisibleForRun(system),
      );
      if (summary?.source === 'user' && summary.teamSynced !== true) {
        await ensureUserDesignSystemWorkspaceProject(db, effectiveDesignSystemId);
        systems = await listAllDesignSystems(designSystemListOptions);
        summary = systems.find(
          (system) =>
            system.id === effectiveDesignSystemId
            && designSystemVisibleForRun(system),
        );
      }
      const editingOwnDraftDesignSystem =
        project?.metadata?.importedFrom === 'design-system'
        && project.designSystemId === effectiveDesignSystemId;
      designSystemTitle = summary?.title;
      if (summary && (isProjectUsableDesignSystem(summary) || editingOwnDraftDesignSystem)) {
        // A pulled Team mirror is a canonical, read-only package. Its
        // metadata may carry the author's local editing-project id, which is
        // neither authority to mutate a same-slug Personal backing project nor
        // a safe path to read an unrelated local project's DESIGN.md.
        const workspaceBody = summary.teamSynced === true
          ? null
          : await readDesignSystemWorkspaceTextFile(db, summary, 'DESIGN.md');
        const registryBody = await readAvailableDesignSystem(
          effectiveDesignSystemId,
          designSystemListOptions,
        );
        designSystemBody = (workspaceBody ?? registryBody) ?? undefined;
        // Single seam: env gate + built-in→user-installed fallback chain
        // live together inside `resolveDesignSystemAssets` so the whole
        // server-side asset-resolution path can be tested end-to-end
        // from real disk fixtures (see `tests/design-system-assets.test.ts`).
        const resourceBinding = projectDesignSystemBinding(summary);
        const scopedUserDesignSystemsRoot =
          usePinnedDesignSystemScope && pinnedResolution?.ok
            ? pinnedResolution.root
            : designSystemWorkspaceId && resourceBinding?.visibility === 'team'
              ? teamResourceWorkspaceRoot(USER_DESIGN_SYSTEMS_DIR, designSystemWorkspaceId)
              : USER_DESIGN_SYSTEMS_DIR;
        const assets = await resolveDesignSystemAssets(
          effectiveDesignSystemId,
          DESIGN_SYSTEMS_DIR,
          scopedUserDesignSystemsRoot,
        );
        const runtimePromptContext = await resolveDesignSystemRuntimePromptContext(
          effectiveDesignSystemId,
          DESIGN_SYSTEMS_DIR,
          scopedUserDesignSystemsRoot,
        );
        designSystemUsageMd = assets.usageMd;
        designSystemTokensCss = assets.tokensCss;
        // A package has exactly one component-selection authority. Legacy
        // packages keep the derived manifest / fixture prompt path. Once a
        // package declares the structured runtime, valid or not, that legacy
        // evidence must not compete with the intent resolver or mask a broken
        // runtime as a usable component map.
        if (runtimePromptContext.mode === 'legacy') {
          designSystemComponentsManifest = assets.componentsManifest;
          designSystemFixtureHtml = assets.fixtureHtml;
        } else if (runtimePromptContext.mode === 'structured') {
          designSystemIntentIndex = runtimePromptContext.intentIndex;
        } else {
          designSystemRuntimeIssue = runtimePromptContext.issue;
        }
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
            intentIndex: designSystemIntentIndex,
            runtimeIssue: designSystemRuntimeIssue,
            importMode: designSystemImportMode,
          });
        }
      }
    }

    const requestedCraft = resolveCraftRequirements({
      isWebCloneRun,
      metadataKind: metadata?.kind,
      skillModes,
      freeformDeckSignal,
      skillRequires: skillCraftRequires,
      designSystemApplies: designSystemCraftApplies,
      designSystemExemptions: designSystemCraftExemptions,
    });
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
          const { renderActiveStageBlocks } = await import('@open-design/contracts');
          const stageViews = [];
          for (const stage of stages) {
            const bodies = await loadAtomBodies(db, stage.atoms ?? []);
            stageViews.push({ stageId: stage.id, bodies });
          }
          // Issue #6238 — the builder inlines each atom body exactly
          // once across the pipeline; stages that re-declare an atom
          // get a one-line back-reference instead of the full body.
          const blocks = renderActiveStageBlocks(stageViews);
          if (blocks.length > 0) activeStageBlocks = blocks;
        }
      } catch (err) {
        console.warn(`[plugins] activeStageBlocks build failed: ${(err)?.message ?? err}`);
      }
    }

    // Hoisted verbatim out of the composeSystemPrompt() call so the exact same
    // object both composes the prompt and feeds section-level drift
    // attribution — a second, hand-maintained copy of these inputs would drift
    // from the real ones and mislabel the telemetry it exists to explain.
    const systemPromptInputs = {
      agentId,
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
      designSystemIntentIndex,
      designSystemRuntimeIssue,
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
      ...(pluginBlock ? { pluginBlock } : {}),
      ...(activeStageBlocks ? { activeStageBlocks } : {}),
      userInstructions,
      freeformDeckSignal,
      mediaHintSignal,
      platformHintSignal,
      // VALIDATION DEFAULT — feat/system-prompt integration branch only.
      // Slim is the default here so packaged beta builds exercise the
      // rewritten charter without env plumbing (the packaged sidecar env
      // allowlist does not forward OD_PROMPT_CORE); OD_PROMPT_CORE=classic
      // restores the classic stack. main keeps classic as the default —
      // do NOT carry this flip into a PR against main.
      promptCoreVariant: process.env.OD_PROMPT_CORE === 'classic' ? undefined : 'slim',
    };
    const prompt = composeSystemPrompt(systemPromptInputs);
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
      // Diagnostic only. The caller merges its own stable inputs
      // (runtimeToolPrompt, the client system prompt) in before hashing, so the
      // section map covers the whole fingerprint rather than just this half.
      stableSectionInputs: systemPromptInputs,
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
    const pendingNativeSessionContinue =
      run.nativeSessionContinuePending &&
      typeof run.nativeSessionContinuePending.sessionId === 'string'
        ? run.nativeSessionContinuePending
        : null;
    run.nativeSessionContinuePending = null;
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
      serviceTier,
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
    const finishRun = (status, code = null, signal = null) => {
      flushRunMessageEvents(run);
      return design.runs.finish(run, status, code, signal);
    };
    // Freeze the billing address once, before the first asynchronous setup
    // step. HTTP-created runs already carry the scope captured by the request
    // authorization transaction. Internal runs pin here. Retries reuse the
    // existing property and therefore never consult a later project rebind.
    let runScopeChanged = false;
    if (!Object.prototype.hasOwnProperty.call(run, 'workspaceScope')) {
      run.workspaceScope =
        typeof projectId === 'string' && projectId
          ? pinRunWorkspaceScopeForProject(db, projectId)
          : null;
      runScopeChanged = true;
    }
    if (!Object.prototype.hasOwnProperty.call(run, 'designSystemScope')) {
      const scopeProject =
        typeof projectId === 'string' && projectId
          ? getProject(db, projectId)
          : null;
      let scopePluginDesignSystemId = null;
      if (run?.appliedPluginSnapshotId) {
        try {
          scopePluginDesignSystemId = designSystemIdFromPluginSnapshot(
            getSnapshot(db, run.appliedPluginSnapshotId),
          );
        } catch {
          scopePluginDesignSystemId = null;
        }
      }
      const scopeSelection = scopeProject?.metadata?.intent === 'web-clone'
        ? { id: null }
        : resolveEffectiveDesignSystemSelection({
            requestDesignSystemId: designSystemId,
            pluginDesignSystemId: scopePluginDesignSystemId,
            projectDesignSystemId: scopeProject?.designSystemId,
            allowAppDefault: false,
          });
      run.designSystemScope =
        typeof projectId === 'string' && projectId
          ? pinRunDesignSystemScope({
              db,
              projectId,
              designSystemId: scopeSelection.id,
              workspaceScope: run.workspaceScope,
            })
          : null;
      runScopeChanged = true;
    }
    if (runScopeChanged) design.runs.persistState(run);
    // Stash the original user prompt + per-turn config so the
    // langfuse-bridge report path can include them without reaching back
    // into chatBody across the createChatRunService boundary. Each field
    // is optional and only set when the chat body actually carried it.
    const telemetryPrompt = telemetryPromptFromRunRequest(message, currentPrompt);
    if (
      !pendingNativeSessionContinue &&
      typeof telemetryPrompt === 'string'
    ) {
      run.userPrompt = telemetryPrompt;
    }
    if (typeof model === 'string' && model) run.model = model;
    if (typeof reasoning === 'string' && reasoning) run.reasoning = reasoning;
    if (typeof serviceTier === 'string' && serviceTier) run.serviceTier = serviceTier;
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
        BYOK_OPENCODE_PROVIDER_REQUIRED_MESSAGE,
      );
    }
    const requestedRuntimeModel = def.id === 'byok-opencode'
      ? byokOpenCodeProvider?.modelId ?? null
      : model;
    // Validate the checked-in runtime timeout hints immediately
    // after the runtime def is selected and before any side-effectful
    // setup (auto-memory extract, `.mcp.json` write/unlink,
    // composeSystemPrompt, prompt persistence). A bad def value would
    // otherwise abort the run only at watchdog-arm time, after that
    // setup has already mutated local state, leaving confusing partial
    // residue behind (issue #2467 review on PR #2579).
    //
    // Catch is intentionally narrowed to `RangeError`, the only kind
    // the runtime timeout validators are allowed to throw
    // for invalid checked-in values. Anything else (a regression that
    // makes the helper throw on a valid value, an unrelated bug
    // introduced while touching this path) should bubble up to the
    // outer chat-run starter — which surfaces it as
    // `AGENT_EXECUTION_FAILED` — rather than being misreported as
    // "the runtime def is bad" and burying the real failure.
    try {
      assertValidRuntimeDefInactivityTimeoutMs(def.inactivityTimeoutMs);
      assertValidRuntimeDefFirstOutputTimeoutMs(def.firstOutputTimeoutMs);
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
    const effectiveRunSkillId = resolveSkillId(
      typeof skillId === 'string' && skillId
        ? skillId
        : projectRecord?.skillId,
    );
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
    const toolWorkspaceId = typeof run.workspaceScope?.workspaceId === 'string'
      ? run.workspaceScope.workspaceId.trim()
      : '';
    const toolWorkspaceMemberId =
      typeof run.workspaceScope?.workspaceMemberId === 'string'
        ? run.workspaceScope.workspaceMemberId.trim()
        : '';
    const inactivityTimeoutMs = resolveChatRunInactivityTimeoutMs(def.inactivityTimeoutMs);
    const toolTokenTtlMs = resolveChatToolTokenTtlMs(inactivityTimeoutMs);
    const toolTokenGrant = cwd && typeof projectId === 'string' && projectId
      ? toolTokenRegistry.mint({
          runId,
          projectId,
          ...(toolWorkspaceId ? { workspaceId: toolWorkspaceId } : {}),
          ...(toolWorkspaceMemberId
            ? { workspaceMemberId: toolWorkspaceMemberId }
            : {}),
          ...(run.designSystemScope
            ? { designSystemScope: run.designSystemScope }
            : {}),
          allowedEndpoints: CHAT_TOOL_ENDPOINTS,
          allowedOperations: CHAT_TOOL_OPERATIONS,
          ttlMs: toolTokenTtlMs,
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

    // Intent signals gate stable-region prompt blocks, so every flip changes
    // stableInstructionFingerprint and re-sends the whole stable block on
    // resume. Two rules keep flips down to genuine activations only:
    //   1. Scan user-authored text only — for transcript-resending agents
    //      `message` embeds prior ASSISTANT turns, whose copy (an earlier
    //      discovery form's own options, delivery summaries) must never flip
    //      a signal the user did not express.
    //   2. Latch detections onto the conversation (monotonic ON), so a
    //      history trim on agent switch or a non-transcript client cannot
    //      flip a previously seen signal back OFF.
    // OD_INTENT_SIGNAL_MODE=legacy restores the pre-hotfix whole-text,
    // unlatched scan.
    const legacyIntentSignalScan = process.env.OD_INTENT_SIGNAL_MODE === 'legacy';
    const intentSignalTexts = legacyIntentSignalScan
      ? [message, currentPrompt]
      : [
          extractUserAuthoredSignalText(message),
          extractUserAuthoredSignalText(currentPrompt),
        ];
    const freshIntentSignals = {
      deck: detectDeckIntentSignal(...intentSignalTexts),
      media: detectMediaIntentSignal(...intentSignalTexts),
      platform: detectPlatformIntentSignal(...intentSignalTexts),
    };
    const intentSignals =
      !legacyIntentSignalScan && typeof run.conversationId === 'string' && run.conversationId
        ? latchConversationIntentSignals(db, run.conversationId, freshIntentSignals)
        : freshIntentSignals;

    const {
      prompt: daemonSystemPrompt,
      activeSkillDirs,
      critiqueShouldRun,
      designSystemSelection,
      promptTelemetryParts,
      stableSectionInputs,
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
        mediaExecution: run?.mediaExecution,
        byokMediaDefaults,
        // Plan §3.M2 / §3.V1 — forward the run's snapshot id so the
        // prompt composer can splice in `## Active stage` blocks.
        // Default ON; set OD_BUNDLED_ATOM_PROMPTS=0 to opt out.
        appliedPluginSnapshotId: run?.appliedPluginSnapshotId ?? null,
        // User-authored-only, conversation-latched detections (see the
        // intentSignals block above): a deck mention in the user's own words
        // anywhere in the conversation keeps the freeform maybe-deck
        // framework injected for the conversation's whole life.
        freeformDeckSignal: intentSignals.deck,
        mediaHintSignal: intentSignals.media,
        platformHintSignal: intentSignals.platform,
        workspaceScope: run.workspaceScope,
        designSystemScope: run.designSystemScope,
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
        const before = await snapshotProjectArtifactsAsync(cwd);
        // Async I/O lets cancellation/finalization interleave with the scan.
        // In that case onFinalize already recorded the fallback outcome, so
        // do not leave a stale baseline behind for a completed run.
        if (!run.artifactOutcome && !design.runs.isTerminal(run.status)) {
          runArtifactBaselines.remember(run.id, cwd, before);
        }
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
    const resolveRunArtifactOutcomeBeforeFinish = (afterSnapshot?: ReturnType<typeof snapshotProjectArtifacts>) => {
      if (!run?.id) return null;
      if (run.artifactOutcome) return run.artifactOutcome;

      const artifactBaseline = runArtifactBaselines.take(run.id);
      const fallbackOutcome = () => ({
        artifactCount: runArtifactCountForRun(run),
        designSystemCreated: runDesignSystemCreatedForRun(run),
        previewModuleCount: runPreviewModuleCountForRun(run),
      });
      let outcome;
      if (!artifactBaseline || artifactBaseline.contended) {
        outcome = fallbackOutcome();
      } else {
        try {
          const diff = diffRunArtifacts(
            artifactBaseline.before,
            afterSnapshot ?? snapshotProjectArtifacts(artifactBaseline.cwd),
          );
          outcome = {
            artifactCount: diff.touched,
            artifactsCreated: diff.created,
            artifactsModified: diff.modified,
            designSystemCreated: diff.designSystemCreated,
            previewModuleCount: diff.previewModuleCount,
            projectRoot: artifactBaseline.cwd,
            diff,
          };
          run.artifactPaths = diff.touchedPaths
            .map((filePath) => path.relative(artifactBaseline.cwd, filePath))
            .map((filePath) => filePath.replaceAll('\\', '/'))
            .filter((filePath) =>
              filePath.length > 0 &&
              filePath !== '..' &&
              !filePath.startsWith('../') &&
              !path.isAbsolute(filePath),
            );
        } catch {
          outcome = fallbackOutcome();
        }
      }
      run.artifactCount = outcome.artifactCount;
      run.artifactOutcome = outcome;
      return outcome;
    };
    const resolveRunArtifactOutcomeBeforeFinishAsync = async () => {
      if (!run?.id || run.artifactOutcome) return resolveRunArtifactOutcomeBeforeFinish();
      const artifactBaseline = runArtifactBaselines.peek(run.id);
      if (!artifactBaseline || artifactBaseline.contended) {
        return resolveRunArtifactOutcomeBeforeFinish();
      }
      // Keep the baseline registered until the async read completes. A direct
      // cancellation may finalize synchronously in the meantime; the resolver
      // below then observes run.artifactOutcome and discards this late result.
      const afterSnapshot = await snapshotProjectArtifactsAsync(artifactBaseline.cwd);
      return resolveRunArtifactOutcomeBeforeFinish(afterSnapshot);
    };
    const snapshotAiHtmlVersionsBeforeSuccess = async () => {
      const origin = artifactOriginForRun({
        runId: run.id,
        externalPluginAnalytics: run.externalPluginAnalytics,
      });
      if (origin) {
        // A successful Plugin run starts pessimistically. Only the exact
        // versions returned by the snapshot writer may promote it to matched.
        run.artifactOriginStatus = 'missing_version';
        run.artifactVersionId = undefined;
      }
      const outcome = await resolveRunArtifactOutcomeBeforeFinishAsync();
      if (!outcome?.diff || !outcome.projectRoot || !run.projectId) return;
      const promptInfo = latestRunPromptForHtmlVersionSnapshot();
      const result = await snapshotAiHtmlVersionsForRun({
        projectsRoot: PROJECTS_DIR,
        projectId: run.projectId,
        projectRoot: outcome.projectRoot,
        diff: outcome.diff,
        prompt: promptInfo.prompt,
        ...(promptInfo.promptSource ? { promptSource: promptInfo.promptSource } : {}),
        ...(origin ? { origin } : {}),
        metadata: projectRecord?.metadata,
      });
      if (origin) {
        const matching = result.snapshots.filter(({ version }) =>
          version.origin?.entrySurface === origin.entrySurface
          && version.origin.externalPluginId === origin.externalPluginId
          && version.origin.pluginWorkflowId === origin.pluginWorkflowId
          && version.origin.runId === origin.runId,
        );
        if (matching.length > 0) {
          run.artifactOriginStatus = 'matched';
          const configuredEntry =
            typeof projectRecord?.metadata?.entryFile === 'string'
              ? projectRecord.metadata.entryFile.replaceAll('\\', '/')
              : null;
          const selected =
            (configuredEntry
              ? matching.find(({ fileName }) => fileName === configuredEntry)
              : undefined)
            ?? (matching.length === 1 ? matching[0] : undefined);
          run.artifactVersionId = selected?.version.id;
        }
      }
    };
    // Chain onto the run service's terminal chokepoint so startup rejection,
    // direct cancellation, shutdown, and every explicit finish path all consume
    // their filesystem baseline before the terminal SSE frame is published.
    const previousOnFinalize = run.onFinalize;
    run.onFinalize = () => {
      try {
        previousOnFinalize?.();
      } finally {
        resolveRunArtifactOutcomeBeforeFinish();
      }
    };
    const extraAllowedDirs = resolveChatExtraAllowedDirs({
      agentId,
      skillsDir: SKILLS_DIR,
      designSystemsDir: DESIGN_SYSTEMS_DIR,
      linkedDirs,
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
      runtimeResumesSessionById(def) ||
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
    let appConfigForRun = null;
    try {
      const appConfig = await readAppConfig(RUNTIME_DATA_DIR);
      appConfigForRun = appConfig;
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
    const configuredModel =
      typeof appConfigForRun?.agentModels?.[def.id]?.model === 'string'
        ? appConfigForRun.agentModels[def.id].model
        : null;
    let safeModel = resolveModelForAgent(
      def,
      typeof requestedRuntimeModel === 'string'
        ? isKnownModel(def, requestedRuntimeModel, requestedLiveModelScope)
          ? requestedRuntimeModel
          : sanitizeCustomModel(requestedRuntimeModel)
        : configuredModel,
      process.env,
      requestedLiveModelScope,
    );
    const hasDefaultModelEnvOverride = Boolean(
      def.defaultModelEnvVar &&
      typeof process.env[def.defaultModelEnvVar] === 'string' &&
      process.env[def.defaultModelEnvVar]?.trim(),
    );
    const safeReasoning =
      typeof reasoning === 'string' &&
      isKnownReasoningEffort(def, safeModel, reasoning, requestedLiveModelScope)
        ? reasoning
        : null;
    safeModel = resolveModelForServiceTier(
      def,
      safeModel,
      typeof serviceTier === 'string' ? serviceTier : null,
      requestedLiveModelScope,
    );
    const safeServiceTier =
      typeof serviceTier === 'string' &&
      isKnownServiceTier(def, safeModel, serviceTier, requestedLiveModelScope)
        ? serviceTier
        : null;
    const agentOptions = {
      model: safeModel,
      reasoning: safeReasoning,
      serviceTier: safeServiceTier,
    };
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
    const resolvedAgentResumeCtx =
      agentSupportsSessionResume && run.conversationId
        ? resolveAgentResumeContext(db, {
            conversationId: run.conversationId,
            agentId: def.id,
            currentModel: safeModel ?? null,
            currentCwd: effectiveCwd,
            currentAssistantMessageId: run.assistantMessageId ?? null,
          })
        : { storedSessionId: null as string | null, resumeSessionId: null as string | null, newSessionId: undefined as string | undefined, isResuming: false, storedStablePromptHash: null as string | null, storedStableSections: null as StableSectionHashes | null, invalidationReason: null };
    // A same-run post-tool recovery resumes the exact session id captured from
    // the interrupted attempt. The ordinary cross-turn cursor guard cannot
    // admit it yet because the current assistant placeholder is still in
    // flight, so this daemon-only path supplies the already-validated handle
    // directly. Public chat requests cannot reach this branch.
    const forceInternalResume =
      pendingNativeSessionContinue != null &&
      runtimeResumesSessionById(def) &&
      pendingNativeSessionContinue.sessionId.length > 0;
    const agentResumeCtx = forceInternalResume
      ? {
          ...resolvedAgentResumeCtx,
          storedSessionId: pendingNativeSessionContinue.sessionId,
          resumeSessionId: pendingNativeSessionContinue.sessionId,
          isResuming: true,
          storedStablePromptHash:
            pendingNativeSessionContinue.stablePromptHash ?? null,
          storedStableSections:
            pendingNativeSessionContinue.stablePromptSections ?? null,
          invalidationReason: null,
        }
      : resolvedAgentResumeCtx;
    const publishNativeSessionRecoveryMetadata = () => {
      if (!run.nativeSessionRecovery) return;
      design.runs.emit(run, 'diagnostic', {
        type: 'native_session_recovery',
        nativeSessionRecovery: run.nativeSessionRecovery,
      });
    };
    run.nativeSessionRecovery = initialNativeSessionRecoveryMetadata({
      agent: def,
      supportsSessionResume: agentSupportsSessionResume,
      isResuming: agentResumeCtx.isResuming,
      resumeSessionId: agentResumeCtx.resumeSessionId,
      storedSessionId: agentResumeCtx.storedSessionId,
      invalidationReason: agentResumeCtx.invalidationReason,
    });
    publishNativeSessionRecoveryMetadata();
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
    // Per-section digests of the SAME inputs the fingerprint is built from, so a
    // drift event can name which one moved. `currentStableHash` above stays the
    // sole re-send decider — these only label a decision already made.
    const currentStableSections = computeStableSectionHashes({
      ...(stableSectionInputs ?? {}),
      runtimeToolPrompt,
      clientSystemPrompt: systemPrompt,
    });
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
      storedStableSections: agentResumeCtx.storedStableSections,
      currentStableSections,
    });
    const currentStableSectionsJson = serializeStableSections(currentStableSections);
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
    // The connected-external-MCP directive reflects live OAuth token state,
    // which flips mid-conversation as Bearers expire/refresh. Keeping it out of
    // the cached stable prefix (daemonSystemPrompt) and re-sending it here in
    // the per-turn slice keeps the upstream prompt-cache prefix byte-stable
    // across resumes (protecting the conversation-history cache) while still
    // giving the model the current MCP auth state on every turn.
    const mcpConnectedDirective = renderConnectedExternalMcpDirective(connectedExternalMcp);
    const clientInstructionParts = includeStableInstructions
      ? [researchCommandContract, runContextPrompt, mcpConnectedDirective, browserUsePromptGuard, titleGenerationPrompt, systemPrompt]
      : [researchCommandContract, runContextPrompt, mcpConnectedDirective, browserUsePromptGuard, titleGenerationPrompt];
    const clientInstructionPrompt = clientInstructionParts
      .map((part) => (typeof part === 'string' ? part.trim() : ''))
      .filter(Boolean)
      .join('\n\n---\n\n');
    const instructionPrompt = composeLiveInstructionPrompt({
      daemonSystemPrompt: includeStableInstructions ? daemonSystemPrompt : '',
      runtimeToolPrompt: includeStableInstructions ? runtimeToolPrompt : '',
      clientSystemPrompt: clientInstructionPrompt,
      finalPromptOverride: null,
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
    // Upper bound for the truncation-proof plain-stream stdout accumulator used
    // by the artifact finalizer (see the emit handler below). 8 MiB comfortably
    // covers realistic artifact-bearing runs while bounding per-run memory.
    const PLAIN_ARTIFACT_STDOUT_CAP = 8 * 1024 * 1024;
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
      // Keep enough of the plain-stream stdout on the run itself that the
      // finalizer's artifact extraction does not depend on the <artifact> tag
      // surviving the 2000-event run.events ring buffer. A long run that streams
      // a complete <artifact> early and then floods >2000 later stdout events
      // would evict the opening tag, making a scan of run.events miss it and
      // silently drop the delivered file (#5351 fixed the same truncation class
      // for the verdict consumers). We keep the HEAD (first CAP bytes, bounded)
      // and separately track the TOTAL byte count; the finalizer stitches the
      // head to the tail-biased run.events at their exact stream offset, so no
      // artifact is lost and none is double-counted regardless of where in the
      // stream it appears.
      if (event === 'stdout' && data && typeof data.chunk === 'string') {
        run.plainStdoutTotalBytes = (run.plainStdoutTotalBytes ?? 0) + data.chunk.length;
        if ((run.plainArtifactStdout?.length ?? 0) < PLAIN_ARTIFACT_STDOUT_CAP) {
          run.plainArtifactStdout =
            ((run.plainArtifactStdout ?? '') + data.chunk).slice(0, PLAIN_ARTIFACT_STDOUT_CAP);
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
        ...(failure?.terminal_trigger ? { terminal_trigger: failure.terminal_trigger } : {}),
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
      // Snapshot the failing attempt's child + process group BEFORE we detach
      // them, so the reap targets THIS attempt's group and never the next one.
      const priorChild = run.child;
      const priorProcessGroupId = run.processGroupId;
      // Release the previous child's stdio streams before letting the
      // reference drop — see destroyChildStdio for rationale.
      destroyChildStdio(priorChild);
      // Disband the WHOLE process group of the failed attempt, not just the
      // direct child. A same-run retry that only SIGTERMs run.child leaves the
      // CLI's spawned descendants (MCP servers, tool subprocesses) orphaned
      // (re-parented to PID 1), accumulating one leaked group per retry. Reap by
      // the CAPTURED pgid — the SIGKILL escalation is bound to it, so it can
      // never hit the next attempt's group (the cross-generation kill fixed in
      // #5202). On win32 / no pgid, fall back to signalling the direct child.
      const reaped = design.runs.reapProcessGroup(priorProcessGroupId);
      if (
        !reaped &&
        priorChild &&
        typeof priorChild.kill === 'function' &&
        priorChild.exitCode === null &&
        !priorChild.killed
      ) {
        try { priorChild.kill('SIGTERM'); } catch {}
      }
      run.status = 'queued';
      run.updatedAt = Date.now();
      run.child = null;
      run.processGroupId = null;
      run.acpSession = null;
      run.exitCode = null;
      run.signal = null;
      run.error = null;
      run.errorCode = null;
      run.stdinOpen = false;
      // Any run-scoped state that a single attempt writes and that later feeds
      // terminal classification must be cleared before the next attempt spawns,
      // or the prior attempt's verdict leaks forward. turnCompletedCleanly is
      // set by a clean `turn_end` (applyClaudeStreamJsonRunBookkeeping); without
      // this reset, a clean-but-empty attempt 1 would vouch for a crashed
      // attempt 2, classifying the run 'succeeded' off a stale flag.
      run.turnCompletedCleanly = false;
      run.terminalTrigger = null;
      lifecycle.resetForAttempt(run.retryAttemptCount ?? 0);
      run.analyticsTelemetry = {
        startRequestedAt: run.analyticsTelemetry?.startRequestedAt ?? run.createdAt,
      };
    };
    const spawnRetryAttempt = (retryChatBody = chatBody) => {
      void startChatRun(retryChatBody, run).catch((err) => {
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
    const scheduleRetryRestart = (delayMs, retryChatBody = chatBody) => {
      tearDownAttemptForRetry();
      const wait = Number.isFinite(delayMs) && delayMs > 0 ? delayMs : 0;
      if (wait <= 0) {
        spawnRetryAttempt(retryChatBody);
        return;
      }
      run.retryRestartTimer = setTimeout(() => {
        run.retryRestartTimer = null;
        if (run.cancelRequested || design.runs.isTerminal(run.status)) return;
        spawnRetryAttempt(retryChatBody);
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
          ? {
              ...decision,
              retryAttemptIndex: attemptCount,
              retryMaxAttempts:
                run.retryMaxAttempts ?? decision.retryMaxAttempts,
              retryStrategy: run.retryStrategy ?? decision.retryStrategy,
            }
          : decision;
      // A successful retry has no current failure classification or error code.
      // Fall back to the failure that caused attempt 0 to be retried so success
      // recovery can still be attributed by root cause. Failed/suppressed retry
      // events retain their existing current-attempt semantics.
      const eventFailure = retryResult === 'success'
        ? run.retryOriginFailure ?? failure
        : failure;
      const eventErrorCode = retryResult === 'success'
        ? run.retryOriginErrorCode ?? errorCode
        : errorCode;
      run.retryFinalResult = retryResult;
      run.retrySuppressedReason = retrySuppressedReason;
      design.runs.emit(run, 'run_retry_finished', {
        ...retryAnalyticsBase(eventDecision, eventFailure, eventErrorCode),
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
      flushRunMessageEvents(run);
      // Persist the transport-level close mechanism before classifying this
      // attempt. Runtime fatal/stream signals are only known in the close
      // handler, and the retry classifier reads this diagnostic to distinguish
      // them from a generic process exit. Clear the pending value immediately
      // so a scheduled retry cannot inherit the previous attempt's reason.
      const rpcCloseReason = deriveRpcCloseReason(status, code, signal);
      design.runs.emit(run, 'diagnostic', {
        type: 'runtime_close',
        rpc_close_reason: rpcCloseReason,
        status,
        ...(typeof code === 'number' ? { exit_code: code } : {}),
        ...(signal ? { signal } : {}),
      });
      pendingRpcCloseReason = null;
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
        cancelOrigin: run.cancelOrigin ?? null,
        terminalTrigger: run.terminalTrigger ?? null,
        events: run.events,
      });
      if (
        result === 'failed' &&
        failure?.failure_category === 'prompt_too_large' &&
        def.resumesSessionViaAcpLoad === true &&
        agentResumeCtx.isResuming &&
        agentResumeCtx.resumeSessionId &&
        run.conversationId
      ) {
        clearAgentSession(db, run.conversationId, def.id);
        design.runs.emit(run, 'diagnostic', {
          type: 'agent_session_cleared_after_prompt_too_large',
          agent_id: def.id,
          reason: 'prompt_too_large',
          previous_session_id: agentResumeCtx.resumeSessionId,
          stale_session_cleared: true,
        });
      }
      const sideEffects = {
        ...runSideEffectsForRun(run),
        cancelRequested: !!run.cancelRequested,
      };
      const liveSessionId = agentResumeCtx.isResuming
        ? agentResumeCtx.resumeSessionId
        : agentCapturesSessionId
          ? capturedSessionId
          : agentResumeCtx.newSessionId;
      const postToolResumeDecision = decidePostToolResumeRecovery({
        result,
        failure,
        continuationAttemptCount:
          run.nativeSessionContinueAttemptCount ?? 0,
        totalRetryAttemptCount: run.retryAttemptCount ?? 0,
        sideEffects,
        supportsNativeSessionContinue: runtimeResumesSessionById(def),
        hasNativeSession: !!run.conversationId && !!liveSessionId,
      });
      if (
        postToolResumeDecision?.shouldRetry &&
        !design.runs.isTerminal(run.status) &&
        run.conversationId &&
        liveSessionId
      ) {
        run.retryOriginalFailure ??= failure ?? undefined;
        run.retryOriginFailure = failure ? { ...failure } : null;
        run.retryOriginErrorCode = errorCode ?? null;
        run.retryAttemptCount = postToolResumeDecision.retryAttemptIndex;
        run.nativeSessionContinueAttemptCount =
          (run.nativeSessionContinueAttemptCount ?? 0) + 1;
        run.retryMaxAttempts = postToolResumeDecision.retryMaxAttempts;
        run.retryStrategy = postToolResumeDecision.retryStrategy;
        run.retryFinalResult = undefined;
        run.retrySuppressedReason = undefined;
        upsertAgentSession(db, {
          conversationId: run.conversationId,
          agentId: def.id,
          sessionId: liveSessionId,
          stablePromptHash: currentStableHash,
          stablePromptSections: currentStableSectionsJson,
          model: safeModel ?? null,
          cwd: effectiveCwd,
          lastMessageId: run.assistantMessageId ?? null,
        });
        run.nativeSessionRecovery = markNativeSessionCaptured({
          previous: run.nativeSessionRecovery,
          agentId: def.id,
          sessionId: liveSessionId,
          resumed: agentResumeCtx.isResuming,
        });
        publishNativeSessionRecoveryMetadata();
        design.runs.emit(run, 'run_retry_attempted', {
          ...retryAnalyticsBase(postToolResumeDecision, failure, errorCode),
          retry_reason: postToolResumeDecision.retryReason,
          retry_delay_ms: postToolResumeDecision.retryDelayMs,
        });
        run.nativeSessionContinuePending = {
          sessionId: liveSessionId,
          stablePromptHash: currentStableHash,
          stablePromptSections: currentStableSections,
        };
        scheduleRetryRestart(postToolResumeDecision.retryDelayMs, {
          ...chatBody,
          message: POST_TOOL_RESUME_CONTINUATION_PROMPT,
          currentPrompt: POST_TOOL_RESUME_CONTINUATION_PROMPT,
          titleGeneration: undefined,
        });
        return true;
      }
      const decision = decideSafeRunRetry({
        result,
        failure,
        attemptCount: run.retryAttemptCount ?? 0,
        sideEffects,
      });
      if (decision.shouldRetry && !design.runs.isTerminal(run.status)) {
        run.retryOriginalFailure ??= failure ?? undefined;
        if ((run.retryAttemptCount ?? 0) === 0) {
          run.retryOriginFailure = failure ? { ...failure } : null;
          run.retryOriginErrorCode = errorCode ?? null;
        }
        run.retryAttemptCount = decision.retryAttemptIndex;
        run.retryMaxAttempts = decision.retryMaxAttempts;
        run.retryStrategy = decision.retryStrategy;
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
      const resumableFailure =
        result === 'failed' &&
        runtimeResumesSessionById(def) &&
        !!run.conversationId &&
        !!liveSessionId &&
        committedWorkSeen &&
        isResumableFailure(failure);
      run.resumable = resumableFailure;
      // Surface the daemon's failure classification (already computed for
      // retry-policy + telemetry) on the run so statusBody / the SSE `end` frame
      // carry it to the chat, which maps failureDetail -> a specific named
      // failure type + fix. Only meaningful on a failed result.
      run.failureCategory = result === 'failed' ? failure?.failure_category ?? null : null;
      run.failureDetail = result === 'failed' ? failure?.failure_detail ?? null : null;
      run.failureAction = result === 'failed' ? failure?.user_action ?? null : null;
      // Stamp the classification onto the persisted assistant message too, so a
      // reload (or any daemon-side persistence without the live web error
      // handler) keeps the specific failure guidance instead of the coarse
      // errorCode UI. Mirrors what statusBody / the SSE `end` frame carry live.
      if (result === 'failed') persistRunFailureClassification(db, run);
      if (resumableFailure) {
        upsertAgentSession(db, {
          conversationId: run.conversationId,
          agentId: def.id,
          sessionId: liveSessionId,
          stablePromptHash: currentStableHash,
          stablePromptSections: currentStableSectionsJson,
          model: safeModel ?? null,
          cwd: effectiveCwd,
          lastMessageId: run.assistantMessageId ?? null,
        });
        run.nativeSessionRecovery = markNativeSessionCaptured({
          previous: run.nativeSessionRecovery,
          agentId: def.id,
          sessionId: liveSessionId,
          resumed: agentResumeCtx.isResuming,
        });
        publishNativeSessionRecoveryMetadata();
      }
      finalizeRetryTelemetry(status, decision, failure, errorCode);
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
      finishRun(status, code, signal);
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
      return finishRun('failed', 1, null);
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
            return finishRun('failed', 1, null);
          }
        }
        // Logged in but no catalog at all AND no resolvable model: only now is
        // there nothing safe to forward, so surface the model error.
        if (!safeModel) {
          send('error', createAmrModelUnavailablePayload(safeModel, {
            reason: 'model_catalog_unavailable',
          }));
          return finishRun('failed', 1, null);
        }
        // Otherwise fall through with the user's selected model and let vela's
        // `session/set_model` be the authoritative gate.
      } else if (!safeModel) {
        // Catalog known but we could not resolve any model id to forward.
        send('error', createAmrModelUnavailablePayload(
          typeof model === 'string' && model.trim() ? model : safeModel,
          { availableModels: [...liveModelIds] },
        ));
        return finishRun('failed', 1, null);
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
      const codexConfigEnv = spawnEnvForAgent(
        'codex',
        process.env,
        configuredAgentEnv,
        undefined,
        { resolvedBin: agentLaunch.selectedPath },
      );
      await normalizeCodexConfigFile(codexConfigEnv);

      // When Open Design leaves model selection at `default`, Codex resolves
      // the concrete model from config.toml. A known-old CLI can accept the
      // config, start `exec`, and only then reject a newer configured model.
      // Gate only evidence-backed stable-version/model combinations before
      // buildArgs/spawn. Every uncertain boundary (custom provider, API-key
      // auth, config overlays, project config, unknown/prerelease version)
      // fails open so Codex keeps its existing forward compatibility.
      if (agentLaunch.launchPath) {
        if (run.cancelRequested || design.runs.isTerminal(run.status)) {
          lifecycle.mark('launch_preflight_end');
          cleanupPromptFile();
          return;
        }
        const preflight = await preflightCodexDefaultModel({
          launchPath: agentLaunch.launchPath,
          env: applyAgentLaunchEnv(codexConfigEnv, agentLaunch),
          requestedModel: safeModel,
          projectRoot: effectiveCwd,
        });
        if (run.cancelRequested || design.runs.isTerminal(run.status)) {
          lifecycle.mark('launch_preflight_end');
          cleanupPromptFile();
          return;
        }
        if (preflight.status === 'compatible' || preflight.status === 'incompatible') {
          run.resolvedModelId = preflight.model;
          run.preflightAgentCliVersion = preflight.cliVersion;
        }
        if (preflight.status === 'incompatible') {
          lifecycle.mark('launch_preflight_end');
          const message =
            `The '${preflight.model}' model requires a newer version of Codex. ` +
            `The installed Codex CLI (${preflight.cliVersion}) is older than the known-compatible ` +
            `minimum (${preflight.requiredCliVersion}). ` +
            'Upgrade the Codex CLI or choose a model supported by this installation, then retry.';
          design.runs.emit(run, 'diagnostic', {
            type: 'model_capability_preflight',
            status: 'incompatible',
            model: preflight.model,
            cli_version: preflight.cliVersion,
            required_cli_version: preflight.requiredCliVersion,
          });
          send('error', createSseErrorPayload(
            'AGENT_EXECUTION_FAILED',
            message,
            {
              retryable: false,
              details: {
                failureCategory: 'model_unavailable',
                failureDetail: 'cli_version_incompatible',
                model: preflight.model,
                requiredCliVersion: preflight.requiredCliVersion,
              },
            },
          ));
          cleanupPromptFile();
          // No child was spawned, so there is no process exit code to report.
          // Passing null preserves the preflight attribution instead of
          // polluting exit_nonzero transport metrics with a synthetic exit 1.
          finishWithRetryDecision('failed', null, null);
          return;
        }
      }
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
          disablePlugins:
            def.id === 'codex'
            && run.externalPluginAnalytics?.externalPluginId
              === OPEN_DESIGN_PLUGIN_ID,
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
      return finishRun('failed', 1, null);
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
      return finishRun('failed', 1, null);
    }

    let persistDeliveredAgentSessionState = () => {};
    if (runtimeResumesSessionById(def) && run.conversationId) {
      let persisted = false;
      persistDeliveredAgentSessionState = () => {
        if (persisted) return;
        persisted = true;
        if (!getConversation(db, run.conversationId)) {
          console.warn(
            '[sessions] skipped delivered session persistence because the conversation is not persisted',
          );
          return;
        }
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
            stablePromptSections: currentStableSectionsJson,
            model: safeModel ?? null,
            cwd: effectiveCwd,
            lastMessageId: run.assistantMessageId ?? null,
          });
          if (!agentCapturesSessionId) {
            run.nativeSessionRecovery = markNativeSessionCaptured({
              previous: run.nativeSessionRecovery,
              agentId: def.id,
              sessionId: createTurnSessionId,
              resumed: false,
            });
            publishNativeSessionRecoveryMetadata();
          }
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
            stablePromptSections: currentStableSectionsJson,
            model: safeModel ?? null,
            cwd: effectiveCwd,
            lastMessageId: run.assistantMessageId ?? null,
          });
          if (!agentCapturesSessionId) {
            run.nativeSessionRecovery = markNativeSessionCaptured({
              previous: run.nativeSessionRecovery,
              agentId: def.id,
              sessionId: agentResumeCtx.resumeSessionId,
              resumed: true,
            });
            publishNativeSessionRecoveryMetadata();
          }
        }
      };
    }

    // `runStartTimeMs` is consumed by the run-end artifact-manifest
    // reconciler (#2893 / #3110) to skip artifacts whose mtime predates
    // this run. The original main-side hunk also re-declared `const send`
    // here; on this branch `send` was hoisted into the AMR preflight
    // earlier, so we keep only the new `runStartTimeMs` declaration.
    const runStartTimeMs = Date.now();
    const firstOutputTimeoutMs =
      resolveChatRunFirstOutputTimeoutMs(def.firstOutputTimeoutMs);
    const artifactQuietPeriodMs = resolveChatRunArtifactQuietPeriodMs();
    // Grace before the inactivity watchdog escalates a stalled child from
    // SIGTERM to SIGKILL. Env-tunable like its OD_CHAT_RUN_* cancel-grace
    // siblings so the escalation path can be exercised deterministically.
    const inactivityKillGraceMs = (() => {
      const raw = Number(process.env.OD_CHAT_RUN_INACTIVITY_KILL_GRACE_MS);
      return Number.isFinite(raw) && raw > 0 ? raw : 3_000;
    })();
    let inactivityTimer = null;
    let firstOutputTimer = null;
    let firstOutputSeen = false;
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
    const clearFirstOutputWatchdog = () => {
      if (firstOutputTimer) {
        clearTimeout(firstOutputTimer);
        firstOutputTimer = null;
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
    const failForInactivity = (reason: 'inactivity' | 'first_output' = 'inactivity') => {
      if (run.cancelRequested || design.runs.isTerminal(run.status)) return;
      clearInactivityWatchdog();
      clearFirstOutputWatchdog();
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
        const timeoutMs =
          reason === 'first_output' ? firstOutputTimeoutMs : inactivityTimeoutMs;
        const timeoutDescription =
          reason === 'first_output'
            ? 'without emitting a first output'
            : 'without emitting any new output';
        const message =
          `Agent stalled ${timeoutDescription} for ${Math.round(timeoutMs / 1000)}s. ` +
          'The model or CLI likely hung while generating. ' +
          `Phase details: spawned agent ${userFacingAgentLabel(agentId, resolvedBin)}; stdout arrived: ${childStdoutSeen ? 'yes' : 'no'}; ` +
          `last agent event: ${lastAgentEventPhase}; largest tool result observed: ${lastToolResultChars} chars. ` +
          'Retry the turn, pick a different model, or start a new conversation if the prior context is very large.';
        stallPayload = createSseErrorPayload('AGENT_EXECUTION_FAILED', message, { retryable: true });
      }
      run.terminalTrigger = reason === 'first_output'
        ? 'first_output_deadline'
        : 'inactivity_watchdog';
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
    const armFirstOutputWatchdog = () => {
      if (firstOutputSeen || firstOutputTimer || firstOutputTimeoutMs <= 0) return;
      firstOutputTimer = setTimeout(
        () => failForInactivity('first_output'),
        firstOutputTimeoutMs,
      );
      firstOutputTimer.unref?.();
    };
    const noteFirstOutputEvent = (payload) => {
      const type = payload?.type ? String(payload.type) : '';
      const statusLabel =
        type === 'status' && payload?.label ? String(payload.label) : '';
      const isAcpToolActivity =
        statusLabel === 'tool_call' || statusLabel === 'tool_call_update';
      if (
        type !== 'text_delta' &&
        type !== 'thinking_delta' &&
        type !== 'tool_use' &&
        type !== 'tool_result' &&
        type !== 'artifact' &&
        !isAcpToolActivity
      ) {
        return;
      }
      firstOutputSeen = true;
      clearFirstOutputWatchdog();
    };
    const activeInactivityTimeoutMs = () =>
      resolveActiveInactivityTimeoutMs({
        inactivityTimeoutMs,
        artifactQuietPeriodMs,
        artifactRegistered,
      });
    const noteAgentActivity = () => {
      // E-lite: stamp the last-activity clock BEFORE the disabled-watchdog bail
      // so `last_progress_age_ms` is recorded even when the watchdog is off.
      run.lastAgentActivityAt = Date.now();
      if (toolTokenGrant) {
        toolTokenRegistry.refreshToken(toolTokenGrant.token, { ttlMs: toolTokenTtlMs });
      }
      const delay = activeInactivityTimeoutMs();
      if (delay <= 0) return;
      clearInactivityWatchdog();
      inactivityTimer = setTimeout(failForInactivity, delay);
      inactivityTimer.unref?.();
    };
    const noteArtifactRegistered = () => {
      if (artifactRegistered) return;
      artifactRegistered = true;
      firstOutputSeen = true;
      clearFirstOutputWatchdog();
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
        noteFirstOutputEvent(payload);
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
      return finishRun('failed', 1, null);
    }
    const browserUseRuntimeEnv = run.browserUse
      ? {
          OD_BROWSER_USE_REQUESTED: run.browserUse.requested ? '1' : '0',
          OD_BROWSER_USE_AVAILABLE: run.browserUse.available ? '1' : '0',
          ...(run.browserUse.reason ? { OD_BROWSER_USE_UNAVAILABLE_REASON: run.browserUse.reason } : {}),
          OD_BROWSER_USE_REGISTRY_PATH: run.browserUse.diagnostics?.registryPath ?? '',
        }
      : {};
    const configuredAgentSpawnEnv = createDaemonDataDirConfiguredAgentEnv(configuredAgentEnv);
    const agentSpawnEnv = spawnEnvForAgent(
      def.id,
      {
        ...createAgentRuntimeEnv(process.env, daemonUrl, toolTokenGrant),
        ...(def.env || {}),
        ...browserUseRuntimeEnv,
      },
      configuredAgentSpawnEnv,
      undefined,
      { resolvedBin: agentLaunch.selectedPath },
    );
    if (def.id === 'amr') {
      const loginStatus = readVelaLoginStatus(agentSpawnEnv, configuredAgentSpawnEnv);
      if (!loginStatus.loggedIn) {
        cleanupPromptFile();
        revokeToolToken('child_exit');
        unregisterChatAgentEventSink();
        sendAmrAccountFailure({
          code: 'AMR_AUTH_REQUIRED',
          message: 'AMR sign-in is required. Sign in to AMR Cloud again, then retry this run.',
          action: 'relogin',
        });
        return finishRun('failed', 1, null);
      }
    }
    const odMediaEnv = createOpenDesignToolEnv({
      daemonUrl,
      projectDir: cwd,
      projectId: typeof projectId === 'string' ? projectId : null,
    });
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
      serviceTier: safeServiceTier,
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
        def.promptViaStdin ||
        def.streamFormat === 'acp-json-rpc' ||
        def.streamFormat === 'dsh-profile-jsonl'
          ? 'pipe'
          : 'ignore';
      const env = applyAgentLaunchEnv({
        ...agentSpawnEnv,
        ...(mmdRouteLaunchEnv || {}),
        ...odMediaEnv,
        ...(byokOpenCodeProvider ? byokOpenCodeProvider.env : {}),
        ...await openDesignAmrTraceEnvForRun({
          agentId: def.id,
          runId: run.id,
          conversationId: run.conversationId,
          runAttempt: openDesignAmrRunAttempt({
            retryAttemptCount: run.retryAttemptCount,
            manualResumeAttemptCount: run.manualResumeAttemptCount,
          }),
          // Vela's workspace-credit isolation reads this env together with the
          // signed-in account identity. The run pins the project's exact
          // Workspace before its first asynchronous setup step; Vela/AMR
          // remains the authority for membership, balance, and billing
          // eligibility. Team and Personal bindings are both sent explicitly.
          // An unbound project is refused before process spawn. Later project
          // rebinds and ambient/current selection never participate.
          projectId,
          workspaceScope: run.workspaceScope,
          externalPluginAnalytics: run.externalPluginAnalytics ?? null,
        }, {
          // Report persisted-binding vs truly-unbound selection to the daemon
          // log and telemetry. Ids and the branch name only —
          // never member rows or credentials.
          onWorkspaceScopeOutcome: (outcome) => {
            console.log(
              `[od] amr workspace scope ${outcome.kind}`
                + ` project=${outcome.projectId}`
                + ` workspace=${outcome.workspaceId ?? 'none'}`
                + ` run=${run.id}`,
            );
            const context = run.analyticsContext ?? null;
            if (!context || !design?.analytics?.capture) return;
            design.analytics.capture({
              eventName: 'amr_workspace_scope_resolved',
              context,
              // `design.getAppVersion` is the only app-version accessor this
              // scope can see; the identically-named helper inside
              // `createFinalizedMessageTelemetryReporter` is a different
              // function's local and resolving it here threw a ReferenceError
              // out of the spawn path, failing 100% of AMR runs. That helper's
              // own last resort is this same accessor, so the value is
              // unchanged.
              appVersion: design.getAppVersion?.() ?? 'unknown',
              properties: {
                page_name: 'chat_panel',
                area: 'chat_panel',
                project_id: outcome.projectId,
                conversation_id: run.conversationId ?? null,
                run_id: run.id,
                workspace_scope_outcome: outcome.kind,
                workspace_id: outcome.workspaceId,
              },
            });
          },
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
      if (
        def.promptViaStdin &&
        child.stdin &&
        def.streamFormat !== 'pi-rpc' &&
        def.streamFormat !== 'dsh-profile-jsonl'
      ) {
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
      send('error', createSseErrorPayload(
        err instanceof AmrWorkspaceScopeRequiredError
          ? err.code
          : 'AGENT_EXECUTION_FAILED',
        err instanceof AmrWorkspaceScopeRequiredError
          ? err.message
          : `spawn failed: ${err.message}`,
      ));
      finishRun('failed', 1, null);
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
      //
      // Normalize the run-scoped BYOK provider shape for the memory extractor.
      // The raw secret never enters the persisted run body; it is held only by
      // this run closure while the child is alive.
      const memoryChatProvider: {
        provider?: string;
        apiKey?: string;
        baseUrl?: string;
        apiVersion?: string;
        model?: string;
        requiresApiKey?: boolean;
      } | null = byokProvider
        ? {
            provider: (byokProvider as { protocol?: string }).protocol ?? undefined,
            apiKey: (byokProvider as { apiKey?: string }).apiKey,
            baseUrl: (byokProvider as { baseUrl?: string }).baseUrl,
            apiVersion: (byokProvider as { apiVersion?: string }).apiVersion,
            model: typeof safeModel === 'string' ? safeModel : undefined,
            requiresApiKey: (byokProvider as { requiresApiKey?: boolean }).requiresApiKey,
          }
        : null;
      const memoryOptions = {
        projectRoot: PROJECT_ROOT,
        chatAgentId: typeof agentId === 'string' ? agentId : null,
        chatModel: typeof safeModel === 'string' ? safeModel : null,
        // Forward the per-call BYOK provider snapshot so pickProvider()
        // can run "Same as chat" extraction against the user's actual
        // provider/endpoint/model instead of falling back to defaults.
        chatProvider: memoryChatProvider,
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
            // startChatRun resolves this once after loading the project:
            // request-level skill first, persisted project skill second.
            skill: typeof effectiveRunSkillId === 'string' && effectiveRunSkillId
              ? effectiveRunSkillId
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
            finishRun('canceled', 1, null);
          } else if (succeeded) {
            finishRun('succeeded', 0, null);
          } else {
            finishRun('failed', 1, null);
          }
        } catch (err) {
          flushVisibleAgentStderr();
          send('error', createSseErrorPayload('AGENT_EXECUTION_FAILED', err instanceof Error ? err.message : String(err)));
          finishRun('failed', 1, null);
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
    // Preserve whether a latched error predates a later cancel request. The
    // close handler runs after cancel() has already flipped cancelRequested,
    // so consulting only the current flag loses the ordering of those events.
    let agentStreamErrorObservedBeforeCancellation = false;
    let acpFatalErrorObservedBeforeCancellation = false;
    run.runtimeFailureObservedBeforeCancellation = false;
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
        noteFirstOutputEvent({ type: 'text_delta' });
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
      // Fold work-completeness signals (TodoWrite snapshot / truncation) off the
      // stream BEFORE the send, so run.lastTodoSnapshot / run.truncatedMidTurn are
      // set by the time finish() derives run.endedWithUnfinishedWork (#1247/#1060).
      captureRunWorkCompletenessSignals(run, ev);
      noteFirstOutputEvent(ev);
      send('agent', ev);
      observeToolEventForLoop(ev);
    }

    const sendAgentEvent = (ev) => {
      if (ev?.type === 'error') {
        // Cancellation is the terminal user intent. Some CLIs flush a final
        // error record while reacting to SIGTERM; treating that late frame as
        // a run failure races the cancel route and can make it return failed.
        if (run.cancelRequested) return;
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
        agentStreamErrorObservedBeforeCancellation = true;
        run.runtimeFailureObservedBeforeCancellation = true;
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
        run.nativeSessionRecovery = markNativeSessionCaptured({
          previous: run.nativeSessionRecovery,
          agentId: def.id,
          sessionId: capturedSessionId,
          resumed: agentResumeCtx.isResuming,
        });
        publishNativeSessionRecoveryMetadata();
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
          // Claude commonly reports its SIGTERM shutdown as an assistant or
          // result error frame. Once cancellation has been requested, that
          // frame is shutdown noise rather than a new user-visible failure.
          if (run.cancelRequested) return;
          if (agentStreamError) return;
          // Hold back a resume-failure error so the close handler's transparent
          // reseed stays invisible. An is_error result frame on a dead --resume
          // now surfaces here as a stream error; the resume-target-missing
          // block in the close handler clears the stale handle and re-runs the
          // turn fresh, so forwarding this error would flash an execution
          // failure a beat before the invisible recovery. Mirrors the ACP
          // resume_failed suppression below; the close handler stays the sole
          // authority on how a resume failure ends.
          if (
            (runtimeResumesSessionById(def) || def.resumesSessionViaAcpLoad === true) &&
            agentResumeCtx.isResuming &&
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
          agentStreamErrorObservedBeforeCancellation = true;
          run.runtimeFailureObservedBeforeCancellation = true;
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
            if (run.cancelRequested) return;
            if (agentStreamError) return;
            flushVisibleAgentStderr();
            agentStreamError = String(payload?.message || 'Pi session error');
            agentStreamErrorObservedBeforeCancellation = true;
            acpFatalErrorObservedBeforeCancellation = true;
            run.runtimeFailureObservedBeforeCancellation = true;
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
        completePromptOnTurnEnd: def.acpTurnEndCompletesPrompt === true,
        ...(def.id === 'amr' ? { modelUnavailableErrorCode: 'AMR_MODEL_UNAVAILABLE' } : {}),
        // Resume the prior upstream session (drives `session/load`) when the
        // resume-identity guard says it is safe; otherwise a fresh session/new.
        ...(def.resumesSessionViaAcpLoad === true && agentResumeCtx.isResuming && agentResumeCtx.resumeSessionId
          ? { resumeSessionId: agentResumeCtx.resumeSessionId }
          : {}),
        onCliReady: () => noteCliReadyAt(),
        onSessionInit: () => noteSessionInitDoneAt(),
        onPromptComplete: () => clearFirstOutputWatchdog(),
        send: (event, data) => {
          if (event === 'error') {
            clearFirstOutputWatchdog();
            if (run.cancelRequested) return;
            acpFatalErrorObservedBeforeCancellation = true;
            run.runtimeFailureObservedBeforeCancellation = true;
          }
          if (event === 'agent') {
            lastAgentEventPhase = summarizeAgentEventForInactivity(data);
            if (
              data?.type === 'status' &&
              data.label === 'waiting_for_first_output'
            ) {
              armFirstOutputWatchdog();
            } else if (data?.type !== 'text_delta') {
              // Raw ACP text may be entirely consumed by title-marker or role
              // filtering. Only the guarded non-empty emission below counts
              // as substantive first output.
              noteFirstOutputEvent(data);
            }
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
    } else if (def.streamFormat === 'dsh-profile-jsonl') {
      trackingSubstantiveOutput = true;
      acpSession = attachDshProfileSession({
        child,
        requestId: run.id,
        prompt: composed,
        cwd: effectiveCwd,
        model: safeModel,
        reasoningEffort: safeReasoning,
        ...(agentResumeCtx.isResuming && agentResumeCtx.resumeSessionId
          ? { resumeSessionId: agentResumeCtx.resumeSessionId }
          : {}),
        onReady: () => noteCliReadyAt(),
        onSession: () => noteSessionInitDoneAt(),
        onComplete: () => clearFirstOutputWatchdog(),
        send: (event, data) => {
          noteAgentActivity();
          if (event === 'agent') {
            sendAgentEvent(data);
            return;
          }
          if (event === 'error') {
            const failure = normalizeDeepSeekHarnessFailure(data);
            const { code, message } = failure;
            agentStreamError = message;
            agentStreamErrorObservedBeforeCancellation = !run.cancelRequested;
            acpFatalErrorObservedBeforeCancellation = !run.cancelRequested;
            run.runtimeFailureObservedBeforeCancellation = !run.cancelRequested;
            agentStdoutTail = `${agentStdoutTail}\n${code}`.slice(-2000);
            if (
              agentResumeCtx.isResuming &&
              !run.resumeAutoReseeded &&
              /^DSH_PROFILE_RESUME_(?:REJECTED|MISMATCH)$/.test(code)
            ) {
              design.runs.emit(run, 'diagnostic', {
                type: 'agent_resume_failed_suppressed',
                agent_id: def.id,
                reason: 'resume_failed',
                previous_session_id: agentResumeCtx.resumeSessionId ?? null,
              });
              return;
            }
            if (!run.cancelRequested) {
              send('error', createSseErrorPayload(code, message, {
                retryable:
                  failure.authRequired || code === 'DSH_PROFILE_RESUME_REJECTED',
              }));
            }
            return;
          }
          send(event, data);
        },
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

    // A retry reuses the same run object but replaces run.child. Treat that
    // exact child identity as the attempt generation token: once ownership has
    // moved, this attempt may still receive a late error/close event, but it
    // must not emit errors, unregister the new sink, or make a terminal retry
    // decision for the new attempt.
    const attemptStillOwnsRun = () => run.child === child;
    const finishCanceledIfRequested = (
      code: number | null,
      signal: NodeJS.Signals | null,
    ): boolean => {
      if (!run.cancelRequested) return false;
      if (!design.runs.isTerminal(run.status)) {
        // Harness has already durably established the session by the time its
        // validated `session` frame reaches `capturedSessionId`. Preserve that
        // handle when the user cancels the current process so a later OD run
        // can cold-resume the same conversation. Keep this scoped to the
        // profile-stdio contract: other capture-style CLIs do not promise that
        // a session interrupted mid-turn is safe to continue.
        if (def.resumesSessionViaProfileStdio === true && capturedSessionId) {
          try {
            persistDeliveredAgentSessionState();
          } catch (err) {
            console.warn('[sessions] canceled profile session persistence failed', err);
          }
        }
        markRpcCloseReason('cancel_requested');
        finishWithRetryDecision('canceled', code, signal);
      }
      return true;
    };

    child.on('error', (err) => {
      clearInactivityWatchdog();
      clearFirstOutputWatchdog();
      cleanupPromptFile();
      flushVisibleAgentStderr();
      revokeToolToken('child_exit');
      if (!attemptStillOwnsRun()) return;
      unregisterChatAgentEventSink();
      if (finishCanceledIfRequested(1, null)) return;
      send('error', createSseErrorPayload('AGENT_EXECUTION_FAILED', err.message));
      finishWithRetryDecision('failed', 1, null);
    });
    child.on('close', async (code, signal) => {
      try {
      clearInactivityWatchdog();
      clearFirstOutputWatchdog();
      clearForcedChildShutdown();
      flushVisibleAgentStderr();
      if (!attemptStillOwnsRun() || watchdogRetryRestarted) {
        // Finalization and event-sink / run-handle ownership (keyed by the
        // shared runId) now belong to another retry generation, so this
        // child's late close must not re-run them.
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
        (runtimeResumesSessionById(def) || def.resumesSessionViaAcpLoad === true) &&
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
          run.nativeSessionRecovery = markNativeSessionAutoReseeded({
            previous: run.nativeSessionRecovery,
            agentId: def.id,
            previousSessionId: agentResumeCtx.resumeSessionId,
          });
          publishNativeSessionRecoveryMetadata();
          // Persisted to the per-run events.jsonl that the help → diagnostics
          // export bundles, so the whole resume → fail → auto-reseed chain is
          // visible in a support bundle without any user-facing signal.
          design.runs.emit(run, 'diagnostic', {
            type: 'agent_resume_auto_reseed',
            agent_id: def.id,
            reason: 'resume_failed',
            previous_session_id: agentResumeCtx.resumeSessionId ?? null,
            stale_session_cleared: true,
            nativeSessionRecovery: run.nativeSessionRecovery,
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
        return finishRun('failed', code ?? 1, signal ?? null);
      }
      if (acpFatalErrorObservedBeforeCancellation && acpSession?.hasFatalError()) {
        markRpcCloseReason('fatal_rpc_error');
        return finishWithRetryDecision('failed', code ?? 1, signal ?? null);
      }
      parseBufferedAntigravityGeminiJsonEventStream();
      flushAgentTitleMarkerBuffer();
      if (agentStreamErrorObservedBeforeCancellation && agentStreamError) {
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
          'Agent completed without producing any output. The model or provider may have returned an empty response. Check the agent logs for upstream errors, then try re-authenticating the agent, checking quota, or switching models.',
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
      const runArtifactSideEffects = runSideEffectsForRun(run);
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
      // Codex reports shell failures as ordinary command_execution items and
      // can still close the overall turn with code 0. For a structured DS run,
      // a failed read/resolve/validate wrapper followed by zero artifacts is a
      // failed delivery, not a successful text-only turn. Resolve the
      // filesystem diff before finalizing so the run cannot surface as green
      // merely because the agent explained why it stopped. A later successful
      // retry that produced an artifact remains a normal success.
      if (
        status === 'succeeded'
        && runHadFailedDesignSystemWrapper(run.events)
        && !emittedRenderableQuestionForm(clarifyingQuestionText)
      ) {
        const artifactOutcome = await resolveRunArtifactOutcomeBeforeFinishAsync();
        if (!artifactOutcome || artifactOutcome.artifactCount <= 0) {
          markRpcCloseReason('design_system_wrapper_failed');
          send('error', createSseErrorPayload(
            'AGENT_EXECUTION_FAILED',
            'The agent could not access the active design-system runtime and produced no deliverable. Retry after checking the local agent tool environment.',
            { retryable: true },
          ));
          return finishWithRetryDecision('failed', code, signal);
        }
      }
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
        // Reconstruct the agent's stdout for artifact extraction from two
        // truncation-complementary windows over the SAME underlying stream:
        //   - head: `run.plainArtifactStdout`, the FIRST CAP bytes (bounded), and
        //   - tail: run.events, the LAST 2000 events.
        // Using stream offsets (total byte count) we stitch them into a single
        // continuous string at their exact seam, then extract ONCE. This is
        // correct by construction:
        //   - not truncated  -> head == whole stream (or tail == whole stream);
        //   - overlapping    -> seam removes the double-covered span, so the
        //                        same artifact is never counted twice AND two
        //                        distinct artifacts that share a body are both
        //                        kept (no value-level dedup);
        //   - a true gap (a run with both >CAP early bytes AND >2000 later
        //     events whose tail does not reach back to CAP) -> extract each
        //     window separately and concatenate the artifact lists. The windows
        //     do not overlap there, so there are no duplicate occurrences; only
        //     an artifact buried entirely in the un-covered middle is lost, which
        //     was already unrecoverable before this change (the old code only
        //     ever had the tail).
        const head = run.plainArtifactStdout ?? '';
        const tail = plainStdoutFromRunEvents(run.events);
        const totalBytes = run.plainStdoutTotalBytes ?? head.length;
        const tailStart = Math.max(0, totalBytes - tail.length);
        let plainArtifacts: ReturnType<typeof extractPlainStreamArtifacts>;
        if (head.length === 0) {
          plainArtifacts = extractPlainStreamArtifacts(tail);
        } else if (tailStart <= head.length) {
          // Overlap or contiguous: splice tail on at the seam and extract once.
          const stitched = head + tail.slice(head.length - tailStart);
          plainArtifacts = extractPlainStreamArtifacts(stitched);
        } else {
          // Gap: no overlap, so extracting each window and concatenating cannot
          // produce a duplicate occurrence or a false cross-gap artifact.
          plainArtifacts = [
            ...extractPlainStreamArtifacts(head),
            ...extractPlainStreamArtifacts(tail),
          ];
        }
        if (plainArtifacts.length > 0) {
          try {
            const project = getProject(db, run.projectId);
            const persistedPlainArtifacts = await persistPlainStreamArtifactList({
              projectsRoot: PROJECTS_DIR,
              projectId: run.projectId,
              artifacts: plainArtifacts,
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
            stablePromptSections: currentStableSectionsJson,
            model: safeModel ?? null,
            cwd: effectiveCwd,
            lastMessageId: run.assistantMessageId ?? null,
          });
          run.nativeSessionRecovery = markNativeSessionCaptured({
            previous: run.nativeSessionRecovery,
            agentId: def.id,
            sessionId: sessionPath,
            resumed: agentResumeCtx.isResuming,
          });
          publishNativeSessionRecoveryMetadata();
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
          stablePromptSections: currentStableSectionsJson,
          model: safeModel ?? null,
          cwd: effectiveCwd,
          lastMessageId: run.assistantMessageId ?? null,
        });
        run.nativeSessionRecovery = markNativeSessionCaptured({
          previous: run.nativeSessionRecovery,
          agentId: def.id,
          sessionId: acpSession.getDurableSessionId(),
          resumed: agentResumeCtx.isResuming,
        });
        publishNativeSessionRecoveryMetadata();
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
          finishRun('failed', 1, signal);
          return;
        }
        try {
          persistDeliveredAgentSessionState();
        } catch (err) {
          console.warn('[sessions] delivered session persistence failed', err);
        }
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
          // E-lite: `write` returns false when the chunk was buffered because the
          // OS pipe is full (the child isn't draining stdin) — the corroborating
          // signal for a `stdin_write`-phase inactivity stall.
          const accepted = child.stdin.write(`${userMessage}\n`, 'utf8', markStdinWriteEnd);
          run.stdinBackpressure = accepted === false;
        } catch (err) {
          // Swallow EPIPE here for the same reason as the listener above —
          // a fast-exiting child has already routed its failure through
          // stderr / exit handlers.
          if (err && err.code !== 'EPIPE') throw err;
        }
        run.stdinOpen = true;
      } else {
        // Split write + close so the boolean backpressure signal survives —
        // see writePromptAndEndStdin for why `end(chunk)` cannot report it.
        run.stdinBackpressure = writePromptAndEndStdin(child.stdin, composed, markStdinWriteEnd);
      }
    }
  };

  orbitService.setRunHandler(async ({
    trigger,
    startedAt,
    prompt,
    systemPrompt,
    template,
    workspaceScope,
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
    const normalizedWorkspaceScope =
      normalizePersistedAutomationWorkspaceScope(workspaceScope);
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
    bindProjectToPersistedAutomationWorkspace(
      (input) => ensureWorkspaceProject(db, input),
      normalizedWorkspaceScope,
      projectId,
      now,
    );
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
      serviceTier: modelPrefs.serviceTier ?? null,
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
    // This callback carries no request/project Workspace authority. It may
    // therefore resolve app-bundled templates only; accepting a user skill
    // here would turn an unscoped scheduler callback into a cross-member read.
    const skills = await listAllSkillLikeEntries({
      workspaceId: null,
      workspaceMemberId: null,
    });
    const skill = findSkillById(skills, skillId);
    if (!skill || skill.source !== 'built-in' || skill.scenario !== 'orbit') return null;
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
      authorizePluginRequest: async (req, res, pluginId) => {
        const authority = await resolveOptionalWorkspaceRequestAuthority(
          req,
          verifyWorkspaceRequestAuthority,
        );
        if (!authority.ok) {
          sendApiError(
            res,
            authority.status,
            authority.code,
            authority.message,
          );
          return false;
        }
        const plugin = await getWorkspacePluginForRequest(
          db,
          pluginId,
          authority.context?.workspaceId ?? null,
          authority.context?.workspaceMemberId ?? null,
        );
        if (!plugin) {
          sendApiError(res, 404, 'PLUGIN_NOT_FOUND', 'plugin not found');
          return false;
        }
        return true;
      },
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
    // POST /api/runs and POST /api/chat are this file's "create a run" entry
    // points — see RegisterRunRoutesDeps.enforceWorkspaceProjectMutation.
    // Same provider `collab` was built with (collab.workspaceContext ===
    // workspaceContext), matching the cross-check `registerProjectRoutes`
    // wires up for its own mutation routes above.
    enforceWorkspaceProjectMutation: enforceAuthoritativeProjectMutation,
    projectStore: {
      getWorkspaceProject,
      getWorkspaceProjectByProjectId,
      ensureWorkspaceProject,
    },
    amrWorkspaceScope: {
      isSignedIn: async () => {
        const appConfig = await readAppConfig(RUNTIME_DATA_DIR).catch(
          () => ({}),
        );
        return readVelaLoginStatus(
          process.env,
          agentCliEnvForAgent(appConfig.agentCliEnv, 'amr'),
        ).loggedIn;
      },
      verifyWorkspaceRequestAuthority,
    },
    authorizeProjectRequest,
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
    const storedRoutineWorkspaceScope =
      normalizePersistedAutomationWorkspaceScope(routine.context.workspaceScope);
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
        // A background routine has no live request authority from which to
        // prove an ambient app default. Persist no brand for a new project;
        // reused projects carry their own already-persisted selection.
        designSystemId: null,
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
      bindProjectToPersistedAutomationWorkspace(
        (input) => ensureWorkspaceProject(db, input),
        storedRoutineWorkspaceScope,
        projectId,
        now,
      );
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
      const routineProjectBinding = getWorkspaceProjectByProjectId(db, projectId);
      const routinePlugin = await getWorkspacePluginForRequest(
        db,
        primaryPluginId,
        routineProjectBinding?.workspaceId
          ? String(routineProjectBinding.workspaceId)
          : null,
        typeof routineProjectBinding?.createdByWorkspaceMemberId === 'string'
          ? routineProjectBinding.createdByWorkspaceMemberId
          : null,
      );
      if (!routinePlugin) {
        throw new Error(
          `Automation plugin ${primaryPluginId} is not visible to the persisted project owner`,
        );
      }
      const registry = await loadPluginRegistryView(
        routineProjectBinding?.workspaceId
          ? {
              workspaceId: String(routineProjectBinding.workspaceId),
              workspaceMemberId:
                typeof routineProjectBinding.createdByWorkspaceMemberId === 'string'
                  ? routineProjectBinding.createdByWorkspaceMemberId
                  : null,
            }
          : undefined,
      );
      const projectSnapshotBefore = routine.target.mode === 'reuse'
        ? getProject(db, routine.target.projectId)?.appliedPluginSnapshotId ?? null
        : null;
      const persistedDesignSystemId = getProject(db, projectId)?.designSystemId ?? null;
      if (
        persistedDesignSystemId
        && !registry.designSystems.some((system) => system.id === persistedDesignSystemId)
      ) {
        throw new Error(
          `Automation design system ${persistedDesignSystemId} is not visible to the persisted project owner`,
        );
      }
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
            typeof persistedDesignSystemId === 'string' && persistedDesignSystemId.length > 0
              ? { id: persistedDesignSystemId }
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
      const persistedDesignSystemId = getProject(db, projectId)?.designSystemId ?? null;
      design.runs.start(run, () => startChatRun({
        agentId,
        projectId,
        conversationId: run.conversationId,
        assistantMessageId: run.assistantMessageId,
        clientRequestId: run.clientRequestId,
        skillId: routineSkillId,
        designSystemId: persistedDesignSystemId,
        context: routineContext,
        model: modelPrefs.model ?? null,
        reasoning: modelPrefs.reasoning ?? null,
        serviceTier: modelPrefs.serviceTier ?? null,
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
    authorizeProjectRequest,
    authorizeProjectToolRequest,
    isApiTokenAuthorization,
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
    fetchWorkspaceDirectory,
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
    authorizeProjectRequest,
    paths: pathDeps,
    chat: { startChatRun },
    agents: agentDeps,
    critique: critiqueDeps,
    appConfig: { readAppConfig },
    validation: validationDeps,
    lifecycle: { isDaemonShuttingDown: () => daemonShuttingDown },
    telemetry: { reportFinalizedMessage, reportFeedback },
  });

  registerStaticSpaFallback(app, staticDir);

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
      telemetry.disposeFatalHandlers();
      composioConnectorProvider.stopCatalogRefreshLoop();
      orbitService.stop();
      routineService?.stop();
      clearInterval(teamResourcesPollTimer);
      workspaceHubSubscriptions?.dispose();
      hubEventRefreshes.dispose();
      workspaceDirectoryRefreshes.dispose();
      workspaceBillingRuntime.dispose();
      proactiveContentPull.dispose();
      collabCloud?.dispose();
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
