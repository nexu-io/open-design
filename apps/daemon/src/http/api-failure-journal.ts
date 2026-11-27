import { recordDiagnosticFailure } from '../services/diagnostics-evidence.js';
const MAX_RECENT_API_FAILURES = 100;

export interface RecentApiFailure {
  at: string;
  method: string;
  path: string;
  status: number;
  code: string;
  retryable: boolean;
  requestId?: string;
}

export interface ApiFailureToRecord extends Omit<RecentApiFailure, 'method' | 'path'> {
  request?: {
    method?: string;
    route?: { path?: unknown };
  };
  /** Privacy-safe path shape for a response no route produced; see api-not-found.ts. */
  routeTemplate?: string;
}

const failures: RecentApiFailure[] = [];
const listeners = new Set<(failure: RecentApiFailure) => void>();
export function observeApiFailures(listener: (failure: RecentApiFailure) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/**
 * Reduce a declared RegExp route to a template of its literal segments, with
 * each capture group replaced by its `req.params` index. Returns null for any
 * pattern outside that literal-plus-capture shape, so nothing derived from an
 * unrecognized regex can leak into diagnostics.
 */
export function regExpRouteTemplate(pattern: RegExp): string | null {
  let index = 0;
  const template = pattern.source
    .replace(/^\^|\$$/gu, '')
    .replace(/\((?:\[\^\/\]\+|\.\+)\)/gu, () => `:${index++}`)
    .replaceAll('\\/', '/');
  return /^\/api(?:\/(?:[\w-]+|:\d+))*$/u.test(template) ? template : null;
}

function diagnosticRouteTemplate(request: ApiFailureToRecord['request']): string {
  const routePath = request?.route?.path;
  if (routePath instanceof RegExp) {
    return regExpRouteTemplate(routePath) ?? '/api/:unmatched';
  }
  if (typeof routePath !== 'string' || routePath.length === 0) {
    return '/api/:unmatched';
  }

  const normalizedRoutePath = routePath.startsWith('/') ? routePath : `/${routePath}`;
  if (normalizedRoutePath === '/api' || normalizedRoutePath.startsWith('/api/')) {
    return normalizedRoutePath;
  }

  // A mounted router's concrete baseUrl can contain user-controlled values.
  // Keep its declared child route but replace the mount point with a marker.
  return `/api/:mounted${normalizedRoutePath}`;
}

export function recordApiFailure(failure: ApiFailureToRecord): void {
  const { request, routeTemplate, ...metadata } = failure;
  const path = routeTemplate ?? diagnosticRouteTemplate(request);
  recordDiagnosticFailure({ source: 'local-api', operation: path, status: failure.status, requestId: failure.requestId });
  const entry: RecentApiFailure = {
    ...metadata,
    method: request?.method?.toUpperCase() ?? 'UNKNOWN',
    path,
  };
  failures.push(entry);
  for (const listener of listeners) { try { listener({ ...entry }); } catch { /* diagnostics cannot break API errors */ } }
  if (failures.length > MAX_RECENT_API_FAILURES) {
    failures.splice(0, failures.length - MAX_RECENT_API_FAILURES);
  }
}

export function readRecentApiFailures(): RecentApiFailure[] {
  return failures.map((failure) => ({ ...failure }));
}

/** Test-only reset for this process-local diagnostic journal. */
export function clearRecentApiFailures(): void {
  failures.length = 0;
}
