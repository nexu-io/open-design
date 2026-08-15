// @vitest-environment node

import { execFile } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { dirname,isAbsolute,join,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';


import { MacFocusWitness } from '@/vitest/mac-focus-witness';
import {
	resolvePackagedSmokeLanes
} from '@/vitest/packaged-smoke-contract';
import { resolvePackagedSmokeProfile } from '@/vitest/packaged-smoke-profile';
import {
	resolvePackagedUpdateScenario
} from '@/vitest/packaged-update-scenario';
import { resolvePackagedSmokeNamespace } from '@/vitest/suite';



export const execFileAsync = promisify(execFile);
export const e2eRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
export const workspaceRoot = dirname(e2eRoot);
export const toolsPackDir = resolveFromWorkspace(process.env.OD_PACKAGED_E2E_TOOLS_PACK_DIR ?? '.tmp/tools-pack');
export const namespace = resolvePackagedSmokeNamespace('mac');
export const releaseChannel = process.env.OD_PACKAGED_E2E_RELEASE_CHANNEL;
export const releaseVersion = process.env.OD_PACKAGED_E2E_RELEASE_VERSION;
export const shellVersion = process.env.OD_PACKAGED_E2E_SHELL_VERSION;
export const updateScenario = resolvePackagedUpdateScenario({ releaseChannel, releaseVersion, shellVersion });
export const pnpmCommand = process.env.OD_E2E_PNPM_COMMAND ?? 'pnpm';
export const packagedHeadless = process.env.OD_PACKAGED_E2E_HEADLESS === '1';
export const macFocusWitness = packagedHeadless && process.platform === 'darwin'
  ? new MacFocusWitness(toolsPackDir)
  : null;
export const packagedMacClosureTarget = process.arch === 'x64' ? 'darwin-x64' : 'darwin-arm64';
export const packagedMacUpdaterPlatform = process.arch === 'x64' ? 'macIntel' : 'mac';
export const screenshotPath = join(toolsPackDir, 'screenshots', `${namespace}.png`);
export const smokeProfile = resolvePackagedSmokeProfile(process.env.OD_PACKAGED_E2E_MAC_SMOKE_PROFILE);
export const smokeLanes = resolvePackagedSmokeLanes(
  smokeProfile,
  process.env.OD_PACKAGED_E2E_MAC_SMOKE_LANES,
);
export const verifyCoreOnly = smokeProfile === 'core';
export const updateMetadataUrl = normalizeOptionalEnv(process.env.OD_PACKAGED_E2E_MAC_UPDATE_METADATA_URL);
export const updateVersion = normalizeOptionalEnv(process.env.OD_PACKAGED_E2E_MAC_UPDATE_VERSION);
export const updateBuildJsonPath = normalizeOptionalEnv(process.env.OD_PACKAGED_E2E_MAC_UPDATE_BUILD_JSON_PATH);
export const updateFixture = normalizeOptionalEnv(process.env.OD_PACKAGED_E2E_MAC_UPDATE_FIXTURE);
export const closureBuildJsonPath = normalizeOptionalEnv(process.env.OD_PACKAGED_E2E_CLOSURE_BUILD_JSON_PATH);
export const closureDistributionManifestPath = normalizeOptionalEnv(
  process.env.OD_PACKAGED_E2E_CLOSURE_DISTRIBUTION_MANIFEST_PATH,
);
export const closureBlobRoots = parsePathListEnv(process.env.OD_PACKAGED_E2E_CLOSURE_BLOB_ROOTS_JSON);
export const standaloneSeedEmbedded = process.env.OD_PACKAGED_E2E_STANDALONE_SEED_EMBEDDED === '1';
export const verifyPublicImmutableArtifacts =
  normalizeOptionalEnv(process.env.OD_PACKAGED_E2E_SHELL_SMOKE_PROOF) === 'public-immutable-artifacts';
export const verifyStandaloneRuntimeBinding = verifyPublicImmutableArtifacts || standaloneSeedEmbedded;
export const maxStartDurationMs = 90_000;
export const legacyDmgPath = normalizeOptionalEnv(process.env.OD_PACKAGED_E2E_MAC_LEGACY_DMG_PATH);
export const legacyVersion = normalizeOptionalEnv(process.env.OD_PACKAGED_E2E_MAC_LEGACY_VERSION);
export const minimumShellVersion = normalizeOptionalEnv(process.env.OD_PACKAGED_E2E_MAC_MIN_SHELL_VERSION);
export const packagedInviteDeeplink =
  'opendesign://workspace/invite/continue?workspace_id=packaged-smoke-workspace&member_id=packaged-smoke-member&invite_id=packaged-smoke-invite&nonce=packaged-smoke-nonce';

export const outputNamespaceRoot = join(toolsPackDir, 'out', 'mac', 'namespaces', namespace);
export const runtimeNamespaceRoot = join(toolsPackDir, 'runtime', 'mac', 'namespaces', namespace);
export const healthExpression = `
  (async () => {
    const response = await fetch('/api/health');
    return {
      health: await response.json(),
      href: location.href,
      status: response.status,
      title: document.title,
    };
  })()
`;
export const bundledPluginInventoryExpression = `
  (async () => {
    const response = await fetch('/api/plugins');
    const body = await response.json();
    const plugins = Array.isArray(body?.plugins) ? body.plugins : [];
    return {
      ids: plugins.map((plugin) => plugin?.id ?? plugin?.name).filter(Boolean),
      status: response.status,
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
      '</style></head><body><section class="slide">Upgrade From Outer</section><section class="slide">Persistence Check</section></body></html>';
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

export type MacInstallResult = {
  detached: boolean;
  dmgPath: string;
  installedAppPath: string;
  mountPoint: string;
  namespace: string;
};

export type MacStartResult = {
  appPath: string;
  executablePath: string;
  logPath: string;
  namespace: string;
  pid: number;
  source: string;
  status: DesktopStatus | null;
};

export type MacStopResult = {
  namespace: string;
  remainingPids: number[];
  status: string;
};

export type MacUninstallResult = {
  installedAppPath: string;
  namespace: string;
  removed: boolean;
  stop: MacStopResult;
};

export type MacInspectResult = {
  eval?: {
    error?: string;
    ok: boolean;
    value?: unknown;
  };
  screenshot?: {
    path: string;
  };
  status: DesktopStatus | null;
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
    reinstall?: {
      installedVersion?: string;
      minVersion?: string;
      reason: string;
      url?: string;
    };
    state: string;
    supported?: boolean;
  };
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
  version: number;
};

export type MacLaunchServicesWitness = {
  appPath: string;
  bundleId: string | null;
  embeddedConfig: Record<string, unknown> | null;
  executablePath: string;
  inheritedLaunchEnv: Record<string, string | null>;
  launchConfig: Record<string, unknown> | null;
  observations: Array<{ elapsedMs: number; processes: string[] }>;
  openCompletedAt: string;
  systemLog: string[];
  startedAt: string;
  stderrPath: string;
  stdoutPath: string;
  witnessPath: string;
};

export type PayloadRuntimeAcceptance = {
  coldStart: {
    health: HealthEvalValue;
    identity: DesktopIdentityMarker;
    launcher: LauncherSnapshot;
    pptx: PptxExportEvalValue;
    start: MacStartResult;
  };
  identity: DesktopIdentityMarker;
  pptx: PptxExportEvalValue;
};

export type UpdaterRecoverySummary = {
  cleared: NonNullable<MacInspectResult['update']>;
  downloadedBeforeClear: NonNullable<MacInspectResult['update']>;
  dryRunInstall: MacInspectResult['update'] | null;
  recovered: NonNullable<MacInspectResult['update']>;
};

export type PackagedOnboardingEvalValue = {
  cloudSignInVisible: boolean;
  href: string;
  onboardingVisible: boolean;
  text: string | null;
  title: string;
};

export const shouldRunPackagedMacSmoke = process.platform === 'darwin' && process.env.OD_PACKAGED_E2E_MAC === '1';

export function parsePathListEnv(value: string | undefined): string[] {
  if (value == null || value.trim().length === 0) return [];
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed) || parsed.some((entry) => typeof entry !== 'string' || entry.length === 0)) {
    throw new Error('OD_PACKAGED_E2E_CLOSURE_BLOB_ROOTS_JSON must be a JSON array of paths');
  }
  return parsed;
}

export async function resetPackagedMacRuntimeData(): Promise<void> {
  await rm(runtimeNamespaceRoot, { force: true, recursive: true });
}

export function resolveFromWorkspace(filePath: string): string {
  return isAbsolute(filePath) ? filePath : resolve(workspaceRoot, filePath);
}

export function normalizeOptionalEnv(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized == null || normalized.length === 0 ? null : normalized;
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null && !Array.isArray(value);
}

export function isExecError(value: unknown): value is { stderr: string; stdout: string } {
  return isRecord(value) && typeof value.stdout === 'string' && typeof value.stderr === 'string';
}

export function formatUnknown(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
