// @ts-nocheck
import type { DesktopExportPdfInput, DesktopExportPdfResult } from '@open-design/sidecar-proto';
import express from 'express';
import multer from 'multer';
import JSZip from 'jszip';
import { execFile, spawn } from 'node:child_process';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import {
  defaultScenarioPluginIdForKind,
  PLUGIN_SHARE_ACTION_PLUGIN_IDS,
} from '@open-design/contracts';
import {
  composeSystemPrompt,
  renderCodexImagegenOverride,
  shouldRenderCodexImagegenOverride,
} from './prompts/system.js';
import { expandHomePrefix, resolveProjectRelativePath } from './home-expansion.js';
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
  applyAgentLaunchEnv,
  resolveAgentLaunch,
  sanitizeCustomModel,
  spawnEnvForAgent,
} from './agents.js';
import { migrateLegacyDataDirSync } from './legacy-data-migrator.js';
import { findSkillById, listSkills, splitDerivedSkillId } from './skills.js';
import { validateLinkedDirs } from './linked-dirs.js';
import { installFromTarget, uninstallById, sanitizeRepoName } from './library-install.js';
import { buildWindowsFolderDialogCommand, parseFolderDialogStdout } from './native-folder-dialog.js';
import { listCodexPets, readCodexPetSpritesheet } from './codex-pets.js';
import { syncCommunityPets } from './community-pets-sync.js';
import {
  listDesignSystems,
  readDesignSystem,
  resolveDesignSystemAssets,
} from './design-systems.js';
import {
  applyDiffReviewDecisionToCwd,
  applyPlugin,
  defaultBundledRoot,
  doctorPlugin,
  FIRST_PARTY_ATOMS,
  getInstalledPlugin,
  getSnapshot,
  installFromLocalFolder,
  installPlugin,
  isDiffReviewSurfaceId,
  listInstalledPlugins,
  listIterationsForRun,
  MissingInputError,
  pluginPromptBlock,
  pruneExpiredSnapshots,
  readPluginLockfile,
  registerBuiltInAtomWorkers,
  registerBundledPlugins,
  registryRootsForDataDir,
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
  getSurface,
  listSurfacesForProject,
  listSurfacesForRun,
  prefillProjectSurface,
  respondSurface as respondSurfaceRow,
  revokeProjectSurface,
} from './genui/index.js';
import {
  composeMemoryBody,
  deleteMemoryEntry,
  extractFromMessage,
  listMemoryEntries,
  maskMemoryExtractionConfig,
  memoryDir,
  memoryEvents,
  readMemoryConfig,
  readMemoryEntry,
  readMemoryIndex,
  upsertMemoryEntry,
  writeMemoryConfig,
  writeMemoryIndex,
} from './memory.js';
import {
  clearExtractions as clearMemoryExtractions,
  listExtractions as listMemoryExtractions,
  removeExtraction as removeMemoryExtraction,
} from './memory-extractions.js';
import { attachAcpSession } from './acp.js';
import { attachPiRpcSession } from './pi-rpc.js';
import { createClaudeStreamHandler } from './claude-stream.js';
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
import { createJsonEventStreamHandler } from './json-event-stream.js';
import { classifyAgentAuthFailure, cursorAuthGuidance } from './runtimes/auth.js';
import { createQoderStreamHandler } from './qoder-stream.js';
import { subscribe as subscribeFileEvents } from './project-watchers.js';
import { renderDesignSystemPreview } from './design-system-preview.js';
import { renderDesignSystemShowcase } from './design-system-showcase.js';
import { createChatRunService } from './runs.js';
import { reportRunCompletedFromDaemon } from './langfuse-bridge.js';
import {
  createAnalyticsService,
  readAnalyticsContext,
  readPublicConfigResponse,
} from './analytics.js';
import {
  redactSecrets,
  testAgentConnection,
  testProviderConnection,
  validateBaseUrl,
  validateBaseUrlResolved,
} from './connectionTest.js';
import { listProviderModels } from './providerModels.js';
import { importClaudeDesignZip } from './claude-design-import.js';
import {
  finalizeDesignPackage,
  FinalizePackageLockedError,
  FinalizeUpstreamError,
} from './finalize-design.js';
import { listPromptTemplates, readPromptTemplate } from './prompt-templates.js';
import { buildDocumentPreview } from './document-preview.js';
import { lintArtifact, renderFindingsForAgent } from './lint-artifact.js';
import { loadCraftSections } from './craft.js';
import { stageActiveSkill } from './cwd-aliases.js';
import { buildDesktopPdfExportInput } from './pdf-export.js';
import { generateMedia } from './media.js';
import { listElevenLabsVoiceOptions } from './elevenlabs-voices.js';
import { searchResearch, ResearchError } from './research/index.js';
import { renderResearchCommandContract } from './prompts/research-contract.js';
import {
  AUDIO_DURATIONS_SEC,
  AUDIO_MODELS_BY_KIND,
  IMAGE_MODELS,
  MEDIA_ASPECTS,
  MEDIA_PROVIDERS,
  VIDEO_LENGTHS_SEC,
  VIDEO_MODELS,
} from './media-models.js';
import { readMaskedConfig, writeConfig } from './media-config.js';
import {
  deleteMediaTask,
  getMediaTask,
  insertMediaTask,
  listMediaTasksByProject,
  listRecentMediaTasks,
  reconcileMediaTasksOnBoot,
  updateMediaTask,
} from './media-tasks.js';
import {
  MCP_TEMPLATES,
  buildAcpMcpServers,
  buildClaudeMcpJson,
  isManagedProjectCwd,
  readMcpConfig,
  writeMcpConfig,
} from './mcp-config.js';
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
import {
  buildProjectArchive,
  buildBatchArchive,
  decodeMultipartFilename,
  deleteProjectFile,
  detectEntryFile,
  ensureProject,
  isSafeId,
  listFiles,
  mimeFor,
  parseByteRange,
  projectDir,
  readProjectFile,
  renameProjectFile,
  removeProjectDir,
  resolveProjectDir,
  sanitizeName,
  searchProjectFiles,
  resolveProjectDir,
  resolveProjectFilePath,
  writeProjectFile,
} from './projects.js';
import { validateArtifactManifestInput } from './artifact-manifest.js';
import { readCurrentAppVersionInfo } from './app-version.js';
import {
  deleteConversation,
  deletePreviewComment,
  deleteProject as dbDeleteProject,
  deleteTemplate,
  getConversation,
  getDeployment,
  getDeploymentById,
  getProject,
  getTemplate,
  insertConversation,
  insertProject,
  insertRoutine,
  insertRoutineRun,
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
  deleteRoutine as dbDeleteRoutine,
  openDatabase,
  setTabs,
  updateConversation,
  updatePreviewCommentStatus,
  updateProject,
  updateRoutine,
  updateRoutineRun,
  upsertDeployment,
  upsertMessage,
  upsertPreviewComment,
} from './db.js';
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
import { registerActiveContextRoutes } from './active-context-routes.js';
import { registerMcpRoutes } from './mcp-routes.js';
import { registerLiveArtifactRoutes } from './live-artifact-routes.js';
import { registerDeployRoutes, registerDeploymentCheckRoutes } from './deploy-routes.js';
import { registerMediaRoutes } from './media-routes.js';
import { registerProjectRoutes, registerProjectArtifactRoutes, registerProjectFileRoutes, registerProjectUploadRoutes } from './project-routes.js';
import { registerFinalizeRoutes, registerImportRoutes, registerProjectExportRoutes } from './import-export-routes.js';
import { registerChatRoutes } from './chat-routes.js';
import { registerStaticResourceRoutes } from './static-resource-routes.js';
import { registerRoutineRoutes, routineDbRowToContract } from './routine-routes.js';
import { assertServerContextSatisfiesRoutes } from './route-context-contract.js';
import { configureConnectorCredentialStore, ConnectorServiceError, FileConnectorCredentialStore } from './connectors/service.js';
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
const require = createRequire(import.meta.url);
const DAEMON_CLI_PATH_ENV = 'OD_DAEMON_CLI_PATH';
export function resolveProjectRoot(moduleDir: string): string {
  const base = path.basename(moduleDir);
  const daemonDir =
    base === 'dist' || base === 'src' ? path.dirname(moduleDir) : moduleDir;
  return path.resolve(daemonDir, '../..');
}

function cleanOptionalPath(value: string | undefined): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? path.resolve(value)
    : null;
}

export function resolveDaemonCliPath(env: NodeJS.ProcessEnv = process.env): string {
  const configured = cleanOptionalPath(env[DAEMON_CLI_PATH_ENV]) ?? cleanOptionalPath(env.OD_BIN);
  if (configured) return configured;

  const packageJsonPath = require.resolve('@open-design/daemon/package.json');
  return path.join(path.dirname(packageJsonPath), 'dist', 'cli.js');
}

const PROJECT_ROOT = resolveProjectRoot(__dirname);
const RESOURCE_ROOT_ENV = 'OD_RESOURCE_ROOT';
let desktopAuthSecret: Buffer | null = null;
let desktopAuthEverRegistered = process.env.OD_REQUIRE_DESKTOP_AUTH === '1';
const consumedImportNonces = new Map<string, number>();
const DESKTOP_IMPORT_TOKEN_TTL_MS = 60_000;
const DESKTOP_IMPORT_TOKEN_FIELD_SEP = '~';

export function setDesktopAuthSecret(secret: Buffer | null): void {
  desktopAuthSecret = secret;
  if (secret != null) {
    desktopAuthEverRegistered = true;
  }
  consumedImportNonces.clear();
}

export function isDesktopAuthRegistered(): boolean {
  return desktopAuthSecret != null;
}

export function isDesktopAuthGateActive(): boolean {
  return desktopAuthEverRegistered;
}

export function resetDesktopAuthForTests(): void {
  desktopAuthSecret = null;
  desktopAuthEverRegistered = process.env.OD_REQUIRE_DESKTOP_AUTH === '1';
  consumedImportNonces.clear();
}

function pruneExpiredImportNonces(now: number): void {
  for (const [nonce, exp] of consumedImportNonces) {
    if (exp <= now) consumedImportNonces.delete(nonce);
  }
}

function timingSafeStringEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function signDesktopImportToken(
  secret: Buffer,
  baseDir: string,
  options: { nonce: string; exp: string },
): string {
  const signature = createHmac('sha256', secret)
    .update(`${baseDir}\n${options.nonce}\n${options.exp}`)
    .digest('base64url');
  return [options.nonce, options.exp, signature].join(DESKTOP_IMPORT_TOKEN_FIELD_SEP);
}

type DesktopImportTokenVerification =
  | { ok: true; nonce: string; exp: number }
  | { ok: false; reason: string };

export function verifyDesktopImportToken(
  secret: Buffer,
  baseDir: string,
  token: string,
  now: number,
  consumedNonces: Map<string, number>,
): DesktopImportTokenVerification {
  if (typeof token !== 'string' || token.length === 0) {
    return { ok: false, reason: 'token missing' };
  }
  const parts = token.split(DESKTOP_IMPORT_TOKEN_FIELD_SEP);
  if (parts.length !== 3) {
    return { ok: false, reason: 'token shape invalid' };
  }
  const [nonce, expISO, signature] = parts;
  if (nonce.length === 0 || expISO.length === 0 || signature.length === 0) {
    return { ok: false, reason: 'token shape invalid' };
  }
  const expMs = Date.parse(expISO);
  if (!Number.isFinite(expMs)) {
    return { ok: false, reason: 'token expiry invalid' };
  }
  if (expMs <= now) {
    return { ok: false, reason: 'token expired' };
  }
  if (expMs - now > DESKTOP_IMPORT_TOKEN_TTL_MS * 2) {
    return { ok: false, reason: 'token expiry exceeds permitted window' };
  }
  const expected = createHmac('sha256', secret)
    .update(`${baseDir}\n${nonce}\n${expISO}`)
    .digest('base64url');
  if (!timingSafeStringEquals(expected, signature)) {
    return { ok: false, reason: 'token signature invalid' };
  }
  if (consumedNonces.has(nonce)) {
    return { ok: false, reason: 'token nonce already used' };
  }
  return { ok: true, nonce, exp: expMs };
}

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
) {
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
}: {
  agentId?: string | null;
  metadata?: unknown;
  codexGeneratedImagesDir?: string | null;
  extraAllowedDirs?: string[];
}): string | null {
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
      const comment = cleanString(raw.comment) || intent;
      const selectionKind =
        raw.selectionKind === 'visual' ? 'visual' : raw.selectionKind === 'pod' ? 'pod' : 'element';
      if (!filePath || !elementId || !comment) return null;
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
        selectionKind,
        memberCount,
        podMembers,
        screenshotPath: selectionKind === 'visual' ? screenshotPath : undefined,
        markKind: selectionKind === 'visual' ? markKind : undefined,
        intent: selectionKind === 'visual'
          ? intent || visualAnnotationIntent(markKind)
          : undefined,
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
    'Scope: treat each attachment as the default refinement target. For visual marks, inspect the screenshot and modify the marked region first. Preserve unrelated areas.',
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
      `comment: ${item.comment}`,
    );
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
      });
    }
  }
  lines.push('</attached-preview-comments>');
  return lines.join('\n');
}

function cleanString(value) {
  return typeof value === 'string' ? value.trim() : '';
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
      };
    })
    .filter(Boolean);
}

function finiteAttachmentNumber(value) {
  return Number.isFinite(value) ? Math.round(value) : 0;
}

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

function resolveProcessResourcesPath() {
  if (
    typeof process.resourcesPath === 'string' &&
    process.resourcesPath.length > 0
  ) {
    return process.resourcesPath;
  }

  // Packaged daemon sidecars run under the bundled Node binary rather than the
  // Electron root process, so `process.resourcesPath` is unavailable there.
  // Infer the macOS app Resources directory from that bundled Node path.
  const resourcesMarker = `${path.sep}Contents${path.sep}Resources${path.sep}`;
  const markerIndex = process.execPath.indexOf(resourcesMarker);
  if (markerIndex !== -1) {
    return process.execPath.slice(0, markerIndex + resourcesMarker.length - 1);
  }

  const normalizedExecPath = process.execPath.toLowerCase();
  const windowsResourceBinMarker =
    `${path.sep}resources${path.sep}open-design${path.sep}bin${path.sep}`.toLowerCase();
  const windowsMarkerIndex = normalizedExecPath.indexOf(
    windowsResourceBinMarker,
  );
  if (windowsMarkerIndex !== -1) {
    return process.execPath.slice(
      0,
      windowsMarkerIndex + `${path.sep}resources`.length,
    );
  }

  return null;
}

export function resolveDaemonResourceRoot({
  configured = process.env[RESOURCE_ROOT_ENV],
  safeBases = [PROJECT_ROOT, resolveProcessResourcesPath()],
} = {}) {
  if (!configured || configured.length === 0) return null;

  const resolved = path.resolve(configured);
  const normalizedSafeBases = safeBases
    .filter((base) => typeof base === 'string' && base.length > 0)
    .map((base) => path.resolve(base));

  if (!normalizedSafeBases.some((base) => isPathWithin(base, resolved))) {
    throw new Error(
      `${RESOURCE_ROOT_ENV} must be under the workspace root or app resources path`,
    );
  }

  return resolved;
}

function resolveDaemonResourceDir(resourceRoot, segment, fallback) {
  return resourceRoot ? path.join(resourceRoot, segment) : fallback;
}

const DAEMON_RESOURCE_ROOT = resolveDaemonResourceRoot();
// Built web app lives in `out/` — that's where Next.js writes the static
// export configured in next.config.ts. The folder name used to be `dist/`
// when this project shipped with Vite; the daemon serves whatever the
// frontend toolchain emits, no further config needed.
const STATIC_DIR = path.join(PROJECT_ROOT, 'apps', 'web', 'out');
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

export function resolveDataDir(raw, projectRoot) {
  if (!raw) return path.join(projectRoot, '.od');
  // expandHomePrefix is shared with media-config.ts so OD_DATA_DIR and
  // OD_MEDIA_CONFIG_DIR can never split state under a $HOME-style value.
  // Some launchers (systemd unit files, NixOS modules, certain Docker
  // entrypoints, Windows scheduled tasks) pass OD_DATA_DIR with literal
  // $HOME or ${HOME} because the variable is never expanded by a shell;
  // expandHomePrefix turns those (and the ~ shorthand, with both / and \
  // separators) into os.homedir() before path.resolve runs so launch
  // surfaces stay consistent.
  const resolved = resolveProjectRelativePath(raw, projectRoot);
  try {
    fs.mkdirSync(resolved, { recursive: true });
    fs.accessSync(resolved, fs.constants.W_OK);
  } catch (err) {
    const e = err;
    const currentUser = (() => {
      try {
        return os.userInfo().username;
      } catch {
        return process.env.USER ?? process.env.LOGNAME ?? 'unknown';
      }
    })();
    const parentDir = path.dirname(resolved);
    throw new Error(
      [
        `OD_DATA_DIR "${resolved}" is not writable: ${e.message}`,
        `Current user: ${currentUser}`,
        `Check whether the folder or one of its parents is owned by another user, is a symlink to a protected location, or was previously created with sudo.`,
        `Try: ls -ld "${parentDir}" "${resolved}"`,
        `If the folder should belong to you, fix ownership/permissions, for example: sudo chown -R "${currentUser}":staff "${parentDir}" && chmod -R u+rwX "${parentDir}"`,
      ].join(' '),
    );
  }
  return resolved;
}
const RUNTIME_DATA_DIR = resolveDataDir(process.env.OD_DATA_DIR, PROJECT_ROOT);
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

