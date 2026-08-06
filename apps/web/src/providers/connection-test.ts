// Thin POST-and-decode wrappers around the daemon's /api/test/connection route.
// The daemon always answers with HTTP 200 and a `ConnectionTestResponse`
// body even on upstream-caused failures, so the only paths that throw here
// are network-level errors and abort signals.

import type {
  AgentTestRequest,
  ConnectionTestRequest,
  ConnectionTestResponse,
  ProviderTestRequest,
} from '../types';

/**
 * Returns the daemon's OD_API_TOKEN as injected by the daemon into the served
 * HTML (`window.__OD_API_TOKEN`). When the daemon runs with a non-loopback
 * bind (Docker / hosted deployments) it enforces `Authorization: Bearer <token>`
 * on every `/api/*` call. When no token is configured (loopback desktop dev)
 * the injection script is omitted and this returns undefined.
 */
function getDaemonApiToken(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const token = (window as { __OD_API_TOKEN?: unknown }).__OD_API_TOKEN;
  return typeof token === 'string' && token.length > 0 ? token : undefined;
}

function requestModel(body: ConnectionTestRequest): string | undefined {
  const model = (body as { model?: unknown }).model;
  if (typeof model === 'string' && model.trim()) return model.trim();
  return body.mode === 'agent' ? 'default' : undefined;
}

async function postTest(
  body: ConnectionTestRequest,
  signal?: AbortSignal,
): Promise<ConnectionTestResponse> {
  const start = Date.now();
  try {
    const response = await fetch('/api/test/connection', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(getDaemonApiToken() ? { authorization: `Bearer ${getDaemonApiToken()}` } : {}),
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
        // body was not JSON — keep detail undefined.
      }
      return {
        ok: false,
        kind: 'unknown',
        latencyMs: Date.now() - start,
        model: requestModel(body),
        detail: detail ?? `Daemon responded with ${response.status}`,
      };
    }
    return (await response.json()) as ConnectionTestResponse;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err;
    }
    return {
      ok: false,
      kind: 'unknown',
      latencyMs: Date.now() - start,
      model: requestModel(body),
      detail: err instanceof Error ? err.message : 'Network request failed',
    };
  }
}

export function testApiProvider(
  input: ProviderTestRequest,
  signal?: AbortSignal,
): Promise<ConnectionTestResponse> {
  return postTest({ mode: 'provider', ...input }, signal);
}

export function testAgent(
  input: AgentTestRequest,
  signal?: AbortSignal,
): Promise<ConnectionTestResponse> {
  return postTest({ mode: 'agent', ...input }, signal);
}
