import { optional, required } from "./common.ts";
import { releaseChannelDescriptor } from "@open-design/release";
import { readFile } from "node:fs/promises";
import { parseReleaseNotePublication, releaseNoteMetadataFromPublication } from "../release-note/publication.ts";

const releaseDescriptor = releaseChannelDescriptor(required("RELEASE_CHANNEL"));
const releaseChannel = releaseDescriptor.channel;
const metadataPath = optional("RELEASE_METADATA_PATH");
const metadataUrl = metadataPath.length > 0 ? optional("RELEASE_METADATA_URL", `file://${metadataPath}`) : required("RELEASE_METADATA_URL");
const releaseVersion = required("RELEASE_VERSION");
const cacheBuster = optional("RELEASE_CACHE_BUSTER", "local");
const releaseNoteManifestPath = optional("RELEASE_NOTE_MANIFEST_PATH");

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
  channel?: string;
  releaseState?: string;
  releaseTargets?: Record<string, { artifacts?: Record<string, { url?: string }>; status?: string }>;
  [key: string]: unknown;
};

if (metadata.channel !== releaseChannel) {
  throw new Error(`metadata channel mismatch: expected ${releaseChannel}, got ${String(metadata.channel)}`);
}

const versionField = releaseDescriptor.releaseVersionField;
if (metadata[versionField] !== releaseVersion) {
  throw new Error(`metadata ${versionField} mismatch: expected ${releaseVersion}, got ${String(metadata[versionField])}`);
}

if (releaseNoteManifestPath.length === 0) {
  if (releaseChannel === "stable") {
    throw new Error("RELEASE_NOTE_MANIFEST_PATH is required to verify stable metadata");
  }
} else {
  const publication = parseReleaseNotePublication(JSON.parse(await readFile(releaseNoteManifestPath, "utf8")) as unknown);
  if (publication.channel !== releaseChannel || publication.releaseVersion !== releaseVersion) {
    throw new Error(`release note publication identity mismatch for ${releaseChannel} ${releaseVersion}`);
  }
  const expectedReleaseNote = releaseNoteMetadataFromPublication(publication);
  if (expectedReleaseNote == null) {
    if (metadata.releaseNote != null) throw new Error("metadata unexpectedly contains releaseNote");
  } else if (JSON.stringify(metadata.releaseNote) !== JSON.stringify(expectedReleaseNote)) {
    throw new Error("metadata releaseNote does not match its publication manifest");
  }
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
