/**
 * AMR profiles whose Vela backend serves the Workspace Team transports.
 *
 * Production joined this allowlist once its Vela backend was actually able to
 * serve the feature: `WORKSPACE_TEAM_ENABLED` (plus the three billing-scope
 * flags) is true on prod amr-api, and the resource hub it needs for team file
 * sharing is configured — an S3-backed blob store rather than the chart's mock
 * default, which would have failed every push with `unsupported protocol
 * scheme "mock"` while comments (Postgres) kept syncing.
 *
 * The second half of the gate below still applies to prod: without an injected
 * Vela web origin the transports stay dormant, so a build that forgets it
 * degrades to local-only instead of pointing at an unknown backend.
 */
const WORKSPACE_TEAM_AMR_PROFILES: ReadonlySet<string> = new Set([
  "feature-test",
  "prod",
  "test",
]);

/**
 * Resolve the exact daemon environment that a packaged build contributes to
 * Workspace Team. Both the baked profile and the injected Vela web origin are
 * required, so an incomplete test build stays dormant and a production build
 * cannot accidentally enable the unreleased transports.
 */
export function workspaceTeamTransportEnv(
  amrProfile: string | null | undefined,
  velaWebUrl: string | null | undefined,
): Record<string, string> {
  if (amrProfile == null || !WORKSPACE_TEAM_AMR_PROFILES.has(amrProfile)) {
    return {};
  }
  const webOrigin = velaWebUrl?.trim().replace(/\/+$/, "") ?? "";
  if (webOrigin.length === 0) return {};
  return {
    OD_WORKSPACE_CONTEXT_SOURCE: "vela",
    OD_TEAM_PROJECTS_TRANSPORT: "vela-cli",
    OD_COLLAB_TRANSPORT: "vela-cli",
    OD_RESOURCE_TRANSPORT: "vela-cli",
    OD_VELA_WEB_URL: webOrigin,
  };
}
