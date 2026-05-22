// Feature-flag gate for the history feature (#1241).
//
// Off by default in the first PR so the change lands without
// user-visible behavior change. Callers read through this helper
// rather than checking the env var directly so the flag's shape
// (per-project opt-in, deny-list, etc.) can evolve in one place.

export const HISTORY_FEATURE_FLAG_ENV = 'OD_GIT_INTEGRATION_ENABLED';

/**
 * True when OD_GIT_INTEGRATION_ENABLED is set to `1`/`true`/`yes`
 * (case-insensitive). Any other value, including unset, is off.
 */
export function isHistoryEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = (env[HISTORY_FEATURE_FLAG_ENV] ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}
