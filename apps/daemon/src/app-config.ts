// Daemon-backed app preferences (onboarding state, agent/skill/DS selection).
//
// The web frontend pushes preferences here via PUT /api/app-config; the
// daemon persists them to <dataDir>/app-config.json (where dataDir defaults
// to <projectRoot>/.od but follows OD_DATA_DIR when set, keeping test and
// multi-namespace runs isolated). This survives browser storage resets and
// origin changes so onboarding and agent selection don't reappear unexpectedly.
//
// `agentCliEnv` is intentionally limited by allowlist below. It may include
// proxy/auth overrides for local CLIs (for example ANTHROPIC_BASE_URL +
// ANTHROPIC_API_KEY for Claude Code, or OPENAI_BASE_URL + OPENAI_API_KEY for
// Codex). Those values are local-only and should not be logged or returned
// outside this machine.

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import { expandHomePrefix } from './home-expansion.js';

import {
  readInstallationFile,
  resolveInstallationDir,
  writeInstallationFile,
  type InstallationFilePatch,
} from './installation.js';

// Plugin-system env knobs. See docs/plans/plugins-implementation.md F6 / F9.
// Phase 1 only reads them; the GC worker that enforces snapshot expiry lands
// in Phase 5. Centralized here to keep daemon modules from sprinkling magic
// numbers across the codebase.
export interface PluginEnvKnobs {
  // Hard ceiling on devloop iterations per stage (spec §10.2).
  maxDevloopIterations: number;
  // Days before an unreferenced applied_plugin_snapshots row expires. A
  // value of 0 means "keep forever" (operators can opt out of GC entirely).
  snapshotUnreferencedTtlDays: number;
  // Optional cap on how long even a referenced snapshot stays around once
  // its run/conversation/project is terminal. Default unset -> unlimited.
  snapshotRetentionDays: number | null;
  // GC worker tick interval. Phase 5 reads this; Phase 1 just exposes the
  // knob through `od config get` so operators can plan ahead.
  snapshotGcIntervalMs: number;
}

function intFromEnv(key: string, fallback: number): number {
  const raw = process.env[key];
  if (typeof raw !== 'string' || raw.trim().length === 0) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.floor(parsed);
}

function nullableIntFromEnv(key: string): number | null {
  const raw = process.env[key];
  if (typeof raw !== 'string' || raw.trim().length === 0) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.floor(parsed);
}

export function readPluginEnvKnobs(): PluginEnvKnobs {
  return {
    maxDevloopIterations:        intFromEnv('OD_MAX_DEVLOOP_ITERATIONS', 10),
    snapshotUnreferencedTtlDays: intFromEnv('OD_SNAPSHOT_UNREFERENCED_TTL_DAYS', 30),
    snapshotRetentionDays:       nullableIntFromEnv('OD_SNAPSHOT_RETENTION_DAYS'),
    snapshotGcIntervalMs:        intFromEnv('OD_SNAPSHOT_GC_INTERVAL_MS', 6 * 60 * 60 * 1000),
  };
}

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

