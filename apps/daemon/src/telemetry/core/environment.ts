/** @module core/environment
 * Resolves the active telemetry environment name (e.g. `production`,
 * `development`) from process env vars. A standalone, dependency-free primitive
 * consumed directly by analytics and Langfuse tracing; imports no sibling subdirectory.
 */

const DEFAULT_TELEMETRY_ENV = 'development';

/**
 * Resolves the telemetry environment label used to tag emitted analytics and
 * traces. Prefers an explicit override (`OD_TELEMETRY_ENV`, `OPEN_DESIGN_ENV`,
 * `POSTHOG_ENV`, or `LANGFUSE_ENVIRONMENT`, in that order); otherwise maps
 * `NODE_ENV=production` to `production` and falls back to `development`. Takes
 * the env bag as an argument so callers (and tests) can resolve against a
 * supplied environment rather than the process global.
 */
export function readTelemetryEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const explicit =
    env.OD_TELEMETRY_ENV?.trim() ||
    env.OPEN_DESIGN_ENV?.trim() ||
    env.POSTHOG_ENV?.trim() ||
    env.LANGFUSE_ENVIRONMENT?.trim();
  if (explicit) return explicit;
  if (env.NODE_ENV === 'production') return 'production';
  return DEFAULT_TELEMETRY_ENV;
}
