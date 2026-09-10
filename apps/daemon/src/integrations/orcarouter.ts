// OrcaRouter — a first-class OpenAI-compatible gateway provider.
//
// This module owns the two things every OrcaRouter surface shares: where the
// bytes go (auth vs. inference origins — they are different hosts, see below)
// and what the provider can currently run (the live model catalogue).
//
// Origins. Authentication and inference live on separate public origins and
// neither is derived from the other. `https://api.orcarouter.ai/v1/auth/keys`
// is a 404 — the auth API is on the www origin at `/api/v1/auth`. Self-hosted
// deployments may collapse both onto one origin, so `ORCA_BASE_URL` is a
// shared fallback with `ORCA_AUTH_BASE_URL` / `ORCA_API_BASE_URL` as explicit
// overrides that win over it.
//
// Catalogue. `GET {api}/models` behind the user's own key is the single source
// of truth. Capability filtering is applied here, once, so the chat picker, the
// multimodal picker, and the media surfaces all read the same rules instead of
// re-deriving them per page.

import { redactSecrets } from '../connectionTest.js';

// ───────────────────────────────────────────────────────────────────────
// Origins and endpoints.
// ───────────────────────────────────────────────────────────────────────

export const ORCAROUTER_AUTH_ORIGIN_DEFAULT = 'https://www.orcarouter.ai';
export const ORCAROUTER_API_BASE_DEFAULT = 'https://api.orcarouter.ai/v1';
export const ORCAROUTER_AUTHORIZE_PATH = '/auth';
export const ORCAROUTER_EXCHANGE_PATH = '/api/v1/auth/keys';
export const ORCAROUTER_DEVICE_CODE_PATH = '/api/v1/auth/device/code';
export const ORCAROUTER_DEVICE_TOKEN_PATH = '/api/v1/auth/device/token';
export const ORCAROUTER_DISCOVERY_PATH = '/.well-known/openid-configuration';

export const ORCAROUTER_PROVIDER_ID = 'orcarouter';
export const ORCAROUTER_KEY_PREFIX = 'sk-orca-';
export const ORCAROUTER_CONSOLE_KEYS_URL = `${ORCAROUTER_AUTH_ORIGIN_DEFAULT}/console/authorized-apps`;
export const ORCAROUTER_APP_NAME = 'OpenDesign';

/** Environment names the daemon reads, in precedence order. */
export const ORCAROUTER_ENV_AUTH_BASE = 'ORCA_AUTH_BASE_URL';
export const ORCAROUTER_ENV_API_BASE = 'ORCA_API_BASE_URL';
export const ORCAROUTER_ENV_SHARED_BASE = 'ORCA_BASE_URL';

type Env = Record<string, string | undefined>;

function readEnvOrigin(env: Env, name: string): string | null {
  const raw = env[name];
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed ? trimmed : null;
}

function isLoopbackHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

/**
 * Reject a configured origin that would send a credential over cleartext to a
 * remote host. Loopback HTTP stays legal for local self-hosted development.
 */
