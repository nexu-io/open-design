import { optional, required } from "./common.ts";
import {
  assertInstallationVersionFloorSatisfiable,
  requireInstallationVersionFloor,
  resolveInstallationVersionFloor,
} from "./installation-version-floor.ts";
import {
  parseReleaseVersion,
  releaseChannelDescriptor,
  releaseClosureManifestObjectKey,
  releaseShellPrefix,
  releaseVersionPrefix,
} from "@open-design/release";
import { readFile } from "node:fs/promises";
import { parseReleaseNotePublication, releaseNoteMetadataFromPublication } from "../release-note/publication.ts";
import { validateClosureDistributionPublication } from "./closure-distribution-metadata.ts";
import { releaseParameterMatrixFromEnv, signModeForTarget } from "../channel/parameter-matrix.ts";

const releaseDescriptor = releaseChannelDescriptor(required("RELEASE_CHANNEL"));
const releaseChannel = releaseDescriptor.channel;
const metadataPath = optional("RELEASE_METADATA_PATH");
const metadataUrl = metadataPath.length > 0 ? optional("RELEASE_METADATA_URL", `file://${metadataPath}`) : required("RELEASE_METADATA_URL");
const releaseVersion = required("RELEASE_VERSION");
const cacheBuster = optional("RELEASE_CACHE_BUSTER", "local");
const releaseNoteManifestPath = optional("RELEASE_NOTE_MANIFEST_PATH");
const closureDistributionManifestPath = optional("RELEASE_CLOSURE_DISTRIBUTION_MANIFEST_PATH");

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
  parameterMatrix?: unknown;
  closure?: unknown;
  control?: {
    launcher?: { version?: { min?: string; url?: string } };
    shell?: { installation?: { version?: { min?: string; url?: string } } };
  };
  releaseState?: string;
  r2?: {
    closureManifestUrl?: string;
    publicOrigin?: string;
    versionPrefix?: string;
  };
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
      capabilityDigest?: string;
      carrierDigest?: string;
      depsDigest?: string;
      sourceDigest?: string;
      type?: string;
      version?: string;
    };
    signMode?: string;
    status?: string;
  }>;
  [key: string]: unknown;
};

const closureDistributionRequired = process.env.RELEASE_CLOSURE_DISTRIBUTION_REQUIRED === "true";
const shellRequired = process.env.RELEASE_SHELL_REQUIRED === "true";
const parameterMatrix = releaseParameterMatrixFromEnv();

if (JSON.stringify(metadata.parameterMatrix) !== JSON.stringify(parameterMatrix)) {
  throw new Error("metadata parameterMatrix does not match the requested release parameters");
}

if (metadata.channel !== releaseChannel) {
  throw new Error(`metadata channel mismatch: expected ${releaseChannel}, got ${String(metadata.channel)}`);
}

const versionField = releaseDescriptor.releaseVersionField;
if (metadata[versionField] !== releaseVersion) {
  throw new Error(`metadata ${versionField} mismatch: expected ${releaseVersion}, got ${String(metadata[versionField])}`);
}
const expectedVersionPrefix = releaseVersionPrefix(releaseChannel, releaseVersion);
if (metadata.r2?.versionPrefix !== expectedVersionPrefix) {
  throw new Error(
    `metadata versionPrefix mismatch: expected ${expectedVersionPrefix}, got ${String(metadata.r2?.versionPrefix)}`,
  );
}

// The published control.shell.installation.version block must match the channel policy
// resolved from the same repo-vars pairs the publish step consumed; unknown
// fields would otherwise pass silently.
const legacyInstallationMigrationRequired = process.env.RELEASE_LEGACY_INSTALLATION_MIGRATION_REQUIRED === "true";
const expectedInstallationVersionFloor = legacyInstallationMigrationRequired
  ? requireInstallationVersionFloor(releaseChannel)
  : resolveInstallationVersionFloor(releaseChannel);
