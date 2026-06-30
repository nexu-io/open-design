// Smoke tests for the Settings dialog. Two entry points:
//
//   - testProviderConnection: posts a tiny "Reply with only: ok" request to
//     a BYOK API endpoint and reports a categorized result.
//   - testAgentConnection: spawns a Local CLI adapter with the same prompt,
//     drives the existing stream parser through a collector sink, and treats
//     assistant text as proof that the CLI can run unless the text is an
//     explicit model-selection error.
//
// Both functions persist nothing — no project, no chat record, no
// media-config write. The intent is to give Settings a definite "your
// configuration works" answer without users having to send a real chat to
// discover that the API key, model, base URL, or CLI is broken.
//
// The streaming counterpart for chat lives in `server.ts` under the
// `/api/proxy/*/stream` routes; both paths share the base URL policy from
// contracts so Settings and daemon-side checks reject the same hosts.

import { spawn } from 'node:child_process';
import { promises as dnsPromises } from 'node:dns';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Agent, EnvHttpProxyAgent, Socks5ProxyAgent } from 'undici';
import type { Dispatcher, Pool } from 'undici';
import {
  applyAgentLaunchEnv,
  getAgentDef,
  resolveAgentLaunch,
  spawnEnvForAgent,
} from './agents.js';
import {
  createCommandInvocation,
  mergeProxyAwareEnv,
  resolveSystemProxyEnv,
} from '@open-design/platform';
import { attachAcpSession } from './acp.js';
import { attachPiRpcSession } from './pi-rpc.js';
import { createClaudeStreamHandler } from './runtimes/claude-stream.js';
import { diagnoseClaudeCliFailure } from './claude-diagnostics.js';
import { createCopilotStreamHandler } from './copilot-stream.js';
import { createJsonEventStreamHandler } from './runtimes/json-event-stream.js';
import { agentCliEnvForAgent, validateAgentCliEnv } from './app-config.js';
import {
  classifyAgentAuthFailure,
  cursorAuthGuidance,
  probeAgentAuthStatus,
} from './runtimes/auth.js';
import { loadMmdRouteLaunchEnv } from './runtimes/mmd-routes.js';
import {
  buildLegacyMaxTokensParam,
  buildMaxCompletionTokensParam,
  buildOpenAIChatTokenParam,
  isUnsupportedMaxTokensError,
} from './integrations/openai-chat-token-params.js';
import { aihubmixHeaders } from './integrations/aihubmix.js';
import type { AgentCliEnvPrefs } from './app-config.js';
import type { RuntimeAgentDef } from './runtimes/types.js';
import { resolveModelForAgent } from './runtimes/models.js';
import { preparePromptFileForAgent, type PreparedPromptFile } from './runtimes/prompt-file.js';
import {
  isBlockedExternalApiHostname,
  isLoopbackApiHost,
  validateBaseUrl,
  type AgentTestRequest,
  type BaseUrlValidationResult,
  type ConnectionTestDiagnostics,
  type ConnectionTestKind,
  type ConnectionTestPhase,
  type ConnectionTestProtocol,
  type ConnectionTestResponse,
  type ParsedBaseUrl,
  type ProviderTestRequest,
} from '@open-design/contracts/api/connectionTest';
import { googleGenerateContentUrl } from './integrations/google-models.js';
import { resolveAmrProfile } from './integrations/vela.js';

export { validateBaseUrl } from '@open-design/contracts/api/connectionTest';

// DNS-aware companion to `validateBaseUrl`. The contracts-side check only
// inspects the literal hostname string, so a public DNS name pointing at
// internal infrastructure (`internal.example.com → 10.0.0.5`) slips through
// and the daemon ends up issuing a request to a private address on behalf of
// whichever caller supplied the base URL. Resolve the hostname and re-run
// the block-list against every address the system would actually connect to.
//
// Loopback is intentionally allowed for local LLM providers like Ollama; any
// hostname that resolves to a loopback address (including `*.localhost` per
// RFC 6761 and IPv4-mapped IPv6 loopback) follows that same carve-out.
//
// DNS lookup failures are *not* treated as a security signal — the caller is
// going to surface a connection error from `fetch` anyway, and turning a
// transient resolver hiccup into a 403 would just confuse users. The sync
// hostname check still rejected the obvious literal-IP cases before we ever
// got here.

export type DnsLookupAddress = { address: string; family: number };
export type DnsLookupFn = (hostname: string) => Promise<DnsLookupAddress[]>;

const defaultDnsLookup: DnsLookupFn = async (hostname) => {
  const result = await dnsPromises.lookup(hostname, { all: true, family: 0 });
  return result.map(({ address, family }) => ({ address, family }));
};

function looksLikeIpLiteral(hostname: string): boolean {
  const host = hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return true;
  return host.includes(':');
}

export async function validateBaseUrlResolved(
  baseUrl: string,
  lookup: DnsLookupFn = defaultDnsLookup,
): Promise<BaseUrlValidationResult> {
  const sync = validateBaseUrl(baseUrl);
  if (sync.error || !sync.parsed) return sync;

  const hostname = sync.parsed.hostname.toLowerCase();
  if (isLoopbackApiHost(hostname)) return sync;
  if (looksLikeIpLiteral(hostname)) return sync;

  let addresses: DnsLookupAddress[];
  try {
    addresses = await lookup(hostname);
  } catch {
    return sync;
  }

  for (const addr of addresses) {
    const ip = String(addr.address).toLowerCase();
    if (isLoopbackApiHost(ip)) continue;
    if (isBlockedExternalApiHostname(ip)) {
      return { error: 'Internal IPs blocked', forbidden: true };
    }
  }

  return sync;
}

/**
 * SSRF guard for asset URLs handed back inside a successful API
 * response — typically a `data.url` or `data.video_url` that points
 * at the gateway's CDN, but is attacker-controllable when the
 * upstream gateway is compromised or misconfigured. Routes the URL
 * through `validateBaseUrlResolved` (DNS-resolve → reject loopback,
 * RFC1918, link-local, CGNAT, metadata-service IPs) and returns a
 * discriminated union so callers don't have to repeat the
 * `validated.error || !validated.parsed` plumbing.
 *
 * Two callers today:
 *   - `byok-tools.ts` for the chat-tool image/video downloads
 *   - `media.ts` `renderSenseAudioImage` for the CLI agent path
 * Both hand the URL straight to `fetch(...)` next, so pair this
 * guard with `redirect: 'error'` on the fetch to also block a
 * 3xx hop into private space.
 */
export async function assertExternalAssetUrl(
  rawUrl: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (typeof rawUrl !== 'string' || !rawUrl) {
    return { ok: false, error: 'empty download url' };
  }
  const validated = await validateBaseUrlResolved(rawUrl);
  if (validated.error || !validated.parsed) {
    return {
      ok: false,
      error: validated.forbidden
        ? `blocked download url (${validated.error ?? 'internal address'})`
        : `invalid download url: ${validated.error ?? 'unknown reason'}`,
    };
  }
  return { ok: true };
}

/**
 * Validate an upstream-controlled asset URL and fetch it with the SSRF guard
 * pinned through redirects. Runs `assertExternalAssetUrl` on the literal URL
 * and forces `redirect: 'error'`, so a validated public URL that 302s into
 * loopback / RFC1918 / metadata space is rejected before any bytes are read.
 *
 * Throws on a blocked host — so the redirect bypass is impossible to forget at
 * call sites — and the platform fetch additionally throws when `redirect:
 * 'error'` encounters a 3xx. Callers keep their own `!resp.ok` HTTP-status
 * handling. The forced `redirect` is spread last so it overrides any value the
 * caller passed in `init`.
 */
export async function assertAndFetchExternalAsset(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const check = await assertExternalAssetUrl(url);
  if (!check.ok) throw new Error(check.error);
  return fetch(url, { ...init, redirect: 'error' });
}

// Aggressive but not punitive — happy paths usually return in under 2 s.
// Override with OD_CONNECTION_TEST_PROVIDER_TIMEOUT_MS for slow networks
// or distant providers; invalid values fall back to the default.
const DEFAULT_PROVIDER_TIMEOUT_MS = 12_000;
const LOOPBACK_NO_PROXY_TOKENS = ['localhost', '127.0.0.1', '[::1]'] as const;
// CLI boot time is dominated by adapter auth/session restore; the heavy
// adapters (Codex, Cursor Agent) regularly take 5–10 s on a cold first
// run, so 45 s leaves headroom without making a hung child invisible.
// Override with OD_CONNECTION_TEST_AGENT_TIMEOUT_MS.
const DEFAULT_AGENT_TIMEOUT_MS = 45_000;
const AGENT_STDOUT_DRAIN_MS = 25;
// Node's `setTimeout` silently clamps any delay above this to ~1 ms
// (with a TimeoutOverflowWarning), so an override meant to *extend*
// the budget — e.g. `OD_CONNECTION_TEST_AGENT_TIMEOUT_MS=3000000000` —
// would actually make every connection test fail almost immediately.
// Reject above the cap so the safety timeout cannot be accidentally
// disarmed by an oversized env value.
const MAX_CONNECTION_TEST_TIMEOUT_MS = 2_147_483_647;

export function resolveConnectionTestTimeoutMs(
  key: 'OD_CONNECTION_TEST_PROVIDER_TIMEOUT_MS' | 'OD_CONNECTION_TEST_AGENT_TIMEOUT_MS',
  fallback: number,
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env[key];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < 1 || n > MAX_CONNECTION_TEST_TIMEOUT_MS) {
    console.warn(
      `connection-test: ignoring ${key}=${JSON.stringify(raw)} (must be a positive integer between 1 and ${MAX_CONNECTION_TEST_TIMEOUT_MS} ms); using ${fallback}ms`,
    );
    return fallback;
  }
  return n;
}

function providerTimeoutMs(): number {
  return resolveConnectionTestTimeoutMs(
    'OD_CONNECTION_TEST_PROVIDER_TIMEOUT_MS',
    DEFAULT_PROVIDER_TIMEOUT_MS,
  );
}

function agentTimeoutMs(): number {
  return resolveConnectionTestTimeoutMs(
    'OD_CONNECTION_TEST_AGENT_TIMEOUT_MS',
    DEFAULT_AGENT_TIMEOUT_MS,
  );
}

export function mergeNoProxyWithLoopbackDefaults(noProxy: string | undefined): string | null {
  if (noProxy?.split(/[\s,]+/).some((token) => token.trim() === '*')) return '*';
  const seen = new Set<string>();
  const values: string[] = [];
  for (const rawToken of [
    ...(noProxy ? noProxy.split(/[\s,]+/) : []),
    ...LOOPBACK_NO_PROXY_TOKENS,
  ]) {
    const token = rawToken.trim() === '::1' ? '[::1]' : rawToken.trim();
    if (!token || seen.has(token)) continue;
    seen.add(token);
    values.push(token);
  }
  return values.length > 0 ? values.join(',') : null;
}

function defaultPortForProtocol(protocol: string): string {
  if (protocol === 'http:') return '80';
  if (protocol === 'https:') return '443';
  return '';
}

