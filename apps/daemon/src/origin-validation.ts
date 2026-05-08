export interface ParsedHostHeader {
  hostname: string;
  host: string;
  port: string;
}

export interface RequestWithOriginHeaders {
  headers?: {
    host?: unknown;
    origin?: unknown;
  };
}

export function configuredAllowedOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env.OD_ALLOWED_ORIGINS || '';
  if (!raw.trim()) return [];
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => {
      const parsed = new URL(origin);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('OD_ALLOWED_ORIGINS only supports http:// and https:// origins');
      }
      return parsed.origin;
    });
}

export function configuredAllowedHosts(origins = configuredAllowedOrigins()): string[] {
  return origins.map((origin) => new URL(origin).host);
}

export function allowedBrowserPorts(
  port: number | string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): number[] {
  const ports = [];
  const primary = Number(port);
  if (primary) ports.push(primary);
  const webPort = Number(env.OD_WEB_PORT);
  if (webPort && webPort !== primary) ports.push(webPort);
  return ports;
}

export function parseHostHeader(value: unknown): ParsedHostHeader | null {
  const raw = String(headerValue(value) || '').trim();
  if (!raw) return null;
  try {
    const parsed = new URL(`http://${raw}`);
    return { hostname: parsed.hostname, host: parsed.host, port: parsed.port || '80' };
  } catch {
    return null;
  }
}

export function isPrivateIpv4(hostname: unknown): boolean {
  const parts = String(hostname || '').split('.');
  if (parts.length !== 4) return false;
  if (!parts.every((part) => /^\d+$/.test(part))) return false;
  const octets = parts.map((part) => Number(part));
  if (!octets.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) return false;
  const [a, b] = octets as [number, number, number, number];
  return (
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  );
}

export function isLoopbackOrPrivateLanHost(hostname: unknown): boolean {
  const host = String(hostname || '').toLowerCase();
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host === '[::1]' ||
    host === '0.0.0.0' ||
    host === '::' ||
    isPrivateIpv4(host)
  );
}

export function isAllowedBrowserHost(
  hostHeader: unknown,
  ports: number[],
  bindHost: string,
  extraAllowedOrigins: string[],
): boolean {
  const requestHost = parseHostHeader(hostHeader);
  if (!requestHost) return false;

  const loopbackHosts = ['127.0.0.1', 'localhost', '[::1]'];
  const explicitHosts = new Set([
    ...ports.flatMap((p) => [
      ...loopbackHosts.map((h) => `${h}:${p}`),
      `${bindHost}:${p}`,
    ]),
    ...configuredAllowedHosts(extraAllowedOrigins),
  ]);
  if (explicitHosts.has(requestHost.host)) return true;

  if (!ports.map(String).includes(requestHost.port)) return false;
  return isLoopbackOrPrivateLanHost(requestHost.hostname);
}

export function isAllowedBrowserOrigin(
  origin: unknown,
  hostHeader: unknown,
  ports: number[],
  bindHost: string,
  extraAllowedOrigins: string[],
): boolean {
  if (extraAllowedOrigins.includes(String(origin))) return true;

  let parsedOrigin;
  try {
    parsedOrigin = new URL(String(origin));
  } catch {
    return false;
  }
  if (parsedOrigin.protocol !== 'http:' && parsedOrigin.protocol !== 'https:') return false;

  const requestHost = parseHostHeader(hostHeader);
  if (!requestHost) return false;

  const schemes = ['http', 'https'];
  const loopbackHosts = ['127.0.0.1', 'localhost', '[::1]'];
  const explicitOrigins = new Set(
    ports.flatMap((p) => [
      ...schemes.flatMap((s) => loopbackHosts.map((h) => `${s}://${h}:${p}`)),
      ...schemes.map((s) => `${s}://${bindHost}:${p}`),
    ]),
  );
  if (explicitOrigins.has(String(origin))) return true;

  const originPort = parsedOrigin.port || (parsedOrigin.protocol === 'https:' ? '443' : '80');
  if (!ports.map(String).includes(originPort)) return false;
  if (parsedOrigin.hostname !== requestHost.hostname) return false;
  return isLoopbackOrPrivateLanHost(parsedOrigin.hostname);
}

export function isLocalSameOrigin(
  req: RequestWithOriginHeaders,
  port: number | string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const host = String(headerValue(req.headers?.host) || '');
  const origin = headerValue(req.headers?.origin);
  const ports = allowedBrowserPorts(port, env);
  const bindHost = env.OD_BIND_HOST || '127.0.0.1';
  const extraAllowedOrigins = configuredAllowedOrigins(env);

  const localHostAllowed = isAllowedBrowserHost(host, ports, bindHost, []);
  if (origin == null || origin === '') return localHostAllowed;
  if (!isAllowedBrowserHost(host, ports, bindHost, extraAllowedOrigins)) return false;
  return isAllowedBrowserOrigin(origin, host, ports, bindHost, extraAllowedOrigins);
}

function headerValue(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    const first = value[0];
    return first == null ? undefined : String(first);
  }
  return value == null ? undefined : String(value);
}