export function assertOrcaRouterOrigin(value: string, label: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} is not a valid URL: ${value}`);
  }
  if (parsed.username || parsed.password) {
    throw new Error(`${label} must not embed credentials`);
  }
  if (parsed.protocol === 'https:') return value;
  if (parsed.protocol === 'http:' && isLoopbackHostname(parsed.hostname)) return value;
  throw new Error(
    `${label} must use https for a remote host (http is allowed only for loopback): ${value}`,
  );
}

function stripTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '');
}

/** Auth origin — `ORCA_AUTH_BASE_URL`, then `ORCA_BASE_URL`, then the default. */
export function resolveOrcaRouterAuthBase(env: Env = process.env): string {
  const value =
    readEnvOrigin(env, ORCAROUTER_ENV_AUTH_BASE)
    ?? readEnvOrigin(env, ORCAROUTER_ENV_SHARED_BASE)
    ?? ORCAROUTER_AUTH_ORIGIN_DEFAULT;
  return stripTrailingSlashes(assertOrcaRouterOrigin(value, 'OrcaRouter auth base URL'));
}

/** Inference origin — `ORCA_API_BASE_URL`, then `ORCA_BASE_URL`, then the default. */
export function resolveOrcaRouterApiBase(env: Env = process.env): string {
  const value =
    readEnvOrigin(env, ORCAROUTER_ENV_API_BASE)
    ?? readEnvOrigin(env, ORCAROUTER_ENV_SHARED_BASE)
    ?? ORCAROUTER_API_BASE_DEFAULT;
  const base = stripTrailingSlashes(assertOrcaRouterOrigin(value, 'OrcaRouter API base URL'));
  // A self-hosted override may hand us a bare origin; the OpenAI wire paths
  // hang off `/v1`, and the catalogue endpoint is `/v1/models`.
  return /\/v\d+$/.test(base) ? base : `${base}/v1`;
}

/**
 * Inference base for a call whose stored provider config may hold the canonical
 * origin. An explicit `ORCA_API_BASE_URL` / `ORCA_BASE_URL` wins so a
 * self-hosted deployment can be pointed at without editing stored config; the
 * stored value is the fallback, then the public default.
 *
 * The UI pins the stored value to the canonical origin (OrcaRouter is a
 * fixed-origin gateway there, which is what keeps a user from accidentally
 * aiming inference at the auth host). Env is therefore the supported path for
 * self-hosting.
 */
export function resolveOrcaRouterMediaBaseUrl(
  storedBaseUrl: string | undefined,
  env: Env = process.env,
): string {
  if (readEnvOrigin(env, ORCAROUTER_ENV_API_BASE) || readEnvOrigin(env, ORCAROUTER_ENV_SHARED_BASE)) {
    return resolveOrcaRouterApiBase(env);
  }
  const stored = (storedBaseUrl ?? '').trim().replace(/\/+$/, '');
  if (!stored) return resolveOrcaRouterApiBase(env);
  const base = assertOrcaRouterOrigin(stored, 'OrcaRouter API base URL');
  return /\/v\d+$/.test(base) ? base : `${base}/v1`;
}

export function orcaRouterAuthorizeUrl(authBase: string): string {
  return `${authBase}${ORCAROUTER_AUTHORIZE_PATH}`;
}

export function orcaRouterExchangeUrl(authBase: string): string {
  return `${authBase}${ORCAROUTER_EXCHANGE_PATH}`;
}

// ───────────────────────────────────────────────────────────────────────
// Catalogue.
// ───────────────────────────────────────────────────────────────────────

/**
 * The catalogue's own vocabulary. `chat` / `embedding` / `image` are the
 * `?capability=` filter values; `video` and `rerank` have no server-side
 * capability filter and are recognised from `supported_endpoint_types`.
 */
export type OrcaRouterCapability = 'chat' | 'embedding' | 'image' | 'video' | 'rerank';

/** A non-text modality a chat model must declare to appear in a given picker. */
export type OrcaRouterInputModality = 'text' | 'image' | 'audio' | 'video' | 'file';

export interface OrcaRouterCatalogModel {
  id: string;
  name?: string;
  contextLength?: number;
  maxCompletionTokens?: number;
  inputModalities: OrcaRouterInputModality[];
  endpointTypes: string[];
  /** Reasoning-effort ladder the provider advertises for this route. */
  reasoningEfforts?: string[];
}

/** Endpoint types that can serve an OpenAI/Anthropic/Gemini chat completion. */
const CHAT_ENDPOINT_TYPES = new Set(['openai', 'openai-response', 'anthropic', 'gemini']);
/** Endpoint types that are never a text chat route, whatever else they claim. */
const NON_TEXT_ENDPOINT_TYPES = new Set([
  'image-generation',
  'openai-video',
  'jina-rerank',
  'embeddings',
]);

const MAX_CATALOG_BYTES = 4 * 1024 * 1024;
const MAX_CATALOG_ITEMS = 2000;
export const ORCAROUTER_CATALOG_TIMEOUT_MS = 12_000;

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Normalize one catalogue page (`{ data: [...] }` or the raw array) into typed
 * rows, dropping anything malformed and honouring the item-count bound.
 */
export function normalizeOrcaRouterCatalogPage(raw: unknown): OrcaRouterCatalogModel[] {
  const rows = Array.isArray(raw) ? raw : (raw as { data?: unknown })?.data;
  if (!Array.isArray(rows)) return [];
  const out: OrcaRouterCatalogModel[] = [];
  for (const row of rows.slice(0, MAX_CATALOG_ITEMS)) {
    const model = normalizeCatalogModel(row);
    if (model) out.push(model);
  }
  return out;
}

function normalizeCatalogModel(raw: unknown): OrcaRouterCatalogModel | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const id = typeof obj.id === 'string' ? obj.id.trim() : '';
  if (!id) return null;
  const architecture = (obj.architecture && typeof obj.architecture === 'object' && !Array.isArray(obj.architecture))
    ? obj.architecture as Record<string, unknown>
    : null;
  const inputModalities = readStringArray(architecture?.input_modalities)
    .map((m) => m.trim().toLowerCase())
    .filter((m): m is OrcaRouterInputModality =>
      m === 'text' || m === 'image' || m === 'audio' || m === 'video' || m === 'file');
  const endpointTypes = readStringArray(obj.supported_endpoint_types)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  const out: OrcaRouterCatalogModel = { id, inputModalities, endpointTypes };
  if (typeof obj.name === 'string' && obj.name.trim()) out.name = obj.name.trim();
  const contextLength = readFiniteNumber(obj.context_length);
  if (contextLength !== undefined) out.contextLength = contextLength;
  const maxCompletionTokens = readFiniteNumber(obj.max_completion_tokens);
  if (maxCompletionTokens !== undefined) out.maxCompletionTokens = maxCompletionTokens;
  return out;
}

/**
 * `architecture.input_modalities` is the only evidence a model can accept a
 * non-text attachment. A model that does not declare the modality is excluded
 * rather than assumed compatible — the picker must fail closed.
 */
export function modelAcceptsModalities(
  model: OrcaRouterCatalogModel,
  required: readonly OrcaRouterInputModality[],
): boolean {
  return required.every((modality) => model.inputModalities.includes(modality));
}

function isTextChatModel(model: OrcaRouterCatalogModel): boolean {
  if (model.endpointTypes.some((t) => NON_TEXT_ENDPOINT_TYPES.has(t))) return false;
  return model.endpointTypes.some((t) => CHAT_ENDPOINT_TYPES.has(t));
}

/**
 * Apply the capability rules for one picker to a catalogue page.
 *
 * `chat` additionally requires at least one supported text endpoint type and
 * excludes the media/rerank-only routes; `image` / `embedding` accept either
 * the dedicated `?capability=` page or a strictly matching endpoint type;
 * `video` and `rerank` have no server-side filter and match on endpoint type
 * alone.
 */
export function filterOrcaRouterModels(
  models: readonly OrcaRouterCatalogModel[],
  capability: OrcaRouterCapability,
  requiredModalities: readonly OrcaRouterInputModality[] = [],
): OrcaRouterCatalogModel[] {
  const seen = new Set<string>();
  const out: OrcaRouterCatalogModel[] = [];
  for (const model of models) {
    if (seen.has(model.id)) continue;
    let matches: boolean;
    switch (capability) {
      case 'chat':
        matches = isTextChatModel(model)
          && modelAcceptsModalities(model, requiredModalities);
        break;
      case 'embedding':
        matches = model.endpointTypes.includes('embeddings');
        break;
      case 'image':
        matches = model.endpointTypes.includes('image-generation');
        break;
      case 'video':
        matches = model.endpointTypes.includes('openai-video');
        break;
      case 'rerank':
        matches = model.endpointTypes.includes('jina-rerank');
        break;
    }
    if (!matches) continue;
    seen.add(model.id);
    out.push(model);
  }
  return out;
}

export function orcaRouterCatalogUrl(
  apiBase: string,
  capability: OrcaRouterCapability,
): string {
  const url = new URL(`${stripTrailingSlashes(apiBase)}/models`);
  // Only chat/embedding/image expose a server-side capability filter. Video
  // and rerank are recognised from endpoint types on the unfiltered page.
  if (capability === 'chat' || capability === 'embedding' || capability === 'image') {
    url.searchParams.set('capability', capability);
  }
  return url.toString();
}

export interface FetchOrcaRouterCatalogInput {
  apiKey: string;
  capability: OrcaRouterCapability;
  requiredModalities?: readonly OrcaRouterInputModality[];
  apiBase?: string;
  env?: Env;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface FetchOrcaRouterCatalogResult {
  ok: boolean;
  models: OrcaRouterCatalogModel[];
  /**
   * The unfiltered rows exactly as the endpoint returned them, so callers that
   * project onto the picker option shape can still read fields the normalized
   * model does not carry (pricing). Empty on failure.
   */
  rawRows: unknown[];
  /** Set when the live catalogue could not be used; `models` then holds the seed. */
  degradedReason?: string;
  status?: number;
}

/**
 * Read the live catalogue for one capability. Bounded on every axis a remote
 * response controls: timeout, byte count, item count, and accepted item shape.
 *
 * The caller decides what to do with a failure. This function does not silently
 * substitute the seed — it reports `ok:false` so the caller can label the list
 * "verified fallback" instead of presenting stale rows as live.
 */
export async function fetchOrcaRouterCatalog(
  input: FetchOrcaRouterCatalogInput,
): Promise<FetchOrcaRouterCatalogResult> {
  const apiBase = input.apiBase ?? resolveOrcaRouterApiBase(input.env);
  const url = orcaRouterCatalogUrl(apiBase, input.capability);
  const fetchImpl = input.fetchImpl ?? fetch;
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (input.signal?.aborted) controller.abort();
  else input.signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(
    () => controller.abort(),
    input.timeoutMs ?? ORCAROUTER_CATALOG_TIMEOUT_MS,
  );

  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: {
        authorization: `Bearer ${input.apiKey}`,
        accept: 'application/json',
      },
      signal: controller.signal,
      redirect: 'error',
    });
    if (!response.ok) {
      return {
        ok: false,
        models: [],
        rawRows: [],
        status: response.status,
        degradedReason: `catalogue returned HTTP ${response.status}`,
      };
    }
    const rawText = await response.text();
    if (rawText.length > MAX_CATALOG_BYTES) {
      return {
        ok: false,
        models: [],
        rawRows: [],
        status: response.status,
        degradedReason: 'catalogue response exceeded the size bound',
      };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      return {
        ok: false,
        models: [],
        rawRows: [],
        status: response.status,
        degradedReason: 'catalogue response was not JSON',
      };
    }
    const rows = (parsed as { data?: unknown })?.data;
    if (!Array.isArray(rows)) {
      return {
        ok: false,
        models: [],
        rawRows: [],
        status: response.status,
        degradedReason: 'catalogue response had no data array',
      };
    }
    const normalized = normalizeOrcaRouterCatalogPage(rows);
    return {
      ok: true,
      models: filterOrcaRouterModels(
        normalized,
        input.capability,
        input.requiredModalities ?? [],
      ),
      rawRows: rows,
      status: response.status,
    };
  } catch (err: unknown) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      models: [],
      rawRows: [],
      degradedReason: aborted
        ? 'catalogue request timed out'
        : redactSecrets(message, [input.apiKey]),
    };
  } finally {
    clearTimeout(timer);
    input.signal?.removeEventListener('abort', onAbort);
  }
}

// ───────────────────────────────────────────────────────────────────────
// Verified cold-start seed.
// ───────────────────────────────────────────────────────────────────────

/**
 * Cold-start seed used only when live discovery fails, so a fresh install
 * against a slow or unreachable catalogue still shows a usable chat list.
 *
 * Every row below was read back from `GET https://api.orcarouter.ai/v1/models`
 * on 2026-09-10 and keeps the metadata that endpoint reported verbatim: the
 * endpoint types that decide capability filtering, the context window, the
 * output ceiling, and the input modalities. The `reasoningEfforts` ladder on
 * `openai/gpt-5.5` is the one field the public payload does not carry — it is
 * the verified low/medium/high/xhigh ladder for that route, preserved so live
 * discovery does not silently narrow the model's capability.
 * These are NOT presented as the live catalogue — the caller renders them with
 * the degraded/last-known-good label.
 */
