// External MCP (Model Context Protocol) server configuration.
//
// Open Design acts as an MCP CLIENT here: the user configures one or more
// external MCP servers (stdio, SSE, or streamable HTTP), and the daemon
// surfaces those servers to the underlying agent (Claude Code, ACP agents,
// etc.) at spawn time so the agent can call their tools.
//
// This file is the wire-level shape between the web UI and the daemon. The
// daemon persists the same shape to <dataDir>/mcp-config.json and rewrites
// per-spawn config files (e.g. project-cwd `.mcp.json` for Claude Code).

export type McpTransport = 'stdio' | 'sse' | 'http';

export interface McpServerConfig {
  /** Stable slug (lowercase, alphanumeric + dash/underscore). Doubles as the
   * MCP server name passed to agents. */
  id: string;
  /** Optional human label shown in the UI. Falls back to `id`. */
  label?: string;
  /** Optional template id this entry was instantiated from. Lets the UI
   * render the template's logo/help text without re-deriving from the URL. */
  templateId?: string;
  /** Transport selector. `http` is "streamable HTTP" per MCP spec; `sse` is
   * the older Server-Sent-Events variant some servers (Higgsfield) still
   * publish. Both flow through the same upstream URL field. */
  transport: McpTransport;
  /** Master enable switch. Disabled entries are persisted but skipped at
   * spawn so users can keep credentials around without them being wired into
   * every run. */
  enabled: boolean;

  // ── stdio ──
  command?: string;
  args?: string[];
  env?: Record<string, string>;

  // ── sse / http ──
  url?: string;
  headers?: Record<string, string>;
}

export interface McpConfig {
  servers: McpServerConfig[];
}

/** An optional environment variable / header field a template needs the user
 * to supply before the server can start. The UI renders these as inputs. */
export interface McpTemplateField {
  key: string;
  label?: string;
  required?: boolean;
  placeholder?: string;
  /** Render the value with a password-style input (api keys, tokens). */
  secret?: boolean;
}

/** Coarse-grained category used to group templates in the picker UI so the
 * 30+ built-in entries stay scannable. Stable string union — adding a new
 * category requires a matching entry in `CATEGORY_ORDER` on the web side
 * so the group has a label / display order. */
export type McpTemplateCategory =
  | 'image-generation'
  | 'image-editing'
  | 'web-capture'
  | 'design-systems'
  | 'ui-components'
  | 'data-viz'
  | 'publishing'
  | 'utilities';

/** A built-in MCP server preset surfaced in the Settings UI's "Add MCP
 * server" picker. Selecting one fills in the form with defaults; the
 * resulting `McpServerConfig` is saved like any custom entry. */
export interface McpTemplate {
  id: string;
  label: string;
  description: string;
  transport: McpTransport;
  /** Picker grouping. Required so the UI can always find a home for the
   * template — fall back to `utilities` for true grab-bag entries. */
  category: McpTemplateCategory;
  /** Marketing-grade homepage / docs URL. Optional. */
  homepage?: string;
  /** A one-liner the user can paste into the chat composer to try this MCP
   * server end-to-end. Surfaced in the Settings UI both inside the picker
   * and inline on each saved row, so the user always has at least one
   * concrete idea of what tools this server unlocks. Optional. */
  example?: string;

  // stdio template defaults
  command?: string;
  args?: string[];
  envFields?: McpTemplateField[];

  // sse / http template defaults
  url?: string;
  headerFields?: McpTemplateField[];
}

export interface McpServersResponse {
  servers: McpServerConfig[];
  templates: McpTemplate[];
}

export interface UpdateMcpServersRequest {
  servers: McpServerConfig[];
}

// ─────────────────────────────────────────────────────────────────────
// Daemon-owned OAuth flow for HTTP / SSE MCP servers.
//
// The daemon hosts the OAuth client end-to-end so cloud deployments work
// without a transient `localhost:<port>` listener and so the issued token
// survives across agent turns. Tokens are persisted server-side and are
// injected as `Authorization: Bearer …` headers into the per-spawn
// `.mcp.json` the daemon writes for Claude Code.
// ─────────────────────────────────────────────────────────────────────

/** Body for `POST /api/mcp/oauth/start`. */
export interface StartMcpOAuthRequest {
  /** id of an already-saved McpServerConfig (transport must be http or sse). */
  serverId: string;
}

/** Response from `POST /api/mcp/oauth/start`. The web UI should
 * `window.open(authorizeUrl, '_blank', 'noopener,noreferrer=no')` so the
 * provider's auth page opens in a new tab; the callback HTML then
 * `postMessage`s the result back to the opener. */
export interface StartMcpOAuthResponse {
  authorizeUrl: string;
  /** Echoed back so the UI can correlate with the postMessage payload. */
  state: string;
  /** The exact `redirect_uri` the daemon registered with the provider —
   * useful for diagnosing redirect-mismatch errors. */
  redirectUri: string;
}

/** Response from `GET /api/mcp/oauth/status?serverId=…`. */
export interface McpOAuthStatusResponse {
  connected: boolean;
  /** Epoch ms when the access token expires. `null` when the provider
   * issued a non-expiring token. Absent when not connected. */
  expiresAt?: number | null;
  /** Space-separated scopes the issued token is good for. */
  scope?: string | null;
  /** Epoch ms when the token was first persisted. */
  savedAt?: number;
}

/** Body for `POST /api/mcp/oauth/disconnect`. */
export interface DisconnectMcpOAuthRequest {
  serverId: string;
}

/** Shape of the `postMessage` payload the OAuth callback page emits to
 * its opener (and broadcasts on the `open-design-mcp-oauth` channel). */
export type McpOAuthPostMessage =
  | { type: 'mcp-oauth'; ok: true; serverId: string | null }
  | { type: 'mcp-oauth'; ok: false; message: string | null };
