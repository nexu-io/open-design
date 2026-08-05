/** Pure request policy helpers for run-scoped tool authorization. */

export function bearerTokenFromAuthorizationHeader(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(value.trim());
  return match?.[1];
}

export function toolTokenValidationStatus(code: unknown): 401 | 403 {
  return code === 'TOOL_ENDPOINT_DENIED' || code === 'TOOL_OPERATION_DENIED' ? 403 : 401;
}

export function requestProjectOverride(projectId: unknown, tokenProjectId: unknown): boolean {
  return typeof projectId === 'string' && projectId.length > 0 && projectId !== tokenProjectId;
}

export function requestRunOverride(runId: unknown, tokenRunId: unknown): boolean {
  return typeof runId === 'string' && runId.length > 0 && runId !== tokenRunId;
}
