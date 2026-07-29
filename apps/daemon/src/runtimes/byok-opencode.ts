import type { ByokChatProviderConfig } from '@open-design/contracts';

export const BYOK_OPENCODE_AGENT_ID = 'byok-opencode';
export const BYOK_OPENCODE_PROVIDER_ID = 'open-design-byok';
export const BYOK_OPENCODE_API_KEY_ENV = 'OPEN_DESIGN_BYOK_API_KEY';
export const BYOK_OPENCODE_PROVIDER_REQUIRED_MESSAGE =
  'BYOK OpenCode requires a provider, API key, and model for this run.';
const DEFAULT_CONTEXT_TOKEN_LIMIT = 128_000;
const DEFAULT_OUTPUT_TOKEN_LIMIT = 16_384;

const DEFAULT_BASE_URL_BY_PROTOCOL: Record<ByokChatProviderConfig['protocol'], string> = {
  anthropic: 'https://api.anthropic.com/v1',
  openai: 'https://api.openai.com/v1',
  azure: '',
  google: 'https://generativelanguage.googleapis.com/v1beta',
  ollama: 'https://ollama.com',
  senseaudio: 'https://api.senseaudio.cn',
  aihubmix: 'https://aihubmix.com/v1',
};

type ProviderPackage =
  | '@ai-sdk/anthropic'
  | '@ai-sdk/openai'
  | '@ai-sdk/openai-compatible'
  | '@ai-sdk/azure'
  | '@ai-sdk/google';

export interface OpenCodeByokProviderConfig {
  providerId: string;
  modelId: string;
  env: Record<string, string>;
  config: Record<string, unknown>;
}

export function opencodeByokModelId(model: string | null | undefined): string | null {
  const trimmed = typeof model === 'string' ? model.trim() : '';
  if (!trimmed || trimmed.toLowerCase() === 'default') return null;
  if (trimmed.startsWith(`${BYOK_OPENCODE_PROVIDER_ID}/`)) return trimmed;
  return `${BYOK_OPENCODE_PROVIDER_ID}/${trimmed}`;
}

/**
 * Which guard rejected a BYOK OpenCode config.
 *
 * These six rejections used to be six bare `return null`s, and the caller
 * turned all of them into one constant error string — so `agent_config_invalid`
 * (703 runs / 277 users in 24h, 702 of them BYOK) could not be broken down at
 * all, in analytics OR in Langfuse, because the recorded text was a constant.
 */
export type ByokOpenCodeConfigGap =
  | 'provider_missing'
  | 'protocol_unsupported'
  | 'api_key_required'
  | 'model_required'
  | 'model_default'
  | 'base_url_required'
  | 'model_id_invalid';

export type ByokOpenCodeConfigResolution =
  | { ok: true; config: OpenCodeByokProviderConfig }
  | { ok: false; gap: ByokOpenCodeConfigGap };

/**
 * The error code a rejected run is failed with. Kept as a `BYOK_*` token so
 * `isAgentConfigInvalidText` still buckets the run as `agent_config_invalid`
 * (the dashboards track that name) while `run_finished.error_code` now carries
 * the specific gap.
 */
export function byokOpenCodeGapErrorCode(gap: ByokOpenCodeConfigGap): string {
  return `BYOK_PROVIDER_REQUIRED.${gap.toUpperCase()}`;
}

