export interface PublicBaseUrlRequest {
  protocol?: string;
  get(name: string): string | undefined;
}

export interface PublicBaseUrlOptions {
  configuredBaseUrl?: unknown;
  fallbackPort?: unknown;
}

export type PublicBaseUrlResolver = (req: PublicBaseUrlRequest) => string;

export function createPublicBaseUrlResolver(
  options: PublicBaseUrlOptions = {},
): PublicBaseUrlResolver {
  return (req) => resolvePublicBaseUrl(req, options);
}

/**
 * Resolve the browser-facing origin used by OAuth redirects and daemon
 * proxy links. A configured public URL wins over request-derived routing;
 * otherwise Express supplies the protocol and host for the current request.
 */
export function resolvePublicBaseUrl(
  req: PublicBaseUrlRequest,
  options: PublicBaseUrlOptions = {},
): string {
  const configured = options.configuredBaseUrl;
  if (typeof configured === 'string' && /^https?:\/\//i.test(configured)) {
    return configured.replace(/\/+$/u, '');
  }

  const proto = req.protocol || 'http';
  const host = req.get('host');
  if (host) return `${proto}://${host}`;

  const port = typeof options.fallbackPort === 'string' && options.fallbackPort
    ? options.fallbackPort
    : '7456';
  return `http://localhost:${port}`;
}
