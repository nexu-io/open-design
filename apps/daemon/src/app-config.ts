// Daemon-backed app preferences (onboarding state, agent/skill/DS selection).
//
// The web frontend pushes non-sensitive preferences here via PUT
// /api/app-config; the daemon persists them to <dataDir>/app-config.json
// (where dataDir defaults to <projectRoot>/.od but follows OD_DATA_DIR when
// set, keeping test and multi-namespace runs isolated).
// This survives browser storage resets and origin changes so onboarding
// and agent selection don't reappear unexpectedly.

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

export interface AgentModelPrefs {
  model?: string;
  reasoning?: string;
}

export type AgentCliEnvPrefs = Record<string, Record<string, string>>;

export interface TelemetryPrefs {
  metrics?: boolean;
  content?: boolean;
  artifactManifest?: boolean;
}

export interface OrbitConfigPrefs {
  enabled: boolean;
  time: string;
  templateSkillId?: string | null;
}

export interface AppConfigPrefs {
  onboardingCompleted?: boolean;
  agentId?: string | null;
  agentModels?: Record<string, AgentModelPrefs>;
  agentCliEnv?: AgentCliEnvPrefs;
  skillId?: string | null;
  designSystemId?: string | null;
  disabledSkills?: string[];
  disabledDesignSystems?: string[];
  installationId?: string | null;
  telemetry?: TelemetryPrefs;
  privacyDecisionAt?: number | null;
  orbit?: OrbitConfigPrefs;
}

const ALLOWED_KEYS: ReadonlySet<keyof AppConfigPrefs> = new Set([
  'onboardingCompleted',
  'agentId',
  'agentModels',
  'agentCliEnv',
  'skillId',
  'designSystemId',
  'disabledSkills',
  'disabledDesignSystems',
  'installationId',
  'telemetry',
  'privacyDecisionAt',
  'orbit',
] as const);

function configFile(dataDir: string): string {
  return path.join(dataDir, 'app-config.json');
}

const AGENT_MODEL_KEYS: ReadonlySet<string> = new Set(['model', 'reasoning']);

const TELEMETRY_KEYS: ReadonlySet<string> = new Set([
  'metrics',
  'content',
  'artifactManifest',
]);

function validateTelemetry(raw: unknown): TelemetryPrefs | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const result: Record<string, boolean> = Object.create(null);
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (k === '__proto__' || k === 'constructor') continue;
    if (!TELEMETRY_KEYS.has(k)) continue;
    if (typeof v === 'boolean') result[k] = v;
  }
  return Object.keys(result).length > 0 ? (result as TelemetryPrefs) : undefined;
}

const AGENT_CLI_ENV_KEYS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ['claude', new Set(['CLAUDE_CONFIG_DIR', 'CLAUDE_BIN'])],
  ['codex', new Set(['CODEX_HOME', 'CODEX_BIN'])],
  ['copilot', new Set(['COPILOT_BIN'])],
  ['cursor-agent', new Set(['CURSOR_AGENT_BIN'])],
  ['deepseek', new Set(['DEEPSEEK_BIN'])],
  ['devin', new Set(['DEVIN_BIN'])],
  ['gemini', new Set(['GEMINI_BIN'])],
  ['hermes', new Set(['HERMES_BIN'])],
  ['kimi', new Set(['KIMI_BIN'])],
  ['kiro', new Set(['KIRO_BIN'])],
  ['kilo', new Set(['KILO_BIN'])],
  ['opencode', new Set(['OPENCODE_BIN'])],
  ['pi', new Set(['PI_BIN'])],
  ['qoder', new Set(['QODER_BIN'])],
  ['qwen', new Set(['QWEN_BIN'])],
  ['vibe', new Set(['VIBE_BIN'])],
]);

function isValidAgentModelEntry(v: unknown): v is AgentModelPrefs {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const obj = v as Record<string, unknown>;
  for (const k of Object.keys(obj)) {
    if (!AGENT_MODEL_KEYS.has(k)) return false;
    if (obj[k] !== undefined && typeof obj[k] !== 'string') return false;
  }
  return true;
}