export function resolveOpenCodeByokProviderConfig(
  provider: ByokChatProviderConfig | null | undefined,
  model: string | null | undefined,
): ByokOpenCodeConfigResolution {
  if (!provider || typeof provider !== 'object') return { ok: false, gap: 'provider_missing' };
  const protocol = provider.protocol;
  if (!Object.prototype.hasOwnProperty.call(DEFAULT_BASE_URL_BY_PROTOCOL, protocol)) {
    return { ok: false, gap: 'protocol_unsupported' };
  }
  const apiKey = typeof provider.apiKey === 'string' ? provider.apiKey.trim() : '';
  const rawModel = typeof model === 'string' ? model.trim() : '';
  const defaultBaseUrl = DEFAULT_BASE_URL_BY_PROTOCOL[protocol];
  const baseUrl = normalizeProviderBaseUrl(
    protocol,
    typeof provider.baseUrl === 'string' && provider.baseUrl.trim()
      ? provider.baseUrl.trim()
      : defaultBaseUrl,
  );
  const needsApiKey = requiresApiKey(provider, baseUrl);
  if (needsApiKey && !apiKey) return { ok: false, gap: 'api_key_required' };
  // `default` is its own population: the user never picked a model rather than
  // having cleared one, which is a different fix in the UI.
  if (!rawModel) return { ok: false, gap: 'model_required' };
  if (rawModel.toLowerCase() === 'default') return { ok: false, gap: 'model_default' };
  if (!baseUrl) return { ok: false, gap: 'base_url_required' };

  const modelId = opencodeByokModelId(rawModel);
  if (!modelId) return { ok: false, gap: 'model_id_invalid' };

  const providerEntry = buildProviderEntry(
    protocol,
    baseUrl,
    provider.apiVersion,
    needsApiKey,
  );
  const config = {
    provider: {
      [BYOK_OPENCODE_PROVIDER_ID]: {
        name: 'Open Design BYOK',
        ...providerEntry,
        models: {
          [rawModel]: {
            name: rawModel,
            limit: {
              context: DEFAULT_CONTEXT_TOKEN_LIMIT,
              output: DEFAULT_OUTPUT_TOKEN_LIMIT,
            },
          },
        },
      },
    },
  };

  return {
    ok: true,
    config: {
      providerId: BYOK_OPENCODE_PROVIDER_ID,
      modelId,
      env: needsApiKey ? { [BYOK_OPENCODE_API_KEY_ENV]: apiKey } : {},
      config,
    },
  };
}

/**
 * Config-or-null projection of {@link resolveOpenCodeByokProviderConfig}, kept
 * so the existing `!== null` call sites are untouched. Deliberately a pure
 * projection rather than a second implementation — two copies of these guards
 * would drift, and the looser copy is exactly how an invalid config reaches the
 * daemon in the first place.
 */
export function buildOpenCodeByokProviderConfig(
  provider: ByokChatProviderConfig | null | undefined,
  model: string | null | undefined,
): OpenCodeByokProviderConfig | null {
  const resolution = resolveOpenCodeByokProviderConfig(provider, model);
  return resolution.ok ? resolution.config : null;
}

function normalizeProviderBaseUrl(
  protocol: ByokChatProviderConfig['protocol'],
  baseUrl: string,
): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (!trimmed) return trimmed;
  if (protocol === 'anthropic' && !hasVersionedApiPath(trimmed)) {
    return appendVersionedApiPath(trimmed);
  }
  if (protocol === 'openai' && isExactOrigin(trimmed, 'https://api.openai.com')) {
    return 'https://api.openai.com/v1';
  }
  if (protocol === 'google' && isExactOrigin(trimmed, 'https://generativelanguage.googleapis.com')) {
    return 'https://generativelanguage.googleapis.com/v1beta';
  }
  if (protocol === 'ollama') {
    if (isExactOrigin(trimmed, 'https://ollama.com')) return 'https://ollama.com/v1';
    if (isLocalOllamaOriginPath(trimmed)) return `${trimmed}/v1`;
    if (trimmed.endsWith('/api')) return `${trimmed.slice(0, -4)}/v1`;
  }
  return trimmed;
}

function requiresApiKey(
  provider: ByokChatProviderConfig,
  baseUrl: string,
): boolean {
  const protocol = provider.protocol;
  if (provider.requiresApiKey === false) return false;
  return protocol !== 'ollama' || !isLocalOllamaBaseUrl(baseUrl);
}

function isLocalOllamaBaseUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase();
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  } catch {
    return false;
  }
}

