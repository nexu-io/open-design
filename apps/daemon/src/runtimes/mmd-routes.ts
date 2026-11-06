import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_MODEL_OPTION, sanitizeCustomModel } from './models.js';
import type { RuntimeEnv, RuntimeModelOption } from './types.js';

const DEFAULT_MMD_MODEL_ROUTES_FILE = join('.config', 'mms', 'model-routes.json');
const MMD_MODEL_ROUTES_FILE_ENV = 'MMD_MODEL_ROUTES_FILE';

export type MmdRouteLaunchEnv = {
  ANTHROPIC_BASE_URL: string;
  ANTHROPIC_AUTH_TOKEN?: string;
};

function stringEnv(env: RuntimeEnv, key: string): string | null {
  const value = env[key];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveHome(env: RuntimeEnv): string | null {
  return stringEnv(env, 'HOME') ?? homedir() ?? null;
}

function expandRoutesFileOverride(raw: string, env: RuntimeEnv): string | null {
  if (raw === '~') return resolveHome(env);
  if (raw.startsWith('~/') || raw.startsWith('~\\')) {
    const home = resolveHome(env);
    return home ? join(home, raw.slice(2)) : null;
  }
  return raw;
}

export function resolveMmdRoutesFile(env: RuntimeEnv): string | null {
  const override = stringEnv(env, MMD_MODEL_ROUTES_FILE_ENV);
  if (override) return expandRoutesFileOverride(override, env);

  const home = resolveHome(env);
  if (!home) return null;
  return join(home, DEFAULT_MMD_MODEL_ROUTES_FILE);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseMmdRouteModelIds(raw: unknown): string[] {
  if (!isRecord(raw) || !isRecord(raw.routes)) return [];

  const seen = new Set<string>();
  const ids: string[] = [];
  for (const rawId of Object.keys(raw.routes)) {
    const id = sanitizeCustomModel(rawId);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export function resolveMmdRouteLaunchEnv(
  raw: unknown,
  modelId: string | null | undefined,
): MmdRouteLaunchEnv | null {
  const id = sanitizeCustomModel(modelId);
  if (!id || !isRecord(raw) || !isRecord(raw.routes)) return null;

  const route = raw.routes[id];
  if (!isRecord(route) || !isRecord(route.primary)) return null;

  const baseUrl = typeof route.primary.anthropic_base_url === 'string'
    ? route.primary.anthropic_base_url.trim()
    : '';
  if (!baseUrl) return null;

  const apiKey = typeof route.primary.api_key === 'string'
    ? route.primary.api_key.trim()
    : '';
  return {
    ANTHROPIC_BASE_URL: baseUrl,
    ...(apiKey ? { ANTHROPIC_AUTH_TOKEN: apiKey } : {}),
  };
}

function addModel(
  out: RuntimeModelOption[],
  seen: Set<string>,
  option: RuntimeModelOption,
): void {
  const id = sanitizeCustomModel(option.id);
  if (!id || seen.has(id)) return;
  seen.add(id);
  const label = typeof option.label === 'string' && option.label.trim().length > 0
    ? option.label
    : id;
  out.push({ id, label });
}

export function mergeMmdRouteModels(
  routeIds: readonly string[],
  fallbackModels: readonly RuntimeModelOption[],
): RuntimeModelOption[] {
  const out: RuntimeModelOption[] = [];
  const seen = new Set<string>();

  addModel(out, seen, DEFAULT_MODEL_OPTION);
  for (const routeId of routeIds) {
    addModel(out, seen, { id: routeId, label: routeId });
  }
  for (const model of fallbackModels) {
    addModel(out, seen, model);
  }

  return out;
}

export async function loadMmdRouteModels(
  env: RuntimeEnv,
  fallbackModels: readonly RuntimeModelOption[],
): Promise<RuntimeModelOption[] | null> {
  const routesFile = resolveMmdRoutesFile(env);
  if (!routesFile) return null;

  let text: string;
  try {
    text = await readFile(routesFile, 'utf8');
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }

  const routeIds = parseMmdRouteModelIds(parsed);
  if (routeIds.length === 0) return null;
  return mergeMmdRouteModels(routeIds, fallbackModels);
}

export async function loadMmdRouteLaunchEnv(
  env: RuntimeEnv,
  modelId: string | null | undefined,
): Promise<MmdRouteLaunchEnv | null> {
  const routesFile = resolveMmdRoutesFile(env);
  if (!routesFile) return null;

  let text: string;
  try {
    text = await readFile(routesFile, 'utf8');
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }

  return resolveMmdRouteLaunchEnv(parsed, modelId);
}
