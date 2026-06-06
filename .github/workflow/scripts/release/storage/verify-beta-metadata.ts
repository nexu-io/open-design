import { optional, required } from "./common.ts";

const metadataUrl = required("RELEASE_METADATA_URL");
const releaseVersion = required("RELEASE_VERSION");
const cacheBuster = optional("RELEASE_CACHE_BUSTER", "local");

const response = await fetch(`${metadataUrl}${metadataUrl.includes("?") ? "&" : "?"}run=${cacheBuster}`, {
  headers: { "Cache-Control": "no-cache" },
});
if (!response.ok) {
  throw new Error(`metadata fetch failed with HTTP ${response.status}`);
}

const metadata = await response.json() as {
  betaVersion?: string;
  releaseState?: string;
  releaseTargets?: Record<string, { status?: string }>;
};

if (metadata.betaVersion !== releaseVersion) {
  throw new Error(`metadata betaVersion mismatch: expected ${releaseVersion}, got ${String(metadata.betaVersion)}`);
}
for (const target of ["mac_arm64", "win_x64", "mac_x64", "linux_x64"]) {
  if (process.env[`ENABLE_${target.toUpperCase()}`] !== "true") continue;
  const status = metadata.releaseTargets?.[target]?.status;
  const result = optional(`${target.toUpperCase()}_RESULT`, "skipped");
  if (result === "success" && status !== "published") {
    throw new Error(`metadata target ${target} is not published: ${String(status)}`);
  }
}

console.log(`verified beta metadata ${metadataUrl} (${metadata.releaseState ?? "unknown"})`);