function validateAgentModels(
  raw: unknown,
): Record<string, AgentModelPrefs> | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const result: Record<string, AgentModelPrefs> = Object.create(null);
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (k === '__proto__' || k === 'constructor') continue;
    if (isValidAgentModelEntry(v)) {
      result[k] = v;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

export function validateAgentCliEnv(raw: unknown): AgentCliEnvPrefs | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const result: AgentCliEnvPrefs = Object.create(null);
  for (const [agentId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (agentId === '__proto__' || agentId === 'constructor') continue;
    const allowed = AGENT_CLI_ENV_KEYS.get(agentId);
    if (!allowed || typeof value !== 'object' || value === null || Array.isArray(value)) {
      continue;
    }
    const env: Record<string, string> = Object.create(null);
    for (const [envKey, envValue] of Object.entries(value as Record<string, unknown>)) {
      if (!allowed.has(envKey)) continue;
      if (typeof envValue !== 'string') continue;
      const trimmed = envValue.trim();
      if (!trimmed) continue;
      env[envKey] = trimmed;
    }
    if (Object.keys(env).length > 0) result[agentId] = env;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function isValidOrbitTime(time: string): boolean {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return false;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

function validateOrbit(raw: unknown): OrbitConfigPrefs | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const obj = raw as Record<string, unknown>;
  const enabled = typeof obj.enabled === 'boolean' ? obj.enabled : false;
  const time = typeof obj.time === 'string' && isValidOrbitTime(obj.time)
    ? obj.time
    : '08:00';
  const orbit: OrbitConfigPrefs = { enabled, time };

  if (Object.hasOwn(obj, 'templateSkillId')) {
    orbit.templateSkillId = typeof obj.templateSkillId === 'string' && obj.templateSkillId.trim()
      ? obj.templateSkillId.trim()
      : null;
  }

  return orbit;
}

export function agentCliEnvForAgent(
  prefs: AgentCliEnvPrefs | undefined,
  agentId: string,
): Record<string, string> {
  if (!prefs || typeof agentId !== 'string') return {};
  const env = prefs[agentId];
  if (!env || typeof env !== 'object' || Array.isArray(env)) return {};
  return { ...env };
}

function applyConfigValue(
  target: Record<string, unknown>,
  key: keyof AppConfigPrefs,
  value: unknown,
): void {
  if (key === 'onboardingCompleted') {
    if (typeof value === 'boolean') target[key] = value;
    return;
  }
  if (key === 'agentId' || key === 'skillId' || key === 'designSystemId') {
    if (typeof value === 'string' || value === null) target[key] = value;
    return;
  }
  if (key === 'agentModels') {
    const validated = validateAgentModels(value);
    if (validated !== undefined) {
      target[key] = validated;
    } else {
      delete target[key];
    }
  }
  if (key === 'agentCliEnv') {
    const validated = validateAgentCliEnv(value);
    if (validated !== undefined) {
      target[key] = validated;
    } else {
      delete target[key];
    }
  }
  if (key === 'disabledSkills' || key === 'disabledDesignSystems') {
    if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
      target[key] = value;
    } else {
      delete target[key];
    }
  }
  if (key === 'installationId') {
    if (typeof value === 'string' || value === null) target[key] = value;
    return;
  }
  if (key === 'telemetry') {
    const validated = validateTelemetry(value);
    if (validated !== undefined) {
      target[key] = validated;
    } else {
      delete target[key];
    }
  }
  if (key === 'privacyDecisionAt') {
    if (
      value === null ||
      (typeof value === 'number' && Number.isFinite(value) && value >= 0)
    ) {
      target[key] = value;
    } else {
      delete target[key];
    }
    return;
  }
  if (key === 'orbit') {
    const validated = validateOrbit(value);
    if (validated !== undefined) {
      target[key] = validated;
    } else {
      delete target[key];
    }
  }
}

function filterAllowedKeys(obj: Record<string, unknown>): AppConfigPrefs {
  const result: Record<string, unknown> = Object.create(null);
  for (const key of Object.keys(obj)) {
    if (ALLOWED_KEYS.has(key as keyof AppConfigPrefs)) {
      applyConfigValue(result, key as keyof AppConfigPrefs, obj[key]);
    }
  }
  return result as AppConfigPrefs;
}

export async function readAppConfig(dataDir: string): Promise<AppConfigPrefs> {
  try {
    const raw = await readFile(configFile(dataDir), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return filterAllowedKeys(parsed as Record<string, unknown>);
    }
    console.warn('[app-config] Invalid shape in config file, returning empty');
    return {};
  } catch (err: unknown) {
    const e = err as { code?: string; name?: string; message?: string };
    if (e.code === 'ENOENT') return {};
    if (e.name === 'SyntaxError') {
      console.error('[app-config] Corrupted JSON, returning empty:', e.message);
      return {};
    }
    throw err;
  }
}

// Serialize concurrent writes to the same dataDir so the read-modify-write
// cycle doesn't lose updates when two PUT requests overlap.
const writeLocks = new Map<string, Promise<unknown>>();

export async function writeAppConfig(
  dataDir: string,
  partial: Record<string, unknown>,
): Promise<AppConfigPrefs> {
  const prev = writeLocks.get(dataDir) ?? Promise.resolve();
  const task = prev.catch(() => {}).then(() => doWrite(dataDir, partial));
  writeLocks.set(dataDir, task);
  try {
    return await task;
  } finally {
    if (writeLocks.get(dataDir) === task) writeLocks.delete(dataDir);
  }
}

async function doWrite(
  dataDir: string,
  partial: Record<string, unknown>,
): Promise<AppConfigPrefs> {
  const existing = await readAppConfig(dataDir);
  const next: Record<string, unknown> = { ...existing };
  for (const key of Object.keys(partial)) {
    if (!ALLOWED_KEYS.has(key as keyof AppConfigPrefs)) continue;
    applyConfigValue(next, key as keyof AppConfigPrefs, partial[key]);
  }
  const file = configFile(dataDir);
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = file + '.' + randomBytes(4).toString('hex') + '.tmp';
  await writeFile(tmp, JSON.stringify(next, null, 2), 'utf8');
  await rename(tmp, file);
  return next as AppConfigPrefs;
}