export interface ProjectLocationPrefs {
  id: string;
  name: string;
  path: string;
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
  customInstructions?: string | null;
  projectLocations?: ProjectLocationPrefs[];
  defaultProjectLocationId?: string | null;
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
  'customInstructions',
  'projectLocations',
  'defaultProjectLocationId',
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
  ['amr', new Set([
    'VELA_BIN',
    'VELA_LINK_URL',
    'VELA_RUNTIME_KEY',
    'VELA_OPENCODE_BIN',
    'OPEN_DESIGN_AMR_PROFILE',
    'OPENCODE_TEST_HOME',
  ])],
  ['aider', new Set(['AIDER_BIN'])],
  ['claude', new Set(['CLAUDE_CONFIG_DIR', 'CLAUDE_BIN', 'ANTHROPIC_BASE_URL', 'ANTHROPIC_API_KEY'])],
  ['codex', new Set(['CODEX_HOME', 'CODEX_BIN', 'OPENAI_BASE_URL', 'CODEX_API_KEY', 'OPENAI_API_KEY'])],
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
  ['trae-cli', new Set(['TRAE_CLI_BIN'])],
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

function normalizeLocationId(raw: string, fallback: string): string {
  const trimmed = raw.trim();
  if (/^[A-Za-z0-9._-]{1,128}$/.test(trimmed) && trimmed !== 'default') {
    return trimmed;
  }
  return fallback;
}

function autoProjectLocationId(pathKey: string): string {
  return `loc_${createHash('sha256').update(pathKey).digest('base64url').slice(0, 16)}`;
}

function validateProjectLocations(raw: unknown): ProjectLocationPrefs[] | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!Array.isArray(raw)) return undefined;
  const result: ProjectLocationPrefs[] = [];
  const seenIds = new Set<string>();
  const seenPaths = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const obj = item as Record<string, unknown>;
    if (typeof obj.path !== 'string') continue;
    const expanded = expandHomePrefix(obj.path.trim());
    if (!expanded || !path.isAbsolute(expanded)) continue;
    const normalizedPath = path.normalize(expanded);
    const pathKey = process.platform === 'win32' ? normalizedPath.toLowerCase() : normalizedPath;
    if (seenPaths.has(pathKey)) continue;
    const id = normalizeLocationId(
      typeof obj.id === 'string' ? obj.id : '',
      autoProjectLocationId(pathKey),
    );
    if (seenIds.has(id)) continue;
    const rawName = typeof obj.name === 'string' ? obj.name.trim() : '';
    result.push({ id, name: rawName || path.basename(normalizedPath) || normalizedPath, path: normalizedPath });
    seenIds.add(id);
    seenPaths.add(pathKey);
  }
  return result;
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
  if (key === 'customInstructions') {
    if (typeof value === 'string') {
      target[key] = value.slice(0, 5000);
    } else if (value === null) {
      target[key] = value;
    }
    return;
  }
  if (key === 'projectLocations') {
    const validated = validateProjectLocations(value);
    if (validated !== undefined) {
      target[key] = validated;
    } else {
      delete target[key];
    }
    return;
  }
  if (key === 'defaultProjectLocationId') {
    if (typeof value === 'string') {
      target[key] = normalizeLocationId(value, 'default');
    } else if (value === null) {
      target[key] = null;
    } else {
      delete target[key];
    }
    return;
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

// Fill in telemetry defaults when the saved config has no `telemetry`
// field at all (fresh install, pre-disclosure). `metrics` / `content`
// default to true so onboarding-funnel events emit from the first
// render — without these defaults the gate at
// `analytics.ts` (`if (cfg.telemetry?.metrics !== true) return`)
// dropped every event a user fired before the post-onboarding
// disclosure modal had a chance to set them. An EXPLICIT `false`
// the user previously saved is preserved (only `undefined` gets
// the new default), so opt-out users stay opted out across the
// 0.7.x → 0.8.0 upgrade.
function applyTelemetryDefaults(prefs: AppConfigPrefs): AppConfigPrefs {
  if (prefs.telemetry === undefined) {
    return {
      ...prefs,
      telemetry: { metrics: true, content: true, artifactManifest: false },
    };
  }
  return prefs;
}

export async function readAppConfig(dataDir: string): Promise<AppConfigPrefs> {
  const base = await readAppConfigFileOnly(dataDir);
  // Channel-root installation file is the new authoritative source for the
  // identity bits that must survive a namespace-scoped data-dir wipe. It
  // lives outside `<namespace>/data/` so a reinstall of the same channel
  // (which might churn the namespace token, or eventually clear per-
  // namespace data) keeps the same id.
  //
  // Migration: when this daemon is the first to boot with installation.json
  // support and finds an existing installationId in the legacy app-config
  // path, mirror it forward exactly once so PostHog continues to see the
  // same person across the 0.7.x → 0.8.0 upgrade. Without this mirror, the
  // user count would double when 0.8.0 ships.
  const installationDir = resolveInstallationDir(dataDir);
  const installation = await readInstallationFile(installationDir);
  if (typeof installation.installationId === 'string' && installation.installationId.length > 0) {
    return applyTelemetryDefaults({ ...base, installationId: installation.installationId });
  }
  if (typeof base.installationId === 'string' && base.installationId.length > 0) {
    // Best-effort migration. A write failure here doesn't break the read —
    // we still serve the legacy id. The next write through writeAppConfig
    // will retry the mirror.
    try {
      await writeInstallationFile(installationDir, { installationId: base.installationId });
    } catch {
      // swallow — observability beats correctness on this path
    }
  }
  return applyTelemetryDefaults(base);
}

async function readAppConfigFileOnly(dataDir: string): Promise<AppConfigPrefs> {
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
  // Mirror the identity bits to the channel-root installation file so they
  // survive a namespace-scoped data-dir wipe. Only fires when the caller
  // explicitly touched `installationId` (avoiding noisy writes on every
  // unrelated app-config update). A write failure here doesn't roll back
  // the app-config write — the next read merges them transparently.
  if (Object.prototype.hasOwnProperty.call(partial, 'installationId')) {
    const id = next.installationId;
    // Caller explicitly touched installationId — mirror the outcome
    // (including the clear case) to installation.json so a future read
    // doesn't keep serving the old value out of the channel-root file.
    // "Delete my data" relies on this clear path.
    const installPatch: InstallationFilePatch = {
      installationId: typeof id === 'string' && id.length > 0 ? id : null,
    };
    try {
      await writeInstallationFile(resolveInstallationDir(dataDir), installPatch);
    } catch {
      // swallow — install file mirroring is best-effort; the canonical
      // app-config write already succeeded.
    }
  }
  return next as AppConfigPrefs;
}
