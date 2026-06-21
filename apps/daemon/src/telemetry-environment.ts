const DEFAULT_TELEMETRY_ENV = 'development';

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
