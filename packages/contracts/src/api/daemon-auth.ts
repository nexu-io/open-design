// Daemon authentication and network configuration contracts.
//
// These types are the wire shapes for the daemon's own key management and
// network config endpoints. They are distinct from the external MCP server
// config (mcp.ts) which governs upstream MCP clients that the daemon proxies.

// ── /api/auth/keys ────────────────────────────────────────────────────────────

export interface AuthKey {
  id: string;
  label: string;
  createdAt: number;
}

/** Response from GET /api/auth/keys */
export interface ListAuthKeysResponse {
  keys: AuthKey[];
}

/** Body for POST /api/auth/keys */
export interface CreateAuthKeyRequest {
  label?: string;
}

/** Response from POST /api/auth/keys */
export interface CreateAuthKeyResponse {
  id: string;
  key: string;
  label: string;
  createdAt: number;
}

// ── /api/mcp-keys ─────────────────────────────────────────────────────────────

export interface McpKeyEntry {
  id: string;
  keyPrefix: string;
  label: string;
  createdAt: number;
}

/** Response from GET /api/mcp-keys */
export interface ListMcpKeysResponse {
  keys: McpKeyEntry[];
  shellEnvFile?: string;
}

/** Body for POST /api/mcp-keys */
export interface CreateMcpKeyRequest {
  label?: string;
}

/** Response from POST /api/mcp-keys */
export interface CreateMcpKeyResponse {
  id: string;
  key: string;
  label: string;
  createdAt: number;
  shellEnvFile?: string;
}

/** Response from GET /api/mcp-keys/:id/reveal */
export interface RevealMcpKeyResponse {
  key: string;
}

// ── /api/network-config ───────────────────────────────────────────────────────

/** Response from GET /api/network-config and body for PUT /api/network-config */
export interface NetworkConfig {
  bindHost: string;
  port: number;
  allowedHosts: string[];
}

// ── /api/restart ─────────────────────────────────────────────────────────────

/** Response from POST /api/restart (empty body — daemon exits immediately) */
export type RestartResponse = Record<string, never>;
