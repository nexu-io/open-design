import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execAgentFile } from './shared.js';
import type { RuntimeAgentDef, RuntimeModelOption } from '../types.js';

const AMR_MODELS_TIMEOUT_MS = 10_000;
const AMR_MODELS_RETRY_DELAYS_MS = [250, 750] as const;
export type VelaModelJsonSource = 'preset' | 'remote';

const PREFERRED_AMR_CHAT_MODEL_ORDER = [
  'deepseek-v4-flash',
  'deepseek-v4-pro',
] as const;

const PREFERRED_AMR_CHAT_MODEL_RANK: ReadonlyMap<string, number> = new Map(
  PREFERRED_AMR_CHAT_MODEL_ORDER.map((id, index) => [id, index]),
);
const OPENCODE_MODEL_PRICE_PROVIDER_PRIORITY = [
  'opencode',
  'opencode-go',
  'openrouter',
] as const;

// AMR is the vela CLI's ACP stdio mode. `vela agent run --runtime opencode`
// starts a private OpenCode server and forwards stream-json over ACP JSON-RPC.
// Required env (set on the daemon process or via Settings → CLI env):
//   VELA_RUNTIME_KEY  — OpenRouter (or compatible) API key
//   VELA_LINK_URL     — OpenAI-compatible endpoint, e.g. https://openrouter.ai/api/v1
//   VELA_OPENCODE_BIN — optional; absolute path to opencode when not on PATH
// See docs/new-agent-runtime-acp.md and the vela
// `specs/current/runtime/manual-agent-run-openrouter.md`.
//
// Model wiring notes:
//
//   1. A concrete AMR model selection is applied through ACP
//      `session/set_model`. The synthetic `default` model id intentionally
//      skips that call so vela/OpenCode can use the account's configured
//      upstream default.
//
//   2. Vela 0.0.1 exposes the current link-supported catalog through
//      `vela models`, but that command prints public ids such as
//      `public_model_deepseek_v3_2`. The ACP `session/set_model` call accepts
//      the link-facing slug (`deepseek-v3.2` / `glm-5.1`), so Open Design
//      normalizes those public ids at the daemon boundary until Vela exposes
//      canonical ACP ids directly.
export function normalizeVelaModelId(rawId: string): string | null {
  const trimmed = rawId.trim();
  if (!trimmed) return null;
  const withoutProvider = trimmed.startsWith('vela/')
    ? trimmed.slice('vela/'.length)
    : trimmed;
  const withoutPrefix = withoutProvider.startsWith('public_model_')
    ? withoutProvider.slice('public_model_'.length)
    : withoutProvider;
  if (!withoutPrefix) return null;
  if (/^deepseek_v3_2$/i.test(withoutPrefix)) return 'deepseek-v3.2';
  if (/^deepseek-v3-2$/i.test(withoutPrefix)) return 'deepseek-v3.2';
  if (/^kimi_k2_6$/i.test(withoutPrefix)) return 'kimi-k2.6';
  if (/^kimi_k2_7_code$/i.test(withoutPrefix)) return 'kimi-k2.7-code';
  if (/^glm_5_1$/i.test(withoutPrefix)) return 'glm-5.1';
  if (/^glm_5$/i.test(withoutPrefix)) return 'glm-5';
  const versioned = normalizeKnownVelaVersionId(withoutPrefix);
  if (versioned) return versioned;
  return withoutPrefix.replace(/_/g, '-');
}

function normalizeKnownVelaVersionId(rawId: string): string | null {
  const claude = /^claude[_-](haiku|opus|sonnet)[_-](\d+)[_-](\d+)(.*)$/i.exec(rawId);
  if (claude) {
    const [, family, major, minor, suffix = ''] = claude;
    if (!family || !major || !minor) return null;
    return `claude-${family.toLowerCase()}-${major}.${minor}${suffix.replace(/_/g, '-')}`;
  }

  const gpt = /^gpt_(\d+)_(\d+)(.*)$/i.exec(rawId);
  if (gpt) {
    const [, major, minor, suffix = ''] = gpt;
    if (!major || !minor) return null;
    return `gpt-${major}.${minor}${suffix.replace(/_/g, '-')}`;
  }

  const gemini = /^gemini_(\d+)_(\d+)(.*)$/i.exec(rawId);
  if (gemini) {
    const [, major, minor, suffix = ''] = gemini;
    if (!major || !minor) return null;
    return `gemini-${major}.${minor}${suffix.replace(/_/g, '-')}`;
  }

  const minimax = /^minimax_m(\d+)_(\d+)(.*)$/i.exec(rawId);
  if (minimax) {
    const [, major, minor, suffix = ''] = minimax;
    if (!major || !minor) return null;
    return `minimax-m${major}.${minor}${suffix.replace(/_/g, '-')}`;
  }

  return null;
}

