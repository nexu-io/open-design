const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * Render how long a sidecar has been running, from the ISO start time its
 * STATUS snapshot reports. A dev sidecar is reused across `tools-dev start`
 * invocations and can stay up for days, so the absolute age is the only signal
 * that tells a caller the process it is inspecting is not the one it just
 * asked for. Returns null when the snapshot carries no usable start time (or a
 * future one, which means the clock moved) so callers omit the field instead of
 * printing a guess.
 */
export function formatUptime(startedAt: string | null | undefined, nowMs: number = Date.now()): string | null {
  if (startedAt == null) return null;
  const startedAtMs = Date.parse(startedAt);
  if (!Number.isFinite(startedAtMs)) return null;
  const elapsedMs = nowMs - startedAtMs;
  if (elapsedMs < 0) return null;
  if (elapsedMs < MINUTE_MS) return "<1m";
  if (elapsedMs < HOUR_MS) return `${Math.floor(elapsedMs / MINUTE_MS)}m`;
  if (elapsedMs < DAY_MS) return `${Math.floor(elapsedMs / HOUR_MS)}h`;
  const days = Math.floor(elapsedMs / DAY_MS);
  const hours = Math.floor((elapsedMs - days * DAY_MS) / HOUR_MS);
  return hours === 0 ? `${days}d` : `${days}d ${hours}h`;
}
