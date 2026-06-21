import fs from 'node:fs';
import path from 'node:path';

import { resolveProjectRelativePath } from './home-expansion.js';

export const SANDBOX_MODE_ENV = 'OD_SANDBOX_MODE';
export const SANDBOX_IMPORT_ALLOWED_ROOTS_ENV = 'OD_SANDBOX_IMPORT_ALLOWED_ROOTS';
export const SANDBOX_IMPORTED_PROJECT_UNAVAILABLE_MESSAGE =
  `Imported-folder projects are not available in ${SANDBOX_MODE_ENV} unless ` +
  `their root is under ${SANDBOX_IMPORT_ALLOWED_ROOTS_ENV}.`;
export const SANDBOX_IMPORT_ALLOWED_ROOTS_INVALID_MESSAGE =
  `${SANDBOX_IMPORT_ALLOWED_ROOTS_ENV} entries must be absolute paths.`;

export interface SandboxRuntimeRoots {
  agentHomeDir: string;
  cacheDir: string;
  configDir: string;
  generatedFilesDir: string;
  logsDir: string;
  mcpConfigDir: string;
  pluginStateDir: string;
  previewStateDir: string;
  skillsCacheDir: string;
  tempDir: string;
  toolConfigDir: string;
}

export interface SandboxRuntimeConfig {
  enabled: boolean;
  dataDir: string;
  roots: SandboxRuntimeRoots;
}

const TRUTHY_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSY_VALUES = new Set(['0', 'false', 'no', 'off', '']);

export function isSandboxModeEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const raw = env[SANDBOX_MODE_ENV];
  if (typeof raw !== 'string') return false;
  const value = raw.trim().toLowerCase();
  if (TRUTHY_VALUES.has(value)) return true;
  if (FALSY_VALUES.has(value)) return false;
  throw new Error(
    `${SANDBOX_MODE_ENV} must be one of ${Array.from(TRUTHY_VALUES).join(', ')} ` +
      `or ${Array.from(FALSY_VALUES).join(', ')}`,
  );
}

function configuredSandboxImportRoots(
  env: Record<string, string | undefined>,
): string[] {
  const raw = env[SANDBOX_IMPORT_ALLOWED_ROOTS_ENV];
  if (typeof raw !== 'string' || !raw.trim()) return [];
  const roots = raw
    .split(path.delimiter)
    .map((part) => part.trim())
    .filter(Boolean);
  const relativeRoot = roots.find((root) => !path.isAbsolute(path.normalize(root)));
  if (relativeRoot) {
    throw new Error(`${SANDBOX_IMPORT_ALLOWED_ROOTS_INVALID_MESSAGE} Got: ${relativeRoot}`);
  }
  return roots;
}

function canonicalizePathForContainment(value: string): string {
  const resolved = path.normalize(value);
  try {
    return fs.realpathSync.native(resolved);
  } catch {
    return resolved;
  }
}

function isPathInsideDir(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export function sandboxImportAllowedRoots(
  env: Record<string, string | undefined> = process.env,
): string[] {
  return configuredSandboxImportRoots(env).map(canonicalizePathForContainment);
}

export function isSandboxImportedProjectRootAllowed(
  projectRoot: string,
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (!isSandboxModeEnabled(env)) return true;
  const candidate = canonicalizePathForContainment(projectRoot);
  return sandboxImportAllowedRoots(env).some((root) => isPathInsideDir(root, candidate));
}

export function sandboxImportedProjectRootUnavailableReason(
  projectRoot: string,
  env: Record<string, string | undefined> = process.env,
): string | null {
  if (!isSandboxModeEnabled(env)) return null;
  return isSandboxImportedProjectRootAllowed(projectRoot, env)
    ? null
    : SANDBOX_IMPORTED_PROJECT_UNAVAILABLE_MESSAGE;
}

export function resolveSandboxRuntimeConfig(
  enabled: boolean,
  dataDir: string,
): SandboxRuntimeConfig {
  const sandboxRoot = path.join(dataDir, 'sandbox');
  return {
    enabled,
    dataDir,
    roots: {
      agentHomeDir: path.join(sandboxRoot, 'agent-home'),
      cacheDir: path.join(sandboxRoot, 'cache'),
      configDir: path.join(sandboxRoot, 'config'),
      generatedFilesDir: path.join(dataDir, 'generated-files'),
      logsDir: path.join(dataDir, 'logs'),
      mcpConfigDir: dataDir,
      pluginStateDir: path.join(dataDir, 'plugins'),
      previewStateDir: path.join(dataDir, 'previews'),
      skillsCacheDir: path.join(dataDir, 'skills'),
      tempDir: path.join(sandboxRoot, 'tmp'),
      toolConfigDir: path.join(sandboxRoot, 'tools'),
    },
  };
}

export function resolveSandboxRuntimeConfigFromEnv(
  env: Record<string, string | undefined>,
  projectRoot: string,
): SandboxRuntimeConfig | null {
  if (!isSandboxModeEnabled(env)) return null;
  const rawDataDir = env.OD_DATA_DIR?.trim();
  if (!rawDataDir) {
    throw new Error('OD_DATA_DIR is required when OD_SANDBOX_MODE is enabled');
  }
  return resolveSandboxRuntimeConfig(
    true,
    resolveProjectRelativePath(rawDataDir, projectRoot),
  );
}

export function sandboxAgentProfilesConfigPath(
  config: SandboxRuntimeConfig,
): string {
  return path.join(
    config.roots.agentHomeDir,
    '.open-design',
    'agents.local.json',
  );
}

export function ensureSandboxRuntimeDirs(config: SandboxRuntimeConfig): void {
  if (!config.enabled) return;
  for (const dir of new Set(Object.values(config.roots))) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function applySandboxRuntimeEnv(
  baseEnv: NodeJS.ProcessEnv,
  config: SandboxRuntimeConfig,
): NodeJS.ProcessEnv {
  if (!config.enabled) return baseEnv;

  const env: NodeJS.ProcessEnv = { ...baseEnv };
  const { roots } = config;
  const codexHome = path.join(roots.agentHomeDir, '.codex');
  const claudeConfigDir = path.join(roots.configDir, 'claude');
  const opencodeHome = path.join(roots.agentHomeDir, '.opencode');
  const npmUserConfig = path.join(roots.toolConfigDir, 'npmrc');

  env[SANDBOX_MODE_ENV] = '1';
  env.OD_DATA_DIR = config.dataDir;
  env.OD_AGENT_HOME = roots.agentHomeDir;
  env.HOME = roots.agentHomeDir;
  env.USERPROFILE = roots.agentHomeDir;
  env.XDG_CONFIG_HOME = roots.configDir;
  env.XDG_CACHE_HOME = roots.cacheDir;
  env.XDG_DATA_HOME = path.join(roots.configDir, 'data');
  env.XDG_STATE_HOME = path.join(roots.configDir, 'state');
  env.TMPDIR = roots.tempDir;
  env.TEMP = roots.tempDir;
  env.TMP = roots.tempDir;
  env.CODEX_HOME = codexHome;
  env.CLAUDE_CONFIG_DIR = claudeConfigDir;
  env.OPENCODE_TEST_HOME = opencodeHome;
  env.OD_AGENT_PROFILES_CONFIG = sandboxAgentProfilesConfigPath(config);
  env.NPM_CONFIG_USERCONFIG = npmUserConfig;
  env.npm_config_userconfig = npmUserConfig;

  return env;
}
