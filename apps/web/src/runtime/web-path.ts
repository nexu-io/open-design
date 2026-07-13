import { createPathConfig, type PathConfig } from '@open-design/path-config';

export const webPathConfig: PathConfig = createPathConfig(process.env.NEXT_PUBLIC_OD_WEB_BASE_PATH);

export function withWebBasePath(path: string): string {
  return webPathConfig.withBasePath(path);
}

export function apiPath(path = ''): string {
  return webPathConfig.api(path);
}

export function assetPath(path: string): string {
  return webPathConfig.asset(path);
}

export function publicPath(path: string): string {
  return webPathConfig.publicPath(path);
}

export function stripWebBasePath(pathname: string) {
  return webPathConfig.stripBasePath(pathname);
}

function prefixRequestInput(input: RequestInfo | URL): RequestInfo | URL {
  if (typeof input === 'string') {
    // External and relative content URLs are not application routes. Only
    // root-relative paths can be safely prefixed without changing their
    // origin or document-relative semantics.
    return input.startsWith('/') && !input.startsWith('//') ? withWebBasePath(input) : input;
  }
  if (input instanceof URL) {
    if (typeof window === 'undefined' || input.origin !== window.location.origin) return input;
    return new URL(withWebBasePath(`${input.pathname}${input.search}${input.hash}`), input.origin);
  }

  const url = new URL(input.url);
  if (typeof window === 'undefined' || url.origin !== window.location.origin) return input;
  return new Request(
    new URL(withWebBasePath(`${url.pathname}${url.search}${url.hash}`), url.origin),
    input,
  );
}

/** Explicit fetch wrapper for same-origin application paths. */
export function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(prefixRequestInput(input), init);
}

export function apiEventSource(path: string, eventSourceInitDict?: EventSourceInit): EventSource {
  return new EventSource(withWebBasePath(path), eventSourceInitDict);
}
