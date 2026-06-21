export function isTruthyEnvFlag(value: unknown): boolean {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

export function isApiAuthDisabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return isTruthyEnvFlag(env.OD_DISABLE_API_AUTH);
}

export function apiTokenFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  return (env.OD_API_TOKEN ?? '').trim();
}

export function isApiTokenMiddlewareEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return apiTokenFromEnv(env).length > 0 && !isApiAuthDisabled(env);
}

const apiTokenOpenProbePaths = new Set([
  '/health',
  '/api/health',
  '/ready',
  '/api/ready',
  '/version',
  '/api/version',
]);

const apiTokenOpenGetPaths = new Set([
  // Redacted admin-managed provider discovery. The route exposes availability
  // and display metadata only; credentials remain daemon-side.
  '/provider-orchestrator/config',
  '/api/provider-orchestrator/config',
]);

export function isApiTokenExemptRequest(method: string, path: string): boolean {
  if (apiTokenOpenProbePaths.has(path)) return true;
  if (method.toUpperCase() === 'GET' && apiTokenOpenGetPaths.has(path)) return true;
  return false;
}
