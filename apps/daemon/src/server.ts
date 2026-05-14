// @ts-nocheck
import type { DesktopExportPdfInput, DesktopExportPdfResult } from '@open-design/sidecar-proto';
import express from 'express';
import multer from 'multer';
import { execFile, spawn } from 'node:child_process';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
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
import { diagnoseClaudeCliFailure } from './claude-diagnostics.js';
import { loadCritiqueConfigFromEnv } from './critique/config.js';
import { reconcileStaleRuns } from './critique/persistence.js';
import { runOrchestrator } from './critique/orchestrator.js';
import { createRunRegistry } from './critique/run-registry.js';
import { handleCritiqueInterrupt } from './critique/interrupt-handler.js';
import { handleCritiqueArtifact } from './critique/artifact-handler.js';
import { createRuntimeAdapter } from './runtimes/runtime-adapter.js';
import { getCritiqueMetrics, register } from './metrics/index.js';
import { readConformanceHistory } from './critique/conformance-history.js';
import { evaluateRollout } from './critique/ratchet.js';
import {
  isCritiqueEnabled,
  parseEnvEnabled,
  parseRolloutPhase,
  type SkillCritiquePolicy,
} from './critique/rollout.js';
import { classifyAgentAuthFailure, cursorAuthGuidance } from './runtimes/auth.js';
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
import { agentCliEnvForAgent, readAppConfig, writeAppConfig } from './app-config.js';
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
for (const dir of [USER_SKILLS_DIR, USER_DESIGN_SYSTEMS_DIR, USER_DESIGN_TEMPLATES_DIR]) {
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

const TERMINAL_RUN_STATUSES = new Set(['succeeded', 'failed', 'canceled']);

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

export async function startServer({
  port = 7456,
  host = process.env.OD_BIND_HOST || '127.0.0.1',
  returnServer = false,
  desktopPdfExporter = null,
}: StartServerOptions = {}) {
  let resolvedPort = port;
  let daemonShuttingDown = false;
  const extraAllowedOrigins = configuredAllowedOrigins();
  const app = express();
  app.use(express.json({ limit: '4mb' }));

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

  const validateExternalApiBaseUrl = (baseUrl) => validateBaseUrl(baseUrl);

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
  registerProjectUploadRoutes(app, { http: httpDeps, uploads: uploadDeps, node: nodeDeps });

  const composeDaemonSystemPrompt = async ({
    agentId,
    projectId,
    skillId,
    designSystemId,
    supportsCritiqueTheater,
    streamFormat,
    connectedExternalMcp,
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
    const rawProjectOverride =
      metadata && typeof metadata === 'object'
        ? (metadata as { critiqueTheaterEnabled?: unknown }).critiqueTheaterEnabled
        : undefined;
    const projectCritiqueOverride: boolean | null =
      typeof rawProjectOverride === 'boolean' ? rawProjectOverride : null;
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
    const critiqueShouldRun = critiqueEnabledForRun
      && critiqueBrand !== undefined
      && critiqueSkill !== undefined
      && !isMediaSurface
      && supportsCritiqueTheater;
    // Only thread the critique fields when the run is actually eligible;
    // otherwise the composer's own internal eligibility check (cfg.enabled
    // && brand && skill && !isMediaSurface) might still fire on
    // non-plain adapters and we'd emit the panel for a run the orchestrator
    // skips. Gating the threading itself keeps composer + orchestrator in
    // exact lockstep regardless of which side enforces eligibility.
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
    const runtimeAdapter = createRuntimeAdapter(def);
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
    const toolTokenGrant = cwd && typeof projectId === 'string' && projectId
      ? toolTokenRegistry.mint({
          runId,
          projectId,
          allowedEndpoints: CHAT_TOOL_ENDPOINTS,
          allowedOperations: CHAT_TOOL_OPERATIONS,
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
        supportsCritiqueTheater: runtimeAdapter.supportsCritiqueTheater(),
        streamFormat: def?.streamFormat ?? 'plain',
        connectedExternalMcp,
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
    if (enabledExternalMcp.length > 0 && runtimeAdapter.acceptsExternalMcpServers()) {
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
      const stdinMode = runtimeAdapter.stdinMode();
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
      if (runtimeAdapter.shouldWritePromptToStdin() && child.stdin) {
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
          send(e.event, e.data);
          if (critiqueProjectIdForBus) {
            const sinks = activeProjectEventSinks.get(critiqueProjectIdForBus);
            if (sinks && sinks.size > 0) {
              const payload = { ...e.data, type: e.event };
              for (const sink of Array.from(sinks)) {
                try {
                  sink(payload);
                } catch {
                  sinks.delete(sink);
                }
              }
            }
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
          // `effectiveSkillId` was already computed above as the request
          // skillId with a project-row fallback; pass it through verbatim,
          // and leave the orchestrator's own default of 'unknown' for runs
          // that genuinely have no skill assigned.
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

    // Runtime-specific stream/session protocols are selected by the adapter;
    // this chat layer only updates generic run activity and lifecycle state.
    const runtimeAttachment = runtimeAdapter.attach({
      child,
      prompt: composed,
      cwd: effectiveCwd,
      model: safeModel,
      imagePaths: safeImages,
      uploadRoot: UPLOAD_DIR,
      mcpServers,
      send: (event, data) => {
        noteAgentActivity();
        send(event, data);
      },
      emitAgentEvent: (ev) => {
        lastAgentEventPhase = summarizeAgentEventForInactivity(ev);
        noteAgentActivity();
        send('agent', ev);
      },
      emitRuntimeError: (message, details) => {
        clearInactivityWatchdog();
        const authFailure = classifyAgentAuthFailure(
          agentId,
          [
            message,
            typeof details?.raw === 'string' ? details.raw : '',
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
        send('error', createSseErrorPayload('AGENT_EXECUTION_FAILED', message, {
          details: details?.raw ? { raw: details.raw } : undefined,
          retryable: false,
        }));
      },
    });
    // Wire the acpSession onto the run so cancel() can call abort()
    // instead of raw SIGTERM (applies to pi-rpc and acp-json-rpc).
    acpSession = runtimeAttachment.session;
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
      if (runtimeAttachment.streamError()) {
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
        runtimeAttachment.trackingSubstantiveOutput &&
        !runtimeAttachment.producedSubstantiveOutput() &&
        !runtimeAttachment.streamError()
      ) {
        send('error', createSseErrorPayload(
          'AGENT_EXECUTION_FAILED',
          'Agent completed without producing any output. The model or provider may have returned an empty response — check the agent logs for upstream errors.',
          { retryable: true },
        ));
        return design.runs.finish(run, 'failed', code, signal);
      }
      const status = runtimeAttachment.classifyClose({
        code,
        signal,
        canceled: run.cancelRequested,
      });
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
      child.stdin.end(composed, 'utf8');
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
    chat: { startChatRun },
    agents: agentDeps,
    critique: critiqueDeps,
    lifecycle: { isDaemonShuttingDown: () => daemonShuttingDown },
  });

  registerRoutineRoutes(app, {
    db,
    routines: { routineService },
  });


  registerChatRoutes(app, {
    db,
    design,
    http: httpDeps,
    chat: { startChatRun },
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
