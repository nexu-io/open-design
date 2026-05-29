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
  const stripped = hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname;
  // FQDN trailing-dot form (RFC 1034) resolves identically to the dotless form,
  // so `localhost.` must normalize to `localhost` before the equality check in
  // isLoopbackApiHost — and `0.0.0.0.`, `10.0.0.1.`, etc. must normalize before
  // isBlockedIpv4 parses them. Strips one or more trailing dots.
  return stripped.toLowerCase().replace(/\.+$/, '');
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
  | 'agent_auth_required'
  | 'agent_spawn_failed'
  | 'unknown';

// Phase markers describing how far the local agent connection test
// progressed before it produced its result. Used inside
// `ConnectionTestResponse.diagnostics.phase` and intended to be stable
// across daemon versions so Settings UI and CLI consumers can render
// phase-aware copy without re-deriving it from the free-form `detail`
// string. See issue #2248.
export type ConnectionTestPhase =
  | 'binary_resolution'
  | 'version_probe'
  | 'model_list'
  | 'spawn'
  | 'connection_smoke_test'
  | 'output_parse';

export interface ConnectionTestDiagnostics {
  // How far the test progressed before producing the result. Always
  // set on local agent test responses.
  phase: ConnectionTestPhase;
  // Absolute filesystem path of the executable the daemon actually
  // attempted to run, when resolution succeeded.
  binaryPath?: string;
  // Best-effort version string captured during `version_probe`. Null
  // when the CLI exposes no machine-parseable version output.
  binaryVersion?: string | null;
  // Child process exit metadata. Both fields keep the raw `code` /
  // `signal` shape from `child_process` so consumers can distinguish
  // a clean non-zero exit from a SIGTERM teardown. `signal` is typed as
  // `string | null` (not `NodeJS.Signals`) so the generated `.d.ts`
  // stays browser-safe — the daemon writes one of the
  // `NodeJS.Signals` literals here but consumers never need to import
  // ambient Node namespaces just to read an HTTP response shape.
  exitCode?: number | null;
  signal?: string | null;
  // Last ~400 bytes of the child's streams, already passed through
  // the daemon's secret redactor.
  stdoutTail?: string;
  stderrTail?: string;
}

export type ConnectionTestProtocol = 'anthropic' | 'openai' | 'azure' | 'google' | 'ollama' | 'senseaudio';

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
  // Optional executable-path diagnostics for Local CLI tests. Used by
  // Settings to explain whether a saved custom path worked, was ignored,
  // or required a PATH fallback.
  configuredExecutablePath?: string;
  detectedExecutablePath?: string;
  usedExecutablePath?: string;
  usedExecutableSource?: 'configured' | 'path' | 'fallback_invalid' | 'fallback_failed';
  // Structured diagnostics for the local agent connection test path
  // (#2248). Optional and additive: existing consumers that only read
  // `kind` and `detail` keep working unchanged. Populated on local
  // agent test responses — including early failures that never reach
  // the spawn step (unknown agent id, unresolved binary, preflight
  // auth probe). Provider tests omit it.
  diagnostics?: ConnectionTestDiagnostics;
}
