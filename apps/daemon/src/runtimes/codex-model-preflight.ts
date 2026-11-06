import { readFile, realpath, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { resolveCodexConfigPath } from '../codex-config-normalize.js';
import { execAgentFile } from './invocation.js';

type StableCodexVersion = {
  major: number;
  minor: number;
  patch: number;
};

type CodexVersionProbe = {
  cliVersion: string;
  stableVersion: StableCodexVersion | null;
};

type KnownModelRequirement = {
  minimum: StableCodexVersion;
  minimumLabel: string;
};

const KNOWN_MODEL_REQUIREMENTS: Readonly<Record<string, KnownModelRequirement>> = {
  // Production traces showed 0.142.5 rejecting this ChatGPT-backed model with
  // "requires a newer version of Codex". Upstream confirms 0.143.0 can start
  // it explicitly even when the interactive model picker omits it, so version
  // is the compatibility contract here—not catalog visibility.
  'gpt-5.6-terra': {
    minimum: { major: 0, minor: 143, patch: 0 },
    minimumLabel: '0.143.0',
  },
};

export type CodexModelPreflightResult =
  | {
      status: 'not_applicable' | 'unknown';
      reason:
        | 'explicit_model'
        | 'project_config'
        | 'config_unavailable'
        | 'configured_model_missing'
        | 'custom_provider'
        | 'config_overlay'
        | 'auth_override'
        | 'system_config'
        | 'managed_config'
        | 'version_unavailable'
        | 'no_known_requirement'
        | 'auth_unconfirmed';
    }
  | {
      status: 'compatible' | 'incompatible';
      model: string;
      cliVersion: string;
      requiredCliVersion: string;
    };

export interface CodexModelPreflightInput {
  launchPath: string;
  env: NodeJS.ProcessEnv;
  requestedModel: string | null | undefined;
  projectRoot?: string | null;
}

const versionProbeCache = new Map<string, Promise<CodexVersionProbe | null>>();
let macManagedConfigProbe: Promise<boolean> | null = null;

function stripTomlComment(line: string): string {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === '#' && !inSingle && !inDouble) return line.slice(0, i);
  }
  return line;
}

function quotedRootValue(line: string, key: string): string | null {
  const tomlKey = `(?:${key}|"${key}"|'${key}')`;
  const match = new RegExp(
    `^${tomlKey}\\s*=\\s*(?:"([^"]*)"|'([^']*)')\\s*$`,
  ).exec(line);
  if (!match) return null;
  const value = (match[1] ?? match[2] ?? '').trim();
  return value || null;
}

function assignsKey(line: string, key: string): boolean {
  const tomlKey = `(?:${key}|"${key}"|'${key}')`;
  return new RegExp(`^${tomlKey}\\s*=`).test(line);
}

export function extractCodexRootModelConfig(content: string): {
  model: string | null;
  modelProvider: string | null;
  hasCompatibilityOverlay: boolean;
} {
  let model: string | null = null;
  let modelProvider: string | null = null;
  let hasCompatibilityOverlay = false;
  let inRootTable = true;
  let inOpenAiProviderTable = false;

  for (const raw of String(content || '').split(/\r?\n/)) {
    const line = stripTomlComment(raw).trim();
    if (!line) continue;

    if (line.startsWith('[')) {
      inRootTable = false;
      inOpenAiProviderTable = /^\[model_providers\.openai\]$/.test(line);
      if (inOpenAiProviderTable) hasCompatibilityOverlay = true;
      continue;
    }

    // These settings can replace the server/model source independently of the
    // root model string. Without fully evaluating Codex's config stack, a
    // version-only rejection would be unsafe, so their presence makes the
    // preflight fail open.
    if (
      assignsKey(line, 'model_catalog_json')
      || assignsKey(line, 'openai_base_url')
      || assignsKey(line, 'chatgpt_base_url')
      || assignsKey(line, 'base_url')
    ) {
      hasCompatibilityOverlay = true;
    }

    if (!inRootTable) continue;
    if (
      assignsKey(line, 'profile')
      || assignsKey(line, 'project_root_markers')
    ) {
      hasCompatibilityOverlay = true;
    }
    model = quotedRootValue(line, 'model') ?? model;
    modelProvider = quotedRootValue(line, 'model_provider') ?? modelProvider;
  }

  return { model, modelProvider, hasCompatibilityOverlay };
}

