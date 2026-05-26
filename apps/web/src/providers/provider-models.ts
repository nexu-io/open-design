import type {
  ProviderModelsRequest,
  ProviderModelsResponse,
} from '../types';

async function postProviderModels(
  body: ProviderModelsRequest,
  signal?: AbortSignal,
): Promise<ProviderModelsResponse> {
  const start = Date.now();
  try {
    const response = await fetch('/api/provider/models', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
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
