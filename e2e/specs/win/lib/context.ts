// @vitest-environment node

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir,rm } from 'node:fs/promises';
import { homedir,tmpdir } from 'node:os';
import { dirname,isAbsolute,join,resolve,sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import {
	type StoredClosureVerification
} from '@open-design/closure/store';

import {
	type PackagedClosureFixture
} from '@/vitest/packaged-closure-fixture';
import {
	resolvePackagedSmokeLanes
} from '@/vitest/packaged-smoke-contract';
import { resolvePackagedSmokeProfile } from '@/vitest/packaged-smoke-profile';
import {
	resolvePackagedUpdateScenario
} from '@/vitest/packaged-update-scenario';
import { resolvePackagedWinInstallIdentity } from '@/vitest/packaged-win-identity';
import { resolvePackagedSmokeNamespace } from '@/vitest/suite';



export const execFileAsync = promisify(execFile);
export const e2eRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
export const workspaceRoot = dirname(e2eRoot);
export const toolsPackDir = resolveFromWorkspace(process.env.OD_PACKAGED_E2E_TOOLS_PACK_DIR ?? '.tmp/tools-pack');
export const namespace = resolvePackagedSmokeNamespace('win');
export const toolsPackBin = join(workspaceRoot, 'tools', 'pack', 'bin', 'tools-pack.mjs');
export const maxInstallDurationMs = Number.parseInt(process.env.OD_PACKAGED_E2E_WIN_MAX_INSTALL_MS ?? '120000', 10);
export const maxStartDurationMs = Number.parseInt(process.env.OD_PACKAGED_E2E_WIN_MAX_START_MS ?? '300000', 10);
export const maxToolsPackActionDurationMs = Number.parseInt(
  process.env.OD_PACKAGED_E2E_WIN_TOOLS_PACK_ACTION_MAX_MS ?? '360000',
  10,
);
// `??` would keep an EMPTY value, and the release workflows can hand one down
// — see `resolvePackagedSmokeProfile` for why all three layers have to agree
// that empty means unset. An empty value surviving here reads as "not core"
// and silently selects the updater path.
export const smokeProfile = resolvePackagedSmokeProfile(process.env.OD_PACKAGED_E2E_WIN_SMOKE_PROFILE);
export const smokeLanes = resolvePackagedSmokeLanes(
  smokeProfile,
  process.env.OD_PACKAGED_E2E_WIN_SMOKE_LANES,
);
export const verifyCoreOnly = smokeProfile === 'core';
export const verifyUpgradePersistence =
  !verifyCoreOnly && process.env.OD_PACKAGED_E2E_WIN_VERIFY_UPGRADE_PERSISTENCE === '1';
export const updateMetadataUrl = normalizeOptionalEnv(process.env.OD_PACKAGED_E2E_WIN_UPDATE_METADATA_URL);
export const updateVersion = normalizeOptionalEnv(process.env.OD_PACKAGED_E2E_WIN_UPDATE_VERSION);
export const updateBuildJsonPath = normalizeOptionalEnv(process.env.OD_PACKAGED_E2E_WIN_UPDATE_BUILD_JSON_PATH);
export const intermediateUpdateBuildJsonPath = normalizeOptionalEnv(
  process.env.OD_PACKAGED_E2E_WIN_INTERMEDIATE_UPDATE_BUILD_JSON_PATH,
);
export const updateFixture = normalizeOptionalEnv(process.env.OD_PACKAGED_E2E_WIN_UPDATE_FIXTURE);
export const closureBuildJsonPath = normalizeOptionalEnv(process.env.OD_PACKAGED_E2E_CLOSURE_BUILD_JSON_PATH);
export const closureDistributionManifestPath = normalizeOptionalEnv(
  process.env.OD_PACKAGED_E2E_CLOSURE_DISTRIBUTION_MANIFEST_PATH,
);
export const closureBlobRoots = parsePathListEnv(process.env.OD_PACKAGED_E2E_CLOSURE_BLOB_ROOTS_JSON);
export const legacyInstallerPath = normalizeOptionalEnv(process.env.OD_PACKAGED_E2E_WIN_LEGACY_INSTALLER_PATH);
export const legacyVersion = normalizeOptionalEnv(process.env.OD_PACKAGED_E2E_WIN_LEGACY_VERSION);
export const minimumShellVersion = normalizeOptionalEnv(process.env.OD_PACKAGED_E2E_WIN_MIN_SHELL_VERSION);
export const updateFixturePort = resolveOptionalFixturePort(process.env.OD_PACKAGED_E2E_WIN_UPDATE_FIXTURE_PORT);
export const updateFixtureMode = resolveUpdateFixtureMode(process.env.OD_PACKAGED_E2E_WIN_UPDATE_MODE);
export const releaseChannel = process.env.OD_PACKAGED_E2E_RELEASE_CHANNEL;
export const releaseVersion = process.env.OD_PACKAGED_E2E_RELEASE_VERSION;
export const shellVersion = process.env.OD_PACKAGED_E2E_SHELL_VERSION;
export const shellSmokeProof = normalizeOptionalEnv(process.env.OD_PACKAGED_E2E_SHELL_SMOKE_PROOF);
export const verifyPublicImmutableArtifacts = shellSmokeProof === 'public-immutable-artifacts';
export const packagedInviteDeeplink =
  'opendesign://workspace/invite/continue?workspace_id=packaged-smoke-workspace&member_id=packaged-smoke-member&invite_id=packaged-smoke-invite&nonce=packaged-smoke-nonce';
export const updateScenario = resolvePackagedUpdateScenario({ releaseChannel, releaseVersion, shellVersion });
export const installIdentity = resolvePackagedWinInstallIdentity({ namespace, releaseVersion });

export const outputNamespaceRoot = join(toolsPackDir, 'out', 'win', 'namespaces', namespace);
export const runtimeNamespaceRoot = join(toolsPackDir, 'runtime', 'win', 'namespaces', namespace);
export const nativeProductUserDataRoot = join(
  process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'),
  'Open Design',
);
export const nativeRuntimeNamespaceBaseRoot = join(nativeProductUserDataRoot, 'namespaces');
export const nativeRuntimeNamespaceRoot = join(nativeRuntimeNamespaceBaseRoot, namespace);
export const activeRuntimeNamespaceRoot = verifyPublicImmutableArtifacts
  ? nativeRuntimeNamespaceRoot
  : runtimeNamespaceRoot;
export const portableNsisLogPath = join(
  tmpdir(),
  'Open Design',
  'installer-logs',
  'namespaces',
  namespace.replace(/[^A-Za-z0-9._-]+/g, '-'),
  'nsis.log',
);
export const launcherNamespaceRoot = join(
  toolsPackDir,
  'runtime',
  'win',
  'launcher',
  'channels',
  updateScenario.channel,
  'namespaces',
  namespace,
);
export const screenshotPath = join(toolsPackDir, 'screenshots', `${namespace}.png`);
export const preUpdateScreenshotPath = join(toolsPackDir, 'screenshots', `${namespace}-before-update.png`);
export const readinessExpression = `
  (() => ({
    href: location.href,
    mounted: document.documentElement.getAttribute('data-od-app-mounted'),
    readyState: document.readyState,
    title: document.title,
  }))()
`;
export const healthExpression = `
  (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    try {
      const response = await fetch('/api/health', { signal: controller.signal });
      return {
        health: await response.json(),
        href: location.href,
        status: response.status,
        title: document.title,
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
        href: location.href,
        name: error instanceof Error ? error.name : null,
        title: document.title,
      };
    } finally {
      clearTimeout(timeout);
    }
  })()
`;
export const bundledPluginInventoryExpression = `
  (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    try {
      const response = await fetch('/api/plugins', { signal: controller.signal });
      const body = await response.json();
      const plugins = Array.isArray(body?.plugins) ? body.plugins : [];
      return {
        ids: plugins.map((plugin) => plugin?.id ?? plugin?.name).filter(Boolean),
        status: response.status,
      };
    } finally {
      clearTimeout(timeout);
    }
  })()
`;
export const pptxExportExpression = `
  (async () => {
    const projectId = 'packaged-payload-pptx-' + Date.now().toString(36);
    const html = '<!doctype html><html><head><style>' +
      'html,body{margin:0}.slide{width:1920px;height:1080px;display:flex;align-items:center;justify-content:center;font:96px sans-serif;color:white}' +
      '.slide:first-child{background:#17324d}.slide:last-child{background:#8b3a2b}' +
      '</style></head><body><section class="slide">Payload One</section><section class="slide">Payload Two</section></body></html>';
    const created = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: projectId, name: 'Packaged payload PPTX' }),
    });
    if (!created.ok) throw new Error('project create failed: ' + created.status);
    const written = await fetch('/api/projects/' + encodeURIComponent(projectId) + '/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'deck.html', content: html }),
    });
    if (!written.ok) throw new Error('deck write failed: ' + written.status);
    const exported = await fetch('/api/projects/' + encodeURIComponent(projectId) + '/export/pptx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: 'deck.html' }),
    });
    const bytes = new Uint8Array(await exported.arrayBuffer());
    return {
      byteLength: bytes.length,
      contentType: exported.headers.get('content-type'),
      magic: String.fromCharCode(...bytes.slice(0, 2)),
      projectId,
      status: exported.status,
    };
  })()
`;
export const upgradePersistenceProjectId = `packaged-upgrade-persistence-${Date.now().toString(36)}`;
export const upgradePersistenceSeedExpression = `
  (async () => {
    const projectId = ${JSON.stringify(upgradePersistenceProjectId)};
    const html = '<!doctype html><html><head><style>' +
      'html,body{margin:0}.slide{width:1920px;height:1080px;display:flex;align-items:center;justify-content:center;font:96px sans-serif;color:white}' +
      '.slide:first-child{background:#17324d}.slide:last-child{background:#8b3a2b}' +
      '</style></head><body><section class="slide">Upgrade From 0.12</section><section class="slide">Persistence Check</section></body></html>';
    const created = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: projectId, name: 'Packaged upgrade persistence' }),
    });
    const written = created.ok
      ? await fetch('/api/projects/' + encodeURIComponent(projectId) + '/files', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'deck.html', content: html }),
        })
      : null;
    return {
      createdOk: created.ok,
      createdStatus: created.status,
      projectId,
      writtenOk: written?.ok ?? false,
      writtenStatus: written?.status ?? null,
    };
  })()
`;

export function existingProjectPptxExportExpression(projectId: string): string {
  return `
    (async () => {
      const projectId = ${JSON.stringify(projectId)};
      const exported = await fetch('/api/projects/' + encodeURIComponent(projectId) + '/export/pptx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: 'deck.html' }),
      });
      const bytes = new Uint8Array(await exported.arrayBuffer());
      return {
        byteLength: bytes.length,
        contentType: exported.headers.get('content-type'),
        magic: String.fromCharCode(...bytes.slice(0, 2)),
        projectId,
        status: exported.status,
      };
    })()
  `;
}
export const packagedOnboardingExpression = `
  (() => {
    const onboardingShell = document.querySelector('.entry-shell--onboarding');
    const onboardingModal = document.querySelector('.entry-onboarding-modal');
    // Identity is the first gate; runtime selection follows Cloud sign-in.
    const cloudSignIn = document.querySelector('.onboarding-cloud__primary');

    return {
      cloudSignInVisible: cloudSignIn instanceof HTMLElement,
      href: location.href,
      onboardingVisible: onboardingShell instanceof HTMLElement && onboardingModal instanceof HTMLElement,
      text: onboardingModal?.textContent?.trim().slice(0, 2000) ?? null,
      title: document.title,
    };
  })()
`;

export type DesktopStatus = {
  pid?: number;
  standalone?: unknown;
  state?: string;
  title?: string | null;
  url?: string | null;
  windowVisible?: boolean;
};

export type WinInstallResult = {
  desktopShortcutExists: boolean;
  desktopShortcutPath: string;
  installDir: string;
  installPayload: {
    fileCount: number;
    totalBytes: number;
    topLevel: Array<{
      bytes: number;
      fileCount: number;
      path: string;
    }>;
  };
  installerPath: string;
  lifecycleTimings?: SmokeTiming[];
  namespace: string;
  registryEntries: unknown[];
  startMenuShortcutExists: boolean;
  startMenuShortcutPath: string;
  timingPath: string;
  uninstallerPath: string;
};

export type WinStartResult = {
  executablePath: string;
  logPath: string;
  namespace: string;
  pid: number;
  processExitedBeforeStatus?: boolean;
  source: string;
  status: DesktopStatus | null;
  statusPollCount?: number;
  statusWaitDurationMs?: number;
};

export type WinStopResult = {
  namespace: string;
  remainingPids: number[];
  status: string;
};

export type WinCleanupResult = {
  namespace: string;
  residueObservation?: {
    installedExeExists?: boolean;
    managedProcessPids?: number[];
    productNamespaceRootExists?: boolean;
    registryResidues?: string[];
    startMenuShortcutExists?: boolean;
    uninstallerExists?: boolean;
    userDesktopShortcutExists?: boolean;
  };
};

export type WinUninstallResult = {
  lifecycleTimings?: SmokeTiming[];
  namespace: string;
  residueObservation?: WinCleanupResult['residueObservation'];
};

export type WinListResult = {
  current: {
    installDir: string;
    installedExeExists: boolean;
    installedExePath: string;
    registryEntries: Array<{
      displayName: string | null;
      displayVersion: string | null;
      installLocation: string | null;
      keyPath: string;
    }>;
    registryResidues: string[];
  };
};

export type WinInspectResult = {
  daemonStatus: DesktopStatus | null;
  daemonStatusError?: string;
  desktopIpcUnavailable?: boolean;
  eval?: {
    error?: string;
    ok: boolean;
    value?: unknown;
  };
  managedProcessPids?: number[];
  screenshot?: {
    path: string;
  };
  status: DesktopStatus | null;
  statusError?: string;
  update?: {
    active?: {
      artifact?: {
        type?: string;
      };
      path?: string;
      version?: string;
    };
    artifact?: {
      type?: string;
      url?: string;
    };
    availableVersion?: string;
    channel?: string;
    currentVersion?: string;
    downloadPath?: string;
    error?: {
      code: string;
      message: string;
    };
    installResult?: {
      dryRun?: boolean;
      path: string;
    };
    progress?: {
      receivedBytes?: number;
      totalBytes?: number;
    };
    reinstall?: {
      installedVersion?: string;
      minVersion?: string;
      reason: string;
      url?: string;
    };
    state: string;
  };
  wait?: {
    attempts: number;
    durationMs: number;
    intervalMs: number;
  };
  webStatus: DesktopStatus | null;
  webStatusError?: string;
  launcher: LauncherSnapshot;
};

export type LauncherSnapshot = {
  active: LauncherPointer | null;
  attempt: (LauncherPointer & { channel?: string; namespace?: string }) | null;
  attemptsPath: string;
  channel: string;
  error?: string;
  exists: boolean;
  handoff: unknown | null;
  handoffPath: string;
  lastSuccessful: LauncherPointer | null;
  namespace: string;
  root: string;
  runtimePath: string;
  stateRoot: string;
  versionRoots: string[];
  versionsRoot: string;
};

export type LauncherPointer = {
  generation: number;
  version: string;
};

export type LogsResult = {
  logs: Record<string, { lines: string[]; logPath: string }>;
  namespace: string;
};

export type TimingResult = {
  action: string;
  durationMs: number;
  status: string;
};

export type HealthEvalValue = {
  health: {
    ok?: unknown;
    service?: unknown;
    version?: unknown;
  };
  href: string;
  status: number;
  title: string;
};

export type PptxExportEvalValue = {
  byteLength: number;
  contentType: string | null;
  magic: string;
  projectId: string;
  status: number;
};

export type UpgradePersistenceSeed = {
  createdOk: boolean;
  createdStatus: number;
  projectId: string;
  writtenOk: boolean;
  writtenStatus: number | null;
};

export type DesktopIdentityMarker = {
  appPath: string;
  executablePath: string;
  pid: number;
  runtime?: {
    descriptor?: {
      release?: { version?: string };
      shell?: { digest?: string; type?: string; version?: string };
      standalone?: { digest?: string; protocolVersion?: number; version?: string };
    };
    descriptorDigest?: string;
    generation?: number;
    scope?: { channel?: string; generation?: number; namespace?: string };
    standalonePid?: number;
  };
  stamp?: {
    app?: string;
    mode?: string;
    namespace?: string;
    source?: string;
  };
  version: number;
};

export type PackagedOnboardingEvalValue = {
  cloudSignInVisible: boolean;
  href: string;
  onboardingVisible: boolean;
  text: string | null;
  title: string;
};

export type SmokeTiming = {
  durationMs: number;
  step: string;
};

export type ReusableWinPackagedClosureFixture = PackagedClosureFixture & {
  verification: StoredClosureVerification;
};

export type DirectInstallerResult = {
  code: number | null;
  nsisLogTail: string[];
};

export type UpdateFixtureMode = 'installer' | 'payload';

export type WinProtocolDebugCase = 'off' | 'protocol-prime' | 'protocol-direct' | 'protocol-shell' | 'protocol-all';

export function resolveWinProtocolDebugCase(raw: string | undefined): WinProtocolDebugCase {
  const value = raw?.trim() ?? '';
  if (value === '') return 'off';
  if (
    value === 'protocol-prime'
    || value === 'protocol-direct'
    || value === 'protocol-shell'
    || value === 'protocol-all'
  ) return value;
  throw new Error(
    `unsupported OD_PACKAGED_E2E_WIN_DEBUG_CASE ${JSON.stringify(raw)}; expected protocol-prime, protocol-direct, protocol-shell, protocol-all, or empty`,
  );
}

export const shouldRunPackagedWinSmoke = process.platform === 'win32' && process.env.OD_PACKAGED_E2E_WIN === '1';
export const winProtocolDebugCase = resolveWinProtocolDebugCase(process.env.OD_PACKAGED_E2E_WIN_DEBUG_CASE);

export function parsePathListEnv(value: string | undefined): string[] {
  if (value == null || value.trim().length === 0) return [];
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed) || parsed.some((entry) => typeof entry !== 'string' || entry.length === 0)) {
    throw new Error('OD_PACKAGED_E2E_CLOSURE_BLOB_ROOTS_JSON must be a JSON array of paths');
  }
  return parsed;
}

