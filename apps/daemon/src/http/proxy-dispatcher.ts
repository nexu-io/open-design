// Proxy-aware dispatcher construction for every daemon caller that has to
// honour the user's proxy configuration (Settings connection tests, BYOK chat
// routes, media routes, and the plugin asset fetchers).
//
// This lives outside `connectionTest.ts` so low-level HTTP modules — for
// example `plugins/plugin-asset-cache.ts` — can reach it without dragging in
// the whole connection-test dependency graph (agents, app-config, runtimes).

import { Agent, EnvHttpProxyAgent, Socks5ProxyAgent } from 'undici';
import type { Dispatcher, Pool } from 'undici';
import { mergeProxyAwareEnv, resolveSystemProxyEnv } from '@open-design/platform';

const LOOPBACK_NO_PROXY_TOKENS = ['localhost', '127.0.0.1', '[::1]'] as const;

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
