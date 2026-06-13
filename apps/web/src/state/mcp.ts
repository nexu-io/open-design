// Web client for the daemon's external-MCP endpoints.
//
// `GET /api/mcp/servers` returns both the user's saved entries AND the
// built-in template list, so the Settings panel hydrates with one round-trip.
// `PUT /api/mcp/servers` replaces the whole list — same pattern the media
// providers PUT uses (the daemon takes the full set rather than merging).

import type {
  McpOAuthStatusResponse,
  McpServerConfig,
  McpServersResponse,
  McpTemplate,
  StartMcpOAuthResponse,
} from '@open-design/contracts';

export type {
  McpOAuthStatusResponse,
  McpServerConfig,
  McpTemplate,
  StartMcpOAuthResponse,
};

export async function fetchMcpServers(): Promise<McpServersResponse | null> {
  try {
    const res = await fetch('/api/mcp/servers');
    if (!res.ok) return null;
    const data = (await res.json()) as McpServersResponse;
    return {
      servers: Array.isArray(data?.servers) ? data.servers : [],
      templates: Array.isArray(data?.templates) ? data.templates : [],
    };
  } catch {
    return null;
  }
}

export async function saveMcpServers(
  servers: McpServerConfig[],
): Promise<McpServersResponse | null> {
  try {
    const res = await fetch('/api/mcp/servers', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ servers }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as McpServersResponse;
    return {
      servers: Array.isArray(data?.servers) ? data.servers : [],
      templates: Array.isArray(data?.templates) ? data.templates : [],
    };
  } catch {
    return null;
  }
}

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
  } catch (err) {
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

/** Generate a unique stable id from a label (lowercase, slug). Falls back to
 * a short random suffix so duplicates of the same template still land at
 * distinct ids. */
export function suggestMcpServerId(
  label: string,
  taken: ReadonlySet<string>,
): string {
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'mcp-server';
  if (!taken.has(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const next = `${base}-${i}`;
    if (!taken.has(next)) return next;
  }
  return `${base}-${Math.random().toString(36).slice(2, 6)}`;
}
