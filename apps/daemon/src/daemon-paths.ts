import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

import { resolveProjectRelativePath } from './home-expansion.js';

const require = createRequire(import.meta.url);

export const DAEMON_CLI_PATH_ENV = 'OD_DAEMON_CLI_PATH';
export const RESOURCE_ROOT_ENV = 'OD_RESOURCE_ROOT';
export const RESOURCE_TRUST_ROOT_ENV = 'OD_RESOURCE_TRUST_ROOT';
export const CLOSURE_RESOURCE_ROOTS_ENV = 'OD_CLOSURE_RESOURCE_ROOTS_V1';

export const DAEMON_CLOSURE_RESOURCE_IDS = Object.freeze([
  'community-pets',
  'craft',
  'design-systems',
  'design-templates',
  'frames',
  'plugin-previews',
  'plugins',
  'prompt-templates',
  'skills',
] as const);

export type DaemonClosureResourceId = (typeof DAEMON_CLOSURE_RESOURCE_IDS)[number];

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

function isPathWithin(base: string, target: string): boolean {
  const relativePath = path.relative(path.resolve(base), path.resolve(target));
  return (
    relativePath === '' ||
    (relativePath.length > 0 &&
      !relativePath.startsWith('..') &&
      !path.isAbsolute(relativePath))
  );
}

export interface ResolveDaemonClosureResourceRootsOptions {
  configured?: string;
  safeBases?: Array<string | null | undefined>;
}

