import type {
  ProviderModelsRequest,
  ProviderModelsResponse,
} from '../types';

/**
 * Returns the daemon's OD_API_TOKEN as injected by the daemon into the served
 * HTML (`window.__OD_API_TOKEN`). When the daemon runs with a non-loopback
 * bind (Docker / hosted deployments) it enforces `Authorization: Bearer <token>`
 * on every `/api/*` call; the static SPA must echo that token or the request
 * is rejected with a 401. When no token is configured (loopback desktop dev)
 * the injection script is omitted and this returns undefined, so callers keep
 * their current token-less behaviour.
 */
function getDaemonApiToken(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const token = (window as { __OD_API_TOKEN?: unknown }).__OD_API_TOKEN;
  return typeof token === 'string' && token.length > 0 ? token : undefined;
}

async function postProviderModels(
  body: ProviderModelsRequest,
  signal?: AbortSignal,
): Promise<ProviderModelsResponse> {
  const start = Date.now();
  try {
    const apiToken = getDaemonApiToken();
    const response = await fetch('/api/provider/models', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(apiToken ? { authorization: `Bearer ${apiToken}` } : {}),
      },
      body: JSON.stringify(body),
      signal,
    });
    if (!response.ok) {
      let detail: string | undefined;
      try {
        const payload = (await response.json()) as
          | { error?: { message?: string }; message?: string }
          | null;
        detail = payload?.error?.message ?? payload?.message;
      } catch {
        // body was not JSON; keep detail undefined.
      }
      return {
        ok: false,
        kind: 'unknown',
        latencyMs: Date.now() - start,
        detail: detail ?? `Daemon responded with ${response.status}`,
        status: response.status,
      };
    }
    return (await response.json()) as ProviderModelsResponse;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err;
    }
    return {
      ok: false,
      kind: 'unknown',
      latencyMs: Date.now() - start,
      detail: err instanceof Error ? err.message : 'Network request failed',
    };
  }
}

export function fetchProviderModels(
  input: ProviderModelsRequest,
  signal?: AbortSignal,
): Promise<ProviderModelsResponse> {
  return postProviderModels(input, signal);
}