export const ORCAROUTER_VERIFIED_SEED: readonly OrcaRouterCatalogModel[] = [
  {
    id: 'openai/gpt-5.5',
    name: 'OpenAI: GPT-5.5',
    endpointTypes: ['openai', 'openai-response'],
    inputModalities: ['text', 'image', 'file'],
    maxCompletionTokens: 128000,
    reasoningEfforts: ['low', 'medium', 'high', 'xhigh'],
  },
  {
    id: 'anthropic/claude-opus-4.8',
    endpointTypes: ['openai', 'anthropic', 'openai-response'],
    inputModalities: ['text', 'image', 'file'],
    contextLength: 1000000,
    maxCompletionTokens: 128000,
  },
  {
    id: 'google/gemini-3.5-flash',
    endpointTypes: ['openai', 'gemini'],
    inputModalities: ['text', 'image', 'video', 'file', 'audio'],
    contextLength: 1048576,
    maxCompletionTokens: 65536,
  },
  {
    id: 'deepseek/deepseek-v4-pro',
    endpointTypes: ['openai', 'openai-response'],
    inputModalities: ['text'],
    contextLength: 1048576,
    maxCompletionTokens: 384000,
  },
  {
    id: 'orcarouter/auto',
    name: 'OrcaRouter Auto',
    endpointTypes: ['openai', 'openai-response', 'anthropic', 'gemini'],
    inputModalities: [],
  },
];

