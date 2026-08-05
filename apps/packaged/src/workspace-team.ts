/**
 * AMR profiles whose Vela backend serves the Workspace Team transports.
 * Production deliberately stays outside this allowlist until the feature is
 * released independently of the integration branch.
 */
const WORKSPACE_TEAM_AMR_PROFILES: ReadonlySet<string> = new Set([
  "feature-test",
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
