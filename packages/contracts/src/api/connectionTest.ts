// Result categories surfaced by the connection-test endpoint. The web UI
// translates each kind into user-facing copy; the daemon picks one per test
// and returns it inside a JSON envelope (always HTTP 200 — see notes in the
// daemon module for why).
import type { AgentCliEnvPrefs } from './app-config';

export interface BaseUrlValidationResult {
  parsed?: ParsedBaseUrl;
  error?: string;
  forbidden?: boolean;
}

export interface ParsedBaseUrl {
  protocol: string;
  hostname: string;
  toString(): string;
}

declare const URL: {
  new(input: string): ParsedBaseUrl;
};

function normalizeBracketedIpv6(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1).toLowerCase()
    : hostname.toLowerCase();
}

function parseIpv4(hostname: string): [number, number, number, number] | null {
  const parts = hostname.split('.');
  if (parts.length !== 4) return null;
  const parsed = parts.map((part) => {
    if (!/^\d{1,3}$/.test(part)) return null;
    const value = Number(part);
    return value >= 0 && value <= 255 ? value : null;
  });
  if (parsed.some((part) => part === null)) return null;
  return parsed as [number, number, number, number];
}

function isLoopbackIpv4(hostname: string): boolean {
  const parts = parseIpv4(hostname);
  return Boolean(parts && parts[0] === 127);
}

function isBlockedIpv4(hostname: string): boolean {
  const parts = parseIpv4(hostname);
  if (!parts) return false;
  const [a, b] = parts;
  return (
    a === 0 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    a === 10 ||
    (a === 192 && b === 168) ||
    (a === 172 && b >= 16 && b <= 31) ||
    a >= 224
  );
}

function ipv4MappedToDotted(hostname: string): string | null {
  const host = normalizeBracketedIpv6(hostname);
  const mapped = /^::ffff:(.+)$/i.exec(host)?.[1];
  if (!mapped) return null;
  if (parseIpv4(mapped.toLowerCase())) return mapped.toLowerCase();
  const hexParts = mapped.split(':');
  if (
    hexParts.length !== 2 ||
    !hexParts.every((part) => /^[0-9a-f]{1,4}$/i.test(part))
  ) {
    return null;
  }
  const hi = hexParts[0];
  const lo = hexParts[1];
  if (!hi || !lo) return null;
  const value =
    (Number.parseInt(hi, 16) << 16) |
    Number.parseInt(lo, 16);
  return [
    (value >>> 24) & 255,
    (value >>> 16) & 255,
    (value >>> 8) & 255,
    value & 255,
  ].join('.');
}

export function isLoopbackApiHost(hostname: string): boolean {
  const host = normalizeBracketedIpv6(hostname);
  if (host === 'localhost' || host === '::1') return true;
  if (isLoopbackIpv4(host)) return true;
  const mapped = ipv4MappedToDotted(host);
  return Boolean(mapped && isLoopbackIpv4(mapped));
}

export function isBlockedExternalApiHostname(hostname: string): boolean {
  const host = normalizeBracketedIpv6(hostname);
  if (host === '::') return true;
  if (isBlockedIpv4(host)) return true;
  if (/^f[cd][0-9a-f]{2}:/i.test(host)) return true;
  if (/^fe[89ab][0-9a-f]:/i.test(host)) return true;
  const mapped = ipv4MappedToDotted(host);
  return Boolean(mapped && isBlockedIpv4(mapped));
}

export function validateBaseUrl(baseUrl: string): BaseUrlValidationResult {
  let parsed: ParsedBaseUrl;
  try {
    parsed = new URL(String(baseUrl).replace(/\/+$/, ''));
  } catch {
    return { error: 'Invalid baseUrl' };
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { error: 'Only http/https allowed' };
  }
  const hostname = parsed.hostname.toLowerCase();
  if (!isLoopbackApiHost(hostname) && isBlockedExternalApiHostname(hostname)) {
    return { error: 'Internal IPs blocked', forbidden: true };
  }
  return { parsed };
}

export type ConnectionTestKind =
  | 'success'
  | 'auth_failed'
  | 'forbidden'
  | 'not_found_model'
  | 'invalid_model_id'
  | 'invalid_base_url'
  | 'rate_limited'
  | 'upstream_unavailable'
  | 'timeout'
  | 'agent_not_installed'
  | 'agent_spawn_failed'
  | 'unknown';

export type ConnectionTestProtocol = 'anthropic' | 'openai' | 'azure' | 'google';

export interface ProviderTestRequest {
  protocol: ConnectionTestProtocol;
  baseUrl: string;
  apiKey: string;
  model: string;
  // Azure only. When omitted, the daemon falls back to its default api-version.
  apiVersion?: string;
}

export interface AgentTestRequest {
  agentId: string;
  model?: string;
  reasoning?: string;
  agentCliEnv?: AgentCliEnvPrefs;
}

export type ConnectionTestRequest =
  | ({ mode: 'provider' } & ProviderTestRequest)
  | ({ mode: 'agent' } & AgentTestRequest);

export interface ConnectionTestResponse {
  ok: boolean;
  kind: ConnectionTestKind;
  latencyMs: number;
  // Model id or CLI default slot that this test exercised.
  model?: string;
  // Truncated assistant reply (≤ 120 chars) on success.
  sample?: string;
  // Upstream HTTP status when relevant (provider tests).
  status?: number;
  // Display name of the resolved agent (CLI tests).
  agentName?: string;
  // Free-form, redacted detail line — surfaced in the `unknown`,
  // `agent_spawn_failed`, and `upstream_unavailable` copy.
  detail?: string;
}
