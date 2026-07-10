// Web client for the daemon's external-MCP server list.
//
// `GET /api/mcp/servers` returns both the user's saved entries AND the
// built-in template list, so the Settings panel hydrates with one round-trip.
// `PUT /api/mcp/servers` replaces the whole list — same pattern the media
// providers PUT uses (the daemon takes the full set rather than merging).
import type { McpServerConfig, McpServersResponse } from '@open-design/contracts';

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