function splitNoProxyHostAndPort(token: string): { host: string; port: string } {
  const trimmed = token.trim();
  if (!trimmed) return { host: '', port: '' };
  if (trimmed.startsWith('[')) {
    const closingBracket = trimmed.indexOf(']');
    if (closingBracket === -1) return { host: trimmed.toLowerCase(), port: '' };
    const host = trimmed.slice(0, closingBracket + 1).toLowerCase();
    const port = trimmed.slice(closingBracket + 1).replace(/^:/, '');
    return { host, port };
  }
  const firstColon = trimmed.indexOf(':');
  const lastColon = trimmed.lastIndexOf(':');
  if (firstColon !== -1 && firstColon === lastColon) {
    return {
      host: trimmed.slice(0, firstColon).toLowerCase(),
      port: trimmed.slice(firstColon + 1),
    };
  }
  return { host: trimmed.toLowerCase(), port: '' };
}

function noProxyTokenMatchesUrl(token: string, url: URL): boolean {
  const trimmed = token.trim();
  if (!trimmed) return false;
  if (trimmed === '*') return true;
  if (trimmed === '<local>') return !url.hostname.includes('.') && !url.hostname.includes(':');
  const { host, port } = splitNoProxyHostAndPort(trimmed.replace(/^\*\./, '.'));
  if (!host) return false;
  const normalizedHost = host === '::1' ? '[::1]' : host;
  const hostname = url.hostname.toLowerCase();
  const matchesHost = normalizedHost.startsWith('.')
    ? hostname === normalizedHost.slice(1) || hostname.endsWith(normalizedHost)
    : hostname === normalizedHost || hostname.endsWith(`.${normalizedHost}`);
  if (!matchesHost) return false;
  if (!port) return true;
  return (url.port || defaultPortForProtocol(url.protocol)) === port;
}

function shouldBypassProxyForUrl(target: string | URL, noProxy: string | null): boolean {
  if (!noProxy) return false;
  let url: URL;
  try {
    url = target instanceof URL ? target : new URL(target);
  } catch {
    return false;
  }
  return noProxy.split(/[\s,]+/).some((token) => noProxyTokenMatchesUrl(token, url));
}

function socksProxyAgentOptions(
  options: Pool.Options,
): ConstructorParameters<typeof Socks5ProxyAgent>[1] {
  return {
    ...(options.bodyTimeout === undefined ? {} : { bodyTimeout: options.bodyTimeout }),
    ...(options.headersTimeout === undefined ? {} : { headersTimeout: options.headersTimeout }),
  };
}

class NoProxyAwareSocksProxyAgent {
  private readonly directAgent: Agent;

  private readonly socksAgent: Socks5ProxyAgent;

  private readonly socksDispatchTimeouts: Pick<Dispatcher.DispatchOptions, 'bodyTimeout' | 'headersTimeout'>;

  constructor(
    private readonly noProxy: string | null,
    socksProxy: string,
    options: Pool.Options,
  ) {
    this.directAgent = new Agent(options as ConstructorParameters<typeof Agent>[0]);
    this.socksAgent = new Socks5ProxyAgent(socksProxy, socksProxyAgentOptions(options));
    this.socksDispatchTimeouts = {
      ...(options.bodyTimeout === undefined ? {} : { bodyTimeout: options.bodyTimeout }),
      ...(options.headersTimeout === undefined
        ? {}
        : { headersTimeout: options.headersTimeout }),
    };
  }

  dispatch(options: Dispatcher.DispatchOptions, handler: Dispatcher.DispatchHandler): boolean {
    const origin = options.origin;
    const targetUrl =
      typeof origin === 'string' || origin instanceof URL
        ? new URL(options.path, origin)
        : null;
    const dispatcher =
      targetUrl && shouldBypassProxyForUrl(targetUrl, this.noProxy)
        ? this.directAgent
        : this.socksAgent;
    return dispatcher.dispatch(
      dispatcher === this.socksAgent ? { ...this.socksDispatchTimeouts, ...options } : options,
      handler,
    );
  }

  async close(): Promise<void> {
    await Promise.all([this.directAgent.close(), this.socksAgent.close()]);
  }

  async destroy(error?: Error | null): Promise<void> {
    await Promise.all([
      this.directAgent.destroy(error ?? null),
      this.socksAgent.destroy(error ?? null),
    ]);
  }
}

class NoProxyAwareEnvProxyAgent {
  private readonly directAgent: Agent;

  constructor(
    private readonly noProxy: string,
    private readonly proxyAgent: EnvHttpProxyAgent,
    options: Pool.Options,
  ) {
    this.directAgent = new Agent(options as ConstructorParameters<typeof Agent>[0]);
  }

  dispatch(options: Dispatcher.DispatchOptions, handler: Dispatcher.DispatchHandler): boolean {
    const origin = options.origin;
    const targetUrl =
      typeof origin === 'string' || origin instanceof URL
        ? new URL(options.path, origin)
        : null;
    return (targetUrl && shouldBypassProxyForUrl(targetUrl, this.noProxy) ? this.directAgent : this.proxyAgent).dispatch(
      options,
      handler,
    );
  }

  async close(): Promise<void> {
    await Promise.all([this.directAgent.close(), this.proxyAgent.close()]);
  }

  async destroy(error?: Error | null): Promise<void> {
    await Promise.all([
      this.directAgent.destroy(error ?? null),
      this.proxyAgent.destroy(error ?? null),
    ]);
  }
}

class NoProxyAwareMixedProxyAgent {
  private readonly directAgent: Agent;

  private readonly proxyAgent: EnvHttpProxyAgent;

  private readonly socksAgent: Socks5ProxyAgent;

  private readonly socksDispatchTimeouts: Pick<Dispatcher.DispatchOptions, 'bodyTimeout' | 'headersTimeout'>;

  constructor(
    private readonly noProxy: string | null,
    private readonly hasHttpProxy: boolean,
    private readonly hasHttpsProxy: boolean,
    proxyOptions: ConstructorParameters<typeof EnvHttpProxyAgent>[0],
    socksProxy: string,
    options: Pool.Options,
  ) {
    this.directAgent = new Agent(options as ConstructorParameters<typeof Agent>[0]);
    this.proxyAgent = new EnvHttpProxyAgent(proxyOptions);
    this.socksAgent = new Socks5ProxyAgent(socksProxy, socksProxyAgentOptions(options));
    this.socksDispatchTimeouts = {
      ...(options.bodyTimeout === undefined ? {} : { bodyTimeout: options.bodyTimeout }),
      ...(options.headersTimeout === undefined
        ? {}
        : { headersTimeout: options.headersTimeout }),
    };
  }

  dispatch(options: Dispatcher.DispatchOptions, handler: Dispatcher.DispatchHandler): boolean {
    const origin = options.origin;
    const targetUrl =
      typeof origin === 'string' || origin instanceof URL
        ? new URL(options.path, origin)
        : null;
    if (targetUrl && shouldBypassProxyForUrl(targetUrl, this.noProxy)) {
      return this.directAgent.dispatch(options, handler);
    }
    if (
      targetUrl && ((targetUrl.protocol === 'http:' && this.hasHttpProxy) ||
        (targetUrl.protocol === 'https:' && this.hasHttpsProxy))
    ) {
      return this.proxyAgent.dispatch(options, handler);
    }
    return this.socksAgent.dispatch({ ...this.socksDispatchTimeouts, ...options }, handler);
  }

  async close(): Promise<void> {
    await Promise.all([this.directAgent.close(), this.proxyAgent.close(), this.socksAgent.close()]);
  }

  async destroy(error?: Error | null): Promise<void> {
    await Promise.all([
      this.directAgent.destroy(error ?? null),
      this.proxyAgent.destroy(error ?? null),
      this.socksAgent.destroy(error ?? null),
    ]);
  }
}

type ConnectionTestProxyDispatcher =
  | EnvHttpProxyAgent
  | NoProxyAwareEnvProxyAgent
  | NoProxyAwareMixedProxyAgent
  | NoProxyAwareSocksProxyAgent;

function envProxyAgentOptions(
  options: Pool.Options,
  httpProxy: string | undefined,
  httpsProxy: string | undefined,
  noProxy: string | null,
): ConstructorParameters<typeof EnvHttpProxyAgent>[0] {
  return {
    ...options,
    ...(httpProxy ? { httpProxy } : {}),
    ...(httpsProxy ? { httpsProxy } : {}),
    ...(noProxy ? { noProxy } : {}),
  };
}

function buildConnectionTestProxyDispatcher(
  env: NodeJS.ProcessEnv = process.env,
  options: Pool.Options = {},
): ConnectionTestProxyDispatcher | null {
  const proxyEnv = mergeProxyAwareEnv(
    process.platform,
    resolveSystemProxyEnv(),
    env,
  );
  const allProxy = proxyEnv.ALL_PROXY ?? proxyEnv.all_proxy;
  const socksProxy = socksProxyUrl(allProxy);
  const httpProxyFromAll = isHttpOrHttpsProxy(allProxy);
  const httpProxy = proxyEnv.HTTP_PROXY ?? proxyEnv.http_proxy ?? httpProxyFromAll;
  const httpsProxy = proxyEnv.HTTPS_PROXY ?? proxyEnv.https_proxy ?? httpProxyFromAll;
  const noProxy = mergeNoProxyWithLoopbackDefaults(proxyEnv.NO_PROXY ?? proxyEnv.no_proxy);
  const proxyOptions = envProxyAgentOptions(options, httpProxy, httpsProxy, noProxy);
  if (socksProxy && (httpProxy || httpsProxy) && (!httpProxy || !httpsProxy)) {
    return new NoProxyAwareMixedProxyAgent(
      noProxy,
      Boolean(httpProxy),
      Boolean(httpsProxy),
      proxyOptions,
      socksProxy,
      options,
    );
  }
  if (!httpProxy && !httpsProxy && socksProxy) {
    return new NoProxyAwareSocksProxyAgent(noProxy, socksProxy, options);
  }
  if (!httpProxy && !httpsProxy) return null;
  const proxyAgent = new EnvHttpProxyAgent(proxyOptions);
  return noProxy?.split(/[\s,]+/).some((token) => token.trim() === '<local>')
    ? new NoProxyAwareEnvProxyAgent(noProxy, proxyAgent, options)
    : proxyAgent;
}

function isHttpOrHttpsProxy(proxyUrl: string | undefined): string | undefined {
  const trimmed = proxyUrl?.trim();
  if (!trimmed) return undefined;
  try {
    const { protocol } = new URL(trimmed);
    return protocol === 'http:' || protocol === 'https:' ? trimmed : undefined;
  } catch {
    return undefined;
  }
}

