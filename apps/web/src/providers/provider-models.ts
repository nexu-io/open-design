import type {
  ProviderModelsRequest,
  ProviderModelsResponse,
  ProviderModelOption,
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

/**
 * OrcaRouter's catalogue is read with the credential the DAEMON already holds,
 * so the browser never has to carry the key for discovery.
 *
 * The generic path above sends the browser's own key to the daemon, which is
 * the right shape for a BYOK field the user just typed into. OrcaRouter is
 * different: the key may have arrived through the PKCE connect flow and may
 * live only in the daemon's credential store, so discovery has to resolve it
 * server-side. Same response shape either way.
 */
async function postOrcaRouterModels(
  input: ProviderModelsRequest,
  signal?: AbortSignal,
): Promise<ProviderModelsResponse> {
  const start = Date.now();
  try {
    const response = await fetch('/api/orcarouter/models', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ capability: 'chat' }),
      signal,
    });
    if (!response.ok) {
      return {
        ok: false,
        kind: 'unknown',
        latencyMs: Date.now() - start,
        status: response.status,
        detail: `Daemon responded with ${response.status}`,
      };
    }
    const payload = (await response.json()) as {
      ok?: boolean;
      models?: ProviderModelOption[];
      reason?: string;
      degraded?: boolean;
      status?: number;
    };
    if (!payload?.ok) {
      // A revoked credential is a terminal state the UI must surface, so the
      // status is carried through rather than flattened into a generic failure.
      return {
        ok: false,
        kind: payload?.status === 401 ? 'auth_failed' : 'unknown',
        latencyMs: Date.now() - start,
        ...(payload?.status !== undefined && payload.status !== null
          ? { status: payload.status }
          : {}),
        detail: payload?.reason ?? 'OrcaRouter catalogue unavailable',
      };
    }
    return {
      ok: true,
      kind: 'success',
      latencyMs: Date.now() - start,
      models: payload.models ?? [],
    };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
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
  if (input.protocol === 'orcarouter') {
    return postOrcaRouterModels(input, signal);
  }
  return postProviderModels(input, signal);
}
