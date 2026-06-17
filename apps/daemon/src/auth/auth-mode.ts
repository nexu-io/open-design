/**
 * Auth mode resolver for the Open Design daemon.
 *
 * Three mutually exclusive modes:
 *   - 'trusted-proxy': OD_TRUSTED_PROXY is set (any non-empty value)
 *   - 'access-token':  OD_ACCESS_TOKEN or OD_API_TOKEN is set
 *   - 'none':          no auth configured (loopback only)
 *
 * Cloudflare Access JWT validation has been removed. OD_BEHIND_PROXY,
 * OD_CF_ACCESS_TEAM_DOMAIN, OD_CF_ACCESS_AUD, and OD_CF_ACCESS_UNSAFE_DOMAIN
 * are no longer recognized auth signals.
 */

export type AuthMode = "none" | "trusted-proxy" | "access-token";

/**
 * Resolve the active authentication mode from environment variables.
 *
 * Priority:
 *   1. OD_TRUSTED_PROXY (any non-empty value) → trusted-proxy
 *   2. OD_ACCESS_TOKEN or OD_API_TOKEN (deprecated) → access-token
 *   3. Neither → none
 */
export function resolveAuthMode(
	env: NodeJS.ProcessEnv = process.env,
): AuthMode {
	if ((env.OD_TRUSTED_PROXY ?? "").trim()) return "trusted-proxy";
	if ((env.OD_ACCESS_TOKEN ?? env.OD_API_TOKEN ?? "").trim())
		return "access-token";
	return "none";
}