function isVelaChatModelId(modelId: string): boolean {
  // Temporary chat-surface guard: Vela already lists media-generation models,
  // but Open Design's AMR runtime currently drives only chat completions.
  // Remove this filter when AMR grows first-class image/video execution.
  const id = modelId.toLowerCase();
  if (id.startsWith('gpt-image-')) return false;
  if (id.startsWith('seedance-')) return false;
  if (id.startsWith('doubao-seedance-')) return false;
  if (id.startsWith('veo-')) return false;
  if (id.startsWith('imagen-')) return false;
  return true;
}

export function parseVelaModels(stdout: string): RuntimeModelOption[] {
  const seen = new Set<string>();
  const models: RuntimeModelOption[] = [];
  for (const line of String(stdout || '').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [rawId] = trimmed.split(/\s+/);
    if (!rawId) continue;
    const id = normalizeVelaModelId(rawId);
    if (!id || seen.has(id) || !isVelaChatModelId(id)) continue;
    seen.add(id);
    models.push({ id, label: id });
  }
  return orderAmrChatModels(models);
}

export function parseVelaModelJson(
  stdout: string,
  expectedSource: VelaModelJsonSource,
): RuntimeModelOption[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch (error) {
    throw new Error(`Invalid vela model JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid vela model JSON: expected object');
  }
  const source = (parsed as { source?: unknown }).source;
  if (source !== expectedSource) {
    throw new Error(`Invalid vela model JSON source: expected ${expectedSource}, got ${String(source)}`);
  }
  const data = (parsed as { data?: unknown }).data;
  if (!Array.isArray(data)) {
    throw new Error('Invalid vela model JSON: expected data array');
  }
  const seen = new Set<string>();
  const models: RuntimeModelOption[] = [];
  for (const item of data) {
    const rawId = item && typeof item === 'object'
      ? (item as { id?: unknown }).id
      : null;
    const id = typeof rawId === 'string' ? (normalizeVelaModelId(rawId) ?? '') : '';
    if (!id || seen.has(id) || !isVelaChatModelId(id)) continue;
    seen.add(id);
    models.push(withVelaModelPriceFields({ id, label: id }, item));
  }
  return orderAmrChatModels(models);
}

function withVelaModelPriceFields(
  model: RuntimeModelOption,
  item: unknown,
): RuntimeModelOption {
  const enabled = extractOptionalBoolean(item, ['enabled']);
  const isDefault = extractOptionalBoolean(item, ['default']);
  const inputPriceUsdPerMillion = extractInputPriceUsdPerMillion(item);
  const outputPriceUsdPerMillion = extractOutputPriceUsdPerMillion(item);
  if (
    enabled === undefined &&
    isDefault === undefined &&
    inputPriceUsdPerMillion === undefined &&
    outputPriceUsdPerMillion === undefined
  ) {
    return model;
  }
  return {
    ...model,
    ...(enabled === undefined ? {} : { enabled }),
    ...(isDefault === undefined ? {} : { default: isDefault }),
    ...(inputPriceUsdPerMillion === undefined ? {} : { inputPriceUsdPerMillion }),
    ...(outputPriceUsdPerMillion === undefined ? {} : { outputPriceUsdPerMillion }),
  };
}

function extractOptionalBoolean(
  item: unknown,
  keys: string[],
): boolean | undefined {
  if (!isRecord(item)) return undefined;
  for (const key of keys) {
    const value = item[key];
    if (typeof value === 'boolean') return value;
  }
  return undefined;
}

function extractInputPriceUsdPerMillion(item: unknown): number | undefined {
  if (!isRecord(item)) return undefined;
  const direct = firstFinitePrice([
    item.inputPriceUsdPerMillion,
    item.input_price_usd_per_million,
    item.inputPricePerMillion,
    item.input_price_per_million,
    item.promptPriceUsdPerMillion,
    item.prompt_price_usd_per_million,
  ]);
  if (direct !== undefined) return direct;
  const nested = firstFinitePrice([
    isRecord(item.cost) ? item.cost.input : undefined,
    isRecord(item.pricing) ? item.pricing.input : undefined,
    isRecord(item.price) ? item.price.input : undefined,
  ]);
  if (nested !== undefined) return nested;
  return perTokenToPerMillion(firstFinitePrice([
    item.input_cost_per_token,
    item.prompt_cost_per_token,
    isRecord(item.cost) ? item.cost.input_cost_per_token : undefined,
    isRecord(item.pricing) ? item.pricing.input_cost_per_token : undefined,
  ]));
}

function extractOutputPriceUsdPerMillion(item: unknown): number | undefined {
  if (!isRecord(item)) return undefined;
  const direct = firstFinitePrice([
    item.outputPriceUsdPerMillion,
    item.output_price_usd_per_million,
    item.outputPricePerMillion,
    item.output_price_per_million,
    item.completionPriceUsdPerMillion,
    item.completion_price_usd_per_million,
  ]);
  if (direct !== undefined) return direct;
  const nested = firstFinitePrice([
    isRecord(item.cost) ? item.cost.output : undefined,
    isRecord(item.pricing) ? item.pricing.output : undefined,
    isRecord(item.price) ? item.price.output : undefined,
  ]);
  if (nested !== undefined) return nested;
  return perTokenToPerMillion(firstFinitePrice([
    item.output_cost_per_token,
    item.completion_cost_per_token,
    isRecord(item.cost) ? item.cost.output_cost_per_token : undefined,
    isRecord(item.pricing) ? item.pricing.output_cost_per_token : undefined,
  ]));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function firstFinitePrice(values: unknown[]): number | undefined {
  for (const value of values) {
    const price = finitePrice(value);
    if (price !== undefined) return price;
  }
  return undefined;
}

function finitePrice(value: unknown): number | undefined {
  const price =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value.trim())
        : NaN;
  return Number.isFinite(price) && price >= 0 ? price : undefined;
}

function perTokenToPerMillion(value: number | undefined): number | undefined {
  return value === undefined ? undefined : value * 1_000_000;
}

type OpenCodeModelCatalog = Record<
  string,
  { models?: Record<string, unknown> }
>;

function enrichVelaModelsFromOpenCodeCatalog(
  models: RuntimeModelOption[],
  env: NodeJS.ProcessEnv,
): RuntimeModelOption[] {
  if (models.every((model) => model.inputPriceUsdPerMillion !== undefined)) {
    return models;
  }
  const catalog = readOpenCodeModelCatalog(env);
  if (!catalog) return models;
  return models.map((model) => {
    if (model.inputPriceUsdPerMillion !== undefined) return model;
    const price = lookupOpenCodeModelPrice(catalog, model.id);
    return price ? { ...model, ...price } : model;
  });
}

function readOpenCodeModelCatalog(env: NodeJS.ProcessEnv): OpenCodeModelCatalog | null {
  for (const filePath of openCodeModelCatalogPaths(env)) {
    if (!existsSync(filePath)) continue;
    try {
      const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as unknown;
      if (isRecord(parsed)) return parsed as OpenCodeModelCatalog;
    } catch {
      continue;
    }
  }
  return null;
}

function openCodeModelCatalogPaths(env: NodeJS.ProcessEnv): string[] {
  const homes = new Set<string>();
  const configuredHome = env.OPENCODE_TEST_HOME?.trim();
  if (configuredHome) homes.add(configuredHome);

  if (!isTestProcess()) {
    const home = env.HOME?.trim() || os.homedir();
    if (home) homes.add(path.join(home, '.amr', 'opencode-cache'));
  }

  return Array.from(homes, (home) => path.join(home, 'opencode', 'models.json'));
}

function isTestProcess(): boolean {
  return process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
}

function lookupOpenCodeModelPrice(
  catalog: OpenCodeModelCatalog,
  modelId: string,
): Pick<
  RuntimeModelOption,
  'inputPriceUsdPerMillion' | 'outputPriceUsdPerMillion'
> | null {
  for (const providerId of OPENCODE_MODEL_PRICE_PROVIDER_PRIORITY) {
    const provider = catalog[providerId];
    const match = provider?.models
      ? lookupProviderModel(provider.models, modelId)
      : null;
    if (match) return match;
  }
  return null;
}

function lookupProviderModel(
  models: Record<string, unknown>,
  modelId: string,
): Pick<
  RuntimeModelOption,
  'inputPriceUsdPerMillion' | 'outputPriceUsdPerMillion'
> | null {
  const lookupKeys = openCodeModelLookupKeys(modelId);
  for (const key of lookupKeys) {
    const model = models[key];
    const price = openCodeModelPrice(model);
    if (price) return price;
  }

  for (const [key, model] of Object.entries(models)) {
    const record = isRecord(model) ? model : {};
    const id = typeof record.id === 'string' ? record.id : key;
    const suffix = id.split('/').pop() ?? id;
    if (!lookupKeys.includes(suffix)) continue;
    const price = openCodeModelPrice(model);
    if (price) return price;
  }

  return null;
}

function openCodeModelLookupKeys(modelId: string): string[] {
  const keys = new Set<string>([modelId]);
  keys.add(modelId.replace(/-(\d+)\.(\d+)(?=$|-)/g, '-$1-$2'));
  if (modelId.endsWith('-preview')) keys.add(modelId.slice(0, -'-preview'.length));
  if (modelId.startsWith('gemini-')) {
    keys.add(`google/${modelId}`);
    if (modelId.endsWith('-preview')) {
      keys.add(`google/${modelId}`);
      keys.add(`google/${modelId.slice(0, -'-preview'.length)}`);
    }
  }
  if (modelId.startsWith('glm-')) keys.add(`z-ai/${modelId}`);
  if (modelId.startsWith('kimi-')) keys.add(`moonshotai/${modelId}`);
  if (modelId.startsWith('minimax-')) keys.add(`minimax/${modelId}`);
  if (modelId.startsWith('mimo-')) keys.add(`xiaomi/${modelId}`);
  if (modelId.startsWith('claude-')) {
    keys.add(`anthropic/${modelId}`);
    keys.add(`anthropic/${modelId.replace(/-(\d+)\.(\d+)(?=$|-)/g, '-$1-$2')}`);
  }
  if (modelId.startsWith('gpt-')) keys.add(`openai/${modelId}`);
  return Array.from(keys);
}

function openCodeModelPrice(
  model: unknown,
): Pick<
  RuntimeModelOption,
  'inputPriceUsdPerMillion' | 'outputPriceUsdPerMillion'
> | null {
  if (!isRecord(model)) return null;
  const inputPriceUsdPerMillion = extractInputPriceUsdPerMillion(model);
  if (inputPriceUsdPerMillion === undefined) return null;
  const outputPriceUsdPerMillion = extractOutputPriceUsdPerMillion(model);
  return {
    inputPriceUsdPerMillion,
    ...(outputPriceUsdPerMillion === undefined ? {} : { outputPriceUsdPerMillion }),
  };
}

function orderAmrChatModels(
  models: RuntimeModelOption[],
): RuntimeModelOption[] {
  return models
    .map((model, index) => ({ model, index }))
    .sort((a, b) => {
      const aRank =
        PREFERRED_AMR_CHAT_MODEL_RANK.get(a.model.id) ?? Number.MAX_SAFE_INTEGER;
      const bRank =
        PREFERRED_AMR_CHAT_MODEL_RANK.get(b.model.id) ?? Number.MAX_SAFE_INTEGER;
      if (aRank !== bRank) return aRank - bRank;
      if (aRank !== Number.MAX_SAFE_INTEGER) return a.index - b.index;
      return a.model.id.localeCompare(b.model.id) || a.index - b.index;
    })
    .map(({ model }) => model);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function velaModelsErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error ?? '');
}

function isRetriableVelaModelsError(error: unknown): boolean {
  const message = velaModelsErrorMessage(error).toLowerCase();
  return [
    'deadline exceeded',
    'timed out',
    'timeout',
    'temporarily unavailable',
    'temporary failure',
    'econnreset',
    'econnrefused',
    'enotfound',
    '502',
    '503',
    '504',
  ].some((pattern) => message.includes(pattern));
}

async function fetchVelaModelsWithRetry(
  resolvedBin: string,
  env: NodeJS.ProcessEnv,
): Promise<RuntimeModelOption[]> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= AMR_MODELS_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const { stdout } = await execAgentFile(resolvedBin, ['models'], {
        env,
        timeout: AMR_MODELS_TIMEOUT_MS,
        maxBuffer: 1024 * 1024,
      });
      return parseVelaModels(String(stdout));
    } catch (error) {
      lastError = error;
      if (
        attempt === AMR_MODELS_RETRY_DELAYS_MS.length ||
        !isRetriableVelaModelsError(error)
      ) {
        throw error;
      }
      await sleep(AMR_MODELS_RETRY_DELAYS_MS[attempt] ?? 0);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(velaModelsErrorMessage(lastError));
}

export async function fetchVelaPresetModels(
  resolvedBin: string,
  env: NodeJS.ProcessEnv,
): Promise<RuntimeModelOption[]> {
  const { stdout } = await execAgentFile(resolvedBin, ['model', 'preset', '--format', 'json'], {
    env,
    timeout: AMR_MODELS_TIMEOUT_MS,
    maxBuffer: 1024 * 1024,
  });
  return enrichVelaModelsFromOpenCodeCatalog(
    parseVelaModelJson(String(stdout), 'preset'),
    env,
  );
}

export async function fetchVelaRemoteModelsWithRetry(
  resolvedBin: string,
  env: NodeJS.ProcessEnv,
): Promise<RuntimeModelOption[]> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= AMR_MODELS_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const { stdout } = await execAgentFile(resolvedBin, ['model', 'list', '--all', '--format', 'json'], {
        env,
        timeout: AMR_MODELS_TIMEOUT_MS,
        maxBuffer: 1024 * 1024,
      });
      return enrichVelaModelsFromOpenCodeCatalog(
        parseVelaModelJson(String(stdout), 'remote'),
        env,
      );
    } catch (error) {
      lastError = error;
      if (
        attempt === AMR_MODELS_RETRY_DELAYS_MS.length ||
        !isRetriableVelaModelsError(error)
      ) {
        throw error;
      }
      await sleep(AMR_MODELS_RETRY_DELAYS_MS[attempt] ?? 0);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(velaModelsErrorMessage(lastError));
}

/** Live account fields parsed from `vela billing summary --format json`. */
export interface VelaBillingSummary {
  /** Real subscription tier (e.g. "max"); absent for free accounts. */
  plan?: string;
  /** Total available balance in USD (string), or null when unavailable. */
  balanceUsd?: string | null;
}

/**
 * Read the signed-in account's billing summary via the vela CLI — the same
 * data source used for models, so balance/tier come through the versioned CLI
 * contract rather than a separate HTTP call. Returns total available balance
 * and the real membership tier.
 */
export async function fetchVelaBillingSummary(
  resolvedBin: string,
  env: NodeJS.ProcessEnv,
): Promise<VelaBillingSummary> {
  const { stdout } = await execAgentFile(
    resolvedBin,
    ['billing', 'summary', '--format', 'json'],
    { env, timeout: AMR_MODELS_TIMEOUT_MS, maxBuffer: 1024 * 1024 },
  );
  const data = JSON.parse(String(stdout)) as {
    balanceUsd?: unknown;
    totalAvailableCreditsUsd?: unknown;
    membershipTier?: unknown;
  };
  // Use `balanceUsd` — the same field the console wallet page renders as the
  // headline "余额" — so the two surfaces always agree. Fall back to the total
  // available only if `balanceUsd` is missing.
  const balanceUsd =
    typeof data.balanceUsd === 'string'
      ? data.balanceUsd
      : typeof data.totalAvailableCreditsUsd === 'string'
        ? data.totalAvailableCreditsUsd
        : null;
  // `membershipTier` is omitted for free accounts. A SUCCESSFUL summary with no
  // tier therefore means "free" — normalize to the explicit sentinel so the UI
  // shows the plan and the Upgrade CTA for free users. "Unknown" (billing
  // unavailable) is signalled separately by the fetch rejecting → null account,
  // never by an absent tier on a successful read.
  const tier =
    typeof data.membershipTier === 'string' && data.membershipTier.trim()
      ? data.membershipTier.trim()
      : 'free';
  return { plan: tier, balanceUsd };
}

export const amrAgentDef = {
  id: 'amr',
  name: 'AMR',
  bin: 'vela',
  versionArgs: ['--version'],
  fetchModels: fetchVelaRemoteModelsWithRetry,
  // Fail closed when Vela's live catalog is unavailable. Stale static
  // fallbacks let users select models that link/opencode no longer accepts.
  fallbackModels: [] as RuntimeModelOption[],
  buildArgs: () => ['agent', 'run', '--runtime', 'opencode'],
  streamFormat: 'acp-json-rpc',
  // vela resumes the upstream OpenCode session via ACP session/load across
  // turns (the OpenCode session store persists per conversation), so the daemon
  // captures the durable handle, skips the transcript resend on resume, and
  // maps vela's resume_failed onto the reseed path. See resumesSessionViaAcpLoad.
  resumesSessionViaAcpLoad: true,
  // Vela routes model selection through ACP's `session/set_model` and only
  // accepts ids that survived the `vela models` preflight check, so a
  // free-text "Custom" id silently fails at spawn. The model picker
  // surfaces the live Vela catalog instead.
  supportsCustomModel: false,
  supportsImagePaths: true,
  // Daemon-process env override for emergency operator pinning when no model
  // was selected. Explicit UI selections, including `default`, win.
  defaultModelEnvVar: 'VELA_DEFAULT_MODEL',
  // Vela/OpenCode can spend extended stretches silent while the upstream
  // provider is still working. Keep the outer chat watchdog aligned with the
  // 30-minute ACP stage timeout so the daemon does not fail the run first.
  inactivityTimeoutMs: 30 * 60 * 1000,
} satisfies RuntimeAgentDef;
