import type { ReleasePolicyReceipt } from "./release-profile.ts";

/** Local unsigned fixtures are not a public channel capability. Both storage
 * and download must stay on loopback; a validation profile alone is no bypass. */
export function requiresFormalMacTrust(policy: ReleasePolicyReceipt): boolean {
  const loopback = (value: string) => ["localhost", "127.0.0.1", "[::1]"].includes(new URL(value).hostname);
  return policy.profile !== "exact-validation" || !loopback(policy.target.endpointUrl) || !loopback(policy.target.publicBaseUrl);
}

/** Match the native builder's supported credential groups, without copying or
 * logging secrets. Missing credentials must not silently skip notarization. */
export function assertMacNotarizationCredentials(env: NodeJS.ProcessEnv = process.env): void {
  const requireGroup = (names: readonly string[]) => {
    const missing = names.filter(name => !env[name]?.trim());
    if (missing.length > 0) throw new Error(`formal macOS distribution requires notarization credentials: ${missing.join(", ")}`);
  };
  if (env.APPLE_ID || env.APPLE_APP_SPECIFIC_PASSWORD) {
    requireGroup(["APPLE_ID", "APPLE_APP_SPECIFIC_PASSWORD", "APPLE_TEAM_ID"]);
  } else if (env.APPLE_API_KEY || env.APPLE_API_KEY_ID || env.APPLE_API_ISSUER) {
    requireGroup(["APPLE_API_KEY", "APPLE_API_KEY_ID", "APPLE_API_ISSUER"]);
  } else if (env.APPLE_KEYCHAIN_PROFILE?.trim()) {
    // Existing keychain profile is resolved by notarytool, not this controller.
  } else {
    throw new Error("formal macOS distribution requires notarization credentials (Apple ID, API key, or keychain profile)");
  }
}
