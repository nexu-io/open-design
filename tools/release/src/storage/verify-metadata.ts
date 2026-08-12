import { optional, required } from "./common.ts";
import {
  assertLauncherVersionFloorSatisfiable,
  resolveLauncherVersionFloor,
} from "./launcher-version-floor.ts";
import { parseReleaseVersion, releaseChannelDescriptor } from "@open-design/release";
import { readFile } from "node:fs/promises";
import { parseReleaseNotePublication, releaseNoteMetadataFromPublication } from "../release-note/publication.ts";
import { validateClosureDistributionPublication } from "./closure-distribution-metadata.ts";

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
  closure?: unknown;
  control?: { launcher?: { version?: { min?: string; url?: string } } };
  releaseState?: string;
  r2?: { publicOrigin?: string };
  releaseTargets?: Record<string, {
    artifacts?: Record<string, { digest?: string; url?: string }>;
    closure?: {
      assets?: Record<string, { url?: string }>;
      manifest?: {
        artifact?: { url?: string };
        identity?: { channel?: string; platform?: string; version?: string };
      };
    };
    shell?: {
      artifacts?: Record<string, { digest?: string; url?: string }>;
      buildDigest?: string;
      depsDigest?: string;
      sourceDigest?: string;
      type?: string;
      version?: string;
    };
    status?: string;
  }>;
  [key: string]: unknown;
};

const closureRequired = process.env.RELEASE_CLOSURE_REQUIRED === "true";
const closureDistributionRequired = process.env.RELEASE_CLOSURE_DISTRIBUTION_REQUIRED === "true";
const shellRequired = process.env.RELEASE_SHELL_REQUIRED === "true";

if (metadata.channel !== releaseChannel) {
  throw new Error(`metadata channel mismatch: expected ${releaseChannel}, got ${String(metadata.channel)}`);
}

const versionField = releaseDescriptor.releaseVersionField;
if (metadata[versionField] !== releaseVersion) {
  throw new Error(`metadata ${versionField} mismatch: expected ${releaseVersion}, got ${String(metadata[versionField])}`);
}