if (expectedInstallationVersionFloor != null) {
  assertInstallationVersionFloorSatisfiable(expectedInstallationVersionFloor, releaseVersion);
}
const publishedControlVersion = metadata.control?.shell?.installation?.version;
const migrationControlVersion = metadata.control?.launcher?.version;
if (expectedInstallationVersionFloor == null) {
  if (publishedControlVersion != null) {
    throw new Error("metadata unexpectedly contains a control.shell.installation.version block");
  }
  if (migrationControlVersion != null) throw new Error("metadata unexpectedly contains the legacy installation floor");
} else {
  if (publishedControlVersion?.min !== expectedInstallationVersionFloor.min) {
    throw new Error(
      `metadata installation version min mismatch: expected ${expectedInstallationVersionFloor.min}, got ${String(publishedControlVersion?.min)}`,
    );
  }
  if (publishedControlVersion.url !== expectedInstallationVersionFloor.url) {
    throw new Error(
      `metadata installation version url mismatch: expected ${String(expectedInstallationVersionFloor.url)}, got ${String(publishedControlVersion.url)}`,
    );
  }
  if (JSON.stringify(migrationControlVersion) !== JSON.stringify(publishedControlVersion)) {
    throw new Error("metadata legacy installation floor does not match control.shell.installation.version");
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
    selectedShells: Object.values(metadata.releaseTargets ?? {}).flatMap((target) => (
      target.status !== "published" || target.shell?.type == null || target.shell.version == null
        ? []
        : [{ type: target.shell.type, version: target.shell.version }]
    )),
    value: metadata.closure,
  });
  const expectedClosureManifestUrl = new URL(
    releaseClosureManifestObjectKey(releaseChannel, releaseVersion),
    `${metadata.r2.publicOrigin.replace(/\/+$/, "")}/`,
  ).toString();
  if (metadata.r2.closureManifestUrl !== expectedClosureManifestUrl) {
    throw new Error(
      `metadata Closure manifest URL must be ${expectedClosureManifestUrl}; got ${String(metadata.r2.closureManifestUrl)}`,
    );
  }
  const standaloneClosure = closureDistributionManifestPath.length > 0
    ? JSON.parse(await readFile(closureDistributionManifestPath, "utf8")) as unknown
    : await (async () => {
        const response = await fetch(
          `${expectedClosureManifestUrl}?run=${cacheBuster}`,
          { headers: { "Cache-Control": "no-cache" } },
        );
        if (!response.ok) throw new Error(`Closure manifest fetch failed with HTTP ${response.status}`);
        return response.json() as Promise<unknown>;
      })();
  if (JSON.stringify(standaloneClosure) !== JSON.stringify(metadata.closure)) {
    throw new Error("standalone Closure manifest does not match metadata.closure");
  }
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
  const expectedSignMode = signModeForTarget(target as "mac_arm64" | "mac_x64" | "win_x64", parameterMatrix);
  if (targetMetadata.signMode !== expectedSignMode) {
    throw new Error(`metadata target ${target} signMode mismatch: expected ${expectedSignMode}, got ${String(targetMetadata.signMode)}`);
  }
  if ((target === "mac_arm64" || target === "win_x64") && targetMetadata.artifacts?.payload?.url == null) {
    throw new Error(`metadata target ${target} is missing launcher payload artifact`);
  }
  if (shellRequired && targetMetadata.shell == null) {
    throw new Error(`metadata target ${target} is missing Shell publication`);
  }
  if (targetMetadata.shell != null) {
    const shell = targetMetadata.shell;
    if (
      shell.type !== "electron"
      || !/^sha256:[0-9a-f]{64}$/.test(String(shell.buildDigest))
      || !/^sha256:[0-9a-f]{64}$/.test(String(shell.capabilityDigest))
      || !/^sha256:[0-9a-f]{64}$/.test(String(shell.carrierDigest))
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
    const shellPrefix = releaseShellPrefix(
      releaseChannel,
      releaseVersion,
      target as "mac_arm64" | "mac_x64" | "win_x64",
      shell.type,
    );
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
}

const verifiedCapabilityDigests = new Set(
  Object.values(metadata.releaseTargets ?? {}).flatMap((target) => (
    target.status === "published" && target.shell?.capabilityDigest != null
      ? [target.shell.capabilityDigest]
      : []
  )),
);
if (shellRequired && verifiedCapabilityDigests.size !== 1) {
  throw new Error(`published Shell targets do not share one capability digest: ${[...verifiedCapabilityDigests].join(", ") || "none"}`);
}

console.log(`verified ${releaseChannel} metadata ${metadataUrl} (${metadata.releaseState ?? "unknown"})`);
