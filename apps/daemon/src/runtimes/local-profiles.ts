import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

import { DEFAULT_MODEL_OPTION, sanitizeCustomModel } from './models.js';
import type {
  RuntimeAgentDef,
  RuntimeBuildOptions,
  RuntimeModelOption,
} from './types.js';

function localAgentProfilesFile(): string {
  const explicit = process.env.OD_AGENT_PROFILES_CONFIG;
  if (typeof explicit === 'string' && explicit.trim()) {
    return explicit.trim();
  }
  return path.join(homedir(), '.open-design', 'agents.local.json');
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is string =>
      typeof item === 'string' &&
      item.length > 0 &&
      !item.includes('\0'),
  );
}

function normalizeEnvMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (
      typeof raw === 'string' ||
      typeof raw === 'number' ||
      typeof raw === 'boolean'
    ) {
      out[key] = String(raw);
    }
  }
  return out;
}

function normalizeModelOptions(value: unknown): RuntimeModelOption[] | null {
  if (!Array.isArray(value)) return null;
  const out = [DEFAULT_MODEL_OPTION];
  const seen = new Set(['default']);
  for (const item of value) {
    const id =
      typeof item === 'string'
        ? item.trim()
        : item && typeof item === 'object' && typeof item.id === 'string'
          ? item.id.trim()
          : '';
    if (!sanitizeCustomModel(id) || seen.has(id)) continue;
    seen.add(id);
    const label =
      item && typeof item === 'object' && typeof item.label === 'string'
        ? item.label.trim()
        : '';
    out.push({ id, label: label || id });
  }
  return out.length > 1 ? out : null;
}

function normalizeDefaultModel(value: unknown): string | null {
  return typeof value === 'string' ? sanitizeCustomModel(value) : null;
}

function optionsWithDefaultModel(
  options: RuntimeBuildOptions | undefined,
  defaultModel: string | null,
): RuntimeBuildOptions | undefined {
  if (
    defaultModel == null ||
    (options?.model != null && options.model !== 'default')
  ) {
    return options;
  }
  return { ...options, model: defaultModel };
}

function createLocalAgentDef(
  raw: unknown,
  baseDefs: RuntimeAgentDef[],
): RuntimeAgentDef | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const profile = raw as Record<string, unknown>;
  const id = typeof profile.id === 'string' ? profile.id.trim() : '';
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(id)) return null;
  if (baseDefs.some((def) => def.id === id)) return null;

  const hasExplicitBaseAgent =
    typeof profile.baseAgent === 'string' &&
    profile.baseAgent.trim().length > 0;
  const baseId = hasExplicitBaseAgent
    ? (profile.baseAgent as string).trim()
    : 'claude';
  const base = baseDefs.find((def) => def.id === baseId);
  if (!base) {
    if (hasExplicitBaseAgent) {
      console.warn(
        `[agents] skipping local profile "${id}": unknown baseAgent "${baseId}"`,
      );
    }
    return null;
  }

  const bin =
    typeof profile.bin === 'string' &&
    profile.bin.trim() &&
    !profile.bin.includes('\0')
      ? profile.bin.trim()
      : base.bin;
  const name =
    typeof profile.name === 'string' && profile.name.trim()
      ? profile.name.trim()
      : id;
  const prefixArgs = normalizeStringList(profile.args ?? profile.prefixArgs);
  const env = normalizeEnvMap(profile.env);
  const fallbackModels =
    normalizeModelOptions(profile.models ?? profile.fallbackModels) ??
    base.fallbackModels;
  const versionArgs = normalizeStringList(profile.versionArgs);
  const helpArgs = normalizeStringList(profile.helpArgs);
  const defaultModel = normalizeDefaultModel(profile.defaultModel);

  return {
    ...base,
    id,
    name,
    bin,
    versionArgs: versionArgs.length > 0 ? versionArgs : base.versionArgs,
    ...(helpArgs.length > 0 ? { helpArgs } : {}),
    fallbackModels,
    env,
    buildArgs: (prompt, imagePaths, extraAllowedDirs, options, runtimeContext) => [
      ...prefixArgs,
      ...base.buildArgs(
        prompt,
        imagePaths,
        extraAllowedDirs,
        optionsWithDefaultModel(options, defaultModel),
        runtimeContext,
      ),
    ],
  };
}

export function readLocalAgentProfileDefs(
  baseDefs: RuntimeAgentDef[],
): RuntimeAgentDef[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(localAgentProfilesFile(), 'utf8'));
  } catch {
    return [];
  }
  const profiles = Array.isArray(parsed)
    ? parsed
    : parsed &&
        typeof parsed === 'object' &&
        Array.isArray((parsed as { agents?: unknown }).agents)
      ? (parsed as { agents: unknown[] }).agents
      : [];
  const defs: RuntimeAgentDef[] = [];
  const seen = new Set(baseDefs.map((def) => def.id));
  for (const profile of profiles) {
    const def = createLocalAgentDef(profile, baseDefs);
    if (!def || seen.has(def.id)) continue;
    seen.add(def.id);
    defs.push(def);
  }
  return defs;
}
