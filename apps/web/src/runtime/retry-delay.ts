export function formatRetryDelayMs(ms: number): string {
  const seconds = Math.max(1, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.max(1, Math.round(seconds / 60))}m`;
}