function socksProxyUrl(proxyUrl: string | undefined): string | undefined {
  const trimmed = proxyUrl?.trim();
  if (!trimmed) return undefined;
  try {
    const url = new URL(trimmed);
    if (url.protocol === 'socks:' || url.protocol === 'socks5:') return trimmed;
    if (url.protocol === 'socks5h:') {
      url.protocol = 'socks5:';
      return url.toString();
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export function proxyDispatcherRequestInit(
  env: NodeJS.ProcessEnv = process.env,
  options: Pool.Options = {},
): {
  close(): Promise<void>;
  requestInit: Pick<RequestInit, 'dispatcher'>;
} {
  const dispatcher = buildConnectionTestProxyDispatcher(env, options);
  if (dispatcher == null) {
    return {
      async close() {},
      requestInit: {},
    };
  }
  return {
    close: () => dispatcher.close(),
    requestInit: {
      dispatcher: dispatcher as unknown as NonNullable<RequestInit['dispatcher']>,
    },
  };
}

const AGENT_COMPLETION_DEBOUNCE_MS = 500;
const AGENT_KILL_GRACE_MS = 2_000;
// Truncates the assistant reply we surface in the success copy so a
// chatty model can't dump kilobytes into the inline status node.
const SAMPLE_MAX_CHARS = 120;
// Generation budget for the smoke prompt. Keep this small, but not tiny:
// reasoning models can spend the first few dozen tokens in hidden reasoning
// before producing a visible `ok`.
const PROVIDER_MAX_TOKENS = 100;
const SMOKE_PROMPT = 'Reply with only: ok';

function formatPromptForAgentStdin(
  def: Pick<RuntimeAgentDef, 'promptInputFormat'>,
  prompt: string,
): string {
  const promptInputFormat = def.promptInputFormat ?? 'text';
  if (promptInputFormat === 'stream-json') {
    return `${JSON.stringify({
      type: 'user',
      message: {
        role: 'user',
        content: [{ type: 'text', text: prompt }],
      },
    })}\n`;
  }
  return prompt;
}

function codexExecutableGuidance(
  agentId: string,
  configuredOverridePath: string | null,
  pathResolvedPath: string | null,
): string {
  if (
    agentId !== 'codex' ||
    !configuredOverridePath ||
    !pathResolvedPath ||
    configuredOverridePath === pathResolvedPath
  ) {
    return '';
  }
  return ` Configured Codex path failed: ${configuredOverridePath}. Open Design also detected a PATH Codex CLI at ${pathResolvedPath}. Update CODEX_BIN or clear the custom path to use the detected binary.`;
}

function codexExecutableFallbackSuccessDetail(
  configuredOverridePath: string,
  pathResolvedPath: string,
): string {
  return `Configured Codex path failed: ${configuredOverridePath}. This test succeeded with the PATH Codex CLI at ${pathResolvedPath}. Update CODEX_BIN or clear the custom path to use the detected binary.`;
}

function codexConfiguredPathSuccessDetail(
  configuredOverridePath: string,
): string {
  return `This test used the configured Codex path: ${configuredOverridePath}.`;
}

function codexInvalidConfiguredPathFallbackDetail(
  configuredValue: string,
  pathResolvedPath: string,
): string {
  return `Configured Codex path is invalid or not executable: ${configuredValue}. This test used the PATH Codex CLI at ${pathResolvedPath}. Update CODEX_BIN or clear the custom path to use the detected binary.`;
}

function stripCodexBinOverride(
  prefs: AgentCliEnvPrefs | undefined,
): AgentCliEnvPrefs | undefined {
  if (!prefs?.codex?.CODEX_BIN) return prefs;
  const nextCodex = { ...prefs.codex };
  delete nextCodex.CODEX_BIN;
  const next: AgentCliEnvPrefs = {
    ...prefs,
    codex: nextCodex,
  };
  if (Object.keys(nextCodex).length === 0) delete next.codex;
  return Object.keys(next).length > 0 ? next : undefined;
}

// Catches `Bearer …`, `x-api-key`/`api-key`/`x-goog-api-key` headers, and
// `?key=…` query strings. The provider helpers all funnel error text
// through this before logging; if a vendor surfaces the key in body text
// (some do for 401s), it stays out of the daemon log too.
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function redactSecrets(
  text: string,
  exactSecrets: Array<string | undefined | null> = [],
): string {
  if (typeof text !== 'string' || text.length === 0) return '';
  let redacted = text
    .replace(/Bearer\s+[A-Za-z0-9_\-.+/=]+/gi, 'Bearer [REDACTED]')
    .replace(/(x-api-key|api-key|x-goog-api-key)\s*[:=]\s*[^\s,;"']+/gi, '$1: [REDACTED]')
    .replace(/([?&]key=)[^&\s]+/gi, '$1[REDACTED]');
  for (const secret of exactSecrets) {
    if (typeof secret !== 'string' || secret.length === 0) continue;
    redacted = redacted.replace(new RegExp(escapeRegExp(secret), 'g'), '[REDACTED]');
  }
  return redacted;
}

type ProviderConnectionInput = ProviderTestRequest & { signal?: AbortSignal };
type AgentConnectionInput = AgentTestRequest & { signal?: AbortSignal };

function appendVersionedApiPath(baseUrl: string, suffix: string): string {
  const url = new URL(baseUrl);
  const pathname = url.pathname.replace(/\/+$/, '');
  url.pathname = /\/v\d+(\/|$)/.test(pathname)
    ? `${pathname}${suffix}`
    : `${pathname}/v1${suffix}`;
  return url.toString();
}

function truncateSample(text: unknown): string {
  if (typeof text !== 'string') return '';
  const trimmed = text.replace(/\s+/g, ' ').trim();
  if (trimmed.length <= SAMPLE_MAX_CHARS) return trimmed;
  return `${trimmed.slice(0, SAMPLE_MAX_CHARS - 1)}…`;
}

export function isSmokeOkReply(text: unknown): boolean {
  return typeof text === 'string' && text.trim().toLowerCase() === 'ok';
}

function isLikelyModelErrorText(text: string): boolean {
  return (
    /model/i.test(text) &&
    /(not found|not exist|does not exist|unknown|invalid|unsupported|not supported|not have access|no access|issue with the selected model)/i.test(
      text,
    )
  );
}

function isLikelyAuthErrorText(text: string): boolean {
  return /(?:api[_ -]?key|x-goog-api-key|unauthorized|unauthenticated|permission denied|invalid credentials|authentication credentials|access denied|invalid key)/i.test(
    text,
  );
}

const GOOGLE_GEMINI_DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com';

function normalizeProviderTestInput(
  input: ProviderConnectionInput,
): ProviderConnectionInput {
  const baseUrl = String(input.baseUrl ?? '').trim();
  if (input.protocol === 'google' && !baseUrl) {
    return { ...input, baseUrl: GOOGLE_GEMINI_DEFAULT_BASE_URL };
  }
  return input;
}

function googleBaseUrlMismatchDetail(hostname: string): string | null {
  if (hostname === 'api.anthropic.com' || hostname === 'api.openai.com') {
    return `Base URL points to ${hostname}. For Google Gemini use ${GOOGLE_GEMINI_DEFAULT_BASE_URL}.`;
  }
  return null;
}

function smokeFailureDetail(sample: string): string {
  return sample
    ? `Expected smoke test reply "ok"; got "${sample}"`
    : 'Provider returned a 2xx response without assistant text';
}

function inspectProviderCompletion(
  protocol: ConnectionTestProtocol,
  data: unknown,
  requestedModel: string,
  enforceResponseModel: boolean,
): { valid: boolean; sample?: string; kind?: ConnectionTestKind; detail?: string } {
  const obj = data && typeof data === 'object' ? data as Record<string, unknown> : null;
  if (!obj) return { valid: false };

  if (protocol === 'openai' || protocol === 'azure' || protocol === 'senseaudio' || protocol === 'aihubmix') {
    const responseModel = typeof obj.model === 'string' ? obj.model : '';
    if (
      // AIHubMix is omitted from the strict response-model check (like Azure):
      // its gateway routes by model name and may echo a normalized id.
      (protocol === 'openai' || protocol === 'senseaudio') &&
      enforceResponseModel &&
      responseModel &&
      requestedModel &&
      responseModel !== requestedModel
    ) {
      return {
        valid: false,
        kind: 'not_found_model',
        detail: `Provider responded with model "${responseModel}" instead of requested "${requestedModel}".`,
      };
    }
    const choices = obj.choices;
    if (!Array.isArray(choices) || choices.length === 0) return { valid: false };
    const first = choices[0] as { finish_reason?: unknown } | undefined;
    const finishReason =
      typeof first?.finish_reason === 'string' ? first.finish_reason : '';
    return {
      valid: true,
      sample: finishReason
        ? `valid completion (${finishReason})`
        : 'valid completion',
    };
  }

  if (protocol === 'anthropic') {
    return {
      valid:
        Array.isArray((obj as { content?: unknown }).content) ||
        typeof (obj as { stop_reason?: unknown }).stop_reason === 'string',
      sample: 'valid completion',
    };
  }

  if (protocol === 'google') {
    return {
      valid: Array.isArray((obj as { candidates?: unknown }).candidates),
      sample: 'valid completion',
    };
  }

  if (protocol === 'ollama') {
    const msg = (obj as { message?: { content?: unknown } }).message;
    const hasContent = typeof msg?.content === 'string';
    return {
      valid: Array.isArray((obj as { messages?: unknown }).messages) || hasContent,
      ...(hasContent ? { sample: truncateSample(msg?.content) } : {}),
    };
  }

  if (protocol === 'bedrock') {
    return {
      valid: false,
      kind: 'unknown',
      detail: 'AWS Bedrock BYOK connection tests need AWS credential signing, which is not supported by the current API-key smoke test.',
    };
  }

  return { valid: false };
}

function statusToKind(status: number, detailText = ''): ConnectionTestKind {
  if (status === 401 || (status === 400 && isLikelyAuthErrorText(detailText))) {
    return 'auth_failed';
  }
  if (status === 403) {
    return isLikelyAuthErrorText(detailText) ? 'auth_failed' : 'forbidden';
  }
  if (status === 404) {
    return isLikelyModelErrorText(detailText)
      ? 'not_found_model'
      : 'invalid_base_url';
  }
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'upstream_unavailable';
  return 'unknown';
}

function extractOpenAiModelIds(data: unknown): string[] {
  const items = (data as { data?: unknown }).data;
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => (item as { id?: unknown })?.id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
}

function extractProviderErrorDetail(data: unknown, rawText: string): string {
  const obj = data && typeof data === 'object' ? data : null;
  const error = obj ? (obj as { error?: unknown }).error : null;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  const message = obj ? (obj as { message?: unknown }).message : null;
  if (typeof message === 'string' && message.trim()) return message;
  return rawText.trim().slice(0, 240);
}

function networkErrorToKind(err: unknown): ConnectionTestKind {
  if (err instanceof Error) {
    if (err.name === 'AbortError') return 'timeout';
    // fetch's TypeError surface for DNS/TLS/connect failures is
    // `TypeError` with a `cause` whose `code` is one of these.
    const cause = (err as { cause?: { code?: string } }).cause;
    const code = cause?.code;
    if (
      code === 'ENOTFOUND' ||
      code === 'EAI_AGAIN' ||
      code === 'ECONNREFUSED' ||
      code === 'ECONNRESET' ||
      code === 'ETIMEDOUT' ||
      code === 'EHOSTUNREACH' ||
      code === 'ENETUNREACH' ||
      code === 'CERT_HAS_EXPIRED' ||
      code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'
    ) {
      return 'invalid_base_url';
    }
  }
  return 'unknown';
}

async function validateLocalOpenAiModel(
  input: ProviderTestRequest,
  parsed: ParsedBaseUrl,
  signal: AbortSignal,
  start: number,
  requestInit: Pick<RequestInit, 'dispatcher'> = {},
): Promise<ConnectionTestResponse | null> {
  if (input.protocol !== 'openai' || !isLoopbackApiHost(parsed.hostname)) {
    return null;
  }

  const url = appendVersionedApiPath(String(input.baseUrl), '/models');
  let response: Response;
  try {
    response = await fetch(url, {
      ...requestInit,
      method: 'GET',
      headers: { authorization: `Bearer ${String(input.apiKey)}` },
      signal,
      redirect: 'error',
    });
  } catch {
    // Local OpenAI-compatible servers vary; if model listing is unavailable,
    // fall back to the smoke completion path instead of blocking the test.
    return null;
  }
  if (!response.ok) return null;

  let data: unknown;
  try {
    const rawText = await response.text();
    data = rawText ? JSON.parse(rawText) : {};
  } catch {
    return null;
  }

  const modelIds = extractOpenAiModelIds(data);
  if (modelIds.length === 0 || modelIds.includes(input.model)) return null;
  return {
    ok: false,
    kind: 'not_found_model',
    latencyMs: Date.now() - start,
    model: input.model,
    status: response.status,
    detail: `Model "${input.model}" is not reported by the local provider.`,
  };
}

function isSenseAudioNonChatModel(model: string): boolean {
  return (
    model.startsWith('senseaudio-image-') ||
    model.startsWith('doubao-seedream-') ||
    model === 'sensenova-u1-fast' ||
    model.startsWith('doubao-seedance-') ||
    model.startsWith('senseaudio-asr-') ||
    model.startsWith('senseaudio-tts-') ||
    model.startsWith('senseaudio-music-')
  );
}

async function validateSenseAudioNonChatModel(
  input: ProviderTestRequest,
  signal: AbortSignal,
  start: number,
  requestInit: Pick<RequestInit, 'dispatcher'> = {},
): Promise<ConnectionTestResponse | null> {
  if (input.protocol !== 'senseaudio' || !isSenseAudioNonChatModel(input.model)) {
    return null;
  }

  const url = appendVersionedApiPath(String(input.baseUrl), '/models');
  let response: Response;
  try {
    response = await fetch(url, {
      ...requestInit,
      method: 'GET',
      headers: { authorization: `Bearer ${String(input.apiKey)}` },
      signal,
      redirect: 'error',
    });
  } catch (err) {
    const latencyMs = Date.now() - start;
    const kind = networkErrorToKind(err);
    return {
      ok: false,
      kind,
      latencyMs,
      model: input.model,
      detail: redactSecrets(err instanceof Error ? err.message : String(err), [
        input.apiKey,
      ]),
    };
  }

  const latencyMs = Date.now() - start;
  let rawText = '';
  let data: unknown = {};
  let parseError: unknown = null;
  try {
    rawText = await response.text();
  } catch {
    rawText = '';
  }
  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch (err) {
    parseError = err;
  }

  if (parseError && response.ok) {
    return {
      ok: false,
      kind: 'unknown',
      latencyMs,
      model: input.model,
      status: response.status,
      detail: redactSecrets(
        parseError instanceof Error ? parseError.message : String(parseError),
        [input.apiKey],
      ),
    };
  }

  if (!response.ok) {
    const redactedDetail = redactSecrets(
      extractProviderErrorDetail(data, rawText).slice(0, 240),
      [input.apiKey],
    );
    return {
      ok: false,
      kind: statusToKind(response.status, redactedDetail),
      latencyMs,
      model: input.model,
      status: response.status,
      detail: redactedDetail,
    };
  }

  const modelIds = extractOpenAiModelIds(data);
  if (!modelIds.includes(input.model)) {
    return {
      ok: false,
      kind: 'not_found_model',
      latencyMs,
      model: input.model,
      status: response.status,
      detail: `Model "${input.model}" is not reported by SenseAudio /models.`,
    };
  }

  return {
    ok: true,
    kind: 'success',
    latencyMs,
    model: input.model,
    status: response.status,
    detail: 'SenseAudio model is available, but this media model is not chat-testable from Settings.',
  };
}

interface ProviderCallShape {
  url: string;
  headers: Record<string, string>;
  body: unknown;
  extractText: (data: unknown) => string;
  retryBodyOnUnsupportedMaxTokens?: unknown;
}

function buildProviderCall(input: ProviderTestRequest): ProviderCallShape {
  const baseUrl = String(input.baseUrl);
  const apiKey = String(input.apiKey);
  const model = String(input.model);
  switch (input.protocol) {
    case 'anthropic':
      return {
        url: appendVersionedApiPath(baseUrl, '/messages'),
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: {
          model,
          max_tokens: PROVIDER_MAX_TOKENS,
          messages: [{ role: 'user', content: SMOKE_PROMPT }],
          stream: false,
        },
        extractText: (data) => {
          const blocks = (data as { content?: unknown }).content;
          if (!Array.isArray(blocks)) return '';
          for (const block of blocks) {
            if (
              block &&
              typeof block === 'object' &&
              (block as { type?: string }).type === 'text' &&
              typeof (block as { text?: unknown }).text === 'string'
            ) {
              return (block as { text: string }).text;
            }
          }
          return '';
        },
      };
    case 'aihubmix':
      // AIHubMix is wire-compatible with OpenAI but carries the fixed APP-Code
      // attribution header on every request (see aihubmixHeaders). Same body /
      // response shape as the OpenAI case otherwise.
      return {
        url: appendVersionedApiPath(baseUrl, '/chat/completions'),
        headers: {
          'content-type': 'application/json',
          ...aihubmixHeaders(apiKey),
        },
        body: {
          model,
          ...buildOpenAIChatTokenParam(model, PROVIDER_MAX_TOKENS),
          messages: [{ role: 'user', content: SMOKE_PROMPT }],
          stream: false,
        },
        extractText: extractOpenAIMessageText,
      };
    case 'openai':
    case 'senseaudio':
      // SenseAudio is wire-compatible with OpenAI (POST /v1/chat/completions,
      // Bearer auth, identical body + response shape), so the connection
      // smoke test reuses the same call shape. We default the base URL
      // upstream-side in chat-routes; this layer assumes the caller passed
      // a concrete URL via the BYOK form.
      return {
        url: appendVersionedApiPath(baseUrl, '/chat/completions'),
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
          ...(new URL(baseUrl).hostname === 'openrouter.ai' ? {
            'HTTP-Referer': 'https://opendesign.dev',
            'X-Title': 'Open Design',
          } : {}),
        },
        body: {
          model,
          ...buildOpenAIChatTokenParam(model, PROVIDER_MAX_TOKENS),
          messages: [{ role: 'user', content: SMOKE_PROMPT }],
          stream: false,
        },
        extractText: extractOpenAIMessageText,
      };
    case 'azure': {
      const url = new URL(baseUrl);
      const basePath = url.pathname.replace(/\/+$/, '');
      const usesVersionedOpenAIPath = /\/openai\/v\d+(?:$|\/)/.test(basePath);
      const apiVersion =
        typeof input.apiVersion === 'string' && input.apiVersion.trim()
          ? input.apiVersion.trim()
          : usesVersionedOpenAIPath
            ? ''
            : '2024-10-21';
      url.pathname = usesVersionedOpenAIPath
        ? `${basePath}/chat/completions`
        : `${basePath}/openai/deployments/${encodeURIComponent(model)}/chat/completions`;
      if (usesVersionedOpenAIPath && !apiVersion) {
        url.searchParams.delete('api-version');
      }
      if (apiVersion) {
        url.searchParams.set('api-version', apiVersion);
      }
      return {
        url: url.toString(),
        headers: {
          'content-type': 'application/json',
          'api-key': apiKey,
        },
        body: {
          ...(usesVersionedOpenAIPath ? { model } : {}),
          ...buildLegacyMaxTokensParam(PROVIDER_MAX_TOKENS),
          messages: [{ role: 'user', content: SMOKE_PROMPT }],
          stream: false,
        },
        retryBodyOnUnsupportedMaxTokens: {
          ...(usesVersionedOpenAIPath ? { model } : {}),
          messages: [{ role: 'user', content: SMOKE_PROMPT }],
          stream: false,
          ...buildMaxCompletionTokensParam(PROVIDER_MAX_TOKENS),
        },
        extractText: extractOpenAIMessageText,
      };
    }
    case 'google': {
      const effectiveBaseUrl = baseUrl.trim() || GOOGLE_GEMINI_DEFAULT_BASE_URL;
      return {
        url: googleGenerateContentUrl(effectiveBaseUrl, model),
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: {
          contents: [
            { role: 'user', parts: [{ text: SMOKE_PROMPT }] },
          ],
          generationConfig: { maxOutputTokens: PROVIDER_MAX_TOKENS },
        },
        extractText: (data) => {
          const candidates = (data as { candidates?: unknown }).candidates;
          if (!Array.isArray(candidates) || candidates.length === 0) return '';
          const parts = (candidates[0] as { content?: { parts?: unknown } })
            .content?.parts;
          if (!Array.isArray(parts)) return '';
          return parts
            .map((p: { text?: unknown }) =>
              typeof p?.text === 'string' ? p.text : '',
            )
            .join('');
        },
      };
    }
    case 'ollama': {
      const trimmedBase = baseUrl.replace(/\/+$/, '').replace(/\/api\/?$/, '');
      return {
        url: `${trimmedBase}/api/chat`,
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: {
          model,
          messages: [{ role: 'user', content: SMOKE_PROMPT }],
          stream: false,
        },
        extractText: (data) => {
          const message = (data as { message?: { content?: unknown } }).message;
          if (message && typeof (message as { content?: unknown }).content === 'string') {
            return (message as { content: string }).content;
          }
          return '';
        },
      };
    }
    case 'bedrock':
      throw new Error(
        'AWS Bedrock BYOK requires AWS credential signing; the current provider smoke test only supports API-key based providers.',
      );
    default:
      throw new Error(`Unknown protocol: ${(input as { protocol?: string }).protocol}`);
  }
}

// Sibling of the proxy's `extractOpenAIText` (which reads streaming
// `delta.content`). We need the non-streaming `message.content` shape
// here. Kept module-local so the chat path doesn't change.
function extractOpenAIMessageText(data: unknown): string {
  const choices = (data as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return '';
  const first = choices[0] as
    | { message?: { content?: unknown }; text?: unknown }
    | undefined;
  if (typeof first?.message?.content === 'string') return first.message.content;
  if (typeof first?.text === 'string') return first.text;
  return '';
}

export async function testProviderConnection(
  input: ProviderConnectionInput,
): Promise<ConnectionTestResponse> {
  const start = Date.now();
  const model = String(input.model ?? '');
  const normalizedInput = normalizeProviderTestInput(input);
  const validated = await validateBaseUrlResolved(normalizedInput.baseUrl);
  if (validated.error || !validated.parsed) {
    const kind: ConnectionTestKind = validated.forbidden ? 'forbidden' : 'invalid_base_url';
    return {
      ok: false,
      kind,
      latencyMs: Date.now() - start,
      model,
      detail: validated.error ?? '',
    };
  }

  if (normalizedInput.protocol === 'google') {
    const mismatch = googleBaseUrlMismatchDetail(
      validated.parsed.hostname.toLowerCase(),
    );
    if (mismatch) {
      return {
        ok: false,
        kind: 'invalid_base_url',
        latencyMs: Date.now() - start,
        model,
        detail: mismatch,
      };
    }
  }

  let call: ProviderCallShape;
  try {
    call = buildProviderCall(normalizedInput);
  } catch (err) {
    return {
      ok: false,
      kind: 'unknown',
      latencyMs: Date.now() - start,
      model,
      detail: redactSecrets(err instanceof Error ? err.message : String(err), [
        input.apiKey,
      ]),
    };
  }

  const controller = new AbortController();
  const abortFromParent = () => controller.abort();
  if (input.signal?.aborted) {
    controller.abort();
  } else {
    input.signal?.addEventListener('abort', abortFromParent, { once: true });
  }
  const timer = setTimeout(() => controller.abort(), providerTimeoutMs());
  let proxyDispatcher: ReturnType<typeof proxyDispatcherRequestInit> | null = null;

  try {
    proxyDispatcher = proxyDispatcherRequestInit();
    const modelError = await validateLocalOpenAiModel(
      normalizedInput,
      validated.parsed,
      controller.signal,
      start,
      proxyDispatcher.requestInit,
    );
    if (modelError) return modelError;

    const senseAudioNonChatResult = await validateSenseAudioNonChatModel(
      normalizedInput,
      controller.signal,
      start,
      proxyDispatcher.requestInit,
    );
    if (senseAudioNonChatResult) return senseAudioNonChatResult;

    const requestInit = {
      ...proxyDispatcher.requestInit,
      method: 'POST',
      headers: call.headers,
      signal: controller.signal,
      redirect: 'error' as const,
    };
    let response = await fetch(call.url, {
      ...requestInit,
      body: JSON.stringify(call.body),
    });
    let latencyMs = Date.now() - start;
    if (
      !response.ok &&
      call.retryBodyOnUnsupportedMaxTokens !== undefined
    ) {
      let detailText = '';
      try {
        detailText = await response.text();
      } catch {
        detailText = '';
      }
      if (response.status === 400 && isUnsupportedMaxTokensError(detailText)) {
        console.warn(
          `[test:provider] ${input.protocol} ${validated.parsed.hostname} model=${input.model} → retrying with max_completion_tokens`,
        );
        response = await fetch(call.url, {
          ...requestInit,
          body: JSON.stringify(call.retryBodyOnUnsupportedMaxTokens),
        });
        latencyMs = Date.now() - start;
      } else {
        const redactedDetail = redactSecrets(detailText.slice(0, 240), [
          input.apiKey,
        ]);
        const kind = statusToKind(response.status, redactedDetail);
        const detail =
          redactedDetail ||
          (response.status === 404
            ? 'HTTP 404 from provider; check the Base URL path.'
            : '');
        console.warn(
          `[test:provider] ${input.protocol} ${validated.parsed.hostname} model=${input.model} → ${response.status} in ${latencyMs}ms (${kind})${detail ? ` ${detail}` : ''}`,
        );
        return {
          ok: false,
          kind,
          latencyMs,
          model,
          status: response.status,
          detail,
        };
      }
    }
    if (response.ok) {
      let data: unknown;
      let rawText = '';
      try {
        rawText = await response.text();
        data = rawText ? JSON.parse(rawText) : {};
      } catch (parseErr) {
        console.warn(
          `[test:provider] ${input.protocol} ${validated.parsed.hostname} model=${input.model} → parse failed: ${redactSecrets(rawText.slice(0, 200), [input.apiKey])}`,
        );
        return {
          ok: false,
          kind: 'unknown',
          latencyMs,
          model,
          status: response.status,
          detail: redactSecrets(
            parseErr instanceof Error ? parseErr.message : String(parseErr),
            [input.apiKey],
          ),
        };
      }
      const completion = inspectProviderCompletion(
        input.protocol,
        data,
        model,
        isLoopbackApiHost(validated.parsed.hostname),
      );
      if (completion.kind) {
        const detail = redactSecrets(completion.detail ?? '', [input.apiKey]);
        console.warn(
          `[test:provider] ${input.protocol} ${validated.parsed.hostname} model=${input.model} → ${response.status} in ${latencyMs}ms (${completion.kind})${detail ? ` ${detail}` : ''}`,
        );
        return {
          ok: false,
          kind: completion.kind,
          latencyMs,
          model,
          status: response.status,
          detail,
        };
      }
      const replyText = call.extractText(data);
      let rawSample = truncateSample(replyText);
      if (rawSample && isLikelyModelErrorText(rawSample)) {
        const detail = redactSecrets(
          smokeFailureDetail(rawSample),
          [input.apiKey],
        );
        console.warn(
          `[test:provider] ${input.protocol} ${validated.parsed.hostname} model=${input.model} → ${response.status} in ${latencyMs}ms (not_found_model)${detail ? ` ${detail}` : ''}`,
        );
        return {
          ok: false,
          kind: 'not_found_model',
          latencyMs,
          model,
          status: response.status,
          detail,
        };
      }
      if (!rawSample && !completion.valid) {
        const providerError = extractProviderErrorDetail(data, rawText);
        const detail = redactSecrets(
          providerError || smokeFailureDetail(rawSample),
          [input.apiKey],
        );
        const kind: ConnectionTestKind = isLikelyAuthErrorText(providerError)
          ? 'auth_failed'
          : isLikelyModelErrorText(providerError)
            ? 'not_found_model'
            : 'unknown';
        console.warn(
          `[test:provider] ${input.protocol} ${validated.parsed.hostname} model=${input.model} → ${response.status} in ${latencyMs}ms (unexpected_sample)${detail ? ` ${detail}` : ''}`,
        );
        return {
          ok: false,
          kind,
          latencyMs,
          model,
          status: response.status,
          detail,
        };
      }
      if (!rawSample && completion.valid) {
        rawSample = truncateSample(completion.sample ?? 'valid completion');
      }
      const sample = redactSecrets(rawSample, [input.apiKey]);
      if (rawSample && !isSmokeOkReply(replyText)) {
        console.warn(
          `[test:provider] ${input.protocol} ${validated.parsed.hostname} model=${input.model} → ${response.status} in ${latencyMs}ms (connected_unexpected_sample) ${sample}`,
        );
      }
      console.log(
        `[test:provider] ${input.protocol} ${validated.parsed.hostname} model=${input.model} → ${response.status} in ${latencyMs}ms`,
      );
      return {
        ok: true,
        kind: 'success',
        latencyMs,
        model,
        status: response.status,
        sample,
      };
    }
    // Non-2xx: read body for redacted detail, then map status → kind.
    let detailText = '';
    try {
      detailText = await response.text();
    } catch {
      // Ignore — we still report the status code.
    }
    const redactedDetail = redactSecrets(detailText.slice(0, 240), [
      input.apiKey,
    ]);
    const kind = statusToKind(response.status, redactedDetail);
    const detail =
      redactedDetail ||
      (response.status === 404
        ? 'HTTP 404 from provider; check the Base URL path.'
        : '');
    console.warn(
      `[test:provider] ${input.protocol} ${validated.parsed.hostname} model=${input.model} → ${response.status} in ${latencyMs}ms (${kind})${detail ? ` ${detail}` : ''}`,
    );
    return {
      ok: false,
      kind,
      latencyMs,
      model,
      status: response.status,
      detail,
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const kind = networkErrorToKind(err);
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `[test:provider] ${input.protocol} ${validated.parsed.hostname} model=${input.model} → ${kind} in ${latencyMs}ms ${redactSecrets(message, [input.apiKey])}`,
    );
    return {
      ok: false,
      kind,
      latencyMs,
      model,
      detail: redactSecrets(message, [input.apiKey]),
    };
  } finally {
    clearTimeout(timer);
    input.signal?.removeEventListener('abort', abortFromParent);
    await proxyDispatcher?.close();
  }
}

// Build a `send(event, payload)` collector that buffers assistant text until
// the stream goes quiet. Mirrors the shape startChatRun hands to the stream
// parsers, so the parsers don't notice they're talking to a test rather than
// the real SSE writer.
type AgentSinkResult =
  | { kind: 'text'; text: string }
  | { kind: 'streamError'; error: Error };

interface AgentSink {
  send: (event: string, payload: unknown) => void;
  result: Promise<AgentSinkResult>;
  streamError: Promise<Error>;
  getText: () => string;
  getStderrTail: () => string;
  appendRawStdout: (chunk: string) => void;
  getRawStdout: () => string;
  getRawStdoutTail: () => string;
  sawTerminalCompletion: () => boolean;
  dispose: () => void;
}

function isTerminalCompletionStopReason(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0 && value !== 'tool_use';
}

function parseClaudeResultFrame(stdout: string): {
  resultText: string;
  stopReason: string | null;
  isError: boolean;
  subtype: string | null;
} | null {
  let parsed: {
    resultText: string;
    stopReason: string | null;
    isError: boolean;
    subtype: string | null;
  } | null = null;
  for (const line of stdout.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const obj = JSON.parse(trimmed) as Record<string, unknown>;
      if (obj.type !== 'result') continue;
      parsed = {
        resultText: typeof obj.result === 'string' ? obj.result.trim() : '',
        stopReason:
          (typeof obj.stop_reason === 'string' && obj.stop_reason) ||
          (typeof obj.terminal_reason === 'string' && obj.terminal_reason) ||
          null,
        isError: Boolean(obj.is_error),
        subtype: typeof obj.subtype === 'string' ? obj.subtype : null,
      };
    } catch {
      // Non-JSON stdout falls back to the normal diagnostic path.
    }
  }
  return parsed;
}

export function createAgentSink(): AgentSink {
  let buffer = '';
  let stderrTail = '';
  let rawStdout = '';
  let rawStdoutTail = '';
  let terminalCompletionSeen = false;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let resolveResult!: (value: AgentSinkResult) => void;
  let resolveStreamError!: (value: Error) => void;
  let settled = false;
  let streamErrorSettled = false;
  const result = new Promise<AgentSinkResult>((resolve) => {
    resolveResult = (value) => {
      if (settled) return;
      settled = true;
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      resolve(value);
    };
  });
  const streamError = new Promise<Error>((resolve) => {
    resolveStreamError = (error) => {
      if (streamErrorSettled) return;
      streamErrorSettled = true;
      resolve(error);
    };
  });

  const publishStreamError = (error: Error) => {
    resolveStreamError(error);
    resolveResult({ kind: 'streamError', error });
  };

  const scheduleTextResolution = () => {
    if (settled || buffer.trim().length === 0) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      resolveResult({ kind: 'text', text: buffer });
    }, AGENT_COMPLETION_DEBOUNCE_MS);
    debounceTimer.unref?.();
  };

  const consumeText = (text: string) => {
    if (typeof text !== 'string' || text.length === 0) return;
    buffer += text;
    scheduleTextResolution();
  };

  const appendRawStdout = (chunk: string) => {
    if (typeof chunk === 'string' && chunk.length > 0) {
      rawStdout = (rawStdout + chunk).slice(-16_384);
      rawStdoutTail = (rawStdoutTail + chunk).slice(-400);
    }
  };

  const send = (event: string, payload: unknown) => {
    const data = (payload ?? {}) as Record<string, unknown>;
    if (event === 'error') {
      const message =
        typeof data.message === 'string'
          ? data.message
          : typeof (data as { error?: { message?: string } }).error?.message === 'string'
            ? (data as { error: { message: string } }).error.message
            : 'agent stream error';
      publishStreamError(new Error(message));
      return;
    }
    if (event === 'agent') {
      const type = data.type;
      if (type === 'error') {
        const message =
          typeof data.message === 'string' ? data.message : 'agent stream error';
        publishStreamError(new Error(message));
        return;
      }
      const delta = data.delta;
      const text = data.text;
      if (type === 'text_delta' && typeof delta === 'string') {
        consumeText(delta);
      } else if (type === 'text' && typeof text === 'string') {
        consumeText(text);
      } else if (
        (type === 'turn_end' || type === 'usage') &&
        isTerminalCompletionStopReason(data.stopReason)
      ) {
        terminalCompletionSeen = true;
      }
      return;
    }
    if (event === 'stdout') {
      const chunk = data.chunk;
      if (typeof chunk === 'string') {
        appendRawStdout(chunk);
        consumeText(chunk);
      }
      return;
    }
    if (event === 'stderr') {
      const chunk = data.chunk;
      if (typeof chunk === 'string') {
        stderrTail = (stderrTail + chunk).slice(-400);
      }
      return;
    }
    // Ignore 'start', 'status', 'end', 'tool_use', 'thinking', etc. —
    // they don't carry assistant prose.
  };

  return {
    send,
    result,
    streamError,
    getText: () => buffer,
    getStderrTail: () => stderrTail,
    appendRawStdout,
    getRawStdout: () => rawStdout,
    getRawStdoutTail: () => rawStdoutTail,
    sawTerminalCompletion: () => terminalCompletionSeen,
    dispose: () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
    },
  };
}

function extractOpenCodeTextFromRawStdout(stdout: string): string {
  const text: string[] = [];
  for (const line of stdout.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (
        parsed &&
        typeof parsed === 'object' &&
        (parsed as { type?: unknown }).type === 'text'
      ) {
        const part = (parsed as { part?: unknown }).part;
        if (
          part &&
          typeof part === 'object' &&
          typeof (part as { text?: unknown }).text === 'string'
        ) {
          text.push((part as { text: string }).text);
        }
      }
    } catch {
      // Non-JSON stdout is handled by the normal diagnostics path.
    }
  }
  return text.join('');
}