function isLocalOllamaOriginPath(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (
      isLocalOllamaBaseUrl(value) &&
      (parsed.pathname === '' || parsed.pathname === '/')
    );
  } catch {
    return false;
  }
}

function isExactOrigin(value: string, origin: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.origin === origin && (parsed.pathname === '' || parsed.pathname === '/');
  } catch {
    return value === origin;
  }
}

function isRealOpenAIHost(baseUrl: string): boolean {
  if (!baseUrl) return true;
  try {
    return new URL(baseUrl).hostname === 'api.openai.com';
  } catch {
    return true;
  }
}

function buildProviderEntry(
  protocol: ByokChatProviderConfig['protocol'],
  baseUrl: string,
  apiVersion: string | undefined,
  includeApiKey: boolean,
): { npm: ProviderPackage; options: Record<string, unknown> } {
  const apiKeyOption = includeApiKey
    ? { apiKey: `{env:${BYOK_OPENCODE_API_KEY_ENV}}` }
    : {};
  const usesAzureOpenAICompatiblePath =
    protocol === 'azure' && /\/openai\/v\d+(?:$|\/)/.test(safeUrlPathname(baseUrl));
  switch (protocol) {
    case 'anthropic':
      return {
        npm: '@ai-sdk/anthropic',
        options: {
          ...apiKeyOption,
          ...(baseUrl ? { baseURL: baseUrl } : {}),
        },
      };
    case 'azure':
      return {
        npm: '@ai-sdk/azure',
        options: {
          ...apiKeyOption,
          ...(baseUrl ? { baseURL: baseUrl } : {}),
          ...(usesAzureOpenAICompatiblePath
            ? {}
            : { useDeploymentBasedUrls: true }),
          ...apiVersionOption(apiVersion, usesAzureOpenAICompatiblePath),
        },
      };
    case 'google':
      return {
        npm: '@ai-sdk/google',
        options: {
          ...apiKeyOption,
          ...(baseUrl ? { baseURL: baseUrl } : {}),
        },
      };
    case 'ollama':
      return {
        npm: '@ai-sdk/openai-compatible',
        options: {
          baseURL: baseUrl,
          ...apiKeyOption,
        },
      };
    case 'openai':
      // Real OpenAI speaks the Responses API via @ai-sdk/openai. Every other
      // host under the "openai" protocol (DeepSeek, vLLM, etc.) only serves
      // /chat/completions, so route it through @ai-sdk/openai-compatible.
      if (isRealOpenAIHost(baseUrl)) {
        return {
          npm: '@ai-sdk/openai',
          options: {
            ...apiKeyOption,
            ...(baseUrl ? { baseURL: baseUrl } : {}),
          },
        };
      }
      return {
        npm: '@ai-sdk/openai-compatible',
        options: {
          baseURL: baseUrl,
          ...apiKeyOption,
        },
      };
    case 'senseaudio':
    case 'aihubmix':
      return {
        npm: '@ai-sdk/openai-compatible',
        options: {
          baseURL: baseUrl,
          ...apiKeyOption,
        },
      };
  }
}

function safeUrlPathname(value: string): string {
  try {
    return new URL(value).pathname.replace(/\/+$/, '');
  } catch {
    return '';
  }
}

function hasVersionedApiPath(value: string): boolean {
  return /\/v\d+(?:\/|$)/.test(safeUrlPathname(value));
}

function appendVersionedApiPath(value: string): string {
  try {
    const url = new URL(value);
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/v1`;
    return url.toString();
  } catch {
    return `${value}/v1`;
  }
}

function apiVersionOption(
  apiVersion: string | undefined,
  omitWhenBlank: boolean,
): Record<string, string> {
  const trimmed = apiVersion?.trim() ?? '';
  if (trimmed) return { apiVersion: trimmed };
  return omitWhenBlank ? {} : { apiVersion: '2024-10-21' };
}