/** Seed rows for one capability, filtered by the same rules as live rows. */
export function orcaRouterSeedFor(
  capability: OrcaRouterCapability,
  requiredModalities: readonly OrcaRouterInputModality[] = [],
): OrcaRouterCatalogModel[] {
  const seeded: OrcaRouterCatalogModel[] = ORCAROUTER_VERIFIED_SEED.map((model) => ({
    ...model,
    inputModalities: [...model.inputModalities],
    endpointTypes: [...model.endpointTypes],
    ...(model.reasoningEfforts ? { reasoningEfforts: [...model.reasoningEfforts] } : {}),
  }));
  return filterOrcaRouterModels(seeded, capability, requiredModalities);
}

/**
 * Project catalogue rows onto the shared `AgentModelOption` shape the model
 * pickers consume, so OrcaRouter rides the repository's existing discovery
 * contract instead of introducing a parallel one. Vendor namespaces are carried
 * through verbatim — `openai/gpt-5.5` stays `openai/gpt-5.5`.
 */
export interface OrcaRouterModelOption {
  id: string;
  label: string;
  // `inputModalities` is the evidence the pickers filter on — the catalogue is
  // its only source, so it must survive the projection.
  metadata?: { contextWindowTokens?: number; inputModalities?: string[] };
  inputPriceUsdPerMillion?: number;
  outputPriceUsdPerMillion?: number;
  reasoningOptions?: Array<{ id: string; label: string; default?: boolean }>;
}