export function isPathInside(filePath: string, expectedRoot: string): boolean {
  const normalizedPath = normalizePathForComparison(resolve(filePath));
  const normalizedRoot = normalizePathForComparison(resolve(expectedRoot));
  return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}${sep}`);
}

export function normalizePathForComparison(filePath: string): string {
  return process.platform === 'win32' ? filePath.toLowerCase() : filePath;
}

export async function resetPackagedRuntimeNamespaceRoot(namespaceRoot: string): Promise<void> {
  await rm(namespaceRoot, { force: true, recursive: true });
}

export async function resetPackagedUpdaterNamespaceRoots(): Promise<void> {
  await Promise.all([
    resetPackagedRuntimeNamespaceRoot(runtimeNamespaceRoot),
    resetPackagedRuntimeNamespaceRoot(launcherNamespaceRoot),
  ]);
}

// Reset every per-namespace runtime state directory before a fresh-onboarding
// start, EXCEPT the installed app payload (`install/`). On Windows the install
// lives UNDER the runtime namespace root, so — unlike the macOS smoke, which
// installs to /Applications and can `rm` the whole namespace root
// (resetPackagedMacRuntimeData) — we must preserve `install/` while wiping
// everything else.
//
// Wiping only `data/` is not enough. The packaged web frontend persists its
// config — including `onboardingCompleted` — to `localStorage`, which Electron
// stores under the SEPARATE `user-data/` partition, not the daemon's `data/`
// dir (see the `daemonDataRoot` vs `electronUserDataRoot` split logged on
// boot). When `<data>/app-config.json` is absent the daemon OMITS
// `onboardingCompleted`, so `mergeDaemonConfig` keeps the localStorage value;
// a leftover `onboardingCompleted: true` from an earlier run (e.g. the [P2]
// smoke that ran first in this file) then boots the app straight to Home
// instead of onboarding, and this test times out waiting for the cloud
// sign-in landing. Clearing `user-data/` alongside `data/` gives the same
// true-first-run guarantee the mac smoke gets from removing the entire root.
export async function resetPackagedRuntimeDataRoot(): Promise<void> {
  // A missing root means the namespace has no runtime state yet — already a
  // fresh first-run, nothing to wipe. Any OTHER readdir failure (permissions,
  // I/O) is a real problem that must surface loudly: swallowing it would turn
  // the reset into a silent no-op and let stale state through, defeating the
  // very guarantee this helper exists to make.
  const entries = await readdir(runtimeNamespaceRoot).catch((error: NodeJS.ErrnoException) => {
    if (error?.code === 'ENOENT') return [] as string[];
    throw error;
  });
  await Promise.all(
    entries
      .filter((entry) => entry !== 'install')
      .map((entry) => rm(join(runtimeNamespaceRoot, entry), { force: true, recursive: true })),
  );
}

export function resolveFromWorkspace(filePath: string): string {
  return isAbsolute(filePath) ? filePath : resolve(workspaceRoot, filePath);
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

export async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256');
  const stream = createReadStream(path);
  await new Promise<void>((resolveHash, rejectHash) => {
    stream.on('data', (chunk) => hash.update(chunk));
    stream.once('error', rejectHash);
    stream.once('end', resolveHash);
  });
  return hash.digest('hex');
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null && !Array.isArray(value);
}

export function isExecError(value: unknown): value is { code?: unknown; message: string; stderr: string; stdout: string } {
  return (
    isRecord(value) &&
    typeof value.message === 'string' &&
    typeof value.stdout === 'string' &&
    typeof value.stderr === 'string'
  );
}

export function formatUnknown(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function normalizeOptionalEnv(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized == null || normalized.length === 0 ? null : normalized;
}

export function requireMigrationInput(name: string, value: string | null | undefined): string {
  if (value != null && value.length > 0) return value;
  throw new Error(`full historical migration acceptance requires ${name}`);
}

export function resolveOptionalFixturePort(value: string | undefined): number | null {
  const normalized = normalizeOptionalEnv(value);
  if (normalized == null) return null;
  const port = Number(normalized);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(
      `OD_PACKAGED_E2E_WIN_UPDATE_FIXTURE_PORT must be an integer between 1 and 65535, received ${JSON.stringify(normalized)}`,
    );
  }
  return port;
}

export function resolveUpdateFixtureMode(value: string | undefined): UpdateFixtureMode {
  const normalized = normalizeOptionalEnv(value) ?? 'payload';
  if (normalized === 'installer' || normalized === 'payload') return normalized;
  throw new Error(`OD_PACKAGED_E2E_WIN_UPDATE_MODE must be installer or payload, received ${JSON.stringify(normalized)}`);
}
