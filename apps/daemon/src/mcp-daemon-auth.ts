// Bearer-token propagation for `od mcp` talking to a remote daemon (#9019).
//
// A daemon started with OD_API_TOKEN answers 401 to every non-loopback /api
// request that does not carry `Authorization: Bearer <token>`. `od mcp` runs
// on the MCP client's machine, so against a daemon on another host every tool
// call arrives from a non-loopback peer and needs that header.
//
// The token is bound to ONE origin: the daemon URL `od mcp` was started with.
// It is attached only to requests for that origin, so a rediscovered local
// daemon on another port, or any future non-daemon URL, never receives it.
// The token value is never included in any error, result, or log line.

import { readFileSync } from 'node:fs';

interface McpDaemonAuth {
  token: string;
  origin: string;
}

let configured: McpDaemonAuth | null = null;

function originOf(url: string | URL): string | null {
  try {
    return new URL(String(url)).origin;
  } catch {
    return null;
  }
}

/**
 * Bind the daemon API token for this `od mcp` process. A null, empty, or
 * whitespace-only token disables propagation, which keeps the local desktop
 * flow (loopback, no token) exactly as it was.
 */
export function configureMcpDaemonAuth(input: {
  token: string | null | undefined;
  daemonUrl: string | URL;
}): void {
  const token = String(input.token ?? '').trim();
  const origin = originOf(input.daemonUrl);
  configured = token && origin ? { token, origin } : null;
}

export function _resetMcpDaemonAuthForTests(): void {
  configured = null;
}

/** The Authorization header for `url`, or an empty record when none applies. */
export function mcpDaemonAuthHeaders(url: string): Record<string, string> {
  if (!configured) return {};
  return originOf(url) === configured.origin
    ? { Authorization: `Bearer ${configured.token}` }
    : {};
}

/**
 * `fetch` for daemon requests made by `od mcp`. Without a configured token it
 * forwards the call unchanged, so existing callers see the exact same request.
 * With one, it adds the bearer header for the bound origin unless the caller
 * already set an Authorization header.
 */
export function mcpDaemonFetch(url: string, init?: RequestInit): Promise<Response> {
  const auth = mcpDaemonAuthHeaders(url);
  if (!auth.Authorization) return fetch(url, init);
  const headers = new Headers(init?.headers);
  if (!headers.has('authorization')) headers.set('authorization', auth.Authorization);
  return fetch(url, { ...init, headers });
}

/**
 * Resolve the token `od mcp` should present. `--api-token-file` wins over the
 * OD_API_TOKEN environment variable so the secret can stay out of the MCP
 * client's config and the process list. Errors name the file and the reason,
 * never the file's contents.
 */
export function resolveMcpApiToken(input: {
  tokenFile?: string | null;
  env?: NodeJS.ProcessEnv;
  readFile?: (path: string) => string;
}): string | null {
  const tokenFile = String(input.tokenFile ?? '').trim();
  if (tokenFile) {
    const readFile = input.readFile ?? ((path: string) => readFileSync(path, 'utf8'));
    let contents: string;
    try {
      contents = readFile(tokenFile);
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'read failed';
      throw new Error(`cannot read --api-token-file ${tokenFile} (${code})`);
    }
    const token = contents.trim();
    if (!token) throw new Error(`--api-token-file ${tokenFile} is empty`);
    return token;
  }
  const fromEnv = String((input.env ?? process.env).OD_API_TOKEN ?? '').trim();
  return fromEnv || null;
}