const OPENCODE_OUTDATED_CLI_DETAIL =
  'OpenCode CLI appears to be outdated or incompatible with this connection test. Update it with `npm i -g opencode-ai@latest`, then retry the OpenCode connection test.';

function openCodeOutdatedCliDetail(output: string): string | null {
  const value = output.toLowerCase();
  const looksLikeOpenCodeHelp =
    /\bopencode\b/u.test(value) && /\b(?:usage|commands|options):/u.test(value);
  const looksLikeUnsupportedArgs =
    /\b(?:unknown option|unknown argument|unexpected argument|unrecognized option|invalid option|incompatible opencode args)\b/u.test(value);

  return looksLikeOpenCodeHelp || looksLikeUnsupportedArgs
    ? OPENCODE_OUTDATED_CLI_DETAIL
    : null;
}

interface AgentSpawnHandle {
  child: ReturnType<typeof spawn>;
  acpSession?: {
    hasFatalError?: () => boolean;
    completedSuccessfully?: () => boolean;
  } | null;
}

function attachAgentStreamHandlers(
  def: { streamFormat?: string; eventParser?: string; id: string; promptViaStdin?: boolean },
  child: ReturnType<typeof spawn>,
  prompt: string,
  cwd: string,
  model: string | undefined,
  modelEnv: Record<string, string | undefined>,
  liveModelScope: string | null,
  send: (event: string, payload: unknown) => void,
  appendRawStdout?: (chunk: string) => void,
): AgentSpawnHandle {
  let acpSession: {
    hasFatalError?: () => boolean;
    completedSuccessfully?: () => boolean;
  } | null = null;
  child.stdout?.setEncoding('utf8');
  child.stderr?.setEncoding('utf8');
  if (def.streamFormat === 'claude-stream-json') {
    const claude = createClaudeStreamHandler((ev: unknown) => send('agent', ev));
    child.stdout?.on('data', (chunk: string) => {
      appendRawStdout?.(chunk);
      claude.feed(chunk);
    });
    child.on('close', () => claude.flush());
  } else if (def.streamFormat === 'copilot-stream-json') {
    const copilot = createCopilotStreamHandler((ev: unknown) => send('agent', ev));
    child.stdout?.on('data', (chunk: string) => copilot.feed(chunk));
    child.on('close', () => copilot.flush());
  } else if (def.streamFormat === 'pi-rpc') {
    acpSession = attachPiRpcSession({
      child,
      prompt,
      cwd,
      model: model ?? null,
      send,
      imagePaths: [],
    });
  } else if (def.streamFormat === 'acp-json-rpc') {
    acpSession = attachAcpSession({
      child,
      prompt,
      cwd,
      // Same substitution as the chat-run path in server.ts — adapters whose
      // CLI rejects the synthetic 'default' (e.g. AMR / vela, which forces
      // session/set_model before session/prompt) need the def's first
      // concrete fallback id here too, otherwise Test connection deadlocks
      // on the same `session/set_model must be called before session/prompt`
      // error the chat-run path already handles.
      model: resolveModelForAgent(def as never, model ?? null, modelEnv, liveModelScope),
      mcpServers: [],
      send,
    });
  } else if (def.streamFormat === 'json-event-stream') {
    const handler = createJsonEventStreamHandler(
      def.eventParser || def.id,
      (ev: unknown) => {
        const data = (ev ?? {}) as { type?: unknown; message?: unknown };
        if (data.type === 'error') {
          send('error', {
            message:
              typeof data.message === 'string'
                ? data.message
                : 'agent stream error',
          });
          return;
        }
        send('agent', ev);
      },
    );
    child.stdout?.on('data', (chunk: string) => {
      appendRawStdout?.(chunk);
      handler.feed(chunk);
    });
    child.on('close', () => handler.flush());
  } else {
    child.stdout?.on('data', (chunk: string) => send('stdout', { chunk }));
  }
  child.stderr?.on('data', (chunk: string) => send('stderr', { chunk }));
  return { child, acpSession };
}