function safeVersion(stdout: unknown, stderr: unknown): string | null {
  const text = `${String(stdout || '')}\n${String(stderr || '')}`.trim();
  const firstLine = text.split(/\r?\n/, 1)[0]?.trim() ?? '';
  if (!firstLine) return null;
  return firstLine.replace(/[^\x20-\x7E]/g, '').slice(0, 120) || null;
}

export function parseStableCodexVersion(value: string): StableCodexVersion | null {
  // Prerelease/build versions intentionally fail open. We only have a
  // production boundary for stable 0.142.5 (bad) and 0.143.0 (good).
  const match = /(?:^|[^\d])(\d+)\.(\d+)\.(\d+)(?![\dA-Za-z.+-])/.exec(value);
  if (!match) return null;
  const [, major, minor, patch] = match;
  return {
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
  };
}

function compareVersions(left: StableCodexVersion, right: StableCodexVersion): number {
  if (left.major !== right.major) return left.major - right.major;
  if (left.minor !== right.minor) return left.minor - right.minor;
  return left.patch - right.patch;
}

async function executableCacheKey(launchPath: string): Promise<string | null> {
  try {
    const info = await stat(launchPath);
    return `${launchPath}\0${info.size}\0${info.mtimeMs}`;
  } catch {
    return null;
  }
}

async function probeVersion(
  launchPath: string,
  env: NodeJS.ProcessEnv,
): Promise<CodexVersionProbe | null> {
  const cacheKey = await executableCacheKey(launchPath);
  if (!cacheKey) return null;
  const cached = versionProbeCache.get(cacheKey);
  if (cached) return cached;

  const pending = (async (): Promise<CodexVersionProbe | null> => {
    try {
      const result = await execAgentFile(launchPath, ['--version'], {
        env,
        timeout: 3_000,
      });
      const cliVersion = safeVersion(result.stdout, result.stderr);
      const stableVersion = cliVersion
        ? parseStableCodexVersion(cliVersion)
        : null;
      return cliVersion ? { cliVersion, stableVersion } : null;
    } catch {
      return null;
    }
  })();
  versionProbeCache.set(cacheKey, pending);
  void pending.then((result) => {
    // Only transient execution failures are evicted. A successful probe with
    // an unrecognised/prerelease version is cached as a fail-open result so
    // every run does not pay for another `codex --version` process.
    if (!result && versionProbeCache.get(cacheKey) === pending) {
      versionProbeCache.delete(cacheKey);
    }
  });
  return pending;
}

async function pathState(filePath: string): Promise<'present' | 'missing' | 'uncertain'> {
  try {
    await stat(filePath);
    return 'present';
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code === 'ENOENT' || code === 'ENOTDIR' ? 'missing' : 'uncertain';
  }
}

