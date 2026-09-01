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
}

const failures: RecentApiFailure[] = [];

function diagnosticRouteTemplate(request: ApiFailureToRecord['request']): string {
  const routePath = request?.route?.path;
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
  const { request, ...metadata } = failure;
  failures.push({
    ...metadata,
    method: request?.method?.toUpperCase() ?? 'UNKNOWN',
    path: diagnosticRouteTemplate(request),
  });
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