type AgentChild = ReturnType<typeof spawn>;
type AgentChildExit =
  | { kind: 'exit'; code: number | null; signal: NodeJS.Signals | null }
  | { kind: 'spawnError'; error: Error };

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

function runQuietCommand(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: 'ignore',
      shell: false,
    });
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (code === 0 && !signal) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} exited with ${signal || code}`));
    });
  });
}

async function prepareOpenCodeConnectionTestCwd(tempDir: string): Promise<void> {
  await fsp.writeFile(
    path.join(tempDir, 'README.md'),
    'Open Design OpenCode connection test.\n',
    'utf8',
  );
  try {
    await runQuietCommand('git', ['init'], tempDir);
  } catch {
    // OpenCode responds more reliably inside a git worktree, but a missing or
    // misconfigured local git binary must not sink an otherwise healthy CLI.
  }
}

async function testAgentConnectionInternal(
  input: AgentConnectionInput,
): Promise<ConnectionTestResponse> {
  const start = Date.now();
  const model =
    typeof input.model === 'string' && input.model.trim()
      ? input.model.trim()
      : 'default';
  const def = getAgentDef(input.agentId);
  if (!def) {
    return {
      ok: false,
      kind: 'agent_not_installed',
      latencyMs: Date.now() - start,
      model,
      agentName: input.agentId,
      detail: `Unknown agent id: ${input.agentId}`,
      diagnostics: { phase: 'binary_resolution' },
    };
  }
  const configuredAgentEnv = agentCliEnvForAgent(
    validateAgentCliEnv(input.agentCliEnv),
    input.agentId,
  );
  const executableResolution = resolveAgentLaunch(def, configuredAgentEnv);
  const resolvedBin = executableResolution.selectedPath;
  if (!resolvedBin || !executableResolution.launchPath) {
    return {
      ok: false,
      kind: 'agent_not_installed',
      latencyMs: Date.now() - start,
      model,
      agentName: def.name,
      diagnostics: { phase: 'binary_resolution' },
    };
  }

  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'od-conn-test-'));
  let child: AgentChild | null = null;
  let childExit: Promise<AgentChildExit> | null = null;
  let childClosed = false;
  let promptFile: PreparedPromptFile | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let abortHandler: (() => void) | null = null;
  const sink = createAgentSink();

  // Phase tracker for structured diagnostics (#2248). The order matches
  // the lifecycle: binary_resolution → spawn → connection_smoke_test →
  // output_parse. Each result helper below stamps the *current* phase
  // into the response so consumers don't have to scrape `detail` to
  // know how far the test got. Phase is mutated at the points where
  // the daemon meaningfully advances (just before spawn, when the
  // child first produces stdout, etc.) — not on every event.
  let phase: ConnectionTestPhase = 'binary_resolution';
  const buildDiagnostics = (
    overrides: Partial<ConnectionTestDiagnostics> = {},
  ): ConnectionTestDiagnostics => {
    const rawStderr = sink.getStderrTail().trim();
    const rawStdout = sink.getRawStdoutTail().trim();
    // `exactOptionalPropertyTypes: true` means we can't pass `undefined`
    // to an optional field directly — conditionally spread instead so
    // empty values just don't appear in the response.
    return {
      phase,
      ...(executableResolution.launchPath
        ? { binaryPath: executableResolution.launchPath }
        : {}),
      ...(rawStderr ? { stderrTail: redactSecrets(rawStderr) } : {}),
      ...(rawStdout ? { stdoutTail: redactSecrets(rawStdout) } : {}),
      ...overrides,
    };
  };

  const resultFromAgentText = (
    text: string,
    exit?: { code: number | null; signal: NodeJS.Signals | null },
  ): ConnectionTestResponse => {
    const latencyMs = Date.now() - start;
    const rawSample = truncateSample(text);
    const sample = redactSecrets(rawSample);
    if (rawSample && isLikelyModelErrorText(rawSample)) {
      const detail = redactSecrets(smokeFailureDetail(rawSample));
      console.warn(
        `[test:agent] ${def.name} → not_found_model: ${detail}`,
      );
      return {
        ok: false,
        kind: 'not_found_model',
        latencyMs,
        model,
        agentName: def.name,
        detail,
        diagnostics: buildDiagnostics({
          phase: 'output_parse',
          ...(exit ? { exitCode: exit.code, signal: exit.signal } : {}),
        }),
      };
    }
    if (!isSmokeOkReply(text)) {
      console.warn(
        `[test:agent] ${def.name} → connected_unexpected_sample: ${sample}`,
      );
    }
    console.log(`[test:agent] ${def.name} → ok in ${(latencyMs / 1000).toFixed(1)}s`);
    // resultFromChildExit can route ACP forced shutdown (code === null,
    // signal === 'SIGTERM' + acpCleanCompletion) through this success
    // helper. Hard-coding `exitCode: 0` would silently overwrite the
    // SIGTERM signal and violate the raw code/signal contract in
    // packages/contracts/src/api/connectionTest.ts. Pass through the
    // real `winner.code` / `winner.signal` when the caller has them and
    // only synthesize `exitCode: 0` when no exit context is available
    // (theoretical text-without-exit path).
    return {
      ok: true,
      kind: 'success',
      latencyMs,
      model,
      agentName: def.name,
      sample,
      diagnostics: buildDiagnostics(
        exit
          ? { phase: 'connection_smoke_test', exitCode: exit.code, signal: exit.signal }
          : { phase: 'connection_smoke_test', exitCode: 0 },
      ),
    };
  };

  const resultFromStreamError = (error: unknown): ConnectionTestResponse => {
    const latencyMs = Date.now() - start;
    const detail = redactSecrets(
      error instanceof Error ? error.message : String(error),
    );
    const auth = classifyAgentAuthFailure(input.agentId, detail);
    if (auth?.status === 'missing') {
      console.warn(`[test:agent] ${def.name} → auth_required: ${detail}`);
      return {
        ok: false,
        kind: 'agent_auth_required',
        latencyMs,
        model,
        agentName: def.name,
        detail: auth.message ?? cursorAuthGuidance(),
        diagnostics: buildDiagnostics(),
      };
    }
    if (detail && isLikelyModelErrorText(detail)) {
      console.warn(
        `[test:agent] ${def.name} → not_found_model: ${detail}`,
      );
      return {
        ok: false,
        kind: 'not_found_model',
        latencyMs,
        model,
        agentName: def.name,
        detail,
        diagnostics: buildDiagnostics({ phase: 'output_parse' }),
      };
    }
    console.warn(
      `[test:agent] ${def.name} → stream_error: ${detail}`,
    );
    return {
      ok: false,
      kind: 'agent_spawn_failed',
      latencyMs,
      model,
      agentName: def.name,
      detail,
      diagnostics: buildDiagnostics(),
    };
  };

  const resultFromCancellation = (
    kind: 'timeout' | 'aborted',
  ): ConnectionTestResponse => {
    const latencyMs = Date.now() - start;
    console.warn(`[test:agent] ${def.name} → ${kind} in ${(latencyMs / 1000).toFixed(1)}s`);
    return {
      ok: false,
      kind: 'timeout',
      latencyMs,
      model,
      agentName: def.name,
      diagnostics: buildDiagnostics(),
    };
  };

  try {
    if (input.agentId === 'opencode' || input.agentId === 'mimo') {
      if (input.agentId === 'opencode') await prepareOpenCodeConnectionTestCwd(tempDir);
    }
    let args: string[];
    try {
      promptFile = await preparePromptFileForAgent(def, SMOKE_PROMPT, 'connection-test');
      args = def.buildArgs(
        SMOKE_PROMPT,
        [],
        [],
        { model: input.model ?? null, reasoning: input.reasoning ?? null },
        {
          cwd: tempDir,
          ...(promptFile ? { promptFilePath: promptFile.path } : {}),
        },
      );
      // Connection tests should validate the adapter's core CLI path, not
      // fail on unrelated user-installed OpenCode plugins. `opencode run
      // --pure` keeps the smoke test isolated while regular chat runs retain
      // the user's full plugin environment.
      if ((input.agentId === 'opencode' || input.agentId === 'mimo') && !args.includes('--pure')) {
        args.push('--pure');
      }
      if ((input.agentId === 'opencode' || input.agentId === 'mimo') && !args.includes('--title')) {
        args.push('--title', 'Connection test');
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      // buildArgs runs *after* binary resolution but *before* spawn, so
      // phase is still 'binary_resolution' here. Stamp diagnostics so the
      // contract advertised in packages/contracts/src/api/connectionTest.ts
      // ("Always set on local agent test responses") actually holds.
      return {
        ok: false,
        kind: 'agent_spawn_failed',
        latencyMs: Date.now() - start,
        model,
        agentName: def.name,
        detail: redactSecrets(detail),
        diagnostics: buildDiagnostics(),
      };
    }
    const stdinMode =
      def.promptViaStdin || def.streamFormat === 'acp-json-rpc' ? 'pipe' : 'ignore';
    const baseEnv = spawnEnvForAgent(
      input.agentId,
      {
        ...process.env,
        ...(def.env || {}),
      },
      configuredAgentEnv,
      undefined,
      { resolvedBin: executableResolution.selectedPath },
    );
    const liveModelScope = input.agentId === 'amr' ? resolveAmrProfile(baseEnv) : null;
    const mmdRouteLaunchEnv = input.agentId === 'claude'
      ? await loadMmdRouteLaunchEnv(
          {
            ...process.env,
            ...(def.env || {}),
            ...configuredAgentEnv,
          },
          model,
        ).catch(() => null)
      : null;
    const env = applyAgentLaunchEnv({
      ...baseEnv,
      ...(mmdRouteLaunchEnv || {}),
    }, executableResolution);
    const auth = await probeAgentAuthStatus(def, executableResolution.launchPath, env);
    if (auth?.status === 'missing') {
      // Preflight auth probe runs after binary resolution but before the
      // smoke spawn — phase is still 'binary_resolution'. The smoke
      // sink is empty here (no spawn happened), so the probe itself is
      // the only source of stderr/stdout/exit context. Fold what the
      // probe captured into the diagnostics block; `...overrides` in
      // buildDiagnostics() lets these win over the empty sink tails.
      const probeOverrides: Partial<ConnectionTestDiagnostics> = {};
      if (auth.stdoutTail) probeOverrides.stdoutTail = redactSecrets(auth.stdoutTail);
      if (auth.stderrTail) probeOverrides.stderrTail = redactSecrets(auth.stderrTail);
      if (auth.exitCode !== undefined) probeOverrides.exitCode = auth.exitCode;
      if (auth.signal !== undefined) probeOverrides.signal = auth.signal;
      return {
        ok: false,
        kind: 'agent_auth_required',
        latencyMs: Date.now() - start,
        model,
        agentName: def.name,
        detail: auth.message ?? cursorAuthGuidance(),
        diagnostics: buildDiagnostics(probeOverrides),
      };
    }
    const invocation = createCommandInvocation({
      command: executableResolution.launchPath,
      args,
      env,
    });
    // We are about to hand off to child_process.spawn(). Any failure
    // from here on (ENOENT, bad argv, non-zero exit) belongs to the
    // 'spawn' phase rather than 'binary_resolution', so flip the tracker
    // *before* spawning. resultFromAgentText flips it again to
    // 'connection_smoke_test' / 'output_parse' once we get text out.
    phase = 'spawn';
    child = spawn(invocation.command, invocation.args, {
      env,
      stdio: [stdinMode, 'pipe', 'pipe'],
      cwd: tempDir,
      shell: false,
      windowsVerbatimArguments: invocation.windowsVerbatimArguments,
    });
    childExit = new Promise<AgentChildExit>((resolve) => {
      child!.once('error', (err) => {
        childClosed = true;
        resolve({ kind: 'spawnError', error: err });
      });
      child!.once('close', (code, signal) => {
        childClosed = true;
        resolve({ kind: 'exit', code, signal });
      });
    });

    const { acpSession } = attachAgentStreamHandlers(
      def,
      child,
      SMOKE_PROMPT,
      tempDir,
      input.model,
      env,
      liveModelScope,
      sink.send,
      sink.appendRawStdout,
    );

    const resultFromChildExit = async (
      winner: AgentChildExit,
    ): Promise<ConnectionTestResponse> => {
      if (winner.kind === 'spawnError') {
        const latencyMs = Date.now() - start;
        const detail = redactSecrets(winner.error.message);
        const guidance = redactSecrets(
          `${codexExecutableGuidance(
            input.agentId,
            executableResolution.configuredOverridePath,
            executableResolution.pathResolvedPath,
          )}${executableResolution.diagnostic ? ` ${executableResolution.diagnostic}` : ''}`,
        );
        const errnoCode = (winner.error as NodeJS.ErrnoException).code;
        const isMissing = errnoCode === 'ENOENT';
        console.warn(
          `[test:agent] ${def.name} → spawn_failed: ${detail}${guidance}`,
        );
        return {
          ok: false,
          kind: isMissing ? 'agent_not_installed' : 'agent_spawn_failed',
          latencyMs,
          model,
          agentName: def.name,
          detail: `${detail}${guidance}`,
          diagnostics: buildDiagnostics({
            phase: isMissing ? 'binary_resolution' : 'spawn',
          }),
        };
      }

      // On Windows, short-lived JSON-stream CLIs can deliver the process
      // close event before all stdout chunks have reached the parser.
      await delay(AGENT_STDOUT_DRAIN_MS);
      const latencyMs = Date.now() - start;
      const buffered = sink.getText().trim();
      const claudeResult = input.agentId === 'claude'
        ? parseClaudeResultFrame(sink.getRawStdout())
        : null;
      const claudeReportedSuccess =
        !!claudeResult &&
        !claudeResult.isError &&
        claudeResult.subtype === 'success';
      const claudeLateExitOne =
        input.agentId === 'claude' &&
        winner.code === 1 &&
        winner.signal === null;
      const parsedClaudeResultText =
        claudeReportedSuccess ? claudeResult.resultText.trim() : '';
      const visibleText = buffered || parsedClaudeResultText;
      // ACP agents that don't shut down on stdin.end() are terminated after a
      // clean prompt completion. Depending on the ACP bridge, this can surface
      // either as SIGTERM or as a normal code 130 teardown. For those exact
      // forced-shutdown shapes we trust the ACP-level success signal so
      // connection tests don't report `agent_spawn_failed` despite a healthy
      // assistant response (see #1265 / #1286).
      //
      // Scope the override narrowly: only the known daemon-triggered ACP
      // teardown shapes plus `acpCleanCompletion` count as a clean forced
      // shutdown. Any other post-response process failure (code 1, SIGKILL,
      // SIGSEGV, etc.) still falls through to `agent_spawn_failed`, preserving
      // the existing connection-test failure behavior for genuine
      // post-response problems.
      const acpCleanCompletion =
        typeof acpSession?.completedSuccessfully === 'function' &&
        acpSession.completedSuccessfully();
      const acpForcedShutdown =
        acpCleanCompletion &&
        (
          (winner.code === null && winner.signal === 'SIGTERM') ||
          (winner.code === 130 && winner.signal === null)
        );
      const claudeCompletedTurn =
        claudeLateExitOne &&
        claudeReportedSuccess &&
        (
          sink.sawTerminalCompletion() ||
          (
            isTerminalCompletionStopReason(claudeResult.stopReason)
          )
        );
      const exitedCleanly =
        (winner.code === 0 && !winner.signal) || acpForcedShutdown || claudeCompletedTurn;
      if (visibleText) {
        const rawSample = truncateSample(visibleText);
        const exitInfo = { code: winner.code, signal: winner.signal };
        if (rawSample && isLikelyModelErrorText(rawSample)) {
          return resultFromAgentText(visibleText, exitInfo);
        }
        if (exitedCleanly) return resultFromAgentText(visibleText, exitInfo);
      }
      const stderrTail = sink.getStderrTail().trim();
      const rawStdoutTail = sink.getRawStdoutTail().trim();
      if ((input.agentId === 'opencode' || input.agentId === 'mimo') && exitedCleanly && rawStdoutTail) {
        const recoveredText = extractOpenCodeTextFromRawStdout(rawStdoutTail).trim();
        if (recoveredText) {
          return resultFromAgentText(recoveredText, {
            code: winner.code,
            signal: winner.signal,
          });
        }
      }
      const acpFatal = Boolean(acpSession?.hasFatalError?.());
      const rawDetail = [
        winner.code != null ? `exit ${winner.code}` : null,
        winner.signal ? `signal ${winner.signal}` : null,
        stderrTail ? `stderr: ${stderrTail.slice(-200)}` : null,
        rawStdoutTail || buffered
          ? `stdout: ${(rawStdoutTail || buffered).slice(-200)}`
          : null,
      ]
        .filter(Boolean)
        .join(' · ');
      if (input.agentId === 'opencode') {
        const outdatedCliDetail = openCodeOutdatedCliDetail(rawDetail);
        if (outdatedCliDetail) {
          console.warn(
            `[test:agent] ${def.name} → outdated_cli: ${redactSecrets(rawDetail)}`,
          );
          return {
            ok: false,
            kind: 'agent_spawn_failed',
            latencyMs,
            model,
            agentName: def.name,
            detail: outdatedCliDetail,
            diagnostics: buildDiagnostics({
              phase: 'spawn',
              exitCode: winner.code,
              signal: winner.signal,
            }),
          };
        }
      }
      const auth = classifyAgentAuthFailure(input.agentId, rawDetail);
      if (auth?.status === 'missing') {
        console.warn(`[test:agent] ${def.name} → auth_required: ${redactSecrets(rawDetail)}`);
        return {
          ok: false,
          kind: 'agent_auth_required',
          latencyMs,
          model,
          agentName: def.name,
          detail: auth.message ?? cursorAuthGuidance(),
          diagnostics: buildDiagnostics({
            phase: 'connection_smoke_test',
            exitCode: winner.code,
            signal: winner.signal,
          }),
        };
      }
      const claudeDiagnostic = diagnoseClaudeCliFailure({
        agentId: input.agentId,
        exitCode: winner.code,
        signal: winner.signal,
        stderrTail,
        stdoutTail: sink.getRawStdout() || rawStdoutTail || visibleText,
        env,
        resolvedBin: executableResolution.selectedPath,
      });
      if (claudeDiagnostic) {
        console.warn(
          `[test:agent] ${def.name} → claude_diagnostic: ${claudeDiagnostic.detail}`,
        );
        return {
          ok: false,
          kind: 'agent_spawn_failed',
          latencyMs,
          model,
          agentName: def.name,
          detail: claudeDiagnostic.detail,
          diagnostics: buildDiagnostics({
            phase: 'spawn',
            exitCode: winner.code,
            signal: winner.signal,
          }),
        };
      }
      const detail = redactSecrets(
        rawDetail,
      );
      const guidance = redactSecrets(
        `${codexExecutableGuidance(
          input.agentId,
          executableResolution.configuredOverridePath,
          executableResolution.pathResolvedPath,
        )}${executableResolution.diagnostic ? ` ${executableResolution.diagnostic}` : ''}`,
      );
      const label = buffered ? 'exit_failed' : 'no_text';
      console.warn(
        `[test:agent] ${def.name} → ${label} (${detail || 'no detail'}${guidance})`,
      );
      return {
        ok: false,
        kind: acpFatal || !exitedCleanly ? 'agent_spawn_failed' : 'unknown',
        latencyMs,
        model,
        agentName: def.name,
        detail:
          `${detail || 'Agent exited without producing assistant text'}${guidance}`,
        diagnostics: buildDiagnostics({
          phase: buffered ? 'output_parse' : 'spawn',
          exitCode: winner.code,
          signal: winner.signal,
        }),
      };
    };

    if (def.promptViaStdin && child.stdin && def.streamFormat !== 'pi-rpc') {
      child.stdin.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code !== 'EPIPE') {
          sink.send('error', {
            message: `stdin: ${err.message}`,
          });
        }
      });
      child.stdin.end(formatPromptForAgentStdin(def, SMOKE_PROMPT), 'utf8');
    }
    const cancellationPromise = new Promise<{ kind: 'timeout' } | { kind: 'aborted' }>((resolve) => {
      timer = setTimeout(() => resolve({ kind: 'timeout' }), agentTimeoutMs());
      abortHandler = () => resolve({ kind: 'aborted' });
      if (input.signal?.aborted) {
        abortHandler();
      } else {
        input.signal?.addEventListener('abort', abortHandler, { once: true });
      }
    });
    const streamError = sink.streamError.then((error) => ({
      kind: 'streamError' as const,
      error,
    }));

    const winner = await Promise.race([
      sink.result,
      childExit,
      cancellationPromise,
    ]);

    if (winner.kind === 'text') {
      const completion = await Promise.race([
        streamError,
        childExit,
        cancellationPromise,
      ]);
      if (completion.kind === 'streamError') {
        return resultFromStreamError(completion.error);
      }
      if (completion.kind === 'timeout' || completion.kind === 'aborted') {
        return resultFromCancellation(completion.kind);
      }
      return await resultFromChildExit(completion);
    }
    if (winner.kind === 'streamError') {
      return resultFromStreamError(winner.error);
    }
    if (winner.kind === 'timeout' || winner.kind === 'aborted') {
      return resultFromCancellation(winner.kind);
    }
    return await resultFromChildExit(winner);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    // Outer catch — the failure may have happened at any phase between
    // binary_resolution and output_parse, so stamp the current phase as
    // observed. buildDiagnostics is defined in the enclosing scope and
    // is safe to call here.
    return {
      ok: false,
      kind: 'agent_spawn_failed',
      latencyMs: Date.now() - start,
      model,
      agentName: def.name,
      detail: redactSecrets(detail),
      diagnostics: buildDiagnostics(),
    };
  } finally {
    if (timer) clearTimeout(timer);
    if (abortHandler) {
      input.signal?.removeEventListener('abort', abortHandler);
    }
    sink.dispose();
    if (child && !childClosed) {
      try {
        child.kill('SIGTERM');
      } catch {
        // Already gone — nothing to do.
      }
      const closedAfterTerm = childExit
        ? await Promise.race([
            childExit.then(() => true),
            delay(AGENT_KILL_GRACE_MS).then(() => false),
          ])
        : false;
      if (!closedAfterTerm && !childClosed) {
        try {
          child.kill('SIGKILL');
        } catch {
          // Already gone — nothing to do.
        }
        if (childExit) {
          await Promise.race([
            childExit.catch(() => null),
            delay(AGENT_KILL_GRACE_MS),
          ]);
        }
      }
    }
    await fsp
      .rm(tempDir, { recursive: true, force: true })
      .catch(() => {
        // Best-effort cleanup; the OS reaps /tmp eventually.
      });
    await promptFile?.cleanup().catch(() => {
      // Best-effort cleanup; the OS reaps /tmp eventually.
    });
  }
}

