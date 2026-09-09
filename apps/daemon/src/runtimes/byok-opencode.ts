import type { ByokChatProviderConfig } from '@open-design/contracts';
import { resolveBedrockRegion } from '@open-design/contracts';

export const BYOK_OPENCODE_AGENT_ID = 'byok-opencode';
export const BYOK_OPENCODE_PROVIDER_ID = 'open-design-byok';
export const BYOK_OPENCODE_API_KEY_ENV = 'OPEN_DESIGN_BYOK_API_KEY';
// Bedrock runs under OpenCode's own `amazon-bedrock` provider id rather than
// the generic `open-design-byok` entry: OpenCode keys its Bedrock loader
// (AWS credential chain, named profile, bearer token, region-aware
// cross-region model prefixing) on that exact id, and a custom id would only
// get the bare `@ai-sdk/amazon-bedrock` factory, which reads static access
// keys from the environment and knows nothing about SSO profiles.
export const BYOK_OPENCODE_BEDROCK_PROVIDER_ID = 'amazon-bedrock';
// Read by OpenCode's Bedrock loader; takes precedence over the credential
// chain, so it must only be set in API-key mode.
export const BYOK_OPENCODE_BEDROCK_BEARER_TOKEN_ENV = 'AWS_BEARER_TOKEN_BEDROCK';
export const BYOK_OPENCODE_PROVIDER_REQUIRED_MESSAGE =
  'BYOK OpenCode requires a complete provider configuration for this run.';
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
  bedrock: 'https://bedrock-runtime.us-east-1.amazonaws.com',
};

type ProviderPackage =
  | '@ai-sdk/anthropic'
  | '@ai-sdk/openai'
  | '@ai-sdk/openai-compatible'
  | '@ai-sdk/azure'
  | '@ai-sdk/google'
  | '@ai-sdk/amazon-bedrock';

export interface OpenCodeByokProviderConfig {
  providerId: string;
  modelId: string;
  env: Record<string, string>;
  config: Record<string, unknown>;
}

const OPENCODE_BYOK_PROVIDER_IDS = [
  BYOK_OPENCODE_PROVIDER_ID,
  BYOK_OPENCODE_BEDROCK_PROVIDER_ID,
];

export function opencodeByokProviderId(
  protocol: ByokChatProviderConfig['protocol'] | null | undefined,
): string {
  return protocol === 'bedrock'
    ? BYOK_OPENCODE_BEDROCK_PROVIDER_ID
    : BYOK_OPENCODE_PROVIDER_ID;
}

export function opencodeByokModelId(
  model: string | null | undefined,
  protocol: ByokChatProviderConfig['protocol'] | null | undefined = null,
): string | null {
  const trimmed = typeof model === 'string' ? model.trim() : '';
  if (!trimmed || trimmed.toLowerCase() === 'default') return null;
  if (OPENCODE_BYOK_PROVIDER_IDS.some((id) => trimmed.startsWith(`${id}/`))) return trimmed;
  return `${opencodeByokProviderId(protocol)}/${trimmed}`;
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

  if (protocol === 'bedrock') {
    return buildBedrockProviderConfig(provider, rawModel, baseUrl, apiKey);
  }

  const modelId = opencodeByokModelId(rawModel, protocol);
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
        name: 'OpenDesign BYOK',
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

function bedrockProfile(provider: ByokChatProviderConfig): string {
  return typeof provider.awsProfile === 'string' ? provider.awsProfile.trim() : '';
}

// OpenCode's `amazon-bedrock` loader reads `options.region`, `options.profile`
// and `options.endpoint`, resolves credentials through the AWS credential
// chain for the named profile, and reads `AWS_BEARER_TOKEN_BEDROCK` from the
// process environment for the API-key mode (the bearer token wins over the
// chain, so it is only exported in that mode). The regional endpoint is only
// forwarded as `endpoint` when it differs from the default for the region,
// which keeps the run on OpenCode's own endpoint selection unless the user
// pointed at a VPC endpoint or another custom host.
function buildBedrockProviderConfig(
  provider: ByokChatProviderConfig,
  rawModel: string,
  baseUrl: string,
  apiKey: string,
): OpenCodeByokProviderConfig | null {
  const profile = bedrockProfile(provider);
  if (!profile && !apiKey) return null;
  const region = resolveBedrockRegion(baseUrl);
  const defaultEndpoint = `https://bedrock-runtime.${region}.amazonaws.com`;
  const modelId = opencodeByokModelId(rawModel, 'bedrock');
  if (!modelId) return null;
  return {
    providerId: BYOK_OPENCODE_BEDROCK_PROVIDER_ID,
    modelId,
    env: {
      AWS_REGION: region,
      ...(profile ? {} : { [BYOK_OPENCODE_BEDROCK_BEARER_TOKEN_ENV]: apiKey }),
    },
    config: {
      provider: {
        [BYOK_OPENCODE_BEDROCK_PROVIDER_ID]: {
          name: 'Amazon Bedrock',
          npm: '@ai-sdk/amazon-bedrock' satisfies ProviderPackage,
          options: {
            region,
            ...(profile ? { profile } : {}),
            ...(baseUrl !== defaultEndpoint ? { endpoint: baseUrl } : {}),
          },
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
    },
  };
}

function requiresApiKey(
  provider: ByokChatProviderConfig,
  baseUrl: string,
): boolean {
  const protocol = provider.protocol;
  if (provider.requiresApiKey === false) return false;
  if (protocol === 'bedrock') return !bedrockProfile(provider);
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
    case 'bedrock':
      // Bedrock never reaches the generic entry: it is built by
      // `buildBedrockProviderConfig` under OpenCode's own provider id.
      throw new Error('bedrock provider entries are built by buildBedrockProviderConfig');
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
