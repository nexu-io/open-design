import type { ByokChatProviderConfig } from '@open-design/contracts';

export interface ByokCliOptions {
  protocol?: string;
  baseUrl?: string;
  apiVersion?: string;
  keyEnv?: string;
  keyless?: boolean;
}

export function byokProviderFromCliOptions(
  options: ByokCliOptions,
  env: NodeJS.ProcessEnv,
): ByokChatProviderConfig | undefined {
  if (
    options.protocol === undefined
    && options.baseUrl === undefined
    && options.apiVersion === undefined
    && options.keyEnv === undefined
    && !options.keyless
  ) return undefined;

  const protocol = options.protocol;
  switch (protocol) {
    case 'anthropic':
    case 'openai':
    case 'azure':
    case 'google':
    case 'ollama':
    case 'senseaudio':
    case 'aihubmix':
      break;
    default:
      throw new Error('--byok-protocol must be anthropic, openai, azure, google, ollama, senseaudio or aihubmix');
  }

  const apiKey = options.keyEnv === undefined ? '' : (env[options.keyEnv] ?? '').trim();
  if (options.keyEnv !== undefined && !apiKey) {
    throw new Error('--byok-key-env must name a non-empty environment variable containing the API key');
  }

  return {
    protocol,
    apiKey,
    ...(options.baseUrl !== undefined ? { baseUrl: options.baseUrl } : {}),
    ...(options.apiVersion !== undefined ? { apiVersion: options.apiVersion } : {}),
    ...(options.keyless ? { requiresApiKey: false } : {}),
  };
}