export async function testAgentConnection(
  input: AgentConnectionInput,
): Promise<ConnectionTestResponse> {
  const primaryResult = await testAgentConnectionInternal(input);
  const validatedPrefs = validateAgentCliEnv(input.agentCliEnv);
  const configuredCodexBin = validatedPrefs?.codex?.CODEX_BIN?.trim() || '';
  const configuredAgentEnv = agentCliEnvForAgent(validatedPrefs, input.agentId);
  const def = getAgentDef(input.agentId);
  const executableResolution = def
    ? resolveAgentLaunch(def, configuredAgentEnv)
    : {
        configuredOverridePath: null,
        pathResolvedPath: null,
        selectedPath: null,
        launchPath: null,
        launchKind: 'selected' as const,
        childPathPrepend: [],
        diagnostic: null,
      };
  if (
    input.agentId === 'codex' &&
    primaryResult.ok &&
    configuredCodexBin
  ) {
    if (executableResolution.configuredOverridePath) {
      return {
        ...primaryResult,
        configuredExecutablePath: executableResolution.configuredOverridePath,
        usedExecutablePath: executableResolution.launchPath ?? executableResolution.configuredOverridePath,
        usedExecutableSource: 'configured',
        ...(executableResolution.pathResolvedPath
          ? { detectedExecutablePath: executableResolution.pathResolvedPath }
          : {}),
        detail: redactSecrets(
          codexConfiguredPathSuccessDetail(
            executableResolution.configuredOverridePath,
          ),
        ),
      };
    }
    if (executableResolution.pathResolvedPath) {
      return {
        ...primaryResult,
        configuredExecutablePath: configuredCodexBin,
        detectedExecutablePath: executableResolution.pathResolvedPath,
        usedExecutablePath: executableResolution.launchPath ?? executableResolution.pathResolvedPath,
        usedExecutableSource: 'fallback_invalid',
        detail: redactSecrets(
          codexInvalidConfiguredPathFallbackDetail(
            configuredCodexBin,
            executableResolution.pathResolvedPath,
          ),
        ),
      };
    }
  }
  if (
    input.agentId !== 'codex' ||
    primaryResult.ok ||
    !new Set<ConnectionTestKind>(['agent_spawn_failed', 'agent_not_installed', 'unknown']).has(primaryResult.kind) ||
    !executableResolution.configuredOverridePath ||
    !executableResolution.pathResolvedPath ||
    executableResolution.configuredOverridePath === executableResolution.pathResolvedPath
  ) {
    return primaryResult;
  }
  const fallbackResult = await testAgentConnectionInternal(
    {
      ...input,
      agentCliEnv: stripCodexBinOverride(validatedPrefs),
    },
  );
  if (!fallbackResult.ok) {
    return primaryResult;
  }
  return {
    ...fallbackResult,
    configuredExecutablePath: executableResolution.configuredOverridePath,
    detectedExecutablePath: executableResolution.pathResolvedPath,
    usedExecutablePath: executableResolution.launchPath ?? executableResolution.pathResolvedPath,
    usedExecutableSource: 'fallback_failed',
    detail: redactSecrets(
      codexExecutableFallbackSuccessDetail(
        executableResolution.configuredOverridePath,
        executableResolution.pathResolvedPath,
      ),
    ),
  };
}
