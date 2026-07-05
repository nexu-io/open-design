import type { KnownProvider } from '../state/config';
import type { ApiProtocol } from '../types';

export function isLocalOllamaBaseUrl(baseUrl: string): boolean {
  try {
    const parsed = new URL(baseUrl);
    const hostname = parsed.hostname.toLowerCase();
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  } catch {
    return false;
  }
}

export function byokProviderRequiresApiKey(
  protocol: ApiProtocol,
  provider: KnownProvider | undefined,
  baseUrl: string,
): boolean {
  if (provider?.requiresApiKey === false) return false;
  if (protocol === 'ollama' && isLocalOllamaBaseUrl(baseUrl)) return false;
  return true;
}