function readPricePerMillion(pricing: unknown, key: string): number | undefined {
  if (!pricing || typeof pricing !== 'object') return undefined;
  const raw = (pricing as Record<string, unknown>)[key];
  if (typeof raw !== 'string' && typeof raw !== 'number') return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

/** Raw catalogue rows, so pricing survives alongside the normalized fields. */
function rawRowsById(raw: unknown): Map<string, Record<string, unknown>> {
  const rows = Array.isArray(raw) ? raw : (raw as { data?: unknown })?.data;
  const map = new Map<string, Record<string, unknown>>();
  if (!Array.isArray(rows)) return map;
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const obj = row as Record<string, unknown>;
    if (typeof obj.id === 'string' && obj.id.trim()) map.set(obj.id.trim(), obj);
  }
  return map;
}

export function toOrcaRouterModelOptions(
  models: readonly OrcaRouterCatalogModel[],
  rawRows: unknown,
): OrcaRouterModelOption[] {
  const raw = rawRowsById(rawRows);
  return models.map((model) => {
    const source = raw.get(model.id);
    const option: OrcaRouterModelOption = { id: model.id, label: model.name ?? model.id };
    if (model.contextLength !== undefined || model.inputModalities.length) {
      option.metadata = {};
      if (model.contextLength !== undefined) {
        option.metadata.contextWindowTokens = model.contextLength;
      }
      if (model.inputModalities.length) {
        option.metadata.inputModalities = [...model.inputModalities];
      }
    }
    const prompt = readPricePerMillion(source?.pricing, 'prompt_per_million');
    const completion = readPricePerMillion(source?.pricing, 'completion_per_million');
    if (prompt !== undefined) option.inputPriceUsdPerMillion = prompt;
    if (completion !== undefined) option.outputPriceUsdPerMillion = completion;
    if (model.reasoningEfforts?.length) {
      option.reasoningOptions = model.reasoningEfforts.map((effort) => ({
        id: effort,
        label: effort,
      }));
    }
    return option;
  });
}

/** Seed rows projected onto the same shape, for the degraded discovery path. */
export function orcaRouterSeedModelOptions(
  capability: OrcaRouterCapability,
  requiredModalities: readonly OrcaRouterInputModality[] = [],
): OrcaRouterModelOption[] {
  return toOrcaRouterModelOptions(
    orcaRouterSeedFor(capability, requiredModalities),
    ORCAROUTER_VERIFIED_SEED,
  );
}

/** Seed rows for the media surfaces, which read this module too. */
export const ORCAROUTER_SEED_IMAGE_MODEL_IDS: readonly string[] = [
  'gpt-image-2',
  'openai/gpt-image-1.5',
];
export const ORCAROUTER_SEED_VIDEO_MODEL_IDS: readonly string[] = [
  'kling/kling-v3',
  'minimax/minimax-h3',
];
