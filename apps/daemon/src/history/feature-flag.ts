// Feature-flag gate for the history feature (#1241).
//
// Off by default in the first PR so the change lands without
// user-visible behavior change. A follow-up PR will flip the default
// on after a release cycle of reference-deployment validation.
//
// Callers should read through this helper rather than checking the env
// var directly, so we have a single place to evolve the flag's shape
// (e.g., per-project opt-in, "deny-list of project ids that opt out")
// without touching every call site.

export const HISTORY_FEATURE_FLAG_ENV = 'OD_GIT_INTEGRATION_ENABLED';

/**
 * Returns true when the operator has explicitly enabled the history
 * feature via the OD_GIT_INTEGRATION_ENABLED env var. Accepts the
 * common truthy spellings (`1`, `true`, `yes`, case-insensitive); any
 * other value (including unset) is treated as off.
 */
export function isHistoryEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = (env[HISTORY_FEATURE_FLAG_ENV] ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}
