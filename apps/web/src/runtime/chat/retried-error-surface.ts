/** Client presentation only. Never changes the failed message or its diagnostics. */
export function retriedErrorSurfaceKey(projectId: string, conversationId: string): string {
  return `od:retried-error-surface:${JSON.stringify([projectId, conversationId])}`;
}

export function readRetriedErrorSurface(key: string): readonly string[] | null {
  try {
    const stored = window.sessionStorage.getItem(key);
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) && parsed.every((id) => typeof id === 'string')
      ? parsed
      : null;
  } catch {
    return null;
  }
}

export function writeRetriedErrorSurface(key: string, assistantIds: readonly string[]): void {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(assistantIds));
  } catch {
    // The owner also keeps an in-memory copy for restricted storage contexts.
  }
}
