import type { ByokChatProviderConfig } from '@open-design/contracts';

export const BYOK_OPENCODE_AGENT_ID = 'byok-opencode';
export const BYOK_OPENCODE_PROVIDER_ID = 'open-design-byok';
export const BYOK_OPENCODE_API_KEY_ENV = 'OPEN_DESIGN_BYOK_API_KEY';
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

export function buildOpenCodeByokProviderConfig(
  provider: ByokChatProviderConfig | null | undefined,
  model: string | null | undefined,
): OpenCodeByokProviderConfig | null {
  if (!provider || typeof provider !== 'object') return null;
  const protocol = provider.protocol;
  if (!Object.prototype.hasOwnProperty.call(DEFAULT_BASE_URL_BY_PROTOCOL, protocol)) {
    return null;
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
  if (needsApiKey && !apiKey) return null;
  if (!rawModel || rawModel.toLowerCase() === 'default') return null;
  if (!baseUrl) return null;

  const modelId = opencodeByokModelId(rawModel);
  if (!modelId) return null;

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
    providerId: BYOK_OPENCODE_PROVIDER_ID,
    modelId,
    env: needsApiKey ? { [BYOK_OPENCODE_API_KEY_ENV]: apiKey } : {},
    config,
  };
}

function normalizeProviderBaseUrl(
  protocol: ByokChatProviderConfig['protocol'],
  baseUrl: string,
): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (!trimmed) return trimmed;
  if (protocol === 'anthropic' && isExactOrigin(trimmed, 'https://api.anthropic.com')) {
    return 'https://api.anthropic.com/v1';
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

function apiVersionOption(
  apiVersion: string | undefined,
  omitWhenBlank: boolean,
): Record<string, string> {
  const trimmed = apiVersion?.trim() ?? '';
  if (trimmed) return { apiVersion: trimmed };
  return omitWhenBlank ? {} : { apiVersion: '2024-10-21' };
}