// The published control.launcher.version block must match the channel policy
// resolved from the same repo-vars pairs the publish step consumed; unknown
// fields would otherwise pass silently.
const expectedLauncherVersionFloor = resolveLauncherVersionFloor(releaseChannel);
if (expectedLauncherVersionFloor != null) {
  assertLauncherVersionFloorSatisfiable(expectedLauncherVersionFloor, releaseVersion);
}
const publishedControlVersion = metadata.control?.launcher?.version;
if (expectedLauncherVersionFloor == null) {
  if (publishedControlVersion != null) {
    throw new Error("metadata unexpectedly contains a control.launcher.version block");
  }
} else {
  if (publishedControlVersion?.min !== expectedLauncherVersionFloor.min) {
    throw new Error(
      `metadata control.launcher.version.min mismatch: expected ${expectedLauncherVersionFloor.min}, got ${String(publishedControlVersion?.min)}`,
    );
  }
  if (publishedControlVersion.url !== expectedLauncherVersionFloor.url) {
    throw new Error(
      `metadata control.launcher.version.url mismatch: expected ${String(expectedLauncherVersionFloor.url)}, got ${String(publishedControlVersion.url)}`,
    );
  }
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

const expectedClosureDistributionTargets = [
  ...(process.env.ENABLE_MAC_ARM64 === "true" && optional("MAC_ARM64_RESULT", "skipped") === "success"
    ? ["darwin-arm64"]
    : []),
  ...(process.env.ENABLE_MAC_X64 === "true" && optional("MAC_X64_RESULT", "skipped") === "success"
    ? ["darwin-x64"]
    : []),
  ...(process.env.ENABLE_WIN_X64 === "true" && optional("WIN_X64_RESULT", "skipped") === "success"
    ? ["win32-x64"]
    : []),
];
if (closureDistributionRequired && metadata.closure == null) {
  throw new Error("metadata is missing the version-wide Closure distribution");
}
if (metadata.closure != null) {
  if (typeof metadata.r2?.publicOrigin !== "string" || metadata.r2.publicOrigin.length === 0) {
    throw new Error("metadata r2.publicOrigin is required for Closure distribution verification");
  }
  validateClosureDistributionPublication({
    channel: releaseChannel,
    expectedTargets: expectedClosureDistributionTargets,
    publicOrigin: metadata.r2.publicOrigin,
    releaseVersion,
    value: metadata.closure,
  });
}

for (const target of ["mac_arm64", "win_x64", "mac_x64"]) {
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
  if (closureRequired && (target === "mac_arm64" || target === "win_x64") && targetMetadata.closure == null) {
    throw new Error(`metadata target ${target} is missing Closure publication`);
  }
  if (shellRequired && targetMetadata.shell == null) {
    throw new Error(`metadata target ${target} is missing Shell publication`);
  }
  if (targetMetadata.shell != null) {
    const shell = targetMetadata.shell;
    const expectedPlatform = target === "mac_arm64" ? "darwin-arm64" : target === "mac_x64" ? "darwin-x64" : "win32-x64";
    if (
      shell.type !== "electron"
      || !/^sha256:[0-9a-f]{64}$/.test(String(shell.buildDigest))
      || !/^sha256:[0-9a-f]{64}$/.test(String(shell.depsDigest))
      || !/^sha256:[0-9a-f]{64}$/.test(String(shell.sourceDigest))
    ) {
      throw new Error(`metadata target ${target} has an invalid Shell identity`);
    }
    try {
      parseReleaseVersion(String(shell.version), releaseChannel);
    } catch {
      throw new Error(`metadata target ${target} has an invalid Shell version`);
    }
    const shellPrefix = `${releaseDescriptor.storagePrefix}/shells/electron/versions/${shell.version}/${expectedPlatform}/`;
    for (const [name, artifact] of Object.entries(targetMetadata.artifacts ?? {})) {
      const artifactUrl = new URL(String(artifact.url));
      if (!artifactUrl.pathname.includes(`/${shellPrefix}`) || !/^sha256:[0-9a-f]{64}$/.test(String(artifact.digest))) {
        throw new Error(`metadata target ${target} Shell ${name} artifact is invalid`);
      }
      if (shell.artifacts?.[name]?.url !== artifact.url || shell.artifacts?.[name]?.digest !== artifact.digest) {
        throw new Error(`metadata target ${target} Shell ${name} artifact does not match its publication`);
      }
    }
  }
  if (targetMetadata.closure != null) {
    if (target !== "mac_arm64" && target !== "win_x64") {
      throw new Error(`metadata target ${target} must not publish a Closure`);
    }
    const closure = targetMetadata.closure;
    const expectedPlatform = target === "mac_arm64" ? "darwin-arm64" : "win32-x64";
    if (
      closure?.manifest?.identity?.channel !== releaseChannel
      || closure.manifest.identity.platform !== expectedPlatform
    ) {
      throw new Error(`metadata target ${target} has an invalid Closure identity`);
    }
    try {
      parseReleaseVersion(String(closure.manifest.identity.version), releaseChannel);
    } catch {
      throw new Error(`metadata target ${target} has an invalid Closure version`);
    }
    const closurePrefix = `${releaseDescriptor.storagePrefix}/closure/${expectedPlatform}/versions/${closure.manifest.identity.version}/`;
    for (const asset of ["archive", "inventory", "manifest", "provenance"] as const) {
      if (closure.assets?.[asset]?.url == null) {
        throw new Error(`metadata target ${target} is missing Closure ${asset} artifact`);
      }
      const assetUrl = new URL(closure.assets[asset].url);
      if (!assetUrl.pathname.includes(`/${closurePrefix}`)) {
        throw new Error(`metadata target ${target} Closure ${asset} artifact is outside its version prefix`);
      }
    }
    if (closure.manifest?.artifact?.url !== closure.assets?.archive?.url) {
      throw new Error(`metadata target ${target} Closure archive URL does not match its manifest`);
    }
  }
}

console.log(`verified ${releaseChannel} metadata ${metadataUrl} (${metadata.releaseState ?? "unknown"})`);
