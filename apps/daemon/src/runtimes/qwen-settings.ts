// Qwen Code keeps its configured models in `~/.qwen/settings.json`, not behind
// a `--list-models` flag. The picker was therefore stuck on a two-entry
// hardcoded fallback (`qwen3-coder-plus` / `qwen3-coder-flash`) while the CLI
// itself was configured with newer ones, so users could not select the model
// they had already set up without typing it as a custom string.
//
// Mirrors `mmd-routes.ts` (the same problem for Claude Code) in shape: read
// the CLI's own config, merge the discovered ids ahead of the static
// fallbacks, and degrade to the fallbacks whenever the file is missing or
// unreadable.

import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_MODEL_OPTION, sanitizeCustomModel } from './models.js';
import type { RuntimeEnv, RuntimeModelOption } from './types.js';

const DEFAULT_QWEN_SETTINGS_FILE = join('.qwen', 'settings.json');
const QWEN_SETTINGS_FILE_ENV = 'QWEN_SETTINGS_FILE';

function stringEnv(env: RuntimeEnv, key: string): string | null {
  const value = env[key];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveHome(env: RuntimeEnv): string | null {
  return stringEnv(env, 'HOME') ?? homedir() ?? null;
}

function expandSettingsFileOverride(raw: string, env: RuntimeEnv): string | null {
  if (raw === '~') return resolveHome(env);
  if (raw.startsWith('~/') || raw.startsWith('~\\')) {
    const home = resolveHome(env);
    return home ? join(home, raw.slice(2)) : null;
  }
  return raw;
}

export function resolveQwenSettingsFile(env: RuntimeEnv): string | null {
  const override = stringEnv(env, QWEN_SETTINGS_FILE_ENV);
  if (override) return expandSettingsFileOverride(override, env);

  const home = resolveHome(env);
  if (!home) return null;
  return join(home, DEFAULT_QWEN_SETTINGS_FILE);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Collect model ids from a parsed `settings.json`.
 *
 * Two sources, in priority order:
 * - `modelProviders.<provider>[].id` — every provider entry the user
 *   configured. The shape is `{ openai: [{ id, name, baseUrl, … }], … }`;
 *   provider keys are not enumerated against an allowlist so a Qwen release
 *   that adds one keeps working.
 * - `model` — the currently selected model, which may be a bare string or a
 *   `{ name }`/`{ id }` record depending on Qwen version.
 *
 * Ids are sanitized and de-duplicated; anything unparseable is skipped rather
 * than failing the whole read.
 */
export function parseQwenSettingsModelIds(raw: unknown): string[] {
  if (!isRecord(raw)) return [];

  const seen = new Set<string>();
  const ids: string[] = [];
  const push = (candidate: unknown): void => {
    if (typeof candidate !== 'string') return;
    const id = sanitizeCustomModel(candidate);
    if (!id || seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  };

  const providers = raw.modelProviders;
  if (isRecord(providers)) {
    for (const entries of Object.values(providers)) {
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        if (isRecord(entry)) push(entry.id);
      }
    }
  }

  const selected = raw.model;
  if (typeof selected === 'string') push(selected);
  else if (isRecord(selected)) {
    push(selected.id);
    push(selected.name);
  }

  return ids;
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

export function mergeQwenSettingsModels(
  settingsIds: readonly string[],
  fallbackModels: readonly RuntimeModelOption[],
): RuntimeModelOption[] {
  const out: RuntimeModelOption[] = [];
  const seen = new Set<string>();

  addModel(out, seen, DEFAULT_MODEL_OPTION);
  for (const id of settingsIds) addModel(out, seen, { id, label: id });
  for (const model of fallbackModels) addModel(out, seen, model);

  return out;
}

export async function loadQwenSettingsModels(
  env: RuntimeEnv,
  fallbackModels: readonly RuntimeModelOption[],
): Promise<RuntimeModelOption[] | null> {
  const settingsFile = resolveQwenSettingsFile(env);
  if (!settingsFile) return null;

  let text: string;
  try {
    text = await readFile(settingsFile, 'utf8');
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }

  const ids = parseQwenSettingsModelIds(parsed);
  if (ids.length === 0) return null;
  return mergeQwenSettingsModels(ids, fallbackModels);
}