function emitChatAgentEvent(runId, payload) {
  const sink = activeChatAgentEventSinks.get(runId);
  if (!sink) return false;
  return sink(payload);
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
  const env = {
    ...baseEnv,
    OD_DAEMON_URL: daemonUrl,
    OD_NODE_BIN: nodeBin,
  };

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

/**
 * @param {ApiErrorCode} code
 * @param {string} message
 * @param {Omit<ApiError, 'code' | 'message'>} [init]
 * @returns {ApiError}
 */
export function createCompatApiError(code, message, init = {}) {
  return { code, message, ...init };
}

/**
 * @param {ApiErrorCode} code
 * @param {string} message
 * @param {Omit<ApiError, 'code' | 'message'>} [init]
 * @returns {ApiErrorResponse}
 */
export function createCompatApiErrorResponse(code, message, init = {}) {
  return { error: createCompatApiError(code, message, init) };
}

/**
 * @param {import('express').Response} res
 * @param {number} status
 * @param {ApiErrorCode} code
 * @param {string} message
 * @param {Omit<ApiError, 'code' | 'message'>} [init]
 */
function sendApiError(res, status, code, message, init = {}) {
  return res
    .status(status)
    .json(createCompatApiErrorResponse(code, message, init));
}

function normalizeProjectPluginFolderPath(input) {
  const value = String(input ?? '').replace(/\\/g, '/').trim();
  if (!value || value.includes('\0') || value.startsWith('/') || /^[A-Za-z]:\//.test(value)) {
    throw new Error('plugin folder path must be a relative project path');
  }
  const parts = value.split('/').filter(Boolean);
  if (parts.length === 0 || parts.some((part) => part === '.' || part === '..')) {
    throw new Error('plugin folder path must not contain traversal segments');
  }
  return parts.join('/');
}

async function resolveProjectChildDirectory(projectRoot, relativePath) {
  const rootReal = await fs.promises.realpath(projectRoot);
  const candidate = path.resolve(projectRoot, relativePath);
  const real = await fs.promises.realpath(candidate);
  if (!real.startsWith(rootReal + path.sep) && real !== rootReal) {
    throw new Error('plugin folder path escapes project dir');
  }
  const st = await fs.promises.stat(real);
  if (!st.isDirectory()) {
    const err = new Error('plugin folder path is not a directory');
    err.code = 'ENOTDIR';
    throw err;
  }
  return real;
}

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

async function readProjectPluginManifest(folder) {
  const raw = await fs.promises.readFile(path.join(folder, 'open-design.json'), 'utf8');
  const manifest = JSON.parse(raw);
  const name = typeof manifest.name === 'string' && manifest.name.trim()
    ? manifest.name.trim()
    : path.basename(folder);
  return {
    name,
    title: typeof manifest.title === 'string' ? manifest.title : name,
    version: typeof manifest.version === 'string' ? manifest.version : '0.1.0',
    manifest,
  };
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

async function ensureGhReady() {
  const version = await execFileBuffered('gh', ['--version'], { timeout: 10_000 });
  if (!version.ok) {
    return {
      ok: false,
      code: 'gh-not-installed',
      message: 'GitHub CLI is not installed. Install it, then click this action again.',
      url: 'https://cli.github.com/',
      log: [version.stderr || version.stdout || 'gh --version failed'],
    };
  }
  const auth = await execFileBuffered('gh', ['auth', 'status', '--hostname', 'github.com'], { timeout: 10_000 });
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
  return (saved, body = {}) => {
    if (!shouldReportRunCompletedFromMessage(saved, body)) return;
    const run = design.runs.get(saved.runId);
    if (!run || reportedRuns.has(run.id)) return;
    reportedRuns.add(run.id);
    void report({
      db,
      dataDir,
      run,
      persistedRunStatus: saved.runStatus,
      persistedEndedAt: saved.endedAt,
      appVersion: getAppVersion(),
    });
  };
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
        const dir = await ensureProject(PROJECTS_DIR, req.params.id, meta);
        cb(null, dir);
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

export interface StartServerOptions {
  desktopPdfExporter?: DesktopPdfExporter | null;
  host?: string;
  port?: number;
  returnServer?: boolean;
}

const DEFAULT_CHAT_RUN_INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_CHAT_RUN_INACTIVITY_TIMEOUT_MS = 24 * 60 * 60 * 1000;

function resolveChatRunInactivityTimeoutMs() {
  const raw = Number(process.env.OD_CHAT_RUN_INACTIVITY_TIMEOUT_MS);
  // This watchdog observes child stdout/stderr/SSE activity, not real CPU or
  // filesystem progress. Keep the default long enough for agents that spend
  // several minutes silently writing large artifacts.
  if (!Number.isFinite(raw)) return DEFAULT_CHAT_RUN_INACTIVITY_TIMEOUT_MS;
  // Node clamps delays larger than a signed 32-bit integer down to 1ms, which
  // makes an oversized override fail almost immediately while reporting a huge
  // timeout. Keep explicit overrides bounded to a practical, timer-safe value.
  return Math.min(MAX_CHAT_RUN_INACTIVITY_TIMEOUT_MS, Math.max(0, Math.floor(raw)));
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

export async function startServer({
  port = 7456,
  host = process.env.OD_BIND_HOST || '127.0.0.1',
  returnServer = false,
  desktopPdfExporter = null,
}: StartServerOptions = {}) {
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
  const apiToken = (process.env.OD_API_TOKEN ?? '').trim();
  if (!isLoopbackHostname(host) && apiToken.length === 0) {
    throw new Error(
      `OD_BIND_HOST=${host} requires OD_API_TOKEN to be set. ` +
      `Generate one with \`openssl rand -hex 32\` and re-launch. ` +
      `(Loopback hosts 127.0.0.1 / ::1 / localhost do not need a token.)`,
    );
  }

  const app = express();
  app.use(express.json({ limit: '4mb' }));

  // Plan §3.K1 — bearer-token middleware.
  //
  // Active only when OD_API_TOKEN is set. Loopback origins skip the
  // check (the desktop UI / local CLI never carry a bearer); every
  // other request must present `Authorization: Bearer <token>` with a
  // value matching `OD_API_TOKEN`. Health / version / status remain
  // open so monitoring probes don't need the token.
  if (apiToken.length > 0) {
    const openProbePaths = new Set(['/api/health', '/api/version', '/api/daemon/status']);
    app.use('/api', (req, res, next) => {
      if (openProbePaths.has(req.path)) return next();
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
    }));
    let installed = [];
    try {
      installed = (await listDesignSystems(USER_DESIGN_SYSTEMS_DIR)).map(
        (s) => ({ ...s, source: 'installed' }),
      );
    } catch {
      // User directory may not exist yet or be unreadable.
    }
    const seen = new Set(builtIn.map((s) => s.id));
    return [...builtIn, ...installed.filter((s) => !seen.has(s.id))];
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
    /^\/projects\/[^/]+\/raw\/|^\/codex-pets\/[^/]+\/spritesheet$/;

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
    insertRun: (run) => {
      insertRoutineRun(db, {
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
      });
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
      description: plugin.description,
      version:     plugin.version,
      source:      bundledPluginRegistrySource(plugin.source),
      publisher:   { id: 'open-design', url: 'https://open-design.ai' },
      homepage:    plugin.manifest.homepage,
      license:     plugin.manifest.license,
      tags:        plugin.tags,
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

  app.get('/api/version', async (_req, res) => {
    const version = await readCurrentAppVersionInfo();
    res.json({ version });
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
      bindHost: process.env.OD_BIND_HOST ?? '127.0.0.1',
      port: Number(process.env.OD_PORT ?? 7456),
      dataDir: RUNTIME_DATA_DIR,
      mediaConfigDir: process.env.OD_MEDIA_CONFIG_DIR ?? null,
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

  // Plan §3.KK1 — non-SSE one-shot read of the event ring buffer.
  // Useful for dashboards + the `od plugin events snapshot` CLI
  // command that doesn't need a live tail.
  app.get('/api/plugins/events/snapshot', async (req, res) => {
    const since = Number(typeof req.query.since === 'string' ? req.query.since : 0);
    const { pluginEventSnapshot } = await import('./plugins/events.js');
    const events = pluginEventSnapshot(Number.isFinite(since) && since > 0 ? since : 0);
    res.json({ events, count: events.length, generatedAt: Date.now() });
  });

  // Plan §3.KK2 — rolled-up stats over the buffer. Counts by kind +
  // pluginId + oldest/newest timestamps + id range.
  app.get('/api/plugins/events/stats', async (_req, res) => {
    const { pluginEventSnapshot, summarisePluginEvents } = await import('./plugins/events.js');
    res.json({
      stats: summarisePluginEvents(pluginEventSnapshot()),
      generatedAt: Date.now(),
    });
  });

  // Plan §3.NN1 — `od plugin events purge`. Operator escape
  // hatch for resetting the in-memory ring buffer. Loopback-only
  // because clearing the buffer drops audit history; an operator
  // with shell access to the daemon machine should be the only
  // one allowed to invoke. Returns the pre-purge stats so the
  // caller can confirm what they discarded.
  app.post('/api/plugins/events/purge', requireLocalDaemonRequest, async (_req, res) => {
    try {
      const { purgePluginEventBuffer } = await import('./plugins/events.js');
      const result = purgePluginEventBuffer();
      res.json({ ok: true, ...result });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Plan §3.II1 — `od plugin events tail`. SSE-backed live event
  // stream of plugin lifecycle events from the in-memory ring
  // buffer. On open: emits the buffered backlog as 'event: backlog'
  // entries (capped at the buffer's MAX), then forwards every
  // newly-recorded event as 'event: plugin' with the same shape.
  // Optional ?since=<id> trims the backlog.
  app.get('/api/plugins/events', async (req, res) => {
    const since = Number(typeof req.query.since === 'string' ? req.query.since : 0);
    const { pluginEventSnapshot, subscribePluginEvents } = await import('./plugins/events.js');
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    // Emit the backlog so a tail consumer doesn't miss installs
    // that happened just before they connected.
    const backlog = pluginEventSnapshot(Number.isFinite(since) && since > 0 ? since : 0);
    for (const ev of backlog) {
      res.write(`event: backlog\ndata: ${JSON.stringify(ev)}\n\n`);
    }

    const unsubscribe = subscribePluginEvents((ev) => {
      res.write(`event: plugin\ndata: ${JSON.stringify(ev)}\n\n`);
    });
    req.on('close', () => { unsubscribe(); });
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

  // ---- Projects (DB-backed) -------------------------------------------------


  // ----- Memory store -----------------------------------------------------
  // Markdown-on-disk memory under <dataDir>/memory/. The daemon folds these
  // into every system prompt (gated by `enabled`) and the chat run loop
  // calls `/api/memory/extract` after each turn to sediment new facts.
  app.get('/api/memory', async (_req, res) => {
    try {
      const [config, index, entries] = await Promise.all([
        readMemoryConfig(RUNTIME_DATA_DIR),
        readMemoryIndex(RUNTIME_DATA_DIR),
        listMemoryEntries(RUNTIME_DATA_DIR),
      ]);
      res.json({
        enabled: config.enabled,
        rootDir: memoryDir(RUNTIME_DATA_DIR),
        index,
        entries,
        extraction: maskMemoryExtractionConfig(config.extraction),
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Static sub-resources (`/index`, `/config`, `/extract`) registered
  // BEFORE the `:id` catch-alls so an `index` / `config` / `extract` slug
  // can't shadow the real handlers.
  app.put('/api/memory/index', async (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const index = typeof body.index === 'string' ? body.index : '';
      await writeMemoryIndex(RUNTIME_DATA_DIR, index);
      res.json({ index });
    } catch (err) {
      res.status(400).json({ error: String((err && err.message) || err) });
    }
  });

  app.patch('/api/memory/config', async (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const patch = {};
      if (typeof body.enabled === 'boolean') patch.enabled = body.enabled;
      // Three-state extraction handling so the UI can: (a) leave the
      // override alone (omit `extraction`), (b) clear it back to
      // auto-pick (`extraction: null`), or (c) commit a custom override
      // (`extraction: { provider, ... }`). For the apiKey field we
      // need *four* states because the masked GET surfaces only an
      // `apiKeyTail` (the secret never round-trips):
      //   - field absent      → preserve the stored key (UI re-saves
      //                          a settings form without re-typing
      //                          the secret).
      //   - field === ''      → CLEAR the stored key (the picker's
      //                          drift-resync effect fires this when
      //                          the user clears their BYOK chat
      //                          API key — keeping the old daemon-
      //                          side credential would silently keep
      //                          calling the provider after the user
      //                          intentionally removed it from the
      //                          chat picker, which the reviewer
      //                          flagged as a credential-sync bug).
      //   - field === 'sk-…'  → replace with the new key.
      //   - provider differs  → ignore stored key entirely.
      if (Object.prototype.hasOwnProperty.call(body, 'extraction')) {
        if (body.extraction === null) {
          patch.extraction = null;
        } else if (body.extraction && typeof body.extraction === 'object') {
          const incoming = body.extraction;
          const current = await readMemoryConfig(RUNTIME_DATA_DIR);
          const apiKeyOmitted = !Object.prototype.hasOwnProperty.call(
            incoming,
            'apiKey',
          );
          const sameProvider =
            !!current.extraction
            && current.extraction.provider === incoming.provider;
          let nextApiKey = '';
          if (typeof incoming.apiKey === 'string' && incoming.apiKey) {
            nextApiKey = incoming.apiKey;
          } else if (apiKeyOmitted && sameProvider) {
            nextApiKey = current.extraction.apiKey ?? '';
          }
          patch.extraction = {
            provider: incoming.provider,
            model:
              typeof incoming.model === 'string' ? incoming.model : undefined,
            baseUrl:
              typeof incoming.baseUrl === 'string'
                ? incoming.baseUrl
                : undefined,
            apiKey: nextApiKey,
            // Azure-only; ignored by the validator for the other providers.
            // We forward whatever the UI sent (or the previously-stored
            // value when the UI omits the field) so re-saving an azure
            // override without re-typing the api-version doesn't blank it.
            apiVersion:
              typeof incoming.apiVersion === 'string'
                ? incoming.apiVersion
                : current.extraction?.apiVersion,
          };
        }
      }
      const next = await writeMemoryConfig(RUNTIME_DATA_DIR, patch);
      res.json({
        enabled: next.enabled,
        extraction: maskMemoryExtractionConfig(next.extraction),
      });
    } catch (err) {
      res.status(400).json({ error: String((err && err.message) || err) });
    }
  });

  // SSE feed of memory mutations. The web settings panel subscribes to
  // this and re-fetches on every event; toast UIs can listen for
  // `kind === 'extract'` and surface a small "Memory updated (N new)"
  // notification. Payload shape: MemoryChangeEvent (see ./memory.ts).
  //
  // The same connection also forwards `extraction` events — one per LLM
  // extraction phase transition — so the settings panel can render a
  // live "recent extractions" list. We multiplex on a single SSE stream
  // so the browser opens one connection instead of two.
  app.get('/api/memory/events', async (_req, res) => {
    const sse = createSseResponse(res);
    sse.send('connected', { at: Date.now() });
    const onChange = (event) => {
      sse.send('change', event);
    };
    const onExtraction = (event) => {
      sse.send('extraction', event);
    };
    memoryEvents.on('change', onChange);
    memoryEvents.on('extraction', onExtraction);
    res.on('close', () => {
      memoryEvents.off('change', onChange);
      memoryEvents.off('extraction', onExtraction);
    });
  });

  // Recent LLM-extraction attempts (newest first; capped server-side).
  // Surfaces skip reasons, in-flight calls, success counts, and errors
  // so the settings panel can show "why didn't memory update?" at a
  // glance instead of leaving the user to guess.
  app.get('/api/memory/extractions', async (_req, res) => {
    try {
      res.json({ extractions: listMemoryExtractions() });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Drop the entire extraction history. Registered BEFORE the `:id`
  // catch-all so a literal "/api/memory/extractions" can still be
  // cleared with `curl -X DELETE`.
  app.delete('/api/memory/extractions', async (_req, res) => {
    try {
      const removed = clearMemoryExtractions();
      res.json({ removed });
    } catch (err) {
      res.status(400).json({ error: String((err && err.message) || err) });
    }
  });

  app.delete('/api/memory/extractions/:id', async (req, res) => {
    try {
      const removed = removeMemoryExtraction(req.params.id);
      res.json({ removed });
    } catch (err) {
      res.status(400).json({ error: String((err && err.message) || err) });
    }
  });

  // Imperative extract — used by CLI chats internally and by BYOK /
  // API-mode chats from the web app, which never reach the chat-run
  // path on the daemon. Mirrors the two-phase hook the daemon's chat
  // route applies inline:
  //
  //   - Pre-turn (only `userMessage` supplied): run the synchronous
  //     heuristic regex pack so explicit "remember: X" / "我是 X"
  //     markers land in memory before the prompt is composed, and the
  //     same turn's assistant reply already reflects them.
  //   - Post-turn (`userMessage` + `assistantMessage` supplied): queue
  //     the LLM extractor in the background — it speaks SSE /
  //     extraction-history on its own and may take several seconds, so
  //     we don't block the HTTP response on it. The heuristic is
  //     skipped on this branch because the caller already ran it
  //     pre-turn; running it twice would double the
  //     `recordHeuristic({...})` rows in the extraction history for
  //     every turn.
  //
  // External callers (curl, replay tools) that pass only
  // `userMessage` keep the legacy behaviour: heuristic-only.
  app.post('/api/memory/extract', async (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const userMessage =
        typeof body.userMessage === 'string' ? body.userMessage : '';
      const assistantMessage =
        typeof body.assistantMessage === 'string' ? body.assistantMessage : '';
      const hasAssistant = assistantMessage.trim().length > 0;
      const changed = hasAssistant
        ? []
        : await extractFromMessage(RUNTIME_DATA_DIR, userMessage);
      // BYOK chat config — only forwarded by the web app for API-mode
      // chats. We strip the surface to the five fields pickProvider()
      // actually consumes and validate the provider against the four
      // shapes the extractor speaks; an unknown / missing provider
      // means "let the legacy chain decide" so a malformed payload
      // can't override the env / media-config fallbacks.
      const rawChat = body.chatProvider;
      let chatProvider = null;
      if (rawChat && typeof rawChat === 'object') {
        const provider = rawChat.provider;
        if (
          provider === 'anthropic'
          || provider === 'openai'
          || provider === 'azure'
          || provider === 'google'
          || provider === 'ollama'
        ) {
          chatProvider = {
            provider,
            apiKey: typeof rawChat.apiKey === 'string' ? rawChat.apiKey : '',
            baseUrl: typeof rawChat.baseUrl === 'string' ? rawChat.baseUrl : '',
            apiVersion:
              typeof rawChat.apiVersion === 'string' ? rawChat.apiVersion : '',
            model: typeof rawChat.model === 'string' ? rawChat.model : '',
          };
        }
      }
      let attemptedLLM = false;
      if (userMessage.trim().length > 0 && hasAssistant) {
        attemptedLLM = true;
        void import('./memory-llm.js')
          .then(({ extractWithLLM }) =>
            extractWithLLM(
              RUNTIME_DATA_DIR,
              { userMessage, assistantMessage },
              {
                projectRoot: PROJECT_ROOT,
                chatAgentId: null,
                chatProvider,
              },
            ),
          )
          .catch((err) =>
            console.warn('[memory-llm] background failed (http extract)', err),
          );
      }
      res.json({ changed, attemptedLLM });
    } catch (err) {
      res.status(400).json({ error: String((err && err.message) || err) });
    }
  });

  // Composed memory body for the system prompt. Daemon-side chat runs
  // call `composeMemoryBody()` directly; the web app (BYOK / API mode)
  // can't import daemon internals, so this endpoint exposes the same
  // string the daemon would have folded into the system prompt for a
  // CLI run. `ProjectView.composedSystemPrompt()` calls it before each
  // BYOK turn and passes the result into `composeSystemPrompt`'s
  // `memoryBody` field — without this, the Memory tab is a no-op for
  // BYOK users even though the UI saves model/index/entries for them.
  app.get('/api/memory/system-prompt', async (_req, res) => {
    try {
      const body = await composeMemoryBody(RUNTIME_DATA_DIR);
      res.json({ body });
    } catch (err) {
      res.status(500).json({ error: String((err && err.message) || err) });
    }
  });

  app.post('/api/memory', async (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const entry = await upsertMemoryEntry(RUNTIME_DATA_DIR, body);
      res.json({ entry });
    } catch (err) {
      res.status(400).json({ error: String((err && err.message) || err) });
    }
  });

  app.get('/api/memory/:id', async (req, res) => {
    try {
      const entry = await readMemoryEntry(RUNTIME_DATA_DIR, req.params.id);
      if (!entry) return res.status(404).json({ error: 'memory not found' });
      res.json({ entry });
    } catch (err) {
      res.status(400).json({ error: String((err && err.message) || err) });
    }
  });

  app.put('/api/memory/:id', async (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const entry = await upsertMemoryEntry(RUNTIME_DATA_DIR, {
        ...body,
        id: req.params.id,
      });
      res.json({ entry });
    } catch (err) {
      res.status(400).json({ error: String((err && err.message) || err) });
    }
  });

  app.delete('/api/memory/:id', async (req, res) => {
    try {
      await deleteMemoryEntry(RUNTIME_DATA_DIR, req.params.id);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: String((err && err.message) || err) });
    }
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
    runs: createChatRunService({ createSseResponse, createSseErrorPayload }),
    analytics: analyticsService,
    getAppVersion: () => cachedAppVersion?.version ?? '0.0.0',
    readAnalyticsContext,
  };

  // PostHog runtime config — gated on BOTH a server-side key (POSTHOG_KEY)
  // and the user's opt-in metrics consent (Privacy → "Share usage data").
  // The web bundle short-circuits when enabled=false so opt-out behaviour
  // is instant after the user toggles metrics off and reloads.
  app.get('/api/analytics/config', async (_req, res) => {
    const baseline = readPublicConfigResponse();
    if (!baseline.enabled) {
      res.json(baseline);
      return;
    }
    try {
      const appCfg = await readAppConfig(RUNTIME_DATA_DIR);
      const consentGranted = appCfg.telemetry?.metrics === true;
      if (!consentGranted) {
        res.json({ enabled: false, key: null, host: null });
        return;
      }
      // Echo the installationId so the web client uses the same anonymous
      // id PostHog already saw on prior runs (and that Langfuse uses too).
      const installationId =
        typeof appCfg.installationId === 'string' && appCfg.installationId
          ? appCfg.installationId
          : null;
      res.json({ ...baseline, installationId });
    } catch {
      // If the config file is unreadable, fail closed — no events.
      res.json({ enabled: false, key: null, host: null });
    }
  });

  // Tracks runs whose completion has already been forwarded to Langfuse so
  // repeated message updates only emit one trace per run.
  const reportedRuns = new Set();

  // App-version snapshot read once at server start for Langfuse trace metadata.
  let cachedAppVersion = null;
  void (async () => {
    try {
      cachedAppVersion = await readCurrentAppVersionInfo();
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
  const nativeDialogDeps = { openNativeFolderDialog };
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
    desktopAuthSecret: () => desktopAuthSecret,
    isDesktopAuthGateActive,
    pruneExpiredImportNonces,
    requestProjectOverride,
    requestRunOverride,
    verifyDesktopImportToken,
  };
  const finalizeDeps = {
    finalizeDesignPackage,
    FinalizePackageLockedError,
    FinalizeUpstreamError,
    redactSecrets,
  };
  const validationDeps = { isSafeId, validateExternalApiBaseUrl, validateBaseUrl };
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
  // Project workspace
  registerActiveContextRoutes(app, {
    db,
    http: httpDeps,
    projectStore: projectStoreDeps,
  });
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
  app.use('/artifacts', express.static(ARTIFACTS_DIR));
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
  });

  registerMediaRoutes(app, {
    db,
    http: httpDeps,
    paths: pathDeps,
    ids: idDeps,
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
    const { title } = req.body || {};
    const now = Date.now();
    const conv = insertConversation(db, {
      id: randomId(),
      projectId: req.params.id,
      title: typeof title === 'string' ? title.trim() || null : null,
      createdAt: now,
      updatedAt: now,
    });
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

  // ---- Tabs -----------------------------------------------------------------

  app.get('/api/projects/:id/tabs', (req, res) => {
    if (!getProject(db, req.params.id)) {
      return res.status(404).json({ error: 'project not found' });
    }
    res.json(listTabs(db, req.params.id));
  });

  app.put('/api/projects/:id/tabs', (req, res) => {
    if (!getProject(db, req.params.id)) {
      return res.status(404).json({ error: 'project not found' });
    }
    const { tabs = [], active = null } = req.body || {};
    if (!Array.isArray(tabs) || !tabs.every((t) => typeof t === 'string')) {
      return res.status(400).json({ error: 'tabs must be string[]' });
    }
    const result = setTabs(
      db,
      req.params.id,
      tabs,
      typeof active === 'string' ? active : null,
    );
    res.json(result);
  });

  // ---- Templates ----------------------------------------------------------
  // User-saved snapshots of a project's HTML files. Surfaced in the
  // "From template" tab of the new-project panel so a user can spin up
  // a fresh project pre-seeded with another project's design as a
  // starting point. Created via the project's Share menu (snapshots
  // every .html file in the project folder at the moment of save).

  app.get('/api/templates', (_req, res) => {
    res.json({ templates: listTemplates(db) });
  });

  app.get('/api/templates/:id', (req, res) => {
    const t = getTemplate(db, req.params.id);
    if (!t) return res.status(404).json({ error: 'not found' });
    res.json({ template: t });
  });

  app.post('/api/templates', async (req, res) => {
    try {
      const { name, description, sourceProjectId } = req.body || {};
      if (typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'name required' });
      }
      if (typeof sourceProjectId !== 'string') {
        return res.status(400).json({ error: 'sourceProjectId required' });
      }
      const sourceProject = getProject(db, sourceProjectId);
      if (!sourceProject) {
        return res.status(404).json({ error: 'source project not found' });
      }
      // Snapshot every HTML / sketch / text file in the source project.
      // We deliberately skip binary uploads — templates are about the
      // generated design, not the user's reference imagery.
      const files = await listFiles(PROJECTS_DIR, sourceProjectId, {
        metadata: sourceProject.metadata,
      });
      const snapshot = [];
      for (const f of files) {
        if (f.kind !== 'html' && f.kind !== 'text' && f.kind !== 'code')
          continue;
        const entry = await readProjectFile(
          PROJECTS_DIR,
          sourceProjectId,
          f.name,
          sourceProject.metadata,
        );
        if (entry && Buffer.isBuffer(entry.buffer)) {
          snapshot.push({
            name: f.name,
            content: entry.buffer.toString('utf8'),
          });
        }
      }
      const t = insertTemplate(db, {
        id: randomId(),
        name: name.trim(),
        description: typeof description === 'string' ? description : null,
        sourceProjectId,
        files: snapshot,
        createdAt: Date.now(),
      });
      res.json({ template: t });
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  app.delete('/api/templates/:id', (req, res) => {
    deleteTemplate(db, req.params.id);
    res.json({ ok: true });
  });

  app.get('/api/agents', async (_req, res) => {
    try {
      const config = await readAppConfig(RUNTIME_DATA_DIR);
      const list = await detectAgents(config.agentCliEnv ?? {});
      res.json({ agents: list });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.get('/api/skills', async (_req, res) => {
    try {
      const skills = await listSkills(SKILLS_DIR);
      // Strip full body + on-disk dir from the listing — frontend fetches the
      // body via /api/skills/:id when needed (keeps the listing payload small).
      res.json({
        skills: skills.map(({ body, dir: _dir, ...rest }) => ({
          ...rest,
          hasBody: typeof body === 'string' && body.length > 0,
        })),
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.get('/api/skills/:id', async (req, res) => {
    try {
      const skills = await listSkills(SKILLS_DIR);
      const skill = findSkillById(skills, req.params.id);
      if (!skill) return res.status(404).json({ error: 'skill not found' });
      const { dir: _dir, ...serializable } = skill;
      res.json(serializable);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Codex hatch-pet registry — pets packaged by the upstream `hatch-pet`
  // skill under `${CODEX_HOME:-$HOME/.codex}/pets/`. Surfaced so the web
  // pet settings can offer one-click adoption of recently-hatched pets.
  app.get('/api/codex-pets', async (_req, res) => {
    try {
      const result = await listCodexPets({
        baseUrl: '',
        bundledRoot: BUNDLED_PETS_DIR,
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // One-click community sync. Hits the Codex Pet Share + j20 Hatchery
  // catalogs and drops every pet into `${CODEX_HOME:-$HOME/.codex}/pets/`
  // so `GET /api/codex-pets` (and the web Pet settings) pick them up
  // immediately. The body is intentionally tiny — we keep the heavier
  // tuning knobs (`--limit`, `--concurrency`) on the CLI script and
  // only surface `force` + `source` here.
  app.post('/api/codex-pets/sync', async (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const sourceRaw = typeof body.source === 'string' ? body.source : 'all';
      const source =
        sourceRaw === 'petshare' || sourceRaw === 'hatchery'
          ? sourceRaw
          : 'all';
      const result = await syncCommunityPets({
        source,
        force: Boolean(body.force),
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: String((err && err.message) || err) });
    }
  });

  app.get('/api/codex-pets/:id/spritesheet', async (req, res) => {
    try {
      const sheet = await readCodexPetSpritesheet(req.params.id, {
        bundledRoot: BUNDLED_PETS_DIR,
      });
      if (!sheet) {
        return res
          .status(404)
          .type('text/plain')
          .send('codex pet spritesheet not found');
      }
      const mime =
        sheet.ext === 'webp'
          ? 'image/webp'
          : sheet.ext === 'gif'
            ? 'image/gif'
            : 'image/png';
      res.type(mime);
      // Same-origin callers (the web app proxies `/api/*` through to
      // the daemon, so PetSettings adoption fetches arrive same-origin)
      // do not need any CORS header here. We only echo
      // `Access-Control-Allow-Origin` for sandboxed iframes / data:
      // URIs (Origin: null) which need it to draw the bytes onto a
      // canvas without tainting. Local pet bytes should not be exposed
      // to arbitrary third-party origins via a wildcard ACAO.
      if (req.headers.origin === 'null') {
        res.setHeader('Access-Control-Allow-Origin', 'null');
      }
      res.setHeader('Cache-Control', 'no-store');
      res.sendFile(sheet.absPath);
    } catch (err) {
      res.status(500).type('text/plain').send(String(err));
    }
  });

  app.get('/api/design-systems', async (_req, res) => {
    try {
      const systems = await listDesignSystems(DESIGN_SYSTEMS_DIR);
      res.json({
        designSystems: systems.map(({ body, ...rest }) => rest),
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.get('/api/design-systems/:id', async (req, res) => {
    try {
      const body = await readDesignSystem(DESIGN_SYSTEMS_DIR, req.params.id);
      if (body === null)
        return res.status(404).json({ error: 'design system not found' });
      res.json({ id: req.params.id, body });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Plugin-system HTTP surface. Spec §11.5. Phase 1 wires the minimum set
  // needed for the §12.5 walkthrough: list/get installed plugins, install
  // (SSE), uninstall, apply (returns ApplyResult + snapshotId), atom catalog,
  // and snapshot fetch by id (used by run replay tooling).
  app.get('/api/plugins', async (_req, res) => {
    try {
      const plugins = listInstalledPlugins(db);
      res.json({ plugins });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.get('/api/plugins/:id', async (req, res) => {
    try {
      const plugin = getInstalledPlugin(db, req.params.id);
      if (!plugin) return res.status(404).json({ error: 'plugin not found' });
      res.json(plugin);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  async function finishUploadedPluginInstall(stagedFolder, source) {
    const warnings = [];
    const log = [];
    let plugin = null;
    let message = 'Install finished.';
    try {
      const pluginRoot = await findUploadedPluginRoot(stagedFolder);
      for await (const ev of installFromLocalFolder(db, {
        source,
        roots: PLUGIN_REGISTRY_ROOTS,
        _stagedFolder: pluginRoot,
        _stagedSourceKind: 'user',
        lockfilePath: PLUGIN_LOCKFILE_PATH,
      })) {
        if (ev.message) log.push(ev.message);
        if (Array.isArray(ev.warnings)) warnings.splice(0, warnings.length, ...ev.warnings);
        if (ev.kind === 'success') {
          plugin = ev.plugin;
          message = `Installed ${ev.plugin.title}.`;
          break;
        }
        if (ev.kind === 'error') {
          message = ev.message;
          break;
        }
      }
      return { ok: Boolean(plugin), plugin, warnings, message, log };
    } finally {
      await fs.promises.rm(stagedFolder, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  async function findUploadedPluginRoot(stagedFolder) {
    if (await folderLooksLikePlugin(stagedFolder)) return stagedFolder;
    const entries = await fs.promises.readdir(stagedFolder, { withFileTypes: true });
    const dirs = entries.filter((entry) => entry.isDirectory());
    const files = entries.filter((entry) => entry.isFile());
    if (files.length === 0 && dirs.length === 1) {
      const nested = path.join(stagedFolder, dirs[0].name);
      if (await folderLooksLikePlugin(nested)) return nested;
    }
    return stagedFolder;
  }

  async function folderLooksLikePlugin(folder) {
    const names = ['open-design.json', 'SKILL.md', path.join('.claude-plugin', 'plugin.json')];
    for (const name of names) {
      if (fs.existsSync(path.join(folder, name))) return true;
    }
    return false;
  }

  function safeUploadRelativePath(input) {
    const value = String(input || '').replace(/\\/g, '/');
    if (!value || value.includes('\0') || value.startsWith('/') || /^[A-Za-z]:\//.test(value)) {
      throw new Error('invalid upload path');
    }
    const parts = value.split('/').filter(Boolean);
    if (parts.length === 0 || parts.some((part) => part === '.' || part === '..')) {
      throw new Error(`unsafe upload path: ${value}`);
    }
    return parts.join(path.sep);
  }

  async function extractPluginZipToFolder(buffer, stagedFolder) {
    if (buffer.length > PLUGIN_UPLOAD_MAX_BYTES) {
      throw new Error('zip file too large');
    }
    const zip = await JSZip.loadAsync(buffer);
    let totalBytes = 0;
    const entries = Object.values(zip.files);
    if (entries.length === 0) throw new Error('zip contains no files');
    for (const entry of entries) {
      if (entry.dir) continue;
      const rel = safeUploadRelativePath(entry.name);
      const unixMode = typeof entry.unixPermissions === 'number' ? entry.unixPermissions : 0;
      if ((unixMode & 0o170000) === 0o120000) {
        throw new Error(`zip entry is a symbolic link: ${entry.name}`);
      }
      const content = await entry.async('nodebuffer');
      totalBytes += content.length;
      if (totalBytes > PLUGIN_UPLOAD_MAX_BYTES) {
        throw new Error('zip extracted size exceeds 50 MiB');
      }
      const dest = path.join(stagedFolder, rel);
      await fs.promises.mkdir(path.dirname(dest), { recursive: true });
      await fs.promises.writeFile(dest, content);
    }
  }

  app.post('/api/plugins/upload-zip', (req, res) => {
    pluginUpload.single('file')(req, res, async (err) => {
      if (err) return sendMulterError(res, err);
      try {
        const file = req.file;
        if (!file || !file.buffer) {
          return res.status(400).json({ error: 'file is required' });
        }
        const stagedFolder = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'od-plugin-zip-'));
        await extractPluginZipToFolder(file.buffer, stagedFolder);
        const result = await finishUploadedPluginInstall(
          stagedFolder,
          `upload:zip:${decodeMultipartFilename(file.originalname || 'plugin.zip')}`,
        );
        res.status(result.ok ? 200 : 400).json(result);
      } catch (uploadErr) {
        res.status(400).json({
          ok: false,
          warnings: [],
          message: String(uploadErr?.message || uploadErr),
          log: [],
        });
      }
    });
  });

  app.post('/api/plugins/upload-folder', (req, res) => {
    pluginUpload.array('files', 500)(req, res, async (err) => {
      if (err) return sendMulterError(res, err);
      const stagedFolder = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'od-plugin-folder-'));
      try {
        const files = Array.isArray(req.files) ? req.files : [];
        if (files.length === 0) {
          await fs.promises.rm(stagedFolder, { recursive: true, force: true }).catch(() => undefined);
          return res.status(400).json({ error: 'files are required' });
        }
        const rawPaths = req.body?.paths;
        const paths = Array.isArray(rawPaths) ? rawPaths : rawPaths ? [rawPaths] : [];
        let totalBytes = 0;
        for (let i = 0; i < files.length; i += 1) {
          const file = files[i];
          totalBytes += file.buffer.length;
          if (totalBytes > PLUGIN_UPLOAD_MAX_BYTES) {
            throw new Error('folder upload exceeds 50 MiB');
          }
          const rel = safeUploadRelativePath(paths[i] || file.originalname);
          const dest = path.join(stagedFolder, rel);
          await fs.promises.mkdir(path.dirname(dest), { recursive: true });
          await fs.promises.writeFile(dest, file.buffer);
        }
        const result = await finishUploadedPluginInstall(stagedFolder, 'upload:folder');
        res.status(result.ok ? 200 : 400).json(result);
      } catch (uploadErr) {
        await fs.promises.rm(stagedFolder, { recursive: true, force: true }).catch(() => undefined);
        res.status(400).json({
          ok: false,
          warnings: [],
          message: String(uploadErr?.message || uploadErr),
          log: [],
        });
      }
    });
  });

  app.post('/api/plugins/install', async (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    let source = typeof body.source === 'string' ? body.source : '';
    let marketplaceResolution: {
      marketplaceId: string;
      marketplaceTrust: 'official' | 'trusted' | 'restricted';
      pluginName: string;
      pluginVersion: string;
      source: string;
      ref?: string;
      manifestDigest?: string;
      archiveIntegrity?: string;
    } | null = null;
    if (!source) {
      return res.status(400).json({ error: 'source is required' });
    }
    // Plan §3.A6: accept local folder, github:owner/repo[@ref][/subpath],
    // and https://*.tar.gz / *.tgz sources. Plan §3.F3: also accept a
    // bare plugin name and resolve it through the configured marketplaces.
    // Other shapes are 400 so the error surface is clear.
    const looksAbsolute = source.startsWith('/') || source.startsWith('./') || source.startsWith('~');
    const looksGithub = source.startsWith('github:');
    const looksHttps = /^https:\/\//i.test(source);
    if (!looksAbsolute && !looksGithub && !looksHttps) {
      // Treat the source as a plugin name and look it up in the
      // marketplace registry. Match resolution returns the canonical
      // source (github:… / https://…) so the installer can replay
      // the same byte path that would happen if the user copy-pasted
      // the source manually.
      const { resolvePluginInMarketplaces } = await import('./plugins/marketplaces.js');
      let lookupName = source;
      const lockfile = await readPluginLockfile(PLUGIN_LOCKFILE_PATH);
      const locked = lockfile.plugins[source];
      if (locked?.version && !source.includes('@')) {
        lookupName = `${source}@${locked.version}`;
      }
      const resolved = resolvePluginInMarketplaces(db, lookupName);
      if (!resolved) {
        return res.status(404).json({
          error: {
            code: 'plugin-not-found',
            message: `No marketplace plugin named "${source}". Add a marketplace via 'od marketplace add <url>' or pass a github: / https:// / local source.`,
            data: { name: source },
          },
        });
      }
      marketplaceResolution = resolved;
      source = resolved.source;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const writeEvent = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      for await (const ev of installPlugin(db, {
        source,
        roots: PLUGIN_REGISTRY_ROOTS,
        sourceMarketplaceId: marketplaceResolution?.marketplaceId,
        sourceMarketplaceEntryName: marketplaceResolution?.pluginName,
        sourceMarketplaceEntryVersion: marketplaceResolution?.pluginVersion,
        marketplaceTrust: marketplaceResolution?.marketplaceTrust,
        resolvedSource: marketplaceResolution?.source,
        resolvedRef: marketplaceResolution?.ref,
        manifestDigest: marketplaceResolution?.manifestDigest,
        archiveIntegrity: marketplaceResolution?.archiveIntegrity,
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
  });

  app.post('/api/plugins/:id/uninstall', async (req, res) => {
    try {
      const result = await uninstallPlugin(db, req.params.id, PLUGIN_REGISTRY_ROOTS);
      if (!result.ok && !result.removedFolder) {
        return res.status(404).json({ error: 'plugin not found', warning: result.warning });
      }
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Plan §3.Z2 — `od plugin upgrade <id>` re-installs a plugin from
  // its recorded source. Streams the same SSE shape as
  // POST /api/plugins/install so CLIs and the web composer reuse
  // the existing event handler.
  //
  // Rejected for source_kind='bundled': bundled plugins are
  // shipped with the daemon image and the bundled boot walker
  // re-registers them on every boot. Letting an operator
  // 'upgrade' a bundled plugin would silently overwrite the
  // daemon's authoritative copy and confuse the next boot.
  app.post('/api/plugins/:id/upgrade', async (req, res) => {
    const id = req.params.id;
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const policy = body.policy === 'pinned' ? 'pinned' : 'latest';
    const plugin = getInstalledPlugin(db, id);
    if (!plugin) {
      return res.status(404).json({
        error: { code: 'plugin-not-found', message: `No installed plugin with id "${id}".`, data: { id } },
      });
    }
    if (plugin.sourceKind === 'bundled') {
      return res.status(409).json({
        error: {
          code: 'bundled-plugin',
          message: `Plugin "${id}" was shipped bundled with the daemon and upgrades only via daemon-image upgrade. The bundled boot walker re-registers bundled plugins on every boot.`,
          data: { id, sourceKind: plugin.sourceKind },
        },
      });
    }
    let source = plugin.source;
    let marketplaceResolution: {
      marketplaceId: string;
      marketplaceTrust: 'official' | 'trusted' | 'restricted';
      pluginName: string;
      pluginVersion: string;
      source: string;
      ref?: string;
      manifestDigest?: string;
      archiveIntegrity?: string;
    } | null = null;
    if (policy === 'latest' && plugin.sourceMarketplaceEntryName) {
      const { resolvePluginInMarketplaces } = await import('./plugins/marketplaces.js');
      marketplaceResolution = resolvePluginInMarketplaces(db, plugin.sourceMarketplaceEntryName);
      if (marketplaceResolution) {
        source = marketplaceResolution.source;
      }
    }
    if (!source) {
      return res.status(409).json({
        error: {
          code: 'missing-source',
          message: `Plugin "${id}" has no recorded install source — cannot upgrade. Reinstall via 'od plugin install --source <...>' to set one.`,
          data: { id },
        },
      });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const writeEvent = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    writeEvent('progress', { kind: 'progress', phase: 'resolving', message: `Upgrading ${id} from ${source} (policy=${policy})` });

    try {
      for await (const ev of installPlugin(db, {
        source,
        roots: PLUGIN_REGISTRY_ROOTS,
        eventKind: 'upgraded',
        sourceMarketplaceId: marketplaceResolution?.marketplaceId ?? plugin.sourceMarketplaceId,
        sourceMarketplaceEntryName: marketplaceResolution?.pluginName ?? plugin.sourceMarketplaceEntryName,
        sourceMarketplaceEntryVersion: marketplaceResolution?.pluginVersion ?? plugin.sourceMarketplaceEntryVersion,
        marketplaceTrust: marketplaceResolution?.marketplaceTrust ?? plugin.marketplaceTrust,
        resolvedSource: marketplaceResolution?.source ?? plugin.resolvedSource,
        resolvedRef: marketplaceResolution?.ref ?? plugin.resolvedRef,
        manifestDigest: marketplaceResolution?.manifestDigest ?? plugin.manifestDigest,
        archiveIntegrity: marketplaceResolution?.archiveIntegrity ?? plugin.archiveIntegrity,
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
  });

  // Plan §3.A1: shared helper used by every endpoint that has to resolve
  // plugin context against the live registry. Skills + design systems are
  // walked from disk; craft is empty in v1; atoms come from the
  // first-party catalog. Project-scoped overrides arrive in Phase 4.
  async function loadPluginRegistryView() {
    const [skills, designSystems] = await Promise.all([
      listSkills(SKILLS_DIR),
      listDesignSystems(DESIGN_SYSTEMS_DIR),
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

  app.post('/api/plugins/:id/apply', async (req, res) => {
    try {
      const plugin = getInstalledPlugin(db, req.params.id);
      if (!plugin) return res.status(404).json({ error: 'plugin not found' });
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const inputs = body.inputs && typeof body.inputs === 'object' ? body.inputs : {};
      const grantCaps = Array.isArray(body.grantCaps)
        ? body.grantCaps.filter((c) => typeof c === 'string')
        : [];
      const locale = typeof body.locale === 'string' ? body.locale : undefined;

      const registry = await loadPluginRegistryView();
      const computed = applyPlugin({ plugin, inputs, registry, locale });
      // Plan §3.B2 — apply-time grants are merged into the snapshot's
      // capabilitiesGranted so the §9 capability gate sees them, but
      // they are NOT written back to installed_plugins.capabilities_granted.
      // The snapshot is the only place this ephemeral grant lives.
      if (grantCaps.length > 0) {
        const merged = new Set([...computed.result.capabilitiesGranted, ...grantCaps]);
        computed.result.capabilitiesGranted = Array.from(merged);
        computed.result.appliedPlugin.capabilitiesGranted = Array.from(merged);
      }
      res.json({ ok: true, ...computed.result, warnings: computed.warnings, manifestSourceDigest: computed.manifestSourceDigest });
    } catch (err) {
      if (err instanceof MissingInputError) {
        return res.status(422).json({ error: 'missing_inputs', fields: err.fields });
      }
      res.status(500).json({ error: String(err) });
    }
  });

  app.post('/api/plugins/:id/share-project', async (req, res) => {
    try {
      const sourcePlugin = getInstalledPlugin(db, req.params.id);
      if (!sourcePlugin) {
        sendApiError(res, 404, 'NOT_FOUND', 'plugin not found');
        return;
      }
      if (!USER_PLUGIN_SOURCE_KINDS.has(sourcePlugin.sourceKind)) {
        res.status(409).json({
          ok: false,
          code: 'plugin-not-shareable',
          message: 'Only user-installed plugins can start a share project.',
        });
        return;
      }

      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const action = normalizePluginShareAction(body.action);
      if (!action) {
        sendApiError(res, 400, 'BAD_REQUEST', 'action must be publish-github or contribute-open-design');
        return;
      }
      const actionPluginId = PLUGIN_SHARE_ACTION_PLUGIN_IDS[action];
      const actionPlugin = getInstalledPlugin(db, actionPluginId);
      if (!actionPlugin) {
        res.status(409).json({
          ok: false,
          code: 'share-action-plugin-missing',
          message: `The bundled action plugin "${actionPluginId}" is not installed. Restart the daemon so bundled plugins are registered.`,
        });
        return;
      }

      const now = Date.now();
      const id = randomId();
      const cid = randomId();
      const sourceSlug = githubRepoNameFromPluginName(sourcePlugin.id);
      const stagedPath = `plugin-source/${sourceSlug}`;
      const prompt = renderPluginSharePrompt({ action, sourcePlugin, stagedPath });
      const metadata = { kind: 'prototype' };
      const projectRoot = await ensureProject(PROJECTS_DIR, id, metadata);
      await copyPluginFolderForProjectContext(
        sourcePlugin.fsPath,
        path.join(projectRoot, 'plugin-source', sourceSlug),
      );

      insertProject(db, {
        id,
        name: `${PLUGIN_SHARE_ACTION_LABELS[action]}: ${sourcePlugin.title || sourcePlugin.id}`,
        skillId: null,
        designSystemId: null,
        pendingPrompt: prompt,
        metadata,
        createdAt: now,
        updatedAt: now,
      });
      insertConversation(db, {
        id: cid,
        projectId: id,
        title: null,
        createdAt: now,
        updatedAt: now,
      });

      const registry = await loadPluginRegistryView();
      const resolved = resolvePluginSnapshot({
        db,
        body: {
          pluginId: actionPluginId,
          pluginInputs: {
            source_plugin_id: sourcePlugin.id,
            source_plugin_title: sourcePlugin.title || sourcePlugin.id,
            source_plugin_version: sourcePlugin.version,
            source_plugin_path: sourcePlugin.fsPath,
            plugin_context_path: stagedPath,
          },
          locale: typeof body.locale === 'string' ? body.locale : undefined,
        },
        projectId: id,
        conversationId: cid,
        registry,
      });
      if (resolved && !resolved.ok) {
        res.status(resolved.status).json(resolved.body);
        return;
      }

      const project = getProject(db, id);
      if (!project) {
        sendApiError(res, 500, 'INTERNAL_ERROR', 'created project could not be loaded');
        return;
      }
      res.json({
        ok: true,
        project,
        conversationId: cid,
        ...(resolved?.ok ? { appliedPluginSnapshotId: resolved.snapshotId } : {}),
        actionPluginId,
        sourcePluginId: sourcePlugin.id,
        stagedPath,
        prompt,
        message: `Created a ${PLUGIN_SHARE_ACTION_LABELS[action]} task for ${sourcePlugin.title || sourcePlugin.id}.`,
      });
    } catch (err) {
      res.status(400).json({ ok: false, message: String(err?.message || err) });
    }
  });

  app.post('/api/plugins/:id/doctor', async (req, res) => {
    try {
      const plugin = getInstalledPlugin(db, req.params.id);
      if (!plugin) return res.status(404).json({ error: 'plugin not found' });
      const registry = await loadPluginRegistryView();
      const report = doctorPlugin(plugin, registry);
      res.json(report);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Plan §3.A2 / spec §9.1: persistent capability grant. Body is
  // `{ capabilities: string[], action?: 'grant' | 'revoke' }`. The daemon
  // validates each entry against the §5.3 vocabulary; unknown / malformed
  // strings come back as 400 with the offending list so the CLI can
  // render exit-code-2 usage advice. The mutation goes through
  // `grantCapabilities` / `revokeCapabilities` (the only writers of
  // `installed_plugins.capabilities_granted` outside of install).
  app.post('/api/plugins/:id/trust', async (req, res) => {
    try {
      const plugin = getInstalledPlugin(db, req.params.id);
      if (!plugin) return res.status(404).json({ error: 'plugin not found' });
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const action = body.action === 'revoke' ? 'revoke' : 'grant';
      const { validateCapabilityList, grantCapabilities, revokeCapabilities } =
        await import('./plugins/trust.js');
      const { accepted, rejected } = validateCapabilityList(body.capabilities);
      if (rejected.length > 0) {
        return res.status(400).json({
          error: {
            code: 'invalid-capability',
            message: `Capability validation failed: ${rejected.map((r) => r.capability).join(', ')}`,
            data: { rejected },
          },
        });
      }
      if (accepted.length === 0) {
        return res.status(400).json({
          error: {
            code: 'no-capabilities',
            message: 'capabilities[] is required and must contain at least one entry',
          },
        });
      }
      const next = action === 'revoke'
        ? revokeCapabilities({ db, pluginId: req.params.id, capabilities: accepted })
        : grantCapabilities({ db, pluginId: req.params.id, capabilities: accepted });
      const updated = getInstalledPlugin(db, req.params.id);
      // Plan §3.JJ1 — emit a 'plugin.trust-changed' event so the
      // ops live-tail surfaces capability mutations for security
      // audit. Best-effort.
      try {
        const { recordPluginEvent } = await import('./plugins/events.js');
        recordPluginEvent({
          kind:     'plugin.trust-changed',
          pluginId: req.params.id,
          details:  { action, capabilities: accepted, total: next.length },
        });
      } catch {
        // ignore — event recording never blocks the trust mutation.
      }
      res.status(action === 'grant' ? 201 : 200).json({
        ok: true,
        id: req.params.id,
        action,
        capabilitiesGranted: next,
        plugin: updated,
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.get('/api/atoms', (_req, res) => {
    res.json({ atoms: FIRST_PARTY_ATOMS.map((a) => ({ ...a, taskKinds: a.taskKinds.slice() })) });
  });

  // Plan §3.AA2 — `od atoms info <id>`. Returns the catalog row +
  // the bundled SKILL.md body (when one exists at
  // plugins/_official/atoms/<id>/SKILL.md) so the caller can render
  // a single page describing what the atom does + the prompt
  // fragment that drives it.
  app.get('/api/atoms/:id', async (req, res) => {
    const id = req.params.id;
    const atom = FIRST_PARTY_ATOMS.find((a) => a.id === id);
    if (!atom) return res.status(404).json({ error: { code: 'atom-not-found', message: `Unknown atom "${id}"` } });
    const body: Record<string, unknown> = {
      ...atom,
      taskKinds: atom.taskKinds.slice(),
    };
    try {
      const { loadAtomBodies } = await import('./plugins/atom-bodies.js');
      const bodies = await loadAtomBodies(db, [id]);
      if (bodies[0] && typeof bodies[0].body === 'string') {
        body.skillBody = bodies[0].body;
      }
    } catch (err) {
      // Best-effort; atom info still useful without the body.
      console.warn(`[atoms] failed to load SKILL.md body for ${id}:`, err);
    }
    res.json(body);
  });

  // Plan §3.L3 / spec §10.3.5 / §9.2 — plugin asset endpoint.
  //
  // Serves a static file from inside an installed plugin's fsPath,
  // sandboxed by:
  //   - whitelisted plugin ids (the registry row),
  //   - normalized relpath (no '..' / absolute / leading drive),
  //   - the §9.2 preview CSP (default-src 'none'; script-src 'self'
  //     'unsafe-inline'; connect-src 'none'; frame-ancestors 'self'),
  //   - X-Content-Type-Options: nosniff so the browser respects the
  //     declared content type even on miss.
  // The web GenUISurfaceRenderer's SandboxedComponentSurface points
  // its iframe at this URL.
  // Helper for the /preview + /example/:name routes below. Walks a
  // list of candidate relpaths inside the plugin folder, picks the
  // first one that exists + stays inside the fsPath, and serves it
  // with the §9.2 sandboxed-iframe CSP (same shape as `/asset/*`).
  // Pulled out so /preview and /example/:name share a single source
  // of truth for the security envelope.
  async function servePluginSandboxedHtml(
    req: any,
    res: any,
    pickCandidates: (plugin: any) => Promise<string[]> | string[],
  ): Promise<void> {
    try {
      const plugin = getInstalledPlugin(db, req.params.id);
      if (!plugin) {
        res.status(404).json({ error: 'plugin not found' });
        return;
      }
      const candidates = (await pickCandidates(plugin)).filter(
        (p): p is string => typeof p === 'string' && p.length > 0,
      );
      const path = await import('node:path');
      const fsp = await import('node:fs/promises');
      const root = path.resolve(plugin.fsPath) + path.sep;
      let resolved: string | null = null;
      let resolvedRel: string | null = null;
      for (const rel of candidates) {
        if (rel.includes('..') || rel.startsWith('/') || rel.includes('\0')) continue;
        const full = path.resolve(plugin.fsPath, rel);
        if (!(full + path.sep).startsWith(root) && full !== path.resolve(plugin.fsPath)) continue;
        try {
          const st = await fsp.stat(full);
          // Refuse symlinks — the install root may be writable so a
          // symlink leak would defeat the containment check above.
          const lst = await fsp.lstat(full);
          if (lst.isSymbolicLink()) continue;
          if (!st.isFile()) continue;
          // 5 MiB cap — preview HTML is human-authored; refuse anything
          // resembling a binary blob smuggled through this surface.
          if (st.size > 5 * 1024 * 1024) {
            res.status(413).json({ error: 'preview asset too large' });
            return;
          }
          resolved = full;
          resolvedRel = rel;
          break;
        } catch {
          // try next candidate
        }
      }
      if (!resolved) {
        res.status(404).json({ error: 'preview not found' });
        return;
      }
      let contentPath = resolved;
      let buf = await fsp.readFile(resolved);
      if (resolvedRel && /(^|\/)example-slides\.html$/i.test(resolvedRel)) {
        const templateRel = resolvedRel.replace(
          /(^|\/)example-slides\.html$/i,
          '$1template.html',
        );
        const templateFull = path.resolve(plugin.fsPath, templateRel);
        const templateInside =
          (templateFull + path.sep).startsWith(root) ||
          templateFull === path.resolve(plugin.fsPath);
        if (templateInside) {
          try {
            const st = await fsp.stat(templateFull);
            const lst = await fsp.lstat(templateFull);
            if (!lst.isSymbolicLink() && st.isFile() && st.size <= 5 * 1024 * 1024) {
              const title =
                typeof plugin.title === 'string'
                  ? plugin.title
                  : typeof plugin.manifest?.title === 'string'
                    ? plugin.manifest.title
                    : req.params.id;
              const tplHtml = await fsp.readFile(templateFull, 'utf8');
              const slidesHtml = buf.toString('utf8');
              buf = Buffer.from(assembleExample(tplHtml, slidesHtml, title), 'utf8');
              contentPath = templateFull;
            }
          } catch {
            // Keep the raw fallback if the companion template is missing.
          }
        }
      }
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'none'; img-src 'self' data: blob:; media-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'none'; frame-ancestors 'self'",
      );
      res.setHeader('X-Content-Type-Options', 'nosniff');
      const ext = path.extname(contentPath).toLowerCase();
      const ct =
        ext === '.html' ? 'text/html; charset=utf-8'
        : ext === '.js'  ? 'application/javascript; charset=utf-8'
        : ext === '.css' ? 'text/css; charset=utf-8'
        : ext === '.json' ? 'application/json; charset=utf-8'
        : ext === '.svg' ? 'image/svg+xml'
        : ext === '.png' ? 'image/png'
        : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
        : 'application/octet-stream';
      res.setHeader('Content-Type', ct);
      res.send(buf);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  }

  // Plan §6 Phase 2B + spec §11.6 / §9.2 — plugin preview + examples.
  //
  // Two flavours wrap the same sandboxed-HTML envelope as `/asset/*`:
  //   - `/preview` serves the plugin's preview entry (declared via
  //     `od.preview.entry`, with fallbacks that walk the plugin's
  //     own context.assets[] HTMLs, examples/*.html and assets/*.html).
  //   - `/example/:name` serves an entry from `od.useCase.exampleOutputs[]`,
  //     matched by basename or by index. Both reuse the same
  //     traversal / containment guards as the asset route.
  //
  // The marketplace detail page (PluginDetailView) embeds /preview
  // inside an `<iframe sandbox="allow-scripts">`. The §9.2 CSP keeps
  // the preview from reaching back into /api/* even if its scripts
  // try to fetch.
  //
  // Some bundled plugins (`example-guizang-ppt`, `example-html-ppt`,
  // …) declare `od.preview.entry: "./index.html"` but actually ship
  // the renderable HTML under `assets/example-slides.html` or
  // `assets/template.html`. Returning 404 in that case lit up white
  // tiles in the home gallery, so the candidates list always extends
  // past the declared entry to walk a curated fallback chain.
  //
  // `assets/example-slides.html` is a special case: for guizang-ppt it
  // is intentionally only the slide fragment. The old skill preview
  // assembled it into `assets/template.html` at request time; the plugin
  // route mirrors that so the marketplace card keeps the WebGL/e-ink
  // magazine treatment instead of rendering unstyled fragments.
  function collectPluginPreviewCandidates(plugin: unknown): string[] {
    const candidates: string[] = [];
    const seen = new Set<string>();
    function push(rel: unknown): void {
      if (typeof rel !== 'string') return;
      const trimmed = rel.replace(/^\.\//, '');
      if (!trimmed || seen.has(trimmed)) return;
      seen.add(trimmed);
      candidates.push(trimmed);
    }

    const manifest =
      ((plugin as { manifest?: unknown }).manifest ?? {}) as Record<string, unknown>;
    const od = (manifest.od ?? {}) as Record<string, unknown>;
    const preview = (od.preview ?? {}) as Record<string, unknown>;

    push(preview.entry);

    const ctx = (od.context ?? {}) as Record<string, unknown>;
    const assets = Array.isArray(ctx.assets) ? ctx.assets : [];
    for (const a of assets) {
      const rel = typeof a === 'string' ? a : null;
      if (rel && /\.html?$/i.test(rel)) push(rel);
    }

    const useCase = (od.useCase ?? {}) as Record<string, unknown>;
    const exampleOutputs = Array.isArray(useCase.exampleOutputs)
      ? useCase.exampleOutputs
      : [];
    for (const ex of exampleOutputs) {
      const p = (ex as { path?: unknown })?.path;
      if (typeof p === 'string' && /\.html?$/i.test(p)) push(p);
    }

    push('preview/index.html');
    push('index.html');
    push('examples/index.html');
    push('assets/index.html');
    push('assets/preview.html');
    push('assets/example.html');
    push('assets/example-slides.html');
    push('assets/template.html');
    push('public/index.html');
    push('dist/index.html');
    return candidates;
  }

  // Last-resort discovery for plugins whose bundle ships HTML but
  // doesn't match any of the conventional paths. We scan the plugin
  // root and a handful of common subfolders (assets/, public/, dist/,
  // examples/, preview/, templates/) for any `*.html` and surface
  // the first one. The scan is shallow to avoid pathological large
  // bundles, and the same containment guard inside
  // servePluginSandboxedHtml validates each candidate before reading.
  async function discoverPluginHtmlAssets(pluginFsPath: string): Promise<string[]> {
    const path = await import('node:path');
    const fsp = await import('node:fs/promises');
    const dirs = ['', 'assets', 'public', 'dist', 'examples', 'preview', 'templates'];
    const found: string[] = [];
    for (const dir of dirs) {
      const abs = path.resolve(pluginFsPath, dir);
      try {
        const entries = await fsp.readdir(abs, { withFileTypes: true });
        for (const ent of entries) {
          if (!ent.isFile()) continue;
          if (!/\.html?$/i.test(ent.name)) continue;
          found.push(dir ? `${dir}/${ent.name}` : ent.name);
        }
      } catch {
        // dir missing — skip
      }
    }
    return found;
  }

  app.get('/api/plugins/:id/preview', async (req, res) => {
    await servePluginSandboxedHtml(req, res, async (plugin) => {
      const curated = collectPluginPreviewCandidates(plugin);
      const fsPath = (plugin as { fsPath?: unknown }).fsPath;
      if (typeof fsPath !== 'string') return curated;
      const discovered = await discoverPluginHtmlAssets(fsPath);
      const seen = new Set(curated);
      for (const rel of discovered) {
        if (!seen.has(rel)) curated.push(rel);
      }
      return curated;
    });
  });

  app.get('/api/plugins/:id/example/:name', async (req, res) => {
    const name = String(req.params.name ?? '');
    if (!name || /[\\/\0]|\.\./.test(name)) {
      return res.status(400).json({ error: 'invalid example name' });
    }
    await servePluginSandboxedHtml(req, res, async (plugin) => {
      const examples = ((plugin as { manifest?: { od?: { useCase?: { exampleOutputs?: Array<{ path?: unknown; title?: unknown }> } } } })
        .manifest?.od?.useCase?.exampleOutputs ?? []) as Array<{ path?: unknown; title?: unknown }>;
      const match = examples.find((e) => {
        if (!e || typeof e.path !== 'string') return false;
        const segments = e.path.split(/[\\/]/).filter(Boolean);
        const base = segments[segments.length - 1] ?? '';
        const baseStem = base.replace(/\.[^.]+$/, '');
        // For `examples/<folder>/index.html` the conceptual "name"
        // is the folder, not the inner basename.
        const parent = segments.length >= 2 ? segments[segments.length - 2] : null;
        const candidates = [base, baseStem, parent].filter((s): s is string => !!s);
        if (typeof e.title === 'string') candidates.push(e.title);
        return candidates.includes(name);
      });
      if (match && typeof match.path === 'string') return [match.path];
      // Allow `examples/<name>/index.html` and `examples/<name>.html`
      // so plugin authors can ship example folders without enumerating
      // them in the manifest.
      return [
        `examples/${name}/index.html`,
        `examples/${name}.html`,
      ];
    });
  });

  app.get('/api/plugins/:id/asset/*', async (req, res) => {
    try {
      const plugin = getInstalledPlugin(db, req.params.id);
      if (!plugin) return res.status(404).json({ error: 'plugin not found' });
      const relpath = String(req.params[0] ?? '');
      // Reject obvious traversal up-front; the path resolution below
      // normalizes again, but this catches the easy cases without
      // touching disk.
      if (!relpath || relpath.includes('..') || relpath.startsWith('/') || relpath.includes('\0')) {
        return res.status(400).json({ error: 'invalid asset path' });
      }
      const path = await import('node:path');
      const fsp = await import('node:fs/promises');
      const resolved = path.resolve(plugin.fsPath, relpath);
      // Final containment check — `resolved` must stay under fsPath.
      const root = path.resolve(plugin.fsPath) + path.sep;
      if (!(resolved + path.sep).startsWith(root) && resolved !== path.resolve(plugin.fsPath)) {
        return res.status(400).json({ error: 'asset escape rejected' });
      }
      let buf;
      try {
        buf = await fsp.readFile(resolved);
      } catch {
        return res.status(404).json({ error: 'asset not found' });
      }
      // §9.2 preview CSP — sandboxed iframes get only inline script + style;
      // no network, no external resources, no document-level forms.
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'none'; img-src 'self' data: blob:; media-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'none'; frame-ancestors 'self'",
      );
      res.setHeader('X-Content-Type-Options', 'nosniff');
      const ext = path.extname(resolved).toLowerCase();
      const ct =
        ext === '.html' ? 'text/html; charset=utf-8'
        : ext === '.js'  ? 'application/javascript; charset=utf-8'
        : ext === '.css' ? 'text/css; charset=utf-8'
        : ext === '.json' ? 'application/json; charset=utf-8'
        : ext === '.svg' ? 'image/svg+xml'
        : ext === '.png' ? 'image/png'
        : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
        : 'application/octet-stream';
      res.setHeader('Content-Type', ct);
      res.send(buf);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Plan §3.H2 / spec §12.2 — craft list endpoint.
  // Mirrors the daemon's existing /api/skills + /api/design-systems
  // discovery surface so `od craft list` is a thin wrapper over a
  // single HTTP call. Each entry returns a slug + size + first
  // markdown header so a code agent can browse without a separate
  // /api/craft/:id read.
  app.get('/api/craft', async (_req, res) => {
    try {
      const fsp = await import('node:fs/promises');
      let entries;
      try {
        entries = await fsp.readdir(CRAFT_DIR, { withFileTypes: true });
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          return res.json({ craft: [] });
        }
        throw err;
      }
      const out = [];
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
        const slug = entry.name.replace(/\.md$/, '');
        try {
          const fullPath = `${CRAFT_DIR}/${entry.name}`;
          const text = await fsp.readFile(fullPath, 'utf8');
          const heading = text.split('\n').find((line) => line.startsWith('# '));
          out.push({
            id:     slug,
            label:  heading ? heading.replace(/^#+\s*/, '').trim() : slug,
            bytes:  Buffer.byteLength(text, 'utf8'),
          });
        } catch {
          // Skip unreadable files; surface what we can.
        }
      }
      res.json({ craft: out });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.get('/api/craft/:id', async (req, res) => {
    try {
      const slug = req.params.id;
      if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
        return res.status(400).json({ error: 'invalid craft id' });
      }
      const fsp = await import('node:fs/promises');
      try {
        const text = await fsp.readFile(`${CRAFT_DIR}/${slug}.md`, 'utf8');
        res.json({ id: slug, body: text });
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          return res.status(404).json({ error: 'craft section not found' });
        }
        throw err;
      }
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.get('/api/applied-plugins/:snapshotId', (req, res) => {
    try {
      const snap = getSnapshot(db, req.params.snapshotId);
      if (!snap) return res.status(404).json({ error: 'snapshot not found' });
      res.json(snap);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Plan §3.DD1 — `od plugin stats`. Aggregates the installed-
  // plugin roster + the applied_plugin_snapshots roster into one
  // health/inventory report. Pure helpers in plugins/stats.ts;
  // the route wires the SQLite reads + merges on the way out.
  app.get('/api/plugins/stats', async (_req, res) => {
    try {
      const { pluginInventoryStats, snapshotInventoryStats } = await import('./plugins/stats.js');
      const installed = listInstalledPlugins(db);
      const inventoryRows = db.prepare(
        `SELECT status, project_id, run_id, applied_at FROM applied_plugin_snapshots`,
      ).all() as Array<{ status: 'fresh' | 'stale'; project_id: string | null; run_id: string | null; applied_at: number }>;
      res.json({
        plugins:   pluginInventoryStats(installed),
        snapshots: snapshotInventoryStats(inventoryRows),
        generatedAt: Date.now(),
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Plan §3.CC1 — `od plugin canon <snapshotId>`. Returns the
  // canonical `## Active plugin` block the agent will see when
  // this snapshot is spliced into the system prompt. Powered by
  // the same renderPluginBlock() composeSystemPrompt() uses, so
  // the CLI output is byte-equal to what the agent reads.
  //
  // Two response modes:
  //   - default            : { snapshotId, pluginId, block }
  //   - Accept: text/plain : raw block body for shell pipes
  app.get('/api/applied-plugins/:snapshotId/canon', (req, res) => {
    try {
      const snap = getSnapshot(db, req.params.snapshotId);
      if (!snap) return res.status(404).json({ error: 'snapshot not found' });
      const block = pluginPromptBlock(snap);
      const accepts = String(req.headers['accept'] ?? '').toLowerCase();
      if (accepts.includes('text/plain')) {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.send(block);
        return;
      }
      res.json({ snapshotId: snap.snapshotId, pluginId: snap.pluginId, block });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Plan §3.B4 / spec §6: marketplace registry minimum verbs.
  // Phase 3 layers in `od plugin install <name>` resolution + the trust
  // UI on top; this route set is the storage half.
  app.get('/api/marketplaces', async (_req, res) => {
    try {
      const { listMarketplaces } = await import('./plugins/marketplaces.js');
      res.json({ marketplaces: listMarketplaces(db) });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.post('/api/marketplaces', async (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const url = typeof body.url === 'string' ? body.url : '';
      if (!url) return res.status(400).json({ error: 'url is required' });
      const trust = body.trust === 'trusted' || body.trust === 'official' ? body.trust : 'restricted';
      const { addMarketplace } = await import('./plugins/marketplaces.js');
      const result = await addMarketplace(db, {
        url,
        trust,
        fetcher: createMarketplaceFetcher(
          marketplaceRegistryIdFromUrl(url),
          bundledMarketplaceEntries,
        ),
      });
      if (!result.ok) {
        return res.status(result.status).json({
          error: { code: 'marketplace-add-failed', message: result.message, data: { errors: result.errors ?? [] } },
        });
      }
      res.status(201).json(result.row);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.get('/api/marketplaces/:id', async (req, res) => {
    try {
      const { getMarketplace } = await import('./plugins/marketplaces.js');
      const row = getMarketplace(db, req.params.id);
      if (!row) return res.status(404).json({ error: 'marketplace not found' });
      res.json(row);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.delete('/api/marketplaces/:id', async (req, res) => {
    try {
      const { removeMarketplace } = await import('./plugins/marketplaces.js');
      const ok = removeMarketplace(db, req.params.id);
      if (!ok) return res.status(404).json({ error: 'marketplace not found' });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.post('/api/marketplaces/:id/refresh', async (req, res) => {
    try {
      const { getMarketplace, refreshMarketplace } = await import('./plugins/marketplaces.js');
      const row = getMarketplace(db, req.params.id);
      const seedId = row ? marketplaceRegistryIdFromUrl(row.url) ?? req.params.id : req.params.id;
      const result = await refreshMarketplace(
        db,
        req.params.id,
        createMarketplaceFetcher(seedId, bundledMarketplaceEntries),
      );
      if (!result.ok) {
        return res.status(result.status).json({
          error: { code: 'marketplace-refresh-failed', message: result.message, data: { errors: result.errors ?? [] } },
        });
      }
      // Plan §3.JJ1 — emit a 'plugin.marketplace-refreshed' event
      // so ops can audit catalog refreshes via the live tail.
      try {
        const { recordPluginEvent } = await import('./plugins/events.js');
        recordPluginEvent({
          kind:     'plugin.marketplace-refreshed',
          pluginId: '',
          details:  {
            marketplaceId: req.params.id,
            marketplaceVersion: result.row.version,
            specVersion: result.row.specVersion,
          },
        });
      } catch { /* best-effort */ }
      res.json(result.row);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.post('/api/marketplaces/:id/trust', async (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const trust = body.trust === 'trusted' || body.trust === 'restricted' || body.trust === 'official'
        ? body.trust
        : null;
      if (!trust) {
        return res.status(400).json({ error: 'trust must be one of: trusted, restricted, official' });
      }
      const { setMarketplaceTrust } = await import('./plugins/marketplaces.js');
      const row = setMarketplaceTrust(db, req.params.id, trust);
      if (!row) return res.status(404).json({ error: 'marketplace not found' });
      res.json(row);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.get('/api/marketplaces/:id/plugins', async (req, res) => {
    try {
      const { getMarketplace } = await import('./plugins/marketplaces.js');
      const row = getMarketplace(db, req.params.id);
      if (!row) return res.status(404).json({ error: 'marketplace not found' });
      res.json({ plugins: row.manifest.plugins ?? [] });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Plan §3.A5: list all applied snapshots; useful for `od plugin
  // snapshots list` and the audit dashboard.
  app.get('/api/applied-plugins', (_req, res) => {
    try {
      const rows = db
        .prepare(`SELECT id FROM applied_plugin_snapshots ORDER BY applied_at DESC LIMIT 500`)
        .all();
      res.json({
        snapshots: rows.map((r) => getSnapshot(db, (r).id)).filter((x) => x !== null),
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });
  app.get('/api/projects/:projectId/applied-plugins', (req, res) => {
    try {
      const rows = db
        .prepare(`SELECT id FROM applied_plugin_snapshots WHERE project_id = ? ORDER BY applied_at DESC`)
        .all(req.params.projectId);
      res.json({
        snapshots: rows.map((r) => getSnapshot(db, (r).id)).filter((x) => x !== null),
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Phase 4 / spec §14 — exporter route. Materialises a publish-ready
  // folder from the snapshot behind a given project (or an explicit
  // snapshot id). The daemon writes through `outDir` on the host
  // filesystem, so the CLI is the canonical caller; the route stays
  // local-loopback-only.
  app.post('/api/applied-plugins/export', requireLocalDaemonRequest, async (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const target = body.target === 'od' || body.target === 'claude-plugin' || body.target === 'agent-skill'
        ? body.target
        : null;
      if (!target) {
        return res.status(400).json({ error: 'target must be one of: od, claude-plugin, agent-skill' });
      }
      const outDir = typeof body.outDir === 'string' && body.outDir.length > 0
        ? body.outDir
        : null;
      if (!outDir) {
        return res.status(400).json({ error: 'outDir is required' });
      }
      const { exportPlugin, ExportError } = await import('./plugins/export.js');
      try {
        const result = await exportPlugin({
          db,
          target,
          outDir,
          ...(typeof body.snapshotId === 'string' ? { snapshotId: body.snapshotId } : {}),
          ...(typeof body.projectId  === 'string' ? { projectId:  body.projectId  } : {}),
        });
        res.json({ ok: true, ...result });
      } catch (err) {
        if (err instanceof ExportError) {
          return res.status(404).json({ error: err.message });
        }
        throw err;
      }
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Plan §3.A5 / spec §16 Phase 5: operator escape hatch for forced
  // snapshot pruning. The periodic worker (`startSnapshotGc`) runs the
  // unreferenced-TTL sweep automatically; this endpoint additionally
  // accepts `{ before: <unix-ms> }` to force-delete unreferenced rows
  // older than the cutoff. Referenced rows (run_id IS NOT NULL) stay
  // pinned forever per PB2 reproducibility-first.
  app.post('/api/applied-plugins/prune', async (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const before = typeof body.before === 'number' ? body.before : undefined;
      const result = pruneExpiredSnapshots(db, before ? { before } : {});
      // Plan §3.JJ1 — emit a 'plugin.snapshot-pruned' event when
      // anything was actually removed, so ops can track GC churn
      // via the live tail.
      if (result.removed > 0) {
        try {
          const { recordPluginEvent } = await import('./plugins/events.js');
          recordPluginEvent({
            kind:     'plugin.snapshot-pruned',
            pluginId: '',
            details:  { removed: result.removed, ...(before ? { before } : {}) },
          });
        } catch { /* best-effort */ }
      }
      res.json({ ok: true, removed: result.removed, ids: result.ids });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Phase 2A: GenUI surface read/write + devloop iteration history + replay.
  // Spec §10.3 for the surface lifecycle, §10.2 for devloop, §11.5 for the
  // route shapes. The surface writers go through `apps/daemon/src/genui/store.ts`
  // (sole writer of `genui_surfaces`) so the F8 cross-conversation cache stays
  // intact.
  app.get('/api/runs/:runId/genui', (req, res) => {
    try {
      const surfaces = listSurfacesForRun(db, req.params.runId);
      res.json({ runId: req.params.runId, surfaces });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.get('/api/projects/:projectId/genui', (req, res) => {
    try {
      const surfaces = listSurfacesForProject(db, req.params.projectId);
      res.json({ projectId: req.params.projectId, surfaces });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.post('/api/runs/:runId/genui/:surfaceId/respond', async (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const value = 'value' in body ? body.value : null;
      const respondedBy =
        body.respondedBy === 'agent' || body.respondedBy === 'auto'
          ? body.respondedBy
          : 'user';
      // The CLI / web pass `surfaceId` (the plugin-declared id) — look up
      // the matching pending row scoped to the run, then write through.
      const stmt = db.prepare(
        `SELECT id FROM genui_surfaces
          WHERE run_id = ? AND surface_id = ? AND status = 'pending'
          ORDER BY requested_at DESC LIMIT 1`,
      );
      const row = stmt.get(req.params.runId, req.params.surfaceId) as { id?: string } | undefined;
      if (!row?.id) {
        return res.status(404).json({ error: 'no pending surface for runId/surfaceId' });
      }
      const updated = respondSurfaceRow(db, { rowId: row.id, value, respondedBy });

      // Plan §3.R1 / spec §10.3 / §21.5 — auto-bridge for the
      // diff-review choice surface. When the surface id matches the
      // auto-derived prefix, we immediately persist the decision into
      // the run's project cwd so the next pipeline stage (handoff,
      // typically) sees `<cwd>/review/decision.json` without a second
      // turn through the agent. Best-effort: failures don't block the
      // 200 response — the agent or a follow-up call can retry.
      let diffReviewBridge: { ok: boolean; error?: string } | undefined;
      if (isDiffReviewSurfaceId(req.params.surfaceId)) {
        try {
          const run = design.runs.get(req.params.runId);
          const projectId = (run as { projectId?: string | null } | undefined)?.projectId ?? null;
          if (projectId) {
            const project = getProject(db, projectId);
            const metadata = project?.metadata && typeof project.metadata === 'string'
              ? JSON.parse(project.metadata)
              : project?.metadata ?? undefined;
            const cwd = resolveProjectDir(PROJECTS_DIR, projectId, metadata);
            const bridgeResult = await applyDiffReviewDecisionToCwd({
              cwd,
              value,
              reviewer: respondedBy === 'agent' || respondedBy === 'auto' ? 'agent' : 'user',
            });
            diffReviewBridge = bridgeResult.ok ? { ok: true } : { ok: false, error: bridgeResult.error };
          } else {
            diffReviewBridge = { ok: false, error: 'run is not linked to a project' };
          }
        } catch (err) {
          diffReviewBridge = { ok: false, error: (err as Error).message };
          console.warn('[plugins] diff-review bridge failed:', err);
        }
      }

      const responsePayload: Record<string, unknown> = { ok: true, surface: updated };
      if (diffReviewBridge) responsePayload.diffReviewBridge = diffReviewBridge;
      res.json(responsePayload);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.post('/api/projects/:projectId/genui/:surfaceId/revoke', (req, res) => {
    try {
      const changed = revokeProjectSurface(db, {
        projectId: req.params.projectId,
        surfaceId: req.params.surfaceId,
      });
      res.json({ ok: true, invalidated: changed });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.post('/api/projects/:projectId/genui/prefill', (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const snapshotId = typeof body.snapshotId === 'string' ? body.snapshotId : '';
      const surfaceId  = typeof body.surfaceId  === 'string' ? body.surfaceId  : '';
      const persist    = body.persist === 'run' || body.persist === 'conversation' || body.persist === 'project'
        ? body.persist
        : 'project';
      const kind = body.kind === 'form' || body.kind === 'choice' || body.kind === 'oauth-prompt'
        ? body.kind
        : 'confirmation';
      if (!snapshotId || !surfaceId) {
        return res.status(400).json({ error: 'snapshotId and surfaceId are required' });
      }
      const row = prefillProjectSurface(db, {
        projectId:        req.params.projectId,
        pluginSnapshotId: snapshotId,
        surfaceId,
        kind,
        persist,
        value:            'value' in body ? body.value : null,
        schema:           body.schema,
        expiresAt:        typeof body.expiresAt === 'number' ? body.expiresAt : null,
      });
      res.json({ ok: true, surface: row });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.get('/api/runs/:runId/genui/:surfaceId', (req, res) => {
    try {
      const row = db.prepare(
        `SELECT id FROM genui_surfaces
          WHERE run_id = ? AND surface_id = ?
          ORDER BY requested_at DESC LIMIT 1`,
      ).get(req.params.runId, req.params.surfaceId) as { id?: string } | undefined;
      if (!row?.id) return res.status(404).json({ error: 'surface not found' });
      const surface = getSurface(db, row.id);
      if (!surface) return res.status(404).json({ error: 'surface not found' });
      // Plan §6 Phase 2A.5 — enrich the response with the surface
      // spec (incl. schema, prompt, persist tier) pulled out of the
      // pinned AppliedPluginSnapshot. This is what `od ui show`
      // returns to headless callers so a code agent can inspect the
      // JSON Schema before responding via `od ui respond --value-json`.
      // The store only persists `schemaDigest` (for the cross-conv
      // cache); the canonical schema lives on the snapshot.
      let spec = null;
      if (surface.pluginSnapshotId) {
        const snap = getSnapshot(db, surface.pluginSnapshotId);
        if (snap && Array.isArray(snap.genuiSurfaces)) {
          spec = snap.genuiSurfaces.find((s) => s?.id === surface.surfaceId) ?? null;
        }
      }
      res.json({ ...surface, spec });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.get('/api/runs/:runId/devloop-iterations', (req, res) => {
    try {
      const iterations = listIterationsForRun(db, req.params.runId);
      res.json({ runId: req.params.runId, iterations });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Replay: rebuild a run by reading its `applied_plugin_snapshot_id`
  // and returning the snapshot for the caller (CLI / agent driver) to
  // re-launch with. Phase 2A keeps replay headless: the daemon does not
  // auto-restart the agent — it returns the materialized inputs that
  // would re-produce the run if re-applied. Spec §8.2.1 invariants
  // guarantee byte-equality across replays.
  app.post('/api/runs/:runId/replay', (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const explicitSnapshotId = typeof body.snapshotId === 'string' ? body.snapshotId : '';
      let snapshotId = explicitSnapshotId;
      if (!snapshotId) {
        // Phase 2A keeps `runs` in-memory; the caller must pass `snapshotId`
        // (e.g. the value persisted on the client after the original apply).
        // Once `runs.applied_plugin_snapshot_id` lands as a SQL column, the
        // server resolves the link itself.
        return res.status(400).json({
          error: 'snapshotId is required (runs are in-memory; pass the snapshotId returned by /api/plugins/:id/apply)',
        });
      }
      const snapshot = getSnapshot(db, snapshotId);
      if (!snapshot) return res.status(404).json({ error: 'snapshot not found' });
      res.json({
        ok:        true,
        runId:     req.params.runId,
        snapshotId,
        snapshot,
        // The caller re-launches the agent by re-applying these inputs;
        // the digest match guarantees byte-equality (§8.2.1).
        rerun: {
          pluginId:             snapshot.pluginId,
          pluginSpecVersion:    snapshot.pluginSpecVersion,
          pluginVersion:        snapshot.pluginVersion,
          inputs:               snapshot.inputs,
          manifestSourceDigest: snapshot.manifestSourceDigest,
        },
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.get('/api/prompt-templates', async (_req, res) => {
    try {
      const templates = await listPromptTemplates(PROMPT_TEMPLATES_DIR);
      res.json({
        promptTemplates: templates.map(({ prompt: _prompt, ...rest }) => rest),
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.get('/api/prompt-templates/:surface/:id', async (req, res) => {
    try {
      const tpl = await readPromptTemplate(
        PROMPT_TEMPLATES_DIR,
        req.params.surface,
        req.params.id,
      );
      if (!tpl)
        return res.status(404).json({ error: 'prompt template not found' });
      res.json({ promptTemplate: tpl });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Showcase HTML for a design system — palette swatches, typography
  // samples, sample components, and the full DESIGN.md rendered as prose.
  // Built at request time from the on-disk DESIGN.md so any update to the
  // file shows up on the next view, no rebuild needed.
  app.get('/api/design-systems/:id/preview', async (req, res) => {
    try {
      const body = await readDesignSystem(DESIGN_SYSTEMS_DIR, req.params.id);
      if (body === null)
        return res.status(404).type('text/plain').send('not found');
      const html = renderDesignSystemPreview(req.params.id, body);
      res.type('text/html').send(html);
    } catch (err) {
      res.status(500).type('text/plain').send(String(err));
    }
  });

  // Marketing-style showcase derived from the same DESIGN.md — full landing
  // page parameterised by the system's tokens. Same lazy-render strategy as
  // /preview: built at request time, no caching.
  app.get('/api/design-systems/:id/showcase', async (req, res) => {
    try {
      const body = await readDesignSystem(DESIGN_SYSTEMS_DIR, req.params.id);
      if (body === null)
        return res.status(404).type('text/plain').send('not found');
      const html = renderDesignSystemShowcase(req.params.id, body);
      res.type('text/html').send(html);
    } catch (err) {
      res.status(500).type('text/plain').send(String(err));
    }
  });

  // Pre-built example HTML for a skill — what a typical artifact from this
  // skill looks like. Lets users browse skills without running an agent.
  //
  // The skill's `id` (from SKILL.md frontmatter `name`) can differ from its
  // on-disk folder name (e.g. id `magazine-web-ppt` lives in `skills/guizang-ppt/`),
  // so we resolve the actual directory via listSkills() rather than guessing.
  //
  // Resolution order:
  //   1. Derived id (`<parent>:<child>`):
  //      <parentDir>/examples/<child>.html — pre-baked single-file sample.
  //      Subfolder layouts (e.g. live-artifact's
  //      `examples/<name>/template.html`) are intentionally not served:
  //      they still contain `{{data.x}}` placeholders that only the
  //      daemon-side renderer fills in, and serving the raw template
  //      would render visible placeholder braces in the gallery.
  //   2. <skillDir>/example.html — fully-baked static example (preferred)
  //   3. <skillDir>/assets/template.html  +
  //      <skillDir>/assets/example-slides.html — assemble at request time
  //      by replacing the `<!-- SLIDES_HERE -->` marker with the snippet
  //      and patching the placeholder <title>. Lets a skill ship one
  //      canonical seed plus a small content fragment, so the example
  //      never drifts from the seed.
  //   4. <skillDir>/assets/template.html — raw template, no content slides
  //   5. <skillDir>/assets/index.html — generic fallback
  //   6. First .html in <skillDir>/examples/ — used as a friendly fallback
  //      so a skill that aggregates examples (like live-artifact) still has
  //      a real preview on its parent card instead of returning 404.
  app.get('/api/skills/:id/example', async (req, res) => {
    try {
      const skills = await listSkills(SKILLS_DIR);

      // 1. Derived `<parent>:<child>` id — resolve straight to the matching
      // file under <parentDir>/examples/. Done before findSkillById so the
      // parent's normal fallback chain never accidentally serves a stale
      // file when a sample is missing (we'd rather 404 explicitly).
      const derived = splitDerivedSkillId(req.params.id);
      if (derived) {
        const parent = findSkillById(skills, derived.parentId);
        if (!parent) {
          return res.status(404).type('text/plain').send('skill not found');
        }
        const candidate = path.join(
          parent.dir,
          'examples',
          `${derived.childKey}.html`,
        );
        if (fs.existsSync(candidate)) {
          const html = await fs.promises.readFile(candidate, 'utf8');
          return res
            .type('text/html')
            .send(rewriteSkillAssetUrls(html, parent.id));
        }
        return res
          .status(404)
          .type('text/plain')
          .send('derived example not found');
      }

      const skill = findSkillById(skills, req.params.id);
      if (!skill) {
        return res.status(404).type('text/plain').send('skill not found');
      }

      const baked = path.join(skill.dir, 'example.html');
      if (fs.existsSync(baked)) {
        const html = await fs.promises.readFile(baked, 'utf8');
        return res
          .type('text/html')
          .send(rewriteSkillAssetUrls(html, skill.id));
      }

      const tpl = path.join(skill.dir, 'assets', 'template.html');
      const slides = path.join(skill.dir, 'assets', 'example-slides.html');
      if (fs.existsSync(tpl) && fs.existsSync(slides)) {
        try {
          const tplHtml = await fs.promises.readFile(tpl, 'utf8');
          const slidesHtml = await fs.promises.readFile(slides, 'utf8');
          const assembled = assembleExample(tplHtml, slidesHtml, skill.name);
          return res
            .type('text/html')
            .send(rewriteSkillAssetUrls(assembled, skill.id));
        } catch {
          // Fall through to raw template on read failure.
        }
      }
      if (fs.existsSync(tpl)) {
        const html = await fs.promises.readFile(tpl, 'utf8');
        return res
          .type('text/html')
          .send(rewriteSkillAssetUrls(html, skill.id));
      }
      const idx = path.join(skill.dir, 'assets', 'index.html');
      if (fs.existsSync(idx)) {
        const html = await fs.promises.readFile(idx, 'utf8');
        return res
          .type('text/html')
          .send(rewriteSkillAssetUrls(html, skill.id));
      }

      // Friendly fallback for skills that aggregate examples in a sibling
      // `examples/` folder (e.g. live-artifact). The parent card would
      // otherwise 404 even though plenty of perfectly valid samples ship
      // alongside SKILL.md; pick the first .html file alphabetically so
      // direct URL access (e.g. deep links) shows something representative.
      // Subfolder layouts are excluded for the same reason as the derived
      // resolver above — their `template.html` still has unresolved
      // `{{data.x}}` placeholders.
      const examplesDir = path.join(skill.dir, 'examples');
      if (fs.existsSync(examplesDir)) {
        let entries: string[] = [];
        try {
          entries = await fs.promises.readdir(examplesDir);
        } catch {
          entries = [];
        }
        entries.sort();
        for (const name of entries) {
          if (name.startsWith('.')) continue;
          if (!name.toLowerCase().endsWith('.html')) continue;
          const direct = path.join(examplesDir, name);
          try {
            const html = await fs.promises.readFile(direct, 'utf8');
            return res
              .type('text/html')
              .send(rewriteSkillAssetUrls(html, skill.id));
          } catch {
            continue;
          }
        }
      }

      res
        .status(404)
        .type('text/plain')
        .send(
          'no example.html, assets/template.html, assets/index.html, or examples/*.html for this skill',
        );
    } catch (err) {
      res.status(500).type('text/plain').send(String(err));
    }
  });

  // Static assets shipped beside a skill's example/template HTML. Lets the
  // example HTML reference `./assets/foo.png`-style paths that resolve
  // correctly when the response is loaded into a sandboxed `srcdoc` iframe
  // (where relative URLs would otherwise resolve against `about:srcdoc`).
  // The example response above rewrites `./assets/<file>` into a request
  // against this route; we still keep the on-disk paths human-friendly so
  // contributors can preview `example.html` straight from disk.
  app.get('/api/skills/:id/assets/*', async (req, res) => {
    try {
      const skills = await listSkills(SKILLS_DIR);
      const skill = findSkillById(skills, req.params.id);
      if (!skill) {
        return res.status(404).type('text/plain').send('skill not found');
      }
      const relPath = String(req.params[0] || '');
      const assetsRoot = path.resolve(skill.dir, 'assets');
      const target = path.resolve(assetsRoot, relPath);
      if (target !== assetsRoot && !target.startsWith(assetsRoot + path.sep)) {
        return res.status(400).type('text/plain').send('invalid asset path');
      }
      if (!fs.existsSync(target)) {
        return res.status(404).type('text/plain').send('asset not found');
      }
      // The example HTML is rendered inside a sandboxed iframe (Origin: null).
      // Mirror the project /raw route's allowance so the iframe can fetch the
      // image bytes; same-origin web callers do not need this header.
      if (req.headers.origin === 'null') {
        res.header('Access-Control-Allow-Origin', '*');
      }
      res.type(mimeFor(target)).sendFile(target);
    } catch (err) {
      res.status(500).type('text/plain').send(String(err));
    }
  });

  app.post('/api/upload', upload.array('images', 8), (req, res) => {
    const files = (req.files || []).map((f) => ({
      name: f.originalname,
      path: f.path,
      size: f.size,
    }));
    res.json({ files });
  });

  // Persist a generated artifact (HTML) to disk so the user can re-open it
  // in their browser or hand it off. Returns the on-disk path + a served URL.
  // The body is also passed through the anti-slop linter; findings are
  // returned alongside the path so the UI can render a P0/P1 badge and the
  // chat layer can splice them into a system reminder for the agent.
  app.post('/api/artifacts/save', (req, res) => {
    try {
      const { identifier, title, html } = req.body || {};
      if (typeof html !== 'string' || html.length === 0) {
        return res.status(400).json({ error: 'html required' });
      }
      const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
      const slug = sanitizeSlug(identifier || title || 'artifact');
      const dir = path.join(ARTIFACTS_DIR, `${stamp}-${slug}`);
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, 'index.html');
      fs.writeFileSync(file, html, 'utf8');
      const findings = lintArtifact(html);
      res.json({
        path: file,
        url: `/artifacts/${path.basename(dir)}/index.html`,
        lint: findings,
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Standalone lint endpoint — POST raw HTML, get findings back.
  // The chat layer uses this to lint streamed-in artifacts without writing
  // them to disk first, so a P0 issue can be surfaced before save.
  app.post('/api/artifacts/lint', (req, res) => {
    try {
      const { html } = req.body || {};
      if (typeof html !== 'string' || html.length === 0) {
        return res.status(400).json({ error: 'html required' });
      }
      const findings = lintArtifact(html);
      res.json({
        findings,
        agentMessage: renderFindingsForAgent(findings),
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.get('/api/live-artifacts', async (req, res) => {
    try {
      const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
      if (!projectId) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'projectId query parameter is required');
      }

      const artifacts = await listLiveArtifacts({
        projectsRoot: PROJECTS_DIR,
        projectId,
      });
      res.json({ artifacts });
    } catch (err) {
      sendLiveArtifactRouteError(res, err);
    }
  });

  app.options('/api/live-artifacts/:artifactId/preview', requireLocalDaemonRequest, (_req, res) => {
    res.status(204).end();
  });

  app.get('/api/live-artifacts/:artifactId/preview', requireLocalDaemonRequest, async (req, res) => {
    try {
      const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
      if (!projectId) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'projectId query parameter is required');
      }

      const variant = typeof req.query.variant === 'string' ? req.query.variant : 'rendered';
      if (variant === 'template' || variant === 'rendered-source') {
        const html = await readLiveArtifactCode({
          projectsRoot: PROJECTS_DIR,
          projectId,
          artifactId: req.params.artifactId,
          variant: variant === 'template' ? 'template' : 'rendered',
        });
        setLiveArtifactCodeHeaders(res);
        return res.status(200).send(html);
      }
      if (variant !== 'rendered') {
        return sendApiError(res, 400, 'BAD_REQUEST', 'variant must be rendered, template, or rendered-source');
      }

      const record = await ensureLiveArtifactPreview({
        projectsRoot: PROJECTS_DIR,
        projectId,
        artifactId: req.params.artifactId,
      });
      setLiveArtifactPreviewHeaders(res);
      res.status(200).send(record.html);
    } catch (err) {
      sendLiveArtifactRouteError(res, err);
    }
  });

  app.get('/api/live-artifacts/:artifactId', async (req, res) => {
    try {
      const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
      if (!projectId) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'projectId query parameter is required');
      }

      const record = await getLiveArtifact({
        projectsRoot: PROJECTS_DIR,
        projectId,
        artifactId: req.params.artifactId,
      });
      res.json({ artifact: record.artifact });
    } catch (err) {
      sendLiveArtifactRouteError(res, err);
    }
  });

  app.get('/api/live-artifacts/:artifactId/refreshes', async (req, res) => {
    try {
      const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
      if (!projectId) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'projectId query parameter is required');
      }

      const refreshes = await listLiveArtifactRefreshLogEntries({
        projectsRoot: PROJECTS_DIR,
        projectId,
        artifactId: req.params.artifactId,
      });
      res.json({ refreshes });
    } catch (err) {
      sendLiveArtifactRouteError(res, err);
    }
  });

  app.post('/api/tools/live-artifacts/create', async (req, res) => {
    try {
      const toolGrant = authorizeToolRequest(req, res, 'live-artifacts:create');
      if (!toolGrant) return;
      const { projectId, input, templateHtml, provenanceJson, createdByRunId } = req.body || {};
      if (requestProjectOverride(projectId, toolGrant.projectId)) {
        return sendApiError(res, 403, 'FORBIDDEN', 'projectId is derived from the tool token', {
          details: { suppliedProjectId: projectId },
        });
      }
      if (requestRunOverride(createdByRunId, toolGrant.runId)) {
        return sendApiError(res, 403, 'FORBIDDEN', 'createdByRunId is derived from the tool token', {
          details: { suppliedRunId: createdByRunId },
        });
      }

      const record = await createLiveArtifact({
        projectsRoot: PROJECTS_DIR,
        projectId: toolGrant.projectId,
        input: input ?? {},
        templateHtml,
        provenanceJson,
        createdByRunId: toolGrant.runId,
      });
      emitLiveArtifactEvent(toolGrant, 'created', record.artifact);
      res.json({ artifact: record.artifact });
    } catch (err) {
      sendLiveArtifactRouteError(res, err);
    }
  });

  app.get('/api/tools/live-artifacts/list', async (req, res) => {
    try {
      const toolGrant = authorizeToolRequest(req, res, 'live-artifacts:list');
      if (!toolGrant) return;
      const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
      if (requestProjectOverride(projectId, toolGrant.projectId)) {
        return sendApiError(res, 403, 'FORBIDDEN', 'projectId is derived from the tool token', {
          details: { suppliedProjectId: projectId },
        });
      }

      const artifacts = await listLiveArtifacts({
        projectsRoot: PROJECTS_DIR,
        projectId: toolGrant.projectId,
      });
      res.json({ artifacts });
    } catch (err) {
      sendLiveArtifactRouteError(res, err);
    }
  });

  app.post('/api/tools/live-artifacts/update', async (req, res) => {
    try {
      const toolGrant = authorizeToolRequest(req, res, 'live-artifacts:update');
      if (!toolGrant) return;
      const { projectId, artifactId, input, templateHtml, provenanceJson } = req.body || {};
      if (requestProjectOverride(projectId, toolGrant.projectId)) {
        return sendApiError(res, 403, 'FORBIDDEN', 'projectId is derived from the tool token', {
          details: { suppliedProjectId: projectId },
        });
      }
      if (typeof artifactId !== 'string' || artifactId.length === 0) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'artifactId is required');
      }

      const record = await updateLiveArtifact({
        projectsRoot: PROJECTS_DIR,
        projectId: toolGrant.projectId,
        artifactId,
        input: input ?? {},
        templateHtml,
        provenanceJson,
      });
      emitLiveArtifactEvent(toolGrant, 'updated', record.artifact);
      res.json({ artifact: record.artifact });
    } catch (err) {
      sendLiveArtifactRouteError(res, err);
    }
  });

  app.post('/api/tools/live-artifacts/refresh', async (req, res) => {
    try {
      const toolGrant = authorizeToolRequest(req, res, 'live-artifacts:refresh');
      if (!toolGrant) return;
      const { projectId, artifactId } = req.body || {};
      if (requestProjectOverride(projectId, toolGrant.projectId)) {
        return sendApiError(res, 403, 'FORBIDDEN', 'projectId is derived from the tool token', {
          details: { suppliedProjectId: projectId },
        });
      }
      if (typeof artifactId !== 'string' || artifactId.length === 0) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'artifactId is required');
      }

      let result;
      try {
        result = await refreshLiveArtifact({
          projectsRoot: PROJECTS_DIR,
          projectId: toolGrant.projectId,
          artifactId,
          onStarted: ({ refreshId }) => {
            emitLiveArtifactRefreshEvent(toolGrant, { phase: 'started', artifactId, refreshId });
          },
        });
      } catch (refreshErr) {
        emitLiveArtifactRefreshEvent(toolGrant, {
          phase: 'failed',
          artifactId,
          error: refreshErr instanceof Error ? refreshErr.message : String(refreshErr),
        });
        throw refreshErr;
      }
      emitLiveArtifactRefreshEvent(toolGrant, {
        phase: 'succeeded',
        artifactId,
        refreshId: result.refresh.id,
        title: result.artifact.title,
        refreshedSourceCount: result.refresh.refreshedSourceCount,
      });
      res.json(result);
    } catch (err) {
      sendLiveArtifactRouteError(res, err);
    }
  });

  app.patch('/api/live-artifacts/:artifactId', async (req, res) => {
    try {
      const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
      if (!projectId) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'projectId query parameter is required');
      }

      const record = await updateLiveArtifact({
        projectsRoot: PROJECTS_DIR,
        projectId,
        artifactId: req.params.artifactId,
        input: req.body ?? {},
      });
      emitLiveArtifactEvent({ projectId }, 'updated', record.artifact);
      res.json({ artifact: record.artifact });
    } catch (err) {
      sendLiveArtifactRouteError(res, err);
    }
  });

  app.delete('/api/live-artifacts/:artifactId', async (req, res) => {
    try {
      const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
      if (!projectId) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'projectId query parameter is required');
      }

      const existing = await getLiveArtifact({
        projectsRoot: PROJECTS_DIR,
        projectId,
        artifactId: req.params.artifactId,
      });
      await deleteLiveArtifact({
        projectsRoot: PROJECTS_DIR,
        projectId,
        artifactId: req.params.artifactId,
      });
      updateProject(db, projectId, {});
      emitLiveArtifactEvent({ projectId }, 'deleted', existing.artifact);
      res.json({ ok: true });
    } catch (err) {
      sendLiveArtifactRouteError(res, err);
    }
  });

  app.options('/api/live-artifacts/:artifactId/refresh', requireLocalDaemonRequest, (_req, res) => {
    res.status(204).end();
  });

  app.post('/api/live-artifacts/:artifactId/refresh', requireLocalDaemonRequest, async (req, res) => {
    try {
      const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
      if (!projectId) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'projectId query parameter is required');
      }

      let result;
      try {
        result = await refreshLiveArtifact({
          projectsRoot: PROJECTS_DIR,
          projectId,
          artifactId: req.params.artifactId,
          onStarted: ({ refreshId }) => {
            emitLiveArtifactRefreshEvent({ projectId }, { phase: 'started', artifactId: req.params.artifactId, refreshId });
          },
        });
      } catch (refreshErr) {
        emitLiveArtifactRefreshEvent({ projectId }, {
          phase: 'failed',
          artifactId: req.params.artifactId,
          error: refreshErr instanceof Error ? refreshErr.message : String(refreshErr),
        });
        throw refreshErr;
      }
      emitLiveArtifactRefreshEvent({ projectId }, {
        phase: 'succeeded',
        artifactId: req.params.artifactId,
        refreshId: result.refresh.id,
        title: result.artifact.title,
        refreshedSourceCount: result.refresh.refreshedSourceCount,
      });
      res.json(result);
    } catch (err) {
      sendLiveArtifactRouteError(res, err);
    }
  });

  app.use('/artifacts', express.static(ARTIFACTS_DIR));

  // ---- Deploy --------------------------------------------------------------

  app.get('/api/deploy/config', async (req, res) => {
    try {
      const providerId =
        typeof req.query.providerId === 'string' ? req.query.providerId : VERCEL_PROVIDER_ID;
      if (!isDeployProviderId(providerId)) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'unsupported deploy provider');
      }
      /** @type {import('@open-design/contracts').DeployConfigResponse} */
      const body = publicDeployConfigForProvider(providerId, await readDeployConfig(providerId));
      res.json(body);
    } catch (err) {
      sendApiError(res, 500, 'INTERNAL_ERROR', String(err?.message || err));
    }
  });

  app.put('/api/deploy/config', async (req, res) => {
    try {
      const input = req.body || {};
      const providerId =
        typeof input.providerId === 'string' ? input.providerId : VERCEL_PROVIDER_ID;
      if (!isDeployProviderId(providerId)) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'unsupported deploy provider');
      }
      /** @type {import('@open-design/contracts').DeployConfigResponse} */
      const body = await writeDeployConfig(providerId, input);
      res.json(body);
    } catch (err) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err?.message || err));
    }
  });

  app.get('/api/deploy/cloudflare-pages/zones', async (_req, res) => {
    try {
      /** @type {import('@open-design/contracts').CloudflarePagesZonesResponse} */
      const body = await listCloudflarePagesZones(await readDeployConfig(CLOUDFLARE_PAGES_PROVIDER_ID));
      res.json(body);
    } catch (err) {
      const status = err instanceof DeployError ? err.status : 400;
      const init =
        err instanceof DeployError && err.details
          ? { details: err.details }
          : {};
      sendApiError(res, status, 'BAD_REQUEST', String(err?.message || err), init);
    }
  });

  app.get('/api/projects/:id/deployments', (req, res) => {
    try {
      /** @type {import('@open-design/contracts').ProjectDeploymentsResponse} */
      const body = { deployments: publicDeployments(listDeployments(db, req.params.id)) };
      res.json(body);
    } catch (err) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err?.message || err));
    }
  });

  app.post('/api/projects/:id/deploy', async (req, res) => {
    try {
      const { fileName, providerId = VERCEL_PROVIDER_ID, cloudflarePages } = req.body || {};
      if (!isDeployProviderId(providerId)) {
        return sendApiError(
          res,
          400,
          'BAD_REQUEST',
          'unsupported deploy provider',
        );
      }
      if (typeof fileName !== 'string' || !fileName.trim()) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'fileName required');
      }

      const prior = getDeployment(db, req.params.id, fileName, providerId);
      const deployProject = getProject(db, req.params.id);
      const files = await buildDeployFileSet(
        PROJECTS_DIR,
        req.params.id,
        fileName,
        { metadata: deployProject?.metadata },
      );
      const project = getProject(db, req.params.id);
      const cloudflarePagesProjectName =
        providerId === CLOUDFLARE_PAGES_PROVIDER_ID
          ? cloudflarePagesProjectNameForDeploy(db, req.params.id, project?.name, prior)
          : '';
      const result = providerId === CLOUDFLARE_PAGES_PROVIDER_ID
        ? await deployToCloudflarePages({
            config: {
              ...await readDeployConfig(CLOUDFLARE_PAGES_PROVIDER_ID),
              projectName: cloudflarePagesProjectName,
            },
            files,
            projectId: req.params.id,
            cloudflarePages,
            priorMetadata: prior?.providerMetadata,
          })
        : await deployToVercel({
            config: await readDeployConfig(VERCEL_PROVIDER_ID),
            files,
            projectId: req.params.id,
          });
      const now = Date.now();
      /** @type {import('@open-design/contracts').DeployProjectFileResponse} */
      const body = upsertDeployment(db, {
        id: prior?.id ?? randomUUID(),
        projectId: req.params.id,
        fileName,
        providerId,
        url: result.url,
        deploymentId: result.deploymentId,
        deploymentCount: (prior?.deploymentCount ?? 0) + 1,
        target: 'preview',
        status: result.status,
        statusMessage: result.statusMessage,
        reachableAt: result.reachableAt,
        cloudflarePages: result.cloudflarePages,
        providerMetadata:
          providerId === CLOUDFLARE_PAGES_PROVIDER_ID
            ? (result.providerMetadata ?? cloudflarePagesDeploymentMetadata(cloudflarePagesProjectName))
            : prior?.providerMetadata,
        createdAt: prior?.createdAt ?? now,
        updatedAt: now,
      });
      res.json(publicDeployment(body));
    } catch (err) {
      const status = err instanceof DeployError ? err.status : 400;
      const init =
        err instanceof DeployError && err.details
          ? { details: err.details }
          : {};
      sendApiError(
        res,
        status,
        status === 404 ? 'FILE_NOT_FOUND' : 'BAD_REQUEST',
        String(err?.message || err),
        init,
      );
    }
  });

  app.post('/api/projects/:id/deploy/preflight', async (req, res) => {
    try {
      const { fileName, providerId = VERCEL_PROVIDER_ID } = req.body || {};
      if (!isDeployProviderId(providerId)) {
        return sendApiError(
          res,
          400,
          'BAD_REQUEST',
          'unsupported deploy provider',
        );
      }
      if (typeof fileName !== 'string' || !fileName.trim()) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'fileName required');
      }
      const preflightProject = getProject(db, req.params.id);
      /** @type {import('@open-design/contracts').DeployPreflightResponse} */
      const body = await prepareDeployPreflight(
        PROJECTS_DIR,
        req.params.id,
        fileName,
        { metadata: preflightProject?.metadata, providerId },
      );
      res.json(body);
    } catch (err) {
      // DeployError is a known/expected outcome (validation, missing file).
      // Anything else points at a bug or an unexpected runtime state, so
      // surface it in the daemon log without leaking internals to the
      // client which still gets a generic 400.
      if (!(err instanceof DeployError)) {
        console.error('[deploy/preflight]', err);
      }
      const status = err instanceof DeployError ? err.status : 400;
      sendApiError(
        res,
        status,
        status === 404 ? 'FILE_NOT_FOUND' : 'BAD_REQUEST',
        String(err?.message || err),
      );
    }
  });

  app.post('/api/projects/:id/finalize/anthropic', async (req, res) => {
    const { apiKey, baseUrl, model, maxTokens } = req.body || {};
    try {
      // Centralized path-traversal guard. `isSafeId` (apps/daemon/src/projects.ts)
      // rejects pure-dot ids (`.`, `..`, etc.) which would otherwise pass
      // the char-class regex and resolve to the parent directory under
      // path.join. Express decodes percent-encoded `%2e%2e` to `..` before
      // we see it, so this check covers both URL-supplied and stored-row
      // attack vectors.
      if (!isSafeId(req.params.id)) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'invalid project id');
      }

      if (typeof apiKey !== 'string' || !apiKey.trim()) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'apiKey is required');
      }
      if (typeof model !== 'string' || !model.trim()) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'model is required');
      }
      if (baseUrl !== undefined) {
        if (typeof baseUrl !== 'string' || !baseUrl.trim()) {
          return sendApiError(res, 400, 'BAD_REQUEST', 'baseUrl must be a non-empty string when provided');
        }
        const validated = validateExternalApiBaseUrl(baseUrl);
        if (validated.error) {
          return sendApiError(
            res,
            validated.forbidden ? 403 : 400,
            validated.forbidden ? 'FORBIDDEN' : 'BAD_REQUEST',
            validated.error,
          );
        }
      }
      if (maxTokens !== undefined && (typeof maxTokens !== 'number' || maxTokens <= 0)) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'maxTokens must be a positive number when provided');
      }

      const project = getProject(db, req.params.id);
      if (!project) {
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
      }

      const result = await finalizeDesignPackage(
        db,
        PROJECTS_DIR,
        DESIGN_SYSTEMS_DIR,
        req.params.id,
        { apiKey, baseUrl, model, maxTokens },
      );
      res.json(result);
    } catch (err) {
      // Concurrent finalize - the lockfile was already held by another
      // call. Caller can retry after a short wait; not a client error.
      // Maps to the shared CONFLICT code per @lefarcen P2 on PR #832.
      if (err instanceof FinalizePackageLockedError) {
        return sendApiError(res, 409, 'CONFLICT', err.message);
      }

      // Upstream Anthropic error - status-aware mapping using shared
      // ApiErrorCode values. Run the raw upstream body through
      // redactSecrets so the API key cannot leak even if Anthropic
      // echoes the inbound headers. Codes per @lefarcen P2 on PR #832:
      // 401 -> UNAUTHORIZED, 429 -> RATE_LIMITED, others -> UPSTREAM_UNAVAILABLE.
      if (err instanceof FinalizeUpstreamError) {
        const safeDetails = redactSecrets(err.rawText || '', [apiKey]);
        const init = safeDetails ? { details: safeDetails } : {};
        if (err.status === 401) {
          return sendApiError(res, 401, 'UNAUTHORIZED', err.message, init);
        }
        if (err.status === 429) {
          return sendApiError(res, 429, 'RATE_LIMITED', err.message, init);
        }
        return sendApiError(res, 502, 'UPSTREAM_UNAVAILABLE', err.message, init);
      }

      // The blocking call hit our 120s AbortController timeout - or the
      // caller passed an already-aborted signal. Either way, surface as
      // 503 with the shared UPSTREAM_UNAVAILABLE code (no dedicated
      // TIMEOUT code in the contracts ApiErrorCode union).
      const errName =
        err && typeof err === 'object' && 'name' in err ? (err as { name?: unknown }).name : '';
      if (errName === 'AbortError') {
        return sendApiError(res, 503, 'UPSTREAM_UNAVAILABLE', 'finalize timed out');
      }

      // Unexpected runtime failure (file IO, db access, prompt build).
      // Log via console.error per the daemon convention; client sees a
      // generic 500 with the shared INTERNAL_ERROR code. Run the message
      // through redactSecrets defensively.
      console.error('[finalize/anthropic]', err);
      const safeMsg = redactSecrets(String(err?.message || err), [apiKey]);
      return sendApiError(res, 500, 'INTERNAL_ERROR', safeMsg);
    }
  });

  app.post(
    '/api/projects/:id/deployments/:deploymentId/check-link',
    async (req, res) => {
      try {
        const existing = getDeploymentById(
          db,
          req.params.id,
          req.params.deploymentId,
        );
        if (!existing) {
          return sendApiError(
            res,
            404,
            'FILE_NOT_FOUND',
            'deployment not found',
          );
        }
        const stableCloudflareProjectName =
          existing.providerId === CLOUDFLARE_PAGES_PROVIDER_ID
            ? cloudflarePagesProjectNameFromDeployment(existing)
            : '';
        if (existing.providerId === CLOUDFLARE_PAGES_PROVIDER_ID && existing.cloudflarePages?.pagesDev?.url) {
          const checked = await checkCloudflarePagesDeploymentLinks(existing);
          const now = Date.now();
          /** @type {import('@open-design/contracts').CheckDeploymentLinkResponse} */
          const body = upsertDeployment(db, {
            ...existing,
            ...checked,
            reachableAt: checked.status === 'ready' ? now : existing.reachableAt,
            updatedAt: now,
          });
          return res.json(publicDeployment(body));
        }
        const checkUrl = stableCloudflareProjectName
          ? `https://${stableCloudflareProjectName}.pages.dev`
          : existing.url;
        const result = await checkDeploymentUrl(checkUrl);
        const now = Date.now();
        /** @type {import('@open-design/contracts').CheckDeploymentLinkResponse} */
        const body = upsertDeployment(db, {
          ...existing,
          url: checkUrl || existing.url,
          status: result.reachable ? 'ready' : result.status || 'link-delayed',
          statusMessage: result.reachable
            ? 'Public link is ready.'
            : result.statusMessage ||
              'Vercel is still preparing the public link.',
          reachableAt: result.reachable ? now : existing.reachableAt,
          updatedAt: now,
        });
        res.json(publicDeployment(body));
      } catch (err) {
        sendApiError(res, 400, 'BAD_REQUEST', String(err?.message || err));
      }
    },
  );

  // Shared device frames (iPhone, Android, iPad, MacBook, browser chrome).
  // Skills can compose multi-screen / multi-device layouts by pointing at
  // these files via `<iframe src="/frames/iphone-15-pro.html?screen=...">`.
  // No mtime-based caching — frames are static and small.
  app.use('/frames', express.static(FRAMES_DIR));

  // Project files. Each project owns a flat folder under .od/projects/<id>/
  // containing every file the user has uploaded, pasted, sketched, or that
  // the agent has generated. Names are sanitized; paths are confined to the
  // project's own folder (see apps/daemon/src/projects.ts).
  app.get('/api/projects/:id/files', async (req, res) => {
    try {
      const since = Number(req.query?.since);
      const project = getProject(db, req.params.id);
      const files = await listFiles(PROJECTS_DIR, req.params.id, {
        since: Number.isFinite(since) ? since : undefined,
        metadata: project?.metadata,
      });
      /** @type {import('@open-design/contracts').ProjectFilesResponse} */
      const body = { files };
      res.json(body);
    } catch (err) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err));
    }
  });

  app.post('/api/projects/:id/plugins/install-folder', async (req, res) => {
    try {
      const project = getProject(db, req.params.id);
      if (!project) {
        sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
        return;
      }
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const relativePath = normalizeProjectPluginFolderPath(body.path);
      const projectRoot = resolveProjectDir(PROJECTS_DIR, req.params.id, project.metadata);
      const folder = await resolveProjectChildDirectory(projectRoot, relativePath);
      const warnings = [];
      const log = [];
      let plugin = null;
      let message = 'Install finished.';
      for await (const ev of installPlugin(db, { source: folder, roots: PLUGIN_REGISTRY_ROOTS })) {
        if (ev.message) log.push(ev.message);
        if (Array.isArray(ev.warnings)) warnings.splice(0, warnings.length, ...ev.warnings);
        if (ev.kind === 'success') {
          plugin = ev.plugin;
          message = `Installed ${ev.plugin.title}.`;
          break;
        }
        if (ev.kind === 'error') {
          message = ev.message;
          break;
        }
      }
      res.status(plugin ? 200 : 400).json({ ok: Boolean(plugin), plugin, warnings, message, log });
    } catch (err) {
      const code = err && err.code;
      const status = code === 'ENOENT' || code === 'ENOTDIR' ? 404 : 400;
      sendApiError(
        res,
        status,
        status === 404 ? 'PLUGIN_FOLDER_NOT_FOUND' : 'BAD_REQUEST',
        String(err?.message || err),
      );
    }
  });

  app.post('/api/projects/:id/plugins/publish-github', async (req, res) => {
    try {
      const project = getProject(db, req.params.id);
      if (!project) {
        sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
        return;
      }
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const relativePath = normalizeProjectPluginFolderPath(body.path);
      const projectRoot = resolveProjectDir(PROJECTS_DIR, req.params.id, project.metadata);
      const folder = await resolveProjectChildDirectory(projectRoot, relativePath);
      const gh = await ensureGhReady();
      if (!gh.ok) {
        res.status(409).json(gh);
        return;
      }
      const meta = await readProjectPluginManifest(folder);
      const repoName = githubRepoNameFromPluginName(meta.name);
      const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'od-plugin-publish-'));
      const work = path.join(tmp, repoName);
      await fs.promises.cp(folder, work, { recursive: true });
      const log = [...(gh.log ?? [])];
      for (const [cmd, args] of [
        ['git', ['init']],
        ['git', ['add', '.']],
        ['git', ['-c', 'user.name=Open Design', '-c', 'user.email=open-design@example.invalid', 'commit', '-m', `Publish ${meta.title}`]],
      ]) {
        const result = await execFileBuffered(cmd, args, { cwd: work });
        log.push(result.stdout || result.stderr);
        if (!result.ok) {
          await fs.promises.rm(tmp, { recursive: true, force: true }).catch(() => undefined);
          res.status(500).json({ ok: false, code: `${cmd}-failed`, message: `${cmd} failed while preparing the plugin repository.`, log });
          return;
        }
      }
      const create = await execFileBuffered('gh', [
        'repo',
        'create',
        repoName,
        '--public',
        '--source',
        work,
        '--push',
      ], { cwd: work });
      log.push(create.stdout || create.stderr);
      if (!create.ok) {
        await fs.promises.rm(tmp, { recursive: true, force: true }).catch(() => undefined);
        res.status(500).json({ ok: false, code: 'gh-repo-create-failed', message: 'GitHub repo creation failed.', log });
        return;
      }
      const view = await execFileBuffered('gh', ['repo', 'view', '--json', 'url', '--jq', '.url'], { cwd: work });
      const url = view.ok && view.stdout ? view.stdout : undefined;
      await fs.promises.rm(tmp, { recursive: true, force: true }).catch(() => undefined);
      res.json({
        ok: true,
        message: url ? `Published ${meta.title} to ${url}.` : `Published ${meta.title} to GitHub.`,
        ...(url ? { url } : {}),
        log,
      });
    } catch (err) {
      res.status(400).json({ ok: false, message: String(err?.message || err), log: [] });
    }
  });

  app.post('/api/projects/:id/plugins/contribute-open-design', async (req, res) => {
    try {
      const project = getProject(db, req.params.id);
      if (!project) {
        sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
        return;
      }
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const relativePath = normalizeProjectPluginFolderPath(body.path);
      const projectRoot = resolveProjectDir(PROJECTS_DIR, req.params.id, project.metadata);
      const folder = await resolveProjectChildDirectory(projectRoot, relativePath);
      const gh = await ensureGhReady();
      if (!gh.ok) {
        res.status(409).json(gh);
        return;
      }
      const meta = await readProjectPluginManifest(folder);
      const repoName = githubRepoNameFromPluginName(meta.name);
      const user = await execFileBuffered('gh', ['api', 'user', '--jq', '.login'], { timeout: 20_000 });
      if (!user.ok || !user.stdout) {
        res.status(409).json({
          ok: false,
          code: 'gh-user-unavailable',
          message: 'Could not read the authenticated GitHub user from gh.',
          log: [...(gh.log ?? []), user.stderr || user.stdout],
        });
        return;
      }
      const login = user.stdout.trim();
      const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'od-plugin-pr-'));
      const work = path.join(tmp, 'open-design');
      const branch = `plugin/${repoName}-${Date.now()}`;
      const dest = path.join(work, 'plugins', 'community', repoName);
      const bodyText = [
        `Adds ${meta.title} as a community Open Design plugin.`,
        '',
        '## Source',
        '',
        `- Generated from project: ${project.id}`,
        `- Manifest name: \`${meta.name}\``,
        `- Version: \`${meta.version}\``,
        '',
        '## Checklist',
        '',
        '- [ ] Maintainer reviewed manifest metadata',
        '- [ ] Maintainer verified plugin skill instructions',
      ].join('\n');
      const log = [...(gh.log ?? [])];
      for (const [cmd, args, opts] of [
        ['gh', ['repo', 'fork', 'nexu-io/open-design', '--remote=false'], { cwd: tmp }],
        ['gh', ['repo', 'clone', 'nexu-io/open-design', work], { cwd: tmp }],
        ['git', ['checkout', '-b', branch], { cwd: work }],
        ['git', ['remote', 'add', 'fork', `https://github.com/${login}/open-design.git`], { cwd: work }],
      ]) {
        const result = await execFileBuffered(cmd, args, opts);
        log.push(result.stdout || result.stderr);
        const toleratedExistingFork =
          cmd === 'gh' && args[0] === 'repo' && args[1] === 'fork' &&
          /already exists|existing fork/i.test(String(result.stderr || result.stdout));
        const toleratedExistingRemote =
          cmd === 'git' && args[0] === 'remote' &&
          /already exists/i.test(String(result.stderr || result.stdout));
        if (!result.ok && !toleratedExistingFork && !toleratedExistingRemote) {
          await fs.promises.rm(tmp, { recursive: true, force: true }).catch(() => undefined);
          res.status(500).json({ ok: false, code: `${cmd}-failed`, message: `${cmd} failed while preparing the Open Design PR.`, log });
          return;
        }
      }
      await fs.promises.mkdir(path.dirname(dest), { recursive: true });
      await fs.promises.cp(folder, dest, { recursive: true });
      for (const [cmd, args] of [
        ['git', ['add', `plugins/community/${repoName}`]],
        ['git', ['-c', 'user.name=Open Design', '-c', 'user.email=open-design@example.invalid', 'commit', '-m', `Add ${meta.title} plugin`]],
        ['git', ['push', '-u', 'fork', branch]],
      ]) {
        const result = await execFileBuffered(cmd, args, { cwd: work });
        log.push(result.stdout || result.stderr);
        if (!result.ok) {
          await fs.promises.rm(tmp, { recursive: true, force: true }).catch(() => undefined);
          res.status(500).json({ ok: false, code: `${cmd}-failed`, message: `${cmd} failed while preparing the Open Design PR.`, log });
          return;
        }
      }
      const pr = await execFileBuffered('gh', [
        'pr',
        'create',
        '--repo',
        'nexu-io/open-design',
        '--head',
        `${login}:${branch}`,
        '--base',
        'main',
        '--title',
        `Add ${meta.title} plugin`,
        '--body',
        bodyText,
      ], { cwd: work });
      log.push(pr.stdout || pr.stderr);
      await fs.promises.rm(tmp, { recursive: true, force: true }).catch(() => undefined);
      if (!pr.ok) {
        res.status(500).json({ ok: false, code: 'gh-pr-create-failed', message: 'Open Design PR creation failed.', log });
        return;
      }
      res.json({
        ok: true,
        message: `Created Open Design PR for ${meta.title}.`,
        url: pr.stdout || undefined,
        log,
      });
    } catch (err) {
      res.status(400).json({ ok: false, message: String(err?.message || err), log: [] });
    }
  });

  app.get('/api/projects/:id/search', async (req, res) => {
    try {
      const query = String(req.query.q ?? '');
      if (!query) {
        sendApiError(res, 400, 'BAD_REQUEST', 'q query parameter is required');
        return;
      }
      const pattern = req.query.pattern ? String(req.query.pattern) : null;
      const max = Math.min(Number(req.query.max) || 200, 1000);
      const searchProject = getProject(db, req.params.id);
      const matches = await searchProjectFiles(PROJECTS_DIR, req.params.id, query, {
        pattern,
        max,
        metadata: searchProject?.metadata,
      });
      res.json({ query, matches });
    } catch (err) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err));
    }
  });

  // Streams a ZIP of the project's on-disk tree so the "Download as .zip"
  // share menu can hand the user the actual files they uploaded — e.g. the
  // imported `ui-design/` folder — instead of a one-file snapshot of the
  // rendered HTML. `root` scopes the archive to a subdirectory; without
  // it, the whole project is packed.
  app.get('/api/projects/:id/archive', async (req, res) => {
    try {
      const root = typeof req.query?.root === 'string' ? req.query.root : '';
      const project = getProject(db, req.params.id);
      const { buffer, baseName } = await buildProjectArchive(
        PROJECTS_DIR,
        req.params.id,
        root,
        project?.metadata,
      );
      const fallbackName = project?.name || req.params.id;
      const fileSlug = sanitizeArchiveFilename(baseName || fallbackName) || 'project';
      const filename = `${fileSlug}.zip`;
      // RFC 5987 dance: legacy `filename=` carries an ASCII fallback, while
      // `filename*=UTF-8''…` lets modern browsers pick up project names
      // with non-ASCII characters (accents, CJK, etc.) without mojibake.
      const asciiFallback =
        filename.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '_') || 'project.zip';
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      );
      res.send(buffer);
    } catch (err) {
      const code = err && err.code;
      const status = code === 'ENOENT' || code === 'ENOTDIR' ? 404 : 400;
      sendApiError(
        res,
        status,
        status === 404 ? 'FILE_NOT_FOUND' : 'BAD_REQUEST',
        String(err?.message || err),
      );
    }
  });

  // Batch archive: accepts a list of file names and returns a ZIP of just
  // those files. Used by the Design Files panel multi-select download.
  app.post('/api/projects/:id/archive/batch', async (req, res) => {
    try {
      const { files } = req.body || {};
      if (!Array.isArray(files) || files.length === 0) {
        sendApiError(res, 400, 'BAD_REQUEST', 'files must be a non-empty array');
        return;
      }
      const project = getProject(db, req.params.id);
      const { buffer } = await buildBatchArchive(
        PROJECTS_DIR,
        req.params.id,
        files,
        project?.metadata,
      );
      const fileSlug = sanitizeArchiveFilename(project?.name || req.params.id) || 'project';
      const filename = `${fileSlug}.zip`;
      const asciiFallback =
        filename.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '_') || 'project.zip';
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      );
      res.send(buffer);
    } catch (err) {
      const code = err && err.code;
      const status = code === 'ENOENT' ? 404 : 400;
      sendApiError(
        res,
        status,
        status === 404 ? 'FILE_NOT_FOUND' : 'BAD_REQUEST',
        String(err?.message || err),
      );
    }
  });

  // Preflight for the raw file route. Current artifact fetches are simple GETs
  // (no preflight needed), but an explicit handler future-proofs the route if
  // artifacts ever add custom request headers.
  app.options('/api/projects/:id/raw/*', (req, res) => {
    if (req.headers.origin === 'null') {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET');
      res.header('Access-Control-Allow-Headers', 'Content-Type');
    }
    res.sendStatus(204);
  });

  app.get('/api/projects/:id/raw/*', async (req, res) => {
    try {
      const relPath = req.params[0];
      const project = getProject(db, req.params.id);
      const file = await readProjectFile(PROJECTS_DIR, req.params.id, relPath, project?.metadata);
      // PreviewModal loads artifact HTML via srcdoc, giving the iframe Origin: "null".
      // data: URIs, file://, and some sandboxed iframes also send null — all are
      // local-only callers, so this is safe. Real cross-origin sites send a real
      // origin and remain blocked by the browser's same-origin policy.
      if (req.headers.origin === 'null') {
        res.header('Access-Control-Allow-Origin', '*');
      }
      res.type(file.mime).send(file.buffer);
    } catch (err) {
      const status = err && err.code === 'ENOENT' ? 404 : 400;
      sendApiError(
        res,
        status,
        status === 404 ? 'FILE_NOT_FOUND' : 'BAD_REQUEST',
        String(err),
      );
    }
  });

  app.post('/api/projects/:id/export/pdf', async (req, res) => {
    if (typeof desktopPdfExporter !== 'function') {
      return sendApiError(
        res,
        501,
        'UPSTREAM_UNAVAILABLE',
        'desktop PDF export is only available in the desktop runtime',
      );
    }
    try {
      const { fileName, title, deck } = req.body || {};
      if (typeof fileName !== 'string' || fileName.length === 0) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'fileName required');
      }
      const input = await buildDesktopPdfExportInput({
        daemonUrl,
        deck: deck === true,
        fileName,
        projectId: req.params.id,
        projectsRoot: PROJECTS_DIR,
        title: typeof title === 'string' ? title : undefined,
      });
      const result = await desktopPdfExporter(input);
      res.json(result);
    } catch (err) {
      const status = err && err.code === 'ENOENT' ? 404 : 400;
      sendApiError(
        res,
        status,
        status === 404 ? 'FILE_NOT_FOUND' : 'BAD_REQUEST',
        String(err?.message || err),
      );
    }
  });

  app.delete('/api/projects/:id/raw/*', async (req, res) => {
    try {
      const project = getProject(db, req.params.id);
      await deleteProjectFile(PROJECTS_DIR, req.params.id, req.params[0], project?.metadata);
      /** @type {import('@open-design/contracts').DeleteProjectFileResponse} */
      const body = { ok: true };
      res.json(body);
    } catch (err) {
      const status = err && err.code === 'ENOENT' ? 404 : 400;
      sendApiError(
        res,
        status,
        status === 404 ? 'FILE_NOT_FOUND' : 'BAD_REQUEST',
        String(err),
      );
    }
  });

  app.get('/api/projects/:id/files/:name/preview', async (req, res) => {
    try {
      const project = getProject(db, req.params.id);
      const file = await readProjectFile(
        PROJECTS_DIR,
        req.params.id,
        req.params.name,
        project?.metadata,
      );
      const preview = await buildDocumentPreview(file);
      res.json(preview);
    } catch (err) {
      const status =
        err && err.statusCode
          ? err.statusCode
          : err && err.code === 'ENOENT'
            ? 404
            : 400;
      sendApiError(
        res,
        status,
        status === 404 ? 'FILE_NOT_FOUND' : 'BAD_REQUEST',
        err?.message || 'preview unavailable',
      );
    }
  });

  app.get('/api/projects/:id/files/*', async (req, res) => {
    try {
      const project = getProject(db, req.params.id);
      const file = await readProjectFile(
        PROJECTS_DIR,
        req.params.id,
        req.params[0],
        project?.metadata,
      );
      res.type(file.mime).send(file.buffer);
    } catch (err) {
      const status = err && err.code === 'ENOENT' ? 404 : 400;
      sendApiError(
        res,
        status,
        status === 404 ? 'FILE_NOT_FOUND' : 'BAD_REQUEST',
        String(err),
      );
    }
  });

  // Two ways to upload: multipart for binary files (images), and JSON
  // {name, content, encoding} for sketches and pasted text. The frontend
  // uses both depending on the file source.
  app.post(
    '/api/projects/:id/files',
    (req, res, next) => {
      upload.single('file')(req, res, (err) => {
        if (err) return sendMulterError(res, err);
        next();
      });
    },
    async (req, res) => {
      try {
        const uploadProject = getProject(db, req.params.id);
        await ensureProject(PROJECTS_DIR, req.params.id, uploadProject?.metadata);
        if (req.file) {
          const buf = await fs.promises.readFile(req.file.path);
          const desiredName = sanitizeName(
            req.body?.name || req.file.originalname,
          );
          const meta = await writeProjectFile(
            PROJECTS_DIR,
            req.params.id,
            desiredName,
            buf,
            {},
            uploadProject?.metadata,
          );
          fs.promises.unlink(req.file.path).catch(() => {});
          /** @type {import('@open-design/contracts').ProjectFileResponse} */
          const body = { file: meta };
          return res.json(body);
        }
        const { name, content, encoding, artifactManifest } = req.body || {};
        if (typeof name !== 'string' || typeof content !== 'string') {
          return sendApiError(
            res,
            400,
            'BAD_REQUEST',
            'name and content required',
          );
        }
        if (artifactManifest !== undefined && artifactManifest !== null) {
          const validated = validateArtifactManifestInput(
            artifactManifest,
            name,
          );
          if (!validated.ok) {
            return sendApiError(
              res,
              400,
              'BAD_REQUEST',
              `invalid artifactManifest: ${validated.error}`,
            );
          }
        }
        const buf =
          encoding === 'base64'
            ? Buffer.from(content, 'base64')
            : Buffer.from(content, 'utf8');
        const meta = await writeProjectFile(
          PROJECTS_DIR,
          req.params.id,
          name,
          buf,
          { artifactManifest },
          uploadProject?.metadata,
        );
        /** @type {import('@open-design/contracts').ProjectFileResponse} */
        const body = { file: meta };
        res.json(body);
      } catch (err) {
        sendApiError(res, 500, 'INTERNAL_ERROR', 'upload failed');
      }
    },
  );

  app.delete('/api/projects/:id/files/:name', async (req, res) => {
    try {
      const delProject = getProject(db, req.params.id);
      await deleteProjectFile(PROJECTS_DIR, req.params.id, req.params.name, delProject?.metadata);
      /** @type {import('@open-design/contracts').DeleteProjectFileResponse} */
      const body = { ok: true };
      res.json(body);
    } catch (err) {
      const status = err && err.code === 'ENOENT' ? 404 : 400;
      sendApiError(
        res,
        status,
        status === 404 ? 'FILE_NOT_FOUND' : 'BAD_REQUEST',
        String(err),
      );
    }
  });

  app.get('/api/media/models', (_req, res) => {
    res.json({
      providers: MEDIA_PROVIDERS,
      image: IMAGE_MODELS,
      video: VIDEO_MODELS,
      audio: AUDIO_MODELS_BY_KIND,
      aspects: MEDIA_ASPECTS,
      videoLengthsSec: VIDEO_LENGTHS_SEC,
      audioDurationsSec: AUDIO_DURATIONS_SEC,
    });
  });

  app.get('/api/media/config', async (_req, res) => {
    try {
      const cfg = await readMaskedConfig(PROJECT_ROOT);
      res.json(cfg);
    } catch (err) {
      res
        .status(500)
        .json({ error: String(err && err.message ? err.message : err) });
    }
  });

  app.put('/api/media/config', async (req, res) => {
    try {
      const cfg = await writeConfig(PROJECT_ROOT, req.body);
      res.json(cfg);
    } catch (err) {
      const status = typeof err?.status === 'number' ? err.status : 400;
      res
        .status(status)
        .json({ error: String(err && err.message ? err.message : err) });
    }
  });

  app.get('/api/app-config', async (req, res) => {
    if (!isLocalSameOrigin(req, resolvedPort)) {
      return res.status(403).json({ error: 'cross-origin request rejected' });
    }
    try {
      const config = await readAppConfig(RUNTIME_DATA_DIR);
      res.json({ config });
    } catch (err) {
      res
        .status(500)
        .json({ error: String(err && err.message ? err.message : err) });
    }
  });

  app.put('/api/app-config', async (req, res) => {
    if (!isLocalSameOrigin(req, resolvedPort)) {
      return res.status(403).json({ error: 'cross-origin request rejected' });
    }
    try {
      const config = await writeAppConfig(RUNTIME_DATA_DIR, req.body);
      orbitService.configure(config.orbit);
      res.json({ config });
    } catch (err) {
      res
        .status(500)
        .json({ error: String(err && err.message ? err.message : err) });
    }
  });

  app.get('/api/orbit/status', async (req, res) => {
    if (!isLocalSameOrigin(req, resolvedPort)) {
      return res.status(403).json({ error: 'cross-origin request rejected' });
    }
    try {
      res.json(await orbitService.status());
    } catch (err) {
      res
        .status(500)
        .json({ error: String(err && err.message ? err.message : err) });
    }
  });

  app.post('/api/orbit/run', async (req, res) => {
    if (!isLocalSameOrigin(req, resolvedPort)) {
      return res.status(403).json({ error: 'cross-origin request rejected' });
    }
    try {
      res.json(await orbitService.start('manual'));
    } catch (err) {
      res
        .status(500)
        .json({ error: String(err && err.message ? err.message : err) });
    }
  });

  // Native OS folder picker dialog. Returns { path: string | null }.
  app.post('/api/dialog/open-folder', async (req, res) => {
    if (!isLocalSameOrigin(req, resolvedPort)) {
      return res.status(403).json({ error: 'cross-origin request rejected' });
    }
    try {
      const selected = await openNativeFolderDialog();
      res.json({ path: selected });
    } catch (err) {
      res
        .status(500)
        .json({ error: String(err && err.message ? err.message : err) });
    }
  });

  app.post('/api/projects/:id/media/generate', async (req, res) => {
    if (!isLocalSameOrigin(req, resolvedPort)) {
      return res.status(403).json({
        error:
          'cross-origin request rejected: media generation is restricted to the local UI / CLI',
      });
    }

    try {
      const projectId = req.params.id;
      const project = getProject(db, projectId);
      if (!project) return res.status(404).json({ error: 'project not found' });

      const taskId = randomUUID();
      const task = createMediaTask(db, taskId, projectId, {
        surface: req.body?.surface,
        model: req.body?.model,
      });
      console.error(
        `[task ${taskId.slice(0, 8)}] queued model=${req.body?.model} ` +
          `surface=${req.body?.surface} ` +
          `image=${req.body?.image ? 'yes' : 'no'} ` +
          `compositionDir=${req.body?.compositionDir ? 'yes' : 'no'}`,
      );

      task.status = 'running';
      persistMediaTask(db, task);
      generateMedia({
        projectRoot: PROJECT_ROOT,
        projectsRoot: PROJECTS_DIR,
        projectId,
        surface: req.body?.surface,
        model: req.body?.model,
        prompt: req.body?.prompt,
        output: req.body?.output,
        aspect: req.body?.aspect,
        length:
          typeof req.body?.length === 'number' ? req.body.length : undefined,
        duration:
          typeof req.body?.duration === 'number'
            ? req.body.duration
            : undefined,
        voice: req.body?.voice,
        audioKind: req.body?.audioKind,
        language: typeof req.body?.language === 'string' ? req.body.language : undefined,
        compositionDir: req.body?.compositionDir,
        image: req.body?.image,
        onProgress: (line) => appendTaskProgress(db, task, line),
      })
        .then((meta) => {
          task.status = 'done';
          task.file = meta;
          task.endedAt = Date.now();
          persistMediaTask(db, task);
          notifyTaskWaiters(db, task);
          console.error(
            `[task ${taskId.slice(0, 8)}] done size=${meta?.size} mime=${meta?.mime} ` +
              `elapsed=${Math.round((task.endedAt - task.startedAt) / 1000)}s`,
          );
        })
        .catch((err) => {
          task.status = 'failed';
          task.error = {
            message: String(err && err.message ? err.message : err),
            status: typeof err?.status === 'number' ? err.status : 400,
            code: err?.code,
          };
          task.endedAt = Date.now();
          persistMediaTask(db, task);
          notifyTaskWaiters(db, task);
          console.error(
            `[task ${taskId.slice(0, 8)}] failed status=${task.error.status} ` +
              `message=${(task.error.message || '').slice(0, 240)}`,
          );
        });

      res.status(202).json({
        taskId,
        status: task.status,
        startedAt: task.startedAt,
      });
    } catch (err) {
      const status = typeof err?.status === 'number' ? err.status : 400;
      const code = err?.code;
      const body = { error: String(err && err.message ? err.message : err) };
      if (code) body.code = code;
      res.status(status).json(body);
    }
  });

  app.post('/api/research/search', async (req, res) => {
    if (!isLocalSameOrigin(req, resolvedPort)) {
      return res.status(403).json({
        error:
          'cross-origin request rejected: research search is restricted to the local UI / CLI',
      });
    }

    try {
      const result = await searchResearch({
        projectRoot: PROJECT_ROOT,
        query: req.body?.query,
        maxSources:
          typeof req.body?.maxSources === 'number'
            ? req.body.maxSources
            : undefined,
        providers: Array.isArray(req.body?.providers)
          ? req.body.providers
          : undefined,
      });
      res.json(result);
    } catch (err) {
      if (err instanceof ResearchError) {
        return res.status(err.status).json({
          error: { code: err.code, message: err.message },
        });
      }
      res.status(500).json({
        error: {
          code: 'RESEARCH_FAILED',
          message: String(err && err.message ? err.message : err),
        },
      });
    }
  });

  app.post('/api/media/tasks/:id/wait', async (req, res) => {
    if (!isLocalSameOrigin(req, resolvedPort)) {
      return res.status(403).json({ error: 'cross-origin request rejected' });
    }
    const taskId = req.params.id;
    const task = getLiveMediaTask(db, taskId);
    if (!task) return res.status(404).json({ error: 'task not found' });

    const since = Number.isFinite(req.body?.since) ? Number(req.body.since) : 0;
    const requestedTimeout = Number.isFinite(req.body?.timeoutMs)
      ? Number(req.body.timeoutMs)
      : 25_000;
    const timeoutMs = Math.min(Math.max(requestedTimeout, 0), 25_000);

    const respond = () => {
      if (res.writableEnded) return;
      res.json(mediaTaskSnapshot(task, since));
    };

    if (
      MEDIA_TERMINAL_STATUSES.has(task.status) ||
      task.progress.length > since
    ) {
      return respond();
    }

    let resolved = false;
    const wake = () => {
      if (resolved) return;
      resolved = true;
      task.waiters.delete(wake);
      clearTimeout(timer);
      respond();
    };
    task.waiters.add(wake);
    const timer = setTimeout(wake, timeoutMs);
    res.on('close', wake);
  });

  app.get('/api/projects/:id/media/tasks', (req, res) => {
    if (!isLocalSameOrigin(req, resolvedPort)) {
      return res.status(403).json({ error: 'cross-origin request rejected' });
    }
    const projectId = req.params.id;
    const includeDone =
      req.query.includeDone === '1' || req.query.includeDone === 'true';
    const tasks = listMediaTasksByProject(db, projectId, {
      includeTerminal: includeDone,
    }).map((t) => ({
      taskId: t.id,
      status: t.status,
      startedAt: t.startedAt,
      endedAt: t.endedAt,
      elapsed: Math.round(((t.endedAt ?? Date.now()) - t.startedAt) / 1000),
      surface: t.surface,
      model: t.model,
      progress: t.progress.slice(-3),
      progressCount: t.progress.length,
      ...(t.status === 'done' ? { file: t.file } : {}),
      ...(t.status === 'failed' || t.status === 'interrupted' ? { error: t.error } : {}),
    }));
    tasks.sort((a, b) => b.startedAt - a.startedAt);
    res.json({ tasks });
  });

  // Multi-file upload that the chat composer uses for paste/drop/picker.
  // Files land flat in the project folder; the response carries the same
  // metadata as listFiles so the client can stage them as ChatAttachments
  // without a separate refetch.
  app.post(
    '/api/projects/:id/upload',
    handleProjectUpload,
    async (req, res) => {
      try {
        const incoming = Array.isArray(req.files) ? req.files : [];
        const out = [];
        for (const f of incoming) {
          try {
            const stat = await fs.promises.stat(f.path);
            out.push({
              name: f.filename,
              path: f.filename,
              size: stat.size,
              mtime: stat.mtimeMs,
              originalName: f.originalname,
            });
          } catch {
            // skip files that vanished mid-flight
          }
        }
        /** @type {import('@open-design/contracts').UploadProjectFilesResponse} */
        const body = { files: out };
        res.json(body);
      } catch (err) {
        sendApiError(res, 500, 'INTERNAL_ERROR', 'upload failed');
      }
    },
  );

  // `design` already declared once above (after the chat-run service is
  // wired into the main daemon dependency graph). The garnet legacy block
  // re-introduced it here; duplicate declarations crash the esbuild
  // transformer at boot. Re-using the earlier `design` is correct — the
  // inline routes below want the same runs service as the registered
  // route modules.
  // main: file-upload routes lifted to a dedicated module. Keep alongside the
  // inline routes garnet still owns above; duplicate registrations resolve in
  // a follow-up after route-routes.ts vs garnet inline coverage is audited.
  registerProjectUploadRoutes(app, { http: httpDeps, uploads: uploadDeps, node: nodeDeps });

  const composeDaemonSystemPrompt = async ({
    agentId,
    projectId,
    skillId,
    designSystemId,
    streamFormat,
    connectedExternalMcp,
    appliedPluginSnapshotId,
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

    let skillBody;
    let skillName;
    let skillMode;
    let skillCraftRequires = [];
    let activeSkillDir = null;
    // Per-skill Critique Theater override sourced from
    // `od.critique.policy` in the resolved skill's SKILL.md frontmatter.
    // `null` means the skill has no opinion and the lower-priority tiers
    // (project override, env override, rollout phase default) decide.
    let skillCritiquePolicy: SkillCritiquePolicy = null;
    if (effectiveSkillId) {
      // Span both functional skills and design templates so a project
      // saved against either surface keeps its system prompt after the
      // skills/design-templates split. See specs/current/skills-and-design-templates.md.
      const skill = findSkillById(
        await listAllSkillLikeEntries(),
        effectiveSkillId,
      );
      if (skill) {
        skillBody = skill.body;
        skillName = skill.name;
        skillMode = skill.mode;
        activeSkillDir = skill.dir;
        skillCritiquePolicy = skill.critiquePolicy;
        if (Array.isArray(skill.craftRequires))
          skillCraftRequires = skill.craftRequires;
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
          const plugin = getInstalledPlugin(db, snap.pluginId);
          if (plugin) {
            const { loadPluginLocalSkill } = await import('./plugins/local-skill.js');
            const local = await loadPluginLocalSkill(plugin);
            if (local) {
              skillBody = local.body;
              skillName = local.name;
              activeSkillDir = local.dir;
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
    if (skillCraftRequires.length > 0) {
      const loaded = await loadCraftSections(CRAFT_DIR, skillCraftRequires);
      if (loaded.body) {
        craftBody = loaded.body;
        craftSections = loaded.sections;
      }
    }

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

    // Project-level custom instructions from the projects table.
    const projectInstructions = project?.customInstructions ?? '';

    let designSystemBody;
    let designSystemTitle;
    // Compiled (tokens.css + components.html) form of the active brand.
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
    let designSystemTokensCss;
    let designSystemFixtureHtml;
    if (effectiveDesignSystemId) {
      const systems = await listAllDesignSystems();
      const summary = systems.find((s) => s.id === effectiveDesignSystemId);
      designSystemTitle = summary?.title;
      designSystemBody =
        (await readDesignSystem(DESIGN_SYSTEMS_DIR, effectiveDesignSystemId)) ??
        (await readDesignSystem(USER_DESIGN_SYSTEMS_DIR, effectiveDesignSystemId)) ??
        undefined;
      // Single seam: env gate + built-in→user-installed fallback chain
      // live together inside `resolveDesignSystemAssets` so the whole
      // server-side asset-resolution path can be tested end-to-end
      // from real disk fixtures (see `tests/design-system-assets.test.ts`).
      const assets = await resolveDesignSystemAssets(
        effectiveDesignSystemId,
        DESIGN_SYSTEMS_DIR,
        USER_DESIGN_SYSTEMS_DIR,
      );
      designSystemTokensCss = assets.tokensCss;
      designSystemFixtureHtml = assets.fixtureHtml;
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
    const critiqueSkill = critiqueEnabledForRun && typeof effectiveSkillId === 'string'
      ? { id: effectiveSkillId }
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
    const isMediaSurface =
      skillMode === 'image' ||
      skillMode === 'video' ||
      skillMode === 'audio' ||
      metadata?.kind === 'image' ||
      metadata?.kind === 'video' ||
      metadata?.kind === 'audio';
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
      designSystemBody,
      designSystemTitle,
      designSystemTokensCss,
      designSystemFixtureHtml,
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
      streamFormat,
      connectedExternalMcp: Array.isArray(connectedExternalMcp)
        ? connectedExternalMcp
        : undefined,
      ...(pluginBlock ? { pluginBlock } : {}),
      ...(activeStageBlocks ? { activeStageBlocks } : {}),
      userInstructions,
      projectInstructions,
    });
    // The chat handler also needs to know where the active skill lives
    // on disk so it can stage a per-project copy of its side files
    // before spawning the agent. Returning that here avoids a second
    // `listSkills()` scan in `startChatRun`. critiqueShouldRun threads
    // the same panel-eligibility decision down to the spawn-path
    // orchestrator gate so prompt and orchestrator stay in lockstep.
    return { prompt, activeSkillDir, critiqueShouldRun };
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
      designSystemId,
      attachments = [],
      commentAttachments = [],
      model,
      reasoning,
      research,
    } = chatBody;
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
    const def = getAgentDef(agentId);
    if (!def)
      return design.runs.fail(
        run,
        'AGENT_UNAVAILABLE',
        `unknown agent: ${agentId}`,
      );
    if (!def.bin)
      return design.runs.fail(run, 'AGENT_UNAVAILABLE', 'agent has no binary');
    const safeCommentAttachments =
      normalizeCommentAttachments(commentAttachments);
    if (
      (typeof message !== 'string' || !message.trim()) &&
      safeCommentAttachments.length === 0
    ) {
      return design.runs.fail(run, 'BAD_REQUEST', 'message required');
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
    if (typeof message === 'string' && message.trim().length > 0) {
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
    // For git-linked projects (metadata.baseDir), use that folder directly
    // so the agent writes back to the user's original source tree.
    let cwd = null;
    let existingProjectFiles = [];
    if (typeof projectId === 'string' && projectId) {
      try {
        const chatProject = getProject(db, projectId);
        const chatMeta = chatProject?.metadata;
        if (chatMeta?.baseDir) {
          cwd = path.normalize(chatMeta.baseDir);
          existingProjectFiles = await listFiles(PROJECTS_DIR, projectId, { metadata: chatMeta });
        } else {
          cwd = await ensureProject(PROJECTS_DIR, projectId);
          existingProjectFiles = await listFiles(PROJECTS_DIR, projectId);
        }
      } catch {
        cwd = null;
      }
    }
    if (run.cancelRequested || design.runs.isTerminal(run.status)) return;

    // Sanitise supplied image paths: must live under UPLOAD_DIR.
    const safeImages = imagePaths.filter((p) => {
      const resolved = path.resolve(p);
      return (
        resolved.startsWith(UPLOAD_DIR + path.sep) && fs.existsSync(resolved)
      );
    });

    // Project-scoped attachments: project-relative paths inside cwd. Each
    // is run through the same path-traversal guard the file CRUD endpoints
    // use, then existence-checked. Whatever survives shows up as an
    // explicit list at the bottom of the user message so the agent knows
    // to Read it.
    const safeAttachments = cwd
      ? (Array.isArray(attachments) ? attachments : [])
          .filter((p) => typeof p === 'string' && p.length > 0)
          .filter((p) => {
            try {
              const abs = path.resolve(cwd, p);
              return (
                (abs === cwd || abs.startsWith(cwd + path.sep)) &&
                fs.existsSync(abs)
              );
            } catch {
              return false;
            }
          })
      : [];

    // Local code agents don't accept a separate "system" channel the way the
    // Messages API does — we fold the skill + design-system prompt into the
    // user message. The <artifact> wrapping instruction comes from
    // systemPrompt. We also stitch in the cwd hint so the agent knows
    // where its file tools should write, and the attachment list so it
    // doesn't have to guess what the user just dropped in.
    // Also ship the current file listing so the agent can pick a unique
    // filename instead of clobbering a previous artifact.
    const filesListBlock = existingProjectFiles.length
      ? `\nFiles already in this folder (do NOT overwrite unless the user asks; pick a fresh, descriptive name for new artifacts):\n${existingProjectFiles
          .map((f) => `- ${f.name}`)
          .join('\n')}`
      : '\nThis folder is empty. Choose a clear, descriptive filename for whatever you create.';
    const projectRecord =
      typeof projectId === 'string' && projectId
        ? getProject(db, projectId)
        : null;
    const linkedDirs = (() => {
      if (!Array.isArray(projectRecord?.metadata?.linkedDirs)) return [];
      const v = validateLinkedDirs(projectRecord.metadata.linkedDirs);
      return v.dirs ?? [];
    })();
    const cwdHint = cwd
      ? `\n\nYour working directory: ${cwd}\nWrite project files relative to it (e.g. \`index.html\`, \`assets/x.png\`). The user can browse those files in real time.${filesListBlock}`
      : '';
    const linkedDirsHint = linkedDirs.length > 0
      ? `\n\nLinked code folders (read-only reference code the user wants you to see):\n${
          linkedDirs.map((d) => `- \`${d}\``).join('\n')
        }`
      : '';
    const attachmentHint = safeAttachments.length
      ? `\n\nAttached project files: ${safeAttachments.map((p) => `\`${p}\``).join(', ')}`
      : '';
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
    try {
      externalMcpConfig = await readMcpConfig(RUNTIME_DATA_DIR);
    } catch (err) {
      console.warn(
        '[mcp-config] read failed:',
        err && err.message ? err.message : err,
      );
    }
    const enabledExternalMcp = externalMcpConfig.servers.filter((s) => s.enabled);
    const oauthTokensForSpawn = {};
    try {
      const stored = await readAllTokens(RUNTIME_DATA_DIR);
      for (const [serverId, tok] of Object.entries(stored)) {
        if (!enabledExternalMcp.find((s) => s.id === serverId)) continue;
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
    const connectedExternalMcp = enabledExternalMcp
      .filter((s) => typeof oauthTokensForSpawn[s.id] === 'string')
      .map((s) => ({ id: s.id, label: s.label }));

    const { prompt: daemonSystemPrompt, activeSkillDir, critiqueShouldRun } =
      await composeDaemonSystemPrompt({
        agentId,
        projectId,
        skillId,
        designSystemId,
        streamFormat: def?.streamFormat ?? 'plain',
        connectedExternalMcp,
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
    //   1. CWD-relative copy. Stage the *active* skill into
    //      `<cwd>/.od-skills/<folder>/` so any agent CLI — not just the
    //      ones that honour `--add-dir` — can reach those files via a
    //      path inside its working directory. We copy (not symlink) so
    //      the staged directory is a true write barrier — agents cannot
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
    if (cwd && activeSkillDir) {
      const result = await stageActiveSkill(
        cwd,
        path.basename(activeSkillDir),
        activeSkillDir,
        (msg) => console.warn(msg),
      );
      if (!result.staged) {
        console.warn(
          `[od] skill-stage skipped: ${result.reason ?? 'unknown reason'}; falling back to absolute paths`,
        );
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
    let codexGeneratedImagesDir = resolveCodexGeneratedImagesDir(
      agentId,
      projectRecord?.metadata,
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
    });
    const researchCommandContract = resolveResearchCommandContract(
      research,
      message,
    );
    const clientInstructionPrompt = [researchCommandContract, systemPrompt]
      .map((part) => (typeof part === 'string' ? part.trim() : ''))
      .filter(Boolean)
      .join('\n\n---\n\n');
    const instructionPrompt = composeLiveInstructionPrompt({
      daemonSystemPrompt,
      runtimeToolPrompt,
      clientSystemPrompt: clientInstructionPrompt,
      finalPromptOverride: codexImagegenOverride,
    });
    const composed = [
      instructionPrompt
        ? `# Instructions (read first)\n\n${instructionPrompt}${cwdHint}${linkedDirsHint}\n\n---\n`
        : cwdHint
          ? `# Instructions${cwdHint}${linkedDirsHint}\n\n---\n`
          : linkedDirsHint
            ? `# Instructions${linkedDirsHint}\n\n---\n`
            : '',
      `# User request\n\n${message || '(No extra typed instruction.)'}${attachmentHint}${commentHint}`,
      safeImages.length
        ? `\n\n${safeImages.map((p) => `@${p}`).join(' ')}`
        : '',
    ].join('');
    // Per-agent model + reasoning the user picked in the model menu.
    // Trust the value when it matches the most recent /api/agents listing
    // (live or fallback). Otherwise allow it through if it passes a
    // permissive sanitizer — that's the path for user-typed custom model
    // ids the CLI's listing didn't surface yet.
    const safeModel =
      typeof model === 'string'
        ? isKnownModel(def, model)
          ? model
          : sanitizeCustomModel(model)
        : null;
    const safeReasoning =
      typeof reasoning === 'string' && Array.isArray(def.reasoningOptions)
        ? (def.reasoningOptions.find((r) => r.id === reasoning)?.id ?? null)
        : null;
    const agentOptions = { model: safeModel, reasoning: safeReasoning };
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
    if (def.id === 'claude' && isManagedProjectCwd(cwd, PROJECTS_DIR)) {
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
    if (enabledExternalMcp.length > 0 && def.streamFormat === 'acp-json-rpc') {
      const acpExternal = buildAcpMcpServers(enabledExternalMcp);
      mcpServers.push(...acpExternal);
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

    let configuredAgentEnv = {};
    try {
      const appConfig = await readAppConfig(RUNTIME_DATA_DIR);
      configuredAgentEnv = agentCliEnvForAgent(appConfig.agentCliEnv, def.id);
    } catch {
      configuredAgentEnv = {};
    }

    const agentLaunch = resolveAgentLaunch(def, configuredAgentEnv);
    const resolvedBin = agentLaunch.selectedPath;

    const args = def.buildArgs(
      composed,
      safeImages,
      extraAllowedDirs,
      agentOptions,
      { cwd: effectiveCwd },
    );

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

    const send = (event, data) => design.runs.emit(run, event, data);
    const inactivityTimeoutMs = resolveChatRunInactivityTimeoutMs();
    const inactivityKillGraceMs = 3_000;
    let inactivityTimer = null;
    let childStdoutSeen = false;
    let lastAgentEventPhase = 'spawn pending';
    let lastToolResultChars = 0;
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
        const text = typeof payload.text === 'string' ? payload.text : '';
        return `${type}:${text.length} chars`;
      }
      return type;
    };
    const clearInactivityWatchdog = () => {
      if (inactivityTimer) {
        clearTimeout(inactivityTimer);
        inactivityTimer = null;
      }
    };
    const scheduleForcedChildShutdown = () => {
      if (!child) return;
      setTimeout(() => {
        if (child && !child.killed) child.kill('SIGTERM');
      }, inactivityKillGraceMs).unref?.();
      setTimeout(() => {
        if (child && !child.killed) child.kill('SIGKILL');
      }, inactivityKillGraceMs * 2).unref?.();
    };
    const failForInactivity = () => {
      if (run.cancelRequested || design.runs.isTerminal(run.status)) return;
      const message =
        `Agent stalled without emitting any new output for ${Math.round(inactivityTimeoutMs / 1000)}s. ` +
        'The model or CLI likely hung while generating. ' +
        `Phase details: spawned agent binary ${resolvedBin}; stdout arrived: ${childStdoutSeen ? 'yes' : 'no'}; ` +
        `last agent event: ${lastAgentEventPhase}; largest tool result observed: ${lastToolResultChars} chars. ` +
        'Retry the turn, pick a different model, or start a new conversation if the prior context is very large.';
      clearInactivityWatchdog();
      send('error', createSseErrorPayload('AGENT_EXECUTION_FAILED', message, { retryable: true }));
      design.runs.finish(run, 'failed', 1, null);
      if (acpSession?.abort) {
        acpSession.abort();
      }
      if (child && !child.killed) child.kill('SIGTERM');
      scheduleForcedChildShutdown();
    };
    const noteAgentActivity = () => {
      if (inactivityTimeoutMs <= 0) return;
      clearInactivityWatchdog();
      inactivityTimer = setTimeout(failForInactivity, inactivityTimeoutMs);
      inactivityTimer.unref?.();
    };
    const unregisterChatAgentEventSink = () => {
      activeChatAgentEventSinks.delete(toolTokenGrant?.runId ?? runId);
    };
    if (toolTokenGrant?.runId) {
      activeChatAgentEventSinks.set(toolTokenGrant.runId, (payload) => {
        lastAgentEventPhase = summarizeAgentEventForInactivity(payload);
        noteAgentActivity();
        send('agent', payload);
      });
    }
    // If detection can't find the binary, surface a friendly SSE error
    // pointing at /api/agents instead of silently falling back to
    // spawn(def.bin) — that fallback re-introduces the exact ENOENT symptom
    // from issue #10.
    if (!resolvedBin || !agentLaunch.launchPath) {
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
      revokeToolToken('child_exit');
      unregisterChatAgentEventSink();
      return;
    }

    run.status = 'running';
    run.updatedAt = Date.now();
    send('start', {
      runId,
      agentId,
      bin: resolvedBin,
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
    try {
      // Prompt delivery via stdin is now the universal default. This bypasses
      // both the cmd.exe 8KB limit and the CreateProcess 32KB limit.
      const stdinMode =
        def.promptViaStdin || def.streamFormat === 'acp-json-rpc'
          ? 'pipe'
          : 'ignore';
      const env = applyAgentLaunchEnv({
        ...spawnEnvForAgent(
          def.id,
          {
            ...createAgentRuntimeEnv(process.env, daemonUrl, toolTokenGrant),
            ...(def.env || {}),
          },
          configuredAgentEnv,
        ),
        ...odMediaEnv,
      }, agentLaunch);
      spawnedAgentEnv = env;
      const invocation = createCommandInvocation({
        command: agentLaunch.launchPath,
        args,
        env,
      });
      child = spawn(invocation.command, invocation.args, {
        env,
        stdio: [stdinMode, 'pipe', 'pipe'],
        cwd: effectiveCwd,
        shell: false,
        // Required when invocation wraps a Windows .cmd/.bat shim through
        // cmd.exe; without this, Node re-escapes the inner command line and
        // breaks paths containing spaces (issue #315).
        windowsVerbatimArguments: invocation.windowsVerbatimArguments,
      });
      run.child = child;
      if (def.promptViaStdin && child.stdin && def.streamFormat !== 'pi-rpc') {
        // EPIPE from a fast-exiting CLI (bad auth, missing model, exit on
        // launch) would otherwise surface as an unhandled stream error and
        // crash the daemon. Swallow it — the regular exit/close handlers
        // below already route the underlying failure to SSE via stderr.
        child.stdin.on('error', (err) => {
          if (err.code !== 'EPIPE') {
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
          send('stderr', { chunk });
        });
        child.on('error', (err) => {
          send('error', createSseErrorPayload('AGENT_EXECUTION_FAILED', err.message));
        });

        // Wrap the child's close event so the orchestrator can race child
        // exit against parser completion, abort, and timeouts in one awaited
        // flow. Without this the orchestrator can't tell a non-zero exit
        // apart from a clean ship and may misclassify failures.
        const childExitPromise = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
          child.once('close', (code, signal) => resolve({ code, signal }));
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
    // Tracks whether any stream the run is using actually emitted user-
    // visible content. Only the streams routed through `sendAgentEvent`
    // contribute to this flag; ACP sessions and plain stdout streams are
    // covered by their own success/failure paths and the empty-output
    // guard below skips them via `trackingSubstantiveOutput`.
    let agentProducedOutput = false;
    let trackingSubstantiveOutput = false;
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
    const sendAgentEvent = (ev) => {
      if (ev?.type === 'error') {
        if (agentStreamError) return;
        agentStreamError = String(ev.message || 'Agent stream error');
        clearInactivityWatchdog();
        const authFailure = classifyAgentAuthFailure(
          agentId,
          [
            agentStreamError,
            typeof ev.raw === 'string' ? ev.raw : '',
            agentStdoutTail,
            agentStderrTail,
          ].join('\n'),
        );
        if (authFailure?.status === 'missing') {
          send('error', createSseErrorPayload(
            'AGENT_AUTH_REQUIRED',
            cursorAuthGuidance(),
            { retryable: true },
          ));
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
      if (ev?.type && SUBSTANTIVE_AGENT_EVENT_TYPES.has(ev.type)) {
        agentProducedOutput = true;
      }
      send('agent', ev);
    };

    if (def.streamFormat === 'claude-stream-json') {
      const claude = createClaudeStreamHandler((ev) => {
        lastAgentEventPhase = summarizeAgentEventForInactivity(ev);
        noteAgentActivity();
        send('agent', ev);
        // Stream-json input mode keeps the child's stdin open across the
        // turn so we can answer interactive tools like `AskUserQuestion`
        // with a real `tool_result`. The child has no other way to know
        // the conversation is over, though — without an EOF it sits idle
        // until the inactivity watchdog kills it. Bookkeeping here:
        //   - tool_use(AskUserQuestion): record the id so we know we owe
        //     the model a tool_result before the turn can end.
        //   - turn_end (per-turn synthesized from `stop_reason`): fire on
        //     `end_turn` etc. but NOT on `tool_use` — that stop reason
        //     means the model paused mid-tool, not "turn complete".
        //   - usage (session result at EOF in single-shot mode).
        try {
          if (run.stdinOpen) {
            if (
              ev &&
              typeof ev === 'object' &&
              ev.type === 'tool_use' &&
              (ev.name === 'AskUserQuestion' || ev.name === 'ask_user_question') &&
              typeof ev.id === 'string'
            ) {
              if (!run.pendingHostAnswers) run.pendingHostAnswers = new Set();
              run.pendingHostAnswers.add(ev.id);
            } else if (
              ev &&
              typeof ev === 'object' &&
              ((ev.type === 'turn_end' &&
                // `stop_reason: tool_use` means the model paused to wait
                // for tool execution (claude-code is about to run an
                // internal tool, or we owe a host tool_result). Either
                // way the conversation is still in flight — do not close.
                ev.stopReason !== 'tool_use') ||
                ev.type === 'usage') &&
              (!run.pendingHostAnswers || run.pendingHostAnswers.size === 0)
            ) {
              // Per-turn `turn_end` (synthesized from
              // `assistant.message.stop_reason` in `claude-stream`) is the
              // primary close signal; `usage` is the session-level result
              // that fires at EOF in single-shot mode. Either is a valid
              // "this turn is done" cue, but only when there's no host
              // answer outstanding AND the model isn't paused mid-tool.
              if (run.child && run.child.stdin && !run.child.stdin.destroyed) {
                try { run.child.stdin.end(); } catch {}
              }
              run.stdinOpen = false;
            }
          }
        } catch {}
      });
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
        send: (channel, payload) => {
          if (channel === 'agent') {
            sendAgentEvent(payload);
          } else if (channel === 'error') {
            if (agentStreamError) return;
            agentStreamError = String(payload?.message || 'Pi session error');
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
        imagePaths: def.supportsImagePaths ? safeImages : [],
        uploadRoot: UPLOAD_DIR,
      });
    } else if (def.streamFormat === 'acp-json-rpc') {
      const acpStageTimeoutMs = resolveAcpStageTimeoutMs();
      acpSession = attachAcpSession({
        child,
        prompt: composed,
        cwd: effectiveCwd,
        model: safeModel,
        mcpServers,
        send: (event, data) => {
          noteAgentActivity();
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
    } else {
      child.stdout.on('data', (chunk) => {
        noteAgentActivity();
        send('stdout', { chunk });
      });
    }
    // Wire the acpSession onto the run so cancel() can call abort()
    // instead of raw SIGTERM (applies to pi-rpc and acp-json-rpc).
    run.acpSession = acpSession;
    child.stderr.on('data', (chunk) => {
      noteAgentActivity();
      agentStderrTail = `${agentStderrTail}${chunk}`.slice(-2000);
      send('stderr', { chunk });
    });

    child.on('error', (err) => {
      clearInactivityWatchdog();
      revokeToolToken('child_exit');
      unregisterChatAgentEventSink();
      send('error', createSseErrorPayload('AGENT_EXECUTION_FAILED', err.message));
      design.runs.finish(run, 'failed', 1, null);
    });
    child.on('close', (code, signal) => {
      clearInactivityWatchdog();
      revokeToolToken('child_exit');
      unregisterChatAgentEventSink();
      if (acpSession?.hasFatalError()) {
        return design.runs.finish(run, 'failed', code ?? 1, signal ?? null);
      }
      if (agentStreamError) {
        return design.runs.finish(run, 'failed', code ?? 1, signal ?? null);
      }
      if (
        code !== 0 &&
        !run.cancelRequested &&
        classifyAgentAuthFailure(agentId, `${agentStderrTail}\n${agentStdoutTail}`)?.status === 'missing'
      ) {
        send('error', createSseErrorPayload(
          'AGENT_AUTH_REQUIRED',
          cursorAuthGuidance(),
          { retryable: true },
        ));
        return design.runs.finish(run, 'failed', code ?? 1, signal ?? null);
      }
      // Empty-output guard: a clean `code === 0` exit on a stream we are
      // tracking, with no error frame and no substantive event, means the
      // run silently finished without producing anything visible. That used
      // to be marked `succeeded` and rendered as an empty assistant turn —
      // see issue #691, where OpenCode runs were ending in ~3s with no
      // chat content and no error banner. Surface an explicit failure
      // instead so the chat shows a clear reason. ACP sessions and plain
      // stdout streams are gated out via `trackingSubstantiveOutput`;
      // their success/failure determination lives elsewhere.
      if (
        code === 0 &&
        !run.cancelRequested &&
        trackingSubstantiveOutput &&
        !agentProducedOutput
      ) {
        send('error', createSseErrorPayload(
          'AGENT_EXECUTION_FAILED',
          'Agent completed without producing any output. The model or provider may have returned an empty response — check the agent logs for upstream errors.',
          { retryable: true },
        ));
        return design.runs.finish(run, 'failed', code, signal);
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
      const acpForcedShutdown =
        code === null && signal === 'SIGTERM' && acpCleanCompletion;
      const status = run.cancelRequested
        ? 'canceled'
        : code === 0 || acpForcedShutdown
          ? 'succeeded'
          : 'failed';
      if (status === 'failed') {
        const diagnostic = diagnoseClaudeCliFailure({
          agentId: def.id,
          exitCode: code,
          signal,
          stderrTail: agentStderrTail,
          stdoutTail: agentStdoutTail,
          env: spawnedAgentEnv,
        });
        if (diagnostic) {
          send('error', createSseErrorPayload(
            'AGENT_EXECUTION_FAILED',
            diagnostic.message,
            { retryable: diagnostic.retryable, details: { detail: diagnostic.detail } },
          ));
        }
      }
      design.runs.finish(run, status, code, signal);
    });
    if (writePromptToChildStdin && child.stdin) {
      const promptInputFormat = def.promptInputFormat ?? 'text';
      if (promptInputFormat === 'stream-json') {
        // Wrap the prompt as an Anthropic user message and write it as one
        // JSONL line. Do NOT close stdin: claude-code keeps reading further
        // messages until EOF, which is what lets us inject a `tool_result`
        // block later when the user answers an `AskUserQuestion` card. The
        // stdin is closed implicitly when the child exits (run terminates,
        // user cancels, or the model finishes without an outstanding tool
        // call).
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

  // Send a `tool_result` content block into a still-running stream-json
  // child. Used for interactive tools that the host answers (currently:
  // Claude's `AskUserQuestion`). The run must still be active and its
  // stdin must still be open — we never re-spawn a closed child.
  const submitToolResultToRun = (runId, toolUseId, content, isError = false) => {
    const run = design.runs.get(runId);
    if (!run) return { ok: false, reason: 'not_found' };
    if (design.runs.isTerminal(run.status)) {
      return { ok: false, reason: 'run_terminal' };
    }
    if (!run.child || !run.child.stdin || run.child.stdin.destroyed) {
      return { ok: false, reason: 'stdin_closed' };
    }
    if (!run.stdinOpen) {
      return { ok: false, reason: 'stdin_text_mode' };
    }
    if (typeof toolUseId !== 'string' || !toolUseId) {
      return { ok: false, reason: 'bad_tool_use_id' };
    }
    const safeContent = typeof content === 'string' ? content : String(content ?? '');
    const userMessage = JSON.stringify({
      type: 'user',
      message: {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: toolUseId,
            content: safeContent,
            is_error: !!isError,
          },
        ],
      },
    });
    try {
      run.child.stdin.write(`${userMessage}\n`, 'utf8');
    } catch (err) {
      return { ok: false, reason: 'write_failed', error: err && err.message };
    }
    if (run.pendingHostAnswers) {
      run.pendingHostAnswers.delete(toolUseId);
      if (run.pendingHostAnswers.size === 0 && run.stdinOpen) {
        if (run.child && run.child.stdin && !run.child.stdin.destroyed) {
          try { run.child.stdin.end(); } catch {}
        }
        run.stdinOpen = false;
      }
    }
    return { ok: true };
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
        path.basename(template.dir),
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

  app.post('/api/runs', async (req, res) => {
    if (daemonShuttingDown) {
      return sendApiError(res, 503, 'UPSTREAM_UNAVAILABLE', 'daemon is shutting down');
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
    // plugin for the project's `metadata.kind` so direct callers (CLI /
    // SDK / agent-headless runs) get the same auto-binding the web
    // create flow already produces. The fallback is silent — a bundled
    // scenario that is not installed leaves the run plugin-less, which
    // matches the legacy path.
    let resolvedSnapshot = null;
    if (typeof req.body?.projectId === 'string' && req.body.projectId) {
      let registryView;
      try {
        registryView = await loadPluginRegistryView();
      } catch (err) {
        return res.status(500).json({ error: String(err) });
      }
      const explicitPlugin =
        req.body && (req.body.pluginId || req.body.appliedPluginSnapshotId);
      let runResolveBody = req.body;
      if (!explicitPlugin) {
        const projectRow = getProject(db, req.body.projectId);
        const hasPin =
          typeof projectRow?.appliedPluginSnapshotId === 'string'
          && projectRow.appliedPluginSnapshotId.length > 0;
        if (!hasPin) {
          const fallbackPluginId = defaultScenarioPluginIdForKind(
            projectRow?.metadata?.kind,
          );
          if (fallbackPluginId && getInstalledPlugin(db, fallbackPluginId)) {
            runResolveBody = { ...req.body, pluginId: fallbackPluginId };
          }
        }
      }
      const resolved = resolvePluginSnapshot({
        db,
        body: runResolveBody,
        projectId: req.body.projectId,
        conversationId: typeof req.body.conversationId === 'string'
          ? req.body.conversationId
          : null,
        registry: registryView,
      });
      if (resolved && !resolved.ok) {
        if (!explicitPlugin) {
          console.warn(
            `[plugins] default-scenario fallback skipped for run on project ${req.body.projectId}: ${resolved.body?.error?.code ?? 'unknown'}`,
          );
        } else {
          return res.status(resolved.status).json(resolved.body);
        }
      } else {
        resolvedSnapshot = resolved;
      }
    }
    const meta = { ...(req.body || {}) };
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
    const run = design.runs.create(meta);
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
    design.runs.start(run, () => startChatRun(meta, run));
  });

  app.get('/api/runs', (req, res) => {
    const { projectId, conversationId, status } = req.query;
    const runs = design.runs.list({ projectId, conversationId, status });
    /** @type {import('@open-design/contracts').ChatRunListResponse} */
    const body = { runs: runs.map(design.runs.statusBody) };
    res.json(body);
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

  app.post('/api/runs/:id/cancel', (req, res) => {
    const run = design.runs.get(req.params.id);
    if (!run) return sendApiError(res, 404, 'NOT_FOUND', 'run not found');
    design.runs.cancel(run);
    /** @type {import('@open-design/contracts').ChatRunCancelResponse} */
    const body = { ok: true };
    res.json(body);
  });

  app.post('/api/chat', (req, res) => {
    if (daemonShuttingDown) {
      return sendApiError(res, 503, 'UPSTREAM_UNAVAILABLE', 'daemon is shutting down');
    }
    const run = design.runs.create();
    design.runs.stream(run, req, res);
    design.runs.start(run, () => startChatRun(req.body || {}, run));
  });

  // Each routine fire resolves an agent, prepares project/conversation state,
  // and dispatches into the same chat runner used by manual runs.
  routineService.setRunHandler(async ({ routine, trigger, startedAt }) => {
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
    const stamp = formatLocalProjectTimestamp(new Date(now).toISOString());
    let projectId;
    let projectName;
    if (routine.target.mode === 'reuse') {
      const project = getProject(db, routine.target.projectId);
      if (!project) throw new Error(`Routine target project ${routine.target.projectId} not found`);
      projectId = project.id;
      projectName = project.name;
    } else {
      projectId = `routine-${randomUUID()}`;
      projectName = `${routine.name} · ${stamp}`;
      insertProject(db, {
        id: projectId,
        name: projectName,
        skillId: routine.skillId ?? null,
        designSystemId: appConfig.designSystemId ?? null,
        pendingPrompt: null,
        metadata: { kind: 'other', intent: 'routine', routineId: routine.id, trigger },
        createdAt: now,
        updatedAt: now,
      });
    }

    const conversationId = `routine-conv-${randomUUID()}`;
    const conversationTitle = routine.target.mode === 'reuse'
      ? `${routine.name} · ${stamp}`
      : projectName;
    insertConversation(db, {
      id: conversationId,
      projectId,
      title: conversationTitle,
      createdAt: now,
      updatedAt: now,
    });

    // Notify any open `ProjectView` watching this project so its
    // conversation list picks up the new routine conversation without
    // requiring the user to leave and re-enter the project (#1361).
    // For reuse-an-existing-project mode this is the only path the
    // open view has to learn the conversation exists; for new-project
    // mode this is harmless (no subscribers for a project that was
    // just created milliseconds ago). The payload shape is the shared
    // `ProjectConversationCreatedSsePayload` from `@open-design/contracts`
    // so the daemon producer and the web consumer cannot drift.
    /** @type {ProjectConversationCreatedSsePayload} */
    const conversationCreatedEvent = {
      type: 'conversation-created',
      projectId,
      conversationId,
      title: conversationTitle,
      createdAt: now,
    };
    emitProjectEvent(projectId, conversationCreatedEvent);

    const assistantMessageId = `routine-assistant-${randomUUID()}`;
    const run = design.runs.create({
      projectId,
      conversationId,
      assistantMessageId,
      clientRequestId: `routine-${trigger}-${randomUUID()}`,
      agentId,
    });
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

    const modelPrefs = appConfig.agentModels?.[agentId] ?? {};
    design.runs.start(run, () => startChatRun({
      agentId,
      projectId,
      conversationId: run.conversationId,
      assistantMessageId: run.assistantMessageId,
      clientRequestId: run.clientRequestId,
      skillId: routine.skillId ?? null,
      designSystemId: appConfig.designSystemId ?? null,
      model: modelPrefs.model ?? null,
      reasoning: modelPrefs.reasoning ?? null,
      message: routine.prompt,
      systemPrompt: [
        `You are running an unattended scheduled routine named "${routine.name}".`,
        'Do not ask follow-up questions, do not emit <question-form>, and do not wait for user input. Pick reasonable defaults and finish the task.',
      ].join('\n'),
    }, run));

    const completion = (async () => {
      const finalStatus = await design.runs.wait(run);
      db.prepare(`UPDATE messages SET run_status = ?, ended_at = ? WHERE id = ?`)
        .run(finalStatus.status, Date.now(), assistantMessageId);
      return {
        status: finalStatus.status,
        summary: `Routine "${routine.name}" ${finalStatus.status}.`,
      };
    })();

    return { projectId, conversationId, agentRunId: run.id, completion };
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
    validation: validationDeps,
    finalize: finalizeDeps,
    chat: { startChatRun, submitToolResultToRun },
    agents: agentDeps,
    critique: critiqueDeps,
    lifecycle: { isDaemonShuttingDown: () => daemonShuttingDown },
  });

  registerRoutineRoutes(app, {
    db,
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
    chat: { startChatRun, submitToolResultToRun },
    agents: agentDeps,
    critique: critiqueDeps,
    validation: validationDeps,
    lifecycle: { isDaemonShuttingDown: () => daemonShuttingDown },

  });

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
      await design.analytics.shutdown();
    };
    let server;
    try {
      server = app.listen(port, host, () => {
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
        resolve(returnServer ? { url, server, shutdown: shutdownDaemonRuns } : url);
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