async function projectConfigExists(projectCwd: string | null | undefined): Promise<boolean> {
  if (!projectCwd) return false;
  let start: string;
  try {
    // Node/Codex resolves the child cwd physically. Scan that same path so a
    // symlinked imported workspace cannot hide its real repository config.
    start = await realpath(path.resolve(projectCwd));
  } catch {
    return true;
  }
  const ancestors: string[] = [];
  let current = start;
  let gitRoot: string | null = null;

  // Codex layers project config from the repository root down to cwd. Find the
  // nearest repository boundary first; when there is no repository, inspect
  // only the explicit project cwd so a user's global ~/.codex/config.toml is
  // never mistaken for a project override.
  while (true) {
    ancestors.push(current);
    const gitState = await pathState(path.join(current, '.git'));
    if (gitState === 'uncertain') return true;
    if (gitState === 'present') {
      gitRoot = current;
      break;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  const searchDirs = gitRoot
    ? ancestors.slice(0, ancestors.indexOf(gitRoot) + 1)
    : [start];
  for (const dir of searchDirs) {
    const configState = await pathState(path.join(dir, '.codex', 'config.toml'));
    if (configState !== 'missing') return true;
  }
  return false;
}

const AUTH_OR_ENDPOINT_ENV_KEYS = new Set([
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
  'OPENAI_API_BASE',
  'CODEX_API_KEY',
]);

function hasAuthOrEndpointOverride(env: NodeJS.ProcessEnv): boolean {
  // Windows environment names are case-insensitive, while a plain JS object is
  // not. Match keys case-insensitively on every platform so mixed-case inherited
  // variables cannot bypass this fail-open boundary.
  return Object.entries(env).some(
    ([key, value]) =>
      AUTH_OR_ENDPOINT_ENV_KEYS.has(key.toUpperCase())
      && typeof value === 'string'
      && value.trim().length > 0,
  );
}

function envValueCaseInsensitive(
  env: NodeJS.ProcessEnv,
  expectedKey: string,
): string | null {
  const matched = Object.entries(env).find(
    ([key, value]) =>
      key.toUpperCase() === expectedKey
      && typeof value === 'string'
      && value.trim().length > 0,
  )?.[1];
  return matched?.trim() || null;
}

async function hasSystemConfigLayer(
  env: NodeJS.ProcessEnv,
): Promise<boolean> {
  const configPath = process.platform === 'win32'
    ? path.join(
        envValueCaseInsensitive(env, 'PROGRAMDATA') ?? 'C:\\ProgramData',
        'OpenAI',
        'Codex',
        'config.toml',
      )
    : '/etc/codex/config.toml';
  return await pathState(configPath) !== 'missing';
}

async function hasMacManagedConfigPreference(
  env: NodeJS.ProcessEnv,
): Promise<boolean> {
  if (process.platform !== 'darwin') return false;
  if (macManagedConfigProbe) return macManagedConfigProbe;

  macManagedConfigProbe = (async () => {
    const managedPreferencePaths = [
      '/Library/Managed Preferences/com.openai.codex.plist',
    ];
    try {
      managedPreferencePaths.push(
        path.join(
          '/Library/Managed Preferences',
          os.userInfo().username,
          'com.openai.codex.plist',
        ),
      );
    } catch {
      // `defaults` below remains the authoritative fallback.
    }
    for (const preferencePath of managedPreferencePaths) {
      const state = await pathState(preferencePath);
      if (state !== 'missing') return true;
    }

    try {
      const result = await execAgentFile(
        '/usr/bin/defaults',
        ['read', 'com.openai.codex', 'config_toml_base64'],
        { env, timeout: 1_500 },
      );
      return Boolean(
        `${String(result.stdout || '')}\n${String(result.stderr || '')}`.trim(),
      );
    } catch (error) {
      const probed = error as NodeJS.ErrnoException & {
        stdout?: unknown;
        stderr?: unknown;
      };
      const text = [
        probed.message,
        String(probed.stdout || ''),
        String(probed.stderr || ''),
      ].join('\n');
      // `defaults` uses exit 1 for a definitely absent domain/key. Any other
      // failure is an uncertain enterprise boundary and must fail open.
      return !/domain\/default pair .* does not exist/i.test(text);
    }
  })();
  return macManagedConfigProbe;
}

async function hasManagedConfigLayer(env: NodeJS.ProcessEnv): Promise<boolean> {
  const configDir = path.dirname(resolveCodexConfigPath(env));
  const candidates = [
    path.join(configDir, 'managed_config.toml'),
    // Codex stores fetched enterprise config bundles here. We do not parse the
    // signed payload or assume it is current; presence alone means a non-user
    // layer may affect the effective provider or endpoint, so fail open.
    path.join(configDir, 'cloud-config-bundle-cache.json'),
  ];
  if (process.platform !== 'win32') {
    candidates.push('/etc/codex/managed_config.toml');
  }
  for (const candidate of candidates) {
    const state = await pathState(candidate);
    if (state !== 'missing') return true;
  }
  return hasMacManagedConfigPreference(env);
}

async function hasConfirmedChatGptAuth(
  launchPath: string,
  env: NodeJS.ProcessEnv,
): Promise<boolean> {
  try {
    const result = await execAgentFile(launchPath, ['login', 'status'], {
      env,
      timeout: 3_000,
    });
    const output = `${String(result.stdout || '')}\n${String(result.stderr || '')}`;
    return /\bLogged in using ChatGPT\b/i.test(output);
  } catch {
    return false;
  }
}

export async function preflightCodexDefaultModel(
  input: CodexModelPreflightInput,
): Promise<CodexModelPreflightResult> {
  const requestedModel = input.requestedModel?.trim() ?? '';
  if (requestedModel && requestedModel !== 'default') {
    return { status: 'not_applicable', reason: 'explicit_model' };
  }
  if (await projectConfigExists(input.projectRoot)) {
    return { status: 'unknown', reason: 'project_config' };
  }

  let content: string;
  try {
    content = await readFile(resolveCodexConfigPath(input.env), 'utf8');
  } catch {
    return { status: 'unknown', reason: 'config_unavailable' };
  }
  const configured = extractCodexRootModelConfig(content);
  if (!configured.model) {
    return { status: 'not_applicable', reason: 'configured_model_missing' };
  }
  if (
    configured.modelProvider
    && configured.modelProvider.toLowerCase() !== 'openai'
  ) {
    return { status: 'not_applicable', reason: 'custom_provider' };
  }
  if (configured.hasCompatibilityOverlay) {
    return { status: 'unknown', reason: 'config_overlay' };
  }
  if (hasAuthOrEndpointOverride(input.env)) {
    return { status: 'unknown', reason: 'auth_override' };
  }

  const requirement = KNOWN_MODEL_REQUIREMENTS[configured.model];
  if (!requirement) {
    return { status: 'not_applicable', reason: 'no_known_requirement' };
  }
  const version = await probeVersion(input.launchPath, input.env);
  if (!version?.stableVersion) {
    return { status: 'unknown', reason: 'version_unavailable' };
  }

  if (compareVersions(version.stableVersion, requirement.minimum) >= 0) {
    return {
      status: 'compatible',
      model: configured.model,
      cliVersion: version.cliVersion,
      requiredCliVersion: requirement.minimumLabel,
    };
  }

  if (await hasSystemConfigLayer(input.env)) {
    return { status: 'unknown', reason: 'system_config' };
  }
  if (await hasManagedConfigLayer(input.env)) {
    return { status: 'unknown', reason: 'managed_config' };
  }

  // The known incompatibility applies to the ChatGPT/Codex backend's client
  // gate. API-key and custom-endpoint paths deliberately fail open above; for
  // the remaining old-version case, require positive ChatGPT auth evidence
  // before blocking the child process.
  if (!await hasConfirmedChatGptAuth(input.launchPath, input.env)) {
    return { status: 'unknown', reason: 'auth_unconfirmed' };
  }
  // `codex login status` loads the effective Codex config and can populate the
  // enterprise bundle cache on a first run. Re-check after that probe so a
  // newly materialized cloud layer cannot race the incompatibility decision.
  if (await hasManagedConfigLayer(input.env)) {
    return { status: 'unknown', reason: 'managed_config' };
  }
  return {
    status: 'incompatible',
    model: configured.model,
    cliVersion: version.cliVersion,
    requiredCliVersion: requirement.minimumLabel,
  };
}
