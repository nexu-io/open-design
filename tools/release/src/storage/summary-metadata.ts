import { optional, required, writeText } from "./common.ts";
import { releaseChannelDescriptor } from "@open-design/release";
import { readFile } from "node:fs/promises";

const releaseDescriptor = releaseChannelDescriptor(required("RELEASE_CHANNEL"));
const releaseChannel = releaseDescriptor.channel;
const metadataPath = optional("RELEASE_METADATA_PATH");
const metadataUrl = metadataPath.length > 0 ? optional("RELEASE_METADATA_URL", `file://${metadataPath}`) : required("RELEASE_METADATA_URL");
const summaryPath = required("RELEASE_SUMMARY_PATH");
const cacheBuster = optional("RELEASE_CACHE_BUSTER", "local");

function versionFromMetadata(metadata: Record<string, unknown>): string {
  const value = metadata[releaseDescriptor.releaseVersionField];
  return typeof value === "string" ? value : "";
}

const metadata = (metadataPath.length > 0
  ? JSON.parse(await readFile(metadataPath, "utf8"))
  : await (async () => {
      const response = await fetch(`${metadataUrl}${metadataUrl.includes("?") ? "&" : "?"}run=${cacheBuster}`, {
        headers: { "Cache-Control": "no-cache" },
      });
      if (!response.ok) {
        throw new Error(`metadata fetch failed with HTTP ${response.status}`);
      }
      return response.json();
    })()) as {
  control?: { launcher?: { version?: { min?: string; url?: string } } };
  readyTargets?: string[];
  releaseState?: string;
  r2?: { reportUrl?: string; versionMetadataUrl?: string };
  releaseTargets?: Record<string, {
    artifacts?: Record<string, { name?: string; sha256Url?: string; size?: number; url?: string }>;
    label?: string;
    status?: string;
  }>;
};

const launcherVersionMin = metadata.control?.launcher?.version?.min;
const artifactRows = Object.entries(metadata.releaseTargets ?? {}).flatMap(([target, manifest]) => {
  if (manifest.status !== "published") return [];
  return Object.entries(manifest.artifacts ?? {}).flatMap(([kind, artifact]) => {
    if (artifact.url == null || artifact.url.length === 0) return [];
    const size = typeof artifact.size === "number"
      ? `${(artifact.size / 1024 / 1024).toFixed(1)} MiB`
      : "—";
    const label = (value: string) => value.replaceAll("|", "\\|");
    return [`| ${label(manifest.label ?? target)} | \`${label(artifact.name ?? kind)}\` | ${size} | [download](${artifact.url}) | ${artifact.sha256Url ? `[sha256](${artifact.sha256Url})` : "—"} |`];
  });
});
const versionMetadataUrl = metadata.r2?.versionMetadataUrl ?? metadataUrl;
writeText(summaryPath, [
  `## ${releaseChannel[0]?.toUpperCase() ?? ""}${releaseChannel.slice(1)} release metadata`,
  "",
  `- version: \`${versionFromMetadata(metadata as Record<string, unknown>)}\``,
  `- state: \`${metadata.releaseState ?? ""}\``,
  `- ready targets: \`${(metadata.readyTargets ?? []).join(", ")}\``,
  ...(launcherVersionMin == null
    ? []
    : [`- launcher version floor: \`${launcherVersionMin}\` (forces installer reinstall below this outer version)`]),
  `- metadata: [metadata.json](${versionMetadataUrl})`,
  ...(metadata.r2?.reportUrl == null ? [] : [`- build report: [report](${metadata.r2.reportUrl})`]),
  ...(artifactRows.length === 0 ? [] : [
    "",
    "### Direct CDN artifacts",
    "",
    "| Target | Artifact | Size | CDN | Integrity |",
    "| --- | --- | ---: | --- | --- |",
    ...artifactRows,
  ]),
].join("\n"));

console.log(`wrote ${releaseChannel} release summary to ${summaryPath}`);
