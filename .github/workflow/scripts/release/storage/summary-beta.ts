import { optional, required, writeText } from "./common.ts";

const metadataUrl = required("RELEASE_METADATA_URL");
const summaryPath = required("RELEASE_SUMMARY_PATH");
const cacheBuster = optional("RELEASE_CACHE_BUSTER", "local");

const response = await fetch(`${metadataUrl}${metadataUrl.includes("?") ? "&" : "?"}run=${cacheBuster}`, {
  headers: { "Cache-Control": "no-cache" },
});
if (!response.ok) {
  throw new Error(`metadata fetch failed with HTTP ${response.status}`);
}

const metadata = await response.json() as {
  betaVersion?: string;
  readyTargets?: string[];
  releaseState?: string;
  r2?: { versionMetadataUrl?: string };
};

writeText(summaryPath, [
  "## Beta release metadata",
  "",
  `- version: \`${metadata.betaVersion ?? ""}\``,
  `- state: \`${metadata.releaseState ?? ""}\``,
  `- ready targets: \`${(metadata.readyTargets ?? []).join(", ")}\``,
  `- metadata: ${metadata.r2?.versionMetadataUrl ?? metadataUrl}`,
].join("\n"));

console.log(`wrote beta release summary to ${summaryPath}`);
