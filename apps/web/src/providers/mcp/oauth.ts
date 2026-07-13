// Web client for the daemon-owned OAuth flow of HTTP / SSE MCP servers.
//
// The daemon hosts the OAuth client end-to-end; these adapters just kick off
// the dance, poll status, and disconnect. The browser-side subscriptions the
// flow needs (popup-callback message + status poll + opening the authorize
// tab) live in `oauth-bridge.ts` so the slice stays DOM-free.
import type {
  McpOAuthStatusResponse,
  StartMcpOAuthResponse,
} from '@open-design/contracts';

/**
 * Result of `startMcpOAuth`. Either a usable response, or a structured
 * error containing the real HTTP status / body we got back so the UI can
 * surface a useful message instead of a generic "could not connect".
 */
export type StartMcpOAuthResult =
  | { ok: true; response: StartMcpOAuthResponse }
  | { ok: false; status: number | null; message: string };

/**
 * Kick off the daemon-owned OAuth dance for a saved HTTP/SSE server.
 *
 * Returns a structured result so the UI can show why the daemon refused
 * (most useful when the daemon is older than the web client and the
 * `/api/mcp/oauth/start` route 404s, or when the upstream provider's
 * discovery / DCR endpoint failed).
 */
export async function startMcpOAuth(
  serverId: string,
): Promise<StartMcpOAuthResult> {
  let res: Response;
  try {
    res = await fetch('/api/mcp/oauth/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ serverId }),
    });
  } catch (err) {
    return {
      ok: false,
      status: null,
      message:
        err instanceof Error
          ? `Network error: ${err.message}`
          : 'Network error reaching the daemon.',
    };
  }
  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.text();
      // Try to pull a typed error message out of `{ error: '...' }` payloads.
      try {
        const parsed = JSON.parse(body);
        if (parsed && typeof parsed.error === 'string') detail = parsed.error;
      } catch {
        detail = body.slice(0, 240);
      }
    } catch {
      // ignore
    }
    if (res.status === 404) {
      return {
        ok: false,
        status: 404,
        message:
          'Daemon does not know about /api/mcp/oauth/start (it may be running an older build). Restart the daemon (`pnpm tools-dev restart` or equivalent) and try again.',
      };
    }
    return {
      ok: false,
      status: res.status,
      message:
        detail ||
        `Daemon returned HTTP ${res.status} ${res.statusText}. Check the daemon log for details.`,
    };
  }
  try {
    const response = (await res.json()) as StartMcpOAuthResponse;
    return { ok: true, response };
  } catch {
    return {
      ok: false,
      status: res.status,
      message: 'Daemon returned a 200 with an unparseable body.',
    };
  }
}

export async function fetchMcpOAuthStatus(
  serverId: string,
): Promise<McpOAuthStatusResponse | null> {
  try {
    const url = `/api/mcp/oauth/status?serverId=${encodeURIComponent(serverId)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as McpOAuthStatusResponse;
  } catch {
    return null;
  }
}

export async function disconnectMcpOAuth(serverId: string): Promise<boolean> {
  try {
    const res = await fetch('/api/mcp/oauth/disconnect', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ serverId }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