export function resolveDaemonClosureResourceRoots({
  configured = process.env[CLOSURE_RESOURCE_ROOTS_ENV],
  safeBases,
}: ResolveDaemonClosureResourceRootsOptions = {}): Readonly<Partial<Record<DaemonClosureResourceId, string>>> {
  if (!configured?.trim()) return Object.freeze({});
  let parsed: unknown;
  try {
    parsed = JSON.parse(configured);
  } catch (error) {
    throw new Error(`${CLOSURE_RESOURCE_ROOTS_ENV} must be valid JSON`, { cause: error });
  }
  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${CLOSURE_RESOURCE_ROOTS_ENV} must be a resource-root object`);
  }
  const record = parsed as Record<string, unknown>;
  const extras = Object.keys(record).filter(
    (id) => !(DAEMON_CLOSURE_RESOURCE_IDS as readonly string[]).includes(id),
  );
  if (extras.length > 0) {
    throw new Error(`${CLOSURE_RESOURCE_ROOTS_ENV} contains unsupported resources: ${extras.join(', ')}`);
  }
  const normalizedSafeBases = (safeBases ?? [])
    .filter((base): base is string => typeof base === 'string' && base.length > 0)
    .map((base) => path.resolve(base));
  const roots: Partial<Record<DaemonClosureResourceId, string>> = {};
  for (const id of DAEMON_CLOSURE_RESOURCE_IDS) {
    const value = record[id];
    if (value == null) continue;
    if (typeof value !== 'string' || value.trim().length === 0 || !path.isAbsolute(value)) {
      throw new Error(`${CLOSURE_RESOURCE_ROOTS_ENV}.${id} must be an absolute path`);
    }
    const resolved = path.resolve(value);
    if (!normalizedSafeBases.some((base) => isPathWithin(base, resolved))) {
      throw new Error(`${CLOSURE_RESOURCE_ROOTS_ENV}.${id} must be under a trusted resource root`);
    }
    roots[id] = resolved;
  }
  return Object.freeze(roots);
}

export function resolveProcessResourcesPath(): string | null {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  if (
    typeof resourcesPath === 'string' &&
    resourcesPath.length > 0
  ) {
    return resourcesPath;
  }

  const resourcesMarker = `${path.sep}Contents${path.sep}Resources${path.sep}`;
  const markerIndex = process.execPath.indexOf(resourcesMarker);
  if (markerIndex !== -1) {
    return process.execPath.slice(0, markerIndex + resourcesMarker.length - 1);
  }

  const normalizedExecPath = process.execPath.toLowerCase();
  const windowsResourceBinMarker =
    `${path.sep}resources${path.sep}open-design${path.sep}bin${path.sep}`.toLowerCase();
  const windowsMarkerIndex = normalizedExecPath.indexOf(windowsResourceBinMarker);
  if (windowsMarkerIndex !== -1) {
    return process.execPath.slice(
      0,
      windowsMarkerIndex + `${path.sep}resources`.length,
    );
  }

  return null;
}

export interface ResolveDaemonResourceRootOptions {
  configured?: string;
  safeBases?: Array<string | null | undefined>;
}

export function resolveDaemonResourceRoot({
  configured = process.env[RESOURCE_ROOT_ENV],
  safeBases,
}: ResolveDaemonResourceRootOptions = {}): string | null {
  if (!configured || configured.length === 0) return null;

  const resolved = path.resolve(configured);
  const normalizedSafeBases = (safeBases ?? [])
    .filter((base): base is string => typeof base === 'string' && base.length > 0)
    .map((base) => path.resolve(base));

  if (!normalizedSafeBases.some((base) => isPathWithin(base, resolved))) {
    throw new Error(
      `${RESOURCE_ROOT_ENV} must be under the workspace root or app resources path`,
    );
  }

  return resolved;
}

export function resolveDaemonResourceDir(
  resourceRoot: string | null,
  segment: string,
  fallback: string,
): string {
  return resourceRoot ? path.join(resourceRoot, segment) : fallback;
}

export function resolveDaemonClosureResourceDir(options: Readonly<{
  fallback: string;
  id: DaemonClosureResourceId;
  resourceRoot: string | null;
  resourceRoots: Readonly<Partial<Record<DaemonClosureResourceId, string>>>;
  segment: string;
}>): string {
  const groupedRoot = options.resourceRoots[options.id];
  return groupedRoot
    ? path.join(groupedRoot, options.segment)
    : resolveDaemonResourceDir(options.resourceRoot, options.segment, options.fallback);
}

export interface ResolveDaemonPluginPreviewsDirOptions {
  env?: NodeJS.ProcessEnv;
  resourceRoot: string | null | undefined;
  projectRoot: string;
}

export function resolveDaemonPluginPreviewsDir({
  env = process.env,
  resourceRoot,
  projectRoot,
}: ResolveDaemonPluginPreviewsDirOptions): string {
  const override = env.OD_PLUGIN_PREVIEWS_DIR;
  if (override) {
    return path.isAbsolute(override) ? override : path.resolve(projectRoot, override);
  }
  return resolveDaemonResourceDir(
    resourceRoot ?? null,
    path.join('data', 'plugin-previews'),
    path.join(projectRoot, 'data', 'plugin-previews'),
  );
}

export interface ResolveDataDirOptions {
  requireExplicit?: boolean;
}

export function resolveDataDir(
  raw: string | undefined,
  projectRoot: string,
  options: ResolveDataDirOptions = {},
): string {
  const value = raw?.trim();
  if (!value) {
    if (options.requireExplicit) {
      throw new Error('OD_DATA_DIR is required when OD_SANDBOX_MODE is enabled');
    }
    return path.join(projectRoot, '.od');
  }

  const resolved = resolveProjectRelativePath(value, projectRoot);
  try {
    fs.mkdirSync(resolved, { recursive: true });
    fs.accessSync(resolved, fs.constants.W_OK);
  } catch (err) {
    const e = err as Error;
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
        'Check whether the folder or one of its parents is owned by another user, is a symlink to a protected location, or was previously created with sudo.',
        `Try: ls -ld "${parentDir}" "${resolved}"`,
        `If the folder should belong to you, fix ownership/permissions, for example: sudo chown -R "${currentUser}":staff "${parentDir}" && chmod -R u+rwX "${parentDir}"`,
      ].join(' '),
    );
  }
  return resolved;
}
