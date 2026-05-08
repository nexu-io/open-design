// @ts-nocheck
import express from 'express';
import multer from 'multer';
import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
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
  resolveAgentBin,
  sanitizeCustomModel,
  spawnEnvForAgent,
} from './agents.js';
import { migrateLegacyDataDirSync } from './legacy-data-migrator.js';
import { findSkillById, listSkills } from './skills.js';
import { validateLinkedDirs } from './linked-dirs.js';
import { buildWindowsFolderDialogCommand, parseFolderDialogStdout } from './native-folder-dialog.js';
import { listCodexPets, readCodexPetSpritesheet } from './codex-pets.js';
import { syncCommunityPets } from './community-pets-sync.js';
import { listDesignSystems, readDesignSystem } from './design-systems.js';
import { attachAcpSession } from './acp.js';
import { attachPiRpcSession } from './pi-rpc.js';
import { createClaudeStreamHandler } from './claude-stream.js';
import { loadCritiqueConfigFromEnv } from './critique/config.js';
import { reconcileStaleRuns } from './critique/persistence.js';
import { runOrchestrator } from './critique/orchestrator.js';
import { createRunRegistry } from './critique/run-registry.js';
import { handleCritiqueInterrupt } from './critique/interrupt-handler.js';
import { createCopilotStreamHandler } from './copilot-stream.js';
import { createJsonEventStreamHandler } from './json-event-stream.js';
import { createQoderStreamHandler } from './qoder-stream.js';
import { subscribe as subscribeFileEvents } from './project-watchers.js';
import { renderDesignSystemPreview } from './design-system-preview.js';
import { renderDesignSystemShowcase } from './design-system-showcase.js';
import { createChatRunService } from './runs.js';
import {
  testAgentConnection,
  testProviderConnection,
  validateBaseUrl,
} from './connectionTest.js';
import { importClaudeDesignZip } from './claude-design-import.js';
import { listPromptTemplates, readPromptTemplate } from './prompt-templates.js';
import { buildDocumentPreview } from './document-preview.js';
import { lintArtifact, renderFindingsForAgent } from './lint-artifact.js';
import { loadCraftSections } from './craft.js';
import { stageActiveSkill } from './cwd-aliases.js';
import { generateMedia } from './media.js';
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
import { agentCliEnvForAgent, readAppConfig, writeAppConfig } from './app-config.js';
import { buildMcpInstallPayload } from './mcp-install-info.js';
import {
  buildProjectArchive,
  buildBatchArchive,
  decodeMultipartFilename,
  deleteProjectFile,
  detectEntryFile,
  ensureProject,
  listFiles,
  mimeFor,
  projectDir,
  readProjectFile,
  removeProjectDir,
  sanitizeName,
  searchProjectFiles,
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
  insertTemplate,
  listProjectsAwaitingInput,
  listConversations,
  listDeployments,
  listLatestProjectRunStatuses,
  listMessages,
  listPreviewComments,
  listProjects,
  listTabs,
  listTemplates,
  openDatabase,
  setTabs,
  updateConversation,
  updatePreviewCommentStatus,
  updateProject,
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
import { configureConnectorCredentialStore, ConnectorServiceError, deleteConnectorCredentialsByProvider, FileConnectorCredentialStore } from './connectors/service.js';
import { composioConnectorProvider } from './connectors/composio.js';
import { configureComposioConfigStore, readComposioConfig, readPublicComposioConfig, writeComposioConfig } from './connectors/composio-config.js';
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
      const comment = cleanString(raw.comment);
      if (!filePath || !elementId || !selector || !comment) return null;
      const selectionKind = raw.selectionKind === 'pod' ? 'pod' : 'element';
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
    'Scope: treat each attachment as the default refinement target. For single elements, edit the target element first. For pods, coordinate the captured group as one design region and preserve unrelated areas.',
  ];
  for (const item of commentAttachments) {
    const targetKind = item.selectionKind === 'pod' ? 'pod' : 'element';
    lines.push(
      '',
      `${item.order}. ${item.elementId}`,
      `targetKind: ${targetKind}`,
      `file: ${item.filePath}`,
      `selector: ${item.selector}`,
      `label: ${item.label || '(unlabeled)'}`,
      `position: ${formatAttachmentPosition(item.pagePosition)}`,
      `currentText: ${item.currentText || '(empty)'}`,
      `htmlHint: ${item.htmlHint || '(none)'}`,
      `comment: ${item.comment}`,
    );
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
const CRAFT_DIR = resolveDaemonResourceDir(
  DAEMON_RESOURCE_ROOT,
  'craft',
  path.join(PROJECT_ROOT, 'craft'),
);
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
    throw new Error(
      `OD_DATA_DIR "${resolved}" is not writable: ${e.message}`,
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
const PROJECTS_DIR = path.join(RUNTIME_DATA_DIR, 'projects');
fs.mkdirSync(PROJECTS_DIR, { recursive: true });

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
  let emitted = emitProjectLiveArtifactEvent(payload.projectId, payload);
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
  let emitted = emitProjectLiveArtifactEvent(grant.projectId, event);
  if (grant?.runId) emitted = emitChatAgentEvent(grant.runId, event) || emitted;
  return emitted;
}

function emitProjectLiveArtifactEvent(projectId, payload) {
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
    };
    const errorByCode = {
      LIMIT_FILE_SIZE: 'file too large',
      LIMIT_FILE_COUNT: 'too many files',
      LIMIT_UNEXPECTED_FILE: 'unexpected file field',
      LIMIT_PART_COUNT: 'too many form parts',
      LIMIT_FIELD_KEY: 'field name too long',
      LIMIT_FIELD_VALUE: 'field value too long',
      LIMIT_FIELD_COUNT: 'too many form fields',
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

function createMediaTask(taskId, projectId, info = {}) {
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
  return task;
}

function appendTaskProgress(task, line) {
  task.progress.push(line);
  notifyTaskWaiters(task);
}

function notifyTaskWaiters(task) {
  const wakers = Array.from(task.waiters);
  for (const w of wakers) {
    try {
      w();
    } catch {
      // Never let one bad waiter block the rest.
    }
  }
  if (
    (task.status === 'done' || task.status === 'failed') &&
    !task._gcScheduled
  ) {
    task._gcScheduled = true;
    setTimeout(() => {
      if (task.waiters.size === 0) mediaTasks.delete(task.id);
    }, TASK_TTL_AFTER_DONE_MS).unref?.();
  }
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
    send(event, data, id = null) {
      if (!canWrite()) return false;
      if (id !== null && id !== undefined) res.write(`id: ${id}\n`);
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
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

export async function startServer({ port = 7456, host = process.env.OD_BIND_HOST || '127.0.0.1', returnServer = false } = {}) {
  let resolvedPort = port;
  const extraAllowedOrigins = configuredAllowedOrigins();
  const app = express();
  app.use(express.json({ limit: '4mb' }));

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

  if (process.env.OD_CODEX_DISABLE_PLUGINS === '1') {
    console.log('[od] Codex plugins disabled via OD_CODEX_DISABLE_PLUGINS=1');
  }

  // Warm agent-capability probes (e.g. whether the installed Claude Code
  // build advertises --include-partial-messages) so the first /api/chat
  // hits a populated cache even if /api/agents hasn't been called yet.
  void readAppConfig(RUNTIME_DATA_DIR)
    .then((config) => detectAgents(config.agentCliEnv ?? {}))
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

  registerConnectorRoutes(app, { sendApiError, authorizeToolRequest, projectsRoot: PROJECTS_DIR, requireLocalDaemonRequest });

  app.get('/api/connectors/composio/config', (_req, res) => {
    try {
      res.json(readPublicComposioConfig());
    } catch (err) {
      res.status(500).json({ error: String(err && err.message ? err.message : err) });
    }
  });

  app.put('/api/connectors/composio/config', requireLocalDaemonRequest, (req, res) => {
    try {
      const before = readComposioConfig();
      const cfg = writeComposioConfig(req.body);
      const after = readComposioConfig();
      composioConnectorProvider.clearDiscoveryCache();
      if (!cfg.configured || (before.apiKey && before.apiKey !== after.apiKey)) {
        deleteConnectorCredentialsByProvider('composio');
      }
      res.json(cfg);
    } catch (err) {
      res.status(400).json({ error: String(err && err.message ? err.message : err) });
    }
  });

  // ---- Projects (DB-backed) -------------------------------------------------

  // Soft "what is the user looking at right now in Open Design?" channel. The
  // web UI POSTs the current project + file on every route change;
  // the MCP surface reads it so a coding agent in another repo can
  // resolve "the design I have open" without the user typing the
  // project id. In-memory only - daemon restart clears it.
  /** @type {{ projectId: string; fileName: string | null; ts: number } | null} */
  let activeContext = null;
  const ACTIVE_CONTEXT_TTL_MS = 5 * 60 * 1000;

  // Active context is private to the local machine. The daemon binds
  // 0.0.0.0 by default, so without an origin check a peer on the LAN
  // could read what the user is currently looking at (GET) or spoof
  // it to redirect MCP fallbacks (POST). The web proxies same-origin
  // and the MCP runs in-process via 127.0.0.1, so both legitimate
  // callers pass the check.
  app.post('/api/active', (req, res) => {
    if (!isLocalSameOrigin(req, resolvedPort)) {
      return res.status(403).json({ error: 'cross-origin request rejected' });
    }
    try {
      const body = req.body || {};
      if (body.active === false) {
        activeContext = null;
        res.json({ active: false });
        return;
      }
      const projectId = typeof body.projectId === 'string' ? body.projectId : '';
      if (!projectId) {
        sendApiError(res, 400, 'BAD_REQUEST', 'projectId is required');
        return;
      }
      const fileName =
        typeof body.fileName === 'string' && body.fileName.length > 0
          ? body.fileName
          : null;
      activeContext = { projectId, fileName, ts: Date.now() };
      res.json({ active: true, ...activeContext });
    } catch (err) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err));
    }
  });

  app.get('/api/active', (req, res) => {
    if (!isLocalSameOrigin(req, resolvedPort)) {
      return res.status(403).json({ error: 'cross-origin request rejected' });
    }
    if (!activeContext || Date.now() - activeContext.ts > ACTIVE_CONTEXT_TTL_MS) {
      activeContext = null;
      res.json({ active: false });
      return;
    }
    const project = getProject(db, activeContext.projectId);
    res.json({
      active: true,
      projectId: activeContext.projectId,
      projectName: project?.name ?? null,
      fileName: activeContext.fileName,
      ts: activeContext.ts,
      ageMs: Date.now() - activeContext.ts,
    });
  });

  // Surfaces the absolute paths to the daemon's Node-compatible runtime and
  // CLI entry so the Settings → MCP server panel can render snippets that work
  // even when `od` isn't on the user's PATH (the common case for source clones
  // - and macOS/Linux ship a /usr/bin/od octal-dump tool that shadows ours
  // anyway). Cached for 5s because the panel pings on every open and these
  // paths cannot change without a daemon restart.
  const INSTALL_INFO_TTL_MS = 5000;
  let installInfoCache: { t: number; payload: object } | null = null;

  app.get('/api/mcp/install-info', (req, res) => {
    if (!isLocalSameOrigin(req, resolvedPort)) {
      return res.status(403).json({ error: 'cross-origin request rejected' });
    }
    const now = Date.now();
    if (installInfoCache && now - installInfoCache.t < INSTALL_INFO_TTL_MS) {
      return res.json(installInfoCache.payload);
    }
    // process.execPath is the absolute path to the Node-compatible
    // runtime that is running the daemon RIGHT NOW. In packaged builds
    // this may be Electron running with ELECTRON_RUN_AS_NODE=1 rather
    // than a separate bundled Node binary; the helper surfaces that env
    // requirement with the command so IDE-spawned MCP clients can
    // reproduce the same mode from a minimal OS launcher environment.
    const cliPath = OD_BIN;
    // The daemon was bootstrapped as a sidecar (tools-dev, packaged) iff
    // bootstrapSidecarRuntime stamped OD_SIDECAR_IPC_PATH into the env.
    // In sidecar mode the snippet omits --daemon-url and the spawned
    // `od mcp` discovers the live URL via the IPC status socket on
    // every spawn, so the client config survives ephemeral-port
    // restarts. We also propagate OD_SIDECAR_NAMESPACE (and IPC_BASE
    // when overridden) so a non-default namespace daemon stays
    // reachable - the MCP client does not inherit the daemon's env,
    // so without this the spawned `od mcp` would probe the default
    // namespace socket and miss. For direct `od` / `od --port X`
    // launches there is no IPC socket; the helper bakes --daemon-url
    // so custom ports keep working.
    const sidecarIpcPath = process.env[SIDECAR_ENV.IPC_PATH];
    const isSidecarMode = sidecarIpcPath != null && sidecarIpcPath.length > 0;
    const sidecarEnv: Record<string, string> = {};
    if (isSidecarMode) {
      const ns = process.env[SIDECAR_ENV.NAMESPACE];
      if (ns != null && ns !== SIDECAR_DEFAULTS.namespace) {
        sidecarEnv[SIDECAR_ENV.NAMESPACE] = ns;
      }
      const ipcBase = process.env[SIDECAR_ENV.IPC_BASE];
      if (ipcBase != null && ipcBase.length > 0) {
        sidecarEnv[SIDECAR_ENV.IPC_BASE] = ipcBase;
      }
    }
    const payload = buildMcpInstallPayload({
      cliPath,
      cliExists: fs.existsSync(cliPath),
      execPath: process.execPath,
      nodeExists: fs.existsSync(process.execPath),
      port: resolvedPort,
      platform: process.platform,
      dataDir: RUNTIME_DATA_DIR,
      electronAsNode: process.env.ELECTRON_RUN_AS_NODE === '1',
      isSidecarMode,
      sidecarEnv,
    });
    installInfoCache = { t: now, payload };
    res.json(payload);
  });

  app.get('/api/projects', (_req, res) => {
    try {
      const latestRunStatuses = listLatestProjectRunStatuses(db);
      const awaitingInputProjects = listProjectsAwaitingInput(db);
      const activeRunStatuses = new Map();
      for (const run of design.runs.list()) {
        if (!run.projectId) continue;
        const runStatus = projectStatusFromRun(run);
        if (design.runs.isTerminal(run.status)) {
          const existing = latestRunStatuses.get(run.projectId);
          if (!existing || run.updatedAt > (existing.updatedAt ?? 0)) {
            latestRunStatuses.set(run.projectId, runStatus);
          }
        } else {
          const existing = activeRunStatuses.get(run.projectId);
          if (!existing || run.updatedAt > (existing.updatedAt ?? 0)) {
            activeRunStatuses.set(run.projectId, runStatus);
          }
        }
      }
      /** @type {import('@open-design/contracts').ProjectsResponse} */
      const body = {
        projects: listProjects(db).map((project) => ({
          ...project,
          status: composeProjectDisplayStatus(
            activeRunStatuses.get(project.id) ??
              latestRunStatuses.get(project.id) ?? { value: 'not_started' },
            awaitingInputProjects,
            project.id,
          ),
        })),
      };
      res.json(body);
    } catch (err) {
      sendApiError(res, 500, 'INTERNAL_ERROR', String(err));
    }
  });

  function projectStatusFromRun(run) {
    return {
      value: normalizeProjectDisplayStatus(run.status),
      updatedAt: run.updatedAt,
      runId: run.id,
    };
  }

  app.post('/api/projects', async (req, res) => {
    try {
      const { id, name, skillId, designSystemId, pendingPrompt, metadata } =
        req.body || {};
      if (typeof id !== 'string' || !/^[A-Za-z0-9._-]{1,128}$/.test(id)) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'invalid project id');
      }
      if (typeof name !== 'string' || !name.trim()) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'name required');
      }
      // baseDir is privileged: it lets a project root directly inside the
      // user's filesystem. The /api/import/folder endpoint is the only
      // path that's allowed to set it, because that's where realpath() +
      // RUNTIME_DATA_DIR reentry checks live. Block client-supplied
      // metadata.baseDir on this generic create endpoint so an attacker
      // can't smuggle e.g. /etc through here. Same rule for
      // originalBaseDir / importedFrom='folder' — only the import path
      // owns those state fields.
      if (metadata && typeof metadata === 'object') {
        if ('baseDir' in metadata) {
          return sendApiError(
            res, 400, 'BAD_REQUEST',
            'baseDir can only be set via POST /api/import/folder',
          );
        }
      }
      const now = Date.now();
      const project = insertProject(db, {
        id,
        name: name.trim(),
        skillId: skillId ?? null,
        designSystemId: designSystemId ?? null,
        pendingPrompt: pendingPrompt || null,
        metadata:
          metadata && typeof metadata === 'object'
            ? {
                ...metadata,
                ...(Array.isArray(metadata.linkedDirs)
                  ? (() => {
                      const v = validateLinkedDirs(metadata.linkedDirs);
                      return v.error ? {} : { linkedDirs: v.dirs };
                    })()
                  : {}),
              }
            : null,
        createdAt: now,
        updatedAt: now,
      });
      // Seed a default conversation so the UI always has somewhere to write.
      const cid = randomId();
      insertConversation(db, {
        id: cid,
        projectId: id,
        title: null,
        createdAt: now,
        updatedAt: now,
      });
      // For "from template" projects, seed the chosen template's snapshot
      // HTML into the new project folder so the agent can Read/edit files
      // on disk (the system prompt also embeds them, but a real on-disk
      // copy lets the agent treat them as the project's working state).
      if (
        metadata &&
        typeof metadata === 'object' &&
        metadata.kind === 'template' &&
        typeof metadata.templateId === 'string'
      ) {
        const tpl = getTemplate(db, metadata.templateId);
        if (tpl && Array.isArray(tpl.files) && tpl.files.length > 0) {
          await ensureProject(PROJECTS_DIR, id);
          for (const f of tpl.files) {
            if (
              !f ||
              typeof f.name !== 'string' ||
              typeof f.content !== 'string'
            ) {
              continue;
            }
            try {
              await writeProjectFile(
                PROJECTS_DIR,
                id,
                f.name,
                Buffer.from(f.content, 'utf8'),
              );
            } catch {
              // Skip individual file failures — the template snapshot is
              // best-effort; the agent still has the embedded copy.
            }
          }
        }
      }
      /** @type {import('@open-design/contracts').CreateProjectResponse} */
      const body = { project, conversationId: cid };
      res.json(body);
    } catch (err) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err));
    }
  });

  app.post(
    '/api/import/claude-design',
    importUpload.single('file'),
    async (req, res) => {
      try {
        if (!req.file)
          return res.status(400).json({ error: 'zip file required' });
        const originalName =
          req.file.originalname || 'Claude Design export.zip';
        if (!/\.zip$/i.test(originalName)) {
          fs.promises.unlink(req.file.path).catch(() => {});
          return res.status(400).json({ error: 'expected a .zip file' });
        }
        const id = randomId();
        const now = Date.now();
        const baseName =
          originalName.replace(/\.zip$/i, '').trim() || 'Claude Design import';
        const imported = await importClaudeDesignZip(
          req.file.path,
          projectDir(PROJECTS_DIR, id),
        );
        fs.promises.unlink(req.file.path).catch(() => {});

        const project = insertProject(db, {
          id,
          name: baseName,
          skillId: null,
          designSystemId: null,
          pendingPrompt: `Imported from Claude Design ZIP: ${originalName}. Continue editing ${imported.entryFile}.`,
          metadata: {
            kind: 'prototype',
            importedFrom: 'claude-design',
            entryFile: imported.entryFile,
            sourceFileName: originalName,
          },
          createdAt: now,
          updatedAt: now,
        });
        const cid = randomId();
        insertConversation(db, {
          id: cid,
          projectId: id,
          title: 'Imported Claude Design project',
          createdAt: now,
          updatedAt: now,
        });
        setTabs(db, id, [imported.entryFile], imported.entryFile);
        res.json({
          project,
          conversationId: cid,
          entryFile: imported.entryFile,
          files: imported.files,
        });
      } catch (err) {
        if (req.file?.path) fs.promises.unlink(req.file.path).catch(() => {});
        res.status(400).json({ error: String(err) });
      }
    },
  );

  // Import an existing local folder as a project. The user picks a folder
  // and OD works inside it directly: every write goes to metadata.baseDir.
  // No copy, no shadow tree — the user owns the workspace and is
  // responsible for their own version control (git, time machine, etc.),
  // mirroring how Cursor / Claude Code / Aider behave.
  app.post('/api/import/folder', async (req, res) => {
    try {
      const { baseDir, name, skillId, designSystemId } = req.body || {};
      if (typeof baseDir !== 'string' || !baseDir.trim()) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'baseDir required');
      }
      const trimmedInput = baseDir.trim();
      if (!path.isAbsolute(path.normalize(trimmedInput))) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'baseDir must be absolute');
      }
      // Resolve symlinks once at import and persist the canonical path.
      // Without this, a user-controlled symlink (e.g. ~/sneaky → /etc) at
      // baseDir would let writeProjectFile escape the project sandbox at
      // every later call: resolveSafe checks the *literal* baseDir, but
      // the OS follows the symlink at write time. realpath() collapses
      // the chain so the stored baseDir == what the kernel will write to.
      let normalizedPath: string;
      try {
        normalizedPath = await fs.promises.realpath(trimmedInput);
      } catch {
        return sendApiError(res, 400, 'BAD_REQUEST', 'folder not found');
      }
      // realpath resolved → lstat the canonical path to ensure it's a
      // real directory, not another symlink (defense-in-depth).
      let dirStat;
      try {
        dirStat = await fs.promises.lstat(normalizedPath);
      } catch {
        return sendApiError(res, 400, 'BAD_REQUEST', 'folder not found');
      }
      if (!dirStat.isDirectory()) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'path must be a directory');
      }
      // Prevent importing the data directory into itself (post-realpath so
      // a symlink pointing into RUNTIME_DATA_DIR is also caught). Compare
      // against the canonical alias because `normalizedPath` is the import
      // folder's realpath; on macOS the data dir at /var/... resolves to
      // /private/var/... and would never start-with the user-shaped path.
      if (
        normalizedPath === RUNTIME_DATA_DIR_CANONICAL ||
        normalizedPath.startsWith(RUNTIME_DATA_DIR_CANONICAL + path.sep)
      ) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'cannot import the data directory');
      }

      const id = randomId();
      const now = Date.now();
      const projectName =
        typeof name === 'string' && name.trim()
          ? name.trim()
          : path.basename(normalizedPath);
      const entryFile = await detectEntryFile(normalizedPath);

      const project = insertProject(db, {
        id,
        name: projectName,
        skillId: skillId ?? null,
        designSystemId: designSystemId ?? null,
        pendingPrompt: null,
        metadata: {
          kind: 'prototype',
          baseDir: normalizedPath,
          importedFrom: 'folder',
          entryFile,
        },
        createdAt: now,
        updatedAt: now,
      });

      const cid = randomId();
      insertConversation(db, {
        id: cid,
        projectId: id,
        title: `Imported from ${projectName}`,
        createdAt: now,
        updatedAt: now,
      });
      if (entryFile) setTabs(db, id, [entryFile], entryFile);
      /** @type {import('@open-design/contracts').ImportFolderResponse} */
      const body = { project, conversationId: cid, entryFile };
      res.json(body);
    } catch (err) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err));
    }
  });

  app.get('/api/projects/:id', (req, res) => {
    const project = getProject(db, req.params.id);
    if (!project)
      return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'not found');
    /** @type {import('@open-design/contracts').ProjectResponse} */
    const body = { project };
    res.json(body);
  });

  app.patch('/api/projects/:id', (req, res) => {
    try {
      const patch = req.body || {};
      // baseDir / folder-import state is privileged: it's set only by the
      // import endpoint and otherwise immutable. Two failure modes to
      // guard against here:
      //   1. Explicit attempt to change baseDir → reject with 400.
      //   2. A regular metadata patch that *omits* baseDir (e.g. a UI
      //      that only edits linkedDirs sends `{ metadata: { kind, linkedDirs } }`).
      //      updateProject() replaces metadata wholesale, so without
      //      preservation the existing baseDir gets wiped and the project
      //      detaches from the user's folder — subsequent reads/writes
      //      silently fall back to .od/projects/<id>.
      // For case 2 we re-stamp the immutable fields from the existing
      // project record onto the incoming patch so the user can keep
      // patching other metadata without ever losing their import root.
      if (patch.metadata && typeof patch.metadata === 'object') {
        const existing = getProject(db, req.params.id);
        const existingMeta = existing?.metadata;
        if (existingMeta?.baseDir) {
          if ('baseDir' in patch.metadata && patch.metadata.baseDir !== existingMeta.baseDir) {
            return sendApiError(
              res, 400, 'BAD_REQUEST',
              'baseDir is immutable after import; use a new import to change it',
            );
          }
          patch.metadata = {
            ...patch.metadata,
            baseDir: existingMeta.baseDir,
            ...(existingMeta.importedFrom === 'folder'
              ? { importedFrom: 'folder' }
              : {}),
          };
        } else if ('baseDir' in patch.metadata) {
          // Non-imported project trying to acquire a baseDir → reject (only
          // /api/import/folder can set it).
          return sendApiError(
            res, 400, 'BAD_REQUEST',
            'baseDir can only be set via POST /api/import/folder',
          );
        }
      }
      if (patch.metadata?.linkedDirs) {
        const validated = validateLinkedDirs(patch.metadata.linkedDirs);
        if (validated.error) {
          return sendApiError(res, 400, 'INVALID_LINKED_DIR', validated.error);
        }
        patch.metadata.linkedDirs = validated.dirs;
      }
      const project = updateProject(db, req.params.id, patch);
      if (!project)
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'not found');
      /** @type {import('@open-design/contracts').ProjectResponse} */
      const body = { project };
      res.json(body);
    } catch (err) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err));
    }
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
  //   1. <skillDir>/example.html — fully-baked static example (preferred)
  //   2. <skillDir>/assets/template.html  +
  //      <skillDir>/assets/example-slides.html — assemble at request time
  //      by replacing the `<!-- SLIDES_HERE -->` marker with the snippet
  //      and patching the placeholder <title>. Lets a skill ship one
  //      canonical seed plus a small content fragment, so the example
  //      never drifts from the seed.
  //   3. <skillDir>/assets/template.html — raw template, no content slides
  //   4. <skillDir>/assets/index.html — generic fallback
  app.get('/api/skills/:id/example', async (req, res) => {
    try {
      const skills = await listSkills(SKILLS_DIR);
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
      res
        .status(404)
        .type('text/plain')
        .send(
          'no example.html, assets/template.html, or assets/index.html for this skill',
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
      res.json({ config });
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
      const task = createMediaTask(taskId, projectId, {
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
        onProgress: (line) => appendTaskProgress(task, line),
      })
        .then((meta) => {
          task.status = 'done';
          task.file = meta;
          task.endedAt = Date.now();
          notifyTaskWaiters(task);
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
          notifyTaskWaiters(task);
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
    const task = mediaTasks.get(taskId);
    if (!task) return res.status(404).json({ error: 'task not found' });

    const since = Number.isFinite(req.body?.since) ? Number(req.body.since) : 0;
    const requestedTimeout = Number.isFinite(req.body?.timeoutMs)
      ? Number(req.body.timeoutMs)
      : 25_000;
    const timeoutMs = Math.min(Math.max(requestedTimeout, 0), 25_000);

    const respond = () => {
      if (res.writableEnded) return;
      const snapshot = {
        taskId,
        status: task.status,
        startedAt: task.startedAt,
        endedAt: task.endedAt,
        progress: task.progress.slice(since),
        nextSince: task.progress.length,
      };
      if (task.status === 'done') snapshot.file = task.file;
      if (task.status === 'failed') snapshot.error = task.error;
      res.json(snapshot);
    };

    if (
      task.status === 'done' ||
      task.status === 'failed' ||
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
    const tasks = [];
    for (const t of mediaTasks.values()) {
      if (t.projectId !== projectId) continue;
      const isTerminal = t.status === 'done' || t.status === 'failed';
      if (isTerminal && !includeDone) continue;
      tasks.push({
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
        ...(t.status === 'failed' ? { error: t.error } : {}),
      });
    }
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

  const design = {
    runs: createChatRunService({ createSseResponse, createSseErrorPayload }),
  };

  const composeDaemonSystemPrompt = async ({
    agentId,
    projectId,
    skillId,
    designSystemId,
    streamFormat,
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
    if (effectiveSkillId) {
      const skill = findSkillById(
        await listSkills(SKILLS_DIR),
        effectiveSkillId,
      );
      if (skill) {
        skillBody = skill.body;
        skillName = skill.name;
        skillMode = skill.mode;
        activeSkillDir = skill.dir;
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

    let designSystemBody;
    let designSystemTitle;
    if (effectiveDesignSystemId) {
      const systems = await listDesignSystems(DESIGN_SYSTEMS_DIR);
      const summary = systems.find((s) => s.id === effectiveDesignSystemId);
      designSystemTitle = summary?.title;
      designSystemBody =
        (await readDesignSystem(DESIGN_SYSTEMS_DIR, effectiveDesignSystemId)) ??
        undefined;
    }

    const template =
      metadata?.kind === 'template' && typeof metadata.templateId === 'string'
        ? (getTemplate(db, metadata.templateId) ?? undefined)
        : undefined;

    // Thread the critique config plus the active design-system / skill data
    // into the composer when critique is enabled. Without this the spawned
    // child receives the legacy single-pass prompt and the parser waits for
    // <CRITIQUE_RUN> tags the model was never told to emit. The composer
    // itself ignores these fields when cfg.enabled is false, so the legacy
    // path stays untouched.
    const critiqueBrand = critiqueCfg.enabled
      && typeof designSystemTitle === 'string'
      && typeof designSystemBody === 'string'
      ? { name: designSystemTitle, design_md: designSystemBody }
      : undefined;
    const critiqueSkill = critiqueCfg.enabled && typeof effectiveSkillId === 'string'
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
    const critiqueShouldRun = critiqueCfg.enabled
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
    const prompt = composeSystemPrompt({
      agentId,
      includeCodexImagegenOverride: false,
      skillBody,
      skillName,
      skillMode,
      designSystemBody,
      designSystemTitle,
      craftBody,
      craftSections,
      metadata,
      template,
      critique: critiqueShouldRun ? critiqueCfg : undefined,
      critiqueBrand: critiqueShouldRun ? critiqueBrand : undefined,
      critiqueSkill: critiqueShouldRun ? critiqueSkill : undefined,
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
    const { prompt: daemonSystemPrompt, activeSkillDir, critiqueShouldRun } =
      await composeDaemonSystemPrompt({
        agentId,
        projectId,
        skillId,
        designSystemId,
        streamFormat: def?.streamFormat ?? 'plain',
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

    const resolvedBin = resolveAgentBin(agentId, configuredAgentEnv);

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
      resolvedBin,
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
      resolvedBin,
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
    const unregisterChatAgentEventSink = () => {
      activeChatAgentEventSinks.delete(toolTokenGrant?.runId ?? runId);
    };
    if (toolTokenGrant?.runId) {
      activeChatAgentEventSinks.set(toolTokenGrant.runId, (payload) =>
        send('agent', payload),
      );
    }
    // If detection can't find the binary, surface a friendly SSE error
    // pointing at /api/agents instead of silently falling back to
    // spawn(def.bin) — that fallback re-introduces the exact ENOENT symptom
    // from issue #10.
    if (!resolvedBin) {
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

    let child;
    let acpSession = null;
    let writePromptToChildStdin = false;
    try {
      // Prompt delivery via stdin is now the universal default. This bypasses
      // both the cmd.exe 8KB limit and the CreateProcess 32KB limit.
      const stdinMode =
        def.promptViaStdin || def.streamFormat === 'acp-json-rpc'
          ? 'pipe'
          : 'ignore';
      const env = {
        ...spawnEnvForAgent(
          def.id,
          {
            ...createAgentRuntimeEnv(process.env, daemonUrl, toolTokenGrant),
            ...(def.env || {}),
          },
          configuredAgentEnv,
        ),
        ...odMediaEnv,
      };
      const invocation = createCommandInvocation({
        command: resolvedBin,
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

    // Critique Theater branch (M0 dark launch, default disabled).
    // Only plain-stream adapters are routed through runOrchestrator in v1.
    // Adapters that emit structured wrappers (claude-stream-json,
    // qoder-stream-json, copilot-stream-json, json-event-stream,
    // acp-json-rpc, pi-rpc) fall
    // through to the legacy single-pass code path below with a one-time
    // stderr warning so the parser never sees wrapper bytes. Per-format
    // decoding into the orchestrator is a v2 concern.
    //
    // Use critiqueShouldRun (computed in the prompt builder) instead of just
    // critiqueCfg.enabled so the orchestrator gate is in lockstep with the
    // panel addendum. Media surfaces and runs missing brand/skill context
    // never get the panel prompt, so they must also skip the orchestrator
    // and fall through to legacy generation; otherwise the parser waits for
    // <CRITIQUE_RUN> tags the model was never told to emit.
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
        const critiqueBus = { emit: (e) => send(e.event, e.data) };

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
        child.stderr.on('data', (chunk) => send('stderr', { chunk }));
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
        send('error', createSseErrorPayload('AGENT_EXECUTION_FAILED', agentStreamError, {
          details: ev.raw ? { raw: ev.raw } : undefined,
          retryable: false,
        }));
        return;
      }
      if (ev?.type && SUBSTANTIVE_AGENT_EVENT_TYPES.has(ev.type)) {
        agentProducedOutput = true;
      }
      send('agent', ev);
    };

    if (def.streamFormat === 'claude-stream-json') {
      const claude = createClaudeStreamHandler((ev) => send('agent', ev));
      child.stdout.on('data', (chunk) => claude.feed(chunk));
      child.on('close', () => claude.flush());
    } else if (def.streamFormat === 'qoder-stream-json') {
      trackingSubstantiveOutput = true;
      const qoder = createQoderStreamHandler(sendAgentEvent);
      child.stdout.on('data', (chunk) => qoder.feed(chunk));
      child.on('close', () => qoder.flush());
    } else if (def.streamFormat === 'copilot-stream-json') {
      const copilot = createCopilotStreamHandler((ev) => send('agent', ev));
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
            send('error', createSseErrorPayload(
              'AGENT_EXECUTION_FAILED',
              agentStreamError,
              { retryable: false },
            ));
          } else {
            send(channel, payload);
          }
        },
        imagePaths: def.supportsImagePaths ? safeImages : [],
        uploadRoot: UPLOAD_DIR,
      });
    } else if (def.streamFormat === 'acp-json-rpc') {
      acpSession = attachAcpSession({
        child,
        prompt: composed,
        cwd: effectiveCwd,
        model: safeModel,
        mcpServers,
        send,
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
      child.stdout.on('data', (chunk) => send('stdout', { chunk }));
    }
    // Wire the acpSession onto the run so cancel() can call abort()
    // instead of raw SIGTERM (applies to pi-rpc and acp-json-rpc).
    run.acpSession = acpSession;
    child.stderr.on('data', (chunk) => send('stderr', { chunk }));

    child.on('error', (err) => {
      revokeToolToken('child_exit');
      unregisterChatAgentEventSink();
      send('error', createSseErrorPayload('AGENT_EXECUTION_FAILED', err.message));
      design.runs.finish(run, 'failed', 1, null);
    });
    child.on('close', (code, signal) => {
      revokeToolToken('child_exit');
      unregisterChatAgentEventSink();
      if (acpSession?.hasFatalError()) {
        return design.runs.finish(run, 'failed', code ?? 1, signal ?? null);
      }
      if (agentStreamError) {
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
      const status = run.cancelRequested
        ? 'canceled'
        : code === 0
          ? 'succeeded'
          : 'failed';
      design.runs.finish(run, status, code, signal);
    });
    if (writePromptToChildStdin && child.stdin) {
      child.stdin.end(composed, 'utf8');
    }
  };

  app.post('/api/runs', (req, res) => {
    const run = design.runs.create(req.body || {});
    /** @type {import('@open-design/contracts').ChatRunCreateResponse} */
    const body = { runId: run.id };
    res.status(202).json(body);
    design.runs.start(run, () => startChatRun(req.body || {}, run));
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

  app.post('/api/runs/:id/cancel', (req, res) => {
    const run = design.runs.get(req.params.id);
    if (!run) return sendApiError(res, 404, 'NOT_FOUND', 'run not found');
    design.runs.cancel(run);
    /** @type {import('@open-design/contracts').ChatRunCancelResponse} */
    const body = { ok: true };
    res.json(body);
  });

  app.post('/api/chat', (req, res) => {
    const run = design.runs.create();
    design.runs.stream(run, req, res);
    design.runs.start(run, () => startChatRun(req.body || {}, run));
  });

  // ---- Connection tests (single-shot JSON; no SSE) ------------------------
  // Settings dialog uses these to verify a config works without sending a
  // real chat. Always return HTTP 200 with `ok: false` on upstream-caused
  // failures so the web layer can render a categorized inline status without
  // unwrapping nested error envelopes; real 4xx/5xx here mean a malformed
  // request or daemon bug.
  app.post('/api/test/connection', async (req, res) => {
    const controller = new AbortController();
    const abortIfRequestAborted = () => {
      if ((req.aborted || !req.complete) && !res.writableEnded) {
        controller.abort();
      }
    };
    const abortIfResponseClosed = () => {
      if (!res.writableEnded) controller.abort();
    };
    req.on('close', abortIfRequestAborted);
    res.on('close', abortIfResponseClosed);
    const body = req.body || {};
    try {
      if (body.mode === 'provider') {
        const protocol = body.protocol;
        if (
          typeof protocol !== 'string' ||
          !['anthropic', 'openai', 'azure', 'google'].includes(protocol)
        ) {
          return sendApiError(
            res,
            400,
            'BAD_REQUEST',
            'protocol must be one of anthropic|openai|azure|google',
          );
        }
        if (
          typeof body.baseUrl !== 'string' ||
          typeof body.apiKey !== 'string' ||
          typeof body.model !== 'string' ||
          !body.baseUrl.trim() ||
          !body.apiKey.trim() ||
          !body.model.trim()
        ) {
          return sendApiError(
            res,
            400,
            'BAD_REQUEST',
            'baseUrl, apiKey, and model are required',
          );
        }
        try {
          const result = await testProviderConnection({
            protocol,
            baseUrl: body.baseUrl,
            apiKey: body.apiKey,
            model: body.model,
            apiVersion:
              typeof body.apiVersion === 'string' ? body.apiVersion : undefined,
            signal: controller.signal,
          });
          return res.json(result);
        } catch (err) {
          console.warn(
            `[test:provider] uncaught: ${err instanceof Error ? err.message : String(err)}`,
          );
          return sendApiError(res, 500, 'INTERNAL', 'Connection test failed');
        }
      }

      if (body.mode === 'agent') {
        if (typeof body.agentId !== 'string' || !body.agentId.trim()) {
          return sendApiError(res, 400, 'BAD_REQUEST', 'agentId is required');
        }
        try {
          const def = getAgentDef(body.agentId);
          const testStart = Date.now();
          const safeModel =
            def && typeof body.model === 'string'
              ? isKnownModel(def, body.model)
                ? body.model
                : sanitizeCustomModel(body.model)
              : undefined;
          if (def && typeof body.model === 'string' && body.model.trim() && !safeModel) {
            return res.json({
              ok: false,
              kind: 'invalid_model_id',
              latencyMs: Date.now() - testStart,
              model: body.model.trim(),
              agentName: def.name,
              detail: 'Invalid custom model id. Use a model id that starts with a letter or number and contains no spaces.',
            });
          }
          const safeReasoning =
            def &&
            typeof body.reasoning === 'string' &&
            Array.isArray(def.reasoningOptions)
              ? (def.reasoningOptions.find((r) => r.id === body.reasoning)?.id ?? undefined)
              : undefined;
          const result = await testAgentConnection({
            agentId: body.agentId,
            model: safeModel ?? undefined,
            reasoning: safeReasoning,
            agentCliEnv:
              body.agentCliEnv && typeof body.agentCliEnv === 'object'
                ? body.agentCliEnv
                : undefined,
            signal: controller.signal,
          });
          return res.json(result);
        } catch (err) {
          console.warn(
            `[test:agent] uncaught: ${err instanceof Error ? err.message : String(err)}`,
          );
          return sendApiError(res, 500, 'INTERNAL', 'Agent test failed');
        }
      }

      return sendApiError(
        res,
        400,
        'BAD_REQUEST',
        'mode must be one of provider|agent',
      );
    } finally {
      req.off('close', abortIfRequestAborted);
      res.off('close', abortIfResponseClosed);
    }
  });

  // ---- Critique Theater endpoints (Phase 6) --------------------------------

  // POST /api/projects/:projectId/critique/:runId/interrupt
  // Cascades an AbortController to the in-flight orchestrator for the given run.
  app.post(
    '/api/projects/:projectId/critique/:runId/interrupt',
    handleCritiqueInterrupt(db, critiqueRunRegistry),
  );

  // ---- API Proxy (SSE) for API-compatible endpoints ------------------------
  // Browser → daemon → external API. Avoids CORS issues with third-party
  // providers. This keeps BYOK setup zero-config for local users at the cost of
  // one local streaming hop through the daemon.

  const redactAuthTokens = (text) =>
    text.replace(/Bearer [A-Za-z0-9_\-.+/=]+/g, 'Bearer [REDACTED]');

  const validateExternalApiBaseUrl = (baseUrl) => {
    return validateBaseUrl(baseUrl);
  };

  const proxyErrorCode = (status) => {
    if (status === 401) return 'UNAUTHORIZED';
    if (status === 403) return 'FORBIDDEN';
    if (status === 404) return 'NOT_FOUND';
    if (status === 429) return 'RATE_LIMITED';
    return 'UPSTREAM_UNAVAILABLE';
  };

  const sendProxyError = (sse, message, init = {}) => {
    sse.send('error', {
      message,
      error: {
        code: init.code || 'UPSTREAM_UNAVAILABLE',
        message,
        ...(init.details === undefined ? {} : { details: init.details }),
        ...(init.retryable === undefined ? {} : { retryable: init.retryable }),
      },
    });
  };

  const appendVersionedApiPath = (baseUrl, path) => {
    const url = new URL(baseUrl);
    // `URL.pathname` setter normalizes an empty string back to "/", so
    // we work in a local string to detect the no-path and no-version
    // cases.
    const trimmed = url.pathname.replace(/\/+$/, '');
    // Auto-inject `/v1` whenever the supplied path doesn't already
    // contain a `/vN` segment. This handles all four preset shapes:
    //   bare host                            → /v1/<route>            (api.openai.com, api.anthropic.com)
    //   ends in /vN                          → no inject              (api.openai.com/v1, /v1)
    //   /vN sub-path                         → no inject              (api.deepinfra.com/v1/openai, openrouter.ai/api/v1)
    //   non-versioned compat sub-path        → /v1/<route>            (api.deepseek.com/anthropic, api.minimaxi.com/anthropic)
    // Previously the check was end-of-path only, which broke the
    // /v1/openai sub-path case. A naive "non-empty path → respect"
    // would break the /anthropic sub-path case. Matching `/vN` as a
    // segment anywhere in the path threads both correctly.
    url.pathname = /\/v\d+(\/|$)/.test(trimmed)
      ? `${trimmed}${path}`
      : `${trimmed}/v1${path}`;
    return url.toString();
  };

  const collectSseFrame = (frame) => {
    const lines = frame.replace(/\r/g, '').split('\n');
    const dataLines = [];
    let event = 'message';
    for (const line of lines) {
      if (line.startsWith('event:')) {
        event = line.slice(6).trim();
        continue;
      }
      if (!line.startsWith('data:')) continue;
      let value = line.slice(5);
      if (value.startsWith(' ')) value = value.slice(1);
      dataLines.push(value);
    }
    const payload = dataLines.join('\n');
    if (!payload) return { event, payload: '', data: null };
    if (payload === '[DONE]') return { event, payload, data: null };
    try {
      return { event, payload, data: JSON.parse(payload) };
    } catch {
      return { event, payload, data: null };
    }
  };

  const streamUpstreamSse = async (response, onFrame) => {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      while (true) {
        const match = buffer.match(/\r?\n\r?\n/);
        if (!match || match.index === undefined) break;
        const frame = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        if (await onFrame(collectSseFrame(frame))) return;
      }
    }

    const tail = buffer.trim();
    if (tail) await onFrame(collectSseFrame(tail));
  };

  const extractOpenAIText = (data) => {
    const choices = data?.choices;
    if (!Array.isArray(choices) || choices.length === 0) return '';
    const first = choices[0];
    if (typeof first?.delta?.content === 'string') return first.delta.content;
    if (typeof first?.text === 'string') return first.text;
    return '';
  };

  const extractStreamErrorMessage = (data) => {
    const err = data?.error;
    if (!err) return '';
    if (typeof err === 'string') return err;
    if (typeof err?.message === 'string') return err.message;
    try {
      return JSON.stringify(err);
    } catch {
      return 'unspecified provider error';
    }
  };

  const extractGeminiText = (data) => {
    const candidates = data?.candidates;
    if (!Array.isArray(candidates) || candidates.length === 0) return '';
    const parts = candidates[0]?.content?.parts;
    if (!Array.isArray(parts)) return '';
    return parts.map((part) => part?.text).filter((text) => typeof text === 'string').join('');
  };

  const benignGeminiFinishReasons = new Set(['', 'STOP', 'MAX_TOKENS', 'FINISH_REASON_UNSPECIFIED']);
  const extractGeminiBlockMessage = (data) => {
    const feedback = data?.promptFeedback;
    if (typeof feedback?.blockReason === 'string' && feedback.blockReason) {
      const tail = typeof feedback.blockReasonMessage === 'string' && feedback.blockReasonMessage
        ? ` — ${feedback.blockReasonMessage}`
        : '';
      return `Gemini blocked the prompt (${feedback.blockReason})${tail}.`;
    }
    const candidates = data?.candidates;
    if (!Array.isArray(candidates)) return '';
    for (const candidate of candidates) {
      const reason = candidate?.finishReason;
      if (typeof reason !== 'string' || benignGeminiFinishReasons.has(reason)) continue;
      const tail = typeof candidate?.finishMessage === 'string' && candidate.finishMessage
        ? ` — ${candidate.finishMessage}`
        : '';
      return `Gemini stopped the response (${reason})${tail}.`;
    }
    return '';
  };

  app.post('/api/proxy/anthropic/stream', async (req, res) => {
    /** @type {Partial<ProxyStreamRequest>} */
    const proxyBody = req.body || {};
    const { baseUrl, apiKey, model, systemPrompt, messages, maxTokens } =
      proxyBody;
    if (!baseUrl || !apiKey || !model) {
      return sendApiError(
        res,
        400,
        'BAD_REQUEST',
        'baseUrl, apiKey, and model are required',
      );
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

    const url = appendVersionedApiPath(baseUrl, '/messages');
    console.log(
      `[proxy:anthropic] ${req.method} ${validated.parsed.hostname} model=${model}`,
    );

    const payload = {
      model,
      max_tokens:
        typeof maxTokens === 'number' && maxTokens > 0 ? maxTokens : 8192,
      messages: Array.isArray(messages) ? messages : [],
      stream: true,
    };
    if (typeof systemPrompt === 'string' && systemPrompt) {
      payload.system = systemPrompt;
    }

    const sse = createSseResponse(res);
    sse.send('start', { model });
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `[proxy:anthropic] upstream error: ${response.status} ${redactAuthTokens(errorText)}`,
        );
        sendProxyError(sse, `Upstream error: ${response.status}`, {
          code: proxyErrorCode(response.status),
          details: errorText,
          retryable: response.status === 429 || response.status >= 500,
        });
        return sse.end();
      }

      let ended = false;
      await streamUpstreamSse(response, ({ event, data }) => {
        if (!data) return false;
        if (event === 'error' || data.type === 'error') {
          const message = data.error?.message || data.message || 'Anthropic upstream error';
          sendProxyError(sse, message, { details: data });
          ended = true;
          return true;
        }
        if (event === 'content_block_delta' && typeof data.delta?.text === 'string') {
          sse.send('delta', { delta: data.delta.text });
        }
        if (event === 'message_stop') {
          sse.send('end', {});
          ended = true;
          return true;
        }
        return false;
      });
      if (!ended) sse.send('end', {});
      sse.end();
    } catch (err) {
      console.error(`[proxy:anthropic] internal error: ${err.message}`);
      sendProxyError(sse, err.message, { code: 'INTERNAL_ERROR' });
      sse.end();
    }
  });

  app.post('/api/proxy/openai/stream', async (req, res) => {
    /** @type {Partial<ProxyStreamRequest>} */
    const proxyBody = req.body || {};
    const { baseUrl, apiKey, model, systemPrompt, messages, maxTokens } =
      proxyBody;
    if (!baseUrl || !apiKey || !model) {
      return sendApiError(
        res,
        400,
        'BAD_REQUEST',
        'baseUrl, apiKey, and model are required',
      );
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

    const url = appendVersionedApiPath(baseUrl, '/chat/completions');
    console.log(
      `[proxy:openai] ${req.method} ${validated.parsed.hostname} model=${model}`,
    );

    const payloadMessages = Array.isArray(messages) ? [...messages] : [];
    if (typeof systemPrompt === 'string' && systemPrompt) {
      payloadMessages.unshift({ role: 'system', content: systemPrompt });
    }

    const payload = {
      model,
      messages: payloadMessages,
      max_tokens:
        typeof maxTokens === 'number' && maxTokens > 0 ? maxTokens : 8192,
      stream: true,
    };

    const sse = createSseResponse(res);
    sse.send('start', { model });
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `[proxy:openai] upstream error: ${response.status} ${redactAuthTokens(errorText)}`,
        );
        sendProxyError(sse, `Upstream error: ${response.status}`, {
          code: proxyErrorCode(response.status),
          details: errorText,
          retryable: response.status === 429 || response.status >= 500,
        });
        return sse.end();
      }

      let ended = false;
      await streamUpstreamSse(response, ({ payload, data }) => {
        if (payload === '[DONE]') {
          sse.send('end', {});
          ended = true;
          return true;
        }
        if (!data) return false;
        const streamError = extractStreamErrorMessage(data);
        if (streamError) {
          sendProxyError(sse, `Provider error: ${streamError}`, { details: data });
          ended = true;
          return true;
        }
        const delta = extractOpenAIText(data);
        if (delta) sse.send('delta', { delta });
        return false;
      });
      if (!ended) sse.send('end', {});
      sse.end();
    } catch (err) {
      console.error(`[proxy:openai] internal error: ${err.message}`);
      sendProxyError(sse, err.message, { code: 'INTERNAL_ERROR' });
      sse.end();
    }
  });

  app.post('/api/proxy/azure/stream', async (req, res) => {
    /** @type {Partial<ProxyStreamRequest>} */
    const proxyBody = req.body || {};
    const { baseUrl, apiKey, model, systemPrompt, messages, maxTokens, apiVersion } =
      proxyBody;
    if (!baseUrl || !apiKey || !model) {
      return sendApiError(
        res,
        400,
        'BAD_REQUEST',
        'baseUrl, apiKey, and model are required',
      );
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

    const version =
      typeof apiVersion === 'string' && apiVersion.trim()
        ? apiVersion.trim()
        : '2024-10-21';
    const url = new URL(baseUrl);
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/openai/deployments/${encodeURIComponent(model)}/chat/completions`;
    url.searchParams.set('api-version', version);
    console.log(
      `[proxy:azure] ${req.method} ${validated.parsed.hostname} deployment=${model} api-version=${version}`,
    );

    const payloadMessages = Array.isArray(messages) ? [...messages] : [];
    if (typeof systemPrompt === 'string' && systemPrompt) {
      payloadMessages.unshift({ role: 'system', content: systemPrompt });
    }

    const payload = {
      messages: payloadMessages,
      max_tokens:
        typeof maxTokens === 'number' && maxTokens > 0 ? maxTokens : 8192,
      stream: true,
    };

    const sse = createSseResponse(res);
    sse.send('start', { model });
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': apiKey,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `[proxy:azure] upstream error: ${response.status} ${redactAuthTokens(errorText)}`,
        );
        sendProxyError(sse, `Upstream error: ${response.status}`, {
          code: proxyErrorCode(response.status),
          details: errorText,
          retryable: response.status === 429 || response.status >= 500,
        });
        return sse.end();
      }

      let ended = false;
      await streamUpstreamSse(response, ({ payload: ssePayload, data }) => {
        if (ssePayload === '[DONE]') {
          sse.send('end', {});
          ended = true;
          return true;
        }
        if (!data) return false;
        const streamError = extractStreamErrorMessage(data);
        if (streamError) {
          sendProxyError(sse, `Azure error: ${streamError}`, { details: data });
          ended = true;
          return true;
        }
        const delta = extractOpenAIText(data);
        if (delta) sse.send('delta', { delta });
        return false;
      });
      if (!ended) sse.send('end', {});
      sse.end();
    } catch (err) {
      console.error(`[proxy:azure] internal error: ${err.message}`);
      sendProxyError(sse, err.message, { code: 'INTERNAL_ERROR' });
      sse.end();
    }
  });

  app.post('/api/proxy/google/stream', async (req, res) => {
    /** @type {Partial<ProxyStreamRequest>} */
    const proxyBody = req.body || {};
    const { baseUrl, apiKey, model, systemPrompt, messages, maxTokens } = proxyBody;
    if (!apiKey || !model) {
      return sendApiError(
        res,
        400,
        'BAD_REQUEST',
        'apiKey and model are required',
      );
    }

    const effectiveBaseUrl = baseUrl || 'https://generativelanguage.googleapis.com';
    const validated = validateExternalApiBaseUrl(effectiveBaseUrl);
    if (validated.error) {
      return sendApiError(
        res,
        validated.forbidden ? 403 : 400,
        validated.forbidden ? 'FORBIDDEN' : 'BAD_REQUEST',
        validated.error,
      );
    }

    const clean = effectiveBaseUrl.replace(/\/+$/, '');
    const url = `${clean}/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;
    console.log(
      `[proxy:google] ${req.method} ${validated.parsed.hostname} model=${model}`,
    );

    const contents = (Array.isArray(messages) ? messages : []).map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }],
    }));
    const payload = {
      contents,
      generationConfig: {
        maxOutputTokens:
          typeof maxTokens === 'number' && maxTokens > 0 ? maxTokens : 8192,
      },
    };
    if (typeof systemPrompt === 'string' && systemPrompt) {
      payload.systemInstruction = { parts: [{ text: systemPrompt }] };
    }

    const sse = createSseResponse(res);
    sse.send('start', { model });
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `[proxy:google] upstream error: ${response.status} ${redactAuthTokens(errorText)}`,
        );
        sendProxyError(sse, `Upstream error: ${response.status}`, {
          code: proxyErrorCode(response.status),
          details: errorText,
          retryable: response.status === 429 || response.status >= 500,
        });
        return sse.end();
      }

      let ended = false;
      await streamUpstreamSse(response, ({ data }) => {
        if (!data) return false;
        const streamError = extractStreamErrorMessage(data);
        if (streamError) {
          sendProxyError(sse, `Gemini error: ${streamError}`, { details: data });
          ended = true;
          return true;
        }
        const delta = extractGeminiText(data);
        if (delta) sse.send('delta', { delta });
        const blockMessage = extractGeminiBlockMessage(data);
        if (blockMessage) {
          sendProxyError(sse, blockMessage, { details: data });
          ended = true;
          return true;
        }
        return false;
      });
      if (!ended) sse.send('end', {});
      sse.end();
    } catch (err) {
      console.error(`[proxy:google] internal error: ${err.message}`);
      sendProxyError(sse, err.message, { code: 'INTERNAL_ERROR' });
      sse.end();
    }
  });

  // Wait for `listen` to bind so callers always see the resolved URL —
  // critical when port=0 (ephemeral port) and when the embedding sidecar
  // needs to advertise the port to a parent process before any request
  // can flow. Three callers depend on this contract:
  //   - `apps/daemon/src/cli.ts`            → expects a `url` string
  //   - `apps/daemon/sidecar/server.ts`     → expects `{ url, server }`
  //   - `apps/daemon/tests/version-route.test.ts` → expects `{ url, server }`
  return await new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => {
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
      resolve(returnServer ? { url, server } : url);
    });
    // `app.listen` throws synchronously when the port is already in use on
    // some Node versions, but emits an `error` event on others (and for
    // EACCES / EADDRNOTAVAIL even on the same Node). Wire the event so the
    // returned Promise always settles instead of hanging forever.
    server.on('error', reject);
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
