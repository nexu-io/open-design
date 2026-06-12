import { optional, required } from "./common.ts";

const releaseChannel = required("RELEASE_CHANNEL");
const metadataUrl = required("RELEASE_METADATA_URL");
const releaseVersion = required("RELEASE_VERSION");
const cacheBuster = optional("RELEASE_CACHE_BUSTER", "local");

function expectedVersionField(channel: string): string {
  if (channel === "beta") return "betaVersion";
  if (channel === "preview") return "previewVersion";
  if (channel === "nightly") return "nightlyVersion";
  if (channel === "stable") return "releaseVersion";
  throw new Error(`unsupported RELEASE_CHANNEL: ${channel}`);
}

const response = await fetch(`${metadataUrl}${metadataUrl.includes("?") ? "&" : "?"}run=${cacheBuster}`, {
  headers: { "Cache-Control": "no-cache" },
});
if (!response.ok) {
  throw new Error(`metadata fetch failed with HTTP ${response.status}`);
}

const metadata = await response.json() as {
  channel?: string;
  releaseState?: string;
  releaseTargets?: Record<string, { artifacts?: Record<string, { url?: string }>; status?: string }>;
  [key: string]: unknown;
};

if (metadata.channel !== releaseChannel) {
  throw new Error(`metadata channel mismatch: expected ${releaseChannel}, got ${String(metadata.channel)}`);
}

const versionField = expectedVersionField(releaseChannel);
if (metadata[versionField] !== releaseVersion) {
  throw new Error(`metadata ${versionField} mismatch: expected ${releaseVersion}, got ${String(metadata[versionField])}`);
}

for (const target of ["mac_arm64", "win_x64", "mac_x64", "linux_x64"]) {
  if (process.env[`ENABLE_${target.toUpperCase()}`] !== "true") continue;
  const targetMetadata = metadata.releaseTargets?.[target];
  const status = targetMetadata?.status;
  const result = optional(`${target.toUpperCase()}_RESULT`, "skipped");
  if (result === "success" && status !== "published") {
    throw new Error(`metadata target ${target} is not published: ${String(status)}`);
  }
  if (result !== "success" || targetMetadata == null) continue;
  if ((target === "mac_arm64" || target === "win_x64") && targetMetadata.artifacts?.payload?.url == null) {
    throw new Error(`metadata target ${target} is missing launcher payload artifact`);
  }
}

console.log(`verified ${releaseChannel} metadata ${metadataUrl} (${metadata.releaseState ?? "unknown"})`);
